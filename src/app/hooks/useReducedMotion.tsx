import { useEffect, useState } from 'react';

/**
 * useReducedMotion - Hook to detect user's motion preferences
 * 
 * Respects the user's accessibility settings for reduced motion.
 * Returns true if user prefers reduced motion.
 * 
 * Usage:
 * const prefersReducedMotion = useReducedMotion();
 * const duration = prefersReducedMotion ? 0.01 : 0.3;
 * 
 * Or conditionally disable animations:
 * {!prefersReducedMotion && <FadeIn>Content</FadeIn>}
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if window is available (SSR safety)
    if (typeof window === 'undefined') {
      return;
    }

    // Create media query
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // Add listener (use addEventListener for better browser support)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  return prefersReducedMotion;
}

/**
 * useAnimationConfig - Hook that returns appropriate animation config
 * based on user's motion preferences
 * 
 * Usage:
 * const { duration, shouldAnimate } = useAnimationConfig();
 * 
 * <motion.div
 *   animate={shouldAnimate ? { opacity: 1 } : {}}
 *   transition={{ duration }}
 * >
 *   Content
 * </motion.div>
 */
export function useAnimationConfig(defaultDuration = 0.3) {
  const prefersReducedMotion = useReducedMotion();

  return {
    duration: prefersReducedMotion ? 0.01 : defaultDuration,
    shouldAnimate: !prefersReducedMotion,
    prefersReducedMotion,
  };
}
