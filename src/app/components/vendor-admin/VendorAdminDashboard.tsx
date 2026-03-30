import { useState, useEffect, useMemo } from "react";
import {
  Package,
  DollarSign,
  Users,
  ShoppingCart,
  TrendingUp,
  Loader2,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  getCachedVendorProductsAdmin,
  getCachedVendorOrders,
  moduleCache,
  CACHE_KEYS,
} from "../../utils/module-cache";
import {
  daysForVendorDashboardLabel,
  filterOrdersInRollingWindow,
  filterOrdersInPriorWindow,
  pctChangePriorWindow,
  vendorOrderDisplayTotal,
  isVendorOrderActive,
  uniqueCustomerEmails,
  countActiveOrders,
  topProductsFromOrders,
  recentOrdersFromList,
  buildMonthlySeries,
  countProductsLikelyAddedInWindow,
  type TopProductRow,
  type RecentOrderRow,
} from "../../utils/vendorAdminAnalytics";

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

type DateFilterKey = "revenue" | "orders" | "customers" | "products";

const defaultVendorDashboardStats: DashboardStats = {
  totalProducts: 0,
  totalOrders: 0,
  totalRevenue: 0,
  totalCustomers: 0,
  revenueChange: 0,
  ordersChange: 0,
  customersChange: 0,
  productsChange: 0,
};

interface VendorAdminDashboardProps {
  vendorId: string;
  vendorName: string;
  onNavigate: (page: string) => void;
  /** Reserved for header/store actions from parent; analytics view does not use it yet. */
  onPreviewStore?: (vendorId: string, storeSlug: string) => void;
}

function peekCachedVendorDashboardData(vendorId: string): { products: any[]; orders: any[] } | null {
  const pPeek = moduleCache.peek<{ products?: any[] }>(CACHE_KEYS.vendorProductsAdmin(vendorId));
  const oPeek = moduleCache.peek<any[]>(CACHE_KEYS.vendorOrders(vendorId));
  if (
    pPeek != null &&
    Array.isArray(pPeek.products) &&
    oPeek != null &&
    Array.isArray(oPeek)
  ) {
    return { products: pPeek.products || [], orders: oPeek };
  }
  return null;
}

function sumRevenue(orders: any[]): number {
  return orders.reduce((s, o) => s + vendorOrderDisplayTotal(o), 0);
}

export function VendorAdminDashboard({
  vendorId,
  vendorName,
  onNavigate,
}: VendorAdminDashboardProps) {
  const cachedInit = peekCachedVendorDashboardData(vendorId);
  const [rawOrders, setRawOrders] = useState<any[]>(() => cachedInit?.orders ?? []);
  const [rawProducts, setRawProducts] = useState<any[]>(() => cachedInit?.products ?? []);
  const [loading, setLoading] = useState(() => cachedInit == null);
  const [dateFilter, setDateFilter] = useState({
    revenue: "Last 30 days",
    orders: "Last 30 days",
    customers: "Last 30 days",
    products: "Last 30 days",
  });

  const derived = useMemo(() => {
    const endMs = Date.now();
    const pool = rawOrders.filter(isVendorOrderActive);

    const revenueDays = daysForVendorDashboardLabel(dateFilter.revenue);
    const ordersDays = daysForVendorDashboardLabel(dateFilter.orders);
    const customersDays = daysForVendorDashboardLabel(dateFilter.customers);
    const productsDays = daysForVendorDashboardLabel(dateFilter.products);

    const revCurrent = filterOrdersInRollingWindow(pool, revenueDays, endMs);
    const revPrev = filterOrdersInPriorWindow(pool, revenueDays, endMs - revenueDays * 86400000);
    const totalRevenue = sumRevenue(revCurrent);

    const ordCurrent = filterOrdersInRollingWindow(pool, ordersDays, endMs);
    const ordPrev = filterOrdersInPriorWindow(pool, ordersDays, endMs - ordersDays * 86400000);

    const custCurrent = filterOrdersInRollingWindow(pool, customersDays, endMs);
    const custPrev = filterOrdersInPriorWindow(pool, customersDays, endMs - customersDays * 86400000);

    const prodWindowEnd = endMs;
    const prodWindowStart = endMs - productsDays * 86400000;
    const prodPrevStart = prodWindowStart - productsDays * 86400000;
    const prodPrevEnd = prodWindowStart;

    const productsAddedCurrent = countProductsLikelyAddedInWindow(
      rawProducts,
      prodWindowStart,
      prodWindowEnd
    );
    const productsAddedPrev = countProductsLikelyAddedInWindow(
      rawProducts,
      prodPrevStart,
      prodPrevEnd
    );

    const stats: DashboardStats = {
      totalProducts: rawProducts.length,
      totalOrders: countActiveOrders(ordCurrent),
      totalRevenue,
      totalCustomers: uniqueCustomerEmails(custCurrent),
      revenueChange: pctChangePriorWindow(sumRevenue(revCurrent), sumRevenue(revPrev)),
      ordersChange: pctChangePriorWindow(ordCurrent.length, ordPrev.length),
      customersChange: pctChangePriorWindow(
        uniqueCustomerEmails(custCurrent),
        uniqueCustomerEmails(custPrev)
      ),
      productsChange: pctChangePriorWindow(productsAddedCurrent, productsAddedPrev),
    };

    const topProducts: TopProductRow[] = topProductsFromOrders(revCurrent, 4);
    const recentOrders: RecentOrderRow[] = recentOrdersFromList(pool, 5);
    const chartSeries = buildMonthlySeries(rawOrders, 6);

    return { stats, topProducts, recentOrders, chartSeries };
  }, [rawOrders, rawProducts, dateFilter]);

  const { stats, topProducts, recentOrders, chartSeries } = derived;

  useEffect(() => {
    void loadDashboardData(false);
  }, [vendorId]);

  const loadDashboardData = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = peekCachedVendorDashboardData(vendorId);
      if (cached != null) {
        setRawOrders(cached.orders);
        setRawProducts(cached.products);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [productsData, vendorOrders] = await Promise.all([
        getCachedVendorProductsAdmin(vendorId, forceRefresh).catch(() => ({ products: [] as any[] })),
        getCachedVendorOrders(vendorId, forceRefresh).catch(() => [] as any[]),
      ]);
      setRawProducts(productsData.products || []);
      setRawOrders(Array.isArray(vendorOrders) ? vendorOrders : []);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

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
    filterKey,
  }: {
    title: string;
    value: string | number;
    change: number;
    icon: typeof DollarSign;
    iconBg: string;
    iconColor: string;
    filterKey: DateFilterKey;
  }) => (
    <Card className="p-5 border-slate-200 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600 font-medium mb-1">{title}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-4"
              >
                {dateFilter[filterKey]} <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last 7 days" })}
              >
                Last 7 days
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last 30 days" })}
              >
                Last 30 days
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last 90 days" })}
              >
                Last 90 days
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDateFilter({ ...dateFilter, [filterKey]: "Last year" })}
              >
                Last year
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xl font-bold text-slate-900 mb-2">{value}</p>
          <div className="flex items-center gap-1">
            {change === 0 ? (
              <span className="text-xs font-medium text-slate-500">No change vs prior period</span>
            ) : (
              <>
                {change > 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-green-600 shrink-0" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                )}
                <span
                  className={`text-xs font-medium ${change > 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {change > 0 ? "+" : ""}
                  {change}% vs prior period
                </span>
              </>
            )}
          </div>
        </div>
        <div className={`${iconBg} p-2 rounded-full ml-4 flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );

  const chartHasData = chartSeries.some((p) => p.revenue > 0 || p.orders > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Analytics</h1>
        <p className="text-sm text-slate-600">
          Welcome back, {vendorName}! Here&apos;s what&apos;s happening today.
        </p>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Sales Overview</h3>
            <p className="text-sm text-slate-600">
              Monthly revenue ({dateFilter.revenue.toLowerCase()} for KPIs; chart shows last 6 months)
            </p>
          </div>
          {chartHasData ? (
            <div className="h-64 w-full min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => {
                      const n = Number(v);
                      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                      if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
                      return String(Math.round(n));
                    }}
                  />
                  <Tooltip
                    formatter={(value: number | string) => [
                      `${Math.round(Number(value)).toLocaleString()} MMK`,
                      "Revenue",
                    ]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue (MMK)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No sales in the last 6 months</p>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Top Products</h3>
            <p className="text-sm text-slate-600">Best sellers in {dateFilter.revenue.toLowerCase()}</p>
          </div>
          <div className="space-y-4">
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm">No product sales in this period</p>
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

      <Card className="p-6 border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Recent Orders</h3>
            <p className="text-sm text-slate-600">Latest customer orders</p>
          </div>
          <button
            type="button"
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
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">
                    Order ID
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">
                    Customer
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">
                    Items
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">
                    Total
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-900 font-medium">
                      #{order.id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-900">{order.customerName}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{order.items}</td>
                    <td className="py-3 px-4 text-sm text-slate-900 font-medium">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          order.status === "fulfilled"
                            ? "bg-green-100 text-green-700"
                            : order.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : order.status === "processing" || order.status === "ready-to-ship"
                                ? "bg-blue-100 text-blue-700"
                                : order.status === "cancelled"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-700"
                        }`}
                      >
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
