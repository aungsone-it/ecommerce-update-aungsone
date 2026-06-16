-- Add normalized SQL read-model tables beside the existing kv_store_16010b6f.
--
-- This migration is intentionally additive only:
-- - no existing KV data is moved or deleted
-- - no app endpoints are switched
-- - no realtime behavior changes
--
-- Follow-up migrations/jobs can backfill these tables from KV and dual-write new
-- mutations before read-heavy endpoints are moved to SQL pagination/aggregates.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.app_vendors (
  id text PRIMARY KEY,
  source_kv_key text UNIQUE,
  business_name text,
  display_name text,
  email text,
  phone text,
  status text,
  store_slug text,
  custom_domain text,
  commission_percent numeric(8, 4),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_customers (
  id text PRIMARY KEY,
  source_kv_key text UNIQUE,
  user_id text,
  name text,
  email text,
  phone text,
  status text,
  tier text,
  total_spent numeric(14, 2) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_products (
  id text PRIMARY KEY,
  source_kv_key text UNIQUE,
  name text,
  sku text,
  vendor_id text,
  vendor_name text,
  selected_vendor_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  category text,
  status text,
  price numeric(14, 2),
  compare_at_price numeric(14, 2),
  inventory integer,
  track_quantity boolean,
  continue_selling_out_of_stock boolean,
  has_variants boolean NOT NULL DEFAULT false,
  sales_volume numeric(14, 2) NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- One row per product/variant SKU. This lets the app replace expensive
-- all-product SKU scans with indexed checks once dual-write/backfill is added.
CREATE TABLE IF NOT EXISTS public.app_product_skus (
  sku text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.app_products(id) ON DELETE CASCADE,
  variant_id text,
  normalized_sku text GENERATED ALWAYS AS (lower(btrim(sku))) STORED,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_orders (
  id text PRIMARY KEY,
  source_kv_key text UNIQUE,
  order_number text,
  customer_id text,
  customer_name text,
  email text,
  phone text,
  vendor_id text,
  vendor_name text,
  status text,
  payment_status text,
  shipping_status text,
  payment_method text,
  subtotal numeric(14, 2),
  discount numeric(14, 2),
  shipping_fee numeric(14, 2),
  total numeric(14, 2),
  currency text,
  inventory_deducted boolean,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_order_items (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.app_orders(id) ON DELETE CASCADE,
  line_index integer NOT NULL,
  product_id text,
  sku text,
  name text,
  vendor_id text,
  vendor_name text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(14, 2),
  line_total numeric(14, 2),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, line_index)
);

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id text PRIMARY KEY,
  source_kv_key text UNIQUE,
  user_id text,
  vendor_id text,
  kind text,
  title text,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Vendors
CREATE INDEX IF NOT EXISTS idx_app_vendors_status
  ON public.app_vendors (lower(coalesce(status, '')));

CREATE INDEX IF NOT EXISTS idx_app_vendors_store_slug
  ON public.app_vendors (lower(coalesce(store_slug, '')))
  WHERE store_slug IS NOT NULL AND btrim(store_slug) <> '';

CREATE INDEX IF NOT EXISTS idx_app_vendors_custom_domain
  ON public.app_vendors (lower(coalesce(custom_domain, '')))
  WHERE custom_domain IS NOT NULL AND btrim(custom_domain) <> '';

CREATE INDEX IF NOT EXISTS idx_app_vendors_name_trgm
  ON public.app_vendors
  USING gin (lower(coalesce(business_name, display_name, '')) gin_trgm_ops);

-- Customers
CREATE INDEX IF NOT EXISTS idx_app_customers_user_id
  ON public.app_customers (user_id)
  WHERE user_id IS NOT NULL AND btrim(user_id) <> '';

CREATE INDEX IF NOT EXISTS idx_app_customers_email
  ON public.app_customers (lower(coalesce(email, '')))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_app_customers_phone
  ON public.app_customers (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

CREATE INDEX IF NOT EXISTS idx_app_customers_status_tier
  ON public.app_customers (lower(coalesce(status, '')), lower(coalesce(tier, '')));

CREATE INDEX IF NOT EXISTS idx_app_customers_created_at
  ON public.app_customers (source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_customers_search_trgm
  ON public.app_customers
  USING gin (lower(coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '')) gin_trgm_ops);

-- Products
CREATE INDEX IF NOT EXISTS idx_app_products_vendor_status_category
  ON public.app_products (
    vendor_id,
    lower(coalesce(status, '')),
    lower(coalesce(category, ''))
  );

CREATE INDEX IF NOT EXISTS idx_app_products_selected_vendor_ids
  ON public.app_products
  USING gin (selected_vendor_ids);

CREATE INDEX IF NOT EXISTS idx_app_products_platform_status_category
  ON public.app_products (lower(coalesce(status, '')), lower(coalesce(category, '')))
  WHERE vendor_id IS NULL OR btrim(vendor_id) = '' OR vendor_id = 'migoo';

CREATE INDEX IF NOT EXISTS idx_app_products_sku_lower
  ON public.app_products (lower(btrim(coalesce(sku, ''))))
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE INDEX IF NOT EXISTS idx_app_products_name_trgm
  ON public.app_products
  USING gin (lower(coalesce(name, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_app_products_created_at
  ON public.app_products (source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_products_price
  ON public.app_products (price);

CREATE INDEX IF NOT EXISTS idx_app_products_sales_volume
  ON public.app_products (sales_volume DESC NULLS LAST);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_product_skus_normalized_unique
  ON public.app_product_skus (normalized_sku)
  WHERE normalized_sku <> '';

CREATE INDEX IF NOT EXISTS idx_app_product_skus_product_id
  ON public.app_product_skus (product_id);

-- Orders
CREATE INDEX IF NOT EXISTS idx_app_orders_order_number
  ON public.app_orders (lower(coalesce(order_number, '')))
  WHERE order_number IS NOT NULL AND btrim(order_number) <> '';

CREATE INDEX IF NOT EXISTS idx_app_orders_vendor_created_at
  ON public.app_orders (vendor_id, source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_orders_status_created_at
  ON public.app_orders (lower(coalesce(status, '')), source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_orders_payment_status_created_at
  ON public.app_orders (lower(coalesce(payment_status, '')), source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_orders_created_at
  ON public.app_orders (source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_orders_customer_lookup
  ON public.app_orders (lower(coalesce(email, '')), phone);

CREATE INDEX IF NOT EXISTS idx_app_orders_search_trgm
  ON public.app_orders
  USING gin (
    lower(
      coalesce(order_number, '') || ' ' ||
      coalesce(customer_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone, '')
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_app_order_items_order_id
  ON public.app_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_app_order_items_vendor_order
  ON public.app_order_items (vendor_id, order_id);

CREATE INDEX IF NOT EXISTS idx_app_order_items_product_id
  ON public.app_order_items (product_id)
  WHERE product_id IS NOT NULL AND btrim(product_id) <> '';

CREATE INDEX IF NOT EXISTS idx_app_order_items_sku_lower
  ON public.app_order_items (lower(btrim(coalesce(sku, ''))))
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

-- Notifications
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_read_created
  ON public.app_notifications (user_id, is_read, source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_notifications_vendor_read_created
  ON public.app_notifications (vendor_id, is_read, source_created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_app_notifications_kind_created
  ON public.app_notifications (lower(coalesce(kind, '')), source_created_at DESC NULLS LAST);

-- Keep direct client access closed by default. Edge Functions use the service role
-- and can read/write through RLS; public API behavior remains controlled by Hono.
ALTER TABLE public.app_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_vendors IS 'Normalized read model for vendor KV documents; additive beside kv_store_16010b6f.';
COMMENT ON TABLE public.app_customers IS 'Normalized read model for customer KV documents and admin customer search.';
COMMENT ON TABLE public.app_products IS 'Normalized read model for product KV documents, storefront catalog, and admin product lists.';
COMMENT ON TABLE public.app_product_skus IS 'Indexed product and variant SKU lookup table for uniqueness checks.';
COMMENT ON TABLE public.app_orders IS 'Normalized read model for order KV documents and order analytics.';
COMMENT ON TABLE public.app_order_items IS 'Line-item read model for vendor order filtering and product analytics.';
COMMENT ON TABLE public.app_notifications IS 'Normalized read model for notification KV documents.';
