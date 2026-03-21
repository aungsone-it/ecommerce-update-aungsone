import { useState } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  TrendingUp,
  Package,
  DollarSign,
  Edit,
  MoreVertical,
  Download,
  Eye,
  Users,
  Video,
  Radio,
  Circle,
  Play,
  Clock,
  MessageCircle,
  Heart,
  Share2,
  ThumbsUp,
  TrendingDown,
  Tv,
  Instagram,
  Youtube,
  Hash,
  FileText,
  CheckCircle,
  AlertCircle,
  Tag,
  BarChart3,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
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
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Separator } from "./ui/separator";

type CollaboratorStatus = "active" | "inactive" | "pending";
type StreamStatus = "live" | "scheduled" | "offline";

interface Collaborator {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: CollaboratorStatus;
  streamStatus: StreamStatus;
  followers: number;
  totalStreams: number;
  totalRevenue: number;
  avgViewers: number;
  commission: number;
  joinedDate: string;
  avatar: string;
  description?: string;
  socialMedia?: {
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
}

interface LiveStream {
  id: string;
  title: string;
  status: "live" | "scheduled" | "ended";
  startTime: string;
  endTime?: string;
  duration: string;
  viewers: number;
  peakViewers: number;
  likes: number;
  comments: number;
  shares: number;
  sales: number;
  revenue: number;
  products: number;
  thumbnail: string;
}

interface CollaboratorProfileProps {
  collaborator: Collaborator;
  onBack: () => void;
  onEdit: (collaborator: Collaborator) => void;
}

export function CollaboratorProfile({ collaborator, onBack, onEdit }: CollaboratorProfileProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "streams" | "analytics" | "contract" | "campaigns">("overview");
  const [timeFilter, setTimeFilter] = useState("30days");

  // Mock live streams data
  const mockStreams: LiveStream[] = [
    {
      id: "1",
      title: "Valentine's Day Beauty Haul - Live Shopping Event!",
      status: "live",
      startTime: "Feb 4, 2026 2:00 PM",
      duration: "1h 23m",
      viewers: 3284,
      peakViewers: 4521,
      likes: 1247,
      comments: 892,
      shares: 156,
      sales: 47,
      revenue: 8940,
      products: 12,
      thumbnail: "🎥"
    },
    {
      id: "2",
      title: "New Tech Gadgets Unboxing & Review",
      status: "scheduled",
      startTime: "Feb 5, 2026 6:00 PM",
      duration: "2h 0m",
      viewers: 0,
      peakViewers: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      sales: 0,
      revenue: 0,
      products: 8,
      thumbnail: "📦"
    },
    {
      id: "3",
      title: "Weekend Flash Sale - Up to 50% Off!",
      status: "ended",
      startTime: "Feb 1, 2026 3:00 PM",
      endTime: "Feb 1, 2026 5:30 PM",
      duration: "2h 30m",
      viewers: 5892,
      peakViewers: 7234,
      likes: 2341,
      comments: 1567,
      shares: 289,
      sales: 103,
      revenue: 15680,
      products: 15,
      thumbnail: "🛍️"
    },
    {
      id: "4",
      title: "Morning Skincare Routine & Product Demo",
      status: "ended",
      startTime: "Jan 28, 2026 10:00 AM",
      endTime: "Jan 28, 2026 11:45 AM",
      duration: "1h 45m",
      viewers: 2456,
      peakViewers: 3128,
      likes: 1089,
      comments: 674,
      shares: 123,
      sales: 34,
      revenue: 6720,
      products: 9,
      thumbnail: "✨"
    },
    {
      id: "5",
      title: "Spring Fashion Try-On Haul",
      status: "scheduled",
      startTime: "Feb 8, 2026 4:00 PM",
      duration: "1h 30m",
      viewers: 0,
      peakViewers: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      sales: 0,
      revenue: 0,
      products: 20,
      thumbnail: "👗"
    }
  ];

  // Mock products promoted by collaborator
  const mockProducts = [
    {
      id: "1",
      name: "Luxury Moisturizer Set",
      category: "Beauty",
      price: 89.99,
      sold: 234,
      revenue: 21057.66,
      commission: 2526.92,
      image: "💄"
    },
    {
      id: "2",
      name: "Wireless Earbuds Pro",
      category: "Electronics",
      price: 149.99,
      sold: 156,
      revenue: 23398.44,
      commission: 2807.81,
      image: "🎧"
    },
    {
      id: "3",
      name: "Yoga Mat Premium",
      category: "Fitness",
      price: 54.99,
      sold: 189,
      revenue: 10392.11,
      commission: 1247.05,
      image: "🧘"
    },
    {
      id: "4",
      name: "LED Ring Light",
      category: "Photography",
      price: 79.99,
      sold: 98,
      revenue: 7839.02,
      commission: 940.68,
      image: "💡"
    }
  ];

  const getStatusBadge = (status: CollaboratorStatus) => {
    const variants: Record<CollaboratorStatus, { color: string; label: string }> = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: "Active" },
      inactive: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Inactive" },
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending" },
    };
    const variant = variants[status];
    return (
      <Badge className={`${variant.color} border`}>
        {variant.label}
      </Badge>
    );
  };

  const getStreamStatusBadge = (status: "live" | "scheduled" | "ended") => {
    if (status === "live") {
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 border animate-pulse">
          <Circle className="w-2 h-2 mr-1 fill-red-600" />
          Live Now
        </Badge>
      );
    } else if (status === "scheduled") {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">
          <Clock className="w-3 h-3 mr-1" />
          Scheduled
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 border">
        Ended
      </Badge>
    );
  };

  const liveStreams = mockStreams.filter(s => s.status === "live");
  const scheduledStreams = mockStreams.filter(s => s.status === "scheduled");
  const pastStreams = mockStreams.filter(s => s.status === "ended");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Collaborator Profile</h1>
            <p className="text-sm text-slate-500 mt-1">View influencer details and live stream analytics</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onEdit(collaborator)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Collaborator Info Card */}
      <Card className="p-6 border border-slate-200">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
            <img
              src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${collaborator.name}`}
              alt={collaborator.name}
              className="w-full h-full"
            />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-semibold text-slate-900">{collaborator.name}</h2>
                  {getStatusBadge(collaborator.status)}
                  {collaborator.streamStatus === "live" && (
                    <Badge className="bg-red-100 text-red-700 border-red-200 border animate-pulse">
                      <Circle className="w-2 h-2 mr-1 fill-red-600" />
                      Live Now
                    </Badge>
                  )}
                </div>
                <p className="text-slate-600 mb-4">{collaborator.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="w-4 h-4" />
                    <span>{collaborator.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="w-4 h-4" />
                    <span>{collaborator.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="w-4 h-4" />
                    <span>{collaborator.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" />
                    <span>Joined {collaborator.joinedDate}</span>
                  </div>
                </div>
                {collaborator.socialMedia && (
                  <div className="flex items-center gap-4 mt-4">
                    {collaborator.socialMedia.instagram && (
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Instagram className="w-4 h-4" />
                        <span>{collaborator.socialMedia.instagram}</span>
                      </div>
                    )}
                    {collaborator.socialMedia.youtube && (
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Youtube className="w-4 h-4" />
                        <span>{collaborator.socialMedia.youtube}</span>
                      </div>
                    )}
                    {collaborator.socialMedia.tiktok && (
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Hash className="w-4 h-4" />
                        <span>{collaborator.socialMedia.tiktok}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Revenue</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">${collaborator.totalRevenue.toLocaleString()}</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-xs text-green-600">+15.2%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Streams</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{collaborator.totalStreams}</p>
              <p className="text-xs text-slate-500 mt-1">All time</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Followers</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {(collaborator.followers / 1000).toFixed(0)}K
              </p>
              <p className="text-xs text-slate-500 mt-1">Social reach</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Avg Viewers</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {collaborator.avgViewers.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">Per stream</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Eye className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Commission Rate</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{collaborator.commission}%</p>
              <p className="text-xs text-slate-500 mt-1">Per sale</p>
            </div>
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-pink-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex gap-6 px-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "products"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Products
            </button>
            <button
              onClick={() => setActiveTab("streams")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "streams"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Live Streams ({mockStreams.length})
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "analytics"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("contract")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "contract"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Contract
            </button>
            <button
              onClick={() => setActiveTab("campaigns")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "campaigns"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Campaigns
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Live Stream Status */}
              {liveStreams.length > 0 && (
                <Card className="p-5 border-2 border-red-200 bg-red-50">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse">
                        <Radio className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-red-900 mb-1">Currently Live</h3>
                        <p className="text-sm text-red-700">{liveStreams[0].title}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1 text-sm text-red-700">
                            <Eye className="w-4 h-4" />
                            <span>{liveStreams[0].viewers.toLocaleString()} watching</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-red-700">
                            <Heart className="w-4 h-4" />
                            <span>{liveStreams[0].likes.toLocaleString()} likes</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-red-700">
                            <DollarSign className="w-4 h-4" />
                            <span>${liveStreams[0].revenue.toLocaleString()} sales</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button className="bg-red-600 hover:bg-red-700">
                      <Tv className="w-4 h-4 mr-2" />
                      Watch Live
                    </Button>
                  </div>
                </Card>
              )}

              {/* Performance Metrics */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-slate-600">Total Products Promoted</p>
                      <Package className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-2xl font-semibold text-slate-900 mb-1">{mockProducts.length}</p>
                    <p className="text-sm text-slate-500">Active products</p>
                  </Card>

                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-slate-600">Total Sales Generated</p>
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-2xl font-semibold text-slate-900 mb-1">
                      {mockProducts.reduce((sum, p) => sum + p.sold, 0)}
                    </p>
                    <p className="text-sm text-slate-500">Units sold</p>
                  </Card>

                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-slate-600">Commission Earned</p>
                      <DollarSign className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-2xl font-semibold text-slate-900 mb-1">
                      ${mockProducts.reduce((sum, p) => sum + p.commission, 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-500">Total earnings</p>
                  </Card>
                </div>
              </div>

              <Separator />

              {/* Upcoming Streams */}
              {scheduledStreams.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Upcoming Streams</h3>
                  <div className="space-y-3">
                    {scheduledStreams.map((stream) => (
                      <Card key={stream.id} className="p-4 border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                              {stream.thumbnail}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{stream.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-sm text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{stream.startTime}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  <span>{stream.products} products</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {getStreamStatusBadge(stream.status)}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Products Tab */}
          {activeTab === "products" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Promoted Products</h3>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Product</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Category</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Price</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Units Sold</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Revenue</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockProducts.map((product) => (
                      <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-2xl">
                              {product.image}
                            </div>
                            <span className="font-medium text-slate-900">{product.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-slate-600">{product.category}</td>
                        <td className="p-3 text-sm font-medium text-slate-900">${product.price}</td>
                        <td className="p-3 text-sm font-medium text-slate-900">{product.sold}</td>
                        <td className="p-3 text-sm font-semibold text-slate-900">${product.revenue.toLocaleString()}</td>
                        <td className="p-3 text-sm font-semibold text-green-600">${product.commission.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Live Streams Tab */}
          {activeTab === "streams" && (
            <div className="space-y-6">
              {/* Live Now */}
              {liveStreams.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Circle className="w-3 h-3 fill-red-600 text-red-600 animate-pulse" />
                    Live Now
                  </h3>
                  <div className="space-y-3">
                    {liveStreams.map((stream) => (
                      <Card key={stream.id} className="p-5 border-2 border-red-200 bg-red-50">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
                              {stream.thumbnail}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-red-900">{stream.title}</h4>
                                {getStreamStatusBadge(stream.status)}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                                <div>
                                  <p className="text-xs text-red-600">Current Viewers</p>
                                  <p className="font-semibold text-red-900">{stream.viewers.toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-red-600">Peak Viewers</p>
                                  <p className="font-semibold text-red-900">{stream.peakViewers.toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-red-600">Sales Made</p>
                                  <p className="font-semibold text-green-700">{stream.sales} (${stream.revenue.toLocaleString()})</p>
                                </div>
                                <div>
                                  <p className="text-xs text-red-600">Duration</p>
                                  <p className="font-semibold text-red-900">{stream.duration}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1 text-sm text-red-700">
                                  <Heart className="w-4 h-4" />
                                  <span>{stream.likes.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm text-red-700">
                                  <MessageCircle className="w-4 h-4" />
                                  <span>{stream.comments.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm text-red-700">
                                  <Share2 className="w-4 h-4" />
                                  <span>{stream.shares}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button className="bg-red-600 hover:bg-red-700">
                            <Tv className="w-4 h-4 mr-2" />
                            Watch Live
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Scheduled Streams */}
              {scheduledStreams.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Scheduled Streams</h3>
                  <div className="space-y-3">
                    {scheduledStreams.map((stream) => (
                      <Card key={stream.id} className="p-5 border border-slate-200">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center text-3xl">
                              {stream.thumbnail}
                            </div>
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-slate-900">{stream.title}</h4>
                                {getStreamStatusBadge(stream.status)}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>{stream.startTime}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Package className="w-4 h-4" />
                                  <span>{stream.products} products featured</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button variant="outline">
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Stream
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Past Streams */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Stream History</h3>
                <div className="space-y-3">
                  {pastStreams.map((stream) => (
                    <Card key={stream.id} className="p-5 border border-slate-200 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-3xl">
                            {stream.thumbnail}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-slate-900">{stream.title}</h4>
                              {getStreamStatusBadge(stream.status)}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <p className="text-xs text-slate-500">Date</p>
                                <p className="text-sm font-medium text-slate-900">{stream.startTime}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Duration</p>
                                <p className="text-sm font-medium text-slate-900">{stream.duration}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Peak Viewers</p>
                                <p className="text-sm font-medium text-slate-900">{stream.peakViewers.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Engagement</p>
                                <p className="text-sm font-medium text-slate-900">{stream.likes + stream.comments + stream.shares}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Sales</p>
                                <p className="text-sm font-semibold text-green-600">${stream.revenue.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Play className="w-4 h-4 mr-2" />
                              View Recording
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <BarChart3 className="w-4 h-4 mr-2" />
                              View Analytics
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="w-4 h-4 mr-2" />
                              Export Data
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Engagement Analytics</h3>
                <Select value={timeFilter} onValueChange={setTimeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                    <SelectItem value="90days">Last 90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Engagement Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Total Views</p>
                    <Eye className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mb-1">
                    {mockStreams.reduce((sum, s) => sum + s.viewers, 0).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600">+23% vs last period</span>
                  </div>
                </Card>

                <Card className="p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Total Likes</p>
                    <Heart className="w-4 h-4 text-red-600" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mb-1">
                    {mockStreams.reduce((sum, s) => sum + s.likes, 0).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600">+18% vs last period</span>
                  </div>
                </Card>

                <Card className="p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Total Comments</p>
                    <MessageCircle className="w-4 h-4 text-purple-600" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mb-1">
                    {mockStreams.reduce((sum, s) => sum + s.comments, 0).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600">+31% vs last period</span>
                  </div>
                </Card>

                <Card className="p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Total Shares</p>
                    <Share2 className="w-4 h-4 text-orange-600" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mb-1">
                    {mockStreams.reduce((sum, s) => sum + s.shares, 0).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600">+12% vs last period</span>
                  </div>
                </Card>
              </div>

              <Separator />

              {/* Conversion Metrics */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Conversion Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-5 border border-slate-200 bg-gradient-to-br from-green-50 to-green-100/50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-green-700">Conversion Rate</p>
                      <ThumbsUp className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-3xl font-bold text-green-900 mb-1">4.8%</p>
                    <p className="text-sm text-green-700">Viewers to buyers</p>
                  </Card>

                  <Card className="p-5 border border-slate-200 bg-gradient-to-br from-blue-50 to-blue-100/50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-blue-700">Avg Order Value</p>
                      <DollarSign className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-3xl font-bold text-blue-900 mb-1">$156</p>
                    <p className="text-sm text-blue-700">Per transaction</p>
                  </Card>

                  <Card className="p-5 border border-slate-200 bg-gradient-to-br from-purple-50 to-purple-100/50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-purple-700">Engagement Rate</p>
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-3xl font-bold text-purple-900 mb-1">68%</p>
                    <p className="text-sm text-purple-700">Interaction rate</p>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* Contract Tab */}
          {activeTab === "contract" && (
            <div className="space-y-6">
              <Card className="p-5 border-2 border-green-200 bg-green-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-900 mb-1">Active Contract</h3>
                      <p className="text-sm text-green-700">This collaborator has an active partnership contract.</p>
                    </div>
                  </div>
                  <Badge className="bg-green-600 text-white border-green-600">Active</Badge>
                </div>
              </Card>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Contract Overview</h3>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download Contract
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Contract Type</p>
                        <p className="font-semibold text-slate-900">Influencer Partnership</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">Commission-based live streaming agreement</p>
                  </Card>

                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Commission Rate</p>
                        <p className="font-semibold text-slate-900">{collaborator.commission}%</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">Earned per sale during live streams</p>
                  </Card>

                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Contract Start Date</p>
                        <p className="font-semibold text-slate-900">{collaborator.joinedDate}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">Partnership activation date</p>
                  </Card>

                  <Card className="p-5 border border-slate-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Contract Duration</p>
                        <p className="font-semibold text-slate-900">12 Months</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">Auto-renews unless terminated</p>
                  </Card>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Live Streaming Terms</h3>
                <Card className="p-6 border border-slate-200 bg-slate-50">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Minimum Stream Requirements</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Collaborator must conduct at least 4 live streams per month with minimum 1 hour duration each.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Product Promotion Guidelines</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Must feature approved products only. All promotional claims must be accurate and verified.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Content Standards</p>
                        <p className="text-sm text-slate-600 mt-1">
                          All live streams must comply with platform community guidelines and maintain professional conduct.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Payment Terms</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Commission paid monthly on 15th for previous month's sales. Minimum payout threshold: $100.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Exclusivity Clause</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Non-exclusive agreement. Collaborator may work with other platforms but cannot promote competing products during streams.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Termination Clause</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Either party may terminate with 30 days notice. Immediate termination for policy violations.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Campaigns Tab */}
          {activeTab === "campaigns" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Active Campaigns</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">3</p>
                    </div>
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Tag className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Campaign Revenue</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">$45K</p>
                    </div>
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Total Reach</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">2.4M</p>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Engagement Rate</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">8.5%</p>
                    </div>
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-orange-600" />
                    </div>
                  </div>
                </Card>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Promotional Campaigns</h3>
                  <Button size="sm">
                    <Tag className="w-4 h-4 mr-2" />
                    Create Campaign
                  </Button>
                </div>
                <Card className="p-6 border border-slate-200">
                  <div className="text-center py-12">
                    <Tag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">Campaign management features coming soon</p>
                    <p className="text-sm text-slate-400 mt-2">Track and manage influencer campaigns</p>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
