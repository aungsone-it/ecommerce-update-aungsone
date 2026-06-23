import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyVendorPwaHead,
  buildVendorPwaPaths,
  canShowManualInstallInstructions,
  clearVendorPwaHead,
  isStandalonePwaDisplay,
  promptPwaInstall,
  registerVendorServiceWorker,
  waitForDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
  type VendorPwaBranding,
} from "../utils/vendorPwaInstall";

type UseVendorPwaInstallParams = VendorPwaBranding & {
  pathSlug: string;
  hostRootStorePaths?: boolean;
  enabled?: boolean;
};

export function useVendorPwaInstall(params: UseVendorPwaInstallParams) {
  const { pathSlug, hostRootStorePaths, enabled = true, storeName, storeLogo, themeColor } =
    params;

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalonePwaDisplay());

  const paths = useMemo(
    () => buildVendorPwaPaths({ pathSlug, hostRootStorePaths }),
    [pathSlug, hostRootStorePaths],
  );

  useEffect(() => {
    if (!enabled || installed) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [enabled, installed]);

  useEffect(() => {
    if (!enabled || installed) {
      clearVendorPwaHead();
      return;
    }

    applyVendorPwaHead({ storeName, storeLogo, themeColor }, paths);
    void registerVendorServiceWorker();

    return () => {
      clearVendorPwaHead();
    };
  }, [enabled, installed, storeName, storeLogo, themeColor, paths]);

  const canPromptInstall = Boolean(deferredPrompt);
  const canShowInstructions = canShowManualInstallInstructions();
  const showInstallAction = enabled && !installed;

  const install = useCallback(async () => {
    let prompt = deferredPrompt;
    if (!prompt) {
      prompt = await waitForDeferredInstallPrompt(3000);
      if (prompt) setDeferredPrompt(prompt);
    }
    if (!prompt) return "unavailable" as const;

    const outcome = await promptPwaInstall(prompt);
    setDeferredPrompt(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome;
  }, [deferredPrompt]);

  return {
    installed,
    showInstallAction,
    canPromptInstall,
    canShowInstructions,
    install,
  };
}
