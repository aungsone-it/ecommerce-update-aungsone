import { useState, useEffect } from "react";
import { Users, Search, TrendingUp, CheckCircle2, Star, Clock, DollarSign, Activity, Package } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

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

export function VendorAdminUsers({ vendorId, vendorName }: VendorAdminUsersProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "customer" | "admin" | "staff">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterSegment, setFilterSegment] = useState("all");
  const [currentTab, setCurrentTab] = useState<"list" | "segments" | "analytics">("list");

  useEffect(() => {
    fetchUsers();
  }, [vendorId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // TODO: Implement actual API call to fetch vendor's customers
      // For now, start with empty array
      setUsers([]);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === "all" || user.role === filterRole;
    const matchesStatus = filterStatus === "all" || user.status === filterStatus;
    const matchesSegment = filterSegment === "all" || user.segment === filterSegment;
    return matchesSearch && matchesRole && matchesStatus && matchesSegment;
  });

  const totalCustomers = users.filter(u => u.role === "customer").length;
  const activeCustomers = users.filter(u => u.status === "active" && u.role === "customer").length;
  const championsCount = users.filter(u => u.segment === "Champions").length;
  const atRiskCount = users.filter(u => u.segment === "At Risk").length;
  const totalRevenue = users.reduce((sum, u) => sum + (u.totalSpent || 0), 0);
  const avgLTV = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const activePercentage = totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          Customer Intelligence
        </h1>
        <p className="text-sm text-slate-600">
          Advanced customer analytics and segmentation
        </p>
      </div>

      {/* Stats Cards */}
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

      {/* Tabs */}
      <div className="flex items-center gap-6 mb-4 border-b border-slate-200">
        <button
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
          {/* Search and Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search customers by name, email, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-700 font-medium min-w-[140px]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-3 text-slate-600 text-sm">Loading customers...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 mb-1">No customers yet</h3>
                <p className="text-sm text-slate-500">Customers will appear here once they place orders</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input type="checkbox" className="rounded border-slate-300" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Segment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Avg Order
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Tags
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <input type="checkbox" className="rounded border-slate-300" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{user.name}</span>
                              {user.isNew && (
                                <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                                  New
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-700">{user.segment || "Other"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-slate-700">
                          <Package className="w-4 h-4 text-slate-400" />
                          {user.totalOrders || 0}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-700">{user.avgOrder?.toFixed(2) || "0.00"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.tags?.map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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