import { useEffect } from "react";
import { Link } from "react-router";
import { ArrowLeft, FileText, Shield } from "lucide-react";
import { Button } from "../components/ui/button";
import { useLanguage } from "../contexts/LanguageContext";
import { useStorefrontPolicyData } from "../hooks/useStorefrontPolicyData";
import type { StorefrontPolicyKind } from "../utils/storefrontPolicyPaths";

export function StorefrontPolicyPage({ type }: { type: StorefrontPolicyKind }) {
  const { t } = useLanguage();
  const { storeName, storeEmail, storeAddress, content, backPath } =
    useStorefrontPolicyData(type);

  const title =
    type === "terms" ? t("storefrontPolicy.termsTitle") : t("storefrontPolicy.privacyTitle");
  const Icon = type === "terms" ? FileText : Shield;

  useEffect(() => {
    document.title = `${title} | ${storeName}`;
  }, [storeName, title]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to={backPath} className="text-xl font-bold uppercase tracking-wide text-slate-900">
            {storeName || "…"}
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to={backPath}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("storefrontPolicy.backToStore")}
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700">
              {storeName || "…"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">{title}</h1>
            {content ? (
              <p className="mt-3 text-sm text-slate-500">
                {t("storefrontPolicy.updatedFromSettings")}
              </p>
            ) : null}
          </div>
        </div>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {content ? (
            <div className="whitespace-pre-wrap text-base leading-8 text-slate-700">{content}</div>
          ) : null}
        </article>

        {(storeEmail || storeAddress) && (
          <section className="mt-6 rounded-2xl bg-slate-100 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{t("storefrontPolicy.contactTitle")}</p>
            {storeEmail && (
              <p className="mt-2">
                {t("storefrontPolicy.email")}: {storeEmail}
              </p>
            )}
            {storeAddress && (
              <p className="mt-1">
                {t("storefrontPolicy.address")}: {storeAddress}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
