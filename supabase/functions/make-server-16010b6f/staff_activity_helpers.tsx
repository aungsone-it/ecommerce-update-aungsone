import * as kv from "./kv_store.tsx";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Roles allowed to appear in the super-admin Activities feed. */
const STAFF_AUDIT_ROLES = new Set([
  "super-admin",
  "store-owner",
  "administrator",
  "data-entry",
  "warehouse",
  "platform-admin",
  "product-manager",
  "developer",
  "vendor-admin",
  "collaborator",
]);

const MAX_ACTIVITIES = 150;
const MAX_GLOBAL_FEED = 500;
const GLOBAL_FEED_KEY = "staff:activity:global-feed";

function staffActivityKey(userId: string): string {
  return `staff:activity:${userId}`;
}

export function isValidStaffActorId(id: string | undefined | null): id is string {
  return typeof id === "string" && STAFF_UUID_RE.test(id.trim());
}

export async function isStaffAuditActor(id: string | undefined | null): Promise<boolean> {
  if (!isValidStaffActorId(id)) return false;
  const uid = id.trim();
  try {
    const profile = await kv.get(`auth:user:${uid}`);
    if (!profile || typeof profile !== "object") return false;
    const role = String((profile as Record<string, unknown>).role || "").trim();
    if (!role || role === "customer") return false;
    return STAFF_AUDIT_ROLES.has(role);
  } catch {
    return false;
  }
}

export type StaffActivityEntry = {
  id: string;
  type:
    | "product_created"
    | "product_updated"
    | "product_deleted"
    | "user_created"
    | "user_updated"
    | "user_deleted"
    | "password_reset"
    | "admin_action";
  action: string;
  detail: string;
  at: string;
};

export type StaffActivityFeedEntry = StaffActivityEntry & {
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
};

async function resolveActorMeta(userId: string): Promise<{
  actorName: string;
  actorEmail: string;
  actorRole: string;
}> {
  try {
    const profile = await kv.get(`auth:user:${userId}`);
    if (!profile || typeof profile !== "object") {
      return { actorName: "", actorEmail: "", actorRole: "" };
    }
    const p = profile as Record<string, unknown>;
    const email = String(p.email || "").trim();
    const name = String(p.name || "").trim();
    return {
      actorName: name || email,
      actorEmail: email,
      actorRole: String(p.role || "").trim(),
    };
  } catch {
    return { actorName: "", actorEmail: "", actorRole: "" };
  }
}

async function appendGlobalFeed(uid: string, row: StaffActivityEntry): Promise<void> {
  const actor = await resolveActorMeta(uid);
  const feedEntry: StaffActivityFeedEntry = {
    ...row,
    actorUserId: uid,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
  };
  const prevFeed = await kv.get(GLOBAL_FEED_KEY);
  const feedArr = Array.isArray(prevFeed) ? (prevFeed as StaffActivityFeedEntry[]) : [];
  const next = [feedEntry, ...feedArr].slice(0, MAX_GLOBAL_FEED);
  await kv.set(GLOBAL_FEED_KEY, next);
}

/** One-time backfill when global feed is empty (legacy per-user keys only). */
export async function rebuildGlobalStaffActivityFeed(): Promise<StaffActivityFeedEntry[]> {
  const rows = await kv.getByPrefixWithKeys("staff:activity:");
  const userProfiles = new Map<
    string,
    { name: string; email: string; role: string }
  >();

  const userIds = (await kv.get("auth:users-list")) || [];
  for (const userId of userIds) {
    const id = String(userId);
    const profile = await kv.get(`auth:user:${id}`);
    if (!profile || typeof profile !== "object") continue;
    const p = profile as Record<string, unknown>;
    userProfiles.set(id, {
      name: String(p.name || "").trim(),
      email: String(p.email || "").trim(),
      role: String(p.role || "").trim(),
    });
  }

  const flat: StaffActivityFeedEntry[] = [];
  for (const row of rows) {
    const key = row.key;
    if (key === GLOBAL_FEED_KEY || !key.startsWith("staff:activity:")) continue;
    const actorUserId = key.slice("staff:activity:".length).trim();
    if (!isValidStaffActorId(actorUserId)) continue;

    const profile = userProfiles.get(actorUserId);
    const activities = Array.isArray(row.value) ? row.value : [];
    for (const act of activities) {
      if (!act || typeof act !== "object") continue;
      const entry = act as StaffActivityEntry;
      if (typeof entry.id !== "string" || typeof entry.action !== "string") continue;
      flat.push({
        id: entry.id,
        type: entry.type,
        action: entry.action,
        detail: String(entry.detail || ""),
        at: String(entry.at || ""),
        actorUserId,
        actorName: profile?.name || "",
        actorEmail: profile?.email || "",
        actorRole: profile?.role || "",
      });
    }
  }

  flat.sort((a, b) => {
    const aMs = Date.parse(a.at);
    const bMs = Date.parse(b.at);
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });

  const trimmed = flat.slice(0, MAX_GLOBAL_FEED);
  if (trimmed.length > 0) {
    await kv.set(GLOBAL_FEED_KEY, trimmed);
  }
  return trimmed;
}

/** Read global feed — single KV get. Optional `since` returns only newer rows. */
export async function getGlobalStaffActivityFeed(
  since?: string
): Promise<StaffActivityFeedEntry[]> {
  let feed = await kv.get(GLOBAL_FEED_KEY);
  if (!Array.isArray(feed) || feed.length === 0) {
    feed = await rebuildGlobalStaffActivityFeed();
  }

  const rows = (Array.isArray(feed) ? feed : []) as StaffActivityFeedEntry[];
  const sinceRaw = String(since || "").trim();
  if (!sinceRaw) return rows;

  const sinceMs = Date.parse(sinceRaw);
  if (!Number.isFinite(sinceMs)) return rows;

  return rows.filter((row) => {
    const atMs = Date.parse(String(row.at || ""));
    return Number.isFinite(atMs) && atMs > sinceMs;
  });
}

/** Remove all staff activity rows (global feed + per-user logs). Returns deleted KV key count. */
export async function clearAllStaffActivities(): Promise<number> {
  const rows = await kv.getByPrefixWithKeys("staff:activity:");
  const keys = rows
    .map((row) => row.key)
    .filter((key) => typeof key === "string" && key.startsWith("staff:activity:"));
  if (keys.length === 0) {
    await kv.set(GLOBAL_FEED_KEY, []);
    return 0;
  }
  await kv.mdel(keys);
  return keys.length;
}

/** Append audit row for platform staff (Supabase Auth UUID). Best-effort — never throws to caller. */
export async function appendStaffActivity(
  userId: string | undefined | null,
  entry: Omit<StaffActivityEntry, "id" | "at"> & { at?: string }
): Promise<void> {
  if (!(await isStaffAuditActor(userId))) return;
  const uid = userId!.trim();
  const at = entry.at || new Date().toISOString();
  const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const row: StaffActivityEntry = {
    id,
    type: entry.type,
    action: entry.action,
    detail: entry.detail,
    at,
  };
  try {
    const prev = await kv.get(staffActivityKey(uid));
    const arr = Array.isArray(prev) ? (prev as StaffActivityEntry[]) : [];
    const next = [row, ...arr].slice(0, MAX_ACTIVITIES);
    await kv.set(staffActivityKey(uid), next);
    await appendGlobalFeed(uid, row);
  } catch (e) {
    console.warn("appendStaffActivity skipped:", e);
  }
}
