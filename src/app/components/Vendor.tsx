// Vendor Management Component - Force rebuild
import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useLanguage } from "../contexts/LanguageContext";
import { cacheManager } from "../utils/cacheManager";
import { moduleCache, CACHE_KEYS, fetchAllVendors } from "../utils/module-cache";
import {
  Search,
  Filter,
  Download,
  Mail,
  Phone,
  MapPin,
  Package,
  TrendingUp,
  DollarSign,
  Eye,
  Edit,
  Trash2,
  Box,
  AlertTriangle,
  Ban,
  FileText,
  Store,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
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
  DropdownMenuSeparator,
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
import { VendorApplications } from "./VendorApplications";
import { VendorProfile } from "./VendorProfile";
import { VendorAddEdit } from "./VendorAddEdit";
import { VendorForm } from "./VendorForm";
import { toast } from "sonner";

type VendorStatus = "active" | "inactive" | "pending" | "suspended" | "banned";

// 🚀 MODULE-LEVEL CACHE: Persists across component unmount/remount
let cachedVendors: any[] = [];

interface Vendor {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  status?: VendorStatus;
  productsCount: number;
  totalRevenue: number;
  commission: number;
  joinedDate?: string;
  createdAt?: string;
  avatar: string;
  logo?: string; // 🔥 Logo from vendor storefront settings
  businessType?: string;
  description?: string;
  website?: string;
}

const mockVendors: Vendor[] = [];

function safeLower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const KNOWN_VENDOR_STATUSES: VendorStatus[] = [
  "active",
  "inactive",
  "pending",
  "suspended",
  "banned",
];

function isKnownVendorStatus(status: unknown): status is VendorStatus {
  return typeof status === "string" && KNOWN_VENDOR_STATUSES.includes(status as VendorStatus);
}

/** Missing or invalid API status — not the same as workflow "pending". */
function effectiveVendorStatus(vendor: Vendor): VendorStatus | "incomplete" {
  return isKnownVendorStatus(vendor.status) ? vendor.status : "incomplete";
}

function vendorDisplayName(vendor: Vendor & { id?: string }): string {
  const raw = typeof vendor.name === "string" ? vendor.name.trim() : "";
  if (raw) return raw;
  const id = vendor.id || "";
  return id ? `Unnamed (${id.length > 20 ? `${id.slice(0, 18)}…` : id})` : "Unnamed vendor";
}

function vendorDisplayJoined(vendor: Vendor & { createdAt?: string }): string {
  const j = vendor.joinedDate;
  if (typeof j === "string" && j.trim()) return j;
  const c = vendor.createdAt;
  if (typeof c === "string" && c.trim()) {
    try {
      return new Date(c).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }
  return "—";
}

interface VendorProps {
  onPreviewVendorStore?: (vendorId: string, storeSlug: string, vendor: Vendor) => void;
  onLoginAsVendor?: (vendor: Vendor) => void;
  pendingApplicationsCount?: number;
}

export function Vendor({ onPreviewVendorStore, onLoginAsVendor, pendingApplicationsCount }: VendorProps = {}) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VendorStatus | "all" | "incomplete">("all");
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const [showApplications, setShowApplications] = useState(false);
  
  // 🚀 Initialize from cache if available
  const [vendors, setVendors] = useState<Vendor[]>(() => cachedVendors || []);
  const [isLoading, setIsLoading] = useState(!cachedVendors.length);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    commission: "",
    status: "active" as VendorStatus,
  });

  const searchLower = searchQuery.toLowerCase();
  const filteredVendors = vendors.filter((vendor) => {
    const matchesSearch =
      !searchLower ||
      safeLower(vendor.name).includes(searchLower) ||
      safeLower(vendor.email).includes(searchLower) ||
      safeLower(vendor.location).includes(searchLower);
    const eff = effectiveVendorStatus(vendor);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "incomplete" ? eff === "incomplete" : eff === statusFilter);
    return matchesSearch && matchesStatus;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVendors(filteredVendors.map(v => v.id));
    } else {
      setSelectedVendors([]);
    }
  };

  const handleSelectVendor = (vendorId: string, checked: boolean) => {
    if (checked) {
      setSelectedVendors([...selectedVendors, vendorId]);
    } else {
      setSelectedVendors(selectedVendors.filter(id => id !== vendorId));
    }
  };

  const getStatusBadge = (vendor: Vendor) => {
    const eff = effectiveVendorStatus(vendor);
    const variants: Record<VendorStatus | "incomplete", { color: string; label: string }> = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: "Active" },
      inactive: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Inactive" },
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending" },
      suspended: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "Suspended" },
      banned: { color: "bg-red-100 text-red-700 border-red-200", label: "Banned" },
      incomplete: {
        color: "bg-slate-100 text-slate-600 border-slate-200",
        label: "Incomplete",
      },
    };
    const variant = variants[eff];
    return (
      <Badge className={`${variant.color} border`}>
        {variant.label}
      </Badge>
    );
  };

  const handleAddVendor = async () => {
    if (!formData.name || !formData.email) {
      alert("Please fill in vendor name and email");
      return;
    }

    try {
      // Generate a unique vendor ID
      const newVendorId = String(vendors.length + 1);
      
      // Create new vendor object
      const newVendor: Vendor = {
        id: newVendorId,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        status: formData.status,
        commission: parseFloat(formData.commission) || 0,
        productsCount: 0,
        totalRevenue: 0,
        joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: formData.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
      };

      console.log("✅ Adding vendor:", newVendor);
      
      // Add vendor to backend
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${publicAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newVendor),
      });

      if (!response.ok) {
        throw new Error(`Failed to add vendor: ${response.statusText}`);
      }

      // Invalidate cache and reload fresh data
      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      await loadVendors();
      
      // Close dialog and reset form
      setShowAddForm(false);
      resetForm();
      
      alert(`✅ Vendor "${newVendor.name}" added successfully!`);
    } catch (error: any) {
      console.error("❌ Error adding vendor:", error);
      alert(`Failed to add vendor: ${error.message}`);
    }
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setIsEditDialogOpen(true);
  };

  const handleUpdateVendor = async (updatedData: any) => {
    if (!editingVendor) {
      console.error("No vendor selected for editing");
      return;
    }

    try {
      console.log("📝 Updating vendor:", editingVendor.id, updatedData);
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/${editingVendor.id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${publicAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update vendor: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Update local state with the updated vendor
      const updatedVendors = vendors.map(v => v.id === editingVendor.id ? result.vendor : v);
      setVendors(updatedVendors);
      
      // Update cache with the same data
      cachedVendors = updatedVendors;
      
      // Invalidate vendor caches to ensure fresh data everywhere
      console.log("🔄 Invalidating vendor caches after update");
      cacheManager.reloadVendorData(editingVendor.id);
      
      // Dispatch event to notify other components (like ProductList) to reload vendor names
      window.dispatchEvent(new CustomEvent('vendorDataUpdated', { detail: { vendorId: editingVendor.id } }));
      
      setIsEditDialogOpen(false);
      setEditingVendor(null);
      
      alert(`✅ Vendor "${result.vendor.name}" updated successfully!`);
      
      // Reload to get fresh data
      await loadVendors();
    } catch (error: any) {
      console.error("❌ Error updating vendor:", error);
      alert(`Failed to update vendor: ${error.message}`);
    }
  };

  const handleDeleteVendor = async (vendorId: string) => {
    if (!confirm(t('vendor.deleteConfirm') || 'Are you sure you want to delete this vendor?')) {
      return;
    }

    try {
      console.log("🗑️ Deleting vendor:", vendorId);
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/${vendorId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${publicAnonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete vendor: ${response.statusText}`);
      }

      // Invalidate cache and reload fresh data
      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      await loadVendors();
      
      // Remove from selection if selected
      setSelectedVendors(selectedVendors.filter(id => id !== vendorId));
      
      alert(t('vendor.deleteSuccess') || '✅ Vendor deleted successfully!');
    } catch (error: any) {
      console.error("❌ Error deleting vendor:", error);
      alert(t('vendor.deleteError') || `Failed to delete vendor: ${error.message}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVendors.length === 0) {
      return;
    }

    const count = selectedVendors.length;
    if (!confirm(t('vendor.bulkDeleteConfirm')?.replace('{count}', count.toString()) || `Are you sure you want to delete ${count} vendor(s)?`)) {
      return;
    }

    try {
      console.log(`🗑️ Bulk deleting ${count} vendors:`, selectedVendors);
      
      // Delete all selected vendors
      const deletePromises = selectedVendors.map(vendorId =>
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/${vendorId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${publicAnonKey}`,
          },
        })
      );

      const results = await Promise.all(deletePromises);
      
      // Check if all deletions were successful
      const failedDeletions = results.filter(r => !r.ok);
      if (failedDeletions.length > 0) {
        throw new Error(`Failed to delete ${failedDeletions.length} vendor(s)`);
      }

      // Invalidate cache and reload fresh data
      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      await loadVendors();
      
      // Clear selection
      setSelectedVendors([]);
      
      alert(t('vendor.bulkDeleteSuccess')?.replace('{count}', count.toString()) || `✅ ${count} vendor(s) deleted successfully!`);
    } catch (error: any) {
      console.error("❌ Error bulk deleting vendors:", error);
      alert(t('vendor.bulkDeleteError') || `Failed to delete vendors: ${error.message}`);
    }
  };

  const handleChangeVendorStatus = async (vendorId: string, newStatus: VendorStatus) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) {
      console.error("❌ Vendor not found:", vendorId);
      toast.error("Vendor not found. Please refresh the page.");
      return;
    }

    // Map status to user-friendly action verbs
    const statusLabels: Record<VendorStatus, string> = {
      active: "activate",
      suspended: "suspend",
      banned: "ban",
      inactive: "deactivate",
      pending: "set to pending"
    };

    const action = statusLabels[newStatus] || newStatus;
    
    // Different confirmation messages based on action
    let confirmMessage = "";
    if (newStatus === "active") {
      confirmMessage = `Are you sure you want to activate vendor "${vendor.name}"? They will regain full access to the platform.`;
    } else if (newStatus === "suspended" || newStatus === "banned") {
      confirmMessage = `Are you sure you want to ${action} vendor "${vendor.name}"? This action will restrict their ability to access the platform.`;
    } else {
      confirmMessage = `Are you sure you want to ${action} vendor "${vendor.name}"?`;
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      console.log(`🔄 Changing vendor ${vendorId} status from "${vendor.status}" to "${newStatus}"`);
      
      // Validate newStatus is a valid VendorStatus
      const validStatuses: VendorStatus[] = ["active", "inactive", "pending", "suspended", "banned"];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/${vendorId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${publicAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Server error:", response.status, errorText);
        throw new Error(`Failed to update vendor status: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to update vendor status");
      }
      
      // Update local state with defensive checks
      const updatedVendors = vendors.map(v => 
        v.id === vendorId ? { ...v, status: newStatus, updatedAt: new Date().toISOString() } : v
      );
      setVendors(updatedVendors);
      
      // Update cache safely
      try {
        cachedVendors = updatedVendors;
      } catch (cacheError) {
        console.warn("⚠️ Failed to update cache:", cacheError);
      }
      
      // Show appropriate success message
      const successMessages: Record<VendorStatus, string> = {
        active: `✅ Vendor "${vendor.name}" has been activated and can now access the platform!`,
        suspended: `⚠️ Vendor "${vendor.name}" has been suspended`,
        banned: `🚫 Vendor "${vendor.name}" has been banned`,
        inactive: `Vendor "${vendor.name}" has been set to inactive`,
        pending: `Vendor "${vendor.name}" has been set to pending`
      };
      
      toast.success(successMessages[newStatus] || `✅ Vendor status updated to ${newStatus}`);
      
      console.log(`✅ Vendor ${vendorId} status successfully changed to "${newStatus}"`);
      
      // Reload to get fresh data (with error handling)
      try {
        await loadVendors();
      } catch (reloadError) {
        console.warn("⚠️ Failed to reload vendors after status update:", reloadError);
        // Don't throw - the update was successful, just the reload failed
      }
    } catch (error: any) {
      console.error("❌ Error updating vendor status:", error);
      
      // User-friendly error message
      const errorMessage = error?.message || "Unknown error occurred";
      toast.error(`Failed to update vendor status: ${errorMessage}`);
      
      // Reload to ensure UI is in sync with backend
      try {
        await loadVendors();
      } catch (reloadError) {
        console.error("❌ Failed to reload vendors after error:", reloadError);
      }
    }
  };

  const handleSendEmail = (vendor: Vendor) => {
    const subject = encodeURIComponent(`Message from Migoo Admin`);
    const body = encodeURIComponent(`Dear ${vendor.name},\n\n`);
    window.location.href = `mailto:${vendor.email}?subject=${subject}&body=${body}`;
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      location: "",
      commission: "",
      status: "active",
    });
  };

  // Fetch vendors from backend on mount
  useEffect(() => {
    loadVendors();
    
    // 🔥 Listen for vendor logo updates from vendor admin portal
    const handleLogoUpdate = (event: CustomEvent) => {
      console.log("🔄 Vendor logo updated, refreshing vendor list...", event.detail);
      loadVendors(); // Reload vendors to get updated logo
    };
    
    window.addEventListener('vendorLogoUpdated', handleLogoUpdate as EventListener);
    
    return () => {
      window.removeEventListener('vendorLogoUpdated', handleLogoUpdate as EventListener);
    };
  }, []);

  const loadVendors = async () => {
    // 🚀 SMART LOADING: Only show spinner if request takes > 300ms
    let showLoadingTimer: NodeJS.Timeout | null = null;
    
    showLoadingTimer = setTimeout(() => {
      setIsLoading(true);
    }, 300);
    
    try {
      // Use module cache to reduce Supabase requests
      console.log("📦 Fetching vendors...");
      const vendors = await moduleCache.get(
        CACHE_KEYS.ADMIN_VENDORS,
        fetchAllVendors,
        false
      );
      
      setVendors(vendors || []);
      cachedVendors = vendors || [];
      console.log(`✅ [VENDOR ADMIN] Loaded ${vendors?.length || 0} vendors`);
    } catch (error: any) {
      if (error.message === 'Failed to fetch') {
        console.error("❌ Error fetching vendors: Cannot connect to server.");
        console.error("   The Supabase edge function may not be deployed yet.");
        console.error("   Please deploy the edge function at /supabase/functions/make-server-16010b6f/");
      } else {
        console.error("❌ Error fetching vendors:", error);
      }
      // Keep vendors as empty array on error
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setIsLoading(false);
    }
  };

  // Calculate stats
  const stats = {
    total: vendors.length,
    active: vendors.filter(v => v.status === "active").length,
    inactive: vendors.filter(v => v.status === "inactive").length,
    pending: vendors.filter(v => v.status === "pending").length,
    incomplete: vendors.filter((v) => effectiveVendorStatus(v) === "incomplete").length,
    totalRevenue: vendors.reduce((sum, v) => sum + safeNumber(v.totalRevenue), 0),
    commissionEarned: vendors.reduce(
      (sum, v) => sum + (safeNumber(v.totalRevenue) * safeNumber(v.commission)) / 100,
      0
    ),
  };

  // 🔥 If viewing applications, show the applications component
  if (showApplications) {
    return (
      <VendorApplications
        onBack={() => setShowApplications(false)}
        onNavigateToVendorList={() => {
          setShowApplications(false);
          loadVendors(); // Refresh vendor list
        }}
      />
    );
  }

  // 🔥 If viewing a vendor profile, show the profile component
  if (viewingVendor) {
    return (
      <VendorProfile
        vendor={viewingVendor}
        onBack={() => setViewingVendor(null)}
        onEdit={(vendor) => {
          setViewingVendor(null);
          handleEditVendor(vendor);
        }}
        onPreviewVendorStore={onPreviewVendorStore}
        onLoginAsVendor={onLoginAsVendor}
      />
    );
  }

  // 🔥 NEW: If adding/editing vendor, show the full-screen form
  if (showAddForm || isEditDialogOpen) {
    return (
      <VendorAddEdit
        onBack={() => {
          setShowAddForm(false);
          setIsEditDialogOpen(false);
          setEditingVendor(null);
        }}
        onSave={async (data) => {
          if (editingVendor) {
            // Update existing vendor
            await handleUpdateVendor(data);
          } else {
            // Add new vendor
            try {
              const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${publicAnonKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
              });

              if (!response.ok) {
                throw new Error(`Failed to add vendor: ${response.statusText}`);
              }

              const result = await response.json();
              
              // Update local state
              await loadVendors();
              
              // Close form
              setShowAddForm(false);
              
              alert(`✅ Vendor "${data.name}" added successfully!`);
            } catch (error: any) {
              console.error("❌ Error adding vendor:", error);
              alert(`Failed to add vendor: ${error.message}`);
            }
          }
        }}
        mode={editingVendor ? "edit" : "add"}
        editingVendor={editingVendor}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('vendor.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('vendor.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowApplications(true)} className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 relative">
            <FileText className="w-4 h-4 mr-2" />
            {t('vendor.reviewApplications')}
            {(pendingApplicationsCount !== undefined && pendingApplicationsCount > 0) && (
              <Badge className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center p-0 bg-red-500 text-white border-2 border-white">
                {pendingApplicationsCount}
              </Badge>
            )}
          </Button>
          <Button onClick={() => setShowAddForm(true)} className="bg-slate-900 hover:bg-slate-800">
            {t('vendor.addVendor')}
          </Button>
        </div>
      </div>

      {/* Storefront Feature Highlight */}
      <Card className="p-4 border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Store className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 mb-1">
              🎉 New: Independent Vendor Storefronts
            </h3>
            <p className="text-sm text-slate-600">
              Each vendor now has their own separate, fully-branded storefront! Click on any vendor and select "Manage Storefront" to configure their unique online store. Migoo handles all ERP operations while vendors maintain their brand identity.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('vendor.totalVendors')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-slate-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('vendor.active')}</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('vendor.inactive')}</p>
              <p className="text-2xl font-semibold text-gray-600 mt-1">{stats.inactive}</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('vendor.pending')}</p>
              <p className="text-2xl font-semibold text-yellow-600 mt-1">{stats.pending}</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Incomplete</p>
              <p className="text-2xl font-semibold text-slate-600 mt-1">{stats.incomplete}</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-slate-500" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('vendor.totalRevenue')}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">${(stats.totalRevenue / 1000).toFixed(0)}k</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Commission Earned</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">${(stats.commissionEarned / 1000).toFixed(0)}k</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters and Actions Bar */}
      <Card className="p-4 border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t('vendor.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as VendorStatus | "all" | "incomplete")}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t('vendor.filterStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('vendor.allStatus')}</SelectItem>
              <SelectItem value="active">{t('vendor.active')}</SelectItem>
              <SelectItem value="inactive">{t('vendor.inactive')}</SelectItem>
              <SelectItem value="pending">{t('vendor.pending')}</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="suspended">{t('vendor.suspended')}</SelectItem>
              <SelectItem value="banned">{t('vendor.banned')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Export */}
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            {t('vendor.export')}
          </Button>
        </div>
      </Card>

      {/* Bulk Actions */}
      {selectedVendors.length > 0 && (
        <Card className="p-4 border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              {selectedVendors.length} vendor{selectedVendors.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Vendors Table */}
      <Card className="border border-slate-200">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 w-12">
                    <div className="w-4 h-4 bg-slate-200 rounded"></div>
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">Email</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">Products</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">Status</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
                    <td className="p-4">
                      <div className="w-4 h-4 bg-slate-200 rounded"></div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                        <div className="space-y-2">
                          <div className="h-4 bg-slate-200 rounded w-32"></div>
                          <div className="h-3 bg-slate-200 rounded w-24"></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-40"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-16"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-8 w-16 bg-slate-200 rounded"></div>
                        <div className="h-8 w-8 bg-slate-200 rounded"></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left p-4 w-12">
                      <Checkbox
                        checked={selectedVendors.length === filteredVendors.length && filteredVendors.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.name')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.email')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">Location</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.products')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.revenue')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.commission')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.status')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.joined')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((vendor) => {
                    const label = vendorDisplayName(vendor);
                    const avatarSeed = vendor.id || label;
                    return (
                    <tr key={vendor.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <Checkbox
                          checked={selectedVendors.includes(vendor.id)}
                          onCheckedChange={(checked) => handleSelectVendor(vendor.id, checked as boolean)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                            {(vendor.logo || vendor.avatar) ? (
                              <img 
                                src={vendor.logo || vendor.avatar}
                                alt={label}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback to DiceBear if image fails to load
                                  e.currentTarget.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(avatarSeed)}`;
                                }}
                              />
                            ) : (
                              <img 
                                src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(avatarSeed)}`}
                                alt={label}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{label}</div>
                            <div className="text-xs text-slate-500">{vendor.email?.trim() || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[150px]">{vendor.email?.trim() || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{vendor.phone?.trim() || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{vendor.location?.trim() || "—"}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-900">{safeNumber(vendor.productsCount)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-semibold text-slate-900">{safeNumber(vendor.totalRevenue).toLocaleString()} MMK</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-900">{safeNumber(vendor.commission)}%</span>
                      </td>
                      <td className="p-4">
                        {getStatusBadge(vendor)}
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-600">{vendorDisplayJoined(vendor)}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setViewingVendor(vendor)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Box className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewingVendor(vendor)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {t('vendor.viewProfile')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditVendor(vendor)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('vendor.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSendEmail(vendor)}>
                                <Mail className="w-4 h-4 mr-2" />
                                {t('vendor.sendEmail')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              
                              {/* Show Activate option for suspended, banned, or inactive vendors */}
                              {(vendor.status === 'suspended' || vendor.status === 'banned' || vendor.status === 'inactive') && (
                                <DropdownMenuItem 
                                  className="text-green-600"
                                  onClick={() => handleChangeVendorStatus(vendor.id, "active")}
                                >
                                  <TrendingUp className="w-4 h-4 mr-2" />
                                  Activate Vendor
                                </DropdownMenuItem>
                              )}
                              
                              {/* Show Suspend option only for active vendors */}
                              {vendor.status === 'active' && (
                                <DropdownMenuItem 
                                  className="text-orange-600"
                                  onClick={() => handleChangeVendorStatus(vendor.id, "suspended")}
                                >
                                  <AlertTriangle className="w-4 h-4 mr-2" />
                                  {t('vendor.suspend')}
                                </DropdownMenuItem>
                              )}
                              
                              {/* Show Ban option only for non-banned vendors */}
                              {vendor.status !== 'banned' && (
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => handleChangeVendorStatus(vendor.id, "banned")}
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  Ban Vendor
                                </DropdownMenuItem>
                              )}
                              
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteVendor(vendor.id)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('vendor.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredVendors.length === 0 && (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">{t('vendor.noResults')}</h3>
                <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Edit Vendor Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
            <DialogDescription>
              Update vendor information
            </DialogDescription>
          </DialogHeader>
          <VendorForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={handleUpdateVendor}>
              <Edit className="w-4 h-4 mr-2" />
              Update Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}