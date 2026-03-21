import { useState, useEffect } from "react";
import { ArrowLeft, Upload, X, Plus, Calendar as CalendarIcon, ChevronDown, Image as ImageIcon, Sparkles, Loader2, Trash2, GripVertical, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";
import { compressImageToDataURL, compressMultipleImagesToDataURL } from "../../utils/imageCompression";
import { RichTextEditor } from "./RichTextEditor";
import { productsApi } from "../../utils/api";
import { apiCache } from "../utils/cache";
import { CategorySelect } from "./CategorySelect";
import { useLanguage } from "../contexts/LanguageContext";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

// Separator Component
function Separator() {
  return <div className="border-t border-slate-200" />;
}

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

interface ProductFormPageProps {
  mode: "add" | "edit" | "view";
  initialData?: any;
  onSave?: (data: any) => void;
  onCancel?: () => void;
}

export function ProductFormPage({ mode, initialData, onSave, onCancel }: ProductFormPageProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [price, setPrice] = useState(initialData?.price?.replace("$", "") || "");
  const [compareAtPrice, setCompareAtPrice] = useState(initialData?.compareAtPrice?.replace("$", "") || "");
  const [costPerItem, setCostPerItem] = useState(initialData?.costPerItem?.replace("$", "") || "");
  const [commissionRate, setCommissionRate] = useState(initialData?.commissionRate?.toString() || ""); // 🔥 Commission rate
  const [sku, setSku] = useState(initialData?.sku || "");
  const [barcode, setBarcode] = useState(initialData?.barcode || "");
  const [inventory, setInventory] = useState(initialData?.inventory || 0);
  const [weight, setWeight] = useState(initialData?.weight || "");
  const [category, setCategory] = useState(initialData?.category || "");
  const [selectedVendors, setSelectedVendors] = useState<string[]>(initialData?.selectedVendors || []); // 🔥 Multi-select vendors
  const [collaborator, setCollaborator] = useState(initialData?.collaborator || "");
  const [status, setStatus] = useState(initialData?.status || "active");
  const [trackQuantity, setTrackQuantity] = useState(initialData?.trackQuantity !== undefined ? initialData.trackQuantity : true);
  const [continueSellingOutOfStock, setContinueSellingOutOfStock] = useState(initialData?.continueSellingOutOfStock || false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 🔥 NEW: Dynamic vendor list from backend (only approved vendors)
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  
  // SKU validation states
  const [skuError, setSkuError] = useState<string>("");
  const [isCheckingSku, setIsCheckingSku] = useState(false);
  const [variantSkuErrors, setVariantSkuErrors] = useState<{ [key: string]: string }>({});
  
  // Variants
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<{ name: string; values: string[] }[]>([
    { name: "", values: [""] },
  ]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isInitializing, setIsInitializing] = useState(true); // 🔥 NEW: Track if we're loading initial data
  
  // Initialize variants from initialData when editing
  useEffect(() => {
    if (mode === "edit" && initialData) {
      console.log("📝 ====== EDIT MODE INITIALIZATION ======");
      console.log("📝 Initial Data:", JSON.stringify(initialData, null, 2));
      console.log("📝 Has Variants?:", initialData.hasVariants);
      console.log("📝 Variants Data:", JSON.stringify(initialData.variants, null, 2));
      console.log("📝 Variant Options:", JSON.stringify(initialData.variantOptions, null, 2));
      
      // Check if product has variants
      if (initialData.hasVariants && initialData.variants && initialData.variants.length > 0) {
        console.log("📝 Loading existing variants - Count:", initialData.variants.length);
        
        // Log each variant
        initialData.variants.forEach((v: any, idx: number) => {
          console.log(`📝 Variant ${idx}:`, {
            id: v.id,
            option1: v.option1,
            option2: v.option2,
            option3: v.option3,
            price: v.price,
            sku: v.sku,
            inventory: v.inventory,
            weight: v.weight
          });
        });
        
        setHasVariants(true);
        
        // Set variants FIRST before variantOptions to preserve data
        setVariants(initialData.variants);
        console.log("✅ Set variants state with", initialData.variants.length, "variants");
        
        // Reconstruct variant options from variants
        if (initialData.variantOptions && initialData.variantOptions.length > 0) {
          console.log("📝 Loading variant options:", initialData.variantOptions);
          setVariantOptions(initialData.variantOptions);
          console.log("✅ Set variantOptions state");
        } else {
          console.log("⚠️ No variantOptions found, will not auto-generate");
        }
      } else if (initialData.hasVariants) {
        // Has variants flag but no variants data - enable the section
        console.log("⚠️ Product has variants flag but no variant data");
        setHasVariants(true);
      }
      
      console.log("📝 ====== END INITIALIZATION ======");
    }
    
    // 🔥 Mark initialization as complete after a brief delay
    setTimeout(() => {
      setIsInitializing(false);
      console.log("✅ Initialization complete - isInitializing set to false");
    }, 100);
  }, [mode, initialData]);
  
  // Media
  const [images, setImages] = useState<string[]>(() => {
    // Handle both image (singular) and images (array) from initialData
    if (initialData?.images && Array.isArray(initialData.images)) {
      return initialData.images;
    }
    if (initialData?.image) {
      return [initialData.image];
    }
    return []; // Start with empty array - first uploaded image becomes cover
  });
  const [uploadingImages, setUploadingImages] = useState(false);

  // Tags
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState("");

  // Product organization
  const [productType, setProductType] = useState(initialData?.productType || "");
  const [collections, setCollections] = useState<string[]>(initialData?.collections || []);

  const isReadOnly = mode === "view";

  // Debounced SKU validation for main product
  useEffect(() => {
    if (!sku || !sku.trim() || isReadOnly || hasVariants) {
      setSkuError("");
      setIsCheckingSku(false);
      return;
    }

    setIsCheckingSku(true);
    const timeoutId = setTimeout(async () => {
      try {
        const result = await productsApi.checkSku(sku, initialData?.id);
        if (!result.isUnique) {
          setSkuError(`⚠️ SKU already exists in: ${result.existingProduct?.name || 'another product'}`);
        } else {
          setSkuError("");
        }
      } catch (error) {
        console.error("Error checking SKU:", error);
        setSkuError("");
      } finally {
        setIsCheckingSku(false);
      }
    }, 600); // Wait 600ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [sku, isReadOnly, hasVariants, initialData?.id]);

  // Debounced SKU validation for variants
  useEffect(() => {
    if (!hasVariants || isReadOnly || variants.length === 0) {
      setVariantSkuErrors({});
      return;
    }

    const timeoutId = setTimeout(async () => {
      const errors: { [key: string]: string } = {};
      
      for (const variant of variants) {
        if (variant.sku && variant.sku.trim()) {
          try {
            const result = await productsApi.checkSku(variant.sku, initialData?.id);
            if (!result.isUnique) {
              errors[variant.id] = `⚠️ Exists in: ${result.existingProduct?.name || 'another product'}`;
            }
          } catch (error) {
            console.error(`Error checking SKU for variant ${variant.id}:`, error);
          }
        }
      }
      
      setVariantSkuErrors(errors);
    }, 600); // Wait 600ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [variants, hasVariants, isReadOnly, initialData?.id]);

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


  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  // Helper function to parse price for display (removes $ and currency symbols)
  const parsePriceForDisplay = (price: string | number | undefined | null): string => {
    if (price === undefined || price === null || price === '') return '';
    
    try {
      const priceStr = String(price);
      // Remove $ and other currency symbols, extract just the number
      const numericPrice = priceStr.replace(/[$,MMK\s]/g, '').trim();
      
      // Validate it's a valid number
      if (numericPrice === '' || isNaN(Number(numericPrice))) {
        return '';
      }
      
      return numericPrice;
    } catch (error) {
      console.error('Error parsing price for display:', error, 'value:', price);
      return '';
    }
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

  // New functions for individual variant value management
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

  // Auto-generate variants when variant options change
  useEffect(() => {
    console.log("🔄 generateVariants useEffect triggered - isInitializing:", isInitializing, "mode:", mode, "hasVariants:", hasVariants);
    
    // 🔥 CRITICAL FIX: Don't regenerate variants during initial load in edit mode
    // This prevents overwriting the loaded variant data with empty defaults
    if (isInitializing && mode === "edit") {
      console.log("⏸️ Skipping variant generation during initial load");
      return;
    }
    
    if (!hasVariants || variantOptions.length === 0) {
      console.log("⏸️ Skipping variant generation - hasVariants:", hasVariants, "variantOptions:", variantOptions.length);
      setVariants([]);
      return;
    }

    // Filter out options with empty values
    const validOptions = variantOptions.filter(opt => opt.values.some(v => v.trim() !== ''));
    
    if (validOptions.length === 0) {
      console.log("⏸️ No valid options, clearing variants");
      setVariants([]);
      return;
    }
    
    console.log("✅ Generating variants from options:", validOptions);

    // Generate all combinations
    const generateCombinations = (options: { name: string; values: string[] }[]): string[][] => {
      if (options.length === 0) return [[]];
      
      const [first, ...rest] = options;
      const remainingCombinations = generateCombinations(rest);
      const combinations: string[][] = [];
      
      // Filter out empty values
      const validValues = first.values.filter(v => v.trim() !== '');
      
      for (const value of validValues) {
        for (const combination of remainingCombinations) {
          combinations.push([value, ...combination]);
        }
      }
      
      return combinations;
    };

    const combinations = generateCombinations(validOptions);
    
    // Create variant objects
    const newVariants: Variant[] = combinations.map((combo, idx) => {
      // Try to find existing variant with same options to preserve data
      const existingVariant = variants.find(v => {
        if (validOptions.length === 1) return v.option1 === combo[0];
        if (validOptions.length === 2) return v.option1 === combo[0] && v.option2 === combo[1];
        if (validOptions.length === 3) return v.option1 === combo[0] && v.option2 === combo[1] && v.option3 === combo[2];
        return false;
      });

      if (existingVariant) {
        // Return existing variant to preserve price, SKU, inventory, weight
        console.log(`✅ Preserving variant data for ${combo.join(' / ')}:`, existingVariant);
        return existingVariant;
      }

      // Create new variant with empty defaults
      console.log(`➕ Creating new variant for ${combo.join(' / ')}`);
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
  }, [hasVariants, variantOptions, isInitializing, mode]); // ⚠️ Don't include 'variants' to avoid infinite loop

  const handleSubmit = async () => {
    // Validation: Check required fields based on whether variants are enabled
    if (!title) {
      toast.error("Please fill in the product title");
      return;
    }

    // If variants are enabled, check variant data
    if (hasVariants) {
      if (variants.length === 0) {
        toast.error("Please add at least one variant");
        return;
      }
      const hasValidVariant = variants.some(v => v.sku && v.sku.trim() !== '');
      if (!hasValidVariant) {
        toast.error("Please fill in SKU for at least one variant");
        return;
      }
      // Check if at least one variant has a price
      const hasVariantWithPrice = variants.some(v => v.price && parseFloat(v.price) > 0);
      if (!hasVariantWithPrice) {
        toast.error("Please fill in price for at least one variant");
        return;
      }
    } else {
      // If no variants, check main product price and SKU
      if (!price) {
        toast.error("Please fill in all required fields: Title, Price, and SKU");
        return;
      }
      if (!sku) {
        toast.error("Please fill in all required fields: Title, Price, and SKU");
        return;
      }
    }
    
    setIsSaving(true);
    
    try {
      // Log the images being saved
      console.log(`💾 Saving product with ${images.length} images`);
      if (images.length > 0) {
        const firstImagePreview = images[0].substring(0, 50);
        console.log(`📸 First image preview: ${firstImagePreview}...`);
      }
      
      // Calculate summary data for variant products
      let finalPrice = price;
      let finalInventory = inventory;
      let finalSku = sku;
      
      if (hasVariants && variants.length > 0) {
        // Calculate total inventory from all variants
        finalInventory = variants.reduce((sum, v) => sum + (v.inventory || 0), 0);
        
        // Get the lowest price from variants (for display)
        const variantPrices = variants
          .map(v => parseFloat(v.price || '0'))
          .filter(p => p > 0);
        
        if (variantPrices.length > 0) {
          finalPrice = Math.min(...variantPrices).toString();
        } else {
          finalPrice = '0';
        }
        
        // Use first variant's SKU as the base SKU
        finalSku = variants[0]?.sku || '';
        
        console.log(`📊 Variant Summary: ${variants.length} variants, Total inventory: ${finalInventory}, Base price: $${finalPrice}`);
      }
      
      const data = {
        name: title,
        description,
        price: `$${finalPrice}`,
        compareAtPrice,
        costPerItem,
        commissionRate: commissionRate ? parseFloat(commissionRate) : 0, // 🔥 Product commission rate
        sku: finalSku,
        barcode,
        inventory: finalInventory,
        weight,
        category,
        selectedVendors,
        collaborator,
        status,
        trackQuantity,
        continueSellingOutOfStock,
        hasVariants,
        variantOptions: hasVariants ? variantOptions : [],
        variants: hasVariants ? variants : [],
        images,
        tags,
        productType,
        collections,
        salesVolume: initialData?.salesVolume || 0,
        createDate: initialData?.createdAt || new Date().toISOString(),
      };
      
      // 🔍 DEBUG: Log what we're sending to the API
      console.log('🚀 SUBMITTING PRODUCT DATA:', {
        hasVariants,
        variantOptionsCount: variantOptions.length,
        variantsCount: variants.length,
        variantOptions: hasVariants ? variantOptions : 'DISABLED',
        variants: hasVariants ? variants : 'DISABLED'
      });
      
      // Log payload size
      const payloadSize = JSON.stringify(data).length;
      const sizeInMB = (payloadSize / (1024 * 1024)).toFixed(2);
      console.log(`📦 Total payload size: ${(payloadSize / 1024).toFixed(2)} KB (${sizeInMB} MB)`);
      
      // Warn if payload is too large
      if (payloadSize > 4 * 1024 * 1024) { // 4MB warning threshold
        toast.warning(`Large upload (${sizeInMB}MB). This may take a moment...`, { duration: 3000 });
      }
      
      // If editing, pass the product ID as the first argument
      if (mode === "edit" && initialData?.id) {
        await onSave?.(initialData.id, data);
      } else {
        await onSave?.(data);
      }
    } catch (error) {
      console.error("Error saving product:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setUploadingImages(true);
      toast.info("Compressing images to 500KB...", { duration: 2000 });
      
      try {
        // Convert FileList to Array and filter only images
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
          toast.error("No valid image files selected");
          setUploadingImages(false);
          return;
        }
        
        // Compress all images using the new utility (max 500KB each)
        const compressedDataUrls = await compressMultipleImagesToDataURL(imageFiles, 500);
        
        // Add compressed images to the BEGINNING of the array (new images become cover)
        setImages(prev => [...compressedDataUrls, ...prev]);
        toast.success(`${compressedDataUrls.length} image(s) uploaded and compressed to 800KB!`);
      } catch (error) {
        console.error("Error uploading images:", error);
        toast.error("Failed to upload images");
      } finally {
        setUploadingImages(false);
        e.target.value = ''; // Reset input
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && images.length < 10) {
      setUploadingImages(true);
      toast.info("Compressing images to 500KB...", { duration: 2000 });
      
      try {
        // Convert FileList to Array and filter only images
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
          toast.error("No valid image files selected");
          setUploadingImages(false);
          return;
        }
        
        // Limit to available slots
        const availableSlots = 10 - images.length;
        const filesToProcess = imageFiles.slice(0, availableSlots);
        
        // Compress all images using the new utility (max 500KB each)
        const compressedDataUrls = await compressMultipleImagesToDataURL(filesToProcess, 500);
        
        // Add compressed images to the BEGINNING of the array (new images become cover)
        setImages(prev => [...compressedDataUrls, ...prev]);
        toast.success(`${compressedDataUrls.length} image(s) uploaded and compressed to 500KB!`);
      } catch (error) {
        console.error("Error uploading images:", error);
        toast.error("Failed to upload images");
      } finally {
        setUploadingImages(false);
      }
    }
  };

  const setAsMainImage = (index: number) => {
    const newImages = [...images];
    const [selectedImage] = newImages.splice(index, 1);
    newImages.unshift(selectedImage);
    setImages(newImages);
  };
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('addProduct.back')}
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {mode === "add" ? t('addProduct.title') : mode === "edit" ? "Edit product" : "View product"}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isReadOnly && (
                <>
                  <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                    {t('addProduct.cancel')}
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={isSaving}
                    className="bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50"
                  >
                    {isSaving && <Sparkles className="w-4 h-4 mr-2 animate-spin" />}
                    {isSaving ? "Saving..." : t('addProduct.save')}
                  </Button>
                </>
              )}
              {isReadOnly && (
                <Button variant="outline" onClick={onCancel}>
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Left Column - Main Form */}
          <div className="flex-1 space-y-6">
            {/* Title & Description */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">{t('addProduct.productTitle')}</Label>
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
                    <Label htmlFor="description">{t('addProduct.description')}</Label>
                    <div className="mt-2">
                      <RichTextEditor
                        value={description}
                        onChange={setDescription}
                        placeholder={t('addProduct.descriptionPlaceholder')}
                        readOnly={isReadOnly}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {t('addProduct.detailsHint')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Media */}
            <Card>
              <CardHeader>
                <CardTitle>{t('addProduct.media')}</CardTitle>
                <CardDescription>
                  Add up to 10 photos. Drag to reorder. First image will be the main product image.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Zone */}
                {!isReadOnly && (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors bg-slate-50"
                  >
                    <div className="flex flex-col items-center gap-3">
                      {uploadingImages ? (
                        <>
                          <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
                          <p className="text-sm font-medium text-slate-700">Uploading images...</p>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
                            <ImageIcon className="w-7 h-7 text-purple-600" />
                          </div>
                          <div>
                            <label htmlFor="image-upload" className="cursor-pointer">
                              <span className="text-sm font-medium text-purple-600 hover:text-purple-700">
                                Click to upload
                              </span>
                              <span className="text-sm text-slate-500"> or drag and drop</span>
                            </label>
                            <p className="text-xs text-slate-500 mt-1">
                              PNG, JPG, GIF up to 10MB ({10 - images.length} {10 - images.length === 1 ? 'slot' : 'slots'} remaining)
                            </p>
                          </div>
                          <input
                            id="image-upload"
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                            disabled={images.length >= 10}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Image Grid */}
                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-4">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square">
                        <img
                          src={img}
                          alt={`Product ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg border-2 border-slate-200 group-hover:border-purple-400 transition-colors"
                        />
                        
                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                          {!isReadOnly && idx > 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setAsMainImage(idx)}
                              className="h-8 text-xs"
                            >
                              Set as main
                            </Button>
                          )}
                          {!isReadOnly && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setImages(images.filter((_, i) => i !== idx))}
                              className="h-8"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        
                        {/* Main Badge */}
                        {idx === 0 && (
                          <Badge className="absolute top-2 left-2 bg-purple-600 text-white border-0 shadow-md">
                            Main Image
                          </Badge>
                        )}
                        
                        {/* Image Number */}
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                          {idx + 1} / {images.length}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Helper Text */}
                {images.length === 0 && isReadOnly && (
                  <div className="text-center py-8 text-slate-400">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No images uploaded</p>
                  </div>
                )}
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
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={price}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setPrice(Math.max(0, value).toString());
                        }}
                        onKeyDown={(e) => {
                          // Prevent minus key and 'e' (exponential notation)
                          if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                            e.preventDefault();
                          }
                        }}
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
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={compareAtPrice}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setCompareAtPrice(Math.max(0, value).toString());
                        }}
                        onKeyDown={(e) => {
                          // Prevent minus key and 'e' (exponential notation)
                          if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                            e.preventDefault();
                          }
                        }}
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
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={costPerItem}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        setCostPerItem(Math.max(0, value).toString());
                      }}
                      onKeyDown={(e) => {
                        // Prevent minus key and 'e' (exponential notation)
                        if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                          e.preventDefault();
                        }
                      }}
                      disabled={isReadOnly}
                      className="pl-7"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Customers won't see this price</p>
                </div>
                
                {/* 🔥 Commission Rate Field */}
                <div>
                  <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                  <div className="relative mt-2">
                    <Input
                      id="commissionRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="0"
                      value={commissionRate}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        setCommissionRate(Math.min(100, Math.max(0, value)).toString());
                      }}
                      onKeyDown={(e) => {
                        // Prevent minus key and 'e' (exponential notation)
                        if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                          e.preventDefault();
                        }
                      }}
                      disabled={isReadOnly}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Platform commission for this product (e.g., 15% for electronics, 10% for smartphones)</p>
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
                    {variantOptions.map((option, optionIdx) => (
                      <div key={optionIdx} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start gap-4 mb-3">
                          <div className="flex-1">
                            <Label>Option name</Label>
                            <Input
                              placeholder="Size, Color, Material"
                              value={option.name}
                              onChange={(e) => updateVariantOptionName(optionIdx, e.target.value)}
                              disabled={isReadOnly}
                              className="mt-2"
                            />
                          </div>
                          {!isReadOnly && variantOptions.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeVariantOption(optionIdx)}
                              className="mt-6"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {/* Option values with individual add/remove */}
                        <div className="space-y-2">
                          <Label className="text-sm">Option values</Label>
                          {option.values.map((value, valueIdx) => (
                            <div key={valueIdx} className="flex items-center gap-2">
                              <Input
                                placeholder="Enter value (e.g., Green, Blue, Red)"
                                value={value}
                                onChange={(e) => updateSingleVariantValue(optionIdx, valueIdx, e.target.value)}
                                disabled={isReadOnly}
                                className="flex-1"
                              />
                              {!isReadOnly && option.values.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeSingleVariantValue(optionIdx, valueIdx)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {!isReadOnly && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addSingleVariantValue(optionIdx)}
                              className="w-full mt-2"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add another value
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
                        {variants.map((variant, idx) => {
                          // Build variant display name
                          const variantName = [variant.option1, variant.option2, variant.option3]
                            .filter(Boolean)
                            .join(' / ');
                          
                          return (
                            <div key={variant.id} className="border border-slate-200 rounded-lg p-3">
                              <div className="flex items-center gap-3 mb-3">
                                <GripVertical className="w-4 h-4 text-slate-400" />
                                <span className="font-medium text-slate-900">{variantName}</span>
                              </div>
                              
                              {/* Variant Image Selector */}
                              {images.length > 0 && (
                                <div className="pl-7 mb-3">
                                  <Label className="text-xs mb-1.5 block">Variant Image</Label>
                                  <div className="flex items-start gap-3">
                                    <div className="flex flex-wrap gap-2">
                                      {images.map((url, imgIdx) => (
                                        <button
                                          key={imgIdx}
                                          type="button"
                                          onClick={() => {
                                            if (!isReadOnly) {
                                              const updated = [...variants];
                                              updated[idx].image = url;
                                              setVariants(updated);
                                            }
                                          }}
                                          disabled={isReadOnly}
                                          className={`w-14 h-14 rounded border-2 overflow-hidden transition-all ${
                                            variant.image === url
                                              ? 'border-blue-600 ring-2 ring-blue-200'
                                              : 'border-slate-200 hover:border-slate-400'
                                          } ${isReadOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                        >
                                          <img
                                            src={url}
                                            alt={`Option ${imgIdx + 1}`}
                                            className="w-full h-full object-cover"
                                          />
                                        </button>
                                      ))}
                                    </div>
                                    {variant.image && !isReadOnly && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const updated = [...variants];
                                          updated[idx].image = '';
                                          setVariants(updated);
                                        }}
                                        className="text-xs text-red-600 hover:text-red-700 h-7 px-2"
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-4 gap-3 pl-7">
                                <div>
                                  <Label className="text-xs">Price</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={parsePriceForDisplay(variant.price)}
                                    onChange={(e) => {
                                      const updated = [...variants];
                                      const value = parseFloat(e.target.value) || 0;
                                      updated[idx].price = Math.max(0, value).toString();
                                      setVariants(updated);
                                    }}
                                    onKeyDown={(e) => {
                                      // Prevent minus key and 'e' (exponential notation)
                                      if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                                        e.preventDefault();
                                      }
                                    }}
                                    disabled={isReadOnly}
                                    className="mt-1 h-9"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">SKU</Label>
                                  <Input
                                    placeholder="ABC-123"
                                    value={variant.sku || ''}
                                    onChange={(e) => {
                                      const updated = [...variants];
                                      updated[idx].sku = e.target.value;
                                      setVariants(updated);
                                    }}
                                    disabled={isReadOnly}
                                    className="mt-1 h-9"
                                  />
                                  {variantSkuErrors[variant.id] && <p className="text-xs text-red-500 mt-1.5">{variantSkuErrors[variant.id]}</p>}
                                </div>
                                <div>
                                  <Label className="text-xs">Quantity</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={variant.inventory ?? 0}
                                    onChange={(e) => {
                                      const updated = [...variants];
                                      const value = parseInt(e.target.value) || 0;
                                      // Only allow positive numbers (0 or greater)
                                      updated[idx].inventory = Math.max(0, value);
                                      setVariants(updated);
                                    }}
                                    onKeyDown={(e) => {
                                      // Prevent minus key and 'e' (exponential notation)
                                      if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                                        e.preventDefault();
                                      }
                                    }}
                                    disabled={isReadOnly}
                                    className="mt-1 h-9"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Weight</Label>
                                  <Input
                                    placeholder="0.0 kg"
                                    value={variant.weight || ''}
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
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Inventory - Only show when no variants */}
            {!hasVariants && (
              <Card>
                <CardHeader>
                  <CardTitle>Inventory</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      <p className="text-xs text-slate-500 mt-1.5">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        SKU must be unique across all products
                      </p>
                      {isCheckingSku && <p className="text-xs text-slate-500 mt-1.5">Checking SKU...</p>}
                      {skuError && <p className="text-xs text-red-500 mt-1.5">{skuError}</p>}
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
                          min="0"
                          placeholder="0"
                          value={inventory}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            // Only allow positive numbers (0 or greater)
                            setInventory(Math.max(0, value));
                          }}
                          onKeyDown={(e) => {
                            // Prevent minus key and 'e' (exponential notation)
                            if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                              e.preventDefault();
                            }
                          }}
                          disabled={isReadOnly}
                          className="mt-2"
                        />
                        <p className="text-xs text-slate-500 mt-1.5">
                          Enter initial stock quantity (positive numbers only)
                        </p>
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
                </CardContent>
              </Card>
            )}

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

          {/* Right Column - Sidebar */}
          <div className="w-96 space-y-6">
            {/* Product Status */}
            <Card>
              <CardHeader>
                <CardTitle>{t('addProduct.productStatus')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={status} onValueChange={setStatus} disabled={isReadOnly}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('products.active')}</SelectItem>
                    <SelectItem value="off-shelf">{t('products.offShelf')}</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Product Organization */}
            <Card>
              <CardHeader>
                <CardTitle>{t('addProduct.productOrganization')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="productType">{t('addProduct.productType')}</Label>
                  <Input
                    id="productType"
                    placeholder={t('addProduct.productTypePlaceholder')}
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    disabled={isReadOnly}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="category">{t('addProduct.categoryLabel')}</Label>
                  <CategorySelect 
                    value={category} 
                    onValueChange={setCategory} 
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="vendor" className="text-sm font-medium text-slate-700 mb-2 block">
                    {t('addProduct.vendorLabel')} {selectedVendors.length > 0 && <span className="text-slate-500">({selectedVendors.length} selected)</span>}
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
                            if (!isReadOnly) {
                              // 🔥 Use vendor ID instead of name (IDs never change when vendor renames)
                              const vendorId = v.id;
                              const vendorName = v.name || v.businessName;
                              
                              setSelectedVendors(prev => {
                                // Remove both ID and name (if they exist) for clean state
                                const cleaned = prev.filter(item => 
                                  item !== vendorId && 
                                  item !== vendorName && 
                                  item !== v.businessName
                                );
                                
                                // If currently selected, just return cleaned (deselect)
                                if (prev.includes(vendorId) || prev.includes(vendorName)) {
                                  return cleaned;
                                }
                                
                                // Otherwise add the vendor ID (not name)
                                return [...cleaned, vendorId];
                              });
                            }
                          }}
                        >
                          <Checkbox
                            id={`vendor-${v.id}`}
                            checked={
                              selectedVendors.includes(v.id) || 
                              selectedVendors.includes(v.name) || 
                              selectedVendors.includes(v.businessName)
                            }
                            onCheckedChange={() => {
                              if (!isReadOnly) {
                                // 🔥 Use vendor ID instead of name (IDs never change when vendor renames)
                                const vendorId = v.id;
                                const vendorName = v.name || v.businessName;
                                
                                setSelectedVendors(prev => {
                                  // Remove both ID and name (if they exist) for clean state
                                  const cleaned = prev.filter(item => 
                                    item !== vendorId && 
                                    item !== vendorName && 
                                    item !== v.businessName
                                  );
                                  
                                  // If currently selected, just return cleaned (deselect)
                                  if (prev.includes(vendorId) || prev.includes(vendorName)) {
                                    return cleaned;
                                  }
                                  
                                  // Otherwise add the vendor ID (not name)
                                  return [...cleaned, vendorId];
                                });
                              }
                            }}
                            disabled={isReadOnly}
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
                  <Label htmlFor="collaborator">{t('addProduct.collaboratorLabel')}</Label>
                  <Select value={collaborator} onValueChange={setCollaborator} disabled={isReadOnly}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder={t('addProduct.collaboratorPlaceholder')} />
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
                <CardTitle>{t('addProduct.tags')}</CardTitle>
                <CardDescription>{t('addProduct.tagsHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!isReadOnly && (
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('addProduct.enterTag')}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTag()}
                    />
                    <Button onClick={addTag} variant="outline" size="sm">
                      {t('addProduct.add')}
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
      </div>
    </div>
  );
}