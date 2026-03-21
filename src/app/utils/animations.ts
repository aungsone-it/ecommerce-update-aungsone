/**
 * Animation Utilities - Centralized animation configurations
 * 
 * This file contains reusable animation variants and configurations
 * for consistent animations throughout the Migoo platform.
 * 
 * Design Philosophy: Fast, smooth, and minimal animations for premium feel
 */

// ============================================
// ANIMATION DURATIONS
// ============================================
export const DURATIONS = {
  fast: 0.15,      // Quick interactions (hover, focus)
  normal: 0.25,    // Standard animations (page transitions)
  medium: 0.3,     // Content animations (fade-in)
  slow: 0.5,       // Scroll animations (sections)
} as const;

// ============================================
// EASING FUNCTIONS
// ============================================
export const EASINGS = {
  easeOut: "easeOut",
  easeIn: "easeIn",
  easeInOut: "easeInOut",
  smooth: [0.43, 0.13, 0.23, 0.96], // Custom smooth curve
} as const;

// ============================================
// FADE VARIANTS
// ============================================
export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const fadeDownVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 },
};

export const fadeLeftVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
};

export const fadeRightVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

// ============================================
// SCALE VARIANTS
// ============================================
export const scaleVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

export const scaleUpVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

// ============================================
// SLIDE VARIANTS
// ============================================
export const slideUpVariants = {
  hidden: { y: "100%" },
  visible: { y: 0 },
};

export const slideDownVariants = {
  hidden: { y: "-100%" },
  visible: { y: 0 },
};

export const slideLeftVariants = {
  hidden: { x: "100%" },
  visible: { x: 0 },
};

export const slideRightVariants = {
  hidden: { x: "-100%" },
  visible: { x: 0 },
};

// ============================================
// PAGE TRANSITION CONFIGURATIONS
// ============================================
export const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: DURATIONS.normal, ease: EASINGS.easeOut },
};

export const pageTransitionFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATIONS.normal, ease: EASINGS.easeOut },
};

// ============================================
// MODAL/DIALOG TRANSITION CONFIGURATIONS
// ============================================
export const modalTransition = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: DURATIONS.fast, ease: EASINGS.easeOut },
};

export const sheetTransition = {
  initial: { opacity: 0, y: 50 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 50 },
  transition: { duration: DURATIONS.normal, ease: EASINGS.easeOut },
};

// ============================================
// SCROLL ANIMATION CONFIGURATIONS
// ============================================
export const scrollFadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px", amount: 0.1 },
  transition: { duration: DURATIONS.medium, ease: EASINGS.easeOut },
};

export const scrollFadeUpSlow = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px", amount: 0.1 },
  transition: { duration: DURATIONS.slow, ease: EASINGS.easeOut },
};

// ============================================
// STAGGER CONFIGURATIONS
// ============================================
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0,
    },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATIONS.medium,
      ease: EASINGS.easeOut,
    },
  },
};

// ============================================
// HOVER/INTERACTION ANIMATIONS
// ============================================
export const hoverScale = {
  scale: 1.02,
  transition: { duration: DURATIONS.fast, ease: EASINGS.easeOut },
};

export const hoverLift = {
  y: -4,
  transition: { duration: DURATIONS.fast, ease: EASINGS.easeOut },
};

export const tapScale = {
  scale: 0.98,
  transition: { duration: DURATIONS.fast, ease: EASINGS.easeOut },
};

// ============================================
// VIEWPORT CONFIGURATIONS
// ============================================
export const viewportConfig = {
  default: { once: true, amount: 0.1, margin: "-50px" },
  repeat: { once: false, amount: 0.1, margin: "-50px" },
  eager: { once: true, amount: 0, margin: "0px" },
  lazy: { once: true, amount: 0.3, margin: "-100px" },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Creates a custom stagger configuration
 */
export function createStagger(delayBetween = 0.05, initialDelay = 0) {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: delayBetween,
        delayChildren: initialDelay,
      },
    },
  };
}

/**
 * Creates a custom fade-in configuration with direction
 */
export function createFade(
  direction: "up" | "down" | "left" | "right" | "none" = "up",
  distance = 20
) {
  const positions = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
    none: {},
  };

  const animatePositions = {
    up: { y: 0 },
    down: { y: 0 },
    left: { x: 0 },
    right: { x: 0 },
    none: {},
  };

  return {
    hidden: { opacity: 0, ...positions[direction] },
    visible: { opacity: 1, ...animatePositions[direction] },
  };
}

/**
 * Creates a viewport configuration
 */
export function createViewport(
  once = true,
  amount = 0.1,
  margin = "-50px"
) {
  return { once, amount, margin };
}
