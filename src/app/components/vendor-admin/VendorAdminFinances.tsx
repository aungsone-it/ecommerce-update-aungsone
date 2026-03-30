import { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  ShoppingCart,
  Download,
  CreditCard,
  BadgePercent,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import {
  getCachedVendorOrders,
  getCachedVendorProductsAdmin,
  ADMIN_PRODUCTS_INITIAL_PAGE_SIZE,
} from "../../utils/module-cache";
import { VendorAdminListingPagination } from "./VendorAdminListingPagination";
import {
  isVendorOrderActive,
  vendorOrderDisplayTotal,
  vendorOrderTimeMs,
  buildMonthlySeries,
  daysForVendorDashboardLabel,
  filterOrdersInRollingWindow,
  filterOrdersInPriorWindow,
  pctChangePriorWindow,
} from "../../utils/vendorAdminAnalytics";
import { computeVendorCommissionEarned } from "../../utils/vendorCommissionEarned";

type FinancesDateFilterKey = "revenue" | "commission" | "orders" | "avgOrder";

function sumRevenueForOrders(orders: any[]): number {
  return orders.reduce((s, o) => s + vendorOrderDisplayTotal(o), 0);
}

interface VendorAdminFinancesProps {
  vendorId: string;
  vendorName: string;
  /** Used to load contract commission % from `vendors/by-slug`; falls back to `vendorId`. */
  vendorStoreSlug?: string;
}

interface Transaction {
  id: string;
  date: string;
  orderNumber: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  paymentMethod: string;
}

function formatMmk(n: number): string {
  return `${Math.round(n).toLocaleString()} MMK`;
}

function transactionStatusFromOrder(order: any): "paid" | "pending" | "failed" {
  const s = String(order?.status ?? "").toLowerCase();
  if (s === "cancelled") return "failed";
  if (s === "fulfilled" || order?.paymentStatus === "paid") return "paid";
  return "pending";
}

async function fetchVendorContractCommissionPercent(slugOrId: string | undefined): Promise<number> {
  const key = slugOrId?.trim();
  if (!key) return 15;
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors/by-slug/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    if (!res.ok) return 15;
    const data = (await res.json()) as { vendor?: { commission?: unknown } };
    const c = data.vendor?.commission;
    if (c == null || c === "") return 15;
    const n = typeof c === "number" ? c : parseFloat(String(c));
    return Number.isFinite(n) && n >= 0 ? n : 15;
  } catch {
    return 15;
  }
}

export function VendorAdminFinances({
  vendorId,
  vendorName,
  vendorStoreSlug,
}: VendorAdminFinancesProps) {
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"3months" | "6months" | "12months">("6months");
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  const [vendorContractCommissionPct, setVendorContractCommissionPct] = useState(15);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
  const [dateFilter, setDateFilter] = useState({
    revenue: "Last 30 days",
    commission: "Last 30 days",
    orders: "Last 30 days",
    avgOrder: "Last 30 days",
  });

  useEffect(() => {
    void loadFinancialData();
  }, [vendorId, vendorStoreSlug]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const slugKey = (vendorStoreSlug && vendorStoreSlug.trim()) || vendorId;
      const [vendorOrders, productsPayload, contractPct] = await Promise.all([
        getCachedVendorOrders(vendorId, false).catch(() => [] as any[]),
        getCachedVendorProductsAdmin(vendorId, false).catch(() => ({ products: [] as any[] })),
        fetchVendorContractCommissionPercent(slugKey),
      ]);
      setRawOrders(Array.isArray(vendorOrders) ? vendorOrders : []);
      setRawProducts(productsPayload.products || []);
      setVendorContractCommissionPct(contractPct);
    } catch (error) {
      console.error("Failed to load financial data:", error);
      setRawOrders([]);
      setRawProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const { stats, revenueData, transactions } = useMemo(() => {
    const endMs = Date.now();
    const pool = rawOrders.filter(isVendorOrderActive);

    const revDays = daysForVendorDashboardLabel(dateFilter.revenue);
    const commDays = daysForVendorDashboardLabel(dateFilter.commission);
    const ordDays = daysForVendorDashboardLabel(dateFilter.orders);
    const avgDays = daysForVendorDashboardLabel(dateFilter.avgOrder);

    const revCurrent = filterOrdersInRollingWindow(pool, revDays, endMs);
    const revPrev = filterOrdersInPriorWindow(pool, revDays, endMs - revDays * 86400000);
    const totalRevenue = sumRevenueForOrders(revCurrent);
    const revenueChange = pctChangePriorWindow(
      sumRevenueForOrders(revCurrent),
      sumRevenueForOrders(revPrev)
    );

    const commOrdersCurrent = filterOrdersInRollingWindow(rawOrders, commDays, endMs);
    const commOrdersPrev = filterOrdersInPriorWindow(rawOrders, commDays, endMs - commDays * 86400000);
    const commissionEarned = computeVendorCommissionEarned(
      commOrdersCurrent,
      rawProducts,
      vendorId,
      vendorContractCommissionPct
    );
    const commissionPrev = computeVendorCommissionEarned(
      commOrdersPrev,
      rawProducts,
      vendorId,
      vendorContractCommissionPct
    );
    const commissionChange = pctChangePriorWindow(commissionEarned, commissionPrev);

    const ordCurrent = filterOrdersInRollingWindow(pool, ordDays, endMs);
    const ordPrev = filterOrdersInPriorWindow(pool, ordDays, endMs - ordDays * 86400000);
    const ordersChange = pctChangePriorWindow(ordCurrent.length, ordPrev.length);

    const avgCurrent = filterOrdersInRollingWindow(pool, avgDays, endMs);
    const avgPrev = filterOrdersInPriorWindow(pool, avgDays, endMs - avgDays * 86400000);
    const averageOrderValue =
      avgCurrent.length > 0 ? sumRevenueForOrders(avgCurrent) / avgCurrent.length : 0;
    const averageOrderValuePrev =
      avgPrev.length > 0 ? sumRevenueForOrders(avgPrev) / avgPrev.length : 0;
    const avgOrderChange = pctChangePriorWindow(averageOrderValue, averageOrderValuePrev);

    const fullSeries = buildMonthlySeries(rawOrders, 12);
    const sliceN = timeFilter === "3months" ? 3 : timeFilter === "6months" ? 6 : 12;
    const chartSlice = fullSeries.slice(-sliceN);

    const trans: Transaction[] = [...pool]
      .sort((a, b) => vendorOrderTimeMs(b) - vendorOrderTimeMs(a))
      .map((order: any) => ({
        id: order.id,
        date: new Date(vendorOrderTimeMs(order)).toLocaleDateString(),
        orderNumber: order.orderNumber || order.id,
        amount: vendorOrderDisplayTotal(order),
        status: transactionStatusFromOrder(order),
        paymentMethod: order.paymentMethod || "—",
      }));

    return {
      stats: {
        totalRevenue,
        revenueChange,
        commissionEarned,
        commissionChange,
        totalOrders: ordCurrent.length,
        ordersChange,
        averageOrderValue,
        avgOrderChange,
      },
      revenueData: chartSlice,
      transactions: trans,
    };
  }, [
    rawOrders,
    rawProducts,
    vendorId,
    vendorContractCommissionPct,
    timeFilter,
    dateFilter,
  ]);

  const chartRangeMonths =
    timeFilter === "3months" ? 3 : timeFilter === "6months" ? 6 : 12;

  useEffect(() => {
    setTxPage(1);
  }, [rawOrders.length, timeFilter, dateFilter]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(transactions.length / txPageSize) || 1);
    setTxPage((p) => Math.min(p, tp));
  }, [transactions.length, txPageSize]);

  const pagedTransactions = useMemo(() => {
    const start = (txPage - 1) * txPageSize;
    return transactions.slice(start, start + txPageSize);
  }, [transactions, txPage, txPageSize]);

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
    filterKey: FinancesDateFilterKey;
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-40" />
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

        <Card className="p-6 border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-12" />
              ))}
            </div>
          </div>
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </Card>

        <Card className="p-6 border-slate-200">
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-56 mb-6" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </Card>

        <Card className="p-6 border-slate-200">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finances</h1>
          <p className="text-slate-600">
            Track revenue and transactions for {vendorName}
          </p>
        </div>
        <Button variant="outline" disabled className="opacity-50 cursor-not-allowed">
          <Download className="w-4 h-4 mr-2" />
          Export Report (Disabled)
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={formatMmk(stats.totalRevenue)}
          change={stats.revenueChange}
          icon={DollarSign}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          filterKey="revenue"
        />
        <StatCard
          title="Commission Earned"
          value={formatMmk(stats.commissionEarned)}
          change={stats.commissionChange}
          icon={BadgePercent}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          filterKey="commission"
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          change={stats.ordersChange}
          icon={ShoppingCart}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          filterKey="orders"
        />
        <StatCard
          title="Avg Order Value"
          value={formatMmk(stats.averageOrderValue)}
          change={stats.avgOrderChange}
          icon={CreditCard}
          iconBg="bg-orange-100"
          iconColor="text-orange-600"
          filterKey="avgOrder"
        />
      </div>

      <Card className="p-6 border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Revenue Overview</h3>
            <p className="text-sm text-slate-600">
              Monthly revenue (each KPI card uses its own period above; chart shows last{" "}
              {chartRangeMonths} months)
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant={timeFilter === "3months" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("3months")}
            >
              3M
            </Button>
            <Button
              variant={timeFilter === "6months" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("6months")}
            >
              6M
            </Button>
            <Button
              variant={timeFilter === "12months" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("12months")}
            >
              12M
            </Button>
          </div>
        </div>

        {revenueData.length > 0 && revenueData.some((d) => d.revenue > 0) ? (
          <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 text-slate-500 text-sm">
            No revenue in this chart range
          </div>
        )}
      </Card>

      <Card className="p-6 border-slate-200">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Orders by Month</h3>
          <p className="text-sm text-slate-600">
            Order count per month (same {chartRangeMonths}-month window as revenue chart)
          </p>
        </div>
        {revenueData.length > 0 && revenueData.some((d) => d.orders > 0) ? (
          <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="orders" fill="#8b5cf6" radius={[8, 8, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 text-slate-500 text-sm">
            No orders in this chart range
          </div>
        )}
      </Card>

      <Card className="border-slate-200 overflow-hidden p-0 shadow-sm">
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
        </div>
        <div className="px-6 space-y-3 pb-2">
          {transactions.length > 0 ? (
            pagedTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{transaction.orderNumber}</p>
                    <p className="text-sm text-slate-600 truncate">
                      {transaction.date} • {transaction.paymentMethod}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <Badge
                    className={
                      transaction.status === "paid"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : transaction.status === "pending"
                          ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                          : "bg-red-100 text-red-700 border-red-200"
                    }
                  >
                    {transaction.status}
                  </Badge>
                  <p className="font-semibold text-slate-900 min-w-[100px] text-right tabular-nums">
                    {formatMmk(transaction.amount)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-500">No transactions yet</div>
          )}
        </div>
        {transactions.length > 0 && (
          <VendorAdminListingPagination
            variant="cardFooter"
            page={txPage}
            pageSize={txPageSize}
            totalCount={transactions.length}
            onPageChange={setTxPage}
            onPageSizeChange={setTxPageSize}
            itemLabel="transactions"
            loading={loading}
          />
        )}
      </Card>
    </div>
  );
}
