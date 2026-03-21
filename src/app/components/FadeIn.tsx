import { motion } from "motion/react";
import { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
}

/**
 * FadeIn - Reusable fade-in animation component
 * 
 * Usage:
 * <FadeIn>Content here</FadeIn>
 * <FadeIn delay={0.1} direction="up">Delayed content</FadeIn>
 * <FadeIn duration={0.3} direction="left" distance={30}>Custom animation</FadeIn>
 * 
 * Props:
 * - delay: Animation delay in seconds (default: 0)
 * - duration: Animation duration in seconds (default: 0.3)
 * - direction: Animation direction - up, down, left, right, none (default: "up")
 * - distance: Distance to move in pixels (default: 20)
 * - className: Additional CSS classes
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 0.3,
  className = "",
  direction = "up",
  distance = 20,
}: FadeInProps) {
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
      animate={{ opacity: 1, ...getAnimatePosition() }}
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
