import { useState } from "react";
import { 
  CheckCircle2, 
  ArrowLeft, 
  ShoppingBag, 
  Building2, 
  User, 
  MapPin, 
  CreditCard, 
  FileText, 
  Upload, 
  X, 
  Globe,
  Mail,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

interface VendorApplicationFormProps {
  onBack?: () => void;
  source?: "admin" | "storefront";
}

export function VendorApplicationForm({ onBack, source = "admin" }: VendorApplicationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    // Business Information
    companyName: "",
    businessType: "",
    registrationNumber: "",
    
    // Contact Person
    contactName: "",
    email: "",
    phone: "",
    
    // Store Details
    storeName: "",
    storeDescription: "",
    categories: [] as string[],
    estimatedProducts: 0,
    
    // Business Address
    address: "",
    city: "",
    country: "",
    postalCode: "",
    
    // Bank Information
    bankName: "",
    accountNumber: "",
    accountName: "",
    
    // Social Links
    website: "",
    facebook: "",
    instagram: "",
    
    // Terms
    agreeToTerms: false,
    acceptPrivacy: false,
  });

  const [files, setFiles] = useState<{
    businessLicense: File | null;
    idDocument: File | null;
  }>({
    businessLicense: null,
    idDocument: null,
  });

  const businessTypes = [
    "Sole Proprietorship",
    "Partnership",
    "Limited Liability Company (LLC)",
    "Corporation",
    "Other"
  ];

  const categoryOptions = [
    "Electronics",
    "Fashion",
    "Home & Garden",
    "Beauty & Health",
    "Sports & Outdoors",
    "Toys & Games",
    "Books & Media",
    "Food & Beverages",
    "Automotive",
    "Other"
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === "checkbox") {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleCategoryToggle = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: keyof typeof files) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check initial file size (max 5MB before compression)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File too large", {
          description: "File size must be less than 5MB"
        });
        return;
      }
      
      // Compress the file before storing
      compressFile(file, fileType);
    }
  };

  const compressFile = async (file: File, fileType: keyof typeof files) => {
    try {
      const fileTypeStr = file.type.toLowerCase();
      const imageMaxSizeKB = 500; // Target 500KB for images
      const docMaxSizeKB = 2048; // Target 2MB for documents (PDF, DOC)
      
      // Handle image files - compress to 500KB
      if (fileTypeStr.includes('image')) {
        const compressedFile = await compressImage(file, imageMaxSizeKB);
        setFiles(prev => ({
          ...prev,
          [fileType]: compressedFile
        }));
        
        const sizeKB = (compressedFile.size / 1024).toFixed(0);
        toast.success("File Uploaded", {
          description: `Image compressed to ${sizeKB} KB`
        });
      } 
      // Handle PDF and DOC files - max 2MB
      else if (fileTypeStr.includes('pdf') || fileTypeStr.includes('document') || fileTypeStr.includes('msword') || fileTypeStr.includes('officedocument')) {
        const sizeKB = file.size / 1024;
        const sizeMB = (sizeKB / 1024).toFixed(2);
        
        if (sizeKB > docMaxSizeKB) {
          toast.error("Document too large", {
            description: `File is ${sizeMB} MB. Maximum size is 2 MB.`
          });
          return;
        }
        
        setFiles(prev => ({
          ...prev,
          [fileType]: file
        }));
        
        toast.success("File Uploaded", {
          description: `Document uploaded (${sizeMB} MB)`
        });
      }
      // Other file types - reject
      else {
        toast.error("Invalid file type", {
          description: "Please upload an image, PDF, or DOC file."
        });
        return;
      }
    } catch (error) {
      console.error("File compression error:", error);
      toast.error("Upload Failed", {
        description: "Failed to process file. Please try again."
      });
    }
  };

  const compressImage = (file: File, maxSizeKB: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions while maintaining aspect ratio
          const maxDimension = 1920; // Max width or height
          if (width > height && width > maxDimension) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Try different quality levels to get under target size
          const tryCompress = (quality: number) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }
                
                const sizeKB = blob.size / 1024;
                
                // If still too large and quality can be reduced further, try again
                if (sizeKB > maxSizeKB && quality > 0.1) {
                  tryCompress(quality - 0.1);
                } else {
                  // Create a new File from the blob
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  });
                  resolve(compressedFile);
                }
              },
              'image/jpeg',
              quality
            );
          };
          
          // Start with quality 0.8
          tryCompress(0.8);
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
        
        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (fileType: keyof typeof files) => {
    setFiles(prev => ({
      ...prev,
      [fileType]: null
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required text fields
    if (!formData.companyName || !formData.contactName || !formData.email || !formData.phone) {
      toast.error("Missing Required Fields", {
        description: "Please fill in all required fields"
      });
      return;
    }

    // Validate store details
    if (!formData.storeName || !formData.storeDescription) {
      toast.error("Missing Store Details", {
        description: "Please provide store name and description"
      });
      return;
    }

    // Validate business type
    if (!formData.businessType) {
      toast.error("Missing Business Type", {
        description: "Please select your business type"
      });
      return;
    }

    // Validate terms and privacy
    if (!formData.agreeToTerms || !formData.acceptPrivacy) {
      toast.error("Terms Required", {
        description: "You must agree to the terms and conditions and privacy policy"
      });
      return;
    }

    // Validate file uploads
    if (!files.businessLicense || !files.idDocument) {
      toast.error("Documents Required", {
        description: "Please upload both business license and ID document"
      });
      return;
    }

    // Validate categories
    if (formData.categories.length === 0) {
      toast.error("Categories Required", {
        description: "Please select at least one product category"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const businessLicenseBase64 = await fileToBase64(files.businessLicense);
      const idDocumentBase64 = await fileToBase64(files.idDocument);

      const applicationData = {
        ...formData,
        files: {
          businessLicense: {
            name: files.businessLicense.name,
            type: files.businessLicense.type,
            data: businessLicenseBase64
          },
          idDocument: {
            name: files.idDocument.name,
            type: files.idDocument.type,
            data: idDocumentBase64
          }
        },
        status: "pending",
        submittedAt: new Date().toISOString()
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor-applications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(applicationData),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit application");
      }

      const result = await response.json();
      console.log("✅ Application submitted:", result);

      setIsSubmitted(true);
      toast.success("Application Submitted!", {
        description: "We'll review your application and get back to you within 3-5 business days."
      });
    } catch (error: any) {
      console.error("❌ Application submission error:", error);
      toast.error("Submission Failed", {
        description: error.message || "Please try again later"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Success state
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/40 flex items-center justify-center p-4 sm:p-8">
        <div className="relative w-full max-w-3xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-[2rem] bg-gradient-to-br from-amber-200/60 via-orange-100/40 to-slate-200/60 opacity-80 blur-sm"
          />
          <div className="relative bg-white rounded-[1.75rem] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.12)] border border-slate-100/80 px-8 py-12 sm:px-14 sm:py-16 text-center">
            <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-green-100 ring-[10px] ring-emerald-50/80 shadow-inner">
              <CheckCircle2 className="h-14 w-14 text-emerald-600" strokeWidth={1.75} />
            </div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              All set
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-5">
              Application Submitted!
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mx-auto mb-10">
              Thank you for applying to become a vendor on SECURE. We&apos;ll review your application and get back to you within{" "}
              <span className="font-medium text-slate-800">3–5 business days</span>.
            </p>
            <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/90 border border-orange-100/80 px-6 py-7 sm:px-8 sm:py-8 text-left shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-700/90 mb-3">
                What&apos;s next?
              </p>
              <p className="text-slate-700 text-sm sm:text-base leading-relaxed">
                Our team will verify your documents and contact you via email.
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/70 border border-orange-100/60 px-4 py-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-medium text-slate-500">We&apos;ll reach you at</p>
                  <p className="text-sm sm:text-base font-semibold text-slate-900 truncate">{formData.email}</p>
                </div>
              </div>
            </div>
            <div className="mt-10 flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-6 border-slate-200 text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  if (onBack) {
                    onBack();
                  } else if (typeof window !== "undefined") {
                    window.history.back();
                  }
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {source === "storefront" ? "Back to home" : "Back"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900">SECURE Vendor Application</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Join our marketplace today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Business Information</h3>
                <p className="text-sm text-slate-500">Tell us about your business</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="ABC Trading Co."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Type *
                </label>
                <select
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                >
                  <option value="">Select type</option>
                  {businessTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Registration Number
                </label>
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="123456789"
                />
              </div>
            </div>
          </div>

          {/* Contact Person */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Contact Person</h3>
                <p className="text-sm text-slate-500">Primary contact information</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="john@example.com"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Phone Number *
                </label>
                <input
                  type="number"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="+95 9 XXX XXX XXX"
                />
              </div>
            </div>
          </div>

          {/* Store Details */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Store Details</h3>
                <p className="text-sm text-slate-500">Information about your store</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Store Name *
                </label>
                <input
                  type="text"
                  name="storeName"
                  value={formData.storeName}
                  onChange={handleInputChange}
                  required
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="My Awesome Store"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Store Description *
                </label>
                <textarea
                  name="storeDescription"
                  value={formData.storeDescription}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
                  placeholder="Describe what your store sells and what makes it unique..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Product Categories * (Select at least one)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  {categoryOptions.map(category => (
                    <label
                      key={category}
                      className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${
                        formData.categories.includes(category)
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Checkbox
                        checked={formData.categories.includes(category)}
                        onCheckedChange={() => handleCategoryToggle(category)}
                      />
                      <span className="text-sm text-slate-700">{category}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Estimated Number of Products
                </label>
                <input
                  type="number"
                  name="estimatedProducts"
                  value={formData.estimatedProducts}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all md:max-w-md"
                  placeholder="100"
                />
              </div>
            </div>
          </div>

          {/* Business Address */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Business Address</h3>
                <p className="text-sm text-slate-500">Your business location</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Street Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="123 Main Street"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="New York"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Country
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="United States"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Postal Code
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="10001"
                />
              </div>
            </div>
          </div>

          {/* Bank Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Bank Information</h3>
                <p className="text-sm text-slate-500">For receiving payments</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Bank Name
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="Chase Bank"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="ABC Trading Co."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Account Number
                </label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleInputChange}
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="****1234"
                />
              </div>
            </div>
          </div>

          {/* Document Upload */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Required Documents</h3>
                <p className="text-sm text-slate-500">Images (max 500KB), PDF/DOC files (max 2MB)</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Business License */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business License *
                </label>
                {files.businessLicense ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600" />
                    <span className="flex-1 text-sm text-slate-700">{files.businessLicense.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile("businessLicense")}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-slate-50 transition-all">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-sm text-slate-600">Click to upload business license</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange(e, "businessLicense")}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* ID Document */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  ID Document (Passport/Driver's License) *
                </label>
                {files.idDocument ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600" />
                    <span className="flex-1 text-sm text-slate-700">{files.idDocument.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile("idDocument")}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-slate-50 transition-all">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-sm text-slate-600">Click to upload ID document</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange(e, "idDocument")}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agreeToTerms"
                checked={formData.agreeToTerms}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, agreeToTerms: checked as boolean }))}
                className="mt-0.5"
              />
              <Label htmlFor="agreeToTerms" className="text-sm text-slate-700 cursor-pointer font-normal">
                Agree to the Terms and Conditions
              </Label>
            </div>
            
            <div className="flex items-start gap-3">
              <Checkbox
                id="acceptPrivacy"
                checked={formData.acceptPrivacy}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, acceptPrivacy: checked as boolean }))}
                className="mt-0.5"
              />
              <Label htmlFor="acceptPrivacy" className="text-sm text-slate-700 cursor-pointer font-normal">
                Accept Privacy Policy
              </Label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row gap-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-48 px-6 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:flex-1 h-12 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}