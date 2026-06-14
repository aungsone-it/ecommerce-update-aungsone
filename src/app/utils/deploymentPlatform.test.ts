import { describe, it, expect } from "vitest";
import { isEdgeOneDeployment, resolveCustomDomainCnameTarget } from "./deploymentPlatform";

describe("isEdgeOneDeployment", () => {
  it("detects edgeone.dev preview hosts", () => {
    expect(isEdgeOneDeployment("my-app.edgeone.dev")).toBe(true);
  });

  it("does not treat vercel hosts as edgeone", () => {
    expect(isEdgeOneDeployment("my-app.vercel.app")).toBe(false);
    expect(isEdgeOneDeployment("shop.example.com")).toBe(false);
  });
});

describe("resolveCustomDomainCnameTarget", () => {
  it("keeps vercel default off vercel hosts", () => {
    expect(resolveCustomDomainCnameTarget(undefined, "shop.example.com")).toBe(
      "cname.vercel-dns.com"
    );
  });

  it("hides vercel cname on edgeone hosts", () => {
    expect(resolveCustomDomainCnameTarget("cname.vercel-dns.com", "x.edgeone.dev")).toBe("");
  });

  it("hides vercel cname when backend marks edgeone", () => {
    expect(resolveCustomDomainCnameTarget("cname.vercel-dns.com", "shop.example.com", true)).toBe("");
  });

  it("prefers explicit api cname when not the vercel default", () => {
    expect(resolveCustomDomainCnameTarget("cname.edgeone.example", "x.edgeone.dev")).toBe(
      "cname.edgeone.example"
    );
  });
});
