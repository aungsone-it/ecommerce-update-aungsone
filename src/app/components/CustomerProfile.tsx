import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  UserCircle, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Activity, 
  ShoppingBag, 
  DollarSign, 
  TrendingUp, 
  Award, 
  Bookmark, 
  Clock, 
  ShoppingCart, 
  Heart, 
  Star, 
  Eye, 
  Share2, 
  CreditCard, 
  X, 
  ThumbsUp, 
  Gift, 
  CheckCircle, 
  Ban, 
  MessageSquare, 
  MoreVertical, 
  FileText, 
  Trash2, 
  Package,
  Target,
  Edit
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "./ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

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
  lastOrderDate?: string;
  avgOrderValue: number;
  tags: string[];
  favoriteCategory?: string;
  engagementScore: number;
  lifetimeValue: number;
  rfmScore?: {
    recency: number;
    frequency: number;
    monetary: number;
  };
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

interface Order {
  id: string;
  date: string;
  items: number;
  total: number;
  status: string;
  products: string[];
}

interface SavedProduct {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  savedAt: string;
}

interface CustomerProfileProps {
  customer: Customer;
  onClose: () => void;
}

export function CustomerProfile({ customer, onClose }: CustomerProfileProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingSavedProducts, setIsLoadingSavedProducts] = useState(true);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  
  // Calculate stats from real orders
  const [calculatedStats, setCalculatedStats] = useState({
    totalOrders: customer.totalOrders || 0,
    totalSpent: customer.totalSpent || 0,
    avgOrderValue: customer.avgOrderValue || 0,
  });

  // 🔥 FETCH REAL DATA FROM BACKEND
  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        console.log(`🔍 [CustomerProfile] Fetching data for customer ID: ${customer.id}`);
        console.log(`🔍 [CustomerProfile] Customer details:`, {
          id: customer.id,
          name: customer.name,
          email: customer.email
        });
        
        // Fetch activity timeline
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customer.id}/activities`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (response.ok) {
          const activitiesData = await response.json();
          setActivities(activitiesData.activities || []);
        }
        setIsLoadingActivities(false);

        // Fetch orders
        const ordersResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customer.id}/orders`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          const orders = ordersData.orders || [];
          
          // Transform orders to match the Order interface
          const transformedOrders: Order[] = orders.map((order: any) => ({
            id: order.orderNumber || order.id,
            date: order.date || order.createdAt,
            items: Array.isArray(order.items) ? order.items.length : 0,
            total: order.total || 0,
            status: order.status || "pending",
            products: Array.isArray(order.items) 
              ? order.items.map((item: any) => item.name || item.title || "Unknown Product")
              : [],
          }));
          
          setRecentOrders(transformedOrders);
          
          // 🔥 CALCULATE REAL STATS FROM ORDERS (use absolute values to handle any negative totals)
          const totalOrders = transformedOrders.length;
          const totalSpent = transformedOrders.reduce((sum, order) => sum + Math.abs(order.total || 0), 0);
          const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
          
          setCalculatedStats({
            totalOrders,
            totalSpent,
            avgOrderValue,
          });
          
          console.log(`📊 Calculated stats: ${totalOrders} orders, $${totalSpent.toFixed(2)} spent, $${avgOrderValue.toFixed(2)} avg`);
        }
        setIsLoadingOrders(false);

        // Fetch saved products
        const savedProductsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customer.id}/saved-products`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (savedProductsResponse.ok) {
          const savedProductsData = await savedProductsResponse.json();
          const products = savedProductsData.products || [];
          
          // Transform products to match the SavedProduct interface
          const transformedProducts: SavedProduct[] = products.map((product: any) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            category: product.category,
            savedAt: product.savedAt,
          }));
          
          setSavedProducts(transformedProducts);
        }
        setIsLoadingSavedProducts(false);

        // Fetch shipping addresses
        const addressesResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customer.id}/addresses`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (addressesResponse.ok) {
          const addressesData = await addressesResponse.json();
          setAddresses(addressesData.addresses || []);
        }
        setIsLoadingAddresses(false);
      } catch (error) {
        console.error("❌ Error fetching customer data:", error);
        setIsLoadingActivities(false);
        setIsLoadingOrders(false);
        setIsLoadingSavedProducts(false);
        setIsLoadingAddresses(false);
      }
    };

    fetchCustomerData();
  }, [customer.id]);

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

  const getSegmentBadge = () => {
    if (!customer.rfmScore) return null;
    const { recency, frequency, monetary } = customer.rfmScore;
    const score = recency + frequency + monetary;

    if (score >= 13) {
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          <Award className="w-3 h-3 mr-1" />
          Champions
        </Badge>
      );
    }
    if (score >= 10 && recency >= 4) {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Heart className="w-3 h-3 mr-1" />
          Loyal
        </Badge>
      );
    }
    if (score >= 6 && recency <= 2) {
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          <Clock className="w-3 h-3 mr-1" />
          At Risk
        </Badge>
      );
    }
    return (
      <Badge className="bg-teal-100 text-teal-700 border-teal-200">
        <Target className="w-3 h-3 mr-1" />
        Potential
      </Badge>
    );
  };

  return (
    <div className="h-screen flex bg-slate-50">
      {/* Left Sidebar - Customer Info */}
      <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-slate-900">
              Customer Profile
            </h2>
          </div>
        </div>

        {/* Customer Avatar & Basic Info */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex flex-col items-center text-center mb-4">
            {customer.avatar && customer.avatar.trim() !== "" ? (
              <img
                src={customer.avatar}
                alt={customer.name}
                className="w-[100px] h-[100px] rounded-lg border-4 border-blue-100 mb-3 object-cover"
                onError={(e) => {
                  // If image fails to load, hide it and show fallback
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            {(!customer.avatar || customer.avatar.trim() === "") && (
              <div className="w-[100px] h-[100px] rounded-lg border-4 border-blue-100 mb-3 bg-blue-100 flex items-center justify-center">
                <span className="text-2xl font-semibold text-blue-600">
                  {customer.name?.substring(0, 2).toUpperCase() || "??"}
                </span>
              </div>
            )}
            {/* Hidden fallback that shows when image fails to load */}
            <div 
              style={{ display: 'none' }}
              className="w-[100px] h-[100px] rounded-lg border-4 border-blue-100 mb-3 bg-blue-100 flex items-center justify-center"
            >
              <span className="text-2xl font-semibold text-blue-600">
                {customer.name?.substring(0, 2).toUpperCase() || "??"}
              </span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {customer.name}
            </h3>
            <div className="flex items-center gap-2 mb-3">
              {getTierBadge(customer.tier)}
              {getStatusBadge(customer.status)}
            </div>
            {getSegmentBadge()}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <MessageSquare className="w-4 h-4" />
              Message
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileText className="w-4 h-4 mr-2" />
                  Add Note
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Ban className="w-4 h-4 mr-2" />
                  Block Customer
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Contact Information */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Contact Details */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <UserCircle className="w-4 h-4" />
                Contact Information
              </h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Mail className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-sm text-slate-900 break-all">
                      {customer.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Phone className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Phone</p>
                    <p className="text-sm text-slate-900">{customer.phone}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <MapPin className="w-4 h-4 text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-2">Saved Addresses</p>
                    {isLoadingAddresses ? (
                      <p className="text-sm text-slate-500">Loading addresses...</p>
                    ) : addresses.length > 0 ? (
                      <div className="space-y-3">
                        {addresses.map((addr: any) => (
                          <div key={addr.id} className="text-sm text-slate-900 pb-3 border-b border-slate-200 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{addr.label}</span>
                              {addr.isDefault && (
                                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Default</span>
                              )}
                            </div>
                            <p className="text-slate-700">{addr.recipientName}</p>
                            <p className="text-slate-600 text-xs mt-1">{addr.addressLine1}</p>
                            {addr.addressLine2 && <p className="text-slate-600 text-xs">{addr.addressLine2}</p>}
                            <p className="text-slate-600 text-xs">{addr.city}{addr.state && `, ${addr.state}`}</p>
                            <p className="text-slate-600 text-xs">{addr.zipCode && `${addr.zipCode}, `}{addr.country}</p>
                            <p className="text-slate-600 text-xs mt-1">📱 {addr.phone}</p>
                          </div>
                        ))}
                      </div>
                    ) : customer.address ? (
                      <div className="text-sm text-slate-900">
                        <p>{customer.address}</p>
                        <p>{customer.city}, {customer.zipCode}</p>
                        <p>{customer.country}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No addresses saved</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Calendar className="w-4 h-4 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Member Since</p>
                    <p className="text-sm text-slate-900">
                      {new Date(customer.joinDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Overview */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Customer Stats
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-slate-700">Total Orders</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {calculatedStats.totalOrders}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-slate-700">Total Spent</span>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    ${calculatedStats.totalSpent.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-slate-700">Avg Order</span>
                  </div>
                  <span className="text-sm font-semibold text-purple-700">
                    ${calculatedStats.avgOrderValue.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Favorite Category */}
            {customer.favoriteCategory && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Bookmark className="w-4 h-4" />
                  Favorite Category
                </h4>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <p className="text-sm font-medium text-purple-900">
                    {customer.favoriteCategory}
                  </p>
                  <p className="text-xs text-purple-700 mt-1">
                    Most purchased category
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Content - Activity & Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Activity & Orders
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Complete customer interaction history
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="bg-white border-b border-slate-200 px-6">
            <TabsList className="bg-transparent">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-slate-100"
              >
                <Activity className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="data-[state=active]:bg-slate-100"
              >
                <Clock className="w-4 h-4 mr-2" />
                Activity Timeline
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                className="data-[state=active]:bg-slate-100"
              >
                <ShoppingBag className="w-4 h-4 mr-2" />
                Order History
              </TabsTrigger>
              <TabsTrigger
                value="saved-products"
                className="data-[state=active]:bg-slate-100"
              >
                <Heart className="w-4 h-4 mr-2" />
                Saved Products
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto bg-slate-50">
            <TabsContent value="overview" className="p-6 m-0">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold text-slate-900">
                          {calculatedStats.totalOrders}
                        </p>
                        <p className="text-xs text-slate-500">Total Orders</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold text-slate-900">
                          ${calculatedStats.totalSpent.toFixed(0)}
                        </p>
                        <p className="text-xs text-slate-500">Total Spent</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold text-slate-900">
                          ${calculatedStats.avgOrderValue.toFixed(0)}
                        </p>
                        <p className="text-xs text-slate-500">Avg Order</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity Preview */}
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Recent Activity
                  </h3>
                  <div className="space-y-3">
                    {activities.slice(0, 5).map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getActivityBgColor(
                            activity.type
                          )}`}
                        >
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm">
                            {activity.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {activity.description}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {activity.timestamp}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => setActiveTab("activity")}
                  >
                    View All Activity
                  </Button>
                </div>

                {/* Recent Orders Preview */}
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Recent Orders
                  </h3>
                  <div className="space-y-3">
                    {recentOrders.slice(0, 3).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <ShoppingBag className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900 text-sm">
                                {order.id}
                              </p>
                              {getOrderStatusBadge(order.status)}
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {order.items} items •{" "}
                              {new Date(order.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">
                            ${Math.abs(order.total).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => setActiveTab("orders")}
                  >
                    View All Orders
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="p-6 m-0">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Complete Activity Timeline
                </h3>
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow"
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
                                    className="w-14 h-14 rounded-lg border border-slate-200"
                                  />
                                )}
                                {activity.metadata.productName && (
                                  <div className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm font-medium text-slate-700">
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
                                      {Math.abs(activity.metadata.amount).toFixed(2)}
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
                <div className="space-y-4">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-blue-50 rounded-lg flex items-center justify-center">
                            <ShoppingBag className="w-7 h-7 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h4 className="font-semibold text-slate-900 text-lg">
                                {order.id}
                              </h4>
                              {getOrderStatusBadge(order.status)}
                            </div>
                            <p className="text-sm text-slate-600">
                              {order.items} items •{" "}
                              {new Date(order.date).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-semibold text-slate-900">
                            ${Math.abs(order.total).toFixed(2)}
                          </p>
                          <Button variant="ghost" size="sm" className="mt-2">
                            View Details
                          </Button>
                        </div>
                      </div>

                      {/* Products */}
                      <div className="pt-4 border-t border-slate-100">
                        <p className="text-xs font-medium text-slate-500 mb-2">
                          Products in this order:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {order.products.map((product, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="bg-slate-50"
                            >
                              {product}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="saved-products" className="p-6 m-0">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Saved Products ({savedProducts.length} products)
                </h3>
                {isLoadingSavedProducts ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                    <p className="text-slate-500">Loading saved products...</p>
                  </div>
                ) : savedProducts.length === 0 ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                    <Heart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No saved products yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {savedProducts.map((product) => (
                      <div
                        key={product.id}
                        className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-pink-50"
                          >
                            <Heart className="w-5 h-5 text-pink-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-1">
                              <div>
                                <h4 className="font-semibold text-slate-900">
                                  {product.name}
                                </h4>
                                <p className="text-sm text-slate-600 mt-0.5">
                                  {product.category}
                                </p>
                              </div>
                              <span className="text-xs text-slate-500 whitespace-nowrap ml-4">
                                {product.savedAt}
                              </span>
                            </div>

                            {/* Metadata */}
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="flex items-center gap-4 flex-wrap">
                                {product.image && (
                                  <img
                                    src={product.image}
                                    alt="Product"
                                    className="w-14 h-14 rounded-lg border border-slate-200"
                                  />
                                )}
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-slate-400" />
                                  <span className="text-sm font-medium text-slate-700">
                                    {product.name}
                                  </span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="bg-slate-50"
                                >
                                  {product.category}
                                </Badge>
                                <div className="flex items-center gap-1 text-green-700">
                                  <DollarSign className="w-4 h-4" />
                                  <span className="font-semibold">
                                    {product.price.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}