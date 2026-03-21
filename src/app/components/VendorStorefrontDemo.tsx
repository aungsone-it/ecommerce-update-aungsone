import { useState } from "react";
import { 
  Store, 
  Globe, 
  Settings, 
  Eye,
  Palette,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Package,
  CheckCircle,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

export function VendorStorefrontDemo() {
  return (
    <div className="p-6 space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-white">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 mb-4">
            <Store className="w-8 h-8" />
            <Badge className="bg-white/20 text-white border-white/30">New Feature</Badge>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Vendor Storefront System
          </h1>
          <p className="text-xl text-purple-100 mb-6">
            Every vendor gets their own independent, fully-branded online store while Migoo handles all the ERP operations behind the scenes.
          </p>
          <div className="flex gap-3">
            <Button className="bg-white text-purple-600 hover:bg-purple-50">
              <Sparkles className="w-4 h-4 mr-2" />
              Explore Features
            </Button>
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10">
              <Eye className="w-4 h-4 mr-2" />
              View Demo Store
            </Button>
          </div>
        </div>
      </div>

      {/* Key Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border border-slate-200 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <Globe className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Independent Storefronts
          </h3>
          <p className="text-slate-600 text-sm mb-4">
            Each vendor gets their own unique URL (e.g., yourstore.com/store/vendor-name) with completely separate branding from Migoo.
          </p>
          <div className="flex items-center text-purple-600 text-sm font-medium">
            Learn more <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Card>

        <Card className="p-6 border border-slate-200 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <Palette className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Full Branding Control
          </h3>
          <p className="text-slate-600 text-sm mb-4">
            Vendors customize logos, colors, banners, fonts, and policies to create their unique brand identity.
          </p>
          <div className="flex items-center text-blue-600 text-sm font-medium">
            Learn more <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Card>

        <Card className="p-6 border border-slate-200 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Migoo Handles ERP
          </h3>
          <p className="text-slate-600 text-sm mb-4">
            Inventory, orders, payments, shipping, analytics, and commissions are all managed by Migoo's powerful ERP system.
          </p>
          <div className="flex items-center text-green-600 text-sm font-medium">
            Learn more <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Card>
      </div>

      {/* Vendor Benefits */}
      <Card className="p-8 border border-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">What Vendors Control</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Store Name & Branding</h4>
                <p className="text-sm text-slate-600">Custom store name, tagline, description, and URL slug</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Visual Identity</h4>
                <p className="text-sm text-slate-600">Logo, banner image, color scheme, and font selection</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Contact Information</h4>
                <p className="text-sm text-slate-600">Email, phone, physical address, and social media links</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Store Policies</h4>
                <p className="text-sm text-slate-600">Return, shipping, and privacy policies displayed to customers</p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Store Status</h4>
                <p className="text-sm text-slate-600">Activate or deactivate storefront visibility</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Custom Domain (Optional)</h4>
                <p className="text-sm text-slate-600">Connect a custom domain like www.yourstore.com</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Product Display</h4>
                <p className="text-sm text-slate-600">All vendor products automatically appear in their storefront</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Social Integration</h4>
                <p className="text-sm text-slate-600">Facebook, Instagram, Twitter, and YouTube links</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Migoo ERP Benefits */}
      <Card className="p-8 border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">What Migoo Handles (ERP Operations)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
              <Package className="w-5 h-5 text-green-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Inventory Management</h4>
            <p className="text-sm text-slate-600">
              Real-time stock tracking, low inventory alerts, and automatic updates across all sales channels.
            </p>
          </div>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Order Processing</h4>
            <p className="text-sm text-slate-600">
              Complete order management from placement to fulfillment with status tracking and notifications.
            </p>
          </div>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Payment Processing</h4>
            <p className="text-sm text-slate-600">
              Secure payment gateway integration with multiple payment methods (KPay, Wave Money, Cash, etc.).
            </p>
          </div>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Analytics & Reporting</h4>
            <p className="text-sm text-slate-600">
              Comprehensive sales analytics, revenue tracking, and performance insights for vendors.
            </p>
          </div>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center mb-3">
              <Package className="w-5 h-5 text-pink-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Shipping & Logistics</h4>
            <p className="text-sm text-slate-600">
              Automated shipping label generation, carrier integration, and delivery tracking.
            </p>
          </div>
          <div className="bg-white p-5 rounded-lg border border-slate-200">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5 text-yellow-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Commission Tracking</h4>
            <p className="text-sm text-slate-600">
              Automatic commission calculation, payout tracking, and financial reporting per vendor.
            </p>
          </div>
        </div>
      </Card>

      {/* How to Access */}
      <Card className="p-8 border border-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">How to Manage Vendor Storefronts</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
              1
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-1">Navigate to Vendors Section</h4>
              <p className="text-sm text-slate-600">
                Go to the Vendor section from the main navigation menu. You'll see all your registered vendors.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
              2
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-1">Click on a Vendor</h4>
              <p className="text-sm text-slate-600">
                Click the "View" button or vendor name to open their profile page with comprehensive analytics and settings.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
              3
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-1">Access Storefront Settings</h4>
              <p className="text-sm text-slate-600">
                Click the "Manage Storefront" button or navigate to the "Storefront" tab to configure the vendor's online store.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
              4
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-1">Customize & Save</h4>
              <p className="text-sm text-slate-600">
                Configure branding, contact info, and policies. Click "Save Changes" and preview the live storefront.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Technical Details */}
      <Card className="p-8 border border-slate-200 bg-slate-50">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">Technical Implementation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Frontend Components</h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">VendorStorefront.tsx</code> - Storefront settings management</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">VendorStoreView.tsx</code> - Public-facing store display</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">VendorProfile.tsx</code> - Updated with Storefront tab</span>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Backend API Endpoints</h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">POST /vendor/storefront</code> - Save settings</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">GET /vendor/storefront/:id</code> - Get settings</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">GET /vendor/store/:slug</code> - Public store access</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                <span><code className="bg-white px-1.5 py-0.5 rounded text-xs">GET /vendor/products/:id</code> - Get vendor products</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
