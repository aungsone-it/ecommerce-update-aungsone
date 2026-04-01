import { useState, useEffect } from "react";
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
  Filter,
  Download,
  Building2,
  Globe,
  CreditCard,
  Package,
  Loader2
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
import { Separator } from "./ui/separator";
import { vendorApplicationsApi } from "../../utils/api";
import { toast } from "sonner";
import { VendorApplicationReview } from "./VendorApplicationReview";

type ApplicationStatus = "pending" | "approved" | "rejected";

interface VendorApplication {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  location: string;
  website?: string;
  businessType: string;
  taxId: string;
  description: string;
  productsCategory: string;
  estimatedProducts: number;
  appliedDate: string;
  status: ApplicationStatus;
  notes?: string;
  avatar: string;
  files?: {
    businessLicense?: {
      name: string;
      type: string;
      data: string;
    };
    idDocument?: {
      name: string;
      type: string;
      data: string;
    };
  };
}

interface VendorApplicationsProps {
  onBack?: () => void;
  onNavigateToVendorList?: () => void;
  /** Approve/reject succeeded — refresh vendor list cache badges, etc. */
  onApplicationsMutated?: () => void;
}

export function VendorApplications({
  onBack,
  onNavigateToVendorList,
  onApplicationsMutated,
}: VendorApplicationsProps) {
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [reviewingApplication, setReviewingApplication] = useState<VendorApplication | null>(null);

  // 🔥 Fetch applications from backend
  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      
      // Add timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout
      
      const response = await vendorApplicationsApi.getAll();
      clearTimeout(timeoutId);
      
      if (response.success && response.data) {
        // Map backend response to component format
        const mappedApplications = response.data.map((app: any) => ({
          id: app.id,
          businessName: app.companyName || app.businessName || "Unknown",
          contactName: app.contactName || "N/A",
          email: app.email,
          phone: app.phone,
          location: app.city && app.country ? `${app.city}, ${app.country}` : app.address || "N/A",
          website: app.website,
          businessType: app.businessType,
          taxId: app.registrationNumber || app.taxId || "N/A",
          description: app.storeDescription || app.description || "No description provided",
          productsCategory: app.categories?.join(", ") || "General",
          estimatedProducts: parseInt(app.estimatedProducts) || 0,
          appliedDate: new Date(app.submittedAt || app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          status: app.status,
          notes: app.reviewNotes,
          avatar: (app.companyName || app.businessName)?.substring(0, 2).toUpperCase() || "VN",
          files: app.files // Include files data for viewing/downloading
        }));
        
        setApplications(mappedApplications);
        console.log(`✅ Loaded ${mappedApplications.length} vendor applications`);
      } else {
        console.warn("⚠️ No vendor applications found");
        setApplications([]);
      }
    } catch (error: any) {
      console.error("Failed to load vendor applications:", error);
      
      // Don't show error toast for timeout - just log it
      if (error.name !== 'AbortError') {
        toast.error("Failed to load applications");
      } else {
        console.warn("⏱️ Vendor applications request timed out - using empty list");
      }
      
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredApplications = applications.filter(app => {
    const matchesSearch = app.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         app.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         app.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: ApplicationStatus) => {
    const variants: Record<ApplicationStatus, { color: string; label: string; icon: any }> = {
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending Review", icon: Clock },
      approved: { color: "bg-green-100 text-green-700 border-green-200", label: "Approved", icon: Check },
      rejected: { color: "bg-red-100 text-red-700 border-red-200", label: "Rejected", icon: X },
    };
    const variant = variants[status];
    const Icon = variant.icon;
    return (
      <Badge className={`${variant.color} border flex items-center gap-1 w-fit`}>
        <Icon className="w-3 h-3" />
        {variant.label}
      </Badge>
    );
  };

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === "pending").length,
    approved: applications.filter(a => a.status === "approved").length,
    rejected: applications.filter(a => a.status === "rejected").length,
  };

  // 🔥 If reviewing an application, show the review page
  if (reviewingApplication) {
    return (
      <VendorApplicationReview 
        application={reviewingApplication}
        onBack={() => setReviewingApplication(null)}
        onUpdate={loadApplications}
        onNavigateToVendorList={onNavigateToVendorList}
        onApplicationsMutated={onApplicationsMutated}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack ? (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          ) : (
            <div className="w-10 shrink-0" aria-hidden />
          )}
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Vendor Applications</h1>
            <p className="text-sm text-slate-500 mt-1">Review and manage vendor partnership requests</p>
          </div>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Applications
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Applications</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-slate-600" />
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
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by business name, contact, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ApplicationStatus | "all")}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Applications</SelectItem>
              <SelectItem value="pending">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Applications List */}
      <div className="space-y-4">
        {loading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border border-slate-200">
                <div className="p-6">
                  <div className="flex items-start gap-4 animate-pulse">
                    <div className="w-14 h-14 rounded-xl bg-slate-200 flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-6 bg-slate-200 rounded w-1/3" />
                      <div className="h-4 bg-slate-200 rounded w-2/3" />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="h-4 bg-slate-200 rounded" />
                        <div className="h-4 bg-slate-200 rounded" />
                        <div className="h-4 bg-slate-200 rounded" />
                        <div className="h-4 bg-slate-200 rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-6 bg-slate-200 rounded w-20" />
                        <div className="h-6 bg-slate-200 rounded w-24" />
                        <div className="h-6 bg-slate-200 rounded w-28" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="h-6 bg-slate-200 rounded w-28" />
                      <div className="flex gap-2">
                        <div className="h-8 bg-slate-200 rounded w-20" />
                        <div className="h-8 bg-slate-200 rounded w-20" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {filteredApplications.map((application) => (
              <Card key={application.id} className="border border-slate-200 hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                        <img 
                          src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${application.businessName}`}
                          alt={application.businessName}
                          className="w-full h-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">{application.businessName}</h3>
                            <p className="text-sm text-slate-600 mb-3">{application.description}</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Mail className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{application.email}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone className="w-4 h-4 flex-shrink-0" />
                                <span>{application.phone}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                <span>{application.location}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Calendar className="w-4 h-4 flex-shrink-0" />
                                <span>{application.appliedDate}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 text-sm">
                              <Badge variant="outline" className="bg-slate-50">
                                {application.productsCategory}
                              </Badge>
                              <Badge variant="outline" className="bg-slate-50">
                                ~{application.estimatedProducts} Products
                              </Badge>
                              <Badge variant="outline" className="bg-slate-50">
                                {application.businessType}
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-3">
                            {getStatusBadge(application.status)}
                            
                            {application.status === "pending" ? (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setReviewingApplication(application)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Review
                              </Button>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setReviewingApplication(application)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View Details
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {application.notes && (
                    <>
                      <Separator className="my-3" />
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-xs font-semibold text-slate-600 uppercase mb-1">Review Notes</p>
                        <p className="text-sm text-slate-700">{application.notes}</p>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      {!loading && filteredApplications.length === 0 && (
        <Card className="p-12 text-center border border-slate-200">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No applications found</h3>
          <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
        </Card>
      )}
    </div>
  );
}