import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { ModernRichTextEditor as RichTextEditor } from "./ModernRichTextEditor";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

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

interface ProductFormProps {
  mode: "add" | "edit" | "view";
  initialData?: any;
  onSave?: (data: any) => void;
  onCancel?: () => void;
}

export function ShopifyProductForm({ mode, initialData, onSave, onCancel }: ProductFormProps) {
  const [title, setTitle] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [price, setPrice] = useState(initialData?.price?.replace("$", "") || "");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [costPerItem, setCostPerItem] = useState("");
  const [sku, setSku] = useState(initialData?.sku || "");
  const [barcode, setBarcode] = useState("");
  const [inventory, setInventory] = useState(initialData?.inventory || 0);
  const [weight, setWeight] = useState("");
  const [category, setCategory] = useState(initialData?.category || "");
  const [selectedVendors, setSelectedVendors] = useState<string[]>(
    Array.isArray(initialData?.vendors) ? initialData.vendors : 
    initialData?.vendor ? [initialData.vendor] : []
  ); // 🔥 Multi-select vendors (backward compatible)
  const [collaborator, setCollaborator] = useState(initialData?.collaborator || "");
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [continueSellingOutOfStock, setContinueSellingOutOfStock] = useState(false);
  
  // 🔥 NEW: Dynamic vendor list from backend (only approved vendors)
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  
  // Variants
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<{ name: string; values: string[] }[]>([
    { name: "Size", values: ["Small", "Medium", "Large"] },
  ]);
  const [variants, setVariants] = useState<Variant[]>([
    {
      id: "1",
      option1: "Small",
      price: "",
      sku: "",
      inventory: 0,
    },
    {
      id: "2",
      option1: "Medium",
      price: "",
      sku: "",
      inventory: 0,
    },
    {
      id: "3",
      option1: "Large",
      price: "",
      sku: "",
      inventory: 0,
    },
  ]);

  // Media
  const [images, setImages] = useState<string[]>([
    initialData?.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop"
  ]);

  // Tags
  const [tags, setTags] = useState<string[]>(["electronics", "featured"]);
  const [tagInput, setTagInput] = useState("");

  // Product organization
  const [productType, setProductType] = useState("");
  const [collections, setCollections] = useState<string[]>([]);

  const isReadOnly = mode === "view";

  // 🔥 Fetch approved vendors on mount
  useEffect(() => {
    const fetchVendors = async () => {
      setLoadingVendors(true);
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          // 🔥 Filter to only show ACTIVE (approved) vendors
          const approvedVendors = (data.vendors || []).filter((v: any) => v.status === 'active');
          setVendors(approvedVendors);
          console.log(`✅ MULTI-SELECT VENDORS (EDIT MODE): Loaded ${approvedVendors.length} approved vendors`, approvedVendors);
        }
      } catch (error) {
        console.error('❌ Failed to fetch vendors:', error);
      } finally {
        setLoadingVendors(false);
      }
    };
    
    fetchVendors();
  }, []);

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

  const updateVariantOptionValues = (index: number, values: string) => {
    const updated = [...variantOptions];
    updated[index].values = values.split(",").map(v => v.trim()).filter(v => v);
    setVariantOptions(updated);
  };

  const removeVariantOption = (index: number) => {
    setVariantOptions(variantOptions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const data = {
      title,
      description,
      price: `$${price}`,
      compareAtPrice,
      costPerItem,
      sku,
      barcode,
      inventory,
      weight,
      category,
      vendors: selectedVendors, // 🔥 Multi-select vendors array
      collaborator,
      status,
      trackQuantity,
      continueSellingOutOfStock,
      hasVariants,
      variants: hasVariants ? variants : [],
      images,
      tags,
      productType,
      collections,
    };
    onSave?.(data);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Main Content - Left Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="Short sleeve t-shirt"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isReadOnly}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <div className="mt-2">
                    <RichTextEditor
                      value={description}
                      onChange={setDescription}
                      placeholder="Describe your product in detail..."
                      readOnly={isReadOnly}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Add product details, care instructions, and sizing information
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
              <CardDescription>Add photos of your product</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img}
                      alt={`Product ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-slate-200"
                    />
                    {!isReadOnly && (
                      <button
                        onClick={() => setImages(images.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      >
                        <X className="w-3 h-3 text-slate-600" />
                      </button>
                    )}
                    {idx === 0 && (
                      <Badge className="absolute bottom-1 left-1 text-xs bg-white text-slate-700 border border-slate-200">
                        Main
                      </Badge>
                    )}
                  </div>
                ))}
                {!isReadOnly && images.length < 8 && (
                  <button className="w-full h-24 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-purple-400 hover:text-purple-600 transition-colors">
                    <Upload className="w-5 h-5 mb-1" />
                    <span className="text-xs">Add image</span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price</Label>
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <Input
                      id="price"
                      type="number"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      disabled={isReadOnly}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="compareAtPrice">Compare-at price</Label>
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <Input
                      id="compareAtPrice"
                      type="number"
                      placeholder="0.00"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      disabled={isReadOnly}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="costPerItem">Cost per item</Label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <Input
                    id="costPerItem"
                    type="number"
                    placeholder="0.00"
                    value={costPerItem}
                    onChange={(e) => setCostPerItem(e.target.value)}
                    disabled={isReadOnly}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Customers won't see this price</p>
              </div>
              {compareAtPrice && parseFloat(compareAtPrice) > parseFloat(price) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Savings: ${(parseFloat(compareAtPrice) - parseFloat(price)).toFixed(2)} (
                      {(((parseFloat(compareAtPrice) - parseFloat(price)) / parseFloat(compareAtPrice)) * 100).toFixed(0)}% off)
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inventory */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasVariants && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sku">SKU (Stock Keeping Unit)</Label>
                      <Input
                        id="sku"
                        placeholder="ABC-12345"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        disabled={isReadOnly}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="barcode">Barcode (ISBN, UPC, GTIN, etc.)</Label>
                      <Input
                        id="barcode"
                        placeholder="123456789012"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        disabled={isReadOnly}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Checkbox
                        id="trackQuantity"
                        checked={trackQuantity}
                        onCheckedChange={(checked) => setTrackQuantity(checked as boolean)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="trackQuantity" className="cursor-pointer font-normal">
                        Track quantity
                      </Label>
                    </div>
                    {trackQuantity && (
                      <div>
                        <Label htmlFor="inventory">Quantity</Label>
                        <Input
                          id="inventory"
                          type="number"
                          placeholder="0"
                          value={inventory}
                          onChange={(e) => setInventory(parseInt(e.target.value) || 0)}
                          disabled={isReadOnly}
                          className="mt-2"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="continueSellingOutOfStock"
                      checked={continueSellingOutOfStock}
                      onCheckedChange={(checked) => setContinueSellingOutOfStock(checked as boolean)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="continueSellingOutOfStock" className="cursor-pointer font-normal">
                      Continue selling when out of stock
                    </Label>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Variants */}
          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>
                Add variants if this product comes in multiple versions, like different sizes or colors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasVariants"
                  checked={hasVariants}
                  onCheckedChange={(checked) => setHasVariants(checked as boolean)}
                  disabled={isReadOnly}
                />
                <Label htmlFor="hasVariants" className="cursor-pointer font-normal">
                  This product has multiple options, like different sizes or colors
                </Label>
              </div>

              {hasVariants && (
                <div className="space-y-4 pt-4">
                  {variantOptions.map((option, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 space-y-3">
                          <div>
                            <Label>Option name</Label>
                            <Input
                              placeholder="Size, Color, Material"
                              value={option.name}
                              onChange={(e) => updateVariantOptionName(idx, e.target.value)}
                              disabled={isReadOnly}
                              className="mt-2"
                            />
                          </div>
                          <div>
                            <Label>Option values</Label>
                            <Input
                              placeholder="Separate values with commas"
                              value={option.values.join(", ")}
                              onChange={(e) => updateVariantOptionValues(idx, e.target.value)}
                              disabled={isReadOnly}
                              className="mt-2"
                            />
                            <p className="text-xs text-slate-500 mt-1">Example: Small, Medium, Large</p>
                          </div>
                        </div>
                        {!isReadOnly && variantOptions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVariantOption(idx)}
                            className="mt-6"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {!isReadOnly && variantOptions.length < 3 && (
                    <Button
                      variant="outline"
                      onClick={addVariantOption}
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add another option
                    </Button>
                  )}

                  <Separator />

                  {/* Variant List */}
                  <div>
                    <h4 className="font-semibold mb-3">Variant details</h4>
                    <div className="space-y-2">
                      {variants.map((variant, idx) => (
                        <div key={variant.id} className="border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center gap-3 mb-3">
                            <GripVertical className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-900">{variant.option1}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-3 pl-7">
                            <div>
                              <Label className="text-xs">Price</Label>
                              <Input
                                type="number"
                                placeholder="0.00"
                                value={variant.price}
                                onChange={(e) => {
                                  const updated = [...variants];
                                  updated[idx].price = e.target.value;
                                  setVariants(updated);
                                }}
                                disabled={isReadOnly}
                                className="mt-1 h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">SKU</Label>
                              <Input
                                placeholder="ABC-123"
                                value={variant.sku}
                                onChange={(e) => {
                                  const updated = [...variants];
                                  updated[idx].sku = e.target.value;
                                  setVariants(updated);
                                }}
                                disabled={isReadOnly}
                                className="mt-1 h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Quantity</Label>
                              <Input
                                type="number"
                                placeholder="0"
                                value={variant.inventory}
                                onChange={(e) => {
                                  const updated = [...variants];
                                  updated[idx].inventory = parseInt(e.target.value) || 0;
                                  setVariants(updated);
                                }}
                                disabled={isReadOnly}
                                className="mt-1 h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Weight</Label>
                              <Input
                                placeholder="0.0 kg"
                                value={variant.weight}
                                onChange={(e) => {
                                  const updated = [...variants];
                                  updated[idx].weight = e.target.value;
                                  setVariants(updated);
                                }}
                                disabled={isReadOnly}
                                className="mt-1 h-9"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping */}
          <Card>
            <CardHeader>
              <CardTitle>Shipping</CardTitle>
              <CardDescription>Configure shipping details for this product</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  placeholder="0.0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-2"
                />
                <p className="text-xs text-slate-500 mt-1">Used to calculate shipping rates at checkout</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Product Status */}
          <Card>
            <CardHeader>
              <CardTitle>Product status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={status} onValueChange={setStatus} disabled={isReadOnly}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="off-shelf">Off Shelf</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Product Organization */}
          <Card>
            <CardHeader>
              <CardTitle>Product organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="productType">Product type</Label>
                <Input
                  id="productType"
                  placeholder="e.g., Shirts"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g., Electronics"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="vendor">
                  Vendors {selectedVendors.length > 0 && <span className="text-slate-500">({selectedVendors.length} selected)</span>}
                </Label>
                {loadingVendors ? (
                  <div className="mt-2 h-10 border border-slate-300 rounded-md flex items-center justify-center text-sm text-slate-500">
                    Loading vendors...
                  </div>
                ) : vendors.length === 0 ? (
                  <div className="mt-2 h-10 border border-slate-300 rounded-md flex items-center justify-center text-sm text-slate-500">
                    No approved vendors available
                  </div>
                ) : (
                  <div className="mt-2 border border-slate-300 rounded-md max-h-48 overflow-y-auto">
                    {vendors.map((v) => (
                      <div 
                        key={v.id} 
                        className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-50 border-b border-slate-200 last:border-b-0 ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        onClick={() => {
                          if (isReadOnly) return;
                          const vendorName = v.name || v.businessName || v.id;
                          setSelectedVendors(prev => 
                            prev.includes(vendorName)
                              ? prev.filter(name => name !== vendorName)
                              : [...prev, vendorName]
                          );
                        }}
                      >
                        <Checkbox
                          id={`vendor-${v.id}`}
                          checked={selectedVendors.includes(v.name || v.businessName || v.id)}
                          disabled={isReadOnly}
                          onCheckedChange={() => {
                            if (isReadOnly) return;
                            const vendorName = v.name || v.businessName || v.id;
                            setSelectedVendors(prev => 
                              prev.includes(vendorName)
                                ? prev.filter(name => name !== vendorName)
                                : [...prev, vendorName]
                            );
                          }}
                        />
                        <Label htmlFor={`vendor-${v.id}`} className={`font-normal text-sm flex-1 ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          {v.name || v.businessName || v.id}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="collaborator">Collaborator</Label>
                <Select value={collaborator} onValueChange={setCollaborator} disabled={isReadOnly}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select collaborator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Audio Partners">Audio Partners</SelectItem>
                    <SelectItem value="Wearable World">Wearable World</SelectItem>
                    <SelectItem value="Fitness First">Fitness First</SelectItem>
                    <SelectItem value="Travel Experts">Travel Experts</SelectItem>
                    <SelectItem value="Style Studio">Style Studio</SelectItem>
                    <SelectItem value="Urban Style">Urban Style</SelectItem>
                    <SelectItem value="Photo Pro">Photo Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
              <CardDescription>Add tags to help organize and find products</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isReadOnly && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTag();
                    }}
                  />
                  <Button onClick={addTag} variant="outline" size="sm">
                    Add
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    {!isReadOnly && (
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex items-center justify-between">
        <Button variant="outline" onClick={onCancel}>
          {isReadOnly ? "Close" : "Cancel"}
        </Button>
        {!isReadOnly && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStatus("draft")}>
              Save as Draft
            </Button>
            <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800">
              {mode === "edit" ? "Save Changes" : "Add Product"}
            </Button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}