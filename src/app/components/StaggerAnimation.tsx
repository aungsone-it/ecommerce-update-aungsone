import { motion } from "motion/react";
import { ReactNode } from "react";

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  initialDelay?: number;
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  index?: number;
}

/**
 * StaggerContainer & StaggerItem - Staggered animation components for lists and grids
 * 
 * Usage:
 * <StaggerContainer staggerDelay={0.05}>
 *   {items.map((item, index) => (
 *     <StaggerItem key={item.id} index={index}>
 *       <div>{item.content}</div>
 *     </StaggerItem>
 *   ))}
 * </StaggerContainer>
 * 
 * StaggerContainer Props:
 * - staggerDelay: Delay between each child animation (default: 0.05s)
 * - initialDelay: Delay before first animation starts (default: 0s)
 * - className: Additional CSS classes
 * 
 * StaggerItem Props:
 * - index: Item index for stagger calculation (auto-increments if not provided)
 * - className: Additional CSS classes
 */

export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.05,
  initialDelay = 0,
}: StaggerContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: {
            delayChildren: initialDelay,
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", index = 0 }: StaggerItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { 
          opacity: 1, 
          y: 0,
          transition: {
            duration: 0.3,
            ease: "easeOut",
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
