/**
 * Super-admin (platform) staff roles — Shopify-style tiers for the SECURE admin shell.
 * Maps auth KV `role` strings → which sidebar pages are allowed.
 */

/** Nav / AdminPage labels (must match SideNav + ADMIN_PAGES). */
export type SuperAdminNavPage =
  | "Home"
  | "Product"
  | "Categories"
  | "Inventory"
  | "Orders"
  | "Vendor"
  | "Promo Setting"
  | "Chat"
  | "Customers"
  | "Finances"
  | "Logistics"
  | "Settings"
  | "Search";

const ALL_PAGES: SuperAdminNavPage[] = [
  "Home",
  "Product",
  "Categories",
  "Inventory",
  "Orders",
  "Vendor",
  "Promo Setting",
  "Chat",
  "Customers",
  "Finances",
  "Logistics",
  "Settings",
  "Search",
];

const OWNER_ROLES = new Set([
  "super-admin",
  "store-owner",
]);

/** Only four roles are assignable; setup may still store `super-admin` (treated as owner). */
export const CANONICAL_STAFF_ROLES = [
  "store-owner",
  "administrator",
  "data-entry",
  "warehouse",
] as const;

/** Day-to-day ops; no Finances or Settings (Users). */
const ADMINISTRATOR_ROLES = new Set(["administrator"]);

/** Legacy roles → same access as Administrator until edited and saved. */
const LEGACY_AS_ADMINISTRATOR = new Set([
  "platform-admin",
  "product-manager",
  "developer",
]);

export function isOwnerRole(role: string | undefined): boolean {
  return OWNER_ROLES.has(String(role || "").trim());
}

export function isAdminTierRole(role: string | undefined): boolean {
  const r = String(role || "").trim();
  return (
    OWNER_ROLES.has(r) ||
    ADMINISTRATOR_ROLES.has(r) ||
    LEGACY_AS_ADMINISTRATOR.has(r)
  );
}

/** Normalize legacy / UI role names for permission checks. */
export function effectiveStaffRole(role: string | undefined): string {
  return String(role || "").trim();
}

/** Map stored KV role → permission tier (four-role model + legacy). */
export function normalizeRoleForPermissions(role: string | undefined): string {
  const r = effectiveStaffRole(role);
  if (OWNER_ROLES.has(r)) return "store-owner";
  if (ADMINISTRATOR_ROLES.has(r) || LEGACY_AS_ADMINISTRATOR.has(r)) return "administrator";
  if (r === "data-entry" || r === "warehouse") return r;
  return r;
}

export function getAllowedSuperAdminPages(role: string | undefined): Set<SuperAdminNavPage> {
  const tier = normalizeRoleForPermissions(role);

  if (tier === "store-owner") {
    return new Set(ALL_PAGES);
  }

  if (tier === "administrator") {
    return new Set(
      ALL_PAGES.filter((p) => p !== "Finances" && p !== "Settings")
    );
  }

  if (tier === "data-entry") {
    return new Set<SuperAdminNavPage>([
      "Home",
      "Product",
      "Categories",
      "Inventory",
      "Settings", // General + Appearance only; Users tab hidden in Settings.tsx
    ]);
  }

  if (tier === "warehouse") {
    return new Set<SuperAdminNavPage>(["Home", "Orders", "Inventory", "Logistics"]);
  }

  /** vendor-admin hitting super routes — treat as administrator */
  if (effectiveStaffRole(role) === "vendor-admin") {
    return new Set(
      ALL_PAGES.filter((p) => p !== "Finances" && p !== "Settings")
    );
  }

  /** Unknown roles: dashboard only so we never redirect-loop with an empty allow-list */
  return new Set<SuperAdminNavPage>(["Home"]);
}

export function canAccessSuperAdminPage(
  role: string | undefined,
  pageLabel: string
): boolean {
  const allowed = getAllowedSuperAdminPages(role);
  return allowed.has(pageLabel as SuperAdminNavPage);
}

export function getDefaultSuperAdminLandingPage(role: string | undefined): SuperAdminNavPage {
  const allowed = getAllowedSuperAdminPages(role);
  if (allowed.has("Home")) return "Home";
  const first = ALL_PAGES.find((p) => allowed.has(p));
  return first ?? "Home";
}

export type AssignableStaffRole = (typeof CANONICAL_STAFF_ROLES)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_STAFF_ROLES);

/** Creators that are not owners but may invite (administrator + legacy admin roles). */
function isAdministratorTierCreator(c: string): boolean {
  return ADMINISTRATOR_ROLES.has(c) || LEGACY_AS_ADMINISTRATOR.has(c);
}

export function canAssignStaffRole(
  creatorRole: string | undefined,
  targetRole: string
): boolean {
  const c = effectiveStaffRole(creatorRole);
  const t = String(targetRole || "").trim();

  if (!CANONICAL_SET.has(t)) {
    return false;
  }

  if (OWNER_ROLES.has(c)) {
    return true;
  }

  if (isAdministratorTierCreator(c)) {
    return t === "warehouse" || t === "data-entry";
  }

  return false;
}

export function assignableRolesForCreator(creatorRole: string | undefined): string[] {
  return CANONICAL_STAFF_ROLES.filter((r) => canAssignStaffRole(creatorRole, r));
}

/** True if this role may open the Users tab and invite/edit staff (with assign limits). */
export function canManageStaffAccounts(role: string | undefined): boolean {
  const r = effectiveStaffRole(role);
  return OWNER_ROLES.has(r) || isAdministratorTierCreator(r);
}

/** When saving a profile, persist one of the four canonical roles. */
export function canonicalizeStaffRoleForSave(role: string | undefined): string {
  const r = effectiveStaffRole(role);
  if (r === "super-admin") return "store-owner";
  if (LEGACY_AS_ADMINISTRATOR.has(r)) return "administrator";
  if (CANONICAL_SET.has(r)) return r;
  return "data-entry";
}
