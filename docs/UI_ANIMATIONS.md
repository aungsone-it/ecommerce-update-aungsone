# UI Animations Reference

This file is the canonical animation note for active UI behavior.

## Current approach

- The app is animation-light by default.
- Route transitions primarily rely on logical route grouping and remount control.
- UX feedback animations should prioritize clarity over decorative complexity.

## Key location

- Route transition grouping logic: `src/app/components/AnimatedOutlet.tsx`

## Guidelines for future animation work

1. Keep animation durations short and predictable.
2. Do not block data rendering while animation runs.
3. Avoid heavy animation libraries for critical-route first paint.
4. Maintain accessibility (reduced motion support where applicable).

## When updating animations

- Validate admin, vendor, and storefront route transitions.
- Confirm no flicker/regression in product detail navigation.
- Confirm loading placeholders remain understandable without animation.
