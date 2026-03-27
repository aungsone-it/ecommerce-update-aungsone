/**
 * One retry for typical browser "failed to fetch" / transient network errors.
 * Does not retry on AbortError (timeouts or user cancel).
 */
export function isLikelyTransientNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const name = e && typeof e === "object" && "name" in e ? String((e as Error).name) : "";
  if (name === "AbortError") return false;
  return false;
}

export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; delayMs?: number }
): Promise<T> {
  const retries = opts?.retries ?? 1;
  const delayMs = opts?.delayMs ?? 500;
  try {
    return await fn();
  } catch (e) {
    if (retries > 0 && isLikelyTransientNetworkError(e)) {
      await new Promise((r) => setTimeout(r, delayMs));
      return fn();
    }
    throw e;
  }
}
