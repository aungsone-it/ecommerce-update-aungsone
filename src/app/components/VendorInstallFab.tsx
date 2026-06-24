import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { buildVendorStoreHomePath } from "../utils/vendorStorePaths";

type VendorInstallFabProps = {
  storeName: string;
  storeLogo?: string;
  pathSlug: string;
  hostRootStorePaths?: boolean;
  aboveStickyPurchaseBar?: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DEFAULT_ICON = "/favicon.svg";

function isAndroidChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /android/i.test(ua) && /chrome|chromium|crios/i.test(ua);
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isMobileOrTabletViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

export function VendorInstallFab({
  storeName,
  storeLogo,
  pathSlug,
  hostRootStorePaths = false,
  aboveStickyPurchaseBar = false,
}: VendorInstallFabProps) {
  const shortcutUrl = useMemo(() => {
    const path = buildVendorStoreHomePath({
      pathSlug,
      hostRootStorePaths,
    });
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }, [pathSlug, hostRootStorePaths]);

  const canShowAction = typeof window !== "undefined";
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(() => isMobileOrTabletViewport());
  const [installing, setInstalling] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [promptConsumed, setPromptConsumed] = useState(false);
  const [installed, setInstalled] = useState(() => isStandaloneMode());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const syncViewport = () => setIsMobileOrTablet(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileOrTablet) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const iconSrc =
      typeof storeLogo === "string" && storeLogo.trim().length > 0 ? storeLogo.trim() : DEFAULT_ICON;

    const manifest = {
      id: `${shortcutUrl}?source=a2hs`,
      name: storeName || "Store",
      short_name: (storeName || "Store").slice(0, 12),
      start_url: shortcutUrl,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      icons: [
        { src: iconSrc, sizes: "192x192", purpose: "any maskable" },
        { src: iconSrc, sizes: "512x512", purpose: "any maskable" },
      ],
    };

    const manifestBlobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
    );

    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestBlobUrl;

    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = "#ffffff";

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* ignore and fall back to manual steps */
      });
    }

    return () => {
      URL.revokeObjectURL(manifestBlobUrl);
    };
  }, [isMobileOrTablet, shortcutUrl, storeName, storeLogo]);

  useEffect(() => {
    if (!isMobileOrTablet) return;
    if (typeof window === "undefined") return;
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setPromptConsumed(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, [isMobileOrTablet]);

  useEffect(() => {
    if (!isMobileOrTablet) return;
    if (typeof window === "undefined") return;
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setPromptConsumed(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [isMobileOrTablet]);

  if (!canShowAction) return null;
  if (!isMobileOrTablet) return null;
  if (installed) return null;

  const handleClick = async () => {
    if (!deferredPrompt) {
      if (promptConsumed) {
        toast.message("Install prompt already used", {
          description: "Reload this page and tap Add to Home again, or use Chrome menu (⋮).",
        });
        return;
      }
      setInstructionsOpen(true);
      return;
    }

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setPromptConsumed(true);
      if (choice.outcome === "accepted") {
        toast.success(`${storeName} is being added to your home screen`);
        return;
      }
      toast.message("Install dismissed", {
        description: "Tap Add to Home again after reloading, or use Chrome menu (⋮).",
      });
    } catch {
      setInstructionsOpen(true);
    } finally {
      setInstalling(false);
    }
  };

  const copyShortcutUrl = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shortcutUrl);
        toast.success("Store link copied", {
          description: "Paste in Chrome and tap Add to Home screen.",
        });
        return;
      }
      toast.message("Store link", { description: shortcutUrl });
    } catch {
      toast.error("Could not copy link");
    }
  };

  const stickyClass = aboveStickyPurchaseBar ? "vendor-install-fab-anchor--above-sticky" : "";
  const androidChrome = isAndroidChrome();

  const fab = (
    <>
      <div className={`vendor-install-fab-anchor ${stickyClass}`}>
        <Button
          type="button"
          onClick={() => void handleClick()}
          disabled={installing}
          size="sm"
          aria-label={`Add ${storeName} to Home screen`}
          title={`Add ${storeName} to Home screen`}
          className="h-11 md:h-12 rounded-full shadow-2xl bg-white hover:bg-slate-50 border border-slate-200 transition-all duration-300 hover:scale-105 flex items-center gap-2 px-3 md:px-4"
        >
          <Download className="w-4 h-4 md:w-5 md:h-5 text-slate-700" />
          <span className="text-xs md:text-sm font-medium text-slate-700 whitespace-nowrap">
            Add to Home
          </span>
        </Button>
      </div>

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Home Screen</DialogTitle>
            <DialogDescription>
              Android does not allow silent shortcut creation. Follow these steps in Chrome.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
            <li>Keep this page open in Chrome.</li>
            <li>Tap Chrome menu (⋮).</li>
            <li>
              Choose <strong>{androidChrome ? "Add to Home screen or Install app" : "Add to Home screen"}</strong>.
            </li>
            <li>Confirm Add. The shortcut icon appears on your home screen.</li>
          </ol>
          <p className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs break-all text-slate-600">
            {shortcutUrl}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void copyShortcutUrl()}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Store URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const renderPortal = (node: ReactNode) => {
    if (typeof document === "undefined") return node;
    return createPortal(node, document.body);
  };

  return renderPortal(fab);
}
