import {
  extractOrderShippingFields,
  hasStructuredShippingFields,
  type OrderShippingFields,
} from "../utils/orderShippingAddress";

type OrderShippingAddressBlockProps = {
  order: Record<string, unknown> | OrderShippingFields;
  className?: string;
  emptyText?: string;
};

export function OrderShippingAddressBlock({
  order,
  className = "",
  emptyText = "No address provided",
}: OrderShippingAddressBlockProps) {
  const fields =
    "address" in order && !("shippingInfo" in order)
      ? (order as OrderShippingFields)
      : extractOrderShippingFields(order as Record<string, unknown>);

  const structured = hasStructuredShippingFields(fields);
  const fallback = fields.shippingAddress?.trim() || "";

  if (!structured && !fallback) {
    return <p className={`text-sm text-slate-500 ${className}`.trim()}>{emptyText}</p>;
  }

  if (!structured && fallback) {
    return <p className={`font-medium text-slate-900 ${className}`.trim()}>{fallback}</p>;
  }

  return (
    <div className={`space-y-0.5 ${className}`.trim()}>
      {fields.address ? (
        <p className="font-medium text-slate-900">{fields.address}</p>
      ) : null}
      {fields.city || fields.state || fields.zipCode ? (
        <p className="text-slate-700">
          {[fields.city, fields.state, fields.zipCode].filter(Boolean).join(", ")}
        </p>
      ) : null}
      {fields.country ? <p className="text-sm text-slate-500">{fields.country}</p> : null}
    </div>
  );
}
