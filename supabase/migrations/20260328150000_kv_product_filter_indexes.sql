-- Indexes for catalog RPCs on kv_store_16010b6f (JSONB product rows under key LIKE 'product:%').
-- Partial indexes keep size down and match storefront / vendor filter patterns.
-- Requires prior migration defining public.kv_product_price_num / public.kv_sales_vol_num.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Substring search on product name (guest search uses LIKE '%q%')
CREATE INDEX IF NOT EXISTS idx_kv_products_name_trgm
  ON public.kv_store_16010b6f
  USING gin (lower(coalesce(value ->> 'name', '')) gin_trgm_ops)
  WHERE key LIKE 'product:%';

-- Category equality (RPC uses lower(coalesce(v->>'category','')) = $cat)
CREATE INDEX IF NOT EXISTS idx_kv_products_category_lower
  ON public.kv_store_16010b6f (lower(coalesce(value ->> 'category', '')))
  WHERE key LIKE 'product:%';

-- Active vendor-scoped listings (vendorId + active status + category)
CREATE INDEX IF NOT EXISTS idx_kv_products_vendor_status_category
  ON public.kv_store_16010b6f (
    (value ->> 'vendorId'),
    lower(btrim(coalesce(value ->> 'status', ''))),
    lower(coalesce(value ->> 'category', ''))
  )
  WHERE key LIKE 'product:%';

-- Legacy vendor string field (products keyed by business name)
CREATE INDEX IF NOT EXISTS idx_kv_products_vendor_field_lower
  ON public.kv_store_16010b6f (
    lower(coalesce(value ->> 'vendor', '')),
    lower(btrim(coalesce(value ->> 'status', '')))
  )
  WHERE key LIKE 'product:%';

-- Platform catalog slice: migoo / empty vendor + active + category (narrow partial for /store)
CREATE INDEX IF NOT EXISTS idx_kv_products_platform_active_category
  ON public.kv_store_16010b6f (lower(coalesce(value ->> 'category', '')))
  WHERE key LIKE 'product:%'
    AND (
      (value ->> 'vendorId') IS NULL
      OR btrim(coalesce(value ->> 'vendorId', '')) = ''
      OR (value ->> 'vendorId') = 'migoo'
    )
    AND (
      (value ->> 'status') IS NULL
      OR lower(btrim(coalesce(value ->> 'status', ''))) = 'active'
    );

-- Numeric price filters and price sort (uses same expression as RPC)
CREATE INDEX IF NOT EXISTS idx_kv_products_price_num
  ON public.kv_store_16010b6f (public.kv_product_price_num(value))
  WHERE key LIKE 'product:%';

-- Popular sort
CREATE INDEX IF NOT EXISTS idx_kv_products_sales_vol
  ON public.kv_store_16010b6f (public.kv_sales_vol_num(value) DESC NULLS LAST)
  WHERE key LIKE 'product:%';

-- Newest sort (text ordering matches RPC)
CREATE INDEX IF NOT EXISTS idx_kv_products_created_text
  ON public.kv_store_16010b6f (coalesce(value ->> 'createDate', value ->> 'createdAt', '') DESC)
  WHERE key LIKE 'product:%';

-- Product title / default sort by name
CREATE INDEX IF NOT EXISTS idx_kv_products_name_sort
  ON public.kv_store_16010b6f (coalesce(value ->> 'name', '') ASC NULLS LAST)
  WHERE key LIKE 'product:%';

-- Slug resolve: SKU, id, URL slug from name (same expressions as rpc_vendor_storefront_products_page)
CREATE INDEX IF NOT EXISTS idx_kv_products_sku_lower
  ON public.kv_store_16010b6f (lower(trim(coalesce(value ->> 'sku', ''))))
  WHERE key LIKE 'product:%'
    AND length(trim(coalesce(value ->> 'sku', ''))) > 0;

CREATE INDEX IF NOT EXISTS idx_kv_products_id_lower
  ON public.kv_store_16010b6f (lower(trim(coalesce(value ->> 'id', ''))))
  WHERE key LIKE 'product:%'
    AND length(trim(coalesce(value ->> 'id', ''))) > 0;

CREATE INDEX IF NOT EXISTS idx_kv_products_name_slug_lower
  ON public.kv_store_16010b6f (
    lower(
      regexp_replace(
        regexp_replace(trim(coalesce(value ->> 'name', '')), '[^\w\s-]', '', 'g'),
        '\s+',
        '-',
        'g'
      )
    )
  )
  WHERE key LIKE 'product:%';

-- Multi-vendor array: helps @> / containment style filters when planner chooses them
CREATE INDEX IF NOT EXISTS idx_kv_products_selected_vendors_gin
  ON public.kv_store_16010b6f
  USING gin ((value -> 'selectedVendors'))
  WHERE key LIKE 'product:%'
    AND jsonb_typeof(value -> 'selectedVendors') = 'array';

COMMENT ON INDEX public.idx_kv_products_name_trgm IS 'Speeds ILIKE/LIKE substring search on product names';
COMMENT ON INDEX public.idx_kv_products_platform_active_category IS 'Narrows platform (migoo) catalog before sort/paginate';
