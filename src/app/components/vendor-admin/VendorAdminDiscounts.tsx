import { useState, useEffect } from "react";
import { 
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  Tag,
  Percent,
  DollarSign,
  Truck,
  Calendar,
  Users,
  Package,
  MoreVertical,
  TrendingUp
} from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

interface DiscountCode {
  id: string;
  code: string;
  type: "percentage" | "fixed_amount" | "free_shipping";
  value: number;
  description?: string;
  minOrderAmount?: number;
  maxUses?: number;
  usedCount: number;
  startDate?: string;
  endDate?: string;
  appliesTo: "all" | "specific_products" | "specific_categories";
  productIds?: string[];
  categoryIds?: string[];
  status: "active" | "inactive" | "expired";
  createdAt: string;
  vendorId: string;
}

interface VendorAdminDiscountsProps {
  vendorId: string;
  vendorName: string;
}

export function VendorAdminDiscounts({ vendorId, vendorName }: VendorAdminDiscountsProps) {
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    type: "percentage" as "percentage" | "fixed_amount" | "free_shipping",
    value: "",
    description: "",
    minOrderAmount: "",
    maxUses: "",
    startDate: "",
    endDate: "",
    appliesTo: "all" as "all" | "specific_products" | "specific_categories",
    productIds: [] as string[],
    categoryIds: [] as string[],
    status: "active" as "active" | "inactive",
  });

  useEffect(() => {
    loadDiscounts();
  }, [vendorId]);

  const loadDiscounts = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/discounts/${vendorId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDiscounts(data.discounts || []);
      }
    } catch (error) {
      console.error("Failed to load discounts:", error);
      toast.error("Failed to load discount codes");
    } finally {
      setLoading(false);
    }
  };

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, code });
  };

  const resetForm = () => {
    setFormData({
      code: "",
      type: "percentage",
      value: "",
      description: "",
      minOrderAmount: "",
      maxUses: "",
      startDate: "",
      endDate: "",
      appliesTo: "all",
      productIds: [],
      categoryIds: [],
      status: "active",
    });
  };

  const handleCreateDiscount = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleEditDiscount = (discount: DiscountCode) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code,
      type: discount.type,
      value: discount.value.toString(),
      description: discount.description || "",
      minOrderAmount: discount.minOrderAmount?.toString() || "",
      maxUses: discount.maxUses?.toString() || "",
      startDate: discount.startDate || "",
      endDate: discount.endDate || "",
      appliesTo: discount.appliesTo,
      productIds: discount.productIds || [],
      categoryIds: discount.categoryIds || [],
      status: discount.status === "expired" ? "active" : discount.status,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveDiscount = async () => {
    // Validation
    if (!formData.code || !formData.value) {
      toast.error("Please fill in code and discount value");
      return;
    }

    if (formData.type === "percentage" && parseFloat(formData.value) > 100) {
      toast.error("Percentage discount cannot exceed 100%");
      return;
    }

    setSaving(true);
    try {
      const discountData = {
        code: formData.code.toUpperCase(),
        type: formData.type,
        value: parseFloat(formData.value),
        description: formData.description,
        minOrderAmount: formData.minOrderAmount ? parseFloat(formData.minOrderAmount) : undefined,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        appliesTo: formData.appliesTo,
        productIds: formData.productIds,
        categoryIds: formData.categoryIds,
        status: formData.status,
        vendorId,
        usedCount: editingDiscount?.usedCount || 0,
      };

      if (editingDiscount) {
        // Update existing discount
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/discounts/${editingDiscount.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify(discountData),
          }
        );

        if (response.ok) {
          toast.success("Discount code updated successfully!");
          setIsEditDialogOpen(false);
          setEditingDiscount(null);
          loadDiscounts();
        } else {
          toast.error("Failed to update discount code");
        }
      } else {
        // Create new discount
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/discounts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify(discountData),
          }
        );

        if (response.ok) {
          toast.success("Discount code created successfully!");
          setIsCreateDialogOpen(false);
          loadDiscounts();
        } else {
          const errorData = await response.json();
          toast.error(errorData.message || "Failed to create discount code");
        }
      }
    } catch (error) {
      console.error("Failed to save discount:", error);
      toast.error("Failed to save discount code");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDiscount = async (discountId: string) => {
    if (!confirm("Are you sure you want to delete this discount code?")) {
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/discounts/${discountId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        toast.success("Discount code deleted successfully!");
        loadDiscounts();
      } else {
        toast.error("Failed to delete discount code");
      }
    } catch (error) {
      console.error("Failed to delete discount:", error);
      toast.error("Failed to delete discount code");
    }
  };

  const handleCopyCode = (code: string) => {
    // Use fallback for clipboard API with proper error handling
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(() => {
        toast.success("Code copied to clipboard!");
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
      toast.success("Code copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy code");
    }
    document.body.removeChild(textArea);
  };

  const handleToggleStatus = async (discount: DiscountCode) => {
    const newStatus = discount.status === "active" ? "inactive" : "active";
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/discounts/${discount.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ ...discount, status: newStatus }),
        }
      );

      if (response.ok) {
        toast.success(`Discount ${newStatus === "active" ? "activated" : "deactivated"}!`);
        loadDiscounts();
      }
    } catch (error) {
      console.error("Failed to toggle status:", error);
      toast.error("Failed to update discount status");
    }
  };

  const getDiscountIcon = (type: string) => {
    switch (type) {
      case "percentage": return <Percent className="w-4 h-4" />;
      case "fixed_amount": return <DollarSign className="w-4 h-4" />;
      case "free_shipping": return <Truck className="w-4 h-4" />;
      default: return <Tag className="w-4 h-4" />;
    }
  };

  const getDiscountDisplay = (discount: DiscountCode) => {
    switch (discount.type) {
      case "percentage":
        return `${discount.value}% OFF`;
      case "fixed_amount":
        return `$${discount.value} OFF`;
      case "free_shipping":
        return "FREE SHIPPING";
      default:
        return "";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
      case "inactive":
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Inactive</Badge>;
      case "expired":
        return <Badge className="bg-red-100 text-red-700 border-red-200">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredDiscounts = discounts.filter(discount => {
    const matchesSearch = 
      discount.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      discount.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || discount.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const DiscountFormDialog = ({ 
    isOpen, 
    onClose, 
    title 
  }: { 
    isOpen: boolean; 
    onClose: () => void; 
    title: string 
  }) => (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Discount Code */}
          <div>
            <Label>Discount Code *</Label>
            <div className="flex gap-2">
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SUMMER2024"
                className="uppercase"
              />
              <Button variant="outline" onClick={generateRandomCode} type="button">
                Generate
              </Button>
            </div>
          </div>

          {/* Type and Value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Discount Type *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: any) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">
                    <div className="flex items-center gap-2">
                      <Percent className="w-4 h-4" />
                      Percentage
                    </div>
                  </SelectItem>
                  <SelectItem value="fixed_amount">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Fixed Amount
                    </div>
                  </SelectItem>
                  <SelectItem value="free_shipping">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Free Shipping
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type !== "free_shipping" && (
              <div>
                <Label>
                  {formData.type === "percentage" ? "Percentage %" : "Amount $"} *
                </Label>
                <Input
                  type="number"
                  step={formData.type === "percentage" ? "1" : "0.01"}
                  max={formData.type === "percentage" ? "100" : undefined}
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={formData.type === "percentage" ? "10" : "10.00"}
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Internal note about this discount..."
              rows={2}
            />
          </div>

          {/* Minimum Order Amount */}
          <div>
            <Label>Minimum Order Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.minOrderAmount}
              onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
              placeholder="Optional - e.g. 50.00"
            />
            <p className="text-xs text-slate-500 mt-1">
              Leave empty for no minimum requirement
            </p>
          </div>

          {/* Usage Limits */}
          <div>
            <Label>Maximum Uses</Label>
            <Input
              type="number"
              value={formData.maxUses}
              onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
              placeholder="Optional - e.g. 100"
            />
            <p className="text-xs text-slate-500 mt-1">
              Leave empty for unlimited uses
            </p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Applies To */}
          <div>
            <Label>Applies To</Label>
            <Select 
              value={formData.appliesTo} 
              onValueChange={(value: any) => setFormData({ ...formData, appliesTo: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="specific_products">Specific Products</SelectItem>
                <SelectItem value="specific_categories">Specific Categories</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <Label>Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value: any) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button onClick={handleSaveDiscount} disabled={saving}>
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                "Save Discount"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Discount Codes</h1>
          <p className="text-slate-600">Create and manage discount codes for your store</p>
        </div>
        <Button onClick={handleCreateDiscount} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Discount
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Codes</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{discounts.length}</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {discounts.filter(d => d.status === "active").length}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Uses</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {discounts.reduce((sum, d) => sum + d.usedCount, 0)}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Expired</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {discounts.filter(d => d.status === "expired").length}
              </p>
            </div>
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search discount codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Discounts List */}
      {filteredDiscounts.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Tag className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchQuery ? "No discount codes found" : "No discount codes yet"}
          </h3>
          <p className="text-slate-600 mb-4">
            {searchQuery 
              ? "Try adjusting your search" 
              : "Create discount codes to offer special deals to your customers"}
          </p>
          {!searchQuery && (
            <Button onClick={handleCreateDiscount} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Discount
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredDiscounts.map((discount) => (
            <Card key={discount.id} className="p-4 border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  {/* Icon */}
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    {getDiscountIcon(discount.type)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg text-slate-900">{discount.code}</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyCode(discount.code)}
                        className="h-6 px-2"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      {getStatusBadge(discount.status)}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-bold">
                        {getDiscountDisplay(discount)}
                      </Badge>
                      {discount.minOrderAmount && (
                        <Badge variant="outline" className="text-xs">
                          Min: ${discount.minOrderAmount}
                        </Badge>
                      )}
                    </div>

                    {discount.description && (
                      <p className="text-sm text-slate-600 mb-2">{discount.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      {discount.usedCount > 0 && (
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>Used {discount.usedCount} times</span>
                          {discount.maxUses && <span>/ {discount.maxUses} max</span>}
                        </div>
                      )}
                      {discount.startDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(discount.startDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {discount.endDate && (
                        <div className="flex items-center gap-1">
                          <span>→</span>
                          <span>{new Date(discount.endDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {discount.appliesTo !== "all" && (
                        <Badge variant="outline" className="text-xs">
                          <Package className="w-3 h-3 mr-1" />
                          {discount.appliesTo === "specific_products" ? "Specific Products" : "Specific Categories"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleStatus(discount)}
                  >
                    {discount.status === "active" ? (
                      <>
                        <XCircle className="w-4 h-4 mr-1" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Activate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditDiscount(discount)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteDiscount(discount.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <DiscountFormDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        title="Create Discount Code"
      />
      <DiscountFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingDiscount(null);
        }}
        title="Edit Discount Code"
      />
    </div>
  );
}