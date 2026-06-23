import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { buildVendorStoreHomePath } from "../utils/vendorStorePaths";

type VendorInstallFabProps = {
  storeName: string;
  pathSlug: string;
  hostRootStorePaths?: boolean;
  aboveStickyPurchaseBar?: boolean;
};

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

  const [sharing, setSharing] = useState(false);

  if (!canShowAction) return null;

  const handleClick = async () => {
    setSharing(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: storeName,
          text: `Open ${storeName}`,
          url: shortcutUrl,
        });
        toast.success("Share sheet opened", {
          description: "Tap Add to Home Screen in your browser/share options.",
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shortcutUrl);
        toast.success("Shortcut URL copied", {
          description: "Paste in browser, then use Add to Home Screen.",
        });
        return;
      }

      toast.message("Shortcut URL ready", {
        description: shortcutUrl,
      });
    } catch {
      toast.error("Could not open share options");
    } finally {
      setSharing(false);
    }
  };

  const stickyClass = aboveStickyPurchaseBar ? "vendor-install-fab-anchor--above-sticky" : "";

  const fab = (
    <div className={`vendor-install-fab-anchor ${stickyClass}`}>
      <Button
        type="button"
        onClick={() => void handleClick()}
        disabled={sharing}
        size="lg"
        aria-label={`Share ${storeName} shortcut`}
        title={`Share ${storeName}`}
        className="h-11 w-11 md:h-14 md:w-14 rounded-full shadow-2xl bg-white hover:bg-slate-50 border border-slate-200 transition-all duration-300 hover:scale-110 flex items-center justify-center p-0"
      >
        <Download className="w-5 h-5 md:w-6 md:h-6 text-slate-700" />
      </Button>
    </div>
  );

  const renderPortal = (node: ReactNode) => {
    if (typeof document === "undefined") return node;
    return createPortal(node, document.body);
  };

  return renderPortal(fab);
}
