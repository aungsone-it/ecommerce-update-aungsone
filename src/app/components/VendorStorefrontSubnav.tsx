import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { isVendorUncategorizedSlug } from "../utils/vendorStoreCategory";
import { useLanguage } from "../contexts/LanguageContext";

export type VendorSubnavTab =
  | { id: "all" }
  | { id: "category"; categoryId: string; name: string }
  | { id: "uncategorized" };

const SUBNAV_TAB_GAP_PX = 10;
const SUBNAV_ROW_GAP_PX = 24;

function vendorSubnavTabClass(active: boolean): string {
  return `inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
    active
      ? "bg-white text-amber-800 shadow-sm ring-1 ring-slate-200/90"
      : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
  }`;
}

function slugifyCategoryName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isVendorCategoryTabActive(
  tab: "all" | "uncategorized" | { name: string },
  routeSlug: string
): boolean {
  const norm = routeSlug.trim().toLowerCase();
  if (tab === "all") return !norm;
  if (tab === "uncategorized") return isVendorUncategorizedSlug(norm);
  return slugifyCategoryName(tab.name) === norm;
}

export function vendorSubnavTabKey(tab: VendorSubnavTab): string {
  if (tab.id === "category") return `category:${tab.categoryId}`;
  return tab.id;
}

function vendorSubnavTabLabel(tab: VendorSubnavTab, t: (key: string) => string): string {
  if (tab.id === "all") return t("storefront.categories.all");
  if (tab.id === "uncategorized") return t("storefront.categories.uncategorized");
  return tab.name;
}

function isVendorSubnavTabActive(tab: VendorSubnavTab, routeSlug: string): boolean {
  if (tab.id === "all") return isVendorCategoryTabActive("all", routeSlug);
  if (tab.id === "uncategorized") return isVendorCategoryTabActive("uncategorized", routeSlug);
  return isVendorCategoryTabActive({ name: tab.name }, routeSlug);
}

function widthForTabCount(tabWidths: number[], count: number, gap: number, moreWidth: number, withMore: boolean): number {
  if (count <= 0) return 0;
  let total = tabWidths.slice(0, count).reduce((sum, width, index) => sum + width + (index > 0 ? gap : 0), 0);
  if (withMore && count < tabWidths.length) {
    total += gap + moreWidth;
  }
  return total;
}

function splitTabsForOverflow(
  tabWidths: number[],
  availableWidth: number,
  moreWidth: number,
  gap: number,
  activeIndex: number
): { visible: number[]; overflow: number[] } {
  const total = tabWidths.length;
  if (total === 0) return { visible: [], overflow: [] };

  if (widthForTabCount(tabWidths, total, gap, moreWidth, false) <= availableWidth) {
    return { visible: tabWidths.map((_, index) => index), overflow: [] };
  }

  let count = total;
  while (count > 1 && widthForTabCount(tabWidths, count, gap, moreWidth, true) > availableWidth) {
    count -= 1;
  }

  let visible = Array.from({ length: count }, (_, index) => index);
  let overflow = Array.from({ length: total - count }, (_, index) => count + index);

  if (activeIndex >= 0 && activeIndex >= count) {
    if (count <= 1) {
      visible = [activeIndex];
    } else {
      visible = [...visible.slice(0, count - 1), activeIndex].sort((a, b) => a - b);
    }
    const visibleSet = new Set(visible);
    overflow = tabWidths.map((_, index) => index).filter((index) => !visibleSet.has(index));
  }

  return { visible, overflow };
}

type VendorStorefrontSubnavProps = {
  tabs: VendorSubnavTab[];
  routeSlug: string;
  storePhone: string;
  telHref: string;
  viberHref: string;
  showPhone: boolean;
  onTabSelect: (tab: VendorSubnavTab) => void;
};

export function VendorStorefrontSubnav({
  tabs,
  routeSlug,
  storePhone,
  telHref,
  viberHref,
  showPhone,
  onTabSelect,
}: VendorStorefrontSubnavProps) {
  const { t } = useLanguage();
  const rowRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const moreMeasureRef = useRef<HTMLButtonElement>(null);
  const tabMeasureRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const allVisible = useMemo(
    () => ({ visible: tabs.map((_, index) => index), overflow: [] as number[] }),
    [tabs]
  );
  const [layout, setLayout] = useState(allVisible);

  const remeasure = useCallback(() => {
    if (!rowRef.current) return;

    const tabWidths = tabs.map((_, index) => tabMeasureRefs.current[index]?.offsetWidth ?? 0);
    if (tabWidths.every((width) => width <= 0)) return;

    const phoneWidth = showPhone ? phoneRef.current?.offsetWidth ?? 0 : 0;
    const availableWidth = rowRef.current.clientWidth - phoneWidth - (phoneWidth > 0 ? SUBNAV_ROW_GAP_PX : 0);
    const moreWidth = moreMeasureRef.current?.offsetWidth ?? 72;
    const activeIndex = tabs.findIndex((tab) => isVendorSubnavTabActive(tab, routeSlug));

    setLayout(splitTabsForOverflow(tabWidths, availableWidth, moreWidth, SUBNAV_TAB_GAP_PX, activeIndex));
  }, [tabs, routeSlug, showPhone]);

  useLayoutEffect(() => {
    setLayout(allVisible);
    let cancelled = false;
    const run = () => {
      if (!cancelled) remeasure();
    };
    run();
    const frame = requestAnimationFrame(run);
    const row = rowRef.current;
    if (!row) {
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(run);
    observer.observe(row);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [allVisible, remeasure]);

  const moreActive = layout.overflow.some((index) => isVendorSubnavTabActive(tabs[index], routeSlug));

  return (
    <div className="relative hidden md:block border-b border-slate-200 bg-slate-50/80">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div ref={rowRef} className="flex min-w-0 items-center gap-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5" role="tablist" aria-label="Product categories">
            {layout.visible.map((index) => {
              const tab = tabs[index];
              const active = isVendorSubnavTabActive(tab, routeSlug);
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  key={vendorSubnavTabKey(tab)}
                  onClick={() => onTabSelect(tab)}
                  className={vendorSubnavTabClass(active)}
                >
                  {vendorSubnavTabLabel(tab, t)}
                </button>
              );
            })}
            {layout.overflow.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`${vendorSubnavTabClass(moreActive)} gap-1.5`}
                    aria-haspopup="menu"
                  >
                    {t("storefront.categories.more")}
                    <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className="max-h-80 min-w-[15rem] w-64 overflow-y-auto p-2 [&>[role=menuitem]:not(:first-child)]:mt-0.5"
                >
                  {layout.overflow.map((index) => {
                    const tab = tabs[index];
                    const active = isVendorSubnavTabActive(tab, routeSlug);
                    return (
                      <DropdownMenuItem
                        key={vendorSubnavTabKey(tab)}
                        onClick={() => onTabSelect(tab)}
                        className={`rounded-md px-3 py-2.5 ${
                          active ? "font-semibold text-amber-800 focus:text-amber-800" : undefined
                        }`}
                      >
                        {vendorSubnavTabLabel(tab, t)}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {showPhone ? (
            <div
              ref={phoneRef}
              className="group/contact relative flex shrink-0 items-center self-stretch border-l border-slate-200 pl-5 ml-1"
            >
              <button
                type="button"
                title={storePhone}
                aria-haspopup="menu"
                className="flex items-center gap-2.5 py-1 text-slate-700 transition-colors hover:text-orange-600 whitespace-nowrap"
              >
                <Phone className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">{storePhone}</span>
              </button>
              <div
                role="menu"
                className="invisible absolute right-0 top-full z-50 mt-2 w-56 translate-y-1 rounded-xl border border-slate-200 bg-white p-2 text-sm opacity-0 shadow-xl transition-all duration-150 group-hover/contact:visible group-hover/contact:translate-y-0 group-hover/contact:opacity-100 group-focus-within/contact:visible group-focus-within/contact:translate-y-0 group-focus-within/contact:opacity-100"
              >
                <p className="px-3 pb-2 pt-1 text-xs font-medium text-slate-500">
                  {t("storefront.contact.chooseDestination")}
                </p>
                <a
                  role="menuitem"
                  href={telHref}
                  className="block rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 hover:text-orange-600"
                >
                  {t("storefront.contact.dial")}
                </a>
                <a
                  role="menuitem"
                  href={viberHref}
                  className="block rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                >
                  {t("storefront.contact.viber")}
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute left-[-9999px] top-0 flex items-center gap-2.5 opacity-0"
      >
        {tabs.map((tab, index) => (
          <button
            key={vendorSubnavTabKey(tab)}
            ref={(element) => {
              tabMeasureRefs.current[index] = element;
            }}
            type="button"
            tabIndex={-1}
            className={vendorSubnavTabClass(false)}
          >
            {vendorSubnavTabLabel(tab, t)}
          </button>
        ))}
        <button ref={moreMeasureRef} type="button" tabIndex={-1} className={`${vendorSubnavTabClass(false)} gap-1.5`}>
          {t("storefront.categories.more")}
          <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
        </button>
      </div>
    </div>
  );
}
