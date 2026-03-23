// Minimalist Vendor Storefront - MVP Design
import { moduleCache, CACHE_KEYS, fetchVendorProducts, fetchVendorCategories } from "../utils/module-cache";
import { ProductCard } from "./ProductCard";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { 
  ShoppingCart, 
  Heart, 
  Search,
  Star,
  Settings,
  Eye,
  Menu,
  X,
  ChevronLeft,
  Plus,
  Minus,
  Store,
  Package,
  RefreshCw,
  User,
  ChevronRight,
  MapPin,
  LogOut,
  Truck,
  Shield,
  TrendingUp
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CardContent } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useFaviconLoader } from "../hooks/useFaviconLoader";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";
import { Checkout } from "./Checkout";
import { ServerStatusBanner } from "./ServerStatusBanner";
import { ProductGridSkeleton, ProductDetailSkeleton } from "./SkeletonLoaders";
import { AuthModal } from "./AuthModal";
import { authApi } from "../../utils/api";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  images: string[];
  category: string;
  inventory: number;
  rating: number;
  reviewCount: number;
  hasVariants?: boolean;
  variants?: any[];
  variantOptions?: any[];
}

interface VendorStoreViewProps {
  vendorId: string;
  storeSlug?: string;
  onBack?: () => void;
  initialProductSlug?: string;
}

type VendorAccountViewMode =
  | "storefront"
  | "view-profile"
  | "edit-profile"
  | "order-history"
  | "shipping-addresses"
  | "security-settings";

interface VendorAddress {
  id: string;
  recipientName: string;
  phone: string;
  addressLine: string;
  city: string;
  township: string;
}

export function VendorStoreView({ vendorId, storeSlug, onBack, initialProductSlug }: VendorStoreViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { startLoading: startFaviconLoading, stopLoading: stopFaviconLoading } = useFaviconLoader();
  
  // Cleanup favicon loader on unmount
  useEffect(() => {
    return () => {
      stopFaviconLoading();
    };
  }, [stopFaviconLoading]);
  
  // If we have an initialProductSlug, we're navigating from product grid, so skip loading overlay
  const [serverStatus, setServerStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorCategories, setVendorCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [storeName, setStoreName] = useState("Vendor Store");
  const [storeLogo, setStoreLogo] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const { addToCart, totalItems, clearCart } = useCart();

  // 🔥 Lightbox State for Product Description Images
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  
  // 🔐 User Authentication State
  const [user, setUser] = useState<any>(null);
  const [profileImageLoadFailed, setProfileImageLoadFailed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [vendorViewMode, setVendorViewMode] = useState<VendorAccountViewMode>("storefront");
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: ''
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    profileImageUrl: "",
  });
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [shippingAddresses, setShippingAddresses] = useState<VendorAddress[]>([]);
  const [addressForm, setAddressForm] = useState<Omit<VendorAddress, "id">>({
    recipientName: "",
    phone: "",
    addressLine: "",
    city: "",
    township: "",
  });
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  /** Pass 'register' from handleRegister before setUser; cleared after track. */
  const lastAuthEventRef = useRef<"login" | "register" | null>(null);
  const audienceTrackedKeyRef = useRef<string>("");

  const trackVendorAudience = useCallback(
    async (userData: any, event: "login" | "register") => {
      if (!vendorId || !userData?.email) return;
      try {
        let avatar: string | undefined;
        for (const c of [
          userData?.profileImageUrl,
          userData?.avatarUrl,
          userData?.avatar,
          userData?.profileImage,
        ]) {
          if (typeof c === "string" && c.trim().startsWith("http")) {
            avatar = c.trim();
            break;
          }
        }
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/audience/${vendorId}/track`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              email: userData.email,
              userId: userData.id,
              name: userData.name || userData.fullName,
              phone: userData.phone,
              avatar,
              event,
            }),
          }
        );
      } catch (e) {
        console.warn("[VendorStore] audience track failed:", e);
      }
    },
    [vendorId]
  );

  // Register this global account with this vendor when the user session is available (login/register or return visit).
  useEffect(() => {
    if (!user?.email || !vendorId) return;
    const key = `${vendorId}::${user.email}`;
    if (audienceTrackedKeyRef.current === key) return;
    audienceTrackedKeyRef.current = key;
    const ev = lastAuthEventRef.current;
    lastAuthEventRef.current = null;
    void trackVendorAudience(user, ev || "login");
  }, [user, vendorId, trackVendorAudience]);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('migoo-user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('migoo-user');
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      profileImageUrl: user.profileImageUrl || user.avatarUrl || user.avatar || user.profileImage || "",
    });
  }, [user]);

  useEffect(() => {
    const storedUser = localStorage.getItem("migoo-user");
    if (!storedUser) return;
    try {
      const parsedUser = JSON.parse(storedUser);
      if (!parsedUser?.id) return;
      authApi.getProfile(parsedUser.id)
        .then((response: any) => {
          const freshProfile = response?.user || response;
          if (freshProfile && typeof freshProfile === "object") {
            const updatedUser = { ...parsedUser, ...freshProfile };
            setUser((prev: any) => ({ ...(prev || parsedUser), ...updatedUser }));
            localStorage.setItem("migoo-user", JSON.stringify(updatedUser));
          }
        })
        .catch(() => {
          // Keep existing user state if profile refresh fails
        });
    } catch (error) {
      console.error("Failed to refresh vendor storefront user profile:", error);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setShippingAddresses([]);
      return;
    }
    try {
      const storageKey = `vendor-storefront-addresses-${vendorId}-${user.id}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setShippingAddresses(JSON.parse(stored));
      } else {
        setShippingAddresses([]);
      }
    } catch (error) {
      console.error("Failed to load vendor storefront addresses:", error);
      setShippingAddresses([]);
    }
  }, [user?.id, vendorId]);

  useEffect(() => {
    if (!user?.id || vendorViewMode !== "order-history") return;
    const loadOrderHistory = async () => {
      setOrdersLoading(true);
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/user/${user.id}/orders`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (!response.ok) throw new Error("Failed to fetch orders");
        const data = await response.json();
        setOrderHistory(data.orders || []);
      } catch (error) {
        console.error("Failed to load vendor storefront order history:", error);
        setOrderHistory([]);
        toast.error("Could not load order history");
      } finally {
        setOrdersLoading(false);
      }
    };
    loadOrderHistory();
  }, [vendorViewMode, user?.id]);

  // 🔐 Authentication Handlers
  const handleLogin = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error("Please enter email and password");
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.login(authForm.email, authForm.password);
      const userData = response.user;

      lastAuthEventRef.current = "login";
      setUser(userData);
      localStorage.setItem('migoo-user', JSON.stringify(userData));
      
      toast.success(`Welcome back, ${userData.name || userData.email}!`);
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Login failed:", error);
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegister = async (profileImage?: string) => {
    if (!authForm.email || !authForm.password || !authForm.name) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await authApi.register(
        authForm.email,
        authForm.password,
        authForm.name,
        authForm.phone,
        profileImage
      );
      const userData = response.user;

      lastAuthEventRef.current = "register";
      setUser(userData);
      localStorage.setItem('migoo-user', JSON.stringify(userData));
      
      toast.success(`Welcome to ${storeName}, ${userData.name}!`);
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', name: '', phone: '' });
    } catch (error) {
      console.error("Registration failed:", error);
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    audienceTrackedKeyRef.current = "";
    setUser(null);
    localStorage.removeItem('migoo-user');
    setVendorViewMode("storefront");
    toast.success("You have been logged out");
  };

  const getUserProfileImageUrl = (u: any): string => {
    const rawCandidates = [u?.profileImageUrl, u?.avatarUrl, u?.avatar, u?.profileImage];
    for (const candidate of rawCandidates) {
      if (!candidate || typeof candidate !== "string") continue;
      const value = candidate.trim();
      if (!value) continue;

      if (
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("data:image/") ||
        value.startsWith("blob:")
      ) {
        return value;
      }

      if (value.startsWith("/storage/")) {
        return `https://${projectId}.supabase.co${value}`;
      }

      if (value.startsWith("storage/")) {
        return `https://${projectId}.supabase.co/${value}`;
      }
    }
    return "";
  };

  const userProfileImageUrl = getUserProfileImageUrl(user);

  useEffect(() => {
    setProfileImageLoadFailed(false);
  }, [userProfileImageUrl]);

  const saveShippingAddresses = (nextAddresses: VendorAddress[]) => {
    setShippingAddresses(nextAddresses);
    if (!user?.id) return;
    try {
      const storageKey = `vendor-storefront-addresses-${vendorId}-${user.id}`;
      localStorage.setItem(storageKey, JSON.stringify(nextAddresses));
    } catch (error) {
      console.error("Failed to save vendor storefront addresses:", error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }

    setIsProfileSaving(true);
    try {
      await authApi.updateProfile(user.id, {
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim(),
        profileImageUrl: profileForm.profileImageUrl.trim(),
      });

      const updatedUser = {
        ...user,
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim(),
        profileImageUrl: profileForm.profileImageUrl.trim(),
      };

      setUser(updatedUser);
      localStorage.setItem("migoo-user", JSON.stringify(updatedUser));
      setVendorViewMode("view-profile");
      toast.success("Profile updated");
    } catch (error) {
      console.error("Failed to update vendor storefront profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleSaveAddress = () => {
    if (!addressForm.recipientName || !addressForm.phone || !addressForm.addressLine) {
      toast.error("Please fill required address fields");
      return;
    }

    const nextAddress: VendorAddress = {
      id: editingAddressId || `addr-${Date.now()}`,
      ...addressForm,
    };

    const nextAddresses = editingAddressId
      ? shippingAddresses.map((addr) => (addr.id === editingAddressId ? nextAddress : addr))
      : [nextAddress, ...shippingAddresses];

    saveShippingAddresses(nextAddresses);
    setAddressForm({
      recipientName: "",
      phone: "",
      addressLine: "",
      city: "",
      township: "",
    });
    setEditingAddressId(null);
    toast.success(editingAddressId ? "Address updated" : "Address added");
  };

  const handleEditAddress = (address: VendorAddress) => {
    setEditingAddressId(address.id);
    setAddressForm({
      recipientName: address.recipientName,
      phone: address.phone,
      addressLine: address.addressLine,
      city: address.city,
      township: address.township,
    });
  };

  const handleDeleteAddress = (addressId: string) => {
    const nextAddresses = shippingAddresses.filter((addr) => addr.id !== addressId);
    saveShippingAddresses(nextAddresses);
    toast.success("Address removed");
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error("Please fill all password fields");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }

    setIsChangingPassword(true);
    try {
      await authApi.changePassword(user.email, passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Password changed successfully");
    } catch (error) {
      console.error("Failed to change password:", error);
      toast.error(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleProfileAction = (mode: VendorAccountViewMode) => {
    setVendorViewMode(mode);
    setSelectedProduct(null);
    setMobileMenuOpen(false);
  };

  const renderVendorAccountPage = () => {
    if (!user || vendorViewMode === "storefront") return null;

    if (vendorViewMode === "view-profile") {
      return (
        <Card className="max-w-3xl mx-auto">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Profile</h2>
              <Button variant="outline" size="sm" onClick={() => setVendorViewMode("edit-profile")} className="border-amber-200 text-amber-700 hover:bg-amber-50">
                Edit Profile
              </Button>
            </div>
            <div className="flex items-center gap-4">
              {userProfileImageUrl && !profileImageLoadFailed ? (
                <img
                  src={userProfileImageUrl}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover"
                  onError={() => setProfileImageLoadFailed(true)}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-7 h-7 text-slate-600" />
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-slate-900">{user.name || "Unnamed User"}</p>
                <p className="text-sm text-slate-600">{user.email || "No email"}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="text-slate-500">Phone Number</p>
                <p className="font-medium text-slate-900">{user.phone || "Not set"}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="text-slate-500">Account Type</p>
                <p className="font-medium text-slate-900">{storeName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (vendorViewMode === "edit-profile") {
      return (
        <Card className="max-w-3xl mx-auto">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Edit Profile</h2>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Name</p>
              <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Email</p>
              <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Phone</p>
              <Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Profile Image URL</p>
              <Input value={profileForm.profileImageUrl} onChange={(e) => setProfileForm({ ...profileForm, profileImageUrl: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveProfile} disabled={isProfileSaving} className="bg-amber-600 hover:bg-amber-700">
                {isProfileSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setVendorViewMode("view-profile")}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (vendorViewMode === "order-history") {
      return (
        <Card className="max-w-4xl mx-auto">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Order History</h2>
              <Button variant="outline" size="sm" onClick={() => setVendorViewMode("view-profile")}>
                Back to Profile
              </Button>
            </div>
            <p className="text-slate-600 text-sm">View and track all your orders</p>
            {ordersLoading && <p className="text-sm text-slate-600">Loading orders...</p>}
            {!ordersLoading && orderHistory.length === 0 && (
              <p className="text-sm text-slate-600">You haven't placed any orders yet.</p>
            )}
            {!ordersLoading && orderHistory.length > 0 && (
              <div className="space-y-3">
                {orderHistory.map((order: any) => (
                  <div key={order.id} className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{order.orderNumber || order.id}</p>
                      <p className="text-xs text-slate-500">{order.createdAt ? new Date(order.createdAt).toLocaleString() : "Unknown date"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{formatPriceMMK(order.total || order.totalAmount || 0)}</p>
                      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border">{order.status || "Pending"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    if (vendorViewMode === "shipping-addresses") {
      return (
        <Card className="max-w-4xl mx-auto">
          <CardContent className="p-6 space-y-5">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Shipping Addresses</h2>
            <p className="text-slate-600 text-sm">Manage your delivery addresses</p>
            <div className="grid md:grid-cols-2 gap-3">
              <Input
                placeholder="Recipient name"
                value={addressForm.recipientName}
                onChange={(e) => setAddressForm({ ...addressForm, recipientName: e.target.value })}
              />
              <Input
                placeholder="Phone"
                value={addressForm.phone}
                onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
              />
              <Input
                placeholder="City"
                value={addressForm.city}
                onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
              />
              <Input
                placeholder="Township"
                value={addressForm.township}
                onChange={(e) => setAddressForm({ ...addressForm, township: e.target.value })}
              />
            </div>
            <Input
              placeholder="Address line"
              value={addressForm.addressLine}
              onChange={(e) => setAddressForm({ ...addressForm, addressLine: e.target.value })}
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveAddress}>{editingAddressId ? "Update Address" : "Add Address"}</Button>
              {editingAddressId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingAddressId(null);
                    setAddressForm({ recipientName: "", phone: "", addressLine: "", city: "", township: "" });
                  }}
                >
                  Cancel Edit
                </Button>
              )}
            </div>
            <Separator />
            <div className="space-y-3">
              {shippingAddresses.length === 0 && <p className="text-sm text-slate-600">No shipping addresses saved yet.</p>}
              {shippingAddresses.map((address) => (
                <div key={address.id} className="border rounded-lg p-4 flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{address.recipientName}</p>
                    <p className="text-sm text-slate-600">{address.phone}</p>
                    <p className="text-sm text-slate-700">{address.addressLine}</p>
                    <p className="text-xs text-slate-500">{address.township}, {address.city}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditAddress(address)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleDeleteAddress(address.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Security Settings</h2>
          <p className="text-slate-600 text-sm">Manage your account security and password</p>
          <Input
            type="password"
            placeholder="Current password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
          />
          <Input
            type="password"
            placeholder="New password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
          />
          <div className="flex gap-2">
            <Button onClick={handleChangePassword} disabled={isChangingPassword} className="bg-amber-600 hover:bg-amber-700">
              {isChangingPassword ? "Updating..." : "Update Password"}
            </Button>
            <Button variant="outline" onClick={() => setVendorViewMode("view-profile")}>
              Back to Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // 🚀 LOAD DATA WITH MODULE-LEVEL CACHING - Load once and persist forever
  const loadVendorData = async (forceRefresh: boolean = false) => {
    console.log(`🚀 [VENDOR STORE] Loading data for vendorId: ${vendorId}`);
    
    if (!forceRefresh && products.length === 0 && !initialProductSlug) {
      setServerStatus('checking');
    }

    try {
      // Use module cache to fetch data (auto-handles caching)
      const [productsData, categoriesData] = await Promise.all([
        moduleCache.get(
          CACHE_KEYS.vendorProducts(vendorId),
          () => fetchVendorProducts(vendorId),
          forceRefresh
        ),
        moduleCache.get(
          CACHE_KEYS.vendorCategories(vendorId),
          () => fetchVendorCategories(vendorId),
          forceRefresh
        ),
      ]);

      // Update component state
      setProducts(productsData.products || []);
      setVendorCategories(categoriesData || []);
      setStoreName(productsData.storeName || "Vendor Store");
      setStoreLogo(productsData.logo || "");
      setServerStatus('healthy');

      console.log(`✅ [VENDOR STORE] Loaded ${productsData.products?.length || 0} products`);
      console.log(`✅ [VENDOR STORE] Loaded ${categoriesData?.length || 0} categories`);
    } catch (error) {
      console.error("❌ [VENDOR STORE] Error loading vendor data:", error);
      setServerStatus('unhealthy');
    }
  };

  // Load data on mount - uses cache if available
  useEffect(() => {
    loadVendorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  // Handle initial product slug from URL
  useEffect(() => {
    if (initialProductSlug && products.length > 0) {
      // Try to find product by matching slug (productSlug is derived from product name)
      const product = products.find(p => {
        const slug = p.name
          .toLowerCase()
          .replace(/[^\\w\\s-]/g, '')
          .replace(/\\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        return slug === initialProductSlug;
      });
      
      if (product) {
        setSelectedProduct(product);
      } else {
        // Fallback: try SKU match for legacy URLs
        const productBySku = products.find(p => p.sku === initialProductSlug);
        if (productBySku) {
          setSelectedProduct(productBySku);
        }
      }
    } else if (!initialProductSlug && selectedProduct) {
      // If URL has no product slug but we have a selected product, clear it
      setSelectedProduct(null);
    }
  }, [initialProductSlug, products]);

  // Handle browser back button - detect when URL changes back to storefront home
  useEffect(() => {
    // Check if current URL is the storefront home (no /product/ in path)
    const isStorefrontHome = !location.pathname.includes('/product/');
    
    // If we're on storefront home but have a selected product, clear it
    if (isStorefrontHome && selectedProduct) {
      console.log('🔙 Browser back detected - returning to storefront home');
      setSelectedProduct(null);
      setSearchQuery("");
      setSelectedCategory("all");
    }
  }, [location.pathname, selectedProduct]);

  const handleAddToCart = (product: Product) => {
    try {
      addToCart({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        image: product.images && product.images.length > 0 ? product.images[0] : '',
        productId: product.id,
        inventory: product.inventory,
        vendorId: vendorId,
      }, quantity);
      setQuantity(1);
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  // Format price in MMK format (matching main storefront)
  const formatPriceMMK = (price: string | number): string => {
    const numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]+/g, '')) : price;
    return `${Math.round(numPrice)} MMK`;
  };

  // Wishlist management (simplified for vendor storefront)
  const [wishlist, setWishlist] = useState<string[]>([]);
  
  const toggleWishlist = (productId: string) => {
    // Require authentication for wishlist
    if (!user) {
      toast.error("Please sign in to add items to your wishlist");
      setShowAuthModal(true);
      setAuthMode('login');
      return;
    }
    
    setWishlist(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Product Detail View (inline, not modal)
  if (selectedProduct && vendorViewMode === "storefront") {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <ServerStatusBanner 
          status={serverStatus} 
          onRetry={() => loadVendorData(true)}
        />
        
        <CartDrawer 
          isOpen={cartOpen} 
          onClose={() => setCartOpen(false)} 
          onCheckout={() => {
            setCartOpen(false);
            setShowCheckout(true);
          }}
          user={user}
          onShowAuthModal={() => {
            setShowAuthModal(true);
            setAuthMode('login');
          }}
        />

        {/* Header - Same as main storefront */}
        <header className="sticky top-0 bg-white border-b z-40">
          <div className="max-w-7xl mx-auto px-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <button 
                onClick={() => {
                  setSelectedProduct(null);
                  setSearchQuery("");
                  setSelectedCategory("all");
                  navigate(`/store/${storeSlug || vendorId}`, { replace: false });
                }}
                className="flex items-center gap-3 group"
              >
                {storeLogo ? (
                  <img 
                    src={storeLogo} 
                    alt={storeName}
                    className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-100"
                  />
                ) : (
                  <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                )}
                <span className="text-xl font-bold text-slate-900 hidden sm:block">
                  {storeName}
                </span>
              </button>

              {/* Search - Desktop */}
              <div className="hidden md:block flex-1 max-w-lg mx-8">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden rounded-full"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCartOpen(true)}
                  className="rounded-full relative"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {totalItems > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-slate-900">
                      {totalItems}
                    </Badge>
                  )}
                </Button>

                {/* Login / Register Button (Desktop only) */}
                {!user && (
                  <Button
                    variant="ghost"
                    className="hidden md:flex items-center text-slate-700 hover:bg-slate-100 font-medium h-10 px-4 whitespace-nowrap"
                    onClick={() => {
                      setShowAuthModal(true);
                      setAuthMode('login');
                    }}
                  >
                    Login / Register
                  </Button>
                )}

                {/* User Profile Menu (Desktop only) */}
                {user && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="hidden md:flex hover:bg-slate-100 rounded-full w-10 h-10 p-0">
                        {userProfileImageUrl && !profileImageLoadFailed ? (
                          <img
                            src={userProfileImageUrl}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover"
                            onError={() => setProfileImageLoadFailed(true)}
                          />
                        ) : (
                          <User className="w-5 h-5 text-slate-700" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <div className="space-y-1">
                        <div className="px-3 py-2 border-b border-slate-200 mb-2 flex items-center gap-3">
                          {userProfileImageUrl && !profileImageLoadFailed ? (
                            <img
                              src={userProfileImageUrl}
                              alt={user.name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                              onError={() => setProfileImageLoadFailed(true)}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                            <p className="text-xs text-slate-600 truncate">{user.email}</p>
                          </div>
                        </div>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("view-profile")}>
                          <Eye className="w-4 h-4 mr-3" />
                          View Profile
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("edit-profile")}>
                          <Settings className="w-4 h-4 mr-3" />
                          Edit Profile
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("order-history")}>
                          <Package className="w-4 h-4 mr-3" />
                          Order History
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("shipping-addresses")}>
                          <MapPin className="w-4 h-4 mr-3" />
                          Shipping Addresses
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("security-settings")}>
                          <Shield className="w-4 h-4 mr-3" />
                          Security Settings
                        </Button>
                        <Separator className="my-2" />
                        <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
                          <LogOut className="w-4 h-4 mr-3" />
                          Logout
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* Mobile Search */}
            {mobileMenuOpen && (
              <div className="md:hidden pb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200"
                  />
                </div>
              </div>
            )}

            {/* Categories */}
            {vendorCategories.length > 0 && (
              <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setSelectedCategory("all");
                    navigate(`/store/${storeSlug || vendorId}`, { replace: false });
                  }}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All Products
                </button>
                {vendorCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedCategory(category.name);
                      navigate(`/store/${storeSlug || vendorId}`, { replace: false });
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === category.name
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Product Details Content */}
        <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5 w-full">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <button onClick={() => {
              setSelectedProduct(null);
              navigate(`/store/${storeSlug || vendorId}`, { replace: false });
            }} className="hover:text-amber-700 transition-colors whitespace-nowrap text-xs">
              Home
            </button>
            {selectedProduct.category && (
              <>
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
                <button onClick={() => {
                  setSelectedProduct(null);
                  setSelectedCategory(selectedProduct.category);
                  navigate(`/store/${storeSlug || vendorId}`, { replace: false });
                }} className="hover:text-amber-700 transition-colors whitespace-nowrap text-xs">
                  {selectedProduct.category}
                </button>
              </>
            )}
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="text-xs truncate max-w-[200px] sm:max-w-md">{selectedProduct.name || 'Product'}</span>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-8 sm:mb-12 md:mb-16">
            {/* Product Images */}
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div className="aspect-square bg-slate-50 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-slate-200 shadow-lg">
                <img
                  src={selectedProduct.images[0]}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {selectedProduct.images.length > 1 && (
                <div className="flex gap-2 justify-start">
                  {selectedProduct.images.slice(1, 5).map((image, idx) => (
                    <div key={idx} className="w-14 h-14 sm:w-24 sm:h-24 bg-slate-50 rounded-md overflow-hidden border-2 border-slate-200 hover:border-amber-600 transition-all flex-shrink-0 cursor-pointer">
                      <img src={image} alt={`${selectedProduct.name} ${idx + 2}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-6">
              {/* Title and Category */}
              <div>
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  {selectedProduct.category && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 text-xs font-medium px-2.5 py-0.5">{selectedProduct.category}</Badge>
                  )}
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 text-xs font-medium px-2.5 py-0.5">In Stock</Badge>
                </div>
                <h1 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 leading-tight">{selectedProduct.sku} {selectedProduct.name || 'Product'}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">4.8/5.0</span>
                  <Separator orientation="vertical" className="h-3 hidden sm:block" />
                  <span className="text-xs text-slate-600">{selectedProduct.reviewCount || 0} sold</span>
                </div>
              </div>

              {/* Price */}
              <Card className="bg-gradient-to-br from-slate-50 to-slate-100 shadow-md border-0">
                <CardContent className="px-4 py-[17px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-amber-700 to-amber-600 bg-clip-text text-transparent">{formatPriceMMK(selectedProduct.price)}</span>
                    {selectedProduct.compareAtPrice && (
                      <>
                        <span className="text-sm text-slate-400 line-through">{formatPriceMMK(selectedProduct.compareAtPrice)}</span>
                        <Badge className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0 text-xs">
                          Save {Math.round(((selectedProduct.compareAtPrice - selectedProduct.price) / selectedProduct.compareAtPrice) * 100)}%
                        </Badge>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3 font-medium">SKU: {selectedProduct.sku}</p>
                </CardContent>
              </Card>

              {/* Product Details */}
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-5 text-sm">Product Details</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <div className="flex items-start gap-3">
                      <Package className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Condition</p>
                        <p className="font-medium text-slate-900 text-sm">Brand New</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Store className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Sold by</p>
                        <p className="font-medium text-slate-900 text-sm truncate">{storeName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <TrendingUp className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Availability</p>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${
                            selectedProduct.inventory === 0 
                              ? "text-red-600" 
                              : selectedProduct.inventory < 10 
                                ? "text-amber-600" 
                                : "text-emerald-700"
                          }`}>
                            {selectedProduct.inventory || 0} units
                          </p>
                          {selectedProduct.inventory === 0 && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                              OUT OF STOCK
                            </Badge>
                          )}
                          {selectedProduct.inventory > 0 && selectedProduct.inventory < 10 && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs">
                              LOW STOCK
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Truck className="w-[18px] h-[18px] text-amber-600 mt-px flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 mb-1 font-normal uppercase tracking-wide">Delivery</p>
                        <p className="font-medium text-slate-900 text-sm">Complimentary</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-2 items-center">
                <Button
                  disabled={selectedProduct.inventory === 0}
                  className={selectedProduct.inventory === 0 
                    ? "bg-slate-300 h-10 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "bg-amber-600 hover:bg-amber-700 h-10 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (selectedProduct.inventory === 0) return;
                    handleAddToCart(selectedProduct);
                    setCartOpen(true);
                  }}
                >
                  <span className="block leading-none">
                    {selectedProduct.inventory === 0 ? "OUT OF STOCK" : "ADD TO CART"}
                  </span>
                </Button>
                <Button 
                  disabled={selectedProduct.inventory === 0}
                  variant="outline"
                  className={selectedProduct.inventory === 0
                    ? "h-10 border-2 border-slate-300 bg-slate-100 text-slate-400 font-semibold rounded-lg text-sm px-6 cursor-not-allowed flex items-center justify-center transition-all py-0"
                    : "h-10 border-2 border-amber-600 hover:bg-amber-50 hover:border-amber-700 text-amber-700 hover:text-amber-800 font-semibold transition-all rounded-lg text-sm px-6 flex items-center justify-center py-0"
                  }
                  onClick={() => {
                    if (selectedProduct.inventory === 0) return;
                    // Clear cart first, then add only this product for direct checkout
                    clearCart();
                    handleAddToCart(selectedProduct);
                    setCartOpen(false);
                    // Clear selected product and navigate to checkout
                    setSelectedProduct(null);
                    navigate(`/store/${storeSlug || vendorId}`, { replace: false });
                    setShowCheckout(true);
                  }}
                >
                  <span className="block leading-none">
                    BUY NOW
                  </span>
                </Button>
                <Button 
                  variant="outline"
                  className="h-10 w-10 p-0 border-2 border-slate-300 hover:bg-slate-100 hover:border-slate-400 flex items-center justify-center flex-shrink-0 transition-all rounded-lg"
                  onClick={() => toggleWishlist(selectedProduct.id)}
                >
                  <Heart className={`w-4 h-4 ${wishlist.includes(selectedProduct.id) ? "fill-amber-600 text-amber-600" : "text-slate-600"}`} />
                </Button>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-6 border-t border-slate-200">
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">Free Delivery</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-blue-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">Buyer Protection</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2">
                    <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-700">7-Day Returns</p>
                </div>
              </div>
            </div>
          </div>

          {/* Full Product Description Section */}
          <div className="mb-8">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Product Description</h2>
                <div className="prose prose-slate max-w-none">
                  {/* Description Text */}
                  <div className="text-slate-700 leading-relaxed space-y-3 product-description-wrapper">
                    {selectedProduct.description && typeof selectedProduct.description === 'string' ? (
                      <>
                        {/* Render text without images */}
                        <div 
                          className="text-sm product-description-content"
                          dangerouslySetInnerHTML={{ 
                            __html: selectedProduct.description.replace(/<img[^>]*>/g, '') 
                          }}
                        />
                        
                        {/* Gallery Grid for Images */}
                        {(() => {
                          const imgRegex = /<img[^>]+src="([^">]+)"/g;
                          const matches = [...selectedProduct.description.matchAll(imgRegex)];
                          const imageSrcs = matches.map(match => match[1]);
                          
                          if (imageSrcs.length > 0) {
                            return (
                              <div className="mt-6">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Product Images</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {imageSrcs.map((src, index) => (
                                    <div 
                                      key={index}
                                      className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 group cursor-pointer"
                                      onClick={() => {
                                        setLightboxImages(imageSrcs);
                                        setLightboxIndex(index);
                                        setLightboxImage(src);
                                      }}
                                    >
                                      <img 
                                        src={src} 
                                        alt={`Product detail ${index + 1}`}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                      />
                                      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      <p className="text-sm">
                        Experience exceptional quality with this premium product. Meticulously crafted with attention to detail, featuring superior materials and elegant design. Perfect for those who appreciate fine craftsmanship and timeless style.
                      </p>
                    )}
                  </div>

                  {/* CSS for product description */}
                  <style>{`
                    .product-description-wrapper .product-description-content p {
                      margin-bottom: 12px;
                      line-height: 1.7;
                    }
                    .product-description-wrapper .product-description-content strong {
                      font-weight: 600;
                      color: rgb(15 23 42);
                    }
                    .product-description-wrapper .product-description-content h1,
                    .product-description-wrapper .product-description-content h2,
                    .product-description-wrapper .product-description-content h3 {
                      margin-top: 20px;
                      margin-bottom: 12px;
                      font-weight: 600;
                    }
                  `}</style>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {/* Footer - Same as main storefront */}
        {onBack && (
          <footer className="border-t mt-auto">
            <div className="max-w-7xl mx-auto px-4 py-8 text-center space-y-4">
              <p className="text-sm text-slate-600">
                Powered by <span className="font-bold text-slate-900">SECURE</span> ERP Platform
              </p>
              <p className="text-xs text-slate-500">
                © {new Date().getFullYear()} {storeName}. All rights reserved.
              </p>
            </div>
          </footer>
        )}

        {/* 🔐 Auth Modal - Available on Product Detail Page */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          mode={authMode}
          onModeChange={setAuthMode}
          formData={authForm}
          onFormChange={(field, value) => setAuthForm({ ...authForm, [field]: value })}
          onLogin={handleLogin}
          onRegister={handleRegister}
          isLoading={isAuthLoading}
        />
      </div>
    );
  }

  // Checkout View
  if (showCheckout) {
    return (
      <div className="min-h-screen bg-white">
        <Checkout 
          onBack={() => setShowCheckout(false)}
          storeName={storeName}
          vendorId={vendorId}
          vendorName={storeName}
        />
      </div>
    );
  }

  // Main Storefront
  return (
    <div className="min-h-screen bg-white">
      {/* Show error banner ONLY when server is unhealthy */}
      {serverStatus === 'unhealthy' && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-300 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="animate-pulse">⏳</div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Server Starting - Please wait...
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The storefront will load automatically within 30-60 seconds.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => loadVendorData(true)}
                variant="outline"
                size="sm"
                className="border-amber-400 hover:bg-amber-100 text-amber-900 font-medium flex-shrink-0"
              >
                Retry Now
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <CartDrawer 
        isOpen={cartOpen} 
        onClose={() => setCartOpen(false)} 
        onCheckout={() => {
          setCartOpen(false);
          setShowCheckout(true);
        }}
        user={user}
        onShowAuthModal={() => {
          setShowAuthModal(true);
          setAuthMode('login');
        }}
      />

      {/* Header */}
      <header className="sticky top-0 bg-white border-b z-40">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top Bar */}
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button 
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="flex items-center gap-3 group"
            >
              {storeLogo ? (
                <img 
                  src={storeLogo} 
                  alt={storeName}
                  className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-100"
                />
              ) : (
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-xl font-bold text-slate-900 hidden sm:block">
                {storeName}
              </span>
            </button>

            {/* Search - Desktop */}
            <div className="hidden md:block flex-1 max-w-lg mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-full"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCartOpen(true)}
                className="rounded-full relative"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-slate-900">
                    {totalItems}
                  </Badge>
                )}
              </Button>

              {/* Login / Register Button (Desktop only) */}
              {!user && (
                <Button
                  variant="ghost"
                  className="hidden md:flex items-center text-slate-700 hover:bg-slate-100 font-medium h-10 px-4 whitespace-nowrap"
                  onClick={() => {
                    setShowAuthModal(true);
                    setAuthMode('login');
                  }}
                >
                  Login / Register
                </Button>
              )}

              {/* User Profile Menu (Desktop only) */}
              {user && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="hidden md:flex hover:bg-slate-100 rounded-full w-10 h-10 p-0">
                      {userProfileImageUrl && !profileImageLoadFailed ? (
                        <img
                          src={userProfileImageUrl}
                          alt={user.name}
                          className="w-8 h-8 rounded-full object-cover"
                          onError={() => setProfileImageLoadFailed(true)}
                        />
                      ) : (
                        <User className="w-5 h-5 text-slate-700" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end">
                    <div className="space-y-1">
                      <div className="px-3 py-2 border-b border-slate-200 mb-2 flex items-center gap-3">
                        {userProfileImageUrl && !profileImageLoadFailed ? (
                          <img
                            src={userProfileImageUrl}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            onError={() => setProfileImageLoadFailed(true)}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                          <p className="text-xs text-slate-600 truncate">{user.email}</p>
                        </div>
                      </div>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("view-profile")}>
                        <Eye className="w-4 h-4 mr-3" />
                        View Profile
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("edit-profile")}>
                        <Settings className="w-4 h-4 mr-3" />
                        Edit Profile
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("order-history")}>
                        <Package className="w-4 h-4 mr-3" />
                        Order History
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("shipping-addresses")}>
                        <MapPin className="w-4 h-4 mr-3" />
                        Shipping Addresses
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-slate-700 hover:bg-slate-100" onClick={() => handleProfileAction("security-settings")}>
                        <Shield className="w-4 h-4 mr-3" />
                        Security Settings
                      </Button>
                      <Separator className="my-2" />
                      <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-3" />
                        Logout
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Mobile Search */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-lg bg-slate-50 border-slate-200"
                />
              </div>
            </div>
          )}

          {/* Categories */}
          {vendorCategories.length > 0 && (
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Products
              </button>
              {vendorCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === category.name
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {vendorViewMode !== "storefront" ? (
          <div className="space-y-4">
            <div>
              <Button variant="ghost" className="px-0 text-slate-700" onClick={() => setVendorViewMode("storefront")}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                {vendorViewMode === "view-profile" ? "Back to Home" : "Back to Profile"}
              </Button>
            </div>
            {renderVendorAccountPage()}
          </div>
        ) : (
          <>
            {/* Show skeleton loaders while checking server status - Shopify style */}
            {serverStatus === 'checking' && (
              <div className="animate-smooth-fade">
                <ProductGridSkeleton count={8} />
              </div>
            )}

            {serverStatus === 'healthy' && filteredProducts.length === 0 && (
              <div className="text-center py-20">
                <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Products Found</h3>
                <p className="text-slate-600">
                  {searchQuery ? "Try adjusting your search" : "This store hasn't added any products yet"}
                </p>
              </div>
            )}

            {serverStatus === 'healthy' && filteredProducts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6 stagger-children">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={{
                      id: product.id,
                      image: product.images && product.images.length > 0 ? product.images[0] : '',
                      name: product.name,
                      price: product.price.toString(),
                      salesVolume: product.reviewCount || 0,
                      sku: product.sku
                    }}
                    onProductClick={async () => {
                      // Create product slug from title
                      const productSlug = product.name
                        .toLowerCase()
                        .replace(/[^\\w\\s-]/g, '')
                        .replace(/\\s+/g, '-')
                        .replace(/-+/g, '-')
                        .trim();
                      
                      // Navigate to product detail page - React Router will handle it
                      navigate(`/store/${storeSlug || vendorId}/product/${productSlug}`);
                    }}
                    onAddToCart={(e) => {
                      e.stopPropagation();
                      handleAddToCart(product);
                      toast.success(`${product.name} added to cart!`);
                    }}
                    onToggleWishlist={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                      const isNowWishlisted = !wishlist.includes(product.id);
                      toast.success(isNowWishlisted ? `${product.name} added to wishlist!` : `${product.name} removed from wishlist`);
                    }}
                    isWishlisted={wishlist.includes(product.id)}
                    formatPriceMMK={formatPriceMMK}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      {onBack && (
        <footer className="border-t mt-16">
          <div className="max-w-7xl mx-auto px-4 py-8 text-center space-y-4">
            <p className="text-sm text-slate-600">
              Powered by <span className="font-bold text-slate-900">SECURE</span> ERP Platform
            </p>
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} {storeName}. All rights reserved.
            </p>
          </div>
        </footer>
      )}

      {/* 🔐 Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onModeChange={setAuthMode}
        formData={authForm}
        onFormChange={(field, value) => setAuthForm({ ...authForm, [field]: value })}
        onLogin={handleLogin}
        onRegister={handleRegister}
        isLoading={isAuthLoading}
      />
    </div>
  );
}