// ============================================
// REFACTORED API SERVICE LAYER WITH TYPES
// Version: 2.0 - Blog Engagement Features Added
// ============================================

import { apiClient } from './api-client';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import type {
  // Product types
  ProductsResponse,
  ProductResponse,
  Product,
  SkuCheckResponse,
  
  // Order types
  OrdersResponse,
  OrderResponse,
  Order,
  
  // Customer types
  CustomersResponse,
  CustomerResponse,
  Customer,
  
  // Category types
  Category,
  
  // Vendor & Collaborator types
  Vendor,
  Collaborator,
  
  // Blog types
  BlogPost,
  
  // Auth types
  AuthResponse,
  ProfileResponse,
  RegisterData,
  
  // Wishlist types
  WishlistResponse,
  
  // Stats types
  StatsResponse,
  
  // Common types
  ApiResponse,
} from '../types';

// ============================================
// PRODUCTS API
// ============================================

export const productsApi = {
  /**
   * Get all products
   */
  getAll: async (): Promise<ProductsResponse> => {
    return apiClient.get<ProductsResponse>('/products');
  },

  /**
   * Get a single product by ID
   */
  getById: async (id: string): Promise<ProductResponse> => {
    return apiClient.get<ProductResponse>(`/products/${id}`);
  },

  /**
   * Create a new product
   */
  create: async (data: Partial<Product>): Promise<ApiResponse<Product>> => {
    return apiClient.post<ApiResponse<Product>>('/products', data);
  },

  /**
   * Update an existing product
   */
  update: async (
    id: string,
    data: Partial<Product>
  ): Promise<ApiResponse<Product>> => {
    return apiClient.put<ApiResponse<Product>>(`/products/${id}`, data);
  },

  /**
   * Delete a product
   */
  delete: async (id: string): Promise<ApiResponse> => {
    return apiClient.delete<ApiResponse>(`/products/${id}`);
  },

  /**
   * Check if SKU is unique
   */
  checkSku: async (
    sku: string,
    excludeProductId?: string
  ): Promise<SkuCheckResponse> => {
    const queryParam = excludeProductId
      ? `?excludeProductId=${excludeProductId}`
      : '';
    return apiClient.get<SkuCheckResponse>(
      `/check-sku/${encodeURIComponent(sku)}${queryParam}`
    );
  },

  /**
   * Seed sample products for testing/demo
   */
  seedSampleProducts: async (): Promise<ApiResponse<{ count: number; products: Array<{ sku: string; name: string }>; coupons?: Array<{ code: string; discount: string; minAmount: string }> }>> => {
    return apiClient.post<ApiResponse<{ count: number; products: Array<{ sku: string; name: string }>; coupons?: Array<{ code: string; discount: string; minAmount: string }> }>>('/seed-products', {});
  },
};

// ============================================
// ORDERS API
// ============================================

export const ordersApi = {
  /**
   * Get all orders with retry logic
   */
  getAll: async (): Promise<OrdersResponse> => {
    return apiClient.getWithRetry<OrdersResponse>('/orders');
  },

  /**
   * Get a single order by ID
   */
  getById: async (id: string): Promise<OrderResponse> => {
    return apiClient.getWithRetry<OrderResponse>(`/orders/${id}`);
  },

  /**
   * Create a new order
   */
  create: async (orderData: Partial<Order>): Promise<ApiResponse<Order>> => {
    return apiClient.post<ApiResponse<Order>>('/orders', orderData);
  },

  /**
   * Update an existing order
   */
  update: async (
    id: string,
    orderData: Partial<Order>
  ): Promise<ApiResponse<Order>> => {
    return apiClient.put<ApiResponse<Order>>(`/orders/${id}`, orderData);
  },

  /**
   * Delete a single order
   */
  delete: async (id: string): Promise<ApiResponse<void>> => {
    return apiClient.delete<ApiResponse<void>>(`/orders/${id}`);
  },

  /**
   * Delete ALL orders (for testing/cleanup)
   */
  deleteAll: async (): Promise<ApiResponse<{ deletedCount: number }>> => {
    return apiClient.delete<ApiResponse<{ deletedCount: number }>>('/orders');
  },
};

// ============================================
// CATEGORIES API
// ============================================

export const categoriesApi = {
  /**
   * Get all categories
   */
  getAll: async (): Promise<ApiResponse<Category[]>> => {
    return apiClient.get<ApiResponse<Category[]>>('/categories');
  },

  /**
   * Get a single category by ID
   */
  getById: async (id: string): Promise<ApiResponse<Category>> => {
    return apiClient.get<ApiResponse<Category>>(`/categories/${id}`);
  },

  /**
   * Create a new category
   */
  create: async (categoryData: Partial<Category>): Promise<ApiResponse<Category>> => {
    return apiClient.post<ApiResponse<Category>>('/categories', categoryData);
  },

  /**
   * Update an existing category
   */
  update: async (
    id: string,
    categoryData: Partial<Category>
  ): Promise<ApiResponse<Category>> => {
    return apiClient.put<ApiResponse<Category>>(`/categories/${id}`, categoryData);
  },

  /**
   * Delete a single category
   */
  delete: async (id: string): Promise<ApiResponse<void>> => {
    return apiClient.delete<ApiResponse<void>>(`/categories/${id}`);
  },

  /**
   * Bulk delete categories
   */
  bulkDelete: async (ids: string[]): Promise<ApiResponse<void>> => {
    return apiClient.post<ApiResponse<void>>('/categories/bulk-delete', { ids });
  },

  /**
   * Delete all categories (cleanup)
   */
  deleteAll: async (): Promise<ApiResponse<void>> => {
    return apiClient.delete<ApiResponse<void>>('/categories/all');
  },
};

// ============================================
// CUSTOMERS API
// ============================================

export const customersApi = {
  /**
   * Get all customers
   */
  getAll: async (): Promise<CustomersResponse> => {
    return apiClient.get<CustomersResponse>('/customers');
  },

  /**
   * Get a single customer by ID
   */
  getById: async (id: string): Promise<CustomerResponse> => {
    return apiClient.get<CustomerResponse>(`/customers/${id}`);
  },

  /**
   * Create a new customer
   */
  create: async (
    customerData: Partial<Customer>
  ): Promise<ApiResponse<Customer>> => {
    return apiClient.post<ApiResponse<Customer>>('/customers', customerData);
  },

  /**
   * Update an existing customer
   */
  update: async (
    id: string,
    customerData: Partial<Customer>
  ): Promise<ApiResponse<Customer>> => {
    return apiClient.put<ApiResponse<Customer>>(
      `/customers/${id}`,
      customerData
    );
  },
};

// ============================================
// VENDORS API
// ============================================

export const vendorsApi = {
  /**
   * Get all vendors
   */
  getAll: async (): Promise<ApiResponse<Vendor[]>> => {
    return apiClient.get<ApiResponse<Vendor[]>>('/vendors');
  },

  /**
   * Create a new vendor
   */
  create: async (vendorData: Partial<Vendor>): Promise<ApiResponse<Vendor>> => {
    return apiClient.post<ApiResponse<Vendor>>('/vendors', vendorData);
  },

  /**
   * Update an existing vendor
   */
  update: async (
    id: string,
    vendorData: Partial<Vendor>
  ): Promise<ApiResponse<Vendor>> => {
    return apiClient.put<ApiResponse<Vendor>>(`/vendors/${id}`, vendorData);
  },
};

// ============================================
// VENDOR APPLICATIONS API
// ============================================

export const vendorApplicationsApi = {
  /**
   * Get all vendor applications (silent mode - no error toasts)
   */
  getAll: async (): Promise<ApiResponse<any[]>> => {
    try {
      return await apiClient.get<ApiResponse<any[]>>('/vendor-applications', { silent: true });
    } catch (error) {
      // Silently fail and return empty applications
      console.debug('Vendor applications not loaded (endpoint may not be initialized yet)');
      return { success: true, data: [] };
    }
  },

  /**
   * Get single vendor application
   */
  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiClient.get<ApiResponse<any>>(`/vendor-applications/${id}`);
  },

  /**
   * Update vendor application status
   */
  updateStatus: async (
    id: string,
    status: string,
    reviewNotes?: string,
    reviewedBy?: string
  ): Promise<ApiResponse<any>> => {
    return apiClient.put<ApiResponse<any>>(`/vendor-applications/${id}`, {
      status,
      reviewNotes,
      reviewedBy: reviewedBy || 'Admin',
    });
  },
};

// ============================================
// COLLABORATORS API
// ============================================

export const collaboratorsApi = {
  /**
   * Get all collaborators
   */
  getAll: async (): Promise<ApiResponse<Collaborator[]>> => {
    return apiClient.get<ApiResponse<Collaborator[]>>('/collaborators');
  },

  /**
   * Create a new collaborator
   */
  create: async (
    collaboratorData: Partial<Collaborator>
  ): Promise<ApiResponse<Collaborator>> => {
    return apiClient.post<ApiResponse<Collaborator>>(
      '/collaborators',
      collaboratorData
    );
  },

  /**
   * Update an existing collaborator
   */
  update: async (
    id: string,
    collaboratorData: Partial<Collaborator>
  ): Promise<ApiResponse<Collaborator>> => {
    return apiClient.put<ApiResponse<Collaborator>>(
      `/collaborators/${id}`,
      collaboratorData
    );
  },
};

// ============================================
// BLOG POSTS API
// ============================================

export const blogApi = {
  /**
   * Get all blog posts
   */
  getAll: async (): Promise<ApiResponse<BlogPost[]>> => {
    return apiClient.get<ApiResponse<BlogPost[]>>('/blog-posts');
  },

  /**
   * Create a new blog post
   */
  create: async (
    blogData: Partial<BlogPost>
  ): Promise<ApiResponse<BlogPost>> => {
    return apiClient.post<ApiResponse<BlogPost>>('/blog-posts', blogData);
  },

  /**
   * Update an existing blog post
   */
  update: async (
    id: string,
    blogData: Partial<BlogPost>
  ): Promise<ApiResponse<BlogPost>> => {
    return apiClient.put<ApiResponse<BlogPost>>(`/blog-posts/${id}`, blogData);
  },

  /**
   * Delete a blog post
   */
  delete: async (id: string): Promise<ApiResponse> => {
    return apiClient.delete<ApiResponse>(`/blog-posts/${id}`);
  },
};

// ============================================
// BLOG ENGAGEMENT API (Comments, Likes, Notifications)
// ============================================

export const blogCommentsApi = {
  /**
   * Get comments for a blog post
   */
  getComments: async (postId: string): Promise<ApiResponse<any[]>> => {
    return apiClient.get<ApiResponse<any[]>>(`/blog-posts/${postId}/comments`);
  },

  /**
   * Create a comment on a blog post
   */
  createComment: async (postId: string, commentData: {
    author: string;
    authorAvatar?: string;
    content: string;
    parentId?: string | null;
  }): Promise<ApiResponse<any>> => {
    return apiClient.post<ApiResponse<any>>(`/blog-posts/${postId}/comments`, commentData);
  },

  /**
   * Update a comment
   */
  updateComment: async (commentId: string, content: string): Promise<ApiResponse<any>> => {
    return apiClient.put<ApiResponse<any>>(`/comments/${commentId}`, { content });
  },

  /**
   * Delete a comment
   */
  deleteComment: async (commentId: string): Promise<ApiResponse> => {
    return apiClient.delete<ApiResponse>(`/comments/${commentId}`);
  },

  /**
   * Like/Unlike a comment
   */
  toggleLike: async (commentId: string): Promise<ApiResponse<any>> => {
    return apiClient.post<ApiResponse<any>>(`/comments/${commentId}/like`, {});
  },
};

export const blogLikesApi = {
  /**
   * Like/Unlike a blog post
   */
  toggleLike: async (postId: string, userId?: string): Promise<ApiResponse<{ likes: number; isLiked: boolean }>> => {
    return apiClient.post<ApiResponse<{ likes: number; isLiked: boolean }>>(`/blog-posts/${postId}/like`, { userId: userId || 'anonymous' });
  },
};

export const notificationsApi = {
  /**
   * Get all notifications
   */
  getAll: async (): Promise<ApiResponse<any[]> & { unreadCount: number }> => {
    return apiClient.get<ApiResponse<any[]> & { unreadCount: number }>('/notifications');
  },

  /**
   * Mark notification as read
   */
  markAsRead: async (id: string): Promise<ApiResponse<any>> => {
    return apiClient.put<ApiResponse<any>>(`/notifications/${id}/read`, {});
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async (): Promise<ApiResponse> => {
    return apiClient.put<ApiResponse>('/notifications/read-all', {});
  },

  /**
   * Delete a notification
   */
  delete: async (id: string): Promise<ApiResponse> => {
    return apiClient.delete<ApiResponse>(`/notifications/${id}`);
  },
};

// ============================================
// DASHBOARD STATS API
// ============================================

export const statsApi = {
  /**
   * Get dashboard statistics
   */
  getStats: async (): Promise<StatsResponse> => {
    return apiClient.get<StatsResponse>('/stats');
  },
};

// ============================================
// CHAT API
// ============================================

export const chatApi = {
  /**
   * Get all chat conversations (silent mode - no error toasts)
   */
  getConversations: async () => {
    try {
      return await apiClient.get('/chat/conversations', { silent: true });
    } catch (error) {
      // Silently fail and return empty conversations
      console.debug('Chat conversations not loaded (endpoint may not be initialized yet)');
      return { conversations: [] };
    }
  },

  /**
   * Get messages for a specific conversation
   */
  getMessages: async (conversationId: string) => {
    return apiClient.get(`/chat/messages/${conversationId}`);
  },

  /**
   * Send a new message
   */
  sendMessage: async (data: {
    conversationId?: string;
    text: string;
    sender: 'customer' | 'admin';
    senderName: string;
    customerEmail?: string;
    /** When sender is admin, pass the customer's display name so the thread header stays correct */
    customerName?: string;
    imageUrl?: string;
    vendorId?: string;
    customerProfileImage?: string;
  }) => {
    return apiClient.post('/chat/messages', data);
  },

  /**
   * Mark conversation messages as read
   */
  markAsRead: async (conversationId: string) => {
    return apiClient.put(`/chat/messages/${conversationId}/read`);
  },

  /**
   * Upload image for chat
   */
  uploadImage: async (imageData: string, fileName: string, conversationId?: string) => {
    return apiClient.post('/chat/upload-image', {
      imageData,
      fileName,
      conversationId,
    });
  },
  
  // Export credentials for direct API calls
  projectId,
  publicAnonKey,
};

// ============================================
// AUTH API
// ============================================

export const authApi = {
  /**
   * Register a new user
   */
  register: async (
    email: string,
    password: string,
    name?: string,
    phone?: string,
    profileImage?: string
  ): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/register', {
      email,
      password,
      name,
      phone,
      profileImage,
    });
  },

  /**
   * Login user
   */
  login: async (email: string, password: string): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/login', { email, password });
  },

  /**
   * Get user profile
   */
  getProfile: async (userId: string): Promise<ProfileResponse> => {
    return apiClient.get<ProfileResponse>(`/auth/profile/${userId}`);
  },

  /**
   * Update user profile
   */
  updateProfile: async (
    userId: string,
    profileData: any
  ): Promise<ApiResponse> => {
    return apiClient.put<ApiResponse>(`/auth/profile/${userId}`, profileData);
  },

  /**
   * Change user password
   */
  changePassword: async (
    email: string,
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse> => {
    return apiClient.post<ApiResponse>('/auth/change-password', {
      email,
      currentPassword,
      newPassword,
    });
  },
};

// ============================================
// WISHLIST API
// ============================================

export const wishlistApi = {
  /**
   * Get user wishlist
   */
  get: async (userId: string): Promise<WishlistResponse> => {
    return apiClient.get<WishlistResponse>(`/wishlist/${userId}`);
  },

  /**
   * Update user wishlist
   */
  update: async (
    userId: string,
    productIds: string[]
  ): Promise<ApiResponse> => {
    return apiClient.put<ApiResponse>(`/wishlist/${userId}`, { productIds });
  },

  /**
   * Add product to wishlist
   */
  add: async (userId: string, productId: string): Promise<ApiResponse> => {
    return apiClient.post<ApiResponse>(
      `/wishlist/${userId}/add/${productId}`
    );
  },

  /**
   * Remove product from wishlist
   */
  remove: async (userId: string, productId: string): Promise<ApiResponse> => {
    return apiClient.delete<ApiResponse>(
      `/wishlist/${userId}/remove/${productId}`
    );
  },
};

// ============================================
// EXPORT API CLIENT FOR DIRECT ACCESS
// ============================================
export { apiClient };