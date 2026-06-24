import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import type { LucideIcon } from "lucide-react";
import { Search, Download, Eye, Printer, Package, Clock, CheckCircle, XCircle, Calendar, DollarSign, ShoppingCart, X, Truck, CreditCard, MapPin, Phone, Mail, FileText, User, RefreshCw, BadgePercent, ChevronDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { AdminDateRangeFilterPopover } from "../AdminDateRangeFilterPopover";
import { useLanguage } from "../../contexts/LanguageContext";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { format, startOfDay, endOfDay } from "date-fns";
import { PrintInvoice } from "../PrintInvoice";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { publicAnonKey } from "../../../../utils/supabase/info";
import { API_BASE_URL } from "../../../utils/api-client";
import { ordersApi } from "../../../utils/api";
import { ApiError } from "../../../utils/api-client";
import {
  isKPayPaidOrderLike,
  pollKPayRefundAfterCancel,
} from "../../utils/kpayRefundPolling";
import { Skeleton } from "../ui/skeleton";
import {
  getCachedVendorOrders,
  getCachedVendorOrdersPage,
  getCachedVendorProductsAdmin,
  invalidateVendorOrdersCache,
  moduleCache,
  dispatchAdminProductsCachePatched,
  CACHE_KEYS,
  getCachedAdminAllProducts,
  ADMIN_PRODUCTS_INITIAL_PAGE_SIZE,
} from "../../utils/module-cache";
import { VendorAdminListingPagination } from "./VendorAdminListingPagination";
import { computeVendorCommissionEarned } from "../../utils/vendorCommissionEarned";
import {
  daysForVendorDashboardLabel,
  filterOrdersInRollingWindow,
  filterOrdersInPriorWindow,
  pctChangePriorWindow,
  vendorOrderDisplayTotal,
  isVendorOrderActive,
  isVendorOrderFinanciallyAccrued,
} from "../../utils/vendorAdminAnalytics";
import { vendorOrderGrandTotalDisplay } from "../../utils/vendorOrderTotals";
import {
  refreshAdminInventoryAfterOrderStatusPut,
  syncAdminInventoryCacheAfterOrderStatusChange,
  normalizeOrderLineParentProductId,
  isMainMarketplaceVendorName,
} from "../../utils/orderInventoryCacheSync";
import {
  normalizeAdminOrderStatusForBadge,
  normalizePaymentBadgeStatus,
  normalizeShippingBadgeStatus,
  derivePaymentStatusFromOrder,
  deriveShippingStatusFromOrder,
} from "../../utils/normalizeOrderBadgeStatus";
import { deriveOrderPaymentMethodKey } from "../../utils/orderPaymentMethod";
import {
  adminOrdersUpdatedStorageKey,
  notifyAdminOrdersUpdated,
} from "../../utils/adminOrdersRealtime";
import { useAdminOrdersResyncOnVisible } from "../../hooks/useAdminOrdersResyncOnVisible";
import { broadcastOrderStatusUpdate } from "../../utils/ordersRealtime";
import { PwaOrphanedOrdersRecovery } from "../PwaOrphanedOrdersRecovery";

function formatMmk(n: number): string {
  return `${Math.round(n).toLocaleString()} MMK`;
}

function MmkTiny({
  value,
  className = "",
  unitClassName = "text-[8px] leading-none align-super text-slate-400",
}: {
  value: number;
  className?: string;
  unitClassName?: string;
}) {
  return (
    <span className={`tabular-nums inline-flex items-baseline gap-0.5 ${className}`}>
      <span>{Math.round(Number(value) || 0).toLocaleString()}</span>
      <span className={unitClassName}>MMK</span>
    </span>
  );
}

async function fetchVendorContractCommissionPercent(slugOrId: string | undefined): Promise<number> {
  const key = slugOrId?.trim();
  if (!key) return 15;
  try {
    const res = await fetch(
      `${API_BASE_URL}/vendors/by-slug/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    if (!res.ok) return 15;
    const data = (await res.json()) as { vendor?: { commission?: unknown } };
    const c = data.vendor?.commission;
    if (c == null || c === "") return 15;
    const n = typeof c === "number" ? c : parseFloat(String(c));
    return Number.isFinite(n) && n >= 0 ? n : 15;
  } catch {
    return 15;
  }
}

type OrdersStatFilterKey = "revenue" | "commission" | "pending" | "fulfilled";

type OrderStatus = "pending" | "processing" | "fulfilled" | "cancelled" | "ready-to-ship";
type PaymentStatus = "paid" | "unpaid" | "refunded" | "pending_refund";
type ShippingStatus = "pending" | "shipped" | "delivered" | "cancelled";

interface Product {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image: string;
  sku: string;
}

interface OrderItem {
  id: string;
  orderNumber: string;
  date: string;
  createdAt?: string; // Full timestamp for accurate sorting
  customer: string;
  email: string;
  phone: string;
  total: number;
  subtotal?: number;
  discount?: number;
  items: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  products: Product[];
  shippingAddress: string;
  trackingNumber?: string;
  notes?: string;
  deliveryService?: string;
  deliveryServiceLogo?: string;
  paymentMethod?: "credit-card" | "cod" | "bank-transfer" | "kbz-qr" | "kbz-pwa";
  kpay?: unknown;
  refundStatus?: "success" | "already_refunded" | "processing" | "failed" | "";
  refundRequestNo?: string;
  refundAmount?: number;
  refundedAt?: string;
  vendor?: string;
  timeline: {
    status: string;
    date: string;
    time: string;
  }[];
  inventoryDeducted?: boolean;
}

function mapVendorMgmtApiOrders(apiOrders: any[]): OrderItem[] {
  return (apiOrders || []).map((order: any) => ({
    id: order.id,
    orderNumber: order.orderNumber || order.id,
    date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    createdAt: order.createdAt || new Date().toISOString(),
    customer: order.customerName || (typeof order.customer === 'string' ? order.customer : (order.customer?.fullName || order.customer?.name)) || 'Guest Customer',
    email: order.customerEmail || order.email || order.customer?.email || '',
    phone: order.customerPhone || order.phone || order.customer?.phone || '',
    total: vendorOrderGrandTotalDisplay({
      total: parseFloat(order.total) || 0,
      subtotal:
        order.subtotal != null && order.subtotal !== ""
          ? parseFloat(String(order.subtotal))
          : undefined,
      discount:
        order.discount != null && order.discount !== ""
          ? parseFloat(String(order.discount))
          : undefined,
    }),
    subtotal:
      order.subtotal != null && order.subtotal !== ""
        ? parseFloat(String(order.subtotal))
        : undefined,
    discount:
      order.discount != null && order.discount !== ""
        ? parseFloat(String(order.discount))
        : undefined,
    items: order.items?.length || 0,
    status: order.status || 'pending',
    paymentStatus: derivePaymentStatusFromOrder(order) as PaymentStatus,
    shippingStatus: deriveShippingStatusFromOrder(order),
    products: (order.items || []).map((item: any) => ({
      id: normalizeOrderLineParentProductId(item.productId ?? item.id),
      name: item.productName || item.name || 'Product',
      quantity: item.quantity || 1,
      price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price || '0').replace('$', '')) || 0,
      image: item.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop',
      sku: item.sku || 'N/A'
    })),
    shippingAddress: order.shippingAddress || '',
    trackingNumber: order.trackingNumber,
    notes: order.notes,
    deliveryService: order.deliveryService,
    deliveryServiceLogo: order.deliveryServiceLogo,
    paymentMethod: deriveOrderPaymentMethodKey(order),
    kpay: order.kpay,
    timeline: [
      { status: "Order Placed", date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '', time: order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : '' },
      ...(order.status !== 'pending' ? [{ status: "Processing", date: order.updatedAt ? new Date(order.updatedAt).toISOString().split('T')[0] : '', time: order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString() : '' }] : [])
    ],
    inventoryDeducted: order.inventoryDeducted,
    vendor: order.vendor ?? order.vendorName ?? "",
    refundStatus:
      (String(order.refundStatus || order.kpay?.refund?.status || "")
        .trim()
        .toLowerCase() as OrderItem["refundStatus"]) || "",
    refundRequestNo: order.refundRequestNo || order.kpay?.refund?.refundRequestNo || "",
    refundAmount: Number(order.refundAmount || order.kpay?.refund?.amount || 0) || 0,
    refundedAt: order.refundedAt || order.kpay?.refund?.refundedAt || order.kpay?.refund?.failedAt || "",
  }));
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const getStatusBadge = (status: OrderStatus | string) => {
  const variants = {
    pending: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock, label: "Pending" },
    processing: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Package, label: "Processing" },
    fulfilled: { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, label: "Fulfilled" },
    cancelled: { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: "Cancelled" },
    "ready-to-ship": { color: "bg-purple-100 text-purple-700 border-purple-200", icon: Package, label: "Ready to Ship" },
  } as const;

  const key = normalizeAdminOrderStatusForBadge(status);
  const variant = variants[key];
  const Icon = variant.icon;
  
  return (
    <Badge variant="secondary" className={`${variant.color} hover:${variant.color} border font-medium text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {variant.label}
    </Badge>
  );
};

const getPaymentBadge = (status: PaymentStatus | string) => {
  const variants = {
    paid: { color: "bg-green-100 text-green-700 border-green-200", label: "Paid" },
    unpaid: { color: "bg-amber-100 text-amber-700 border-amber-200", label: "Unpaid" },
    refunded: { color: "bg-slate-100 text-slate-700 border-slate-200", label: "Refunded" },
    "pending-refund": { color: "bg-orange-100 text-orange-800 border-orange-200", label: "Refund" },
  } as const;
  const key = normalizePaymentBadgeStatus(status);
  const v = variants[key] ?? variants.unpaid;
  return (
    <Badge variant="secondary" className={`${v.color} hover:${v.color} border text-xs`}>
      {v.label}
    </Badge>
  );
};

const getRefundBadge = (status?: string) => {
  const key = String(status || "").trim().toLowerCase();
  if (!key) return null;
  if (key === "success" || key === "already_refunded") {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px]">
        {key === "already_refunded" ? "Refund Already Done" : "Refund Success"}
      </Badge>
    );
  }
  if (key === "failed") {
    return (
      <Badge variant="secondary" className="bg-rose-100 text-rose-700 border-rose-200 text-[11px]">
        Refund Failed
      </Badge>
    );
  }
  if (key === "processing") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[11px]">
        Refund Processing
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 text-[11px]">
      Refund {key}
    </Badge>
  );
};

const getShippingBadge = (status: ShippingStatus | string) => {
  const variants = {
    pending: { color: "bg-slate-100 text-slate-700 border-slate-200", label: "Pending" },
    shipped: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "Shipped" },
    delivered: { color: "bg-green-100 text-green-700 border-green-200", label: "Delivered" },
    cancelled: { color: "bg-red-100 text-red-700 border-red-200", label: "Cancel" },
  } as const;
  const key = normalizeShippingBadgeStatus(status);
  const v = variants[key] ?? variants.pending;
  return (
    <Badge variant="secondary" className={`${v.color} hover:${v.color} border text-xs`}>
      {v.label}
    </Badge>
  );
};

interface VendorAdminOrderManagementProps {
  vendorId: string;
  /** Contract commission % from `vendors/by-slug`; falls back to `vendorId`. */
  vendorStoreSlug?: string;
}

export function VendorAdminOrderManagement({ vendorId, vendorStoreSlug }: VendorAdminOrderManagementProps) {
  const { t } = useLanguage();
  const dateLabel = (value: string) => {
    if (value === "Last 7 days") return t("vendorAdmin.dashboard.last7");
    if (value === "Last 90 days") return t("vendorAdmin.dashboard.last90");
    if (value === "Last year") return t("vendorAdmin.dashboard.lastYear");
    return t("vendorAdmin.dashboard.last30");
  };
  const [selectedTab, setSelectedTab] = useState("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [orderDateRange, setOrderDateRange] = useState<DateRange | undefined>(undefined);
  const [orderDatePickerOpen, setOrderDatePickerOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("processing");
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [rawVendorOrders, setRawVendorOrders] = useState<any[]>([]);
  const [vendorProducts, setVendorProducts] = useState<any[]>([]);
  const [vendorCommissionPct, setVendorCommissionPct] = useState(15);
  const [isLoading, setIsLoading] = useState(
    () =>
      !moduleCache.peek(
        CACHE_KEYS.vendorOrdersPage(vendorId, 1, ADMIN_PRODUCTS_INITIAL_PAGE_SIZE, "", "all", "all", "newest", "", "")
      )
  );
  const [listRefreshing, setListRefreshing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showBulkInvoices, setShowBulkInvoices] = useState(false);
  const [ordersListPage, setOrdersListPage] = useState(1);
  const [ordersListPageSize, setOrdersListPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
  const [serverTotalOrders, setServerTotalOrders] = useState(0);
  const [ordersRefreshTick, setOrdersRefreshTick] = useState(0);
  const [statDateFilters, setStatDateFilters] = useState({
    revenue: "Last 30 days",
    commission: "Last 30 days",
    pending: "Last 30 days",
    fulfilled: "Last 30 days",
  });
  const vendorOrdersSurfaceActiveRef = useRef(true);

  useEffect(() => {
    vendorOrdersSurfaceActiveRef.current = true;
    return () => {
      vendorOrdersSurfaceActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadOrders(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    vendorId,
    ordersListPage,
    ordersListPageSize,
    searchQuery,
    statusFilter,
    paymentFilter,
    sortOrder,
    orderDateRange?.from?.getTime(),
    orderDateRange?.to?.getTime(),
  ]);

  useEffect(() => {
    if (ordersRefreshTick === 0) return;
    void loadOrders(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersRefreshTick]);

  useEffect(() => {
    const bump = () => setOrdersRefreshTick((n) => n + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== adminOrdersUpdatedStorageKey()) return;
      bump();
    };
    window.addEventListener("adminOrdersUpdated", bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("adminOrdersUpdated", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useAdminOrdersResyncOnVisible(() => {
    setOrdersRefreshTick((n) => n + 1);
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prodRes, pct] = await Promise.all([
          getCachedVendorProductsAdmin(vendorId, false),
          fetchVendorContractCommissionPercent(vendorStoreSlug || vendorId),
        ]);
        if (cancelled) return;
        const body = prodRes as { products?: any[] };
        setVendorProducts(Array.isArray(body.products) ? body.products : []);
        setVendorCommissionPct(pct);
      } catch {
        if (!cancelled) {
          setVendorProducts([]);
          setVendorCommissionPct(15);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, vendorStoreSlug]);

  const loadOrders = async (forceRefresh = false) => {
    setListRefreshing(forceRefresh);
    try {
      const from = orderDateRange?.from ? startOfDay(orderDateRange.from).toISOString() : "";
      const to = orderDateRange?.to ? endOfDay(orderDateRange.to).toISOString() : "";
      const pageKey = CACHE_KEYS.vendorOrdersPage(
        vendorId,
        ordersListPage,
        ordersListPageSize,
        searchQuery.trim().toLowerCase(),
        statusFilter,
        paymentFilter,
        sortOrder,
        from,
        to
      );
      if (!moduleCache.peek(pageKey)) {
        setIsLoading(true);
      }
      console.log(`📦 Loading orders for vendor: ${vendorId}`);
      const data = await getCachedVendorOrdersPage(
        vendorId,
        {
          page: ordersListPage,
          pageSize: ordersListPageSize,
          q: searchQuery.trim(),
          status: statusFilter,
          payment: paymentFilter,
          sort: sortOrder,
          from,
          to,
        },
        forceRefresh
      );
      console.log(`📊 Received ${data.orders.length} paged orders from API`);
      const transformedOrders = mapVendorMgmtApiOrders(data.orders);
      console.log(`✅ Transformed ${transformedOrders.length} paged orders`);
      setRawVendorOrders(data.orders);
      setOrders(transformedOrders);
      setServerTotalOrders(Number(data.total || transformedOrders.length));
      const hasNextPage = Number(data.total || 0) > ordersListPage * ordersListPageSize;
      if (hasNextPage) {
        void getCachedVendorOrdersPage(
          vendorId,
          {
            page: ordersListPage + 1,
            pageSize: ordersListPageSize,
            q: searchQuery.trim(),
            status: statusFilter,
            payment: paymentFilter,
            sort: sortOrder,
            from,
            to,
          },
          false
        ).catch(() => undefined);
      }
      // Silent success path: keep tab revisits instant without noisy toasts.
    } catch (error: any) {
      // 🔇 SUPPRESS WARMUP ERRORS - these are expected during server startup
      const isWarmupError = error.name === 'TypeError' && error.message === 'Failed to fetch';
      
      if (!isWarmupError) {
        console.error("❌ API Request Failed (/orders):", error);
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      } else {
        console.warn("⚠️ Server warming up, orders will load once ready...");
      }
      
      // Only show toast for non-warmup errors
      if (!isWarmupError) {
        toast.error(`Failed to load orders: ${error.message || 'Unknown error'}`);
      }
      
      setOrders([]);
      setRawVendorOrders([]);
    } finally {
      setIsLoading(false);
      setListRefreshing(false);
    }
  };

  const orderPageKpis = useMemo(() => {
    const endMs = Date.now();
    const activePool = rawVendorOrders.filter(isVendorOrderActive);
    const accruedPool = rawVendorOrders.filter(isVendorOrderFinanciallyAccrued);

    const revDays = daysForVendorDashboardLabel(statDateFilters.revenue);
    const revCurrent = filterOrdersInRollingWindow(accruedPool, revDays, endMs);
    const revPrev = filterOrdersInPriorWindow(accruedPool, revDays, endMs - revDays * 86400000);
    const totalRevenueWindow = revCurrent.reduce((s, o) => s + vendorOrderDisplayTotal(o), 0);
    const revenuePrevSum = revPrev.reduce((s, o) => s + vendorOrderDisplayTotal(o), 0);
    const revenueChange = pctChangePriorWindow(totalRevenueWindow, revenuePrevSum);

    const commDays = daysForVendorDashboardLabel(statDateFilters.commission);
    const commCurrent = filterOrdersInRollingWindow(activePool, commDays, endMs);
    const commPrev = filterOrdersInPriorWindow(activePool, commDays, endMs - commDays * 86400000);
    const commissionCurrent = computeVendorCommissionEarned(
      commCurrent,
      vendorProducts,
      vendorId,
      vendorCommissionPct
    );
    const commissionPrev = computeVendorCommissionEarned(
      commPrev,
      vendorProducts,
      vendorId,
      vendorCommissionPct
    );
    const commissionChange = pctChangePriorWindow(commissionCurrent, commissionPrev);

    const pendDays = daysForVendorDashboardLabel(statDateFilters.pending);
    const pendCurrent = filterOrdersInRollingWindow(rawVendorOrders, pendDays, endMs);
    const pendPrev = filterOrdersInPriorWindow(rawVendorOrders, pendDays, endMs - pendDays * 86400000);
    const pendingCount = pendCurrent.filter(
      (o) => String(o?.status ?? "").toLowerCase() === "pending"
    ).length;
    const pendingPrevCount = pendPrev.filter(
      (o) => String(o?.status ?? "").toLowerCase() === "pending"
    ).length;
    const pendingChange = pctChangePriorWindow(pendingCount, pendingPrevCount);

    const fulDays = daysForVendorDashboardLabel(statDateFilters.fulfilled);
    const fulCurrent = filterOrdersInRollingWindow(rawVendorOrders, fulDays, endMs);
    const fulPrev = filterOrdersInPriorWindow(rawVendorOrders, fulDays, endMs - fulDays * 86400000);
    const fulfilledCount = fulCurrent.filter(
      (o) => String(o?.status ?? "").toLowerCase() === "fulfilled"
    ).length;
    const fulfilledPrevCount = fulPrev.filter(
      (o) => String(o?.status ?? "").toLowerCase() === "fulfilled"
    ).length;
    const fulfilledChange = pctChangePriorWindow(fulfilledCount, fulfilledPrevCount);

    return {
      totalRevenueWindow,
      revenueChange,
      commissionCurrent,
      commissionChange,
      pendingCount,
      pendingChange,
      fulfilledCount,
      fulfilledChange,
    };
  }, [rawVendorOrders, vendorProducts, vendorId, vendorCommissionPct, statDateFilters]);

  const filteredOrders = useMemo(() => orders, [orders]);

  useEffect(() => {
    setOrdersListPage(1);
  }, [searchQuery, statusFilter, paymentFilter, orderDateRange, sortOrder]);

  const pagedFilteredOrders = useMemo(() => {
    return filteredOrders;
  }, [filteredOrders]);

  const ordersPageIds = pagedFilteredOrders.map((o) => o.id);

  // Calculate filtered totals - 🔥 Exclude cancelled orders from revenue
  const filteredTotalRevenue = filteredOrders
    .filter(order => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.total, 0);
  const filteredTotalOrders = filteredOrders.length;
  const filteredAvgOrderValue = filteredTotalOrders > 0 ? filteredTotalRevenue / filteredTotalOrders : 0;
  const filteredStatusBreakdown = {
    pending: filteredOrders.filter(o => o.status === "pending").length,
    processing: filteredOrders.filter(o => o.status === "processing").length,
    fulfilled: filteredOrders.filter(o => o.status === "fulfilled").length,
    cancelled: filteredOrders.filter(o => o.status === "cancelled").length,
  };

  // Revenue chart data from filtered orders
  const generateRevenueData = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date;
    });

    return last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayOrders = filteredOrders.filter(o => o.date === dateStr);
      // 🔥 Only count revenue from non-cancelled orders
      const dayRevenue = dayOrders
        .filter(o => o.status !== "cancelled")
        .reduce((sum, o) => sum + o.total, 0);
      return {
        date: format(date, "MMM dd"),
        orders: dayOrders.length,
        revenue: dayRevenue
      };
    });
  };

  const revenueChartData = generateRevenueData();

  // Status breakdown pie chart data
  const statusPieData = [
    { name: "Pending", value: filteredStatusBreakdown.pending, color: COLORS[2] },
    { name: "Processing", value: filteredStatusBreakdown.processing, color: COLORS[0] },
    { name: "Fulfilled", value: filteredStatusBreakdown.fulfilled, color: COLORS[1] },
    { name: "Cancelled", value: filteredStatusBreakdown.cancelled, color: COLORS[3] },
  ].filter(item => item.value > 0);

  const toggleSelectAll = () => {
    if (ordersPageIds.length > 0 && ordersPageIds.every((id) => selectedOrders.includes(id))) {
      setSelectedOrders((prev) => prev.filter((id) => !ordersPageIds.includes(id)));
    } else {
      setSelectedOrders((prev) => Array.from(new Set([...prev, ...ordersPageIds])));
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrders(prev =>
      prev.includes(id) ? prev.filter(order => order !== id) : [...prev, id]
    );
  };

  const handleBulkStatusUpdate = () => {
    setIsStatusDialogOpen(true);
  };

  const handleBulkPrint = () => {
    setIsPrintDialogOpen(true);
  };

  const executeBulkPrint = () => {
    console.log("Printing invoices for orders:", selectedOrders);
    setIsPrintDialogOpen(false);
    
    setShowBulkInvoices(true);
    
    setTimeout(() => {
      window.print();
      
      setTimeout(() => {
        setShowBulkInvoices(false);
        setSelectedOrders([]);
      }, 500);
    }, 100);
  };

  const saveBulkStatusUpdate = async () => {
    const previousOrders = [...orders];
    
    setOrders(prevOrders =>
      prevOrders.map(order =>
        selectedOrders.includes(order.id) ? { ...order, status: bulkStatus } : order
      )
    );
    
    setIsStatusDialogOpen(false);
    const updatedCount = selectedOrders.length;
    const orderIds = [...selectedOrders];
    setSelectedOrders([]);
    
    toast.success(`Updated ${updatedCount} order${updatedCount > 1 ? 's' : ''} to ${bulkStatus}`);

    try {
      await Promise.all(
        orderIds.map(orderId =>
          ordersApi.update(orderId, { status: bulkStatus })
        )
      );
      const peeked = moduleCache.peek<unknown[]>(CACHE_KEYS.ADMIN_PRODUCTS);
      const anyVendorShopOrder = orderIds.some((id) => {
        const o = previousOrders.find((x) => x.id === id);
        return o && !isMainMarketplaceVendorName(o.vendor);
      });
      if (!peeked || !Array.isArray(peeked) || peeked.length === 0) {
        try {
          await getCachedAdminAllProducts(true);
        } catch (e) {
          console.warn("[inventory] Vendor bulk: could not refresh admin products", e);
        }
      } else if (anyVendorShopOrder) {
        try {
          await getCachedAdminAllProducts(true);
        } catch (e) {
          console.warn("[inventory] Vendor bulk: refetch failed; applying in-memory mirror", e);
          for (const orderId of orderIds) {
            const o = previousOrders.find((x) => x.id === orderId);
            if (o) {
              syncAdminInventoryCacheAfterOrderStatusChange(
                {
                  status: o.status,
                  inventoryDeducted: o.inventoryDeducted,
                  vendor: o.vendor,
                  products: o.products,
                },
                bulkStatus,
                { skipDispatch: true }
              );
            }
          }
        }
      } else {
        for (const orderId of orderIds) {
          const o = previousOrders.find((x) => x.id === orderId);
          if (o) {
            syncAdminInventoryCacheAfterOrderStatusChange(
              {
                status: o.status,
                inventoryDeducted: o.inventoryDeducted,
                vendor: o.vendor,
                products: o.products,
              },
              bulkStatus,
              { skipDispatch: true }
            );
          }
        }
      }
      dispatchAdminProductsCachePatched();
      invalidateVendorOrdersCache(vendorId);
    } catch (error) {
      console.error("Failed to update orders:", error);
      setOrders(previousOrders);
      toast.error("Failed to update orders on server");
    }
  };

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    const orderBeingUpdated = orders.find((o) => o.id === orderId);
    const wasNotCancelled = orderBeingUpdated?.status !== "cancelled";
    const isNowCancelled = newStatus === "cancelled";
    const previousOrders = [...orders];

    setOrders((prevOrders) =>
      prevOrders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: newStatus,
              ...(isNowCancelled
                ? {
                    paymentStatus:
                      order.paymentStatus === "refunded"
                        ? "refunded"
                        : ("pending_refund" as PaymentStatus),
                    shippingStatus: "cancelled" as ShippingStatus,
                    refundStatus: order.refundStatus || "processing",
                  }
                : {}),
            }
          : order
      )
    );

    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              ...(isNowCancelled
                ? {
                    paymentStatus:
                      prev.paymentStatus === "refunded" ? "refunded" : "pending_refund",
                    shippingStatus: "cancelled",
                    refundStatus: prev.refundStatus || "processing",
                  }
                : {}),
            }
          : prev
      );
    }

    if (wasNotCancelled && isNowCancelled) {
      toast.message("Order cancelled", {
        duration: 2500,
        description: "KBZPay refund may take a moment to confirm.",
      });
    } else {
      toast.success(`Order status updated to ${newStatus}`);
    }

    void (async () => {
      try {
        const result = (await ordersApi.update(orderId, { status: newStatus })) as {
          success?: boolean;
          refundPending?: boolean;
          message?: string;
          order?: {
            inventoryDeducted?: boolean;
            paymentStatus?: string;
            shippingStatus?: string;
            kpay?: { refund?: { status?: string } };
          };
        };
        const srv = result?.order;
        if (srv && vendorOrdersSurfaceActiveRef.current) {
          const mapped = mapVendorMgmtApiOrders([{ ...srv, id: orderId, status: newStatus }])[0];
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, ...mapped, status: newStatus } : o))
          );
          if (selectedOrder?.id === orderId) {
            setSelectedOrder((s) =>
              s?.id === orderId ? { ...s, ...mapped, status: newStatus } : s
            );
          }
        }
        if (orderBeingUpdated) {
          await refreshAdminInventoryAfterOrderStatusPut(
            {
              status: orderBeingUpdated.status,
              inventoryDeducted: orderBeingUpdated.inventoryDeducted,
              vendor: orderBeingUpdated.vendor,
              products: orderBeingUpdated.products,
            },
            newStatus
          );
        }
        if (wasNotCancelled && isNowCancelled) {
          if (result?.refundPending) {
            toast.message("Order cancelled", {
              duration: 6000,
              description:
                result.message ||
                "KBZPay refund is still processing. Status will update automatically.",
            });
          }
          if (isKPayPaidOrderLike(orderBeingUpdated)) {
            pollKPayRefundAfterCancel({
              orderId,
              orderNumber: orderBeingUpdated?.orderNumber,
              shouldContinue: () => vendorOrdersSurfaceActiveRef.current,
              onSuccess: (orderData) => {
                const mapped = mapVendorMgmtApiOrders([
                  { ...orderData, id: orderId, status: "cancelled" },
                ])[0];
                setOrders((prev) =>
                  prev.map((o) =>
                    o.id === orderId ? { ...o, ...mapped, status: "cancelled" } : o
                  )
                );
                setSelectedOrder((s) =>
                  s?.id === orderId ? { ...s, ...mapped, status: "cancelled" } : s
                );
                invalidateVendorOrdersCache(vendorId);
              },
            });
          }
        }
        invalidateVendorOrdersCache(vendorId);
        notifyAdminOrdersUpdated("vendor-admin-order-updated");
        void broadcastOrderStatusUpdate({
          orderId,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to update order:", error);
        const detail =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown error";
        if (vendorOrdersSurfaceActiveRef.current) {
          setOrders(previousOrders);
          if (selectedOrder?.id === orderId) {
            const prev = previousOrders.find((o) => o.id === orderId);
            if (prev) setSelectedOrder(prev);
          }
          toast.error("Failed to update order on server", {
            description: detail,
            duration: 8000,
          });
        }
      }
    })();
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setOrderDateRange(undefined);
  };

  const hasActiveFilters =
    searchQuery ||
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    orderDateRange?.from ||
    orderDateRange?.to;

  const exportOrders = () => {
    const headers = ["Order Number", "Date", "Customer", "Email", "Total", "Items", "Status", "Payment", "Shipping"];
    const csvContent = [
      headers.join(","),
      ...filteredOrders.map(o => 
        [o.orderNumber, o.date, o.customer, o.email, o.total, o.items, o.status, o.paymentStatus, o.shippingStatus].join(",")
      )
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor_orders_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  // Single Order Detail View
  if (selectedOrder) {
    return (
      <div className="space-y-6">
        {/* Print invoices - hidden, only shown during print */}
        {showBulkInvoices && (
          <div className="print-only">
            {selectedOrders.map(orderId => {
              const order = orders.find(o => o.id === orderId);
              if (!order) return null;
              // Transform to PrintInvoice format
              const printOrder = {
                id: order.id,
                orderNumber: order.orderNumber,
                date: order.date,
                customer: order.customer,
                email: order.email,
                vendor: 'Vendor Store', // Add vendor field
                total: order.total,
                items: order.items,
                status: order.status,
                paymentStatus: order.paymentStatus,
                shippingStatus: order.shippingStatus
              };
              return <PrintInvoice key={order.id} orders={[printOrder]} />;
            })}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedOrder(null)}
            >
              <X className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Order {selectedOrder.orderNumber}</h1>
              <p className="text-sm text-slate-600">{selectedOrder.date}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled
              className="opacity-50 cursor-not-allowed"
              title="Invoice printing is disabled for vendor accounts"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Invoice
            </Button>
          </div>
        </div>

        {/* Order Status */}
        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Order Status</Label>
                <div className="pt-2">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="flex-1">
                <Label>Payment Status</Label>
                <div className="pt-2 flex flex-col gap-1">
                  {getPaymentBadge(selectedOrder.paymentStatus)}
                  {getRefundBadge(selectedOrder.refundStatus)}
                </div>
              </div>
              <div className="flex-1">
                <Label>Shipping Status</Label>
                <div className="pt-2">{getShippingBadge(selectedOrder.shippingStatus)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-500">Name</Label>
                <p className="font-medium">{typeof selectedOrder.customer === 'string' ? selectedOrder.customer : (selectedOrder.customer?.fullName || selectedOrder.customer?.name || 'Guest Customer')}</p>
              </div>
              {selectedOrder.email && (
                <div>
                  <Label className="text-xs text-slate-500">Email</Label>
                  <p className="font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {selectedOrder.email}
                  </p>
                </div>
              )}
              {selectedOrder.phone && (
                <div>
                  <Label className="text-xs text-slate-500">Phone</Label>
                  <p className="font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {selectedOrder.phone}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Shipping
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-500">Address</Label>
                <p className="text-sm">{selectedOrder.shippingAddress || "No address provided"}</p>
              </div>
              {selectedOrder.deliveryService && (
                <div>
                  <Label className="text-xs text-slate-500">Delivery Service</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {selectedOrder.deliveryServiceLogo && (
                      <img src={selectedOrder.deliveryServiceLogo} alt="" className="w-6 h-6 rounded" />
                    )}
                    <p className="font-medium">{selectedOrder.deliveryService}</p>
                  </div>
                </div>
              )}
              {selectedOrder.trackingNumber && (
                <div>
                  <Label className="text-xs text-slate-500">Tracking Number</Label>
                  <p className="font-medium font-mono text-sm">{selectedOrder.trackingNumber}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-medium">
                  {formatMmk(selectedOrder.subtotal ?? selectedOrder.total)}
                </span>
              </div>
              {(selectedOrder.discount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-700">
                    -{formatMmk(selectedOrder.discount ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Shipping</span>
                <span className="font-medium">{formatMmk(0)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">
                  {formatMmk(vendorOrderGrandTotalDisplay(selectedOrder))}
                </span>
              </div>
              {selectedOrder.paymentMethod && (
                <div>
                  <Label className="text-xs text-slate-500">Payment Method</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">
                      {selectedOrder.paymentMethod === "cod" ? "Cash on Delivery" :
                       selectedOrder.paymentMethod === "bank-transfer" ? "Bank Transfer" :
                       "Credit/Debit Card"}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Items */}
        <Card>
          <CardHeader>
            <CardTitle>Items ({selectedOrder.items})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedOrder.products.map((product) => (
                <div key={product.id} className="flex items-center gap-4 pb-4 border-b last:border-0">
                  <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-sm text-slate-600">SKU: {product.sku}</p>
                    <p className="text-sm text-slate-600">Qty: {product.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{formatMmk(product.price * product.quantity)}</p>
                    <p className="text-sm text-slate-600">{formatMmk(product.price)} each</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        {selectedOrder.timeline && selectedOrder.timeline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Order Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedOrder.timeline.map((event, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 bg-blue-600 rounded-full" />
                      {index !== selectedOrder.timeline.length - 1 && (
                        <div className="w-0.5 h-full bg-slate-200 mt-2" />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className="font-medium">{event.status}</p>
                      <p className="text-sm text-slate-600">{event.date} at {event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {selectedOrder.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700">{selectedOrder.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Main Orders List View
  const StatCard = ({
    title,
    value,
    change,
    icon: Icon,
    iconBg,
    iconColor,
    filterKey,
  }: {
    title: string;
    value: ReactNode;
    change: number;
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    filterKey: OrdersStatFilterKey;
  }) => (
    <Card className="p-5 border-slate-200 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600 font-medium mb-1">{title}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-4"
              >
                {dateLabel(statDateFilters[filterKey])} <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => setStatDateFilters({ ...statDateFilters, [filterKey]: "Last 7 days" })}
              >
                {t("vendorAdmin.dashboard.last7")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setStatDateFilters({ ...statDateFilters, [filterKey]: "Last 30 days" })}
              >
                {t("vendorAdmin.dashboard.last30")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setStatDateFilters({ ...statDateFilters, [filterKey]: "Last 90 days" })}
              >
                {t("vendorAdmin.dashboard.last90")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setStatDateFilters({ ...statDateFilters, [filterKey]: "Last year" })}
              >
                {t("vendorAdmin.dashboard.lastYear")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xl font-bold text-slate-900 mb-2">{value}</p>
          <div className="flex items-center gap-1">
            {change === 0 ? (
              <span className="text-xs font-medium text-slate-500">{t("vendorAdmin.dashboard.noChange")}</span>
            ) : (
              <>
                {change > 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-green-600 shrink-0" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                )}
                <span
                  className={`text-xs font-medium ${change > 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {change > 0 ? "+" : ""}
                  {change}%
                </span>
              </>
            )}
          </div>
        </div>
        <div className={`${iconBg} p-2 rounded-full ml-4 flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6 p-8">
      {/* Print invoices - hidden, only shown during print */}
      {showBulkInvoices && (
        <div className="print-only">
          {selectedOrders.map(orderId => {
            const order = orders.find(o => o.id === orderId);
            if (!order) return null;
            // Transform to PrintInvoice format
            const printOrder = {
              id: order.id,
              orderNumber: order.orderNumber,
              date: order.date,
              customer: order.customer,
              email: order.email,
              vendor: 'Vendor Store', // Add vendor field
              total: order.total,
              items: order.items,
              status: order.status,
              paymentStatus: order.paymentStatus,
              shippingStatus: order.shippingStatus
            };
            return <PrintInvoice key={order.id} orders={[printOrder]} />;
          })}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("orders.title")}</h1>
        <p className="text-sm text-slate-600">{t("orders.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title={t("orders.totalRevenue")}
          value={<MmkTiny value={orderPageKpis.totalRevenueWindow} unitClassName="text-[7px] leading-none align-super text-slate-400" />}
          change={orderPageKpis.revenueChange}
          icon={DollarSign}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          filterKey="revenue"
        />
        <StatCard
          title={t("finances.commissionEarned")}
          value={<MmkTiny value={orderPageKpis.commissionCurrent} unitClassName="text-[7px] leading-none align-super text-slate-400" />}
          change={orderPageKpis.commissionChange}
          icon={BadgePercent}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          filterKey="commission"
        />
        <StatCard
          title={t("orders.pending")}
          value={orderPageKpis.pendingCount}
          change={orderPageKpis.pendingChange}
          icon={Clock}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          filterKey="pending"
        />
        <StatCard
          title={t("orders.fulfilled")}
          value={orderPageKpis.fulfilledCount}
          change={orderPageKpis.fulfilledChange}
          icon={CheckCircle}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          filterKey="fulfilled"
        />
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="orders">{t("orders.ordersTab")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("orders.analyticsTab")}</TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <PwaOrphanedOrdersRecovery
            vendorId={vendorStoreSlug || vendorId}
            searchQuery={searchQuery}
            onRecovered={() => void loadOrders(true)}
            compact
          />
          {/* Toolbar */}
          <Card className="mb-4 border-slate-200 shadow-sm">
            <div className="p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-slate-900">{t("orders.allOrders")} ({serverTotalOrders})</h3>
                <div className="flex items-center gap-2">
                  {selectedOrders.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleBulkStatusUpdate} disabled className="opacity-50 cursor-not-allowed">
                        <Package className="w-4 h-4 mr-2" />
                        {t("orders.updateStatus")} ({selectedOrders.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleBulkPrint} disabled className="opacity-50 cursor-not-allowed">
                        <Printer className="w-4 h-4 mr-2" />
                        {t("orders.print")} ({selectedOrders.length})
                      </Button>
                    </>
                  )}
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      <X className="w-4 h-4 mr-2" />
                      {t("orders.clearFilters")}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={exportOrders} disabled className="opacity-50 cursor-not-allowed">
                    <Download className="w-4 h-4 mr-2" />
                    {t("orders.export")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={listRefreshing || isLoading}
                    onClick={() => loadOrders(true)}
                    className="border-slate-300"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${listRefreshing ? "animate-spin" : ""}`} />
                    {t("common.refresh")}
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder={t("orders.searchPlaceholder")}
                    className="pl-10 border-slate-300"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as "newest" | "oldest")}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder={t("orders.sortBy")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{t("orders.newestFirst")}</SelectItem>
                    <SelectItem value="oldest">{t("orders.oldestFirst")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder={t("orders.status")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("orders.allStatus")}</SelectItem>
                    <SelectItem value="pending">{t("orders.pending")}</SelectItem>
                    <SelectItem value="processing">{t("orders.processing")}</SelectItem>
                    <SelectItem value="fulfilled">{t("orders.fulfilled")}</SelectItem>
                    <SelectItem value="cancelled">{t("orders.cancelled")}</SelectItem>
                    <SelectItem value="ready-to-ship">{t("orders.readyToShip")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder={t("orders.payment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("orders.allPayment")}</SelectItem>
                    <SelectItem value="paid">{t("orders.paid")}</SelectItem>
                    <SelectItem value="unpaid">{t("orders.unpaid")}</SelectItem>
                    <SelectItem value="pending_refund">{t("orders.refundPending")}</SelectItem>
                    <SelectItem value="refunded">{t("orders.refunded")}</SelectItem>
                  </SelectContent>
                </Select>
                <AdminDateRangeFilterPopover
                  value={orderDateRange}
                  onChange={setOrderDateRange}
                  hintText={t("admin.dateFilter.hintOrders")}
                  open={orderDatePickerOpen}
                  onOpenChange={setOrderDatePickerOpen}
                  align="start"
                >
                  <Button variant="outline" className="w-full sm:w-auto justify-start border-slate-300">
                    <Calendar className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate text-left">
                      {!orderDateRange?.from
                        ? t("finances.allTime")
                        : !orderDateRange.to
                          ? t("finances.selectEndDate")
                          : `${format(orderDateRange.from, "MMM d, yyyy")} – ${format(orderDateRange.to, "MMM d, yyyy")}`}
                    </span>
                  </Button>
                </AdminDateRangeFilterPopover>
              </div>
            </div>
          </Card>

          {/* Orders Table */}
          <Card className="border-slate-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4">
                      <Checkbox
                        checked={
                          ordersPageIds.length > 0 &&
                          ordersPageIds.every((id) => selectedOrders.includes(id))
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.order")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.date")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.customer")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.total")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.status")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.payment")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.shipping")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="py-4">
                        <div className="space-y-3">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-4 py-3">
                              <Skeleton className="h-4 w-4" />
                              <Skeleton className="h-10 w-24" />
                              <Skeleton className="h-4 w-20" />
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-6 w-20" />
                              <Skeleton className="h-6 w-16" />
                              <Skeleton className="h-6 w-20" />
                              <Skeleton className="h-8 w-16" />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        {t("orders.noOrdersFound")}
                      </td>
                    </tr>
                  ) : (
                    pagedFilteredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <Checkbox
                            checked={selectedOrders.includes(order.id)}
                            onCheckedChange={() => toggleSelectOrder(order.id)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{order.orderNumber}</p>
                            <p className="text-xs text-slate-500">
                              {order.items} {t("orders.items").toLowerCase()}
                              {order.deliveryService && (
                                <span className="text-purple-600"> - {order.deliveryService}</span>
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{order.date}</td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{typeof order.customer === 'string' ? order.customer : (order.customer?.fullName || order.customer?.name || 'Guest Customer')}</p>
                            <p className="text-xs text-slate-500">{order.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-semibold text-slate-900 tabular-nums">
                          <MmkTiny value={order.total} unitClassName="text-[7px] leading-none align-super text-slate-400" />
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            {getPaymentBadge(order.paymentStatus)}
                            {getRefundBadge(order.refundStatus)}
                          </div>
                        </td>
                        <td className="py-3 px-4">{getShippingBadge(order.shippingStatus)}</td>
                        <td className="py-3 px-4">
                          <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)} title={t("common.view")}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {serverTotalOrders > 0 && (
              <VendorAdminListingPagination
                variant="cardFooter"
                page={ordersListPage}
                pageSize={ordersListPageSize}
                totalCount={serverTotalOrders}
                onPageChange={setOrdersListPage}
                onPageSizeChange={setOrdersListPageSize}
                itemLabel={t("orders.ordersTab").toLowerCase()}
                loading={isLoading}
              />
            )}
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Card className="p-6 border-slate-200">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">{t("orders.revenueOrdersTrend")}</h3>
              <p className="text-sm text-slate-600">
                {t("orders.respectsFilters")}
              </p>
            </div>
            <div className="h-64 w-full min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                    formatter={(value, name) =>
                      name === t("orders.revenueMmk")
                        ? [`${Math.round(Number(value)).toLocaleString()} MMK`, name]
                        : [value, name]
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name={t("orders.revenueMmk")}
                    dot={{ fill: "#3b82f6", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} name={t("orders.title")} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">{t("orders.statusDistribution")}</h3>
                <p className="text-sm text-slate-600">{t("orders.currentFilterSelection")}</p>
              </div>
              <div className="h-64 w-full min-h-[256px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6 border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">{t("orders.paymentMethods")}</h3>
                <p className="text-sm text-slate-600">{t("orders.allLoadedOrders")}</p>
              </div>
              <div className="h-64 w-full min-h-[256px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { method: "Credit Card", count: orders.filter(o => o.paymentMethod === "credit-card").length },
                    { method: "COD", count: orders.filter(o => o.paymentMethod === "cod").length },
                    { method: "Bank Transfer", count: orders.filter(o => o.paymentMethod === "bank-transfer").length },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Bulk Status Update Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orders.updateStatus")}</DialogTitle>
            <DialogDescription>
              Update status for {selectedOrders.length} selected order(s)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="status" className="mb-2">{t("orders.selectStatus")}</Label>
            <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value as OrderStatus)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t("orders.pending")}</SelectItem>
                <SelectItem value="processing">{t("orders.processing")}</SelectItem>
                <SelectItem value="fulfilled">{t("orders.fulfilled")}</SelectItem>
                <SelectItem value="cancelled">{t("orders.cancelled")}</SelectItem>
                <SelectItem value="ready-to-ship">{t("orders.readyToShip")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveBulkStatusUpdate} className="bg-slate-900 hover:bg-black text-white">
              {t("orders.updateStatus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orders.printInvoices")}</DialogTitle>
            <DialogDescription>
              Print {selectedOrders.length} invoice(s)?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={executeBulkPrint} className="bg-slate-900 hover:bg-black text-white">
              <Printer className="w-4 h-4 mr-2" />
              {t("orders.print")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}