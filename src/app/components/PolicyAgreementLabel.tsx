import { Link } from "react-router";
import { Label } from "./ui/label";
import { useLanguage } from "../contexts/LanguageContext";
import { useStorefrontPolicyPaths } from "../hooks/useStorefrontPolicyPaths";

type PolicyAgreementLabelProps = {
  htmlFor: string;
  className?: string;
  /** Route slug when the form is rendered under `/vendor/:storeName/...` on localhost/apex. */
  storeSlug?: string | null;
};

export function PolicyAgreementLabel({
  htmlFor,
  className,
  storeSlug,
}: PolicyAgreementLabelProps) {
  const { t } = useLanguage();
  const { termsPath, privacyPath } = useStorefrontPolicyPaths(storeSlug);
  const linkClass =
    "font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2";

  return (
    <Label htmlFor={htmlFor} className={className}>
      {t("auth.login.agreePrefix")}{" "}
      <Link
        to={termsPath}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {t("auth.login.termsLink")}
      </Link>{" "}
      {t("auth.login.agreeAnd")}{" "}
      <Link
        to={privacyPath}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {t("auth.login.privacyLink")}
      </Link>
    </Label>
  );
}
