import { describe, it, expect } from "vitest";
import {
  normalizeAdminOrderStatusForBadge,
  normalizePaymentBadgeStatus,
  normalizeShippingBadgeStatus,
} from "./normalizeOrderBadgeStatus";

describe("normalizeOrderBadgeStatus", () => {
  it("maps API status strings that are not badge keys", () => {
    expect(normalizeAdminOrderStatusForBadge("shipped")).toBe("processing");
    expect(normalizeAdminOrderStatusForBadge("delivered")).toBe("fulfilled");
    expect(normalizeAdminOrderStatusForBadge("unknown-xyz")).toBe("pending");
  });

  it("normalizes payment and shipping", () => {
    expect(normalizePaymentBadgeStatus("")).toBe("unpaid");
    expect(normalizeShippingBadgeStatus("")).toBe("pending");
  });
});
