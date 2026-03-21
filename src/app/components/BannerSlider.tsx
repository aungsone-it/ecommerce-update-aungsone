import { useState, useEffect, memo } from "react";
import { ChevronLeft, ChevronRight, Sparkles, ArrowRight } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface BannerSliderProps {
  banners: {
    id: number | string;
    bg?: string; // Gradient classes (e.g., "from-teal-600 to-cyan-600")
    backgroundImage?: string; // URL for background image
    backgroundColor?: string; // Solid color (e.g., "#3b82f6" or "bg-blue-600")
    badgeText?: string; // Badge label text
    title: string;
    subtitle: string;
    cta: string;
    ctaLink?: string; // Optional link for the CTA button
    textColor?: 'light' | 'dark'; // Text color theme
  }[];
  autoPlayInterval?: number;
  onBannerClick?: () => void;
}

export const BannerSlider = memo(function BannerSlider({ 
  banners, 
  autoPlayInterval = 5000,
  onBannerClick
}: BannerSliderProps) {
  const [currentBanner, setCurrentBanner] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Determine if current banner uses light text (default) or dark text
  const currentBannerData = banners[currentBanner];
  const isLightText = currentBannerData?.textColor !== 'dark';

  // Auto-rotate banner - isolated in this component
  useEffect(() => {
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentBanner((prev) => (prev + 1) % banners.length);
        setIsTransitioning(false);
      }, 300);
    }, autoPlayInterval);
    return () => clearInterval(timer);
  }, [banners.length, autoPlayInterval]);

  const handlePrevBanner = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentBanner((prev) => (prev - 1 + banners.length) % banners.length);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };

  const handleNextBanner = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };

  const handleDotClick = (index: number) => {
    if (index === currentBanner) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentBanner(index);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };

  const handleBannerButtonClick = () => {
    if (onBannerClick) {
      onBannerClick();
    }
  };

  // Generate background style
  const getBackgroundStyle = () => {
    const banner = banners[currentBanner];
    
    if (banner.backgroundImage) {
      return {
        backgroundImage: `url(${banner.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      };
    }
    
    if (banner.backgroundColor) {
      // Check if it's a hex/rgb color or a Tailwind class
      if (banner.backgroundColor.startsWith('#') || banner.backgroundColor.startsWith('rgb')) {
        return { backgroundColor: banner.backgroundColor };
      }
    }
    
    return {};
  };

  // Generate background classes
  const getBackgroundClasses = () => {
    const banner = banners[currentBanner];
    
    // If background image or direct color, no gradient classes
    if (banner.backgroundImage || (banner.backgroundColor && (banner.backgroundColor.startsWith('#') || banner.backgroundColor.startsWith('rgb')))) {
      return 'bg-slate-900'; // Fallback
    }
    
    // Use Tailwind color class if provided
    if (banner.backgroundColor && !banner.backgroundColor.startsWith('#') && !banner.backgroundColor.startsWith('rgb')) {
      return banner.backgroundColor;
    }
    
    // Use gradient classes - Premium deep blue/indigo gradient for professional feel
    return `bg-gradient-to-br ${banner.bg || 'from-blue-950 via-indigo-900 to-blue-900'}`;
  };

  return (
    <div 
      className={`relative overflow-hidden group h-[290px] sm:h-[320px] md:h-[460px] ${getBackgroundClasses()}`}
      style={getBackgroundStyle()}
    >
      {/* Background layer with fade transition */}
      <div 
        className={`absolute inset-0 transition-opacity duration-700 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
        style={getBackgroundStyle()}
      />
      
      {/* Overlay for better text readability when using background images - Only show if text content exists */}
      {banners[currentBanner].backgroundImage && (
        currentBannerData.title || 
        currentBannerData.subtitle || 
        currentBannerData.badgeText || 
        currentBannerData.cta
      ) && (
        <div className={`absolute inset-0 bg-black/40 z-0 transition-opacity duration-700 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}></div>
      )}
      
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center transition-opacity duration-700 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        <div className="relative z-10 max-w-full py-6 sm:py-8">
          {currentBannerData.badgeText && (
            <Badge className={`mb-2 sm:mb-2 md:mb-3 backdrop-blur-sm text-[10px] sm:text-xs md:text-sm inline-flex items-center ${
              !isLightText
                ? 'bg-slate-900/10 text-slate-900 border-slate-900/20' 
                : 'bg-white/10 text-white border-white/20'
            }`}>
              <Sparkles className="w-3 h-3 mr-1" />
              {currentBannerData.badgeText}
            </Badge>
          )}
          <h1 
            className={`text-[26px] sm:text-[25px] md:text-[37px] lg:text-[49px] xl:text-[61px] mb-2 sm:mb-2 md:mb-3 lg:mb-3 leading-tight max-w-2xl ${
              !isLightText ? 'text-slate-900' : 'text-white'
            }`} 
            style={{ fontFamily: 'Rubik, sans-serif', fontWeight: 500 }}
          >
            {banners[currentBanner].title}
          </h1>
          <p className={`text-xs sm:text-sm md:text-base lg:text-lg mb-4 sm:mb-4 md:mb-5 lg:mb-5 leading-relaxed max-w-2xl ${
            !isLightText ? 'text-slate-700' : 'text-white/90'
          }`}>
            {banners[currentBanner].subtitle}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {banners[currentBanner].cta && (
              <Button 
                onClick={handleBannerButtonClick}
                size="sm" 
                className={`shadow-lg h-6 sm:h-9 px-2 sm:px-5 text-[10px] sm:text-sm font-semibold rounded-full flex items-center ${
                  !isLightText
                    ? 'bg-slate-900 text-white hover:bg-slate-800' 
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {banners[currentBanner].cta}
                <ArrowRight className="w-2.5 h-2.5 sm:w-4 sm:h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Navigation Arrows */}
        <button
          onClick={handlePrevBanner}
          className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 backdrop-blur-sm p-2 sm:p-3 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-105 ${
            !isLightText
              ? 'bg-slate-900/10 hover:bg-slate-900/20 text-slate-900' 
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          aria-label="Previous banner"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
        </button>
        <button
          onClick={handleNextBanner}
          className={`absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 backdrop-blur-sm p-2 sm:p-3 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-105 ${
            !isLightText
              ? 'bg-slate-900/10 hover:bg-slate-900/20 text-slate-900' 
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          aria-label="Next banner"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
        </button>
        
        {/* Banner indicators */}
        <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 z-20">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`h-2 rounded-full transition-all duration-300 hover:scale-110 cursor-pointer ${
                index === currentBanner 
                  ? !isLightText
                    ? "w-10 bg-slate-900" 
                    : "w-10 bg-white"
                  : !isLightText
                    ? "w-2 bg-slate-900/40 hover:bg-slate-900/60" 
                    : "w-2 bg-white/40 hover:bg-white/60"
              }`}
              aria-label={`Go to banner ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
});