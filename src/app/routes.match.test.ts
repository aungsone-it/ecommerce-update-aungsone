import { describe, it, expect } from "vitest";
import { matchRoutes } from "react-router";
import { appRouteObjects } from "./routes";

describe("route matching", () => {
  it("matches super-admin and vendor admin order paths (not splat 404)", () => {
    const cases = [
      "/admin",
      "/admin/orders",
      "/admin/products",
      "/vendor/foo/admin",
      "/vendor/foo/admin/orders",
    ] as const;
    for (const pathname of cases) {
      const m = matchRoutes(appRouteObjects, pathname);
      expect(m, pathname).toBeTruthy();
      const leaf = m![m!.length - 1];
      expect(leaf.route.path, pathname).not.toBe("*");
    }
  });
});
