/**
 * Minimal service worker required for install prompt eligibility.
 * Keep runtime behavior as network-first passthrough.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // passthrough
});
