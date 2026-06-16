-- SQL-backed vendor orders page from app_orders + app_order_items.
-- Edge uses this when available and falls back to the current KV scan when not applied/backfilled.

CREATE OR REPLACE FUNCTION public.rpc_vendor_orders_page(
  p_vendor_ids text[],
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20,
  p_q text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_payment text DEFAULT 'all',
  p_from text DEFAULT NULL,
  p_to text DEFAULT NULL,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  page_num int := GREATEST(COALESCE(p_page, 1), 1);
  page_size int := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  off int := (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  qpat text := NULL;
  status_filter text := lower(trim(coalesce(nullif(p_status, ''), 'all')));
  payment_filter text := lower(trim(coalesce(nullif(p_payment, ''), 'all')));
  vendor_ids text[] := coalesce(p_vendor_ids, ARRAY[]::text[]);
  sort_dir text := CASE WHEN lower(trim(coalesce(p_sort, 'newest'))) = 'oldest' THEN 'ASC' ELSE 'DESC' END;
  from_ts timestamptz := public.app_read_model_timestamptz(p_from);
  to_ts timestamptz := public.app_read_model_timestamptz(p_to);
  result jsonb;
BEGIN
  IF cardinality(vendor_ids) = 0 THEN
    RETURN jsonb_build_object(
      'orders', '[]'::jsonb,
      'total', 0,
      'readModelRows', (SELECT count(*) FROM public.app_orders),
      'page', page_num,
      'pageSize', page_size,
      'hasMore', false,
      'summary', jsonb_build_object('totalRevenue', 0, 'pending', 0, 'processing', 0, 'fulfilled', 0, 'cancelled', 0)
    );
  END IF;

  IF p_q IS NOT NULL AND length(trim(p_q)) > 0 THEN
    qpat := '%' || lower(trim(p_q)) || '%';
  END IF;

  EXECUTE format($sql$
    WITH matching_orders AS (
      SELECT DISTINCT o.id
      FROM public.app_orders o
      LEFT JOIN public.app_order_items i ON i.order_id = o.id
      WHERE (
          coalesce(o.vendor_id, '') = ANY($1::text[])
          OR coalesce(o.vendor_name, '') = ANY($1::text[])
          OR coalesce(i.vendor_id, '') = ANY($1::text[])
          OR coalesce(i.vendor_name, '') = ANY($1::text[])
        )
    ),
    base AS (
      SELECT
        o.*,
        coalesce(o.source_created_at, o.source_updated_at, o.synced_at) AS order_ts,
        coalesce(o.status, 'pending') AS status_value,
        coalesce(o.payment_status, 'pending') AS payment_status_value
      FROM public.app_orders o
      JOIN matching_orders mo ON mo.id = o.id
      WHERE ($2::text = 'all' OR lower(coalesce(o.status, '')) = $2::text)
        AND ($3::text = 'all' OR lower(coalesce(o.payment_status, '')) = $3::text)
        AND ($4::timestamptz IS NULL OR coalesce(o.source_created_at, o.source_updated_at, o.synced_at) >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR coalesce(o.source_created_at, o.source_updated_at, o.synced_at) <= $5::timestamptz)
        AND (
          $6::text IS NULL
          OR lower(coalesce(o.order_number, '')) LIKE $6::text
          OR lower(coalesce(o.customer_name, '')) LIKE $6::text
          OR lower(coalesce(o.email, '')) LIKE $6::text
          OR lower(o.id) LIKE $6::text
        )
    ),
    with_vendor_lines AS (
      SELECT
        b.*,
        coalesce(line_agg.vendor_line_count, 0) AS vendor_line_count,
        coalesce(line_agg.all_line_count, 0) AS all_line_count,
        coalesce(line_agg.vendor_items, '[]'::jsonb) AS vendor_items,
        coalesce(line_agg.all_items, '[]'::jsonb) AS all_items,
        coalesce(line_agg.vendor_lines_subtotal, 0) AS vendor_lines_subtotal
      FROM base b
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int AS all_line_count,
          count(*) FILTER (
            WHERE coalesce(i.vendor_id, '') = ANY($1::text[])
               OR coalesce(i.vendor_name, '') = ANY($1::text[])
          )::int AS vendor_line_count,
          coalesce(
            jsonb_agg(i.raw ORDER BY i.line_index) FILTER (
              WHERE coalesce(i.vendor_id, '') = ANY($1::text[])
                 OR coalesce(i.vendor_name, '') = ANY($1::text[])
            ),
            '[]'::jsonb
          ) AS vendor_items,
          coalesce(jsonb_agg(i.raw ORDER BY i.line_index), '[]'::jsonb) AS all_items,
          coalesce(
            sum(coalesce(i.line_total, coalesce(i.unit_price, 0) * coalesce(i.quantity, 1))) FILTER (
              WHERE coalesce(i.vendor_id, '') = ANY($1::text[])
                 OR coalesce(i.vendor_name, '') = ANY($1::text[])
            ),
            0
          ) AS vendor_lines_subtotal
        FROM public.app_order_items i
        WHERE i.order_id = b.id
      ) line_agg ON true
    ),
    shaped AS (
      SELECT
        *,
        CASE
          WHEN all_line_count > 0 AND vendor_line_count = all_line_count THEN coalesce(total, 0)
          WHEN vendor_line_count > 0 AND coalesce(subtotal, 0) > 0 AND coalesce(discount, 0) > 0 AND vendor_lines_subtotal > 0
            THEN greatest(0, round((vendor_lines_subtotal - ((coalesce(discount, 0) * vendor_lines_subtotal) / subtotal))::numeric, 2))
          WHEN vendor_line_count > 0 THEN vendor_lines_subtotal
          ELSE coalesce(total, 0)
        END AS vendor_display_total,
        CASE
          WHEN vendor_line_count > 0 THEN vendor_items
          ELSE all_items
        END AS display_items
      FROM with_vendor_lines
    ),
    counts AS (
      SELECT
        count(*)::bigint AS filtered_count,
        coalesce(sum(vendor_display_total) FILTER (WHERE lower(status_value) <> 'cancelled'), 0) AS total_revenue,
        count(*) FILTER (WHERE lower(status_value) = 'pending')::bigint AS pending_count,
        count(*) FILTER (WHERE lower(status_value) = 'processing')::bigint AS processing_count,
        count(*) FILTER (WHERE lower(status_value) = 'fulfilled')::bigint AS fulfilled_count,
        count(*) FILTER (WHERE lower(status_value) = 'cancelled')::bigint AS cancelled_count
      FROM shaped
    ),
    read_model_total AS (
      SELECT count(*)::bigint AS c FROM public.app_orders
    ),
    sorted AS (
      SELECT *
      FROM shaped
      ORDER BY order_ts %s NULLS LAST, id %s
      LIMIT %s OFFSET %s
    ),
    page_rows AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'orderNumber', raw->>'orderNumber',
            'customer', coalesce(raw->>'customer', raw->>'customerName'),
            'customerName', coalesce(raw->>'customerName', raw->>'customer'),
            'email', raw->>'email',
            'phone', raw->>'phone',
            'status', status_value,
            'paymentStatus', payment_status_value,
            'shippingStatus', coalesce(raw->>'shippingStatus', 'pending'),
            'paymentMethod', coalesce(raw->>'paymentMethod', ''),
            'kpay', raw->'kpay',
            'total', vendor_display_total,
            'subtotal', coalesce(subtotal, vendor_lines_subtotal),
            'discount', coalesce(discount, 0),
            'date', coalesce(raw->>'date', raw->>'createdAt'),
            'createdAt', raw->>'createdAt',
            'items', display_items,
            'shippingAddress', coalesce(raw->>'shippingAddress', ''),
            'trackingNumber', coalesce(raw->>'trackingNumber', ''),
            'notes', coalesce(raw->>'notes', ''),
            'deliveryService', coalesce(raw->>'deliveryService', ''),
            'deliveryServiceLogo', coalesce(raw->>'deliveryServiceLogo', ''),
            'inventoryDeducted', public.app_read_model_bool(raw->>'inventoryDeducted')
          )
          ORDER BY order_ts %s NULLS LAST, id %s
        ),
        '[]'::jsonb
      ) AS orders
      FROM sorted
    )
    SELECT jsonb_build_object(
      'orders', (SELECT orders FROM page_rows),
      'total', (SELECT filtered_count FROM counts),
      'readModelRows', (SELECT c FROM read_model_total),
      'page', %s,
      'pageSize', %s,
      'hasMore', ((SELECT filtered_count FROM counts) > (%s + %s)),
      'summary', jsonb_build_object(
        'totalRevenue', (SELECT total_revenue FROM counts),
        'pending', (SELECT pending_count FROM counts),
        'processing', (SELECT processing_count FROM counts),
        'fulfilled', (SELECT fulfilled_count FROM counts),
        'cancelled', (SELECT cancelled_count FROM counts)
      )
    )
  $sql$, sort_dir, sort_dir, page_size, off, sort_dir, sort_dir, page_num, page_size, off, page_size)
  USING vendor_ids, status_filter, payment_filter, from_ts, to_ts, qpat
  INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.rpc_vendor_orders_page IS 'Paged vendor-admin orders list backed by app_orders/app_order_items; preserves Edge API response shape.';
