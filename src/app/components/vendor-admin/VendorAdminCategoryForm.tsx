import { useState, useEffect } from "react";
import { ArrowLeft, Upload, X, ImageIcon, Loader2, Search, Package } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import { compressImageToDataURLVendor } from "../../../utils/imageCompression";

interface Product {
  id: string;
  name: string;
  price: number | string;
  sku: string;
  image: string | null;
  status: string;
  inventory: number;
  category?: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  coverPhoto?: string;
  status: "active" | "hide";
  productIds: string[];
  productCount: number;
  products: Product[];
  createdAt: string;
}

interface VendorAdminCategoryFormProps {
  vendorId: string;
  vendorName: string;
  editingCategory?: Category | null;
  onBack: () => void;
  onSave: () => void;
}

export function VendorAdminCategoryForm({
  vendorId,
  vendorName,
  editingCategory,
  onBack,
  onSave,
}: VendorAdminCategoryFormProps) {
  const [categoryName, setCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [coverPhoto, setCoverPhoto] = useState("");
  const [coverPhotoPreview, setCoverPhotoPreview] = useState("");
  const [status, setStatus] = useState<"active" | "hide">("active");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    loadProducts();
    
    // If editing, populate the form
    if (editingCategory) {
      setCategoryName(editingCategory.name || "");
      setDescription(editingCategory.description || "");
      setCoverPhoto(editingCategory.coverPhoto || "");
      setCoverPhotoPreview(editingCategory.coverPhoto || "");
      setStatus(editingCategory.status || "active");
      // Load productIds from category
      setSelectedProducts(editingCategory.productIds || []);
    }
  }, [editingCategory, vendorId]);

  const loadProducts = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products-admin/${vendorId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error("Failed to load products:", error);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name?.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
    product.sku?.toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    setIsUploading(true);
    toast.info("Compressing image to 500KB...", { duration: 2000 });
    
    try {
      // Compress image to 500KB using vendor compression utility
      const compressedDataUrl = await compressImageToDataURLVendor(file);
      
      setCoverPhotoPreview(compressedDataUrl);
      setCoverPhoto(compressedDataUrl);
      
      toast.success('Image uploaded and compressed to 500KB!');
      console.log('✅ [VENDOR] Image uploaded and compressed successfully');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Create a fake input event
    const fakeEvent = {
      target: {
        files: [file]
      }
    } as any;
    
    handleImageUpload(fakeEvent);
  };

  const handleSave = async () => {
    if (!categoryName || !description) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      const categoryData = {
        vendorId,
        name: categoryName,
        description: description,
        coverPhoto: coverPhoto,
        status: status,
        productIds: selectedProducts,
      };

      if (editingCategory) {
        // Update existing category
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/categories/${editingCategory.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify(categoryData),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update category");
        }

        console.log("✅ Category updated successfully");
      } else {
        // Create new category
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/categories`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify(categoryData),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to create category");
        }

        console.log("✅ Category created successfully");
      }

      // Update products with this category
      const previouslySelected = editingCategory?.productIds || [];
      const oldCategoryName = editingCategory?.name || "";
      
      // Products to add category to (newly selected)
      const productsToUpdate = selectedProducts.filter(id => !previouslySelected.includes(id));
      
      // Products to remove category from (previously selected but now unselected)
      const productsToUnassign = previouslySelected.filter(id => !selectedProducts.includes(id));
      
      // Products that stayed selected (need to update if category name changed)
      const productsStillSelected = selectedProducts.filter(id => previouslySelected.includes(id));
      
      // Update products with category assignments
      const updatePromises = [];

      if (productsToUpdate.length > 0) {
        console.log(`📦 Adding ${productsToUpdate.length} products to category "${categoryName}"`);
        productsToUpdate.forEach(productId => {
          updatePromises.push(
            fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/${productId}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify({ category: categoryName }),
              }
            ).then(response => {
              if (response.ok) {
                console.log(`✅ Added product ${productId} to category "${categoryName}"`);
              } else {
                console.error(`❌ Failed to add product ${productId} to category`);
              }
              return response;
            })
          );
        });
      }

      if (editingCategory && oldCategoryName !== categoryName && productsStillSelected.length > 0) {
        console.log(`📝 Updating ${productsStillSelected.length} products with new category name "${categoryName}"`);
        productsStillSelected.forEach(productId => {
          updatePromises.push(
            fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/${productId}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify({ category: categoryName }),
              }
            ).then(response => {
              if (response.ok) {
                console.log(`✅ Updated product ${productId} with category "${categoryName}"`);
              } else {
                console.error(`❌ Failed to update product ${productId}`);
              }
              return response;
            })
          );
        });
      }

      if (productsToUnassign.length > 0) {
        console.log(`🗑️ Removing ${productsToUnassign.length} products from category`);
        productsToUnassign.forEach(productId => {
          updatePromises.push(
            fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/${productId}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify({ category: "" }),
              }
            ).then(response => {
              if (response.ok) {
                console.log(`✅ Removed product ${productId} from category`);
              } else {
                console.error(`❌ Failed to remove product ${productId} from category`);
              }
              return response;
            })
          );
        });
      }

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`✅ Updated product-category assignments`);
      }

      toast.success(editingCategory ? "Category updated successfully!" : "Category created successfully!");
      onSave();
    } catch (error) {
      console.error("Failed to save category:", error);
      toast.error("Failed to save category");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          className="mb-4 -ml-3 text-slate-600 hover:text-slate-900"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Categories
        </Button>
        <h2 className="text-2xl font-semibold text-slate-900">
          {editingCategory ? "Edit Category" : "Create New Category"}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {editingCategory 
            ? "Update category information and products" 
            : "Add a new category and assign products to organize your inventory"
          }
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card className="p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Basic Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Category Name *</Label>
                <Input
                  id="category-name"
                  placeholder="e.g., Electronics, Clothing, Home & Garden"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">Description *</Label>
                <Textarea
                  id="category-description"
                  placeholder="Describe what products belong in this category..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="flex min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>
          </Card>

          {/* Cover Photo */}
          <Card className="p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Cover Photo</h3>
            
            {!coverPhotoPreview ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-slate-400 transition-colors cursor-pointer bg-slate-50/50"
                onClick={() => document.getElementById('image-upload-input')?.click()}
              >
                <input
                  id="image-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-3">
                  {isUploading ? (
                    <>
                      <Upload className="w-12 h-12 text-slate-400 animate-pulse" />
                      <p className="text-sm text-slate-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 mb-1">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-slate-500">
                          PNG, JPG, GIF up to 5MB
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={coverPhotoPreview}
                  alt="Cover Photo Preview"
                  className="w-full h-64 object-cover rounded-lg border border-slate-200"
                  onError={() => {
                    setCoverPhotoPreview("");
                    setCoverPhoto("");
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="bg-white hover:bg-slate-50"
                    onClick={() => document.getElementById('image-upload-input')?.click()}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Change
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setCoverPhoto("");
                      setCoverPhotoPreview("");
                    }}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
                <input
                  id="image-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            )}
          </Card>

          {/* Products */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Add Products</h3>
              <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                {selectedProducts.length} selected
              </Badge>
            </div>
            
            {/* Product Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search products by name or SKU..."
                className="pl-10"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
              />
            </div>

            {/* Product List */}
            <div className="border border-slate-200 rounded-lg max-h-[400px] overflow-y-auto">
              {loadingProducts ? (
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        className="p-3 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedProducts.includes(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                          />
                          <img
                            src={product.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop'}
                            alt={product.name}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-white"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">{product.name}</p>
                            <p className="text-sm text-slate-500">SKU: {product.sku}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!loadingProducts && filteredProducts.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>No products found</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-8">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Category Settings</h3>
            
            <div className="space-y-4">
              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="category-status">Status *</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as "active" | "hide")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active - Visible to customers</SelectItem>
                    <SelectItem value="hide">Hide - Not visible to customers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <Button 
                  className="w-full bg-slate-900 hover:bg-slate-800" 
                  onClick={handleSave}
                  disabled={!categoryName || !description || isSaving}
                >
                  {isSaving ? "Saving..." : (editingCategory ? "Update Category" : "Create Category")}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={onBack}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}