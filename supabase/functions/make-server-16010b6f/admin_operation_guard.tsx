import type { Context } from "npm:hono@4";

/**
 * Guards destructive / bulk admin routes. Set `EDGE_ADMIN_OPERATION_SECRET` in Supabase
 * Edge secrets and send header `x-admin-operation-secret` from trusted callers.
 *
 * For local dev only, you may set `ALLOW_UNAUTHENTICATED_DESTRUCTIVE=1` (never in production).
 */
export function assertDestructiveOperationAllowed(c: Context): Response | undefined {
  return assertAdminSecretAllowed(c, "bulk/clear routes are not secret-protected");
}

/** Guards non-destructive admin-only diagnostics/monitoring routes. */
export function assertAdminMonitoringAllowed(c: Context): Response | undefined {
  return assertAdminSecretAllowed(c, "admin monitoring routes are not secret-protected");
}

function assertAdminSecretAllowed(c: Context, legacyWarning: string): Response | undefined {
  const allowLegacy = String(Deno.env.get("ALLOW_UNAUTHENTICATED_DESTRUCTIVE") || "").trim() === "1";
  if (allowLegacy) {
    console.warn(
      `[security] ALLOW_UNAUTHENTICATED_DESTRUCTIVE=1 — ${legacyWarning}`,
    );
    return undefined;
  }

  const expected = String(Deno.env.get("EDGE_ADMIN_OPERATION_SECRET") || "").trim();
  if (!expected) {
    return new Response(
      JSON.stringify({
        error: "misconfigured",
        message:
          "Set EDGE_ADMIN_OPERATION_SECRET on the Edge function, or use ALLOW_UNAUTHENTICATED_DESTRUCTIVE=1 for local dev only.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const provided = String(c.req.header("x-admin-operation-secret") || "").trim();
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  return undefined;
}
