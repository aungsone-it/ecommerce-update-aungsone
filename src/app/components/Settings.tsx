import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import {
  normalizePlatformStoreName,
} from "../utils/platformBranding";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { 
  Store, 
  Palette,
  Save,
  Users,
  MoreVertical,
  Edit,
  Trash2,
  Shield,
  ShieldCheck,
  FileEdit,
  Upload,
  Warehouse,
  User,
  Globe,
  Loader2,
  Plus,
  Image,
  X,
  Activity,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { UserProfile } from "./UserProfile";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import {
  assignableRolesForCreator,
  canAccessSuperAdminPage,
  canonicalizeStaffRoleForSave,
  isOwnerRole,
} from "../utils/superAdminRolePermissions";
import { toast } from 'sonner';
import { VendorDomainsList } from "./VendorDomainsList";
import {
  moduleCache,
  CACHE_KEYS,
  getCachedAdminAuthUsers,
  invalidateAdminAuthUsersCache,
  getCachedStaffActivities,
  fetchIncrementalStaffActivities,
  mergeStaffActivities,
  peekStaffActivitiesCache,
  primeStaffActivitiesCache,
  clearStaffActivities,
  invalidateStaffActivitiesCache,
  STAFF_ACTIVITIES_POLL_MS,
  type StaffActivityFeedRow,
} from "../utils/module-cache";
import {
  readPersistedJson,
  PERSISTED_CATALOG_TTL_MS,
  LS_ADMIN_AUTH_USERS,
} from "../utils/persistedLocalCache";
import {
  notifyStorefrontPolicyUpdated,
  subscribeStorefrontPolicyUpdates,
} from "../utils/storefrontPolicyRealtime";
import { compressImage } from "../../utils/imageCompression";

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

type AddUserFormErrors = {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
};

type StaffActivityRow = StaffActivityFeedRow;

function parseActivityDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatActivityDateTime(value: unknown, locale?: string): string {
  const ms = parseActivityDateMs(value);
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(locale || undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTIVITY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVITY_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripActivityDetailLabel(part: string): string {
  return String(part || "")
    .replace(/^(user(?:\s+id)?|name|mail|email|role|status|id)\s*[-:]\s*/i, "")
    .trim();
}

function splitActivityDetail(detail: string): string[] {
  const text = String(detail || "").trim();
  if (!text) return [];
  return text
    .split(/\s*(?:·|\|)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isUserStaffAction(action: string): boolean {
  return /user (created|updated|deleted)|password reset|delete blocked/i.test(action);
}

function normalizeVendorActivityAction(action: string): string {
  const normalized = String(action || "").trim();
  if (/^vendor application approved$/i.test(normalized)) return "Vendor Approved";
  if (/^vendor application rejected$/i.test(normalized)) return "Vendor Rejected";
  if (/^vendor deleted$/i.test(normalized)) return "Vendor Deleted";
  return normalized;
}

function isVendorStaffAction(action: string): boolean {
  const normalized = normalizeVendorActivityAction(action);
  return /^vendor (approved|deleted|rejected)$/i.test(normalized);
}

function formatVendorActivityContactLine(detail: string): string {
  const parts = splitActivityDetail(detail)
    .map(stripActivityDetailLabel)
    .filter((part) => part && !ACTIVITY_UUID_RE.test(part))
    .filter((part) => !/^(approved|rejected|deleted|pending)$/i.test(part));

  if (parts.length === 0) return String(detail || "").trim();
  return parts.join(" | ");
}

function isNeutralStaffActivity(action: string, type: string): boolean {
  if (String(type || "").includes("deleted")) return true;
  const normalized = normalizeVendorActivityAction(action);
  return /user deleted|vendor deleted|vendor rejected|password reset|delete blocked/i.test(
    String(action || "")
  ) || /^vendor (deleted|rejected)$/i.test(normalized);
}

function formatUserActivityDetailPieces(detail: string): string[] {
  const segments = String(detail || "")
    .split(/\s*·\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  let name = "";
  let mail = "";
  let role = "";

  for (const segment of segments.length > 0 ? segments : [String(detail || "")]) {
    for (const part of segment.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean)) {
      if (/^user\s+id\s*[-:]/i.test(part) || /^id\s*[-:]/i.test(part)) continue;
      if (/^status\s*[-:]/i.test(part)) continue;

      const stripped = stripActivityDetailLabel(part);
      if (!stripped || ACTIVITY_UUID_RE.test(stripped)) continue;

      if (/^role\s*[-:]/i.test(part)) {
        role = stripped;
        continue;
      }
      if (/^(mail|email)\s*[-:]/i.test(part)) {
        mail = stripped;
        continue;
      }
      if (/^(user|name)\s*[-:]/i.test(part)) {
        name = stripped;
        continue;
      }
      if (ACTIVITY_EMAIL_RE.test(stripped)) {
        mail = stripped;
        continue;
      }
      if (!name) {
        name = stripped;
        continue;
      }
      if (!role) {
        role = stripped;
      }
    }
  }

  return [name, mail, role].filter(Boolean);
}

function formatActivityDetailPieces(detail: string, action: string): string[] {
  if (isUserStaffAction(action)) {
    return formatUserActivityDetailPieces(detail);
  }
  return splitActivityDetail(detail)
    .map(stripActivityDetailLabel)
    .filter((part) => part && !ACTIVITY_UUID_RE.test(part));
}

function canViewStaffActivities(role: string | undefined): boolean {
  return canAccessSuperAdminPage(role, "Settings");
}

export function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("general");
  const didApplyDefaultUsersTab = useRef(false);
  
  const settingsTabs: SettingsTab[] = [
    { id: "general", label: t('settings.general'), icon: Store },
    { id: "users", label: t('settings.users'), icon: Users },
    { id: "appearance", label: t('settings.appearance'), icon: Palette },
    { id: "activities", label: t('settings.activities'), icon: Activity },
  ];

  const visibleSettingsTabs = settingsTabs.filter((tab) => {
    if (tab.id === "appearance") return false;
    if (tab.id === "users") return isOwnerRole(user?.role);
    if (tab.id === "activities") return canViewStaffActivities(user?.role);
    return true;
  });

  const applyAuthUsersTransform = useCallback(
    (data: any[]) => {
      const transformedUsers = data.map((u: any) => {
        const fallback = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(u.email || "user")}`;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || "",
          role: u.role,
          storeId: u.storeId || "",
          status: u.status || "active",
          profileImageUrl: u.profileImageUrl,
          avatar: u.profileImageUrl || fallback,
          lastActive: u.createdAt
            ? new Date(u.createdAt).toLocaleDateString()
            : new Date().toLocaleDateString(),
        };
      });
      if (user?.role === "store-owner") {
        const userStoreId = user.storeId || "";
        return transformedUsers.filter((u: any) => (u.storeId || "") === userStoreId);
      }
      return isOwnerRole(user?.role) ? transformedUsers : [];
    },
    [user?.role, user?.storeId]
  );

  const initialAuthUsersRaw = (() => {
    const peeked = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_AUTH_USERS);
    if (Array.isArray(peeked)) return peeked;
    const fromLs = readPersistedJson<any[]>(LS_ADMIN_AUTH_USERS, PERSISTED_CATALOG_TTL_MS);
    if (fromLs && Array.isArray(fromLs) && fromLs.length > 0) {
      moduleCache.prime(CACHE_KEYS.ADMIN_AUTH_USERS, fromLs);
      return fromLs;
    }
    return [];
  })();

  const [showUserDialog, setShowUserDialog] = useState(false);
  const [viewingUserProfile, setViewingUserProfile] = useState<any>(null);
  const [userProfileInitialEdit, setUserProfileInitialEdit] = useState(false);
  const [usersLoading, setUsersLoading] = useState(
    () => initialAuthUsersRaw.length === 0
  );
  const [usersListRefreshing, setUsersListRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // General Settings State
  const [storeName, setStoreName] = useState("SECURE");
  const [storeEmail, setStoreEmail] = useState("info@secure.com");
  const [storePhone, setStorePhone] = useState("+95 9 XXX XXX XXX");
  const [storeAddress, setStoreAddress] = useState("123 Main St, Yangon, Myanmar");
  const [termsContent, setTermsContent] = useState("");
  const [privacyPolicyContent, setPrivacyPolicyContent] = useState("");
  const [currency, setCurrency] = useState("MMK");
  const [timezone, setTimezone] = useState("Asia/Yangon");
  const [storeLogo, setStoreLogo] = useState("");
  const [storeLogoPreview, setStoreLogoPreview] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Banner State
  const [banners, setBanners] = useState([
    {
      id: 1,
      title: "Exclusive Collection",
      subtitle: "Discover premium products crafted for elegance",
      bg: "from-teal-600 to-cyan-600",
      badgeText: "Premium Selection",
      cta: "Explore Collection",
      textColor: 'light' as const,
      backgroundImage: ""
    }
  ]);
  const [uploadingBanner, setUploadingBanner] = useState<number | null>(null);
  const [nextBannerId, setNextBannerId] = useState(2);

  // Add new banner
  const addNewBanner = () => {
    const newBanner = {
      id: nextBannerId,
      title: "New Banner",
      subtitle: "Add your banner description here",
      bg: "from-slate-600 to-slate-800",
      badgeText: "New",
      cta: "Shop Now",
      textColor: 'light' as const,
      backgroundImage: ""
    };
    setBanners(prev => [...prev, newBanner]);
    setNextBannerId(prev => prev + 1);
    toast.success('New banner added');
  };

  // Delete banner
  const deleteBanner = (bannerId: number) => {
    if (banners.length === 1) {
      toast.error('You must have at least one banner');
      return;
    }
    setBanners(prev => prev.filter(b => b.id !== bannerId));
    toast.success('Banner deleted');
  };

  const [users, setUsers] = useState<any[]>(() => applyAuthUsersTransform(initialAuthUsersRaw));

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userRole, setUserRole] = useState("data-entry");
  const [userStoreId, setUserStoreId] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [addUserFormErrors, setAddUserFormErrors] = useState<AddUserFormErrors>({});
  const initialStaffActivities = peekStaffActivitiesCache() || [];
  const [staffActivities, setStaffActivities] = useState<StaffActivityRow[]>(initialStaffActivities);
  const [activitiesLoading, setActivitiesLoading] = useState(initialStaffActivities.length === 0);
  const [activitiesRefreshing, setActivitiesRefreshing] = useState(false);
  const [activitiesClearing, setActivitiesClearing] = useState(false);

  useEffect(() => {
    if (activeTab === "users" && !isOwnerRole(user?.role)) {
      setActiveTab("general");
    }
    if (activeTab === "activities" && !canViewStaffActivities(user?.role)) {
      setActiveTab("general");
    }
    if (activeTab === "appearance") {
      setActiveTab("general");
    }
  }, [activeTab, user?.role]);

  /** Store owners default to Users; everyone else (e.g. administrator, data-entry) stays on General. */
  useLayoutEffect(() => {
    if (!user?.role || didApplyDefaultUsersTab.current) return;
    if (isOwnerRole(user.role)) {
      didApplyDefaultUsersTab.current = true;
      setActiveTab("users");
    }
  }, [user?.id, user?.role]);

  const loadGeneralSettings = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data) {
          setStoreName(normalizePlatformStoreName(data.storeName));
          setStoreEmail(data.storeEmail || "info@secure.com");
          setStorePhone(data.storePhone || "+95 9 XXX XXX XXX");
          setStoreAddress(data.storeAddress || "123 Main St, Yangon, Myanmar");
          setTermsContent(data.termsContent || "");
          setPrivacyPolicyContent(data.privacyPolicyContent || "");
          setCurrency(data.currency || "MMK");
          setTimezone(data.timezone || "Asia/Yangon");
          setStoreLogo(data.storeLogo || "");
          setStoreLogoPreview(data.storeLogo || "");
        }
      }
    } catch (err: any) {
      console.error('Error loading general settings:', err);
      if (err.name === 'AbortError') {
        toast.error('Settings load timed out. Using defaults.');
      }
      // Continue with defaults
    }
  };

  // Load general settings from database
  useEffect(() => {
    if (activeTab === 'general') {
      loadGeneralSettings();
    }
    if (activeTab === 'appearance') {
      loadBannersSettings();
    }
  }, [activeTab]);

  // Live sync: Terms / Privacy textareas update when KV changes (other tabs or policy pages).
  useEffect(() => {
    if (activeTab !== "general") return;
    return subscribeStorefrontPolicyUpdates({
      includePlatform: true,
      onLivePatch: (patch) => {
        if (patch.scope !== "platform") return;
        if (patch.storeName) setStoreName(patch.storeName);
        if (patch.storeEmail) setStoreEmail(patch.storeEmail);
        if (patch.storeAddress) setStoreAddress(patch.storeAddress);
        if (patch.kind === "terms") setTermsContent(patch.content);
        if (patch.kind === "privacy") setPrivacyPolicyContent(patch.content);
      },
      onUpdate: () => void loadGeneralSettings(),
    });
  }, [activeTab]);

  const loadBannersSettings = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/banners`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const bannersData = await response.json();
        if (Array.isArray(bannersData) && bannersData.length > 0) {
          setBanners(bannersData);
          // Set next ID to be higher than the highest existing ID
          const maxId = Math.max(...bannersData.map((b: any) => b.id || 0));
          setNextBannerId(maxId + 1);
        }
      }
    } catch (err: any) {
      console.error('Error loading banners:', err);
      if (err.name === 'AbortError') {
        toast.error('Banners load timed out. Using defaults.');
      }
      // Continue with default banners
    }
  };

  const saveGeneralSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeName,
            storeEmail,
            storePhone,
            storeAddress,
            termsContent,
            privacyPolicyContent,
            currency,
            timezone,
            storeLogo,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // 🔥 Trigger event to update logo/name in SideNav immediately
      window.dispatchEvent(new CustomEvent('logoUpdated', { 
        detail: { logoUrl: storeLogo, storeName: storeName } 
      }));
      notifyStorefrontPolicyUpdated({
        scope: "platform",
        snapshot: {
          storeName,
          storeEmail,
          storeAddress,
          termsContent,
          privacyPolicyContent,
        },
      });

      toast.success('Settings saved successfully!');
    } catch (err: any) {
      console.error('Error saving general settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Banner upload handler
  const handleBannerUpload = async (bannerId: number, file: File) => {
    setUploadingBanner(bannerId);
    try {
      // Import and use the image compression utility
      const { compressImageToFile } = await import('../../utils/imageCompression');
      const compressedFile = await compressImageToFile(file, 500); // Compress to max 500KB
      
      console.log('📤 Uploading compressed banner:', compressedFile.size / 1024, 'KB');
      
      // Create FormData for upload
      const formData = new FormData();
      formData.append('image', compressedFile);
      formData.append('bannerId', bannerId.toString());
      
      // Upload to backend
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/upload-banner`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: formData,
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Upload failed:', errorData);
        throw new Error(errorData.error || 'Failed to upload banner');
      }
      
      const data = await response.json();
      console.log('✅ Banner upload success:', data);
      
      // Update banner with new image URL
      setBanners(prev => prev.map(b => 
        b.id === bannerId ? { ...b, backgroundImage: data.imageUrl } : b
      ));
      
      toast.success('Banner image uploaded successfully!');
    } catch (error: any) {
      console.error('Error uploading banner:', error);
      toast.error(error.message || 'Failed to upload banner');
    } finally {
      setUploadingBanner(null);
    }
  };

  // Update banner text
  const updateBannerText = (bannerId: number, field: string, value: string) => {
    setBanners(prev => prev.map(b => 
      b.id === bannerId ? { ...b, [field]: value } : b
    ));
  };

  // Save banners to backend
  const saveBanners = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/banners`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ banners }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save banners');
      }

      toast.success('Banners saved successfully!');
    } catch (err: any) {
      console.error('Error saving banners:', err);
      toast.error('Failed to save banners');
    } finally {
      setSaving(false);
    }
  };

  const syncUsersFromApi = async () => {
    console.log("🔄 Syncing users from Supabase Auth...");
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/sync-users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error("Failed to sync users");
    }
    const data = await response.json();
    console.log("✅ Sync complete:", data);
    invalidateAdminAuthUsersCache();
  };

  const loadUsers = useCallback(
    async (forceRefresh = false) => {
      if (!isOwnerRole(user?.role)) return;

      const handleFetchError = (err: any) => {
        console.error("Error fetching users:", err);
        if (err.name === "AbortError") {
          setError(
            "Request timed out. The server might be starting up. Please try again in a moment."
          );
          toast.error("Request timed out. Please try again.");
        } else {
          setError(err.message || "Failed to load users");
          toast.error("Failed to load users");
        }
      };

      if (!moduleCache.peek(CACHE_KEYS.ADMIN_AUTH_USERS)) {
        const fromLs = readPersistedJson<any[]>(LS_ADMIN_AUTH_USERS, PERSISTED_CATALOG_TTL_MS);
        if (fromLs && Array.isArray(fromLs) && fromLs.length > 0) {
          moduleCache.prime(CACHE_KEYS.ADMIN_AUTH_USERS, fromLs);
        }
      }

      if (!forceRefresh) {
        const peeked = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_AUTH_USERS);
        if (peeked != null && Array.isArray(peeked)) {
          setUsers(applyAuthUsersTransform(peeked));
          setUsersLoading(false);
          setError("");
          try {
            const raw = await getCachedAdminAuthUsers(true);
            if (!raw || raw.length === 0) {
              console.log("⚠️ No users found after revalidate, attempting sync...");
              await syncUsersFromApi();
              const rawAfter = await getCachedAdminAuthUsers(true);
              if (!rawAfter || rawAfter.length === 0) {
                setUsers([]);
                return;
              }
              setUsers(applyAuthUsersTransform(rawAfter));
              return;
            }
            setUsers(applyAuthUsersTransform(raw));
            const ownerRow = raw.find(
              (u: any) => u.role === "super-admin" || u.role === "store-owner"
            );
            if (ownerRow) {
              console.log("✅ Store owner row loaded:", ownerRow.email);
            }
          } catch (err: any) {
            handleFetchError(err);
          } finally {
            setUsersListRefreshing(false);
          }
          return;
        }
      }

      let showLoadingTimer: ReturnType<typeof setTimeout> | null = null;
      if (!forceRefresh) {
        showLoadingTimer = setTimeout(() => setUsersLoading(true), 300);
      } else {
        setUsersLoading(true);
      }
      setUsersListRefreshing(forceRefresh);
      setError("");
      try {
        const raw = await getCachedAdminAuthUsers(forceRefresh);
        if (!raw || raw.length === 0) {
          console.log("⚠️ No users found, attempting sync...");
          await syncUsersFromApi();
          const rawAfter = await getCachedAdminAuthUsers(true);
          if (!rawAfter || rawAfter.length === 0) {
            setUsers([]);
            return;
          }
          setUsers(applyAuthUsersTransform(rawAfter));
          return;
        }
        setUsers(applyAuthUsersTransform(raw));
        const ownerRow = raw.find(
          (u: any) => u.role === "super-admin" || u.role === "store-owner"
        );
        if (ownerRow) {
          console.log("✅ Store owner row loaded:", ownerRow.email);
        }
      } catch (err: any) {
        handleFetchError(err);
      } finally {
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setUsersLoading(false);
        setUsersListRefreshing(false);
      }
    },
    [user?.role, user?.storeId]
  );

  useEffect(() => {
    if (activeTab === "users" && isOwnerRole(user?.role)) {
      loadUsers(false);
    }
  }, [activeTab, user?.role, loadUsers]);

  const loadActivities = useCallback(
    async (opts?: { forceFull?: boolean; showFullLoading?: boolean }) => {
      if (!canViewStaffActivities(user?.role)) return;

      const cached = peekStaffActivitiesCache();
      const hasCached = Boolean(cached && cached.length > 0);

      if (opts?.showFullLoading && !hasCached) {
        setActivitiesLoading(true);
      }

      try {
        if (opts?.forceFull || !hasCached) {
          const list = await getCachedStaffActivities(Boolean(opts?.forceFull));
          setStaffActivities(list);
          primeStaffActivitiesCache(list);
          return;
        }

        const latestAt = cached?.[0]?.at;
        if (!latestAt) return;

        const incoming = await fetchIncrementalStaffActivities(latestAt);
        if (incoming.length === 0) return;

        setStaffActivities((prev) => {
          const merged = mergeStaffActivities(prev, incoming);
          primeStaffActivitiesCache(merged);
          return merged;
        });
      } catch (err) {
        console.warn("Staff activities load skipped:", err);
        if (!hasCached) setStaffActivities([]);
      } finally {
        setActivitiesLoading(false);
        setActivitiesRefreshing(false);
      }
    },
    [user?.role]
  );

  const handleClearStaffActivities = useCallback(async () => {
    if (!isOwnerRole(user?.role) || !user?.id) return;
    const confirmed = window.confirm(t("settings.activities.clearConfirm"));
    if (!confirmed) return;

    setActivitiesClearing(true);
    try {
      const ok = await clearStaffActivities(user.id);
      if (!ok) {
        toast.error(t("settings.activities.clearFailed"));
        return;
      }
      invalidateStaffActivitiesCache();
      primeStaffActivitiesCache([]);
      setStaffActivities([]);
      toast.success(t("settings.activities.clearSuccess"));
    } catch (err) {
      console.warn("Clear staff activities failed:", err);
      toast.error(t("settings.activities.clearFailed"));
    } finally {
      setActivitiesClearing(false);
    }
  }, [t, user?.id, user?.role]);

  useEffect(() => {
    if (activeTab !== "activities" || !canViewStaffActivities(user?.role)) return;

    const cached = peekStaffActivitiesCache();
    if (cached && cached.length > 0) {
      setStaffActivities(cached);
      setActivitiesLoading(false);
      void loadActivities();
    } else {
      void loadActivities({ showFullLoading: true });
    }

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void loadActivities();
    };

    const intervalId = window.setInterval(poll, STAFF_ACTIVITIES_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, user?.role, loadActivities]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 500);
      setUserAvatar(dataUrl);
      setAvatarPreview(dataUrl);
    } catch (err: any) {
      toast.error(err?.message || "Could not process image");
    }
    e.target.value = "";
  };

  const getRoleInfo = (role: string) => {
    const canon = canonicalizeStaffRoleForSave(role);
    switch (canon) {
      case "store-owner":
        return {
          label: t("role.storeOwner"),
          icon: Store,
          color: "text-purple-600 bg-purple-100",
          description: t("role.storeOwner.desc"),
        };
      case "administrator":
        return {
          label: t("role.administrator"),
          icon: ShieldCheck,
          color: "text-blue-600 bg-blue-100",
          description: t("role.administrator.desc"),
        };
      case "warehouse":
        return {
          label: t("role.warehouse"),
          icon: Warehouse,
          color: "text-amber-600 bg-amber-100",
          description: t("role.warehouse.desc"),
        };
      case "data-entry":
        return {
          label: t("role.dataEntry"),
          icon: FileEdit,
          color: "text-green-600 bg-green-100",
          description: t("role.dataEntry.desc"),
        };
      default:
        return {
          label: "Unknown",
          icon: Users,
          color: "text-slate-600 bg-slate-100",
          description: "",
        };
    }
  };

  const openAddDialog = () => {
    setUserName("");
    setUserEmail("");
    setUserPhone("");
    const choices = assignableRolesForCreator(user?.role);
    setUserRole(choices[0] || "data-entry");
    setUserAvatar("");
    setAvatarPreview("");
    setAddUserFormErrors({});
    setError("");
    setShowUserDialog(true);
  };

  const validateAddUserForm = () => {
    const errors: AddUserFormErrors = {};
    const allowedRoles = assignableRolesForCreator(user?.role);
    const name = userName.trim();
    const email = userEmail.trim().toLowerCase();
    const phone = userPhone.trim();
    const selectedRole = canonicalizeStaffRoleForSave(userRole);

    if (!name) {
      errors.name = "Full name is required.";
    } else if (name.length < 2) {
      errors.name = "Full name must be at least 2 characters.";
    }

    if (!email) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    if (phone) {
      const digitCount = phone.replace(/\D/g, "").length;
      if (!/^[\d+\-\s()]+$/.test(phone) || digitCount < 7 || digitCount > 15) {
        errors.phone = "Enter a valid phone number (7-15 digits).";
      }
    }

    if (!allowedRoles.includes(selectedRole)) {
      errors.role = "Selected role is not allowed for your account.";
    }

    setAddUserFormErrors(errors);

    return {
      isValid: Object.keys(errors).length === 0,
      normalized: {
        name,
        email,
        phone,
        role: selectedRole,
      },
    };
  };

  const handleSaveUser = async () => {
    const { isValid, normalized } = validateAddUserForm();
    if (!isValid) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    setError('');

    try {
      console.log(`➕ Creating new user: ${normalized.email}`);
      if (!user?.id) {
        throw new Error("You must be signed in to create staff accounts.");
      }

      const createPayload: Record<string, unknown> = {
        email: normalized.email,
        name: normalized.name,
        phone: normalized.phone,
        role: normalized.role,
        storeId: user?.storeId || '',
        createdBy: user.id,
      };
      if (typeof userAvatar === "string" && userAvatar.startsWith("data:image")) {
        createPayload.profileImage = userAvatar;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(createPayload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }

      const data = await response.json();
      console.log('✅ User created:', data);

      const fallbackAv =
        `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(normalized.email || normalized.name || "user")}`;
      const newUser = {
        id: data.userId,
        name: normalized.name,
        email: normalized.email,
        phone: normalized.phone,
        role: normalized.role,
        storeId: user?.storeId || '',
        status: "active",
        profileImageUrl: data.profileImageUrl,
        avatar: data.profileImageUrl || fallbackAv,
        lastActive: new Date().toISOString().split("T")[0],
      };
      setUsers([...users, newUser]);

      if (data.tempPassword != null && data.tempPassword !== "") {
        toast.success(
          <div className="space-y-2">
            <p className="font-semibold flex items-center gap-2">
              <span className="text-green-600">✓</span> {t('settings.users.created')}
            </p>
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-sm font-medium">{t('settings.users.temporaryPassword')}</p>
              <p className="font-mono bg-green-50 px-3 py-2 rounded mt-1 text-sm font-semibold">{data.tempPassword}</p>
              <p className="text-xs mt-2 text-slate-600">{t('settings.users.sharePassword')}</p>
            </div>
          </div>,
          { duration: 20000, className: 'bg-green-50 border-green-200' }
        );
      } else {
        toast.success(t('settings.users.created'));
      }

      setShowUserDialog(false);
      
      // Refresh users list from backend to ensure sync (with delay to allow DB commit)
      console.log('⏳ Waiting 1.2s for backend to commit...');
      await new Promise(resolve => setTimeout(resolve, 1200));
      console.log("🔄 Refreshing user list...");
      invalidateAdminAuthUsersCache();
      await loadUsers(true);
    } catch (err: any) {
      console.error('❌ Error saving user:', err);
      setError(err.message || 'Failed to save user');
      toast.error(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;
    
    const newStatus = targetUser.status === "active" ? "inactive" : "active";
    
    // Optimistically update UI
    setUsers(users.map(u =>
      u.id === userId
        ? { ...u, status: newStatus }
        : u
    ));
    
    // Persist to backend
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/user/${userId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            status: newStatus,
            updatedBy: user?.id || "",
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update user status');
      }
      
      console.log(`✅ User status updated to ${newStatus}`);
    } catch (error) {
      console.error('❌ Error updating user status:', error);
      // Revert on error
      setUsers(users.map(u =>
        u.id === userId
          ? { ...u, status: targetUser.status }
          : u
      ));
      toast.error('Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This will permanently remove the user and all associated data from the database.")) {
      return;
    }

    try {
      console.log(`🗑️ Deleting user: ${userId}`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/user/${userId}?deletedBy=${encodeURIComponent(String(user?.id || ""))}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      console.log(`✅ User deleted successfully:`, data);

      setUsers(users.filter((u) => u.id !== userId));
      invalidateAdminAuthUsersCache();

      toast.success("User deleted successfully from database!");
    } catch (error: any) {
      console.error("❌ Error deleting user:", error);
      toast.error(error.message || "Failed to delete user");
    }
  };

  const handleSaveUserProfile = (updatedUser: any) => {
    const fallback = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(updatedUser.email || "user")}`;
    const avatar =
      updatedUser.profileImageUrl ||
      (typeof updatedUser.avatar === "string" && updatedUser.avatar.startsWith("http")
        ? updatedUser.avatar
        : null) ||
      fallback;
    setUsers(
      users.map((u) =>
        u.id === updatedUser.id ? { ...u, ...updatedUser, avatar, profileImageUrl: updatedUser.profileImageUrl } : u
      )
    );
    setViewingUserProfile(null);
    setUserProfileInitialEdit(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <div className="space-y-6">
            {/* Store Information */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.general.storeInfo')}</h3>
              <div className="space-y-4">
                {/* Store Logo Upload */}
                <div>
                  <Label htmlFor="storeLogo" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.storeLogo')}
                  </Label>
                  
                  {/* Logo Preview & Upload Box - 150px square */}
                  <div
                    className="w-[150px] h-[150px] border-2 border-dashed border-slate-300 rounded-lg hover:border-slate-400 transition-colors cursor-pointer bg-slate-50 hover:bg-slate-100 flex items-center justify-center overflow-hidden relative group"
                    onClick={() => document.getElementById('storeLogoUpload')?.click()}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                    ) : storeLogoPreview ? (
                      <>
                        <img
                          src={storeLogoPreview}
                          alt={t('settings.general.storeLogo')}
                          className="w-full h-full object-cover rounded-md"
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                          <Upload className="w-6 h-6 text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Upload className="w-8 h-8 text-slate-400 mb-1" />
                        <p className="text-xs text-slate-500">{t('settings.general.uploadLogo')}</p>
                      </div>
                    )}
                  </div>
                  
                  <input
                    id="storeLogoUpload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      setUploadingLogo(true);
                      try {
                        // Import and use the image compression utility that returns a File
                        const { compressImageToFile } = await import('../../utils/imageCompression');
                        const compressedFile = await compressImageToFile(file, 500);
                        
                        console.log('📤 Uploading compressed logo:', compressedFile.size / 1024, 'KB');
                        
                        // Create FormData for upload
                        const formData = new FormData();
                        formData.append('image', compressedFile);
                        formData.append('storeName', storeName);
                        
                        // Upload to backend
                        const response = await fetch(
                          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/upload-logo`,
                          {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${publicAnonKey}`,
                            },
                            body: formData,
                          }
                        );
                        
                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({}));
                          console.error('Upload failed:', errorData);
                          throw new Error(errorData.error || 'Failed to upload logo');
                        }
                        
                        const data = await response.json();
                        console.log('✅ Upload success:', data);
                        setStoreLogo(data.imageUrl);
                        setStoreLogoPreview(data.imageUrl);
                        
                        // 🔥 Trigger a custom event to update SideNav logo in real-time
                        window.dispatchEvent(new CustomEvent('logoUpdated', { 
                          detail: { logoUrl: data.imageUrl } 
                        }));
                        
                        toast.success('Logo uploaded successfully!');
                      } catch (error: any) {
                        console.error('Error uploading logo:', error);
                        toast.error(error.message || 'Failed to upload logo');
                      } finally {
                        setUploadingLogo(false);
                      }
                    }}
                  />
                  
                  {storeLogoPreview && !uploadingLogo && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStoreLogo("");
                          setStoreLogoPreview("");
                          toast.success(t('settings.general.logoRemoved'));
                        }}
                        className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('settings.general.removeLogo')}
                      </Button>
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/');
                        }}
                        className="mt-2 ml-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      >
                        <Store className="w-4 h-4 mr-2" />
                        View Storefront
                      </Button>
                    </>
                  )}
                </div>

                <div>
                  <Label htmlFor="storeName" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.storeName')}
                  </Label>
                  <Input
                    id="storeName"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="h-10 max-w-md"
                  />
                </div>

                <div>
                  <Label htmlFor="storeEmail" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.contactEmail')}
                  </Label>
                  <Input
                    id="storeEmail"
                    type="email"
                    value={storeEmail}
                    onChange={(e) => setStoreEmail(e.target.value)}
                    className="h-10 max-w-md"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {t('settings.general.contactEmailHint')}
                  </p>
                </div>

                <div>
                  <Label htmlFor="storePhone" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.phoneNumber')}
                  </Label>
                  <Input
                    id="storePhone"
                    type="number"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    className="h-10 max-w-md"
                  />
                </div>

                <div>
                  <Label htmlFor="storeAddress" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.storeAddress')}
                  </Label>
                  <Textarea
                    id="storeAddress"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="max-w-md resize-y min-h-[80px]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 max-w-3xl">
                  <div>
                    <Label htmlFor="termsContent" className="text-sm font-medium text-slate-900 mb-2 block">
                      {t('settings.general.termsContent')}
                    </Label>
                    <Textarea
                      id="termsContent"
                      value={termsContent}
                      onChange={(e) => setTermsContent(e.target.value)}
                      placeholder={t('settings.general.termsContentPlaceholder')}
                      className="min-h-[180px] resize-y bg-white"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {t('settings.general.termsContentHint')}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="privacyPolicyContent" className="text-sm font-medium text-slate-900 mb-2 block">
                      {t('settings.general.privacyContent')}
                    </Label>
                    <Textarea
                      id="privacyPolicyContent"
                      value={privacyPolicyContent}
                      onChange={(e) => setPrivacyPolicyContent(e.target.value)}
                      placeholder={t('settings.general.privacyContentPlaceholder')}
                      className="min-h-[180px] resize-y bg-white"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {t('settings.general.privacyContentHint')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Regional Settings */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.general.regionalSettings')}</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="currency" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.currency')}
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-10 max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MMK">{t('currency.MMK')}</SelectItem>
                      <SelectItem value="CNY">{t('currency.CNY')}</SelectItem>
                      <SelectItem value="USD">{t('currency.USD')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="timezone" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.timezone')}
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="h-10 max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">{t('timezone.America/New_York')}</SelectItem>
                      <SelectItem value="America/Chicago">{t('timezone.America/Chicago')}</SelectItem>
                      <SelectItem value="America/Denver">{t('timezone.America/Denver')}</SelectItem>
                      <SelectItem value="America/Los_Angeles">{t('timezone.America/Los_Angeles')}</SelectItem>
                      <SelectItem value="Europe/London">{t('timezone.Europe/London')}</SelectItem>
                      <SelectItem value="Asia/Tokyo">{t('timezone.Asia/Tokyo')}</SelectItem>
                      <SelectItem value="Asia/Yangon">{t('timezone.Asia/Yangon')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="language" className="text-sm font-medium text-slate-900 mb-2 block">
                    <Globe className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                    {t('settings.general.language')}
                  </Label>
                  <Select value={language} onValueChange={(value: 'en' | 'zh') => setLanguage(value)}>
                    <SelectTrigger className="h-10 max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🇺🇸</span>
                          <span>{t('language.english')}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="zh">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🇨🇳</span>
                          <span>{t('language.chinese')}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('settings.general.languageHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Vendor Custom Domains - HIDDEN (keep code for future use) */}
            {false && (
            <div className="pt-6 border-t border-slate-200">
              <VendorDomainsList />
            </div>
            )}

            {/* Store Logo */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.general.storeLogo')}</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="storeLogo" className="text-sm font-medium text-slate-900 mb-2 block">
                    {t('settings.general.storeLogo')}
                  </Label>
                  
                  {/* Logo Preview */}
                  <div className="mb-3">
                    <div className="w-48 h-48 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-slate-200">
                      {storeLogoPreview ? (
                        <img
                          src={storeLogoPreview}
                          alt={t('settings.general.storeLogo')}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center px-4">
                          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-500">{t('settings.general.noLogoUploaded')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('storeLogoUpload')?.click()}
                      className="relative"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {storeLogoPreview ? t('settings.general.changeLogo') : t('settings.general.uploadLogo')}
                    </Button>
                    
                    {storeLogoPreview && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setStoreLogo("");
                          setStoreLogoPreview("");
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('common.remove')}
                      </Button>
                    )}
                  </div>
                  
                  <input
                    id="storeLogoUpload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const dataUrl = await compressImage(file, 500);
                        setStoreLogo(dataUrl);
                        setStoreLogoPreview(dataUrl);
                      } catch (err: any) {
                        toast.error(err?.message || "Could not process image");
                      }
                      e.target.value = "";
                    }}
                  />
                  
                  <p className="text-xs text-slate-500 mt-2">
                    {t('settings.general.logoHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-6 border-t border-slate-200">
              <Button 
                className="bg-slate-900 hover:bg-slate-800 text-white" 
                onClick={saveGeneralSettings}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {t('settings.general.saveChanges')}
                  </>
                )}
              </Button>
            </div>
          </div>
        );

      case "users":
        return (
          <div className="space-y-6">
            {/* Stats & Add Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 text-sm text-slate-600">
                <span>{users.length} {t('settings.users.totalUsers')}</span>
                <span className="h-4 w-px bg-slate-300"></span>
                <span>{users.filter(u => u.status === "active").length} {t('settings.users.active')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={openAddDialog}>
                  {t('settings.users.addUser')}
                </Button>
              </div>
            </div>

            {/* User Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {usersLoading && users.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                  <span className="ml-3 text-sm text-slate-600">{t('settings.users.loading')}</span>
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-600">{t('settings.users.noneFound')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('settings.users.emptyHint')}</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">{t('settings.users.user')}</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">{t('settings.users.role')}</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">{t('settings.users.status')}</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600">{t('settings.users.lastActive')}</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => {
                      const roleInfo = getRoleInfo(user.role);
                      const RoleIcon = roleInfo.icon;
                      
                      return (
                        <tr key={user.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                          {/* User Info */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-10 h-10 rounded-full flex-shrink-0"
                              />
                              <div>
                                <p className="font-medium text-sm text-slate-900">{user.name}</p>
                                <p className="text-xs text-slate-500">{user.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg ${roleInfo.color} flex items-center justify-center flex-shrink-0`}>
                                <RoleIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{roleInfo.label}</p>
                                <p className="text-xs text-slate-500">{roleInfo.description}</p>
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={user.status === "active"}
                                onCheckedChange={() => handleToggleStatus(user.id)}
                              />
                              <span className="text-sm text-slate-700">
                                {user.status === "active" ? t('settings.users.active.status') : t('settings.users.inactive.status')}
                              </span>
                            </div>
                          </td>

                          {/* Last Active */}
                          <td className="py-4 px-4">
                            <span className="text-sm text-slate-600">
                              {new Date(user.lastActive).toLocaleDateString()}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="w-4 h-4 text-slate-500" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setUserProfileInitialEdit(false);
                                    setViewingUserProfile(user);
                                  }}
                                >
                                  <User className="w-4 h-4 mr-2" />
                                  {t('settings.users.viewProfile')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setUserProfileInitialEdit(true);
                                    setViewingUserProfile(user);
                                  }}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t('settings.users.editUser')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="text-red-600"
                                  disabled={
                                    user.role === "store-owner" ||
                                    user.role === "super-admin"
                                  }
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t('settings.users.deleteUser')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Role Permissions Info */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.users.rolePermissions')}</h3>
              <div className="space-y-3">
                {/* Store Owner */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Store className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">{t('role.storeOwner')}</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        {t('role.storeOwner.permissions')}
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>{t('role.storeOwner.perm1')}</li>
                        <li>{t('role.storeOwner.perm2')}</li>
                        <li>{t('role.storeOwner.perm3')}</li>
                        <li>{t('role.storeOwner.perm4')}</li>
                        <li>{t('role.storeOwner.perm5')}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Administrator */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">{t('role.administrator')}</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        {t('role.administrator.permissions')}
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>{t('role.administrator.perm1')}</li>
                        <li>{t('role.administrator.permSettings1')}</li>
                        <li>{t('role.administrator.permSettings2')}</li>
                        <li>{t('role.administrator.permSettings3')}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Data Entry */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                      <FileEdit className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">{t('role.dataEntry')}</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        {t('role.dataEntry.permissions')}
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>{t('role.dataEntry.perm1')}</li>
                        <li>{t('role.dataEntry.perm2')}</li>
                        <li>{t('role.dataEntry.perm3')}</li>
                        <li>{t('role.dataEntry.perm4')}</li>
                        <li>{t('role.dataEntry.perm5')}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Warehouse */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Warehouse className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">{t('role.warehouse')}</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        {t('role.warehouse.permissions')}
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>{t('role.warehouse.perm1')}</li>
                        <li>{t('role.warehouse.perm2')}</li>
                        <li>{t('role.warehouse.perm3')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Add User Dialog (editing is on the full Edit User Profile page) */}
            <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t('settings.users.dialog.add.title')}</DialogTitle>
                  <DialogDescription>
                    {t('settings.users.dialog.add.description')}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="userAvatar" className="text-sm font-medium text-slate-900 mb-2 block">
                      {t('settings.users.dialog.profileImage')}
                    </Label>
                    <input
                      id="userAvatar"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleImageUpload}
                    />
                    <div className="flex flex-col gap-1.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => document.getElementById("userAvatar")?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            document.getElementById("userAvatar")?.click();
                          }
                        }}
                        className="relative size-[100px] shrink-0 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer overflow-hidden group outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                      >
                        {avatarPreview || userAvatar ? (
                          <>
                            <img
                              src={avatarPreview || userAvatar}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                              <Upload className="w-5 h-5 text-white" />
                              <span className="text-[10px] font-medium text-white leading-none">
                                {t('settings.users.dialog.changeImage')}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 text-slate-700 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white z-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUserAvatar("");
                                setAvatarPreview("");
                              }}
                              aria-label={t('settings.users.dialog.removeImage')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-0.5 px-1.5 text-center">
                            <Upload className="w-5 h-5 text-slate-400 shrink-0" />
                            <span className="text-[10px] font-semibold text-slate-800 leading-tight">
                              {t('settings.users.dialog.uploadImage')}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 max-w-[220px] leading-snug">
                        {t('settings.users.dialog.imageHint')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="userName" className="text-sm font-medium text-slate-900 mb-2 block">
                      {t('settings.users.dialog.fullName')}
                    </Label>
                    <Input
                      id="userName"
                      placeholder={t('settings.users.dialog.fullNamePlaceholder')}
                      value={userName}
                      onChange={(e) => {
                        setUserName(e.target.value);
                        if (addUserFormErrors.name) {
                          setAddUserFormErrors((prev) => ({ ...prev, name: undefined }));
                        }
                      }}
                      className="h-10"
                      aria-invalid={!!addUserFormErrors.name}
                    />
                    {addUserFormErrors.name ? (
                      <p className="text-xs text-red-600 mt-1">{addUserFormErrors.name}</p>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor="userEmail" className="text-sm font-medium text-slate-900 mb-2 block">
                      {t('settings.users.dialog.email')}
                    </Label>
                    <Input
                      id="userEmail"
                      type="email"
                      placeholder="john@example.com"
                      value={userEmail}
                      onChange={(e) => {
                        setUserEmail(e.target.value);
                        if (addUserFormErrors.email) {
                          setAddUserFormErrors((prev) => ({ ...prev, email: undefined }));
                        }
                      }}
                      className="h-10"
                      aria-invalid={!!addUserFormErrors.email}
                    />
                    {addUserFormErrors.email ? (
                      <p className="text-xs text-red-600 mt-1">{addUserFormErrors.email}</p>
                    ) : null}
                    <p className="text-xs text-slate-500 mt-1">
                      User will receive login credentials at this email
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="userPhone" className="text-sm font-medium text-slate-900 mb-2 block">
                      Phone number
                    </Label>
                    <Input
                      id="userPhone"
                      type="tel"
                      placeholder="+95 9 XXX XXX XXX"
                      value={userPhone}
                      onChange={(e) => {
                        setUserPhone(e.target.value);
                        if (addUserFormErrors.phone) {
                          setAddUserFormErrors((prev) => ({ ...prev, phone: undefined }));
                        }
                      }}
                      className="h-10"
                      aria-invalid={!!addUserFormErrors.phone}
                    />
                    {addUserFormErrors.phone ? (
                      <p className="text-xs text-red-600 mt-1">{addUserFormErrors.phone}</p>
                    ) : null}
                  </div>

                  <div>
                    <Label htmlFor="userRole" className="text-sm font-medium text-slate-900 mb-2 block">
                      Role
                    </Label>
                    <Select
                      value={userRole}
                      onValueChange={(value) => {
                        setUserRole(value);
                        if (addUserFormErrors.role) {
                          setAddUserFormErrors((prev) => ({ ...prev, role: undefined }));
                        }
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRolesForCreator(user?.role).map((r) => (
                          <SelectItem key={r} value={r}>
                            {getRoleInfo(r).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">
                      {getRoleInfo(userRole).description}
                    </p>
                    {addUserFormErrors.role ? (
                      <p className="text-xs text-red-600 mt-1">{addUserFormErrors.role}</p>
                    ) : null}
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowUserDialog(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveUser} 
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Add user"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        );

      case "appearance":
        return (
          <div className="space-y-6">
            {/* Hero Banners Management */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.appearance.heroBanners')}</h3>
              <p className="text-sm text-slate-600 mb-6">{t('settings.appearance.heroBannersDesc')}</p>
              
              <div className="space-y-6">
                {banners.map((banner, index) => (
                  <div key={banner.id} className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-slate-900">{t('settings.appearance.banner')} {index + 1}</h4>
                      {banners.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => deleteBanner(banner.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          {t('settings.appearance.delete')}
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      {/* Banner Image Upload */}
                      <div>
                        <Label className="text-sm font-medium text-slate-900 mb-2 block">
                          {t('settings.appearance.backgroundImage')}
                        </Label>
                        <div className="flex items-start gap-4">
                          {/* Image Preview */}
                          <div
                            className="w-40 h-24 border-2 border-dashed border-slate-300 rounded-lg hover:border-slate-400 transition-colors cursor-pointer bg-slate-50 hover:bg-slate-100 flex items-center justify-center overflow-hidden relative group"
                            onClick={() => document.getElementById(`banner-upload-${banner.id}`)?.click()}
                          >
                            {uploadingBanner === banner.id ? (
                              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                            ) : banner.backgroundImage ? (
                              <>
                                <img
                                  src={banner.backgroundImage}
                                  alt={`${t('settings.appearance.banner')} ${index + 1}`}
                                  className="w-full h-full object-cover rounded-md"
                                />
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                                  <Upload className="w-5 h-5 text-white" />
                                </div>
                              </>
                            ) : (
                              <div className="text-center">
                                <Image className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                                <p className="text-xs text-slate-500">{t('settings.appearance.bannerUpload')}</p>
                              </div>
                            )}
                          </div>
                          
                          <input
                            id={`banner-upload-${banner.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleBannerUpload(banner.id, file);
                              }
                            }}
                          />
                          
                          {/* Remove button */}
                          {banner.backgroundImage && uploadingBanner !== banner.id && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setBanners(prev => prev.map(b => 
                                  b.id === banner.id ? { ...b, backgroundImage: "" } : b
                                ));
                                toast.success(t('settings.appearance.bannerImageRemoved'));
                              }}
                              className="mt-1"
                            >
                              <X className="w-4 h-4 mr-1" />
                              {t('common.remove')}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">{t('settings.appearance.bannerHint')}</p>
                      </div>

                      {/* Banner Title */}
                      <div>
                        <Label htmlFor={`banner-title-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          {t('settings.appearance.bannerTitle')}
                        </Label>
                        <Input
                          id={`banner-title-${banner.id}`}
                          value={banner.title}
                          onChange={(e) => updateBannerText(banner.id, 'title', e.target.value)}
                          placeholder={t('settings.appearance.bannerTitlePlaceholder')}
                          className="h-10"
                        />
                      </div>

                      {/* Banner Subtitle */}
                      <div>
                        <Label htmlFor={`banner-subtitle-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          {t('settings.appearance.bannerSubtitle')}
                        </Label>
                        <Input
                          id={`banner-subtitle-${banner.id}`}
                          value={banner.subtitle}
                          onChange={(e) => updateBannerText(banner.id, 'subtitle', e.target.value)}
                          placeholder={t('settings.appearance.bannerSubtitlePlaceholder')}
                          className="h-10"
                        />
                      </div>

                      {/* Badge Text */}
                      <div>
                        <Label htmlFor={`banner-badge-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          {t('settings.appearance.badgeText')}
                        </Label>
                        <Input
                          id={`banner-badge-${banner.id}`}
                          value={banner.badgeText}
                          onChange={(e) => updateBannerText(banner.id, 'badgeText', e.target.value)}
                          placeholder={t('settings.appearance.bannerBadgePlaceholder')}
                          className="h-10"
                        />
                      </div>

                      {/* CTA Button Text */}
                      <div>
                        <Label htmlFor={`banner-cta-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          {t('settings.appearance.buttonText')}
                        </Label>
                        <Input
                          id={`banner-cta-${banner.id}`}
                          value={banner.cta}
                          onChange={(e) => updateBannerText(banner.id, 'cta', e.target.value)}
                          placeholder={t('settings.appearance.bannerButtonPlaceholder')}
                          className="h-10"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Add Banner Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addNewBanner}
                  className="w-full h-32 border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Plus className="w-6 h-6" />
                    <span className="font-medium">{t('settings.appearance.addBanner')}</span>
                  </div>
                </Button>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-6 border-t border-slate-200">
              <Button 
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={saveBanners}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {t('settings.appearance.save')}
                  </>
                )}
              </Button>
            </div>
          </div>
        );

      case "activities":
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">{t("settings.activities.title")}</h3>
                <div className="flex items-center gap-2">
                  {isOwnerRole(user?.role) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs hidden"
                      disabled={activitiesClearing || activitiesLoading || staffActivities.length === 0}
                      onClick={handleClearStaffActivities}
                    >
                      {activitiesClearing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          {t("settings.activities.clearing")}
                        </>
                      ) : (
                        t("settings.activities.clearAll")
                      )}
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {activitiesRefreshing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{t("settings.activities.refreshing")}</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-5 h-5 text-slate-400" />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4">{t("settings.activities.description")}</p>

              {activitiesLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-3" />
                  <p className="text-sm">{t("settings.activities.loading")}</p>
                </div>
              ) : staffActivities.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                  {t("settings.activities.empty")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    {t("settings.activities.showingCount").replace("{count}", String(staffActivities.length))}
                  </p>
                  <div className="space-y-3">
                    {staffActivities.map((activity) => {
                      const actorLabel =
                        String(activity.actorName || "").trim() ||
                        String(activity.actorEmail || "").trim() ||
                        t("settings.activities.unknownActor");
                      const roleInfo = getRoleInfo(activity.actorRole || "");
                      const vendorAction = normalizeVendorActivityAction(activity.action || "");
                      const isVendorAction = isVendorStaffAction(activity.action || "");
                      const isNeutral = isNeutralStaffActivity(
                        activity.action || "",
                        String(activity.type || "")
                      );
                      const detailPieces = formatActivityDetailPieces(
                        activity.detail || "",
                        activity.action || ""
                      );
                      const vendorContactLine = isVendorAction
                        ? formatVendorActivityContactLine(activity.detail || "")
                        : "";
                      const actorLine = (
                        <p className="text-xs text-slate-400 mt-1.5">
                          {t("settings.activities.by")} {actorLabel}
                          {roleInfo.label ? ` · ${roleInfo.label}` : ""}
                        </p>
                      );

                      return (
                        <div
                          key={`${activity.actorUserId}-${activity.id}`}
                          className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isNeutral ? "bg-slate-100" : "bg-green-100"
                            }`}
                          >
                            {isNeutral ? (
                              <Clock className="w-4 h-4 text-slate-500" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {isVendorAction ? (
                              <>
                                <p className="text-sm font-medium text-slate-900 leading-snug">
                                  <span>{vendorAction}</span>
                                  {vendorContactLine ? (
                                    <>
                                      <span className="text-slate-400 font-normal mx-1.5" aria-hidden="true">
                                        &gt;
                                      </span>
                                      <span className="font-normal text-slate-700">{vendorContactLine}</span>
                                    </>
                                  ) : null}
                                </p>
                                {actorLine}
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                                {detailPieces.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {detailPieces.map((piece, pieceIdx) => (
                                      <span
                                        key={`${activity.id}-piece-${pieceIdx}`}
                                        className="inline-flex max-w-full items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 break-words"
                                      >
                                        {piece}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {actorLine}
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            <span>{formatActivityDateTime(activity.at, language === "zh" ? "zh-CN" : undefined)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Show user profile if viewing
  if (viewingUserProfile) {
    return (
      <UserProfile
        user={viewingUserProfile}
        initialEditMode={userProfileInitialEdit}
        backLabel={t('profile.backToUsers')}
        onBack={() => {
          setViewingUserProfile(null);
          setUserProfileInitialEdit(false);
        }}
        onSave={handleSaveUserProfile}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 scrollbar-thin">
          <nav className="p-4">
            <ul className="space-y-1">
              {visibleSettingsTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <li key={tab.id}>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                        activeTab === tab.id
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium">{tab.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin [&::-webkit-scrollbar]:w-1">
          <div className={activeTab === "activities" ? "max-w-5xl p-6" : "max-w-3xl p-6"}>
            {renderTabContent()}
          </div>
        </main>
      </div>
    </div>
  );
}