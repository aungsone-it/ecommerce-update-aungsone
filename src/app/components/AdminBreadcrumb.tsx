import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { useLanguage } from "../contexts/LanguageContext";

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
  };
  return map[label] ?? label;
}

function crumbsForPage(currentPage: string): Crumb[] {
  const PRODUCT_SUB = new Set(["Product", "Categories", "Inventory"]);

  if (currentPage === "Home") {
    return [{ labelKey: navKeyForLabel("Home"), fallback: "Home", page: null }];
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
}

export function AdminBreadcrumb({ currentPage, onNavigate }: AdminBreadcrumbProps) {
  const { t } = useLanguage();
  const segments = crumbsForPage(currentPage);

  return (
    <Breadcrumb className="text-sm">
      <BreadcrumbList className="flex-wrap gap-x-1.5 gap-y-1 sm:gap-2.5">
        {segments.map((crumb, i) => {
          const label = t(crumb.labelKey) || crumb.fallback;
          const isLast = i === segments.length - 1;

          return (
            <Fragment key={`${crumb.fallback}-${i}`}>
              <BreadcrumbItem className="inline-flex">
                {isLast ? (
                  <BreadcrumbPage className="font-medium text-slate-800 dark:text-slate-100">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      className="font-normal text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
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
                <BreadcrumbSeparator className="inline-flex [&>svg]:size-3.5 text-slate-400" />
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
