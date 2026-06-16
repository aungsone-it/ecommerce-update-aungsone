-- Backfill normalized read-model tables from the existing KV documents.
--
-- This is safe to run after the app_read_model_tables migration and before any
-- endpoint reads are switched to SQL. KV remains the source of truth.

CREATE OR REPLACE FUNCTION public.app_read_model_num(raw text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN nullif(regexp_replace(coalesce(raw, ''), '[^0-9.-]', '', 'g'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN nullif(regexp_replace(coalesce(raw, ''), '[^0-9.-]', '', 'g'), '')::numeric
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.app_read_model_int(raw text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN public.app_read_model_num(raw) IS NULL THEN NULL
    ELSE trunc(public.app_read_model_num(raw))::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.app_read_model_bool(raw text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE lower(btrim(coalesce(raw, '')))
    WHEN 'true' THEN true
    WHEN 't' THEN true
    WHEN '1' THEN true
    WHEN 'yes' THEN true
    WHEN 'false' THEN false
    WHEN 'f' THEN false
    WHEN '0' THEN false
    WHEN 'no' THEN false
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.app_read_model_timestamptz(raw text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Vendors
INSERT INTO public.app_vendors (
  id,
  source_kv_key,
  business_name,
  display_name,
  email,
  phone,
  status,
  store_slug,
  custom_domain,
  commission_percent,
  raw,
  source_created_at,
  source_updated_at,
  synced_at
)
SELECT
  DISTINCT ON (coalesce(nullif(value->>'id', ''), substring(key from length('vendor:') + 1)))
  coalesce(nullif(value->>'id', ''), substring(key from length('vendor:') + 1)) AS id,
  key,
  nullif(coalesce(value->>'businessName', value->>'name'), ''),
  nullif(coalesce(value->>'displayName', value->>'name', value->>'businessName'), ''),
  nullif(value->>'email', ''),
  nullif(value->>'phone', ''),
  nullif(value->>'status', ''),
  nullif(coalesce(value->>'storeSlug', value->>'slug'), ''),
  nullif(coalesce(value->>'customDomain', value->>'domain'), ''),
  public.app_read_model_num(coalesce(value->>'commission', value->>'commissionRate')),
  value,
  public.app_read_model_timestamptz(coalesce(value->>'createdAt', value->>'createDate')),
  public.app_read_model_timestamptz(value->>'updatedAt'),
  now()
FROM public.kv_store_16010b6f
WHERE key LIKE 'vendor:%'
  AND key NOT LIKE 'vendor:audience:%'
  AND jsonb_typeof(value) = 'object'
  AND coalesce(nullif(value->>'id', ''), substring(key from length('vendor:') + 1)) <> ''
ORDER BY coalesce(nullif(value->>'id', ''), substring(key from length('vendor:') + 1)), key
ON CONFLICT (id) DO UPDATE SET
  source_kv_key = EXCLUDED.source_kv_key,
  business_name = EXCLUDED.business_name,
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  store_slug = EXCLUDED.store_slug,
  custom_domain = EXCLUDED.custom_domain,
  commission_percent = EXCLUDED.commission_percent,
  raw = EXCLUDED.raw,
  source_created_at = EXCLUDED.source_created_at,
  source_updated_at = EXCLUDED.source_updated_at,
  synced_at = now();

-- Customers. Exclude subdocuments like customer:{id}:cart/wishlist/addresses.
INSERT INTO public.app_customers (
  id,
  source_kv_key,
  user_id,
  name,
  email,
  phone,
  status,
  tier,
  total_spent,
  order_count,
  raw,
  source_created_at,
  source_updated_at,
  synced_at
)
SELECT
  DISTINCT ON (coalesce(nullif(value->>'id', ''), substring(key from length('customer:') + 1)))
  coalesce(nullif(value->>'id', ''), substring(key from length('customer:') + 1)) AS id,
  key,
  nullif(coalesce(value->>'userId', value->>'uid'), ''),
  nullif(coalesce(value->>'name', value->>'customerName', value->>'fullName'), ''),
  nullif(value->>'email', ''),
  nullif(value->>'phone', ''),
  nullif(value->>'status', ''),
  nullif(value->>'tier', ''),
  coalesce(public.app_read_model_num(coalesce(value->>'totalSpent', value->>'lifetimeValue')), 0),
  coalesce(public.app_read_model_int(coalesce(value->>'orderCount', value->>'totalOrders')), 0),
  value,
  public.app_read_model_timestamptz(coalesce(value->>'createdAt', value->>'joinDate')),
  public.app_read_model_timestamptz(value->>'updatedAt'),
  now()
FROM public.kv_store_16010b6f
WHERE key LIKE 'customer:%'
  AND key !~ '^customer:[^:]+:(cart|wishlist|addresses)$'
  AND jsonb_typeof(value) = 'object'
  AND coalesce(nullif(value->>'id', ''), substring(key from length('customer:') + 1)) <> ''
ORDER BY coalesce(nullif(value->>'id', ''), substring(key from length('customer:') + 1)), key
ON CONFLICT (id) DO UPDATE SET
  source_kv_key = EXCLUDED.source_kv_key,
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  tier = EXCLUDED.tier,
  total_spent = EXCLUDED.total_spent,
  order_count = EXCLUDED.order_count,
  raw = EXCLUDED.raw,
  source_created_at = EXCLUDED.source_created_at,
  source_updated_at = EXCLUDED.source_updated_at,
  synced_at = now();

-- Registered vendor-audience rows may not have a canonical customer:* document yet.
-- Store them as customer read-model rows too so SQL-backed admin customers keeps parity
-- with the legacy mergeSystemCustomerSources() behavior.
WITH audience_rows AS (
  SELECT
    aud.value AS aud
  FROM public.kv_store_16010b6f kv
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(kv.value) = 'array' THEN kv.value
      ELSE '[]'::jsonb
    END
  ) AS aud(value)
  WHERE kv.key LIKE 'vendor:audience:%'
    AND jsonb_typeof(aud.value) = 'object'
),
audience_deduped AS (
  SELECT DISTINCT ON (
    coalesce(
      nullif(aud->>'userId', ''),
      'email:' || lower(nullif(aud->>'email', '')),
      'phone:' || nullif(aud->>'phone', '')
    )
  )
    coalesce(
      nullif(aud->>'userId', ''),
      'email:' || lower(nullif(aud->>'email', '')),
      'phone:' || nullif(aud->>'phone', '')
    ) AS id,
    aud
  FROM audience_rows
  WHERE coalesce(
      nullif(aud->>'userId', ''),
      'email:' || lower(nullif(aud->>'email', '')),
      'phone:' || nullif(aud->>'phone', '')
    ) IS NOT NULL
  ORDER BY
    coalesce(
      nullif(aud->>'userId', ''),
      'email:' || lower(nullif(aud->>'email', '')),
      'phone:' || nullif(aud->>'phone', '')
    ),
    coalesce(aud->>'lastSeenAt', aud->>'firstSeenAt', '') DESC
)
INSERT INTO public.app_customers (
  id,
  user_id,
  name,
  email,
  phone,
  status,
  tier,
  total_spent,
  order_count,
  raw,
  source_created_at,
  source_updated_at,
  synced_at
)
SELECT
  id,
  nullif(aud->>'userId', ''),
  nullif(aud->>'name', ''),
  nullif(aud->>'email', ''),
  nullif(aud->>'phone', ''),
  'active',
  null,
  0,
  0,
  aud,
  public.app_read_model_timestamptz(aud->>'firstSeenAt'),
  public.app_read_model_timestamptz(aud->>'lastSeenAt'),
  now()
FROM audience_deduped
ON CONFLICT (id) DO UPDATE SET
  user_id = coalesce(public.app_customers.user_id, EXCLUDED.user_id),
  name = coalesce(public.app_customers.name, EXCLUDED.name),
  email = coalesce(public.app_customers.email, EXCLUDED.email),
  phone = coalesce(public.app_customers.phone, EXCLUDED.phone),
  status = coalesce(public.app_customers.status, EXCLUDED.status),
  raw = CASE
    WHEN public.app_customers.raw = '{}'::jsonb THEN EXCLUDED.raw
    ELSE public.app_customers.raw
  END,
  source_created_at = coalesce(public.app_customers.source_created_at, EXCLUDED.source_created_at),
  source_updated_at = coalesce(
    greatest(public.app_customers.source_updated_at, EXCLUDED.source_updated_at),
    public.app_customers.source_updated_at,
    EXCLUDED.source_updated_at
  ),
  synced_at = now();

-- Products
INSERT INTO public.app_products (
  id,
  source_kv_key,
  name,
  sku,
  vendor_id,
  vendor_name,
  selected_vendor_ids,
  category,
  status,
  price,
  compare_at_price,
  inventory,
  track_quantity,
  continue_selling_out_of_stock,
  has_variants,
  sales_volume,
  raw,
  source_created_at,
  source_updated_at,
  synced_at
)
SELECT
  DISTINCT ON (coalesce(nullif(value->>'id', ''), substring(key from length('product:') + 1)))
  coalesce(nullif(value->>'id', ''), substring(key from length('product:') + 1)) AS id,
  key,
  nullif(coalesce(value->>'name', value->>'title'), ''),
  nullif(value->>'sku', ''),
  nullif(value->>'vendorId', ''),
  nullif(value->>'vendor', ''),
  coalesce(
    ARRAY(
      SELECT DISTINCT btrim(x)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(value->'selectedVendors') = 'array' THEN value->'selectedVendors'
          ELSE '[]'::jsonb
        END
      ) AS t(x)
      WHERE btrim(x) <> ''
    ),
    ARRAY[]::text[]
  ),
  nullif(value->>'category', ''),
  nullif(value->>'status', ''),
  public.app_read_model_num(value->>'price'),
  public.app_read_model_num(value->>'compareAtPrice'),
  public.app_read_model_int(coalesce(value->>'inventory', value->>'stock')),
  public.app_read_model_bool(value->>'trackQuantity'),
  public.app_read_model_bool(value->>'continueSellingOutOfStock'),
  coalesce(public.app_read_model_bool(value->>'hasVariants'), false),
  coalesce(public.app_read_model_num(value->>'salesVolume'), 0),
  value,
  public.app_read_model_timestamptz(coalesce(value->>'createdAt', value->>'createDate')),
  public.app_read_model_timestamptz(value->>'updatedAt'),
  now()
FROM public.kv_store_16010b6f
WHERE key LIKE 'product:%'
  AND jsonb_typeof(value) = 'object'
  AND coalesce(nullif(value->>'id', ''), substring(key from length('product:') + 1)) <> ''
ORDER BY coalesce(nullif(value->>'id', ''), substring(key from length('product:') + 1)), key
ON CONFLICT (id) DO UPDATE SET
  source_kv_key = EXCLUDED.source_kv_key,
  name = EXCLUDED.name,
  sku = EXCLUDED.sku,
  vendor_id = EXCLUDED.vendor_id,
  vendor_name = EXCLUDED.vendor_name,
  selected_vendor_ids = EXCLUDED.selected_vendor_ids,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  price = EXCLUDED.price,
  compare_at_price = EXCLUDED.compare_at_price,
  inventory = EXCLUDED.inventory,
  track_quantity = EXCLUDED.track_quantity,
  continue_selling_out_of_stock = EXCLUDED.continue_selling_out_of_stock,
  has_variants = EXCLUDED.has_variants,
  sales_volume = EXCLUDED.sales_volume,
  raw = EXCLUDED.raw,
  source_created_at = EXCLUDED.source_created_at,
  source_updated_at = EXCLUDED.source_updated_at,
  synced_at = now();

-- Product and variant SKUs. Canonicalize to lower-case to avoid duplicate-case conflicts.
WITH sku_candidates AS (
  SELECT
    coalesce(nullif(kv.value->>'id', ''), substring(kv.key from length('product:') + 1)) AS product_id,
    lower(btrim(kv.value->>'sku')) AS sku,
    NULL::text AS variant_id,
    jsonb_build_object('source', 'product', 'rawSku', kv.value->>'sku') AS raw
  FROM public.kv_store_16010b6f kv
  WHERE kv.key LIKE 'product:%'
    AND jsonb_typeof(kv.value) = 'object'
    AND btrim(coalesce(kv.value->>'sku', '')) <> ''

  UNION ALL

  SELECT
    coalesce(nullif(kv.value->>'id', ''), substring(kv.key from length('product:') + 1)) AS product_id,
    lower(btrim(variant.value->>'sku')) AS sku,
    nullif(coalesce(variant.value->>'id', variant.value->>'variantId'), '') AS variant_id,
    variant.value AS raw
  FROM public.kv_store_16010b6f kv
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(kv.value->'variants') = 'array' THEN kv.value->'variants'
      ELSE '[]'::jsonb
    END
  ) AS variant(value)
  WHERE kv.key LIKE 'product:%'
    AND jsonb_typeof(kv.value) = 'object'
    AND btrim(coalesce(variant.value->>'sku', '')) <> ''
),
deduped_skus AS (
  SELECT DISTINCT ON (sku)
    sku,
    product_id,
    variant_id,
    raw
  FROM sku_candidates
  WHERE sku <> ''
    AND product_id IN (SELECT id FROM public.app_products)
  ORDER BY sku, product_id, variant_id NULLS FIRST
)
INSERT INTO public.app_product_skus (
  sku,
  product_id,
  variant_id,
  raw,
  synced_at
)
SELECT
  sku,
  product_id,
  variant_id,
  raw,
  now()
FROM deduped_skus d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.app_product_skus existing
  WHERE existing.normalized_sku = d.sku
);

-- Orders
INSERT INTO public.app_orders (
  id,
  source_kv_key,
  order_number,
  customer_id,
  customer_name,
  email,
  phone,
  vendor_id,
  vendor_name,
  status,
  payment_status,
  shipping_status,
  payment_method,
  subtotal,
  discount,
  shipping_fee,
  total,
  currency,
  inventory_deducted,
  raw,
  source_created_at,
  source_updated_at,
  synced_at
)
SELECT
  DISTINCT ON (coalesce(nullif(value->>'id', ''), substring(key from length('order:') + 1)))
  coalesce(nullif(value->>'id', ''), substring(key from length('order:') + 1)) AS id,
  key,
  nullif(value->>'orderNumber', ''),
  nullif(coalesce(value->>'customerId', value->>'userId'), ''),
  nullif(coalesce(value->>'customerName', value->>'customer'), ''),
  nullif(value->>'email', ''),
  nullif(value->>'phone', ''),
  nullif(value->>'vendorId', ''),
  nullif(coalesce(value->>'vendorName', value->>'vendor'), ''),
  nullif(value->>'status', ''),
  nullif(value->>'paymentStatus', ''),
  nullif(value->>'shippingStatus', ''),
  nullif(value->>'paymentMethod', ''),
  public.app_read_model_num(value->>'subtotal'),
  public.app_read_model_num(value->>'discount'),
  public.app_read_model_num(coalesce(value->>'shippingFee', value->>'shipping')),
  public.app_read_model_num(coalesce(value->>'total', value->>'amount')),
  nullif(value->>'currency', ''),
  public.app_read_model_bool(value->>'inventoryDeducted'),
  value,
  public.app_read_model_timestamptz(coalesce(value->>'createdAt', value->>'date')),
  public.app_read_model_timestamptz(value->>'updatedAt'),
  now()
FROM public.kv_store_16010b6f
WHERE key LIKE 'order:%'
  AND jsonb_typeof(value) = 'object'
  AND coalesce(nullif(value->>'id', ''), substring(key from length('order:') + 1)) <> ''
ORDER BY coalesce(nullif(value->>'id', ''), substring(key from length('order:') + 1)), key
ON CONFLICT (id) DO UPDATE SET
  source_kv_key = EXCLUDED.source_kv_key,
  order_number = EXCLUDED.order_number,
  customer_id = EXCLUDED.customer_id,
  customer_name = EXCLUDED.customer_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  vendor_id = EXCLUDED.vendor_id,
  vendor_name = EXCLUDED.vendor_name,
  status = EXCLUDED.status,
  payment_status = EXCLUDED.payment_status,
  shipping_status = EXCLUDED.shipping_status,
  payment_method = EXCLUDED.payment_method,
  subtotal = EXCLUDED.subtotal,
  discount = EXCLUDED.discount,
  shipping_fee = EXCLUDED.shipping_fee,
  total = EXCLUDED.total,
  currency = EXCLUDED.currency,
  inventory_deducted = EXCLUDED.inventory_deducted,
  raw = EXCLUDED.raw,
  source_created_at = EXCLUDED.source_created_at,
  source_updated_at = EXCLUDED.source_updated_at,
  synced_at = now();

-- Order line items
INSERT INTO public.app_order_items (
  order_id,
  line_index,
  product_id,
  sku,
  name,
  vendor_id,
  vendor_name,
  quantity,
  unit_price,
  line_total,
  raw,
  synced_at
)
SELECT
  coalesce(nullif(kv.value->>'id', ''), substring(kv.key from length('order:') + 1)) AS order_id,
  (item.ordinality - 1)::integer AS line_index,
  nullif(coalesce(item.value->>'productId', item.value->>'product_id', item.value->>'id'), ''),
  nullif(item.value->>'sku', ''),
  nullif(coalesce(item.value->>'name', item.value->>'title'), ''),
  nullif(coalesce(item.value->>'vendorId', item.value->>'vendor_id', item.value->>'vendor', kv.value->>'vendorId', kv.value->>'vendor'), ''),
  nullif(coalesce(item.value->>'vendorName', item.value->>'vendor', kv.value->>'vendorName', kv.value->>'vendor'), ''),
  coalesce(public.app_read_model_int(item.value->>'quantity'), 1),
  public.app_read_model_num(coalesce(item.value->>'price', item.value->>'unitPrice')),
  coalesce(
    public.app_read_model_num(coalesce(item.value->>'total', item.value->>'lineTotal')),
    public.app_read_model_num(coalesce(item.value->>'price', item.value->>'unitPrice')) * coalesce(public.app_read_model_int(item.value->>'quantity'), 1)
  ),
  item.value,
  now()
FROM public.kv_store_16010b6f kv
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(kv.value->'items') = 'array' THEN kv.value->'items'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS item(value, ordinality)
WHERE kv.key LIKE 'order:%'
  AND jsonb_typeof(kv.value) = 'object'
  AND coalesce(nullif(kv.value->>'id', ''), substring(kv.key from length('order:') + 1)) IN (
    SELECT id FROM public.app_orders
  )
  AND kv.key = (
    SELECT source_kv_key
    FROM public.app_orders ao
    WHERE ao.id = coalesce(nullif(kv.value->>'id', ''), substring(kv.key from length('order:') + 1))
  )
ON CONFLICT (order_id, line_index) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  sku = EXCLUDED.sku,
  name = EXCLUDED.name,
  vendor_id = EXCLUDED.vendor_id,
  vendor_name = EXCLUDED.vendor_name,
  quantity = EXCLUDED.quantity,
  unit_price = EXCLUDED.unit_price,
  line_total = EXCLUDED.line_total,
  raw = EXCLUDED.raw,
  synced_at = now();

-- Notifications
INSERT INTO public.app_notifications (
  id,
  source_kv_key,
  user_id,
  vendor_id,
  kind,
  title,
  body,
  is_read,
  raw,
  source_created_at,
  source_updated_at,
  synced_at
)
SELECT
  DISTINCT ON (coalesce(nullif(value->>'id', ''), substring(key from length('notification:') + 1)))
  coalesce(nullif(value->>'id', ''), substring(key from length('notification:') + 1)) AS id,
  key,
  nullif(coalesce(value->>'userId', value->>'uid'), ''),
  nullif(value->>'vendorId', ''),
  nullif(coalesce(value->>'kind', value->>'type'), ''),
  nullif(value->>'title', ''),
  nullif(coalesce(value->>'body', value->>'message', value->>'description'), ''),
  coalesce(public.app_read_model_bool(coalesce(value->>'isRead', value->>'read')), false),
  value,
  public.app_read_model_timestamptz(coalesce(value->>'createdAt', value->>'timestamp')),
  public.app_read_model_timestamptz(value->>'updatedAt'),
  now()
FROM public.kv_store_16010b6f
WHERE key LIKE 'notification:%'
  AND jsonb_typeof(value) = 'object'
  AND coalesce(nullif(value->>'id', ''), substring(key from length('notification:') + 1)) <> ''
ORDER BY coalesce(nullif(value->>'id', ''), substring(key from length('notification:') + 1)), key
ON CONFLICT (id) DO UPDATE SET
  source_kv_key = EXCLUDED.source_kv_key,
  user_id = EXCLUDED.user_id,
  vendor_id = EXCLUDED.vendor_id,
  kind = EXCLUDED.kind,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  is_read = EXCLUDED.is_read,
  raw = EXCLUDED.raw,
  source_created_at = EXCLUDED.source_created_at,
  source_updated_at = EXCLUDED.source_updated_at,
  synced_at = now();
