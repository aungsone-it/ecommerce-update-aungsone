// Dashboard Component - Main dashboard view
import { DollarSign, ShoppingCart, Users, Package, TrendingUp, Calendar } from "lucide-react";
import { StatCard } from "./StatCard";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AdminDateRangeFilterPopover } from "./AdminDateRangeFilterPopover";
import { useLanguage } from "../contexts/LanguageContext";
import { useState, useEffect, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  getCachedAdminDashboardStats,
  moduleCache,
  adminDashboardStatsCacheKey,
  encodeAdminDashboardDateFilter,
  type AdminDashboardFilters,
} from "../utils/module-cache";
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

const defaultStats = {
  totalRevenue: 0,
  totalOrders: 0,
  totalCustomers: 0,
  totalProducts: 0,
  revenueChange: 0,
  ordersChange: 0,
  customersChange: 0,
  productsChange: 0,
  salesTrend: [] as any[],
  topProducts: [] as any[],
  recentOrders: [] as any[],
};

export function Dashboard() {
  const { t } = useLanguage();
  
  const [stats, setStats] = useState(defaultStats);
  const allTimeFilters: AdminDashboardFilters = {
    revenue: "All time",
    orders: "All time",
    customers: "All time",
    products: "All time",
    globalSection: "All time",
  };
  const [loading, setLoading] = useState(
    () => !moduleCache.peek(adminDashboardStatsCacheKey(allTimeFilters))
  );
  const [revenueRange, setRevenueRange] = useState<DateRange | undefined>(undefined);
  const [ordersRange, setOrdersRange] = useState<DateRange | undefined>(undefined);
  const [customersRange, setCustomersRange] = useState<DateRange | undefined>(undefined);
  const [productsRange, setProductsRange] = useState<DateRange | undefined>(undefined);

  const [revenueApiFilter, setRevenueApiFilter] = useState("All time");
  const [ordersApiFilter, setOrdersApiFilter] = useState("All time");
  const [customersApiFilter, setCustomersApiFilter] = useState("All time");
  const [productsApiFilter, setProductsApiFilter] = useState("All time");

  const [globalSectionRange, setGlobalSectionRange] = useState<DateRange | undefined>(undefined);
  const [globalApiFilter, setGlobalApiFilter] = useState("All time");
  const [globalPickerOpen, setGlobalPickerOpen] = useState(false);

  useEffect(() => {
    if (!globalSectionRange?.from) setGlobalApiFilter("All time");
    else if (globalSectionRange.to) setGlobalApiFilter(encodeAdminDashboardDateFilter(globalSectionRange));
  }, [globalSectionRange]);

  useEffect(() => {
    if (!revenueRange?.from) setRevenueApiFilter("All time");
    else if (revenueRange.to) setRevenueApiFilter(encodeAdminDashboardDateFilter(revenueRange));
  }, [revenueRange]);
  useEffect(() => {
    if (!ordersRange?.from) setOrdersApiFilter("All time");
    else if (ordersRange.to) setOrdersApiFilter(encodeAdminDashboardDateFilter(ordersRange));
  }, [ordersRange]);
  useEffect(() => {
    if (!customersRange?.from) setCustomersApiFilter("All time");
    else if (customersRange.to) setCustomersApiFilter(encodeAdminDashboardDateFilter(customersRange));
  }, [customersRange]);
  useEffect(() => {
    if (!productsRange?.from) setProductsApiFilter("All time");
    else if (productsRange.to) setProductsApiFilter(encodeAdminDashboardDateFilter(productsRange));
  }, [productsRange]);

  const filterPayload = useMemo(
    (): AdminDashboardFilters => ({
      revenue: revenueApiFilter,
      orders: ordersApiFilter,
      customers: customersApiFilter,
      products: productsApiFilter,
      globalSection: globalApiFilter,
    }),
    [revenueApiFilter, ordersApiFilter, customersApiFilter, productsApiFilter, globalApiFilter]
  );

  useEffect(() => {
    fetchDashboardStats();
  }, [
    filterPayload.revenue,
    filterPayload.orders,
    filterPayload.customers,
    filterPayload.products,
    filterPayload.globalSection,
  ]);
  
  const applyDashboardPayload = (data: Record<string, unknown>) => {
    if (data.cached) {
      console.log(
        `⚡ Dashboard loaded from SERVER CACHE (age: ${data.cacheAge}s) - ZERO database queries!`
      );
    } else {
      console.log(`🔄 Dashboard loaded from DATABASE - Fresh data fetched`);
    }
    setStats({
      totalRevenue: (data.totalRevenue as number) || 0,
      totalOrders: (data.totalOrders as number) || 0,
      totalCustomers: (data.totalCustomers as number) || 0,
      totalProducts: (data.totalProducts as number) || 0,
      revenueChange: (data.revenueChange as number) || 0,
      ordersChange: (data.ordersChange as number) || 0,
      customersChange: (data.customersChange as number) || 0,
      productsChange: (data.productsChange as number) || 0,
      salesTrend: Array.isArray(data.salesTrend) ? data.salesTrend : [],
      topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
      recentOrders: Array.isArray(data.recentOrders) ? data.recentOrders : [],
    });
  };

  const fetchDashboardStats = async (forceRefresh = false) => {
    let showLoadingTimer: NodeJS.Timeout | null = null;
    showLoadingTimer = setTimeout(() => {
      setLoading(true);
    }, 300);

    const cacheKey = adminDashboardStatsCacheKey(filterPayload);

    if (!forceRefresh) {
      const peeked = moduleCache.peek<Record<string, unknown>>(cacheKey);
      if (peeked != null && typeof peeked === "object") {
        applyDashboardPayload(peeked);
        if (showLoadingTimer) clearTimeout(showLoadingTimer);
        setLoading(false);
        return;
      }
    }

    try {
      const data = await getCachedAdminDashboardStats(filterPayload, forceRefresh);
      applyDashboardPayload(data);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
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
  
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-1">{t('dashboard.welcome').replace('{name}', 'Aung Sone')}</p>
        </div>
        <AdminDateRangeFilterPopover
          value={globalSectionRange}
          onChange={setGlobalSectionRange}
          hintText={t("dashboard.globalDateFilterHint")}
          titleText={t("dashboard.globalDateFilterTitle")}
          open={globalPickerOpen}
          onOpenChange={setGlobalPickerOpen}
          align="end"
        >
          <Button
            variant="outline"
            size="sm"
            className="max-w-full border-slate-300 self-start font-normal sm:self-auto"
            disabled={loading}
            type="button"
          >
            <Calendar className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate text-left">
              {!globalSectionRange?.from
                ? t("finances.allTime")
                : !globalSectionRange.to
                  ? t("finances.selectEndDate")
                  : `${format(globalSectionRange.from, "MMM d, yyyy")} – ${format(globalSectionRange.to, "MMM d, yyyy")}`}
            </span>
          </Button>
        </AdminDateRangeFilterPopover>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-children">
        <StatCard
          title={t('dashboard.totalRevenue')}
          value={loading ? "..." : formatCurrency(stats.totalRevenue)}
          change={loading ? "..." : formatChange(stats.revenueChange)}
          changeType={stats.revenueChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
          iconBgColor="bg-gradient-to-br from-green-400 to-green-600"
          dateRange={revenueRange}
          onDateRangeChange={setRevenueRange}
          hintText={t("dashboard.analyticsKpiDateHint")}
        />
        <StatCard
          title={t('dashboard.orders')}
          value={loading ? "..." : formatNumber(stats.totalOrders)}
          change={loading ? "..." : formatChange(stats.ordersChange)}
          changeType={stats.ordersChange >= 0 ? "positive" : "negative"}
          icon={ShoppingCart}
          iconBgColor="bg-gradient-to-br from-blue-400 to-blue-600"
          dateRange={ordersRange}
          onDateRangeChange={setOrdersRange}
          hintText={t("dashboard.analyticsKpiDateHint")}
        />
        <StatCard
          title={t('dashboard.customers')}
          value={loading ? "..." : formatNumber(stats.totalCustomers)}
          change={loading ? "..." : formatChange(stats.customersChange)}
          changeType={stats.customersChange >= 0 ? "positive" : "negative"}
          icon={Users}
          iconBgColor="bg-gradient-to-br from-purple-400 to-purple-600"
          dateRange={customersRange}
          onDateRangeChange={setCustomersRange}
          hintText={t("dashboard.analyticsKpiDateHint")}
        />
        <StatCard
          title={t('dashboard.products')}
          value={loading ? "..." : formatNumber(stats.totalProducts)}
          change={loading ? "..." : formatChange(stats.productsChange)}
          changeType={stats.productsChange >= 0 ? "positive" : "negative"}
          icon={Package}
          iconBgColor="bg-gradient-to-br from-orange-400 to-orange-600"
          dateRange={productsRange}
          onDateRangeChange={setProductsRange}
          hintText={t("dashboard.analyticsKpiDateHint")}
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
            <p className="text-sm text-slate-500">{t("dashboard.topProductsDescGlobal")}</p>
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