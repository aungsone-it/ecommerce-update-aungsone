import { useState, useEffect, useRef } from "react";
import { 
  Save,
  Eye,
  Upload,
  Globe,
  Copy,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import { publicAnonKey } from "../../../../utils/supabase/info";
import { API_BASE_URL } from "../../../utils/api-client";
import { compressImage } from "../../../utils/imageCompression";
import { cacheManager } from "../../utils/cacheManager";
import { invalidateVendorStorefrontCatalogCache } from "../../utils/module-cache";
import { notifyStorefrontPolicyUpdated, subscribeStorefrontPolicyUpdates } from "../../utils/storefrontPolicyRealtime";
import { storeSlugFromBusinessName } from "../../../utils/storeSlug";
import {
  setVendorAuthSessionCookie,
  readVendorAuthSessionCookie,
} from "../../utils/vendorAuthCookie";
import { clearCachedVendorHostSlug } from "../../utils/vendorHostResolution";
import { isRenderableImageSrc, pickStoreLogo } from "../../utils/renderableImageSrc";
import { getVendorSubdomainBase } from "../../utils/vendorSubdomainBase";
import { buildVendorSubdomainHostname } from "../../utils/platformApexHost";
import { useLanguage } from "../../contexts/LanguageContext";
import { normalizeMetaPixelId } from "../../utils/metaPixel";
import {
  isEdgeOneDeployment,
  isEdgeOnePlatformValue,
  resolveCustomDomainCnameTarget,
} from "../../utils/deploymentPlatform";

interface StoreSettings {
  vendorId: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string;
  storeTagline: string;
  logo: string;
  banner: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  customDomain: string;
  termsContent?: string;
  privacyPolicyContent?: string;
  /** Meta (Facebook) Pixel ID — numeric, per-vendor ads tracking on the public storefront. */
  metaPixelId?: string;
  /** Meta Conversions API access token — server-side only, never exposed on public storefront APIs. */
  metaCapiAccessToken?: string;
  /** Read-only from API — whether a CAPI token is stored (value is never returned). */
  metaCapiAccessTokenConfigured?: boolean;
  domainStatus: 'none' | 'pending' | 'verified' | 'active';
  dnsVerified: boolean;
  isActive: boolean;
  /** Read-only: from GET when TXT verification is pending */
  domainVerification?: { txtName: string; txtValue: string; cnameTarget: string };
}

interface VendorAdminSettingsProps {
  vendorId: string;
  vendorName: string;
  vendorLogo?: string;
  onPreviewStore?: (vendorId: string, storeSlug: string) => void;
}

export function VendorAdminSettings({
  vendorId,
  vendorName,
  vendorLogo = "",
  onPreviewStore,
}: VendorAdminSettingsProps) {
  const { language, setLanguage, t } = useLanguage();
  const tr = (key: string, values: Record<string, string | number> = {}) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      t(key)
    );
  const settingsCacheKey = `vendor-admin-settings:${vendorId}`;
  const cachedSettings = cacheManager.get(settingsCacheKey) as StoreSettings | undefined;
  const emptyDefaults: StoreSettings = {
    vendorId,
    storeName: vendorName,
    storeSlug: storeSlugFromBusinessName(vendorName),
    storeDescription: "Welcome to our store",
    storeTagline: "",
    logo: "",
    banner: "",
    primaryColor: "#1e293b",
    secondaryColor: "#64748b",
    accentColor: "#3b82f6",
    contactEmail: "",
    contactPhone: "",
    address: "",
    customDomain: "",
    termsContent: "",
    privacyPolicyContent: "",
    domainStatus: "none",
    dnsVerified: false,
    isActive: true,
  };
  const [settings, setSettings] = useState<StoreSettings>(() => {
    const merged = cachedSettings
      ? { ...emptyDefaults, ...cachedSettings, vendorId }
      : emptyDefaults;
    return {
      ...merged,
      logo: pickStoreLogo(merged.logo, vendorLogo),
    };
  });
  const [loading, setLoading] = useState(!cachedSettings);
  const [saving, setSaving] = useState(false);
  const hasLoadedOnceRef = useRef(!!cachedSettings);
  /** Ignore self-triggered realtime/cache events right after a successful save. */
  const suppressRemoteReloadUntilRef = useRef(0);
  const loadSettingsRequestRef = useRef(0);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [domainBusy, setDomainBusy] = useState<"prepare" | "verify" | "remove" | null>(null);
  const [metaCapiTokenInput, setMetaCapiTokenInput] = useState("");
  const [metaCapiTokenConfigured, setMetaCapiTokenConfigured] = useState(false);
  const [metaCapiTokenEditing, setMetaCapiTokenEditing] = useState(false);
  const [clearMetaCapiToken, setClearMetaCapiToken] = useState(false);
  /** Placeholder value — password input renders it as bullets, not sent on save. */
  const META_CAPI_SAVED_MASK = "************************";
  const showSavedCapiTokenMask =
    metaCapiTokenConfigured &&
    !clearMetaCapiToken &&
    !metaCapiTokenInput &&
    !metaCapiTokenEditing;
  const [domainDraft, setDomainDraft] = useState("");
  const [domainHints, setDomainHints] = useState<{
    hostname: string;
    txtName: string;
    txtValue: string;
    cnameTarget: string;
    deploymentPlatform?: string;
  } | null>(null);
  const [backendDeploymentPlatform, setBackendDeploymentPlatform] = useState<string>("");
  const subdomainBase = getVendorSubdomainBase();
  const onEdgeOne =
    isEdgeOnePlatformValue(backendDeploymentPlatform) ||
    isEdgeOnePlatformValue(domainHints?.deploymentPlatform) ||
    isEdgeOneDeployment();
  const customDomainCnameTarget = resolveCustomDomainCnameTarget(
    domainHints?.cnameTarget,
    undefined,
    onEdgeOne
  );
  const vendorSubdomainHost =
    buildVendorSubdomainHostname(settings?.storeSlug || "", undefined) ||
    (subdomainBase ? `${settings?.storeSlug || "yourstore"}.${subdomainBase}` : null);

  useEffect(() => {
    loadSettings();
  }, [vendorId, vendorLogo]);

  const loadSettings = async (forceRefresh = false, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true || hasLoadedOnceRef.current;
    if (!silent && !cacheManager.get(settingsCacheKey)) {
      setLoading(true);
    }
    const requestId = ++loadSettingsRequestRef.current;
    try {
      if (forceRefresh) {
        cacheManager.clear(settingsCacheKey);
      }
      const data = await cacheManager.fetch(
        settingsCacheKey,
        async () => {
          const response = await fetch(
            `${API_BASE_URL}/vendor/storefront/${vendorId}`,
            {
              headers: {
                Authorization: `Bearer ${publicAnonKey}`,
              },
            }
          );
          if (!response.ok) {
            throw new Error("Failed to load storefront settings");
          }
          return response.json();
        },
        { ttl: 60_000, staleWhileRevalidate: true }
      );
      if (requestId !== loadSettingsRequestRef.current) return;
      if (data?.settings) {
        setBackendDeploymentPlatform(String(data.deploymentPlatform || ""));
        const rawLogo =
          typeof data.settings.logo === "string" ? data.settings.logo.trim() : "";
        const nextSettings = {
          ...data.settings,
          logo: pickStoreLogo(rawLogo, vendorLogo),
        };
        if (!String(nextSettings.storeSlug || "").trim()) {
          nextSettings.storeSlug = storeSlugFromBusinessName(
            String(nextSettings.storeName || vendorName || "store")
          );
        }
        setSettings(nextSettings);
        setMetaCapiTokenConfigured(Boolean(data.settings.metaCapiAccessTokenConfigured));
        setMetaCapiTokenInput("");
        setMetaCapiTokenEditing(false);
        setClearMetaCapiToken(false);
        cacheManager.set(settingsCacheKey, nextSettings);
        hasLoadedOnceRef.current = true;
        setDomainDraft(String(data.settings.customDomain || "").trim() || "");
        const dv = data.settings.domainVerification;
        if (dv?.txtName && dv?.txtValue) {
          setDomainHints({
            hostname: String(data.settings.customDomain || "").trim(),
            txtName: dv.txtName,
            txtValue: dv.txtValue,
            cnameTarget: String(dv.cnameTarget || ""),
            deploymentPlatform: String(dv.deploymentPlatform || data.deploymentPlatform || ""),
          });
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      if (requestId === loadSettingsRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const scheduleBackgroundReload = () => {
    if (Date.now() < suppressRemoteReloadUntilRef.current) return;
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      realtimeDebounceRef.current = null;
      if (Date.now() < suppressRemoteReloadUntilRef.current) return;
      void loadSettings(true, { silent: true });
    }, 240);
  };

  // Live sync: vendor settings/logo updates from other tabs/devices should appear immediately.
  useEffect(() => {
    window.addEventListener("vendorDataUpdated", scheduleBackgroundReload);

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      window.removeEventListener("vendorDataUpdated", scheduleBackgroundReload);
    };
  }, [vendorId]);

  // Live sync Terms / Privacy fields when KV changes (other admin tabs or super-admin).
  useEffect(() => {
    if (!vendorId) return;
    return subscribeStorefrontPolicyUpdates({
      vendorId,
      storeSlug: settings.storeSlug || null,
      includePlatform: false,
      onLivePatch: (patch) => {
        if (patch.scope !== "vendor") return;
        if (patch.vendorId && String(patch.vendorId) !== String(vendorId)) return;
        setSettings((prev) => ({
          ...prev,
          ...(patch.storeName ? { storeName: patch.storeName } : {}),
          ...(patch.storeEmail ? { contactEmail: patch.storeEmail } : {}),
          ...(patch.storeAddress ? { address: patch.storeAddress } : {}),
          ...(patch.kind === "terms" ? { termsContent: patch.content } : {}),
          ...(patch.kind === "privacy" ? { privacyPolicyContent: patch.content } : {}),
        }));
      },
      onUpdate: scheduleBackgroundReload,
    });
  }, [vendorId, settings.storeSlug]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { domainVerification: _dv, ...settingsForSave } = settings;
      const pixel = normalizeMetaPixelId(settingsForSave.metaPixelId);
      if (pixel) {
        settingsForSave.metaPixelId = pixel;
      } else {
        delete settingsForSave.metaPixelId;
      }
      delete settingsForSave.metaCapiAccessToken;
      const saveBody: Record<string, unknown> = { settings: settingsForSave };
      if (metaCapiTokenInput.trim()) {
        settingsForSave.metaCapiAccessToken = metaCapiTokenInput.trim();
      }
      if (clearMetaCapiToken) {
        saveBody.clearMetaCapiAccessToken = true;
      }
      const response = await fetch(
        `${API_BASE_URL}/vendor/storefront`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(saveBody),
        }
      );

      if (response.ok) {
        const body = (await response.json()) as { settings?: StoreSettings };
        const saved = body.settings;
        if (!saved?.storeSlug) {
          toast.error(t("common.unknown"));
          return;
        }
        const normalized = { ...saved, logo: pickStoreLogo(saved.logo, "") };
        setSettings(normalized);
        setMetaCapiTokenConfigured(Boolean(saved.metaCapiAccessTokenConfigured));
        setMetaCapiTokenInput("");
        setMetaCapiTokenEditing(false);
        setClearMetaCapiToken(false);
        cacheManager.set(settingsCacheKey, normalized);
        hasLoadedOnceRef.current = true;
        suppressRemoteReloadUntilRef.current = Date.now() + 1500;

        // Also update vendor record with new store name, slug, and logo
        const vendorUpdateResponse = await fetch(
          `${API_BASE_URL}/vendors/${vendorId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              name: saved.storeName,
              email: saved.contactEmail,
              phone: saved.contactPhone,
              location: saved.address,
              logo: normalized.logo,
              storeSlug: saved.storeSlug,
            }),
          }
        );

        if (vendorUpdateResponse.ok) {
          const storedVendor = localStorage.getItem("vendorAuth");
          if (storedVendor) {
            const vendorData = JSON.parse(storedVendor);
            vendorData.name = saved.storeName;
            vendorData.storeName = saved.storeName;
            vendorData.storeSlug = saved.storeSlug;
            localStorage.setItem("vendorAuth", JSON.stringify(vendorData));
            const rememberMe =
              readVendorAuthSessionCookie()?.rememberMe ?? true;
            setVendorAuthSessionCookie(vendorData, rememberMe);
          }

          console.log("🔄 Invalidating caches after settings update");
          cacheManager.reloadVendorData(vendorId);
          invalidateVendorStorefrontCatalogCache(vendorId);

          window.dispatchEvent(
            new CustomEvent("vendorLogoUpdated", {
              detail: { vendorId, logo: normalized.logo },
            })
          );

          window.dispatchEvent(
            new CustomEvent("vendorSettingsUpdated", {
              detail: {
                vendorId,
                storeSlug: saved.storeSlug,
                storeName: saved.storeName,
              },
            })
          );

          notifyStorefrontPolicyUpdated({
            scope: "vendor",
            vendorId,
            storeSlug: saved.storeSlug,
            snapshot: {
              storeName: saved.storeName,
              storeEmail: saved.contactEmail,
              storeAddress: saved.address,
              termsContent: saved.termsContent,
              privacyPolicyContent: saved.privacyPolicyContent,
              vendorId,
              storeSlug: saved.storeSlug,
            },
          });

          toast.success(t("vendorAdmin.settings.saved"));

          const pathMatch = window.location.pathname.match(/^\/(store|vendor)\/([^/]+)(\/.*)?$/);
          if (pathMatch && pathMatch[2] !== saved.storeSlug) {
            const suffix = pathMatch[3] || "/admin";
            const nextPath = `/${pathMatch[1]}/${saved.storeSlug}${suffix}`;
            window.history.replaceState(window.history.state, "", nextPath);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
        } else {
          toast.error(t("vendorAdmin.settings.networkError"));
        }
      } else {
        toast.error(t("vendorAdmin.settings.networkError"));
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error(t("vendorAdmin.settings.networkError"));
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(tr("vendorAdmin.settings.copied", { label }));
    } catch {
      toast.error(t("vendorAdmin.settings.couldNotCopy"));
    }
  };

  const handlePrepareDomain = async () => {
    const hostname = domainDraft.trim();
    if (!hostname) {
      toast.error(t("vendorAdmin.settings.enterDomain"));
      return;
    }
    setDomainBusy("prepare");
    try {
      const res = await fetch(
        `${API_BASE_URL}/vendor/custom-domain/prepare`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ vendorId, hostname }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || data.error === "Not found") {
          toast.error(
            "Save instructions is not available on the deployed API yet. Deploy the latest Supabase Edge Function make-server-16010b6f, then try again."
          );
          return;
        }
        toast.error(typeof data.error === "string" ? data.error : "Could not save domain instructions");
        return;
      }
      setDomainHints({
        hostname: data.hostname,
        txtName: data.txtName,
        txtValue: data.txtValue,
        cnameTarget: String(data.cnameTarget || ""),
        deploymentPlatform: String(data.deploymentPlatform || ""),
      });
      setBackendDeploymentPlatform(String(data.deploymentPlatform || ""));
      setSettings((prev) => ({
        ...prev,
        customDomain: data.hostname,
        domainStatus: "pending",
        dnsVerified: false,
      }));
      toast.success(t("vendorAdmin.settings.saveInstructions"));
    } catch (e) {
      console.error(e);
      toast.error(t("vendorAdmin.settings.networkError"));
    } finally {
      setDomainBusy(null);
    }
  };

  const handleVerifyDomain = async () => {
    const domain = settings.customDomain?.trim() || domainDraft.trim();
    if (!domain) {
      toast.error(t("vendorAdmin.settings.noDomain"));
      return;
    }
    setDomainBusy("verify");
    try {
      const res = await fetch(
        `${API_BASE_URL}/vendor/verify-domain`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ vendorId, domain }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Verification failed");
        return;
      }
      if (data.verified) {
        setSettings((prev) => ({
          ...prev,
          customDomain: data.domain || domain,
          domainStatus: "verified",
          dnsVerified: true,
        }));
        clearCachedVendorHostSlug();
        toast.success(data.message || t("vendorAdmin.settings.domainVerified"));
      } else {
        toast.info(data.message || t("vendorAdmin.settings.verificationPending"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("vendorAdmin.settings.networkError"));
    } finally {
      setDomainBusy(null);
    }
  };

  const handleRemoveDomain = async () => {
    const ok = window.confirm(
      t("vendorAdmin.settings.removeConfirm")
    );
    if (!ok) return;
    setDomainBusy("remove");
    try {
      const res = await fetch(
        `${API_BASE_URL}/vendor/custom-domain`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ vendorId }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Could not remove");
        return;
      }
      setSettings((prev) => ({
        ...prev,
        customDomain: "",
        domainStatus: "none",
        dnsVerified: false,
      }));
      setDomainDraft("");
      setDomainHints(null);
      clearCachedVendorHostSlug();
      toast.success(t("vendorAdmin.settings.domainRemoved"));
    } catch (e) {
      console.error(e);
      toast.error(t("vendorAdmin.settings.networkError"));
    } finally {
      setDomainBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-44 bg-slate-200 rounded" />
            <div className="h-4 w-72 bg-slate-100 rounded" />
          </div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg" />
        </div>
        <div className="max-w-2xl space-y-4">
          <div className="h-28 w-28 bg-slate-200 rounded-lg" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-24 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("vendorAdmin.settings.title")}</h1>
          <p className="text-slate-600">{t("vendorAdmin.settings.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={language} onValueChange={(value: "en" | "zh") => setLanguage(value)}>
            <SelectTrigger className="h-10 w-[150px] bg-white border-slate-200 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("language.english")}</SelectItem>
              <SelectItem value="zh">{t("language.chinese")}</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            onClick={() => {
              if (onPreviewStore) {
                onPreviewStore(vendorId, settings.storeSlug);
              }
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            {t("vendorAdmin.settings.previewStore")}
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-black text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? t("vendorAdmin.settings.saving") : t("vendorAdmin.settings.saveChanges")}
          </Button>
        </div>
      </div>

      {/* Store Information - Simple Form Layout */}
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-900 mb-6">{t("vendorAdmin.settings.storeInformation")}</h2>
        
        <div className="space-y-6">
          {/* Store Logo */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-3 block">{t("vendorAdmin.settings.storeLogo")}</Label>
            {isRenderableImageSrc(settings.logo) ? (
              <div className="inline-block relative group">
                <div className="w-[104px] h-[104px] border-2 border-dashed border-slate-300 rounded p-2 bg-white">
                  <img 
                    src={settings.logo} 
                    alt={t("vendorAdmin.settings.storeLogo")} 
                    className="w-full h-full object-contain" 
                    onError={() =>
                      setSettings((prev) => ({ ...prev, logo: "" }))
                    }
                  />
                </div>
                <button
                  onClick={() => setSettings({ ...settings, logo: "" })}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-bold hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      const compressedDataUrl = await compressImage(file, 200);
                      // Optimistic preview immediately; persisted URL replaces this on success.
                      setSettings({ ...settings, logo: compressedDataUrl });

                      const uploadViaVendorEndpoint = async (): Promise<string> => {
                        const res = await fetch(`${API_BASE_URL}/vendor/storefront/upload-logo`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${publicAnonKey}`,
                          },
                          body: JSON.stringify({
                            vendorId,
                            imageData: compressedDataUrl,
                            fileName: file.name || "logo.jpg",
                          }),
                        });
                        const data = (await res.json().catch(() => ({}))) as {
                          imageUrl?: string;
                          error?: string;
                        };
                        if (!res.ok || !data.imageUrl) {
                          throw new Error(
                            typeof data.error === "string" ? data.error : "Vendor logo endpoint failed"
                          );
                        }
                        return data.imageUrl;
                      };

                      const uploadViaLegacyEndpoint = async (): Promise<string> => {
                        const response = await fetch(compressedDataUrl);
                        const blob = await response.blob();
                        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
                        const uploadFile = new File([blob], `logo.${ext}`, {
                          type: blob.type || "image/jpeg",
                        });
                        const fd = new FormData();
                        fd.append("image", uploadFile);
                        fd.append("storeName", settings.storeName || vendorName || "Vendor Store");
                        const res = await fetch(`${API_BASE_URL}/settings/upload-logo`, {
                          method: "POST",
                          headers: { Authorization: `Bearer ${publicAnonKey}` },
                          body: fd,
                        });
                        const data = (await res.json().catch(() => ({}))) as {
                          imageUrl?: string;
                          error?: string;
                        };
                        if (!res.ok || !data.imageUrl) {
                          throw new Error(
                            typeof data.error === "string" ? data.error : "Legacy logo endpoint failed"
                          );
                        }
                        return data.imageUrl;
                      };

                      let uploadedUrl = "";
                      try {
                        uploadedUrl = await uploadViaVendorEndpoint();
                      } catch {
                        uploadedUrl = await uploadViaLegacyEndpoint();
                      }

                      setSettings((prev) => ({ ...prev, logo: uploadedUrl }));
                      toast.success(t("vendorAdmin.settings.logoUploaded"));
                    } catch (error) {
                      console.error("Logo upload error:", error);
                      toast.error(
                        error instanceof Error ? error.message : t("vendorAdmin.settings.uploadLogoFailed")
                      );
                    } finally {
                      input.value = "";
                    }
                  }}
                />
                <div className="w-[104px] h-[104px] border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-500 text-center px-2">{t("vendorAdmin.settings.uploadLogo")}</span>
                </div>
              </label>
            )}
          </div>

          {/* Store Name */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">{t("vendorAdmin.settings.storeName")}</Label>
            <Input
              value={settings.storeName}
              onChange={(e) => {
                const storeName = e.target.value;
                setSettings({
                  ...settings,
                  storeName,
                  storeSlug: storeSlugFromBusinessName(storeName),
                });
              }}
              placeholder={t("vendorAdmin.settings.storeNamePlaceholder")}
              className="bg-white border-slate-200"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              {t("vendorAdmin.settings.publicPathHint")} <span className="font-mono">/vendor/{settings.storeSlug || "…"}</span>. {t("vendorAdmin.settings.publicPathHint2")}{" "}
              <span className="font-mono">{vendorSubdomainHost || `yourstore.${subdomainBase || "example.com"}`}</span>.
            </p>
          </div>

          {/* Contact Email */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">{t("vendorAdmin.settings.contactEmail")}</Label>
            <Input
              type="email"
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
              placeholder="store@example.com"
              className="bg-white border-slate-200"
            />
            <p className="text-xs text-slate-500 mt-1.5">{t("vendorAdmin.settings.contactEmailHint")}</p>
          </div>

          {/* Phone Number */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">{t("vendorAdmin.settings.phoneNumber")}</Label>
            <Input
              type="tel"
              value={settings.contactPhone}
              onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
              placeholder="+95 9 XXX XXX XXX"
              className="bg-white border-slate-200"
            />
          </div>

          {/* Store Address */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">{t("vendorAdmin.settings.storeAddress")}</Label>
            <Textarea
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              placeholder="123 Main St, Yangon, Myanmar"
              rows={3}
              className="bg-white border-slate-200 resize-none"
            />
          </div>

          {/* Meta Pixel */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">
              {t("vendorAdmin.settings.metaPixelId")}
            </Label>
            <Input
              value={settings.metaPixelId || ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  metaPixelId: e.target.value.replace(/[^\d]/g, ""),
                })
              }
              placeholder={t("vendorAdmin.settings.metaPixelIdPlaceholder")}
              inputMode="numeric"
              autoComplete="off"
              className="bg-white border-slate-200 font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1.5">{t("vendorAdmin.settings.metaPixelIdHint")}</p>
          </div>

          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">
              {t("vendorAdmin.settings.metaCapiAccessToken")}
            </Label>
            <Input
              value={showSavedCapiTokenMask ? META_CAPI_SAVED_MASK : metaCapiTokenInput}
              readOnly={showSavedCapiTokenMask}
              onFocus={() => {
                if (showSavedCapiTokenMask) {
                  setMetaCapiTokenEditing(true);
                  setMetaCapiTokenInput("");
                }
              }}
              onBlur={() => {
                if (!metaCapiTokenInput.trim()) {
                  setMetaCapiTokenEditing(false);
                }
              }}
              onChange={(e) => {
                if (showSavedCapiTokenMask) return;
                setMetaCapiTokenInput(e.target.value);
                if (clearMetaCapiToken) setClearMetaCapiToken(false);
              }}
              placeholder={t("vendorAdmin.settings.metaCapiAccessTokenPlaceholder")}
              type="password"
              autoComplete="off"
              className={`bg-white border-slate-200 font-mono text-sm ${
                showSavedCapiTokenMask ? "text-slate-600 cursor-text" : ""
              }`}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              {t("vendorAdmin.settings.metaCapiAccessTokenHint")}
            </p>
            {showSavedCapiTokenMask && (
              <p className="text-xs text-emerald-700 mt-1">
                {t("vendorAdmin.settings.metaCapiAccessTokenConfigured")}
              </p>
            )}
            {metaCapiTokenConfigured && (
              <button
                type="button"
                onClick={() => {
                  setClearMetaCapiToken((prev) => !prev);
                  setMetaCapiTokenInput("");
                  setMetaCapiTokenEditing(false);
                }}
                className={`text-xs mt-1 underline-offset-2 hover:underline ${
                  clearMetaCapiToken ? "text-red-600" : "text-slate-600"
                }`}
              >
                {clearMetaCapiToken
                  ? t("vendorAdmin.settings.metaCapiAccessTokenClearPending")
                  : t("vendorAdmin.settings.metaCapiAccessTokenClear")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Custom domain — HTTPS well-known verification (+ optional TXT fallback) */}
      <div className="max-w-2xl border border-slate-200 rounded-xl p-6 bg-slate-50/50">
        <div className="flex items-start gap-3 mb-4">
          <Globe className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("vendorAdmin.settings.customDomain")}</h2>
            <p className="text-sm text-slate-600 mt-1">
              {t(
                onEdgeOne
                  ? "vendorAdmin.settings.customDomainDescEdgeOne"
                  : "vendorAdmin.settings.customDomainDesc"
              )}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">{t("vendorAdmin.settings.hostname")}</Label>
            <Input
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              placeholder="shop.example.com"
              disabled={settings.domainStatus === "verified"}
              className="bg-white border-slate-200 font-mono text-sm"
            />
            {settings.domainStatus === "verified" && settings.customDomain && (
              <p className="text-xs text-emerald-700 mt-2">
                <strong>{t("vendorAdmin.settings.verified")}</strong> — store is served at{" "}
                <span className="font-mono">https://{settings.customDomain}</span>{" "}
                {t(
                  onEdgeOne
                    ? "vendorAdmin.settings.verifiedHostingEdgeOne"
                    : "vendorAdmin.settings.verifiedHostingVercel"
                )}
              </p>
            )}
            {settings.domainStatus === "pending" && (
              <p className="text-xs text-amber-700 mt-2">
                {t("vendorAdmin.settings.pending")} — when <span className="font-mono">https://{settings.customDomain || domainDraft || "…"}</span>{" "}
                loads this store, click {t("vendorAdmin.settings.verify")}.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={domainBusy !== null || settings.domainStatus === "verified"}
              onClick={handlePrepareDomain}
            >
              {domainBusy === "prepare" ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {t("vendorAdmin.settings.saveInstructions")}
            </Button>
            <Button
              type="button"
              className="bg-slate-900 hover:bg-black text-white"
              disabled={
                domainBusy !== null ||
                (!String(settings.customDomain || "").trim() && !domainDraft.trim())
              }
              onClick={handleVerifyDomain}
            >
              {domainBusy === "verify" ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t("vendorAdmin.settings.verify")}
            </Button>
            {(String(settings.customDomain || "").trim() || domainDraft.trim()) && (
              <Button
                type="button"
                variant="outline"
                className="text-slate-700"
                disabled={domainBusy !== null}
                onClick={() => {
                  const h = String(settings.customDomain || domainDraft || "").trim();
                  if (!h) return;
                  const u = `https://${h}/.well-known/migoo-verify.txt`;
                  window.open(u, "_blank", "noopener,noreferrer");
                }}
              >
                {t("vendorAdmin.settings.testUrl")}
              </Button>
            )}
            {(settings.customDomain || settings.domainStatus !== "none") && (
              <Button
                type="button"
                variant="outline"
                className="text-red-700 border-red-200 hover:bg-red-50"
                disabled={domainBusy !== null}
                onClick={handleRemoveDomain}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("vendorAdmin.settings.removeDomain")}
              </Button>
            )}
          </div>

          {(domainHints || settings.domainStatus === "pending" || settings.domainStatus === "verified") && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 text-sm">
              <p className="font-medium text-slate-800">{t("vendorAdmin.settings.verifyStepsTitle")}</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-700">
                <li>
                  {t(
                    onEdgeOne
                      ? "vendorAdmin.settings.verifyStep1EdgeOne"
                      : "vendorAdmin.settings.verifyStep1"
                  )}
                </li>
                <li>
                  {t(
                    onEdgeOne
                      ? "vendorAdmin.settings.verifyStep2EdgeOne"
                      : "vendorAdmin.settings.verifyStep2"
                  )}
                </li>
                <li>
                  {t("vendorAdmin.settings.verifyStep3")}
                </li>
              </ol>
              <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                {t("vendorAdmin.settings.optionalTxt")}
              </p>
              <div className="space-y-2 text-slate-700 text-xs">
                <div>
                  <span className="text-slate-500">{t("vendorAdmin.settings.txtName")} </span>
                  <code className="bg-slate-100 px-1 rounded break-all">
                    {domainHints?.txtName || `_migoo-verify.${settings.customDomain || domainDraft || "…"}`}
                  </code>
                  <button
                    type="button"
                    className="ml-2 text-blue-600 hover:underline"
                    onClick={() =>
                      copyToClipboard(
                        "TXT name",
                        domainHints?.txtName ||
                          `_migoo-verify.${(settings.customDomain || domainDraft || "").trim()}`
                      )
                    }
                  >
                    {t("vendorAdmin.settings.copy")}
                  </button>
                </div>
                <div>
                  <span className="text-slate-500">{t("vendorAdmin.settings.txtValue")} </span>
                  <code className="bg-slate-100 px-1 rounded break-all">
                    {domainHints?.txtValue || "(Save instructions to generate)"}
                  </code>
                  {domainHints?.txtValue && (
                    <button
                      type="button"
                      className="ml-2 text-blue-600 hover:underline"
                      onClick={() => copyToClipboard("TXT value", domainHints.txtValue)}
                    >
                      {t("vendorAdmin.settings.copy")}
                    </button>
                  )}
                </div>
                <div>
                  {onEdgeOne && !customDomainCnameTarget ? (
                    <p className="text-slate-600">{t("vendorAdmin.settings.cnameTargetEdgeOneHint")}</p>
                  ) : (
                    <>
                      <span className="text-slate-500">{t("vendorAdmin.settings.cnameTarget")} </span>
                      <code className="bg-slate-100 px-1 rounded">
                        {customDomainCnameTarget || "cname.vercel-dns.com"}
                      </code>
                      {customDomainCnameTarget && (
                        <button
                          type="button"
                          className="ml-2 text-blue-600 hover:underline"
                          onClick={() => copyToClipboard("CNAME target", customDomainCnameTarget)}
                        >
                          {t("vendorAdmin.settings.copy")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl border border-slate-200 rounded-xl p-6 bg-white space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("vendorAdmin.settings.legalPages")}</h2>
          <p className="text-sm text-slate-600 mt-1">{t("vendorAdmin.settings.legalPagesDesc")}</p>
        </div>
        <div>
          <Label className="text-sm font-normal text-slate-900 mb-2 block">
            {t("settings.general.termsContent")}
          </Label>
          <Textarea
            value={settings.termsContent || ""}
            onChange={(e) => setSettings({ ...settings, termsContent: e.target.value })}
            placeholder={t("settings.general.termsContentPlaceholder")}
            rows={6}
            className="bg-white border-slate-200 resize-y min-h-[140px]"
          />
          <p className="text-xs text-slate-500 mt-1">{t("settings.general.termsContentHint")}</p>
        </div>
        <div>
          <Label className="text-sm font-normal text-slate-900 mb-2 block">
            {t("settings.general.privacyContent")}
          </Label>
          <Textarea
            value={settings.privacyPolicyContent || ""}
            onChange={(e) =>
              setSettings({ ...settings, privacyPolicyContent: e.target.value })
            }
            placeholder={t("settings.general.privacyContentPlaceholder")}
            rows={6}
            className="bg-white border-slate-200 resize-y min-h-[140px]"
          />
          <p className="text-xs text-slate-500 mt-1">{t("settings.general.privacyContentHint")}</p>
        </div>
      </div>
    </div>
  );
}