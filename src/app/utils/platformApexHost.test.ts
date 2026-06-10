import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isBarePlatformApexHost,
  isMarketplaceApexHost,
  isReservedPlatformApexHost,
  resolvePrimaryPlatformApexHost,
  resolveVendorSubdomainApexFromHost,
  stripWwwHost,
} from "./platformApexHost";

describe("platformApexHost", () => {
  const env = import.meta.env;

  beforeEach(() => {
    delete (env as Record<string, string | undefined>).VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN;
    delete (env as Record<string, string | undefined>).VITE_PLATFORM_RESERVED_APEX_DOMAINS;
  });

  afterEach(() => {
    delete (env as Record<string, string | undefined>).VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN;
    delete (env as Record<string, string | undefined>).VITE_PLATFORM_RESERVED_APEX_DOMAINS;
  });

  it("detects bare production apex hosts", () => {
    expect(isBarePlatformApexHost("newbrand.com")).toBe(true);
    expect(isBarePlatformApexHost("www.newbrand.com")).toBe(true);
    expect(isBarePlatformApexHost("gogo.newbrand.com")).toBe(false);
    expect(isBarePlatformApexHost("preview.vercel.app")).toBe(false);
    expect(isBarePlatformApexHost("localhost")).toBe(false);
  });

  it("treats unclaimed bare apex as marketplace", () => {
    expect(isMarketplaceApexHost("newbrand.com")).toBe(true);
    expect(isMarketplaceApexHost("www.newbrand.com")).toBe(true);
  });

  it("marks env primary apex as reserved", () => {
    env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN = "walwal.online";
    expect(isReservedPlatformApexHost("walwal.online")).toBe(true);
    expect(isReservedPlatformApexHost("www.walwal.online")).toBe(true);
    expect(isReservedPlatformApexHost("newbrand.com")).toBe(false);
  });

  it("derives vendor subdomain apex from host", () => {
    expect(resolveVendorSubdomainApexFromHost("gogo.walwal.online")).toBe("walwal.online");
    expect(resolveVendorSubdomainApexFromHost("walwal.online")).toBe("walwal.online");
    expect(stripWwwHost("www.walwal.online")).toBe("walwal.online");
  });

  it("uses env for primary platform apex", () => {
    env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN = "buyer.com";
    expect(resolvePrimaryPlatformApexHost()).toBe("buyer.com");
  });
});
