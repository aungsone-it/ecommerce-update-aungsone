import { Check, Package, ChevronLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface CartItem {
  sku: string;
  name?: string;
  image: string;
  price: string;
  quantity: number;
}

interface OrderDetailViewProps {
  order: any;
  onBack: () => void;
  formatPriceMMK: (price: string) => string;
}

export function OrderDetailView({ order, onBack, formatPriceMMK }: OrderDetailViewProps) {
  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center p-8">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Order not found</p>
          <Button onClick={onBack} className="mt-4 bg-amber-600 hover:bg-amber-700">
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
      case 'fulfilled':
        return 'bg-emerald-600';
      case 'processing':
        return 'bg-blue-600';
      case 'shipped':
      case 'ready-to-ship':
        return 'bg-amber-600';
      case 'cancelled':
        return 'bg-red-600';
      default:
        return 'bg-slate-600';
    }
  };

  const getStatusLabel = (status: string) => {
    if (status?.toLowerCase() === 'ready-to-ship') {
      return 'Shipping';
    }
    return status || 'Pending';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center py-8">
      <div className="max-w-2xl w-full mx-auto px-4">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="mb-4 hover:bg-white"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Button>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          {/* Success Icon */}
          <div className={`w-20 h-20 ${order.status === 'cancelled' ? 'bg-red-500' : 'bg-green-500'} rounded-full flex items-center justify-center mx-auto mb-6`}>
            <Check className="w-10 h-10 text-white" strokeWidth={3} />
          </div>
          
          {/* Title */}
          <h1 className="text-base sm:text-lg font-bold text-slate-900 mb-2 text-center">Order Summary</h1>
          <p className="text-sm text-cyan-600 mb-8 text-center">
            Thank you for choosing SECURE. Here are your order details.
          </p>
          
          {/* Order Number & Status */}
          <div className="bg-orange-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-600">Order Number</p>
              <span 
                className={`text-xs px-2.5 py-1 rounded-full text-white font-medium ${getStatusColor(order.status)}`}
              >
                {getStatusLabel(order.status)}
              </span>
            </div>
            <p className="text-xl font-bold text-orange-600 text-center">{order.orderNumber}</p>
            <p className="text-xs text-slate-500 text-center mt-1">
              {new Date(order.createdAt || order.date).toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          
          {/* Customer Information */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center justify-between">
              <span className="text-sm text-cyan-600">Customer Name</span>
              <span className="text-sm font-semibold text-slate-900">
                {order.customer?.name || order.customer?.fullName || order.customerName || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-cyan-600">Phone</span>
              <span className="text-sm font-semibold text-slate-900">
                {order.customer?.phone || order.phone || 'N/A'}
              </span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm text-cyan-600">Delivery Address</span>
              <span className="text-sm font-semibold text-right text-slate-900 leading-relaxed max-w-[70%]">
                {order.customer?.address ? 
                  `${order.customer.address}, ${order.customer.city || ''} ${order.customer.zipCode || ''}, ${order.customer.country || ''}` 
                  : order.shippingAddress || order.address || 'N/A'}
              </span>
            </div>
            {(order.customer?.notes || order.notes) && (
              <div className="flex items-start justify-between">
                <span className="text-sm text-cyan-600">Order Note</span>
                <span className="text-sm font-semibold text-right text-slate-900 leading-relaxed max-w-[70%]">
                  {order.customer?.notes || order.notes}
                </span>
              </div>
            )}
            {order.paymentMethod && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-cyan-600">Payment Method</span>
                <span className="text-sm font-semibold text-slate-900">{order.paymentMethod}</span>
              </div>
            )}
          </div>

          {/* Ordered Items */}
          {order.items && order.items.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 bg-orange-100 rounded flex items-center justify-center">
                  <Package className="w-3 h-3 text-orange-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Ordered Items</h3>
              </div>
              
              <div className="space-y-3">
                {order.items.map((item: CartItem, index: number) => (
                  <div key={index} className="bg-orange-50 rounded-lg p-4 flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-orange-200">
                      <img
                        src={item.image}
                        alt={item.sku}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 text-sm leading-tight mb-1">
                        {item.name || item.sku}
                      </h4>
                      <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{item.price}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="bg-slate-50 rounded-lg p-4 mb-8">
            <div className="space-y-3">
              {order.subtotal !== undefined && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span>{Math.round(order.subtotal || 0)} MMK</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex items-center justify-between text-sm text-green-600">
                  <span>Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
                  <span>-{Math.round(order.discount || 0)} MMK</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <span className="text-base font-semibold text-slate-900">Total</span>
                <p className="text-xl font-bold text-black">{Math.round(order.total || 0)} MMK</p>
              </div>
            </div>
          </div>
          
          {/* Back Button */}
          <div className="flex justify-center">
            <Button 
              onClick={onBack}
              className="w-64 bg-[#1a1d29] hover:bg-slate-900 h-11 text-sm font-medium text-white"
            >
              Back to Orders
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}