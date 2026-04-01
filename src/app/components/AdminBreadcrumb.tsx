import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { useLanguage } from "../contexts/LanguageContext";
import {
  Boxes,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Package,
  Percent,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  UserPlus,
  Video,
  Wallet,
} from "lucide-react";

/** Small section icon — same visual language as table pagination controls (rounded bordered chip). */
function breadcrumbThumbnailIcon(page: string): LucideIcon {
  const map: Record<string, LucideIcon> = {
    Home: LayoutGrid,
    Product: Package,
    Categories: Tag,
    Inventory: Boxes,
    Orders: ShoppingCart,
    Customers: Users,
    Chat: MessageCircle,
    "Promo Setting": Percent,
    "Live stream": Video,
    "Blog post": FileText,
    Vendor: Store,
    "Vendor profile": Store,
    "Vendor applications": ClipboardList,
    "Vendor promotions": Megaphone,
    "Vendor store view": Store,
    Collaborator: UserPlus,
    "Collaborator profile": UserPlus,
    "Collaborator applications": ClipboardList,
    Finances: Wallet,
    Logistics: Truck,
    Settings: Settings,
    Search: Search,
  };
  return map[page] ?? Home;
}

type Crumb = { labelKey: string; fallback: string; page: string | null };

/** Maps admin page labels (same strings as SideNav / ADMIN_PAGES) to translation keys */
function navKeyForLabel(label: string): string {
  const map: Record<string, string> = {
    Home: "nav.home",
    Product: "nav.product",
    Categories: "nav.categories",
    Inventory: "nav.inventory",
    Orders: "nav.orders",
    Vendor: "nav.vendor",
    "Promo Setting": "nav.promoSetting",
    Chat: "nav.chat",
    Customers: "nav.customers",
    Finances: "nav.finances",
    Settings: "nav.settings",
    "Live stream": "nav.liveStream",
    "Blog post": "nav.blogPost",
    Collaborator: "nav.collaborator",
    Logistics: "nav.logistics",
    "Vendor profile": "nav.vendor",
    "Vendor applications": "nav.vendor",
    "Vendor promotions": "nav.vendor",
    "Vendor store view": "nav.vendor",
    "Collaborator profile": "nav.collaborator",
    "Collaborator applications": "nav.collaborator",
    Search: "nav.search",
  };
  return map[label] ?? label;
}

function crumbsForPage(currentPage: string): Crumb[] {
  const PRODUCT_SUB = new Set(["Product", "Categories", "Inventory"]);

  if (currentPage === "Home") {
    return [{ labelKey: navKeyForLabel("Home"), fallback: "Home", page: null }];
  }

  if (currentPage === "Search") {
    return [
      { labelKey: navKeyForLabel("Home"), fallback: "Home", page: "Home" },
      { labelKey: navKeyForLabel("Search"), fallback: "Search", page: null },
    ];
  }

  if (PRODUCT_SUB.has(currentPage)) {
    if (currentPage === "Product") {
      return [
        { labelKey: navKeyForLabel("Home"), fallback: "Home", page: "Home" },
        { labelKey: navKeyForLabel("Product"), fallback: "Product", page: null },
      ];
    }
    return [
      { labelKey: navKeyForLabel("Home"), fallback: "Home", page: "Home" },
      { labelKey: navKeyForLabel("Product"), fallback: "Product", page: "Product" },
      {
        labelKey: navKeyForLabel(currentPage),
        fallback: currentPage,
        page: null,
      },
    ];
  }

  return [
    { labelKey: navKeyForLabel("Home"), fallback: "Home", page: "Home" },
    {
      labelKey: navKeyForLabel(currentPage),
      fallback: currentPage,
      page: null,
    },
  ];
}

interface AdminBreadcrumbProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  /** Total items for the current listing (e.g. products), shown as «n» after the last segment */
  listingCount?: number | null;
}

export function AdminBreadcrumb({
  currentPage,
  onNavigate,
  listingCount = null,
}: AdminBreadcrumbProps) {
  const { t } = useLanguage();
  const segments = crumbsForPage(currentPage);
  const ThumbIcon = breadcrumbThumbnailIcon(currentPage);

  return (
    <div
      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
      role="navigation"
      aria-label="Breadcrumb"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
        aria-hidden
      >
        <ThumbIcon className="h-4 w-4" strokeWidth={2} />
      </div>
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="text-xs flex-wrap gap-x-1 gap-y-0.5 sm:gap-1.5">
          {segments.map((crumb, i) => {
            const label = t(crumb.labelKey) || crumb.fallback;
            const isLast = i === segments.length - 1;

            return (
              <Fragment key={`${crumb.fallback}-${i}`}>
                <BreadcrumbItem className="inline-flex">
                  {isLast ? (
                    <BreadcrumbPage className="text-xs font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 flex-wrap">
                      <span>{label}</span>
                      {listingCount != null && listingCount >= 0 ? (
                        <span
                          className="tabular-nums text-[0.95em] font-normal text-slate-500 dark:text-slate-400"
                          aria-label={`${listingCount} items`}
                        >
                          «{listingCount}»
                        </span>
                      ) : null}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        className="text-xs font-normal text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        onClick={() => {
                          if (crumb.page) onNavigate(crumb.page);
                        }}
                      >
                        {label}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && (
                  <BreadcrumbSeparator className="inline-flex [&>svg]:size-3 text-slate-400" />
                )}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
