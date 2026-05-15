import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { publicAnonKey } from "../../../../utils/supabase/info";
import { API_BASE_URL } from "../../../utils/api-client";
import { compressImage } from "../../../utils/imageCompression";
import { cacheManager } from "../../utils/cacheManager";
import { invalidateVendorStorefrontCatalogCache } from "../../utils/module-cache";
import { storeSlugFromBusinessName } from "../../../utils/storeSlug";
import {
  setVendorAuthSessionCookie,
  readVendorAuthSessionCookie,
} from "../../utils/vendorAuthCookie";
import { clearCachedVendorHostSlug } from "../../utils/vendorHostResolution";
import { isRenderableImageSrc, pickStoreLogo } from "../../utils/renderableImageSrc";

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
  const [domainBusy, setDomainBusy] = useState<"prepare" | "verify" | "remove" | null>(null);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainHints, setDomainHints] = useState<{
    hostname: string;
    txtName: string;
    txtValue: string;
    cnameTarget: string;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, [vendorId, vendorLogo]);

  const loadSettings = async () => {
    if (!cacheManager.get(settingsCacheKey)) {
      setLoading(true);
    }
    try {
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
      if (data?.settings) {
        const rawLogo =
          typeof data.settings.logo === "string" ? data.settings.logo.trim() : "";
        const nextSettings = {
          ...data.settings,
          logo: pickStoreLogo(rawLogo, vendorLogo),
        };
        setSettings(nextSettings);
        cacheManager.set(settingsCacheKey, nextSettings);
        setDomainDraft(String(data.settings.customDomain || "").trim() || "");
        const dv = data.settings.domainVerification;
        if (dv?.txtName && dv?.txtValue) {
          setDomainHints({
            hostname: String(data.settings.customDomain || "").trim(),
            txtName: dv.txtName,
            txtValue: dv.txtValue,
            cnameTarget: dv.cnameTarget || "cname.vercel-dns.com",
          });
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { domainVerification: _dv, ...settingsForSave } = settings;
      const response = await fetch(
        `${API_BASE_URL}/vendor/storefront`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ settings: settingsForSave }),
        }
      );

      if (response.ok) {
        const body = (await response.json()) as { settings?: StoreSettings };
        const saved = body.settings;
        if (!saved?.storeSlug) {
          toast.error("Invalid response from server");
          return;
        }
        const normalized = { ...saved, logo: pickStoreLogo(saved.logo, "") };
        setSettings(normalized);
        cacheManager.set(settingsCacheKey, normalized);

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

          toast.success("Settings saved successfully!");

          const pathMatch = window.location.pathname.match(/^\/(store|vendor)\/([^/]+)(\/.*)?$/);
          if (pathMatch && pathMatch[2] !== saved.storeSlug) {
            const suffix = pathMatch[3] || "/admin";
            const nextPath = `/${pathMatch[1]}/${saved.storeSlug}${suffix}`;
            window.history.replaceState(window.history.state, "", nextPath);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
        } else {
          toast.error("Failed to update vendor information");
        }
      } else {
        toast.error("Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const handlePrepareDomain = async () => {
    const hostname = domainDraft.trim();
    if (!hostname) {
      toast.error("Enter your domain (e.g. shop.example.com)");
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
        cnameTarget: data.cnameTarget,
      });
      setSettings((prev) => ({
        ...prev,
        customDomain: data.hostname,
        domainStatus: "pending",
        dnsVerified: false,
      }));
      toast.success("Saved — open your domain on Vercel, then click Verify (HTTPS check).");
    } catch (e) {
      console.error(e);
      toast.error("Network error");
    } finally {
      setDomainBusy(null);
    }
  };

  const handleVerifyDomain = async () => {
    const domain = settings.customDomain?.trim() || domainDraft.trim();
    if (!domain) {
      toast.error("No domain to verify");
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
        toast.success(data.message || "Domain verified");
      } else {
        toast.info(data.message || "Verification pending — check DNS propagation");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error");
    } finally {
      setDomainBusy(null);
    }
  };

  const handleRemoveDomain = async () => {
    const ok = window.confirm(
      "Remove this custom domain? Customers will use your default marketplace URL until you connect a domain again."
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
      toast.success("Custom domain removed");
    } catch (e) {
      console.error(e);
      toast.error("Network error");
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
          <h1 className="text-2xl font-bold text-slate-900">Store Settings</h1>
          <p className="text-slate-600">Customize your storefront appearance</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => {
              if (onPreviewStore) {
                onPreviewStore(vendorId, settings.storeSlug);
              }
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Store
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-black text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Store Information - Simple Form Layout */}
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-900 mb-6">Store information</h2>
        
        <div className="space-y-6">
          {/* Store Logo */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-3 block">Store Logo</Label>
            {isRenderableImageSrc(settings.logo) ? (
              <div className="inline-block relative group">
                <div className="w-[104px] h-[104px] border-2 border-dashed border-slate-300 rounded p-2 bg-white">
                  <img 
                    src={settings.logo} 
                    alt="Store logo" 
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
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        // Compress logo to max 100KB for optimal performance
                        const compressedDataUrl = await compressImage(file, 100);
                        setSettings({ ...settings, logo: compressedDataUrl });
                        toast.success("Logo compressed and uploaded successfully!");
                      } catch (error) {
                        console.error("Logo compression error:", error);
                        toast.error("Failed to compress logo. Please try a smaller file.");
                      }
                    }
                  }}
                />
                <div className="w-[104px] h-[104px] border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-500 text-center px-2">Upload logo</span>
                </div>
              </label>
            )}
          </div>

          {/* Store Name */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">Store name</Label>
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
              placeholder="My Store"
              className="bg-white border-slate-200"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Public path: <span className="font-mono">/vendor/{settings.storeSlug || "…"}</span>. On save, the slug is
              finalized from this name (letters and digits only). With a wildcard DNS record, your host can use{" "}
              <span className="font-mono">{settings.storeSlug || "yourstore"}.yourdomain.com</span>.
            </p>
          </div>

          {/* Contact Email */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">Contact email</Label>
            <Input
              type="email"
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
              placeholder="store@example.com"
              className="bg-white border-slate-200"
            />
            <p className="text-xs text-slate-500 mt-1.5">Customers will use this email to contact you</p>
          </div>

          {/* Phone Number */}
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">Phone number</Label>
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
            <Label className="text-sm font-normal text-slate-900 mb-2 block">Store address</Label>
            <Textarea
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              placeholder="123 Main St, Yangon, Myanmar"
              rows={3}
              className="bg-white border-slate-200 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Custom domain — HTTPS well-known verification (+ optional TXT fallback) */}
      <div className="max-w-2xl border border-slate-200 rounded-xl p-6 bg-slate-50/50">
        <div className="flex items-start gap-3 mb-4">
          <Globe className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Custom domain</h2>
            <p className="text-sm text-slate-600 mt-1">
              Add your hostname (e.g. <span className="font-mono">shop.example.com</span>) under this
              project&apos;s <strong>Vercel → Domains</strong> and point DNS so traffic hits this deployment.
              Then use <strong>Save instructions</strong> and <strong>Verify</strong> — we confirm ownership
              over HTTPS at{" "}
              <span className="font-mono text-xs">/.well-known/migoo-verify.txt</span> (no registrar TXT
              needed in most cases).
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-normal text-slate-900 mb-2 block">Hostname</Label>
            <Input
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              placeholder="shop.example.com"
              disabled={settings.domainStatus === "verified"}
              className="bg-white border-slate-200 font-mono text-sm"
            />
            {settings.domainStatus === "verified" && settings.customDomain && (
              <p className="text-xs text-emerald-700 mt-2">
                <strong>Verified</strong> — store is served at{" "}
                <span className="font-mono">https://{settings.customDomain}</span> once DNS and Vercel
                include this host.
              </p>
            )}
            {settings.domainStatus === "pending" && (
              <p className="text-xs text-amber-700 mt-2">
                Pending — when <span className="font-mono">https://{settings.customDomain || domainDraft || "…"}</span>{" "}
                loads this store, click Verify.
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
              Save instructions
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
              Verify
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
                Test URL
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
                Remove domain
              </Button>
            )}
          </div>

          {(domainHints || settings.domainStatus === "pending" || settings.domainStatus === "verified") && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 text-sm">
              <p className="font-medium text-slate-800">Verify in two clicks</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-700">
                <li>
                  Same hostname added in <strong>Vercel → Domains</strong> with valid HTTPS.
                </li>
                <li>
                  <strong>DNS must send this hostname to Vercel</strong> (A/CNAME from Vercel’s Domains
                  screen). If <strong>Test URL</strong> opens a Hostinger “parked domain” page, HTTPS verify
                  cannot work until you change those DNS records away from Hostinger parking.
                </li>
                <li>
                  <strong>Save instructions</strong>, then <strong>Verify</strong> — we read{" "}
                  <code className="text-xs bg-slate-100 px-1 rounded">/.well-known/migoo-verify.txt</code> on
                  this deployment.
                </li>
              </ol>
              <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                Optional — only if HTTPS verify fails: add a <strong>TXT</strong> at your DNS for ownership,
                or use CNAME for traffic. At Hostinger, TXT <strong>Name</strong> is often just{" "}
                <code className="text-xs">_migoo-verify</code> (not the full FQDN).
              </p>
              <div className="space-y-2 text-slate-700 text-xs">
                <div>
                  <span className="text-slate-500">TXT name </span>
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
                    Copy
                  </button>
                </div>
                <div>
                  <span className="text-slate-500">TXT value </span>
                  <code className="bg-slate-100 px-1 rounded break-all">
                    {domainHints?.txtValue || "(Save instructions to generate)"}
                  </code>
                  {domainHints?.txtValue && (
                    <button
                      type="button"
                      className="ml-2 text-blue-600 hover:underline"
                      onClick={() => copyToClipboard("TXT value", domainHints.txtValue)}
                    >
                      Copy
                    </button>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">CNAME target </span>
                  <code className="bg-slate-100 px-1 rounded">
                    {domainHints?.cnameTarget || "cname.vercel-dns.com"}
                  </code>
                  {domainHints?.cnameTarget && (
                    <button
                      type="button"
                      className="ml-2 text-blue-600 hover:underline"
                      onClick={() => copyToClipboard("CNAME target", domainHints.cnameTarget)}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}