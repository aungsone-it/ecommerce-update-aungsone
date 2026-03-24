import { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Bell, Tag, Percent, Gift, TrendingUp, Plus, Search, Filter, Download, Eye, Edit, Trash2, Copy, Calendar, Users, Target, BarChart3, Clock, CheckCircle, XCircle, Send, Megaphone, Sparkles, AlertCircle, Info, ShoppingCart, Truck, Star, Heart, Zap, Award, Palette, Save, Package, MoreVertical, Upload, Image, ShoppingBag } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { POLLING_INTERVALS_MS } from "../../constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// 🚀 MODULE-LEVEL CACHE: Persists across component unmount/remount
let cachedCampaigns: any[] = [];

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

const getCreatorTypeBadge = (type: CreatorType) => {
  const variants = {
    admin: { color: "bg-purple-100 text-purple-700 border-purple-200", label: "Admin" },
    vendor: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "Vendor" },
    collaborator: { color: "bg-teal-100 text-teal-700 border-teal-200", label: "Collaborator" },
  };
  
  return (
    <Badge variant="secondary" className={`${variants[type].color} hover:${variants[type].color} border text-xs`}>
      {variants[type].label}
    </Badge>
  );
};

export function Marketing() {
  const { t } = useLanguage();
  const [currentView, setCurrentView] = useState<"list" | "add" | "edit">("list");
  const [selectedTab, setSelectedTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [creatorFilter, setCreatorFilter] = useState<string>("all");
  const [creatorNameFilter, setCreatorNameFilter] = useState<string>("all");
  const [dateRangeStart, setDateRangeStart] = useState<string>("");
  const [dateRangeEnd, setDateRangeEnd] = useState<string>("");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  // Backend integration
  // 🚀 Initialize from cache if available
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => cachedCampaigns || []);
  const [loading, setLoading] = useState(!cachedCampaigns.length);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false); // Off by default — avoids high edge traffic; enable when actively editing campaigns
  
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

  // Announcement Bar State
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [announcementText, setAnnouncementText] = useState("Free shipping on orders over $50! 🚚");
  const [announcementBgColor, setAnnouncementBgColor] = useState("#1e293b");
  const [announcementTextColor, setAnnouncementTextColor] = useState("#ffffff");
  const [announcementIcon, setAnnouncementIcon] = useState("megaphone");
  const [announcementLink, setAnnouncementLink] = useState("");

  // Appearance Settings State
  const [appearanceImage, setAppearanceImage] = useState<string | null>(null);
  const [appearanceTitle, setAppearanceTitle] = useState("");
  const [appearanceDescription, setAppearanceDescription] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);

  // Image Compression Function
  // Compress image to under 500KB
  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Calculate maximum dimensions while maintaining aspect ratio
          const maxWidth = 1920;
          const maxHeight = 1080;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Fill white background for transparent images
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          // Determine output format (prefer JPEG for better compression)
          const outputFormat = 'image/jpeg';
          
          // Start with quality 0.9 and reduce until under 500KB
          let quality = 0.9;
          const targetSize = 500 * 1024; // 500KB in bytes
          
          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }
                
                console.log(`🔧 Compression attempt - Quality: ${quality.toFixed(1)}, Size: ${(blob.size / 1024).toFixed(0)}KB`);
                
                // If size is acceptable or quality is too low, use this version
                if (blob.size <= targetSize || quality <= 0.1) {
                  const compressedReader = new FileReader();
                  compressedReader.onloadend = () => {
                    console.log(`✅ Final compressed size: ${(blob.size / 1024).toFixed(0)}KB`);
                    resolve(compressedReader.result as string);
                  };
                  compressedReader.onerror = () => {
                    reject(new Error('Failed to read compressed image'));
                  };
                  compressedReader.readAsDataURL(blob);
                } else {
                  // Reduce quality and try again
                  quality -= 0.1;
                  tryCompress();
                }
              },
              outputFormat,
              quality
            );
          };
          
          tryCompress();
        };
        
        img.onerror = (error) => {
          console.error('Image load error:', error);
          reject(new Error('Failed to load image. Please ensure the file is a valid image.'));
        };
        
        img.src = e.target?.result as string;
      };
      
      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        reject(new Error('Failed to read file. Please try again.'));
      };
      
      reader.readAsDataURL(file);
    });
  };

  // Handle Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, etc.)');
      return;
    }

    // Check file size (max 50MB before compression)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      alert('Image is too large. Please select an image under 50MB.');
      return;
    }

    setIsCompressing(true);
    
    try {
      console.log(`📁 Original file: ${file.name}, Size: ${(file.size / 1024).toFixed(0)}KB`);
      const compressedImage = await compressImage(file);
      setAppearanceImage(compressedImage);
      console.log('✅ Image compressed and ready for upload');
      alert('✅ Image uploaded and compressed successfully!');
    } catch (error) {
      console.error('❌ Image compression failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to compress image. Please try another image.');
    } finally {
      setIsCompressing(false);
      // Reset the input so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  // Save Appearance Settings
  const handleSaveAppearanceSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/appearance-settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            image: appearanceImage,
            title: appearanceTitle,
            description: appearanceDescription,
          }),
        }
      );

      if (response.ok) {
        alert('✅ Appearance settings saved successfully!');
      } else {
        throw new Error('Failed to save appearance settings');
      }
    } catch (error) {
      console.error('❌ Save appearance settings failed:', error);
      alert('Failed to save appearance settings');
    }
  };

  // Fetch Appearance Settings
  const fetchAppearanceSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/appearance-settings`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data) {
          setAppearanceImage(data.image || null);
          setAppearanceTitle(data.title || "");
          setAppearanceDescription(data.description || "");
        }
      }
    } catch (error) {
      console.error('❌ Fetch appearance settings failed:', error);
    }
  };

  // Fetch campaigns from backend
  useEffect(() => {
    fetchCampaigns();
    fetchAnnouncementSettings();
    fetchAppearanceSettings();
  }, []);

  // 🔄 Real-time auto-refresh: Poll campaigns every 10 seconds when viewing the list
  useEffect(() => {
    if (!autoRefresh || currentView !== "list") return;
    
    console.log(
      `🔄 Auto-refresh for campaigns (every ${POLLING_INTERVALS_MS.MARKETING_CAMPAIGNS / 60000} min)`
    );
    const intervalId = setInterval(() => {
      console.log("🔄 Auto-refreshing campaigns...");
      fetchCampaigns();
    }, POLLING_INTERVALS_MS.MARKETING_CAMPAIGNS);
    
    return () => {
      console.log("🛑 Clearing auto-refresh interval");
      clearInterval(intervalId);
    };
  }, [autoRefresh, currentView]);

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
    // 🚀 SMART LOADING: Only show spinner if request takes > 300ms
    let showLoadingTimer: NodeJS.Timeout | null = null;
    
    showLoadingTimer = setTimeout(() => {
      setLoading(true);
    }, 300);
    
    try {
      setError(null);
      
      console.log("📣 Fetching campaigns from server...");
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      console.log("📥 Response status:", response.status);
      const data = await response.json();
      console.log("📥 Response data:", data);

      if (data.campaigns) {
        setCampaigns(data.campaigns);
        
        // 🚀 CACHE THE CAMPAIGNS FOR FUTURE USE
        cachedCampaigns = data.campaigns;
      }
    } catch (error) {
      // 🔇 Silently ignore "Failed to fetch" errors during server warmup
      const isWarmupError = error instanceof TypeError && error.message === 'Failed to fetch';
      if (!isWarmupError) {
        console.error("❌ Error fetching campaigns:", error);
      }
      setError("Failed to load campaigns");
    } finally {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      setLoading(false);
    }
  };

  const fetchAnnouncementSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/announcement`,
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
        console.error("❌ Error fetching announcement settings:", error);
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
      console.log(isEditing ? "📤 Updating campaign:" : "📤 Creating campaign:", newCampaign);

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
          creator: "Admin Team",
          creatorType: "admin",
          creatorAvatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin",
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log(isEditing ? "✅ Campaign updated:" : "✅ Campaign created:", data.campaign);
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
        console.error("❌ Server error:", data);
        alert(`❌ Failed to ${isEditing ? "update" : "create"} campaign: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("❌ Error creating/updating campaign:", error);
      alert(`❌ Failed to ${currentView === "edit" ? "update" : "create"} campaign: ${error.message || "Network error"}`);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    try {
      console.log(`🗑️ Attempting to delete campaign: ${id}`);
      
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

      console.log(`📡 Delete response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Delete failed with status ${response.status}:`, errorText);
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("📦 Delete response data:", data);

      if (data.success) {
        console.log("✅ Campaign deleted successfully");
        alert("✅ Campaign deleted successfully!");
        await fetchCampaigns(); // Refresh list
      } else {
        throw new Error(data.error || "Failed to delete campaign");
      }
    } catch (error) {
      console.error("❌ Error deleting campaign:", error);
      alert(`Failed to delete campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleClearAllCampaigns = async () => {
    if (!confirm('⚠️ Are you sure you want to delete ALL campaigns? This cannot be undone!')) {
      return;
    }
    
    try {
      console.log('🗑️ Clearing all campaigns...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns-clear-all`,
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
        console.log(`✅ ${data.deleted} campaigns deleted`);
        alert(`✅ Success! ${data.deleted} campaigns deleted.`);
        await fetchCampaigns(); // Refresh list
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error clearing campaigns:', error);
      alert('Failed to clear campaigns');
    }
  };

  const handleSaveAnnouncementSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/announcement`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
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
        console.log("✅ Announcement settings saved");
        alert("✅ Announcement settings saved successfully!");
      }
    } catch (error) {
      console.error("❌ Error saving announcement settings:", error);
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
    const matchesCreator = creatorFilter === "all" || campaign.creatorType === creatorFilter;
    const matchesCreatorName = creatorNameFilter === "all" || campaign.creator === creatorNameFilter;
    
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
    
    return matchesSearch && matchesStatus && matchesType && matchesCreator && matchesCreatorName && matchesDateRange;
  });

  // Get unique creator names for filter
  const uniqueCreators = Array.from(new Set(campaigns.map(c => c.creator))).sort();

  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);

  const duplicateCampaign = (campaign: Campaign) => {
    console.log("Duplicating campaign:", campaign);
  };

  const deleteCampaign = (id: string) => {
    handleDeleteCampaign(id);
  };

  const exportCampaigns = () => {
    console.log("Exporting campaigns");
  };

  const copyCode = (code: string, campaignId?: string) => {
    // Track click if campaign ID is provided
    if (campaignId) {
      trackCampaignClick(campaignId);
    }
    
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

  // Track campaign clicks (for analytics)
  const trackCampaignClick = async (campaignId: string) => {
    try {
      console.log(`👆 Tracking click for campaign: ${campaignId}`);
      
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) return;
      
      const updatedCampaign = {
        ...campaign,
        clicks: (campaign.clicks || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      
      // Update backend
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/${campaignId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(updatedCampaign),
        }
      );
      
      console.log(`✅ Click tracked: ${updatedCampaign.clicks} total clicks`);
      
      // Optimistically update local state
      setCampaigns(prevCampaigns =>
        prevCampaigns.map(c => c.id === campaignId ? updatedCampaign : c)
      );
    } catch (error) {
      console.error('❌ Failed to track click:', error);
      // Don't show error to user - this is a background operation
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

  // Creator type distribution
  const creatorDistribution = [
    { name: "Admin", value: campaigns.filter(c => c.creatorType === "admin").length },
    { name: "Vendors", value: campaigns.filter(c => c.creatorType === "vendor").length },
    { name: "Collaborators", value: campaigns.filter(c => c.creatorType === "collaborator").length },
  ];

  // Show Campaign Form as separate layer
  if (currentView === "add" || currentView === "edit") {
    return (
      <div className="p-8">
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
          <p className="text-slate-600">Set up a new marketing campaign</p>
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
                    <div className="md:col-span-2">
                      <Label htmlFor="coupon-code">Coupon Code *</Label>
                      <Input
                        id="coupon-code"
                        placeholder="e.g., SUMMER2026"
                        value={newCampaign.code}
                        onChange={(e) => setNewCampaign({ ...newCampaign, code: e.target.value.toUpperCase() })}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="discount-amount">Discount Amount *</Label>
                      <Input
                        id="discount-amount"
                        type="number"
                        placeholder="10"
                        value={newCampaign.discount}
                        onChange={(e) => setNewCampaign({ ...newCampaign, discount: parseInt(e.target.value) || 0 })}
                      />
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
                  </div>

                  {/* Minimum Purchase Requirements */}
                  <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="text-sm font-medium text-slate-900 mb-3">Minimum Purchase Requirements (Optional)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="min-quantity" className="text-xs">Minimum Quantity</Label>
                        <Input
                          id="min-quantity"
                          type="number"
                          placeholder="1"
                          min="1"
                          value={newCampaign.minQuantity}
                          onChange={(e) => setNewCampaign({ ...newCampaign, minQuantity: parseInt(e.target.value) || 1 })}
                        />
                        <p className="text-xs text-slate-500 mt-1">Min items required in cart</p>
                      </div>
                      <div>
                        <Label htmlFor="min-amount" className="text-xs">Minimum Amount (Ks)</Label>
                        <Input
                          id="min-amount"
                          type="number"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          value={newCampaign.minAmount}
                          onChange={(e) => setNewCampaign({ ...newCampaign, minAmount: parseFloat(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-slate-500 mt-1">Min cart value required</p>
                      </div>
                    </div>
                    <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                       Leave at default values if no minimum requirements
                    </div>
                  </div>

                  {/* Product Selection */}
                  <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="text-sm font-medium text-slate-900 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Applicable Products
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="product-scope" className="text-xs">Discount Applies To *</Label>
                        <Select 
                          value={newCampaign.productScope || "all"} 
                          onValueChange={(value) => setNewCampaign({ 
                            ...newCampaign, 
                            productScope: value as "all" | "specific",
                            specificProducts: value === "all" ? [] : newCampaign.specificProducts
                          })}
                        >
                          <SelectTrigger id="product-scope">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Products (Entire Cart)</SelectItem>
                            <SelectItem value="specific">Specific Products Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {newCampaign.productScope === "specific" && (
                        <div>
                          <Label htmlFor="product-skus" className="text-xs">Product SKUs *</Label>
                          <Textarea
                            id="product-skus"
                            placeholder="Enter SKUs (one per line or comma-separated)&#10;e.g., ME001, ME002, M003"
                            rows={4}
                            value={newCampaign.specificProducts?.join('\n') || ''}
                            onChange={(e) => {
                              const skus = e.target.value
                                .split(/[\n,]+/)
                                .map(s => s.trim().toUpperCase())
                                .filter(s => s.length > 0);
                              setNewCampaign({ ...newCampaign, specificProducts: skus });
                            }}
                            className="font-mono text-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            {newCampaign.specificProducts?.length || 0} product(s) selected
                          </p>
                        </div>
                      )}
                      
                      <div className="p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-800">
                        <strong>Note:</strong> If "Specific Products" is selected, discount will only apply to cart items matching the SKUs above
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule & Limits */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 pb-2 border-b">
                  <Calendar className="w-4 h-4" />
                  Schedule & Limits
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="campaign-status">Campaign Status *</Label>
                    <Select 
                      value={newCampaign.status || "active"} 
                      onValueChange={(value) => setNewCampaign({ ...newCampaign, status: value as CampaignStatus })}
                    >
                      <SelectTrigger id="campaign-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active (Live Now)</SelectItem>
                        <SelectItem value="scheduled">Scheduled (Future)</SelectItem>
                        <SelectItem value="draft">Draft (Not Live)</SelectItem>
                        <SelectItem value="expired">Expired (Ended)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Only "Active" campaigns will work on the storefront</p>
                  </div>
                  <div></div>
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
                  <div className="md:col-span-2">
                    <Label htmlFor="usage-limit">Usage Limit *</Label>
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
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('marketing.title')}</h1>
        <p className="text-slate-600">{t('marketing.subtitle')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('marketing.totalRevenue')}</p>
              <p className="text-2xl font-semibold text-slate-900">
                {totalRevenue} MMK
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
              <p className="text-sm text-slate-600 mb-1">{t('marketing.activeCampaigns')}</p>
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
              <p className="text-sm text-slate-600 mb-1">{t('marketing.conversions')}</p>
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
              <p className="text-sm text-slate-600 mb-1">{t('marketing.totalClicks')}</p>
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
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-slate-900 text-lg">Campaigns ({filteredCampaigns.length})</h3>
                  {autoRefresh && currentView === "list" && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-green-50 border border-green-200 rounded-md">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-700 font-medium">Live</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setCurrentView("add")} className="h-9 bg-slate-900 hover:bg-slate-800">
                    <Plus className="w-4 h-4 mr-2" />
                    {t('marketing.createCampaign')}
                  </Button>
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
                    {t('marketing.export')}
                  </Button>
                </div>
              </div>
              
              {/* Filter Row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder={t('marketing.searchPlaceholder')}
                    className="pl-10 border-slate-300 h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[120px] h-9 border-slate-300 text-sm">
                    <SelectValue placeholder={t('marketing.allStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('marketing.allStatus')}</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[120px] h-9 border-slate-300 text-sm">
                    <SelectValue placeholder={t('marketing.allTypes')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('marketing.allTypes')}</SelectItem>
                    <SelectItem value="push-notification">Push Notification</SelectItem>
                    <SelectItem value="coupon">Coupon</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="discount-code">Discount Code</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={creatorFilter} onValueChange={setCreatorFilter}>
                  <SelectTrigger className="w-[120px] h-9 border-slate-300 text-sm">
                    <SelectValue placeholder="Creators" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Creators</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="collaborator">Collaborator</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={creatorNameFilter} onValueChange={setCreatorNameFilter}>
                  <SelectTrigger className="w-[100px] h-9 border-slate-300 text-sm">
                    <SelectValue placeholder="Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Vendor</SelectItem>
                    {uniqueCreators.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={`skeleton-${index}`} className="animate-pulse">
                  <div className="p-5 space-y-4">
                    {/* Header skeleton */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-200 rounded-full"></div>
                        <div className="h-4 bg-slate-200 rounded w-20"></div>
                      </div>
                      <div className="h-6 bg-slate-200 rounded-full w-16"></div>
                    </div>
                    {/* Icon and title skeleton */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-5 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                      </div>
                    </div>
                    {/* Stats skeleton */}
                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-100">
                      <div className="space-y-1">
                        <div className="h-3 bg-slate-200 rounded w-12"></div>
                        <div className="h-5 bg-slate-200 rounded w-16"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 bg-slate-200 rounded w-12"></div>
                        <div className="h-5 bg-slate-200 rounded w-16"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 bg-slate-200 rounded w-12"></div>
                        <div className="h-5 bg-slate-200 rounded w-16"></div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
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
              <p className="text-slate-600 mb-6">Get started by creating your first campaign</p>
              <Button onClick={() => setCurrentView("add")} className="bg-slate-900 hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            </Card>
          )}

          {/* Campaigns Grid */}
          {!loading && !error && filteredCampaigns.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCampaigns.map((campaign, index) => {
              const TypeIcon = getTypeIcon(campaign.type);
              return (
                <Card key={campaign.id} className="hover:shadow-md transition-shadow relative group">
                  <CardContent className="p-5 space-y-4">
                    {/* Header with Creator and Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img 
                          src={campaign.creatorAvatar} 
                          alt={campaign.creator}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-sm text-slate-600">{campaign.creator}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={campaign.status === "active" ? "default" : "secondary"} 
                          className={`text-xs ${
                            campaign.status === "active" 
                              ? "bg-green-100 text-green-700 hover:bg-green-100" 
                              : campaign.status === "scheduled"
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {campaign.status === "active" ? "Active" : campaign.status === "scheduled" ? "Scheduled" : "Expired"}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setCurrentView("edit");
                          }}
                        >
                          <Edit className="w-3.5 h-3.5 text-slate-600" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => handleDeleteCampaign(campaign.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </Button>
                      </div>
                    </div>

                    {/* Campaign Code */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-slate-900">{campaign.code || campaign.name}</h3>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => copyCode(campaign.code || campaign.name, campaign.id)}
                      >
                        <Copy className="w-4 h-4 text-slate-600" />
                      </Button>
                    </div>

                    {/* Discount Info */}
                    <div className="flex items-center gap-2 text-sm">
                      <Percent className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-slate-900">
                        {campaign.discountType === "percentage" 
                          ? `${campaign.discount}% OFF` 
                          : `${campaign.discount} MMK OFF`}
                      </span>
                    </div>

                    {/* Date Range */}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(campaign.startDate).toLocaleDateString()} - {new Date(campaign.endDate).toLocaleDateString()}</span>
                    </div>

                    {/* Target Audience */}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="w-4 h-4" />
                      <span>{campaign.targetAudience || "All Customers"}</span>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Usage</p>
                        <p className="text-sm font-semibold text-slate-900">{campaign.usageCount || 0}/{campaign.usageLimit || 1000}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Revenue</p>
                        <p className="text-sm font-semibold text-emerald-600">{(campaign.revenue || 0).toLocaleString()} MMK</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Clicks</p>
                        <p className="text-sm font-semibold text-slate-900">{campaign.clicks || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Conversions</p>
                        <p className="text-sm font-semibold text-slate-900">{campaign.conversions || 0}</p>
                      </div>
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
                    placeholder="e.g., Free shipping on orders over $50! ��"
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="announcement-bg-color" className="text-sm font-medium text-slate-900 mb-2 block">
                      Background Color
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="announcement-bg-color"
                        type="color"
                        value={announcementBgColor}
                        onChange={(e) => setAnnouncementBgColor(e.target.value)}
                        className="h-10 w-16 p-1"
                      />
                      <Input
                        type="text"
                        value={announcementBgColor}
                        onChange={(e) => setAnnouncementBgColor(e.target.value)}
                        className="h-10 flex-1 font-mono text-sm"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="announcement-text-color" className="text-sm font-medium text-slate-900 mb-2 block">
                      Text Color
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="announcement-text-color"
                        type="color"
                        value={announcementTextColor}
                        onChange={(e) => setAnnouncementTextColor(e.target.value)}
                        className="h-10 w-16 p-1"
                      />
                      <Input
                        type="text"
                        value={announcementTextColor}
                        onChange={(e) => setAnnouncementTextColor(e.target.value)}
                        className="h-10 flex-1 font-mono text-sm"
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Color Presets */}
              <div className="space-y-3 pt-4 border-t">
                <Label className="text-sm font-medium text-slate-900">Color Presets</Label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#1e293b");
                      setAnnouncementTextColor("#ffffff");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #1e293b 50%, #ffffff 50%)" }}
                    title="Dark Slate"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#dc2626");
                      setAnnouncementTextColor("#ffffff");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #dc2626 50%, #ffffff 50%)" }}
                    title="Red Alert"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#0ea5e9");
                      setAnnouncementTextColor("#ffffff");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #0ea5e9 50%, #ffffff 50%)" }}
                    title="Sky Blue"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#16a34a");
                      setAnnouncementTextColor("#ffffff");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #16a34a 50%, #ffffff 50%)" }}
                    title="Green Success"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#f59e0b");
                      setAnnouncementTextColor("#000000");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #f59e0b 50%, #000000 50%)" }}
                    title="Amber Warning"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#a855f7");
                      setAnnouncementTextColor("#ffffff");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #a855f7 50%, #ffffff 50%)" }}
                    title="Purple"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#ec4899");
                      setAnnouncementTextColor("#ffffff");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #ec4899 50%, #ffffff 50%)" }}
                    title="Pink"
                  />
                  <button
                    onClick={() => {
                      setAnnouncementBgColor("#fef3c7");
                      setAnnouncementTextColor("#92400e");
                    }}
                    className="h-12 rounded-lg border-2 border-slate-200 hover:border-slate-900 transition-colors"
                    style={{ background: "linear-gradient(to right, #fef3c7 50%, #92400e 50%)" }}
                    title="Light Amber"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t">
                <Button onClick={handleSaveAnnouncementSettings} className="bg-slate-900 hover:bg-slate-800 text-white w-full">
                  <Save className="w-4 h-4 mr-2" />
                  Save Announcement Bar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance Settings</CardTitle>
              <p className="text-sm text-slate-600">Customize promotional content appearance</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image Upload */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Upload Image</Label>
                
                {appearanceImage ? (
                  <div className="relative">
                    <img 
                      src={appearanceImage} 
                      alt="Appearance preview" 
                      className="w-full h-64 object-cover rounded-lg border-2 border-slate-200"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2 bg-white"
                      onClick={() => setAppearanceImage(null)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-slate-400 transition-colors cursor-pointer">
                    <input
                      type="file"
                      id="appearance-image-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={isCompressing}
                    />
                    <label htmlFor="appearance-image-upload" className="cursor-pointer">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                          {isCompressing ? (
                            <div className="w-8 h-8 border-4 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Upload className="w-8 h-8 text-slate-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {isCompressing ? 'Compressing image...' : 'Click to upload image'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">PNG, JPG - Any size (will be compressed to 500KB)</p>
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Title Input */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Title</Label>
                <Input
                  type="text"
                  placeholder="Enter title for promotional content"
                  className="w-full"
                  value={appearanceTitle}
                  onChange={(e) => setAppearanceTitle(e.target.value)}
                />
              </div>

              {/* Paragraph Textarea */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Description</Label>
                <Textarea
                  placeholder="Enter detailed description for promotional content"
                  className="w-full min-h-[150px] resize-y"
                  rows={6}
                  value={appearanceDescription}
                  onChange={(e) => setAppearanceDescription(e.target.value)}
                />
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleSaveAppearanceSettings}
                  className="bg-slate-900 hover:bg-slate-800 text-white w-full"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Appearance Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} name="Clicks" />
                  <Line type="monotone" dataKey="conversions" stroke="#22c55e" strokeWidth={2} name="Conversions" />
                  <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} name="Revenue ($)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      outerRadius={80}
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

            {/* Creator Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Campaigns by Creator Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={creatorDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Performing Campaigns */}
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {campaigns
                  .filter(c => c.revenue && c.revenue > 0)
                  .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
                  .slice(0, 5)
                  .map((campaign, index) => (
                    <div key={campaign.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          #{index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{campaign.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <img src={campaign.creatorAvatar} alt={campaign.creator} className="w-4 h-4 rounded" />
                            <p className="text-xs text-slate-500">{campaign.creator}</p>
                            {getCreatorTypeBadge(campaign.creatorType)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">{campaign.revenue} MMK</p>
                        <p className="text-xs text-slate-500">{campaign.conversions} conversions</p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Campaign Details Dialog */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Campaign Details</DialogTitle>
            <DialogDescription>
              View complete campaign information and performance
            </DialogDescription>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-6">
              {/* Header */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">{selectedCampaign.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">{getTypeLabel(selectedCampaign.type)}</p>
                  </div>
                  {getStatusBadge(selectedCampaign.status)}
                </div>
                <div className="flex items-center gap-2">
                  <img src={selectedCampaign.creatorAvatar} alt={selectedCampaign.creator} className="w-8 h-8 rounded" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{selectedCampaign.creator}</p>
                    {getCreatorTypeBadge(selectedCampaign.creatorType)}
                  </div>
                </div>
              </div>

              {/* Campaign Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Start Date</p>
                  <p className="font-medium text-slate-900">{selectedCampaign.startDate}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">End Date</p>
                  <p className="font-medium text-slate-900">{selectedCampaign.endDate}</p>
                </div>
                {selectedCampaign.code && (
                  <div className="col-span-2">
                    <p className="text-sm text-slate-500 mb-2">Coupon Code</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-purple-50 border border-purple-200 rounded text-lg font-mono font-bold text-purple-600">
                        {selectedCampaign.code}
                      </code>
                      <Button variant="outline" onClick={() => copyCode(selectedCampaign.code!)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
                {selectedCampaign.discount && (
                  <div className="col-span-2">
                    <p className="text-sm text-slate-500 mb-1">Discount</p>
                    <p className="text-2xl font-bold text-green-600">
                      {selectedCampaign.discountType === "percentage" 
                        ? `${selectedCampaign.discount}% OFF` 
                        : `$${selectedCampaign.discount} OFF`}
                    </p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-sm text-slate-500 mb-1">Target Audience</p>
                  <p className="font-medium text-slate-900">{selectedCampaign.targetAudience}</p>
                </div>
              </div>

              {/* Push Notification Content */}
              {selectedCampaign.type === "push-notification" && selectedCampaign.title && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-2">{selectedCampaign.title}</p>
                  <p className="text-sm text-blue-700">{selectedCampaign.message}</p>
                </div>
              )}

              {/* Performance Stats */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Performance</h4>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCampaign.usageCount !== undefined && (
                    <Card className="p-4">
                      <p className="text-sm text-slate-500 mb-1">Usage</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {selectedCampaign.usageCount}/{selectedCampaign.usageLimit}
                      </p>
                      <div className="w-full bg-slate-200 h-2 rounded-full mt-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${((selectedCampaign.usageCount || 0) / (selectedCampaign.usageLimit || 1)) * 100}%` }}
                        />
                      </div>
                    </Card>
                  )}
                  {selectedCampaign.revenue !== undefined && (
                    <Card className="p-4">
                      <p className="text-sm text-slate-500 mb-1">Revenue Generated</p>
                      <p className="text-2xl font-bold text-green-600">${selectedCampaign.revenue.toLocaleString()}</p>
                    </Card>
                  )}
                  {selectedCampaign.clicks !== undefined && (
                    <Card className="p-4">
                      <p className="text-sm text-slate-500 mb-1">Total Clicks</p>
                      <p className="text-2xl font-bold text-slate-900">{selectedCampaign.clicks.toLocaleString()}</p>
                    </Card>
                  )}
                  {selectedCampaign.conversions !== undefined && (
                    <Card className="p-4">
                      <p className="text-sm text-slate-500 mb-1">Conversions</p>
                      <p className="text-2xl font-bold text-slate-900">{selectedCampaign.conversions.toLocaleString()}</p>
                    </Card>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => duplicateCampaign(selectedCampaign)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </Button>
                <Button>
                  <Send className="w-4 h-4 mr-2" />
                  Send Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}