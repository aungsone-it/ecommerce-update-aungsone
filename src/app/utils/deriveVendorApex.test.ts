import { describe, it, expect } from "vitest";
import { deriveNaiveVendorApexFromHost } from "./deriveVendorApex";

describe("deriveNaiveVendorApexFromHost", () => {
  it("returns apex for vendor subdomain", () => {
    expect(deriveNaiveVendorApexFromHost("gogo.walwal.online")).toBe("walwal.online");
  });

  it("returns null for apex host (no subdomain)", () => {
    expect(deriveNaiveVendorApexFromHost("walwal.online")).toBeNull();
  });

  it("returns null for localhost", () => {
    expect(deriveNaiveVendorApexFromHost("localhost")).toBeNull();
  });

  it("returns null for IPv4 literal", () => {
    expect(deriveNaiveVendorApexFromHost("127.0.0.1")).toBeNull();
  });

  it("strips port from host", () => {
    expect(deriveNaiveVendorApexFromHost("shop.example.com:5173")).toBe("example.com");
  });
});
