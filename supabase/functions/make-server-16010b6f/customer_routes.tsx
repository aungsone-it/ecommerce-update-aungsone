import { Hono } from "npm:hono@4";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { ensureBucket } from "./storage_bucket_helpers.tsx";

const customerApp = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Bucket name for customer profile images
const BUCKET_NAME = "make-16010b6f-customer-images";

// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
    )
  ]);
}

// 🔥 OPTIMIZED: Find customer by userId without fetching all customers
async function findCustomerByUserId(userId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from("kv_store_16010b6f")
      .select("value")
      .like("key", "customer:%")
      .limit(1000); // Reasonable limit to prevent timeouts
    
    if (error) {
      console.error("❌ Error querying customers by userId:", error);
      return null;
    }
    
    // Find the customer with matching userId in the results
    const customer = data?.find((row: any) => {
      const value = row.value;
      return value && value.userId === userId;
    });
    
    return customer?.value || null;
  } catch (error) {
    console.error("❌ Exception in findCustomerByUserId:", error);
    return null;
  }
}

// 🔥 INITIALIZE STORAGE BUCKET ON STARTUP
async function initializeStorageBucket() {
  try {
    console.log("🪣 Checking if customer images bucket exists...");
    
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log("🪣 Creating customer images bucket...");
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false, // Private bucket
        fileSizeLimit: 524288, // 512KB = 524288 bytes
      });
      
      if (error && error.message !== 'The resource already exists') {
        console.error("❌ Failed to create bucket:", error);
      } else if (error && error.message === 'The resource already exists') {
        console.log("✅ Customer images bucket already exists");
      } else {
        console.log("✅ Customer images bucket created successfully");
      }
    } else {
      console.log("✅ Customer images bucket already exists");
    }
  } catch (error) {
    console.error("❌ Error initializing storage bucket:", error);
  }
}

// Initialize bucket
initializeStorageBucket();

// ============================================
// CUSTOMER MANAGEMENT ENDPOINTS
// ============================================

// Get all customers
customerApp.get("/customers", async (c) => {
  try {
    console.log("📊 Fetching all customers...");
    
    const customers = await withTimeout(kv.getByPrefix("customer:"), 45000);
    
    // 🔥 FILTER OUT INVALID DATA - Only return proper customer objects
    const validCustomers = Array.isArray(customers) 
      ? customers.filter(c => {
          // Must not be null/undefined
          if (c == null) {
            return false;
          }
          // Must be an object (not array, not primitive)
          if (typeof c !== 'object' || Array.isArray(c)) {
            // 🔇 SILENTLY SKIP corrupted entries - no need to log every time
            return false;
          }
          // Must have an ID
          if (!c.id || typeof c.id !== 'string') {
            return false;
          }
          return true;
        })
      : [];
    
    console.log(`✅ Found ${validCustomers.length} valid customers (filtered from ${customers?.length || 0} total)`);
    
    return c.json({
      success: true,
      customers: validCustomers,
      total: validCustomers.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching customers:", error);
    return c.json({ 
      error: "Failed to fetch customers", 
      details: String(error),
      customers: [], // Return empty array on error
      total: 0,
    }, 500);
  }
});

// Get customer by ID
customerApp.get("/customers/:customerId", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`👤 Fetching customer: ${customerId}`);
    
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    return c.json({
      success: true,
      customer,
    });
  } catch (error: any) {
    console.error("❌ Error fetching customer:", error);
    return c.json({ 
      error: "Failed to fetch customer", 
      details: String(error) 
    }, 500);
  }
});

// Create new customer
customerApp.post("/customers", async (c) => {
  try {
    console.log("📥 Received POST /customers request");
    
    const body = await c.req.json();
    console.log("📦 Request body:", JSON.stringify(body, null, 2));
    
    const { name, email, phone, location, address, city, region, status, tier, avatar } = body;
    
    // Validate required fields
    if (!name || !email || !phone || !location) {
      console.error("❌ Missing required fields:", { name: !!name, email: !!email, phone: !!phone, location: !!location });
      return c.json({ 
        error: "Missing required fields",
        required: ["name", "email", "phone", "location"],
        received: { name: !!name, email: !!email, phone: !!phone, location: !!location }
      }, 400);
    }
    
    console.log(`👤 Creating new customer: ${name} (${email})`);
    
    // 🔥 CHECK FOR DUPLICATE EMAIL - CRITICAL!
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 30000);
    const existingCustomer = (Array.isArray(allCustomers) ? allCustomers : [])
      .find(c => c != null && c.email && c.email.toLowerCase() === email.toLowerCase());
    
    if (existingCustomer) {
      console.warn(`⚠️ Customer with email ${email} already exists: ${existingCustomer.id}`);
      return c.json({ 
        error: "Customer with this email already exists",
        existingCustomerId: existingCustomer.id,
        message: `A customer with email "${email}" is already registered`,
      }, 409); // 409 Conflict
    }
    
    // Generate customer ID
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const newCustomer = {
      id: customerId,
      name,
      email,
      phone,
      location,
      address: address || "",
      city: city || "",
      region: region || "",
      status: status || "active",
      tier: tier || "new",
      avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`,
      joinDate: new Date().toISOString().split('T')[0],
      totalOrders: 0,
      totalSpent: 0,
      lastVisit: new Date().toISOString().split('T')[0],
      avgOrderValue: 0,
      tags: ["new-customer"],
      engagementScore: 0,
      lifetimeValue: 0,
      rfmScore: {
        recency: 5,
        frequency: 1,
        monetary: 1,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    console.log(`💾 Saving customer to database: ${customerId}`);
    
    // Save to database
    await withTimeout(kv.set(`customer:${customerId}`, newCustomer), 5000);
    
    console.log(`✅ Customer created successfully: ${customerId}`);
    console.log(`✅ Customer data:`, JSON.stringify(newCustomer, null, 2));
    
    return c.json({
      success: true,
      customer: newCustomer,
      message: "Customer created successfully",
    }, 201);
  } catch (error: any) {
    console.error("❌ Error creating customer:", error);
    console.error("❌ Error stack:", error?.stack);
    return c.json({ 
      error: "Failed to create customer", 
      details: String(error),
      message: error?.message || "Unknown error"
    }, 500);
  }
});

// Update customer
customerApp.put("/customers/:customerId", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    
    console.log(`🔄 Updating customer: ${customerId}`);
    
    // Get existing customer
    const existingCustomer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!existingCustomer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Merge with existing data
    const updatedCustomer = {
      ...existingCustomer,
      ...body,
      id: customerId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };
    
    // Save updated customer
    await withTimeout(kv.set(`customer:${customerId}`, updatedCustomer), 5000);
    
    console.log(`✅ Customer updated: ${customerId}`);
    
    return c.json({
      success: true,
      customer: updatedCustomer,
      message: "Customer updated successfully",
    });
  } catch (error: any) {
    console.error("❌ Error updating customer:", error);
    return c.json({ 
      error: "Failed to update customer", 
      details: String(error) 
    }, 500);
  }
});

// Delete customer
customerApp.delete("/customers/:customerId", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    
    console.log(`🗑️ Deleting customer: ${customerId}`);
    
    // Check if customer exists
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // 🔥 STEP 1: DELETE FROM SUPABASE AUTH (CRITICAL FOR SECURITY!)
    if (customer.userId) {
      console.log(`🔐 Deleting Supabase Auth user: ${customer.userId}`);
      try {
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
          customer.userId
        );
        
        if (authDeleteError) {
          console.error(`❌ Failed to delete auth user ${customer.userId}:`, authDeleteError);
          // Don't fail the whole operation, but log it prominently
        } else {
          console.log(`✅ Supabase Auth user deleted: ${customer.userId}`);
        }
      } catch (authError) {
        console.error(`❌ Error deleting auth user ${customer.userId}:`, authError);
        // Continue with customer deletion even if auth deletion fails
      }
    }
    
    // 🔥 STEP 2: DELETE USER FROM KV STORE (if exists) to prevent re-sync
    if (customer.userId) {
      console.log(`🗑️ Also deleting user from KV store: ${customer.userId}`);
      try {
        // Delete by userId lookup first to get email
        const userLookup = await withTimeout(kv.get(`userId:${customer.userId}`), 5000);
        if (userLookup && userLookup.email) {
          // Delete user by email (main record)
          await withTimeout(kv.del(`user:${userLookup.email}`), 5000);
          console.log(`✅ User deleted by email: ${userLookup.email}`);
        }
        // Delete userId lookup
        await withTimeout(kv.del(`userId:${customer.userId}`), 5000);
        console.log(`✅ User lookup deleted: ${customer.userId}`);
      } catch (userDeleteError) {
        console.warn(`⚠️ Could not delete user ${customer.userId}:`, userDeleteError);
        // Continue anyway - customer deletion is more important
      }
    }
    
    // 🔥 STEP 3: DELETE CUSTOMER FROM KV STORE
    await withTimeout(kv.del(`customer:${customerId}`), 5000);
    
    console.log(`✅ Customer deleted completely: ${customerId}`);
    
    return c.json({
      success: true,
      message: "Customer and associated auth account deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Error deleting customer:", error);
    return c.json({ 
      error: "Failed to delete customer", 
      details: String(error) 
    }, 500);
  }
});

// Bulk delete customers
customerApp.post("/customers/bulk-delete", async (c) => {
  try {
    const body = await c.req.json();
    const { customerIds } = body;
    
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return c.json({ error: "Invalid customer IDs array" }, 400);
    }
    
    console.log(`🗑️ Bulk deleting ${customerIds.length} customers...`);
    
    // 🔥 FIRST, GET ALL CUSTOMERS TO FIND THEIR USER IDs
    const customerPromises = customerIds.map(id => 
      withTimeout(kv.get(`customer:${id}`), 5000).catch(() => null)
    );
    const customers = await Promise.all(customerPromises);
    
    // 🔥 DELETE ASSOCIATED AUTH USERS AND KV USERS (if they exist)
    const userIds = customers
      .filter(c => c != null && c.userId)
      .map(c => c.userId);
    
    if (userIds.length > 0) {
      console.log(`🗑️ Deleting ${userIds.length} associated Supabase Auth users and KV users...`);
      const authAndKVDeletePromises = userIds.map(async (userId) => {
        try {
          // 🔥 STEP 1: Delete from Supabase Auth
          const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
          if (authDeleteError) {
            console.error(`❌ Failed to delete auth user ${userId}:`, authDeleteError);
          } else {
            console.log(`✅ Supabase Auth user deleted: ${userId}`);
          }
          
          // 🔥 STEP 2: Delete from KV store
          // Get email from userId lookup
          const userLookup = await withTimeout(kv.get(`userId:${userId}`), 5000);
          if (userLookup && userLookup.email) {
            // Delete user by email (main record)
            await withTimeout(kv.del(`user:${userLookup.email}`), 5000);
          }
          // Delete userId lookup
          await withTimeout(kv.del(`userId:${userId}`), 5000);
        } catch (err) {
          console.warn(`⚠️ Could not delete user ${userId}:`, err);
        }
      });
      await Promise.all(authAndKVDeletePromises);
      console.log(`✅ Associated auth users and KV users deleted`);
    }
    
    // Delete all customers
    const deletePromises = customerIds.map(id => 
      withTimeout(kv.del(`customer:${id}`), 5000)
    );
    
    await Promise.all(deletePromises);
    
    console.log(`✅ Bulk deleted ${customerIds.length} customers`);
    
    return c.json({
      success: true,
      deleted: customerIds.length,
      message: `${customerIds.length} customers deleted successfully`,
    });
  } catch (error: any) {
    console.error("❌ Error bulk deleting customers:", error);
    return c.json({ 
      error: "Failed to delete customers", 
      details: String(error) 
    }, 500);
  }
});

// 🔥 UPLOAD CUSTOMER PROFILE IMAGE
customerApp.post("/customers/upload-image", async (c) => {
  try {
    console.log("📤 Uploading customer profile image...");
    
    // Parse form data
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File;
    const customerName = formData.get("customerName") as string;
    
    if (!imageFile) {
      return c.json({ error: "No image file provided" }, 400);
    }
    
    // Check file size (should be under 500KB after compression, but double-check)
    const fileSizeKB = imageFile.size / 1024;
    console.log(`📦 Image size: ${fileSizeKB.toFixed(2)} KB`);
    
    if (fileSizeKB > 600) {
      return c.json({ 
        error: "Image file too large. Maximum size is 500KB",
        size: `${fileSizeKB.toFixed(2)} KB`
      }, 400);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const fileExt = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `customer_${timestamp}_${randomStr}.${fileExt}`;
    
    console.log(`📁 Uploading file: ${fileName}`);

    try {
      await ensureBucket(supabase, BUCKET_NAME, {
        public: false,
        fileSizeLimit: 524288,
      });
    } catch (bucketErr: any) {
      console.error("❌ Failed to ensure customer images bucket:", bucketErr);
      return c.json({ error: "Failed to prepare storage bucket" }, 500);
    }
    
    // Convert File to ArrayBuffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, uint8Array, {
        contentType: imageFile.type,
        upsert: false,
      });
    
    if (uploadError) {
      console.error("�� Upload error:", uploadError);
      return c.json({ 
        error: "Failed to upload image", 
        details: uploadError.message 
      }, 500);
    }
    
    // Generate signed URL (valid for 10 years)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileName, 315360000); // 10 years in seconds
    
    if (urlError || !urlData) {
      console.error("❌ URL generation error:", urlError);
      return c.json({ 
        error: "Failed to generate image URL", 
        details: urlError?.message 
      }, 500);
    }
    
    console.log(`✅ Image uploaded successfully: ${fileName}`);
    
    return c.json({
      success: true,
      imageUrl: urlData.signedUrl,
      fileName: fileName,
      size: `${fileSizeKB.toFixed(2)} KB`,
    });
  } catch (error: any) {
    console.error("❌ Error uploading image:", error);
    return c.json({ 
      error: "Failed to upload image", 
      details: String(error) 
    }, 500);
  }
});

// Get customer orders by customer ID
customerApp.get("/customers/:customerId/orders", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`📦 Fetching orders for customer: ${customerId}`);
    
    // Get customer details first
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Get all orders
    const allOrders = await withTimeout(kv.getByPrefix("order:"), 15000);
    
    // Filter orders for this customer (by email or customer name)
    const customerOrders = Array.isArray(allOrders) 
      ? allOrders.filter(order => 
          order && (
            order.email === customer.email || 
            order.customer === customer.name ||
            order.customerName === customer.name
          )
        )
      : [];
    
    console.log(`✅ Found ${customerOrders.length} orders for customer ${customer.name}`);
    
    // Sort by date (most recent first)
    customerOrders.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    return c.json({
      success: true,
      orders: customerOrders,
      total: customerOrders.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching customer orders:", error);
    return c.json({ 
      error: "Failed to fetch customer orders", 
      details: String(error),
      orders: [],
      total: 0,
    }, 500);
  }
});

// Get customer activities (generated from orders and customer data)
customerApp.get("/customers/:customerId/activities", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`📊 Generating activities for customer: ${customerId}`);
    
    // Get customer details
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Get customer orders
    const allOrders = await withTimeout(kv.getByPrefix("order:"), 15000);
    const customerOrders = Array.isArray(allOrders) 
      ? allOrders.filter(order => 
          order && (
            order.email === customer.email || 
            order.customer === customer.name ||
            order.customerName === customer.name
          )
        )
      : [];
    
    // Generate activities from orders
    const activities: any[] = [];
    
    // Add join activity
    activities.push({
      id: `act-join-${customer.id}`,
      type: "join",
      title: "Joined Migoo",
      description: "Created account and completed profile",
      timestamp: customer.joinDate || customer.createdAt || new Date().toISOString(),
    });
    
    // Generate activities from orders
    customerOrders.forEach((order, index) => {
      const orderDate = order.date || order.createdAt || new Date().toISOString();
      const orderId = order.orderNumber || order.id;
      const itemCount = Array.isArray(order.items) ? order.items.length : 0;
      const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null;
      
      // Order placed activity
      activities.push({
        id: `act-order-${orderId}`,
        type: "order",
        title: "Placed an order",
        description: `Order #${orderId} - ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
        timestamp: orderDate,
        metadata: {
          orderId: orderId,
          amount: order.total || 0,
          productName: firstItem?.name || firstItem?.title || "Multiple Items",
        },
      });
      
      // Payment activity (if paid or delivered)
      if (order.paymentStatus === "paid" || order.status === "delivered") {
        activities.push({
          id: `act-payment-${orderId}`,
          type: "payment",
          title: "Payment completed",
          description: `Order #${orderId}`,
          timestamp: orderDate,
          metadata: {
            orderId: orderId,
            amount: order.total || 0,
          },
        });
      }
      
      // Cancelled activity
      if (order.status === "cancelled") {
        activities.push({
          id: `act-cancel-${orderId}`,
          type: "cancel",
          title: "Cancelled order",
          description: `Order #${orderId}`,
          timestamp: orderDate,
          metadata: {
            orderId: orderId,
          },
        });
      }
    });
    
    // Sort by timestamp (most recent first)
    activities.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0).getTime();
      const dateB = new Date(b.timestamp || 0).getTime();
      return dateB - dateA;
    });
    
    console.log(`✅ Generated ${activities.length} activities for customer ${customer.name}`);
    
    return c.json({
      success: true,
      activities: activities,
      total: activities.length,
    });
  } catch (error: any) {
    console.error("❌ Error generating customer activities:", error);
    return c.json({ 
      error: "Failed to generate customer activities", 
      details: String(error),
      activities: [],
      total: 0,
    }, 500);
  }
});

// Get customer saved products (wishlist)
customerApp.get("/customers/:customerId/saved-products", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`💝 Fetching saved products for customer: ${customerId}`);
    
    // Get customer details
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      console.log(`⚠️ Customer not found: ${customerId}`);
      return c.json({ error: "Customer not found" }, 404);
    }
    
    console.log(`✅ Found customer: ${customer.name || customer.email}`);
    
    // Get saved products key for this customer
    const savedProducts = await withTimeout(
      kv.get(`customer:${customerId}:wishlist`), 
      5000
    );
    
    console.log(`🔍 [Wishlist Debug] customer:${customerId}:wishlist =`, savedProducts);
    console.log(`🔍 [Wishlist Debug] Type: ${typeof savedProducts}, IsArray: ${Array.isArray(savedProducts)}`);
    
    if (!savedProducts || !Array.isArray(savedProducts)) {
      console.log(`⚠️ No saved products found for customer ${customer.name || customer.email}`);
      return c.json({
        success: true,
        products: [],
        total: 0,
      });
    }
    
    console.log(`📝 Found ${savedProducts.length} product IDs in wishlist`);
    
    // Get full product details for each saved product
    const productDetailsPromises = savedProducts.map(async (productId) => {
      try {
        const product = await withTimeout(kv.get(`product:${productId}`), 5000);
        if (!product) {
          console.log(`⚠️ Product not found: ${productId}`);
          return null;
        }
        
        return {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.images?.[0] || "",
          category: product.category || "Uncategorized",
          savedAt: new Date().toISOString(), // You could store this separately
        };
      } catch (err) {
        console.warn(`⚠️ Could not fetch product ${productId}:`, err);
        return null;
      }
    });
    
    const products = (await Promise.all(productDetailsPromises)).filter(p => p !== null);
    
    console.log(`✅ Found ${products.length} saved products for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      products: products,
      total: products.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching saved products:", error);
    return c.json({ 
      error: "Failed to fetch saved products", 
      details: String(error),
      products: [],
      total: 0,
    }, 500);
  }
});

// Get customer shipping addresses
customerApp.get("/customers/:customerId/addresses", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`📍 Fetching addresses for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    let customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    // 🔥 If not found by customerId, try to find by userId (for auth users)
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying userId lookup...`);
      
      // Get all customers and find by userId
      const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 10000);
      customer = Array.isArray(allCustomers) 
        ? allCustomers.find((c: any) => c != null && c.userId === customerId)
        : null;
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name})`);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found: ${customerId}`);
      return c.json({ error: "Customer not found" }, 404);
    }
    
    // Use the actual customer ID for addresses lookup
    const actualCustomerId = customer.id;
    console.log(`📍 Looking up addresses for customer ID: ${actualCustomerId}`);
    
    // Get addresses for this customer
    const addresses = await withTimeout(
      kv.get(`customer:${actualCustomerId}:addresses`), 
      5000
    );
    
    if (!addresses || !Array.isArray(addresses)) {
      console.log(`⚠️ No addresses found for customer ${customer.name}`);
      return c.json({
        success: true,
        addresses: [],
        total: 0,
      });
    }
    
    console.log(`✅ Found ${addresses.length} addresses for customer ${customer.name}`);
    
    return c.json({
      success: true,
      addresses: addresses,
      total: addresses.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching addresses:", error);
    return c.json({ 
      error: "Failed to fetch addresses", 
      details: String(error),
      addresses: [],
      total: 0,
    }, 500);
  }
});

// Save customer shipping addresses
customerApp.post("/customers/:customerId/addresses", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const { addresses } = body;
    
    console.log(`📍 Saving addresses for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    let customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    // 🔥 If not found by customerId, try to find by userId (for auth users)
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying userId lookup...`);
      
      // Get all customers and find by userId
      const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 10000);
      customer = Array.isArray(allCustomers) 
        ? allCustomers.find((c: any) => c != null && c.userId === customerId)
        : null;
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name})`);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found: ${customerId}`);
      return c.json({ error: "Customer not found" }, 404);
    }
    
    if (!Array.isArray(addresses)) {
      return c.json({ error: "Addresses must be an array" }, 400);
    }
    
    // Use the actual customer ID for addresses storage
    const actualCustomerId = customer.id;
    console.log(`📍 Saving addresses for customer ID: ${actualCustomerId}`);
    
    // Save addresses to database
    await withTimeout(
      kv.set(`customer:${actualCustomerId}:addresses`, addresses), 
      5000
    );
    
    console.log(`✅ Saved ${addresses.length} addresses for customer ${customer.name}`);
    
    return c.json({
      success: true,
      addresses: addresses,
      total: addresses.length,
      message: "Addresses saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving addresses:", error);
    return c.json({ 
      error: "Failed to save addresses", 
      details: String(error)
    }, 500);
  }
});

// 🔥 DEDUPLICATE CUSTOMERS - Merge duplicate emails and keep the most complete record
customerApp.post("/customers/deduplicate", async (c) => {
  try {
    console.log("🧹 Starting customer deduplication process...");
    
    // Get all customers
    const allCustomers = await withTimeout(kv.getByPrefix("customer:"), 15000);
    const validCustomers = (Array.isArray(allCustomers) ? allCustomers : [])
      .filter(c => c != null && typeof c === 'object' && !Array.isArray(c) && c.id && c.email);
    
    console.log(`📊 Found ${validCustomers.length} valid customers to analyze`);
    
    // Group customers by email (case-insensitive)
    const customersByEmail = new Map<string, any[]>();
    
    validCustomers.forEach(customer => {
      const emailKey = customer.email.toLowerCase();
      if (!customersByEmail.has(emailKey)) {
        customersByEmail.set(emailKey, []);
      }
      customersByEmail.get(emailKey)!.push(customer);
    });
    
    // Find duplicates (emails with more than 1 customer)
    const duplicates: Array<{ email: string; customers: any[] }> = [];
    
    customersByEmail.forEach((customers, email) => {
      if (customers.length > 1) {
        duplicates.push({ email, customers });
      }
    });
    
    console.log(`🔍 Found ${duplicates.length} duplicate email(s)`);
    
    if (duplicates.length === 0) {
      return c.json({
        success: true,
        message: "No duplicates found",
        duplicatesRemoved: 0,
        duplicateEmails: [],
      });
    }
    
    let mergedCount = 0;
    let deletedCount = 0;
    const mergedEmails: string[] = [];
    
    // Process each duplicate group
    for (const { email, customers } of duplicates) {
      console.log(`\n🔄 Processing ${customers.length} duplicates for ${email}`);
      
      // Sort by most complete record:
      // 1. Highest totalOrders
      // 2. Highest totalSpent
      // 3. Most recent createdAt
      const sorted = customers.sort((a, b) => {
        const ordersA = a.totalOrders || 0;
        const ordersB = b.totalOrders || 0;
        if (ordersA !== ordersB) return ordersB - ordersA;
        
        const spentA = a.totalSpent || 0;
        const spentB = b.totalSpent || 0;
        if (spentA !== spentB) return spentB - spentA;
        
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB; // Oldest first
      });
      
      // Keep the most complete record (first after sorting)
      const keepCustomer = sorted[0];
      const deleteCustomers = sorted.slice(1);
      
      console.log(`✅ Keeping customer ${keepCustomer.id} (orders: ${keepCustomer.totalOrders || 0}, spent: ${keepCustomer.totalSpent || 0})`);
      
      // Merge data from other customers into the kept one
      let updated = false;
      for (const dupCustomer of deleteCustomers) {
        // Merge any missing fields from duplicates
        if (!keepCustomer.phone && dupCustomer.phone) {
          keepCustomer.phone = dupCustomer.phone;
          updated = true;
        }
        if (!keepCustomer.location && dupCustomer.location) {
          keepCustomer.location = dupCustomer.location;
          updated = true;
        }
        if (!keepCustomer.address && dupCustomer.address) {
          keepCustomer.address = dupCustomer.address;
          updated = true;
        }
        // Prefer non-default avatar
        if (dupCustomer.avatar && !dupCustomer.avatar.includes('dicebear.com')) {
          if (keepCustomer.avatar && keepCustomer.avatar.includes('dicebear.com')) {
            keepCustomer.avatar = dupCustomer.avatar;
            updated = true;
          }
        }
      }
      
      // Update the kept customer if any merge happened
      if (updated) {
        keepCustomer.updatedAt = new Date().toISOString();
        await withTimeout(kv.set(`customer:${keepCustomer.id}`, keepCustomer), 5000);
        console.log(`🔄 Updated kept customer with merged data`);
      }
      
      // Delete duplicate customers
      for (const dupCustomer of deleteCustomers) {
        console.log(`🗑️ Deleting duplicate customer ${dupCustomer.id}`);
        await withTimeout(kv.del(`customer:${dupCustomer.id}`), 5000);
        deletedCount++;
      }
      
      mergedCount++;
      mergedEmails.push(email);
    }
    
    console.log(`\n✅ Deduplication complete!`);
    console.log(`   - ${mergedCount} email(s) deduplicated`);
    console.log(`   - ${deletedCount} duplicate record(s) removed`);
    
    return c.json({
      success: true,
      message: `Successfully deduplicated ${mergedCount} email(s)`,
      duplicatesRemoved: deletedCount,
      duplicateEmails: mergedEmails,
    });
  } catch (error: any) {
    console.error("❌ Error deduplicating customers:", error);
    return c.json({ 
      error: "Failed to deduplicate customers", 
      details: String(error) 
    }, 500);
  }
});

// 🔥 CLEANUP CORRUPTED CUSTOMER DATA - Remove string values from customer: keys
customerApp.post("/customers/cleanup-corrupted", async (c) => {
  try {
    console.log("🧹 Starting corrupted customer data cleanup...");
    
    // Get all keys with customer: prefix
    const allData = await withTimeout(kv.getByPrefix("customer:"), 15000);
    
    if (!Array.isArray(allData)) {
      return c.json({
        success: false,
        error: "No data found",
      });
    }
    
    console.log(`📊 Analyzing ${allData.length} customer: entries...`);
    
    // Find corrupted entries (strings instead of objects)
    const corruptedEntries: string[] = [];
    allData.forEach((entry, index) => {
      // If entry is a string (like "prod_xxxx"), it's corrupted
      if (typeof entry === 'string') {
        corruptedEntries.push(entry);
        console.warn(`🚫 Found corrupted entry at index ${index}: "${entry}"`);
      }
      // If entry is not an object or doesn't have customer structure
      else if (entry == null || typeof entry !== 'object' || Array.isArray(entry) || !entry.id) {
        console.warn(`🚫 Found invalid entry at index ${index}:`, entry);
      }
    });
    
    console.log(`❌ Found ${corruptedEntries.length} corrupted string entries`);
    
    if (corruptedEntries.length === 0) {
      return c.json({
        success: true,
        message: "No corrupted data found",
        cleanedCount: 0,
      });
    }
    
    // We can't delete these without knowing their keys
    // The issue is that getByPrefix returns values, not keys
    // So we need to query the database directly
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    
    // Get all keys that start with "customer:" and have string values
    const { data: allKeys, error: keysError } = await supabase
      .from("kv_store_16010b6f")
      .select("key, value")
      .like("key", "customer:%");
    
    if (keysError) {
      throw new Error(`Failed to fetch keys: ${keysError.message}`);
    }
    
    console.log(`🔍 Found ${allKeys?.length || 0} total customer: keys in database`);
    
    // Find keys with corrupted values (strings)
    const keysToDelete: string[] = [];
    allKeys?.forEach((row) => {
      const value = row.value;
      // If value is a string or not a valid customer object
      if (
        typeof value === 'string' || 
        value == null || 
        typeof value !== 'object' || 
        Array.isArray(value) || 
        !value.id || 
        !value.name
      ) {
        keysToDelete.push(row.key);
        console.warn(`🗑️ Marking for deletion: ${row.key} (value: ${JSON.stringify(value).substring(0, 100)})`);
      }
    });
    
    console.log(`🗑️ Deleting ${keysToDelete.length} corrupted entries...`);
    
    // Delete corrupted entries
    if (keysToDelete.length > 0) {
      await kv.mdel(keysToDelete);
    }
    
    console.log(`✅ Cleanup complete!`);
    
    return c.json({
      success: true,
      message: `Successfully cleaned ${keysToDelete.length} corrupted entries`,
      cleanedCount: keysToDelete.length,
      deletedKeys: keysToDelete,
    });
  } catch (error: any) {
    console.error("❌ Error during cleanup:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to cleanup corrupted data",
    }, 500);
  }
});

// ============================================
// 🔥 PERSISTENT CART & WISHLIST ENDPOINTS
// ============================================

// Get customer cart
customerApp.get("/customers/:customerId/cart", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    console.log(`🛒 Fetching cart for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    let customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    // 🔥 OPTIMIZED: If not found by customerId, try to find by userId using direct DB query
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying optimized userId lookup...`);
      customer = await findCustomerByUserId(customerId);
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name || customer.email})`);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found: ${customerId}`);
      return c.json({ 
        success: true,
        cart: [],
        total: 0,
      });
    }
    
    // Use the actual customer ID for cart lookup
    const actualCustomerId = customer.id;
    console.log(`🛒 Looking up cart for customer ID: ${actualCustomerId}`);
    
    // Get cart for this customer - kv.get already has 15s timeout
    const cart = await kv.get(`customer:${actualCustomerId}:cart`);
    
    if (!cart || !Array.isArray(cart)) {
      console.log(`⚠️ No cart found for customer ${customer.name || customer.email}`);
      return c.json({
        success: true,
        cart: [],
        total: 0,
      });
    }
    
    console.log(`✅ Found ${cart.length} items in cart for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      cart: cart,
      total: cart.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching cart:", error);
    return c.json({ 
      error: "Failed to fetch cart", 
      details: String(error),
      cart: [],
      total: 0,
    }, 500);
  }
});

// Save customer cart
customerApp.post("/customers/:customerId/cart", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const { cart } = body;
    
    console.log(`🛒 Saving cart for customer: ${customerId}`);
    
    // Get customer details - try as customerId first, then as userId
    // kv.get already has 15s timeout
    let customer = await kv.get(`customer:${customerId}`);
    
    // 🔥 OPTIMIZED: If not found by customerId, try to find by userId using direct DB query
    if (!customer) {
      console.log(`⚠️ Customer not found by customerId, trying optimized userId lookup...`);
      customer = await findCustomerByUserId(customerId);
      
      if (customer) {
        console.log(`✅ Found customer by userId: ${customer.id} (${customer.name || customer.email})`);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found: ${customerId}`);
      return c.json({ 
        success: true,
        cart: [],
        total: 0,
      });
    }
    
    if (!Array.isArray(cart)) {
      return c.json({ error: "Cart must be an array" }, 400);
    }
    
    // Use the actual customer ID for cart storage
    const actualCustomerId = customer.id;
    console.log(`🛒 Saving cart for customer ID: ${actualCustomerId}`);
    
    // Save cart to database - kv.set already has 15s timeout
    await kv.set(`customer:${actualCustomerId}:cart`, cart);
    
    console.log(`✅ Saved ${cart.length} items in cart for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      cart: cart,
      total: cart.length,
      message: "Cart saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving cart:", error);
    return c.json({ 
      error: "Failed to save cart", 
      details: String(error)
    }, 500);
  }
});

// Save customer wishlist (add/remove items)
customerApp.post("/customers/:customerId/wishlist", async (c) => {
  try {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const { wishlist } = body;
    
    console.log(`💝 Saving wishlist for customer: ${customerId}`);
    
    // Get customer details
    const customer = await withTimeout(kv.get(`customer:${customerId}`), 5000);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }
    
    if (!Array.isArray(wishlist)) {
      return c.json({ error: "Wishlist must be an array" }, 400);
    }
    
    // Save wishlist to database
    await withTimeout(
      kv.set(`customer:${customerId}:wishlist`, wishlist), 
      5000
    );
    
    console.log(`✅ Saved ${wishlist.length} items in wishlist for customer ${customer.name || customer.email}`);
    
    return c.json({
      success: true,
      wishlist: wishlist,
      total: wishlist.length,
      message: "Wishlist saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving wishlist:", error);
    return c.json({ 
      error: "Failed to save wishlist", 
      details: String(error)
    }, 500);
  }
});

export default customerApp;