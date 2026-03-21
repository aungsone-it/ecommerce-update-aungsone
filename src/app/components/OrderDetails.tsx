import { ArrowLeft, Printer, Mail, User, ShoppingCart, Clock, FileText, MapPin, Phone, Truck, CreditCard, Package } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Invoice } from "./Invoice";
import { useState } from "react";

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
}

interface OrderDetailsProps {
  order: OrderItem;
  onBack: () => void;
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

const getPaymentBadge = (status: PaymentStatus) => {
  const statusConfig = {
    paid: { label: "Paid", className: "bg-green-100 text-green-700 border-green-300" },
    unpaid: { label: "Unpaid", className: "bg-red-100 text-red-700 border-red-300" },
    refunded: { label: "Refunded", className: "bg-slate-100 text-slate-700 border-slate-300" },
  };
  const config = statusConfig[status];
  return <Badge className={`${config.className} border`}>{config.label}</Badge>;
};

const getShippingBadge = (status: ShippingStatus) => {
  const statusConfig = {
    pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    shipped: { label: "Shipped", className: "bg-blue-100 text-blue-700 border-blue-300" },
    delivered: { label: "Delivered", className: "bg-green-100 text-green-700 border-green-300" },
  };
  const config = statusConfig[status];
  return <Badge className={`${config.className} border`}>{config.label}</Badge>;
};

export function OrderDetails({ order, onBack }: OrderDetailsProps) {
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Calculate actual product total from individual product prices with safety checks
  const calculateProductTotal = () => {
    if (!order.products || !Array.isArray(order.products) || order.products.length === 0) {
      return order.subtotal || order.total || 0;
    }
    return order.products.reduce((sum, product) => {
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
              <Button variant="outline" onClick={() => setIsInvoiceOpen(true)}>
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
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Order Status</p>
                      {getStatusBadge(order.status)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Payment Status</p>
                      {getPaymentBadge(order.paymentStatus)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Shipping Status</p>
                      {getShippingBadge(order.shippingStatus)}
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
                    Products ({order.products.length})
                  </h3>
                  <div className="space-y-3">
                    {order.products.map((product) => (
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
                    {order.timeline.map((event, index) => (
                      <div key={index} className="flex items-start gap-4">
                        <div className="relative">
                          <div className="w-3 h-3 bg-blue-600 rounded-full mt-1"></div>
                          {index !== order.timeline.length - 1 && (
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
                        <p className="font-medium text-slate-900">{order.shippingAddress}</p>
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
                      <p className="font-medium text-slate-900 capitalize">
                        {order.paymentMethod === "cod" ? "Cash on Delivery" : 
                         order.paymentMethod === "credit-card" ? "Credit Card" : 
                         order.paymentMethod === "bank-transfer" ? "Bank Transfer" : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Status</p>
                      {getPaymentBadge(order.paymentStatus)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Dialog */}
      <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
            <DialogDescription>
              This is the invoice for order {order.orderNumber}.
            </DialogDescription>
          </DialogHeader>
          <Invoice order={order} />
        </DialogContent>
      </Dialog>
    </div>
  );
}