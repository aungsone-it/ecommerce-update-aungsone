/**
 * Runs before React — sets tab favicon synchronously from a cached PNG data URL so
 * browser history / address-bar suggestions store the real store logo, not favicon.svg.
 */
(function () {
  var CACHE_KEY = "admin:branding:v1";
  var FAVICON_CACHE_KEY = "admin:branding:favicon:v1";
  var PROJECT_ID = "lmkthofnydxxgowryjcz";
  var ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Rob2ZueWR4eGdvd3J5amN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNTQyMDUsImV4cCI6MjA4NTkzMDIwNX0.MpID6QuedE9KPzMXbWMGYPpbm98tOhUWxE7Kk7iaV_Q";
  var RESERVED = ["www", "api", "admin", "app", "cdn", "mail", "ftp", "staging", "preview"];
  var DEFAULT_ICON = "/favicon.svg";

  function normalizeStoreName(name) {
    var raw = String(name || "").trim();
    if (!raw || /^secure\s+e-?commerce$/i.test(raw)) return "SECURE";
    return raw;
  }

  function displayBrand(name) {
    var raw = normalizeStoreName(name);
    if (raw.indexOf(" ") >= 0) {
      return raw
        .split(/\s+/)
        .filter(Boolean)
        .map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(" ");
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
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

  function shouldUsePlatformBranding() {
    if (isVendorSubdomainHost(location.hostname)) return false;
    var p = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/setup" || p.indexOf("/admin") === 0) return true;
    return p === "/";
  }

  function stripIcons() {
    var nodes = document.querySelectorAll('link[rel*="icon"]');
    for (var i = 0; i < nodes.length; i++) {
      var rel = (nodes[i].getAttribute("rel") || "").toLowerCase();
      if (rel.indexOf("apple-touch") >= 0 || rel.indexOf("mask-icon") >= 0) continue;
      nodes[i].parentNode && nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function installIcon(href, mime) {
    if (!href) return;
    stripIcons();
    var link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    if (mime) link.type = mime;
    else if (href.indexOf("data:image/png") === 0) link.type = "image/png";
    else if (href.indexOf("data:image/svg") === 0) link.type = "image/svg+xml";
    else if (href.toLowerCase().indexOf(".svg") >= 0) link.type = "image/svg+xml";
    document.head.appendChild(link);
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function readFaviconCache() {
    try {
      var raw = localStorage.getItem(FAVICON_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed.dataUrl !== "string" ||
        parsed.dataUrl.indexOf("data:image/") !== 0 ||
        typeof parsed.forLogo !== "string"
      ) {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearFaviconCache() {
    try {
      localStorage.removeItem(FAVICON_CACHE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function installDefaultIcon() {
    clearFaviconCache();
    installIcon(DEFAULT_ICON, "image/svg+xml");
  }

  function writeFaviconCache(forLogo, dataUrl) {
    try {
      localStorage.setItem(
        FAVICON_CACHE_KEY,
        JSON.stringify({ forLogo: forLogo, dataUrl: dataUrl })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      /* ignore */
    }
  }

  function applyTitle(name) {
    var brand = displayBrand(name);
    var p = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/admin/setup" || p === "/setup") {
      document.title = brand + " - Setup";
    } else if (p.indexOf("/admin") === 0) {
      document.title = brand + " - Admin | Super Admin";
    } else if (p === "/") {
      document.title = brand;
    }
  }

  function rasterizeLogo(logoUrl, done) {
    fetch(logoUrl, { mode: "cors", credentials: "omit", cache: "force-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("fetch");
        return res.blob();
      })
      .then(function (blob) {
        if (!blob || !blob.size) throw new Error("empty");
        var obj = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            if (!w || !h) throw new Error("dims");
            var canvas = document.createElement("canvas");
            canvas.width = 32;
            canvas.height = 32;
            var ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, 32, 32);
            var scale = Math.min(32 / w, 32 / h);
            var dw = w * scale;
            var dh = h * scale;
            ctx.drawImage(img, (32 - dw) / 2, (32 - dh) / 2, dw, dh);
            var dataUrl = canvas.toDataURL("image/png");
            writeFaviconCache(logoUrl, dataUrl);
            installIcon(dataUrl, "image/png");
            if (done) done(dataUrl);
          } catch (e) {
            installIcon(logoUrl);
            if (done) done(null);
          } finally {
            URL.revokeObjectURL(obj);
          }
        };
        img.onerror = function () {
          URL.revokeObjectURL(obj);
          installIcon(logoUrl);
          if (done) done(null);
        };
        img.src = obj;
      })
      .catch(function () {
        installIcon(logoUrl);
        if (done) done(null);
      });
  }

  function applyBranding(data) {
    if (!data || typeof data !== "object") return;
    var logo = typeof data.storeLogo === "string" ? data.storeLogo.trim() : "";
    var name = normalizeStoreName(
      typeof data.storeName === "string" ? data.storeName : "SECURE"
    );
    applyTitle(name);
    if (!logo) {
      installDefaultIcon();
      return;
    }
    var favicon = readFaviconCache();
    if (favicon && favicon.forLogo === logo && favicon.dataUrl) {
      installIcon(favicon.dataUrl, "image/png");
      return;
    }
    rasterizeLogo(logo);
  }

  if (!shouldUsePlatformBranding()) {
    installDefaultIcon();
    return;
  }

  var cached = readCache();
  if (cached && typeof cached.storeLogo === "string" && cached.storeLogo.trim()) {
    applyBranding(cached);
  } else {
    installDefaultIcon();
  }

  function refreshBrandingFromServer() {
    fetch(
      "https://" +
        PROJECT_ID +
        ".supabase.co/functions/v1/make-server-16010b6f/settings/general",
      { headers: { Authorization: "Bearer " + ANON_KEY } }
    )
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        var next = {
          storeLogo: typeof data.storeLogo === "string" ? data.storeLogo : "",
          storeName:
            typeof data.storeName === "string" && normalizeStoreName(data.storeName).trim()
              ? normalizeStoreName(data.storeName)
              : "SECURE",
        };
        writeCache(next);
        applyBranding(next);
      })
      .catch(function () {
        /* React hook will retry */
      });
  }

  // Keep first paint free of non-critical branding network work.
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(refreshBrandingFromServer, { timeout: 2500 });
  } else {
    setTimeout(refreshBrandingFromServer, 800);
  }
})();
