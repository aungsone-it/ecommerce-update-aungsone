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

export function productHasVariantPicker(product: VariantProduct): boolean {
  return Boolean(
    product.hasVariants &&
      product.variantOptions &&
      product.variantOptions.length > 0 &&
      product.variants &&
      product.variants.length > 0
  );
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
