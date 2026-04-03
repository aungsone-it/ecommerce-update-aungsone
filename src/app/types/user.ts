/** Staff / admin user row (Settings, UserProfile, Admin header). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  avatar?: string;
  profileImageUrl?: string;
  phone?: string;
  location?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  bio?: string;
  storeId?: string;
  lastActive?: string;
  createdAt?: string;
  updatedAt?: string;
  authCreatedAt?: string;
  lastSignInAt?: string;
}
