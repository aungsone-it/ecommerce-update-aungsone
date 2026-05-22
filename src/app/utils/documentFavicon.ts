/** Default tab icon from `index.html` — restored when leaving vendor storefront. */
const DEFAULT_FAVICON_PATH = "/favicon.svg";

/** Remove competing favicon links so browsers don’t keep serving `/favicon.svg`. */
function stripPageFaviconLinks(): void {
  document.querySelectorAll("link").forEach((node) => {
    const el = node as HTMLLinkElement;
    const rel = (el.getAttribute("rel") || "").toLowerCase();
    if (!rel) return;
    if (rel.includes("apple-touch")) return;
    if (rel.includes("mask-icon")) return;
    if (rel.includes("icon")) el.remove();
  });
}

function installSingleFavicon(href: string, mime: string): void {
  stripPageFaviconLinks();
  const link = document.createElement("link");
  link.rel = "icon";
  if (mime) link.type = mime;
  if (mime.includes("svg")) link.setAttribute("sizes", "any");
  else link.setAttribute("sizes", "32x32");
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Sets the document favicon to an image URL (http(s), data URL, or site-relative path).
 */
export function applyDocumentFavicon(href: string | null | undefined): void {
  const trimmed = typeof href === "string" ? href.trim() : "";
  const path = trimmed || DEFAULT_FAVICON_PATH;
  const resolved =
    path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")
      ? path
      : new URL(path, window.location.origin).href;

  let mime: string | undefined;
  if (path.startsWith("data:image/png")) mime = "image/png";
  else if (path.startsWith("data:image/svg+xml")) mime = "image/svg+xml";
  else if (path.startsWith("data:image/jpeg")) mime = "image/jpeg";
  else if (path.startsWith("data:image/webp")) mime = "image/webp";
  else {
    const lower = path.toLowerCase();
    if (lower.includes(".png")) mime = "image/png";
    else if (lower.includes(".svg")) mime = "image/svg+xml";
    else if (lower.includes(".jpg") || lower.includes(".jpeg")) mime = "image/jpeg";
    else if (lower.includes(".webp")) mime = "image/webp";
  }

  installSingleFavicon(resolved, mime ?? "");
}

function rasterizeImageToPngDataUrl(img: HTMLImageElement, size = 32): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("bad dims");
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no ctx");
  ctx.clearRect(0, 0, size, size);
  const scale = Math.min(size / w, size / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
}

function loadImageFromSrc(src: string, crossOrigin: "" | "anonymous"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img"));
    img.src = src;
  });
}

/**
 * Vendor storefront: force a PNG tab icon from the same logo URL used in the header.
 * Order: CORS fetch → decode → PNG (works when storage sends ACAO); then canvas fallbacks; then raw URL + strip competing icons.
 */
export async function applyVendorStoreLogoFavicon(
  logoUrl: string,
  options?: { onRasterized?: (dataUrl: string) => void }
): Promise<string | null> {
  const trimmed = typeof logoUrl === "string" ? logoUrl.trim() : "";
  if (!trimmed || typeof document === "undefined") return null;

  const applyRaw = () => {
    let mime = "image/png";
    const lower = trimmed.toLowerCase();
    if (lower.includes(".svg")) mime = "image/svg+xml";
    else if (lower.includes(".jpg") || lower.includes(".jpeg")) mime = "image/jpeg";
    else if (lower.includes(".webp")) mime = "image/webp";
    installSingleFavicon(trimmed, mime);
    return trimmed;
  };

  const applyPngDataUrl = (dataUrl: string) => {
    installSingleFavicon(dataUrl, "image/png");
    options?.onRasterized?.(dataUrl);
    return dataUrl;
  };

  try {
    const res = await fetch(trimmed, { mode: "cors", credentials: "omit", cache: "force-cache" });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const obj = URL.createObjectURL(blob);
        try {
          const img = await loadImageFromSrc(obj, "");
          return applyPngDataUrl(rasterizeImageToPngDataUrl(img));
        } finally {
          URL.revokeObjectURL(obj);
        }
      }
    }
  } catch {
    /* fall through */
  }

  try {
    try {
      const img = await loadImageFromSrc(trimmed, "anonymous");
      return applyPngDataUrl(rasterizeImageToPngDataUrl(img));
    } catch {
      const img = await loadImageFromSrc(trimmed, "");
      return applyPngDataUrl(rasterizeImageToPngDataUrl(img));
    }
  } catch {
    return applyRaw();
  }
}

export function resetDocumentFavicon(): void {
  applyDocumentFavicon(DEFAULT_FAVICON_PATH);
}
