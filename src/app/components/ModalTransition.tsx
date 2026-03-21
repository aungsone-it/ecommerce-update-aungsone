import { motion, AnimatePresence } from "motion/react";
import { ReactNode } from "react";

interface ModalTransitionProps {
  children: ReactNode;
  isOpen: boolean;
  className?: string;
  variant?: "fade" | "scale" | "slideUp" | "slideDown" | "slideLeft" | "slideRight";
}

/**
 * ModalTransition - Animation wrapper for modals, dialogs, sheets, and popovers
 * 
 * Usage:
 * <ModalTransition isOpen={isOpen} variant="scale">
 *   <div>Modal content</div>
 * </ModalTransition>
 * 
 * Props:
 * - isOpen: Controls visibility and animation
 * - variant: Animation type (default: "scale")
 *   - "fade": Simple fade in/out
 *   - "scale": Fade with scale (modal-like)
 *   - "slideUp": Slide from bottom (sheet-like)
 *   - "slideDown": Slide from top
 *   - "slideLeft": Slide from right
 *   - "slideRight": Slide from left
 * - className: Additional CSS classes
 */
export function ModalTransition({
  children,
  isOpen,
  className = "",
  variant = "scale",
}: ModalTransitionProps) {
  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2, ease: "easeOut" },
    },
    scale: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
      transition: { duration: 0.2, ease: "easeOut" },
    },
    slideUp: {
      initial: { opacity: 0, y: 50 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 50 },
      transition: { duration: 0.25, ease: "easeOut" },
    },
    slideDown: {
      initial: { opacity: 0, y: -50 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -50 },
      transition: { duration: 0.25, ease: "easeOut" },
    },
    slideLeft: {
      initial: { opacity: 0, x: 50 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 50 },
      transition: { duration: 0.25, ease: "easeOut" },
    },
    slideRight: {
      initial: { opacity: 0, x: -50 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -50 },
      transition: { duration: 0.25, ease: "easeOut" },
    },
  };

  const selectedVariant = variants[variant];

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className={className}
          initial={selectedVariant.initial}
          animate={selectedVariant.animate}
          exit={selectedVariant.exit}
          transition={selectedVariant.transition}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
