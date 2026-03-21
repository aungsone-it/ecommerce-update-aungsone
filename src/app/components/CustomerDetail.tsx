import { useState } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  Star,
  Heart,
  MessageSquare,
  Package,
  CreditCard,
  TrendingUp,
  Eye,
  ShoppingCart,
  X,
  CheckCircle,
  Clock,
  Gift,
  Share2,
  ThumbsUp,
  MoreVertical,
  Ban,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone: string;
  location: string;
  address?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  joinDate: string;
  totalOrders: number;
  totalSpent: number;
  status: "active" | "inactive" | "blocked";
  tier: "vip" | "regular" | "new";
  lastVisit: string;
}

interface Activity {
  id: string;
  type:
    | "order"
    | "wishlist"
    | "cart"
    | "review"
    | "view"
    | "share"
    | "payment"
    | "cancel"
    | "like"
    | "join";
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    productName?: string;
    productImage?: string;
    orderId?: string;
    amount?: number;
    rating?: number;
  };
}

interface CustomerDetailProps {
  customer: Customer;
  onBack: () => void;
}

export function CustomerDetail({ customer, onBack }: CustomerDetailProps) {
  const [activeTab, setActiveTab] = useState("activity");

  // Sample activity data
  const activities: Activity[] = [
    {
      id: "act-1",
      type: "order",
      title: "Placed an order",
      description: "Order #ORD-2847 - 3 items",
      timestamp: "2026-02-05 10:30 AM",
      metadata: {
        orderId: "ORD-2847",
        amount: 234.99,
        productName: "Wireless Headphones Pro",
        productImage: "https://api.dicebear.com/7.x/pixel-art/svg?seed=product1",
      },
    },
    {
      id: "act-2",
      type: "wishlist",
      title: "Added to wishlist",
      description: "Smart Watch Series 5",
      timestamp: "2026-02-04 3:45 PM",
      metadata: {
        productName: "Smart Watch Series 5",
        productImage: "https://api.dicebear.com/7.x/pixel-art/svg?seed=product2",
      },
    },
    {
      id: "act-3",
      type: "review",
      title: "Wrote a review",
      description: "5 stars - Great product quality!",
      timestamp: "2026-02-03 2:20 PM",
      metadata: {
        productName: "Laptop Backpack",
        rating: 5,
      },
    },
    {
      id: "act-4",
      type: "cart",
      title: "Added to cart",
      description: "Bluetooth Speaker",
      timestamp: "2026-02-03 11:15 AM",
      metadata: {
        productName: "Bluetooth Speaker",
        productImage: "https://api.dicebear.com/7.x/pixel-art/svg?seed=product3",
      },
    },
    {
      id: "act-5",
      type: "view",
      title: "Viewed product",
      description: "Gaming Mouse RGB",
      timestamp: "2026-02-02 9:30 AM",
      metadata: {
        productName: "Gaming Mouse RGB",
      },
    },
    {
      id: "act-6",
      type: "payment",
      title: "Payment completed",
      description: "Order #ORD-2756",
      timestamp: "2026-02-01 4:15 PM",
      metadata: {
        orderId: "ORD-2756",
        amount: 156.5,
      },
    },
    {
      id: "act-7",
      type: "share",
      title: "Shared product",
      description: "Shared on social media",
      timestamp: "2026-01-31 1:20 PM",
      metadata: {
        productName: "Premium Coffee Maker",
      },
    },
    {
      id: "act-8",
      type: "like",
      title: "Liked product",
      description: "Mechanical Keyboard",
      timestamp: "2026-01-30 10:45 AM",
      metadata: {
        productName: "Mechanical Keyboard",
      },
    },
    {
      id: "act-9",
      type: "cancel",
      title: "Cancelled order",
      description: "Order #ORD-2690 - Changed mind",
      timestamp: "2026-01-28 5:30 PM",
      metadata: {
        orderId: "ORD-2690",
      },
    },
    {
      id: "act-10",
      type: "join",
      title: "Joined SECURE",
      description: "Created account and completed profile",
      timestamp: customer.joinDate,
    },
  ];

  // Sample orders
  const recentOrders = [
    {
      id: "ORD-2847",
      date: "2026-02-05",
      items: 3,
      total: 234.99,
      status: "Processing",
    },
    {
      id: "ORD-2756",
      date: "2026-02-01",
      items: 2,
      total: 156.5,
      status: "Delivered",
    },
    {
      id: "ORD-2690",
      date: "2026-01-28",
      items: 1,
      total: 89.99,
      status: "Cancelled",
    },
    {
      id: "ORD-2543",
      date: "2026-01-20",
      items: 5,
      total: 445.75,
      status: "Delivered",
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "order":
        return <ShoppingBag className="w-5 h-5 text-blue-600" />;
      case "wishlist":
        return <Heart className="w-5 h-5 text-pink-600" />;
      case "cart":
        return <ShoppingCart className="w-5 h-5 text-orange-600" />;
      case "review":
        return <Star className="w-5 h-5 text-yellow-600" />;
      case "view":
        return <Eye className="w-5 h-5 text-slate-600" />;
      case "share":
        return <Share2 className="w-5 h-5 text-green-600" />;
      case "payment":
        return <CreditCard className="w-5 h-5 text-emerald-600" />;
      case "cancel":
        return <X className="w-5 h-5 text-red-600" />;
      case "like":
        return <ThumbsUp className="w-5 h-5 text-indigo-600" />;
      case "join":
        return <Gift className="w-5 h-5 text-purple-600" />;
      default:
        return <Clock className="w-5 h-5 text-slate-600" />;
    }
  };

  const getActivityBgColor = (type: string) => {
    switch (type) {
      case "order":
        return "bg-blue-50";
      case "wishlist":
        return "bg-pink-50";
      case "cart":
        return "bg-orange-50";
      case "review":
        return "bg-yellow-50";
      case "view":
        return "bg-slate-50";
      case "share":
        return "bg-green-50";
      case "payment":
        return "bg-emerald-50";
      case "cancel":
        return "bg-red-50";
      case "like":
        return "bg-indigo-50";
      case "join":
        return "bg-purple-50";
      default:
        return "bg-slate-50";
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "vip":
        return (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200">
            <Star className="w-3 h-3 mr-1" />
            VIP Customer
          </Badge>
        );
      case "regular":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            Regular Customer
          </Badge>
        );
      case "new":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            New Customer
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
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            Inactive
          </Badge>
        );
      case "blocked":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Ban className="w-3 h-3 mr-1" />
            Blocked
          </Badge>
        );
      default:
        return null;
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case "Delivered":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            Delivered
          </Badge>
        );
      case "Processing":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            Processing
          </Badge>
        );
      case "Cancelled":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            Cancelled
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Customer Details
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  View customer information and activity history
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Send Message
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Mail className="w-4 h-4 mr-2" />
                    Send email
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Ban className="w-4 h-4 mr-2" />
                    Block customer
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete customer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Customer Overview Card */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
            <div className="flex items-start gap-6">
              <img
                src={customer.avatar}
                alt={customer.name}
                className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
              />
              <div className="flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                      {customer.name}
                    </h2>
                    <div className="flex items-center gap-2">
                      {getTierBadge(customer.tier)}
                      {getStatusBadge(customer.status)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center gap-3 text-slate-700">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <Mail className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm font-medium">{customer.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-slate-700">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <Phone className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="text-sm font-medium">{customer.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-slate-700">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Location</p>
                      {customer.address ? (
                        <div className="text-sm font-medium">
                          <p>{customer.address}</p>
                          <p>{customer.city}, {customer.zipCode}</p>
                          <p>{customer.country}</p>
                        </div>
                      ) : (
                        <p className="text-sm font-medium">{customer.location}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-slate-700">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Member Since</p>
                      <p className="text-sm font-medium">
                        {new Date(customer.joinDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4">
                <div className="bg-white rounded-lg p-4 border border-slate-200 text-center min-w-[120px]">
                  <ShoppingBag className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-semibold text-slate-900">
                    {customer.totalOrders}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Total Orders</p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-slate-200 text-center min-w-[120px]">
                  <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-semibold text-slate-900">
                    ${customer.totalSpent.toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Total Spent</p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-slate-200 text-center min-w-[120px]">
                  <TrendingUp className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-2xl font-semibold text-slate-900">
                    ${(customer.totalSpent / customer.totalOrders).toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Avg Order Value</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="bg-white border-b border-slate-200 px-6">
            <TabsList className="bg-transparent">
              <TabsTrigger value="activity" className="data-[state=active]:bg-slate-100">
                Activity Timeline
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-slate-100">
                Order History
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="activity" className="p-6 m-0">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Activity Timeline
                </h3>
                <div className="space-y-4">
                  {activities.map((activity, index) => (
                    <div
                      key={activity.id}
                      className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${getActivityBgColor(
                            activity.type
                          )}`}
                        >
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-1">
                            <div>
                              <h4 className="font-semibold text-slate-900">
                                {activity.title}
                              </h4>
                              <p className="text-sm text-slate-600 mt-0.5">
                                {activity.description}
                              </p>
                            </div>
                            <span className="text-xs text-slate-500 whitespace-nowrap ml-4">
                              {activity.timestamp}
                            </span>
                          </div>

                          {/* Metadata */}
                          {activity.metadata && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="flex items-center gap-4 flex-wrap">
                                {activity.metadata.productImage && (
                                  <img
                                    src={activity.metadata.productImage}
                                    alt="Product"
                                    className="w-12 h-12 rounded border border-slate-200"
                                  />
                                )}
                                {activity.metadata.productName && (
                                  <div className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm text-slate-700">
                                      {activity.metadata.productName}
                                    </span>
                                  </div>
                                )}
                                {activity.metadata.orderId && (
                                  <Badge
                                    variant="outline"
                                    className="bg-slate-50"
                                  >
                                    {activity.metadata.orderId}
                                  </Badge>
                                )}
                                {activity.metadata.amount && (
                                  <div className="flex items-center gap-1 text-green-700">
                                    <DollarSign className="w-4 h-4" />
                                    <span className="font-semibold">
                                      {activity.metadata.amount.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {activity.metadata.rating && (
                                  <div className="flex items-center gap-1">
                                    {[...Array(activity.metadata.rating)].map(
                                      (_, i) => (
                                        <Star
                                          key={i}
                                          className="w-4 h-4 fill-yellow-400 text-yellow-400"
                                        />
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="orders" className="p-6 m-0">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Order History ({customer.totalOrders} orders)
                </h3>
                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                            <ShoppingBag className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h4 className="font-semibold text-slate-900">
                                {order.id}
                              </h4>
                              {getOrderStatusBadge(order.status)}
                            </div>
                            <p className="text-sm text-slate-600">
                              {order.items} items •{" "}
                              {new Date(order.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900">
                            ${order.total.toFixed(2)}
                          </p>
                          <Button variant="ghost" size="sm" className="mt-1">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}