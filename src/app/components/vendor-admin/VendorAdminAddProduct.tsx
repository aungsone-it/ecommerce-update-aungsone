/**
 * VendorAdminAddProduct Component
 * 
 * Full-featured product add/edit form for vendor admin portal.
 * Matches the main Migoo ProductFormPage exactly (without vendor selector).
 * 
 * Features:
 * - Basic Information (name, rich text description)
 * - Product Images (upload + URL)
 * - Pricing (price, compare at, cost per item with margin calculation)
 * - Inventory (SKU, barcode, quantity tracking)
 * - Shipping (weight)
 * - Variants (up to 3 options with auto-combination generation)
 * - Product Organization (category, product type)
 * - Tags
 * - Status (Active/Off Shelf)
 * 
 * Flow:
 * 1. Vendor creates/edits product in their admin portal
 * 2. Product saved with vendor: vendorName
 * 3. Product appears in /vendor/products-admin/:vendorId (all statuses)
 * 4. Active products appear in /vendor/products/:vendorId (storefront)
 * 5. Categories loaded from /vendor/categories/:vendorId
 */

import { useState, useEffect } from "react";
import { ArrowLeft, Plus, X, Trash2, Upload, Image as ImageIcon, Package, DollarSign, Tag, Barcode, Grid, Hash, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import { compressMultipleImagesToDataURLVendor } from "../../../utils/imageCompression";
import { RichTextEditor } from "../RichTextEditor";

interface Variant {
  id: string;
  option1: string;
  option2?: string;
  option3?: string;
  price: string;
  compareAtPrice?: string;
  sku: string;
  barcode?: string;
  inventory: number;
  weight?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  images: string[];
  category: string;
  inventory: number;
  status: string;
  vendor?: string;
  hasVariants?: boolean;
  variants?: Variant[];
  variantOptions?: { name: string; values: string[] }[];
  tags?: string[];
  productType?: string;
  weight?: string;
  barcode?: string;
  costPerItem?: string;
  trackQuantity?: boolean;
  continueSellingOutOfStock?: boolean;
  commissionRate?: number; // 🔥 Product commission rate (stored as number in backend)
}

interface VendorAdminAddProductProps {
  vendorId: string;
  vendorName: string;
  editingProduct?: Product | null;
  onBack: () => void;
  /** Pass-through API JSON so parent can update session cache without refetch */
  onProductSaved?: (responseData?: unknown) => void;
}

export function VendorAdminAddProduct({ 
  vendorId, 
  vendorName, 
  editingProduct,
  onBack, 
  onProductSaved 
}: VendorAdminAddProductProps) {
  const mode = editingProduct ? "edit" : "add";
  const initialData = editingProduct;

  const [title, setTitle] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [price, setPrice] = useState(initialData?.price?.toString() || "");
  const [compareAtPrice, setCompareAtPrice] = useState(initialData?.compareAtPrice?.toString() || "");
  const [costPerItem, setCostPerItem] = useState(initialData?.costPerItem || "");
  const [sku, setSku] = useState(initialData?.sku || "");
  const [barcode, setBarcode] = useState(initialData?.barcode || "");
  const [inventory, setInventory] = useState(initialData?.inventory || 0);
  const [weight, setWeight] = useState(initialData?.weight || "");
  const [category, setCategory] = useState(initialData?.category || "");
  const [status, setStatus] = useState(initialData?.status || "Active");
  const [trackQuantity, setTrackQuantity] = useState(initialData?.trackQuantity !== undefined ? initialData.trackQuantity : true);
  const [continueSellingOutOfStock, setContinueSellingOutOfStock] = useState(initialData?.continueSellingOutOfStock || false);
  const [commissionRate, setCommissionRate] = useState(initialData?.commissionRate?.toString() || ""); // 🔥 Product commission rate
  const [isSaving, setIsSaving] = useState(false);
  
  // Categories
  const [categories, setCategories] = useState<string[]>([]);
  
  // Variants
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<{ name: string; values: string[] }[]>([
    { name: "", values: [""] },
  ]);
  const [variants, setVariants] = useState<Variant[]>([]);
  
  // Initialize variants from initialData when editing
  useEffect(() => {
    if (mode === "edit" && initialData) {
      if (initialData.hasVariants && initialData.variants && initialData.variants.length > 0) {
        setHasVariants(true);
        setVariants(initialData.variants);
        
        if (initialData.variantOptions && initialData.variantOptions.length > 0) {
          setVariantOptions(initialData.variantOptions);
        }
      } else if (initialData.hasVariants) {
        setHasVariants(true);
      }
    }
  }, [mode, initialData]);
  
  // Media
  const [images, setImages] = useState<string[]>(() => {
    if (initialData?.images && Array.isArray(initialData.images)) {
      return initialData.images;
    }
    return [];
  });
  const [uploadingImages, setUploadingImages] = useState(false);

  // Tags
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState("");

  // Product organization
  const [productType, setProductType] = useState(initialData?.productType || "");

  // Load categories
  useEffect(() => {
    loadCategories();
  }, [vendorId]);

  const loadCategories = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/categories/${vendorId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      } else {
        // Use default categories on error
        setCategories(["Electronics", "Clothing", "Home & Garden", "Books", "Sports", "Toys"]);
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
      setCategories(["Electronics", "Clothing", "Home & Garden", "Books", "Sports", "Toys"]);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addVariantOption = () => {
    if (variantOptions.length < 3) {
      setVariantOptions([...variantOptions, { name: `Option ${variantOptions.length + 1}`, values: [] }]);
    }
  };

  const updateVariantOptionName = (index: number, name: string) => {
    const updated = [...variantOptions];
    updated[index].name = name;
    setVariantOptions(updated);
  };

  const addSingleVariantValue = (optionIndex: number) => {
    const updated = [...variantOptions];
    updated[optionIndex].values.push('');
    setVariantOptions(updated);
  };

  const updateSingleVariantValue = (optionIndex: number, valueIndex: number, newValue: string) => {
    const updated = [...variantOptions];
    updated[optionIndex].values[valueIndex] = newValue;
    setVariantOptions(updated);
  };

  const removeSingleVariantValue = (optionIndex: number, valueIndex: number) => {
    const updated = [...variantOptions];
    updated[optionIndex].values = updated[optionIndex].values.filter((_, i) => i !== valueIndex);
    setVariantOptions(updated);
  };

  const removeVariantOption = (index: number) => {
    setVariantOptions(variantOptions.filter((_, i) => i !== index));
  };

  // Auto-generate variants when variant options change
  useEffect(() => {
    if (!hasVariants || variantOptions.length === 0) {
      setVariants([]);
      return;
    }

    const validOptions = variantOptions.filter(opt => opt.values.some(v => v.trim() !== ''));
    
    if (validOptions.length === 0) {
      setVariants([]);
      return;
    }

    const generateCombinations = (options: { name: string; values: string[] }[]): string[][] => {
      if (options.length === 0) return [[]];
      
      const [first, ...rest] = options;
      const remainingCombinations = generateCombinations(rest);
      const combinations: string[][] = [];
      
      const validValues = first.values.filter(v => v.trim() !== '');
      
      for (const value of validValues) {
        for (const combination of remainingCombinations) {
          combinations.push([value, ...combination]);
        }
      }
      
      return combinations;
    };

    const combinations = generateCombinations(validOptions);
    
    const newVariants: Variant[] = combinations.map((combo, idx) => {
      const existingVariant = variants.find(v => {
        if (validOptions.length === 1) return v.option1 === combo[0];
        if (validOptions.length === 2) return v.option1 === combo[0] && v.option2 === combo[1];
        if (validOptions.length === 3) return v.option1 === combo[0] && v.option2 === combo[1] && v.option3 === combo[2];
        return false;
      });

      if (existingVariant) {
        return existingVariant;
      }

      return {
        id: `variant-${Date.now()}-${idx}`,
        option1: combo[0] || '',
        option2: combo[1],
        option3: combo[2],
        price: '',
        sku: '',
        inventory: 0,
        weight: '',
      };
    });

    setVariants(newVariants);
  }, [variantOptions, hasVariants]);

  const updateVariant = (id: string, field: keyof Variant, value: any) => {
    setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploadingImages(true);
    toast.info("Compressing images to 500KB...", { duration: 2000 });

    try {
      // Convert FileList to Array
      const fileArray = Array.from(files);
      
      // Validate that all files are images
      const invalidFiles = fileArray.filter(f => !f.type.startsWith('image/'));
      if (invalidFiles.length > 0) {
        toast.error('Please upload only image files');
        setUploadingImages(false);
        return;
      }

      // Compress all images using the vendor utility (max 500KB each)
      const compressedDataUrls = await compressMultipleImagesToDataURLVendor(fileArray);
      
      // Add compressed images to the array
      setImages(prev => [...prev, ...compressedDataUrls]);
      toast.success(`${compressedDataUrls.length} image(s) uploaded and compressed to 500KB!`);
    } catch (error) {
      console.error("Error uploading images:", error);
      toast.error("Failed to upload images");
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const addImageUrl = () => {
    setImages([...images, ""]);
  };

  const updateImageUrl = (index: number, url: string) => {
    const updated = [...images];
    updated[index] = url;
    setImages(updated);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a product name");
      return;
    }

    if (!hasVariants && !price) {
      toast.error("Please enter a price");
      return;
    }

    if (!hasVariants && !sku.trim()) {
      toast.error("Please enter a SKU");
      return;
    }

    if (hasVariants && variants.length === 0) {
      toast.error("Please generate variants before saving");
      return;
    }

    console.log("🔍 Validation passed, starting save...");
    setIsSaving(true);
    
    try {
      const productData = {
        name: title,
        description,
        price: hasVariants ? 0 : parseFloat(price),
        compareAtPrice: hasVariants ? 0 : (compareAtPrice ? parseFloat(compareAtPrice) : undefined),
        costPerItem: costPerItem ? parseFloat(costPerItem) : undefined,
        sku: hasVariants ? "" : sku,
        barcode: hasVariants ? "" : barcode,
        inventory: hasVariants ? 0 : inventory,
        weight: hasVariants ? "" : weight,
        category,
        status,
        images: images.filter(img => img.trim()),
        tags,
        productType,
        vendor: vendorName, // Vendor name for display
        vendorId: vendorId, // Vendor ID for filtering
        trackQuantity,
        continueSellingOutOfStock,
        hasVariants,
        variants: hasVariants ? variants : undefined,
        variantOptions: hasVariants ? variantOptions : undefined,
        commissionRate: commissionRate ? parseFloat(commissionRate) : 0, // 🔥 Product commission rate (default 0)
      };

      console.log(`💾 Saving product for vendor "${vendorName}" (ID: ${vendorId}):`, {
        name: productData.name,
        vendor: productData.vendor,
        vendorId: productData.vendorId,
        category: productData.category,
        status: productData.status,
        hasVariants: productData.hasVariants,
        variantCount: productData.variants?.length || 0,
      });

      const url = mode === "edit" 
        ? `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/${initialData?.id}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products`;
      
      const method = mode === "edit" ? "PUT" : "POST";

      console.log(`📡 Making ${method} request to:`, url);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(productData),
      });

      console.log(`📨 Response status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const responseData = await response.json();
        console.log(`✅ Product saved successfully:`, responseData);
        toast.success(mode === "edit" ? "Product updated successfully!" : "Product created successfully!");
        if (onProductSaved) {
          onProductSaved(responseData);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error(`❌ Failed to save product:`, errorData);
        toast.error(`Failed to save product: ${errorData.error || errorData.details || response.statusText}`);
      }
    } catch (error) {
      console.error("❌ Error saving product:", error);
      toast.error(`Failed to save product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Products
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {mode === "edit" ? "Edit Product" : "Add New Product"}
            </h1>
            <p className="text-sm text-slate-600">
              {mode === "edit" ? "Update product details" : "Create a new product in your store"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              mode === "edit" ? "Update Product" : "Save Product"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Product name and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Product Name *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Wireless Headphones"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Describe your product..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader>
              <CardTitle>Product Images</CardTitle>
              <CardDescription>Add product photos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    {image ? (
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                        <img src={image} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="aspect-square rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2">
                        <Input
                          type="text"
                          placeholder="Image URL"
                          value={image}
                          onChange={(e) => updateImageUrl(index, e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
                <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <span className="text-sm text-slate-600">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addImageUrl}>
                <Plus className="w-4 h-4 mr-2" />
                Add Image URL
              </Button>
            </CardContent>
          </Card>

          {/* Pricing (shown when no variants) */}
          {!hasVariants && (
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>Set your product pricing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Price *</Label>
                    <Input
                      id="price"
                      type="number"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="compareAtPrice">Compare at Price</Label>
                    <Input
                      id="compareAtPrice"
                      type="number"
                      placeholder="0.00"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="costPerItem">Cost per Item</Label>
                  <Input
                    id="costPerItem"
                    type="number"
                    placeholder="0.00"
                    value={costPerItem}
                    onChange={(e) => setCostPerItem(e.target.value)}
                  />
                  {costPerItem && price && (
                    <p className="text-sm text-slate-600 mt-1">
                      Profit: {(parseFloat(price) - parseFloat(costPerItem)).toLocaleString()} Ks
                      ({((parseFloat(price) - parseFloat(costPerItem)) / parseFloat(price) * 100).toFixed(0)}% margin)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inventory (shown when no variants) */}
          {!hasVariants && (
            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
                <CardDescription>Track product inventory</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      placeholder="e.g., WH-001"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="barcode">Barcode (ISBN, UPC, etc.)</Label>
                    <Input
                      id="barcode"
                      placeholder="e.g., 123456789012"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="trackQuantity"
                    checked={trackQuantity}
                    onCheckedChange={setTrackQuantity}
                  />
                  <Label htmlFor="trackQuantity">Track quantity</Label>
                </div>
                {trackQuantity && (
                  <div>
                    <Label htmlFor="inventory">Quantity</Label>
                    <Input
                      id="inventory"
                      type="number"
                      value={inventory}
                      onChange={(e) => setInventory(parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="continueSellingOutOfStock"
                    checked={continueSellingOutOfStock}
                    onCheckedChange={setContinueSellingOutOfStock}
                  />
                  <Label htmlFor="continueSellingOutOfStock">Continue selling when out of stock</Label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shipping (shown when no variants) */}
          {!hasVariants && (
            <Card>
              <CardHeader>
                <CardTitle>Shipping</CardTitle>
                <CardDescription>Set product dimensions</CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    placeholder="0.0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variants */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Variants</CardTitle>
                  <CardDescription>Add variants like size or color</CardDescription>
                </div>
                <Checkbox
                  checked={hasVariants}
                  onCheckedChange={setHasVariants}
                />
              </div>
            </CardHeader>
            {hasVariants && (
              <CardContent className="space-y-6">
                {/* Variant Options */}
                <div className="space-y-4">
                  {variantOptions.map((option, optionIndex) => (
                    <div key={optionIndex} className="space-y-3 p-4 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Option name (e.g., Size, Color)"
                          value={option.name}
                          onChange={(e) => updateVariantOptionName(optionIndex, e.target.value)}
                          className="flex-1"
                        />
                        {variantOptions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVariantOption(optionIndex)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {option.values.map((value, valueIndex) => (
                          <div key={valueIndex} className="flex items-center gap-2">
                            <Input
                              placeholder="Value (e.g., Small, Blue)"
                              value={value}
                              onChange={(e) => updateSingleVariantValue(optionIndex, valueIndex, e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeSingleVariantValue(optionIndex, valueIndex)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addSingleVariantValue(optionIndex)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Value
                        </Button>
                      </div>
                    </div>
                  ))}
                  {variantOptions.length < 3 && (
                    <Button type="button" variant="outline" onClick={addVariantOption}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Another Option
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Variant List */}
                {variants.length > 0 && (
                  <div className="space-y-2">
                    <Label>Variant Details</Label>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Variant</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Price *</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">SKU *</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {variants.map((variant) => (
                              <tr key={variant.id}>
                                <td className="px-4 py-3 text-sm text-slate-900">
                                  {[variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / ")}
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={variant.price}
                                    onChange={(e) => updateVariant(variant.id, 'price', e.target.value)}
                                    className="w-24"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    placeholder="SKU"
                                    value={variant.sku}
                                    onChange={(e) => updateVariant(variant.id, 'sku', e.target.value)}
                                    className="w-32"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="number"
                                    value={variant.inventory}
                                    onChange={(e) => updateVariant(variant.id, 'inventory', parseInt(e.target.value) || 0)}
                                    className="w-20"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Product Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Off Shelf">Off Shelf</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Product Organization */}
          <Card>
            <CardHeader>
              <CardTitle>Product Organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="productType">Product Type</Label>
                <Input
                  id="productType"
                  placeholder="e.g., Electronics"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Commission Rate - Product-level commission */}
          <Card>
            <CardHeader>
              <CardTitle>Platform Commission</CardTitle>
              <CardDescription>Commission rate for Migoo platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                <Input
                  id="commissionRate"
                  type="number"
                  placeholder="e.g., 15"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                />
                <p className="text-sm text-slate-500 mt-1">
                  Platform commission for this product (e.g., 15% for electronics, 10% for smartphones)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
              <CardDescription>Add searchable keywords</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" onClick={addTag}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}