import { useState, useEffect, useMemo, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { useLanguage } from "../contexts/LanguageContext";
import {
  TrendingUp,
  CreditCard,
  Banknote,
  Wallet,
  ArrowUpRight,
  Calendar,
  Download,
  X,
  Eye,
  Coins,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { AdminClearableSearchInput } from "./AdminClearableSearchInput";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { AdminDateRangeFilterPopover } from "./AdminDateRangeFilterPopover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { formatNumber } from "../../utils/formatNumber"; // 🔥 Import number formatting
import { format, startOfDay, endOfDay } from "date-fns";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import {
  readFinancialAnalyticsHydrate,
  getCachedFinancialAnalytics,
} from "../utils/module-cache";
import {
  LS_ADMIN_FINANCES_ANALYTICS,
  readPersistedPayloadSavedAt,
} from "../utils/persistedLocalCache";
import { adminOrdersUpdatedStorageKey, consumeSuperAdminFinancesSessionStale } from "../utils/adminOrdersRealtime";

/** Large amount + very small MMK; font scales down inside @container cards for billion-scale values. */
function FinancesStatMmk({ value }: { value: number }) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return (
    <p className="mt-1 flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1 gap-y-0.5">
      <span className="min-w-0 max-w-full font-bold tabular-nums leading-tight text-slate-900 [font-size:clamp(0.75rem,6.25cqi,1.5rem)] break-words">
        {formatNumber(n)}
      </span>
      <span className="shrink-0 font-medium text-slate-500 uppercase tracking-wider leading-none [font-size:clamp(0.5rem,3.25cqi,0.625rem)]">
        MMK
      </span>
    </p>
  );
}

// Use placeholder payment method logos for production deployment
const kbzPayLogo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%234f46e5' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-size='16' font-weight='bold'%3EKBZ%3C/text%3E%3C/svg%3E";
const waveMoneyLogo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%2306b6d4' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-size='14' font-weight='bold'%3EWAVE%3C/text%3E%3C/svg%3E";
const trueMoneyLogo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23f97316' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-size='14' font-weight='bold'%3ETRUE%3C/text%3E%3C/svg%3E";

const COLORS = ['#3b82f6', '#facc15', '#ef4444', '#22c55e'];

function isFinanciallyAccruedTransaction(transaction: any): boolean {
  const status = String(transaction?.status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return status === "ready-to-ship" || status === "fulfilled";
}

function filterFinancesTransactionsByRange(transactions: any[], range: DateRange | undefined): any[] {
  if (!range?.from || !range?.to) return transactions;
  const from = startOfDay(range.from);
  const to = endOfDay(range.to);
  return transactions.filter((t: any) => {
    const d = new Date(t.date);
    return !Number.isNaN(d.getTime()) && d >= from && d <= to;
  });
}

const getPaymentMethodIcon = (method: string) => {
  const lowerMethod = method.toLowerCase();
  if (lowerMethod.includes('kpay') || lowerMethod.includes('kbz')) return { icon: CreditCard, logo: kbzPayLogo, color: 'bg-indigo-500' };
  if (lowerMethod.includes('wave')) return { icon: Wallet, logo: waveMoneyLogo, color: 'bg-cyan-500' };
  if (lowerMethod.includes('true')) return { icon: CreditCard, logo: trueMoneyLogo, color: 'bg-orange-500' };
  if (lowerMethod.includes('cash') || lowerMethod.includes('cod')) return { icon: Banknote, logo: null, color: 'bg-green-500' };
  return { icon: CreditCard, logo: null, color: 'bg-gray-500' };
};

export function Finances() {
  const { t } = useLanguage();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [pageDateRange, setPageDateRange] = useState<DateRange | undefined>(undefined);
  const [pageDatePickerOpen, setPageDatePickerOpen] = useState(false);
  const [txnListPage, setTxnListPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [chartPeriod, setChartPeriod] = useState("7days");

  const financesBoot = useMemo(() => {
    const h = readFinancialAnalyticsHydrate();
    return { data: h, showSkeleton: !h };
  }, []);
  const [financialData, setFinancialData] = useState<any>(financesBoot.data);
  const [loading, setLoading] = useState(financesBoot.showSkeleton);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const financialDataRef = useRef<any>(null);
  financialDataRef.current = financialData;

  const FINANCES_BACKGROUND_MAX_AGE_MS = 120_000;

  // Cache-first: session module + localStorage via `getCachedFinancialAnalytics(false)` (no network when warm).
  // Forced refresh: session stale flag (storefront/admin orders), `adminOrdersUpdated`, cross-tab storage,
  // and background TTL for long-lived tabs.
  useEffect(() => {
    let cancelled = false;

    const load = async (forceRefresh: boolean) => {
      const hadData = financialDataRef.current != null;
      if (!hadData) setLoading(true);
      if (forceRefresh && hadData) setRevalidating(true);
      try {
        const data = await getCachedFinancialAnalytics(forceRefresh);
        if (cancelled) return;
        setFinancialData(data);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        console.error("❌ Error fetching financial data:", err);
        const stillNoData = financialDataRef.current == null;
        if (err.name === "AbortError") {
          if (stillNoData) {
            setError(
              "Request timed out. Server may be starting up, please try again in a moment."
            );
          }
          toast.error("Request timeout", {
            description: "The server is starting up. Please refresh in a moment.",
          });
        } else {
          if (stillNoData) {
            setError(err.message);
          }
          toast.error(stillNoData ? "Failed to load financial data" : "Could not refresh finances", {
            description: err.message,
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRevalidating(false);
        }
      }
    };

    const runInitial = async () => {
      const mustForce = consumeSuperAdminFinancesSessionStale();
      await load(mustForce);
      if (cancelled || mustForce) return;

      const savedAt = readPersistedPayloadSavedAt(LS_ADMIN_FINANCES_ANALYTICS);
      if (savedAt != null && Date.now() - savedAt < FINANCES_BACKGROUND_MAX_AGE_MS) return;

      if (cancelled) return;
      if (financialDataRef.current == null) return;
      setRevalidating(true);
      try {
        const data = await getCachedFinancialAnalytics(true);
        if (cancelled) return;
        setFinancialData(data);
      } catch (err: any) {
        if (!cancelled) console.warn("Finances background revalidate:", err);
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    };

    void runInitial();

    const onOrdersUpdated = () => void load(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== adminOrdersUpdatedStorageKey()) return;
      void load(true);
    };
    window.addEventListener("adminOrdersUpdated", onOrdersUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("adminOrdersUpdated", onOrdersUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Extract data from API response
  const transactions = useMemo(
    () => (financialData?.transactions || []).filter((t: any) => isFinanciallyAccruedTransaction(t)),
    [financialData?.transactions]
  );
  const vendorPayouts = financialData?.vendorPayouts || [];

  const scopedTransactions = useMemo(
    () => filterFinancesTransactionsByRange(transactions, pageDateRange),
    [transactions, pageDateRange]
  );

  const dashboardSummary = useMemo(() => {
    let totalCommission = 0;
    let totalVendorPayout = 0;
    for (const t of scopedTransactions) {
      totalCommission += Number(t.commission) || 0;
      totalVendorPayout += Number(t.vendorPayout) || 0;
    }
    return { totalCommission, totalVendorPayout };
  }, [scopedTransactions]);

  const { totalCommission, totalVendorPayout } = dashboardSummary;

  const revenueStatTotal = useMemo(
    () => scopedTransactions.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0),
    [scopedTransactions]
  );

  const commissionPayoutStatTotal = totalCommission;

  const periodDays = chartPeriod === "7days" ? 7 : chartPeriod === "30days" ? 30 : 90;

  const chartDataFromScope = useMemo(() => {
    const daily = new Map<string, { revenue: number; commission: number }>();
    for (const t of scopedTransactions) {
      const d = new Date(t.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = format(startOfDay(d), "yyyy-MM-dd");
      const cur = daily.get(key) || { revenue: 0, commission: 0 };
      cur.revenue += Number(t.amount) || 0;
      cur.commission += Number(t.commission) || 0;
      daily.set(key, cur);
    }
    const sorted = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const sliced = sorted.slice(-periodDays);
    return sliced.map(([dateStr, data], index) => ({
      date: new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: data.revenue,
      commission: data.commission,
      uniqueKey: `revenue-${dateStr}-${index}`,
    }));
  }, [scopedTransactions, periodDays]);

  const paymentMethodsFromScope = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    let total = 0;
    for (const t of scopedTransactions) {
      const m = String(t.method || "Cash");
      const cur = map.get(m) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(t.amount) || 0;
      map.set(m, cur);
      total += Number(t.amount) || 0;
    }
    return Array.from(map.entries()).map(([method, data]) => ({
      method,
      transactions: data.count,
      amount: data.amount,
      percentage: total > 0 ? (data.amount / total) * 100 : 0,
      uniqueKey: `payment-${method}`,
    }));
  }, [scopedTransactions]);

  const vendorPayoutsFromScope = useMemo(() => {
    const emailById = new Map<string, string>(
      vendorPayouts.map((p: any) => [String(p.id), String(p.email || "")])
    );
    const map = new Map<string, { id: string; vendor: string; email: string; payout: number; orders: number; status: string }>();
    for (const t of scopedTransactions) {
      const id = String(t.vendorId || t.vendor || "unknown");
      const cur =
        map.get(id) || {
          id,
          vendor: String(t.vendor || "Unknown"),
          email: emailById.get(id) || "",
          payout: 0,
          orders: 0,
          status: "pending",
        };
      cur.payout += Number(t.vendorPayout) || 0;
      cur.orders += 1;
      if (!cur.email && emailById.has(id)) cur.email = emailById.get(id)!;
      map.set(id, cur);
    }
    return Array.from(map.values());
  }, [scopedTransactions, vendorPayouts]);

  const filteredTransactions = scopedTransactions.filter((t: any) => {
    const matchesSearch = t.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         t.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.vendor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || t.status === filterStatus;
    const methodText = String(t.method || "").trim().toLowerCase();
    const filterText = String(filterMethod || "").trim().toLowerCase();
    const matchesMethod =
      filterMethod === "all" ||
      methodText === filterText ||
      (filterText === "kbzpay" && (methodText.includes("kpay") || methodText.includes("kbz")));
    
    return matchesSearch && matchesStatus && matchesMethod;
  });

  const TX_PAGE_SIZE = 25;

  useEffect(() => {
    setTxnListPage(1);
  }, [searchQuery, filterStatus, filterMethod, pageDateRange?.from, pageDateRange?.to]);

  const txnListTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / TX_PAGE_SIZE));

  useEffect(() => {
    setTxnListPage((p) => Math.min(p, txnListTotalPages));
  }, [txnListTotalPages]);

  const paginatedTransactions = useMemo(() => {
    const start = (txnListPage - 1) * TX_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TX_PAGE_SIZE);
  }, [filteredTransactions, txnListPage]);

  // Calculate filtered totals
  const filteredTotalRevenue = filteredTransactions.reduce((sum: number, t: any) => sum + t.amount, 0);
  const filteredTotalCommission = filteredTransactions.reduce((sum: number, t: any) => sum + t.commission, 0);
  const filteredTotalVendorPayout = filteredTransactions.reduce((sum: number, t: any) => sum + t.vendorPayout, 0);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterMethod("all");
  };

  const hasActiveFilters =
    searchQuery ||
    filterStatus !== "all" ||
    filterMethod !== "all";

  const exportTransactions = () => {
    const headers = ["Transaction ID", "Date", "Customer", "Vendor", "Method", "Amount", "Commission", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredTransactions.map((t: any) => 
        [t.id, t.date, t.customer, t.vendor, t.method, t.amount, t.commission, t.status].join(",")
      )
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  // Prepare pie chart data for commission breakdown
  const commissionBreakdownData = [
    { name: t('finances.platformCommission'), value: totalCommission },
    { name: t('finances.commissionPayout'), value: totalVendorPayout },
  ];

  // Show loading state
  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('finances.title')}</h1>
          <p className="text-slate-600">{t('finances.subtitle')}</p>
        </div>
        
        {/* Skeleton stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={`skeleton-stat-${index}`} className="animate-pulse">
              <div className="p-6 space-y-3">
                <div className="h-4 bg-slate-200 rounded w-24"></div>
                <div className="h-8 bg-slate-200 rounded w-32"></div>
                <div className="h-3 bg-slate-200 rounded w-20"></div>
              </div>
            </Card>
          ))}
        </div>
        
        {/* Skeleton chart */}
        <Card className="animate-pulse">
          <div className="p-6 space-y-4">
            <div className="h-6 bg-slate-200 rounded w-48"></div>
            <div className="h-64 bg-slate-200 rounded"></div>
          </div>
        </Card>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('finances.title')}</h1>
          <p className="text-slate-600">{t('finances.subtitle')}</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <p className="text-red-800 font-medium mb-2">Failed to load financial data</p>
            <p className="text-red-600 text-sm">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-4"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('finances.title')}</h1>
        <p className="text-slate-600">{t('finances.subtitle')}</p>
        {revalidating && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
            <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
            Syncing latest numbers…
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AdminDateRangeFilterPopover
            value={pageDateRange}
            onChange={setPageDateRange}
            hintText={t("finances.filterByDateHint")}
            titleText={t("finances.filterByDate")}
            open={pageDatePickerOpen}
            onOpenChange={setPageDatePickerOpen}
            align="start"
          >
            <Button variant="outline" size="sm" className="font-normal">
              <Calendar className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate max-w-[min(100%,16rem)] text-left">
                {!pageDateRange?.from
                  ? t("finances.allTime")
                  : !pageDateRange.to
                    ? t("finances.selectEndDate")
                    : `${format(pageDateRange.from, "MMM d, yyyy")} – ${format(pageDateRange.to, "MMM d, yyyy")}`}
              </span>
            </Button>
          </AdminDateRangeFilterPopover>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="@container flex h-full min-h-[11rem] flex-col">
          <CardContent className="flex h-full min-h-0 flex-1 flex-col p-6">
            <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-600">{t("finances.totalRevenue")}</p>
                <FinancesStatMmk value={revenueStatTotal} />
                <div className="mt-2 flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">+12.5%</span>
                  <span className="text-sm text-slate-500">vs last month</span>
                </div>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="@container flex h-full min-h-[11rem] flex-col">
          <CardContent className="flex h-full min-h-0 flex-1 flex-col p-6">
            <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-600">{t("finances.commissionPayout")}</p>
                <FinancesStatMmk value={commissionPayoutStatTotal} />
                <p className="mt-2 text-xs leading-snug text-slate-500">
                  {t("finances.commissionPayoutHint")}
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Coins className="h-6 w-6 text-amber-700" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">{t("finances.overview")}</TabsTrigger>
          <TabsTrigger value="transactions">{t("finances.transactions")}</TabsTrigger>
          <TabsTrigger value="vendor-payouts">{t("finances.vendorPayouts")}</TabsTrigger>
          <TabsTrigger value="payment-methods">{t("finances.paymentMethods")}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Revenue Analytics Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Revenue Analytics</CardTitle>
                <Select value={chartPeriod} onValueChange={setChartPeriod}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">7 Days</SelectItem>
                    <SelectItem value="30days">30 Days</SelectItem>
                    <SelectItem value="90days">90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartDataFromScope}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Revenue"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="commission" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    name="Commission"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Commission Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Commission Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={commissionBreakdownData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {commissionBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => `$${(value || 0).toFixed(2)}`}
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment Methods Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={paymentMethodsFromScope}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="method" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip 
                      formatter={(value: any) => `$${(value || 0).toFixed(2)}`}
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="amount" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <AdminClearableSearchInput
                    placeholder="Search by ID, customer, or vendor..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                </div>
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full lg:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterMethod} onValueChange={setFilterMethod}>
                  <SelectTrigger className="w-full lg:w-40">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="KBZPay">KBZPay</SelectItem>
                    <SelectItem value="Wave Money">Wave Money</SelectItem>
                    <SelectItem value="True Money">True Money</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters}>
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                )}

                <Button onClick={exportTransactions}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      Showing {filteredTransactions.length} of {scopedTransactions.length} transactions
                    </span>
                    <div className="flex gap-4">
                      <span className="text-slate-600">
                        Revenue: <span className="font-medium text-slate-900">${filteredTotalRevenue.toFixed(2)}</span>
                      </span>
                      <span className="text-slate-600">
                        Commission: <span className="font-medium text-slate-900">${filteredTotalCommission.toFixed(2)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card>
            <CardContent className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Transaction ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Customer</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Vendor</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Method</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">Amount</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">Commission</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-500">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.map((transaction: any) => {
                        const methodInfo = getPaymentMethodIcon(transaction.method);
                        const MethodIcon = methodInfo.icon;
                        
                        return (
                          <tr key={transaction.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4 text-sm font-medium text-slate-900">{transaction.id}</td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {format(new Date(transaction.date), "MMM dd, yyyy")}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-900">{transaction.customer}</td>
                            <td className="py-3 px-4 text-sm text-slate-900">{transaction.vendor}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <MethodIcon className={`w-4 h-4 text-white`} />
                                <span className="text-sm text-slate-900">{transaction.method}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm font-medium text-right text-slate-900">
                              ${(transaction.amount || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-sm text-right text-green-600">
                              ${(transaction.commission || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge 
                                variant={transaction.status === 'completed' ? 'default' : transaction.status === 'pending' ? 'secondary' : 'destructive'}
                              >
                                {transaction.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedTransaction(transaction)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {filteredTransactions.length > 0 && filteredTransactions.length > TX_PAGE_SIZE && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-600">
                    Showing {(txnListPage - 1) * TX_PAGE_SIZE + 1}–
                    {Math.min(txnListPage * TX_PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={txnListPage <= 1}
                      onClick={() => setTxnListPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-slate-600 tabular-nums">
                      {txnListPage} / {txnListTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={txnListPage >= txnListTotalPages}
                      onClick={() => setTxnListPage((p) => Math.min(txnListTotalPages, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendor Payouts Tab */}
        <TabsContent value="vendor-payouts" className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Vendor</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Email</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">Orders</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">Payout</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorPayoutsFromScope.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-500">
                          No vendor payouts found
                        </td>
                      </tr>
                    ) : (
                      vendorPayoutsFromScope.map((payout: any) => (
                        <tr key={payout.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 text-sm font-medium text-slate-900">{payout.vendor}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{payout.email}</td>
                          <td className="py-3 px-4 text-sm text-center text-slate-900">{payout.orders}</td>
                          <td className="py-3 px-4 text-sm font-medium text-right text-slate-900">
                            ${(payout.payout || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="secondary">{payout.status}</Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Methods Tab */}
        <TabsContent value="payment-methods" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {paymentMethodsFromScope.map((method: any) => {
              const methodInfo = getPaymentMethodIcon(method.method);
              const MethodIcon = methodInfo.icon;
              
              return (
                <Card key={method.method}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 ${methodInfo.color} rounded-lg flex items-center justify-center`}>
                        <MethodIcon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600">{method.method}</p>
                        <p className="text-xs text-slate-500">{method.transactions} transactions</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">${(method.amount || 0).toFixed(2)}</p>
                      <p className="text-sm text-slate-600 mt-1">{(method.percentage || 0).toFixed(1)}% of total</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Transaction Details Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              Transaction ID: {selectedTransaction?.id}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Customer</p>
                  <p className="text-sm text-slate-900">{selectedTransaction.customer}</p>
                  <p className="text-xs text-slate-500">{selectedTransaction.customerEmail}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Vendor</p>
                  <p className="text-sm text-slate-900">{selectedTransaction.vendor}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Date</p>
                  <p className="text-sm text-slate-900">
                    {format(new Date(selectedTransaction.date), "MMMM dd, yyyy 'at' HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Payment Method</p>
                  <p className="text-sm text-slate-900">{selectedTransaction.method}</p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-600 mb-3">Products</p>
                {selectedTransaction.products && selectedTransaction.products.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTransaction.products.map((product: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-slate-900">
                          {product.name || product.title} × {product.quantity}
                        </span>
                        <span className="text-slate-600">
                          ${((product.price || product.total) * product.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No product details available</p>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="text-slate-900">${selectedTransaction.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Platform Commission</span>
                  <span className="text-green-600">-${selectedTransaction.commission.toFixed(2)}</span>
                </div>
                {selectedTransaction.gatewayFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Gateway Fee</span>
                    <span className="text-slate-600">-${selectedTransaction.gatewayFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-medium pt-2 border-t border-slate-200">
                  <span className="text-slate-900">Vendor Payout</span>
                  <span className="text-slate-900">${selectedTransaction.vendorPayout.toFixed(2)}</span>
                </div>
              </div>

              {selectedTransaction.shippingAddress && (
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm font-medium text-slate-600 mb-1">Shipping Address</p>
                  <p className="text-sm text-slate-900">{selectedTransaction.shippingAddress}</p>
                </div>
              )}

              {selectedTransaction.trackingNumber && (
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm font-medium text-slate-600 mb-1">Tracking Number</p>
                  <p className="text-sm text-slate-900 font-mono">{selectedTransaction.trackingNumber}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}