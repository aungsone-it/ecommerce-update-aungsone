import * as kv from "./kv_store.tsx";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ACTIVITIES = 150;

function staffActivityKey(userId: string): string {
  return `staff:activity:${userId}`;
}

export function isValidStaffActorId(id: string | undefined | null): id is string {
  return typeof id === "string" && STAFF_UUID_RE.test(id.trim());
}

export type StaffActivityEntry = {
  id: string;
  type: "product_created" | "product_updated" | "product_deleted";
  action: string;
  detail: string;
  at: string;
};

/** Append audit row for platform staff (Supabase Auth UUID). Best-effort — never throws to caller. */
export async function appendStaffActivity(
  userId: string | undefined | null,
  entry: Omit<StaffActivityEntry, "id" | "at"> & { at?: string }
): Promise<void> {
  if (!isValidStaffActorId(userId)) return;
  const uid = userId.trim();
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
  } catch (e) {
    console.warn("appendStaffActivity skipped:", e);
  }
}
