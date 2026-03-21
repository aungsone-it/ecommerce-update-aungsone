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
  Download,
  Building2,
  Globe,
  CreditCard,
  Package,
  Percent,
  Image as ImageIcon,
  ExternalLink
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { vendorApplicationsApi } from "../../utils/api";
import { toast } from "sonner";

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
  requestedCommission: number;
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

interface VendorApplicationReviewProps {
  application: VendorApplication;
  onBack: () => void;
  onUpdate: () => void;
  onNavigateToVendorList?: () => void;
}

export function VendorApplicationReview({ application, onBack, onUpdate, onNavigateToVendorList }: VendorApplicationReviewProps) {
  const [reviewNotes, setReviewNotes] = useState(application.notes || "");
  const [updating, setUpdating] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);

  const getStatusBadge = (status: ApplicationStatus) => {
    const variants: Record<ApplicationStatus, { color: string; label: string; icon: any }> = {
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending Review", icon: Clock },
      approved: { color: "bg-green-100 text-green-700 border-green-200", label: "Approved", icon: Check },
      rejected: { color: "bg-red-100 text-red-700 border-red-200", label: "Rejected", icon: X },
    };
    const variant = variants[status];
    const Icon = variant.icon;
    return (
      <Badge className={`${variant.color} border flex items-center gap-1 w-fit text-sm px-3 py-1.5`}>
        <Icon className="w-4 h-4" />
        {variant.label}
      </Badge>
    );
  };

  const handleUpdateStatus = async (newStatus: ApplicationStatus) => {
    if (newStatus === "rejected" && !reviewNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    // Prevent double-clicking by checking if already processing
    if (updating) {
      console.log("⚠️ Already processing, ignoring duplicate click");
      return;
    }

    // Prevent updating if the status is already what we're trying to set
    if (application.status === newStatus) {
      toast.info(`This application has already been ${newStatus}`);
      return;
    }

    // Prevent any changes to already approved/rejected applications
    if (application.status !== "pending" && newStatus !== "pending") {
      toast.error("Cannot modify an application that has already been reviewed");
      return;
    }

    setUpdating(true);
    try {
      const response = await vendorApplicationsApi.updateStatus(application.id, newStatus, reviewNotes);
      if (response.success) {
        // Update the application status locally to prevent further clicks
        application.status = newStatus;
        
        if (newStatus === "approved") {
          toast.success(`Application approved! Vendor "${application.businessName}" has been created and added to your vendor list.`, {
            duration: 8000,
            description: `Please inform the vendor to visit migoo.com/vendor/setup and use their email (${application.email}) to set up their credentials.`
          });
          
          // Navigate to vendor list after approval
          if (onNavigateToVendorList) {
            setTimeout(() => {
              onNavigateToVendorList();
            }, 500); // Small delay to allow toast to show
          } else {
            onUpdate();
            onBack();
          }
        } else if (newStatus === "rejected") {
          toast.error("Application rejected");
          onUpdate();
          onBack();
        } else {
          toast.success("Application status updated");
          onUpdate();
          onBack();
        }
      } else {
        toast.error("Failed to update application status");
      }
    } catch (error) {
      console.error("Error updating application status:", error);
      toast.error("Failed to update application status");
    } finally {
      setUpdating(false);
    }
  };

  const handleDownloadDocument = (fileData: { name: string; type: string; data: string }) => {
    try {
      // Create a blob from base64 data
      const byteCharacters = atob(fileData.data.split(',')[1] || fileData.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: fileData.type });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileData.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success("Document downloaded successfully");
    } catch (error) {
      console.error("Error downloading document:", error);
      toast.error("Failed to download document");
    }
  };

  const handleViewImage = (fileData: { name: string; type: string; data: string }) => {
    // Check if it's an image type
    if (fileData.type.startsWith('image/')) {
      setViewingImage({
        url: fileData.data.startsWith('data:') ? fileData.data : `data:${fileData.type};base64,${fileData.data}`,
        name: fileData.name
      });
    } else {
      toast.info("This is not an image file. Use download to view it.");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Vendor Application Review</h1>
                <p className="text-sm text-slate-500 mt-0.5">{application.businessName} - {application.contactName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(application.status)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          {/* Applicant Overview */}
          <Card className="border border-slate-200 bg-white">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  <img 
                    src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${application.businessName}`}
                    alt={application.businessName}
                    className="w-full h-full"
                  />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">{application.businessName}</h2>
                  <p className="text-sm text-slate-600 mb-4">{application.description}</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                </div>
              </div>
            </div>
          </Card>

          {/* Business Information */}
          <Card className="border border-slate-200 bg-white">
            <div className="p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Business Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Business Name</Label>
                  <p className="font-medium text-slate-900">{application.businessName}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Contact Person</Label>
                  <p className="font-medium text-slate-900">{application.contactName}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Business Type</Label>
                  <p className="font-medium text-slate-900">{application.businessType}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Tax ID / Registration Number</Label>
                  <p className="font-medium text-slate-900">{application.taxId}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Email</Label>
                  <p className="font-medium text-slate-900">{application.email}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Phone</Label>
                  <p className="font-medium text-slate-900">{application.phone}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <Label className="text-xs text-slate-500 mb-1 block">Location</Label>
                  <p className="font-medium text-slate-900">{application.location}</p>
                </div>
                {application.website && (
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <Label className="text-xs text-slate-500 mb-1 block">Website</Label>
                    <a href={application.website} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                      {application.website}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Product & Commission Details */}
          <Card className="border border-slate-200 bg-white">
            <div className="p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Product & Commission Details
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <Label className="text-xs text-blue-600 font-semibold">Product Category</Label>
                  </div>
                  <p className="font-semibold text-slate-900">{application.productsCategory}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <Label className="text-xs text-purple-600 font-semibold">Estimated Products</Label>
                  </div>
                  <p className="font-semibold text-slate-900">{application.estimatedProducts}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Percent className="w-4 h-4 text-green-600" />
                    <Label className="text-xs text-green-600 font-semibold">Requested Commission</Label>
                  </div>
                  <p className="font-semibold text-slate-900">{application.requestedCommission}%</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Uploaded Documents */}
          {application.files && (application.files.businessLicense || application.files.idDocument) && (
            <Card className="border border-slate-200 bg-white">
              <div className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Uploaded Documents
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Business License */}
                  {application.files.businessLicense && (
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-slate-900 text-sm">Business License</p>
                            <p className="text-xs text-slate-500">{application.files.businessLicense.name}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {application.files.businessLicense.type.startsWith('image/') && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleViewImage(application.files!.businessLicense!)}
                            className="flex-1"
                          >
                            <ImageIcon className="w-4 h-4 mr-2" />
                            View
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDownloadDocument(application.files!.businessLicense!)}
                          className="flex-1"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ID Document */}
                  {application.files.idDocument && (
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="font-medium text-slate-900 text-sm">ID Document</p>
                            <p className="text-xs text-slate-500">{application.files.idDocument.name}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {application.files.idDocument.type.startsWith('image/') && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleViewImage(application.files!.idDocument!)}
                            className="flex-1"
                          >
                            <ImageIcon className="w-4 h-4 mr-2" />
                            View
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDownloadDocument(application.files!.idDocument!)}
                          className="flex-1"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Review Notes */}
          <Card className="border border-slate-200 bg-white">
            <div className="p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Review Notes</h3>
              <Textarea
                placeholder="Add notes about your review decision (required for rejection)..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>
          </Card>

          {/* Action Buttons */}
          {application.status === "pending" && (
            <Card className="border border-slate-200 bg-white">
              <div className="p-6">
                <div className="flex items-center justify-end gap-3">
                  <Button 
                    variant="outline"
                    onClick={onBack}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleUpdateStatus("rejected")}
                    disabled={updating || !reviewNotes.trim()}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Reject Application
                  </Button>
                  <Button 
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleUpdateStatus("approved")}
                    disabled={updating}
                  >
                    {updating ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Approve Application
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Image Viewer Modal */}
      {viewingImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] bg-white rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium">{viewingImage.name}</span>
              <button
                onClick={() => setViewingImage(null)}
                className="p-1 hover:bg-slate-800 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-60px)]">
              <img 
                src={viewingImage.url} 
                alt={viewingImage.name}
                className="max-w-full h-auto mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}