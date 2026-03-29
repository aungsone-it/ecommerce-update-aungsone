import { useState, useEffect } from "react";
import { 
  Save,
  Eye,
  Upload
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import { compressImage } from "../../../utils/imageCompression";
import { cacheManager } from "../../utils/cacheManager";
import { invalidateVendorStorefrontCatalogCache } from "../../utils/module-cache";
import { storeSlugFromBusinessName } from "../../../utils/storeSlug";

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
}

interface VendorAdminSettingsProps {
  vendorId: string;
  vendorName: string;
  onPreviewStore?: (vendorId: string, storeSlug: string) => void;
}

export function VendorAdminSettings({ vendorId, vendorName, onPreviewStore }: VendorAdminSettingsProps) {
  const [settings, setSettings] = useState<StoreSettings>({
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
    domainStatus: 'none',
    dnsVerified: false,
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [vendorId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/storefront/${vendorId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
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
      // Save vendor storefront settings
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/storefront`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ settings }),
        }
      );

      if (response.ok) {
        const body = (await response.json()) as { settings?: StoreSettings };
        const saved = body.settings;
        if (!saved?.storeSlug) {
          toast.error("Invalid response from server");
          return;
        }
        setSettings(saved);

        // Also update vendor record with new store name, slug, and logo
        const vendorUpdateResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/${vendorId}`,
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
              avatar: saved.logo,
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
          }

          console.log("🔄 Invalidating caches after settings update");
          cacheManager.reloadVendorData(vendorId);
          invalidateVendorStorefrontCatalogCache(vendorId);

          window.dispatchEvent(
            new CustomEvent("vendorLogoUpdated", {
              detail: { vendorId, logo: saved.logo },
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
            window.location.replace(`/${pathMatch[1]}/${saved.storeSlug}${suffix}`);
          } else {
            setTimeout(() => window.location.reload(), 400);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
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
            className="bg-blue-600 hover:bg-blue-700"
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
            {settings.logo ? (
              <div className="inline-block relative group">
                <div className="w-[104px] h-[104px] border-2 border-dashed border-slate-300 rounded p-2 bg-white">
                  <img 
                    src={settings.logo} 
                    alt="Store logo" 
                    className="w-full h-full object-contain" 
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
              Public path: <span className="font-mono">/store/{settings.storeSlug || "…"}</span>. On save, the slug is
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
    </div>
  );
}