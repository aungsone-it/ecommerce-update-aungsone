import { useState, useEffect, useRef, useMemo } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";
import { compressImage } from "../../utils/imageCompression";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft,
  Save,
  Upload,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  ShieldCheck,
  FileEdit,
  Code,
  Briefcase,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Store,
  Warehouse,
  Trash2,
  Pencil,
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

const AUTH_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dicebearAvatar(email: string) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(email || "user")}`;
}

function displayAvatarUrl(u: any): string {
  if (u?.profileImageUrl && String(u.profileImageUrl).startsWith("http")) {
    return u.profileImageUrl;
  }
  if (u?.avatar && String(u.avatar).startsWith("http")) {
    return u.avatar;
  }
  if (u?.avatar && String(u.avatar).startsWith("data:image")) {
    return u.avatar;
  }
  return dicebearAvatar(u?.email || "");
}

function isAuthStaffUserId(id: unknown): boolean {
  return typeof id === "string" && AUTH_USER_ID_RE.test(id);
}

function parseDateMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return Number.isNaN(new Date(v).getTime()) ? null : v;
  }
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = new Date(String(v));
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function formatDateTime(iso: unknown): string {
  const ms = parseDateMs(iso);
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateLong(iso: unknown): string {
  const ms = parseDateMs(iso);
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(iso: unknown): string {
  const ms = parseDateMs(iso);
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString();
}

function daysSince(iso: unknown): number | null {
  const a = parseDateMs(iso);
  if (a == null) return null;
  return Math.max(0, Math.floor((Date.now() - a) / 86400000));
}

interface UserProfileProps {
  user: any;
  onBack: () => void;
  onSave: (updatedUser: any) => void;
  /** When true (e.g. opened from Settings "Edit user"), start in edit mode instead of view mode. */
  initialEditMode?: boolean;
  /** e.g. "Back" for your own admin profile, "Back to Users" when managing staff */
  backLabel?: string;
}

export function UserProfile({
  user,
  onBack,
  onSave,
  initialEditMode = false,
  backLabel = "Back to Users",
}: UserProfileProps) {
  const { user: sessionUser } = useAuth();
  const isSelfProfile = Boolean(
    sessionUser?.id && user?.id && String(sessionUser.id) === String(user.id)
  );
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(!!initialEditMode);
  const [editedUser, setEditedUser] = useState(user);
  const [avatarPreview, setAvatarPreview] = useState(() => displayAvatarUrl(user));
  const [isSaving, setIsSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<string | null>(null);
  const [avatarMarkedForRemoval, setAvatarMarkedForRemoval] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [staffAuditEvents, setStaffAuditEvents] = useState<
    { id: string; type: string; action: string; detail: string; at: string }[]
  >([]);

  useEffect(() => {
    setIsEditing(!!initialEditMode);
  }, [user?.id, initialEditMode]);

  useEffect(() => {
    setEditedUser(user);
    setAvatarPreview(displayAvatarUrl(user));
    setAvatarFile(null);
    setAvatarMarkedForRemoval(false);

    if (!isAuthStaffUserId(user?.id)) {
      setStaffAuditEvents([]);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);
    (async () => {
      try {
        const [profileRes, activityRes] = await Promise.all([
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/profile/${user.id}`,
            { headers: { Authorization: `Bearer ${publicAnonKey}` } }
          ),
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/staff-activity/${user.id}`,
            { headers: { Authorization: `Bearer ${publicAnonKey}` } }
          ),
        ]);
        if (cancelled) return;
        if (profileRes.ok) {
          const data = await profileRes.json();
          const u = data.user;
          if (u && !cancelled) {
            setEditedUser((prev: any) => ({ ...prev, ...u }));
            setAvatarPreview(displayAvatarUrl({ ...user, ...u }));
          }
        }
        if (activityRes.ok) {
          const actData = await activityRes.json();
          const list = Array.isArray(actData.activities) ? actData.activities : [];
          if (!cancelled) {
            setStaffAuditEvents(
              list.filter(
                (x: unknown) =>
                  x &&
                  typeof x === "object" &&
                  typeof (x as { id?: string }).id === "string" &&
                  typeof (x as { action?: string }).action === "string"
              )
            );
          }
        } else if (!cancelled) {
          setStaffAuditEvents([]);
        }
      } catch (e) {
        console.warn("Profile refresh skipped:", e);
        if (!cancelled) setStaffAuditEvents([]);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.profileImageUrl, user?.avatar, user?.email]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 500);
      setAvatarPreview(dataUrl);
      setAvatarFile(dataUrl);
    } catch (err: any) {
      toast.error(err?.message || "Could not process image");
    }
    e.target.value = "";
  };

  const hasStoredProfilePhoto = (u: any) =>
    Boolean(
      u?.profileImage ||
        (typeof u?.profileImageUrl === "string" && u.profileImageUrl.startsWith("http"))
    );

  const handleRemoveAvatar = () => {
    if (avatarFile) {
      setAvatarFile(null);
      setAvatarPreview(displayAvatarUrl(user));
      return;
    }
    if (!hasStoredProfilePhoto(user) && !hasStoredProfilePhoto(editedUser)) return;
    setAvatarMarkedForRemoval(true);
    setAvatarPreview(dicebearAvatar(editedUser.email || ""));
  };

  const saveAuthStaffProfile = async () => {
    const payload: Record<string, unknown> = {
      name: editedUser.name,
      email: editedUser.email,
      phone: editedUser.phone ?? "",
      role: editedUser.role,
      location: editedUser.location ?? "",
      addressLine1: editedUser.addressLine1 ?? "",
      addressLine2: editedUser.addressLine2 ?? "",
      city: editedUser.city ?? "",
      region: editedUser.region ?? "",
      postalCode: editedUser.postalCode ?? "",
      country: editedUser.country ?? "",
      bio: editedUser.bio ?? "",
    };
    if (avatarFile) {
      payload.profileImage = avatarFile;
    } else if (avatarMarkedForRemoval) {
      payload.removeProfileImage = true;
    }
    if (editedUser.role !== user.role && sessionUser?.id) {
      payload.updatedBy = sessionUser.id;
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/user/${user.id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to update profile: ${response.statusText}`);
    }

    const result = await response.json();
    const updated = result.user;
    if (!updated) throw new Error("Invalid server response");

    const merged = {
      ...editedUser,
      ...updated,
      avatar: updated.profileImageUrl || dicebearAvatar(String(updated.email || editedUser.email || "")),
      profileImageUrl: updated.profileImageUrl,
    };
    setEditedUser(merged);
    setAvatarPreview(displayAvatarUrl(merged));
    setAvatarFile(null);
    setAvatarMarkedForRemoval(false);
    setIsEditing(false);
    onSave(merged);
    return merged;
  };

  const saveLegacyProfile = async () => {
    let avatarUrl = editedUser.avatar;
    if (avatarFile) {
      const avatarResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/users/${user.id}/avatar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageData: avatarFile,
            fileName: `avatar-${Date.now()}.jpg`,
          }),
        }
      );

      if (!avatarResponse.ok) {
        const errorData = await avatarResponse.json().catch(() => ({ error: avatarResponse.statusText }));
        throw new Error(errorData.error || `Failed to upload avatar: ${avatarResponse.statusText}`);
      }

      const avatarData = await avatarResponse.json();
      avatarUrl = avatarData.avatarUrl;
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/users/${user.id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...editedUser,
          avatar: avatarUrl,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to update profile: ${response.statusText}`);
    }

    const result = await response.json();
    const merged = result.user;
    setEditedUser(merged);
    setAvatarPreview(merged.avatar || displayAvatarUrl(merged));
    setAvatarFile(null);
    setIsEditing(false);
    onSave(merged);
    return merged;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log(`💾 Saving user profile: ${user.id}`, editedUser);
      if (isAuthStaffUserId(user.id)) {
        await saveAuthStaffProfile();
      } else {
        await saveLegacyProfile();
      }
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      console.error("❌ Error saving user profile:", error);
      toast.error(`Failed to save profile: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedUser(user);
    setAvatarPreview(displayAvatarUrl(user));
    setAvatarFile(null);
    setAvatarMarkedForRemoval(false);
    setIsEditing(false);
  };

  const getRoleInfo = (role: string) => {
    switch (role) {
      case "super-admin":
        return {
          label: "Super Admin",
          icon: ShieldCheck,
          color: "text-violet-600 bg-violet-100",
          description: "Full platform access",
        };
      case "store-owner":
        return {
          label: "Store Owner",
          icon: Store,
          color: "text-purple-600 bg-purple-100",
          description: "Business owner with full store access and control",
        };
      case "administrator":
        return {
          label: "Administrator",
          icon: ShieldCheck,
          color: "text-blue-600 bg-blue-100",
          description: "Manage products, orders, and users",
        };
      case "data-entry":
        return {
          label: "Data Entry",
          icon: FileEdit,
          color: "text-green-600 bg-green-100",
          description: "Add and edit products, manage inventory",
        };
      case "warehouse":
        return {
          label: "Warehouse",
          icon: Warehouse,
          color: "text-amber-600 bg-amber-100",
          description: "Fulfillment and inventory operations",
        };
      case "vendor-admin":
        return {
          label: "Vendor Admin",
          icon: Store,
          color: "text-indigo-600 bg-indigo-100",
          description: "Vendor storefront management",
        };
      case "collaborator":
        return {
          label: "Collaborator",
          icon: Briefcase,
          color: "text-sky-600 bg-sky-100",
          description: "Collaborator access",
        };
      case "developer":
        return {
          label: "Developer",
          icon: Code,
          color: "text-orange-600 bg-orange-100",
          description: "Technical access for integrations",
        };
      case "product-manager":
        return {
          label: "Product Manager",
          icon: Briefcase,
          color: "text-pink-600 bg-pink-100",
          description: "Define and manage product strategy",
        };
      default:
        return {
          label: "Unknown",
          icon: Shield,
          color: "text-slate-600 bg-slate-100",
          description: "",
        };
    }
  };

  const roleInfo = getRoleInfo(editedUser.role);
  const RoleIcon = roleInfo.icon;

  const memberSinceSource = editedUser.createdAt || editedUser.authCreatedAt;
  const daysAsMember = daysSince(memberSinceSource);
  const lastActiveSource =
    editedUser.lastSignInAt || editedUser.updatedAt || editedUser.lastActive;

  const accountTimeline = useMemo(() => {
    type Row = {
      id: string;
      action: string;
      target: string;
      at: number;
      status: "success" | "neutral";
    };
    const rows: Row[] = [];

    for (const ev of staffAuditEvents) {
      const atMs = parseDateMs(ev.at);
      if (atMs == null) continue;
      rows.push({
        id: `audit-${ev.id}`,
        action: ev.action,
        target: ev.detail || "",
        at: atMs,
        status: ev.type === "product_deleted" ? "neutral" : "success",
      });
    }

    const created = editedUser.createdAt || editedUser.authCreatedAt;
    const cMs = parseDateMs(created);
    if (cMs != null) {
      rows.push({
        id: "created",
        action: "Account created",
        target: "Staff profile record",
        at: cMs,
        status: "success",
      });
    }
    const sMs = parseDateMs(editedUser.lastSignInAt);
    if (sMs != null) {
      rows.push({
        id: "signin",
        action: "Last sign-in",
        target: "Supabase Auth (most recent session)",
        at: sMs,
        status: "success",
      });
    }
    const uMs = parseDateMs(editedUser.updatedAt);
    if (uMs != null && uMs !== cMs) {
      rows.push({
        id: "profile",
        action: "Profile updated",
        target: "Saved changes to this profile",
        at: uMs,
        status: "neutral",
      });
    }
    rows.sort((a, b) => b.at - a.at);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      target: r.target,
      timestamp: formatDateTime(r.at),
      status: r.status,
    }));
  }, [
    staffAuditEvents,
    editedUser.createdAt,
    editedUser.authCreatedAt,
    editedUser.lastSignInAt,
    editedUser.updatedAt,
  ]);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {backLabel}
            </Button>
            <div className="h-6 w-px bg-slate-300"></div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {isEditing ? "Edit User Profile" : "User Profile"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {isEditing
                  ? isSelfProfile
                    ? "Update your photo, contact details, address, and bio"
                    : "Update user information and permissions"
                  : isSelfProfile
                    ? "Your account details"
                    : "View user details and activity"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={handleSave}
                  disabled={isSaving || loadingProfile}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </>
            ) : (
              <Button
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => setIsEditing(true)}
                disabled={loadingProfile}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit profile
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-1 space-y-6">
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-3">
                    <div className="relative mx-auto w-24 h-24">
                      <img
                        src={avatarPreview}
                        alt={editedUser.name}
                        className="w-24 h-24 rounded-xl object-cover bg-slate-100 ring-2 ring-slate-100"
                      />
                      <input
                        ref={avatarFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      {isEditing && isAuthStaffUserId(user?.id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="default"
                              size="icon"
                              className="absolute bottom-0.5 right-0.5 !h-6 !w-6 !min-h-0 rounded-md border-2 border-white bg-slate-900 p-0 text-white shadow-md hover:bg-slate-800 hover:text-white focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 [&_svg]:!size-3"
                              aria-label="Edit profile photo"
                            >
                              <Pencil className="size-3" strokeWidth={2.5} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-44">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onSelect={() => {
                                requestAnimationFrame(() => avatarFileInputRef.current?.click());
                              }}
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Change photo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-slate-700 focus:text-slate-900"
                              disabled={
                                !avatarFile &&
                                !avatarMarkedForRemoval &&
                                !hasStoredProfilePhoto(user) &&
                                !hasStoredProfilePhoto(editedUser)
                              }
                              onSelect={() => handleRemoveAvatar()}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {avatarFile ? "Discard new photo" : "Remove photo"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {isEditing && isAuthStaffUserId(user?.id) && (
                      <p className="text-[10px] text-slate-400 leading-tight mt-2 max-w-[120px] mx-auto">
                        Max 500 KB per image.
                      </p>
                    )}
                  </div>

                  <h2 className="text-xl font-semibold text-slate-900 mb-1">{editedUser.name}</h2>

                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${roleInfo.color} mb-3`}
                  >
                    <RoleIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{roleInfo.label}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm mb-4">
                    {editedUser.status === "active" ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-600 font-medium">Active</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                        <span className="text-slate-600 font-medium">Inactive</span>
                      </>
                    )}
                  </div>

                  <div className="w-full grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {daysAsMember != null ? daysAsMember : "—"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Days as member</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-900 leading-tight mt-1">
                        {parseDateMs(editedUser.lastSignInAt) != null
                          ? formatDateShort(editedUser.lastSignInAt)
                          : "—"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Last sign-in</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Role Permissions</h3>
                <div className="space-y-3 text-xs text-slate-600">
                  {editedUser.role === "super-admin" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Full platform &amp; store administration</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage users, settings, and all modules</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "store-owner" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Full system access</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage all users</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Access financial data</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Modify store settings</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "administrator" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage products & orders</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Access marketing tools</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>View reports & analytics</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No financial data access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "data-entry" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Add & edit products</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Manage inventory</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No order access</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No settings access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "warehouse" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Orders & fulfillment</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Inventory updates</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>Limited settings access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "developer" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>API access</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Custom integrations</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Debug tools</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No user data access</span>
                      </div>
                    </>
                  )}
                  {editedUser.role === "product-manager" && (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Product strategy</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Feature planning</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Team collaboration</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>No financial data</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-2 space-y-6">
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Personal Information</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="name"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Full Name
                      </Label>
                      {isEditing ? (
                        <Input
                          id="name"
                          value={editedUser.name}
                          onChange={(e) => setEditedUser({ ...editedUser, name: e.target.value })}
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-sm text-slate-700">{editedUser.name}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label
                        htmlFor="email"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Email Address
                      </Label>
                      {isEditing ? (
                        <Input
                          id="email"
                          type="email"
                          value={editedUser.email}
                          onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-700">{editedUser.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="phone"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Phone Number
                      </Label>
                      {isEditing ? (
                        <Input
                          id="phone"
                          value={editedUser.phone || ""}
                          onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })}
                          placeholder="+1 (555) 123-4567"
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-700">
                            {editedUser.phone || "Not provided"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label
                        htmlFor="location-short"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        Short location (optional)
                      </Label>
                      {isEditing ? (
                        <Input
                          id="location-short"
                          value={editedUser.location || ""}
                          onChange={(e) =>
                            setEditedUser({
                              ...editedUser,
                              location: e.target.value,
                            })
                          }
                          placeholder="e.g. Yangon, Myanmar"
                          className="h-10"
                        />
                      ) : (
                        <div className="flex items-center gap-2 min-h-10 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="text-sm text-slate-700 whitespace-pre-line">
                            {editedUser.location || "Not provided"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-sm font-medium text-slate-800 mb-3">Mailing address</h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="addr1" className="text-sm text-slate-700 mb-1 block">
                          Address line 1
                        </Label>
                        {isEditing ? (
                          <Input
                            id="addr1"
                            value={editedUser.addressLine1 || ""}
                            onChange={(e) =>
                              setEditedUser({ ...editedUser, addressLine1: e.target.value })
                            }
                            placeholder="Street address, P.O. box"
                            className="h-10"
                          />
                        ) : (
                          <p className="text-sm text-slate-700 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 min-h-10">
                            {editedUser.addressLine1 || "—"}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="addr2" className="text-sm text-slate-700 mb-1 block">
                          Address line 2 (optional)
                        </Label>
                        {isEditing ? (
                          <Input
                            id="addr2"
                            value={editedUser.addressLine2 || ""}
                            onChange={(e) =>
                              setEditedUser({ ...editedUser, addressLine2: e.target.value })
                            }
                            placeholder="Apt, suite, unit, building"
                            className="h-10"
                          />
                        ) : (
                          <p className="text-sm text-slate-700 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 min-h-10">
                            {editedUser.addressLine2 || "—"}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="city" className="text-sm text-slate-700 mb-1 block">
                            City
                          </Label>
                          {isEditing ? (
                            <Input
                              id="city"
                              value={editedUser.city || ""}
                              onChange={(e) =>
                                setEditedUser({ ...editedUser, city: e.target.value })
                              }
                              className="h-10"
                            />
                          ) : (
                            <p className="text-sm text-slate-700 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 min-h-10">
                              {editedUser.city || "—"}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="region" className="text-sm text-slate-700 mb-1 block">
                            State / Region
                          </Label>
                          {isEditing ? (
                            <Input
                              id="region"
                              value={editedUser.region || ""}
                              onChange={(e) =>
                                setEditedUser({ ...editedUser, region: e.target.value })
                              }
                              className="h-10"
                            />
                          ) : (
                            <p className="text-sm text-slate-700 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 min-h-10">
                              {editedUser.region || "—"}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="postal" className="text-sm text-slate-700 mb-1 block">
                            Postal code
                          </Label>
                          {isEditing ? (
                            <Input
                              id="postal"
                              value={editedUser.postalCode || ""}
                              onChange={(e) =>
                                setEditedUser({ ...editedUser, postalCode: e.target.value })
                              }
                              className="h-10"
                            />
                          ) : (
                            <p className="text-sm text-slate-700 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 min-h-10">
                              {editedUser.postalCode || "—"}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="country" className="text-sm text-slate-700 mb-1 block">
                            Country
                          </Label>
                          {isEditing ? (
                            <Input
                              id="country"
                              value={editedUser.country || ""}
                              onChange={(e) =>
                                setEditedUser({ ...editedUser, country: e.target.value })
                              }
                              className="h-10"
                            />
                          ) : (
                            <p className="text-sm text-slate-700 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 min-h-10">
                              {editedUser.country || "—"}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="bio" className="text-sm font-medium text-slate-900 mb-2 block">
                      Bio
                    </Label>
                    {isEditing ? (
                      <Textarea
                        id="bio"
                        value={editedUser.bio || ""}
                        onChange={(e) => setEditedUser({ ...editedUser, bio: e.target.value })}
                        placeholder="Tell us about yourself..."
                        className="resize-y min-h-[100px]"
                      />
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[100px]">
                        <p className="text-sm text-slate-700">{editedUser.bio || "No bio provided"}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Role & Access</h3>
                <div className="space-y-4">
                  {isSelfProfile && isEditing && (
                    <p className="text-xs text-slate-500 -mt-1 mb-1">
                      Role and account status are managed by an administrator. You can update your
                      personal details above.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="role"
                        className="text-sm font-medium text-slate-900 mb-2 block"
                      >
                        User Role
                      </Label>
                      {isEditing && !isSelfProfile ? (
                        <Select
                          value={editedUser.role}
                          onValueChange={(value) => setEditedUser({ ...editedUser, role: value })}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="store-owner">Store Owner</SelectItem>
                            <SelectItem value="administrator">Administrator</SelectItem>
                            <SelectItem value="data-entry">Data Entry</SelectItem>
                            <SelectItem value="warehouse">Warehouse</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div
                          className={`flex items-center gap-2 h-10 px-3 rounded-lg ${roleInfo.color}`}
                        >
                          <RoleIcon className="w-4 h-4" />
                          <span className="text-sm font-medium">{roleInfo.label}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-slate-900 mb-2 block">
                        Account Status
                      </Label>
                      {isEditing && !isSelfProfile ? (
                        <div className="flex items-center gap-3 h-10">
                          <Switch
                            checked={editedUser.status === "active"}
                            onCheckedChange={(checked) =>
                              setEditedUser({
                                ...editedUser,
                                status: checked ? "active" : "inactive",
                              })
                            }
                          />
                          <span className="text-sm text-slate-700">
                            {editedUser.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                          {editedUser.status === "active" ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="text-sm text-slate-700">
                            {editedUser.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-slate-900 mb-2 block">
                        Member Since
                      </Label>
                      <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">
                          {formatDateLong(memberSinceSource)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-slate-900 mb-2 block">
                        Last active
                      </Label>
                      <div className="flex items-center gap-2 min-h-10 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700">
                          {parseDateMs(lastActiveSource) != null
                            ? formatDateTime(lastActiveSource)
                            : "—"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        From sign-in when available, otherwise last profile update.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Account timeline</h3>
                  <Activity className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Profile and sign-in from your staff record and Supabase Auth. Product changes made from
                  the admin (create, update, delete) are listed here with timestamps. Order history is not
                  included.
                </p>
                {accountTimeline.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                    No timeline data yet. Open this profile again after the account is saved or the user
                    signs in.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {accountTimeline.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            activity.status === "success"
                              ? "bg-green-100"
                              : "bg-slate-100"
                          }`}
                        >
                          {activity.status === "success" ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Clock className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{activity.target}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>{activity.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
