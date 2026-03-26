import { useState, useEffect } from "react";
import { Search, Download, Eye, Printer, Package, Clock, CheckCircle, XCircle, Calendar, TrendingUp, DollarSign, ShoppingCart, X, Truck, CreditCard, MapPin, Phone, Mail, FileText, User, RefreshCw } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { Calendar as CalendarComponent } from "./ui/calendar";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { format } from "date-fns";
import { PrintInvoice } from "./PrintInvoice";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ordersApi } from "../../utils/api";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { useLanguage } from "../contexts/LanguageContext";
import {
  getCachedAdminOrdersPayload,
  invalidateAdminOrdersCache,
  moduleCache,
  dispatchAdminProductsCachePatched,
  CACHE_KEYS as MODULE_CACHE_KEYS,
} from "../utils/module-cache";
import { syncAdminInventoryCacheAfterOrderStatusChange } from "../utils/orderInventoryCacheSync";

type OrderStatus = "pending" | "processing" | "fulfilled" | "cancelled" | "ready-to-ship";
type PaymentStatus = "paid" | "unpaid" | "refunded";
type ShippingStatus = "pending" | "shipped" | "delivered";

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
  trackingNumber?: string;
  notes?: string;
  deliveryService?: string;
  deliveryServiceLogo?: string;
  paymentMethod?: "credit-card" | "cod" | "bank-transfer";
  timeline: {
    status: string;
    date: string;
    time: string;
  }[];
  /** Mirrors server order payload — false until fulfilled/ready-to-ship deducts stock */
  inventoryDeducted?: boolean;
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

const getStatusBadge = (status: OrderStatus) => {
  const variants = {
    pending: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock, label: "Pending" },
    processing: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Package, label: "Processing" },
    fulfilled: { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, label: "Fulfilled" },
    cancelled: { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: "Cancelled" },
    "ready-to-ship": { color: "bg-purple-100 text-purple-700 border-purple-200", icon: Package, label: "Ready to Ship" },
  };
  
  const variant = variants[status];
  const Icon = variant.icon;
  
  return (
    <Badge variant="secondary" className={`${variant.color} hover:${variant.color} border font-medium text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {variant.label}
    </Badge>
  );
};

const getPaymentBadge = (status: PaymentStatus) => {
  const variants = {
    paid: { color: "bg-green-100 text-green-700 border-green-200" },
    unpaid: { color: "bg-amber-100 text-amber-700 border-amber-200" },
    refunded: { color: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  
  return (
    <Badge variant="secondary" className={`${variants[status].color} hover:${variants[status].color} border text-xs`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

const getShippingBadge = (status: ShippingStatus) => {
  const variants = {
    pending: { color: "bg-slate-100 text-slate-700 border-slate-200" },
    shipped: { color: "bg-blue-100 text-blue-700 border-blue-200" },
    delivered: { color: "bg-green-100 text-green-700 border-green-200" },
  };
  
  return (
    <Badge variant="secondary" className={`${variants[status].color} hover:${variants[status].color} border text-xs`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

function mapApiOrdersToOrderItems(apiOrders: any[]): OrderItem[] {
  return (apiOrders || []).map((order: any) => ({
    id: order.id,
    orderNumber: order.orderNumber || order.id,
    date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    createdAt: order.createdAt || new Date().toISOString(),
    customer: order.customer?.fullName || order.customer?.name || order.customerName || (typeof order.customer === 'string' ? order.customer : null) || (order.customer?.firstName && order.customer?.lastName ? `${order.customer.firstName} ${order.customer.lastName}` : order.customer?.firstName || order.customer?.lastName || 'Guest Customer'),
    email: order.email || order.customer?.email || '',
    phone: order.phone || order.customer?.phone || '',
    vendor: order.vendor || 'SECURE Store',
    total: parseFloat(order.total) || 0,
    subtotal: order.subtotal != null && order.subtotal !== '' ? parseFloat(String(order.subtotal)) : undefined,
    discount: order.discount != null && order.discount !== '' ? parseFloat(String(order.discount)) : undefined,
    couponCode: order.couponCode,
    items: order.items?.length || 0,
    status: order.status || 'pending',
    paymentStatus: order.paymentMethod === 'Cash on Delivery' ? 'unpaid' : 'paid',
    shippingStatus: order.status === 'delivered' ? 'delivered' : order.status === 'shipped' ? 'shipped' : 'pending',
    products: (order.items || []).map((item: any) => ({
      id: item.productId || item.id,
      name: item.name || 'Product',
      quantity: item.quantity || 1,
      price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price || '0').replace(/[$,]/g, '')) || 0,
      image: item.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop',
      sku: item.sku || 'N/A'
    })),
    shippingAddress: order.shippingAddress || '',
    trackingNumber: order.trackingNumber,
    notes: order.notes,
    deliveryService: order.deliveryService,
    deliveryServiceLogo: order.deliveryServiceLogo,
    paymentMethod: order.paymentMethod === 'Cash on Delivery' ? 'cod' : 'credit-card',
    timeline: [
      { status: "Order Placed", date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '', time: order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : '' },
      ...(order.status !== 'pending' ? [{ status: "Processing", date: order.updatedAt ? new Date(order.updatedAt).toISOString().split('T')[0] : '', time: order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString() : '' }] : [])
    ],
    inventoryDeducted: order.inventoryDeducted,
  }));
}

export function Orders({ onViewOrder, onOrderUpdate }: { 
  onViewOrder?: (order: OrderItem) => void;
  onOrderUpdate?: () => void;
}) {
  const { t } = useLanguage();
  const [selectedTab, setSelectedTab] = useState("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("processing");
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(() => !moduleCache.peek(MODULE_CACHE_KEYS.ADMIN_ORDERS));
  const [listRefreshing, setListRefreshing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showBulkInvoices, setShowBulkInvoices] = useState(false); // For printing multiple invoices

  // Load orders from database
  useEffect(() => {
    loadOrders();
    
    // 🔨 Trigger cache rebuild in background if needed
    const triggerCacheRebuild = async () => {
      try {
        await fetch(`${projectId.includes('localhost') ? 'http://localhost:54321' : `https://${projectId}.supabase.co`}/functions/v1/make-server-16010b6f/rebuild-cache`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('🔨 Cache rebuild triggered');
      } catch (error) {
        console.log('ℹ️ Could not trigger cache rebuild:', error);
      }
    };
    triggerCacheRebuild();
  }, []);

  const loadOrders = async (forceRefresh = false) => {
    let showLoadingTimer: NodeJS.Timeout | null = null;
    showLoadingTimer = setTimeout(() => {
      setIsLoading(true);
    }, 300);

    if (!forceRefresh) {
      const peeked = moduleCache.peek<{ orders: any[]; warning?: string }>(MODULE_CACHE_KEYS.ADMIN_ORDERS);
      if (peeked != null && Array.isArray(peeked.orders)) {
        const transformedOrders = mapApiOrdersToOrderItems(peeked.orders);
        setOrders(transformedOrders);
        if (peeked.warning) {
          toast.warning(peeked.warning, { duration: 4000 });
        }
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setIsLoading(false);
        setListRefreshing(false);
        return;
      }
    }

    setListRefreshing(forceRefresh);
    try {
      try {
        const healthCheck = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/health`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        if (!healthCheck.ok) {
          console.warn("⚠️ Server health check failed, but continuing anyway...");
        } else {
          console.log("✅ Server is healthy");
        }
      } catch (healthError) {
        console.warn("⚠️ Server health check failed:", healthError);
        toast.warning("Server is starting up, this may take a moment...", { duration: 3000 });
      }

      const payload = await getCachedAdminOrdersPayload(forceRefresh);
      console.log("Orders loaded:", payload);

      if (payload.warning) {
        console.warn("⚠️ Server warning:", payload.warning);
        toast.warning(payload.warning, { duration: 4000 });
      }

      const transformedOrders = mapApiOrdersToOrderItems(payload.orders || []);
      setOrders(transformedOrders);
      if (transformedOrders.length > 0) {
        toast.success(`Loaded ${transformedOrders.length} orders`);
      }
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
        toast.error(`Failed to load orders: ${error.message || 'Unknown error'}`, { duration: 5000 });
      }
      setOrders([]);
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setIsLoading(false);
      setListRefreshing(false);
    }
  };

  // Get unique vendors for the filter dropdown
  const uniqueVendors = Array.from(new Set(orders.map(order => order.vendor))).sort();

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatusFilter = statusFilter === "all" || order.status === statusFilter;
    const matchesPaymentFilter = paymentFilter === "all" || order.paymentStatus === paymentFilter;
    const matchesVendorFilter = vendorFilter === "all" || order.vendor === vendorFilter;
    
    const orderDate = new Date(order.date);
    const matchesDateFrom = !dateFrom || orderDate >= dateFrom;
    const matchesDateTo = !dateTo || orderDate <= dateTo;
    
    return matchesSearch && matchesStatusFilter && matchesPaymentFilter && matchesVendorFilter && matchesDateFrom && matchesDateTo;
  }).sort((a, b) => {
    // Use createdAt timestamp for accurate sorting, fallback to date string
    const dateA = new Date(a.createdAt || a.date);
    const dateB = new Date(b.createdAt || b.date);
    return sortOrder === "newest" ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
  });

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

  const toggleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(order => order.id));
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
    console.log("🖨️ Printing invoices for orders:", selectedOrders);
    
    // Get the selected orders
    const ordersToPrint = orders.filter(order => selectedOrders.includes(order.id));
    console.log("📦 Orders to print:", ordersToPrint);
    console.log("📦 First order data:", ordersToPrint[0]);
    
    setIsPrintDialogOpen(false);
    
    // Show bulk invoices for printing
    setShowBulkInvoices(true);
    
    // Wait for DOM to update, then print
    setTimeout(() => {
      window.print();
      
      // Hide bulk invoices and clear selection after print dialog closes
      // Use longer timeout to ensure print dialog fully closes
      setTimeout(() => {
        setShowBulkInvoices(false);
        setSelectedOrders([]);
      }, 1000);
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
    
    // Close dialog and clear selection immediately
    setIsStatusDialogOpen(false);
    const updatedCount = selectedOrders.length;
    const orderIds = [...selectedOrders];
    setSelectedOrders([]);
    
    // Show instant feedback
    toast.success(`${updatedCount} orders updated instantly!`, { duration: 2000 });
    onOrderUpdate?.();
    
    // Sync with server in background
    try {
      await Promise.all(
        orderIds.map(orderId => 
          ordersApi.update(orderId, { status: bulkStatus })
        )
      );
      console.log(`✅ ${updatedCount} orders synced to server: ${bulkStatus}`);
      for (const orderId of orderIds) {
        const o = previousOrders.find((x) => x.id === orderId);
        if (o) {
          syncAdminInventoryCacheAfterOrderStatusChange(
            {
              status: o.status,
              inventoryDeducted: o.inventoryDeducted,
              products: o.products,
            },
            bulkStatus,
            { skipDispatch: true }
          );
        }
      }
      dispatchAdminProductsCachePatched();
      invalidateAdminOrdersCache();
    } catch (error) {
      // Roll back on error
      console.error("❌ Failed to bulk update orders:", error);
      setOrders(previousOrders);
      toast.error("Failed to save changes. Updates reverted.");
      onOrderUpdate?.();
    }
  };

  // Handle status change for single order
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    // Find the order being updated
    const orderBeingUpdated = orders.find(o => o.id === orderId);
    const wasNotCancelled = orderBeingUpdated?.status !== 'cancelled';
    const isNowCancelled = newStatus === 'cancelled';
    
    // OPTIMISTIC UPDATE - Update UI immediately!
    const previousOrders = [...orders];
    
    setOrders(prevOrders =>
      prevOrders.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      )
    );
    
    // Show instant feedback with stock restoration notice
    if (wasNotCancelled && isNowCancelled) {
      toast.success("Order cancelled! Stock has been restored.", { 
        duration: 3000,
        description: "Product inventory has been updated automatically."
      });
    } else {
      toast.success("Status updated!", { duration: 1500 });
    }
    onOrderUpdate?.();
    
    // Sync with server in background
    try {
      const result = (await ordersApi.update(orderId, { status: newStatus })) as {
        order?: { inventoryDeducted?: boolean };
      };
      console.log(`✅ Order ${orderId} status synced to server: ${newStatus}`);
      if (orderBeingUpdated) {
        syncAdminInventoryCacheAfterOrderStatusChange(
          {
            status: orderBeingUpdated.status,
            inventoryDeducted: orderBeingUpdated.inventoryDeducted,
            products: orderBeingUpdated.products,
          },
          newStatus
        );
      }
      if (result?.order?.inventoryDeducted !== undefined) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, inventoryDeducted: result.order!.inventoryDeducted } : o
          )
        );
      }
      invalidateAdminOrdersCache();
    } catch (error) {
      // Roll back on error
      console.error("❌ Failed to update order status:", error);
      setOrders(previousOrders);
      toast.error("Failed to save status. Changes reverted.");
      onOrderUpdate?.();
    }
  };

  // Clear all test orders
  const handleClearAllOrders = async () => {
    if (!confirm("⚠️ Are you sure you want to delete ALL orders? This action cannot be undone!")) {
      return;
    }

    try {
      const response = await ordersApi.deleteAll();
      toast.success(response.message || "All orders cleared successfully!");
      setOrders([]);
      invalidateAdminOrdersCache();
      onOrderUpdate?.();
    } catch (error) {
      console.error("❌ Failed to clear orders:", error);
      toast.error("Failed to delete orders");
    }
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
      ...filteredOrders.map(o => 
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

  // 🔥 Exclude cancelled orders from total revenue calculation
  const totalRevenue = orders
    .filter(order => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.total, 0);
  const pendingOrders = orders.filter(order => order.status === "pending").length;
  const processingOrders = orders.filter(order => order.status === "processing").length;
  const fulfilledOrders = orders.filter(order => order.status === "fulfilled").length;

  // Prepare status distribution for pie chart
  const statusDistributionData = [
    { name: "Pending", value: pendingOrders },
    { name: "Processing", value: processingOrders },
    { name: "Fulfilled", value: fulfilledOrders },
    { name: "Cancelled", value: orders.filter(o => o.status === "cancelled").length },
  ];

  // Prepare vendor revenue for bar chart
  const vendorRevenueData = uniqueVendors.map(vendor => ({
    vendor,
    revenue: orders.filter(o => o.vendor === vendor).reduce((sum, o) => sum + o.total, 0)
  }));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('orders.title')}</h1>
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-blue-700">{t('orders.loading')}</span>
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
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders">
          {/* Toolbar */}
          <Card className="mb-4">
            <div className="p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-slate-900">All Orders ({filteredOrders.length})</h3>
                <div className="flex items-center gap-2">
                  {selectedOrders.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleBulkStatusUpdate}>
                        <Package className="w-4 h-4 mr-2" />
                        Update Status ({selectedOrders.length})
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleBulkPrint}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print ({selectedOrders.length})
                      </Button>
                    </>
                  )}
                  {orders.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleClearAllOrders}
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear All ({orders.length})
                    </Button>
                  )}
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      <X className="w-4 h-4 mr-2" />
                      Clear Filters
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={exportOrders}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={listRefreshing || isLoading}
                    onClick={() => loadOrders(true)}
                    className="border-slate-300"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${listRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search orders..."
                    className="pl-10 border-slate-300"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as "newest" | "oldest")}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">🆕 Newest First</SelectItem>
                    <SelectItem value="oldest">📅 Oldest First</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="ready-to-ship">Ready to Ship</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder="Payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] border-slate-300">
                    <SelectValue placeholder="Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {uniqueVendors.map(vendor => (
                      <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-[120px] justify-start border-slate-300">
                      <Calendar className="w-4 h-4 mr-2" />
                      {dateFrom ? format(dateFrom, "MMM dd") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-[120px] justify-start border-slate-300">
                      <Calendar className="w-4 h-4 mr-2" />
                      {dateTo ? format(dateTo, "MMM dd") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </Card>

          {/* Orders Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4">
                      <Checkbox
                        checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Order</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Customer</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Vendor</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Total</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Payment</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Shipping</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Actions</th>
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
                  ) : filteredOrders.length === 0 ? (
                    // Empty state
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 text-lg font-medium">No orders found</p>
                        <p className="text-slate-400 text-sm mt-1">
                          {hasActiveFilters ? "Try adjusting your filters" : "Orders will appear here once customers place them"}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
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
                            {order.items} items
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
                      <td className="py-3 px-4 text-sm text-slate-600">{order.vendor}</td>
                      <td className="py-3 px-4 text-sm font-semibold text-slate-900">{order.total.toLocaleString()} MMK</td>
                      <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                      <td className="py-3 px-4">{getPaymentBadge(order.paymentStatus)}</td>
                      <td className="py-3 px-4">{getShippingBadge(order.shippingStatus)}</td>
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
                                Mark as Pending
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "processing")}>
                                Mark as Processing
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "fulfilled")}>
                                Mark as Fulfilled
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(order.id, "cancelled")}>
                                Mark as Cancelled
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
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue & Orders Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue ($)" />
                  <Line type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} name="Orders" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Order Status Distribution</CardTitle>
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
                <CardTitle>Revenue by Vendor</CardTitle>
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
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Update status for {selectedOrders.length} selected order(s)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="status" className="mb-2">Select Status</Label>
            <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value as OrderStatus)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="ready-to-ship">Ready to Ship</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveBulkStatusUpdate}>
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Invoices</DialogTitle>
            <DialogDescription>
              Print invoices for {selectedOrders.length} selected order(s)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={executeBulkPrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
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
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <div>
                  <p className="text-sm text-slate-500">Payment Status</p>
                  {getPaymentBadge(selectedOrder.paymentStatus)}
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
                      <p className="font-medium text-slate-900">{selectedOrder.shippingAddress}</p>
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