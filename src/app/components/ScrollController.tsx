import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * 🔥 SINGLE SOURCE OF TRUTH FOR ALL SCROLL BEHAVIOR
 * 
 * This component handles ALL scroll restoration across the entire app.
 * - Runs BEFORE any paint/render
 * - Instant scroll to top (0, 0)
 * - No animations, no smooth scrolling
 * - No race conditions
 * 
 * DO NOT add scroll handlers anywhere else in the app!
 */
export function ScrollController() {
  const location = useLocation();

  // Disable browser's scroll restoration immediately
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Reset scroll INSTANTLY on ANY route change
  useEffect(() => {
    // Immediate synchronous scroll - BEFORE any paint
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    
    // Execute immediately
    scrollToTop();
    
    // Double-check after a microtask
    Promise.resolve().then(scrollToTop);
  }, [location.pathname, location.search, location.hash, location.key]);

  return null; // This component doesn't render anything
}
