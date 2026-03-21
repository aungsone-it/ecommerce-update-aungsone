import { useState } from "react";
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  FileText,
  Check,
  X,
  Clock,
  Eye,
  Search,
  Download,
  Users,
  Video,
  Instagram,
  Youtube,
  Hash,
  DollarSign,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
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
import { Separator } from "./ui/separator";

type ApplicationStatus = "pending" | "approved" | "rejected";

interface CollaboratorApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  niche: string;
  followers: {
    instagram?: number;
    youtube?: number;
    tiktok?: number;
  };
  socialHandles: {
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
  avgEngagementRate: number;
  previousBrands: string[];
  experienceYears: number;
  preferredProducts: string;
  description: string;
  requestedCommission: number;
  minStreamsPerMonth: number;
  appliedDate: string;
  status: ApplicationStatus;
  notes?: string;
  avatar: string;
  portfolioLink?: string;
  hasLiveStreamExperience: boolean;
}

const mockApplications: CollaboratorApplication[] = [
  {
    id: "1",
    fullName: "Jessica Williams",
    email: "jessica.williams@influencer.com",
    phone: "+1 (555) 123-4567",
    location: "Los Angeles, CA",
    niche: "Beauty & Skincare",
    followers: {
      instagram: 245000,
      youtube: 180000,
      tiktok: 320000
    },
    socialHandles: {
      instagram: "@jessicawbeauty",
      youtube: "JessicaWilliamsBeauty",
      tiktok: "@jesswilliams"
    },
    avgEngagementRate: 6.8,
    previousBrands: ["Sephora", "Glossier", "Fenty Beauty"],
    experienceYears: 4,
    preferredProducts: "Beauty, Skincare, Cosmetics, Wellness Products",
    description: "I'm a beauty influencer with 4 years of experience in product reviews and tutorials. I specialize in honest reviews and live demonstrations. My audience is primarily women aged 18-35 interested in affordable luxury beauty products.",
    requestedCommission: 15,
    minStreamsPerMonth: 8,
    appliedDate: "Feb 2, 2026",
    status: "pending",
    avatar: "JW",
    portfolioLink: "www.jessicawilliams.com/portfolio",
    hasLiveStreamExperience: true
  },
  {
    id: "2",
    fullName: "Marcus Johnson",
    email: "marcus.j@techreviews.com",
    phone: "+1 (555) 234-5678",
    location: "Austin, TX",
    niche: "Tech & Gadgets",
    followers: {
      instagram: 89000,
      youtube: 450000,
      tiktok: 125000
    },
    socialHandles: {
      instagram: "@marcustechreview",
      youtube: "MarcusJohnsonTech",
      tiktok: "@mjtech"
    },
    avgEngagementRate: 8.2,
    previousBrands: ["Best Buy", "Samsung", "Logitech", "Razer"],
    experienceYears: 5,
    preferredProducts: "Electronics, Gaming Gear, Smart Home Devices, Tech Accessories",
    description: "Tech enthusiast with 5+ years creating content. Known for detailed product breakdowns and live unboxing events. My audience trusts my recommendations for tech purchases.",
    requestedCommission: 12,
    minStreamsPerMonth: 6,
    appliedDate: "Feb 1, 2026",
    status: "pending",
    avatar: "MJ",
    portfolioLink: "www.marcusjohnsontech.com",
    hasLiveStreamExperience: true
  },
  {
    id: "3",
    fullName: "Lisa Chen",
    email: "lisa.chen@fashionista.com",
    phone: "+1 (555) 345-6789",
    location: "New York, NY",
    niche: "Fashion & Lifestyle",
    followers: {
      instagram: 567000,
      youtube: 234000,
      tiktok: 890000
    },
    socialHandles: {
      instagram: "@lisachenfashion",
      youtube: "LisaChenStyle",
      tiktok: "@lisachen"
    },
    avgEngagementRate: 7.5,
    previousBrands: ["Zara", "H&M", "Revolve", "Fashion Nova"],
    experienceYears: 6,
    preferredProducts: "Fashion, Accessories, Jewelry, Lifestyle Products",
    description: "Fashion influencer specializing in affordable style and trend forecasting. I host weekly live shopping events with high conversion rates. My followers love interactive try-on hauls.",
    requestedCommission: 18,
    minStreamsPerMonth: 10,
    appliedDate: "Jan 30, 2026",
    status: "pending",
    avatar: "LC",
    portfolioLink: "www.lisachenstyle.com",
    hasLiveStreamExperience: true
  },
  {
    id: "4",
    fullName: "Ryan Martinez",
    email: "ryan.m@fitnesslife.com",
    phone: "+1 (555) 456-7890",
    location: "Miami, FL",
    niche: "Fitness & Wellness",
    followers: {
      instagram: 312000,
      youtube: 156000,
      tiktok: 445000
    },
    socialHandles: {
      instagram: "@ryanfitlife",
      youtube: "RyanMartinezFitness",
      tiktok: "@ryanfitness"
    },
    avgEngagementRate: 9.1,
    previousBrands: ["Nike", "Gymshark", "MyProtein"],
    experienceYears: 3,
    preferredProducts: "Fitness Equipment, Supplements, Activewear, Health Products",
    description: "Certified personal trainer and fitness influencer. I create workout routines and product demos. Known for authentic reviews and high-energy live workout sessions with product showcases.",
    requestedCommission: 14,
    minStreamsPerMonth: 8,
    appliedDate: "Jan 28, 2026",
    status: "approved",
    avatar: "RM",
    portfolioLink: "www.ryanmartinezfitness.com",
    hasLiveStreamExperience: true,
    notes: "Excellent engagement rate and proven track record with fitness brands. Approved with 14% commission rate."
  },
  {
    id: "5",
    fullName: "Amanda Foster",
    email: "amanda.foster@homestyle.com",
    phone: "+1 (555) 567-8901",
    location: "Portland, OR",
    niche: "Home Decor & DIY",
    followers: {
      instagram: 178000,
      youtube: 290000,
      tiktok: 98000
    },
    socialHandles: {
      instagram: "@amandahomestyle",
      youtube: "AmandaFosterHome",
      tiktok: "@amandadiy"
    },
    avgEngagementRate: 5.8,
    previousBrands: ["Wayfair", "Target Home", "West Elm"],
    experienceYears: 2,
    preferredProducts: "Home Decor, Furniture, DIY Tools, Kitchen Gadgets",
    description: "Home decor enthusiast sharing budget-friendly styling tips and DIY projects. I love creating cozy spaces and sharing product finds with my community.",
    requestedCommission: 16,
    minStreamsPerMonth: 4,
    appliedDate: "Jan 25, 2026",
    status: "rejected",
    avatar: "AF",
    hasLiveStreamExperience: false,
    notes: "Limited live streaming experience. Engagement rate below threshold. Suggested to reapply after building more live stream portfolio."
  },
  {
    id: "6",
    fullName: "Daniel Park",
    email: "daniel.park@foodie.com",
    phone: "+1 (555) 678-9012",
    location: "San Francisco, CA",
    niche: "Food & Cooking",
    followers: {
      instagram: 423000,
      youtube: 678000,
      tiktok: 234000
    },
    socialHandles: {
      instagram: "@danielparkfood",
      youtube: "DanielParkCooks",
      tiktok: "@dpcooks"
    },
    avgEngagementRate: 8.9,
    previousBrands: ["HelloFresh", "Blue Apron", "Williams Sonoma"],
    experienceYears: 5,
    preferredProducts: "Kitchen Appliances, Cookware, Food Products, Kitchen Gadgets",
    description: "Professional chef turned content creator. I host live cooking shows and product demos. My audience loves interactive cooking sessions where I showcase kitchen products.",
    requestedCommission: 13,
    minStreamsPerMonth: 6,
    appliedDate: "Jan 27, 2026",
    status: "approved",
    avatar: "DP",
    portfolioLink: "www.danielparkcooks.com",
    hasLiveStreamExperience: true,
    notes: "Strong engagement and professional background. Perfect fit for kitchen and food-related products. Approved with 13% commission."
  }
];

interface CollaboratorApplicationsProps {
  onBack: () => void;
}

export function CollaboratorApplications({ onBack }: CollaboratorApplicationsProps) {
  const [applications, setApplications] = useState(mockApplications);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [viewingApplication, setViewingApplication] = useState<CollaboratorApplication | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewCommission, setReviewCommission] = useState("");

  const filteredApplications = applications.filter((app) => {
    const matchesSearch = 
      app.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.niche.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === "pending").length,
    approved: applications.filter(a => a.status === "approved").length,
    rejected: applications.filter(a => a.status === "rejected").length
  };

  const handleApprove = () => {
    if (viewingApplication) {
      setApplications(prev => 
        prev.map(app => 
          app.id === viewingApplication.id 
            ? { ...app, status: "approved" as ApplicationStatus, notes: reviewNotes }
            : app
        )
      );
      setIsReviewDialogOpen(false);
      setViewingApplication(null);
      setReviewNotes("");
      setReviewCommission("");
    }
  };

  const handleReject = () => {
    if (viewingApplication) {
      setApplications(prev => 
        prev.map(app => 
          app.id === viewingApplication.id 
            ? { ...app, status: "rejected" as ApplicationStatus, notes: reviewNotes }
            : app
        )
      );
      setIsReviewDialogOpen(false);
      setViewingApplication(null);
      setReviewNotes("");
      setReviewCommission("");
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const variants: Record<ApplicationStatus, { color: string; label: string; icon: any }> = {
      pending: { 
        color: "bg-yellow-100 text-yellow-700 border-yellow-200", 
        label: "Pending Review",
        icon: Clock
      },
      approved: { 
        color: "bg-green-100 text-green-700 border-green-200", 
        label: "Approved",
        icon: CheckCircle
      },
      rejected: { 
        color: "bg-red-100 text-red-700 border-red-200", 
        label: "Rejected",
        icon: XCircle
      }
    };
    const variant = variants[status];
    const Icon = variant.icon;
    return (
      <Badge className={`${variant.color} border text-xs flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {variant.label}
      </Badge>
    );
  };

  const getTotalFollowers = (followers: CollaboratorApplication['followers']) => {
    return (followers.instagram || 0) + (followers.youtube || 0) + (followers.tiktok || 0);
  };

  if (viewingApplication) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setViewingApplication(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Application Review</h1>
              <p className="text-sm text-slate-500 mt-1">Review collaborator application details</p>
            </div>
          </div>
          <div className="flex gap-2">
            {viewingApplication.status === "pending" && (
              <>
                <Button 
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setIsReviewDialogOpen(true);
                    setReviewNotes("");
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setIsReviewDialogOpen(true);
                    setReviewNotes("");
                    setReviewCommission(viewingApplication.requestedCommission.toString());
                  }}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Application Status Card */}
        <Card className={`p-5 border-2 ${
          viewingApplication.status === "pending" ? "border-yellow-200 bg-yellow-50" :
          viewingApplication.status === "approved" ? "border-green-200 bg-green-50" :
          "border-red-200 bg-red-50"
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                viewingApplication.status === "pending" ? "bg-yellow-100" :
                viewingApplication.status === "approved" ? "bg-green-100" :
                "bg-red-100"
              }`}>
                {viewingApplication.status === "pending" ? (
                  <Clock className="w-6 h-6 text-yellow-600" />
                ) : viewingApplication.status === "approved" ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <h3 className={`font-semibold mb-1 ${
                  viewingApplication.status === "pending" ? "text-yellow-900" :
                  viewingApplication.status === "approved" ? "text-green-900" :
                  "text-red-900"
                }`}>
                  Application Status: {viewingApplication.status === "pending" ? "Awaiting Review" : 
                    viewingApplication.status === "approved" ? "Approved" : "Rejected"}
                </h3>
                <p className={`text-sm ${
                  viewingApplication.status === "pending" ? "text-yellow-700" :
                  viewingApplication.status === "approved" ? "text-green-700" :
                  "text-red-700"
                }`}>
                  {viewingApplication.status === "pending" 
                    ? "This application requires your review and decision." 
                    : viewingApplication.status === "approved"
                    ? "This collaborator has been approved and can start creating content."
                    : "This application has been rejected."}
                </p>
                {viewingApplication.notes && (
                  <p className={`text-sm mt-2 ${
                    viewingApplication.status === "pending" ? "text-yellow-700" :
                    viewingApplication.status === "approved" ? "text-green-700" :
                    "text-red-700"
                  }`}>
                    <strong>Notes:</strong> {viewingApplication.notes}
                  </p>
                )}
              </div>
            </div>
            {getStatusBadge(viewingApplication.status)}
          </div>
        </Card>

        {/* Applicant Info Card */}
        <Card className="p-6 border border-slate-200">
          <div className="flex items-start gap-6 mb-6">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
              <img
                src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${viewingApplication.fullName}`}
                alt={viewingApplication.fullName}
                className="w-full h-full"
              />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-1">{viewingApplication.fullName}</h2>
                  <p className="text-slate-600 mb-3">{viewingApplication.niche} Influencer</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-4 h-4" />
                      <span>{viewingApplication.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-4 h-4" />
                      <span>{viewingApplication.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4" />
                      <span>{viewingApplication.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar className="w-4 h-4" />
                      <span>Applied {viewingApplication.appliedDate}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Social Media Stats */}
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Social Media Reach
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4 border border-slate-200 bg-gradient-to-br from-purple-50 to-purple-100/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-purple-700">Total Followers</p>
                  <Users className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-2xl font-bold text-purple-900">
                  {(getTotalFollowers(viewingApplication.followers) / 1000).toFixed(0)}K
                </p>
              </Card>

              {viewingApplication.followers.instagram && (
                <Card className="p-4 border border-slate-200 bg-gradient-to-br from-pink-50 to-pink-100/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-pink-700">Instagram</p>
                    <Instagram className="w-4 h-4 text-pink-600" />
                  </div>
                  <p className="text-2xl font-bold text-pink-900">
                    {(viewingApplication.followers.instagram / 1000).toFixed(0)}K
                  </p>
                  <p className="text-xs text-pink-700 mt-1">{viewingApplication.socialHandles.instagram}</p>
                </Card>
              )}

              {viewingApplication.followers.youtube && (
                <Card className="p-4 border border-slate-200 bg-gradient-to-br from-red-50 to-red-100/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-red-700">YouTube</p>
                    <Youtube className="w-4 h-4 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-red-900">
                    {(viewingApplication.followers.youtube / 1000).toFixed(0)}K
                  </p>
                  <p className="text-xs text-red-700 mt-1">{viewingApplication.socialHandles.youtube}</p>
                </Card>
              )}

              {viewingApplication.followers.tiktok && (
                <Card className="p-4 border border-slate-200 bg-gradient-to-br from-cyan-50 to-cyan-100/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-cyan-700">TikTok</p>
                    <Hash className="w-4 h-4 text-cyan-600" />
                  </div>
                  <p className="text-2xl font-bold text-cyan-900">
                    {(viewingApplication.followers.tiktok / 1000).toFixed(0)}K
                  </p>
                  <p className="text-xs text-cyan-700 mt-1">{viewingApplication.socialHandles.tiktok}</p>
                </Card>
              )}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Performance Metrics */}
          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Metrics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600">Avg Engagement Rate</p>
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-2xl font-semibold text-slate-900">{viewingApplication.avgEngagementRate}%</p>
                <p className="text-xs text-slate-500 mt-1">Industry standard: 3-5%</p>
              </Card>

              <Card className="p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600">Experience</p>
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-2xl font-semibold text-slate-900">{viewingApplication.experienceYears} Years</p>
                <p className="text-xs text-slate-500 mt-1">Content creation experience</p>
              </Card>

              <Card className="p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600">Live Stream Experience</p>
                  <Video className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-2xl font-semibold text-slate-900">
                  {viewingApplication.hasLiveStreamExperience ? "Yes" : "No"}
                </p>
                <p className="text-xs text-slate-500 mt-1">Prior live streaming</p>
              </Card>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Application Details */}
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-slate-900 mb-4">Application Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-slate-600">Requested Commission</Label>
                  <p className="text-lg font-semibold text-slate-900 mt-1 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {viewingApplication.requestedCommission}% per sale
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600">Minimum Streams/Month</Label>
                  <p className="text-lg font-semibold text-slate-900 mt-1 flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    {viewingApplication.minStreamsPerMonth} live streams
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600">Niche/Category</Label>
                  <p className="text-lg font-semibold text-slate-900 mt-1">{viewingApplication.niche}</p>
                </div>
                {viewingApplication.portfolioLink && (
                  <div>
                    <Label className="text-sm text-slate-600">Portfolio Link</Label>
                    <a 
                      href={`https://${viewingApplication.portfolioLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-semibold text-blue-600 hover:underline mt-1 block"
                    >
                      {viewingApplication.portfolioLink}
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Preferred Products</Label>
              <p className="text-slate-900 mt-1">{viewingApplication.preferredProducts}</p>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Previous Brand Collaborations</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {viewingApplication.previousBrands.map((brand, index) => (
                  <Badge key={index} className="bg-blue-100 text-blue-700 border-blue-200 border">
                    {brand}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm text-slate-600">About / Description</Label>
              <Card className="p-4 border border-slate-200 bg-slate-50 mt-2">
                <p className="text-slate-900">{viewingApplication.description}</p>
              </Card>
            </div>
          </div>
        </Card>

        {/* Review Dialog */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review Application</DialogTitle>
              <DialogDescription>
                {reviewCommission ? "Approve this collaborator application" : "Reject this collaborator application"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {reviewCommission && (
                <div>
                  <Label>Commission Rate (%)</Label>
                  <Input
                    type="number"
                    value={reviewCommission}
                    onChange={(e) => setReviewCommission(e.target.value)}
                    placeholder="Enter commission rate"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Requested: {viewingApplication.requestedCommission}%
                  </p>
                </div>
              )}
              <div>
                <Label>Notes / Comments</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={reviewCommission ? "Add any notes or special terms..." : "Provide reason for rejection..."}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                Cancel
              </Button>
              {reviewCommission ? (
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove}>
                  <Check className="w-4 h-4 mr-2" />
                  Approve Application
                </Button>
              ) : (
                <Button 
                  className="bg-red-600 hover:bg-red-700"
                  onClick={handleReject}
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject Application
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Collaborator Applications</h1>
            <p className="text-sm text-slate-500 mt-1">Review and manage influencer applications</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Applications</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Pending Review</p>
              <p className="text-2xl font-semibold text-yellow-600 mt-1">{stats.pending}</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Approved</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">{stats.approved}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Rejected</p>
              <p className="text-2xl font-semibold text-red-600 mt-1">{stats.rejected}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <X className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or niche..."
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Applications List */}
      <div className="space-y-3">
        {filteredApplications.map((application) => (
          <Card 
            key={application.id} 
            className="p-5 border border-slate-200 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setViewingApplication(application)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  <img
                    src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${application.fullName}`}
                    alt={application.fullName}
                    className="w-full h-full"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{application.fullName}</h3>
                      <p className="text-sm text-slate-600">{application.niche} Influencer</p>
                    </div>
                    {getStatusBadge(application.status)}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-slate-500">Total Followers</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {(getTotalFollowers(application.followers) / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Engagement Rate</p>
                      <p className="text-sm font-semibold text-slate-900">{application.avgEngagementRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Commission</p>
                      <p className="text-sm font-semibold text-slate-900">{application.requestedCommission}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Streams/Month</p>
                      <p className="text-sm font-semibold text-slate-900">{application.minStreamsPerMonth}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Applied</p>
                      <p className="text-sm font-semibold text-slate-900">{application.appliedDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      <span>{application.email}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{application.location}</span>
                    </div>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <Eye className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {filteredApplications.length === 0 && (
        <Card className="p-12 border border-slate-200 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No applications found matching your criteria</p>
        </Card>
      )}
    </div>
  );
}
