import { useEffect } from "react";
import { getVendorSubdomainBase } from "../utils/vendorSubdomainBase";
import { getCanonicalSubdomainLabelIfSlugForm } from "../utils/subdomainSlugMap";

/** go-go.walwal.online → gogo.walwal.online when map has "gogo":"go-go" (client fallback if edge skips). */
export function CanonicalSubdomainRedirect() {
  useEffect(() => {
    const base = getVendorSubdomainBase();
    if (!base) return;
    const host = window.location.hostname.toLowerCase();
    if (!host.endsWith(`.${base}`)) return;
    const label = host.slice(0, -(base.length + 1));
    const canonical = getCanonicalSubdomainLabelIfSlugForm(label);
    if (!canonical || canonical === label) return;
    const url = new URL(window.location.href);
    url.hostname = `${canonical}.${base}`;
    window.location.replace(url.toString());
  }, []);
  return null;
}
