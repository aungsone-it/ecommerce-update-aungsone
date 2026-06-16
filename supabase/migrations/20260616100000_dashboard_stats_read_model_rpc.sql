-- SQL-backed admin dashboard stats from app_* read models.
-- Edge falls back to the legacy KV implementation when this is unavailable or not backfilled.

CREATE OR REPLACE FUNCTION public.app_dashboard_date_range(
  p_filter text,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  start_at timestamptz,
  end_at timestamptz,
  compare_start_at timestamptz,
  compare_end_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  filter_text text := coalesce(nullif(btrim(p_filter), ''), 'Last 30 days');
  custom text[];
  period interval;
BEGIN
  custom := regexp_match(filter_text, '^DashboardRange:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$');
  IF custom IS NOT NULL THEN
    start_at := custom[1]::date::timestamptz;
    end_at := (custom[2]::date + 1)::timestamptz - interval '1 millisecond';
    period := greatest(end_at - start_at + interval '1 millisecond', interval '1 day');
    compare_end_at := start_at;
    compare_start_at := compare_end_at - period;
    RETURN NEXT;
    RETURN;
  END IF;

  end_at := p_now;

  CASE filter_text
    WHEN 'Last 7 days' THEN
      start_at := p_now - interval '7 days';
      compare_start_at := p_now - interval '14 days';
      compare_end_at := p_now - interval '7 days';
    WHEN 'Last 30 days' THEN
      start_at := p_now - interval '30 days';
      compare_start_at := p_now - interval '60 days';
      compare_end_at := p_now - interval '30 days';
    WHEN 'Last 3 months' THEN
      start_at := date_trunc('day', p_now) - interval '3 months';
      compare_start_at := date_trunc('day', p_now) - interval '6 months';
      compare_end_at := date_trunc('day', p_now) - interval '3 months';
    WHEN 'Last 6 months' THEN
      start_at := date_trunc('day', p_now) - interval '6 months';
      compare_start_at := date_trunc('day', p_now) - interval '12 months';
      compare_end_at := date_trunc('day', p_now) - interval '6 months';
    WHEN 'Last year' THEN
      start_at := date_trunc('day', p_now) - interval '1 year';
      compare_start_at := date_trunc('day', p_now) - interval '2 years';
      compare_end_at := date_trunc('day', p_now) - interval '1 year';
    WHEN 'All time' THEN
      start_at := '1970-01-01 00:00:00+00'::timestamptz;
      compare_start_at := '1970-01-01 00:00:00+00'::timestamptz;
      compare_end_at := '1970-01-01 00:00:00+00'::timestamptz;
    ELSE
      start_at := p_now - interval '30 days';
      compare_start_at := p_now - interval '60 days';
      compare_end_at := p_now - interval '30 days';
  END CASE;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_dashboard_stats(
  p_revenue_filter text DEFAULT 'Last 30 days',
  p_orders_filter text DEFAULT 'Last 30 days',
  p_customers_filter text DEFAULT 'Last 30 days',
  p_products_filter text DEFAULT 'Last 30 days',
  p_global_filter text DEFAULT 'All time'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now timestamptz := now();
  revenue_start timestamptz;
  revenue_end timestamptz;
  revenue_compare_start timestamptz;
  revenue_compare_end timestamptz;
  orders_start timestamptz;
  orders_end timestamptz;
  orders_compare_start timestamptz;
  orders_compare_end timestamptz;
  customers_start timestamptz;
  customers_end timestamptz;
  customers_compare_start timestamptz;
  customers_compare_end timestamptz;
  products_start timestamptz;
  products_end timestamptz;
  products_compare_start timestamptz;
  products_compare_end timestamptz;
  global_start timestamptz;
  global_end timestamptz;
  global_compare_start timestamptz;
  global_compare_end timestamptz;
  result jsonb;
BEGIN
  SELECT start_at, end_at, compare_start_at, compare_end_at
  INTO revenue_start, revenue_end, revenue_compare_start, revenue_compare_end
  FROM public.app_dashboard_date_range(p_revenue_filter, v_now);

  SELECT start_at, end_at, compare_start_at, compare_end_at
  INTO orders_start, orders_end, orders_compare_start, orders_compare_end
  FROM public.app_dashboard_date_range(p_orders_filter, v_now);

  SELECT start_at, end_at, compare_start_at, compare_end_at
  INTO customers_start, customers_end, customers_compare_start, customers_compare_end
  FROM public.app_dashboard_date_range(p_customers_filter, v_now);

  SELECT start_at, end_at, compare_start_at, compare_end_at
  INTO products_start, products_end, products_compare_start, products_compare_end
  FROM public.app_dashboard_date_range(p_products_filter, v_now);

  SELECT start_at, end_at, compare_start_at, compare_end_at
  INTO global_start, global_end, global_compare_start, global_compare_end
  FROM public.app_dashboard_date_range(p_global_filter, v_now);

  WITH orders_base AS (
    SELECT
      o.id,
      o.order_number,
      coalesce(o.customer_name, o.raw->>'customer', 'Unknown Customer') AS customer_name,
      coalesce(o.status, 'pending') AS status,
      coalesce(o.total, public.app_read_model_num(o.raw->>'amount'), 0) AS total,
      coalesce(o.source_created_at, o.source_updated_at, o.synced_at) AS order_ts,
      o.raw
    FROM public.app_orders o
  ),
  products_base AS (
    SELECT
      p.id,
      p.name,
      coalesce(p.price, public.app_read_model_num(p.raw->>'salePrice'), public.app_read_model_num(p.raw->>'originalPrice'), 0) AS price,
      coalesce(p.source_created_at, p.source_updated_at, p.synced_at) AS product_ts
    FROM public.app_products p
  ),
  customers_base AS (
    SELECT
      c.id,
      coalesce(c.source_created_at, c.source_updated_at, c.synced_at) AS customer_ts
    FROM public.app_customers c
  ),
  revenue_stats AS (
    SELECT
      coalesce(sum(total) FILTER (WHERE order_ts >= revenue_start AND order_ts <= revenue_end), 0) AS current_revenue,
      coalesce(sum(total) FILTER (
        WHERE coalesce(p_revenue_filter, '') <> 'All time'
          AND order_ts >= revenue_compare_start
          AND order_ts < revenue_compare_end
      ), 0) AS compare_revenue
    FROM orders_base
  ),
  order_stats AS (
    SELECT
      count(*) FILTER (WHERE order_ts >= orders_start AND order_ts <= orders_end)::bigint AS current_orders,
      count(*) FILTER (
        WHERE coalesce(p_orders_filter, '') <> 'All time'
          AND order_ts >= orders_compare_start
          AND order_ts < orders_compare_end
      )::bigint AS compare_orders
    FROM orders_base
  ),
  customer_stats AS (
    SELECT
      count(*)::bigint AS all_customers,
      count(*) FILTER (WHERE customer_ts >= customers_start AND customer_ts <= customers_end)::bigint AS current_customers,
      count(*) FILTER (
        WHERE coalesce(p_customers_filter, '') <> 'All time'
          AND customer_ts >= customers_compare_start
          AND customer_ts < customers_compare_end
      )::bigint AS compare_customers
    FROM customers_base
  ),
  product_stats AS (
    SELECT
      count(*)::bigint AS all_products,
      count(*) FILTER (WHERE product_ts >= products_start AND product_ts <= products_end)::bigint AS current_products,
      count(*) FILTER (
        WHERE coalesce(p_products_filter, '') <> 'All time'
          AND product_ts >= products_compare_start
          AND product_ts < products_compare_end
      )::bigint AS compare_products
    FROM products_base
  ),
  section_orders AS (
    SELECT *
    FROM orders_base
    WHERE order_ts >= global_start AND order_ts <= global_end
  ),
  trend_months AS (
    SELECT m.month_start, m.ordinal
    FROM (
      SELECT
        gs AS month_start,
        row_number() OVER (ORDER BY gs) AS ordinal
      FROM generate_series(
        CASE
          WHEN coalesce(p_global_filter, '') = 'All time'
            THEN date_trunc('month', v_now) - interval '6 months'
          ELSE date_trunc('month', global_start)
        END,
        CASE
          WHEN coalesce(p_global_filter, '') = 'All time'
            THEN date_trunc('month', v_now)
          ELSE date_trunc('month', global_end)
        END,
        interval '1 month'
      ) AS gs
    ) m
    WHERE m.ordinal <= 36
  ),
  sales_trend AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', CASE
        WHEN coalesce(p_global_filter, '') = 'All time' THEN to_char(month_start, 'Mon')
        ELSE to_char(month_start, 'Mon YYYY')
      END,
      'sales', round(coalesce(month_revenue, 0)),
      'orders', coalesce(month_orders, 0)
    ) ORDER BY month_start), '[]'::jsonb) AS rows
    FROM (
      SELECT
        tm.month_start,
        coalesce(sum(so.total), 0) AS month_revenue,
        count(so.id)::bigint AS month_orders
      FROM trend_months tm
      LEFT JOIN section_orders so
        ON so.order_ts >= greatest(tm.month_start, global_start)
       AND so.order_ts <= least(tm.month_start + interval '1 month' - interval '1 millisecond', global_end)
      GROUP BY tm.month_start
    ) s
  ),
  top_products AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', name,
      'sales', sales,
      'revenue', round(revenue)
    ) ORDER BY sales DESC, revenue DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT
        coalesce(max(i.name), max(p.name), 'Unknown Product') AS name,
        coalesce(sum(coalesce(i.quantity, 1)), 0)::bigint AS sales,
        coalesce(sum(coalesce(i.line_total, coalesce(i.unit_price, p.price, 0) * coalesce(i.quantity, 1))), 0) AS revenue
      FROM section_orders so
      JOIN public.app_order_items i ON i.order_id = so.id
      LEFT JOIN products_base p ON p.id = i.product_id
      WHERE coalesce(i.product_id, '') <> ''
      GROUP BY i.product_id
      ORDER BY sales DESC, revenue DESC
      LIMIT 4
    ) s
  ),
  recent_orders AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(order_number, id),
      'customer', coalesce(customer_name, 'Unknown Customer'),
      'product', coalesce(first_product, 'Multiple Items'),
      'amount', total,
      'status', coalesce(status, 'pending')
    ) ORDER BY order_ts DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT
        so.id,
        so.order_number,
        so.customer_name,
        so.total,
        so.status,
        so.order_ts,
        fi.name AS first_product
      FROM section_orders so
      LEFT JOIN LATERAL (
        SELECT coalesce(i.name, 'Multiple Items') AS name
        FROM public.app_order_items i
        WHERE i.order_id = so.id
        ORDER BY i.line_index ASC
        LIMIT 1
      ) fi ON true
      ORDER BY so.order_ts DESC
      LIMIT 5
    ) s
  ),
  read_model_counts AS (
    SELECT
      (SELECT count(*)::bigint FROM public.app_orders) AS orders,
      (SELECT count(*)::bigint FROM public.app_products) AS products,
      (SELECT count(*)::bigint FROM public.app_customers) AS customers
  )
  SELECT jsonb_build_object(
    'totalRevenue', (SELECT current_revenue FROM revenue_stats),
    'totalOrders', (SELECT current_orders FROM order_stats),
    'totalCustomers', CASE
      WHEN coalesce(p_customers_filter, '') = 'All time' THEN (SELECT all_customers FROM customer_stats)
      ELSE (SELECT current_customers FROM customer_stats)
    END,
    'totalProducts', CASE
      WHEN coalesce(p_products_filter, '') = 'All time' THEN (SELECT all_products FROM product_stats)
      ELSE (SELECT current_products FROM product_stats)
    END,
    'revenueChange', CASE
      WHEN (SELECT compare_revenue FROM revenue_stats) > 0
        THEN round((((SELECT current_revenue FROM revenue_stats) - (SELECT compare_revenue FROM revenue_stats)) / (SELECT compare_revenue FROM revenue_stats)) * 100, 1)
      ELSE 0
    END,
    'ordersChange', CASE
      WHEN (SELECT compare_orders FROM order_stats) > 0
        THEN round((((SELECT current_orders FROM order_stats) - (SELECT compare_orders FROM order_stats))::numeric / (SELECT compare_orders FROM order_stats)) * 100, 1)
      ELSE 0
    END,
    'customersChange', CASE
      WHEN (SELECT compare_customers FROM customer_stats) > 0
        THEN round((((SELECT current_customers FROM customer_stats) - (SELECT compare_customers FROM customer_stats))::numeric / (SELECT compare_customers FROM customer_stats)) * 100, 1)
      ELSE 0
    END,
    'productsChange', CASE
      WHEN (SELECT compare_products FROM product_stats) > 0
        THEN round((((SELECT current_products FROM product_stats) - (SELECT compare_products FROM product_stats))::numeric / (SELECT compare_products FROM product_stats)) * 100, 1)
      ELSE 0
    END,
    'salesTrend', (SELECT rows FROM sales_trend),
    'topProducts', (SELECT rows FROM top_products),
    'recentOrders', (SELECT rows FROM recent_orders),
    'lastUpdated', v_now,
    'readModelRows', (SELECT orders + products + customers FROM read_model_counts),
    'readModelCounts', jsonb_build_object(
      'orders', (SELECT orders FROM read_model_counts),
      'products', (SELECT products FROM read_model_counts),
      'customers', (SELECT customers FROM read_model_counts)
    )
  )
  INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.rpc_dashboard_stats IS 'Admin dashboard stats backed by app_orders/app_order_items/app_products/app_customers read models.';

CREATE OR REPLACE FUNCTION public.rpc_basic_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH orders_base AS (
    SELECT
      coalesce(status, 'pending') AS status,
      coalesce(total, public.app_read_model_num(raw->>'amount'), 0) AS total
    FROM public.app_orders
  ),
  counts AS (
    SELECT
      (SELECT count(*)::bigint FROM public.app_products) AS products,
      (SELECT count(*)::bigint FROM public.app_orders) AS orders,
      (SELECT count(*)::bigint FROM public.app_customers) AS customers,
      coalesce(sum(total) FILTER (WHERE lower(coalesce(status, '')) <> 'cancelled'), 0) AS revenue,
      count(*) FILTER (WHERE lower(coalesce(status, '')) = 'pending')::bigint AS pending_orders,
      count(*) FILTER (WHERE lower(coalesce(status, '')) IN ('delivered', 'completed'))::bigint AS completed_orders
    FROM orders_base
  )
  SELECT jsonb_build_object(
    'totalProducts', products,
    'totalOrders', orders,
    'totalCustomers', customers,
    'totalRevenueNumber', revenue,
    'pendingOrders', pending_orders,
    'completedOrders', completed_orders,
    'readModelRows', products + orders + customers,
    'timestamp', now()
  )
  INTO result
  FROM counts;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_landing_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH counts AS (
    SELECT
      (SELECT count(*)::bigint FROM public.app_vendors WHERE lower(coalesce(status, '')) = 'active') AS active_vendors,
      (SELECT count(*)::bigint FROM public.app_products) AS products,
      (SELECT count(*)::bigint FROM public.app_customers) AS customers,
      (SELECT count(*)::bigint FROM public.app_vendors) AS vendors
  )
  SELECT jsonb_build_object(
    'activeVendors', active_vendors,
    'totalProducts', products,
    'totalCustomers', customers,
    'readModelRows', vendors + products + customers,
    'timestamp', now()
  )
  INTO result
  FROM counts;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.rpc_basic_stats IS 'Simple platform stats backed by app_orders/app_products/app_customers read models.';
COMMENT ON FUNCTION public.rpc_landing_stats IS 'Public landing stats backed by app_vendors/app_products/app_customers read models.';
