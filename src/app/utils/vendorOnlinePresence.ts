export type VendorOnlinePresenceKey =
  | "facebook"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "website";

export const VENDOR_ONLINE_PRESENCE_FIELDS: {
  key: VendorOnlinePresenceKey;
  label: string;
  optional?: boolean;
  placeholder: string;
}[] = [
  { key: "facebook", label: "Facebook", placeholder: "Profile or page URL" },
  { key: "youtube", label: "YouTube", placeholder: "Channel or @handle URL" },
  { key: "tiktok", label: "TikTok", placeholder: "@handle or profile URL" },
  { key: "instagram", label: "Instagram", placeholder: "@yourhandle or profile URL" },
  {
    key: "website",
    label: "Website",
    optional: true,
    placeholder: "https://your-site.com (optional)",
  },
];

export type VendorOnlinePresenceLinks = Partial<
  Record<VendorOnlinePresenceKey, string>
>;

export function pickOnlinePresenceLinks(
  source: Record<string, unknown> | null | undefined
): VendorOnlinePresenceLinks {
  if (!source) return {};
  const out: VendorOnlinePresenceLinks = {};
  for (const { key } of VENDOR_ONLINE_PRESENCE_FIELDS) {
    const v = source[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  const socialLinks = source.socialLinks;
  if (socialLinks && typeof socialLinks === "object") {
    for (const { key } of VENDOR_ONLINE_PRESENCE_FIELDS) {
      if (out[key]) continue;
      const v = (socialLinks as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim();
    }
  }
  return out;
}

export function hasOnlinePresenceLinks(links: VendorOnlinePresenceLinks): boolean {
  return VENDOR_ONLINE_PRESENCE_FIELDS.some(({ key }) => Boolean(links[key]?.trim()));
}

export function onlinePresenceHref(key: VendorOnlinePresenceKey, value: string): string {
  const v = value.trim();
  if (!v) return "#";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  switch (key) {
    case "instagram": {
      const handle = v.replace(/^@/, "");
      return `https://instagram.com/${handle}`;
    }
    case "tiktok": {
      const handle = v.replace(/^@/, "");
      return handle.includes("/")
        ? `https://${handle.replace(/^\/\//, "")}`
        : `https://tiktok.com/@${handle}`;
    }
    case "youtube":
      return v.startsWith("@") ? `https://youtube.com/${v}` : `https://${v.replace(/^\/\//, "")}`;
    case "facebook":
      return v.includes(".") ? `https://${v.replace(/^\/\//, "")}` : `https://facebook.com/${v}`;
    default:
      return `https://${v.replace(/^\/\//, "")}`;
  }
}

export function validateOptionalOnlinePresenceField(
  key: VendorOnlinePresenceKey,
  value: string
): string | null {
  const v = value.trim();
  if (!v) return null;
  if (key === "website") {
    try {
      const u = new URL(v.startsWith("http") ? v : `https://${v}`);
      if (!["http:", "https:"].includes(u.protocol)) return "Website must start with http:// or https://.";
    } catch {
      return "Website must be a valid URL (or leave it blank).";
    }
    return null;
  }
  const minLen = key === "facebook" ? 4 : 2;
  const label =
    VENDOR_ONLINE_PRESENCE_FIELDS.find((f) => f.key === key)?.label ?? key;
  if (v.length < minLen) {
    return `${label} link is too short (or leave it blank).`;
  }
  return null;
}
