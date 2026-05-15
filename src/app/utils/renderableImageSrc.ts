/**
 * True when `src` is suitable for `<img src={...}>` (http(s), data:image, or blob).
 * Rejects plain text (e.g. avatar initials), relative paths without scheme, and empty strings.
 */
export function isRenderableImageSrc(src: string | undefined | null): boolean {
  const t = String(src ?? "").trim();
  if (!t) return false;
  if (t.startsWith("data:image/")) return true;
  if (t.startsWith("blob:")) return true;
  if (/^https?:\/\//i.test(t)) return true;
  return false;
}

/** Prefer a renderable `primary` logo; otherwise use `fallback` if renderable; else empty. */
export function pickStoreLogo(
  primary: string | undefined | null,
  fallback: string | undefined | null
): string {
  if (isRenderableImageSrc(primary)) return String(primary).trim();
  if (isRenderableImageSrc(fallback)) return String(fallback).trim();
  return "";
}
