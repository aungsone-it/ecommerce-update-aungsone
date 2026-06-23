/**
 * Minimal service worker so vendor storefronts can be installed (Add to Home Screen / desktop shortcut).
 * Does not cache aggressively — installability only.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  /* network passthrough */
});
