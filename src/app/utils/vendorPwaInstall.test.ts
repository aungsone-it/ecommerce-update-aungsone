import { describe, expect, it } from "vitest";
import {
  buildVendorPwaPaths,
  buildVendorWebManifest,
  truncatePwaShortName,
} from "./vendorPwaInstall";

describe("buildVendorPwaPaths", () => {
  it("scopes path-based vendor stores under /vendor/:slug/", () => {
    expect(buildVendorPwaPaths({ pathSlug: "migoo" })).toEqual({
      startUrl: "/vendor/migoo/",
      scope: "/vendor/migoo/",
      manifestId: "/vendor/migoo/?vendor-pwa=1",
    });
  });

  it("uses root scope on vendor subdomain hosts", () => {
    expect(buildVendorPwaPaths({ pathSlug: "migoo", hostRootStorePaths: true })).toEqual({
      startUrl: "/",
      scope: "/",
      manifestId: "/?vendor-pwa=1",
    });
  });
});

describe("buildVendorWebManifest", () => {
  it("embeds vendor branding and scoped start URL", () => {
    const paths = buildVendorPwaPaths({ pathSlug: "migoo" });
    const manifest = buildVendorWebManifest(
      { storeName: "MIGOO", storeLogo: "https://cdn.example/logo.png" },
      paths,
    );
    expect(manifest.name).toBe("MIGOO");
    expect(manifest.start_url).toBe("/vendor/migoo/");
    expect(manifest.scope).toBe("/vendor/migoo/");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
  });
});

describe("truncatePwaShortName", () => {
  it("truncates long store names for short_name", () => {
    expect(truncatePwaShortName("Very Long Store Name")).toBe("Very Long S…");
  });
});
