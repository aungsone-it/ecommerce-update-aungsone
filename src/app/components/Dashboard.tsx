// Dashboard Component - Main dashboard view
import { DollarSign, ShoppingCart, Users, Package, TrendingUp, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { StatCard } from "./StatCard";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useLanguage } from "../contexts/LanguageContext";
import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";
import { productsApi } from "../../utils/api";
// TEMPORARY: Recharts disabled for production build fix
// import {
//   AreaChart,
//   Area,
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   ResponsiveContainer,
//   Legend,
// } from "recharts";

// 🚀 MODULE-LEVEL CACHE: Persists across component unmount/remount
let cachedStats: any = null;

export function Dashboard() {
  const { t } = useLanguage();
  
  // 🚀 Initialize state from cache if available
  const [stats, setStats] = useState(() => cachedStats || {
    totalRevenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalProducts: 0,
    revenueChange: 0,
    ordersChange: 0,
    customersChange: 0,
    productsChange: 0,
    salesTrend: [],
    topProducts: [],
    recentOrders: [],
  });
  
  // Only show loading on first mount when no cache exists
  const [loading, setLoading] = useState(!cachedStats);
  const [seeding, setSeeding] = useState(false);
  const [filters, setFilters] = useState({
    revenue: "Last 30 days",
    orders: "Last 30 days",
    customers: "Last 30 days",
    products: "Last 30 days",
  });
  
  useEffect(() => {
    fetchDashboardStats();
  }, [filters.revenue, filters.orders, filters.customers, filters.products]);
  
  const fetchDashboardStats = async () => {
    // 🚀 SMART LOADING: Only show spinner if request takes > 300ms
    let showLoadingTimer: NodeJS.Timeout | null = null;
    
    showLoadingTimer = setTimeout(() => {
      setLoading(true);
    }, 300);
    
    try {
      // Build query params with filters
      const params = new URLSearchParams({
        revenueFilter: filters.revenue,
        ordersFilter: filters.orders,
        customersFilter: filters.customers,
        productsFilter: filters.products,
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/dashboard/stats?${params}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }
      
      const data = await response.json();
      
      // 🚀 Log cache status for monitoring
      if (data.cached) {
        console.log(`⚡ Dashboard loaded from SERVER CACHE (age: ${data.cacheAge}s) - ZERO database queries!`);
      } else {
        console.log(`🔄 Dashboard loaded from DATABASE - Fresh data fetched`);
      }
      
      // Safety: Ensure all required fields exist with proper defaults
      setStats({
        totalRevenue: data.totalRevenue || 0,
        totalOrders: data.totalOrders || 0,
        totalCustomers: data.totalCustomers || 0,
        totalProducts: data.totalProducts || 0,
        revenueChange: data.revenueChange || 0,
        ordersChange: data.ordersChange || 0,
        customersChange: data.customersChange || 0,
        productsChange: data.productsChange || 0,
        salesTrend: Array.isArray(data.salesTrend) ? data.salesTrend : [],
        topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
        recentOrders: Array.isArray(data.recentOrders) ? data.recentOrders : [],
      });
      
      // 🚀 CACHE THE STATS FOR FUTURE USE
      cachedStats = {
        totalRevenue: data.totalRevenue || 0,
        totalOrders: data.totalOrders || 0,
        totalCustomers: data.totalCustomers || 0,
        totalProducts: data.totalProducts || 0,
        revenueChange: data.revenueChange || 0,
        ordersChange: data.ordersChange || 0,
        customersChange: data.customersChange || 0,
        productsChange: data.productsChange || 0,
        salesTrend: Array.isArray(data.salesTrend) ? data.salesTrend : [],
        topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
        recentOrders: Array.isArray(data.recentOrders) ? data.recentOrders : [],
      };
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      // Keep default values on error - don't crash the UI
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setLoading(false);
    }
  };
  
  // Format number with commas
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(Math.round(num));
  };
  
  // Format currency - Myanmar Kyat (MMK)
  const formatCurrency = (num: number | null | undefined) => {
    if (num === null || num === undefined || isNaN(num)) {
      return "0 MMK";
    }
    // Add comma formatting for thousands
    return `${num.toLocaleString()} MMK`;
  };
  
  // Format percentage change
  const formatChange = (change: number) => {
    const sign = change >= 0 ? "+" : "";
    return `${sign}${change.toFixed(1)}% ${t('dashboard.fromLastMonth')}`;
  };
  
  // Seed sample products function
  const handleSeedProducts = async () => {
    try {
      setSeeding(true);
      const data = await productsApi.seedSampleProducts();
      toast.success(
        <div>
          <p className="font-semibold">✅ Successfully created {data.count} sample products and {data.coupons?.length || 0} coupons!</p>
          <p className="mt-2 text-sm font-medium">Products:</p>
          <ul className="mt-1 text-sm space-y-1">
            {data.products.map((p: any) => (
              <li key={p.sku}>• {p.sku} - {p.name}</li>
            ))}
          </ul>
          {data.coupons && data.coupons.length > 0 && (
            <>
              <p className="mt-3 text-sm font-medium">Coupons (try them in the Storefront!):</p>
              <ul className="mt-1 text-sm space-y-1">
                {data.coupons.map((c: any) => (
                  <li key={c.code} className="flex items-center gap-2">
                    <span className="font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">{c.code}</span>
                    <span className="text-xs">- {c.discount} off {c.minAmount !== 'No minimum' ? `(min ${c.minAmount})` : ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs text-slate-600">View products in Product page/Storefront. Try coupons at checkout!</p>
        </div>,
        { duration: 10000 }
      );
      
      // 🚀 Server invalidates cache automatically - just fetch with cache cleared
      setTimeout(() => {
        fetchDashboardStats();
      }, 1000);
    } catch (error) {
      console.error("Error seeding products:", error);
      toast.error("❌ Failed to seed products. Please try again.");
    } finally {
      setSeeding(false);
    }
  };
  
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-1">{t('dashboard.welcome').replace('{name}', 'Aung Sone')}</p>
        </div>
      </div>

      {/* Quick Actions Card - Show only if no products */}
      {stats.totalProducts === 0 && !loading && (
        <Card className="p-6 bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Get Started with Sample Products & Coupons</h3>
              <p className="text-sm text-slate-600 mb-4">
                Your store is empty! Add some sample products and coupons to see how everything works. This will create 5 demo products (electronics & fashion) and 3 test coupons (PROMO, OFF, SAVE15) that you can try at checkout!
              </p>
              <Button 
                onClick={handleSeedProducts}
                disabled={seeding}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {seeding ? (
                  <>
                    <Package className="w-4 h-4 mr-2 animate-spin" />
                    Creating Products & Coupons...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Create Sample Products & Coupons
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-children">
        <StatCard
          title={t('dashboard.totalRevenue')}
          value={loading ? "..." : formatCurrency(stats.totalRevenue)}
          change={loading ? "..." : formatChange(stats.revenueChange)}
          changeType={stats.revenueChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
          iconBgColor="bg-gradient-to-br from-green-400 to-green-600"
          onFilterChange={(filter) => setFilters({ ...filters, revenue: filter })}
        />
        <StatCard
          title={t('dashboard.orders')}
          value={loading ? "..." : formatNumber(stats.totalOrders)}
          change={loading ? "..." : formatChange(stats.ordersChange)}
          changeType={stats.ordersChange >= 0 ? "positive" : "negative"}
          icon={ShoppingCart}
          iconBgColor="bg-gradient-to-br from-blue-400 to-blue-600"
          onFilterChange={(filter) => setFilters({ ...filters, orders: filter })}
        />
        <StatCard
          title={t('dashboard.customers')}
          value={loading ? "..." : formatNumber(stats.totalCustomers)}
          change={loading ? "..." : formatChange(stats.customersChange)}
          changeType={stats.customersChange >= 0 ? "positive" : "negative"}
          icon={Users}
          iconBgColor="bg-gradient-to-br from-purple-400 to-purple-600"
          onFilterChange={(filter) => setFilters({ ...filters, customers: filter })}
        />
        <StatCard
          title={t('dashboard.products')}
          value={loading ? "..." : formatNumber(stats.totalProducts)}
          change={loading ? "..." : formatChange(stats.productsChange)}
          changeType={stats.productsChange >= 0 ? "positive" : "negative"}
          icon={Package}
          iconBgColor="bg-gradient-to-br from-orange-400 to-orange-600"
          onFilterChange={(filter) => setFilters({ ...filters, products: filter })}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart - TEMPORARILY DISABLED FOR PRODUCTION BUILD */}
        <Card className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.salesOverview')}</h3>
            <p className="text-sm text-slate-500">{t('dashboard.salesOverviewDesc')}</p>
          </div>
          <div className="h-[300px] flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Chart temporarily unavailable</p>
              <p className="text-xs text-slate-300 mt-1">Will be restored soon</p>
            </div>
          </div>
        </Card>

        {/* Top Products */}
        <Card className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.topProducts')}</h3>
            <p className="text-sm text-slate-500">{t('dashboard.topProductsDesc')}</p>
          </div>
          {loading || stats.topProducts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {loading ? "Loading..." : "No products data available"}
            </div>
          ) : (
            <div className="space-y-4">
              {stats.topProducts.map((product, index) => (
                <div key={index} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{product.name}</p>
                    <p className="text-sm text-slate-500">{product.sales} {t('dashboard.sales')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-slate-900">{formatCurrency(product.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Orders */}
      <Card className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.recentOrders')}</h3>
            <p className="text-sm text-slate-500">{t('dashboard.latestOrders')}</p>
          </div>
          <Button variant="outline" size="sm">{t('dashboard.viewAll')}</Button>
        </div>
        {loading || stats.recentOrders.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            {loading ? "Loading..." : "No recent orders"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t('dashboard.orderId')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t('dashboard.customer')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t('dashboard.product')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t('dashboard.amount')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">{t('dashboard.status')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4 text-sm font-medium text-slate-900">{order.id}</td>
                    <td className="py-4 px-4 text-sm text-slate-700">{typeof order.customer === 'string' ? order.customer : (order.customer?.fullName || order.customer?.name || 'Guest Customer')}</td>
                    <td className="py-4 px-4 text-sm text-slate-700">{order.product}</td>
                    <td className="py-4 px-4 text-sm font-semibold text-slate-900">{formatCurrency(order.amount)}</td>
                    <td className="py-4 px-4">
                      <Badge 
                        variant={
                          order.status === "completed" ? "default" : 
                          order.status === "processing" ? "secondary" : 
                          "outline"
                        }
                        className={
                          order.status === "completed" ? "bg-green-100 text-green-700 hover:bg-green-100" : 
                          order.status === "processing" ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : 
                          "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        }
                      >
                        {order.status}
                      </Badge>
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