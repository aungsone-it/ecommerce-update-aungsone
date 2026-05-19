import { describe, it, expect } from "vitest";
import {
  normalizeAdminOrderStatusForBadge,
  normalizePaymentBadgeStatus,
  normalizeShippingBadgeStatus,
  getCustomerOrderStatusLabel,
} from "./normalizeOrderBadgeStatus";

describe("normalizeOrderBadgeStatus", () => {
  it("maps API status strings that are not badge keys", () => {
    expect(normalizeAdminOrderStatusForBadge("shipped")).toBe("processing");
    expect(normalizeAdminOrderStatusForBadge("delivered")).toBe("fulfilled");
    expect(normalizeAdminOrderStatusForBadge("pending_payment")).toBe("pending");
    expect(normalizeAdminOrderStatusForBadge("unknown-xyz")).toBe("pending");
    expect(getCustomerOrderStatusLabel("pending_payment")).toBe("Pending");
  });

  it("normalizes payment and shipping", () => {
    expect(normalizePaymentBadgeStatus("")).toBe("unpaid");
    expect(normalizeShippingBadgeStatus("")).toBe("pending");
  });
});
