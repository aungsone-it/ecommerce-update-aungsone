import { ArrowRight, ChevronLeft, ChevronRight, ShoppingBag, Store, TrendingUp, Shield, Zap, Users } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "../components/ui/carousel";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { usePlatformBranding } from "../hooks/usePlatformBranding";
import { logoDisplayImageUrl } from "../utils/module-cache";
import { buildPlatformLandingDocumentTitle } from "../utils/superAdminDocumentTitle";
import { displayPlatformBrandName } from "../utils/platformBranding";
import {
  fetchLandingPlatformSettingsCached,
  fetchLandingVendorsCached,
  fetchLandingStatsCached,
  fetchLandingCategoriesCached,
} from "../utils/landingPageCached";
import { resolveLandingVendorStoreUrl } from "../utils/vendorCheckoutPaths";

// Dynamic site name - pulled from platform General settings when available
const SITE_NAME_FALLBACK = "SECURE";

interface Vendor {
  id: string;
  businessName: string;
  name: string;
  storeName?: string;
  storeSlug?: string;
  status?: string;
  logo?: string;
  avatar?: string;
  customDomain?: string;
  domainStatus?: string;
  totalRevenue?: number;
}

interface PlatformSettings {
  supportPhone?: string;
  supportEmail?: string;
}

interface LandingStats {
  activeVendors: number;
  totalProducts: number;
  totalCustomers: number;
}

interface Category {
  id: string;
  name: string;
  description?: string;
}

function VendorPartnerCard({ vendor }: { vendor: Vendor }) {
  const logoSrc = String(vendor.logo || vendor.avatar || "").trim();
  const displayName = vendor.storeName || vendor.businessName || vendor.name;

  const handleOpenStore = () => {
    const url = resolveLandingVendorStoreUrl(vendor);
    if (!url) return;
    window.location.assign(url);
  };

  return (
    <button
      type="button"
      onClick={handleOpenStore}
      className="group w-full bg-white border border-slate-200 rounded-lg p-4 h-32 flex flex-col items-center justify-center gap-2 text-center hover:border-purple-300 hover:shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {logoSrc ? (
        <img
          src={logoDisplayImageUrl(logoSrc)}
          alt=""
          width={40}
          height={40}
          decoding="async"
          className="w-10 h-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 group-hover:ring-purple-200"
        />
      ) : (
        <Store className="w-8 h-8 shrink-0 text-purple-600" />
      )}
      <h4 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 px-1">
        {displayName}
      </h4>
    </button>
  );
}

function VendorPartnersCarousel({ vendors }: { vendors: Vendor[] }) {
  return (
    <Carousel
      opts={{
        align: "start",
        loop: false,
      }}
      className="w-full"
    >
      <VendorPartnersCarouselTrack vendors={vendors} />
    </Carousel>
  );
}

function VendorPartnersCarouselTrack({ vendors }: { vendors: Vendor[] }) {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-4 sm:grid-cols-[3rem_minmax(0,1fr)_3rem] sm:gap-x-5 md:gap-x-8">
      <div className="flex items-center justify-center">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous vendors"
          disabled={!canScrollPrev}
          onClick={scrollPrev}
          className="size-10 shrink-0 rounded-full border-slate-300 bg-white shadow-md hover:bg-slate-50 disabled:opacity-30"
        >
          <ChevronLeft className="size-5 text-slate-700" />
        </Button>
      </div>

      <div className="min-w-0 overflow-hidden px-1">
        <CarouselContent className="-ml-4">
          {vendors.map((vendor) => (
            <CarouselItem
              key={vendor.id}
              className="pl-4 basis-[160px] sm:basis-[180px] md:basis-[200px]"
            >
              <VendorPartnerCard vendor={vendor} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </div>

      <div className="flex items-center justify-center">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next vendors"
          disabled={!canScrollNext}
          onClick={scrollNext}
          className="size-10 shrink-0 rounded-full border-slate-300 bg-white shadow-md hover:bg-slate-50 disabled:opacity-30"
        >
          <ChevronRight className="size-5 text-slate-700" />
        </Button>
      </div>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const platformBranding = usePlatformBranding();

  useEffect(() => {
    document.title = buildPlatformLandingDocumentTitle(platformBranding.storeName);
  }, [platformBranding.storeName]);

  const siteDisplayName = displayPlatformBrandName(platformBranding.storeName, SITE_NAME_FALLBACK);
  const siteLogo = platformBranding.storeLogo?.trim() || "";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    supportPhone: "+95 9 XXX XXX XXX",
    supportEmail: "support@migoo.com"
  });
  const [stats, setStats] = useState<LandingStats>({
    activeVendors: 0,
    totalProducts: 0,
    totalCustomers: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingVendors(true);

      try {
        const data = await fetchLandingPlatformSettingsCached();
        if (cancelled) return;
        if (data?.settings) {
          setPlatformSettings({
            supportPhone: data.settings.supportPhone || "+95 9 XXX XXX XXX",
            supportEmail: data.settings.supportEmail || "support@migoo.com",
          });
        }
      } catch (error) {
        console.error("❌ Error fetching platform settings:", error);
      }

      try {
        const data = await fetchLandingVendorsCached();
        if (cancelled) return;
        const activeVendors = (data.vendors?.filter((v: Vendor) => v.status === "active") || [])
          .slice()
          .sort((a: Vendor, b: Vendor) => {
            const revenueDiff = (Number(b.totalRevenue) || 0) - (Number(a.totalRevenue) || 0);
            if (revenueDiff !== 0) return revenueDiff;
            const nameA = String(a.storeName || a.businessName || a.name || "").toLowerCase();
            const nameB = String(b.storeName || b.businessName || b.name || "").toLowerCase();
            return nameA.localeCompare(nameB);
          });
        setVendors(activeVendors);
      } catch (error) {
        console.error("Error fetching vendors:", error);
        if (!cancelled) setVendors([]);
      } finally {
        if (!cancelled) setIsLoadingVendors(false);
      }
    };

    const loadDeferred = async () => {
      setIsLoadingStats(true);
      setIsLoadingCategories(true);
      try {
        const data = await fetchLandingStatsCached();
        if (cancelled) return;
        setStats({
          activeVendors: data.activeVendors || 0,
          totalProducts: data.totalProducts || 0,
          totalCustomers: data.totalCustomers || 0,
        });
      } catch (error) {
        console.error("Error fetching landing stats:", error);
        if (!cancelled) {
          setStats({ activeVendors: 0, totalProducts: 0, totalCustomers: 0 });
        }
      } finally {
        if (!cancelled) setIsLoadingStats(false);
      }

      try {
        const data = await fetchLandingCategoriesCached();
        if (cancelled) return;
        setCategories(data.categories || []);
      } catch (error) {
        console.error("Error fetching categories:", error);
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setIsLoadingCategories(false);
      }
    };

    void load();
    let idleHandle: ReturnType<typeof setTimeout> | number = 0;
    if (typeof requestIdleCallback === "function") {
      idleHandle = requestIdleCallback(() => {
        if (!cancelled) void loadDeferred();
      });
    } else {
      idleHandle = window.setTimeout(() => {
        if (!cancelled) void loadDeferred();
      }, 200);
    }
    return () => {
      cancelled = true;
      if (typeof requestIdleCallback === "function" && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle as number);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0"
            >
              {siteLogo ? (
                <img
                  src={logoDisplayImageUrl(siteLogo)}
                  alt=""
                  width={36}
                  height={36}
                  decoding="async"
                  fetchPriority="high"
                  className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200 shrink-0"
                />
              ) : null}
              <span className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                {siteDisplayName}
              </span>
            </button>
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                className="text-sm sm:text-base text-slate-700 hover:text-slate-900 font-medium transition-colors"
                onClick={() => navigate("/vendor/application")}
              >
                Become a Vendor
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-8 sm:pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-4 sm:mb-6 leading-tight">
              <span className="text-xl sm:text-2xl md:text-3xl lg:text-4xl">Your Gateway to</span>
              <br />
              <span className="text-purple-600">Ultimate Choices</span>
              <br />
              <span className="text-xl sm:text-2xl md:text-3xl lg:text-4xl">All in One Place</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mb-6 sm:mb-10 leading-relaxed px-2">
              Connect with thousands of verified vendors and discover quality products
              across Myanmar. Built for the Burmese market, trusted by local businesses.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 sm:px-0">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 px-8 h-12 text-base font-medium rounded-full transition-all duration-200"
                onClick={() => navigate("/vendor/application")}
              >
                Sell on {siteDisplayName}
              </Button>
            </div>
            <div className="mt-4 sm:mt-6 flex items-center justify-center gap-2">
              <span className="text-sm text-slate-600">Already a vendor?</span>
              <button
                className="text-sm text-slate-900 hover:text-purple-600 font-medium underline transition-colors"
                onClick={() => navigate("/vendor/login")}
              >
                Login here
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
              Everything You Need to Succeed
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              The complete e-commerce platform built for Myanmar
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-5">
                <Store className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                Multi-Vendor Platform
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Thousands of verified vendors selling quality products across all categories.
                Each vendor gets their own customizable storefront.
              </p>
            </div>

            <div className="bg-white p-8 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                Secure & Trusted
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Enterprise-grade security with full vendor verification process.
                Your data and transactions are protected.
              </p>
            </div>

            <div className="bg-white p-8 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-5">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                Fast & Reliable
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Lightning-fast performance with instant search and seamless checkout.
                Built with modern technology for the best experience.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Vendor CTA Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-slate-900 rounded-2xl p-12 sm:p-16 text-center text-white">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Turn Your Business Dreams Into Reality
            </h2>
            <p className="text-base text-slate-300 mb-8 max-w-2xl mx-auto">
              Join hundreds of successful vendors on {siteDisplayName}. Get your own admin portal,
              storefront, and access to thousands of customers across Myanmar.
            </p>
            <div className="flex justify-center">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 text-base font-medium rounded-full shadow-lg shadow-blue-600/30 transition-all duration-200 hover:shadow-xl hover:shadow-blue-600/40 flex items-center justify-center"
                onClick={() => navigate("/vendor/application")}
              >
                <span>Apply to Become a Vendor</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-4xl sm:text-5xl font-bold text-slate-900 mb-2">{isLoadingStats ? "..." : stats.activeVendors}+</div>
              <div className="text-sm sm:text-base text-slate-600">Active Vendors</div>
            </div>
            <div>
              <div className="text-4xl sm:text-5xl font-bold text-slate-900 mb-2">{isLoadingStats ? "..." : stats.totalProducts.toLocaleString()}+</div>
              <div className="text-sm sm:text-base text-slate-600">Products Listed</div>
            </div>
            <div>
              <div className="text-4xl sm:text-5xl font-bold text-slate-900 mb-2">{isLoadingStats ? "..." : stats.totalCustomers.toLocaleString()}+</div>
              <div className="text-sm sm:text-base text-slate-600">Happy Customers</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted Vendor Partners Carousel */}
      {!isLoadingVendors && vendors.length > 0 && (
        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
                Join Thousands of Successful Vendors
              </h2>
              <p className="text-base text-slate-600">
                These businesses are already growing with us
              </p>
            </div>

            <VendorPartnersCarousel vendors={vendors} />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag className="w-6 h-6 text-purple-400" />
                <span className="text-xl font-bold text-white">{siteDisplayName}</span>
              </div>
              <p className="text-sm">
                Myanmar's premier multi-vendor marketplace platform
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Vendor</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button
                    type="button"
                    className="hover:text-white transition-colors"
                    onClick={() => navigate("/vendor/application")}
                  >
                    Apply Now
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="hover:text-white transition-colors"
                    onClick={() => navigate("/vendor/login")}
                  >
                    Vendor Login
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>Phone: {platformSettings.supportPhone}</li>
                <li>Email: {platformSettings.supportEmail}</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center text-sm">
            <p>&copy; 2026 {siteDisplayName}. All rights reserved.</p>
            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate("/privacy")}
                className="hover:text-white transition-colors"
              >
                Privacy Policy
              </button>
              <span className="text-slate-700">•</span>
              <button
                type="button"
                onClick={() => navigate("/terms")}
                className="hover:text-white transition-colors"
              >
                Terms of Service
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}