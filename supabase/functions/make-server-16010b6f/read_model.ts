import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type AnyRecord = Record<string, unknown>;

const readModelClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  },
);

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerValue(value: unknown): number | null {
  const n = numberValue(value);
  return n == null ? null : Math.trunc(n);
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function isoTimestamp(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = text(item);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function orderLineItems(order: AnyRecord): AnyRecord[] {
  return Array.isArray(order.items) ? order.items.map(asRecord) : [];
}

function orderItemProductId(item: AnyRecord): string | null {
  return (
    text(item.productId) ||
    text(item.product_id) ||
    text(item.id)
  );
}

function orderItemVendorId(item: AnyRecord, order: AnyRecord): string | null {
  return (
    text(item.vendorId) ||
    text(item.vendor_id) ||
    text(item.vendor) ||
    text(order.vendorId) ||
    text(order.vendor)
  );
}

function collectProductSkuRows(productId: string, product: AnyRecord): AnyRecord[] {
  const rows: AnyRecord[] = [];
  const seen = new Set<string>();
  const add = (skuValue: unknown, variantId?: unknown, raw?: unknown) => {
    const sku = text(skuValue);
    if (!sku) return;
    const norm = sku.toLowerCase();
    if (seen.has(norm)) return;
    seen.add(norm);
    rows.push({
      sku,
      product_id: productId,
      variant_id: text(variantId),
      raw: asRecord(raw),
      synced_at: new Date().toISOString(),
    });
  };

  add(product.sku, null, { source: "product" });
  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      const v = asRecord(variant);
      add(v.sku, v.id ?? v.variantId, v);
    }
  }
  return rows;
}

async function bestEffort(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn(`[read-model] ${label} failed:`, error);
  }
}

export async function syncVendorReadModel(vendorId: string, vendorValue: unknown): Promise<void> {
  const vendor = asRecord(vendorValue);
  const id = text(vendor.id) || text(vendorId);
  if (!id) return;

  await bestEffort(`sync vendor ${id}`, async () => {
    const row = {
      id,
      source_kv_key: `vendor:${id}`,
      business_name: text(vendor.businessName) || text(vendor.storeName),
      display_name: text(vendor.name) || text(vendor.contactName) || text(vendor.businessName),
      email: text(vendor.email),
      phone: text(vendor.phone),
      status: text(vendor.status),
      store_slug: text(vendor.storeSlug),
      custom_domain: text(vendor.customDomain),
      commission_percent: numberValue(vendor.commission ?? vendor.commissionPercent ?? vendor.commissionRate),
      raw: vendor,
      source_created_at: isoTimestamp(vendor.createdAt ?? vendor.createDate),
      source_updated_at: isoTimestamp(vendor.updatedAt),
      synced_at: new Date().toISOString(),
    };

    const { error } = await readModelClient
      .from("app_vendors")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;
  });
}

export async function deleteVendorReadModel(vendorId: string): Promise<void> {
  const id = text(vendorId);
  if (!id) return;
  await bestEffort(`delete vendor ${id}`, async () => {
    const { error } = await readModelClient.from("app_vendors").delete().eq("id", id);
    if (error) throw error;
  });
}

/** Fast indexed lookup for vendor email availability checks (avoids scanning all vendor:* KV rows). */
export async function findVendorReadModelByEmailNorm(
  emailNorm: string,
): Promise<{ id: string; email: string | null } | null> {
  const normalized = text(emailNorm)?.toLowerCase();
  if (!normalized) return null;
  try {
    const { data, error } = await readModelClient
      .from("app_vendors")
      .select("id, email")
      .ilike("email", normalized)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[read-model] findVendorReadModelByEmailNorm:", error.message);
      return null;
    }
    return data as { id: string; email: string | null } | null;
  } catch (error) {
    console.warn("[read-model] findVendorReadModelByEmailNorm:", error);
    return null;
  }
}

export async function syncCustomerReadModel(customerId: string, customerValue: unknown): Promise<void> {
  const customer = asRecord(customerValue);
  const id = text(customer.id) || text(customerId);
  if (!id) return;

  await bestEffort(`sync customer ${id}`, async () => {
    const totalSpent = numberValue(customer.totalSpent ?? customer.lifetimeValue) ?? 0;
    const orderCount = integerValue(customer.totalOrders ?? customer.orderCount) ?? 0;
    const row = {
      id,
      source_kv_key: `customer:${id}`,
      user_id: text(customer.userId),
      name: text(customer.name) || text(customer.fullName),
      email: text(customer.email),
      phone: text(customer.phone),
      status: text(customer.status),
      tier: text(customer.tier),
      total_spent: totalSpent,
      order_count: orderCount,
      raw: customer,
      source_created_at: isoTimestamp(customer.createdAt ?? customer.joinDate),
      source_updated_at: isoTimestamp(customer.updatedAt),
      synced_at: new Date().toISOString(),
    };

    const { error } = await readModelClient
      .from("app_customers")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;
  });
}

export async function deleteCustomerReadModel(customerId: string): Promise<void> {
  const id = text(customerId);
  if (!id) return;
  await bestEffort(`delete customer ${id}`, async () => {
    const { error } = await readModelClient.from("app_customers").delete().eq("id", id);
    if (error) throw error;
  });
}

export async function syncProductReadModel(productId: string, productValue: unknown): Promise<void> {
  const product = asRecord(productValue);
  const id = text(product.id) || text(productId);
  if (!id) return;

  await bestEffort(`sync product ${id}`, async () => {
    const row = {
      id,
      source_kv_key: `product:${id}`,
      name: text(product.name) || text(product.title),
      sku: text(product.sku),
      vendor_id: text(product.vendorId),
      vendor_name: text(product.vendor),
      selected_vendor_ids: textArray(product.selectedVendors),
      category: text(product.category),
      status: text(product.status),
      price: numberValue(product.price),
      compare_at_price: numberValue(product.compareAtPrice),
      inventory: integerValue(product.inventory ?? product.stock),
      track_quantity: booleanValue(product.trackQuantity),
      continue_selling_out_of_stock: booleanValue(product.continueSellingOutOfStock),
      has_variants: Boolean(product.hasVariants),
      sales_volume: numberValue(product.salesVolume) ?? 0,
      raw: product,
      source_created_at: isoTimestamp(product.createdAt ?? product.createDate),
      source_updated_at: isoTimestamp(product.updatedAt),
      synced_at: new Date().toISOString(),
    };

    const { error: upsertError } = await readModelClient
      .from("app_products")
      .upsert(row, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const { error: deleteSkuError } = await readModelClient
      .from("app_product_skus")
      .delete()
      .eq("product_id", id);
    if (deleteSkuError) throw deleteSkuError;

    const skuRows = collectProductSkuRows(id, product);
    if (skuRows.length > 0) {
      const { error: skuError } = await readModelClient
        .from("app_product_skus")
        .insert(skuRows);
      if (skuError) throw skuError;
    }
  });
}

export async function findProductIdFromReadModelSkuOrVariant(args: {
  sku?: unknown;
  variantId?: unknown;
}): Promise<string | null> {
  const variantId = text(args.variantId);
  const sku = text(args.sku);

  const pickProductId = (rows: unknown): string | null => {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const id = text(asRecord(row).product_id);
      if (id) return id;
    }
    return null;
  };

  try {
    if (variantId) {
      const { data, error } = await readModelClient
        .from("app_product_skus")
        .select("product_id")
        .eq("variant_id", variantId)
        .limit(1);
      if (!error) {
        const id = pickProductId(data);
        if (id) return id;
      }
    }

    if (sku) {
      const { data, error } = await readModelClient
        .from("app_product_skus")
        .select("product_id")
        .ilike("sku", sku)
        .limit(1);
      if (!error) return pickProductId(data);
    }
  } catch {
    return null;
  }

  return null;
}

export async function deleteProductReadModel(productId: string): Promise<void> {
  const id = text(productId);
  if (!id) return;
  await bestEffort(`delete product ${id}`, async () => {
    const { error } = await readModelClient.from("app_products").delete().eq("id", id);
    if (error) throw error;
  });
}

export async function syncOrderReadModel(orderId: string, orderValue: unknown): Promise<void> {
  const order = asRecord(orderValue);
  const id = text(order.id) || text(orderId);
  if (!id) return;

  await bestEffort(`sync order ${id}`, async () => {
    const orderRow = {
      id,
      source_kv_key: `order:${id}`,
      order_number: text(order.orderNumber),
      customer_id: text(order.customerId) || text(order.userId),
      customer_name: text(order.customerName) || text(order.customer),
      email: text(order.email),
      phone: text(order.phone),
      vendor_id: text(order.vendorId),
      vendor_name: text(order.vendorName) || text(order.vendor),
      status: text(order.status),
      payment_status: text(order.paymentStatus),
      shipping_status: text(order.shippingStatus),
      payment_method: text(order.paymentMethod),
      subtotal: numberValue(order.subtotal),
      discount: numberValue(order.discount),
      shipping_fee: numberValue(order.shippingFee ?? order.shipping),
      total: numberValue(order.total ?? order.amount),
      currency: text(order.currency),
      inventory_deducted: booleanValue(order.inventoryDeducted),
      raw: order,
      source_created_at: isoTimestamp(order.createdAt ?? order.date),
      source_updated_at: isoTimestamp(order.updatedAt),
      synced_at: new Date().toISOString(),
    };

    const { error: upsertError } = await readModelClient
      .from("app_orders")
      .upsert(orderRow, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const { error: deleteItemsError } = await readModelClient
      .from("app_order_items")
      .delete()
      .eq("order_id", id);
    if (deleteItemsError) throw deleteItemsError;

    const items = orderLineItems(order);
    if (items.length > 0) {
      const itemRows = items.map((item, index) => {
        const quantity = integerValue(item.quantity) ?? 1;
        const unitPrice = numberValue(item.price ?? item.unitPrice);
        return {
          order_id: id,
          line_index: index,
          product_id: orderItemProductId(item),
          sku: text(item.sku),
          name: text(item.name) || text(item.title),
          vendor_id: orderItemVendorId(item, order),
          vendor_name: text(item.vendorName) || text(item.vendor) || text(order.vendorName) || text(order.vendor),
          quantity,
          unit_price: unitPrice,
          line_total: numberValue(item.total ?? item.lineTotal) ?? (unitPrice == null ? null : unitPrice * quantity),
          raw: item,
          synced_at: new Date().toISOString(),
        };
      });
      const { error: itemsError } = await readModelClient
        .from("app_order_items")
        .insert(itemRows);
      if (itemsError) throw itemsError;
    }
  });
}

export async function deleteOrderReadModel(orderId: string): Promise<void> {
  const id = text(orderId);
  if (!id) return;
  await bestEffort(`delete order ${id}`, async () => {
    const { error } = await readModelClient.from("app_orders").delete().eq("id", id);
    if (error) throw error;
  });
}

function enqueueReadModelWork(work: Promise<void>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(work);
    return;
  }
  void work;
}

export function queueProductReadModelSync(productId: string, productValue: unknown): void {
  enqueueReadModelWork(syncProductReadModel(productId, productValue));
}

export function queueVendorReadModelSync(vendorId: string, vendorValue: unknown): void {
  enqueueReadModelWork(syncVendorReadModel(vendorId, vendorValue));
}

export function queueVendorReadModelDelete(vendorId: string): void {
  enqueueReadModelWork(deleteVendorReadModel(vendorId));
}

export function queueCustomerReadModelSync(customerId: string, customerValue: unknown): void {
  enqueueReadModelWork(syncCustomerReadModel(customerId, customerValue));
}

export function queueCustomerReadModelDelete(customerId: string): void {
  enqueueReadModelWork(deleteCustomerReadModel(customerId));
}

export function queueProductReadModelDelete(productId: string): void {
  enqueueReadModelWork(deleteProductReadModel(productId));
}

export function queueOrderReadModelSync(orderId: string, orderValue: unknown): void {
  enqueueReadModelWork(syncOrderReadModel(orderId, orderValue));
}

export function queueOrderReadModelDelete(orderId: string): void {
  enqueueReadModelWork(deleteOrderReadModel(orderId));
}
