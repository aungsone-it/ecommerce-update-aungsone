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
  pathSlug: string;
  hostRootStorePaths?: boolean;
  aboveStickyPurchaseBar?: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isAndroidChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /android/i.test(ua) && /chrome|chromium|crios/i.test(ua);
}

export function VendorInstallFab({
  storeName,
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
  const [installing, setInstalling] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!canShowAction) return null;

  const handleClick = async () => {
    if (!deferredPrompt) {
      setInstructionsOpen(true);
      return;
    }

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        toast.success(`${storeName} is being added to your home screen`);
        return;
      }
      setInstructionsOpen(true);
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
          size="lg"
          aria-label={`Install ${storeName} shortcut`}
          title={`Install ${storeName}`}
          className="h-11 w-11 md:h-14 md:w-14 rounded-full shadow-2xl bg-white hover:bg-slate-50 border border-slate-200 transition-all duration-300 hover:scale-110 flex items-center justify-center p-0"
        >
          <Download className="w-5 h-5 md:w-6 md:h-6 text-slate-700" />
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
