import { Link } from "react-router";
import { useLanguage } from "../contexts/LanguageContext";
import { useStorefrontPolicyPaths } from "../hooks/useStorefrontPolicyPaths";
import { prefetchStorefrontPolicyData } from "../hooks/useStorefrontPolicyData";

type VendorStorefrontFooterProps = {
  storeName: string;
  storeSlug: string;
  /** Subdomain or custom domain — use `/terms`, not `/vendor/:slug/terms`. */
  hostRootStorePaths?: boolean;
};

export function VendorStorefrontFooter({
  storeName,
  storeSlug,
  hostRootStorePaths = false,
}: VendorStorefrontFooterProps) {
  const { t } = useLanguage();
  const { termsPath, privacyPath } = useStorefrontPolicyPaths(storeSlug, {
    onVendorHost: hostRootStorePaths,
  });

  return (
    <footer className="border-t mt-auto shrink-0 w-full bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 text-center space-y-2">
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} {storeName}. {t("storefront.footer.rights")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-1">
          <Link
            to={termsPath}
            className="font-medium text-slate-600 hover:text-amber-600 transition-colors underline-offset-2 hover:underline"
            onMouseEnter={() => void prefetchStorefrontPolicyData(storeSlug, "terms")}
            onFocus={() => void prefetchStorefrontPolicyData(storeSlug, "terms")}
          >
            {t("auth.login.termsLink")}
          </Link>
          <span className="text-slate-300 select-none" aria-hidden>
            •
          </span>
          <Link
            to={privacyPath}
            className="font-medium text-slate-600 hover:text-amber-600 transition-colors underline-offset-2 hover:underline"
            onMouseEnter={() => void prefetchStorefrontPolicyData(storeSlug, "privacy")}
            onFocus={() => void prefetchStorefrontPolicyData(storeSlug, "privacy")}
          >
            {t("auth.login.privacyLink")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
