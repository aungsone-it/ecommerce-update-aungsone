import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, Loader2, Sparkles } from "lucide-react";
import { API_BASE_URL } from "../../utils/api-client";
import { publicAnonKey } from "../../../utils/supabase/info";
import {
  VENDOR_ONLINE_PRESENCE_FIELDS,
  type VendorOnlinePresenceKey,
  type VendorOnlinePresenceLinks,
  onlinePresenceHref,
} from "../utils/vendorOnlinePresence";
import { socialProfilesApi } from "../../utils/api";
import {
  isValidSocialDisplayName,
  resolveSocialAvatarUrl,
  SOCIAL_PLATFORM_LABELS,
  type SocialProfilePreview,
} from "../utils/socialProfile";

const inputClassName =
  "w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all";

const PLATFORM_ACCENTS: Record<VendorOnlinePresenceKey, string> = {
  facebook: "bg-blue-600",
  youtube: "bg-red-600",
  tiktok: "bg-slate-900",
  instagram: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400",
  website: "bg-slate-500",
};

function SocialProfileCard({
  platform,
  preview,
  rawUrl,
  loading,
}: {
  platform: VendorOnlinePresenceKey;
  preview?: SocialProfilePreview;
  rawUrl: string;
  loading: boolean;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null);
  const profileUrl = preview?.profileUrl || onlinePresenceHref(platform, rawUrl);
  const displayUrl = preview?.displayUrl || rawUrl.replace(/^https?:\/\//, "");
  const displayName = isValidSocialDisplayName(preview?.name) ? preview!.name : null;
  const avatarUrl = resolveSocialAvatarUrl(preview?.avatarUrl, platform, API_BASE_URL);
  const followerLabel = platform === "website" ? null : preview?.followerLabel ?? null;
  const avatarInitial = (displayName || SOCIAL_PLATFORM_LABELS[platform]).charAt(0).toUpperCase();

  useEffect(() => {
    setAvatarFailed(false);

    if (!avatarUrl) {
      setResolvedAvatar(null);
      return;
    }

    if (avatarUrl.startsWith("data:")) {
      setResolvedAvatar(avatarUrl);
      return;
    }

    if (!avatarUrl.includes("/social-profiles/avatar")) {
      setResolvedAvatar(avatarUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(avatarUrl, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
      },
    })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("avatar fetch failed"))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedAvatar(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolvedAvatar(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarUrl, platform, rawUrl]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : resolvedAvatar && !avatarFailed ? (
            <img
              src={resolvedAvatar}
              alt={displayName || SOCIAL_PLATFORM_LABELS[platform]}
              className="h-full w-full object-cover"
              referrerPolicy="origin"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center text-lg font-semibold text-white ${PLATFORM_ACCENTS[platform]}`}
            >
              {avatarInitial}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {loading ? (
            <>
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            </>
          ) : (
            <>
              <p className="truncate text-base font-semibold text-slate-900">
                {displayName || `${SOCIAL_PLATFORM_LABELS[platform]} name unavailable`}
              </p>
              {followerLabel ? (
                <p className="text-sm text-slate-500">{followerLabel}</p>
              ) : platform === "website" ? (
                <p className="text-sm text-slate-500">Website</p>
              ) : preview?.partial !== false ? (
                <p className="text-sm text-slate-400">
                  {preview?.error || "Follower count unavailable"}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
        {loading ? (
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-slate-200" />
        ) : (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 break-all text-sm font-medium text-blue-600 hover:underline"
          >
            {displayUrl}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )}
      </div>
    </div>
  );
}

export function VendorOnlinePresenceFormFields({
  values,
  onChange,
}: {
  values: VendorOnlinePresenceLinks;
  onChange: (key: VendorOnlinePresenceKey, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {VENDOR_ONLINE_PRESENCE_FIELDS.map(({ key, label, optional, placeholder }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
            {optional ? " (optional)" : ""}
          </label>
          <input
            type="text"
            name={key}
            value={values[key] ?? ""}
            onChange={(e) => onChange(key, e.target.value)}
            className={inputClassName}
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
  );
}

export function VendorOnlinePresenceDisplay({
  links,
  title = "Online Presence",
}: {
  links: VendorOnlinePresenceLinks;
  title?: string;
}) {
  const entries = VENDOR_ONLINE_PRESENCE_FIELDS.filter(({ key }) => links[key]?.trim());

  if (entries.length === 0) return null;

  return (
    <div className={title ? "space-y-3" : undefined}>
      {title ? <h3 className="text-lg font-semibold text-slate-900">{title}</h3> : null}
      <div className="grid grid-cols-1 gap-3">
        {entries.map(({ key, label }) => {
          const value = links[key]!;
          return (
            <div key={key} className="rounded-lg bg-slate-50 p-4">
              <p className="mb-1 block text-xs text-slate-500">{label}</p>
              <a
                href={onlinePresenceHref(key, value)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 break-all font-medium text-blue-600 hover:underline"
              >
                {value}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function VendorOnlinePresenceProfileView({
  links,
  refreshKey = 0,
}: {
  links: VendorOnlinePresenceLinks;
  refreshKey?: number;
}) {
  const filledEntries = useMemo(
    () => VENDOR_ONLINE_PRESENCE_FIELDS.filter(({ key }) => links[key]?.trim()),
    [links]
  );

  const [loading, setLoading] = useState(true);
  const [previews, setPreviews] = useState<Partial<Record<VendorOnlinePresenceKey, SocialProfilePreview>>>({});

  useEffect(() => {
    if (filledEntries.length === 0) {
      setPreviews({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreviews({});

    socialProfilesApi
      .previewBatch(
        filledEntries.map(({ key }) => ({
          platform: key,
          url: links[key]!.trim(),
        })),
        refreshKey
      )
      .then((response) => {
        if (cancelled) return;
        const next: Partial<Record<VendorOnlinePresenceKey, SocialProfilePreview>> = {};
        for (const profile of response.profiles ?? []) {
          next[profile.platform] = profile;
        }
        setPreviews(next);
      })
      .catch(() => {
        if (!cancelled) setPreviews({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filledEntries, links, refreshKey]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Sparkles className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Social Profile</h3>
            <p className="text-sm text-slate-500">
              Profile photo, account name, and follower count are loaded automatically from each link.
            </p>
          </div>
        </div>

        {filledEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <Globe className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">No social profiles on file</p>
            <p className="mt-1 text-sm text-slate-500">
              Links from the vendor application will appear here after approval.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filledEntries.map(({ key }) => (
              <SocialProfileCard
                key={key}
                platform={key}
                rawUrl={links[key]!.trim()}
                preview={previews[key]}
                loading={loading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
