import { ArrowRight, ShoppingBag, Store, TrendingUp, Shield, Zap, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useEffect, useState } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

// Dynamic site name - can be pulled from settings
const SITE_NAME = "SECURE";

interface Vendor {
  id: string;
  businessName: string;
  name: string;
  storeName?: string;
  storeSlug?: string;
  category?: string;
  status?: string;
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

export function LandingPage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    supportPhone: "+95 9 XXX XXX XXX",
    supportEmail: "support@migoo.com"
  });
  const [currentSlide, setCurrentSlide] = useState(0);
  const [stats, setStats] = useState<LandingStats>({
    activeVendors: 0,
    totalProducts: 0,
    totalCustomers: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  useEffect(() => {
    fetchVendors();
    fetchPlatformSettings();
    fetchLandingStats();
    fetchCategories();
  }, []);

  const fetchPlatformSettings = async () => {
    try {
      console.log("🔍 Fetching platform settings...");
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/platform-settings`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Platform settings fetched:", data);
        if (data.settings) {
          setPlatformSettings({
            supportPhone: data.settings.supportPhone || "+95 9 XXX XXX XXX",
            supportEmail: data.settings.supportEmail || "support@migoo.com"
          });
        }
      } else {
        console.error("❌ Failed to fetch platform settings:", response.status);
      }
    } catch (error) {
      console.error("❌ Error fetching platform settings:", error);
      // Keep default values on error
    }
  };

  const fetchVendors = async () => {
    try {
      setIsLoadingVendors(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch vendors");
      }

      const data = await response.json();
      // Only show active vendors
      const activeVendors = data.vendors?.filter((v: Vendor) => v.status === 'active') || [];
      setVendors(activeVendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      setVendors([]);
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const fetchLandingStats = async () => {
    try {
      setIsLoadingStats(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/landing-stats`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch landing stats");
      }

      const data = await response.json();
      setStats({
        activeVendors: data.activeVendors || 0,
        totalProducts: data.totalProducts || 0,
        totalCustomers: data.totalCustomers || 0,
      });
    } catch (error) {
      console.error("Error fetching landing stats:", error);
      setStats({
        activeVendors: 0,
        totalProducts: 0,
        totalCustomers: 0,
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchCategories = async () => {
    try {
      setIsLoadingCategories(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/categories`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }

      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const nextSlide = () => {
    if (currentSlide < vendors.length - 2) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate("/")}
              className="hover:opacity-80 transition-opacity"
            >
              <span className="text-xl sm:text-2xl font-bold text-slate-900">{SITE_NAME}</span>
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
                Sell on {SITE_NAME}
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
              Join hundreds of successful vendors on {SITE_NAME}. Get your own admin portal,
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

            {/* Mobile: Carousel with Arrow Navigation */}
            <div className="md:hidden relative px-4">
              <div className="overflow-hidden">
                <div 
                  className="flex gap-4 transition-transform duration-300"
                  style={{ 
                    transform: `translateX(-${currentSlide * (160 + 16)}px)`
                  }}
                >
                  {vendors.map((vendor) => (
                    <div key={vendor.id} className="w-[160px] flex-shrink-0">
                      <div className="bg-white border border-slate-200 rounded-lg p-6 h-32 flex flex-col items-center justify-center text-center hover:border-purple-300 transition-colors">
                        <Store className="w-8 h-8 text-purple-600 mb-2" />
                        <h4 className="font-semibold text-slate-900 text-sm mb-1 line-clamp-1">
                          {vendor.storeName || vendor.businessName || vendor.name}
                        </h4>
                        <p className="text-xs text-slate-500">{vendor.category || "General"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation Arrows */}
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-slate-300 rounded-full flex items-center justify-center shadow-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5 text-slate-700" />
              </button>
              <button
                onClick={nextSlide}
                disabled={currentSlide >= vendors.length - 2}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-slate-300 rounded-full flex items-center justify-center shadow-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5 text-slate-700" />
              </button>
            </div>

            {/* Desktop: Carousel */}
            <div className="hidden md:block vendor-carousel">
              <Slider
                dots={false}
                infinite={vendors.length >= 5}
                speed={500}
                slidesToShow={Math.min(5, vendors.length)}
                slidesToScroll={1}
                autoplay={vendors.length >= 5}
                autoplaySpeed={3000}
                arrows={false}
                pauseOnHover={true}
                responsive={[
                  {
                    breakpoint: 1024,
                    settings: {
                      slidesToShow: Math.min(4, vendors.length),
                      infinite: vendors.length >= 4,
                    }
                  }
                ]}
              >
                {vendors.map((vendor) => (
                  <div key={vendor.id} className="px-4">
                    <div className="bg-white border border-slate-200 rounded-lg p-6 h-32 flex flex-col items-center justify-center text-center hover:border-purple-300 transition-colors">
                      <Store className="w-8 h-8 text-purple-600 mb-2" />
                      <h4 className="font-semibold text-slate-900 text-sm mb-1">
                        {vendor.storeName || vendor.businessName || vendor.name}
                      </h4>
                      <p className="text-xs text-slate-500">{vendor.category || "General"}</p>
                    </div>
                  </div>
                ))}
              </Slider>
            </div>
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
                <span className="text-xl font-bold text-white">{SITE_NAME}</span>
              </div>
              <p className="text-sm">
                Myanmar's premier multi-vendor marketplace platform
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Vendor</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/vendor/application" className="hover:text-white">Apply Now</a></li>
                <li><a href="/vendor/login" className="hover:text-white">Vendor Login</a></li>
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
            <p>&copy; 2026 {SITE_NAME}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}