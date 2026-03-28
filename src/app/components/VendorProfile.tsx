import { useState, useEffect, useMemo, useRef, Component, type ReactNode } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  TrendingUp,
  Package,
  ShoppingCart,
  DollarSign,
  Edit,
  MoreVertical,
  Download,
  FileText,
  Store,
  Loader2,
  AlertCircle,
  RefreshCw,
  Plus,
  Search,
  Check
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { VendorStorefront } from "./VendorStorefront";
import { toast } from "sonner";
import { getCachedAdminOrdersPayload } from "../utils/module-cache";

type VendorStatus = "active" | "inactive" | "pending" | "suspended" | "banned";

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: VendorStatus;
  productsCount: number;
  totalRevenue: number;
  commission: number;
  joinedDate: string;
  avatar: string;
  logo?: string; // 🔥 Logo from vendor storefront settings
  description?: string;
  website?: string;
  businessName?: string;
  businessType?: string;
  businessAddress?: string;
  taxId?: string;
  bankName?: string;
  accountNumber?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: string;
  stock: number;
  status: string;
  images?: string[];
  image?: string;
  commissionRate?: number;
}

interface Order {
  id: string;
  orderNumber: string;
  date: string;
  customer: string;
  items: number;
  total: number;
  status: string;
}

interface VendorProfileProps {
  vendor: Vendor;
  onBack: () => void;
  onEdit: (vendor: Vendor) => void;
  onPreviewVendorStore?: (vendorId: string, storeSlug: string, vendor: Vendor) => void;
  onLoginAsVendor?: (vendor: Vendor) => void;
}

function parseOrderMoney(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** React throws if a plain object is rendered as a child; coerce order fields safely. */
function textForTableCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.toDate === "function") {
      try {
        const d = (o.toDate as () => Date)();
        if (d instanceof Date && !Number.isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10);
        }
      } catch {
        /* ignore */
      }
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

/** Shipping / checkout sometimes stores customer as JSON string or object — show account-style name only. */
function parseCustomerDisplayName(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const o = JSON.parse(s) as Record<string, unknown>;
        for (const key of ["fullName", "name", "customerName", "displayName"] as const) {
          const v = o[key];
          if (typeof v === "string" && v.trim() !== "") return v.trim();
        }
      } catch {
        return s;
      }
    }
    return s;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const key of ["fullName", "name", "customerName", "displayName"] as const) {
      const v = o[key];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
  }
  return "";
}

function orderDisplayCustomerName(order: any): string {
  const a = parseCustomerDisplayName(order?.customer);
  if (a) return a;
  const b = parseCustomerDisplayName(order?.customerName);
  if (b) return b;
  const ship = order?.shippingAddress ?? order?.shipping;
  const c = parseCustomerDisplayName(ship);
  if (c) return c;
  const user = order?.user;
  if (user && typeof user === "object" && !Array.isArray(user)) {
    const u = user as Record<string, unknown>;
    for (const key of ["fullName", "name", "displayName", "email"] as const) {
      const v = u[key];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
  }
  return "Guest";
}

function normalizeOrderStatusKey(status: string | undefined): string {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

type VendorCatalogKeys = { ids: Set<string>; skus: Set<string> };

function buildVendorCatalogKeys(products: Product[]): VendorCatalogKeys {
  const ids = new Set<string>();
  const skus = new Set<string>();
  for (const p of products) {
    if (p.id != null && String(p.id).trim() !== "") ids.add(String(p.id).trim());
    if (p.sku != null && String(p.sku).trim() !== "") skus.add(String(p.sku).trim());
  }
  return { ids, skus };
}

/** True when this line is sold by the vendor (checkout uses flat vendorId / vendor on items). */
function lineItemBelongsToVendor(
  item: any,
  v: Vendor,
  catalog?: VendorCatalogKeys
): boolean {
  if (item == null || typeof item !== "object") return false;
  const vid = String(v.id ?? "").trim();
  if (!vid) return false;
  const idCandidates = [item.vendorId, item.vendor, item.product?.vendorId].filter(
    (x) => x != null && String(x).trim() !== ""
  );
  if (idCandidates.some((x) => String(x).trim() === vid)) return true;
  const sel = item.product?.selectedVendors ?? item.selectedVendors;
  if (Array.isArray(sel) && sel.some((x: unknown) => String(x).trim() === vid)) return true;
  if (catalog && (catalog.ids.size > 0 || catalog.skus.size > 0)) {
    const pid = item.productId != null ? String(item.productId).trim() : "";
    const sku = item.sku != null ? String(item.sku).trim() : "";
    const cartId = item.id != null ? String(item.id).trim() : "";
    const idFromCart = cartId.includes(":") ? cartId.split(":")[0]!.trim() : "";
    if (pid && catalog.ids.has(pid)) return true;
    if (idFromCart && catalog.ids.has(idFromCart)) return true;
    if (sku && catalog.skus.has(sku)) return true;
  }
  return false;
}

function orderTouchesVendor(order: any, v: Vendor, catalog?: VendorCatalogKeys): boolean {
  if (order == null || typeof order !== "object" || Array.isArray(order)) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  if (order.items.some((it: any) => lineItemBelongsToVendor(it, v, catalog))) return true;
  const vLabel = String(v.businessName || v.name || "")
    .trim()
    .toLowerCase();
  const orderLabel = String(order.vendorName || order.vendor || "")
    .trim()
    .toLowerCase();
  return Boolean(vLabel && orderLabel && orderLabel === vLabel);
}

/** Gross line total before order-level discount (unit price × qty unless subtotal/total set). */
function orderLineGross(item: any): number {
  if (item.subtotal != null && item.subtotal !== "") return parseOrderMoney(item.subtotal);
  if (item.total != null && item.total !== "") return parseOrderMoney(item.total);
  const qty = Math.max(1, parseOrderMoney(item.quantity) || 1);
  const unit = parseOrderMoney(item.price ?? item.product?.price);
  return unit * qty;
}

/** Allocate this line's share of order-level coupon discount (matches storefront totals). */
function orderLineNetAfterDiscount(lineGross: number, order: any): number {
  const orderSub = parseOrderMoney(order.subtotal);
  const orderDisc = parseOrderMoney(order.discount);
  if (orderSub > 0 && orderDisc > 0) {
    const net = lineGross - (orderDisc * lineGross) / orderSub;
    return Math.max(0, Math.round(net * 100) / 100);
  }
  return lineGross;
}

/** Commission & vendor revenue accrue only after fulfillment pipeline (super admin ready-to-ship / fulfilled). */
const VENDOR_COMMISSION_STATUSES = new Set([
  "ready-to-ship",
  "fulfilled",
  "shipped",
  "delivered",
]);

class VendorProfileOrdersErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  render() {
    if (this.state.err) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not display vendor orders</p>
          <p className="mt-1 break-words text-red-700">{this.state.err.message}</p>
          <p className="mt-2 text-xs text-red-600">
            Try Refresh Data or reload the page. If this persists, one order row may have unexpected data
            shape.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function VendorProfile({ vendor, onBack, onEdit, onPreviewVendorStore, onLoginAsVendor }: VendorProfileProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "orders" | "contract" | "storefront">("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  
  // Product selection modal state
  const [showProductSelectModal, setShowProductSelectModal] = useState(false);
  const [allPlatformProducts, setAllPlatformProducts] = useState<any[]>([]);
  const [loadingAllProducts, setLoadingAllProducts] = useState(false);
  const [searchProductQuery, setSearchProductQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [savingProducts, setSavingProducts] = useState(false);
  
  // 🔥 Track vendor logo with state that can be updated (prioritize logo over avatar)
  const [currentVendorLogo, setCurrentVendorLogo] = useState<string>(vendor.logo || vendor.avatar || "");

  // 🔥 Track vendor storefront settings to get phone and other updated info
  const [storefrontSettings, setStorefrontSettings] = useState<any>(null);

  // Fetch vendor's products (load immediately for stats)
  useEffect(() => {
    loadProducts();
  }, [vendor.id]);

  const vendorRef = useRef(vendor);
  vendorRef.current = vendor;
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;

  // Fetch vendor's orders (load immediately for stats)
  useEffect(() => {
    loadOrders();
  }, [vendor.id]);

  // Re-filter once catalog is loaded so line items match by productId/sku (vendor id on lines may differ from admin record)
  useEffect(() => {
    if (products.length === 0) return;
    loadOrders();
  }, [products]);

  useEffect(() => {
    const onAdminOrdersUpdated = () => {
      void (async () => {
        const v = vendorRef.current;
        const catalog = buildVendorCatalogKeys(productsRef.current);
        try {
          const payload = await getCachedAdminOrdersPayload(true);
          const rawList = Array.isArray(payload.orders) ? payload.orders : [];
          const vendorOrders = rawList.filter((order: any) => {
            try {
              return orderTouchesVendor(order, v, catalog);
            } catch {
              return false;
            }
          });
          setOrders(vendorOrders);
        } catch (e) {
          console.error("[VENDOR PROFILE] adminOrdersUpdated refresh failed:", e);
        }
      })();
    };
    window.addEventListener("adminOrdersUpdated", onAdminOrdersUpdated);
    return () => window.removeEventListener("adminOrdersUpdated", onAdminOrdersUpdated);
  }, []);
  
  // 🔥 Fetch vendor storefront settings for phone number and other details
  useEffect(() => {
    loadStorefrontSettings();
  }, [vendor.id]);
  
  // 🔥 Listen for logo updates from vendor admin portal
  useEffect(() => {
    const handleLogoUpdate = (event: CustomEvent) => {
      console.log("🔄 Vendor logo updated via event:", event.detail);
      if (event.detail.vendorId === vendor.id && event.detail.logo) {
        setCurrentVendorLogo(event.detail.logo);
        toast.success("Vendor logo updated!");
      }
    };
    
    const handleSettingsUpdate = (event: CustomEvent) => {
      console.log("🔄 Vendor settings updated via event:", event.detail);
      if (event.detail.vendorId === vendor.id) {
        loadStorefrontSettings(); // Reload settings when updated
      }
    };
    
    window.addEventListener('vendorLogoUpdated', handleLogoUpdate as EventListener);
    window.addEventListener('vendorSettingsUpdated', handleSettingsUpdate as EventListener);
    
    return () => {
      window.removeEventListener('vendorLogoUpdated', handleLogoUpdate as EventListener);
      window.removeEventListener('vendorSettingsUpdated', handleSettingsUpdate as EventListener);
    };
  }, [vendor.id]);
  
  // 🔥 Update logo when vendor prop changes (prioritize logo over avatar)
  useEffect(() => {
    setCurrentVendorLogo(vendor.logo || vendor.avatar || "");
  }, [vendor.logo, vendor.avatar]);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60000);
    try {
      // Dedicated endpoint — avoids waiting on shared moduleCache(ADMIN_PRODUCTS) if another
      // screen's /products fetch is stuck or very slow (that caused endless skeletons here).
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products-admin/${encodeURIComponent(vendor.id)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          typeof errBody?.error === "string" ? errBody.error : `Request failed (${response.status})`
        );
      }

      const data = await response.json();
      const raw = Array.isArray(data.products) ? data.products : [];

      const vendorProducts: Product[] = raw.map((p: any) => {
        const st = String(p.status ?? "active").trim().toLowerCase();
        return {
          id: p.id,
          name: p.name || p.title || "",
          sku: p.sku || "",
          category: p.category || "Uncategorized",
          price: String(p.price ?? ""),
          stock: typeof p.inventory === "number" ? p.inventory : Number(p.stock) || 0,
          status: st || "active",
          images: p.images || [],
          image: p.images?.[0],
          commissionRate:
            typeof p.commissionRate === "number" ? p.commissionRate : parseFloat(p.commissionRate) || undefined,
        };
      });

      setProducts(vendorProducts);
      console.log(`[VENDOR PROFILE] Loaded ${vendorProducts.length} products for vendor ${vendor.name}`);
    } catch (error) {
      console.error("Error loading vendor products:", error);
      const msg =
        error instanceof Error && error.name === "AbortError"
          ? "Loading products timed out. Try again."
          : "Could not load vendor products.";
      toast.error(msg);
      setProducts([]);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoadingProducts(false);
    }
  };

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const payload = await getCachedAdminOrdersPayload(true);
      const catalog = buildVendorCatalogKeys(productsRef.current);

      const rawList = Array.isArray(payload.orders) ? payload.orders : [];
      const vendorOrders = rawList.filter((order: any) => {
        try {
          return orderTouchesVendor(order, vendor, catalog);
        } catch {
          return false;
        }
      });

      setOrders(vendorOrders);
      console.log(`[VENDOR PROFILE] Loaded ${vendorOrders.length} orders for vendor ${vendor.name}`);
    } catch (error) {
      console.error("Error loading vendor orders:", error);
      toast.error("Could not load vendor orders.");
      setOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadStorefrontSettings = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/storefront/${vendor.id}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${publicAnonKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStorefrontSettings(data.settings);
        console.log("✅ Loaded vendor storefront settings:", data.settings);
      }
    } catch (error) {
      console.error("❌ Error loading storefront settings:", error);
    }
  };

  // Format MMK currency with small unit
  const formatMMK = (value: number | string) => {
    if (value === null || value === undefined || value === '') {
      return <span>0 <span className="text-xs">MMK</span></span>;
    }
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) {
      return <span>0 <span className="text-xs">MMK</span></span>;
    }
    return <span>{Math.round(num).toLocaleString()} <span className="text-xs">MMK</span></span>;
  };

  // Calculate stats from real data
  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.status === "active").length;

  const safeOrders = useMemo(() => {
    return (orders as unknown[]).filter(
      (o): o is Record<string, unknown> =>
        o != null && typeof o === "object" && !Array.isArray(o)
    ) as any[];
  }, [orders]);

  const totalOrders = safeOrders.length;

  const vendorCatalogKeys = useMemo(
    () => buildVendorCatalogKeys(products),
    [products]
  );

  /** Prefer product-level rates for the headline card (matches "From product settings"). */
  const displayCommissionRate = useMemo(() => {
    const rates = products
      .map((p) => p.commissionRate)
      .filter((r): r is number => typeof r === "number" && !Number.isNaN(r) && r > 0);
    if (rates.length > 0) return Math.round(Math.max(...rates) * 100) / 100;
    const v = parseOrderMoney(vendor.commission);
    if (v > 0) return Math.round(v * 100) / 100;
    return 0;
  }, [vendor.commission, products]);

  // Revenue & commission: vendor lines only, net of order-level discount; accrue when status is ready-to-ship / fulfilled / shipped / delivered
  const { totalRevenue, commissionEarned } = useMemo(() => {
    let revenue = 0;
    let commission = 0;

    safeOrders.forEach((order: any) => {
      if (order == null || typeof order !== "object") return;
      const st = normalizeOrderStatusKey(String(order.status ?? ""));
      const shouldAccrue = VENDOR_COMMISSION_STATUSES.has(st);
      const lineItems = Array.isArray(order.items) ? order.items : [];

      lineItems.forEach((item: any) => {
        if (!lineItemBelongsToVendor(item, vendor, vendorCatalogKeys)) return;

        const gross = orderLineGross(item);
        const net = orderLineNetAfterDiscount(gross, order);

        if (shouldAccrue) {
          revenue += net;

          let productCommission = 0;
          if (
            item.commissionRate != null &&
            item.commissionRate !== "" &&
            (typeof item.commissionRate !== "number" ||
              Number.isFinite(item.commissionRate))
          ) {
            productCommission = parseOrderMoney(item.commissionRate);
          } else if (item.product?.commission != null) {
            productCommission = parseOrderMoney(item.product.commission);
          } else if (item.commission != null) {
            productCommission = parseOrderMoney(item.commission);
          } else {
            const matchedProduct = products.find(
              (p: Product) =>
                (item.sku && p.sku === item.sku) ||
                (item.name && p.name === item.name) ||
                (item.productId != null &&
                  p.id != null &&
                  String(p.id) === String(item.productId))
            );
            if (matchedProduct?.commissionRate != null) {
              productCommission = parseOrderMoney(matchedProduct.commissionRate);
            } else if (matchedProduct && (matchedProduct as any).commission != null) {
              productCommission = parseOrderMoney((matchedProduct as any).commission);
            } else {
              productCommission = parseOrderMoney(vendor.commission);
            }
          }

          commission += (net * productCommission) / 100;
        }
      });
    });

    return {
      totalRevenue: Math.round(revenue * 100) / 100,
      commissionEarned: Math.round(commission * 100) / 100,
    };
  }, [products, safeOrders, vendor.id, vendor.commission, vendorCatalogKeys]);
  
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const getStatusBadge = (status: VendorStatus) => {
    const variants: Record<string, { color: string; label: string }> = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: "Active" },
      inactive: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Inactive" },
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending" },
      suspended: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "Suspended" },
      banned: { color: "bg-red-100 text-red-700 border-red-200", label: "Banned" },
    };
    const variant = variants[status] || variants.pending;
    return (
      <Badge className={`${variant.color} border`}>
        {variant.label}
      </Badge>
    );
  };

  const getProductStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string }> = {
      active: { color: "bg-green-100 text-green-700 border-green-200", label: "Active" },
      "off-shelf": { color: "bg-red-100 text-red-700 border-red-200", label: "Off Shelf" },
      discontinued: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Discontinued" },
    };
    const variant = variants[status] || variants.active;
    return (
      <Badge className={`${variant.color} border text-xs`}>
        {variant.label}
      </Badge>
    );
  };

  const getOrderStatusBadge = (status: unknown) => {
    const normalizedStatus =
      normalizeOrderStatusKey(String(status ?? "")) || "pending";
    const variants: Record<string, { color: string; label: string }> = {
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending" },
      processing: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "Processing" },
      'ready-to-ship': { color: "bg-cyan-100 text-cyan-700 border-cyan-200", label: "Ready to Ship" },
      fulfilled: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Fulfilled" },
      shipped: { color: "bg-purple-100 text-purple-700 border-purple-200", label: "Shipped" },
      delivered: { color: "bg-green-100 text-green-700 border-green-200", label: "Delivered" },
      cancelled: { color: "bg-red-100 text-red-700 border-red-200", label: "Cancelled" },
    };
    const variant = variants[normalizedStatus] || variants.pending;
    return (
      <Badge className={`${variant.color} border text-xs`}>
        {variant.label}
      </Badge>
    );
  };

  // Load all platform products for selection modal
  const loadAllPlatformProducts = async () => {
    setLoadingAllProducts(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${publicAnonKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Filter out products already assigned to this vendor
        const availableProducts = data.products?.filter((p: any) => {
          const isAssigned = p.selectedVendors?.includes(vendor.id) || p.vendorId === vendor.id;
          return !isAssigned;
        }) || [];
        setAllPlatformProducts(availableProducts);
      }
    } catch (error) {
      console.error("Error loading platform products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoadingAllProducts(false);
    }
  };

  // Open product selection modal
  const handleSelectProduct = () => {
    setSelectedProductIds([]);
    setSearchProductQuery("");
    setShowProductSelectModal(true);
    loadAllPlatformProducts();
  };

  // Toggle product selection
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Save selected products to vendor (single bulk request — avoids N parallel PUTs + SKU full-scan timeouts)
  const handleSaveSelectedProducts = async () => {
    if (selectedProductIds.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    setSavingProducts(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/bulk-assign-vendor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            vendorId: vendor.id,
            productIds: selectedProductIds,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `Request failed (${response.status})`
        );
      }

      const updated = typeof data.updated === "number" ? data.updated : selectedProductIds.length;
      const failed = typeof data.failed === "number" ? data.failed : 0;
      if (failed > 0) {
        toast.warning(`Added ${updated} product(s); ${failed} could not be updated.`);
      } else {
        toast.success(`${updated} product(s) added to ${vendor.name}`);
      }
      setShowProductSelectModal(false);
      setSelectedProductIds([]);

      await loadProducts();
    } catch (error) {
      console.error("Error assigning products to vendor:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to assign products"
      );
    } finally {
      setSavingProducts(false);
    }
  };

  // Filter products by search query
  const filteredPlatformProducts = allPlatformProducts.filter((product) => {
    const query = searchProductQuery.toLowerCase();
    const name = String(product?.name ?? "").toLowerCase();
    const sku = String(product?.sku ?? "").toLowerCase();
    const category = String(product?.category ?? "").toLowerCase();
    return name.includes(query) || sku.includes(query) || category.includes(query);
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Vendor Profile</h1>
            <p className="text-sm text-slate-500 mt-1">View comprehensive vendor information</p>
          </div>
        </div>
        <div className="flex gap-2">
          {onLoginAsVendor && (
            <Button 
              type="button"
              variant="default"
              onClick={() => onLoginAsVendor(vendor)}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
            >
              <Store className="w-4 h-4 mr-2" />
              Login as Vendor
            </Button>
          )}
          <Button 
            type="button"
            variant="outline" 
            onClick={() => setActiveTab("storefront")}
            className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
          >
            <Store className="w-4 h-4 mr-2" />
            Manage Storefront
          </Button>
          <Button type="button" variant="outline" onClick={() => onEdit(vendor)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Vendor Info Card */}
      <Card className="p-6 border border-slate-200">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
            <img 
              src={currentVendorLogo || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${vendor.name}`}
              alt={vendor.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${vendor.name}`;
              }}
            />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-semibold text-slate-900">{vendor.name}</h2>
                  {getStatusBadge(vendor.status)}
                </div>
                <p className="text-slate-600 mb-4">{vendor.description || vendor.businessName || "Premium vendor partner"}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="w-4 h-4" />
                    <span>{vendor.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="w-4 h-4" />
                    <span>{storefrontSettings?.contactPhone || vendor.phone || "+95 9 XXX XXX XXX"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="w-4 h-4" />
                    <span>{vendor.location || "Myanmar"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" />
                    <span>Joined {vendor.joinedDate || "Recently"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Total Revenue</p>
              <p className="text-xl font-semibold text-slate-900 mt-1">{formatMMK(totalRevenue)}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Total Orders</p>
              <p className="text-xl font-semibold text-slate-900 mt-1">{totalOrders}</p>
              <p className="text-xs text-slate-400 mt-0.5">All time</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Products</p>
              <p className="text-xl font-semibold text-slate-900 mt-1">{totalProducts}</p>
              <p className="text-xs text-slate-400 mt-0.5">{activeProducts} active</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Commission Earned</p>
              <p className="text-xl font-semibold text-slate-900 mt-1">{formatMMK(commissionEarned)}</p>
              <p className="text-xs text-green-600 mt-0.5">To pay vendor</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Commission Rate</p>
              <p className="text-xl font-semibold text-slate-900 mt-1">{displayCommissionRate}%</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {parseOrderMoney(vendor.commission) <= 0 && displayCommissionRate > 0
                  ? "From product settings"
                  : "Contract rate"}
              </p>
              <p className="text-xs text-green-600 mt-0.5">{formatMMK(commissionEarned)} to pay</p>
            </div>
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-pink-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex gap-6 px-6">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("products")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "products"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Products ({totalProducts})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "orders"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Orders ({totalOrders})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("contract")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "contract"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Contract
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("storefront")}
              className={`py-4 px-2 border-b-2 transition-colors ${
                activeTab === "storefront"
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Storefront
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Vendor Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500 mb-1">Business Name</p>
                    <p className="font-medium text-slate-900">{vendor.businessName || vendor.name}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500 mb-1">Business Type</p>
                    <p className="font-medium text-slate-900">{vendor.businessType || "General"}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500 mb-1">Tax ID</p>
                    <p className="font-medium text-slate-900">{vendor.taxId || "N/A"}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500 mb-1">Bank Account</p>
                    <p className="font-medium text-slate-900">{vendor.bankName || "N/A"} - {vendor.accountNumber || "N/A"}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 mb-4">Performance Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Total Revenue</p>
                        <p className="text-xs text-slate-500">All time earnings</p>
                      </div>
                    </div>
                    <p className="text-base font-semibold text-slate-900">{formatMMK(totalRevenue)}</p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Active Products</p>
                        <p className="text-xs text-slate-500">Currently available</p>
                      </div>
                    </div>
                    <p className="text-base font-semibold text-slate-900">{activeProducts}</p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-pink-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Commission to Pay Vendor</p>
                        <p className="text-xs text-slate-500">Referral bonus at {vendor.commission}%</p>
                      </div>
                    </div>
                    <p className="text-base font-semibold text-green-600">{formatMMK(commissionEarned)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {activeTab === "products" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Vendor Products</h3>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSelectProduct}
                    className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Select Product
                  </Button>
                  <Badge variant="secondary">{totalProducts} total</Badge>
                </div>
              </div>
              
              {isLoadingProducts ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Product</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">SKU</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Category</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Price</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Stock</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <tr key={`product-skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
                              <div className="h-4 bg-slate-200 rounded w-40"></div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-24"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-20"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-24"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-12"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-6 bg-slate-200 rounded-full w-16"></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-1">No Products Yet</h3>
                  <p className="text-sm text-slate-500 mb-4">This vendor hasn't added any products</p>
                  <Button 
                    onClick={handleSelectProduct}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Select Product
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Product</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">SKU</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Category</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Price</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Stock</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <img 
                                src={product.images?.[0] || product.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"}
                                alt={product.name}
                                className="w-10 h-10 rounded-lg object-cover"
                              />
                              <span className="text-sm font-medium text-slate-900">{product.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-sm text-slate-600">{product.sku}</td>
                          <td className="p-3 text-sm text-slate-600">{product.category}</td>
                          <td className="p-3 text-sm font-medium text-slate-900">
                            {(() => {
                              // Parse price from string format like "$25.00" or numeric value
                              let priceValue = 0;
                              const rawPrice = (product as any).price || (product as any).salePrice || (product as any).regularPrice;
                              
                              if (typeof rawPrice === 'string') {
                                // Remove $, commas, and parse
                                priceValue = parseFloat(rawPrice.replace(/[$,]/g, '')) || 0;
                              } else if (typeof rawPrice === 'number') {
                                priceValue = rawPrice;
                              }
                              
                              return formatMMK(priceValue);
                            })()}
                          </td>
                          <td className="p-3 text-sm text-slate-600">{product.stock}</td>
                          <td className="p-3">{getProductStatusBadge(product.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <VendorProfileOrdersErrorBoundary>
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Vendor Orders</h3>
                <div className="flex items-center gap-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm"
                    onClick={() => { loadOrders(); loadProducts(); }}
                    disabled={isLoadingOrders}
                  >
                    {isLoadingOrders ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Refresh Data
                  </Button>
                  <Badge variant="secondary">{totalOrders} total</Badge>
                </div>
              </div>
              
              {isLoadingOrders ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Order #</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Date</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Customer</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Items</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Total</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <tr key={`order-skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-24"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-28"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-32"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-8"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-4 bg-slate-200 rounded w-24"></div>
                          </td>
                          <td className="p-3">
                            <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : safeOrders.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-1">No Orders Yet</h3>
                  <p className="text-sm text-slate-500">No orders have been placed for this vendor's products</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Order #</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Date</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Customer</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Items</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Total</th>
                        <th className="text-left p-3 text-sm font-medium text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeOrders.map((order: any, rowIdx: number) => {
                        const lineItems = Array.isArray(order.items) ? order.items : [];
                        const vendorItemsCount =
                          lineItems.filter((item: any) =>
                            lineItemBelongsToVendor(item, vendor, vendorCatalogKeys)
                          ).length || 0;

                        let vendorTotal = 0;
                        lineItems.forEach((item: any) => {
                          if (!lineItemBelongsToVendor(item, vendor, vendorCatalogKeys)) return;
                          const gross = orderLineGross(item);
                          vendorTotal += orderLineNetAfterDiscount(gross, order);
                        });
                        vendorTotal = Math.round(vendorTotal * 100) / 100;

                        const rowKey = `${textForTableCell(order.id) || textForTableCell(order.orderNumber) || "order"}-${rowIdx}`;

                        return (
                          <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 text-sm font-medium text-slate-900">
                              {textForTableCell(order.orderNumber) || "—"}
                            </td>
                            <td className="p-3 text-sm text-slate-600">{textForTableCell(order.date) || "—"}</td>
                            <td className="p-3 text-sm text-slate-600">
                              {orderDisplayCustomerName(order)}
                            </td>
                            <td className="p-3 text-sm text-slate-600">{vendorItemsCount}</td>
                            <td className="p-3 text-sm font-medium text-slate-900">{formatMMK(vendorTotal)}</td>
                            <td className="p-3">{getOrderStatusBadge(order.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </VendorProfileOrdersErrorBoundary>
          )}

          {/* Contract Tab */}
          {activeTab === "contract" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Contract Details</h3>
                <Card className="p-6 border border-slate-200 bg-slate-50">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Commission Rate</span>
                      <span className="font-semibold text-slate-900">{displayCommissionRate}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Contract Start Date</span>
                      <span className="font-medium text-slate-900">{vendor.joinedDate || "N/A"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Status</span>
                      {getStatusBadge(vendor.status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Total Earnings (Platform)</span>
                      <span className="font-semibold text-green-600">{formatMMK(commissionEarned)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Terms & Conditions</h3>
                <Card className="p-6 border border-slate-200">
                  <div className="space-y-3 text-sm text-slate-600">
                    <p>• Vendor agrees to maintain product quality standards</p>
                    <p>
                      • Commission rate of {displayCommissionRate}% applies to sales (product-level rates
                      when set)
                    </p>
                    <p>• Vendor is responsible for product inventory and fulfillment</p>
                    <p>• Platform provides marketing and sales infrastructure</p>
                    <p>• Monthly settlement of commissions on the 1st of each month</p>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Storefront Tab */}
          {activeTab === "storefront" && (
            <VendorStorefront 
              vendor={vendor}
              onPreviewStore={onPreviewVendorStore}
            />
          )}
        </div>
      </Card>

      {/* Product Selection Modal */}
      <Dialog open={showProductSelectModal} onOpenChange={setShowProductSelectModal}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Products</DialogTitle>
            <DialogDescription>
              Add products from the platform to this vendor's inventory.
            </DialogDescription>
          </DialogHeader>
          
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search products by name, SKU, or category..."
              value={searchProductQuery}
              onChange={(e) => setSearchProductQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Products List - Scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-dark">
            {loadingAllProducts ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                        <div className="w-4 h-4 bg-slate-200 rounded animate-pulse"></div>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Product</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">SKU</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Category</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Price</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Stock</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`skeleton-${index}`} className="border-b border-slate-100 animate-pulse">
                        <td className="py-3 px-4">
                          <div className="w-4 h-4 bg-slate-200 rounded"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-200 rounded"></div>
                            <div className="h-4 bg-slate-200 rounded w-40"></div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-20"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-4 bg-slate-200 rounded w-12"></div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-6 bg-slate-200 rounded-full w-16"></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filteredPlatformProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">No Products Found</h3>
                <p className="text-sm text-slate-500">
                  {searchProductQuery ? "No products match your search criteria" : "All platform products are already assigned to this vendor"}
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                        <Checkbox
                          checked={selectedProductIds.length === filteredPlatformProducts.length && filteredPlatformProducts.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProductIds(filteredPlatformProducts.map(p => p.id));
                            } else {
                              setSelectedProductIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Product</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">SKU</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Category</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Price</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Stock</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {filteredPlatformProducts.map((product) => (
                      <tr 
                        key={product.id} 
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => toggleProductSelection(product.id)}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedProductIds.includes(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img 
                              src={product.images?.[0] || product.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop"}
                              alt={product.name}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                            />
                            <span className="text-sm font-medium text-slate-900">{product.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{product.sku}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{product.category}</td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">
                          {(() => {
                            let priceValue = 0;
                            const rawPrice = (product as any).price || (product as any).salePrice || (product as any).regularPrice;
                            
                            if (typeof rawPrice === 'string') {
                              priceValue = parseFloat(rawPrice.replace(/[$,]/g, '')) || 0;
                            } else if (typeof rawPrice === 'number') {
                              priceValue = rawPrice;
                            }
                            
                            return formatMMK(priceValue);
                          })()}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{product.stock || 0}</td>
                        <td className="py-3 px-4">{getProductStatusBadge(product.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer with stats and actions */}
          <DialogFooter className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>{selectedProductIds.length} selected</span>
              <span className="text-slate-400">•</span>
              <span>{filteredPlatformProducts.length} available</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowProductSelectModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSaveSelectedProducts}
                disabled={savingProducts || selectedProductIds.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {savingProducts ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Add {selectedProductIds.length > 0 ? `${selectedProductIds.length} ` : ''}Product{selectedProductIds.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}