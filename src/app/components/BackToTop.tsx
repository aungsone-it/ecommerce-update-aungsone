import { useState, useEffect, useLayoutEffect, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "./ui/button";

export type BackToTopProps = {
  /** When set, visibility and scroll target this element (e.g. vendor storefront `overflow-y-auto` root). */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** When the scroll root DOM node is replaced, bump this so listeners re-attach (stable ref object). */
  scrollContainerKey?: string | number;
};

export function BackToTop({ scrollContainerRef, scrollContainerKey }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const useContainer = scrollContainerRef != null;

  useEffect(() => {
    if (useContainer) return;
    const toggleVisibility = () => {
      setIsVisible(window.pageYOffset > 300);
    };
    toggleVisibility();
    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, [useContainer]);

  useLayoutEffect(() => {
    if (!useContainer || !scrollContainerRef) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const toggleVisibility = () => {
      setIsVisible(el.scrollTop > 300);
    };
    toggleVisibility();
    el.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => el.removeEventListener("scroll", toggleVisibility);
  }, [useContainer, scrollContainerRef, scrollContainerKey]);

  const scrollToTop = () => {
    if (scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <>
      {isVisible && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-4 md:bottom-[112px] right-4 md:right-6 z-50 w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center p-1.5 animate-fade-in-right"
          size="icon"
        >
          <ArrowUp className="w-5 h-5 md:w-6 md:h-6 text-white" strokeWidth={2.5} />
        </Button>
      )}
    </>
  );
}
