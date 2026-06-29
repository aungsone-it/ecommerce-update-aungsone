import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Filter,
  Download,
  MoreVertical,
  MessageSquare,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  Eye,
  Ban,
  Trash2,
  Star,
  CheckCircle,
  TrendingUp,
  Users as UsersIcon,
  Send,
  BarChart3,
  Activity,
  Target,
  Award,
  Clock,
  ArrowUpRight,
  Zap,
  Heart,
  Package,
  CreditCard,
  X,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AdminClearableSearchInput } from "./AdminClearableSearchInput";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { CustomerProfile } from "./CustomerProfile";
import { useNavigate } from "react-router";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  getCachedAdminCustomersPage,
  invalidateAdminCustomersCache,
  removeAdminCustomersFromCaches,
  ADMIN_CUSTOMERS_PAGE_DEFAULT,
  moduleCache,
  adminCustomersPageCacheKey,
  type AdminCustomersPagePayload,
} from "../utils/module-cache";
import { useAdminPortalDebouncedSearch } from "../utils/adminProductSearch";
import { toast } from "sonner";
import { MIGOO_USER_SESSION_CHANGED_EVENT } from "../../constants";
import { useLanguage } from "../contexts/LanguageContext";
import { broadcastCustomerRealtime, subscribeCustomerRealtime } from "../utils/customersRealtime";
import { useAuth } from "../contexts/AuthContext";

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone: string;
  location: string;
  joinDate: string;
  totalOrders: number;
  totalSpent: number;
  status: "active" | "inactive" | "blocked";
  tier: "vip" | "regular" | "new";
  lastVisit: string;
  lastOrderDate?: string;
  avgOrderValue: number;
  tags: string[];
  favoriteCategory?: string;
  engagementScore: number; // 0-100
  lifetimeValue: number;
  rfmScore?: {
    recency: number; // 1-5
    frequency: number; // 1-5
    monetary: number; // 1-5
  };
}

const normalizeAdminCustomers = (raw: any[]): Customer[] => {
  return (raw || []).filter((c: any) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    if (!c.id || typeof c.id !== "string") return false;
    return true;
  });
};

type ChatHandoffCustomer = { name: string; email: string; avatar?: string };

function MmkInline({ value, className }: { value: number; className?: string }) {
  const n = Math.round(Number(value) || 0);
  return (
    <span className={`tabular-nums inline-flex items-baseline gap-0.5 flex-wrap ${className ?? ""}`}>
      <span>{n.toLocaleString()}</span>
      <span className="text-[9px] font-medium text-slate-500 leading-none">MMK</span>
    </span>
  );
}

export function CustomersEnhanced({
  onOpenChatWithCustomer,
}: {
  onOpenChatWithCustomer?: (c: ChatHandoffCustomer) => void;
} = {}) {
  const { user: sessionUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const tr = (key: string, values: Record<string, string | number> = {}) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      t(key)
    );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [filterSegment, setFilterSegment] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  const initialCustomersPayload = useMemo(
    () =>
      moduleCache.peek<AdminCustomersPagePayload>(
        adminCustomersPageCacheKey({
          page: 1,
          pageSize: ADMIN_CUSTOMERS_PAGE_DEFAULT,
          q: "",
          status: "all",
          tier: "all",
          segment: "all",
        })
      ),
    []
  );
  const [customersList, setCustomersList] = useState<Customer[]>(() =>
    normalizeAdminCustomers((initialCustomersPayload?.customers || []) as any[])
  );
  const searchDebounced = useAdminPortalDebouncedSearch(searchQuery);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersPageSize, setCustomersPageSize] = useState(ADMIN_CUSTOMERS_PAGE_DEFAULT);
  const [customersTotal, setCustomersTotal] = useState(() => Number(initialCustomersPayload?.total ?? 0));
  const [customersHasMore, setCustomersHasMore] = useState(() => !!initialCustomersPayload?.hasMore);
  const [serverListStats, setServerListStats] = useState<AdminCustomersPagePayload["stats"]>(
    () => initialCustomersPayload?.stats
  );
  const [isLoading, setIsLoading] = useState(() => !initialCustomersPayload);
  const skipCustomersRealtimeReloadRef = useRef(false);

  // 🎯 Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    description: string;
    type: "success" | "error" | "warning" | "info";
  }>({
    title: "",
    description: "",
    type: "info",
  });

  // 🔥 CONFIRMATION DIALOG STATE
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "block" | "delete" | "bulkDelete";
    customerId?: string;
    customerName?: string;
  }>({
    isOpen: false,
    type: "delete",
  });

  useEffect(() => {
    setCustomersPage(1);
  }, [searchDebounced, filterStatus, filterTier, filterSegment, customersPageSize]);

  const customerContactSubtitle = (customer: Customer) =>
    customer.phone?.trim() || customer.email?.trim() || "";

  const fetchCustomers = useCallback(
    async (forceRefresh = false, opts?: { silent?: boolean }) => {
      let showLoadingTimer: ReturnType<typeof setTimeout> | null = null;
      const pageParams = {
        page: customersPage,
        pageSize: customersPageSize,
        q: searchDebounced,
        status: filterStatus,
        tier: filterTier,
        segment: filterSegment,
      };
      const hasCachedPage =
        !forceRefresh &&
        !!moduleCache.peek<AdminCustomersPagePayload>(adminCustomersPageCacheKey(pageParams));
      if (!opts?.silent && !hasCachedPage) {
        showLoadingTimer = setTimeout(() => setIsLoading(true), 300);
      }
      try {
        const data = await getCachedAdminCustomersPage(
          pageParams,
          forceRefresh
        );
        const validCustomers = normalizeAdminCustomers(data.customers || []) as Customer[];
        setCustomersList(validCustomers);
        setCustomersTotal(data.total);
        setCustomersHasMore(!!data.hasMore);
        setServerListStats(data.stats);
      } catch (error: any) {
        const isWarmupError = error instanceof TypeError && error.message === "Failed to fetch";
        if (!isWarmupError) {
          console.error("❌ Error fetching customers:", error);
        }
        setCustomersList([]);
        setCustomersTotal(0);
        setCustomersHasMore(false);
        setServerListStats(undefined);
      } finally {
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setIsLoading(false);
      }
    },
    [
      customersPage,
      customersPageSize,
      searchDebounced,
      filterStatus,
      filterTier,
      filterSegment,
    ]
  );

  useEffect(() => {
    void fetchCustomers(false);
  }, [fetchCustomers]);

  useEffect(() => {
    const refreshCustomers = () => {
      if (skipCustomersRealtimeReloadRef.current) {
        skipCustomersRealtimeReloadRef.current = false;
        return;
      }
      invalidateAdminCustomersCache();
      void fetchCustomers(true, { silent: true });
    };

    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || e.key !== "migoo-user") return;
      refreshCustomers();
    };

    window.addEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, refreshCustomers);
    window.addEventListener("customersDataUpdated", refreshCustomers as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MIGOO_USER_SESSION_CHANGED_EVENT, refreshCustomers);
      window.removeEventListener("customersDataUpdated", refreshCustomers as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchCustomers]);

  // Supabase broadcast + cross-tab: new storefront registrations appear without manual refresh.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        invalidateAdminCustomersCache();
        void fetchCustomers(true, { silent: true });
      }, 280);
    };
    const unsub = subscribeCustomerRealtime(schedule);
    return () => {
      window.clearTimeout(debounce);
      unsub();
    };
  }, [fetchCustomers]);

  // Customer Segmentation based on RFM
  const getCustomerSegment = (customer: Customer) => {
    if (!customer.rfmScore) return "unknown";
    const { recency, frequency, monetary } = customer.rfmScore;
    const score = recency + frequency + monetary;

    if (score >= 13) return "champions"; // Best customers
    if (score >= 10 && recency >= 4) return "loyal";
    if (score >= 8 && recency >= 3) return "potential-loyalist";
    if (score >= 6 && recency <= 2) return "at-risk";
    if (frequency >= 4 && recency <= 2) return "cant-lose";
    if (score <= 6) return "hibernating";
    return "need-attention";
  };

  const stats = useMemo(() => {
    if (serverListStats) {
      return {
        total: serverListStats.total,
        active: serverListStats.active,
        vip: serverListStats.vip,
        newThisMonth: serverListStats.newThisMonth,
        totalRevenue: serverListStats.totalRevenue,
        avgLTV: serverListStats.avgLTV,
        champions: serverListStats.champions,
        atRisk: serverListStats.atRisk,
      };
    }
    return {
      total: customersList.length,
      active: customersList.filter((c) => c.status === "active").length,
      vip: customersList.filter((c) => c.tier === "vip").length,
      newThisMonth: customersList.filter(
        (c) =>
          new Date(c.joinDate).getMonth() === new Date().getMonth() &&
          new Date(c.joinDate).getFullYear() === new Date().getFullYear()
      ).length,
      totalRevenue: customersList.reduce((sum, c) => sum + (c.totalSpent || 0), 0),
      avgLTV:
        customersList.length > 0 ?
          customersList.reduce((sum, c) => sum + (c.lifetimeValue || 0), 0) / customersList.length
        : 0,
      champions: customersList.filter((c) => getCustomerSegment(c) === "champions").length,
      atRisk: customersList.filter(
        (c) => getCustomerSegment(c) === "at-risk" || getCustomerSegment(c) === "cant-lose"
      ).length,
    };
  }, [serverListStats, customersList]);

  /** Rows visible in the table: instant name/email match on the current server page. */
  const visibleCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customersList;
    return customersList.filter(
      (c) =>
        (c.name?.toLowerCase() || "").includes(q) ||
        (c.email?.toLowerCase() || "").includes(q) ||
        (c.phone?.toLowerCase() || "").includes(q)
    );
  }, [customersList, searchQuery]);

  const toggleSelectCustomer = (customerId: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCustomers.length === visibleCustomers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(visibleCustomers.map((c) => c.id));
    }
  };

  const escapeCsvField = (v: unknown) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCustomerCsv = (rows: Customer[], suffix: string) => {
    if (!rows.length) {
      toast.error(t("customerIntel.noExport"));
      return;
    }
    const header = [
      "Name",
      "Email",
      "Phone",
      "Segment",
      "Orders",
      "Avg Order (MMK)",
      "Lifetime Value (MMK)",
      "Tags",
      "Status",
      "Tier",
      "Join Date",
    ];
    const lines = rows.map((c) =>
      [
        escapeCsvField(c.name),
        escapeCsvField(c.email),
        escapeCsvField(c.phone),
        escapeCsvField(getCustomerSegment(c)),
        String(c.totalOrders ?? 0),
        String(Math.round(Number(c.avgOrderValue) || 0)),
        String(Math.round(Number(c.lifetimeValue ?? c.totalSpent) || 0)),
        escapeCsvField((c.tags || []).join("; ")),
        escapeCsvField(c.status),
        escapeCsvField(c.tier),
        escapeCsvField(c.joinDate),
      ].join(",")
    );
    const csv = `\uFEFF${[header.join(","), ...lines].join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secure-customers-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(tr("customerIntel.exported", {
      count: rows.length,
      unit: rows.length === 1 ? t("customerIntel.customerOne") : t("customerIntel.customerMany"),
    }));
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "vip":
        return (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200">
            <Star className="w-3 h-3 mr-1" />
            {t("customerIntel.vip")}
          </Badge>
        );
      case "regular":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            {t("customerIntel.regular")}
          </Badge>
        );
      case "new":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            {t("customerIntel.new")}
          </Badge>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t("customerIntel.active")}
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            {t("customerIntel.inactive")}
          </Badge>
        );
      case "blocked":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Ban className="w-3 h-3 mr-1" />
            {t("customerIntel.blocked")}
          </Badge>
        );
      default:
        return null;
    }
  };

  const getSegmentBadge = (segment: string) => {
    switch (segment) {
      case "champions":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
            <Award className="w-3 h-3 mr-1" />
            {t("customerIntel.champions")}
          </Badge>
        );
      case "loyal":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            <Heart className="w-3 h-3 mr-1" />
            {t("customerIntel.loyal")}
          </Badge>
        );
      case "at-risk":
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
            <Clock className="w-3 h-3 mr-1" />
            {t("customerIntel.atRisk")}
          </Badge>
        );
      case "cant-lose":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Zap className="w-3 h-3 mr-1" />
            {t("customerIntel.cantLose")}
          </Badge>
        );
      case "potential-loyalist":
        return (
          <Badge className="bg-teal-100 text-teal-700 border-teal-200">
            <Target className="w-3 h-3 mr-1" />
            {t("customerIntel.potential")}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            {t("customerIntel.other")}
          </Badge>
        );
    }
  };

  const getEngagementColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  // 🎯 Show Alert Modal Helper
  const showAlert = (
    title: string,
    description: string,
    type: "success" | "error" | "warning" | "info"
  ) => {
    setAlertConfig({ title, description, type });
    setAlertOpen(true);
  };

  // 🎨 Get icon based on alert type
  const getAlertIcon = () => {
    switch (alertConfig.type) {
      case "success":
        return <CheckCircle className="w-12 h-12 text-green-600" />;
      case "error":
        return <XCircle className="w-12 h-12 text-red-600" />;
      case "warning":
        return <AlertCircle className="w-12 h-12 text-orange-600" />;
      case "info":
        return <AlertCircle className="w-12 h-12 text-blue-600" />;
    }
  };

  // 🎨 Get background color based on alert type
  const getAlertBg = () => {
    switch (alertConfig.type) {
      case "success":
        return "bg-green-50";
      case "error":
        return "bg-red-50";
      case "warning":
        return "bg-orange-50";
      case "info":
        return "bg-blue-50";
    }
  };

  const handleOpenChatWithCustomer = (customer: Customer) => {
    if (!onOpenChatWithCustomer) return;
    const email = (customer.email || "").trim();
    if (!email) return;
    onOpenChatWithCustomer({
      name: customer.name || "Customer",
      email,
      avatar: customer.avatar || undefined,
    });
  };

  // 🔥 BLOCK CUSTOMER ACTION
  const handleBlockCustomer = async (customerId: string, customerName: string) => {
    try {
      console.log(`🚫 Blocking customer: ${customerId}`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customerId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            status: "blocked",
            updatedBy: sessionUser?.id || "",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to block customer");
      }

      console.log(`✅ Customer blocked: ${customerId}`);
      
      await fetchCustomers(true);

      showAlert(
        "Customer Blocked Successfully!",
        `${customerName} has been blocked and can no longer access your store`,
        "warning"
      );
    } catch (error: any) {
      console.error("❌ Error blocking customer:", error);
      showAlert(
        "Failed to Block Customer",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // 🔥 DELETE CUSTOMER ACTION
  const deleteCustomerOnServer = async (customerId: string): Promise<void> => {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customerId}?deletedBy=${encodeURIComponent(String(sessionUser?.id || ""))}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || "Failed to delete customer");
    }
  };

  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    const previous = customersList;
    const previousTotal = customersTotal;
    const previousStats = serverListStats;
    const deletedRow = previous.find((c) => c.id === customerId);

    skipCustomersRealtimeReloadRef.current = true;

    setCustomersList((prev) => prev.filter((c) => c.id !== customerId));
    setCustomersTotal((prev) => Math.max(0, prev - 1));
    setServerListStats((prev) => {
      if (!prev) return prev;
      const row = deletedRow;
      const activeDrop = row?.status === "active" ? 1 : 0;
      return {
        ...prev,
        total: Math.max(0, prev.total - 1),
        active: Math.max(0, prev.active - activeDrop),
      };
    });
    setSelectedCustomers((prev) => prev.filter((id) => id !== customerId));
    removeAdminCustomersFromCaches([customerId], deletedRow ? [deletedRow] : []);

    const titleCaseName = (customerName || "Customer")
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    try {
      console.log(`🗑️ Deleting customer: ${customerId}`);
      await deleteCustomerOnServer(customerId);
      console.log(`✅ Customer deleted from backend: ${customerId}`);
      void broadcastCustomerRealtime({ event: "audience" });
      toast.success(`${titleCaseName} has been deleted`);
    } catch (error: any) {
      console.error("❌ Error deleting customer:", error);
      skipCustomersRealtimeReloadRef.current = false;
      invalidateAdminCustomersCache();
      setCustomersList(previous);
      setCustomersTotal(previousTotal);
      setServerListStats(previousStats);
      toast.error(error.message || "Failed to delete customer");
    }
  };

  // 🔥 BULK DELETE CUSTOMERS ACTION
  const handleBulkDelete = async () => {
    if (selectedCustomers.length === 0) return;

    const ids = [...selectedCustomers];
    const count = ids.length;
    const previous = customersList;
    const previousTotal = customersTotal;
    const previousStats = serverListStats;
    const deletedRows = previous.filter((c) => ids.includes(c.id));

    setConfirmDialog((d) => ({ ...d, isOpen: false }));
    skipCustomersRealtimeReloadRef.current = true;
    setCustomersList((prev) => prev.filter((c) => !ids.includes(c.id)));
    setCustomersTotal((prev) => Math.max(0, prev - count));
    setServerListStats((prev) => {
      if (!prev) return prev;
      let activeDrop = 0;
      for (const row of deletedRows) {
        if (row.status === "active") activeDrop += 1;
      }
      return {
        ...prev,
        total: Math.max(0, prev.total - count),
        active: Math.max(0, prev.active - activeDrop),
      };
    });
    setSelectedCustomers([]);
    // Cache patched after server confirms deletions (avoids double-adjust on partial failure).

    try {
      console.log(`🗑️ Bulk deleting ${count} customers...`);
      const results = await Promise.allSettled(ids.map((id) => deleteCustomerOnServer(id)));
      const failedIds = ids.filter((_, index) => results[index].status === "rejected");
      const successIds = ids.filter((id) => !failedIds.includes(id));

      if (failedIds.length > 0) {
        const failedRows = previous.filter((c) => failedIds.includes(c.id));
        setCustomersList((prev) => {
          const merged = [...prev];
          for (const row of failedRows) {
            if (!merged.some((c) => c.id === row.id)) merged.push(row);
          }
          return merged;
        });
        const successCount = successIds.length;
        if (successCount > 0) {
          setCustomersTotal(Math.max(0, previousTotal - successCount));
          setServerListStats((prev) => {
            if (!prev) return prev;
            let activeDrop = 0;
            for (const row of deletedRows) {
              if (!successIds.includes(row.id)) continue;
              if (row.status === "active") activeDrop += 1;
            }
            return {
              ...prev,
              total: Math.max(0, prev.total - successCount),
              active: Math.max(0, prev.active - activeDrop),
            };
          });
          removeAdminCustomersFromCaches(
            successIds,
            deletedRows.filter((r) => successIds.includes(r.id))
          );
        } else {
          skipCustomersRealtimeReloadRef.current = false;
          setCustomersTotal(previousTotal);
          setServerListStats(previousStats);
        }
        showAlert(
          "Partial Delete",
          successCount > 0
            ? `${successCount} customer(s) deleted. ${failedIds.length} could not be removed.`
            : "No customers could be deleted. Please try again.",
          successCount > 0 ? "warning" : "error"
        );
        return;
      }

      removeAdminCustomersFromCaches(ids, deletedRows);
      console.log(`✅ Bulk deleted ${count} customers from backend`);
      void broadcastCustomerRealtime({ event: "audience" });
      toast.success(`${count} customer(s) deleted`);
    } catch (error: any) {
      console.error("❌ Error bulk deleting customers:", error);
      skipCustomersRealtimeReloadRef.current = false;
      invalidateAdminCustomersCache();
      setCustomersList(previous);
      setCustomersTotal(previousTotal);
      setServerListStats(previousStats);
      showAlert(
        "Failed to Delete Customers",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // Show customer profile if viewing
  if (viewingCustomer) {
    return (
      <CustomerProfile
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        onMessageCustomer={
          onOpenChatWithCustomer
            ? () => {
                handleOpenChatWithCustomer(viewingCustomer);
                setViewingCustomer(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {t("customerIntel.title")}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {t("customerIntel.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selectedCustomers.length > 0 && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1">
                  {selectedCustomers.length} {t("customerIntel.selected")}
                </Badge>
              )}
              <Button
                type="button"
                className="bg-slate-900 hover:bg-slate-800 text-white gap-2"
                onClick={() => downloadCustomerCsv(visibleCustomers, "list")}
              >
                <Download className="w-4 h-4" />
                {t("customerIntel.export")}
              </Button>
            </div>
          </div>

          {/* Enhanced Stats Grid — same cell width as original 6-card row (1 column each in a 6-col grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <UsersIcon className="w-8 h-8 text-blue-600" />
                <ArrowUpRight className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {stats.total}
              </p>
              <p className="text-xs text-slate-600 mt-1">{t("customerIntel.totalCustomers")}</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <span className="text-xs font-semibold text-green-600">
                  {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {stats.active}
              </p>
              <p className="text-xs text-slate-600 mt-1">{t("customerIntel.active")}</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-emerald-600" />
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums flex items-baseline gap-1 flex-wrap">
                <span>{Math.round(stats.totalRevenue).toLocaleString()}</span>
                <span className="text-[9px] font-medium text-slate-500 leading-none align-baseline">
                  MMK
                </span>
              </p>
              <p className="text-xs text-slate-600 mt-1">{t("customerIntel.totalRevenue")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-6">
          <TabsList className="bg-transparent">
            <TabsTrigger value="list" className="data-[state=active]:bg-slate-100">
              <UsersIcon className="w-4 h-4 mr-2" />
              {t("customerIntel.customerList")}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-slate-100">
              <BarChart3 className="w-4 h-4 mr-2" />
              {t("customerIntel.analytics")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list" className="flex-1 flex flex-col overflow-hidden m-0">
          {/* Filters & Search */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <AdminClearableSearchInput
                  placeholder={t("customerIntel.searchPlaceholder")}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  className="bg-slate-50"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("customerIntel.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("customerIntel.allStatus")}</SelectItem>
                  <SelectItem value="active">{t("customerIntel.active")}</SelectItem>
                  <SelectItem value="inactive">{t("customerIntel.inactive")}</SelectItem>
                  <SelectItem value="blocked">{t("customerIntel.blocked")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("customerIntel.tier")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("customerIntel.allTiers")}</SelectItem>
                  <SelectItem value="vip">{t("customerIntel.vip")}</SelectItem>
                  <SelectItem value="regular">{t("customerIntel.regular")}</SelectItem>
                  <SelectItem value="new">{t("customerIntel.new")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSegment} onValueChange={setFilterSegment}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("customerIntel.segment")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("customerIntel.allSegments")}</SelectItem>
                  <SelectItem value="champions">{t("customerIntel.champions")}</SelectItem>
                  <SelectItem value="loyal">{t("customerIntel.loyal")}</SelectItem>
                  <SelectItem value="potential-loyalist">{t("customerIntel.potentialLoyalist")}</SelectItem>
                  <SelectItem value="at-risk">{t("customerIntel.atRisk")}</SelectItem>
                  <SelectItem value="cant-lose">{t("customerIntel.cantLose")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="bg-white rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          selectedCustomers.length === visibleCustomers.length &&
                          visibleCustomers.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>{t("customerIntel.customer")}</TableHead>
                    <TableHead>{t("customerIntel.segment")}</TableHead>
                    <TableHead>{t("customerIntel.orders")}</TableHead>
                    <TableHead>{t("customerIntel.avgOrder")}</TableHead>
                    <TableHead>{t("customerIntel.status")}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading skeleton rows
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="animate-pulse">
                        <TableCell>
                          <div className="w-4 h-4 bg-slate-200 rounded"></div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                            <div className="space-y-2">
                              <div className="h-4 bg-slate-200 rounded w-32"></div>
                              <div className="h-3 bg-slate-200 rounded w-24"></div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="h-4 bg-slate-200 rounded w-40"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-8 w-8 bg-slate-200 rounded"></div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : visibleCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <UsersIcon className="w-12 h-12 text-slate-300" />
                          <div>
                            <p className="text-sm font-medium text-slate-700">{t("customerIntel.noCustomersFound")}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {searchQuery || filterStatus !== "all" || filterTier !== "all" || filterSegment !== "all"
                                ? t("customerIntel.adjustFilters")
                                : t("customerIntel.addFirst")}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCustomers.includes(customer.id)}
                          onCheckedChange={() => toggleSelectCustomer(customer.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {customer.avatar && customer.avatar.trim() !== "" ? (
                            <img
                              src={customer.avatar}
                              alt={customer.name}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {(!customer.avatar || customer.avatar.trim() === "") && (
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-semibold text-blue-600">
                                {customer.name?.substring(0, 2).toUpperCase() || "??"}
                              </span>
                            </div>
                          )}
                          {/* Hidden fallback for broken images */}
                          <div 
                            style={{ display: 'none' }}
                            className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center"
                          >
                            <span className="text-sm font-semibold text-blue-600">
                              {customer.name?.substring(0, 2).toUpperCase() || "??"}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900">
                                {customer.name || "(No Name)"}
                              </p>
                              {getTierBadge(customer.tier)}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {customerContactSubtitle(customer) || "(No contact)"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getSegmentBadge(getCustomerSegment(customer))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">
                            {customer.totalOrders}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          <MmkInline value={customer.avgOrderValue || 0} />
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(customer.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setViewingCustomer(customer)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              {t("customerIntel.viewProfile")}
                            </DropdownMenuItem>
                            {onOpenChatWithCustomer && (
                              <DropdownMenuItem
                                onClick={() => handleOpenChatWithCustomer(customer)}
                                disabled={!(customer.email || "").trim()}
                              >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                {t("customerIntel.sendMessage")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleBlockCustomer(customer.id, customer.name)}>
                              <Ban className="w-4 h-4 mr-2" />
                              {t("customerIntel.blockCustomer")}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600" 
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  type: "delete",
                                  customerId: customer.id,
                                  customerName: customer.name,
                                });
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t("customerIntel.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>{t("customerIntel.perPage")}</span>
                <Select
                  value={String(customersPageSize)}
                  onValueChange={(v) => setCustomersPageSize(Number(v))}
                >
                  <SelectTrigger className="w-[80px] h-8">
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
                  {tr("customerIntel.pageOf", {
                    page: customersPage,
                    pages: Math.max(1, Math.ceil(customersTotal / customersPageSize) || 1),
                    total: customersTotal,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={customersPage <= 1 || isLoading}
                  onClick={() => setCustomersPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!customersHasMore || isLoading}
                  onClick={() => setCustomersPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 overflow-auto p-6 m-0">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">
              {t("customerIntel.analyticsOverview")}
            </h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Top Customers */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-600" />
                  {t("customerIntel.topByLtv")}
                </h4>
                <div className="space-y-3">
                  {customersList
                    .sort((a, b) => (b.lifetimeValue || 0) - (a.lifetimeValue || 0))
                    .slice(0, 5)
                    .map((customer, idx) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600">
                              {idx + 1}
                            </span>
                          </div>
                          {customer.avatar && customer.avatar.trim() !== "" ? (
                            <img
                              src={customer.avatar}
                              alt={customer.name}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {(!customer.avatar || customer.avatar.trim() === "") && (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-xs font-semibold text-blue-600">
                                {customer.name?.substring(0, 2).toUpperCase() || "??"}
                              </span>
                            </div>
                          )}
                          {/* Hidden fallback for broken images */}
                          <div 
                            style={{ display: 'none' }}
                            className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"
                          >
                            <span className="text-xs font-semibold text-blue-600">
                              {customer.name?.substring(0, 2).toUpperCase() || "??"}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {customer.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {customer.totalOrders} orders
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-700 flex justify-end">
                            <MmkInline value={customer.lifetimeValue || 0} />
                          </p>
                          <p className="text-xs text-slate-500">LTV</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Engagement Distribution */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  {t("customerIntel.engagementDistribution")}
                </h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">{t("customerIntel.highRange")}</span>
                      <span className="text-sm font-semibold text-green-600">
                        {tr("customerIntel.customerCount", {
                          count: customersList.filter((c) => (c.engagementScore || 0) >= 80).length,
                        })}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter((c) => (c.engagementScore || 0) >= 80).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">{t("customerIntel.mediumRange")}</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {
                          customersList.filter(
                            (c) => (c.engagementScore || 0) >= 60 && (c.engagementScore || 0) < 80
                          ).length
                        }{" "}
                        {t("customerIntel.customerMany")}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-blue-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter(
                              (c) => (c.engagementScore || 0) >= 60 && (c.engagementScore || 0) < 80
                            ).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">{t("customerIntel.lowRange")}</span>
                      <span className="text-sm font-semibold text-yellow-600">
                        {
                          customersList.filter(
                            (c) => (c.engagementScore || 0) >= 40 && (c.engagementScore || 0) < 60
                          ).length
                        }{" "}
                        {t("customerIntel.customerMany")}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-yellow-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter(
                              (c) => (c.engagementScore || 0) >= 40 && (c.engagementScore || 0) < 60
                            ).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">{t("customerIntel.criticalRange")}</span>
                      <span className="text-sm font-semibold text-red-600">
                        {tr("customerIntel.customerCount", {
                          count: customersList.filter((c) => (c.engagementScore || 0) < 40).length,
                        })}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-red-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter((c) => (c.engagementScore || 0) < 40).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue by Tier */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  {t("customerIntel.revenueByTier")}
                </h4>
                <div className="space-y-4">
                  {["vip", "regular", "new"].map((tier) => {
                    const tierCustomers = customersList.filter((c) => c.tier === tier);
                    const tierRevenue = tierCustomers.reduce(
                      (sum, c) => sum + (c.totalSpent || 0),
                      0
                    );
                    return (
                      <div key={tier} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getTierBadge(tier)}
                            <span className="text-sm text-slate-600">
                              ({tr("customerIntel.customerCount", { count: tierCustomers.length })})
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-emerald-700">
                            ${(tierRevenue || 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{
                              width: `${(tierRevenue / stats.totalRevenue) * 100}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Purchase Frequency */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  {t("customerIntel.purchaseFrequency")}
                </h4>
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-purple-900">
                        {t("customerIntel.highFrequency")}
                      </span>
                      <span className="text-sm font-semibold text-purple-600">
                        {customersList.filter((c) => (c.totalOrders || 0) >= 15).length}
                      </span>
                    </div>
                    <p className="text-xs text-purple-700">
                      {t("customerIntel.highFrequencyDesc")}
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-blue-900">
                        {t("customerIntel.mediumFrequency")}
                      </span>
                      <span className="text-sm font-semibold text-blue-600">
                        {
                          customersList.filter(
                            (c) => (c.totalOrders || 0) >= 5 && (c.totalOrders || 0) < 15
                          ).length
                        }
                      </span>
                    </div>
                    <p className="text-xs text-blue-700">{t("customerIntel.mediumFrequencyDesc")}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900">
                        {t("customerIntel.lowFrequency")}
                      </span>
                      <span className="text-sm font-semibold text-slate-600">
                        {customersList.filter((c) => (c.totalOrders || 0) < 5).length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">
                      {t("customerIntel.lowFrequencyDesc")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 🎯 Alert Modal - COMPACT BOXY DESIGN ~300x300px */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="max-w-[300px] w-[300px] h-[300px] bg-gradient-to-br from-slate-50 via-white to-slate-50 border-none shadow-2xl rounded-2xl">
          {/* X Button - Top Right Corner - RED */}
          <button
            onClick={() => setAlertOpen(false)}
            className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center transition-all hover:scale-110"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>

          {/* Content - Perfectly Centered in Square */}
          <div className="flex flex-col items-center justify-center text-center h-full px-6">
            {/* Icon with circular background - NO ANIMATION */}
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 shadow-lg ${
              alertConfig.type === "success" ? "bg-gradient-to-br from-green-100 to-green-50" :
              alertConfig.type === "error" ? "bg-gradient-to-br from-red-100 to-red-50" :
              alertConfig.type === "warning" ? "bg-gradient-to-br from-orange-100 to-orange-50" :
              "bg-gradient-to-br from-blue-100 to-blue-50"
            }`}>
              {/* HAND-DRAWN ANIMATED ICONS */}
              {alertConfig.type === "success" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-green-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M8 12.5l2.5 2.5L16 9" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="text-green-600"
                    style={{
                      strokeDasharray: 12,
                      strokeDashoffset: 12,
                      animation: 'drawCheck 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
              {alertConfig.type === "error" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-red-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M15 9l-6 6M9 9l6 6" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                    className="text-red-600"
                    style={{
                      strokeDasharray: 17,
                      strokeDashoffset: 17,
                      animation: 'drawX 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
              {alertConfig.type === "warning" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-orange-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M12 8v4M12 16h.01" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                    className="text-orange-600"
                    style={{
                      strokeDasharray: 8,
                      strokeDashoffset: 8,
                      animation: 'drawAlert 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
              {alertConfig.type === "info" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-blue-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M12 16v-4M12 8h.01" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                    className="text-blue-600"
                    style={{
                      strokeDasharray: 8,
                      strokeDashoffset: 8,
                      animation: 'drawAlert 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
            </div>

            {/* Title & Description - COMPACT */}
            <AlertDialogTitle className="text-lg font-bold text-slate-900 mb-1 leading-tight">
              {alertConfig.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 leading-snug">
              {alertConfig.description}
            </AlertDialogDescription>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🎯 SVG DRAWING ANIMATIONS */}
      <style>{`
        @keyframes drawCircle {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawCheck {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawX {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawAlert {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 🔥 CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={() => {
          if (confirmDialog.type === "delete" && confirmDialog.customerId && confirmDialog.customerName) {
            handleDeleteCustomer(confirmDialog.customerId, confirmDialog.customerName);
          } else if (confirmDialog.type === "bulkDelete") {
            handleBulkDelete();
          }
        }}
        title={
          confirmDialog.type === "delete"
            ? t("customerIntel.deleteCustomerTitle")
            : t("customerIntel.deleteMultipleTitle")
        }
        message={
          confirmDialog.type === "delete"
            ? tr("customerIntel.deleteCustomerMessage", { name: confirmDialog.customerName || "" })
            : tr("customerIntel.deleteMultipleMessage", { count: selectedCustomers.length })
        }
        type="error"
        confirmText={t("customerIntel.delete")}
        cancelText={t("common.cancel")}
      />
    </div>
  );
}