import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition - Wrapper component for individual pages
 * 
 * NO animations - instant page display for zero UI flashing
 * Scroll is handled by ScrollController at router level
 */
export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
