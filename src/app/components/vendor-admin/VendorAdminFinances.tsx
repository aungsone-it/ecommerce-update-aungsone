import { useState, useEffect } from "react";
import { 
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Download,
  CreditCard,
  Wallet
} from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

interface VendorAdminFinancesProps {
  vendorId: string;
  vendorName: string;
}

interface RevenueData {
  month: string;
  revenue: number;
  orders: number;
}

interface Transaction {
  id: string;
  date: string;
  orderNumber: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  paymentMethod: string;
}

export function VendorAdminFinances({ vendorId, vendorName }: VendorAdminFinancesProps) {
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState("6months");
  const [stats, setStats] = useState({
    totalRevenue: 0,
    thisMonthRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
  });
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    loadFinancialData();
  }, [vendorId, timeFilter]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      // Load vendor-specific orders using new endpoint
      const ordersRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/orders/${vendorId}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const ordersData = await ordersRes.json();

      const vendorOrders = ordersData.orders || [];

      // Calculate stats - 🔥 Exclude cancelled orders from revenue
      const activeOrders = vendorOrders.filter((order: any) => order.status !== "cancelled");
      
      const totalRevenue = activeOrders.reduce((sum: number, order: any) => 
        sum + (order.total || 0), 0
      );

      const currentMonth = new Date().getMonth();
      const thisMonthRevenue = activeOrders
        .filter((order: any) => new Date(order.date).getMonth() === currentMonth)
        .reduce((sum: number, order: any) => sum + (order.total || 0), 0);

      const averageOrderValue = activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0;

      setStats({
        totalRevenue,
        thisMonthRevenue,
        totalOrders: activeOrders.length, // 🔥 Count only non-cancelled orders
        averageOrderValue,
      });

      // Generate revenue data by month - 🔥 Only count non-cancelled orders
      const monthlyRevenue: Record<string, { revenue: number; orders: number }> = {};
      activeOrders.forEach((order: any) => {
        const date = new Date(order.date);
        const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        
        if (!monthlyRevenue[monthKey]) {
          monthlyRevenue[monthKey] = { revenue: 0, orders: 0 };
        }
        monthlyRevenue[monthKey].revenue += order.total || 0;
        monthlyRevenue[monthKey].orders += 1;
      });

      const revenueChartData = Object.entries(monthlyRevenue)
        .map(([month, data]) => ({
          month,
          revenue: data.revenue,
          orders: data.orders,
        }))
        .slice(-6); // Last 6 months

      setRevenueData(revenueChartData);

      // Generate transactions
      const trans = vendorOrders.slice(0, 20).map((order: any) => ({
        id: order.id,
        date: new Date(order.date).toLocaleDateString(),
        orderNumber: order.orderNumber,
        amount: order.total || 0,
        status: order.status === "completed" ? "paid" : order.status === "cancelled" ? "failed" : "pending",
        paymentMethod: order.paymentMethod || "Credit Card",
      }));

      setTransactions(trans);

    } catch (error) {
      console.error("Failed to load financial data:", error);
    } finally {
      setLoading(false);
    }
  };

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
            <Card key={i} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-12 w-12 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-40" />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-12" />
              ))}
            </div>
          </div>
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </Card>

        <Card className="p-6">
          <Skeleton className="h-6 w-40 mb-6" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </Card>

        <Card className="p-6">
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finances</h1>
          <p className="text-slate-600">Track your revenue and transactions</p>
        </div>
        <Button variant="outline" disabled className="opacity-50 cursor-not-allowed">
          <Download className="w-4 h-4 mr-2" />
          Export Report (Disabled)
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-slate-900">${stats.totalRevenue.toFixed(2)}</p>
              <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                All time
              </p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">This Month</p>
              <p className="text-3xl font-bold text-slate-900">${stats.thisMonthRevenue.toFixed(2)}</p>
              <p className="text-sm text-slate-600 mt-2 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date().toLocaleString('default', { month: 'long' })}
              </p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <Wallet className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Orders</p>
              <p className="text-3xl font-bold text-slate-900">{stats.totalOrders}</p>
              <p className="text-sm text-slate-600 mt-2">Completed orders</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Avg Order Value</p>
              <p className="text-3xl font-bold text-slate-900">${stats.averageOrderValue.toFixed(2)}</p>
              <p className="text-sm text-slate-600 mt-2">Per order</p>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <CreditCard className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card className="p-6 border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Revenue Overview</h3>
          <div className="flex gap-2">
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

        {revenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
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
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                activeDot={{ r: 6 }}
                name="Revenue ($)"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            No revenue data available
          </div>
        )}
      </Card>

      {/* Orders Chart */}
      <Card className="p-6 border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Orders by Month</h3>
        {revenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" />
              <YAxis stroke="#64748b" />
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
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            No orders data available
          </div>
        )}
      </Card>

      {/* Recent Transactions */}
      <Card className="p-6 border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Transactions</h3>
        <div className="space-y-3">
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{transaction.orderNumber}</p>
                    <p className="text-sm text-slate-600">{transaction.date} • {transaction.paymentMethod}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
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
                  <p className="font-semibold text-slate-900 min-w-[100px] text-right">
                    ${transaction.amount.toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-500">
              No transactions yet
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}