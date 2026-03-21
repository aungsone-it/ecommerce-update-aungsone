import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Store,
  Settings,
  Eye,
  Save,
  Image,
  Palette,
  Type,
  Globe,
  Link2,
  Copy,
  Check,
  Upload,
  X,
  Plus,
  Trash2
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
  productsCount: number;
  totalRevenue: number;
  commission: number;
  joinedDate: string;
  avatar: string;
}

interface StorefrontSettings {
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
  fontFamily: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    youtube?: string;
  };
  policies: {
    returnPolicy: string;
    shippingPolicy: string;
    privacyPolicy: string;
  };
  isActive: boolean;
  customDomain?: string;
}

interface VendorStorefrontProps {
  vendor: Vendor;
  onBack?: () => void; // Optional when used as a tab
  onPreviewStore?: (vendorId: string, storeSlug: string, vendor: Vendor) => void;
}

export function VendorStorefront({ vendor, onBack, onPreviewStore }: VendorStorefrontProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  // Storefront settings state
  const [settings, setSettings] = useState<StorefrontSettings>({
    vendorId: vendor.id,
    storeName: vendor.name,
    storeSlug: vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    storeDescription: `Official ${vendor.name} store - Quality products delivered with care`,
    storeTagline: "Welcome to our store",
    logo: "",
    banner: "",
    primaryColor: "#1e293b",
    secondaryColor: "#64748b",
    accentColor: "#3b82f6",
    fontFamily: "Inter",
    contactEmail: vendor.email,
    contactPhone: vendor.phone,
    address: vendor.location,
    socialLinks: {},
    policies: {
      returnPolicy: "We accept returns within 30 days of purchase.",
      shippingPolicy: "We ship within 2-3 business days. Shipping times vary by location.",
      privacyPolicy: "We protect your privacy and never share your personal information.",
    },
    isActive: true,
    customDomain: "",
  });

  // Load vendor storefront settings
  useEffect(() => {
    loadStorefrontSettings();
  }, [vendor.id]);

  const loadStorefrontSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/storefront/${vendor.id}`,
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
      console.error("Error loading storefront settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
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
        console.log("✅ Storefront settings saved successfully");
      } else {
        console.error("❌ Failed to save storefront settings");
      }
    } catch (error) {
      console.error("Error saving storefront settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyStoreUrl = () => {
    const storeUrl = `${window.location.origin}/store/${settings.storeSlug}`;
    // Use fallback for clipboard API with proper error handling
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(storeUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        // Silently fallback if clipboard API fails
        fallbackCopyTextToClipboard(storeUrl);
      });
    } else {
      fallbackCopyTextToClipboard(storeUrl);
    }
  };

  // Fallback method for copying text
  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Silently fail - clipboard operations are non-critical
    }
    document.body.removeChild(textArea);
  };

  const updateSettings = (field: keyof StorefrontSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateSocialLink = (platform: keyof StorefrontSettings['socialLinks'], value: string) => {
    setSettings(prev => ({
      ...prev,
      socialLinks: {
        ...prev.socialLinks,
        [platform]: value,
      },
    }));
  };

  const updatePolicy = (policy: keyof StorefrontSettings['policies'], value: string) => {
    setSettings(prev => ({
      ...prev,
      policies: {
        ...prev.policies,
        [policy]: value,
      },
    }));
  };

  const storeUrl = `${window.location.origin}/store/${settings.storeSlug}`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Vendor Storefront</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage {vendor.name}'s independent storefront
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              if (onPreviewStore) {
                onPreviewStore(vendor.id, settings.storeSlug, vendor);
              }
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Store
          </Button>
          <Button 
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Store URL Card */}
      <Card className="p-4 border border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600 font-medium">Storefront URL</p>
              <p className="text-lg font-semibold text-slate-900">{storeUrl}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleCopyStoreUrl}
            className="bg-white"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2 text-green-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy URL
              </>
            )}
          </Button>
        </div>
        {/* Custom Domain Display - HIDDEN */}
        {false && settings.customDomain && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              Custom Domain: <span className="font-semibold text-slate-900">{settings.customDomain}</span>
            </p>
          </div>
        )}
      </Card>

      {/* Settings Tabs */}
      <Card className="border border-slate-200">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b border-slate-200 px-6">
            <TabsList className="h-auto p-0 bg-transparent">
              <TabsTrigger 
                value="general" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 py-3"
              >
                <Settings className="w-4 h-4 mr-2" />
                General
              </TabsTrigger>
              <TabsTrigger 
                value="branding"
                className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 py-3"
              >
                <Palette className="w-4 h-4 mr-2" />
                Branding
              </TabsTrigger>
              <TabsTrigger 
                value="contact"
                className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 py-3"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Contact & Social
              </TabsTrigger>
              <TabsTrigger 
                value="policies"
                className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 py-3"
              >
                <Type className="w-4 h-4 mr-2" />
                Policies
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            {/* General Settings */}
            <TabsContent value="general" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="storeName">Store Name *</Label>
                  <Input
                    id="storeName"
                    value={settings.storeName}
                    onChange={(e) => updateSettings('storeName', e.target.value)}
                    placeholder="Enter store name"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="storeSlug">Store Slug (URL) *</Label>
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1 flex items-center gap-2 px-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-sm text-slate-500">{window.location.origin}/store/</span>
                      <Input
                        id="storeSlug"
                        value={settings.storeSlug}
                        onChange={(e) => {
                          const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                          updateSettings('storeSlug', slug);
                        }}
                        placeholder="store-slug"
                        className="border-0 bg-transparent p-0 focus-visible:ring-0 font-medium"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Only lowercase letters, numbers, and hyphens</p>
                </div>

                <div>
                  <Label htmlFor="storeTagline">Tagline</Label>
                  <Input
                    id="storeTagline"
                    value={settings.storeTagline}
                    onChange={(e) => updateSettings('storeTagline', e.target.value)}
                    placeholder="Enter a catchy tagline"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="storeDescription">Store Description</Label>
                  <Textarea
                    id="storeDescription"
                    value={settings.storeDescription}
                    onChange={(e) => updateSettings('storeDescription', e.target.value)}
                    placeholder="Describe your store and what you offer"
                    rows={4}
                    className="mt-2"
                  />
                </div>

                {/* Custom Domain Field - HIDDEN */}
                {false && (
                <div>
                  <Label htmlFor="customDomain">Custom Domain (Optional)</Label>
                  <Input
                    id="customDomain"
                    value={settings.customDomain || ""}
                    onChange={(e) => updateSettings('customDomain', e.target.value)}
                    placeholder="www.yourstore.com"
                    className="mt-2"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Contact support to configure DNS settings for your custom domain
                  </p>
                </div>
                )}

                <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={settings.isActive}
                    onChange={(e) => updateSettings('isActive', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <Label htmlFor="isActive" className="cursor-pointer">
                    Storefront is Active (customers can access the store)
                  </Label>
                </div>
              </div>
            </TabsContent>

            {/* Branding Settings */}
            <TabsContent value="branding" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Store Logo</Label>
                  <div className="mt-2 flex gap-4">
                    {settings.logo ? (
                      <div className="relative w-32 h-32 border-2 border-slate-200 rounded-lg overflow-hidden">
                        <img src={settings.logo} alt="Store logo" className="w-full h-full object-cover" />
                        <button
                          onClick={() => updateSettings('logo', '')}
                          className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50">
                        <div className="text-center">
                          <Image className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-xs text-slate-500">No logo</p>
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        placeholder="Enter logo URL"
                        value={settings.logo}
                        onChange={(e) => updateSettings('logo', e.target.value)}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Recommended: 500x500px, PNG or SVG format
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Banner Image</Label>
                  <div className="mt-2 flex gap-4">
                    {settings.banner ? (
                      <div className="relative w-full h-32 border-2 border-slate-200 rounded-lg overflow-hidden">
                        <img src={settings.banner} alt="Store banner" className="w-full h-full object-cover" />
                        <button
                          onClick={() => updateSettings('banner', '')}
                          className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50">
                        <div className="text-center">
                          <Image className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-xs text-slate-500">No banner</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <Input
                    className="mt-2"
                    placeholder="Enter banner URL"
                    value={settings.banner}
                    onChange={(e) => updateSettings('banner', e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Recommended: 1920x400px, JPG or PNG format
                  </p>
                </div>

                <Separator />

                <div>
                  <Label className="mb-3 block">Color Scheme</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="primaryColor" className="text-xs text-slate-600">Primary Color</Label>
                      <div className="flex gap-2 mt-2">
                        <input
                          type="color"
                          id="primaryColor"
                          value={settings.primaryColor}
                          onChange={(e) => updateSettings('primaryColor', e.target.value)}
                          className="w-12 h-10 rounded border border-slate-300 cursor-pointer"
                        />
                        <Input
                          value={settings.primaryColor}
                          onChange={(e) => updateSettings('primaryColor', e.target.value)}
                          placeholder="#000000"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="secondaryColor" className="text-xs text-slate-600">Secondary Color</Label>
                      <div className="flex gap-2 mt-2">
                        <input
                          type="color"
                          id="secondaryColor"
                          value={settings.secondaryColor}
                          onChange={(e) => updateSettings('secondaryColor', e.target.value)}
                          className="w-12 h-10 rounded border border-slate-300 cursor-pointer"
                        />
                        <Input
                          value={settings.secondaryColor}
                          onChange={(e) => updateSettings('secondaryColor', e.target.value)}
                          placeholder="#666666"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="accentColor" className="text-xs text-slate-600">Accent Color</Label>
                      <div className="flex gap-2 mt-2">
                        <input
                          type="color"
                          id="accentColor"
                          value={settings.accentColor}
                          onChange={(e) => updateSettings('accentColor', e.target.value)}
                          className="w-12 h-10 rounded border border-slate-300 cursor-pointer"
                        />
                        <Input
                          value={settings.accentColor}
                          onChange={(e) => updateSettings('accentColor', e.target.value)}
                          placeholder="#0066FF"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="fontFamily">Font Family</Label>
                  <select
                    id="fontFamily"
                    value={settings.fontFamily}
                    onChange={(e) => updateSettings('fontFamily', e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="Inter">Inter</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Open Sans">Open Sans</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Lato">Lato</option>
                  </select>
                </div>

                {/* Preview */}
                <div className="p-4 border-2 border-slate-200 rounded-lg bg-white">
                  <Label className="mb-3 block">Color Preview</Label>
                  <div className="flex gap-4">
                    <div 
                      className="flex-1 h-20 rounded-lg flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      Primary
                    </div>
                    <div 
                      className="flex-1 h-20 rounded-lg flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: settings.secondaryColor }}
                    >
                      Secondary
                    </div>
                    <div 
                      className="flex-1 h-20 rounded-lg flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: settings.accentColor }}
                    >
                      Accent
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Contact & Social Settings */}
            <TabsContent value="contact" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => updateSettings('contactEmail', e.target.value)}
                    placeholder="support@store.com"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    type="number"
                    value={settings.contactPhone}
                    onChange={(e) => updateSettings('contactPhone', e.target.value)}
                    placeholder="+95 9 XXX XXX XXX"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="address">Physical Address</Label>
                  <Textarea
                    id="address"
                    value={settings.address}
                    onChange={(e) => updateSettings('address', e.target.value)}
                    placeholder="123 Main Street, City, State 12345"
                    rows={3}
                    className="mt-2"
                  />
                </div>

                <Separator />

                <div>
                  <Label className="mb-3 block">Social Media Links</Label>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="facebook" className="text-xs text-slate-600">Facebook</Label>
                      <Input
                        id="facebook"
                        value={settings.socialLinks.facebook || ""}
                        onChange={(e) => updateSocialLink('facebook', e.target.value)}
                        placeholder="https://facebook.com/yourstore"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="instagram" className="text-xs text-slate-600">Instagram</Label>
                      <Input
                        id="instagram"
                        value={settings.socialLinks.instagram || ""}
                        onChange={(e) => updateSocialLink('instagram', e.target.value)}
                        placeholder="https://instagram.com/yourstore"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="twitter" className="text-xs text-slate-600">Twitter / X</Label>
                      <Input
                        id="twitter"
                        value={settings.socialLinks.twitter || ""}
                        onChange={(e) => updateSocialLink('twitter', e.target.value)}
                        placeholder="https://twitter.com/yourstore"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="youtube" className="text-xs text-slate-600">YouTube</Label>
                      <Input
                        id="youtube"
                        value={settings.socialLinks.youtube || ""}
                        onChange={(e) => updateSocialLink('youtube', e.target.value)}
                        placeholder="https://youtube.com/@yourstore"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Policies Settings */}
            <TabsContent value="policies" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="returnPolicy">Return Policy</Label>
                  <Textarea
                    id="returnPolicy"
                    value={settings.policies.returnPolicy}
                    onChange={(e) => updatePolicy('returnPolicy', e.target.value)}
                    placeholder="Describe your return policy..."
                    rows={5}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="shippingPolicy">Shipping Policy</Label>
                  <Textarea
                    id="shippingPolicy"
                    value={settings.policies.shippingPolicy}
                    onChange={(e) => updatePolicy('shippingPolicy', e.target.value)}
                    placeholder="Describe your shipping policy..."
                    rows={5}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="privacyPolicy">Privacy Policy</Label>
                  <Textarea
                    id="privacyPolicy"
                    value={settings.policies.privacyPolicy}
                    onChange={(e) => updatePolicy('privacyPolicy', e.target.value)}
                    placeholder="Describe your privacy policy..."
                    rows={5}
                    className="mt-2"
                  />
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> These policies will be displayed on your storefront's footer. 
                    Make sure they comply with local regulations and accurately represent your business practices.
                  </p>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>

      {/* ERP Integration Info */}
      <Card className="p-6 border border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Store className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">ERP Integration</h3>
            <p className="text-sm text-slate-600 mb-3">
              While this vendor manages their own storefront branding and customer experience, 
              Migoo handles all backend operations including:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                Inventory Management
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                Order Processing
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                Payment Processing
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                Shipping & Logistics
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                Financial Reporting
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                Commission Tracking
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}