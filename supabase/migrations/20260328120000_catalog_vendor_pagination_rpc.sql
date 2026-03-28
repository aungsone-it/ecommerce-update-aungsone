-- Server-side pagination for storefront catalog and vendor storefront (kv_store_16010b6f).
-- Apply with: supabase db push / migration runner. Edge falls back to legacy scan if RPC missing.

CREATE OR REPLACE FUNCTION public.kv_product_price_num(v jsonb)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    CASE
      WHEN length(nullif(regexp_replace(coalesce(v->>'price', '0'), '[^0-9.]', '', 'g'), '')) > 0
      THEN nullif(regexp_replace(coalesce(v->>'price', '0'), '[^0-9.]', '', 'g'), '')::double precision
    END,
    0::double precision
  );
$$;

CREATE OR REPLACE FUNCTION public.kv_sales_vol_num(v jsonb)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(nullif(trim(coalesce(v->>'salesVolume', '')), ''), '0')::double precision;
$$;

CREATE OR REPLACE FUNCTION public.rpc_storefront_catalog(
  p_kind text,
  p_page int,
  p_page_size int,
  p_category text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_sort text DEFAULT 'featured',
  p_min_price double precision DEFAULT NULL,
  p_max_price double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  lim int := LEAST(GREATEST(COALESCE(p_page_size, 24), 1), 100);
  off int := (GREATEST(COALESCE(p_page, 1), 1) - 1) * lim;
  st text := lower(trim(coalesce(nullif(trim(p_sort), ''), 'featured')));
  cat text := NULL;
  qpat text := NULL;
  sort_expr text;
  result jsonb;
BEGIN
  IF p_category IS NOT NULL AND length(trim(p_category)) > 0 AND lower(trim(p_category)) <> 'all' THEN
    cat := lower(trim(p_category));
  END IF;
  IF p_q IS NOT NULL AND length(trim(p_q)) > 0 THEN
    qpat := '%' || lower(trim(p_q)) || '%';
  END IF;

  sort_expr := CASE st
    WHEN 'price-low' THEN 'public.kv_product_price_num(v) ASC NULLS LAST, coalesce(v->>''name'', '''') ASC'
    WHEN 'price-high' THEN 'public.kv_product_price_num(v) DESC NULLS LAST, coalesce(v->>''name'', '''') ASC'
    WHEN 'popular' THEN 'public.kv_sales_vol_num(v) DESC NULLS LAST, coalesce(v->>''name'', '''') ASC'
    WHEN 'newest' THEN 'coalesce(v->>''createDate'', v->>''createdAt'', '''') DESC NULLS LAST, coalesce(v->>''name'', '''') ASC'
    ELSE 'coalesce(v->>''name'', '''') ASC NULLS LAST'
  END;

  IF lower(trim(p_kind)) = 'bootstrap' THEN
    EXECUTE format($sql$
      WITH plat AS (
        SELECT value AS v
        FROM public.kv_store_16010b6f
        WHERE key LIKE 'product:%%'
          AND (
            (v->>'vendorId') IS NULL
            OR btrim(coalesce(v->>'vendorId', '')) = ''
            OR (v->>'vendorId') = 'migoo'
          )
          AND (
            (v->>'status') IS NULL
            OR lower(btrim(coalesce(v->>'status', ''))) = 'active'
          )
          AND ($1::text IS NULL OR lower(coalesce(v->>'category', '')) = $1::text)
          AND ($2::text IS NULL OR lower(coalesce(v->>'name', '')) LIKE $2::text)
          AND ($3::float8 IS NULL OR public.kv_product_price_num(v) >= $3::float8)
          AND ($4::float8 IS NULL OR public.kv_product_price_num(v) <= $4::float8)
      ),
      tc AS (SELECT count(*)::bigint AS c FROM plat),
      deals AS (
        SELECT coalesce(jsonb_agg(v ORDER BY sv DESC), '[]'::jsonb) AS j FROM (
          SELECT v, public.kv_sales_vol_num(v) AS sv
          FROM plat
          ORDER BY sv DESC NULLS LAST
          LIMIT 10
        ) s
      ),
      news AS (
        SELECT coalesce(jsonb_agg(v ORDER BY dt DESC), '[]'::jsonb) AS j FROM (
          SELECT v, coalesce(v->>'createDate', v->>'createdAt', '') AS dt
          FROM plat
          ORDER BY dt DESC NULLS LAST
          LIMIT 6
        ) s
      ),
      sorted AS (
        SELECT v FROM plat ORDER BY %s
      ),
      pagep AS (
        SELECT coalesce(jsonb_agg(v), '[]'::jsonb) AS j
        FROM (SELECT v FROM sorted LIMIT %s OFFSET %s) z
      )
      SELECT jsonb_build_object(
        'bootstrap', true,
        'total', (SELECT c FROM tc),
        'products', (SELECT j FROM pagep),
        'dealProducts', (SELECT j FROM deals),
        'newArrivals', (SELECT j FROM news),
        'page', 1,
        'pageSize', %s,
        'hasMore', (SELECT c FROM tc) > %s
      )
    $sql$, sort_expr, lim, off, lim, lim)
    INTO result
    USING cat, qpat, p_min_price, p_max_price;
    result := result || jsonb_build_object('sort', to_jsonb(coalesce(nullif(trim(p_sort), ''), 'featured')));
    RETURN result;
  END IF;

  IF lower(trim(p_kind)) = 'catalog' THEN
    EXECUTE format($sql$
      WITH plat AS (
        SELECT value AS v
        FROM public.kv_store_16010b6f
        WHERE key LIKE 'product:%%'
          AND (
            (v->>'vendorId') IS NULL
            OR btrim(coalesce(v->>'vendorId', '')) = ''
            OR (v->>'vendorId') = 'migoo'
          )
          AND (
            (v->>'status') IS NULL
            OR lower(btrim(coalesce(v->>'status', ''))) = 'active'
          )
          AND ($1::text IS NULL OR lower(coalesce(v->>'category', '')) = $1::text)
          AND ($2::text IS NULL OR lower(coalesce(v->>'name', '')) LIKE $2::text)
          AND ($3::float8 IS NULL OR public.kv_product_price_num(v) >= $3::float8)
          AND ($4::float8 IS NULL OR public.kv_product_price_num(v) <= $4::float8)
      ),
      tc AS (SELECT count(*)::bigint AS c FROM plat),
      sorted AS (
        SELECT v FROM plat ORDER BY %s
      ),
      pagep AS (
        SELECT coalesce(jsonb_agg(v), '[]'::jsonb) AS j
        FROM (SELECT v FROM sorted LIMIT %s OFFSET %s) z
      )
      SELECT jsonb_build_object(
        'catalog', true,
        'total', (SELECT c FROM tc),
        'products', (SELECT j FROM pagep),
        'page', %s,
        'pageSize', %s,
        'hasMore', (SELECT c FROM tc) > (%s + %s)
      )
    $sql$, sort_expr, lim, off, GREATEST(COALESCE(p_page, 1), 1), lim, off, lim)
    INTO result
    USING cat, qpat, p_min_price, p_max_price;
    result := result || jsonb_build_object('sort', to_jsonb(coalesce(nullif(trim(p_sort), ''), 'featured')));
    RETURN result;
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_vendor_storefront_products_page(
  p_vendor_id text,
  p_vendor_business_name text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 24,
  p_category text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_resolve_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  lim int := LEAST(GREATEST(COALESCE(p_page_size, 24), 1), 100);
  off int := (GREATEST(COALESCE(p_page, 1), 1) - 1) * lim;
  cat text := NULL;
  qpat text := NULL;
  slug text := NULL;
  result jsonb;
BEGIN
  IF p_category IS NOT NULL AND length(trim(p_category)) > 0 AND lower(trim(p_category)) <> 'all' THEN
    cat := lower(trim(p_category));
  END IF;
  IF p_q IS NOT NULL AND length(trim(p_q)) > 0 THEN
    qpat := '%' || lower(trim(p_q)) || '%';
  END IF;
  IF p_resolve_slug IS NOT NULL AND length(trim(p_resolve_slug)) > 0 THEN
    slug := trim(p_resolve_slug);
  END IF;

  IF slug IS NOT NULL THEN
    WITH hit AS (
      SELECT value AS v
      FROM public.kv_store_16010b6f
      WHERE key LIKE 'product:%'
        AND lower(btrim(coalesce(value->>'status', ''))) = 'active'
        AND (
          value->>'vendorId' = p_vendor_id
          OR (p_vendor_business_name IS NOT NULL AND value->>'vendor' = p_vendor_business_name)
          OR value->>'vendor' = p_vendor_id
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(value->'selectedVendors', '[]'::jsonb)) t(x)
            WHERE t.x = p_vendor_id
              OR (p_vendor_business_name IS NOT NULL AND t.x = p_vendor_business_name)
          )
        )
        AND (
          lower(trim(coalesce(value->>'sku', ''))) = lower(slug)
          OR lower(trim(coalesce(value->>'id', ''))) = lower(slug)
          OR lower(
            regexp_replace(
              regexp_replace(trim(coalesce(value->>'name', '')), '[^\w\s-]', '', 'g'),
              '\s+',
              '-',
              'g'
            )
          ) = lower(slug)
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(value->'variants', '[]'::jsonb)) var
            WHERE lower(trim(coalesce(var->>'sku', ''))) = lower(slug)
          )
        )
      LIMIT 1
    )
    SELECT jsonb_build_object(
      'products', coalesce((SELECT jsonb_agg(v) FROM hit), '[]'::jsonb),
      'total', (SELECT count(*)::bigint FROM hit),
      'page', 1,
      'pageSize', 1,
      'hasMore', false
    )
    INTO result;
    RETURN coalesce(result, jsonb_build_object('products', '[]'::jsonb, 'total', 0, 'page', 1, 'pageSize', 1, 'hasMore', false));
  END IF;

  WITH plat AS (
    SELECT value AS v
    FROM public.kv_store_16010b6f
    WHERE key LIKE 'product:%'
      AND lower(btrim(coalesce(value->>'status', ''))) = 'active'
      AND (
        value->>'vendorId' = p_vendor_id
        OR (p_vendor_business_name IS NOT NULL AND value->>'vendor' = p_vendor_business_name)
        OR value->>'vendor' = p_vendor_id
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(value->'selectedVendors', '[]'::jsonb)) t(x)
          WHERE t.x = p_vendor_id
            OR (p_vendor_business_name IS NOT NULL AND t.x = p_vendor_business_name)
        )
      )
      AND (cat IS NULL OR lower(coalesce(v->>'category', '')) = cat)
      AND (qpat IS NULL OR lower(coalesce(v->>'name', '')) LIKE qpat OR lower(coalesce(v->>'sku', '')) LIKE qpat)
  ),
  tc AS (SELECT count(*)::bigint AS c FROM plat),
  sorted AS (
    SELECT v FROM plat
    ORDER BY coalesce(v->>'createDate', v->>'createdAt', '') DESC NULLS LAST, coalesce(v->>'name', '') ASC
  ),
  pagep AS (
    SELECT coalesce(jsonb_agg(v), '[]'::jsonb) AS j
    FROM (SELECT v FROM sorted LIMIT lim OFFSET off) z
  )
  SELECT jsonb_build_object(
    'products', (SELECT j FROM pagep),
    'total', (SELECT c FROM tc),
    'page', GREATEST(COALESCE(p_page, 1), 1),
    'pageSize', lim,
    'hasMore', (SELECT c FROM tc) > (off + lim)
  )
  INTO result;

  RETURN coalesce(result, jsonb_build_object('products', '[]'::jsonb, 'total', 0, 'page', 1, 'pageSize', lim, 'hasMore', false));
END;
$$;

GRANT EXECUTE ON FUNCTION public.kv_product_price_num(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.kv_sales_vol_num(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_storefront_catalog(text, int, int, text, text, text, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_vendor_storefront_products_page(text, text, int, int, text, text, text) TO service_role;
