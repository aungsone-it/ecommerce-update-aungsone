import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { compressImage } from '../../utils/imageCompression';
import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
  RefreshCw,
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
  canManageStaffAccounts,
  canonicalizeStaffRoleForSave,
} from "../utils/superAdminRolePermissions";
import { toast } from 'sonner';
import { VendorDomainsList } from "./VendorDomainsList";

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ElementType;
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
  ];

  const visibleSettingsTabs = settingsTabs.filter(
    (tab) => tab.id !== "users" || canManageStaffAccounts(user?.role)
  );

  const [showUserDialog, setShowUserDialog] = useState(false);
  const [viewingUserProfile, setViewingUserProfile] = useState<any>(null);
  const [userProfileInitialEdit, setUserProfileInitialEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // General Settings State
  const [storeName, setStoreName] = useState("SECURE E-commerce");
  const [storeEmail, setStoreEmail] = useState("info@secure.com");
  const [storePhone, setStorePhone] = useState("+95 9 XXX XXX XXX");
  const [storeAddress, setStoreAddress] = useState("123 Main St, Yangon, Myanmar");
  const [storeDomain, setStoreDomain] = useState(""); // Custom domain for the store
  const [currency, setCurrency] = useState("MMK");
  const [timezone, setTimezone] = useState("Asia/Yangon");
  const [kpayPhone, setKpayPhone] = useState("+95 9 XXX XXX XXX");
  const [kpayQrCode, setKpayQrCode] = useState("");
  const [kpayQrCodePreview, setKpayQrCodePreview] = useState("");
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

  // User State - Start with empty array, load from backend
  const [users, setUsers] = useState<any[]>([]);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userRole, setUserRole] = useState("data-entry");
  const [userStoreId, setUserStoreId] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);

  // Load users from backend on mount
  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "users" && !canManageStaffAccounts(user?.role)) {
      setActiveTab("general");
    }
  }, [activeTab, user?.role]);

  /** Super-admin / administrators default to Users; data-entry stays on General. */
  useLayoutEffect(() => {
    if (!user?.role || didApplyDefaultUsersTab.current) return;
    if (canManageStaffAccounts(user.role)) {
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
          setStoreName(data.storeName || "SECURE E-commerce");
          setStoreEmail(data.storeEmail || "info@secure.com");
          setStorePhone(data.storePhone || "+95 9 XXX XXX XXX");
          setStoreAddress(data.storeAddress || "123 Main St, Yangon, Myanmar");
          setStoreDomain(data.storeDomain || "");
          setCurrency(data.currency || "MMK");
          setTimezone(data.timezone || "Asia/Yangon");
          setKpayPhone(data.kpayPhone || "+95 9 XXX XXX XXX");
          setKpayQrCode(data.kpayQrCode || "");
          setKpayQrCodePreview(data.kpayQrCode || "");
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
            storeDomain,
            currency,
            timezone,
            kpayPhone,
            kpayQrCode,
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

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/users`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      console.log(`📋 Fetched ${data ? data.length : 0} users from backend:`, data);
      console.log(`📋 Backend data detail:`, JSON.stringify(data, null, 2));
      console.log(`👤 Current user:`, { role: user?.role, storeId: user?.storeId, email: user?.email });
      
      // If no users found, try to sync from Supabase Auth
      if (!data || data.length === 0) {
        console.log('⚠️ No users found, attempting sync...');
        await syncUsers();
        return; // fetchUsers will be called again after sync
      }
      
      // Transform backend data to match UI expectations
      const transformedUsers = data.map((u: any) => {
        const fallback = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(u.email || "user")}`;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          role: u.role,
          storeId: u.storeId || '',
          status: u.status || "active",
          profileImageUrl: u.profileImageUrl,
          avatar: u.profileImageUrl || fallback,
          lastActive: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
        };
      });

      // Filter users based on logged-in user's role and storeId
      let filteredUsers = transformedUsers;
      if (user?.role === 'store-owner') {
        // Store owners only see users from their own store
        // If storeId is empty, show all users with empty storeId (backward compatibility)
        const userStoreId = user.storeId || "";
        filteredUsers = transformedUsers.filter((u: any) => (u.storeId || "") === userStoreId);
        console.log(`🔒 Store owner filter: Showing ${filteredUsers.length} users from store "${user.storeId || '(empty)'}"`);
      } else if (canManageStaffAccounts(user?.role)) {
        console.log(`👑 Staff manager (${user?.role}): Showing all ${filteredUsers.length} users`);
      } else {
        console.log(`ℹ️ Role ${user?.role}: Showing all ${filteredUsers.length} users`);
      }

      setUsers(filteredUsers);
      
      // Add super admin to list
      const ownerRow = transformedUsers.find(
        (u: any) => u.role === "super-admin" || u.role === "store-owner"
      );
      if (ownerRow) {
        console.log("✅ Store owner row loaded:", ownerRow.email);
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      // Handle timeout gracefully
      if (err.name === 'AbortError') {
        setError('Request timed out. The server might be starting up. Please try again in a moment.');
        toast.error('Request timed out. Please try again.');
      } else {
        setError(err.message || 'Failed to load users');
        toast.error('Failed to load users');
      }
      // 🔥 FIX: Don't clear users on error - keep the existing list
      // This prevents users from disappearing when window focus triggers refresh and blocked requests occur
      // setUsers([]); // Commented out - preserve existing user list
    } finally {
      setLoading(false);
    }
  };

  const syncUsers = async () => {
    try {
      console.log('🔄 Syncing users from Supabase Auth...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/sync-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to sync users');
      }

      const data = await response.json();
      console.log('✅ Sync complete:', data);
      
      // Reload users after sync
      await fetchUsers();
    } catch (err: any) {
      console.error('Error syncing users:', err);
      setError(err.message || 'Failed to sync users');
    }
  };

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
    setShowUserDialog(true);
  };

  const handleSaveUser = async () => {
    if (!userName.trim() || !userEmail.trim()) return;

    setSaving(true);
    setError('');

    try {
      console.log(`➕ Creating new user: ${userEmail}`);
      if (!user?.id) {
        throw new Error("You must be signed in to create staff accounts.");
      }

      const createPayload: Record<string, unknown> = {
        email: userEmail,
        name: userName,
        phone: userPhone,
        role: canonicalizeStaffRoleForSave(userRole),
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
        `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userEmail || userName || "user")}`;
      const newUser = {
        id: data.userId,
        name: userName,
        email: userEmail,
        phone: userPhone,
        role: canonicalizeStaffRoleForSave(userRole),
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
              <span className="text-green-600">✓</span> User created successfully!
            </p>
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-sm font-medium">Temporary password:</p>
              <p className="font-mono bg-green-50 px-3 py-2 rounded mt-1 text-sm font-semibold">{data.tempPassword}</p>
              <p className="text-xs mt-2 text-slate-600">Please share this with the user securely.</p>
            </div>
          </div>,
          { duration: 20000, className: 'bg-green-50 border-green-200' }
        );
      } else {
        toast.success('User created successfully!');
      }

      setShowUserDialog(false);
      
      // Refresh users list from backend to ensure sync (with delay to allow DB commit)
      console.log('⏳ Waiting 1.2s for backend to commit...');
      await new Promise(resolve => setTimeout(resolve, 1200));
      console.log('🔄 Refreshing user list...');
      await fetchUsers();
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
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/user/${userId}`,
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
      
      // Remove from local state
      setUsers(users.filter(u => u.id !== userId));
      
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
                    Store Logo
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
                          alt="Store Logo"
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
                        <p className="text-xs text-slate-500">Upload</p>
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
                          toast.success('Logo removed');
                        }}
                        className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Logo
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

                <div>
                  <Label htmlFor="storeDomain" className="text-sm font-medium text-slate-900 mb-2 block">
                    Store Domain
                  </Label>
                  <Input
                    id="storeDomain"
                    type="url"
                    value={storeDomain}
                    onChange={(e) => setStoreDomain(e.target.value)}
                    placeholder="https://www.yourstore.com"
                    className="h-10 max-w-md"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your custom domain for the store (e.g., https://store.migoo.com)
                  </p>
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

            {/* KPay Settings */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">KPay Settings</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="kpayPhone" className="text-sm font-medium text-slate-900 mb-2 block">
                    KPay Phone Number
                  </Label>
                  <Input
                    id="kpayPhone"
                    type="number"
                    value={kpayPhone}
                    onChange={(e) => setKpayPhone(e.target.value)}
                    className="h-10 max-w-md"
                  />
                </div>

                <div>
                  <Label htmlFor="kpayQrCode" className="text-sm font-medium text-slate-900 mb-2 block">
                    KPay QR Code
                  </Label>
                  
                  {/* QR Code Preview */}
                  <div className="mb-3">
                    <div className="w-48 h-48 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-slate-200">
                      {kpayQrCodePreview ? (
                        <img
                          src={kpayQrCodePreview}
                          alt="KPay QR Code"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center px-4">
                          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-500">No QR code uploaded</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('kpayQrUpload')?.click()}
                      className="relative"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {kpayQrCodePreview ? 'Change QR Code' : 'Upload QR Code'}
                    </Button>
                    
                    {kpayQrCodePreview && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setKpayQrCode("");
                          setKpayQrCodePreview("");
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  
                  <input
                    id="kpayQrUpload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const dataUrl = await compressImage(file, 500);
                        setKpayQrCode(dataUrl);
                        setKpayQrCodePreview(dataUrl);
                      } catch (err: any) {
                        toast.error(err?.message || "Could not process image");
                      }
                      e.target.value = "";
                    }}
                  />
                  
                  <p className="text-xs text-slate-500 mt-2">
                    Upload your KPay QR code image (PNG, JPG). Recommended size: 500x500px
                  </p>
                </div>
              </div>
            </div>

            {/* Store Logo */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Store Logo</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="storeLogo" className="text-sm font-medium text-slate-900 mb-2 block">
                    Store Logo
                  </Label>
                  
                  {/* Logo Preview */}
                  <div className="mb-3">
                    <div className="w-48 h-48 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-slate-200">
                      {storeLogoPreview ? (
                        <img
                          src={storeLogoPreview}
                          alt="Store Logo"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center px-4">
                          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-500">No logo uploaded</p>
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
                      {storeLogoPreview ? 'Change Logo' : 'Upload Logo'}
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
                        Remove
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
                    Upload your store logo image (PNG, JPG). Recommended size: 500x500px
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
                    Saving...
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
                <Button 
                  variant="outline" 
                  onClick={fetchUsers}
                  disabled={loading}
                  className="text-slate-700 hover:bg-slate-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh
                </Button>
                <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={openAddDialog}>
                  {t('settings.users.addUser')}
                </Button>
              </div>
            </div>

            {/* User Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                  <span className="ml-3 text-sm text-slate-600">Loading users...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-600">No users found</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Add user" to create your first user</p>
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
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Role permissions</h3>
              <div className="space-y-3">
                {/* Store Owner */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Store className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">Store Owner</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        Business owner with full store access and control including:
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>Manage all products, orders, and content</li>
                        <li>Access to all financial data and reports</li>
                        <li>Add, edit, and remove users</li>
                        <li>Modify store settings and configurations</li>
                        <li>Cannot be deleted or deactivated</li>
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
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">Administrator</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        Manage day-to-day operations including:
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>Manage products, categories, and inventory</li>
                        <li>Process and manage orders, vendors, customers, chat, marketing</li>
                        <li>Cannot access Finances or Settings (including Users)</li>
                        <li>Can invite only Data entry and Warehouse accounts</li>
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
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">Data Entry</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        Limited access for data management:
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>Add and edit products</li>
                        <li>Manage inventory levels</li>
                        <li>Update product information</li>
                        <li>Cannot delete products or access orders</li>
                        <li>No access to settings, users, or financial data</li>
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
                      <h4 className="font-semibold text-sm text-slate-900 mb-1">Warehouse</h4>
                      <p className="text-xs text-slate-600 mb-2">
                        Fulfillment-focused access:
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                        <li>Orders, inventory, and logistics</li>
                        <li>No products/catalog editing, vendors, marketing, or customers</li>
                        <li>No Finances, Settings, or global search</li>
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
                  <DialogTitle>Add new user</DialogTitle>
                  <DialogDescription>
                    Create a new user account with role and permissions.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="userName" className="text-sm font-medium text-slate-900 mb-2 block">
                      Full name
                    </Label>
                    <Input
                      id="userName"
                      placeholder="e.g., John Doe"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <Label htmlFor="userEmail" className="text-sm font-medium text-slate-900 mb-2 block">
                      Email address
                    </Label>
                    <Input
                      id="userEmail"
                      type="email"
                      placeholder="john@example.com"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      className="h-10"
                    />
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
                      onChange={(e) => setUserPhone(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <Label htmlFor="userRole" className="text-sm font-medium text-slate-900 mb-2 block">
                      Role
                    </Label>
                    <Select value={userRole} onValueChange={setUserRole}>
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
                  </div>

                  <div>
                    <Label htmlFor="userAvatar" className="text-sm font-medium text-slate-900 mb-2 block">
                      Avatar
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <img
                          src={avatarPreview || userAvatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=default"}
                          alt="User Avatar"
                          className="w-10 h-10 rounded-full"
                        />
                      </div>
                      <Input
                        id="userAvatar"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="h-10"
                      />
                    </div>
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
                    disabled={saving || !userName.trim() || !userEmail.trim()}
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
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Hero Banners</h3>
              <p className="text-sm text-slate-600 mb-6">Customize the hero banners displayed on your storefront homepage</p>
              
              <div className="space-y-6">
                {banners.map((banner, index) => (
                  <div key={banner.id} className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-slate-900">Banner {index + 1}</h4>
                      {banners.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => deleteBanner(banner.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      {/* Banner Image Upload */}
                      <div>
                        <Label className="text-sm font-medium text-slate-900 mb-2 block">
                          Background Image (Optional)
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
                                  alt={`Banner ${index + 1}`}
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
                                <p className="text-xs text-slate-500">Upload</p>
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
                                toast.success('Banner image removed');
                              }}
                              className="mt-1"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Recommended: 1920x600px. If no image, gradient background will be used.</p>
                      </div>

                      {/* Banner Title */}
                      <div>
                        <Label htmlFor={`banner-title-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          Banner Title
                        </Label>
                        <Input
                          id={`banner-title-${banner.id}`}
                          value={banner.title}
                          onChange={(e) => updateBannerText(banner.id, 'title', e.target.value)}
                          placeholder="Enter banner title"
                          className="h-10"
                        />
                      </div>

                      {/* Banner Subtitle */}
                      <div>
                        <Label htmlFor={`banner-subtitle-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          Banner Subtitle
                        </Label>
                        <Input
                          id={`banner-subtitle-${banner.id}`}
                          value={banner.subtitle}
                          onChange={(e) => updateBannerText(banner.id, 'subtitle', e.target.value)}
                          placeholder="Enter banner subtitle"
                          className="h-10"
                        />
                      </div>

                      {/* Badge Text */}
                      <div>
                        <Label htmlFor={`banner-badge-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          Badge Text
                        </Label>
                        <Input
                          id={`banner-badge-${banner.id}`}
                          value={banner.badgeText}
                          onChange={(e) => updateBannerText(banner.id, 'badgeText', e.target.value)}
                          placeholder="Enter badge text (e.g., Premium Selection)"
                          className="h-10"
                        />
                      </div>

                      {/* CTA Button Text */}
                      <div>
                        <Label htmlFor={`banner-cta-${banner.id}`} className="text-sm font-medium text-slate-900 mb-2 block">
                          Button Text
                        </Label>
                        <Input
                          id={`banner-cta-${banner.id}`}
                          value={banner.cta}
                          onChange={(e) => updateBannerText(banner.id, 'cta', e.target.value)}
                          placeholder="Enter button text (e.g., Shop Now)"
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
                    <span className="font-medium">Add Another Banner</span>
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
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save appearance
                  </>
                )}
              </Button>
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
        <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0">
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
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl p-6">
            {renderTabContent()}
          </div>
        </main>
      </div>
    </div>
  );
}