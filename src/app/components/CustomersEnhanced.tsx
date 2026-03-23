import { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Download,
  MoreVertical,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  Eye,
  Ban,
  Trash2,
  Star,
  CheckCircle,
  TrendingUp,
  Users as UsersIcon,
  Tag,
  FileText,
  Send,
  Edit,
  BarChart3,
  PieChart,
  Activity,
  Target,
  Award,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Heart,
  Package,
  CreditCard,
  UserPlus,
  X,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { CustomerProfile } from "./CustomerProfile";
import { useNavigate } from "react-router";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { ConfirmDialog } from "./ConfirmDialog";

// 🚀 MODULE-LEVEL CACHE: Persists across component unmount/remount
let cachedCustomers: any[] = [];

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone: string;
  location: string;
  joinDate: string;
  totalOrders: number;
  totalSpent: number;
  status: "active" | "inactive" | "blocked";
  tier: "vip" | "regular" | "new";
  lastVisit: string;
  lastOrderDate?: string;
  avgOrderValue: number;
  tags: string[];
  favoriteCategory?: string;
  engagementScore: number; // 0-100
  lifetimeValue: number;
  rfmScore?: {
    recency: number; // 1-5
    frequency: number; // 1-5
    monetary: number; // 1-5
  };
}

type ChatHandoffCustomer = { name: string; email: string; avatar?: string };

export function CustomersEnhanced({
  onOpenChatWithCustomer,
}: {
  onOpenChatWithCustomer?: (c: ChatHandoffCustomer) => void;
} = {}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [filterSegment, setFilterSegment] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  // 🚀 Initialize from cache if available
  const [customersList, setCustomersList] = useState<Customer[]>(() => cachedCustomers || []);
  const [isLoading, setIsLoading] = useState(!cachedCustomers.length);

  // 🎯 Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    description: string;
    type: "success" | "error" | "warning" | "info";
  }>({
    title: "",
    description: "",
    type: "info",
  });

  // 🔥 CONFIRMATION DIALOG STATE
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "block" | "delete" | "bulkDelete";
    customerId?: string;
    customerName?: string;
  }>({
    isOpen: false,
    type: "delete",
  });

  // 🔥 FETCH CUSTOMERS FROM BACKEND
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    // 🚀 SMART LOADING: Only show spinner if request takes > 300ms
    let showLoadingTimer: NodeJS.Timeout | null = null;
    
    showLoadingTimer = setTimeout(() => {
      setIsLoading(true);
    }, 300);
    
    try {
      console.log("📥 Fetching customers from backend...");
      
      // 🔥 REMOVED AUTO-SYNC - It was re-adding deleted customers!
      // Auto-sync should only be done manually via a button, not on every load
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers`,
        {
          method: "GET",
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

      console.log(`✅ Fetched ${data.customers.length} customers from backend`);
      
      // 🔥 FILTER OUT INVALID DATA - Only keep proper customer objects
      const validCustomers = (data.customers || []).filter((c: any) => {
        // Must be an object (not array, not null, not primitive)
        if (!c || typeof c !== 'object' || Array.isArray(c)) {
          // 🔇 SILENTLY SKIP corrupted entries - backend already handles cleanup
          return false;
        }
        // Must have an ID
        if (!c.id || typeof c.id !== 'string') {
          // 🔇 SILENTLY SKIP invalid entries
          return false;
        }
        return true;
      });
      
      console.log(`✅ ${validCustomers.length} valid customers after filtering`);
      
      // 🐛 DEBUG: Log ghost customers (valid customers with missing name/email)
      const ghostCustomers = validCustomers.filter((c: any) => !c.name || !c.email);
      if (ghostCustomers.length > 0) {
        console.warn(`👻 Found ${ghostCustomers.length} ghost customers with missing data:`, ghostCustomers);
      }
      
      setCustomersList(validCustomers);
      
      // 🚀 CACHE THE CUSTOMERS FOR FUTURE USE
      cachedCustomers = validCustomers;
    } catch (error: any) {
      // 🔇 Silently ignore "Failed to fetch" errors during server warmup
      const isWarmupError = error instanceof TypeError && error.message === 'Failed to fetch';
      if (!isWarmupError) {
        console.error("❌ Error fetching customers:", error);
      }
      // Set empty array on error
      setCustomersList([]);
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setIsLoading(false);
    }
  };

  // Customer Segmentation based on RFM
  const getCustomerSegment = (customer: Customer) => {
    if (!customer.rfmScore) return "unknown";
    const { recency, frequency, monetary } = customer.rfmScore;
    const score = recency + frequency + monetary;

    if (score >= 13) return "champions"; // Best customers
    if (score >= 10 && recency >= 4) return "loyal";
    if (score >= 8 && recency >= 3) return "potential-loyalist";
    if (score >= 6 && recency <= 2) return "at-risk";
    if (frequency >= 4 && recency <= 2) return "cant-lose";
    if (score <= 6) return "hibernating";
    return "need-attention";
  };

  const stats = {
    total: customersList.length,
    active: customersList.filter((c) => c.status === "active").length,
    vip: customersList.filter((c) => c.tier === "vip").length,
    newThisMonth: customersList.filter(
      (c) =>
        new Date(c.joinDate).getMonth() === new Date().getMonth() &&
        new Date(c.joinDate).getFullYear() === new Date().getFullYear()
    ).length,
    totalRevenue: customersList.reduce((sum, c) => sum + (c.totalSpent || 0), 0),
    avgLTV: customersList.length > 0 ? customersList.reduce((sum, c) => sum + (c.lifetimeValue || 0), 0) / customersList.length : 0,
    champions: customersList.filter((c) => getCustomerSegment(c) === "champions").length,
    atRisk: customersList.filter((c) => getCustomerSegment(c) === "at-risk" || getCustomerSegment(c) === "cant-lose").length,
  };

  const filteredCustomers = customersList.filter((customer) => {
    const matchesSearch =
      (customer.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (customer.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "all" || customer.status === filterStatus;
    const matchesTier = filterTier === "all" || customer.tier === filterTier;
    const matchesSegment =
      filterSegment === "all" || getCustomerSegment(customer) === filterSegment;
    return matchesSearch && matchesStatus && matchesTier && matchesSegment;
  });

  const toggleSelectCustomer = (customerId: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCustomers.length === filteredCustomers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(filteredCustomers.map((c) => c.id));
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "vip":
        return (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200">
            <Star className="w-3 h-3 mr-1" />
            VIP
          </Badge>
        );
      case "regular":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            Regular
          </Badge>
        );
      case "new":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            New
          </Badge>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            Inactive
          </Badge>
        );
      case "blocked":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Ban className="w-3 h-3 mr-1" />
            Blocked
          </Badge>
        );
      default:
        return null;
    }
  };

  const getSegmentBadge = (segment: string) => {
    switch (segment) {
      case "champions":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
            <Award className="w-3 h-3 mr-1" />
            Champions
          </Badge>
        );
      case "loyal":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            <Heart className="w-3 h-3 mr-1" />
            Loyal
          </Badge>
        );
      case "at-risk":
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
            <Clock className="w-3 h-3 mr-1" />
            At Risk
          </Badge>
        );
      case "cant-lose":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Zap className="w-3 h-3 mr-1" />
            Can't Lose
          </Badge>
        );
      case "potential-loyalist":
        return (
          <Badge className="bg-teal-100 text-teal-700 border-teal-200">
            <Target className="w-3 h-3 mr-1" />
            Potential
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            Other
          </Badge>
        );
    }
  };

  const getEngagementColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  // 🎯 Show Alert Modal Helper
  const showAlert = (
    title: string,
    description: string,
    type: "success" | "error" | "warning" | "info"
  ) => {
    setAlertConfig({ title, description, type });
    setAlertOpen(true);
  };

  // 🎨 Get icon based on alert type
  const getAlertIcon = () => {
    switch (alertConfig.type) {
      case "success":
        return <CheckCircle className="w-12 h-12 text-green-600" />;
      case "error":
        return <XCircle className="w-12 h-12 text-red-600" />;
      case "warning":
        return <AlertCircle className="w-12 h-12 text-orange-600" />;
      case "info":
        return <AlertCircle className="w-12 h-12 text-blue-600" />;
    }
  };

  // 🎨 Get background color based on alert type
  const getAlertBg = () => {
    switch (alertConfig.type) {
      case "success":
        return "bg-green-50";
      case "error":
        return "bg-red-50";
      case "warning":
        return "bg-orange-50";
      case "info":
        return "bg-blue-50";
    }
  };

  // 🔥 BLOCK CUSTOMER ACTION
  const handleBlockCustomer = async (customerId: string, customerName: string) => {
    try {
      console.log(`🚫 Blocking customer: ${customerId}`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customerId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ status: "blocked" }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to block customer");
      }

      console.log(`✅ Customer blocked: ${customerId}`);
      
      // Refresh customer list
      await fetchCustomers();
      
      showAlert(
        "Customer Blocked Successfully!",
        `${customerName} has been blocked and can no longer access your store`,
        "warning"
      );
    } catch (error: any) {
      console.error("❌ Error blocking customer:", error);
      showAlert(
        "Failed to Block Customer",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // 🔥 DELETE CUSTOMER ACTION
  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    try {
      console.log(`🗑️ Deleting customer: ${customerId}`);
      
      // 🎯 INSTANTLY UPDATE UI - Remove from local state first
      setCustomersList((prev) => prev.filter((c) => c.id !== customerId));
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/${customerId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // 🔥 If backend fails, restore the customer to the list
        await fetchCustomers();
        throw new Error(data.error || "Failed to delete customer");
      }

      console.log(`✅ Customer deleted from backend: ${customerId}`);
      
      // Convert customer name to Title Case
      const titleCaseName = (customerName || 'Customer')
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      showAlert(
        "Customer Deleted",
        `${titleCaseName} has been deleted`,
        "error"
      );
    } catch (error: any) {
      console.error("❌ Error deleting customer:", error);
      showAlert(
        "Failed to Delete Customer",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // 🔥 BULK DELETE CUSTOMERS ACTION
  const handleBulkDelete = async () => {
    if (selectedCustomers.length === 0) return;
    
    const count = selectedCustomers.length;
    
    try {
      console.log(`🗑️ Bulk deleting ${count} customers...`);
      
      // 🎯 INSTANTLY UPDATE UI - Remove from local state first
      setCustomersList((prev) => prev.filter((c) => !selectedCustomers.includes(c.id)));
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/bulk-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ customerIds: selectedCustomers }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // 🔥 If backend fails, restore the customers by refetching
        await fetchCustomers();
        throw new Error(data.error || "Failed to delete customers");
      }

      console.log(`✅ Bulk deleted ${count} customers from backend`);
      
      // Clear selection
      setSelectedCustomers([]);
      
      showAlert(
        "Bulk Delete Successful!",
        `${count} customer(s) have been permanently removed from the system`,
        "success"
      );
    } catch (error: any) {
      console.error("❌ Error bulk deleting customers:", error);
      showAlert(
        "Failed to Delete Customers",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // 🐛 CLEAN UP GHOST CUSTOMERS (customers with missing name/email)
  const handleCleanupGhostCustomers = async () => {
    try {
      // Find all ghost customers (missing name or email)
      const ghostCustomers = customersList.filter((c) => !c.name || !c.email);
      
      if (ghostCustomers.length === 0) {
        showAlert(
          "No Ghost Customers Found",
          "All customers have valid data",
          "info"
        );
        return;
      }
      
      const count = ghostCustomers.length;
      const ghostIds = ghostCustomers.map((c) => c.id);
      
      console.log(`👻 Cleaning up ${count} ghost customers...`, ghostIds);
      
      // 🎯 INSTANTLY UPDATE UI - Remove from local state first
      setCustomersList((prev) => prev.filter((c) => !ghostIds.includes(c.id)));
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/bulk-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ customerIds: ghostIds }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // 🔥 If backend fails, restore the customers by refetching
        await fetchCustomers();
        throw new Error(data.error || "Failed to delete ghost customers");
      }

      console.log(`✅ Cleaned up ${count} ghost customers`);
      
      showAlert(
        "Ghost Customers Cleaned Up!",
        `${count} invalid customer record(s) have been permanently removed`,
        "success"
      );
    } catch (error: any) {
      console.error("❌ Error cleaning up ghost customers:", error);
      showAlert(
        "Failed to Clean Up Ghost Customers",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // 🔥 DEDUPLICATE CUSTOMERS - Merge duplicate email accounts
  const handleDeduplicateCustomers = async () => {
    try {
      console.log("🧹 Starting deduplication...");
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/deduplicate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to deduplicate customers");
      }

      console.log(`✅ Deduplication complete:`, data);
      
      // Refresh customer list
      await fetchCustomers();
      
      if (data.duplicatesRemoved > 0) {
        showAlert(
          "Duplicates Merged!",
          `${data.duplicatesRemoved} duplicate customer record(s) have been merged. Each email now has only one account.`,
          "success"
        );
      } else {
        showAlert(
          "No Duplicates Found",
          "All customer emails are unique - no duplicates to merge!",
          "info"
        );
      }
    } catch (error: any) {
      console.error("❌ Error deduplicating customers:", error);
      showAlert(
        "Failed to Deduplicate Customers",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // 🔥 CLEANUP CORRUPTED DATA - Remove string values from customer: keys
  const handleCleanupCorruptedData = async () => {
    try {
      console.log("🧹 Starting corrupted data cleanup...");
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/cleanup-corrupted`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cleanup corrupted data");
      }

      console.log(`✅ Cleanup complete:`, data);
      
      // Refresh customer list
      await fetchCustomers();
      
      if (data.cleanedCount > 0) {
        showAlert(
          "Corrupted Data Cleaned!",
          `${data.cleanedCount} corrupted database entries have been removed. Your customer data is now clean.`,
          "success"
        );
      } else {
        showAlert(
          "No Corrupted Data Found",
          "All customer database entries are valid - nothing to clean!",
          "info"
        );
      }
    } catch (error: any) {
      console.error("❌ Error cleaning corrupted data:", error);
      showAlert(
        "Failed to Clean Corrupted Data",
        error.message || "An unexpected error occurred",
        "error"
      );
    }
  };

  // Show customer profile if viewing
  if (viewingCustomer) {
    return (
      <CustomerProfile
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        onMessageCustomer={
          onOpenChatWithCustomer
            ? () => {
                const email = (viewingCustomer.email || "").trim();
                if (!email) return;
                onOpenChatWithCustomer({
                  name: viewingCustomer.name || "Customer",
                  email,
                  avatar: viewingCustomer.avatar || undefined,
                });
                setViewingCustomer(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Customer Intelligence
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Advanced customer analytics and segmentation
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selectedCustomers.length > 0 && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1">
                  {selectedCustomers.length} selected
                </Badge>
              )}
              <Button 
                onClick={() => navigate("/admin/customers/add")}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add New Customer
              </Button>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
              {/* 🐛 Clean up ghost customers button */}
              {customersList.some((c) => !c.name || !c.email) && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    if (confirm("This will permanently delete all customers with missing name or email data. Continue?")) {
                      handleCleanupGhostCustomers();
                    }
                  }}
                  className="gap-2 border-red-300 text-red-600 hover:bg-red-50"
                >
                  <AlertCircle className="w-4 h-4" />
                  Clean Ghost Data
                </Button>
              )}
              {/* 🔥 Deduplicate customers button */}
              <Button 
                variant="outline"
                onClick={() => {
                  if (confirm("This will merge all duplicate customer accounts with the same email. The most complete record will be kept. Continue?")) {
                    handleDeduplicateCustomers();
                  }
                }}
                className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50"
              >
                <AlertCircle className="w-4 h-4" />
                Merge Duplicates
              </Button>
              {/* 🔥 Cleanup corrupted data button */}
              <Button 
                variant="outline"
                onClick={() => {
                  if (confirm("This will remove all corrupted database entries (e.g. product IDs stored in customer keys). This is safe and only removes invalid data. Continue?")) {
                    handleCleanupCorruptedData();
                  }
                }}
                className="gap-2 border-purple-300 text-purple-600 hover:bg-purple-50"
              >
                <XCircle className="w-4 h-4" />
                Fix Database
              </Button>
              {selectedCustomers.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                      <Zap className="w-4 h-4" />
                      Bulk Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email Campaign
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Tag className="w-4 h-4 mr-2" />
                      Add Tags
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Edit className="w-4 h-4 mr-2" />
                      Update Status
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Download className="w-4 h-4 mr-2" />
                      Export Selected
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-red-600" 
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          type: "bulkDelete",
                        });
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Enhanced Stats Grid */}
          <div className="grid grid-cols-6 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <UsersIcon className="w-8 h-8 text-blue-600" />
                <ArrowUpRight className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {stats.total}
              </p>
              <p className="text-xs text-slate-600 mt-1">Total Customers</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <span className="text-xs font-semibold text-green-600">
                  {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {stats.active}
              </p>
              <p className="text-xs text-slate-600 mt-1">Active</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <Star className="w-8 h-8 text-purple-600" />
                <Award className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {stats.champions}
              </p>
              <p className="text-xs text-slate-600 mt-1">Champions</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 text-orange-600" />
                <ArrowDownRight className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {stats.atRisk}
              </p>
              <p className="text-xs text-slate-600 mt-1">At Risk</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-emerald-600" />
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {Math.round(stats.totalRevenue)} MMK
              </p>
              <p className="text-xs text-slate-600 mt-1">Total Revenue</p>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-8 h-8 text-indigo-600" />
                <BarChart3 className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {Math.round(stats.avgLTV)} MMK
              </p>
              <p className="text-xs text-slate-600 mt-1">Avg LTV</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-6">
          <TabsList className="bg-transparent">
            <TabsTrigger value="list" className="data-[state=active]:bg-slate-100">
              <UsersIcon className="w-4 h-4 mr-2" />
              Customer List
            </TabsTrigger>
            <TabsTrigger value="segments" className="data-[state=active]:bg-slate-100">
              <PieChart className="w-4 h-4 mr-2" />
              Segments
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-slate-100">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list" className="flex-1 flex flex-col overflow-hidden m-0">
          {/* Filters & Search */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search customers by name, email, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-50"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-40">
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
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  <SelectItem value="champions">Champions</SelectItem>
                  <SelectItem value="loyal">Loyal</SelectItem>
                  <SelectItem value="potential-loyalist">Potential Loyalist</SelectItem>
                  <SelectItem value="at-risk">At Risk</SelectItem>
                  <SelectItem value="cant-lose">Can't Lose</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="bg-white rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          selectedCustomers.length === filteredCustomers.length &&
                          filteredCustomers.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Segment</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Avg Order</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    // Loading skeleton rows
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`} className="animate-pulse">
                        <TableCell>
                          <div className="w-4 h-4 bg-slate-200 rounded"></div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                            <div className="space-y-2">
                              <div className="h-4 bg-slate-200 rounded w-32"></div>
                              <div className="h-3 bg-slate-200 rounded w-24"></div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="h-4 bg-slate-200 rounded w-40"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-6 bg-slate-200 rounded-full w-16"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                        </TableCell>
                        <TableCell>
                          <div className="h-8 w-8 bg-slate-200 rounded"></div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <UsersIcon className="w-12 h-12 text-slate-300" />
                          <div>
                            <p className="text-sm font-medium text-slate-700">No customers found</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {searchQuery || filterStatus !== "all" || filterTier !== "all" || filterSegment !== "all"
                                ? "Try adjusting your filters"
                                : "Add your first customer to get started"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCustomers.includes(customer.id)}
                          onCheckedChange={() => toggleSelectCustomer(customer.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {customer.avatar && customer.avatar.trim() !== "" ? (
                            <img
                              src={customer.avatar}
                              alt={customer.name}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {(!customer.avatar || customer.avatar.trim() === "") && (
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-semibold text-blue-600">
                                {customer.name?.substring(0, 2).toUpperCase() || "??"}
                              </span>
                            </div>
                          )}
                          {/* Hidden fallback for broken images */}
                          <div 
                            style={{ display: 'none' }}
                            className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center"
                          >
                            <span className="text-sm font-semibold text-blue-600">
                              {customer.name?.substring(0, 2).toUpperCase() || "??"}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900">
                                {customer.name || "(No Name)"}
                              </p>
                              {getTierBadge(customer.tier)}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {customer.email || "(No Email)"}
                            </p>
                            {/* Debug button for ghost customers */}
                            {(!customer.name || !customer.email) && (
                              <button
                                onClick={() => {
                                  console.log("👻 Ghost Customer Data:", customer);
                                  alert(`Ghost Customer ID: ${customer.id}\n\nThis customer has missing data. Click OK to see details in console.`);
                                }}
                                className="text-xs text-red-500 hover:underline mt-1"
                              >
                                🐛 Debug Ghost Data
                              </button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getSegmentBadge(getCustomerSegment(customer))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">
                            {customer.totalOrders}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          ${(customer.avgOrderValue || 0).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap max-w-[150px]">
                          {(customer.tags || []).slice(0, 2).map((tag) => (
                            <Badge
                              key={`${customer.id}-${tag}`}
                              variant="outline"
                              className="text-xs bg-slate-50"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {(customer.tags || []).length > 2 && (
                            <Badge variant="outline" className="text-xs bg-slate-50">
                              +{(customer.tags || []).length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(customer.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setViewingCustomer(customer)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="w-4 h-4 mr-2" />
                              Send Email
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <FileText className="w-4 h-4 mr-2" />
                              Add Note
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Tag className="w-4 h-4 mr-2" />
                              Manage Tags
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleBlockCustomer(customer.id, customer.name)}>
                              <Ban className="w-4 h-4 mr-2" />
                              Block Customer
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600" 
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  type: "delete",
                                  customerId: customer.id,
                                  customerName: customer.name,
                                });
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="segments" className="flex-1 overflow-auto p-6 m-0">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Customer Segmentation (RFM Analysis)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Champions */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Award className="w-6 h-6 text-yellow-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Champions</h4>
                    <p className="text-xs text-slate-500">Best customers</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Count</span>
                    <span className="font-semibold text-slate-900">
                      {customersList.filter((c) => getCustomerSegment(c) === "champions").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Revenue</span>
                    <span className="font-semibold text-green-700">
                      $
                      {customersList
                        .filter((c) => getCustomerSegment(c) === "champions")
                        .reduce((sum, c) => sum + (c.totalSpent || 0), 0)
                        .toFixed(0)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    High recency, frequency, and monetary value. Reward them!
                  </p>
                </div>
              </div>

              {/* Loyal Customers */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Heart className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Loyal</h4>
                    <p className="text-xs text-slate-500">Repeat buyers</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Count</span>
                    <span className="font-semibold text-slate-900">
                      {customersList.filter((c) => getCustomerSegment(c) === "loyal").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Revenue</span>
                    <span className="font-semibold text-green-700">
                      $
                      {customersList
                        .filter((c) => getCustomerSegment(c) === "loyal")
                        .reduce((sum, c) => sum + (c.totalSpent || 0), 0)
                        .toFixed(0)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Regular buyers with good engagement. Upsell opportunities.
                  </p>
                </div>
              </div>

              {/* At Risk */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">At Risk</h4>
                    <p className="text-xs text-slate-500">Need attention</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Count</span>
                    <span className="font-semibold text-slate-900">
                      {customersList.filter((c) => getCustomerSegment(c) === "at-risk").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Value</span>
                    <span className="font-semibold text-orange-700">
                      $
                      {customersList
                        .filter((c) => getCustomerSegment(c) === "at-risk")
                        .reduce((sum, c) => sum + (c.lifetimeValue || 0), 0)
                        .toFixed(0)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Haven't purchased recently. Send win-back campaigns.
                  </p>
                </div>
              </div>

              {/* Potential Loyalists */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                    <Target className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Potential Loyalists</h4>
                    <p className="text-xs text-slate-500">Growing customers</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Count</span>
                    <span className="font-semibold text-slate-900">
                      {customersList.filter((c) => getCustomerSegment(c) === "potential-loyalist").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Potential</span>
                    <span className="font-semibold text-teal-700">High</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Recent buyers with potential. Nurture them with offers.
                  </p>
                </div>
              </div>

              {/* Can't Lose */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Can't Lose</h4>
                    <p className="text-xs text-slate-500">Critical</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Count</span>
                    <span className="font-semibold text-slate-900">
                      {customersList.filter((c) => getCustomerSegment(c) === "cant-lose").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Priority</span>
                    <span className="font-semibold text-red-700">Urgent</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    High-value customers going dormant. Act immediately!
                  </p>
                </div>
              </div>

              {/* Hibernating */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-slate-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Hibernating</h4>
                    <p className="text-xs text-slate-500">Dormant</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Count</span>
                    <span className="font-semibold text-slate-900">
                      {customersList.filter((c) => getCustomerSegment(c) === "hibernating").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Action</span>
                    <span className="font-semibold text-slate-700">Re-engage</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Long inactive. Try reactivation campaigns or special offers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 overflow-auto p-6 m-0">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">
              Customer Analytics Overview
            </h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Top Customers */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-600" />
                  Top 5 Customers by LTV
                </h4>
                <div className="space-y-3">
                  {customersList
                    .sort((a, b) => (b.lifetimeValue || 0) - (a.lifetimeValue || 0))
                    .slice(0, 5)
                    .map((customer, idx) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600">
                              {idx + 1}
                            </span>
                          </div>
                          {customer.avatar && customer.avatar.trim() !== "" ? (
                            <img
                              src={customer.avatar}
                              alt={customer.name}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {(!customer.avatar || customer.avatar.trim() === "") && (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-xs font-semibold text-blue-600">
                                {customer.name?.substring(0, 2).toUpperCase() || "??"}
                              </span>
                            </div>
                          )}
                          {/* Hidden fallback for broken images */}
                          <div 
                            style={{ display: 'none' }}
                            className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"
                          >
                            <span className="text-xs font-semibold text-blue-600">
                              {customer.name?.substring(0, 2).toUpperCase() || "??"}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {customer.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {customer.totalOrders} orders
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-700">
                            ${(customer.lifetimeValue || 0).toFixed(0)}
                          </p>
                          <p className="text-xs text-slate-500">LTV</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Engagement Distribution */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Engagement Score Distribution
                </h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">High (80-100)</span>
                      <span className="text-sm font-semibold text-green-600">
                        {customersList.filter((c) => (c.engagementScore || 0) >= 80).length} customers
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter((c) => (c.engagementScore || 0) >= 80).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">Medium (60-79)</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {
                          customersList.filter(
                            (c) => (c.engagementScore || 0) >= 60 && (c.engagementScore || 0) < 80
                          ).length
                        }{" "}
                        customers
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-blue-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter(
                              (c) => (c.engagementScore || 0) >= 60 && (c.engagementScore || 0) < 80
                            ).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">Low (40-59)</span>
                      <span className="text-sm font-semibold text-yellow-600">
                        {
                          customersList.filter(
                            (c) => (c.engagementScore || 0) >= 40 && (c.engagementScore || 0) < 60
                          ).length
                        }{" "}
                        customers
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-yellow-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter(
                              (c) => (c.engagementScore || 0) >= 40 && (c.engagementScore || 0) < 60
                            ).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">Critical (&lt;40)</span>
                      <span className="text-sm font-semibold text-red-600">
                        {customersList.filter((c) => (c.engagementScore || 0) < 40).length} customers
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-red-500 h-3 rounded-full"
                        style={{
                          width: `${
                            (customersList.filter((c) => (c.engagementScore || 0) < 40).length /
                              customersList.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue by Tier */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Revenue by Customer Tier
                </h4>
                <div className="space-y-4">
                  {["vip", "regular", "new"].map((tier) => {
                    const tierCustomers = customersList.filter((c) => c.tier === tier);
                    const tierRevenue = tierCustomers.reduce(
                      (sum, c) => sum + (c.totalSpent || 0),
                      0
                    );
                    return (
                      <div key={tier} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getTierBadge(tier)}
                            <span className="text-sm text-slate-600">
                              ({tierCustomers.length} customers)
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-emerald-700">
                            ${(tierRevenue || 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{
                              width: `${(tierRevenue / stats.totalRevenue) * 100}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Purchase Frequency */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Purchase Frequency Analysis
                </h4>
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-purple-900">
                        High Frequency (15+ orders)
                      </span>
                      <span className="text-sm font-semibold text-purple-600">
                        {customersList.filter((c) => (c.totalOrders || 0) >= 15).length}
                      </span>
                    </div>
                    <p className="text-xs text-purple-700">
                      Your most loyal repeat customers
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-blue-900">
                        Medium Frequency (5-14 orders)
                      </span>
                      <span className="text-sm font-semibold text-blue-600">
                        {
                          customersList.filter(
                            (c) => (c.totalOrders || 0) >= 5 && (c.totalOrders || 0) < 15
                          ).length
                        }
                      </span>
                    </div>
                    <p className="text-xs text-blue-700">Regular buyers</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900">
                        Low Frequency (&lt;5 orders)
                      </span>
                      <span className="text-sm font-semibold text-slate-600">
                        {customersList.filter((c) => (c.totalOrders || 0) < 5).length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">
                      Opportunity to increase engagement
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 🎯 Alert Modal - COMPACT BOXY DESIGN ~300x300px */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="max-w-[300px] w-[300px] h-[300px] bg-gradient-to-br from-slate-50 via-white to-slate-50 border-none shadow-2xl rounded-2xl">
          {/* X Button - Top Right Corner - RED */}
          <button
            onClick={() => setAlertOpen(false)}
            className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center transition-all hover:scale-110"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>

          {/* Content - Perfectly Centered in Square */}
          <div className="flex flex-col items-center justify-center text-center h-full px-6">
            {/* Icon with circular background - NO ANIMATION */}
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 shadow-lg ${
              alertConfig.type === "success" ? "bg-gradient-to-br from-green-100 to-green-50" :
              alertConfig.type === "error" ? "bg-gradient-to-br from-red-100 to-red-50" :
              alertConfig.type === "warning" ? "bg-gradient-to-br from-orange-100 to-orange-50" :
              "bg-gradient-to-br from-blue-100 to-blue-50"
            }`}>
              {/* HAND-DRAWN ANIMATED ICONS */}
              {alertConfig.type === "success" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-green-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M8 12.5l2.5 2.5L16 9" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="text-green-600"
                    style={{
                      strokeDasharray: 12,
                      strokeDashoffset: 12,
                      animation: 'drawCheck 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
              {alertConfig.type === "error" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-red-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M15 9l-6 6M9 9l6 6" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                    className="text-red-600"
                    style={{
                      strokeDasharray: 17,
                      strokeDashoffset: 17,
                      animation: 'drawX 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
              {alertConfig.type === "warning" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-orange-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M12 8v4M12 16h.01" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                    className="text-orange-600"
                    style={{
                      strokeDasharray: 8,
                      strokeDashoffset: 8,
                      animation: 'drawAlert 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
              {alertConfig.type === "info" && (
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
                  <circle 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="text-blue-600"
                    style={{
                      strokeDasharray: 63,
                      strokeDashoffset: 63,
                      animation: 'drawCircle 0.6s ease-out forwards'
                    }}
                  />
                  <path 
                    d="M12 16v-4M12 8h.01" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                    className="text-blue-600"
                    style={{
                      strokeDasharray: 8,
                      strokeDashoffset: 8,
                      animation: 'drawAlert 0.4s ease-out 0.6s forwards'
                    }}
                  />
                </svg>
              )}
            </div>

            {/* Title & Description - COMPACT */}
            <AlertDialogTitle className="text-lg font-bold text-slate-900 mb-1 leading-tight">
              {alertConfig.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 leading-snug">
              {alertConfig.description}
            </AlertDialogDescription>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🎯 SVG DRAWING ANIMATIONS */}
      <style>{`
        @keyframes drawCircle {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawCheck {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawX {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        @keyframes drawAlert {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 🔥 CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={() => {
          if (confirmDialog.type === "delete" && confirmDialog.customerId && confirmDialog.customerName) {
            handleDeleteCustomer(confirmDialog.customerId, confirmDialog.customerName);
          } else if (confirmDialog.type === "bulkDelete") {
            handleBulkDelete();
          }
        }}
        title={
          confirmDialog.type === "delete"
            ? "Delete Customer?"
            : "Delete Multiple Customers?"
        }
        message={
          confirmDialog.type === "delete"
            ? `Are you sure you want to permanently delete ${confirmDialog.customerName}? This action cannot be undone.`
            : `Are you sure you want to permanently delete ${selectedCustomers.length} customers? This action cannot be undone.`
        }
        type="error"
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
}