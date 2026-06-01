import { ArrowLeft, Printer, Mail, User, ShoppingCart, Clock, FileText, MapPin, Phone, Truck, CreditCard, Package, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { PrintInvoice } from "./PrintInvoice";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { ordersApi } from "../../utils/api";
import { ApiError } from "../../utils/api-client";
import { useInvoicePrintJob } from "../utils/invoicePrintSession";
import { toInvoiceSheetOrder } from "../utils/invoiceOrderMapper";
import type { InvoiceSheetOrder } from "./InvoiceSheet";
import {
  refreshAdminInventoryAfterOrderStatusPut,
  normalizeOrderLineParentProductId,
} from "../utils/orderInventoryCacheSync";
import { invalidateAdminOrdersCache } from "../utils/module-cache";
import {
  isKPayPaidOrderLike,
  pollKPayRefundAfterCancel,
} from "../utils/kpayRefundPolling";

import {
  derivePaymentStatusFromOrder,
  deriveShippingStatusFromOrder,
  normalizeAdminOrderStatusForBadge,
  normalizePaymentBadgeStatus,
  normalizeShippingBadgeStatus,
} from "../utils/normalizeOrderBadgeStatus";
import {
  deriveOrderPaymentMethodKey,
  formatOrderPaymentMethodFromOrder,
} from "../utils/orderPaymentMethod";
import { OrderShippingAddressBlock } from "./OrderShippingAddressBlock";

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
  customer: string | { fullName?: string; name?: string };
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
  kpay?: unknown;
  timeline: {
    status: string;
    date: string;
    time: string;
  }[];
  inventoryDeducted?: boolean;
}

interface OrderDetailsProps {
  order: OrderItem;
  onBack: () => void;
  /** Called after a successful order status update (e.g. refresh badges). */
  onOrderUpdated?: () => void;
}

const getStatusBadge = (status: OrderStatus) => {
  const statusConfig = {
    pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-300" },
    fulfilled: { label: "Fulfilled", className: "bg-green-100 text-green-700 border-green-300" },
    cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 border-red-300" },
    "ready-to-ship": { label: "Ready to Ship", className: "bg-purple-100 text-purple-700 border-purple-300" },
  };
  const config = statusConfig[status];
  return <Badge className={`${config.className} border`}>{config.label}</Badge>;
};

function normalizeOrderStatus(status: unknown): OrderStatus {
  const key = normalizeAdminOrderStatusForBadge(status);
  if (key === "ready-to-ship") return "ready-to-ship";
  return key;
}

function normalizePaymentStatus(status: unknown): PaymentStatus {
  const key = normalizePaymentBadgeStatus(status);
  if (key === "pending-refund") return "pending_refund";
  return key;
}

function normalizeShippingStatus(status: unknown): ShippingStatus {
  return normalizeShippingBadgeStatus(status);
}

const getPaymentBadge = (status: PaymentStatus | string) => {
  const statusConfig = {
    paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-300" },
    unpaid: { label: "Unpaid", className: "bg-red-100 text-red-700 border-red-300" },
    refunded: { label: "Refunded", className: "bg-slate-100 text-slate-700 border-slate-300" },
    pending_refund: { label: "Refund", className: "bg-orange-100 text-orange-800 border-orange-300" },
    "pending-refund": { label: "Refund", className: "bg-orange-100 text-orange-800 border-orange-300" },
  };
  const normalized = normalizePaymentStatus(status);
  const config =
    statusConfig[normalized as keyof typeof statusConfig] ||
    statusConfig[String(status).replace(/_/g, "-") as keyof typeof statusConfig] ||
    statusConfig.unpaid;
  return <Badge className={`${config.className} border`}>{config.label}</Badge>;
};

const getShippingBadge = (status: ShippingStatus | string) => {
  const statusConfig = {
    pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    shipped: { label: "Shipped", className: "bg-blue-100 text-blue-700 border-blue-300" },
    delivered: { label: "Delivered", className: "bg-green-100 text-green-700 border-green-300" },
    cancelled: { label: "Cancel", className: "bg-red-100 text-red-700 border-red-300" },
  };
  const normalized = normalizeShippingStatus(status);
  const config = statusConfig[normalized];
  return <Badge className={`${config.className} border`}>{config.label}</Badge>;
};

export function OrderDetails({ order, onBack, onOrderUpdated }: OrderDetailsProps) {
  const [printOrders, setPrintOrders] = useState<InvoiceSheetOrder[] | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(normalizeOrderStatus(order.status));
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    () => normalizePaymentStatus(derivePaymentStatusFromOrder(order)) as PaymentStatus
  );
  const [shippingStatus, setShippingStatus] = useState<ShippingStatus>(() =>
    deriveShippingStatusFromOrder(order)
  );
  const [statusSaving, setStatusSaving] = useState(false);
  const orderProducts = (Array.isArray(order.products) ? order.products : []).filter(
    (p): p is Product => !!p && typeof p === "object"
  );
  const orderTimeline = (Array.isArray(order.timeline) ? order.timeline : []).filter(
    (e): e is { status: string; date: string; time: string } => !!e && typeof e === "object"
  );
  const paymentBadgeStatus = paymentStatus;
  const shippingBadgeStatus = shippingStatus;

  useEffect(() => {
    setOrderStatus(normalizeOrderStatus(order.status));
    setPaymentStatus(normalizePaymentStatus(derivePaymentStatusFromOrder(order)) as PaymentStatus);
    setShippingStatus(deriveShippingStatusFromOrder(order));
  }, [order.id, order.status, order.paymentStatus, order.shippingStatus]);

  // Calculate actual product total from individual product prices with safety checks
  const calculateProductTotal = () => {
    if (orderProducts.length === 0) {
      return order.subtotal || order.total || 0;
    }
    return orderProducts.reduce((sum, product) => {
      const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
      const quantity = typeof product.quantity === 'number' ? product.quantity : parseInt(product.quantity) || 0;
      return sum + (price * quantity);
    }, 0);
  };

  const productTotal = calculateProductTotal();
  const actualDiscount = order.discount || (productTotal - (order.subtotal || order.total));
  const hasDiscount = actualDiscount > 0; // Show discount whenever there's a discount amount
  const displaySubtotal = productTotal; // Show product total BEFORE discount
  
  // Calculate discount percentage
  const discountPercentage = displaySubtotal > 0 ? Math.round((actualDiscount / displaySubtotal) * 100) : 0;

  const invoiceSheetOrder = useMemo(() => toInvoiceSheetOrder({
    ...order,
    products: orderProducts,
  }), [order, orderProducts]);

  const clearPrintOrders = useCallback(() => setPrintOrders(null), []);

  useInvoicePrintJob(printOrders, clearPrintOrders);

  const handlePrintInvoice = () => {
    setPrintOrders([invoiceSheetOrder]);
  };

  const handleOrderStatusChange = async (newStatus: OrderStatus) => {
    if (newStatus === orderStatus) return;
    const wasNotCancelled = orderStatus !== "cancelled";
    const isNowCancelled = newStatus === "cancelled";
    const wasKPayPaid = isKPayPaidOrderLike(order);
    const snapshot = {
      status: orderStatus,
      inventoryDeducted: order.inventoryDeducted,
      vendor: typeof order.vendor === "string" ? order.vendor : undefined,
      products: orderProducts.map((p) => ({
        id: normalizeOrderLineParentProductId(p.id),
        quantity: p.quantity,
        sku: p.sku,
      })),
    };
    setStatusSaving(true);
    try {
      const result = (await ordersApi.update(order.id, { status: newStatus })) as {
        order?: {
          status?: string;
          paymentStatus?: string;
          shippingStatus?: string;
          kpay?: { refund?: { status?: string }; status?: string };
        };
      };
      try {
        await refreshAdminInventoryAfterOrderStatusPut(snapshot, newStatus);
      } catch (invErr) {
        console.warn("[inventory] post-status cache sync failed:", invErr);
      }
      setOrderStatus(newStatus);
      const srv = result?.order;
      if (srv) {
        setPaymentStatus(
          normalizePaymentStatus(derivePaymentStatusFromOrder({ ...order, ...srv, status: newStatus })) as PaymentStatus
        );
        setShippingStatus(deriveShippingStatusFromOrder({ ...order, ...srv, status: newStatus }));
      } else if (newStatus === "cancelled") {
        setPaymentStatus(order.paymentStatus === "refunded" ? "refunded" : "pending_refund");
        setShippingStatus("cancelled");
      }
      // Keep Orders/Finances views consistent across quick navigation and tabs.
      invalidateAdminOrdersCache();
      if (wasNotCancelled && isNowCancelled && wasKPayPaid) {
        toast.message("Order cancelled", {
          duration: 4000,
          description: "KBZPay refund is processing — status will update automatically.",
        });
        pollKPayRefundAfterCancel({
          orderId: order.id,
          orderNumber: order.orderNumber,
          onSuccess: (orderData) => {
            setPaymentStatus(
              normalizePaymentStatus(
                derivePaymentStatusFromOrder({ ...order, ...orderData, status: "cancelled" })
              ) as PaymentStatus
            );
            setShippingStatus(
              deriveShippingStatusFromOrder({ ...order, ...orderData, status: "cancelled" })
            );
            onOrderUpdated?.();
          },
        });
      } else {
        toast.success("Order status updated");
      }
      onOrderUpdated?.();
    } catch (e) {
      console.error(e);
      const detail =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unknown error";
      toast.error("Failed to update order status", { description: detail, duration: 8000 });
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Orders
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Order {order.orderNumber}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Placed on {order.date}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handlePrintInvoice}>
                <Printer className="w-4 h-4 mr-2" />
                Print Invoice
              </Button>
              <Button>
                <Mail className="w-4 h-4 mr-2" />
                Contact Customer
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Main Details */}
            <div className="col-span-2 space-y-6">
              {/* Order Status Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Order Status</h3>
                  <div className="mb-4 max-w-xs">
                    <p className="text-sm text-slate-500 mb-2">Update status</p>
                    <Select
                      value={orderStatus}
                      onValueChange={(v) => handleOrderStatusChange(v as OrderStatus)}
                      disabled={statusSaving}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="ready-to-ship">Ready to Ship</SelectItem>
                        <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    {statusSaving && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Updating…
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Order Status</p>
                      {getStatusBadge(orderStatus)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Payment Status</p>
                      {getPaymentBadge(paymentBadgeStatus)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Shipping Status</p>
                      {getShippingBadge(shippingBadgeStatus)}
                    </div>
                  </div>
                  {order.deliveryService && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-sm text-slate-500 mb-2">Delivery Service</p>
                      <div className="flex items-center gap-3">
                        {order.deliveryServiceLogo && (
                          <img 
                            src={order.deliveryServiceLogo} 
                            alt={order.deliveryService} 
                            className="w-10 h-10 rounded object-cover"
                          />
                        )}
                        <div>
                          <p className="font-semibold text-purple-600">{order.deliveryService}</p>
                          {order.paymentMethod === "cod" && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 mt-1">
                              💰 Cash on Delivery
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Products Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Products ({orderProducts.length})
                  </h3>
                  <div className="space-y-3">
                    {orderProducts.map((product) => (
                      <div key={product.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                        <img 
                          src={product.image} 
                          alt={product.sku} 
                          className="w-20 h-20 object-cover rounded-lg border border-slate-200" 
                        />
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{product.sku}</p>
                          <p className="text-sm text-slate-500 mt-1">Quantity: {product.quantity}</p>
                        </div>
                        <p className="font-semibold text-slate-900 text-lg">{product.price.toLocaleString()} Ks</p>
                      </div>
                    ))}
                  </div>

                  {/* Order Summary */}
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="space-y-3">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="font-medium">{displaySubtotal.toLocaleString()} Ks</span>
                      </div>
                      {hasDiscount && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600">
                            {order.couponCode ? `Coupon - ${order.couponCode}` : 'Discount'}
                          </span>
                          <span className="font-medium text-green-600">-{actualDiscount.toLocaleString()} Ks ({discountPercentage}%)</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>Shipping</span>
                        <span className="font-medium">Free</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t border-slate-200">
                        <span className="font-semibold text-slate-900 text-lg">Total</span>
                        <span className="font-bold text-slate-900 text-xl">{order.total.toLocaleString()} Ks</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Timeline Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Order Timeline
                  </h3>
                  <div className="space-y-4">
                    {orderTimeline.map((event, index) => (
                      <div key={index} className="flex items-start gap-4">
                        <div className="relative">
                          <div className="w-3 h-3 bg-blue-600 rounded-full mt-1"></div>
                          {index !== orderTimeline.length - 1 && (
                            <div className="absolute left-1/2 top-4 w-0.5 h-8 bg-slate-200 -translate-x-1/2"></div>
                          )}
                        </div>
                        <div className="flex-1 pb-6">
                          <p className="font-medium text-slate-900">{event.status}</p>
                          <p className="text-sm text-slate-500 mt-1">{event.date} at {event.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Notes Card */}
              {order.notes && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Notes
                    </h3>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-slate-700">{order.notes}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Customer & Shipping Info */}
            <div className="space-y-6">
              {/* Customer Information Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Customer
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Name</p>
                      <p className="font-medium text-slate-900">{typeof order.customer === 'string' ? order.customer : (order.customer?.fullName || order.customer?.name || 'Guest Customer')}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Mail className="w-4 h-4 text-slate-400 mt-1" />
                      <div>
                        <p className="text-sm text-slate-500 mb-1">Email</p>
                        <p className="font-medium text-slate-900">{order.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="w-4 h-4 text-slate-400 mt-1" />
                      <div>
                        <p className="text-sm text-slate-500 mb-1">Phone</p>
                        <p className="font-medium text-slate-900">{order.phone}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vendor Information Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Vendor
                  </h3>
                  <p className="font-medium text-slate-900">{order.vendor}</p>
                </CardContent>
              </Card>

              {/* Shipping Information Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Truck className="w-5 h-5" />
                    Shipping
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                      <div>
                        <p className="text-sm text-slate-500 mb-1">Address</p>
                        <OrderShippingAddressBlock order={order} />
                      </div>
                    </div>
                    {order.trackingNumber && (
                      <div className="pt-3 border-t border-slate-200">
                        <p className="text-sm text-slate-500 mb-1">Tracking Number</p>
                        <p className="font-mono font-medium text-slate-900 text-sm">{order.trackingNumber}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Payment Information Card */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Payment
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Method</p>
                      <p className="font-medium text-slate-900">
                        {formatOrderPaymentMethodFromOrder({
                          paymentMethod: order.paymentMethod,
                          kpay: order.kpay,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Status</p>
                      {getPaymentBadge(paymentBadgeStatus)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {printOrders && <PrintInvoice orders={printOrders} />}
    </div>
  );
}