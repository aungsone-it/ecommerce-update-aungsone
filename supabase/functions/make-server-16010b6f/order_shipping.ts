function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type NormalizedOrderShipping = {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  shippingAddress: string;
};

/** Persist structured shipping fields and a joined shippingAddress line on orders. */
export function normalizeOrderShippingFields(
  body: Record<string, unknown>
): NormalizedOrderShipping {
  const ship =
    body.shippingInfo && typeof body.shippingInfo === "object" && !Array.isArray(body.shippingInfo)
      ? (body.shippingInfo as Record<string, unknown>)
      : {};

  const address = text(body.address) || text(ship.address);
  const city = text(body.city) || text(ship.city);
  const state =
    text(body.state) || text(ship.state) || text(body.region) || text(ship.region);
  const zipCode =
    text(body.zipCode) || text(ship.zipCode) || text(body.postalCode) || text(ship.postalCode);
  const country = text(body.country) || text(ship.country);
  const parts = [address, city, state, zipCode, country].filter(Boolean);
  const shippingAddress = text(body.shippingAddress) || parts.join(", ");

  return { address, city, state, zipCode, country, shippingAddress };
}

export function applyNormalizedShippingToOrderBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const shipping = normalizeOrderShippingFields(body);
  return { ...body, ...shipping };
}
