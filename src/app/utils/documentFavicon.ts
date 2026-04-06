/** Default tab icon from `index.html` — replaced when store/vendor logo loads. */
const DEFAULT_FAVICON_PATH = "/favicon.svg";

/**
 * Sets the document favicon to an image URL (http(s), data URL, or site-relative path).
 */
export function applyDocumentFavicon(href: string | null | undefined): void {
  const trimmed = typeof href === "string" ? href.trim() : "";
  const path = trimmed || DEFAULT_FAVICON_PATH;
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  const resolved =
    path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")
      ? path
      : new URL(path, window.location.origin).href;
  link.href = resolved;
  const lower = path.toLowerCase();
  if (lower.includes(".png")) link.type = "image/png";
  else if (lower.includes(".svg")) link.type = "image/svg+xml";
  else if (lower.includes(".jpg") || lower.includes(".jpeg")) link.type = "image/jpeg";
  else if (lower.includes(".webp")) link.type = "image/webp";
  else link.removeAttribute("type");
}

export function resetDocumentFavicon(): void {
  applyDocumentFavicon(DEFAULT_FAVICON_PATH);
}
