import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  TrendingUp,
  CheckCircle2,
  Star,
  Clock,
  DollarSign,
  Activity,
  Package,
  MoreVertical,
  Mail,
  FileText,
  Tag,
  Ban,
  Trash2,
  Eye,
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

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "customer" | "admin" | "staff";
  status: "active" | "inactive";
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

function toKebabTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function deriveTier(user: User): "new" | "regular" | "vip" {
  if (user.isNew || (user.totalOrders ?? 0) === 0) return "new";
  if ((user.totalSpent ?? 0) >= 500_000 || (user.totalOrders ?? 0) >= 5) return "vip";
  return "regular";
}

function normalizeDisplayTags(user: User): string[] {
  const raw = user.tags?.length ? [...user.tags] : [];
  if (user.isNew && !raw.some((t) => /new/i.test(t))) {
    raw.push("new-customer");
  }
  return raw.map((t) => (t.includes("-") ? t : toKebabTag(t)));
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [filterSegment, setFilterSegment] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<"list" | "segments" | "analytics">("list");
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(ADMIN_PRODUCTS_INITIAL_PAGE_SIZE);

  useEffect(() => {
    fetchUsers();
  }, [vendorId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/audience/${vendorId}`,
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
      setUsers(
        list.map((c: any) => ({
          id: c.id,
          name: c.name || c.email?.split("@")[0] || "Customer",
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
        }))
      );
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load customers");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter((user) => {
      const displayTags = normalizeDisplayTags(user);
      const matchesSearch =
        !q ||
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        displayTags.some((t) => t.toLowerCase().includes(q));
      const matchesStatus = filterStatus === "all" || user.status === filterStatus;
      const tier = deriveTier(user);
      const matchesTier = filterTier === "all" || tier === filterTier;
      const seg = user.segment || "Other";
      const matchesSegment = filterSegment === "all" || seg === filterSegment;
      return matchesSearch && matchesStatus && matchesTier && matchesSegment;
    });
  }, [users, searchQuery, filterStatus, filterTier, filterSegment]);

  useEffect(() => {
    setListPage(1);
  }, [searchQuery, filterStatus, filterTier, filterSegment]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredUsers.length / listPageSize) || 1);
    setListPage((p) => Math.min(p, tp));
  }, [filteredUsers.length, listPageSize]);

  const pagedUsers = useMemo(() => {
    const start = (listPage - 1) * listPageSize;
    return filteredUsers.slice(start, start + listPageSize);
  }, [filteredUsers, listPage, listPageSize]);

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

  const totalCustomers = users.filter((u) => u.role === "customer").length;
  const activeCustomers = users.filter((u) => u.status === "active" && u.role === "customer").length;
  const championsCount = users.filter((u) => u.segment === "Champions").length;
  const atRiskCount = users.filter((u) => u.segment === "At Risk").length;
  const totalRevenue = users.reduce((sum, u) => sum + (u.totalSpent || 0), 0);
  const avgLTV = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const activePercentage = totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Customer Intelligence</h1>
        <p className="text-sm text-slate-600">Advanced customer analytics and segmentation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 relative overflow-hidden">
          <Users className="w-6 h-6 text-blue-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{totalCustomers}</div>
          <div className="text-xs text-slate-600 mt-0.5">Total Customers</div>
          <TrendingUp className="w-4 h-4 text-blue-600 absolute top-3 right-3" />
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            {activePercentage > 0 && (
              <span className="text-xs font-bold text-green-700 bg-green-200 px-2 py-0.5 rounded">
                {activePercentage}%
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-slate-800">{activeCustomers}</div>
          <div className="text-xs text-slate-600 mt-0.5">Active</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 relative">
          <Star className="w-6 h-6 text-purple-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{championsCount}</div>
          <div className="text-xs text-slate-600 mt-0.5">Champions</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 relative">
          <Clock className="w-6 h-6 text-orange-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{atRiskCount}</div>
          <div className="text-xs text-slate-600 mt-0.5">At Risk</div>
          <TrendingUp className="w-4 h-4 text-orange-600 absolute top-3 right-3" />
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 relative">
          <DollarSign className="w-6 h-6 text-emerald-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{totalRevenue.toLocaleString()} MMK</div>
          <div className="text-xs text-slate-600 mt-0.5">Total Revenue</div>
          <TrendingUp className="w-4 h-4 text-emerald-600 absolute top-3 right-3" />
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 relative">
          <Activity className="w-6 h-6 text-violet-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{Math.round(avgLTV).toLocaleString()} MMK</div>
          <div className="text-xs text-slate-600 mt-0.5">Avg LTV</div>
          <Activity className="w-4 h-4 text-violet-600 absolute top-3 right-3" />
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
          Customer List
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab("segments")}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium transition-colors relative ${
            currentTab === "segments"
              ? "text-slate-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Activity className="w-4 h-4" />
          Segments
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
          Analytics
        </button>
      </div>

      {currentTab === "list" && (
        <>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search customers by name, email, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white border-slate-300"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] bg-white border-slate-300">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-[140px] bg-white border-slate-300">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSegment} onValueChange={setFilterSegment}>
                <SelectTrigger className="w-[160px] bg-white border-slate-300">
                  <SelectValue placeholder="Segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Champions">Champions</SelectItem>
                  <SelectItem value="At Risk">At Risk</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-slate-600 text-sm">Loading customers...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 mb-1">No customers yet</h3>
                <p className="text-sm text-slate-500">
                  Customers appear when they sign in or register on your storefront, or when they place an order
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
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">Customer</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">Segment</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">Orders</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">Avg Order</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">Tags</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 uppercase">Status</TableHead>
                    <TableHead className="w-12 text-right text-xs font-semibold text-slate-600 uppercase" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedUsers.map((user) => {
                    const displayTags = normalizeDisplayTags(user);
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
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <SegmentCell segment={seg} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Package className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-medium">{user.totalOrders ?? 0}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-700">
                            ${(user.avgOrder ?? 0).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {displayTags.slice(0, 3).map((tag) => (
                              <Badge
                                key={`${user.id}-${tag}`}
                                variant="outline"
                                className="text-xs font-normal bg-slate-50 text-slate-700 border-slate-200"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {displayTags.length > 3 && (
                              <Badge variant="outline" className="text-xs bg-slate-50">
                                +{displayTags.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                              user.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {user.status === "active" && <CheckCircle2 className="w-3 h-3" />}
                            {user.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onClick={() =>
                                  toast.info("Profile view", {
                                    description: `${user.name} — coming soon for ${vendorName}.`,
                                  })
                                }
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  window.open(`mailto:${encodeURIComponent(user.email)}`, "_blank")
                                }
                              >
                                <Mail className="w-4 h-4 mr-2" />
                                Send Email
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toast.info("Notes", { description: "Coming soon." })}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                Add Note
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toast.info("Tags", { description: "Coming soon." })}
                              >
                                <Tag className="w-4 h-4 mr-2" />
                                Manage Tags
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  toast.warning("Block customer", { description: "Coming soon." })
                                }
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Block Customer
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() =>
                                  toast.error("Delete", {
                                    description: "Customer removal from vendor list is not available yet.",
                                  })
                                }
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
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
                  totalCount={filteredUsers.length}
                  onPageChange={setListPage}
                  onPageSizeChange={setListPageSize}
                  itemLabel="customers"
                  loading={loading}
                />
              </>
            )}
          </div>
        </>
      )}

      {currentTab === "segments" && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Customer Segments</h3>
          <p className="text-sm text-slate-500">Segment analytics coming soon</p>
        </div>
      )}

      {currentTab === "analytics" && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <TrendingUp className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Customer Analytics</h3>
          <p className="text-sm text-slate-500">Advanced analytics coming soon</p>
        </div>
      )}
    </div>
  );
}
