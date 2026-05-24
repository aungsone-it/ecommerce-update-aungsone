export type SocialProfilePreview = {
  platform: "facebook" | "youtube" | "tiktok" | "instagram" | "website";
  profileUrl: string;
  displayUrl: string;
  name: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  followerLabel: string | null;
  partial?: boolean;
  error?: string;
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialProfilePreview["platform"], string> = {
  facebook: "Facebook Page",
  youtube: "YouTube Channel",
  tiktok: "TikTok Account",
  instagram: "Instagram Profile",
  website: "Website",
};

export function isValidSocialDisplayName(name: string | null | undefined): name is string {
  if (!name?.trim()) return false;
  const cleaned = name.trim();
  if (/^(www\.)?(facebook|instagram|tiktok|youtube)\.com$/i.test(cleaned)) return false;
  if (/^@[\w.]+$/.test(cleaned)) return false;
  return cleaned.length >= 2;
}

export function resolveSocialAvatarUrl(
  url: string | null | undefined,
  platform: SocialProfilePreview["platform"],
  apiBaseUrl: string
): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (platform === "tiktok" && /tiktokcdn/i.test(url)) {
    return `${apiBaseUrl}/social-profiles/avatar?url=${encodeURIComponent(url)}`;
  }
  return url;
}
