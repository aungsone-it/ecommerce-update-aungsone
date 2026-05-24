import { Hono } from "npm:hono@4";

const socialProfileApp = new Hono();

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

type SocialPlatform = "facebook" | "youtube" | "tiktok" | "instagram" | "website";

export type SocialProfilePreview = {
  platform: SocialPlatform;
  profileUrl: string;
  displayUrl: string;
  name: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  followerLabel: string | null;
  partial?: boolean;
  error?: string;
};

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readMeta(html: string, key: "property" | "name", value: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+${key}=["']${value}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${key}=["']${value}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function readJsonBlock(html: string, marker: RegExp): unknown | null {
  const match = html.match(marker);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractJsonAssignment(html: string, variableName: string): unknown | null {
  const marker = `var ${variableName} = `;
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  if (html[jsonStart] !== "{") return null;

  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchImageAsDataUrl(imageUrl: string, referer: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": FETCH_UA,
        Referer: referer,
      },
    });
    if (!res.ok) return null;

    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 512_000) return null;

    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function extractYouTubeHandle(profileUrl: string): string | null {
  try {
    const part = new URL(profileUrl).pathname.split("/").filter(Boolean)[0];
    if (part?.startsWith("@")) return part.slice(1);
    return null;
  } catch {
    return null;
  }
}

async function fetchYouTubeStatsViaApi(
  handle: string | null,
  channelId: string | null
): Promise<{
  name: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  subscribersHidden?: boolean;
} | null> {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey || (!handle && !channelId)) return null;

  const query = channelId
    ? `id=${encodeURIComponent(channelId)}`
    : `forHandle=${encodeURIComponent(handle!)}`;
  const apiUrl =
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&${query}&key=${encodeURIComponent(apiKey)}`;
  const payload = (await fetchJson(apiUrl)) as {
    items?: Array<{
      snippet?: { title?: string; thumbnails?: { high?: { url?: string }; default?: { url?: string } } };
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
    }>;
  } | null;

  const item = payload?.items?.[0];
  if (!item) return null;

  const hidden = item.statistics?.hiddenSubscriberCount === true;
  const subCountRaw = item.statistics?.subscriberCount;
  const followerCount =
    !hidden && subCountRaw && /^\d+$/.test(subCountRaw) ? parseInt(subCountRaw, 10) : null;

  return {
    name: item.snippet?.title || null,
    avatarUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
    followerCount,
    subscribersHidden: hidden,
  };
}

function extractYouTubeSubscriberFromHtml(html: string): {
  followerCount: number | null;
  followerLabel: string | null;
  subscribersHidden: boolean;
} {
  const patterns = [
    /"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/,
    /"subscriberCountText":\{"simpleText":"([^"]+)"/,
    /"subscriberCountText":\{"runs":\[\{"text":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const followerLabel = decodeHtml(match[1].trim());
      const followerCount = parseCountFromText(followerLabel);
      return { followerCount, followerLabel, subscribersHidden: false };
    }
  }

  const hasChannelData = /"channelMetadataRenderer"|"externalId":"UC/.test(html);
  const subscribersHidden = hasChannelData && !/subscriber/i.test(html);
  return { followerCount: null, followerLabel: null, subscribersHidden };
}

function parseCountFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/,/g, "").trim();

  const millionMatch = normalized.match(/([\d.]+)\s*million/);
  if (millionMatch) return Math.round(parseFloat(millionMatch[1]) * 1_000_000);

  const thousandMatch = normalized.match(/([\d.]+)\s*thousand/);
  if (thousandMatch) return Math.round(parseFloat(thousandMatch[1]) * 1_000);

  const billionMatch = normalized.match(/([\d.]+)\s*billion/);
  if (billionMatch) return Math.round(parseFloat(billionMatch[1]) * 1_000_000_000);

  const match = normalized.match(/([\d.]+)\s*([kmb])?/);
  if (!match) return null;
  const base = parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = match[2];
  if (unit === "k") return Math.round(base * 1_000);
  if (unit === "m") return Math.round(base * 1_000_000);
  if (unit === "b") return Math.round(base * 1_000_000_000);
  return Math.round(base);
}

function formatFollowerLabel(count: number | null, text: string | null, kind: "followers" | "subscribers" = "followers"): string | null {
  if (text?.trim()) return text.trim();
  if (count == null) return null;
  if (count >= 1_000_000) {
    const v = (count / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${v}M ${kind}`;
  }
  if (count >= 1_000) {
    const v = Math.round(count / 1_000);
    return `${v}K ${kind}`;
  }
  return `${count.toLocaleString("en-US")} ${kind}`;
}

function ensureAbsoluteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function displayUrlFromAbsolute(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}${u.search}`.replace(/\/$/, "") || u.host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

function sanitizeProfileName(
  name: string | null | undefined,
  platform: SocialPlatform,
  profileUrl: string
): string | null {
  if (!name?.trim()) return null;

  let cleaned = decodeHtml(name.trim())
    .replace(/\s*\|\s*TikTok\s*$/i, "")
    .replace(/\s*on TikTok\s*$/i, "")
    .replace(/\s*[-|•]\s*Instagram photos and videos\s*$/i, "")
    .replace(/\s*[-|•]\s*Instagram\s*$/i, "")
    .replace(/\s*[-|•]\s*Facebook\s*$/i, "")
    .replace(/\s*[-|•]\s*YouTube\s*$/i, "")
    .replace(/\s*\(@[^)]+\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  if (/^(www\.)?(facebook|instagram|tiktok|youtube)\.com$/i.test(cleaned)) return null;
  if (/^@[\w.]+$/.test(cleaned)) return null;

  try {
    const host = new URL(profileUrl).hostname.replace(/^www\./, "");
    if (cleaned.toLowerCase() === host || cleaned.toLowerCase() === `www.${host}`) return null;
  } catch {
    /* ignore */
  }

  return cleaned.length >= 2 ? cleaned : null;
}

function isBarePlatformUrl(url: string, hosts: string[]): boolean {
  try {
    const u = new URL(ensureAbsoluteUrl(url));
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return hosts.includes(host) && (!path || path === "");
  } catch {
    return false;
  }
}

function extractInstagramUsername(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  if (trimmed.includes("instagram.com")) {
    try {
      const parts = new URL(ensureAbsoluteUrl(trimmed)).pathname.split("/").filter(Boolean);
      if (parts.length > 0 && !["p", "reel", "stories"].includes(parts[0])) {
        return parts[0].replace(/^@/, "");
      }
    } catch {
      return null;
    }
    return null;
  }
  return trimmed.replace(/^@/, "") || null;
}

function extractFacebookPageSlug(rawUrl: string): string | null {
  try {
    const parts = new URL(normalizeFacebookUrl(rawUrl)).pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const slug = parts[0];
    if (["pages", "profile.php", "people", "groups", "watch"].includes(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

function extractYouTubeChannelId(html: string): string | null {
  const match =
    html.match(/"externalId":"(UC[\w-]{20,})"/) ||
    html.match(/"channelId":"(UC[\w-]{20,})"/) ||
    html.match(/"browseId":"(UC[\w-]{20,})"/);
  return match?.[1] ?? null;
}

async function fetchJsonWithHeaders(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 10000
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInstagramViaMobileApi(username: string): Promise<{
  name: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
} | null> {
  const payload = (await fetchJsonWithHeaders(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      "X-IG-App-ID": "936619743392459",
      "User-Agent":
        "Instagram 219.0.0.12.117 Android (30/11; 420dpi; 1080x2340; samsung; SM-G973F; beyond1; exynos9820; en_US; 314665256)",
    }
  )) as {
    data?: {
      user?: {
        full_name?: string;
        username?: string;
        follower_count?: number;
        edge_followed_by?: { count?: number };
        profile_pic_url_hd?: string;
        profile_pic_url?: string;
      };
    };
  } | null;

  const user = payload?.data?.user;
  if (!user) return null;

  const followerCount =
    typeof user.follower_count === "number"
      ? user.follower_count
      : typeof user.edge_followed_by?.count === "number"
        ? user.edge_followed_by.count
        : null;

  return {
    name: typeof user.full_name === "string" ? user.full_name : user.username || null,
    avatarUrl:
      (typeof user.profile_pic_url_hd === "string" && user.profile_pic_url_hd) ||
      (typeof user.profile_pic_url === "string" && user.profile_pic_url) ||
      null,
    followerCount,
  };
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFacebookUrl(rawUrl: string): string {
  const absolute = ensureAbsoluteUrl(rawUrl.includes("facebook.com") ? rawUrl : `https://facebook.com/${rawUrl}`);
  try {
    const u = new URL(absolute);
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "") {
      return absolute;
    }
    return `https://www.facebook.com${path}`;
  } catch {
    return absolute;
  }
}

function normalizeInstagramUrl(rawUrl: string): string {
  const handle = rawUrl.replace(/^@/, "").trim();
  if (rawUrl.includes("instagram.com")) {
    const absolute = ensureAbsoluteUrl(rawUrl);
    try {
      const u = new URL(absolute);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length > 0 && parts[0] !== "p") {
        return `https://www.instagram.com/${parts[0]}/`;
      }
    } catch {
      /* fall through */
    }
    return absolute;
  }
  return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}

function extractInstagramFullName(html: string): string | null {
  const patterns = [
    /"full_name":"([^"\\]+)"/,
    /"full_name":\s*"([^"\\]+)"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function parseTikTokOgTitle(title: string): string | null {
  const primary = title.split("|")[0]?.trim() ?? title;
  const withoutHandle = primary.replace(/\s*\(@[^)]+\)\s*/g, " ").trim();
  if (!withoutHandle || withoutHandle.toLowerCase().includes("tiktok")) return null;
  return withoutHandle;
}

async function fetchTikTokOembed(profileUrl: string): Promise<{ name: string | null; avatarUrl: string | null }> {
  const data = (await fetchJson(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(profileUrl)}`
  )) as { author_name?: string; thumbnail_url?: string } | null;
  if (!data) return { name: null, avatarUrl: null };
  return {
    name: typeof data.author_name === "string" ? data.author_name : null,
    avatarUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
  };
}

function extractTikTokUniqueId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  if (trimmed.includes("tiktok.com")) {
    try {
      const parts = new URL(ensureAbsoluteUrl(trimmed)).pathname.split("/").filter(Boolean);
      return parts[0]?.replace(/^@/, "") || null;
    } catch {
      return null;
    }
  }
  return trimmed.replace(/^@/, "");
}

async function fetchTikTokViaPublicApi(uniqueId: string): Promise<{
  name: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
} | null> {
  const payload = (await fetchJson(
    `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(uniqueId)}&_=${Date.now()}`
  )) as {
    code?: number;
    data?: {
      user?: {
        nickname?: string;
        avatarLarger?: string;
        avatarMedium?: string;
        avatarThumb?: string;
      };
      stats?: { followerCount?: number };
    };
  } | null;

  if (!payload || payload.code !== 0 || !payload.data?.user) return null;

  const user = payload.data.user;
  const stats = payload.data.stats;

  return {
    name: typeof user.nickname === "string" ? user.nickname : null,
    avatarUrl:
      (typeof user.avatarLarger === "string" && user.avatarLarger) ||
      (typeof user.avatarMedium === "string" && user.avatarMedium) ||
      (typeof user.avatarThumb === "string" && user.avatarThumb) ||
      null,
    followerCount: typeof stats?.followerCount === "number" ? stats.followerCount : null,
  };
}

function extractTikTokUserRecord(html: string, universal: unknown): Record<string, unknown> | null {
  const userInfo = walkForKeys(universal, ["userInfo"]) as Record<string, unknown> | null;
  const fromUserInfo = userInfo?.user;
  if (fromUserInfo && typeof fromUserInfo === "object") {
    return fromUserInfo as Record<string, unknown>;
  }

  const sigi = readJsonBlock(html, /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i);
  const fromSigi = walkForKeys(sigi, ["userInfo", "user"]);
  if (fromSigi && typeof fromSigi === "object") {
    const record = fromSigi as Record<string, unknown>;
    if (record.user && typeof record.user === "object") return record.user as Record<string, unknown>;
    return record;
  }

  return walkForKeys(universal, ["user"]) as Record<string, unknown> | null;
}

function normalizeYouTubeUrl(url: string): string {
  const absolute = ensureAbsoluteUrl(url);
  try {
    const u = new URL(absolute);
    if (u.pathname.startsWith("/@")) {
      return `https://www.youtube.com${u.pathname.split("/videos")[0]}`;
    }
    if (u.pathname.includes("/channel/")) return absolute;
    if (u.pathname.includes("/c/")) return absolute;
  } catch {
    /* fall through */
  }
  if (url.startsWith("@")) return `https://www.youtube.com/${url}`;
  return absolute;
}

function walkForKeys(node: unknown, keys: string[], depth = 0): unknown {
  if (depth > 14 || node == null) return null;
  if (typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForKeys(item, keys, depth + 1);
      if (found != null) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] != null) return record[key];
  }
  for (const value of Object.values(record)) {
    const found = walkForKeys(value, keys, depth + 1);
    if (found != null) return found;
  }
  return null;
}

function pickThumbnailUrl(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const thumbs = record.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const last = thumbs[thumbs.length - 1] as Record<string, unknown>;
    if (typeof last.url === "string") return last.url;
  }
  if (typeof record.url === "string") return record.url;
  return null;
}

function extractSimpleText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.simpleText === "string") return record.simpleText;
  const accessibility = record.accessibility as Record<string, unknown> | undefined;
  const accessibilityData = accessibility?.accessibilityData as Record<string, unknown> | undefined;
  if (typeof accessibilityData?.label === "string") return accessibilityData.label;
  return null;
}

async function fetchYouTubeProfile(rawUrl: string): Promise<SocialProfilePreview> {
  const profileUrl = normalizeYouTubeUrl(rawUrl);
  const displayUrl = displayUrlFromAbsolute(profileUrl);
  const handle = extractYouTubeHandle(profileUrl);

  let name: string | null = null;
  let avatarUrl: string | null = null;
  let followerLabel: string | null = null;
  let followerCount: number | null = null;
  let subscribersHidden = false;

  const mainHtml = await fetchHtml(profileUrl);
  const channelId = extractYouTubeChannelId(mainHtml);

  if (handle || channelId) {
    const apiProfile = await fetchYouTubeStatsViaApi(handle, channelId);
    if (apiProfile) {
      name = apiProfile.name;
      avatarUrl = apiProfile.avatarUrl;
      followerCount = apiProfile.followerCount;
      subscribersHidden = apiProfile.subscribersHidden === true;
      followerLabel = subscribersHidden
        ? "Subscribers hidden"
        : formatFollowerLabel(followerCount, null, "subscribers");
    }
  }

  if (!name || followerCount == null) {
    const ytInitialData =
      extractJsonAssignment(mainHtml, "ytInitialData") ||
      readJsonBlock(mainHtml, /var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);

    name =
      name ||
      readMeta(mainHtml, "property", "og:title") ||
      readMeta(mainHtml, "name", "title") ||
      null;
    avatarUrl = avatarUrl || readMeta(mainHtml, "property", "og:image");

    if (ytInitialData) {
      const metadata = walkForKeys(ytInitialData, ["channelMetadataRenderer"]);
      if (metadata && typeof metadata === "object") {
        const meta = metadata as Record<string, unknown>;
        if (typeof meta.title === "string") name = meta.title;
        const avatar = pickThumbnailUrl(meta.avatar);
        if (avatar) avatarUrl = avatar;
      }
    }

    if (followerCount == null && !subscribersHidden) {
      const mainStats = extractYouTubeSubscriberFromHtml(mainHtml);
      followerCount = mainStats.followerCount;
      followerLabel = mainStats.followerLabel;
      subscribersHidden = mainStats.subscribersHidden;
    }
  }

  if (followerCount == null && !subscribersHidden) {
    try {
      const aboutHtml = await fetchHtml(`${profileUrl.replace(/\/$/, "")}/about`);
      const aboutStats = extractYouTubeSubscriberFromHtml(aboutHtml);
      if (aboutStats.followerCount != null || aboutStats.followerLabel) {
        followerCount = aboutStats.followerCount;
        followerLabel = aboutStats.followerLabel;
      }
      if (aboutStats.subscribersHidden) subscribersHidden = true;
    } catch {
      /* non-fatal */
    }
  }

  if (name) {
    name = sanitizeProfileName(name.replace(/\s*-\s*YouTube$/i, "").trim(), "youtube", profileUrl);
  }

  const resolvedFollowerLabel = subscribersHidden
    ? "Subscribers hidden"
    : formatFollowerLabel(followerCount, followerLabel, "subscribers");

  return {
    platform: "youtube",
    profileUrl,
    displayUrl,
    name,
    avatarUrl,
    followerCount,
    followerLabel: resolvedFollowerLabel,
    partial: !followerCount && !subscribersHidden,
  };
}

async function fetchTikTokProfile(rawUrl: string): Promise<SocialProfilePreview> {
  const profileUrl = ensureAbsoluteUrl(
    rawUrl.includes("tiktok.com") ? rawUrl : `https://www.tiktok.com/@${rawUrl.replace(/^@/, "")}`
  );
  const displayUrl = displayUrlFromAbsolute(profileUrl);
  const uniqueId = extractTikTokUniqueId(rawUrl);

  let name: string | null = null;
  let avatarUrl: string | null = null;
  let followerCount: number | null = null;

  if (uniqueId) {
    const publicProfile = await fetchTikTokViaPublicApi(uniqueId);
    if (publicProfile) {
      name = sanitizeProfileName(publicProfile.name, "tiktok", profileUrl);
      avatarUrl = publicProfile.avatarUrl;
      followerCount = publicProfile.followerCount;
    }
  }

  if (!name || !avatarUrl || followerCount == null) {
    const oembed = await fetchTikTokOembed(profileUrl);
    name = name || sanitizeProfileName(oembed.name, "tiktok", profileUrl);

    if (!avatarUrl || followerCount == null) {
      try {
        const html = await fetchHtml(profileUrl);
        if (!avatarUrl) avatarUrl = readMeta(html, "property", "og:image") || oembed.avatarUrl;

        const universal = readJsonBlock(
          html,
          /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i
        );
        const userRecord = extractTikTokUserRecord(html, universal);

        if (userRecord) {
          if (!name && typeof userRecord.nickname === "string") {
            name = sanitizeProfileName(userRecord.nickname, "tiktok", profileUrl);
          }
          if (!avatarUrl && typeof userRecord.avatarLarger === "string") avatarUrl = userRecord.avatarLarger;
          else if (!avatarUrl && typeof userRecord.avatarMedium === "string") avatarUrl = userRecord.avatarMedium;
          if (followerCount == null && typeof userRecord.followerCount === "number") {
            followerCount = userRecord.followerCount;
          }
        }

        if (followerCount == null) {
          const match = html.match(/"followerCount":(\d+)/);
          if (match) followerCount = parseInt(match[1], 10);
        }
      } catch {
        /* TikTok WAF often blocks direct HTML fetch — public API is primary */
      }
    }
  }

  if (avatarUrl && !avatarUrl.startsWith("data:")) {
    avatarUrl =
      (await fetchImageAsDataUrl(avatarUrl, "https://www.tiktok.com/")) || avatarUrl;
  }

  return {
    platform: "tiktok",
    profileUrl,
    displayUrl,
    name,
    avatarUrl,
    followerCount,
    followerLabel: formatFollowerLabel(followerCount, null, "followers"),
    partial: !avatarUrl || followerCount == null,
  };
}

async function fetchInstagramProfile(rawUrl: string): Promise<SocialProfilePreview> {
  const profileUrl = normalizeInstagramUrl(rawUrl);
  const displayUrl = displayUrlFromAbsolute(profileUrl);

  if (isBarePlatformUrl(rawUrl, ["instagram.com"])) {
    return {
      platform: "instagram",
      profileUrl,
      displayUrl,
      name: null,
      avatarUrl: null,
      followerCount: null,
      followerLabel: null,
      partial: true,
      error: "Add a full Instagram profile URL (e.g. instagram.com/yourhandle)",
    };
  }

  const username = extractInstagramUsername(rawUrl);
  let name: string | null = null;
  let avatarUrl: string | null = null;
  let followerCount: number | null = null;

  if (username) {
    const mobileProfile = await fetchInstagramViaMobileApi(username);
    if (mobileProfile) {
      name = sanitizeProfileName(mobileProfile.name, "instagram", profileUrl);
      avatarUrl = mobileProfile.avatarUrl;
      followerCount = mobileProfile.followerCount;
    }
  }

  if (!name || followerCount == null) {
    try {
      const html = await fetchHtml(profileUrl);
      name =
        name ||
        sanitizeProfileName(extractInstagramFullName(html), "instagram", profileUrl) ||
        sanitizeProfileName(readMeta(html, "property", "og:title"), "instagram", profileUrl);
      avatarUrl = avatarUrl || readMeta(html, "property", "og:image");

      const edgeMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
      if (edgeMatch) followerCount = parseInt(edgeMatch[1], 10);

      const followerTextMatch = html.match(/"follower_count":(\d+)/);
      if (followerCount == null && followerTextMatch) {
        followerCount = parseInt(followerTextMatch[1], 10);
      }
    } catch {
      /* Instagram often blocks server-side HTML fetch */
    }
  }

  return {
    platform: "instagram",
    profileUrl,
    displayUrl,
    name,
    avatarUrl,
    followerCount,
    followerLabel: formatFollowerLabel(followerCount, null, "followers"),
    partial: followerCount == null,
  };
}

async function fetchFacebookProfile(rawUrl: string): Promise<SocialProfilePreview> {
  const profileUrl = normalizeFacebookUrl(rawUrl);
  const displayUrl = displayUrlFromAbsolute(profileUrl);

  if (isBarePlatformUrl(rawUrl, ["facebook.com", "fb.com", "m.facebook.com"])) {
    return {
      platform: "facebook",
      profileUrl,
      displayUrl,
      name: null,
      avatarUrl: null,
      followerCount: null,
      followerLabel: null,
      partial: true,
      error: "Add a full Facebook page URL (e.g. facebook.com/YourPageName)",
    };
  }

  const pageSlug = extractFacebookPageSlug(rawUrl);
  const fetchTargets = [
    profileUrl,
    pageSlug ? `https://m.facebook.com/${pageSlug}` : null,
    pageSlug ? `https://mbasic.facebook.com/${pageSlug}` : null,
  ].filter(Boolean) as string[];

  let html = "";
  for (const target of fetchTargets) {
    try {
      html = await fetchHtml(target);
      if (html.length > 500) break;
    } catch {
      /* try next mirror */
    }
  }

  let name = sanitizeProfileName(readMeta(html, "property", "og:title"), "facebook", profileUrl);
  let avatarUrl = readMeta(html, "property", "og:image");
  let followerCount: number | null = null;

  const followerMatch =
    html.match(/"follower_count":(\d+)/) ||
    html.match(/"followers_count":(\d+)/) ||
    html.match(/"followers":\{"count":(\d+)\}/);
  if (followerMatch) followerCount = parseInt(followerMatch[1], 10);

  if (followerCount == null) {
    const textMatch = html.match(/([\d][\d,.]*[KMB]?)\s+followers/i);
    if (textMatch) followerCount = parseCountFromText(textMatch[1]);
  }

  return {
    platform: "facebook",
    profileUrl,
    displayUrl,
    name,
    avatarUrl,
    followerCount,
    followerLabel: formatFollowerLabel(followerCount, null, "followers"),
    partial: followerCount == null,
  };
}

async function fetchWebsiteProfile(rawUrl: string): Promise<SocialProfilePreview> {
  const profileUrl = ensureAbsoluteUrl(rawUrl);
  const displayUrl = displayUrlFromAbsolute(profileUrl);
  let name: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const html = await fetchHtml(profileUrl);
    name =
      sanitizeProfileName(
        readMeta(html, "property", "og:site_name") ||
          readMeta(html, "property", "og:title") ||
          readMeta(html, "name", "title"),
        "website",
        profileUrl
      );
    avatarUrl = readMeta(html, "property", "og:image");
  } catch {
    /* non-fatal */
  }

  if (!avatarUrl) {
    try {
      const host = new URL(profileUrl).hostname;
      avatarUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    } catch {
      avatarUrl = null;
    }
  }

  return {
    platform: "website",
    profileUrl,
    displayUrl,
    name,
    avatarUrl,
    followerCount: null,
    followerLabel: null,
  };
}

async function fetchSocialProfile(platform: SocialPlatform, url: string): Promise<SocialProfilePreview> {
  const trimmed = url.trim();
  const profileUrl = ensureAbsoluteUrl(trimmed);
  const displayUrl = displayUrlFromAbsolute(profileUrl);

  try {
    switch (platform) {
      case "youtube":
        return await fetchYouTubeProfile(trimmed);
      case "tiktok":
        return await fetchTikTokProfile(trimmed);
      case "instagram":
        return await fetchInstagramProfile(trimmed);
      case "facebook":
        return await fetchFacebookProfile(trimmed);
      case "website":
        return await fetchWebsiteProfile(trimmed);
      default:
        return {
          platform,
          profileUrl,
          displayUrl,
          name: null,
          avatarUrl: null,
          followerCount: null,
          followerLabel: null,
          error: "Unsupported platform",
        };
    }
  } catch (error) {
    return {
      platform,
      profileUrl,
      displayUrl,
      name: null,
      avatarUrl: null,
      followerCount: null,
      followerLabel: null,
      partial: true,
      error: error instanceof Error ? error.message : "Failed to fetch profile",
    };
  }
}

socialProfileApp.get("/social-profiles/avatar", async (c) => {
  try {
    const url = c.req.query("url")?.trim();
    if (!url || !/^https:\/\/[^/]*tiktokcdn/i.test(url)) {
      return c.json({ error: "Invalid avatar URL" }, 400);
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Referer: "https://www.tiktok.com/",
      },
    });
    if (!res.ok) return c.json({ error: "Avatar fetch failed" }, 502);

    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("social-profiles/avatar error:", error);
    return c.json({ error: "Avatar proxy failed" }, 500);
  }
});

socialProfileApp.post("/social-profiles/preview", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const profiles = Array.isArray(body?.profiles) ? body.profiles : [];

    const results: SocialProfilePreview[] = [];
    for (const item of profiles) {
      const platform = String(item?.platform ?? "").trim() as SocialPlatform;
      const url = String(item?.url ?? "").trim();
      if (!url || !["facebook", "youtube", "tiktok", "instagram", "website"].includes(platform)) {
        continue;
      }
      results.push(await fetchSocialProfile(platform, url));
    }

    return c.json(
      { success: true, profiles: results },
      200,
      {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      }
    );
  } catch (error) {
    console.error("social-profiles/preview error:", error);
    return c.json({ success: false, error: "Failed to preview social profiles" }, 500);
  }
});

export default socialProfileApp;
