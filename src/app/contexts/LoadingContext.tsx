import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isScrollLocked: boolean;
  setIsScrollLocked: (locked: boolean) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScrollLocked, setIsScrollLocked] = useState(false);

  // 🚀 PREVENT SCROLLING when loading OR when explicitly locked - Works on ALL devices including iOS Safari
  useEffect(() => {
    const shouldLock = isLoading || isScrollLocked;
    
    if (shouldLock) {
      // Save current scroll position
      const scrollY = window.scrollY;
      
      // Prevent scrolling on both body and html
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      
      // Prevent ALL scroll events
      const preventScroll = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      // Prevent mouse wheel
      const preventWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      // Add all event listeners to block scrolling
      window.addEventListener('scroll', preventScroll, { passive: false });
      window.addEventListener('wheel', preventWheel, { passive: false });
      window.addEventListener('touchmove', preventScroll, { passive: false });
      document.addEventListener('scroll', preventScroll, { passive: false });
      document.addEventListener('wheel', preventWheel, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });
      
      return () => {
        // Re-enable scrolling
        const scrollY = document.body.style.top;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        
        // Remove ALL event listeners
        window.removeEventListener('scroll', preventScroll);
        window.removeEventListener('wheel', preventWheel);
        window.removeEventListener('touchmove', preventScroll);
        document.removeEventListener('scroll', preventScroll);
        document.removeEventListener('wheel', preventWheel);
        document.removeEventListener('touchmove', preventScroll);
        
        // Restore scroll position
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      };
    }
  }, [isLoading, isScrollLocked]);

  return (
    <LoadingContext.Provider value={{ isLoading, setIsLoading, isScrollLocked, setIsScrollLocked }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    // During HMR, return safe default instead of throwing
    if (import.meta.hot) {
      console.warn('⚠️ useLoading called during HMR before LoadingProvider is ready');
      return {
        isLoading: false,
        setIsLoading: () => {},
        isScrollLocked: false,
        setIsScrollLocked: () => {},
      };
    }
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}