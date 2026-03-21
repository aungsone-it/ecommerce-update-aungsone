// ============================================
// CORE TYPE DEFINITIONS
// ============================================

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// USER & AUTHENTICATION
// ============================================

export type UserRole = 'admin' | 'product-manager' | 'vendor' | 'collaborator' | 'customer';
export type UserStatus = 'active' | 'inactive' | 'pending';

export interface User extends BaseEntity {
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  profileImage?: string; // Storage path to profile image
  profileImageUrl?: string; // Signed URL to profile image
  lastActive?: string;
  location?: string;
  bio?: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends AuthCredentials {
  name?: string;
  phone?: string;
}

// ============================================
// PRODUCT
// ============================================

export type ProductStatus = 'Published' | 'Off Shelf';

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  inventory?: number;
  image?: string;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface Product extends BaseEntity {
  name: string;
  title?: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  category: string;
  vendor?: string; // Legacy: single vendor (for backwards compatibility)
  selectedVendors?: string[]; // 🔥 NEW: Multi-vendor support (array of vendor IDs/names)
  collaborator?: string;
  status: ProductStatus;
  inventory?: number;
  salesVolume: number;
  images: string[];
  image?: string;
  commissionRate?: number; // 🔥 NEW: Commission rate (%) that platform takes
  
  // Variant support
  hasVariants: boolean;
  options?: ProductOption[];
  variants?: ProductVariant[];
  
  // Additional metadata
  tags?: string[];
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
}

export interface ProductListItem {
  id: string;
  name: string;
  price: number;
  sku: string;
  category: string;
  vendor?: string;
  collaborator?: string;
  status: ProductStatus;
  inventory?: number;
  salesVolume: number;
  image: string | null;
  images: string[];
  description: string;
  createDate: string;
  imageCount: number;
  hasImages: boolean;
  variantCount: number;
  hasVariants: boolean;
}

// ============================================
// CATEGORY
// ============================================

export type CategoryStatus = 'active' | 'hide';

export interface Category extends BaseEntity {
  name: string;
  description: string;
  image?: string;
  coverPhoto?: string;
  productCount: number;
  productIds: string[]; // IDs of products in this category
  parentCategory?: string;
  status: CategoryStatus;
}

// ============================================
// ORDER
// ============================================

export type OrderStatus = 'pending' | 'processing' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'online';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  productId: string;
  productName: string;
  productImage?: string;
  sku: string;
  quantity: number;
  price: number;
  variantName?: string;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  city: string;
  state?: string;
  zipCode: string;
  country: string;
}

export interface Order extends BaseEntity {
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  
  shippingAddress: ShippingAddress;
  billingAddress?: ShippingAddress;
  
  notes?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}

// ============================================
// CUSTOMER
// ============================================

export interface Customer extends BaseEntity {
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate?: string;
  status: UserStatus;
  tags?: string[];
  notes?: string;
}

// ============================================
// VENDOR & COLLABORATOR
// ============================================

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface Vendor extends BaseEntity {
  name: string;
  email: string;
  phone: string;
  company: string;
  website?: string;
  address?: string;
  status: ApplicationStatus;
  productsCount: number;
  totalSales: number;
  commission: number;
  notes?: string;
}

export interface Collaborator extends BaseEntity {
  name: string;
  email: string;
  phone: string;
  specialty: string;
  status: ApplicationStatus;
  productsCount: number;
  totalSales: number;
  commission: number;
  socialMedia?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
  };
  notes?: string;
}

// ============================================
// BLOG
// ============================================

export type BlogStatus = 'draft' | 'published' | 'archived';

export interface BlogPost extends BaseEntity {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  author: string;
  authorAvatar?: string;
  category: string;
  tags: string[];
  featuredImage?: string;
  status: BlogStatus;
  publishedAt?: string;
  views: number;
  likes: number;
}

// ============================================
// WISHLIST
// ============================================

export interface Wishlist {
  productIds: string[];
  updatedAt?: string;
}

// ============================================
// NOTIFICATIONS
// ============================================

export type NotificationType = 'order' | 'product' | 'system' | 'marketing';
export type NotificationPriority = 'low' | 'medium' | 'high';

export interface Notification extends BaseEntity {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  relatedEntityId?: string;
}

// ============================================
// STATISTICS & ANALYTICS
// ============================================

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  
  todayOrders: number;
  todayRevenue: number;
  
  pendingOrders: number;
  lowStockProducts: number;
  
  revenueGrowth: number;
  orderGrowth: number;
  customerGrowth: number;
}

export interface SalesData {
  date: string;
  revenue: number;
  orders: number;
}

// ============================================
// BADGE COUNTS
// ============================================

export interface BadgeCounts {
  orders: number;
  vendor: number;
  collaborator: number;
  chat: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  warning?: string;
  error?: string;
  details?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Products API
export interface ProductsResponse {
  products: ProductListItem[];
  total: number;
  warning?: string;
}

export interface ProductResponse {
  product: Product;
}

// Orders API
export interface OrdersResponse {
  orders: Order[];
  total: number;
  warning?: string;
}

export interface OrderResponse {
  order: Order;
}

// Customers API
export interface CustomersResponse {
  customers: Customer[];
  total: number;
}

export interface CustomerResponse {
  customer: Customer;
}

// Stats API
export interface StatsResponse {
  stats: DashboardStats;
  salesData: SalesData[];
}

// Wishlist API
export interface WishlistResponse {
  productIds: string[];
}

// Auth API
export interface AuthResponse {
  success: boolean;
  user: User;
  message: string;
}

export interface ProfileResponse {
  user: User;
}

// SKU Check API
export interface SkuCheckResponse {
  isUnique: boolean;
  message: string;
  existingProduct?: {
    id: string;
    name: string;
  };
}