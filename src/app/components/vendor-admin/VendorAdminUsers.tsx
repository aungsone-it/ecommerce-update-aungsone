import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  TrendingUp,
  CheckCircle2,
  DollarSign,
  Package,
  MoreVertical,
  Ban,
  Trash2,
  Eye,
  MessageSquare,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ADMIN_PRODUCTS_INITIAL_PAGE_SIZE } from "../../utils/module-cache";
import { VendorAdminListingPagination } from "./VendorAdminListingPagination";
import { CustomerProfile } from "../CustomerProfile";
import { cacheManager } from "../../utils/cacheManager";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  subscribeCustomerRealtime,
  invalidateVendorAudienceListCache,
} from "../../utils/customersRealtime";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "customer" | "admin" | "staff";
  status: "active" | "inactive" | "blocked";
  location?: string;
  avatar?: string;
  joinedDate: string;
  totalOrders?: number;
  totalSpent?: number;
  segment?: string;
  avgOrder?: number;
  tags?: string[];
  isNew?: boolean;
}

interface VendorAdminUsersProps {
  vendorId: string;
  vendorName: string;
}

function deriveTier(user: User): "new" | "regular" | "vip" {
  if (user.isNew || (user.totalOrders ?? 0) === 0) return "new";
  if ((user.totalSpent ?? 0) >= 500_000 || (user.totalOrders ?? 0) >= 5) return "vip";
  return "regular";
}

function SegmentCell({ segment }: { segment: string }) {
  const s = segment || "Other";
  const base = "text-xs font-medium px-2.5 py-1 rounded-full border";
  if (s === "Champions")
    return <span className={`${base} bg-purple-50 text-purple-800 border-purple-200`}>{s}</span>;
  if (s === "Active")
    return <span className={`${base} bg-emerald-50 text-emerald-800 border-emerald-200`}>{s}</span>;
  if (s === "New")
    return <span className={`${base} bg-sky-50 text-sky-800 border-sky-200`}>{s}</span>;
  return <span className={`${base} bg-slate-100 text-slate-700 border-slate-200`}>{s}</span>;
}

export function VendorAdminUsers({ vendorId, vendorName }: VendorAdminUsersProps) {
  const { t } = useLanguage();
  const segmentLabel = (segment?: string) => {
    if (segment === "New") return t("customerIntel.new");
    if (segment === "Active") return t("vendorAdmin.users.active");
    if (segment === "Champions") return t("vendorAdmin.users.champions");
    if (segment === "At Risk") return t("vendorAdmin.users.atRisk");
    return t("vendorAdmin.users.other");
  };
  const audienceCacheKey = `vendor-admin-audience:${vendorId}:p1:ps${ADMIN_PRODUCTS_INITIAL_PAGE_SIZE}:q:stall:trall:sgall`;
  const cachedAudience = cacheManager.get(audienceCacheKey);
  const [users, setUsers] = useState<User[]>(() =>
    Array.isArray(cachedAudience) ? (cachedAudience as User[]) : []
  );
  const [loading, setLoading] = useState(!Array.isArray(cachedAudience));
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [filterSegment, setFilterSegment] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<"list" | "analytics">("list");
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);
  const [viewingCustomer, setViewingCustomer] = useState<any | null>(null);
  const [serverTotalCustomers, setServerTotalCustomers] = useState(0);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    champions: 0,
    atRisk: 0,
    totalRevenue: 0,
    avgLtv: 0,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [vendorId, listPage, listPageSize, searchQuery, filterStatus, filterTier, filterSegment]);

  useEffect(() => {
    setListPage(1);
  }, [searchQuery, filterStatus, filterTier, filterSegment]);

  // Live updates when a customer registers/logs in on this vendor storefront (any open admin tab/device).
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void fetchUsers({ force: true });
      }, 280);
    };
    const unsub = subscribeCustomerRealtime(scheduleRefresh, { vendorId });
    return () => {
      window.clearTimeout(debounce);
      unsub();
    };
  }, [vendorId]);

  const fetchUsers = async (opts?: { force?: boolean }) => {
    const hasWarmUsers = users.length > 0;
    if (!hasWarmUsers) setLoading(true);
    if (opts?.force) {
      invalidateVendorAudienceListCache(vendorId);
    }
    try {
      const queryKey = `vendor-admin-audience:${vendorId}:p${listPage}:ps${listPageSize}:q${searchQuery.trim().toLowerCase()}:st${filterStatus}:tr${filterTier}:sg${filterSegment}`;
      if (opts?.force) {
        cacheManager.invalidatePrefix(`vendor-admin-audience:${vendorId}:`);
      }
      const rows = await cacheManager.fetch(
        queryKey,
        async () => {
          const params = new URLSearchParams();
          params.set("page", String(listPage));
          params.set("pageSize", String(listPageSize));
          if (searchQuery.trim()) params.set("q", searchQuery.trim());
          params.set("status", filterStatus);
          params.set("tier", filterTier);
          params.set("segment", filterSegment);
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/audience/${vendorId}?${params.toString()}`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${publicAnonKey}`,
              },
            }
          );
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Failed to fetch customers");
          }
          const list = Array.isArray(data.customers) ? data.customers : [];
          const mapped = list.map((c: any) => ({
            id: c.id,
            name: c.name || c.phone || c.email?.split("@")[0] || "Customer",
            email: c.email,
            phone: c.phone || "",
            role: "customer" as const,
            status: (c.status as "active" | "inactive") || "active",
            location: c.location,
            avatar: c.avatar,
            joinedDate: c.joinedDate || new Date().toISOString(),
            totalOrders: c.totalOrders ?? 0,
            totalSpent: c.totalSpent ?? 0,
            segment: c.segment,
            avgOrder: c.avgOrder ?? 0,
            tags: c.tags || [],
            isNew: c.isNew,
          }));
          return {
            rows: mapped,
            total: Number(data.total ?? mapped.length),
            summary: data.summary || null,
          };
        },
        { ttl: 60_000, staleWhileRevalidate: true }
      );
      setUsers(Array.isArray(rows?.rows) ? (rows.rows as User[]) : []);
      setServerTotalCustomers(Number(rows?.total || 0));
      if (rows?.summary) {
        setSummary({
          totalCustomers: Number(rows.summary.totalCustomers || 0),
          activeCustomers: Number(rows.summary.activeCustomers || 0),
          champions: Number(rows.summary.champions || 0),
          atRisk: Number(rows.summary.atRisk || 0),
          totalRevenue: Number(rows.summary.totalRevenue || 0),
          avgLtv: Number(rows.summary.avgLtv || 0),
        });
      }
      const total = Number(rows?.total || 0);
      const hasNextPage = total > listPage * listPageSize;
      if (hasNextPage) {
        const nextPage = listPage + 1;
        const nextKey = `vendor-admin-audience:${vendorId}:p${nextPage}:ps${listPageSize}:q${searchQuery.trim().toLowerCase()}:st${filterStatus}:tr${filterTier}:sg${filterSegment}`;
        void cacheManager
          .fetch(
            nextKey,
            async () => {
              const params = new URLSearchParams();
              params.set("page", String(nextPage));
              params.set("pageSize", String(listPageSize));
              if (searchQuery.trim()) params.set("q", searchQuery.trim());
              params.set("status", filterStatus);
              params.set("tier", filterTier);
              params.set("segment", filterSegment);
              const response = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/audience/${vendorId}?${params.toString()}`,
                {
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${publicAnonKey}`,
                  },
                }
              );
              const data = await response.json();
              if (!response.ok) {
                throw new Error(data.error || "Failed to prefetch customers");
              }
              const list = Array.isArray(data.customers) ? data.customers : [];
              const mapped = list.map((c: any) => ({
                id: c.id,
                name: c.name || c.phone || c.email?.split("@")[0] || "Customer",
                email: c.email,
                phone: c.phone || "",
                role: "customer" as const,
                status: (c.status as "active" | "inactive") || "active",
                location: c.location,
                avatar: c.avatar,
                joinedDate: c.joinedDate || new Date().toISOString(),
                totalOrders: c.totalOrders ?? 0,
                totalSpent: c.totalSpent ?? 0,
                segment: c.segment,
                avgOrder: c.avgOrder ?? 0,
                tags: c.tags || [],
                isNew: c.isNew,
              }));
              return {
                rows: mapped,
                total: Number(data.total ?? mapped.length),
                summary: data.summary || null,
              };
            },
            { ttl: 60_000, staleWhileRevalidate: true }
          )
          .catch(() => undefined);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error(t("vendorAdmin.users.failedLoad"));
      setUsers([]);
      setServerTotalCustomers(0);
    } finally {
      setLoading(false);
    }
  };
  const pagedUsers = useMemo(() => users, [users]);

  const pageUserIds = pagedUsers.map((u) => u.id);

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (pageUserIds.length > 0 && pageUserIds.every((id) => selectedCustomers.includes(id))) {
      setSelectedCustomers((prev) => prev.filter((id) => !pageUserIds.includes(id)));
    } else {
      setSelectedCustomers((prev) => Array.from(new Set([...prev, ...pageUserIds])));
    }
  };

  const getStatusBadge = (status: string) => {
    const normalized = String(status || "active").toLowerCase();
    switch (normalized) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t("customerIntel.active")}
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            {t("customerIntel.inactive")}
          </Badge>
        );
      case "blocked":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Ban className="w-3 h-3 mr-1" />
            {t("customerIntel.blocked")}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t("customerIntel.active")}
          </Badge>
        );
    }
  };

  const totalCustomers = summary.totalCustomers;
  const activeCustomers = summary.activeCustomers;
  const championsCount = summary.champions;
  const atRiskCount = summary.atRisk;
  const totalRevenue = summary.totalRevenue;
  const activePercentage = totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0;

  if (viewingCustomer) {
    return (
      <CustomerProfile
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">{t("vendorAdmin.users.title")}</h1>
        <p className="text-sm text-slate-600">{t("vendorAdmin.users.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-blue-600" />
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">{totalCustomers}</p>
          <p className="text-xs text-slate-600 mt-1">{t("vendorAdmin.users.totalCustomers")}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
            <span className="text-xs font-semibold text-green-600">{activePercentage}%</span>
          </div>
          <p className="text-2xl font-semibold text-slate-900">{activeCustomers}</p>
          <p className="text-xs text-slate-600 mt-1">{t("vendorAdmin.users.active")}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 text-emerald-600" />
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums flex items-baseline gap-1 flex-wrap">
            <span>{Math.round(totalRevenue).toLocaleString()}</span>
            <span className="text-[9px] font-medium text-slate-500 leading-none align-baseline">MMK</span>
          </p>
          <p className="text-xs text-slate-600 mt-1">{t("vendorAdmin.users.totalRevenue")}</p>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-4 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setCurrentTab("list")}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium transition-colors relative ${
            currentTab === "list"
              ? "text-slate-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users className="w-4 h-4" />
          {t("customerIntel.customerList")}
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab("analytics")}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium transition-colors relative ${
            currentTab === "analytics"
              ? "text-slate-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {t("customerIntel.analytics")}
        </button>
      </div>

      {currentTab === "list" && (
        <>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("vendorAdmin.users.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white border-slate-300"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] bg-white border-slate-300">
                  <SelectValue placeholder={t("vendorAdmin.users.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("vendorAdmin.users.allStatus")}</SelectItem>
                  <SelectItem value="active">{t("vendorAdmin.users.active")}</SelectItem>
                  <SelectItem value="inactive">{t("customerIntel.inactive")}</SelectItem>
                  <SelectItem value="blocked">{t("customerIntel.blocked")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-[140px] bg-white border-slate-300">
                  <SelectValue placeholder={t("customerIntel.tier")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("vendorAdmin.users.allTiers")}</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="regular">{t("customerIntel.regular")}</SelectItem>
                  <SelectItem value="new">{t("customerIntel.new")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSegment} onValueChange={setFilterSegment}>
                <SelectTrigger className="w-[160px] bg-white border-slate-300">
                  <SelectValue placeholder={t("vendorAdmin.users.segment")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("vendorAdmin.users.allSegments")}</SelectItem>
                  <SelectItem value="New">{segmentLabel("New")}</SelectItem>
                  <SelectItem value="Active">{segmentLabel("Active")}</SelectItem>
                  <SelectItem value="Champions">{segmentLabel("Champions")}</SelectItem>
                  <SelectItem value="At Risk">{segmentLabel("At Risk")}</SelectItem>
                  <SelectItem value="Other">{segmentLabel("Other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-6">
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-3 py-2">
                      <div className="w-10 h-10 rounded-full bg-slate-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 bg-slate-200 rounded" />
                        <div className="h-3 w-64 bg-slate-100 rounded" />
                      </div>
                      <div className="h-6 w-20 bg-slate-200 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ) : serverTotalCustomers === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 mb-1">{t("vendorAdmin.users.noCustomersYet")}</h3>
                <p className="text-sm text-slate-500">
                  {t("vendorAdmin.users.noCustomersHint")}
                </p>
              </div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          pageUserIds.length > 0 &&
                          pageUserIds.every((id) => selectedCustomers.includes(id))
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">{t("customerIntel.customer")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">{t("customerIntel.segment")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">{t("customerIntel.orders")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">{t("customerIntel.avgOrder")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">{t("customerIntel.status")}</TableHead>
                    <TableHead className="w-12 text-right text-xs font-semibold text-slate-600 uppercase" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedUsers.map((user) => {
                    const seg = user.segment || "Other";
                    return (
                      <TableRow key={user.id} className="hover:bg-slate-50/80">
                        <TableCell>
                          <Checkbox
                            checked={selectedCustomers.includes(user.id)}
                            onCheckedChange={() => toggleSelectCustomer(user.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {user.avatar ? (
                              <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-10 h-10 rounded-full object-cover border border-slate-100"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-semibold text-sm">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-900">{user.name}</span>
                                {user.isNew && (
                                  <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    {t("customerIntel.new")}
                                  </span>
                                )}
                              </div>
                              {(user.phone?.trim() || user.email?.trim()) && (
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {user.phone?.trim() || user.email?.trim()}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <SegmentCell segment={segmentLabel(seg)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Package className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-medium">{user.totalOrders ?? 0}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-700">
                            {Math.round(user.avgOrder ?? 0).toLocaleString()} MMK
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status || "active")}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  setViewingCustomer({
                                    id: user.id,
                                    name: user.name || user.email?.split("@")[0] || "Customer",
                                    email: user.email || "",
                                    avatar: user.avatar || "",
                                    phone: user.phone || "",
                                    location: user.location || "",
                                    joinDate: user.joinedDate || new Date().toISOString(),
                                    totalOrders: user.totalOrders || 0,
                                    totalSpent: user.totalSpent || 0,
                                    status: user.status || "active",
                                    tier: deriveTier(user),
                                    lastVisit: user.joinedDate || new Date().toISOString(),
                                    avgOrderValue: user.avgOrder || 0,
                                    tags: user.tags || [],
                                    engagementScore: 0,
                                    lifetimeValue: user.totalSpent || 0,
                                  })
                                }
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                {t("customerIntel.viewProfile")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled
                                className="opacity-50 cursor-not-allowed focus:bg-transparent"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                {t("customerIntel.sendMessage")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled
                                className="opacity-50 cursor-not-allowed focus:bg-transparent"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                {t("customerIntel.blockCustomer")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled
                                className="opacity-50 cursor-not-allowed text-red-400 focus:text-red-400 focus:bg-transparent"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("customerIntel.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
                <VendorAdminListingPagination
                  variant="cardFooter"
                  page={listPage}
                  pageSize={listPageSize}
                  totalCount={serverTotalCustomers}
                  onPageChange={setListPage}
                  onPageSizeChange={setListPageSize}
                  itemLabel={t("vendorAdmin.users.customersLower")}
                  loading={loading}
                />
              </>
            )}
          </div>
        </>
      )}

      {currentTab === "analytics" && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <TrendingUp className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-1">{t("vendorAdmin.users.customerAnalytics")}</h3>
          <p className="text-sm text-slate-500">{t("vendorAdmin.users.comingSoon")}</p>
        </div>
      )}

    </div>
  );
}
