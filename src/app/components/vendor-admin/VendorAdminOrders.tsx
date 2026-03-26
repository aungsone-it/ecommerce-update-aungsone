import { useState, useEffect } from "react";
import { Search, Download, Eye, Printer, Package, Clock, CheckCircle, XCircle, Calendar, TrendingUp, DollarSign, ShoppingCart, X, Truck, CreditCard, MapPin, Phone, Mail, FileText, User, RefreshCw } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Calendar as CalendarComponent } from "../ui/calendar";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { format } from "date-fns";
import { PrintInvoice } from "../PrintInvoice";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import {
  getCachedVendorOrders,
  invalidateVendorOrdersCache,
  moduleCache,
  dispatchAdminProductsCachePatched,
  CACHE_KEYS,
  getCachedAdminAllProducts,
} from "../../utils/module-cache";
import {
  refreshAdminInventoryAfterOrderStatusPut,
  syncAdminInventoryCacheAfterOrderStatusChange,
  normalizeOrderLineParentProductId,
  isMainMarketplaceVendorName,
} from "../../utils/orderInventoryCacheSync";

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
  total: number;
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
  inventoryDeducted?: boolean;
}

function mapVendorApiOrdersToItems(apiOrders: any[]): OrderItem[] {
  return (apiOrders || []).map((order: any) => ({
    id: order.id,
    orderNumber: order.orderNumber || order.id,
    date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    createdAt: order.createdAt || new Date().toISOString(),
    customer: order.customerName || (typeof order.customer === 'string' ? order.customer : (order.customer?.fullName || order.customer?.name)) || 'Guest Customer',
    email: order.customerEmail || order.email || order.customer?.email || '',
    phone: order.customerPhone || order.phone || order.customer?.phone || '',
    total: parseFloat(order.total) || 0,
    items: order.items?.length || 0,
    status: order.status || 'pending',
    paymentStatus: order.paymentMethod === 'Cash on Delivery' ? 'unpaid' : order.paymentStatus === 'paid' ? 'paid' : 'unpaid',
    shippingStatus: order.status === 'fulfilled' ? 'delivered' : order.status === 'shipped' ? 'shipped' : 'pending',
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
    paymentMethod: order.paymentMethod === 'Cash on Delivery' ? 'cod' : 'credit-card',
    timeline: [
      { status: "Order Placed", date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '', time: order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : '' },
      ...(order.status !== 'pending' ? [{ status: "Processing", date: order.updatedAt ? new Date(order.updatedAt).toISOString().split('T')[0] : '', time: order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString() : '' }] : [])
    ],
    inventoryDeducted: order.inventoryDeducted,
  }));
}

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

interface VendorAdminOrdersProps {
  vendorId: string;
}

export function VendorAdminOrders({ vendorId }: VendorAdminOrdersProps) {
  const [selectedTab, setSelectedTab] = useState("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("processing");
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(() => !moduleCache.peek(CACHE_KEYS.vendorOrders(vendorId)));
  const [listRefreshing, setListRefreshing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showBulkInvoices, setShowBulkInvoices] = useState(false);

  useEffect(() => {
    loadOrders(false);
  }, [vendorId]);

  const loadOrders = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const peeked = moduleCache.peek<any[]>(CACHE_KEYS.vendorOrders(vendorId));
      if (peeked != null && Array.isArray(peeked)) {
        setOrders(mapVendorApiOrdersToItems(peeked));
        setIsLoading(false);
        setListRefreshing(false);
        return;
      }
    }

    setListRefreshing(forceRefresh);
    try {
      setIsLoading(true);
      const raw = await getCachedVendorOrders(vendorId, forceRefresh);
      const transformedOrders = mapVendorApiOrdersToItems(raw);
      setOrders(transformedOrders);
      if (transformedOrders.length > 0) {
        toast.success(`Loaded ${transformedOrders.length} orders`);
      }
    } catch (error: any) {
      console.error("Failed to load orders:", error);
      toast.error(`Failed to load orders: ${error.message || 'Unknown error'}`);
      setOrders([]);
    } finally {
      setIsLoading(false);
      setListRefreshing(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatusFilter = statusFilter === "all" || order.status === statusFilter;
    const matchesPaymentFilter = paymentFilter === "all" || order.paymentStatus === paymentFilter;
    
    const orderDate = new Date(order.date);
    const matchesDateFrom = !dateFrom || orderDate >= dateFrom;
    const matchesDateTo = !dateTo || orderDate <= dateTo;
    
    return matchesSearch && matchesStatusFilter && matchesPaymentFilter && matchesDateFrom && matchesDateTo;
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
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders/${orderId}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({ status: bulkStatus }),
            }
          ).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
            return res;
          })
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

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    const orderBeingUpdated = orders.find((o) => o.id === orderId);
    const previousOrders = [...orders];
    
    setOrders(prevOrders =>
      prevOrders.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      )
    );
    
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder({ ...selectedOrder, status: newStatus });
    }
    
    toast.success(`Order status updated to ${newStatus}`);

    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders/${orderId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const result = (await res.json().catch(() => ({}))) as {
        order?: { inventoryDeducted?: boolean };
      };
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
      if (result?.order?.inventoryDeducted !== undefined) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, inventoryDeducted: result.order!.inventoryDeducted } : o
          )
        );
        if (selectedOrder?.id === orderId) {
          setSelectedOrder((s) =>
            s ? { ...s, inventoryDeducted: result.order!.inventoryDeducted } : s
          );
        }
      }
      invalidateVendorOrdersCache(vendorId);
    } catch (error) {
      console.error("Failed to update order:", error);
      setOrders(previousOrders);
      toast.error("Failed to update order on server");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || paymentFilter !== "all" || dateFrom || dateTo;

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

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const pendingOrders = orders.filter(order => order.status === "pending").length;
  const processingOrders = orders.filter(order => order.status === "processing").length;
  const fulfilledOrders = orders.filter(order => order.status === "fulfilled").length;

  // Status distribution data for pie chart
  const statusDistributionData = [
    { name: "Pending", value: pendingOrders },
    { name: "Processing", value: processingOrders },
    { name: "Fulfilled", value: fulfilledOrders },
    { name: "Cancelled", value: orders.filter(o => o.status === "cancelled").length },
  ].filter(item => item.value > 0);

  // Single Order Detail View
  if (selectedOrder) {
    return (
      <div className="space-y-6">
        {/* Print invoices - hidden, only shown during print */}
        {showBulkInvoices && (
          <div className="print-only">
            {selectedOrders.map(orderId => {
              const order = orders.find(o => o.id === orderId);
              return order ? <PrintInvoice key={order.id} order={order} /> : null;
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
              onClick={() => {
                setSelectedOrders([selectedOrder.id]);
                setShowBulkInvoices(true);
                setTimeout(() => {
                  window.print();
                  setTimeout(() => {
                    setShowBulkInvoices(false);
                    setSelectedOrders([]);
                  }, 500);
                }, 100);
              }}
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
                <Select
                  value={selectedOrder.status}
                  onValueChange={(value) => handleStatusChange(selectedOrder.id, value as OrderStatus)}
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="ready-to-ship">Ready to Ship</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>Payment Status</Label>
                <div className="pt-2">{getPaymentBadge(selectedOrder.paymentStatus)}</div>
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
                <span className="font-medium">${selectedOrder.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Shipping</span>
                <span className="font-medium">$0.00</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">${selectedOrder.total.toFixed(2)}</span>
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
                    <p className="font-semibold text-slate-900">${(product.price * product.quantity).toFixed(2)}</p>
                    <p className="text-sm text-slate-600">${product.price.toFixed(2)} each</p>
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

  // Main Orders List View - EXACT COPY FROM MIGOO
  return (
    <div className="p-8">
      {/* Print invoices - hidden, only shown during print */}
      {showBulkInvoices && (
        <div className="print-only">
          {selectedOrders.map(orderId => {
            const order = orders.find(o => o.id === orderId);
            return order ? <PrintInvoice key={order.id} order={order} /> : null;
          })}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Orders</h1>
        <p className="text-slate-600">Manage and track all your orders</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
              <p className="text-2xl font-semibold text-slate-900">
                ${totalRevenue.toFixed(2)}
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
              <p className="text-sm text-slate-600 mb-1">Pending</p>
              <p className="text-2xl font-semibold text-slate-900">{pendingOrders}</p>
              <p className="text-sm text-slate-500 mt-2">Needs attention</p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Processing</p>
              <p className="text-2xl font-semibold text-slate-900">{processingOrders}</p>
              <p className="text-sm text-slate-500 mt-2">In progress</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Fulfilled</p>
              <p className="text-2xl font-semibold text-slate-900">{fulfilledOrders}</p>
              <p className="text-sm text-slate-500 mt-2">Completed</p>
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Total</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Payment</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Shipping</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        Loading orders...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No orders found
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
                            <p className="font-medium text-slate-900">{order.orderNumber}</p>
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
                        <td className="py-3 px-4 text-sm font-semibold text-slate-900">${order.total.toFixed(2)}</td>
                        <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                        <td className="py-3 px-4">{getPaymentBadge(order.paymentStatus)}</td>
                        <td className="py-3 px-4">{getShippingBadge(order.shippingStatus)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)} title="View Details">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
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
              </CardContent>
            </Card>

            {/* Payment Methods */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
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

      {/* Bulk Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Invoices</DialogTitle>
            <DialogDescription>
              Print {selectedOrders.length} invoice(s)?
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
    </div>
  );
}