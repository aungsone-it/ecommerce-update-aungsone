import { useState, useEffect } from "react";
import { Bell, Tag, Percent, Gift, TrendingUp, Search, Filter, Download, Eye, Edit, Trash2, Copy, Calendar, Users, Target, BarChart3, Clock, CheckCircle, XCircle, Send, Megaphone, Sparkles, AlertCircle, Info, ShoppingCart, Truck, Star, Heart, Zap, Award, Palette, Save, Package, MoreVertical } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type CampaignStatus = "active" | "scheduled" | "expired" | "draft";
type CampaignType = "push-notification" | "coupon" | "seasonal" | "discount-code";
type CreatorType = "admin" | "vendor" | "collaborator";

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  creator: string;
  creatorType: CreatorType;
  creatorAvatar: string;
  startDate: string;
  endDate: string;
  createdDate: string;
  code?: string;
  discount?: number;
  discountType?: "percentage" | "fixed";
  title?: string;
  message?: string;
  targetAudience?: string;
  usageCount?: number;
  usageLimit?: number;
  revenue?: number;
  clicks?: number;
  conversions?: number;
  minQuantity?: number;
  minAmount?: number;
  productScope?: "all" | "specific";
  specificProducts?: string[];
  vendorId?: string;
}

interface VendorAdminMarketingProps {
  vendorId: string;
  vendorName: string;
  vendorAvatar?: string;
}

const performanceData = [
  { date: "Jan 28", clicks: 1200, conversions: 340, revenue: 4500 },
  { date: "Jan 29", clicks: 1450, conversions: 420, revenue: 5600 },
  { date: "Jan 30", clicks: 1100, conversions: 280, revenue: 3800 },
  { date: "Jan 31", clicks: 1650, conversions: 510, revenue: 6700 },
  { date: "Feb 01", clicks: 1850, conversions: 590, revenue: 7800 },
  { date: "Feb 02", clicks: 1300, conversions: 390, revenue: 5200 },
  { date: "Feb 03", clicks: 1950, conversions: 640, revenue: 8400 },
  { date: "Feb 04", clicks: 2100, conversions: 720, revenue: 9500 },
  { date: "Feb 05", clicks: 2350, conversions: 810, revenue: 10600 },
];

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const getStatusBadge = (status: CampaignStatus) => {
  const variants = {
    active: { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, label: "Active" },
    scheduled: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock, label: "Scheduled" },
    expired: { color: "bg-slate-100 text-slate-700 border-slate-200", icon: XCircle, label: "Expired" },
    draft: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Edit, label: "Draft" },
  };
  
  const variant = variants[status];
  const Icon = variant.icon;
  
  return (
    <Badge variant="secondary" className={`${variant.color} hover:${variant.color} border font-medium text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {variant.label}
    </Badge>
  );
};

const getTypeIcon = (type: CampaignType) => {
  const icons = {
    "push-notification": Bell,
    "coupon": Tag,
    "seasonal": Gift,
    "discount-code": Percent,
  };
  return icons[type];
};

const getTypeLabel = (type: CampaignType) => {
  const labels = {
    "push-notification": "Push Notification",
    "coupon": "Coupon",
    "seasonal": "Seasonal",
    "discount-code": "Discount Code",
  };
  return labels[type];
};

export function VendorAdminMarketing({ vendorId, vendorName, vendorAvatar }: VendorAdminMarketingProps) {
  const [currentView, setCurrentView] = useState<"list" | "add" | "edit">("list");
  const [selectedTab, setSelectedTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateRangeStart, setDateRangeStart] = useState<string>("");
  const [dateRangeEnd, setDateRangeEnd] = useState<string>("");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  // Backend integration
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    type: "coupon" as CampaignType,
    status: "active" as CampaignStatus,
    startDate: "",
    endDate: "",
    code: "",
    discount: 10,
    discountType: "percentage" as "percentage" | "fixed",
    title: "",
    message: "",
    targetAudience: "All Customers",
    usageLimit: 1000,
    minQuantity: 1,
    minAmount: 0,
    productScope: "all" as "all" | "specific",
    specificProducts: [] as string[],
  });

  // Announcement Bar State (Vendor-specific)
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [announcementText, setAnnouncementText] = useState("Free shipping on orders over $50! 🚚");
  const [announcementBgColor, setAnnouncementBgColor] = useState("#1e293b");
  const [announcementTextColor, setAnnouncementTextColor] = useState("#ffffff");
  const [announcementIcon, setAnnouncementIcon] = useState("megaphone");
  const [announcementLink, setAnnouncementLink] = useState("");

  // Fetch campaigns from backend (vendor-specific only)
  useEffect(() => {
    fetchCampaigns();
    fetchAnnouncementSettings();
  }, [vendorId]);

  // Populate form when editing a campaign
  useEffect(() => {
    if (currentView === "edit" && selectedCampaign) {
      setNewCampaign({
        name: selectedCampaign.name || "",
        type: selectedCampaign.type || "coupon",
        status: selectedCampaign.status || "active",
        startDate: selectedCampaign.startDate || "",
        endDate: selectedCampaign.endDate || "",
        code: selectedCampaign.code || "",
        discount: selectedCampaign.discount || 10,
        discountType: selectedCampaign.discountType || "percentage",
        title: selectedCampaign.title || "",
        message: selectedCampaign.message || "",
        targetAudience: selectedCampaign.targetAudience || "All Customers",
        usageLimit: selectedCampaign.usageLimit || 1000,
        minQuantity: selectedCampaign.minQuantity || 1,
        minAmount: selectedCampaign.minAmount || 0,
        productScope: selectedCampaign.productScope || "all",
        specificProducts: selectedCampaign.specificProducts || [],
      });
    } else if (currentView === "add") {
      // Reset form for new campaign
      setNewCampaign({
        name: "",
        type: "coupon" as CampaignType,
        status: "active" as CampaignStatus,
        startDate: "",
        endDate: "",
        code: "",
        discount: 10,
        discountType: "percentage" as "percentage" | "fixed",
        title: "",
        message: "",
        targetAudience: "All Customers",
        usageLimit: 1000,
        minQuantity: 1,
        minAmount: 0,
        productScope: "all" as "all" | "specific",
        specificProducts: [] as string[],
      });
    }
  }, [currentView, selectedCampaign]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("📣 [VENDOR] Fetching campaigns for vendor:", vendorId);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns?vendorId=${vendorId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      console.log("📥 [VENDOR] Response status:", response.status);
      const data = await response.json();
      console.log("📥 [VENDOR] Response data:", data);

      if (data.campaigns) {
        // Filter to only show this vendor's campaigns
        const vendorCampaigns = data.campaigns.filter((c: Campaign) => c.vendorId === vendorId);
        setCampaigns(vendorCampaigns);
      }
    } catch (error) {
      // 🔇 Silently ignore "Failed to fetch" errors during server warmup
      const isWarmupError = error instanceof TypeError && error.message === 'Failed to fetch';
      if (!isWarmupError) {
        console.error("❌ [VENDOR] Error fetching campaigns:", error);
      }
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncementSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/announcement-vendor?vendorId=${vendorId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (data) {
        setAnnouncementEnabled(data.enabled || false);
        setAnnouncementText(data.text || "");
        setAnnouncementBgColor(data.bgColor || "#1e293b");
        setAnnouncementTextColor(data.textColor || "#ffffff");
        setAnnouncementIcon(data.icon || "megaphone");
        setAnnouncementLink(data.link || "");
      }
    } catch (error) {
      // 🔇 Silently ignore "Failed to fetch" errors during server warmup
      const isWarmupError = error instanceof TypeError && error.message === 'Failed to fetch';
      if (!isWarmupError) {
        console.error("❌ [VENDOR] Error fetching announcement settings:", error);
      }
    }
  };

  const handleCreateCampaign = async () => {
    try {
      // Validate required fields
      if (!newCampaign.name.trim()) {
        alert("❌ Campaign name is required!");
        return;
      }

      if (!newCampaign.startDate) {
        alert("❌ Start date is required!");
        return;
      }

      if (!newCampaign.endDate) {
        alert("❌ End date is required!");
        return;
      }

      // Validate dates
      const start = new Date(newCampaign.startDate);
      const end = new Date(newCampaign.endDate);
      if (end < start) {
        alert("❌ End date must be after start date!");
        return;
      }

      // Validate coupon-specific fields
      if (newCampaign.type === "coupon" || newCampaign.type === "discount-code" || newCampaign.type === "seasonal") {
        if (!newCampaign.code.trim()) {
          alert("❌ Coupon code is required!");
          return;
        }
        if (!newCampaign.discount || newCampaign.discount <= 0) {
          alert("❌ Discount amount must be greater than 0!");
          return;
        }
      }

      // Validate push notification fields
      if (newCampaign.type === "push-notification") {
        if (!newCampaign.title.trim()) {
          alert("❌ Notification title is required!");
          return;
        }
        if (!newCampaign.message.trim()) {
          alert("❌ Notification message is required!");
          return;
        }
      }

      const isEditing = currentView === "edit" && selectedCampaign;
      console.log(isEditing ? "📤 [VENDOR] Updating campaign:" : "📤 [VENDOR] Creating campaign:", newCampaign);

      const url = isEditing 
        ? `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/${selectedCampaign.id}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          ...newCampaign,
          creator: vendorName,
          creatorType: "vendor",
          creatorAvatar: vendorAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${vendorName}`,
          vendorId: vendorId, // ✅ Add vendor ID to campaign
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log(isEditing ? "✅ [VENDOR] Campaign updated:" : "✅ [VENDOR] Campaign created:", data.campaign);
        alert(isEditing ? "✅ Campaign updated successfully!" : "✅ Campaign created successfully!");
        await fetchCampaigns(); // Refresh list
        setCurrentView("list"); // Go back to list view
        setSelectedCampaign(null); // Clear selected campaign
        // Reset form
        setNewCampaign({
          name: "",
          type: "coupon" as CampaignType,
          status: "active" as CampaignStatus,
          startDate: "",
          endDate: "",
          code: "",
          discount: 10,
          discountType: "percentage" as "percentage" | "fixed",
          title: "",
          message: "",
          targetAudience: "All Customers",
          usageLimit: 1000,
          minQuantity: 1,
          minAmount: 0,
          productScope: "all" as "all" | "specific",
          specificProducts: [] as string[],
        });
      } else {
        console.error("❌ [VENDOR] Server error:", data);
        alert(`❌ Failed to ${isEditing ? "update" : "create"} campaign: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("❌ [VENDOR] Error creating/updating campaign:", error);
      alert(`❌ Failed to ${currentView === "edit" ? "update" : "create"} campaign: ${error.message || "Network error"}`);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    try {
      console.log(`🗑️ [VENDOR] Attempting to delete campaign: ${id}`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/${id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      console.log(`📡 [VENDOR] Delete response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [VENDOR] Delete failed with status ${response.status}:`, errorText);
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("📦 [VENDOR] Delete response data:", data);

      if (data.success) {
        console.log("✅ [VENDOR] Campaign deleted successfully");
        alert("✅ Campaign deleted successfully!");
        await fetchCampaigns(); // Refresh list
      } else {
        throw new Error(data.error || "Failed to delete campaign");
      }
    } catch (error) {
      console.error("❌ [VENDOR] Error deleting campaign:", error);
      alert(`Failed to delete campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleClearAllCampaigns = async () => {
    if (!confirm('⚠️ Are you sure you want to delete ALL your campaigns? This cannot be undone!')) {
      return;
    }
    
    try {
      console.log('🗑️ [VENDOR] Clearing all campaigns...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns-clear-all?vendorId=${vendorId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ [VENDOR] ${data.deleted} campaigns deleted`);
        alert(`✅ Success! ${data.deleted} campaigns deleted.`);
        await fetchCampaigns(); // Refresh list
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ [VENDOR] Error clearing campaigns:', error);
      alert('Failed to clear campaigns');
    }
  };

  const handleSaveAnnouncementSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/announcement-vendor`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            vendorId: vendorId, // ✅ Add vendor ID
            enabled: announcementEnabled,
            text: announcementText,
            bgColor: announcementBgColor,
            textColor: announcementTextColor,
            icon: announcementIcon,
            link: announcementLink,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        console.log("✅ [VENDOR] Announcement settings saved");
        alert("✅ Announcement settings saved successfully!");
      }
    } catch (error) {
      console.error("❌ [VENDOR] Error saving announcement settings:", error);
      alert("Failed to save announcement settings");
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = 
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.code?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    const matchesType = typeFilter === "all" || campaign.type === typeFilter;
    
    // Date range filtering by created date
    let matchesDateRange = true;
    if (dateRangeStart && dateRangeEnd) {
      const campaignCreated = new Date(campaign.createdDate);
      const filterStart = new Date(dateRangeStart);
      const filterEnd = new Date(dateRangeEnd);
      matchesDateRange = campaignCreated >= filterStart && campaignCreated <= filterEnd;
    } else if (dateRangeStart) {
      const campaignCreated = new Date(campaign.createdDate);
      const filterStart = new Date(dateRangeStart);
      matchesDateRange = campaignCreated >= filterStart;
    } else if (dateRangeEnd) {
      const campaignCreated = new Date(campaign.createdDate);
      const filterEnd = new Date(dateRangeEnd);
      matchesDateRange = campaignCreated <= filterEnd;
    }
    
    return matchesSearch && matchesStatus && matchesType && matchesDateRange;
  });

  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);

  const exportCampaigns = () => {
    console.log("[VENDOR] Exporting campaigns");
  };

  const copyCode = (code: string) => {
    // Use fallback for clipboard API with proper error handling
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(() => {
        console.log("✅ Copied code:", code);
      }).catch(() => {
        // Silently fallback if clipboard API fails
        fallbackCopyTextToClipboard(code);
      });
    } else {
      fallbackCopyTextToClipboard(code);
    }
  };

  // Fallback method for copying text
  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      console.log("✅ Copied code using fallback:", text);
    } catch (err) {
      // Silently fail - clipboard operations are non-critical
    }
    document.body.removeChild(textArea);
  };

  // Campaign type distribution
  const typeDistribution = [
    { name: "Push Notifications", value: campaigns.filter(c => c.type === "push-notification").length },
    { name: "Coupons", value: campaigns.filter(c => c.type === "coupon").length },
    { name: "Seasonal", value: campaigns.filter(c => c.type === "seasonal").length },
    { name: "Discount Codes", value: campaigns.filter(c => c.type === "discount-code").length },
  ];

  // Show Campaign Form as separate layer
  if (currentView === "add" || currentView === "edit") {
    return (
      <div className="p-6">
        {/* Header with Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => {
              setCurrentView("list");
              setSelectedCampaign(null);
            }}
            className="mb-4 -ml-2"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Campaigns
          </Button>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {currentView === "add" ? "Create New Campaign" : "Edit Campaign"}
          </h1>
          <p className="text-slate-600">Set up a new promotional campaign for your store</p>
        </div>

        {/* Form Card */}
        <Card className="max-w-4xl">
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 pb-2 border-b">
                  <Gift className="w-4 h-4" />
                  Basic Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="campaign-name">Campaign Name *</Label>
                    <Input
                      id="campaign-name"
                      placeholder="e.g., Summer Sale 2026"
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="campaign-type">Campaign Type *</Label>
                    <Select value={newCampaign.type} onValueChange={(value) => setNewCampaign({ ...newCampaign, type: value as CampaignType })}>
                      <SelectTrigger id="campaign-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="push-notification">Push Notification</SelectItem>
                        <SelectItem value="coupon">Coupon</SelectItem>
                        <SelectItem value="seasonal">Seasonal Discount</SelectItem>
                        <SelectItem value="discount-code">Discount Code</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="target-audience">Target Audience *</Label>
                    <Select value={newCampaign.targetAudience} onValueChange={(value) => setNewCampaign({ ...newCampaign, targetAudience: value })}>
                      <SelectTrigger id="target-audience">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All Customers">All Customers</SelectItem>
                        <SelectItem value="New Customers">New Customers</SelectItem>
                        <SelectItem value="VIP Customers">VIP Customers</SelectItem>
                        <SelectItem value="Email Subscribers">Email Subscribers</SelectItem>
                        <SelectItem value="Cart Abandoners">Cart Abandoners</SelectItem>
                        <SelectItem value="Wishlist Users">Wishlist Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Push Notification Content */}
              {newCampaign.type === "push-notification" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 pb-2 border-b">
                    <Bell className="w-4 h-4" />
                    Notification Content
                  </h3>
                  
                  <div>
                    <Label htmlFor="notification-title">Notification Title *</Label>
                    <Input
                      id="notification-title"
                      placeholder="e.g., Flash Sale Alert! 🔥"
                      value={newCampaign.title}
                      onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notification-message">Message *</Label>
                    <Textarea
                      id="notification-message"
                      placeholder="Write your notification message..."
                      rows={3}
                      value={newCampaign.message}
                      onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Discount Details */}
              {(newCampaign.type === "coupon" || newCampaign.type === "seasonal" || newCampaign.type === "discount-code") && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 pb-2 border-b">
                    <Percent className="w-4 h-4" />
                    Discount Details
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="coupon-code">Coupon Code *</Label>
                      <Input
                        id="coupon-code"
                        placeholder="e.g., SUMMER2026"
                        value={newCampaign.code}
                        onChange={(e) => setNewCampaign({ ...newCampaign, code: e.target.value.toUpperCase() })}
                      />
                      <p className="text-xs text-slate-500 mt-1">Unique code customers will use</p>
                    </div>

                    <div>
                      <Label htmlFor="discount-type">Discount Type *</Label>
                      <Select value={newCampaign.discountType} onValueChange={(value) => setNewCampaign({ ...newCampaign, discountType: value as "percentage" | "fixed" })}>
                        <SelectTrigger id="discount-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount (Ks)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="discount-amount">Discount Amount *</Label>
                      <Input
                        id="discount-amount"
                        type="number"
                        placeholder="10"
                        value={newCampaign.discount}
                        onChange={(e) => setNewCampaign({ ...newCampaign, discount: parseFloat(e.target.value) || 0 })}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {newCampaign.discountType === "percentage" ? "Percentage discount (e.g., 10 for 10%)" : "Fixed amount in Kyat"}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="min-amount">Minimum Purchase Amount (Ks)</Label>
                      <Input
                        id="min-amount"
                        type="number"
                        placeholder="0"
                        value={newCampaign.minAmount}
                        onChange={(e) => setNewCampaign({ ...newCampaign, minAmount: parseFloat(e.target.value) || 0 })}
                      />
                      <p className="text-xs text-slate-500 mt-1">Minimum cart value required (0 = no minimum)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 pb-2 border-b">
                  <Calendar className="w-4 h-4" />
                  Schedule
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start-date">Start Date *</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={newCampaign.startDate}
                      onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="end-date">End Date *</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={newCampaign.endDate}
                      onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="status">Status *</Label>
                    <Select value={newCampaign.status} onValueChange={(value) => setNewCampaign({ ...newCampaign, status: value as CampaignStatus })}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="usage-limit">Usage Limit</Label>
                    <Input
                      id="usage-limit"
                      type="number"
                      placeholder="1000"
                      value={newCampaign.usageLimit}
                      onChange={(e) => setNewCampaign({ ...newCampaign, usageLimit: parseInt(e.target.value) || 1000 })}
                    />
                    <p className="text-xs text-slate-500 mt-1">Maximum number of times this campaign can be used</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCurrentView("list");
                    setSelectedCampaign(null);
                  }} 
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateCampaign} 
                  className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {currentView === "edit" ? "Save Changes" : "Create Campaign"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Promo Setting</h1>
          <p className="text-slate-600">Manage campaigns, discounts, and push notifications</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
              <p className="text-2xl font-semibold text-slate-900">
                {totalRevenue} Ks
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">+18.3%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>
        
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Active Campaigns</p>
              <p className="text-2xl font-semibold text-slate-900">{activeCampaigns}</p>
              <p className="text-sm text-slate-500 mt-2">Running now</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Conversions</p>
              <p className="text-2xl font-semibold text-slate-900">{totalConversions.toLocaleString()}</p>
              <p className="text-sm text-slate-500 mt-2">All campaigns</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Clicks</p>
              <p className="text-2xl font-semibold text-slate-900">{totalClicks.toLocaleString()}</p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">+24.5%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="all">All Campaigns</TabsTrigger>
          <TabsTrigger value="announcement">Announcement Bar</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* All Campaigns Tab */}
        <TabsContent value="all">
          {/* Toolbar */}
          <Card className="mb-4">
            <div className="p-4 space-y-4">
              {/* Header Row */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-lg">Campaigns ({filteredCampaigns.length})</h3>
                <div className="flex items-center gap-2">
                  {campaigns.length > 0 && (
                    <Button 
                      variant="outline" 
                      className="h-9 border-red-200 text-red-600 hover:bg-red-50" 
                      onClick={handleClearAllCampaigns}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All
                    </Button>
                  )}
                  <Button variant="outline" className="h-9" onClick={exportCampaigns}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
              
              {/* Filter Row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search campaigns..."
                    className="pl-10 border-slate-300 h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[120px] h-9 border-slate-300 text-sm">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[120px] h-9 border-slate-300 text-sm">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="push-notification">Push Notification</SelectItem>
                    <SelectItem value="coupon">Coupon</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="discount-code">Discount Code</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateRangeStart}
                  onChange={(e) => setDateRangeStart(e.target.value)}
                  className="h-9 w-[140px] border-slate-300 text-sm"
                />
                <Input
                  type="date"
                  value={dateRangeEnd}
                  onChange={(e) => setDateRangeEnd(e.target.value)}
                  className="h-9 w-[140px] border-slate-300 text-sm"
                />
              </div>
            </div>
          </Card>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-slate-600">Loading campaigns...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <Card className="p-6 text-center">
              <p className="text-red-600">{error}</p>
              <Button onClick={fetchCampaigns} variant="outline" className="mt-4">
                Try Again
              </Button>
            </Card>
          )}

          {/* Empty State */}
          {!loading && !error && filteredCampaigns.length === 0 && (
            <Card className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No campaigns found</h3>
              <p className="text-slate-600">Try adjusting your filters or check back later.</p>
            </Card>
          )}

          {/* Campaigns Grid */}
          {!loading && !error && filteredCampaigns.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCampaigns.map((campaign) => {
              const TypeIcon = getTypeIcon(campaign.type);
              return (
                <Card key={campaign.id} className="hover:shadow-lg transition-shadow relative">
                  <CardContent className="space-y-3 pt-6">
                    {/* Three-dot menu in top right corner */}
                    <div className="absolute top-4 right-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4 text-slate-600" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedCampaign(campaign);
                              setCurrentView("edit");
                            }}
                            className="cursor-pointer"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteCampaign(campaign.id)}
                            className="cursor-pointer text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Creator and Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <img src={campaign.creatorAvatar} alt={campaign.creator} className="w-6 h-6 rounded" />
                        <p className="text-sm text-slate-600">{campaign.creator}</p>
                      </div>
                      {getStatusBadge(campaign.status)}
                    </div>

                    {/* Code */}
                    {campaign.code && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                          <code className="text-sm font-mono font-semibold text-purple-600">{campaign.code}</code>
                          <Button variant="ghost" size="sm" onClick={() => copyCode(campaign.code!)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={async () => {
                            try {
                              const response = await fetch(
                                `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/validate`,
                                {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${publicAnonKey}`,
                                  },
                                  body: JSON.stringify({
                                    code: campaign.code,
                                    cartTotal: 100,
                                    cartItems: []
                                  })
                                }
                              );
                              const data = await response.json();
                              console.log('🧪 Test validation result:', data);
                              if (data.valid) {
                                alert(`✅ Coupon "${campaign.code}" is working!\n\nDiscount: ${data.campaign.discount}${data.campaign.discountType === 'percentage' ? '%' : ' Ks'}`);
                              } else {
                                alert(`❌ Coupon validation failed:\n\n${data.error}`);
                              }
                            } catch (error) {
                              console.error('❌ Test failed:', error);
                              alert(`❌ Test failed: ${error}`);
                            }
                          }}
                        >
                          🧪 Test This Coupon
                        </Button>
                      </div>
                    )}

                    {/* Discount */}
                    {campaign.discount && (
                      <div className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-slate-900">
                          {campaign.discountType === "percentage" ? `${campaign.discount}% OFF` : `${campaign.discount} Ks OFF`}
                        </span>
                      </div>
                    )}

                    {/* Push Notification Content */}
                    {campaign.type === "push-notification" && campaign.title && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-xs font-medium text-blue-900">{campaign.title}</p>
                        <p className="text-xs text-blue-700 mt-1 line-clamp-2">{campaign.message}</p>
                      </div>
                    )}

                    {/* Dates */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>{campaign.startDate} - {campaign.endDate}</span>
                    </div>

                    {/* Target Audience */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Target className="w-3 h-3" />
                      <span>{campaign.targetAudience}</span>
                    </div>

                    {/* Stats */}
                    <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-3">
                      {campaign.usageCount !== undefined && (
                        <div>
                          <p className="text-xs text-slate-500">Usage</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {campaign.usageCount}/{campaign.usageLimit}
                          </p>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1">
                            <div 
                              className="bg-blue-600 h-1.5 rounded-full" 
                              style={{ width: `${((campaign.usageCount || 0) / (campaign.usageLimit || 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {campaign.revenue !== undefined && (
                        <div>
                          <p className="text-xs text-slate-500">Revenue</p>
                          <p className="text-sm font-semibold text-green-600">{campaign.revenue} Ks</p>
                        </div>
                      )}
                      {campaign.clicks !== undefined && (
                        <div>
                          <p className="text-xs text-slate-500">Clicks</p>
                          <p className="text-sm font-semibold text-slate-900">{campaign.clicks.toLocaleString()}</p>
                        </div>
                      )}
                      {campaign.conversions !== undefined && (
                        <div>
                          <p className="text-xs text-slate-500">Conversions</p>
                          <p className="text-sm font-semibold text-slate-900">{campaign.conversions.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          )}
        </TabsContent>

        {/* Announcement Bar Tab */}
        <TabsContent value="announcement" className="space-y-6">
          {/* Preview */}
          {announcementEnabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-slate-600">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="py-3 px-6 rounded-lg flex items-center justify-center gap-3 text-center"
                  style={{ 
                    backgroundColor: announcementBgColor,
                    color: announcementTextColor 
                  }}
                >
                  {announcementIcon === "megaphone" && <Megaphone className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "bell" && <Bell className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "gift" && <Gift className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "percent" && <Percent className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "tag" && <Tag className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "sparkles" && <Sparkles className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "info" && <Info className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "alert" && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "truck" && <Truck className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "cart" && <ShoppingCart className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "star" && <Star className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "heart" && <Heart className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "zap" && <Zap className="w-5 h-5 flex-shrink-0" />}
                  {announcementIcon === "award" && <Award className="w-5 h-5 flex-shrink-0" />}
                  <span className="font-medium">{announcementText || "Your announcement text here"}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Settings Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Announcement Bar Settings</CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={announcementEnabled}
                    onCheckedChange={setAnnouncementEnabled}
                  />
                  <Label className="text-sm">{announcementEnabled ? "Enabled" : "Disabled"}</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Content Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b flex items-center gap-2">
                  <Megaphone className="w-4 h-4" />
                  Content
                </h3>
                
                <div>
                  <Label htmlFor="announcement-text" className="text-sm font-medium text-slate-900 mb-2 block">
                    Announcement Text *
                  </Label>
                  <Input
                    id="announcement-text"
                    placeholder="e.g., Free shipping on orders over $50! 🚚"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    className="h-10"
                  />
                  <p className="text-xs text-slate-500 mt-1">This text will appear in your storefront announcement bar</p>
                </div>

                <div>
                  <Label htmlFor="announcement-link" className="text-sm font-medium text-slate-900 mb-2 block">
                    Link URL (Optional)
                  </Label>
                  <Input
                    id="announcement-link"
                    placeholder="e.g., https://example.com/sale"
                    value={announcementLink}
                    onChange={(e) => setAnnouncementLink(e.target.value)}
                    className="h-10"
                  />
                  <p className="text-xs text-slate-500 mt-1">Make the announcement clickable</p>
                </div>
              </div>

              {/* Design Section */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Design
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="announcement-icon" className="text-sm font-medium text-slate-900 mb-2 block">
                      Icon
                    </Label>
                    <Select value={announcementIcon} onValueChange={setAnnouncementIcon}>
                      <SelectTrigger id="announcement-icon" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="megaphone">📣 Megaphone</SelectItem>
                        <SelectItem value="bell">🔔 Bell</SelectItem>
                        <SelectItem value="gift">🎁 Gift</SelectItem>
                        <SelectItem value="percent">% Percent</SelectItem>
                        <SelectItem value="tag">🏷️ Tag</SelectItem>
                        <SelectItem value="sparkles">✨ Sparkles</SelectItem>
                        <SelectItem value="info">ℹ️ Info</SelectItem>
                        <SelectItem value="alert">⚠️ Alert</SelectItem>
                        <SelectItem value="truck">🚚 Truck</SelectItem>
                        <SelectItem value="cart">🛒 Cart</SelectItem>
                        <SelectItem value="star">⭐ Star</SelectItem>
                        <SelectItem value="heart">❤️ Heart</SelectItem>
                        <SelectItem value="zap">⚡ Zap</SelectItem>
                        <SelectItem value="award">🏆 Award</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="bg-color" className="text-sm font-medium text-slate-900 mb-2 block">
                      Background Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="bg-color"
                        type="color"
                        value={announcementBgColor}
                        onChange={(e) => setAnnouncementBgColor(e.target.value)}
                        className="h-10 w-16"
                      />
                      <Input
                        type="text"
                        value={announcementBgColor}
                        onChange={(e) => setAnnouncementBgColor(e.target.value)}
                        className="h-10 flex-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="text-color" className="text-sm font-medium text-slate-900 mb-2 block">
                      Text Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="text-color"
                        type="color"
                        value={announcementTextColor}
                        onChange={(e) => setAnnouncementTextColor(e.target.value)}
                        className="h-10 w-16"
                      />
                      <Input
                        type="text"
                        value={announcementTextColor}
                        onChange={(e) => setAnnouncementTextColor(e.target.value)}
                        className="h-10 flex-1"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleSaveAnnouncementSettings} 
                  className="w-full bg-slate-900 hover:bg-slate-800"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Announcement Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Announcement Bar Settings</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={announcementEnabled}
                  onCheckedChange={setAnnouncementEnabled}
                />
                <Label className="text-sm">{announcementEnabled ? "Enabled" : "Disabled"}</Label>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Content Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b flex items-center gap-2">
                  <Megaphone className="w-4 h-4" />
                  Content
                </h3>
                
                <div>
                  <Label htmlFor="appearance-text" className="text-sm font-medium text-slate-900 mb-2 block">
                    Announcement Text *
                  </Label>
                  <Input
                    id="appearance-text"
                    placeholder="Welcome to SECURE! Free shipping on orders over $50 🚚"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    className="h-10"
                  />
                  <p className="text-xs text-slate-500 mt-1">This text will appear in your storefront announcement bar</p>
                </div>

                <div>
                  <Label htmlFor="appearance-link" className="text-sm font-medium text-slate-900 mb-2 block">
                    Link URL (Optional)
                  </Label>
                  <Input
                    id="appearance-link"
                    placeholder="e.g., https://example.com/sale"
                    value={announcementLink}
                    onChange={(e) => setAnnouncementLink(e.target.value)}
                    className="h-10"
                  />
                  <p className="text-xs text-slate-500 mt-1">Make the announcement clickable</p>
                </div>
              </div>

              {/* Design Section */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Design
                </h3>

                <div>
                  <Label htmlFor="appearance-icon" className="text-sm font-medium text-slate-900 mb-2 block">
                    Icon
                  </Label>
                  <Select value={announcementIcon} onValueChange={setAnnouncementIcon}>
                    <SelectTrigger id="appearance-icon" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="megaphone">📣 Megaphone</SelectItem>
                      <SelectItem value="bell">🔔 Bell</SelectItem>
                      <SelectItem value="gift">🎁 Gift</SelectItem>
                      <SelectItem value="percent">% Percent</SelectItem>
                      <SelectItem value="tag">🏷️ Tag</SelectItem>
                      <SelectItem value="sparkles">✨ Sparkles</SelectItem>
                      <SelectItem value="info">ℹ️ Info</SelectItem>
                      <SelectItem value="alert">⚠️ Alert</SelectItem>
                      <SelectItem value="truck">🚚 Truck</SelectItem>
                      <SelectItem value="cart">🛒 Cart</SelectItem>
                      <SelectItem value="star">⭐ Star</SelectItem>
                      <SelectItem value="heart">❤️ Heart</SelectItem>
                      <SelectItem value="zap">⚡ Zap</SelectItem>
                      <SelectItem value="award">🏆 Award</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="appearance-bg-color" className="text-sm font-medium text-slate-900 mb-2 block">
                      Background Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="appearance-bg-color"
                        type="color"
                        value={announcementBgColor}
                        onChange={(e) => setAnnouncementBgColor(e.target.value)}
                        className="h-10 w-16 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={announcementBgColor}
                        onChange={(e) => setAnnouncementBgColor(e.target.value)}
                        className="h-10 flex-1 font-mono text-sm"
                        placeholder="#1e293b"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="appearance-text-color" className="text-sm font-medium text-slate-900 mb-2 block">
                      Text Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="appearance-text-color"
                        type="color"
                        value={announcementTextColor}
                        onChange={(e) => setAnnouncementTextColor(e.target.value)}
                        className="h-10 w-16 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={announcementTextColor}
                        onChange={(e) => setAnnouncementTextColor(e.target.value)}
                        className="h-10 flex-1 font-mono text-sm"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                </div>

                {/* Color Presets */}
                <div>
                  <Label className="text-sm font-medium text-slate-900 mb-3 block">
                    Color Presets
                  </Label>
                  <div className="grid grid-cols-4 gap-3">
                    {/* Dark Blue / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#1e293b");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#1e293b" }}
                      title="Dark Blue / White"
                    />
                    
                    {/* Black / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#000000");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#000000" }}
                      title="Black / White"
                    />

                    {/* Red / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#ef4444");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#ef4444" }}
                      title="Red / White"
                    />

                    {/* White / Black */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#ffffff");
                        setAnnouncementTextColor("#000000");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#ffffff" }}
                      title="White / Black"
                    />

                    {/* Orange / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#f97316");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#f97316" }}
                      title="Orange / White"
                    />

                    {/* Purple / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#a855f7");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#a855f7" }}
                      title="Purple / White"
                    />

                    {/* Cyan / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#06b6d4");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#06b6d4" }}
                      title="Cyan / White"
                    />

                    {/* White / Purple */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#ffffff");
                        setAnnouncementTextColor("#a855f7");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#ffffff" }}
                      title="White / Purple"
                    />

                    {/* Green / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#22c55e");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#22c55e" }}
                      title="Green / White"
                    />

                    {/* Pink / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#ec4899");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#ec4899" }}
                      title="Pink / White"
                    />

                    {/* Cream / Brown */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#fef3c7");
                        setAnnouncementTextColor("#78350f");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#fef3c7" }}
                      title="Cream / Brown"
                    />

                    {/* Brown / White */}
                    <button
                      type="button"
                      onClick={() => {
                        setAnnouncementBgColor("#92400e");
                        setAnnouncementTextColor("#ffffff");
                      }}
                      className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-400 transition-colors"
                      style={{ backgroundColor: "#92400e" }}
                      title="Brown / White"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleSaveAnnouncementSettings} 
                  className="w-full bg-slate-900 hover:bg-slate-800"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Appearance Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="space-y-6">
            {/* Performance Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="conversions" stroke="#22c55e" strokeWidth={2} />
                    <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Campaign Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Type Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={typeDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {typeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
