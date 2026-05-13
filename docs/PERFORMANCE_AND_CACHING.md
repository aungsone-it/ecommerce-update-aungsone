# Performance and Caching

This document summarizes active performance and cache behavior that should be maintained.

## Goals

- Keep UI interactions near-instant for cart/wishlist/order surfaces.
- Minimize duplicate Supabase API calls.
- Preserve correctness under refresh, tab switching, and multi-device use.

## Current implemented patterns

### Cart and wishlist persistence

- Immediate local state + localStorage updates on mutation.
- Immediate server sync for critical mutations (including destructive actions).
- Keepalive usage for reliability during page transitions.
- Realtime/event-based refresh paths for cross-tab/device consistency.

### API usage controls

- Cache freshness checks before forced refetch.
- Session-based throttling for expensive maintenance calls.
- Ambient throttles for profile and background refresh operations.
- Shared fetch/caching helpers to reduce repeated calls.

### Error handling

- Network and timeout failures surface as explicit typed API errors.
- Fail-closed behavior for sensitive validations (example: SKU uniqueness checks).

## Engineering guardrails

When changing data-fetching behavior:
1. Avoid introducing aggressive polling loops.
2. Prefer event-driven invalidation over periodic hard refetch.
3. Keep cache invalidation scoped to affected entities.
4. Confirm behavior with immediate refresh and multi-tab checks.

## Verification checklist

- Add/remove/clear cart, then hard refresh immediately.
- Add/remove wishlist, then hard refresh immediately.
- Confirm changes appear across two logged-in sessions.
- Confirm admin/order badge updates do not trigger redundant bursts.
- Review Supabase usage dashboard after repetitive workflow testing.
