import { useState, useEffect } from "react";
import { ArrowLeft, Building2, Mail, Phone, MapPin, Globe, Upload, DollarSign } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface VendorAddEditProps {
  onBack: () => void;
  onSave: (vendorData: any) => Promise<void>;
  initialData?: any;
  mode?: "add" | "edit";
  editingVendor?: any;
}

export function VendorAddEdit({ onBack, onSave, initialData, mode = "add", editingVendor }: VendorAddEditProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  // Use editingVendor if provided, otherwise use initialData
  const vendorData = editingVendor || initialData;
  
  const [formData, setFormData] = useState({
    name: vendorData?.name || "",
    businessType: vendorData?.businessType || "",
    description: vendorData?.description || "",
    email: vendorData?.email || "",
    phone: vendorData?.phone || "",
    location: vendorData?.location || "",
    website: vendorData?.website || "",
    status: vendorData?.status || "pending",
    commission: vendorData?.commission?.toString() || "",
    logo: vendorData?.logo || vendorData?.avatar || null,
  });

  // 🔥 Update form when editingVendor changes
  useEffect(() => {
    if (editingVendor || initialData) {
      const data = editingVendor || initialData;
      setFormData({
        name: data?.name || "",
        businessType: data?.businessType || "",
        description: data?.description || "",
        email: data?.email || "",
        phone: data?.phone || "",
        location: data?.location || "",
        website: data?.website || "",
        status: data?.status || "pending",
        commission: data?.commission?.toString() || "",
        logo: data?.logo || data?.avatar || null,
      });
    }
  }, [editingVendor, initialData]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.phone) {
      alert("Please fill in all required fields (Name, Email, Phone)");
      return;
    }

    setIsLoading(true);
    try {
      await onSave(formData);
    } catch (error) {
      console.error("Error saving vendor:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData({ ...formData, logo: e.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack} className="hover:bg-slate-100">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {mode === "add" ? "Add New Vendor" : "Edit Vendor"}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {mode === "add" ? "Create a new vendor profile" : "Update vendor information"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onBack} disabled={isLoading}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={isLoading}
                className="bg-slate-900 hover:bg-slate-800"
              >
                <Building2 className="w-4 h-4 mr-2" />
                {isLoading ? "Saving..." : "Save Vendor"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Basic Information */}
          <Card className="p-6 border border-slate-200 bg-white lg:col-span-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Basic Information</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Vendor Name <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1.5">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="name"
                    placeholder="e.g., TechGear Electronics"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="businessType" className="text-sm font-medium text-slate-700">
                  Business Type
                </Label>
                <Select 
                  value={formData.businessType} 
                  onValueChange={(value) => setFormData({ ...formData, businessType: value })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select business type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electronics">Electronics</SelectItem>
                    <SelectItem value="fashion">Fashion & Apparel</SelectItem>
                    <SelectItem value="furniture">Furniture & Home</SelectItem>
                    <SelectItem value="beauty">Beauty & Cosmetics</SelectItem>
                    <SelectItem value="sports">Sports & Outdoors</SelectItem>
                    <SelectItem value="food">Food & Beverage</SelectItem>
                    <SelectItem value="books">Books & Media</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description" className="text-sm font-medium text-slate-700">
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the vendor's business"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="mt-1.5 resize-none"
                />
              </div>
            </div>
          </Card>

          {/* Status & Commission */}
          <Card className="p-6 border border-slate-200 bg-white lg:col-span-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Status & Commission</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="status" className="text-sm font-medium text-slate-700">
                  Account Status
                </Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="commission" className="text-sm font-medium text-slate-700">
                  Commission Rate (%)
                </Label>
                <div className="relative mt-1.5">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="commission"
                    type="number"
                    placeholder="15"
                    value={formData.commission}
                    onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                    className="pl-10"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Percentage of sales revenue that goes to the platform
                </p>
              </div>
            </div>
          </Card>

          {/* Vendor Logo */}
          <Card className="p-6 border border-slate-200 bg-white lg:col-span-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Vendor Logo</h2>
            
            <div>
              <Label className="text-sm font-medium text-slate-700">
                Company Logo
              </Label>
              <p className="text-xs text-slate-500 mt-1 mb-3">
                Upload the vendor's company logo
              </p>
              
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors">
                {formData.logo ? (
                  <div className="space-y-3">
                    <img 
                      src={formData.logo} 
                      alt="Vendor logo" 
                      className="w-24 h-24 mx-auto object-contain rounded-lg"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setFormData({ ...formData, logo: null })}
                    >
                      Remove Logo
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="logo-upload" className="cursor-pointer block">
                    <div className="w-16 h-16 bg-slate-100 rounded-lg mx-auto flex items-center justify-center mb-3">
                      <Upload className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      Click to upload logo
                    </p>
                    <p className="text-xs text-slate-500">
                      PNG, JPG up to 5MB
                    </p>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </Card>

          {/* Contact Information - Full Width */}
          <Card className="p-6 border border-slate-200 bg-white lg:col-span-3">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@vendor.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="phone" className="text-sm font-medium text-slate-700">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1.5">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="phone"
                    type="number"
                    placeholder="+95 9 XXX XXX XXX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="location" className="text-sm font-medium text-slate-700">
                  Location
                </Label>
                <div className="relative mt-1.5">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="location"
                    placeholder="City, State/Country"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="website" className="text-sm font-medium text-slate-700">
                  Website
                </Label>
                <div className="relative mt-1.5">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://vendor.com"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}