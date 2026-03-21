import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, UserPlus, Save, Loader2, Upload, X, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import imageCompression from "browser-image-compression";

export function AddCustomerPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 🎯 Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    description: string;
    type: "success" | "error" | "warning" | "info";
    onClose?: () => void;
  }>({
    title: "",
    description: "",
    type: "info",
  });
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "+95 9 ",
    address: "",
    city: "",
    region: "",
    status: "active" as "active" | "inactive" | "blocked",
    tier: "new" as "vip" | "regular" | "new",
  });

  // 🎯 Show Alert Modal Helper
  const showAlert = (
    title: string,
    description: string,
    type: "success" | "error" | "warning" | "info",
    onClose?: () => void
  ) => {
    setAlertConfig({ title, description, type, onClose });
    setAlertOpen(true);
  };

  // 🔥 HANDLE IMAGE COMPRESSION
  const compressImage = async (file: File) => {
    try {
      setIsCompressing(true);
      console.log("📦 Original image size:", (file.size / 1024).toFixed(2), "KB");

      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
        fileType: "image/jpeg",
      };

      const compressedFile = await imageCompression(file, options);
      console.log("✅ Compressed image size:", (compressedFile.size / 1024).toFixed(2), "KB");

      const previewUrl = URL.createObjectURL(compressedFile);
      setImagePreview(previewUrl);
      setImageFile(compressedFile);
    } catch (error) {
      console.error("❌ Error compressing image:", error);
      showAlert(
        "Image Compression Failed",
        "Failed to compress image. Please try another image.",
        "error"
      );
    } finally {
      setIsCompressing(false);
    }
  };

  // 🔥 HANDLE FILE INPUT CHANGE
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showAlert(
        "Invalid File Type",
        "Please select an image file",
        "error"
      );
      return;
    }

    await compressImage(file);
  };

  // 🔥 DRAG AND DROP HANDLERS
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showAlert(
        "Invalid File Type",
        "Please select an image file",
        "error"
      );
      return;
    }

    await compressImage(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.phone || !formData.address || !formData.city) {
      showAlert(
        "Required Fields Missing",
        "Please fill all required fields!",
        "warning"
      );
      return;
    }

    setIsSubmitting(true);

    try {
      let avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(formData.name)}`;

      // 🔥 UPLOAD IMAGE TO BACKEND IF IMAGE EXISTS
      if (imageFile) {
        console.log("📤 Uploading customer profile image...");
        
        const formDataWithImage = new FormData();
        formDataWithImage.append("image", imageFile);
        formDataWithImage.append("customerName", formData.name);

        const uploadResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers/upload-image`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: formDataWithImage,
          }
        );

        const uploadData = await uploadResponse.json();
        console.log("📦 Upload response:", uploadData);

        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || "Failed to upload image");
        }

        avatarUrl = uploadData.imageUrl;
        console.log("✅ Image uploaded:", avatarUrl);
      }

      const customerData = {
        ...formData,
        location: `${formData.address}, ${formData.city}`,
        avatar: avatarUrl,
      };

      console.log("📤 Sending customer data to backend:", customerData);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(customerData),
        }
      );

      const data = await response.json();
      console.log("📦 Create customer response:", data);

      if (!response.ok) {
        console.error("❌ Server error response:", data);
        throw new Error(data.error || data.message || "Failed to create customer");
      }

      console.log("✅ Customer created successfully:", data);
      
      // Convert customer name to Title Case
      const titleCaseName = formData.name
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      showAlert(
        "Customer Added",
        `${titleCaseName} has been added to Customer List`,
        "success",
        () => navigate("/admin?tab=customers")
      );
    } catch (error: any) {
      console.error("❌ Error creating customer:", error);
      console.error("❌ Error details:", {
        message: error.message,
        stack: error.stack,
        error: error
      });
      showAlert(
        "Failed to Create Customer",
        error.message || "An unexpected error occurred",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin")}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Add New Customer
              </h1>
              <p className="text-xs text-slate-500">
                Fill in the customer details below
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          {/* Form Header */}
          <div className="px-6 py-3.5 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <UserPlus className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Customer Information
                </h2>
                <p className="text-xs text-slate-500">
                  Enter the basic details of the customer
                </p>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* 🔥 PROFILE IMAGE UPLOAD - COMPACT */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Profile Image
                </label>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={isCompressing || isSubmitting}
                />
                
                {/* Drag & Drop Zone - 200x200px SQUARE */}
                <div
                  onClick={() => !imagePreview && fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    relative w-[200px] h-[200px] rounded-lg border-2 border-dashed 
                    flex flex-col items-center justify-center cursor-pointer
                    transition-all
                    ${imagePreview 
                      ? 'border-slate-300 bg-slate-50 p-0' 
                      : isDragging 
                        ? 'border-blue-500 bg-blue-50 p-4' 
                        : 'border-slate-300 bg-slate-50 hover:border-slate-400 p-4'
                    }
                    ${isCompressing || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {imagePreview ? (
                    <>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (imagePreview) {
                            URL.revokeObjectURL(imagePreview);
                          }
                          setImagePreview(null);
                          setImageFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-md"
                        disabled={isCompressing || isSubmitting}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : isCompressing ? (
                    <>
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-2" />
                      <p className="text-sm text-slate-500 text-center">Compressing image...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mb-2 flex-shrink-0" />
                      <p className="text-sm font-medium text-slate-700 text-center">Upload Image</p>
                      <p className="text-xs text-slate-500 mt-1 text-center leading-tight">
                        Image will be compressed to max 500KB
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="Enter customer name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-10 bg-slate-50"
                  required
                />
              </div>

              {/* Email & Phone in a row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full h-10 bg-slate-50"
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    placeholder="+95 9"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full h-10 bg-slate-50"
                    required
                  />
                </div>
              </div>

              {/* Address - FULL WIDTH */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Address <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="Street Address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full h-10 bg-slate-50"
                  required
                />
              </div>

              {/* City & Region - SIDE BY SIDE */}
              <div className="grid grid-cols-2 gap-4">
                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    City <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="City, Myanmar"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full h-10 bg-slate-50"
                    required
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Region
                  </label>
                  <Input
                    type="text"
                    placeholder="Region/State"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full h-10 bg-slate-50"
                  />
                </div>
              </div>

              {/* Status & Tier */}
              <div className="grid grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Status
                  </label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value: "active" | "inactive" | "blocked") => 
                      setFormData({ ...formData, status: value })
                    }
                  >
                    <SelectTrigger className="h-10 bg-slate-50">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tier */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Customer Tier
                  </label>
                  <Select 
                    value={formData.tier} 
                    onValueChange={(value: "vip" | "regular" | "new") => 
                      setFormData({ ...formData, tier: value })
                    }
                  >
                    <SelectTrigger className="h-10 bg-slate-50">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="vip">VIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-center gap-3 mt-6 pt-5 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin")}
                disabled={isSubmitting}
                className="h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Customer
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 🎯 Alert Modal - PERFECT SQUARE 300x300px */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="max-w-[300px] w-[300px] h-[300px] bg-gradient-to-br from-slate-50 via-white to-slate-50 border-none shadow-2xl rounded-2xl">
          {/* X Button - Top Right Corner - RED */}
          <button
            onClick={() => {
              setAlertOpen(false);
              if (alertConfig.onClose) {
                alertConfig.onClose();
              }
            }}
            className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center transition-all hover:scale-110"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>

          {/* Content - Perfectly Centered in Square */}
          <div className="flex flex-col items-center justify-center text-center h-full px-6">
            {/* Icon with circular background */}
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
    </div>
  );
}