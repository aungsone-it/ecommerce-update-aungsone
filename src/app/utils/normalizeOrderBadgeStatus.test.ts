import { describe, it, expect } from "vitest";
import {
  normalizeAdminOrderStatusForBadge,
  normalizePaymentBadgeStatus,
  normalizeShippingBadgeStatus,
  getCustomerOrderStatusLabel,
  derivePaymentStatusFromOrder,
  deriveShippingStatusFromOrder,
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
    expect(normalizeShippingBadgeStatus("cancelled")).toBe("cancelled");
  });

  it("derives cancelled order badges", () => {
    expect(
      derivePaymentStatusFromOrder({ status: "cancelled", paymentStatus: "unpaid" })
    ).toBe("pending_refund");
    expect(deriveShippingStatusFromOrder({ status: "cancelled" })).toBe("cancelled");
    expect(
      derivePaymentStatusFromOrder({ status: "cancelled", paymentStatus: "refunded" })
    ).toBe("refunded");
  });
});
