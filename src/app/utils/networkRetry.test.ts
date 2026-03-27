import { describe, it, expect, vi } from "vitest";
import { withNetworkRetry, isLikelyTransientNetworkError } from "./networkRetry";

describe("isLikelyTransientNetworkError", () => {
  it("treats TypeError as transient", () => {
    expect(isLikelyTransientNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not treat AbortError as transient for retry purposes", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(isLikelyTransientNetworkError(e)).toBe(false);
  });
});

describe("withNetworkRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(withNetworkRetry(fn, { retries: 1 })).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on TypeError then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce("ok");
    await expect(withNetworkRetry(fn, { retries: 1, delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after retry exhausted", async () => {
    const err = new TypeError("fail");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withNetworkRetry(fn, { retries: 1, delayMs: 0 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
