// Vendor Management Component - Force rebuild
import { useState, useEffect, useMemo, useRef } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useLanguage } from "../contexts/LanguageContext";
import { cacheManager } from "../utils/cacheManager";
import {
  moduleCache,
  CACHE_KEYS,
  fetchAllVendors,
  getCachedAdminVendorApplications,
  invalidateAdminVendorApplicationsCache,
  invalidateVendorStorefrontCatalogCachesAfterProductLinkChange,
} from "../utils/module-cache";
import { formatNumber } from "../../utils/formatNumber";
import {
  Search,
  Filter,
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
  ChevronLeft,
  ChevronRight,
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
import { VendorApplicationReview } from "./VendorApplicationReview";
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

/** Shape expected by `VendorApplicationReview` (mirrors `VendorApplications` mapping). */
type ApplicationReviewShape = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  location: string;
  website?: string;
  businessType: string;
  taxId: string;
  description: string;
  productsCategory: string;
  estimatedProducts: number;
  appliedDate: string;
  status: "pending" | "approved" | "rejected";
  notes?: string;
  avatar: string;
  files?: {
    businessLicense?: { name: string; type: string; data: string };
    idDocument?: { name: string; type: string; data: string };
  };
};

function mapApiApplicationToReviewShape(app: Record<string, unknown>): ApplicationReviewShape {
  const companyName = (app.companyName as string) || (app.businessName as string) || "";
  return {
    id: String(app.id ?? ""),
    businessName: companyName || "Unknown",
    contactName: (app.contactName as string) || "N/A",
    email: String(app.email ?? ""),
    phone: String(app.phone ?? ""),
    location:
      app.city && app.country
        ? `${app.city}, ${app.country}`
        : String((app.address as string) || "N/A"),
    website: app.website as string | undefined,
    businessType: String(app.businessType ?? ""),
    taxId: String((app.registrationNumber as string) || (app.taxId as string) || "N/A"),
    description: String(
      (app.storeDescription as string) || (app.description as string) || "No description provided"
    ),
    productsCategory: Array.isArray(app.categories) ? (app.categories as string[]).join(", ") : "General",
    estimatedProducts: parseInt(String(app.estimatedProducts ?? "0"), 10) || 0,
    appliedDate: new Date(
      (app.submittedAt as string) || (app.createdAt as string) || Date.now()
    ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    status: (app.status as ApplicationReviewShape["status"]) || "pending",
    notes: app.reviewNotes as string | undefined,
    avatar: companyName.substring(0, 2).toUpperCase() || "VN",
    files: app.files as ApplicationReviewShape["files"],
  };
}

function mapRawApplicationsToPendingRows(raw: Record<string, unknown>[]): ApplicationReviewShape[] {
  return raw
    .filter((a) => String(a?.status ?? "").toLowerCase() === "pending")
    .map((a) => mapApiApplicationToReviewShape(a));
}

type VendorTableRow =
  | { kind: "vendor"; vendor: Vendor }
  | { kind: "application"; application: ApplicationReviewShape };

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

/** Normalize API casing/spacing and common aliases for filters and stats. */
function normalizeVendorStatusRaw(status: unknown): VendorStatus | null {
  if (status === null || status === undefined) return null;
  const raw = typeof status === "string" ? status : String(status);
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!s) return null;

  const alias: Record<string, VendorStatus> = {
    approved: "active",
    enabled: "active",
    enable: "active",
    disabled: "inactive",
    disable: "inactive",
    deactivated: "inactive",
    in_review: "pending",
    under_review: "pending",
    awaiting_review: "pending",
    awaiting_approval: "pending",
    suspend: "suspended",
    suspended_account: "suspended",
    paused: "suspended",
    ban: "banned",
    blocked: "banned",
    blacklisted: "banned",
  };
  const mapped = alias[s];
  if (mapped) return mapped;

  return KNOWN_VENDOR_STATUSES.includes(s as VendorStatus) ? (s as VendorStatus) : null;
}

function isKnownVendorStatus(status: unknown): status is VendorStatus {
  return normalizeVendorStatusRaw(status) != null;
}

/** Read lifecycle status from common API field names. */
function rawLifecycleStatus(vendor: Vendor & Record<string, unknown>): unknown {
  return (
    vendor.status ??
    vendor.accountStatus ??
    vendor.vendorStatus ??
    vendor.lifecycleStatus ??
    vendor["Status"]
  );
}

/** Missing or invalid API status — not the same as workflow "pending". */
function effectiveVendorStatus(vendor: Vendor): VendorStatus | "incomplete" {
  return normalizeVendorStatusRaw(rawLifecycleStatus(vendor as Vendor & Record<string, unknown>)) ?? "incomplete";
}

function vendorDisplayName(vendor: Vendor & { id?: string }): string {
  const raw = typeof vendor.name === "string" ? vendor.name.trim() : "";
  if (raw) return raw;
  const id = vendor.id || "";
  return id ? `Unnamed (${id.length > 20 ? `${id.slice(0, 18)}…` : id})` : "Unnamed vendor";
}

function formatJoinedLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "—";
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return t;
}

function vendorDisplayJoined(vendor: Vendor & { createdAt?: string }): string {
  const j = vendor.joinedDate;
  if (typeof j === "string" && j.trim()) {
    return formatJoinedLabel(j);
  }
  const c = vendor.createdAt;
  if (typeof c === "string" && c.trim()) {
    return formatJoinedLabel(c);
  }
  return "—";
}

interface VendorProps {
  onPreviewVendorStore?: (vendorId: string, storeSlug: string, vendor: Vendor) => void;
  onLoginAsVendor?: (vendor: Vendor) => void;
  pendingApplicationsCount?: number;
  /** From global search — applied when token changes */
  initialListSearchQuery?: string;
  listSearchApplyToken?: number;
  /** After approve/reject from embedded applications — refresh nav badges */
  onVendorApplicationsMutated?: () => void;
}

export function Vendor({
  onPreviewVendorStore,
  onLoginAsVendor,
  pendingApplicationsCount,
  initialListSearchQuery,
  listSearchApplyToken,
  onVendorApplicationsMutated,
}: VendorProps = {}) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (initialListSearchQuery === undefined || !String(initialListSearchQuery).trim()) return;
    setSearchQuery(String(initialListSearchQuery).trim());
  }, [initialListSearchQuery, listSearchApplyToken]);

  const [statusFilter, setStatusFilter] = useState<VendorStatus | "all">("all");
  const [vendorListPage, setVendorListPage] = useState(1);
  const [vendorListPageSize, setVendorListPageSize] = useState(20);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const [showApplications, setShowApplications] = useState(false);
  const [pendingApplicationRows, setPendingApplicationRows] = useState<ApplicationReviewShape[]>(() => {
    const raw = moduleCache.peek<Record<string, unknown>[]>(CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS);
    return Array.isArray(raw) ? mapRawApplicationsToPendingRows(raw) : [];
  });
  const [reviewingApplication, setReviewingApplication] = useState<ApplicationReviewShape | null>(null);
  const [isLoadingApplications, setIsLoadingApplications] = useState(
    () => !moduleCache.has(CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS)
  );

  // 🚀 Initialize from module cache — revisiting Vendors tab uses cached rows; filters are client-side only.
  const [vendors, setVendors] = useState<Vendor[]>(() => {
    const peeked = moduleCache.peek<Vendor[]>(CACHE_KEYS.ADMIN_VENDORS);
    if (Array.isArray(peeked)) {
      cachedVendors = peeked;
      return peeked;
    }
    return cachedVendors || [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    if ((cachedVendors?.length ?? 0) > 0) return false;
    return !moduleCache.has(CACHE_KEYS.ADMIN_VENDORS);
  });

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    commission: "",
    status: "active" as VendorStatus,
  });

  const searchLower = searchQuery.toLowerCase().trim();
  const filteredVendors = useMemo(() => {
    return vendors.filter((vendor) => {
      const matchesSearch =
        !searchLower ||
        safeLower(vendor.name).includes(searchLower) ||
        safeLower(vendor.email).includes(searchLower) ||
        safeLower(vendor.location).includes(searchLower);
      const eff = effectiveVendorStatus(vendor);
      const matchesStatus = statusFilter === "all" || eff === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vendors, searchLower, statusFilter]);

  const filteredPendingApplications = useMemo(() => {
    return pendingApplicationRows.filter((app) => {
      if (app.status !== "pending") return false;
      if (!searchLower) return true;
      return (
        safeLower(app.businessName).includes(searchLower) ||
        safeLower(app.contactName).includes(searchLower) ||
        safeLower(app.email).includes(searchLower) ||
        safeLower(app.location).includes(searchLower)
      );
    });
  }, [pendingApplicationRows, searchLower]);

  /** Pending applications appear with "All statuses" and "Pending review" filters. */
  const needsApplicationRowsInTable =
    statusFilter === "pending" || statusFilter === "all";

  const displayRows: VendorTableRow[] = useMemo(() => {
    if (!needsApplicationRowsInTable) {
      return filteredVendors.map((vendor) => ({ kind: "vendor" as const, vendor }));
    }
    const vendorPart = filteredVendors.map((vendor) => ({ kind: "vendor" as const, vendor }));
    const appPart = filteredPendingApplications.map((application) => ({
      kind: "application" as const,
      application,
    }));
    return [...appPart, ...vendorPart];
  }, [needsApplicationRowsInTable, filteredVendors, filteredPendingApplications]);

  const vendorTableTotal = displayRows.length;
  const vendorTableTotalPages = Math.max(1, Math.ceil(vendorTableTotal / vendorListPageSize) || 1);
  const paginatedDisplayRows = useMemo(() => {
    if (displayRows.length === 0) return [];
    const start = (vendorListPage - 1) * vendorListPageSize;
    return displayRows.slice(start, start + vendorListPageSize);
  }, [displayRows, vendorListPage, vendorListPageSize]);

  useEffect(() => {
    setVendorListPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(displayRows.length / vendorListPageSize) || 1);
    setVendorListPage((p) => (p > tp ? tp : p));
  }, [displayRows.length, vendorListPageSize]);

  /** Skeleton while vendors load, or while applications load when the table includes application rows. */
  const showTableSkeleton =
    isLoading || (needsApplicationRowsInTable && isLoadingApplications);

  const vendorRowsInDisplay = useMemo(
    () => paginatedDisplayRows.filter((r): r is { kind: "vendor"; vendor: Vendor } => r.kind === "vendor"),
    [paginatedDisplayRows]
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVendors(vendorRowsInDisplay.map((r) => r.vendor.id));
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
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: t("vendor.pending") },
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

      const body: Record<string, unknown> = { ...updatedData };
      if (Object.prototype.hasOwnProperty.call(updatedData, "logo")) {
        const L = updatedData.logo;
        const url = typeof L === "string" ? L : "";
        body.logo = url;
        body.avatar = url;
      }

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/${editingVendor.id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${publicAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Failed to update vendor: ${response.statusText}`);
      }

      const result = await response.json();

      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      cacheManager.reloadVendorData(editingVendor.id);
      const slug = (editingVendor as Vendor & { storeSlug?: string }).storeSlug;
      invalidateVendorStorefrontCatalogCachesAfterProductLinkChange(editingVendor.id, [slug]);

      window.dispatchEvent(new CustomEvent("vendorDataUpdated", { detail: { vendorId: editingVendor.id } }));
      window.dispatchEvent(
        new CustomEvent("vendorLogoUpdated", {
          detail: {
            vendorId: editingVendor.id,
            logo: result.vendor?.logo || result.vendor?.avatar || "",
          },
        })
      );

      setIsEditDialogOpen(false);
      setEditingVendor(null);

      alert(`✅ Vendor "${result.vendor.name}" updated successfully!`);

      await loadVendors(true);
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
      
      // Must invalidate module cache — otherwise loadVendors() returns stale rows and filters (suspended/banned/all) break
      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      try {
        await loadVendors(true);
      } catch (reloadError) {
        console.warn("⚠️ Failed to reload vendors after status update:", reloadError);
        // Don't throw - the update was successful, just the reload failed
      }
    } catch (error: any) {
      console.error("❌ Error updating vendor status:", error);
      
      // User-friendly error message
      const errorMessage = error?.message || "Unknown error occurred";
      toast.error(`Failed to update vendor status: ${errorMessage}`);
      
      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      try {
        await loadVendors(true);
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
      moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
      void loadVendors(true);
    };
    
    window.addEventListener('vendorLogoUpdated', handleLogoUpdate as EventListener);
    
    return () => {
      window.removeEventListener('vendorLogoUpdated', handleLogoUpdate as EventListener);
    };
  }, []);

  const loadVendors = async (forceRefresh = false) => {
    let showLoadingTimer: NodeJS.Timeout | null = null;
    if (forceRefresh) {
      setIsLoading(true);
    } else {
      showLoadingTimer = setTimeout(() => {
        setIsLoading(true);
      }, 300);
    }

    try {
      // Use module cache to reduce Supabase requests (forceRefresh after mutations / post-approval)
      console.log("📦 Fetching vendors...");
      const vendors = await moduleCache.get(
        CACHE_KEYS.ADMIN_VENDORS,
        fetchAllVendors,
        forceRefresh
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

  const loadPendingApplications = async (forceRefresh = false) => {
    let showTimer: NodeJS.Timeout | null = null;
    if (forceRefresh) {
      setIsLoadingApplications(true);
    } else {
      showTimer = setTimeout(() => setIsLoadingApplications(true), 300);
    }
    try {
      const raw = await getCachedAdminVendorApplications(forceRefresh);
      setPendingApplicationRows(mapRawApplicationsToPendingRows(raw));
    } catch (e) {
      console.warn("Pending applications load failed:", e);
      setPendingApplicationRows([]);
    } finally {
      if (showTimer) clearTimeout(showTimer);
      setIsLoadingApplications(false);
    }
  };

  const pendingAppsBadgeKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = String(pendingApplicationsCount ?? "∅");
    if (pendingAppsBadgeKeyRef.current === undefined) {
      pendingAppsBadgeKeyRef.current = key;
      void loadPendingApplications(false);
      return;
    }
    if (pendingAppsBadgeKeyRef.current === key) return;
    pendingAppsBadgeKeyRef.current = key;
    void loadPendingApplications(true);
  }, [pendingApplicationsCount]);

  /** Pending apps for stats: use loaded rows (cache/API) once idle; while loading, max(nav badge, local) so the card never undercounts. */
  const pendingApplicationsForStats = isLoadingApplications
    ? Math.max(
        pendingApplicationRows.length,
        typeof pendingApplicationsCount === "number" ? pendingApplicationsCount : 0
      )
    : pendingApplicationRows.length;

  /** Must match the status filter logic (effectiveVendorStatus). */
  const pendingVendorCount = vendors.filter((v) => effectiveVendorStatus(v) === "pending").length;
  /** Matches admin mental model: vendor accounts on hold + applications not yet approved. */
  const pendingReviewTotal = pendingVendorCount + pendingApplicationsForStats;

  /** Vendors in pending / suspended / banned (excludes “inactive” and incomplete). */
  const restrictedVendorStatCount = vendors.filter((v) => {
    const e = effectiveVendorStatus(v);
    return e === "pending" || e === "suspended" || e === "banned";
  }).length;

  const stats = {
    total: vendors.length,
    active: vendors.filter((v) => effectiveVendorStatus(v) === "active").length,
    restrictedVendors: restrictedVendorStatCount,
    pendingReviewTotal,
    pendingVendorCount,
    pendingApplications: pendingApplicationsForStats,
    totalRevenue: vendors.reduce((sum, v) => sum + safeNumber(v.totalRevenue), 0),
  };

  const pendingCardSubtitle = (() => {
    const v = pendingVendorCount;
    const a = pendingApplicationsForStats;
    if (pendingReviewTotal === 0) return null;
    if (v > 0 && a > 0) {
      return t("vendor.pendingSubBoth")
        .replace("{vendorCount}", String(v))
        .replace("{appCount}", String(a));
    }
    if (v > 0) {
      return t("vendor.pendingSubVendorsOnly").replace("{count}", String(v));
    }
    return t("vendor.pendingSubAppsOnly").replace("{count}", String(a));
  })();

  if (reviewingApplication) {
    return (
      <VendorApplicationReview
        application={reviewingApplication}
        onBack={() => setReviewingApplication(null)}
        onUpdate={async () => {
          await loadVendors(true);
        }}
        onNavigateToVendorList={() => {
          setReviewingApplication(null);
        }}
        onApplicationsMutated={() => {
          invalidateAdminVendorApplicationsCache();
          void loadPendingApplications(true);
          onVendorApplicationsMutated?.();
        }}
      />
    );
  }

  // 🔥 If viewing applications, show the applications component
  if (showApplications) {
    return (
      <VendorApplications
        onBack={() => {
          setShowApplications(false);
          void loadPendingApplications(false);
        }}
        onNavigateToVendorList={() => {
          setShowApplications(false);
          void loadVendors(true);
          void loadPendingApplications(false);
        }}
        onApplicationsMutated={() => {
          invalidateAdminVendorApplicationsCache();
          void loadPendingApplications(true);
          onVendorApplicationsMutated?.();
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            <div className="min-w-0 pr-2">
              <p className="text-sm text-slate-500 leading-snug">{t("vendor.restrictedVendorStat")}</p>
              <p className="text-2xl font-semibold text-orange-700 mt-1 tabular-nums">
                {stats.restrictedVendors}
              </p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">{t('vendor.pending')}</p>
              <p className="text-2xl font-semibold text-yellow-600 mt-1 tabular-nums">{stats.pendingReviewTotal}</p>
              {pendingCardSubtitle && (
                <p className="text-xs text-slate-500 mt-1 leading-snug">{pendingCardSubtitle}</p>
              )}
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('vendor.totalRevenue')}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {formatNumber(Math.round(stats.totalRevenue))}
                </span>
                <span className="text-[0.65rem] font-medium text-slate-500 uppercase tracking-wide">MMK</span>
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
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
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as VendorStatus | "all")}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t('vendor.filterStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('vendor.allStatus')}</SelectItem>
              <SelectItem value="active">{t('vendor.active')}</SelectItem>
              <SelectItem value="inactive">{t('vendor.inactive')}</SelectItem>
              <SelectItem value="pending">{t('vendor.pending')}</SelectItem>
              <SelectItem value="suspended">{t('vendor.suspended')}</SelectItem>
              <SelectItem value="banned">{t('vendor.banned')}</SelectItem>
            </SelectContent>
          </Select>
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
        {showTableSkeleton ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 w-12">
                    <div className="w-4 h-4 bg-slate-200 rounded animate-pulse" aria-hidden />
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">{t("vendor.name")}</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">{t("vendor.email")}</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">Location</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">{t("vendor.products")}</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">{t("vendor.status")}</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">{t("vendor.joined")}</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-600">{t("vendor.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
                    <td className="p-4">
                      <div className="w-4 h-4 bg-slate-200 rounded" />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-200 rounded-xl" />
                        <div className="space-y-2">
                          <div className="h-4 bg-slate-200 rounded w-32" />
                          <div className="h-3 bg-slate-200 rounded w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-40 mb-2" />
                      <div className="h-3 bg-slate-200 rounded w-28" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-36" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-12" />
                    </td>
                    <td className="p-4">
                      <div className="h-6 bg-slate-200 rounded-full w-24" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-24" />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-slate-200 rounded" />
                        <div className="h-8 w-8 bg-slate-200 rounded" />
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
                        checked={
                          vendorRowsInDisplay.length > 0 &&
                          selectedVendors.length === vendorRowsInDisplay.length &&
                          vendorRowsInDisplay.every((r) => selectedVendors.includes(r.vendor.id))
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.name')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.email')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">Location</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.products')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.status')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.joined')}</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-600">{t('vendor.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDisplayRows.map((row) => {
                    if (row.kind === "application") {
                      const app = row.application;
                      const seed = app.id || app.businessName;
                      return (
                        <tr
                          key={`application-${app.id}`}
                          className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors bg-amber-50/20"
                        >
                          <td className="p-4">
                            <Checkbox disabled className="opacity-40" aria-label="" />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                                <img
                                  src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{app.businessName}</div>
                                <div className="text-xs text-slate-500">{app.contactName}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Mail className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[150px]">{app.email?.trim() || "—"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone className="w-3.5 h-3.5" />
                                <span>{app.phone?.trim() || "—"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{app.location?.trim() || "—"}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-900 tabular-nums">
                                ~{app.estimatedProducts || 0}
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 border">
                              {t("vendor.pending")}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <span className="text-sm text-slate-600">{app.appliedDate}</span>
                          </td>
                          <td className="p-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-amber-200 bg-white hover:bg-amber-50"
                              onClick={() => setReviewingApplication(app)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              {t("vendor.review")}
                            </Button>
                          </td>
                        </tr>
                      );
                    }

                    const vendor = row.vendor;
                    const label = vendorDisplayName(vendor);
                    const avatarSeed = vendor.id || label;
                    const rowStatus = effectiveVendorStatus(vendor);
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
                              {vendor.logo || vendor.avatar ? (
                                <img
                                  src={vendor.logo || vendor.avatar}
                                  alt={label}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
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
                        <td className="p-4">{getStatusBadge(vendor)}</td>
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
                                  {t("vendor.viewProfile")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditVendor(vendor)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t("vendor.edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSendEmail(vendor)}>
                                  <Mail className="w-4 h-4 mr-2" />
                                  {t("vendor.sendEmail")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />

                                {(rowStatus === "suspended" || rowStatus === "banned" || rowStatus === "inactive") && (
                                  <DropdownMenuItem
                                    className="text-green-600"
                                    onClick={() => handleChangeVendorStatus(vendor.id, "active")}
                                  >
                                    <TrendingUp className="w-4 h-4 mr-2" />
                                    Activate Vendor
                                  </DropdownMenuItem>
                                )}

                                {rowStatus === "active" && (
                                  <DropdownMenuItem
                                    className="text-orange-600"
                                    onClick={() => handleChangeVendorStatus(vendor.id, "suspended")}
                                  >
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    {t("vendor.suspend")}
                                  </DropdownMenuItem>
                                )}

                                {rowStatus !== "banned" && (
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
                                  {t("vendor.delete")}
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

            {vendorTableTotal > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Rows per page</span>
                  <Select
                    value={String(vendorListPageSize)}
                    onValueChange={(v) => {
                      setVendorListPageSize(Number(v));
                      setVendorListPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[88px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-slate-500">
                    Page {vendorListPage} of {vendorTableTotalPages} · {vendorTableTotal}{" "}
                    {vendorTableTotal === 1 ? "row" : "rows"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={vendorListPage <= 1}
                    onClick={() => setVendorListPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={vendorListPage >= vendorTableTotalPages}
                    onClick={() => setVendorListPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {displayRows.length === 0 && (
              <div className="p-12 text-center border-t border-slate-100">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">{t("vendor.noResults")}</h3>
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