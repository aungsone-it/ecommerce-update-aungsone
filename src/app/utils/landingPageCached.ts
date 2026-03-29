/**
 * Landing page (`/`) data — localStorage first, then edge; same TTL as storefront.
 */

import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import {
  readPersistedJson,
  writePersistedJson,
  PERSISTED_CATALOG_TTL_MS,
  LS_LANDING_PLATFORM_SETTINGS,
  LS_LANDING_VENDORS,
  LS_LANDING_STATS,
  LS_LANDING_CATEGORIES,
} from "./persistedLocalCache";

const base = `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f`;
const auth = { Authorization: `Bearer ${publicAnonKey}` };

async function getJson(path: string): Promise<any> {
  const response = await fetch(`${base}${path}`, { headers: auth });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

export async function fetchLandingPlatformSettingsCached(): Promise<any> {
  const cached = readPersistedJson<any>(LS_LANDING_PLATFORM_SETTINGS, PERSISTED_CATALOG_TTL_MS);
  if (cached) return cached;
  const data = await getJson("/platform-settings");
  writePersistedJson(LS_LANDING_PLATFORM_SETTINGS, data);
  return data;
}

export async function fetchLandingVendorsCached(): Promise<any> {
  const cached = readPersistedJson<any>(LS_LANDING_VENDORS, PERSISTED_CATALOG_TTL_MS);
  if (cached) return cached;
  const data = await getJson("/vendors");
  writePersistedJson(LS_LANDING_VENDORS, data);
  return data;
}

export async function fetchLandingStatsCached(): Promise<any> {
  const cached = readPersistedJson<any>(LS_LANDING_STATS, PERSISTED_CATALOG_TTL_MS);
  if (cached) return cached;
  const data = await getJson("/landing-stats");
  writePersistedJson(LS_LANDING_STATS, data);
  return data;
}

export async function fetchLandingCategoriesCached(): Promise<any> {
  const cached = readPersistedJson<any>(LS_LANDING_CATEGORIES, PERSISTED_CATALOG_TTL_MS);
  if (cached) return cached;
  const data = await getJson("/categories");
  writePersistedJson(LS_LANDING_CATEGORIES, data);
  return data;
}
