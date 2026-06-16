/**
 * Runs before React — sets vendor tab title (and favicon when cached) synchronously so
 * refresh / first paint does not flash SECURE or generic "Vendor Store".
 */
(function () {
  var BROWSE_PAGE_SIZE = 12;
  var CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var WRAPPER_VERSION = 1;
  var RESERVED = ["www", "api", "admin", "app", "cdn", "mail", "ftp", "staging", "preview"];

  function safeDecode(seg) {
    try {
      return decodeURIComponent(seg);
    } catch (e) {
      return seg;
    }
  }

  function compactBrand(slug) {
    var raw = safeDecode(String(slug || "").trim());
    if (!raw) return "";
    var parts = raw.split(/[-_\s]+/).filter(Boolean);
    if (!parts.length) return "";
    return parts
      .map(function (p) {
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      })
      .join("");
  }

  function isGenericName(name) {
    var raw = String(name || "").trim();
    return !raw || /^vendor\s+store$/i.test(raw);
  }

  function displayName(slug, cached) {
    var c = String(cached || "").trim();
    if (!isGenericName(c)) return c;
    var fromSlug = compactBrand(slug);
    if (fromSlug) return fromSlug;
    return c || "Store";
  }

  function isVendorSubdomainHost(host) {
    host = String(host || "").toLowerCase();
    if (!host || host === "localhost" || host.indexOf("127.") === 0) return false;
    var parts = host.split(".").filter(Boolean);
    if (parts.length < 3) return false;
    var label = parts[0];
    if (!label || label.indexOf(".") >= 0) return false;
    return RESERVED.indexOf(label) < 0;
  }

  function parseStoreSlug(pathname) {
    var path = (pathname || "/").replace(/\/+$/, "") || "/";
    var parts = path.split("/").filter(Boolean);
    if (isVendorSubdomainHost(location.hostname)) {
      var hostSlug = (location.hostname.split(".").filter(Boolean)[0] || "").trim();
      return hostSlug ? safeDecode(hostSlug) : null;
    }
    if (!parts.length) return null;
    var first = parts[0] || "";
    if (first.indexOf("vendor-") === 0) {
      var slug = first.slice("vendor-".length).trim();
      return slug ? safeDecode(slug) : null;
    }
    if (first === "vendor" && parts[1]) return safeDecode(parts[1]);
    return null;
  }

  function parseProductSlug(pathname) {
    var path = (pathname || "/").replace(/\/+$/, "") || "/";
    var parts = path.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    var first = parts[0] || "";
    if (first.indexOf("vendor-") === 0) {
      if (parts[1] === "product" && parts[2]) return safeDecode(parts[2]);
      return null;
    }
    if (first === "vendor" && parts.length >= 4 && parts[2] === "product") {
      return safeDecode(parts[3]);
    }
    if (first === "product" && parts[1]) return safeDecode(parts[1]);
    return null;
  }

  function readPersisted(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (
        !parsed ||
        parsed.v !== WRAPPER_VERSION ||
        typeof parsed.savedAt !== "number" ||
        parsed.payload === undefined
      ) {
        return null;
      }
      if (Date.now() - parsed.savedAt > CATALOG_TTL_MS) return null;
      return parsed.payload;
    } catch (e) {
      return null;
    }
  }

  function catalogKey(slug) {
    return (
      "migoo-ls-vendor-p1-" +
      encodeURIComponent(String(slug)) +
      "-q-_-c-" +
      encodeURIComponent("all") +
      "-ps-" +
      BROWSE_PAGE_SIZE +
      "-v1"
    );
  }

  function cleanAscii(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();
  }

  function legacyNameSegment(product) {
    return String((product && product.name) || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();
  }

  function productSegment(product) {
    if (!product) return "";
    var sku = cleanAscii(product.sku);
    if (sku) return sku;
    var id = cleanAscii(product.id);
    if (id) return id;
    var fromName = legacyNameSegment(product);
    if (fromName) return fromName;
    return String(product.id || "");
  }

  function findProductName(products, decoded) {
    if (!products || !products.length || !decoded) return null;
    var dec = String(decoded).trim();
    var norm = cleanAscii(dec);
    var i;
    for (i = 0; i < products.length; i++) {
      var p = products[i];
      if (!p) continue;
      if (productSegment(p) === norm) return String(p.name || "").trim() || null;
      if (legacyNameSegment(p) === norm) return String(p.name || "").trim() || null;
      if (String(p.sku || "").trim().toLowerCase() === dec.toLowerCase()) {
        return String(p.name || "").trim() || null;
      }
      if (String(p.id || "").trim().toLowerCase() === dec.toLowerCase()) {
        return String(p.name || "").trim() || null;
      }
    }
    return null;
  }

  function readCatalog(slug) {
    var direct = readPersisted(catalogKey(slug));
    if (direct && typeof direct === "object") return direct;
    return null;
  }

  function readBranding(slug) {
    var payload = readCatalog(slug);
    if (payload) {
      return {
        storeName: displayName(slug, payload.storeName),
        storeLogo: typeof payload.logo === "string" && payload.logo.trim() ? payload.logo.trim() : "",
      };
    }
    return {
      storeName: displayName(slug, null),
      storeLogo: "",
    };
  }

  function buildTitle(slug, pathname, branding, productName) {
    var compact = compactBrand(slug) || branding.storeName || "Store";
    if (productName) return productName + " - " + compact;
    if (/\/saved$/i.test(pathname)) return "Saved - " + compact;
    return compact;
  }

  function stripIcons() {
    var nodes = document.querySelectorAll('link[rel*="icon"]');
    for (var i = 0; i < nodes.length; i++) {
      var rel = (nodes[i].getAttribute("rel") || "").toLowerCase();
      if (rel.indexOf("apple-touch") >= 0 || rel.indexOf("mask-icon") >= 0) continue;
      nodes[i].parentNode && nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function installIcon(href) {
    if (!href) return;
    stripIcons();
    var link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    var lower = href.toLowerCase();
    if (lower.indexOf(".svg") >= 0) link.type = "image/svg+xml";
    else if (lower.indexOf(".png") >= 0) link.type = "image/png";
    document.head.appendChild(link);
  }

  var slug = parseStoreSlug(location.pathname);
  if (!slug) return;

  var branding = readBranding(slug);
  var productSeg = parseProductSlug(location.pathname);
  var productName = null;
  if (productSeg) {
    var catalog = readCatalog(slug);
    if (catalog && Array.isArray(catalog.products)) {
      productName = findProductName(catalog.products, productSeg);
    }
  }

  document.title = buildTitle(slug, location.pathname, branding, productName);
  if (branding.storeLogo) installIcon(branding.storeLogo);
})();
