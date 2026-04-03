import { useState, useEffect } from "react";
import { ArrowLeft, Search, X, Upload, ImageIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { compressImage } from "../../utils/imageCompression";
import { toast } from "sonner";
import { categoriesApi, productsApi } from "../../utils/api";
import { getCachedAdminAllProducts } from "../utils/module-cache";
import { useAuth } from "../contexts/AuthContext";

interface Product {
  id: string;
  name: string;
  price: number | string;
  sku: string;
  image: string | null;
}

interface Category {
  id: string;
  name: string;
  description: string;
  coverPhoto?: string;
  image?: string;
  status: "active" | "hide";
  productIds: string[];
  productCount: number;
}

interface CategoryFormProps {
  onBack: () => void;
  onSave: () => void;
  editingCategory?: Category | null;
}

export function CategoryForm({ onBack, onSave, editingCategory }: CategoryFormProps) {
  const { user: sessionUser } = useAuth();
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

  useEffect(() => {
    loadProducts();
    
    // If editing, populate the form
    if (editingCategory) {
      setCategoryName(editingCategory.name || "");
      setDescription(editingCategory.description || "");
      setCoverPhoto(editingCategory.coverPhoto || editingCategory.image || "");
      setCoverPhotoPreview(editingCategory.coverPhoto || editingCategory.image || "");
      setStatus(editingCategory.status || "active");
      setSelectedProducts(editingCategory.productIds || []);
    }
  }, [editingCategory]);

  const loadProducts = async () => {
    try {
      const list = await getCachedAdminAllProducts(false);
      setProducts(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Failed to load products:", error);
      setProducts([]);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsUploading(true);
    try {
      // Compress image to max 500KB
      const compressedImage = await compressImage(file, 500);
      setCoverPhotoPreview(compressedImage);
      setCoverPhoto(compressedImage);
      toast.success('Image compressed and uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to compress image. Please try a smaller file.');
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
      alert("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      const categoryData = {
        name: categoryName,
        description: description,
        coverPhoto: coverPhoto,
        status: status,
        productIds: selectedProducts,
        productCount: selectedProducts.length,
      };

      let categoryId: string;
      
      if (editingCategory) {
        await categoriesApi.update(editingCategory.id, categoryData);
        categoryId = editingCategory.id;
        console.log("✅ Category updated successfully");
      } else {
        const response = await categoriesApi.create(categoryData);
        categoryId = response.id;
        console.log("✅ Category created successfully");
      }

      // Update products to assign/unassign this category
      // Get previously selected products if editing
      const previouslySelected = editingCategory?.productIds || [];
      const oldCategoryName = editingCategory?.name || "";
      
      // Products to add category to (newly selected)
      const productsToUpdate = selectedProducts.filter(id => !previouslySelected.includes(id));
      
      // Products to remove category from (previously selected but now unselected)
      const productsToUnassign = previouslySelected.filter(id => !selectedProducts.includes(id));
      
      // Products that stayed selected (need to update if category name changed)
      const productsStillSelected = selectedProducts.filter(id => previouslySelected.includes(id));
      
      // Update products with this category (newly selected)
      if (productsToUpdate.length > 0) {
        await Promise.all(
          productsToUpdate.map(productId => 
            productsApi.update(productId, {
              category: categoryName,
              performedByUserId: sessionUser?.id,
            })
          )
        );
        console.log(`✅ Updated ${productsToUpdate.length} products with category "${categoryName}"`);
      }
      
      // Update category name for products that stayed selected (if category name changed)
      if (editingCategory && oldCategoryName !== categoryName && productsStillSelected.length > 0) {
        await Promise.all(
          productsStillSelected.map(productId => 
            productsApi.update(productId, {
              category: categoryName,
              performedByUserId: sessionUser?.id,
            })
          )
        );
        console.log(`✅ Updated category name for ${productsStillSelected.length} products to "${categoryName}"`);
      }
      
      // Remove category from unselected products
      if (productsToUnassign.length > 0) {
        await Promise.all(
          productsToUnassign.map(productId => 
            productsApi.update(productId, { category: "", performedByUserId: sessionUser?.id })
          )
        );
        console.log(`✅ Removed category from ${productsToUnassign.length} products`);
      }

      onSave();
    } catch (error) {
      console.error("Failed to save category:", error);
      alert("Failed to save category");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          className="mb-4 -ml-3 text-slate-600 hover:text-slate-900"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Categories
        </Button>
        <h1 className="text-2xl font-semibold text-slate-900">
          {editingCategory ? "Edit Category" : "Create New Category"}
        </h1>
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
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Basic Information</h2>
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
                <textarea
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
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Cover Photo</h2>
            
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
              <h2 className="text-lg font-semibold text-slate-900">Add Products</h2>
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
              <div className="divide-y divide-slate-100">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="p-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => toggleProductSelection(product.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onCheckedChange={() => toggleProductSelection(product.id)}
                      />
                      <img
                        src={product.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop'}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{product.name}</p>
                        <p className="text-sm text-slate-500">SKU: {product.sku}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {filteredProducts.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  <p>No products found</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Category Settings</h2>
            
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