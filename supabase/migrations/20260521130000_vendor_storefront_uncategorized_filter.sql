-- Vendor storefront: `category=uncategorized` means products with empty/missing category field.

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
  cat_uncategorized boolean := false;
  qpat text := NULL;
  slug text := NULL;
  result jsonb;
BEGIN
  IF p_category IS NOT NULL AND length(trim(p_category)) > 0 AND lower(trim(p_category)) <> 'all' THEN
    IF lower(trim(p_category)) IN ('uncategorized', '__uncategorized__') THEN
      cat_uncategorized := true;
    ELSE
      cat := lower(trim(p_category));
    END IF;
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
      AND (
        (NOT cat_uncategorized AND cat IS NULL)
        OR (
          cat_uncategorized
          AND (
            length(btrim(coalesce(value->>'category', ''))) = 0
            OR lower(btrim(coalesce(value->>'category', ''))) = 'uncategorized'
          )
        )
        OR (cat IS NOT NULL AND lower(btrim(coalesce(value->>'category', ''))) = cat)
      )
      AND (qpat IS NULL OR lower(coalesce(value->>'name', '')) LIKE qpat OR lower(coalesce(value->>'sku', '')) LIKE qpat)
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
