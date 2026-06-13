import { describe, it, expect } from "vitest";
import { deriveNaiveVendorApexFromHost } from "./deriveVendorApex";

describe("deriveNaiveVendorApexFromHost", () => {
  it("returns apex for vendor subdomain", () => {
    expect(deriveNaiveVendorApexFromHost("gogo.walwal.online")).toBe("walwal.online");
  });

  it("returns null for apex host (no subdomain)", () => {
    expect(deriveNaiveVendorApexFromHost("walwal.online")).toBeNull();
  });

  it("returns localhost apex for vendor subdomain (local dev)", () => {
    expect(deriveNaiveVendorApexFromHost("gogo.localhost")).toBe("localhost");
    expect(deriveNaiveVendorApexFromHost("gogot.localhost:5173")).toBe("localhost");
  });

  it("returns null for bare localhost", () => {
    expect(deriveNaiveVendorApexFromHost("localhost")).toBeNull();
  });

  it("returns null for IPv4 literal", () => {
    expect(deriveNaiveVendorApexFromHost("127.0.0.1")).toBeNull();
  });

  it("strips port from host", () => {
    expect(deriveNaiveVendorApexFromHost("shop.example.com:5173")).toBe("example.com");
  });

  it("returns null for Netlify deploy hostnames (not a real vendor apex)", () => {
    expect(deriveNaiveVendorApexFromHost("ecommerce-aungsone.netlify.app")).toBeNull();
  });

  it("returns null for Vercel deploy hostnames", () => {
    expect(deriveNaiveVendorApexFromHost("my-app.vercel.app")).toBeNull();
  });

  it("returns null for Tencent EdgeOne preview hostnames", () => {
    expect(deriveNaiveVendorApexFromHost("ecommerce-update-aungsone.edgeone.dev")).toBeNull();
  });

  it("returns null for Railway deploy hostnames (*.up.railway.app)", () => {
    expect(
      deriveNaiveVendorApexFromHost("ecommerce-update-aungsone-production-0d2f.up.railway.app")
    ).toBeNull();
  });
});
