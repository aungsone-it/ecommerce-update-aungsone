import { formatMMK } from "../../utils/formatNumber";

/**
 * Maps GET `/products/:id` (KV) payload into the shape `StorefrontProductDetail` and admin forms expect.
 */
export function normalizeProductForAdminDetailView(
  raw: Record<string, unknown>,
  vendorsLookup: Record<string, string>
): Record<string, unknown> {
  const images = Array.isArray(raw.images)
    ? (raw.images as unknown[]).filter((u) => typeof u === "string" && String(u).trim()) as string[]
    : [];

  const primary =
    images[0] ||
    (typeof raw.image === "string" && raw.image.trim() ? raw.image : null) ||
    (typeof raw.thumbnail === "string" && raw.thumbnail.trim() ? raw.thumbnail : null) ||
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=800&fit=crop";

  let priceStr = "";
  if (typeof raw.price === "number" && !Number.isNaN(raw.price)) {
    priceStr = formatMMK(raw.price);
  } else if (typeof raw.price === "string") {
    const p = raw.price.trim();
    if (p.includes("MMK") || p.startsWith("$")) {
      priceStr = p;
    } else {
      const n = parseFloat(p.replace(/,/g, ""));
      priceStr = formatMMK(Number.isNaN(n) ? 0 : n);
    }
  } else {
    priceStr = formatMMK(0);
  }

  let compareAtDisplay: string | undefined;
  const cap = raw.compareAtPrice;
  if (cap != null) {
    if (typeof cap === "number" && !Number.isNaN(cap)) {
      compareAtDisplay = formatMMK(cap);
    } else if (typeof cap === "string") {
      const p = cap.trim();
      if (p.includes("MMK") || p.startsWith("$")) {
        compareAtDisplay = p;
      } else {
        const n = parseFloat(p.replace(/,/g, ""));
        compareAtDisplay = formatMMK(Number.isNaN(n) ? 0 : n);
      }
    }
  }

  const statusRaw = String(raw.status ?? "");
  const status =
    statusRaw === "Published" || statusRaw === "active"
      ? "active"
      : statusRaw === "Off Shelf" || statusRaw === "off-shelf"
        ? "off-shelf"
        : "active";

  const vendorNames: string[] = [];
  const sel = raw.selectedVendors;
  if (Array.isArray(sel) && sel.length > 0) {
    for (const id of sel) {
      const key = String(id ?? "").trim();
      if (!key) continue;
      const label =
        vendorsLookup[key] ||
        vendorsLookup[key.toLowerCase()] ||
        key;
      vendorNames.push(label);
    }
  }
  const vendorStr = vendorNames.length > 0 ? vendorNames.join(", ") : String(raw.vendor || "—");

  const variantOptionsFromOptions =
    Array.isArray(raw.options) && (raw.options as { name?: string; values?: string[] }[]).length
      ? (raw.options as { name: string; values: string[] }[]).map((o) => ({
          name: o.name || "Option",
          values: Array.isArray(o.values) ? o.values : [],
        }))
      : [];

  const variantOptions =
    Array.isArray(raw.variantOptions) && (raw.variantOptions as unknown[]).length > 0
      ? raw.variantOptions
      : variantOptionsFromOptions;

  const hasVariants = !!raw.hasVariants && Array.isArray(variantOptions) && variantOptions.length > 0;

  return {
    ...raw,
    image: primary,
    images: images.length > 0 ? images : [primary],
    price: priceStr,
    compareAtPriceDisplay: compareAtDisplay,
    status,
    inventory: raw.inventory != null && !Number.isNaN(Number(raw.inventory)) ? Number(raw.inventory) : 0,
    salesVolume: Number(raw.salesVolume) || 0,
    vendor: vendorStr,
    collaborator: raw.collaborator != null && String(raw.collaborator).trim() ? String(raw.collaborator) : "—",
    variantOptions,
    hasVariants,
  };
}
