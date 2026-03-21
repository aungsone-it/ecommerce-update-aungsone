import { useState, useEffect } from "react";
import { ArrowLeft, Upload, X, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { ModernRichTextEditor } from "./ModernRichTextEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { toast } from "sonner";
import { CategorySelect } from "./CategorySelect";
import { compressMultipleImages } from "../../utils/imageCompression";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

interface AddProductPageProps {
  onBack?: () => void;
  onSave?: (data: any) => void;
}

export function AddProductPage({ onBack, onSave }: AddProductPageProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [costPerItem, setCostPerItem] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [inventory, setInventory] = useState(0);
  const [weight, setWeight] = useState("");
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]); // 🔥 Multi-select vendors
  const [collaborator, setCollaborator] = useState("");
  const [status, setStatus] = useState<"active" | "off-shelf">("active"); // Changed default to "active"
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [continueSellingOutOfStock, setContinueSellingOutOfStock] = useState(false);
  const [commissionRate, setCommissionRate] = useState(""); // 🔥 Product commission rate
  
  // 🔥 NEW: Dynamic vendor list from backend (only approved vendors)
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  
  // Product types
  const [isDigitalProduct, setIsDigitalProduct] = useState(false);
  const [isPhysicalProduct, setIsPhysicalProduct] = useState(false);
  
  // Media
  const [images, setImages] = useState<string[]>([]);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

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
          console.log(`✅ MULTI-SELECT VENDORS: Loaded ${approvedVendors.length} approved vendors`, approvedVendors);
        }
      } catch (error) {
        console.error('❌ Failed to fetch vendors:', error);
      } finally {
        setLoadingVendors(false);
      }
    };
    
    fetchVendors();
  }, []);

  // Variants
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<Array<{
    id: string;
    option1: string;
    option2: string;
    option3: string;
    price: string;
    sku: string;
    inventory: number;
    image?: string; // Add image field to variants
  }>>([]);
  const [option1Name, setOption1Name] = useState("Size");
  const [option1Values, setOption1Values] = useState<string[]>(["S", "M", "L"]);
  const [option2Name, setOption2Name] = useState("");
  const [option2Values, setOption2Values] = useState<string[]>([]);
  const [option3Name, setOption3Name] = useState("");
  const [option3Values, setOption3Values] = useState<string[]>([]);
  const [showOption2, setShowOption2] = useState(false);
  const [showOption3, setShowOption3] = useState(false);

  // Generate variants based on all active options
  const generateVariants = () => {
    const allVariants: Array<{
      id: string;
      option1: string;
      option2: string;
      option3: string;
      price: string;
      sku: string;
      inventory: number;
      image?: string; // Add image field to variants
    }> = [];

    const opt1 = option1Values.filter(v => v.trim());
    const opt2 = showOption2 ? option2Values.filter(v => v.trim()) : [""];
    const opt3 = showOption3 ? option3Values.filter(v => v.trim()) : [""];

    opt1.forEach(v1 => {
      opt2.forEach(v2 => {
        opt3.forEach(v3 => {
          // Check if this variant combination already exists
          const existingVariant = variants.find(
            v => v.option1 === v1 && v.option2 === v2 && v.option3 === v3
          );
          
          const variantName = [v1, v2, v3].filter(v => v).join(" / ");
          const skuSuffix = [v1, v2, v3].filter(v => v).join("-");
          
          // If variant exists, preserve its data; otherwise create new
          allVariants.push({
            id: existingVariant?.id || Math.random().toString(36).substring(2, 9),
            option1: v1,
            option2: v2,
            option3: v3,
            price: existingVariant?.price || price || "",
            sku: existingVariant?.sku || (sku ? `${sku}-${skuSuffix}` : ""),
            inventory: existingVariant?.inventory || 0,
            image: existingVariant?.image
          });
        });
      });
    });

    console.log(`🔄 Regenerated ${allVariants.length} variants (preserved existing data)`);
    setVariants(allVariants);
  };

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Publishing
  const [salesChannels, setSalesChannels] = useState({
    onlineStore: true,
    pointOfSale: false,
  });

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addImageFromUrl = () => {
    if (urlInput.trim()) {
      setImages([...images, urlInput.trim()]);
      setUrlInput("");
      setShowUrlInput(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      try {
        const fileArray = Array.from(files);
        const compressedImages = await compressMultipleImages(fileArray, 500); // 500KB max
        setImages(prev => [...prev, ...compressedImages]);
        toast.success(`${fileArray.length} image(s) compressed and uploaded successfully!`);
      } catch (error) {
        console.error('Image compression error:', error);
        toast.error('Failed to compress images. Please try smaller files.');
      }
    }
  };

  const handleSave = () => {
    // Validation like Shopify
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    
    // Only validate price if variants are NOT enabled (variants can have their own prices)
    if (!hasVariants && (!price || parseFloat(price) < 0)) {
      toast.error("Price must be a valid positive number");
      return;
    }
    
    // Validate variant data if variants are enabled
    if (hasVariants) {
      if (variants.length === 0) {
        toast.error("Please generate variants by adding option values");
        return;
      }
      
      // Check if all variants have prices
      const variantsWithoutPrice = variants.filter(v => !v.price || parseFloat(v.price as string) <= 0);
      if (variantsWithoutPrice.length > 0) {
        toast.error(`Please set a valid price for all ${variants.length} variant(s)`);
        return;
      }
    }

    // If product has variants, calculate total inventory from all variants
    let totalInventory = inventory;
    let basePrice = parseFloat(price) || 0;
    
    if (hasVariants && variants.length > 0) {
      // Calculate total inventory from all variants
      totalInventory = variants.reduce((sum, v) => {
        const variantInventory = parseInt(String(v.inventory)) || 0;
        console.log(`  - Variant inventory: ${v.inventory} → ${variantInventory}`);
        return sum + variantInventory;
      }, 0);
      
      // Use the first variant's price if it has one, otherwise use base price
      const firstVariantPrice = parseFloat(String(variants[0].price));
      console.log(`  - First variant price: ${variants[0].price} → ${firstVariantPrice}`);
      if (!isNaN(firstVariantPrice) && firstVariantPrice > 0) {
        basePrice = firstVariantPrice;
      } else {
        console.warn(`⚠️ First variant has invalid price: ${variants[0].price}`);
      }
      
      console.log(`📊 Variant Summary: ${variants.length} variants, Total inventory: ${totalInventory}, Base price: ${basePrice}`);
    }

    // Format data exactly like Shopify backend expects
    const productData = {
      title: title.trim(),
      name: title.trim(), // For backward compatibility
      description: description || "",
      
      // Pricing - store as numbers, not strings with $
      price: basePrice,
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
      costPerItem: costPerItem ? parseFloat(costPerItem) : undefined,
      
      // Inventory & SKU - use variant data if available
      sku: sku.trim() || `SKU-${Date.now()}`, // Auto-generate if empty
      barcode: barcode.trim() || "",
      inventory: totalInventory, // Use calculated total inventory
      trackQuantity,
      continueSellingOutOfStock,
      
      // Product details
      weight: weight ? parseFloat(weight) : 0,
      category: category || "Uncategorized",
      productType: productType || "",
      vendors: selectedVendors, // 🔥 Multi-select vendors array
      collaborator: collaborator || "",
      
      // Status
      status: status,
      
      // 🔥 Commission Rate (Product-level)
      commissionRate: commissionRate ? parseFloat(commissionRate) : 0,
      
      // Media
      images: images,
      image: images[0] || "", // First image as primary
      
      // Organization
      tags: tags,
      salesChannels: salesChannels,
      
      // Variants - Format with proper structure for backend
      hasVariants: hasVariants,
      variants: hasVariants ? variants.map(v => ({
        options: {
          [option1Name]: v.option1,
          ...(showOption2 && option2Name && v.option2 ? { [option2Name]: v.option2 } : {}),
          ...(showOption3 && option3Name && v.option3 ? { [option3Name]: v.option3 } : {}),
        },
        price: parseFloat(v.price as string) || 0,
        sku: v.sku,
        inventory: v.inventory,
        image: v.image,
      })) : [],
      variantOptions: hasVariants ? [
        option1Name && option1Values.length > 0 ? { name: option1Name, values: option1Values } : null,
        showOption2 && option2Name && option2Values.length > 0 ? { name: option2Name, values: option2Values } : null,
        showOption3 && option3Name && option3Values.length > 0 ? { name: option3Name, values: option3Values } : null,
      ].filter(Boolean) : [],
      
      // Product type flags
      isDigitalProduct,
      isPhysicalProduct,
      
      // Metadata
      salesVolume: 0,
      createDate: new Date().toISOString(),
    };

    console.log("💾 Saving product data:");
    console.log("  - Title:", productData.title);
    console.log("  - Price:", productData.price, typeof productData.price);
    console.log("  - Category:", productData.category);
    console.log("  - Vendors:", productData.vendors);
    console.log("  - Collaborator:", productData.collaborator);
    console.log("  - Inventory:", productData.inventory);
    console.log("  - Has Variants:", productData.hasVariants);
    console.log("  - Variant Options:", productData.variantOptions);
    console.log("  - Variants:", productData.variants);
    if (productData.hasVariants && productData.variants.length > 0) {
      console.log("  - First Variant Structure:", JSON.stringify(productData.variants[0], null, 2));
    }
    console.log("  - Full data:", productData);
    
    onSave?.(productData);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header - More compact */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Add product</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBack}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white">
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable with visible scrollbar */}
      <div className="flex-1 overflow-y-scroll">
        <div className="w-[80%] mx-auto py-6 px-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left Column - Main Form (2 columns on desktop) */}
            <div className="xl:col-span-2 space-y-6">
              {/* Title & Description */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label htmlFor="title" className="text-sm font-medium text-slate-900 mb-2 block">
                      Title
                    </Label>
                    <Input
                      id="title"
                      placeholder="Short sweet t-shirt"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description" className="text-sm font-medium text-slate-900 mb-2 block">
                      Description <span className="text-slate-500 text-xs">(Tip: Click image icon to add images)</span>
                    </Label>
                    <ModernRichTextEditor
                      value={description}
                      onChange={setDescription}
                      placeholder="Write a detailed description... Click the image icon in the toolbar to add images directly into your description."
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Media */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Media</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0">
                  {images.length === 0 && !showUrlInput && (
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-8">
                      <div className="flex flex-col items-center justify-center text-center gap-3">
                        <div className="flex gap-2">
                          <input
                            type="file"
                            id="file-upload"
                            accept="image/*"
                            multiple
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => document.getElementById('file-upload')?.click()}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Add file
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowUrlInput(true)}
                          >
                            Add from URL
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500">
                          Accepts images, video, or 3D models
                        </p>
                      </div>
                    </div>
                  )}

                  {showUrlInput && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Paste image URL..."
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addImageFromUrl()}
                          className="h-10"
                        />
                        <Button size="sm" onClick={addImageFromUrl}>Add</Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowUrlInput(false)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {images.length > 0 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-5 gap-4">
                        {images.map((img, idx) => (
                          <div key={idx} className="relative group aspect-square">
                            <img
                              src={img}
                              alt={`Product ${idx + 1}`}
                              className="w-full h-full object-cover rounded-lg border border-slate-200"
                            />
                            <button
                              onClick={() => setImages(images.filter((_, i) => i !== idx))}
                              className="absolute top-2 right-2 bg-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                            >
                              <X className="w-3.5 h-3.5 text-slate-600" />
                            </button>
                          </div>
                        ))}
                        {images.length < 10 && (
                          <button
                            onClick={() => setShowUrlInput(true)}
                            className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <Upload className="w-6 h-6 mb-1" />
                            <span className="text-xs">Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pricing - Hide when variants are enabled */}
              {!hasVariants && (
                <Card>
                  <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold text-slate-900">Pricing</CardTitle>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price" className="text-sm font-medium text-slate-700 mb-2 block">
                        Price
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Ks</span>
                        <Input
                          id="price"
                          type="number"
                          placeholder="0"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="pl-9 h-10"
                          disabled={hasVariants}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="compareAtPrice" className="text-sm font-medium text-slate-700 mb-2 block">
                        Compare-at price
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Ks</span>
                        <Input
                          id="compareAtPrice"
                          type="number"
                          placeholder="0"
                          value={compareAtPrice}
                          onChange={(e) => setCompareAtPrice(e.target.value)}
                          className="pl-9 h-10"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Label htmlFor="costPerItem" className="text-sm font-medium text-slate-700">
                        Cost per item
                      </Label>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Ks</span>
                      <Input
                        id="costPerItem"
                        type="number"
                        placeholder="0"
                        value={costPerItem}
                        onChange={(e) => setCostPerItem(e.target.value)}
                        className="pl-9 h-10"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* 🔥 Commission Rate - ALWAYS VISIBLE (applies to entire product) */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Platform Commission</CardTitle>
                  <CardDescription className="text-sm text-slate-500 mt-1">
                    Set the commission rate that Migoo platform takes from sales of this product
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0">
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Label htmlFor="commissionRate" className="text-sm font-medium text-slate-700">
                        Commission Rate (%)
                      </Label>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="relative">
                      <Input
                        id="commissionRate"
                        type="number"
                        placeholder="0"
                        min="0"
                        max="100"
                        step="0.1"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        className="h-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      Platform commission for this product (e.g., 15% for electronics, 10% for smartphones, 8% for fashion)
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Variants */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Variants</CardTitle>
                  <CardDescription className="text-sm text-slate-500 mt-1">
                    Add variants if this product comes in multiple options, like size or color
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0">
                  {!hasVariants ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHasVariants(true);
                        // Generate initial variants when enabled
                        const newVariants = option1Values.map((val) => ({
                          id: Math.random().toString(36).substring(2, 9),
                          option1: val,
                          option2: "",
                          option3: "",
                          price: price || "",
                          sku: `${sku}-${val}` || "",
                          inventory: 0
                        }));
                        setVariants(newVariants);
                      }}
                      className="h-9"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add options like size or color
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      {/* Options Section */}
                      <div className="space-y-4">
                        {/* Option 1 */}
                        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-slate-900">Option 1</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setHasVariants(false);
                                setVariants([]);
                                setOption1Name("Size");
                                setOption1Values(["S", "M", "L"]);
                              }}
                              className="h-8 text-slate-600 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remove options
                            </Button>
                          </div>
                          
                          <div>
                            <Label className="text-xs text-slate-600 mb-2 block">Option name</Label>
                            <Input
                              placeholder="Size"
                              value={option1Name}
                              onChange={(e) => setOption1Name(e.target.value)}
                              className="h-9"
                            />
                          </div>

                          <div>
                            <Label className="text-xs text-slate-600 mb-2 block">Option values</Label>
                            <div className="space-y-2">
                              {option1Values.map((value, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <Input
                                    value={value}
                                    onChange={(e) => {
                                      const newValues = [...option1Values];
                                      newValues[idx] = e.target.value;
                                      setOption1Values(newValues);
                                      // Use generateVariants in next tick to let state update
                                      setTimeout(() => generateVariants(), 0);
                                    }}
                                    className="h-9 flex-1"
                                    placeholder={`Value ${idx + 1}`}
                                  />
                                  {option1Values.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newValues = option1Values.filter((_, i) => i !== idx);
                                        setOption1Values(newValues);
                                        // Use generateVariants in next tick to let state update
                                        setTimeout(() => generateVariants(), 0);
                                      }}
                                      className="h-9 px-2"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newValues = [...option1Values, ""];
                                  setOption1Values(newValues);
                                }}
                                className="h-8 w-full"
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Add another value
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Option 2 */}
                        {showOption2 && (
                          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium text-slate-900">Option 2</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowOption2(false)}
                                className="h-8 text-slate-600 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Remove option
                              </Button>
                            </div>
                            
                            <div>
                              <Label className="text-xs text-slate-600 mb-2 block">Option name</Label>
                              <Input
                                placeholder="Color"
                                value={option2Name}
                                onChange={(e) => setOption2Name(e.target.value)}
                                className="h-9"
                              />
                            </div>

                            <div>
                              <Label className="text-xs text-slate-600 mb-2 block">Option values</Label>
                              <div className="space-y-2">
                                {option2Values.map((value, idx) => (
                                  <div key={idx} className="flex gap-2">
                                    <Input
                                      value={value}
                                      onChange={(e) => {
                                        const newValues = [...option2Values];
                                        newValues[idx] = e.target.value;
                                        setOption2Values(newValues);
                                        // Update variants
                                        generateVariants();
                                      }}
                                      className="h-9 flex-1"
                                      placeholder={`Value ${idx + 1}`}
                                    />
                                    {option2Values.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const newValues = option2Values.filter((_, i) => i !== idx);
                                          setOption2Values(newValues);
                                          // Update variants
                                          generateVariants();
                                        }}
                                        className="h-9 px-2"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newValues = [...option2Values, ""];
                                    setOption2Values(newValues);
                                  }}
                                  className="h-8 w-full"
                                >
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  Add another value
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Option 3 */}
                        {showOption3 && (
                          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium text-slate-900">Option 3</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowOption3(false)}
                                className="h-8 text-slate-600 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Remove option
                              </Button>
                            </div>
                            
                            <div>
                              <Label className="text-xs text-slate-600 mb-2 block">Option name</Label>
                              <Input
                                placeholder="Material"
                                value={option3Name}
                                onChange={(e) => setOption3Name(e.target.value)}
                                className="h-9"
                              />
                            </div>

                            <div>
                              <Label className="text-xs text-slate-600 mb-2 block">Option values</Label>
                              <div className="space-y-2">
                                {option3Values.map((value, idx) => (
                                  <div key={idx} className="flex gap-2">
                                    <Input
                                      value={value}
                                      onChange={(e) => {
                                        const newValues = [...option3Values];
                                        newValues[idx] = e.target.value;
                                        setOption3Values(newValues);
                                        // Update variants
                                        generateVariants();
                                      }}
                                      className="h-9 flex-1"
                                      placeholder={`Value ${idx + 1}`}
                                    />
                                    {option3Values.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const newValues = option3Values.filter((_, i) => i !== idx);
                                          setOption3Values(newValues);
                                          // Update variants
                                          generateVariants();
                                        }}
                                        className="h-9 px-2"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newValues = [...option3Values, ""];
                                    setOption3Values(newValues);
                                  }}
                                  className="h-8 w-full"
                                >
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  Add another value
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Add another option button */}
                        {!showOption2 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowOption2(true);
                              setOption2Name("Color");
                              setOption2Values(["Red", "Blue", "Green"]);
                              generateVariants();
                            }}
                            className="h-9 w-full"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add another option
                          </Button>
                        )}
                        {showOption2 && !showOption3 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowOption3(true);
                              setOption3Name("Material");
                              setOption3Values(["Cotton", "Polyester"]);
                              generateVariants();
                            }}
                            className="h-9 w-full"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add another option
                          </Button>
                        )}
                      </div>

                      <Separator />

                      {/* Variants Preview Table */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-slate-900">
                            Variants ({variants.length})
                          </Label>
                        </div>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-600 w-20">Image</th>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-600">Variant</th>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-600">Price</th>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-600">SKU</th>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-600">Available</th>
                              </tr>
                            </thead>
                            <tbody>
                              {variants.map((variant, idx) => (
                                <tr key={variant.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                                  <td className="py-2.5 px-4">
                                    <div className="relative group">
                                      {variant.image ? (
                                        <div className="relative w-12 h-12">
                                          <img 
                                            src={variant.image} 
                                            alt={`Variant ${idx + 1}`} 
                                            className="w-full h-full object-cover rounded border border-slate-200"
                                          />
                                          <button
                                            onClick={() => {
                                              const newVariants = [...variants];
                                              newVariants[idx].image = undefined;
                                              setVariants(newVariants);
                                            }}
                                            className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity border border-slate-200 hover:border-slate-300"
                                          >
                                            <X className="w-3 h-3 text-slate-600" />
                                          </button>
                                        </div>
                                      ) : (
                                        <Select 
                                          value={variant.image || "none"}
                                          onValueChange={(value) => {
                                            if (value !== "none") {
                                              const newVariants = [...variants];
                                              newVariants[idx].image = value;
                                              setVariants(newVariants);
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="h-12 w-12 p-0 border-2 border-slate-200 hover:border-slate-300 transition-colors rounded bg-white">
                                            <div className="w-full h-full flex items-center justify-center">
                                              <Plus className="w-5 h-5 text-slate-400" />
                                            </div>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none" disabled>Select image</SelectItem>
                                            {images.map((img, imgIdx) => (
                                              <SelectItem key={imgIdx} value={img}>
                                                <div className="flex items-center gap-2">
                                                  <img src={img} alt={`Option ${imgIdx + 1}`} className="w-8 h-8 object-cover rounded" />
                                                  <span className="text-xs">Image {imgIdx + 1}</span>
                                                </div>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4 text-sm text-slate-700 font-medium">
                                    {[variant.option1, variant.option2, variant.option3].filter(v => v).join(" / ")}
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Ks</span>
                                      <Input
                                        type="number"
                                        placeholder="0"
                                        value={variant.price}
                                        onChange={(e) => {
                                          const newVariants = [...variants];
                                          newVariants[idx].price = e.target.value;
                                          setVariants(newVariants);
                                        }}
                                        className="pl-6 h-9 text-sm w-28"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <Input
                                      placeholder="SKU"
                                      value={variant.sku}
                                      onChange={(e) => {
                                        const newVariants = [...variants];
                                        newVariants[idx].sku = e.target.value;
                                        setVariants(newVariants);
                                      }}
                                      className="h-9 text-sm w-32"
                                    />
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={variant.inventory}
                                      onChange={(e) => {
                                        const newVariants = [...variants];
                                        newVariants[idx].inventory = parseInt(e.target.value) || 0;
                                        setVariants(newVariants);
                                      }}
                                      className="h-9 text-sm w-24"
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
              </Card>

              {/* Inventory */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Inventory</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sku" className="text-sm font-medium text-slate-700 mb-2 block">
                        SKU (Stock Keeping Unit)
                      </Label>
                      <Input
                        id="sku"
                        placeholder="ABC-12345"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="barcode" className="text-sm font-medium text-slate-700 mb-2 block">
                        Barcode (ISBN, UPC, GTIN, etc.)
                      </Label>
                      <Input
                        id="barcode"
                        placeholder="123456789012"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        className="h-10"
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
                      />
                      <Label htmlFor="trackQuantity" className="cursor-pointer font-normal text-sm text-slate-700">
                        Track quantity
                      </Label>
                    </div>
                    {trackQuantity && (
                      <div>
                        <Label htmlFor="inventory" className="text-sm font-medium text-slate-700 mb-2 block">
                          Quantity
                        </Label>
                        <Input
                          id="inventory"
                          type="number"
                          placeholder="0"
                          value={inventory}
                          onChange={(e) => setInventory(parseInt(e.target.value) || 0)}
                          className="h-10"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="continueSellingOutOfStock"
                      checked={continueSellingOutOfStock}
                      onCheckedChange={(checked) => setContinueSellingOutOfStock(checked as boolean)}
                    />
                    <Label htmlFor="continueSellingOutOfStock" className="cursor-pointer font-normal text-sm text-slate-700">
                      Continue selling when out of stock
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {/* Shipping */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Shipping</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox id="physicalProduct" defaultChecked />
                    <Label htmlFor="physicalProduct" className="cursor-pointer font-normal text-sm text-slate-700">
                      This is a physical product
                    </Label>
                  </div>
                  <div>
                    <Label htmlFor="weight" className="text-sm font-medium text-slate-700 mb-2 block">
                      Weight
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="weight"
                        placeholder="0.0"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="flex-1 h-10"
                      />
                      <Select defaultValue="kg">
                        <SelectTrigger className="w-24 h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="lb">lb</SelectItem>
                          <SelectItem value="oz">oz</SelectItem>
                          <SelectItem value="g">g</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar (1 column on desktop) */}
            <div className="xl:col-span-1 space-y-6">
              {/* Status */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-900">Status</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0">
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="off-shelf">Off-shelf</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Product Organization */}
              <Card>
                <CardHeader className="p-6 pb-4">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900">Product type</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="digitalProduct"
                      checked={isDigitalProduct}
                      onCheckedChange={(checked) => setIsDigitalProduct(checked as boolean)}
                    />
                    <Label htmlFor="digitalProduct" className="cursor-pointer font-normal text-sm text-slate-700">
                      Digital product?
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="physicalProduct"
                      checked={isPhysicalProduct}
                      onCheckedChange={(checked) => setIsPhysicalProduct(checked as boolean)}
                    />
                    <Label htmlFor="physicalProduct" className="cursor-pointer font-normal text-sm text-slate-700">
                      Physical product?
                    </Label>
                  </div>
                  <Separator />
                  <div>
                    <Label htmlFor="productCategory" className="text-sm font-medium text-slate-700 mb-2 block">
                      Product category
                    </Label>
                    <CategorySelect 
                      value={category} 
                      onValueChange={setCategory}
                    />
                  </div>
                  <div>
                    <Label htmlFor="productType" className="text-sm font-medium text-slate-700 mb-2 block">
                      Product type
                    </Label>
                    <Input
                      id="productType"
                      placeholder="e.g., Shirts"
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label htmlFor="vendor" className="text-sm font-medium text-slate-700 mb-2 block">
                      Vendors {selectedVendors.length > 0 && <span className="text-slate-500">({selectedVendors.length} selected)</span>}
                    </Label>
                    {loadingVendors ? (
                      <div className="h-10 border border-slate-300 rounded-md flex items-center justify-center text-sm text-slate-500">
                        Loading vendors...
                      </div>
                    ) : vendors.length === 0 ? (
                      <div className="h-10 border border-slate-300 rounded-md flex items-center justify-center text-sm text-slate-500">
                        No approved vendors available
                      </div>
                    ) : (
                      <div className="border border-slate-300 rounded-md max-h-48 overflow-y-auto">
                        {vendors.map((v) => (
                          <div 
                            key={v.id} 
                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-200 last:border-b-0"
                            onClick={() => {
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
                              onCheckedChange={() => {
                                const vendorName = v.name || v.businessName || v.id;
                                setSelectedVendors(prev => 
                                  prev.includes(vendorName)
                                    ? prev.filter(name => name !== vendorName)
                                    : [...prev, vendorName]
                                );
                              }}
                            />
                            <Label htmlFor={`vendor-${v.id}`} className="cursor-pointer font-normal text-sm flex-1">
                              {v.name || v.businessName || v.id}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="collaborator" className="text-sm font-medium text-slate-700 mb-2 block">
                      Collaborator
                    </Label>
                    <Select value={collaborator} onValueChange={setCollaborator}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select collaborator" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Audio Partners">Audio Partners</SelectItem>
                        <SelectItem value="Wearable World">Wearable World</SelectItem>
                        <SelectItem value="Fitness First">Fitness First</SelectItem>
                        <SelectItem value="Travel Experts">Travel Experts</SelectItem>
                        <SelectItem value="Style Studio">Style Studio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom action buttons */}
          <div className="flex items-center justify-end gap-3 pt-6 pb-8">
            <Button variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white">
              Save product
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}