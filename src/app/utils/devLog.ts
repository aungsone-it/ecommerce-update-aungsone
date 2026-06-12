/** Dev-only console helpers — no cache/debug noise in production builds. */
export const isDev = import.meta.env.DEV;

export function devLog(...args: unknown[]): void {
  if (isDev) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (isDev) console.warn(...args);
}
