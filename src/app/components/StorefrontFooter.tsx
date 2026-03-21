import { 
  Truck, Shield, RefreshCw, Facebook, Twitter, Instagram, Mail, Phone, MapPin,
  ChevronRight, Bell
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { useNavigate } from "react-router";

interface StorefrontFooterProps {
  siteSettings: {
    storeName: string;
    storeAddress: string;
    storeEmail: string;
    storePhone: string;
  };
  categoryGroups: string[];
  setSelectedCategory: (category: string) => void;
  setViewMode: (mode: string) => void;
}

export const StorefrontFooter = ({
  siteSettings,
  categoryGroups,
  setSelectedCategory,
  setViewMode
}: StorefrontFooterProps) => {
  const navigate = useNavigate();
  
  return (
  <footer className="bg-gradient-to-b from-slate-800 to-slate-900 text-white mt-8">
    {/* Main Footer Content */}
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 md:gap-6 mb-4 md:mb-6">
        {/* Brand Section */}
        <div className="lg:col-span-2 mb-4 md:mb-0">
          <div className="mb-3">
            <h3 className="text-2xl uppercase font-bold" style={{ fontFamily: 'Rubik, sans-serif', letterSpacing: '0.05em' }}>{siteSettings.storeName}</h3>
          </div>
          <p className="text-slate-300 text-sm mb-4 leading-relaxed max-w-sm">
            Myanmar's premier online marketplace for luxury and quality products. 
            Experience elegance in every purchase with our curated selection of premium goods.
          </p>
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3 text-slate-300 text-sm">
              <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                <Truck className="w-4 h-4 text-amber-400" />
              </div>
              <span>Fast & Free Delivery</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300 text-sm">
              <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              <span>Secure Payment Protection</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300 text-sm">
              <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-amber-400" />
              </div>
              <span>Easy Returns & Exchanges</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
              <Facebook className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
              <Twitter className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
              <Instagram className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 bg-slate-700 hover:bg-amber-600 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110">
              <Mail className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Shop Categories */}
        <div className="mb-4 md:mb-0">
          <h4 className="font-semibold mb-3 text-white text-base">Shop</h4>
          <ul className="space-y-2 text-sm">
            {categoryGroups.map(category => (
              <li key={category}>
                <button 
                  onClick={() => {
                    setSelectedCategory(category);
                    setViewMode("home");
                  }}
                  className="text-slate-300 hover:text-amber-400 hover:translate-x-1 transition-all duration-200 flex items-center gap-2"
                >
                  <ChevronRight className="w-3 h-3" />
                  {category}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Customer Service */}
        <div className="mb-4 md:mb-0">
          <h4 className="font-semibold mb-3 text-white text-base">Customer Service</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Help Center
            </li>
            <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Track Your Order
            </li>
            <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Shipping & Delivery
            </li>
            <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Returns & Refunds
            </li>
            <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Payment Methods
            </li>
            <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              FAQs
            </li>
          </ul>
        </div>

        {/* Contact & Company */}
        <div className="mb-4 md:mb-0">
          <h4 className="font-semibold mb-3 text-white text-base">Get in Touch</h4>
          <ul className="space-y-2 text-sm text-slate-300 mb-4">
            <li className="flex items-start gap-3 hover:text-amber-400 transition-colors">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
              <span className="leading-relaxed">{siteSettings.storeAddress}</span>
            </li>
            <li className="flex items-center gap-3 hover:text-amber-400 transition-colors cursor-pointer">
              <Mail className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <a href={`mailto:${siteSettings.storeEmail}`} className="hover:underline">
                {siteSettings.storeEmail}
              </a>
            </li>
            <li className="flex items-center gap-3 hover:text-amber-400 transition-colors cursor-pointer">
              <Phone className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <a href={`tel:${siteSettings.storePhone}`} className="hover:underline">
                {siteSettings.storePhone}
              </a>
            </li>
          </ul>
          
          <div className="pt-4 border-t border-slate-700">
            <h5 className="font-medium mb-2 text-white text-sm">Company</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              <li 
                onClick={() => {
                  navigate("/");
                  window.scrollTo(0, 0);
                }}
                className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2"
              >
                <ChevronRight className="w-3 h-3" />
                About Us
              </li>
              <li 
                onClick={() => {
                  navigate("/");
                  window.scrollTo(0, 0);
                }}
                className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2"
              >
                <ChevronRight className="w-3 h-3" />
                Careers
              </li>
              <li className="hover:text-amber-400 cursor-pointer transition-all hover:translate-x-1 duration-200 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" />
                Become a Vendor
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Newsletter Section */}
      <div className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border border-slate-700">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h4 className="font-semibold text-white text-base mb-2 flex items-center justify-center md:justify-start gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              Subscribe to our Newsletter
            </h4>
            <p className="text-slate-300 text-sm">Get the latest updates on new products and exclusive offers!</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Input 
              placeholder="Enter your email" 
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 flex-1 md:min-w-[280px]"
            />
            <Button className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 px-4 md:px-6 whitespace-nowrap">
              Subscribe
            </Button>
          </div>
        </div>
      </div>

      <Separator className="bg-slate-700 mb-4 sm:mb-6" />
      
      {/* Bottom Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 text-sm text-slate-400">
        <p className="flex items-center gap-2">
          © 2026 {siteSettings.storeName}. All rights reserved. Created by Aung Sone - Software Architect
        </p>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <button className="hover:text-amber-400 transition-colors">Privacy Policy</button>
          <span className="text-slate-600">•</span>
          <button className="hover:text-amber-400 transition-colors">Terms of Service</button>
          <span className="text-slate-600">•</span>
          <button className="hover:text-amber-400 transition-colors">Cookie Policy</button>
          <span className="text-slate-600">•</span>
          <button className="hover:text-amber-400 transition-colors">Sitemap</button>
        </div>
      </div>
    </div>
  </footer>
);