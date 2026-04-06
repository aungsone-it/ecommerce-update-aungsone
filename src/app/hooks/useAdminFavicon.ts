import { useEffect } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { applyDocumentFavicon, resetDocumentFavicon } from "../utils/documentFavicon";

/**
 * Super-admin shell: tab icon = store logo from General settings (`/settings/general` + `logoUpdated`).
 */
export function useAdminFavicon(): void {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
          {
            headers: { Authorization: `Bearer ${publicAnonKey}` },
            signal: controller.signal,
          }
        );
        clearTimeout(t);
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        const logo = data?.storeLogo;
        if (typeof logo === "string" && logo.trim()) {
          applyDocumentFavicon(logo);
        }
      } catch {
        /* keep default favicon */
      }
    };

    void load();

    const onLogo = (e: Event) => {
      const d = (e as CustomEvent<{ logoUrl?: string }>).detail;
      if (typeof d?.logoUrl === "string" && d.logoUrl.trim()) {
        applyDocumentFavicon(d.logoUrl);
      }
    };

    window.addEventListener("logoUpdated", onLogo);
    return () => {
      cancelled = true;
      window.removeEventListener("logoUpdated", onLogo);
      resetDocumentFavicon();
    };
  }, []);
}
