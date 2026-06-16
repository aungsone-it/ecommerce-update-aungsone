-- SQL-backed customers page + finances analytics from app_* read models.
-- Edge falls back to KV paths when these functions are unavailable or not backfilled.

CREATE OR REPLACE FUNCTION public.app_customer_segment(raw jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH s AS (
    SELECT
      coalesce(public.app_read_model_num(raw#>>'{rfmScore,recency}'), 0) AS recency,
      coalesce(public.app_read_model_num(raw#>>'{rfmScore,frequency}'), 0) AS frequency,
      coalesce(public.app_read_model_num(raw#>>'{rfmScore,monetary}'), 0) AS monetary
  )
  SELECT CASE
    WHEN jsonb_typeof(raw->'rfmScore') IS DISTINCT FROM 'object' THEN 'unknown'
    WHEN (recency + frequency + monetary) >= 13 THEN 'champions'
    WHEN (recency + frequency + monetary) >= 10 AND recency >= 4 THEN 'loyal'
    WHEN (recency + frequency + monetary) >= 8 AND recency >= 3 THEN 'potential-loyalist'
    WHEN (recency + frequency + monetary) >= 6 AND recency <= 2 THEN 'at-risk'
    WHEN frequency >= 4 AND recency <= 2 THEN 'cant-lose'
    WHEN (recency + frequency + monetary) <= 6 THEN 'hibernating'
    ELSE 'need-attention'
  END
  FROM s;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_customers_page(
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20,
  p_q text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_tier text DEFAULT 'all',
  p_segment text DEFAULT 'all'
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
  tier_filter text := lower(trim(coalesce(nullif(p_tier, ''), 'all')));
  segment_filter text := lower(trim(coalesce(nullif(p_segment, ''), 'all')));
  result jsonb;
BEGIN
  IF p_q IS NOT NULL AND length(trim(p_q)) > 0 THEN
    qpat := '%' || lower(trim(p_q)) || '%';
  END IF;

  WITH enriched AS (
    SELECT
      c.*,
      public.app_customer_segment(c.raw) AS segment,
      coalesce(c.total_spent, 0) AS spent,
      coalesce(c.order_count, 0) AS orders_count,
      coalesce(c.source_created_at, c.source_updated_at, c.synced_at) AS joined_at
    FROM public.app_customers c
  ),
  filtered AS (
    SELECT *
    FROM enriched
    WHERE (status_filter = 'all' OR lower(coalesce(status, '')) = status_filter)
      AND (tier_filter = 'all' OR lower(coalesce(tier, '')) = tier_filter)
      AND (segment_filter = 'all' OR segment = segment_filter)
      AND (
        qpat IS NULL
        OR lower(coalesce(name, '')) LIKE qpat
        OR lower(coalesce(email, '')) LIKE qpat
        OR lower(coalesce(phone, '')) LIKE qpat
      )
  ),
  stats AS (
    SELECT
      count(*)::bigint AS total,
      count(*) FILTER (WHERE lower(coalesce(status, '')) = 'active')::bigint AS active,
      count(*) FILTER (WHERE lower(coalesce(tier, '')) = 'vip')::bigint AS vip,
      count(*) FILTER (
        WHERE joined_at >= date_trunc('month', now())
          AND joined_at < date_trunc('month', now()) + interval '1 month'
      )::bigint AS new_this_month,
      coalesce(sum(spent), 0) AS total_revenue,
      count(*) FILTER (WHERE segment = 'champions')::bigint AS champions,
      count(*) FILTER (WHERE segment IN ('at-risk', 'cant-lose'))::bigint AS at_risk,
      count(*) FILTER (WHERE segment = 'loyal')::bigint AS loyal,
      count(*) FILTER (WHERE segment = 'potential-loyalist')::bigint AS potential_loyalist,
      count(*) FILTER (WHERE segment = 'cant-lose')::bigint AS cant_lose,
      count(*) FILTER (WHERE segment = 'hibernating')::bigint AS hibernating,
      count(*) FILTER (WHERE segment = 'need-attention')::bigint AS need_attention,
      count(*) FILTER (WHERE segment = 'unknown')::bigint AS unknown
    FROM filtered
  ),
  sorted AS (
    SELECT *
    FROM filtered
    ORDER BY coalesce(name, email, phone, id) ASC
    LIMIT page_size OFFSET off
  ),
  page_rows AS (
    SELECT coalesce(jsonb_agg(
      raw ||
      jsonb_strip_nulls(jsonb_build_object(
        'id', id,
        'userId', user_id,
        'name', name,
        'email', email,
        'phone', phone,
        'status', status,
        'tier', tier,
        'totalSpent', spent,
        'lifetimeValue', spent,
        'totalOrders', orders_count,
        'orderCount', orders_count,
        'avgOrderValue', CASE WHEN orders_count > 0 THEN spent / orders_count ELSE 0 END,
        'joinDate', coalesce(raw->>'joinDate', joined_at::text),
        'createdAt', coalesce(raw->>'createdAt', joined_at::text)
      ))
      ORDER BY coalesce(name, email, phone, id)
    ), '[]'::jsonb) AS customers
    FROM sorted
  ),
  read_model_total AS (
    SELECT count(*)::bigint AS c FROM public.app_customers
  )
  SELECT jsonb_build_object(
    'success', true,
    'customers', (SELECT customers FROM page_rows),
    'total', (SELECT total FROM stats),
    'readModelRows', (SELECT c FROM read_model_total),
    'page', page_num,
    'pageSize', page_size,
    'hasMore', ((SELECT total FROM stats) > (off + page_size)),
    'stats', jsonb_build_object(
      'total', (SELECT total FROM stats),
      'active', (SELECT active FROM stats),
      'vip', (SELECT vip FROM stats),
      'newThisMonth', (SELECT new_this_month FROM stats),
      'totalRevenue', (SELECT total_revenue FROM stats),
      'avgLTV', CASE WHEN (SELECT total FROM stats) > 0 THEN (SELECT total_revenue FROM stats) / (SELECT total FROM stats) ELSE 0 END,
      'champions', (SELECT champions FROM stats),
      'atRisk', (SELECT at_risk FROM stats),
      'segments', jsonb_build_object(
        'champions', (SELECT champions FROM stats),
        'loyal', (SELECT loyal FROM stats),
        'potentialLoyalist', (SELECT potential_loyalist FROM stats),
        'atRisk', (SELECT at_risk FROM stats),
        'cantLose', (SELECT cant_lose FROM stats),
        'hibernating', (SELECT hibernating FROM stats),
        'needAttention', (SELECT need_attention FROM stats),
        'unknown', (SELECT unknown FROM stats)
      )
    )
  )
  INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finances_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH orders_base AS (
    SELECT
      o.*,
      coalesce(o.total, 0) AS order_total,
      coalesce(o.source_created_at, o.source_updated_at, o.synced_at) AS order_ts,
      coalesce(o.payment_method, 'Cash') AS method,
      coalesce(o.vendor_id, o.vendor_name, 'Unknown') AS fallback_vendor_key
    FROM public.app_orders o
    WHERE lower(coalesce(o.status, '')) <> 'cancelled'
  ),
  line_parts AS (
    SELECT
      o.id AS order_id,
      coalesce(i.vendor_id, i.vendor_name, o.fallback_vendor_key, 'Unknown') AS vendor_key,
      coalesce(i.vendor_name, v.display_name, v.business_name, o.vendor_name, 'Unknown Vendor') AS vendor_name,
      coalesce(v.email, '') AS vendor_email,
      coalesce(i.line_total, coalesce(i.unit_price, 0) * coalesce(i.quantity, 1), 0) AS line_subtotal,
      coalesce(
        public.app_read_model_num(i.raw->>'commissionRate'),
        public.app_read_model_num(i.raw->>'commission'),
        public.app_read_model_num(p.raw->>'commissionRate'),
        0
      ) AS commission_rate
    FROM orders_base o
    LEFT JOIN public.app_order_items i ON i.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT p.*
      FROM public.app_products p
      WHERE p.id = i.product_id OR lower(p.sku) = lower(coalesce(i.sku, ''))
      ORDER BY CASE WHEN p.id = i.product_id THEN 0 ELSE 1 END
      LIMIT 1
    ) p ON true
    LEFT JOIN public.app_vendors v ON v.id = coalesce(i.vendor_id, o.vendor_id)
  ),
  order_commission AS (
    SELECT
      order_id,
      coalesce(sum(line_subtotal * (commission_rate / 100)), 0) AS commission
    FROM line_parts
    GROUP BY order_id
  ),
  order_vendor_net AS (
    SELECT
      lp.order_id,
      lp.vendor_key,
      max(lp.vendor_name) AS vendor_name,
      max(lp.vendor_email) AS vendor_email,
      greatest(0, sum(lp.line_subtotal - (lp.line_subtotal * (lp.commission_rate / 100)))) AS net
    FROM line_parts lp
    GROUP BY lp.order_id, lp.vendor_key
  ),
  summary AS (
    SELECT
      coalesce(sum(o.order_total), 0) AS total_revenue,
      coalesce(sum(coalesce(oc.commission, 0)), 0) AS total_commission,
      coalesce(sum(greatest(0, o.order_total - coalesce(oc.commission, 0))), 0) AS total_vendor_payout,
      coalesce(sum(greatest(0, o.order_total - coalesce(oc.commission, 0))) FILTER (
        WHERE lower(coalesce(o.status, '')) IN ('completed', 'delivered')
      ), 0) AS pending_payouts
    FROM orders_base o
    LEFT JOIN order_commission oc ON oc.order_id = o.id
  ),
  payment_methods AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'method', method,
      'transactions', transactions,
      'amount', amount,
      'percentage', CASE WHEN (SELECT total_revenue FROM summary) > 0 THEN (amount / (SELECT total_revenue FROM summary)) * 100 ELSE 0 END
    ) ORDER BY amount DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT method, count(*)::bigint AS transactions, coalesce(sum(order_total), 0) AS amount
      FROM orders_base
      GROUP BY method
    ) s
  ),
  revenue_chart AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(day, 'Mon DD'),
      'revenue', revenue,
      'commission', commission
    ) ORDER BY day), '[]'::jsonb) AS rows
    FROM (
      SELECT
        date_trunc('day', o.order_ts)::date AS day,
        coalesce(sum(o.order_total), 0) AS revenue,
        coalesce(sum(coalesce(oc.commission, 0)), 0) AS commission
      FROM orders_base o
      LEFT JOIN order_commission oc ON oc.order_id = o.id
      GROUP BY date_trunc('day', o.order_ts)::date
      ORDER BY day DESC
      LIMIT 30
    ) s
  ),
  vendor_payouts AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', vendor_key,
      'vendor', vendor_name,
      'email', vendor_email,
      'payout', payout,
      'orders', orders,
      'status', 'pending'
    ) ORDER BY payout DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT
        vendor_key,
        max(vendor_name) AS vendor_name,
        max(vendor_email) AS vendor_email,
        coalesce(sum(net), 0) AS payout,
        count(DISTINCT order_id)::bigint AS orders
      FROM order_vendor_net
      GROUP BY vendor_key
    ) s
  ),
  transactions AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(o.order_number, o.id),
      'date', coalesce(o.raw->>'date', o.raw->>'createdAt', o.order_ts::text),
      'customer', coalesce(o.customer_name, 'Guest'),
      'customerEmail', coalesce(o.email, ''),
      'vendor', coalesce(o.vendor_name, 'Unknown Vendor'),
      'vendorId', coalesce(o.vendor_id, o.vendor_name, 'Unknown'),
      'amount', o.order_total,
      'method', o.method,
      'status', CASE WHEN lower(coalesce(o.status, '')) IN ('delivered', 'completed') THEN 'completed' ELSE o.status END,
      'commission', coalesce(oc.commission, 0),
      'vendorPayout', greatest(0, o.order_total - coalesce(oc.commission, 0)),
      'products', coalesce(o.raw->'items', '[]'::jsonb),
      'gatewayFee', CASE WHEN o.method NOT IN ('Cash', 'COD') THEN o.order_total * 0.01 ELSE 0 END,
      'shippingAddress', coalesce(o.raw->>'shippingAddress', ''),
      'trackingNumber', coalesce(o.raw->>'trackingNumber', '')
    ) ORDER BY o.order_ts DESC), '[]'::jsonb) AS rows
    FROM orders_base o
    LEFT JOIN order_commission oc ON oc.order_id = o.id
  ),
  read_model_total AS (
    SELECT count(*)::bigint AS c FROM public.app_orders
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'totalRevenue', (SELECT total_revenue FROM summary),
      'totalCommission', (SELECT total_commission FROM summary),
      'totalVendorPayout', (SELECT total_vendor_payout FROM summary),
      'pendingPayouts', (SELECT pending_payouts FROM summary)
    ),
    'transactions', (SELECT rows FROM transactions),
    'paymentMethods', (SELECT rows FROM payment_methods),
    'revenueChartData', (SELECT rows FROM revenue_chart),
    'vendorPayouts', (SELECT rows FROM vendor_payouts),
    'readModelRows', (SELECT c FROM read_model_total),
    'timestamp', now()
  )
  INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.rpc_admin_customers_page IS 'Paged admin customers backed by app_customers read model; preserves Edge API response shape.';
COMMENT ON FUNCTION public.rpc_finances_analytics IS 'Finance analytics backed by app_orders/app_order_items/app_products/app_vendors read models.';
