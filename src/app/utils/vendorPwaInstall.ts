import { buildVendorStoreHomePath } from "./vendorStorePaths";

export type VendorPwaBranding = {
  storeName: string;
  storeLogo?: string;
  themeColor?: string;
};

export type VendorPwaPaths = {
  startUrl: string;
  scope: string;
  manifestId: string;
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DEFAULT_ICON = "/favicon.svg";
const DEFAULT_THEME = "#ffffff";

let manifestObjectUrl: string | null = null;
let manifestLinkEl: HTMLLinkElement | null = null;
let appleTouchLinkEl: HTMLLinkElement | null = null;
let themeMetaEl: HTMLMetaElement | null = null;
let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function buildVendorPwaPaths(params: {
  pathSlug: string;
  hostRootStorePaths?: boolean;
}): VendorPwaPaths {
  const home = buildVendorStoreHomePath({
    pathSlug: params.pathSlug,
    hostRootStorePaths: params.hostRootStorePaths,
  });
  const scope = home === "/" ? "/" : home.endsWith("/") ? home : `${home}/`;
  const manifestId = scope === "/" ? "/?vendor-pwa=1" : `${scope}?vendor-pwa=1`;
  return { startUrl: scope, scope, manifestId };
}

export function truncatePwaShortName(name: string, max = 12): string {
  const trimmed = String(name || "").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

export function buildVendorWebManifest(
  branding: VendorPwaBranding,
  paths: VendorPwaPaths,
): Record<string, unknown> {
  const iconSrc =
    typeof branding.storeLogo === "string" && branding.storeLogo.trim()
      ? branding.storeLogo.trim()
      : DEFAULT_ICON;
  const iconType = iconSrc.toLowerCase().includes(".svg") ? "image/svg+xml" : "image/png";

  return {
    id: paths.manifestId,
    name: branding.storeName.trim() || "Store",
    short_name: truncatePwaShortName(branding.storeName.trim() || "Store"),
    description: `${branding.storeName.trim() || "Store"} — shop on your home screen`,
    start_url: paths.startUrl,
    scope: paths.scope,
    display: "standalone",
    orientation: "portrait-primary",
    background_color: DEFAULT_THEME,
    theme_color: branding.themeColor?.trim() || DEFAULT_THEME,
    icons: [
      { src: iconSrc, sizes: "192x192", type: iconType, purpose: "any" },
      { src: iconSrc, sizes: "512x512", type: iconType, purpose: "any maskable" },
    ],
  };
}

function upsertLink(rel: string, attrs: Record<string, string>): HTMLLinkElement {
  const selector = `link[rel="${rel}"]`;
  let link = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  for (const [key, value] of Object.entries(attrs)) {
    link.setAttribute(key, value);
  }
  return link;
}

function upsertMeta(name: string, content: string): HTMLMetaElement {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
  return meta;
}

export function applyVendorPwaHead(branding: VendorPwaBranding, paths: VendorPwaPaths): void {
  if (typeof document === "undefined") return;

  const manifest = buildVendorWebManifest(branding, paths);
  if (manifestObjectUrl) {
    URL.revokeObjectURL(manifestObjectUrl);
    manifestObjectUrl = null;
  }
  manifestObjectUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
  );

  manifestLinkEl = upsertLink("manifest", { href: manifestObjectUrl });
  upsertMeta("mobile-web-app-capable", "yes");
  upsertMeta("apple-mobile-web-app-capable", "yes");
  upsertMeta("apple-mobile-web-app-title", branding.storeName.trim() || "Store");
  themeMetaEl = upsertMeta("theme-color", branding.themeColor?.trim() || DEFAULT_THEME);

  const iconSrc =
    typeof branding.storeLogo === "string" && branding.storeLogo.trim()
      ? branding.storeLogo.trim()
      : DEFAULT_ICON;
  appleTouchLinkEl = upsertLink("apple-touch-icon", { href: iconSrc });
}

export function clearVendorPwaHead(): void {
  if (typeof document === "undefined") return;
  if (manifestObjectUrl) {
    URL.revokeObjectURL(manifestObjectUrl);
    manifestObjectUrl = null;
  }
  manifestLinkEl?.remove();
  manifestLinkEl = null;
  appleTouchLinkEl?.remove();
  appleTouchLinkEl = null;
  themeMetaEl?.remove();
  themeMetaEl = null;
}

export function registerVendorServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export function isStandalonePwaDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  return isIos && isSafari;
}

export function isDesktopSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /safari/i.test(ua) && !/chrome|chromium|crios|android|iphone|ipad|ipod/i.test(ua);
}

export function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /chrome|chromium|crios|edg\//i.test(ua) && !/fxios/i.test(ua);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent || "");
}

export function canShowManualInstallInstructions(): boolean {
  return isIosSafari() || isDesktopSafari() || isChromiumBrowser() || isAndroidDevice();
}

export async function promptPwaInstall(
  deferred: BeforeInstallPromptEvent,
): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred?.prompt) return "unavailable";
  await deferred.prompt();
  const choice = await deferred.userChoice;
  return choice.outcome;
}

export function waitForDeferredInstallPrompt(
  timeoutMs = 3000,
): Promise<BeforeInstallPromptEvent | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: BeforeInstallPromptEvent | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      resolve(value);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      finish(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}
