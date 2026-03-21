# 🚀 Animation Quick Start Guide

## ✅ What's Already Working

### 1. **Page Transitions** - AUTOMATIC ✨
Every time you navigate between pages, you'll see smooth fade-in/fade-out animations.
- Duration: 0.2s (fast and snappy)
- No code needed - already integrated in your routing!

### 2. **Scroll Animations** - ACTIVE ✨
Your 7 storefront home page sections already have smooth scroll animations:
- Categories section
- View Our Sales
- Promotional Campaigns
- Watches section
- Clothing section
- Cosmetics section
- Kitchen section

### 3. **Product Cards** - ENHANCED ✨
All product cards now have:
- Lift animation on hover (moves up smoothly)
- Button tap animations (shrinks slightly when clicked)
- Professional feel with 0.15s duration

### 4. **404 Page** - FULLY ANIMATED ✨
Sequential fade-ins with different directions and delays

---

## 🎯 Add Animations to New Components

### Option 1: Scroll Animation (Most Common)
**When**: Content should fade in when user scrolls to it

```tsx
import { FadeInScroll } from './components/FadeInScroll';

<FadeInScroll>
  <div className="py-10">
    <h2>My Section Title</h2>
    <p>Section content here</p>
  </div>
</FadeInScroll>
```

### Option 2: Immediate Fade-In
**When**: Content should animate immediately on page load

```tsx
import { FadeIn } from './components/FadeIn';

<FadeIn delay={0.2}>
  <div>This fades in after 0.2s</div>
</FadeIn>
```

### Option 3: Hover Effect on Cards
**When**: Add interactive hover animations

```tsx
import { motion } from 'motion/react';

<motion.div whileHover={{ y: -4 }}>
  <Card>Card content</Card>
</motion.div>
```

### Option 4: Button Tap Animation
**When**: Add click feedback to buttons

```tsx
import { motion } from 'motion/react';

<motion.button
  whileTap={{ scale: 0.95 }}
  className="..."
>
  Click Me
</motion.button>
```

### Option 5: Stagger Grid/List
**When**: Animate items in a grid or list sequentially

```tsx
import { StaggerContainer, StaggerItem } from './components/StaggerAnimation';

<StaggerContainer>
  {items.map((item, index) => (
    <StaggerItem key={item.id} index={index}>
      <ProductCard product={item} />
    </StaggerItem>
  ))}
</StaggerContainer>
```

---

## 📋 Component Reference

| Component | Use Case | Import |
|-----------|----------|--------|
| `FadeInScroll` | Scroll-triggered fade-in | `import { FadeInScroll } from './components/FadeInScroll'` |
| `FadeIn` | Immediate fade-in | `import { FadeIn } from './components/FadeIn'` |
| `PageTransition` | Page wrapper | `import { PageTransition } from './components/PageTransition'` |
| `ModalTransition` | Modal/dialog animations | `import { ModalTransition } from './components/ModalTransition'` |
| `StaggerContainer`/`StaggerItem` | List animations | `import { StaggerContainer, StaggerItem } from './components/StaggerAnimation'` |
| `motion.div` | Custom animations | `import { motion } from 'motion/react'` |

---

## ⚡ Quick Copy-Paste Examples

### Animated Section
```tsx
import { FadeInScroll } from './components/FadeInScroll';

<FadeInScroll>
  <section className="py-10">
    <h2 className="text-3xl font-bold mb-6">Featured Products</h2>
    <ProductGrid />
  </section>
</FadeInScroll>
```

### Animated Card with Hover
```tsx
import { motion } from 'motion/react';

<motion.div 
  whileHover={{ y: -4, scale: 1.02 }}
  transition={{ duration: 0.2 }}
>
  <Card>
    <CardHeader>
      <CardTitle>Card Title</CardTitle>
    </CardHeader>
    <CardContent>Content here</CardContent>
  </Card>
</motion.div>
```

### Animated Button
```tsx
import { motion } from 'motion/react';

<motion.div whileTap={{ scale: 0.95 }}>
  <Button>Click Me</Button>
</motion.div>
```

### Staggered Product Grid
```tsx
import { motion } from 'motion/react';

<motion.div
  className="grid grid-cols-4 gap-6"
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true }}
  variants={{
    visible: { transition: { staggerChildren: 0.05 } }
  }}
>
  {products.map(product => (
    <motion.div
      key={product.id}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
    >
      <ProductCard product={product} />
    </motion.div>
  ))}
</motion.div>
```

### Modal with Animation
```tsx
import { Dialog, DialogContent } from './components/ui/dialog';
import { ModalTransition } from './components/ModalTransition';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <ModalTransition isOpen={open} variant="scale">
      <DialogHeader>
        <DialogTitle>Modal Title</DialogTitle>
      </DialogHeader>
      <p>Modal content</p>
    </ModalTransition>
  </DialogContent>
</Dialog>
```

---

## 🎨 Customization

### Direction Options
- `direction="up"` - Slides up (default)
- `direction="down"` - Slides down
- `direction="left"` - Slides left
- `direction="right"` - Slides right
- `direction="none"` - Fade only (no movement)

### Duration Options
- `duration={0.15}` - Very fast (hover effects)
- `duration={0.25}` - Fast (page transitions)
- `duration={0.3}` - Normal (default, content)
- `duration={0.5}` - Slow (sections)

### Delay Options
```tsx
<FadeIn delay={0}>First item</FadeIn>
<FadeIn delay={0.1}>Second item</FadeIn>
<FadeIn delay={0.2}>Third item</FadeIn>
```

---

## 📚 Full Documentation

For complete details, see:
- **Complete Guide**: `/ANIMATIONS_README.md`
- **Detailed Examples**: `/src/app/utils/ANIMATION_GUIDE.ts`
- **Example Component**: `/src/app/pages/NotFound.tsx`
- **Example Card**: `/src/app/components/ProductCard.tsx`

---

## 🎉 That's It!

Your animation system is fully set up and ready to use. Start by adding `FadeInScroll` to your sections and `motion.div` hover effects to your cards!

**Remember**: Keep animations subtle and fast (0.15s - 0.5s) for the best professional feel.
