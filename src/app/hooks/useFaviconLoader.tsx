import { useEffect, useRef } from 'react';

/**
 * Hook to show loading indicator in the favicon
 * Creates a premium loading experience by animating the favicon
 */
export function useFaviconLoader() {
  const originalFaviconRef = useRef<string>('');
  const animationFrameRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);

  useEffect(() => {
    // Store original favicon
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (link) {
      originalFaviconRef.current = link.href;
    }
  }, []);

  const startLoading = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, 32, 32);
      
      // Draw background with rounded corners
      ctx.fillStyle = '#030213';
      ctx.beginPath();
      // Use roundRect if available, otherwise draw a regular rectangle
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, 32, 32, 6);
      } else {
        // Fallback to rect
        ctx.rect(0, 0, 32, 32);
      }
      ctx.fill();
      
      // Draw loading spinner
      ctx.strokeStyle = '#f59e0b'; // Amber color
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      
      // Draw rotating arc
      ctx.beginPath();
      ctx.arc(16, 16, 10, rotationRef.current, rotationRef.current + Math.PI * 1.5);
      ctx.stroke();
      
      // Increment rotation - optimized for smooth 60fps animation
      rotationRef.current += 0.2;
      
      // Update favicon
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (link) {
        link.href = canvas.toDataURL('image/png');
      }
      
      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
  };

  const stopLoading = () => {
    // Cancel animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    
    // Reset rotation
    rotationRef.current = 0;
    
    // Restore original favicon
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (link && originalFaviconRef.current) {
      link.href = originalFaviconRef.current;
    }
  };

  return { startLoading, stopLoading };
}