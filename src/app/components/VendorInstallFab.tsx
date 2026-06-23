import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useVendorPwaInstall } from "../hooks/useVendorPwaInstall";

type VendorInstallFabProps = {
  storeName: string;
  storeLogo?: string;
  pathSlug: string;
  hostRootStorePaths?: boolean;
  aboveStickyPurchaseBar?: boolean;
};

export function VendorInstallFab({
  storeName,
  storeLogo,
  pathSlug,
  hostRootStorePaths = false,
  aboveStickyPurchaseBar = false,
}: VendorInstallFabProps) {
  const { showInstallAction, install } = useVendorPwaInstall({
    storeName,
    storeLogo,
    pathSlug,
    hostRootStorePaths,
  });
  const [installing, setInstalling] = useState(false);

  if (!showInstallAction) return null;

  const handleClick = async () => {
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === "accepted") {
        toast.success(`${storeName} added to your device`);
        return;
      }
      if (outcome === "dismissed") return;
      toast.message("Install from your browser", {
        description:
          "Use the install icon in the address bar, or open the browser menu (⋮) → Install app.",
      });
    } finally {
      setInstalling(false);
    }
  };

  const stickyClass = aboveStickyPurchaseBar ? "vendor-install-fab-anchor--above-sticky" : "";

  const fab = (
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
  );

  const renderPortal = (node: ReactNode) => {
    if (typeof document === "undefined") return node;
    return createPortal(node, document.body);
  };

  return renderPortal(fab);
}
