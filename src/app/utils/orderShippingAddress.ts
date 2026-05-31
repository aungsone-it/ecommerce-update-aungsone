export type OrderShippingFields = {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  shippingAddress?: string;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/** Normalize shipping fields from a stored order or API payload. */
export function extractOrderShippingFields(
  order: Record<string, unknown> | null | undefined
): OrderShippingFields {
  if (!order || typeof order !== "object") return {};

  const ship =
    order.shippingInfo && typeof order.shippingInfo === "object" && !Array.isArray(order.shippingInfo)
      ? (order.shippingInfo as Record<string, unknown>)
      : {};

  const customer =
    order.customer && typeof order.customer === "object" && !Array.isArray(order.customer)
      ? (order.customer as Record<string, unknown>)
      : {};

  const address = pickText(order.address, ship.address, customer.address);
  const city = pickText(order.city, ship.city, customer.city);
  const state = pickText(order.state, ship.state, customer.state, order.region, ship.region);
  const zipCode = pickText(order.zipCode, ship.zipCode, customer.zipCode, order.postalCode);
  const country = pickText(order.country, ship.country, customer.country);
  const shippingAddress = pickText(order.shippingAddress);

  return { address, city, state, zipCode, country, shippingAddress };
}

export function buildOrderShippingAddressLine(fields: OrderShippingFields): string {
  const structured = [fields.address, fields.city, fields.state, fields.zipCode, fields.country]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (structured.length >= 2) return structured.join(", ");
  if (fields.shippingAddress?.trim()) return fields.shippingAddress.trim();
  return structured.join(", ");
}

export function hasStructuredShippingFields(fields: OrderShippingFields): boolean {
  return !!(fields.address || fields.city || fields.state || fields.zipCode || fields.country);
}
