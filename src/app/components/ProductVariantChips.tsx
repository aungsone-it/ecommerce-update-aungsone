import { Button } from "./ui/button";

export type VariantProduct = {
  id: string;
  hasVariants?: boolean;
  variantOptions?: { name: string; values: string[] }[];
  variants?: {
    sku: string;
    option1?: string;
    option2?: string;
    option3?: string;
    price: string;
    inventory?: number;
  }[];
};

export type VariantRow = NonNullable<VariantProduct["variants"]>[number];

export function initVariantSelections(product: VariantProduct): Record<string, string> {
  const out: Record<string, string> = {};
  if (!product.hasVariants || !product.variantOptions?.length) return out;
  for (const opt of product.variantOptions) {
    if (opt.values && opt.values.length > 0) {
      out[opt.name] = opt.values[0];
    }
  }
  return out;
}

export function matchVariantForProduct(
  product: VariantProduct,
  selections: Record<string, string>
): VariantRow | null {
  if (!product.variants?.length || !product.variantOptions?.length) return null;
  const row = product.variants.find((v) =>
    product.variantOptions!.every((opt, idx) => {
      const want = selections[opt.name];
      const got = [v.option1, v.option2, v.option3][idx];
      return String(want ?? "") === String(got ?? "");
    })
  );
  return row ?? null;
}

/** When list/bootstrap rows omit variantOptions but variants exist (legacy slim rows). */
export function deriveVariantOptionsFromVariants(
  variants: NonNullable<VariantProduct["variants"]>
): { name: string; values: string[] }[] {
  const buckets: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  for (const v of variants) {
    if (v.option1 != null && String(v.option1).trim() !== "") buckets[0].add(String(v.option1));
    if (v.option2 != null && String(v.option2).trim() !== "") buckets[1].add(String(v.option2));
    if (v.option3 != null && String(v.option3).trim() !== "") buckets[2].add(String(v.option3));
  }
  const names = ["Color", "Style", "Size"];
  const out: { name: string; values: string[] }[] = [];
  for (let i = 0; i < 3; i++) {
    if (buckets[i].size > 0) {
      out.push({ name: names[i], values: [...buckets[i]] });
    }
  }
  return out;
}

/** Prefer API variantOptions; else derive from variant rows so PDP selectors can render. */
export function getEffectiveVariantOptions(product: VariantProduct): { name: string; values: string[] }[] {
  if (product.variantOptions && product.variantOptions.length > 0) {
    return product.variantOptions;
  }
  if (product.variants && product.variants.length > 0) {
    return deriveVariantOptionsFromVariants(product.variants);
  }
  return [];
}

export function productHasVariantPicker(product: VariantProduct): boolean {
  return Boolean(product.hasVariants && getEffectiveVariantOptions(product).length > 0 && product.variants?.length);
}

type ProductVariantChipsProps = {
  product: VariantProduct;
  selections: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  size?: "grid" | "list";
  className?: string;
};

export function ProductVariantChips({
  product,
  selections,
  onChange,
  size = "grid",
  className = "",
}: ProductVariantChipsProps) {
  if (!productHasVariantPicker(product)) return null;

  const isGrid = size === "grid";
  const btnClass = isGrid
    ? "min-h-7 h-7 px-2 text-[10px] md:text-xs py-0"
    : "min-h-8 h-8 px-2.5 text-xs py-0";

  return (
    <div
      className={`space-y-1.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      {product.variantOptions!.map((option) => (
        <div key={option.name} className="space-y-1">
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-600 font-medium leading-tight">
            <span>{option.name}</span>
            {selections[option.name] ? (
              <span className="font-normal text-slate-500">— {selections[option.name]}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {option.values.map((value) => {
              const active = selections[option.name] === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className={`${btnClass} font-medium ${
                    active
                      ? "bg-amber-600 hover:bg-amber-700 text-white border-transparent"
                      : "border-slate-300"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...selections, [option.name]: value });
                  }}
                >
                  {value}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
