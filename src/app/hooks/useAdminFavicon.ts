import { usePlatformBranding } from "./usePlatformBranding";

/** @deprecated Use `usePlatformBranding` — kept for existing imports. */
export function useAdminFavicon(): void {
  usePlatformBranding({ applyFavicon: true });
}
