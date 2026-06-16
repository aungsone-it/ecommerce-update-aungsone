import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { Download, Eye, Printer, Package, Clock, CheckCircle, XCircle, Calendar, TrendingUp, DollarSign, ShoppingCart, X, Truck, CreditCard, MapPin, Phone, Mail, FileText, User, ChevronLeft, ChevronRight } from "lucide-react";
import { AdminClearableSearchInput } from "./AdminClearableSearchInput";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
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
import { AdminDateRangeFilterPopover } from "./AdminDateRangeFilterPopover";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { format } from "date-fns";
import { PrintInvoice } from "./PrintInvoice";
import { runBrowserPrintThen } from "../utils/invoicePrintSession";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ordersApi } from "../../utils/api";
import { ApiError, getAdminOperationHeaders } from "../../utils/api-client";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useLanguage } from "../contexts/LanguageContext";
import {
  getCachedAdminOrdersPage,
  patchAdminOrdersCacheStatuses,
  ADMIN_ORDERS_PAGE_DEFAULT,
  moduleCache,
  adminOrdersPageCacheKey,
  type AdminOrdersPagePayload,
} from "../utils/module-cache";
import {
  isKPayPaidOrderLike,
  pollKPayRefundAfterCancel,
} from "../utils/kpayRefundPolling";
import { adminOrdersUpdatedStorageKey } from "../utils/adminOrdersRealtime";
import { useAdminOrdersResyncOnVisible } from "../hooks/useAdminOrdersResyncOnVisible";
import { PwaOrphanedOrdersRecovery } from "./PwaOrphanedOrdersRecovery";
import { useAdminPortalDebouncedSearch } from "../utils/adminProductSearch";
import {
  refreshAdminInventoryAfterOrderStatusPut,
  syncAdminInventoryCacheAfterOrderStatusChange,
  normalizeOrderLineParentProductId,
  toInventorySyncSnapshot,
  refetchAdminProductsInventoryCaches,
  reconcileInventoryAfterBulkOrderStatusSave,
} from "../utils/orderInventoryCacheSync";
import {
  normalizeAdminOrderStatusForBadge,
  normalizePaymentBadgeStatus,
  normalizeShippingBadgeStatus,
  derivePaymentStatusFromOrder,
  deriveShippingStatusFromOrder,
} from "../utils/normalizeOrderBadgeStatus";
import { deriveOrderPaymentMethodKey } from "../utils/orderPaymentMethod";
import {
  broadcastOrderStatusUpdate,
  subscribeOrderStatusUpdates,
} from "../utils/ordersRealtime";
import {
  buildOrderShippingAddressLine,
  extractOrderShippingFields,
} from "../utils/orderShippingAddress";
import { OrderShippingAddressBlock } from "./OrderShippingAddressBlock";

type OrderStatus = "pending" | "processing" | "fulfilled" | "cancelled" | "ready-to-ship";
type PaymentStatus = "paid" | "unpaid" | "refunded" | "pending_refund";
type ShippingStatus = "pending" | "shipped" | "delivered" | "cancelled";
function isFinanciallyAccruedOrderStatus(status: string | undefined): boolean {
  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return normalized === "ready-to-ship" || normalized === "fulfilled";
}


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
  vendor: string;
  total: number;
  subtotal?: number;
  discount?: number;
  couponCode?: string;
  items: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  products: Product[];
  shippingAddress: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  trackingNumber?: string;
  notes?: string;
  deliveryService?: string;
  deliveryServiceLogo?: string;
  paymentMethod?: "credit-card" | "cod" | "bank-transfer" | "kbz-qr" | "kbz-pwa";
  timeline: {
    status: string;
    date: string;
    time: string;
  }[];
  /** Mirrors server order payload — false until fulfilled/ready-to-ship deducts stock */
  inventoryDeducted?: boolean;
  refundStatus?: "success" | "already_refunded" | "processing" | "failed" | "";
  refundRequestNo?: string;
  refundAmount?: number;
  refundedAt?: string;
  kpay?: unknown;
}

type PendingOrderStatusDraft = {
  status: OrderStatus;
  at: number;
};

// Keeps just-updated statuses stable across fast section switches/remounts.
const pendingOrderStatusDrafts = new Map<string, PendingOrderStatusDraft>();
const PENDING_ORDER_STATUS_TTL_MS = 90_000;

function applyPendingStatusDrafts(rows: OrderItem[]): OrderItem[] {
  const now = Date.now();
  for (const [id, draft] of pendingOrderStatusDrafts.entries()) {
    if (now - draft.at > PENDING_ORDER_STATUS_TTL_MS) pendingOrderStatusDrafts.delete(id);
  }
  if (pendingOrderStatusDrafts.size === 0) return rows;
  return rows.map((row) => {
    const draft = pendingOrderStatusDrafts.get(row.id);
    return draft ? { ...row, status: draft.status } : row;
  });
}

const orders: OrderItem[] = [
  {
    id: "1",
    orderNumber: "#1001",
    date: "2026-02-05",
    customer: "Sarah Johnson",
    email: "sarah.j@email.com",
    phone: "+95 9 123 456 789",
    vendor: "TechGear Pro",
    total: 218383,
    subtotal: 218383,
    discount: 54596,
    couponCode: "SAVE20",
    items: 3,
    status: "fulfilled",
    paymentStatus: "paid",
    shippingStatus: "delivered",
    shippingAddress: "123 Main St, Yangon, Myanmar",
    trackingNumber: "TRK123456789",
    deliveryService: "FedEx Express",
    deliveryServiceLogo: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=100&h=100&fit=crop",
    paymentMethod: "credit-card",
    products: [
      { id: "p1", name: "Wireless Mouse", quantity: 2, price: 105990, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=100&h=100&fit=crop", sku: "WM123" },
      { id: "p2", name: "USB-C Cable", quantity: 1, price: 60999, image: "https://images.unsplash.com/photo-1589492477829-5e65395b66cc?w=100&h=100&fit=crop", sku: "UC123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-05", time: "10:30 AM" },
      { status: "Payment Confirmed", date: "2026-02-05", time: "10:35 AM" },
      { status: "Processing", date: "2026-02-05", time: "02:00 PM" },
      { status: "Shipped", date: "2026-02-06", time: "09:00 AM" },
      { status: "Delivered", date: "2026-02-07", time: "03:45 PM" }
    ]
  },
  {
    id: "2",
    orderNumber: "#1002",
    date: "2026-02-05",
    customer: "Michael Chen",
    email: "m.chen@email.com",
    phone: "+95 9 234 567 890",
    vendor: "Fashion Hub",
    total: 629979,
    items: 5,
    status: "processing",
    paymentStatus: "paid",
    shippingStatus: "shipped",
    shippingAddress: "456 Oak Ave, Mandalay, Myanmar",
    trackingNumber: "TRK987654321",
    deliveryService: "NinjaVan",
    deliveryServiceLogo: "https://images.unsplash.com/photo-1494412519320-aa613dfb7738?w=100&h=100&fit=crop",
    paymentMethod: "cod",
    products: [
      { id: "p3", name: "Designer T-Shirt", quantity: 3, price: 189979, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=100&h=100&fit=crop", sku: "DT123" },
      { id: "p4", name: "Denim Jeans", quantity: 2, price: 250000, image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=100&h=100&fit=crop", sku: "DJ123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-05", time: "11:15 AM" },
      { status: "Payment Confirmed", date: "2026-02-05", time: "11:20 AM" },
      { status: "Processing", date: "2026-02-05", time: "03:30 PM" },
      { status: "Shipped", date: "2026-02-06", time: "10:00 AM" }
    ]
  },
  {
    id: "3",
    orderNumber: "#1003",
    date: "2026-02-04",
    customer: "Emily Rodriguez",
    email: "emily.r@email.com",
    phone: "+95 9 345 678 901",
    vendor: "Home Decor Plus",
    total: 104979,
    items: 2,
    status: "pending",
    paymentStatus: "unpaid",
    shippingStatus: "pending",
    shippingAddress: "789 Elm St, Naypyidaw, Myanmar",
    products: [
      { id: "p5", name: "Table Lamp", quantity: 2, price: 52490, image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=100&h=100&fit=crop", sku: "TL123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-04", time: "09:45 AM" }
    ]
  },
  {
    id: "4",
    orderNumber: "#1004",
    date: "2026-02-04",
    customer: "David Kim",
    email: "d.kim@email.com",
    phone: "+95 9 456 789 012",
    vendor: "TechGear Pro",
    total: 899900,
    items: 7,
    status: "fulfilled",
    paymentStatus: "paid",
    shippingStatus: "delivered",
    shippingAddress: "321 Pine Rd, Yangon, Myanmar",
    trackingNumber: "TRK456789123",
    deliveryService: "DHL International",
    deliveryServiceLogo: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=100&h=100&fit=crop",
    paymentMethod: "credit-card",
    products: [
      { id: "p6", name: "Gaming Keyboard", quantity: 1, price: 419979, image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=100&h=100&fit=crop", sku: "GK123" },
      { id: "p7", name: "Gaming Mouse", quantity: 1, price: 314979, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=100&h=100&fit=crop", sku: "GM123" },
      { id: "p8", name: "Mouse Pad", quantity: 1, price: 62979, image: "https://images.unsplash.com/photo-1625968887088-7e05e2f3f4c3?w=100&h=100&fit=crop", sku: "MP123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-04", time: "01:20 PM" },
      { status: "Payment Confirmed", date: "2026-02-04", time: "01:25 PM" },
      { status: "Processing", date: "2026-02-04", time: "04:00 PM" },
      { status: "Shipped", date: "2026-02-05", time: "08:30 AM" },
      { status: "Delivered", date: "2026-02-06", time: "02:15 PM" }
    ]
  },
  {
    id: "5",
    orderNumber: "#1005",
    date: "2026-02-03",
    customer: "Lisa Anderson",
    email: "lisa.a@email.com",
    phone: "+95 9 567 890 123",
    vendor: "Beauty Essentials",
    total: 335979,
    items: 4,
    status: "cancelled",
    paymentStatus: "refunded",
    shippingStatus: "pending",
    shippingAddress: "654 Maple Dr, Mandalay, Myanmar",
    notes: "Customer requested cancellation due to wrong size.",
    products: [
      { id: "p9", name: "Skincare Set", quantity: 1, price: 167990, image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=100&h=100&fit=crop", sku: "SS123" },
      { id: "p10", name: "Face Cream", quantity: 3, price: 55996, image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=100&h=100&fit=crop", sku: "FC123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-03", time: "03:00 PM" },
      { status: "Payment Confirmed", date: "2026-02-03", time: "03:05 PM" },
      { status: "Cancelled", date: "2026-02-03", time: "05:30 PM" },
      { status: "Refunded", date: "2026-02-04", time: "10:00 AM" }
    ]
  },
  {
    id: "6",
    orderNumber: "#1006",
    date: "2026-02-03",
    customer: "James Wilson",
    email: "j.wilson@email.com",
    phone: "+95 9 678 901 234",
    vendor: "Sports World",
    total: 167979,
    items: 1,
    status: "processing",
    paymentStatus: "paid",
    shippingStatus: "pending",
    shippingAddress: "987 Cedar Ln, Yangon, Myanmar",
    deliveryService: "Amazon Logistics",
    deliveryServiceLogo: "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=100&h=100&fit=crop",
    paymentMethod: "cod",
    products: [
      { id: "p11", name: "Running Shoes", quantity: 1, price: 167979, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&h=100&fit=crop", sku: "RS123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-03", time: "11:30 AM" },
      { status: "Payment Confirmed", date: "2026-02-03", time: "11:35 AM" },
      { status: "Processing", date: "2026-02-03", time: "02:00 PM" }
    ]
  },
  {
    id: "7",
    orderNumber: "#1007",
    date: "2026-02-02",
    customer: "Maria Garcia",
    email: "maria.g@email.com",
    phone: "+95 9 789 012 345",
    vendor: "TechGear Pro",
    total: 629980,
    items: 6,
    status: "fulfilled",
    paymentStatus: "paid",
    shippingStatus: "delivered",
    shippingAddress: "147 Birch St, Naypyidaw, Myanmar",
    trackingNumber: "TRK789123456",
    deliveryService: "UPS Worldwide",
    deliveryServiceLogo: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=100&h=100&fit=crop",
    paymentMethod: "credit-card",
    products: [
      { id: "p12", name: "Laptop Stand", quantity: 1, price: 189000, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=100&h=100&fit=crop", sku: "LS123" },
      { id: "p13", name: "Webcam HD", quantity: 1, price: 272990, image: "https://images.unsplash.com/photo-1625255512657-88672549d2f1?w=100&h=100&fit=crop", sku: "WH123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-02", time: "02:15 PM" },
      { status: "Payment Confirmed", date: "2026-02-02", time: "02:20 PM" },
      { status: "Processing", date: "2026-02-02", time: "05:00 PM" },
      { status: "Shipped", date: "2026-02-03", time: "09:30 AM" },
      { status: "Delivered", date: "2026-02-04", time: "04:00 PM" }
    ]
  },
  {
    id: "8",
    orderNumber: "#1008",
    date: "2026-02-01",
    customer: "Robert Taylor",
    email: "r.taylor@email.com",
    phone: "+95 9 890 123 456",
    vendor: "Fashion Hub",
    total: 944979,
    items: 3,
    status: "pending",
    paymentStatus: "unpaid",
    shippingStatus: "pending",
    shippingAddress: "258 Willow Ave, Mandalay, Myanmar",
    products: [
      { id: "p14", name: "Leather Jacket", quantity: 1, price: 629990, image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=100&h=100&fit=crop", sku: "LJ123" },
      { id: "p15", name: "Belt", quantity: 2, price: 157495, image: "https://images.unsplash.com/photo-1624222247344-550fb60583bb?w=100&h=100&fit=crop", sku: "BT123" }
    ],
    timeline: [
      { status: "Order Placed", date: "2026-02-01", time: "04:45 PM" }
    ]
  },
];

// Revenue chart data
const revenueChartData = [
  { date: "Jan 26", orders: 8, revenue: 3885000 },
  { date: "Jan 27", orders: 12, revenue: 5040000 },
  { date: "Jan 28", orders: 10, revenue: 4410000 },
  { date: "Jan 29", orders: 15, revenue: 6720000 },
  { date: "Jan 30", orders: 9, revenue: 4095000 },
  { date: "Jan 31", orders: 11, revenue: 4830000 },
  { date: "Feb 01", orders: 13, revenue: 5565000 },
  { date: "Feb 02", orders: 10, revenue: 4620000 },
  { date: "Feb 03", orders: 14, revenue: 5985000 },
  { date: "Feb 04", orders: 12, revenue: 5355000 },
  { date: "Feb 05", orders: 16, revenue: 6510000 },
];

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const getStatusBadge = (status: OrderStatus | string, t: (key: string) => string) => {
  const variants = {
    pending: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock, label: t("orders.pending") },
    processing: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Package, label: t("orders.processing") },
    fulfilled: { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, label: t("orders.fulfilled") },
    cancelled: { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: t("orders.cancelled") },
    "ready-to-ship": { color: "bg-purple-100 text-purple-700 border-purple-200", icon: Package, label: t("orders.readyToShip") },
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

const getPaymentBadge = (status: PaymentStatus | string, t: (key: string) => string) => {
  const variants = {
    paid: { color: "bg-green-100 text-green-700 border-green-200", label: t("orders.paid") },
    unpaid: { color: "bg-amber-100 text-amber-700 border-amber-200", label: t("orders.unpaid") },
    refunded: { color: "bg-slate-100 text-slate-700 border-slate-200", label: t("orders.refunded") },
    "pending-refund": {
      color: "bg-orange-100 text-orange-800 border-orange-200",
      label: t("orders.refund"),
    },
  } as const;
  const key = normalizePaymentBadgeStatus(status);
  const v = variants[key];
  return (
    <Badge variant="secondary" className={`${v.color} hover:${v.color} border text-xs`}>
      {v.label}
    </Badge>
  );
};

const getRefundBadge = (status: string | undefined, t: (key: string) => string) => {
  const key = String(status || "").trim().toLowerCase();
  if (!key) return null;
  if (key === "success" || key === "already_refunded") {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px]">
        {key === "already_refunded" ? t("orders.refundAlreadyDone") : t("orders.refundSuccess")}
      </Badge>
    );
  }
  if (key === "failed") {
    return (
      <Badge variant="secondary" className="bg-rose-100 text-rose-700 border-rose-200 text-[11px]">
        {t("orders.refundFailed")}
      </Badge>
    );
  }
  if (key === "processing") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[11px]">
        {t("orders.refundProcessing")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 text-[11px]">
      {t("orders.refund")} {key}
    </Badge>
  );
};

const getShippingBadge = (status: ShippingStatus | string, t: (key: string) => string) => {
  const variants = {
    pending: { color: "bg-slate-100 text-slate-700 border-slate-200", label: t("orders.pending") },
    shipped: { color: "bg-blue-100 text-blue-700 border-blue-200", label: t("orders.shipped") },
    delivered: { color: "bg-green-100 text-green-700 border-green-200", label: t("orders.delivered") },
    cancelled: { color: "bg-red-100 text-red-700 border-red-200", label: t("orders.cancelled") },
  } as const;
  const key = normalizeShippingBadgeStatus(status);
  const v = variants[key];
  return (
    <Badge variant="secondary" className={`${v.color} hover:${v.color} border text-xs`}>
      {v.label}
    </Badge>
  );
};

function mapApiOrdersToOrderItems(apiOrders: any[]): OrderItem[] {
  return (apiOrders || []).map((order: any) => {
    const shipping = extractOrderShippingFields(order);
    return {
    id: order.id,
    orderNumber: order.orderNumber || order.id,
    date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    createdAt: order.createdAt || new Date().toISOString(),
    customer: order.customer?.fullName || order.customer?.name || order.customerName || (typeof order.customer === 'string' ? order.customer : null) || (order.customer?.firstName && order.customer?.lastName ? `${order.customer.firstName} ${order.customer.lastName}` : order.customer?.firstName || order.customer?.lastName || 'Guest Customer'),
    email: order.email || order.customer?.email || '',
    phone: order.phone || order.customer?.phone || '',
    vendor:
      order.vendor ??
      order.vendorName ??
      order.storeName ??
      (typeof order.vendorId === "string" ? order.vendorId : "") ??
      "",
    total: parseFloat(order.total) || 0,
    subtotal: order.subtotal != null && order.subtotal !== '' ? parseFloat(String(order.subtotal)) : undefined,
    discount: order.discount != null && order.discount !== '' ? parseFloat(String(order.discount)) : undefined,
    couponCode: order.couponCode,
    items: order.items?.length || 0,
    status: order.status || 'pending',
    paymentStatus: derivePaymentStatusFromOrder(order) as PaymentStatus,
    shippingStatus: deriveShippingStatusFromOrder(order),
    products: (order.items || []).map((item: any) => ({
      id: normalizeOrderLineParentProductId(item.productId ?? item.id),
      name: item.name || 'Product',
      quantity: item.quantity || 1,
      price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price || '0').replace(/[$,]/g, '')) || 0,
      image: item.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop',
      sku: item.sku || 'N/A'
    })),
    shippingAddress: buildOrderShippingAddressLine(shipping),
    address: shipping.address,
    city: shipping.city,
    state: shipping.state,
    zipCode: shipping.zipCode,
    country: shipping.country,
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
    refundStatus:
      (String(order.refundStatus || order.kpay?.refund?.status || "")
        .trim()
        .toLowerCase() as OrderItem["refundStatus"]) || "",
    refundRequestNo: order.refundRequestNo || order.kpay?.refund?.refundRequestNo || "",
    refundAmount: Number(order.refundAmount || order.kpay?.refund?.amount || 0) || 0,
    refundedAt: order.refundedAt || order.kpay?.refund?.refundedAt || order.kpay?.refund?.failedAt || "",
  };
  });
}

export function Orders({
  onViewOrder,
  onOrderUpdate,
  initialListSearchQuery,
  listSearchApplyToken,
}: {
  onViewOrder?: (order: OrderItem) => void;
  onOrderUpdate?: () => void;
  initialListSearchQuery?: string;
  listSearchApplyToken?: number;
}) {
  const { t } = useLanguage();
  /** False after unmount when the admin switches to another section — PUT may still be in flight. */
  const ordersSurfaceActiveRef = useRef(true);
  const hasHydratedOrdersRef = useRef(false);
  useEffect(() => {
    ordersSurfaceActiveRef.current = true;
    return () => {
      ordersSurfaceActiveRef.current = false;
    };
  }, []);
  const [selectedTab, setSelectedTab] = useState("orders");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (initialListSearchQuery === undefined || !String(initialListSearchQuery).trim()) return;
    setSearchQuery(String(initialListSearchQuery).trim());
  }, [initialListSearchQuery, listSearchApplyToken]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [orderDateRange, setOrderDateRange] = useState<DateRange | undefined>(undefined);
  const [orderDatePickerOpen, setOrderDatePickerOpen] = useState(false);
  const dateFrom = orderDateRange?.from;
  const dateTo = orderDateRange?.to;
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("processing");
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  
  const initialOrdersPayload = useMemo(
    () =>
      moduleCache.peek<AdminOrdersPagePayload>(
        adminOrdersPageCacheKey({
          page: 1,
          pageSize: ADMIN_ORDERS_PAGE_DEFAULT,
          q: "",
          status: "all",
          payment: "all",
          vendor: "all",
          dateFrom: "",
          dateTo: "",
          sort: "newest",
        })
      ),
    []
  );
  const [orders, setOrders] = useState<OrderItem[]>(() =>
    applyPendingStatusDrafts(mapApiOrdersToOrderItems(initialOrdersPayload?.orders || []))
  );
  const debouncedSearch = useAdminPortalDebouncedSearch(searchQuery);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(ADMIN_ORDERS_PAGE_DEFAULT);
  const [ordersTotal, setOrdersTotal] = useState(() => Number(initialOrdersPayload?.total ?? 0));
  const [ordersHasMore, setOrdersHasMore] = useState(() => !!initialOrdersPayload?.hasMore);
  const [ordersAggregates, setOrdersAggregates] = useState<AdminOrdersPagePayload["aggregates"]>(
    () => initialOrdersPayload?.aggregates
  );
  const [isLoading, setIsLoading] = useState(() => !initialOrdersPayload);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showBulkInvoices, setShowBulkInvoices] = useState(false); // For printing multiple invoices
  const [orderSaveState, setOrderSaveState] = useState<Record<string, "saving" | "saved">>({});
  const savedStateTimersRef = useRef<Record<string, number>>({});

  const clearSavedStateTimer = useCallback((orderId: string) => {
    const timer = savedStateTimersRef.current[orderId];
    if (timer) {
      window.clearTimeout(timer);
      delete savedStateTimersRef.current[orderId];
    }
  }, []);

  const markOrderSaved = useCallback(
    (orderIds: string[]) => {
      const now = Date.now();
      for (const id of orderIds) {
        const current = pendingOrderStatusDrafts.get(id);
        if (current) pendingOrderStatusDrafts.set(id, { ...current, at: now });
      }
      setOrderSaveState((prev) => {
        const next = { ...prev };
        for (const id of orderIds) {
          clearSavedStateTimer(id);
          next[id] = "saved";
          savedStateTimersRef.current[id] = window.setTimeout(() => {
            setOrderSaveState((cur) => {
              if (cur[id] !== "saved") return cur;
              const copy = { ...cur };
              delete copy[id];
              return copy;
            });
            delete savedStateTimersRef.current[id];
          }, 2500);
        }
        return next;
      });
    },
    [clearSavedStateTimer]
  );

  const markOrderSaving = useCallback(
    (orderIds: string[]) => {
      setOrderSaveState((prev) => {
        const next = { ...prev };
        for (const id of orderIds) {
          clearSavedStateTimer(id);
          next[id] = "saving";
        }
        return next;
      });
    },
    [clearSavedStateTimer]
  );

  const clearOrderSaveState = useCallback(
    (orderIds: string[]) => {
      setOrderSaveState((prev) => {
        const next = { ...prev };
        for (const id of orderIds) {
          clearSavedStateTimer(id);
          delete next[id];
        }
        return next;
      });
    },
    [clearSavedStateTimer]
  );

  useEffect(() => {
    return () => {
      Object.values(savedStateTimersRef.current).forEach((t) => window.clearTimeout(t));
      savedStateTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (orders.length > 0 || ordersTotal > 0) {
      hasHydratedOrdersRef.current = true;
    }
  }, [orders.length, ordersTotal]);

  useEffect(() => {
    setOrdersPage(1);
  }, [debouncedSearch, statusFilter, paymentFilter, vendorFilter, dateFrom, dateTo, sortOrder, ordersPageSize]);

  useEffect(() => {
    const triggerCacheRebuild = async () => {
      const sessionKey = "admin-orders-cache-rebuild-requested";
      try {
        if (sessionStorage.getItem(sessionKey)) {
          return;
        }
      } catch {
        /* ignore sessionStorage failures */
      }
      try {
        const response = await fetch(
          `${projectId.includes("localhost") ? "http://localhost:54321" : `https://${projectId}.supabase.co`}/functions/v1/make-server-16010b6f/rebuild-cache`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
              "Content-Type": "application/json",
              ...getAdminOperationHeaders(),
            },
          }
        );
        if (response.ok) {
          try {
            sessionStorage.setItem(sessionKey, String(Date.now()));
          } catch {
            /* ignore sessionStorage failures */
          }
        }
        console.log("🔨 Cache rebuild triggered");
      } catch (error) {
        console.log("ℹ️ Could not trigger cache rebuild:", error);
      }
    };
    triggerCacheRebuild();
  }, []);

  const loadOrders = useCallback(
    async (forceRefresh = false) => {
      let showLoadingTimer: ReturnType<typeof setTimeout> | null = null;
      const shouldBlockUi = !forceRefresh && !hasHydratedOrdersRef.current;
      if (shouldBlockUi) {
        showLoadingTimer = setTimeout(() => setIsLoading(true), 300);
      }
      setListRefreshing(forceRefresh);
      try {
        const payload = await getCachedAdminOrdersPage(
          {
            page: ordersPage,
            pageSize: ordersPageSize,
            q: debouncedSearch,
            status: statusFilter,
            payment: paymentFilter,
            vendor: vendorFilter,
            dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : "",
            dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : "",
            sort: sortOrder,
          },
          forceRefresh
        );

        if (payload.warning) {
          toast.warning(payload.warning, { duration: 4000 });
        }

        setOrders(applyPendingStatusDrafts(mapApiOrdersToOrderItems(payload.orders || [])));
        setOrdersTotal(payload.total);
        setOrdersHasMore(!!payload.hasMore);
        setOrdersAggregates(payload.aggregates);
      } catch (error: any) {
        console.error("Failed to load orders:", error);
        if (error.message?.includes("Failed to fetch")) {
          toast.error(
            "Cannot connect to server. The Edge Function may still be deploying. Please wait 30 seconds and refresh the page.",
            { duration: 8000 }
          );
        } else if (error.message?.includes("timeout") || error.message?.includes("connection")) {
          toast.error("Database connection timeout. Please refresh the page.", { duration: 5000 });
        } else {
          toast.error(`Failed to load orders: ${error.message || "Unknown error"}`, { duration: 5000 });
        }
        setOrders([]);
        setOrdersTotal(0);
        setOrdersHasMore(false);
        setOrdersAggregates(undefined);
      } finally {
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        if (shouldBlockUi) setIsLoading(false);
        setListRefreshing(false);
      }
    },
    [
      ordersPage,
      ordersPageSize,
      debouncedSearch,
      statusFilter,
      paymentFilter,
      vendorFilter,
      dateFrom,
      dateTo,
      sortOrder,
    ]
  );

  useEffect(() => {
    void loadOrders(false);
  }, [loadOrders]);

  useEffect(() => {
    return subscribeOrderStatusUpdates(({ orderId, status, updatedAt }) => {
      const normalized = normalizeAdminOrderStatusForBadge(status) as OrderStatus;
      pendingOrderStatusDrafts.set(orderId, { status: normalized, at: Date.now() });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: normalized, updatedAt: updatedAt || o.updatedAt } : o))
      );
      setOrderSaveState((prev) => (prev[orderId] ? prev : { ...prev, [orderId]: "saved" }));
    });
  }, []);

  /** Refetch when storefront/admin creates or mutates orders (same tab + other tabs via storage). */
  useEffect(() => {
    const bump = () => {
      void loadOrders(true);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== adminOrdersUpdatedStorageKey()) return;
      void loadOrders(true);
    };
    window.addEventListener("adminOrdersUpdated", bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("adminOrdersUpdated", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadOrders]);

  useAdminOrdersResyncOnVisible(() => {
    void loadOrders(true);
  });

  const uniqueVendors =
    ordersAggregates?.uniqueVendors?.length ?
      ordersAggregates.uniqueVendors
    : Array.from(new Set(orders.map((order) => order.vendor || "SECURE Store"))).sort();

  /** Live text filter on the current page while server `q` debounces — same fields as edge filter. */
  const displayOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const customerHay =
        typeof order.customer === "string"
          ? order.customer
          : JSON.stringify(order.customer ?? "");
      return (
        order.orderNumber.toLowerCase().includes(q) ||
        customerHay.toLowerCase().includes(q) ||
        order.email.toLowerCase().includes(q) ||
        String(order.phone ?? "")
          .toLowerCase()
          .includes(q) ||
        String(order.id ?? "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [orders, searchQuery]);

  const filteredTotalRevenue =
    displayOrders
      .filter((order) => isFinanciallyAccruedOrderStatus(order.status))
      .reduce((sum, order) => sum + order.total, 0);
  const filteredTotalOrders = ordersAggregates?.filteredCount ?? displayOrders.length;
  const filteredAvgOrderValue =
    ordersAggregates?.filteredAvgOrderValue ??
    (filteredTotalOrders > 0 ? filteredTotalRevenue / filteredTotalOrders : 0);
  const filteredStatusBreakdown = ordersAggregates?.statusBreakdown ?? {
    pending: displayOrders.filter((o) => o.status === "pending").length,
    processing: displayOrders.filter((o) => o.status === "processing").length,
    fulfilled: displayOrders.filter((o) => o.status === "fulfilled").length,
    cancelled: displayOrders.filter((o) => o.status === "cancelled").length,
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === displayOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(displayOrders.map((order) => order.id));
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
    setIsPrintDialogOpen(false);
    setShowBulkInvoices(true);

    const ordersToPrint = orders.filter((order) => selectedOrders.includes(order.id));
    if (ordersToPrint.length === 0) {
      setShowBulkInvoices(false);
      return;
    }

    setTimeout(() => {
      runBrowserPrintThen(() => {
        setShowBulkInvoices(false);
        setSelectedOrders([]);
      });
    }, 300);
  };

  const saveBulkStatusUpdate = async () => {
    // OPTIMISTIC UPDATE - Update all selected orders immediately!
    const previousOrders = [...orders];
    
    setOrders(prevOrders =>
      prevOrders.map(order =>
        selectedOrders.includes(order.id) ? { ...order, status: bulkStatus } : order
      )
    );

    const orderIds = [...selectedOrders];
    patchAdminOrdersCacheStatuses(orderIds.map((id) => ({ orderId: id, status: bulkStatus })));
    
    // Close dialog and clear selection immediately
    setIsStatusDialogOpen(false);
    const updatedCount = orderIds.length;
    setSelectedOrders([]);
    for (const id of orderIds) pendingOrderStatusDrafts.set(id, { status: bulkStatus, at: Date.now() });
    clearOrderSaveState(orderIds);

    toast.success(`${updatedCount} order${updatedCount === 1 ? "" : "s"} updated to ${bulkStatus}`);
    onOrderUpdate?.();

    // Instant inventory / Products + Inventory pages — mirror stock before network completes
    for (const oid of orderIds) {
      const o = previousOrders.find((x) => x.id === oid);
      if (o) {
        syncAdminInventoryCacheAfterOrderStatusChange(toInventorySyncSnapshot(o), bulkStatus, {
          skipDispatch: true,
        });
      }
    }
    dispatchAdminProductsCachePatched();

    // Sync with server in background (UI already reflects the new status)
    void (async () => {
    try {
      await Promise.all(
        orderIds.map(orderId => 
          ordersApi.update(orderId, { status: bulkStatus })
        )
      );
      console.log(`✅ ${updatedCount} orders synced to server: ${bulkStatus}`);
      for (const orderId of orderIds) {
        void broadcastOrderStatusUpdate({
          orderId,
          status: bulkStatus,
          updatedAt: new Date().toISOString(),
        });
      }
      const bulkSnapshots = orderIds
        .map((id) => previousOrders.find((x) => x.id === id))
        .filter((row): row is (typeof previousOrders)[number] => row != null)
        .map((row) => toInventorySyncSnapshot(row));
      void reconcileInventoryAfterBulkOrderStatusSave(bulkSnapshots).catch((e) =>
        console.warn("[inventory] Bulk reconcile failed:", e)
      );
    } catch (error) {
      // Roll back on error
      console.error("❌ Failed to bulk update orders:", error);
      const detail =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";
      if (ordersSurfaceActiveRef.current) {
        setOrders(previousOrders);
        void refetchAdminProductsInventoryCaches();
        toast.error("Failed to save changes. Updates reverted.", {
          description: detail,
          duration: 8000,
        });
      } else {
        toast.error("Bulk order save may have partially failed", {
          description: `${detail}. Open Orders and refresh to confirm.`,
          duration: 10000,
        });
      }
      for (const id of orderIds) pendingOrderStatusDrafts.delete(id);
      clearOrderSaveState(orderIds);
      onOrderUpdate?.();
    }
    })();
  };

  // Handle status change for single order
  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    // Find the order being updated
    const orderBeingUpdated = orders.find(o => o.id === orderId);
    const wasNotCancelled = orderBeingUpdated?.status !== 'cancelled';
    const isNowCancelled = newStatus === 'cancelled';
    
    // OPTIMISTIC UPDATE - Update UI immediately!
    const previousOrders = [...orders];
    
    setOrders(prevOrders =>
      prevOrders.map(order =>
        order.id === orderId
          ? {
              ...order,
              status: newStatus,
              ...(isNowCancelled
                ? {
                    paymentStatus:
                      order.paymentStatus === "refunded" ? "refunded" : ("pending_refund" as PaymentStatus),
                    shippingStatus: "cancelled" as ShippingStatus,
                  }
                : {}),
            }
          : order
      )
    );
    patchAdminOrdersCacheStatuses([{ orderId, status: newStatus }]);
    pendingOrderStatusDrafts.set(orderId, { status: newStatus, at: Date.now() });
    clearOrderSaveState([orderId]);

    if (wasNotCancelled && isNowCancelled) {
      toast.message("Order cancelled", {
        duration: 2500,
        description: "Refund confirmation may take a moment on KPay orders.",
      });
    } else {
      toast.success(`Status updated to ${newStatus}`);
    }
    onOrderUpdate?.();

    if (orderBeingUpdated) {
      syncAdminInventoryCacheAfterOrderStatusChange(toInventorySyncSnapshot(orderBeingUpdated), newStatus);
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
          kpay?: unknown;
          refundStatus?: string;
        };
      };
      console.log(`✅ Order ${orderId} status synced to server: ${newStatus}`);
      const srv = result?.order as
        | {
            inventoryDeducted?: boolean;
            paymentStatus?: string;
            kpay?: { refund?: { status?: string } };
          }
        | undefined;
      if (srv && ordersSurfaceActiveRef.current) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== orderId) return o;
            const row = mapApiOrdersToOrderItems([
              {
                ...srv,
                id: orderId,
                status: newStatus,
              },
            ])[0];
            return row ? { ...o, ...row, status: newStatus } : o;
          })
        );
      }
      if (wasNotCancelled && isNowCancelled) {
        if (result?.refundPending) {
          toast.message("Order cancelled", {
            duration: 6000,
            description:
              result.message ||
              "KBZPay refund is still processing. We will retry automatically; check the order in a minute.",
          });
        } else {
          const rf = String(srv?.kpay?.refund?.status || "").toLowerCase();
          if (rf === "success" || rf === "already_refunded") {
            toast.success("Cancelled — refund submitted to KPay");
          } else if (rf === "processing") {
            toast.success("Cancelled — refund processing at bank");
          } else {
            toast.success("Cancellation saved");
          }
        }
        if (isKPayPaidOrderLike(orderBeingUpdated)) {
          pollKPayRefundAfterCancel({
            orderId,
            orderNumber: orderBeingUpdated?.orderNumber,
            shouldContinue: () => ordersSurfaceActiveRef.current,
            onSuccess: (orderData) => {
              setOrders((prev) =>
                prev.map((o) => {
                  if (o.id !== orderId) return o;
                  const row = mapApiOrdersToOrderItems([
                    { ...orderData, id: orderId, status: "cancelled" },
                  ])[0];
                  return row ? { ...o, ...row, status: "cancelled" } : o;
                })
              );
            },
          });
        }
      }
      void broadcastOrderStatusUpdate({
        orderId,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      if (orderBeingUpdated) {
        void refreshAdminInventoryAfterOrderStatusPut(
          toInventorySyncSnapshot(orderBeingUpdated),
          newStatus,
          { optimisticMirrorAlreadyApplied: true }
        ).catch((invErr) => {
          console.warn("[inventory] post-status cache sync failed:", invErr);
        });
      }
      if (result?.order?.inventoryDeducted !== undefined && ordersSurfaceActiveRef.current) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, inventoryDeducted: result.order!.inventoryDeducted } : o
          )
        );
      }
    } catch (error) {
      // Roll back on error
      console.error("❌ Failed to update order status:", error);
      const detail =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";
      const stillHere = ordersSurfaceActiveRef.current;
      if (stillHere) {
        setOrders(previousOrders);
        if (orderBeingUpdated) {
          patchAdminOrdersCacheStatuses([
            { orderId, status: orderBeingUpdated.status },
          ]);
        }
        void refetchAdminProductsInventoryCaches();
        toast.error("Failed to save status. Changes reverted.", {
          description: detail,
          duration: 8000,
        });
      } else {
        const isTimeout =
          detail.toLowerCase().includes("timeout") ||
          (error instanceof ApiError && error.statusCode === 504);
        toast.error(isTimeout ? "Order save may have finished late" : "Order status update failed", {
          description: `${detail}. Open Orders and use Refresh if the status looks wrong.`,
          duration: 10000,
        });
      }
      pendingOrderStatusDrafts.delete(orderId);
      clearOrderSaveState([orderId]);
      onOrderUpdate?.();
    }
    })();
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setVendorFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || paymentFilter !== "all" || vendorFilter !== "all" || dateFrom || dateTo;

  const exportOrders = () => {
    const headers = ["Order Number", "Date", "Customer", "Email", "Vendor", "Total", "Items", "Status", "Payment", "Shipping"];
    const csvContent = [
      headers.join(","),
      ...displayOrders.map((o) => 
        [o.orderNumber, o.date, o.customer, o.email, o.vendor, o.total, o.items, o.status, o.paymentStatus, o.shippingStatus].join(",")
      )
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const totalRevenue =
    orders
      .filter((order) => isFinanciallyAccruedOrderStatus(order.status))
      .reduce((sum, order) => sum + order.total, 0);
  const pendingOrders =
    ordersAggregates?.statusBreakdown ?
      ordersAggregates.statusBreakdown.pending
    : orders.filter((order) => order.status === "pending").length;
  const processingOrders =
    ordersAggregates?.statusBreakdown ?
      ordersAggregates.statusBreakdown.processing
    : orders.filter((order) => order.status === "processing").length;
  const fulfilledOrders =
    ordersAggregates?.statusBreakdown ?
      ordersAggregates.statusBreakdown.fulfilled
    : orders.filter((order) => order.status === "fulfilled").length;

  const statusDistributionData = [
    { name: "Pending", value: pendingOrders },
    { name: "Processing", value: processingOrders },
    { name: "Fulfilled", value: fulfilledOrders },
    {
      name: "Cancelled",
      value:
        ordersAggregates?.statusBreakdown.cancelled ??
        orders.filter((o) => o.status === "cancelled").length,
    },
  ];

  const vendorRevenueData =
    ordersAggregates?.vendorRevenue && ordersAggregates.vendorRevenue.length > 0 ?
      ordersAggregates.vendorRevenue
    : uniqueVendors.map((vendor) => ({
        vendor,
        revenue: orders
          .filter(
            (o) =>
              (o.vendor || "SECURE Store") === vendor &&
              isFinanciallyAccruedOrderStatus(o.status)
          )
          .reduce((sum, o) => sum + o.total, 0),
      }));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('orders.title')}</h1>
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 bg-slate-50">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          )}
        </div>
        <p className="text-slate-600">{t('orders.subtitle')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('orders.totalRevenue')}</p>
              <p className="text-2xl font-semibold text-slate-900">
                {totalRevenue.toLocaleString()} Ks
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">+12.5%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>
        
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('orders.pending')}</p>
              <p className="text-2xl font-semibold text-slate-900">{pendingOrders}</p>
              <p className="text-sm text-slate-500 mt-2">{t('orders.needsAttention')}</p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('orders.processing')}</p>
              <p className="text-2xl font-semibold text-slate-900">{processingOrders}</p>
              <p className="text-sm text-slate-500 mt-2">{t('orders.inProgress')}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('orders.fulfilled')}</p>
              <p className="text-2xl font-semibold text-slate-900">{fulfilledOrders}</p>
              <p className="text-sm text-slate-500 mt-2">{t('orders.completed')}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="orders">{t("orders.ordersTab")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("orders.analyticsTab")}</TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <PwaOrphanedOrdersRecovery
            searchQuery={debouncedSearch}
            onRecovered={() => void loadOrders(true)}
            compact
          />
          {/* Toolbar */}
          <Card className="mb-4">
            <div className="p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-slate-900">{t("orders.allOrders")} ({ordersTotal})</h3>
                <div className="flex items-center gap-2">
                  {selectedOrders.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleBulkStatusUpdate}>
                        <Package className="w-4 h-4 mr-2" />
                        {t("orders.updateStatus")} ({selectedOrders.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleBulkPrint}>
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
                  <Button variant="outline" size="sm" onClick={exportOrders}>
                    <Download className="w-4 h-4 mr-2" />
                    {t("orders.export")}
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <AdminClearableSearchInput
                    placeholder={t("orders.searchPlaceholder")}
                    className="border-slate-300"
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                </div>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as "newest" | "oldest")}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder={t("orders.sortBy")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">🆕 {t("orders.newestFirst")}</SelectItem>
                    <SelectItem value="oldest">📅 {t("orders.oldestFirst")}</SelectItem>
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
                    <SelectItem value="refunded">{t("orders.refunded")}</SelectItem>
                    <SelectItem value="pending_refund">{t("orders.refundPending")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder={t("orders.vendor")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("orders.allVendors")}</SelectItem>
                    {uniqueVendors.map(vendor => (
                      <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                    ))}
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
          <Card>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4">
                      <Checkbox
                        checked={selectedOrders.length === displayOrders.length && displayOrders.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.order")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.date")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.customer")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.vendor")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.total")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.status")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.payment")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.shipping")}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t("orders.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    // Loading skeleton rows
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={`skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
                        <td className="py-3 px-4">
                          <div className="w-4 h-4 bg-slate-200 rounded"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-2">
                            <div className="h-4 bg-slate-200 rounded w-24"></div>
                            <div className="h-3 bg-slate-200 rounded w-16"></div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-2">
                            <div className="h-4 bg-slate-200 rounded w-32"></div>
                            <div className="h-3 bg-slate-200 rounded w-40"></div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-16"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-6 bg-slate-200 rounded-full w-16"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-slate-200 rounded"></div>
                            <div className="h-8 w-8 bg-slate-200 rounded"></div>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : displayOrders.length === 0 ? (
                    // Empty state
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 text-lg font-medium">{t("orders.noOrdersFound")}</p>
                        <p className="text-slate-400 text-sm mt-1">
                          {hasActiveFilters ? t("orders.tryAdjustFilters") : t("orders.emptyHint")}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    displayOrders.map((order) => (
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
                      <td className="py-3 px-4 text-sm text-slate-600">{order.vendor || "SECURE Store"}</td>
                      <td className="py-3 px-4 text-sm font-semibold text-slate-900">{order.total.toLocaleString()} MMK</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(order.status, t)}
                          {orderSaveState[order.id] === "saving" && (
                            <span className="text-[11px] text-amber-600">{t("common.saving")}</span>
                          )}
                          {orderSaveState[order.id] === "saved" && (
                            <span className="text-[11px] text-emerald-600">{t("common.saved")}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {getPaymentBadge(order.paymentStatus, t)}
                          {getRefundBadge(order.refundStatus, t)}
                        </div>
                      </td>
                      <td className="py-3 px-4">{getShippingBadge(order.shippingStatus, t)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => onViewOrder?.(order)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Package className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "pending")}>
                                {t("orders.markAsPending")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "processing")}>
                                {t("orders.markAsProcessing")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "fulfilled")}>
                                {t("orders.markAsFulfilled")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "ready-to-ship")}>
                                {t("orders.markAsReadyToShip")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "cancelled")}>
                                {t("orders.markAsCancelled")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>{t("pagination.perPage")}</span>
                <Select
                  value={String(ordersPageSize)}
                  onValueChange={(v) => setOrdersPageSize(Number(v))}
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
                  {t("pagination.page")} {ordersPage} {t("pagination.of")} {Math.max(1, Math.ceil(ordersTotal / ordersPageSize) || 1)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={ordersPage <= 1 || isLoading}
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!ordersHasMore || isLoading}
                  onClick={() => setOrdersPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t("orders.revenueOrdersTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name={t("orders.revenueMmk")} />
                  <Line type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} name={t("orders.title")} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>{t("orders.statusDistribution")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusDistributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Vendor Revenue */}
            <Card>
              <CardHeader>
                <CardTitle>{t("orders.revenueByVendor")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={vendorRevenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="vendor" stroke="#64748b" angle={-45} textAnchor="end" height={100} />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
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
            <Button onClick={saveBulkStatusUpdate}>
              {t("orders.updateStatus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orders.printInvoices")}</DialogTitle>
            <DialogDescription>
              Print invoices for {selectedOrders.length} selected order(s)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={executeBulkPrint}>
              <Printer className="w-4 h-4 mr-2" />
              {t("orders.print")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              View complete order information and timeline
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Header */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm text-slate-500">Order Number</p>
                  <p className="font-semibold text-slate-900 text-lg">{selectedOrder.orderNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Order Date</p>
                  <p className="font-semibold text-slate-900">{selectedOrder.date}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  {getStatusBadge(selectedOrder.status, t)}
                </div>
                <div>
                  <p className="text-sm text-slate-500">Payment Status</p>
                  {getPaymentBadge(selectedOrder.paymentStatus, t)}
                  {getRefundBadge(selectedOrder.refundStatus, t)}
                  {selectedOrder.refundStatus && (
                    <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                      {selectedOrder.refundRequestNo && <p>Refund Ref: {selectedOrder.refundRequestNo}</p>}
                      {!!selectedOrder.refundAmount && <p>Refund Amount: {selectedOrder.refundAmount.toLocaleString()} MMK</p>}
                      {selectedOrder.refundedAt && <p>Refund Time: {new Date(selectedOrder.refundedAt).toLocaleString()}</p>}
                    </div>
                  )}
                </div>
                {selectedOrder.deliveryService && (
                  <div className="col-span-2">
                    <p className="text-sm text-slate-500 mb-2">Delivery Service</p>
                    <div className="flex items-center gap-2">
                      {selectedOrder.deliveryServiceLogo && (
                        <img 
                          src={selectedOrder.deliveryServiceLogo} 
                          alt={selectedOrder.deliveryService} 
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <p className="font-semibold text-purple-600">{selectedOrder.deliveryService}</p>
                      {selectedOrder.paymentMethod === "cod" && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                          💰 Cash on Delivery
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Info */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Customer Information
                </h4>
                <div className="grid grid-cols-2 gap-4 p-4 border border-slate-200 rounded-lg">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Name</p>
                    <p className="font-medium text-slate-900">{typeof selectedOrder.customer === 'string' ? selectedOrder.customer : (selectedOrder.customer?.fullName || selectedOrder.customer?.name || 'Guest Customer')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Vendor</p>
                    <p className="font-medium text-slate-900">{selectedOrder.vendor}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Email</p>
                      <p className="font-medium text-slate-900">{selectedOrder.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="w-4 h-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Phone</p>
                      <p className="font-medium text-slate-900">{selectedOrder.phone}</p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">Shipping Address</p>
                      <OrderShippingAddressBlock order={selectedOrder} />
                    </div>
                  </div>
                  {selectedOrder.trackingNumber && (
                    <div className="col-span-2 flex items-start gap-2">
                      <Truck className="w-4 h-4 text-slate-400 mt-1" />
                      <div>
                        <p className="text-sm text-slate-500">Tracking Number</p>
                        <p className="font-medium text-slate-900">{selectedOrder.trackingNumber}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Products */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Products ({selectedOrder.products.length})
                </h4>
                <div className="space-y-3">
                  {selectedOrder.products.map((product) => (
                    <div key={product.id} className="flex items-center gap-4 p-3 border border-slate-200 rounded-lg">
                      <img src={product.image} alt={product.sku} className="w-16 h-16 object-cover rounded" />
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{product.sku}</p>
                        <p className="text-sm text-slate-500">Quantity: {product.quantity}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{product.price.toLocaleString()} Ks</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Timeline */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Order Timeline
                </h4>
                <div className="space-y-3">
                  {selectedOrder.timeline.map((event, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{event.status}</p>
                        <p className="text-sm text-slate-500">{event.date} at {event.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Notes
                  </h4>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-slate-700">{selectedOrder.notes}</p>
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-900 mb-3">Order Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-medium text-slate-900">{selectedOrder.total.toLocaleString()} Ks</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Shipping</span>
                    <span className="font-medium text-slate-900">Free</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-bold text-slate-900 text-lg">{selectedOrder.total.toLocaleString()} Ks</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end">
                <Button variant="outline">
                  <Printer className="w-4 h-4 mr-2" />
                  Print Invoice
                </Button>
                <Button>
                  <Mail className="w-4 h-4 mr-2" />
                  Contact Customer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Bulk Invoice Printing Component */}
      {showBulkInvoices && (
        <PrintInvoice 
          orders={orders.filter(order => selectedOrders.includes(order.id))} 
        />
      )}
    </div>
  );
}