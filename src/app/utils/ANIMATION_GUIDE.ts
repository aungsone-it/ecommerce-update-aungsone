/**
 * ============================================
 * MIGOO ANIMATION SYSTEM - COMPLETE GUIDE
 * ============================================
 * 
 * This document provides a comprehensive guide to using animations
 * throughout the Migoo e-commerce platform.
 * 
 * Design Philosophy:
 * - Fast and smooth animations for premium feel
 * - Minimal and professional (no excessive motion)
 * - Consistent timing and easing across all components
 * - Performance-optimized (GPU-accelerated transforms)
 */

// ============================================
// 1. PAGE TRANSITIONS
// ============================================

/**
 * AnimatedOutlet - Automatic page transitions
 * Already set up in routes.tsx - no action needed
 * Provides fade-in/fade-out between pages (0.2s duration)
 */

/**
 * PageTransition - Manual page wrapper
 * Use in individual pages for additional control
 * 
 * Example:
 * export function MyPage() {
 *   return (
 *     <PageTransition>
 *       <div>Page content</div>
 *     </PageTransition>
 *   );
 * }
 */

// ============================================
// 2. SCROLL ANIMATIONS
// ============================================

/**
 * FadeInScroll - Content fades in when scrolled into view
 * 
 * Basic usage:
 * <FadeInScroll>
 *   <div>Content here</div>
 * </FadeInScroll>
 * 
 * With options:
 * <FadeInScroll 
 *   delay={0.1}           // Delay before animation starts
 *   duration={0.3}        // Animation duration
 *   direction="up"        // up, down, left, right, none
 *   distance={20}         // Distance to move in pixels
 *   threshold={0.1}       // % visible before trigger
 *   triggerOnce={true}    // Animate once or repeatedly
 * >
 *   <div>Content</div>
 * </FadeInScroll>
 */

/**
 * Direct motion.div usage for scroll animations:
 * 
 * <motion.div
 *   initial={{ opacity: 0, y: 20 }}
 *   whileInView={{ opacity: 1, y: 0 }}
 *   viewport={{ once: true, margin: "-50px" }}
 *   transition={{ duration: 0.3, ease: "easeOut" }}
 * >
 *   Content
 * </motion.div>
 */

// ============================================
// 3. IMMEDIATE ANIMATIONS (No scroll trigger)
// ============================================

/**
 * FadeIn - Content fades in immediately on mount
 * 
 * Basic usage:
 * <FadeIn>
 *   <div>Content here</div>
 * </FadeIn>
 * 
 * With options:
 * <FadeIn 
 *   delay={0.1}
 *   duration={0.3}
 *   direction="up"
 *   distance={20}
 * >
 *   <div>Content</div>
 * </FadeIn>
 */

// ============================================
// 4. MODAL/DIALOG ANIMATIONS
// ============================================

/**
 * ModalTransition - Animated wrapper for modals
 * 
 * Usage:
 * <ModalTransition isOpen={isOpen} variant="scale">
 *   <div>Modal content</div>
 * </ModalTransition>
 * 
 * Variants:
 * - "fade": Simple fade
 * - "scale": Fade with scale (default for modals)
 * - "slideUp": Slide from bottom (sheets)
 * - "slideDown": Slide from top
 * - "slideLeft": Slide from right
 * - "slideRight": Slide from left
 */

/**
 * For ShadCN components (Dialog, Sheet, AlertDialog):
 * Wrap the content portion only, not the trigger
 * 
 * Example with Dialog:
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogTrigger>Open</DialogTrigger>
 *   <DialogContent>
 *     <ModalTransition isOpen={open} variant="scale">
 *       <DialogHeader>
 *         <DialogTitle>Title</DialogTitle>
 *       </DialogHeader>
 *       Content here
 *     </ModalTransition>
 *   </DialogContent>
 * </Dialog>
 */

// ============================================
// 5. LIST/GRID STAGGER ANIMATIONS
// ============================================

/**
 * StaggerContainer & StaggerItem - Staggered list animations
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
 * Or with scroll trigger:
 * <motion.div
 *   initial="hidden"
 *   whileInView="visible"
 *   viewport={{ once: true }}
 *   variants={{
 *     visible: {
 *       transition: { staggerChildren: 0.05 }
 *     }
 *   }}
 * >
 *   {items.map(item => (
 *     <motion.div
 *       key={item.id}
 *       variants={{
 *         hidden: { opacity: 0, y: 20 },
 *         visible: { opacity: 1, y: 0 }
 *       }}
 *     >
 *       {item.content}
 *     </motion.div>
 *   ))}
 * </motion.div>
 */

// ============================================
// 6. HOVER/INTERACTION ANIMATIONS
// ============================================

/**
 * Hover animations for cards and buttons
 * 
 * Scale up on hover:
 * <motion.div whileHover={{ scale: 1.02 }}>
 *   <Card>Content</Card>
 * </motion.div>
 * 
 * Lift up on hover:
 * <motion.div whileHover={{ y: -4 }}>
 *   <Card>Content</Card>
 * </motion.div>
 * 
 * Scale down on tap:
 * <motion.button whileTap={{ scale: 0.98 }}>
 *   <Button>Click me</Button>
 * </motion.button>
 */

// ============================================
// 7. ANIMATION UTILITIES
// ============================================

/**
 * Import pre-configured animation variants:
 * 
 * import { 
 *   fadeUpVariants,
 *   scrollFadeUp,
 *   staggerContainer,
 *   DURATIONS,
 *   EASINGS
 * } from '../utils/animations';
 * 
 * Use with motion components:
 * <motion.div
 *   initial="hidden"
 *   animate="visible"
 *   variants={fadeUpVariants}
 *   transition={{ duration: DURATIONS.medium }}
 * >
 *   Content
 * </motion.div>
 */

// ============================================
// 8. RECOMMENDED DURATIONS
// ============================================

/**
 * FAST (0.15s)
 * - Hover effects
 * - Focus states
 * - Button interactions
 * 
 * NORMAL (0.25s)
 * - Page transitions
 * - Modal open/close
 * - Simple fades
 * 
 * MEDIUM (0.3s)
 * - Content animations
 * - Stagger items
 * - Element reveals
 * 
 * SLOW (0.5s)
 * - Section scroll animations
 * - Hero animations
 * - Large content blocks
 */

// ============================================
// 9. BEST PRACTICES
// ============================================

/**
 * DO:
 * ✅ Use consistent durations across similar elements
 * ✅ Keep animations subtle and professional
 * ✅ Use "easeOut" for most animations
 * ✅ Set viewport.once = true for scroll animations
 * ✅ Use stagger for lists (0.03-0.08s delay)
 * ✅ Test on slower devices
 * 
 * DON'T:
 * ❌ Use animations longer than 0.5s
 * ❌ Animate width/height (use scale instead)
 * ❌ Add animations to every single element
 * ❌ Use "bounce" or "elastic" easings
 * ❌ Animate on scroll repeatedly (causes distraction)
 * ❌ Combine multiple complex animations
 */

// ============================================
// 10. PERFORMANCE TIPS
// ============================================

/**
 * GPU-accelerated properties (fast):
 * - opacity
 * - transform (scale, rotate, translate)
 * 
 * CPU-bound properties (avoid):
 * - width/height
 * - margin/padding
 * - top/left/right/bottom
 * - background-color (use with caution)
 * 
 * Optimization techniques:
 * - Use will-change sparingly
 * - Avoid animating many elements simultaneously
 * - Use AnimatePresence for exit animations
 * - Consider reducing motion for users who prefer it:
 *   @media (prefers-reduced-motion: reduce) {
 *     * { animation-duration: 0.01ms !important; }
 *   }
 */

// ============================================
// 11. COMMON PATTERNS
// ============================================

/**
 * PATTERN: Section fade-in on scroll
 * <motion.section
 *   initial={{ opacity: 0, y: 20 }}
 *   whileInView={{ opacity: 1, y: 0 }}
 *   viewport={{ once: true, margin: "-100px" }}
 *   transition={{ duration: 0.5, ease: "easeOut" }}
 * >
 *   Section content
 * </motion.section>
 * 
 * PATTERN: Product grid with stagger
 * <motion.div
 *   initial="hidden"
 *   whileInView="visible"
 *   viewport={{ once: true }}
 *   variants={{
 *     visible: { transition: { staggerChildren: 0.05 } }
 *   }}
 *   className="grid grid-cols-4 gap-6"
 * >
 *   {products.map(product => (
 *     <motion.div
 *       key={product.id}
 *       variants={{
 *         hidden: { opacity: 0, y: 20 },
 *         visible: { opacity: 1, y: 0 }
 *       }}
 *     >
 *       <ProductCard product={product} />
 *     </motion.div>
 *   ))}
 * </motion.div>
 * 
 * PATTERN: Page with animated sections
 * export function MyPage() {
 *   return (
 *     <>
 *       <FadeInScroll>
 *         <Header />
 *       </FadeInScroll>
 *       
 *       <FadeInScroll delay={0.1}>
 *         <HeroSection />
 *       </FadeInScroll>
 *       
 *       <FadeInScroll delay={0.2}>
 *         <ProductGrid />
 *       </FadeInScroll>
 *     </>
 *   );
 * }
 */

// ============================================
// 12. ANIMATION CHECKLIST
// ============================================

/**
 * Before adding an animation, ask:
 * 
 * 1. Does this animation serve a purpose?
 *    - Guide user attention
 *    - Provide feedback
 *    - Improve perceived performance
 * 
 * 2. Is the timing appropriate?
 *    - Too fast = jarring
 *    - Too slow = sluggish
 * 
 * 3. Does it match existing animations?
 *    - Consistency is key
 * 
 * 4. Does it work on mobile?
 *    - Test on actual devices
 * 
 * 5. Is it accessible?
 *    - Respect prefers-reduced-motion
 */

export {};
