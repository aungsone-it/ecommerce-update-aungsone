import { motion } from "motion/react";
import { ReactNode } from "react";

interface FadeInScrollProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  threshold?: number;
  triggerOnce?: boolean;
}

/**
 * FadeInScroll - Scroll-triggered fade-in animation component
 * 
 * Usage:
 * <FadeInScroll>Content fades in when scrolled into view</FadeInScroll>
 * <FadeInScroll delay={0.1} direction="up">Delayed content</FadeInScroll>
 * <FadeInScroll threshold={0.2} triggerOnce={false}>Repeating animation</FadeInScroll>
 * 
 * Props:
 * - delay: Animation delay in seconds (default: 0)
 * - duration: Animation duration in seconds (default: 0.3)
 * - direction: Animation direction - up, down, left, right, none (default: "up")
 * - distance: Distance to move in pixels (default: 20)
 * - threshold: Percentage of element visible before triggering (default: 0.1)
 * - triggerOnce: Whether animation triggers only once (default: true)
 * - className: Additional CSS classes
 */
export function FadeInScroll({
  children,
  delay = 0,
  duration = 0.3,
  className = "",
  direction = "up",
  distance = 20,
  threshold = 0.1,
  triggerOnce = true,
}: FadeInScrollProps) {
  const getInitialPosition = () => {
    switch (direction) {
      case "up":
        return { y: distance };
      case "down":
        return { y: -distance };
      case "left":
        return { x: distance };
      case "right":
        return { x: -distance };
      case "none":
        return {};
      default:
        return { y: distance };
    }
  };

  const getAnimatePosition = () => {
    switch (direction) {
      case "up":
      case "down":
        return { y: 0 };
      case "left":
      case "right":
        return { x: 0 };
      case "none":
        return {};
      default:
        return { y: 0 };
    }
  };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...getInitialPosition() }}
      whileInView={{ opacity: 1, ...getAnimatePosition() }}
      viewport={{ 
        once: triggerOnce, 
        amount: threshold,
        margin: "-50px" // Trigger slightly before element is visible
      }}
      transition={{
        duration,
        delay,
        ease: "easeOut",
      }}
    >
      {children}
    </motion.div>
  );
}
