import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
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
  XCircle,
  TrendingUp,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone: string;
  location: string;
  address?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  joinDate: string;
  totalOrders: number;
  totalSpent: number;
  status: "active" | "inactive" | "blocked";
  tier: "vip" | "regular" | "new";
  lastVisit: string;
}

export function Customers() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  
  // 🎯 Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    description: string;
    type: "success" | "error" | "warning" | "info";
    action?: () => void;
  }>({
    title: "",
    description: "",
    type: "info",
  });

  const customers: Customer[] = [
    {
      id: "cust-1",
      name: "Sarah Johnson",
      email: "sarah.johnson@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sarah",
      phone: "+1 (555) 123-4567",
      location: "New York, USA",
      joinDate: "2025-01-15",
      totalOrders: 24,
      totalSpent: 2840.5,
      status: "active",
      tier: "vip",
      lastVisit: "2026-02-05",
    },
    {
      id: "cust-2",
      name: "Mike Chen",
      email: "mike.chen@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=mike",
      phone: "+1 (555) 234-5678",
      location: "San Francisco, USA",
      joinDate: "2025-03-22",
      totalOrders: 12,
      totalSpent: 1456.0,
      status: "active",
      tier: "regular",
      lastVisit: "2026-02-04",
    },
    {
      id: "cust-3",
      name: "Emma Wilson",
      email: "emma.wilson@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=emma",
      phone: "+1 (555) 345-6789",
      location: "London, UK",
      joinDate: "2025-11-08",
      totalOrders: 38,
      totalSpent: 4522.75,
      status: "active",
      tier: "vip",
      lastVisit: "2026-02-05",
    },
    {
      id: "cust-4",
      name: "John Davis",
      email: "john.davis@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=john",
      phone: "+1 (555) 456-7890",
      location: "Toronto, Canada",
      joinDate: "2026-01-20",
      totalOrders: 3,
      totalSpent: 234.9,
      status: "active",
      tier: "new",
      lastVisit: "2026-02-03",
    },
    {
      id: "cust-5",
      name: "Lisa Anderson",
      email: "lisa.anderson@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=lisa",
      phone: "+1 (555) 567-8901",
      location: "Sydney, Australia",
      joinDate: "2025-06-12",
      totalOrders: 18,
      totalSpent: 2103.4,
      status: "inactive",
      tier: "regular",
      lastVisit: "2025-12-15",
    },
    {
      id: "cust-6",
      name: "David Kim",
      email: "david.kim@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=david",
      phone: "+1 (555) 678-9012",
      location: "Seoul, South Korea",
      joinDate: "2025-09-05",
      totalOrders: 15,
      totalSpent: 1876.25,
      status: "active",
      tier: "regular",
      lastVisit: "2026-02-01",
    },
    {
      id: "cust-7",
      name: "Maria Garcia",
      email: "maria.garcia@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=maria",
      phone: "+1 (555) 789-0123",
      location: "Barcelona, Spain",
      joinDate: "2025-04-18",
      totalOrders: 0,
      totalSpent: 0,
      status: "blocked",
      tier: "new",
      lastVisit: "2025-08-10",
    },
    {
      id: "cust-8",
      name: "James Brown",
      email: "james.brown@example.com",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=james",
      phone: "+1 (555) 890-1234",
      location: "Chicago, USA",
      joinDate: "2026-02-01",
      totalOrders: 1,
      totalSpent: 89.99,
      status: "active",
      tier: "new",
      lastVisit: "2026-02-05",
    },
  ];

  const stats = {
    total: customers.length,
    active: customers.filter((c) => c.status === "active").length,
    vip: customers.filter((c) => c.tier === "vip").length,
    newThisMonth: customers.filter(
      (c) =>
        new Date(c.joinDate).getMonth() === new Date().getMonth() &&
        new Date(c.joinDate).getFullYear() === new Date().getFullYear()
    ).length,
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "all" || customer.status === filterStatus;
    const matchesTier = filterTier === "all" || customer.tier === filterTier;
    return matchesSearch && matchesStatus && matchesTier;
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
            {t("customers.vip")}
          </Badge>
        );
      case "regular":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            {t("customers.regular")}
          </Badge>
        );
      case "new":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            {t("customers.new")}
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
            {t("customers.active")}
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            {t("customers.inactive")}
          </Badge>
        );
      case "blocked":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <Ban className="w-3 h-3 mr-1" />
            {t("customers.blocked")}
          </Badge>
        );
      default:
        return null;
    }
  };

  // 🎯 Action Handlers with Alert Modal
  const showAlert = (
    title: string,
    description: string,
    type: "success" | "error" | "warning" | "info",
    action?: () => void
  ) => {
    setAlertConfig({ title, description, type, action });
    setAlertOpen(true);
  };

  const handleViewDetails = (customer: Customer) => {
    showAlert(
      "View Customer Details",
      `Opening detailed profile for ${customer.name} (${customer.email})`,
      "info"
    );
    // TODO: Navigate to customer detail page
  };

  const handleSendEmail = (customer: Customer) => {
    showAlert(
      "Email Composer Opened",
      `Ready to send email to ${customer.name} at ${customer.email}`,
      "success"
    );
    // TODO: Open email composer
  };

  const handleBlockCustomer = (customer: Customer) => {
    showAlert(
      "Customer Blocked Successfully",
      `${customer.name} has been blocked and can no longer access your store`,
      "warning"
    );
    // TODO: Update customer status in database
  };

  const handleDeleteCustomer = (customer: Customer) => {
    showAlert(
      "Customer Deleted",
      `${customer.name} has been permanently removed from the system`,
      "error"
    );
    // TODO: Delete customer from database
  };

  const handleCreateCustomer = () => {
    showAlert(
      "Customer Created Successfully!",
      "New customer has been added to your system",
      "success"
    );
    // TODO: Open create customer modal
  };

  const handleEditCustomer = (customer: Customer) => {
    showAlert(
      "Customer Updated Successfully!",
      `All changes to ${customer.name}'s profile have been saved`,
      "success"
    );
    // TODO: Open edit customer modal
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
        return <Eye className="w-12 h-12 text-blue-600" />;
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

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {t('customers.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {t('customers.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                {t('customers.export')}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t('customers.totalCustomers')}</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">
                    {stats.total}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <UsersIcon className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t('customers.activeCustomers')}</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">
                    {stats.active}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t('customers.vipCustomers')}</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">
                    {stats.vip}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Star className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t('customers.newThisMonth')}</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">
                    {stats.newThisMonth}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search customers by name or email..."
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
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedCustomers.includes(customer.id)}
                      onCheckedChange={() => toggleSelectCustomer(customer.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={customer.avatar}
                        alt={customer.name}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <p className="font-medium text-slate-900">
                          {customer.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {customer.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span className="truncate max-w-[180px]">
                          {customer.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span>{customer.phone}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span>{customer.location}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">{customer.totalOrders}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">
                        ${customer.totalSpent.toFixed(2)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(customer.status)}</TableCell>
                  <TableCell>{getTierBadge(customer.tier)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span>
                        {new Date(customer.lastVisit).toLocaleDateString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleViewDetails(customer)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSendEmail(customer)}
                        >
                          <Mail className="w-4 h-4 mr-2" />
                          Send email
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleBlockCustomer(customer)}
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Block customer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDeleteCustomer(customer)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Alert Modal */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className={getAlertBg()}>
          <div className="flex items-center gap-4">
            {getAlertIcon()}
            <div>
              <AlertDialogTitle className="text-xl font-bold">
                {alertConfig.title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-slate-500">
                {alertConfig.description}
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel
              className="bg-slate-100 text-slate-900 border-slate-200"
            >
              Close
            </AlertDialogCancel>
            {alertConfig.action && (
              <AlertDialogAction
                className="bg-blue-500 text-white"
                onClick={alertConfig.action}
              >
                Confirm
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}