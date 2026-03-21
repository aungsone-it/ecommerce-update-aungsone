import { useState, useEffect } from "react";
import { Package, DollarSign, Users, ShoppingCart, TrendingUp, Eye, Loader2, ChevronDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

interface DashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  revenueChange: number;
  ordersChange: number;
  customersChange: number;
  productsChange: number;
}

interface TopProduct {
  id: string;
  name: string;
  sales: number;
  revenue: number;
}

interface RecentOrder {
  id: string;
  customerName: string;
  items: number;
  total: number;
  status: string;
  date: string;
}

interface VendorAdminDashboardProps {
  vendorId: string;
  vendorName: string;
  onNavigate: (page: string) => void;
  onPreviewStore?: (vendorId: string, storeSlug: string) => void;
}

export function VendorAdminDashboard({ 
  vendorId, 
  vendorName, 
  onNavigate,
  onPreviewStore 
}: VendorAdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    revenueChange: 0,
    ordersChange: 0,
    customersChange: 0,
    productsChange: 0,
  });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState({
    revenue: "Last 30 days",
    orders: "Last 30 days",
    customers: "Last 30 days",
    products: "Last 30 days",
  });

  useEffect(() => {
    loadDashboardData();
  }, [vendorId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load products with timeout protection
      const productsPromise = fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products-admin/${vendorId}`,
        { 
          headers: { Authorization: `Bearer ${publicAnonKey}` },
          signal: AbortSignal.timeout(10000)
        }
      ).then(res => res.json()).catch(() => ({ products: [] }));
      
      // Load vendor-specific orders with timeout protection
      const ordersPromise = fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/orders/${vendorId}`,
        { 
          headers: { Authorization: `Bearer ${publicAnonKey}` },
          signal: AbortSignal.timeout(10000)
        }
      ).then(res => res.json()).catch(() => ({ orders: [] }));
      
      // Fetch both in parallel
      const [productsData, ordersData] = await Promise.all([productsPromise, ordersPromise]);
      
      const vendorProducts = productsData.products || [];
      const vendorOrders = ordersData.orders || [];
      
      // Calculate stats
      const totalRevenue = vendorOrders
        .filter((order: any) => order.status !== "cancelled")
        .reduce((sum: number, order: any) => sum + order.total, 0);
      
      const totalCustomers = new Set(vendorOrders.map((o: any) => o.email)).size;
      
      // Calculate top products by sales
      const productSales = new Map<string, { name: string; sales: number; revenue: number }>();
      vendorOrders.forEach((order: any) => {
        if (order.status !== "cancelled" && order.items) {
          order.items.forEach((item: any) => {
            const existing = productSales.get(item.productId) || { name: item.name, sales: 0, revenue: 0 };
            existing.sales += item.quantity;
            existing.revenue += item.price * item.quantity;
            productSales.set(item.productId, existing);
          });
        }
      });
      
      const topProductsList = Array.from(productSales.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 4);
      
      // Get recent orders
      const recentOrdersList = vendorOrders
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((order: any) => ({
          id: order.id,
          customerName: order.name,
          items: order.items?.length || 0,
          total: order.total,
          status: order.status,
          date: order.createdAt,
        }));

      setStats({
        totalProducts: vendorProducts.length,
        totalOrders: vendorOrders.length,
        totalRevenue,
        totalCustomers,
        revenueChange: 0.9,
        ordersChange: 0.9,
        customersChange: 0.9,
        productsChange: 0.9,
      });
      
      setTopProducts(topProductsList);
      setRecentOrders(recentOrdersList);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Format currency - Myanmar Kyat (MMK)
  const formatCurrency = (num: number) => {
    return `${Math.round(num).toLocaleString()} MMK`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-56 mb-6" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const StatCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    iconBg, 
    iconColor,
    filterKey 
  }: { 
    title: string; 
    value: string | number; 
    change: number; 
    icon: any; 
    iconBg: string; 
    iconColor: string;
    filterKey: keyof typeof dateFilter;
  }) => (
    <Card className="p-5 border-slate-200 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600 font-medium mb-1">{title}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-4">
                {dateFilter[filterKey]} <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last 7 days" })}>
                Last 7 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last 30 days" })}>
                Last 30 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last 90 days" })}>
                Last 90 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last year" })}>
                Last year
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xl font-bold text-slate-900 mb-2">{value}</p>
          <div className="flex items-center gap-1">
            {change >= 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-red-600" />
            )}
            <span className={`text-xs font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
              +{change}% from last month
            </span>
          </div>
        </div>
        <div className={`${iconBg} p-2 rounded-full ml-4 flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Analytics</h1>
        <p className="text-sm text-slate-600">Welcome back, {vendorName}! Here's what's happening today.</p>
      </div>

      {/* Top Stats - 4 Cards in a Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          change={stats.revenueChange}
          icon={DollarSign}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          filterKey="revenue"
        />
        <StatCard
          title="Orders"
          value={stats.totalOrders}
          change={stats.ordersChange}
          icon={ShoppingCart}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          filterKey="orders"
        />
        <StatCard
          title="Customers"
          value={stats.totalCustomers}
          change={stats.customersChange}
          icon={Users}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          filterKey="customers"
        />
        <StatCard
          title="Products"
          value={stats.totalProducts}
          change={stats.productsChange}
          icon={Package}
          iconBg="bg-orange-100"
          iconColor="text-orange-600"
          filterKey="products"
        />
      </div>

      {/* Sales Overview & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Overview */}
        <Card className="p-6 border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Sales Overview</h3>
            <p className="text-sm text-slate-600">Monthly sales and orders trend</p>
          </div>
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Chart temporarily unavailable</p>
            </div>
          </div>
        </Card>

        {/* Top Products */}
        <Card className="p-6 border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Top Products</h3>
            <p className="text-sm text-slate-600">Best performing products this month</p>
          </div>
          <div className="space-y-4">
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm">No product sales yet</p>
              </div>
            ) : (
              topProducts.map((product) => (
                <div key={product.id} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.sales} sales</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                    {formatCurrency(product.revenue)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card className="p-6 border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Recent Orders</h3>
            <p className="text-sm text-slate-600">Latest customer orders</p>
          </div>
          <button
            onClick={() => onNavigate("orders")}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View All
          </button>
        </div>
        
        {recentOrders.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Order ID</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Items</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Total</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-900 font-medium">#{order.id.slice(0, 8)}</td>
                    <td className="py-3 px-4 text-sm text-slate-900">{order.customerName}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{order.items}</td>
                    <td className="py-3 px-4 text-sm text-slate-900 font-medium">{formatCurrency(order.total)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.status === "completed" ? "bg-green-100 text-green-700" :
                        order.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        order.status === "processing" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {new Date(order.date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}