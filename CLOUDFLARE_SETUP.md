# Cloudflare Custom Domain Setup for Migoo

This document explains how to set up Cloudflare Workers to enable custom domain routing for vendor storefronts in production.

## Overview

The custom domain feature in Migoo allows vendors to use their own domains (e.g., `test.app`) to display their storefront. This requires Cloudflare Workers to:

1. Detect the incoming domain from the request
2. Look up which vendor owns that domain
3. Route the request to the correct vendor's storefront
4. Auto-provision SSL certificates

## Prerequisites

- Cloudflare account (free tier works)
- Cloudflare Workers enabled ($5/month after free tier)
- Domain DNS managed by Cloudflare
- Migoo backend API running

## Architecture

```
User visits test.app
    ↓
Cloudflare Worker intercepts request
    ↓
Worker reads Host header → "test.app"
    ↓
Worker queries Migoo API: GET /vendor/by-domain?domain=test.app
    ↓
API returns vendorId and storeSlug
    ↓
Worker rewrites URL to /store/{storeSlug}
    ↓
Cloudflare serves the vendor's storefront
```

## Step 1: Create Cloudflare Worker

Create a new Worker script in your Cloudflare dashboard:

```javascript
// worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Skip routing for main Migoo domain
    if (hostname === 'migoo-platform.app' || hostname === 'www.migoo-platform.app') {
      return fetch(request);
    }

    try {
      // Query Migoo backend to find vendor by domain
      const apiUrl = `https://YOUR-PROJECT-ID.supabase.co/functions/v1/make-server-16010b6f/vendor/by-domain?domain=${hostname}`;
      const apiResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
        }
      });

      if (!apiResponse.ok) {
        return new Response('Domain not found', { status: 404 });
      }

      const { vendorId, storeSlug } = await apiResponse.json();

      // Rewrite URL to vendor storefront
      const newUrl = new URL(request.url);
      newUrl.hostname = 'migoo-platform.app';  // Your main domain
      newUrl.pathname = `/store/${storeSlug}`;

      // Fetch the vendor storefront
      const response = await fetch(newUrl.toString(), {
        headers: request.headers,
        method: request.method,
        body: request.body
      });

      return response;

    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Error routing request', { status: 500 });
    }
  }
}
```

## Step 2: Add Backend Endpoint

Add this endpoint to `/supabase/functions/server/index.tsx`:

```typescript
// Get vendor by custom domain (public access for Cloudflare Worker)
app.get("/make-server-16010b6f/vendor/by-domain", async (c) => {
  try {
    const domain = c.req.query("domain");
    
    if (!domain) {
      return c.json({ error: "Domain parameter required" }, 400);
    }

    console.log(`🔍 Looking up vendor for domain: ${domain}`);

    // Get all vendor storefront settings
    const allSettings = await kv.getByPrefix("vendor_storefront_");
    const validSettings = Array.isArray(allSettings) ? allSettings.filter(s => s != null) : [];

    // Find vendor with matching custom domain
    const vendorSettings = validSettings.find((s: any) => 
      s.customDomain === domain && 
      s.domainStatus === 'verified' &&
      s.isActive === true
    );

    if (!vendorSettings) {
      return c.json({ error: "Vendor not found for this domain" }, 404);
    }

    // Get vendor info
    const vendor = await kv.get(`vendor:${vendorSettings.vendorId}`);

    return c.json({
      vendorId: vendorSettings.vendorId,
      storeSlug: vendorSettings.storeSlug,
      storeName: vendorSettings.storeName,
      businessName: vendor?.businessName || vendor?.name
    });

  } catch (error: any) {
    console.error("❌ Error looking up vendor by domain:", error);
    return c.json({ error: error.message || "Failed to lookup vendor" }, 500);
  }
});
```

## Step 3: Configure Custom Hostnames

In Cloudflare dashboard:

1. Go to **SSL/TLS** → **Custom Hostnames**
2. Enable **Custom Hostnames** (requires Workers plan)
3. For each vendor domain, add it as a Custom Hostname
4. Cloudflare will auto-provision SSL certificates

## Step 4: Configure Worker Routes

In Cloudflare dashboard:

1. Go to **Workers** → **Routes**
2. Add route: `*/*` (matches all domains)
3. Select your Worker script
4. Save

## Step 5: DNS Configuration

When a vendor adds a custom domain, they need to:

1. **Add CNAME record:**
   - Type: `CNAME`
   - Name: `www` (or `@` for root domain)
   - Value: `migoo-platform.app`

2. **Add A record (for root domain):**
   - Type: `A`
   - Name: `@`
   - Value: Your Cloudflare IP (get from Cloudflare dashboard)

## Environment Variables

Set these in your Cloudflare Worker:

```bash
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Testing

1. Add a test domain in vendor admin: `test.app`
2. Click "Verify DNS"
3. Configure DNS to point to Cloudflare
4. Wait for DNS propagation (up to 48 hours)
5. Visit `https://test.app` in browser
6. Should see the vendor's storefront!

## Cost Estimate

- **Cloudflare Workers:** $5/month (includes 10M requests)
- **Custom Hostnames:** $0.10 per domain per month
- **SSL Certificates:** Free (auto-provisioned)

**Example:** 100 vendors = $5 + ($0.10 × 100) = $15/month

## Security Considerations

- ✅ SSL certificates are auto-provisioned
- ✅ Worker validates domain ownership via database
- ✅ Only verified domains are routed
- ✅ Inactive stores return 404
- ⚠️ Rate limit the Worker to prevent abuse

## Alternative: Cloudflare for SaaS

For larger deployments, consider **Cloudflare for SaaS**:

- Programmatic Custom Hostname API
- Automatic SSL provisioning via API
- Better for 100+ domains
- Costs more but provides API automation

See: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/

## Troubleshooting

### Domain not routing
- Check DNS propagation: `dig test.app`
- Verify domain is in database with status 'verified'
- Check Worker logs in Cloudflare dashboard

### SSL errors
- Wait for SSL provisioning (up to 24 hours)
- Verify Custom Hostname is added in Cloudflare
- Check SSL/TLS mode is "Full" or "Full (strict)"

### 404 errors
- Verify vendor storefront is active
- Check storeSlug exists
- Test backend endpoint directly

## Support

For help with Cloudflare setup:
- Cloudflare Docs: https://developers.cloudflare.com/workers/
- Cloudflare Community: https://community.cloudflare.com/
