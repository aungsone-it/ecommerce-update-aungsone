import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Vite Configuration - Last updated: 20260307181500
// Custom plugin to handle figma:asset imports in production
const figmaAssetPlugin = () => ({
  name: 'figma-asset-resolver',
  resolveId(id: string) {
    if (id.startsWith('figma:asset')) {
      return id;
    }
  },
  load(id: string) {
    if (id.startsWith('figma:asset')) {
      // Return a placeholder data URL for production builds
      return `export default "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4="`;
    }
  }
});

/** Injects window.__VENDOR_SUBDOMAIN_SLUG_MAP__ for index.html inline redirect (build + dev). */
function injectSubdomainSlugMapPlugin(): Plugin {
  return {
    name: "inject-subdomain-slug-map",
    transformIndexHtml(html) {
      const raw =
        process.env.VENDOR_SUBDOMAIN_SLUG_MAP ||
        process.env.VITE_VENDOR_SUBDOMAIN_SLUG_MAP ||
        "{}";
      let obj: Record<string, string> = {};
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          obj = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
              .filter(([, v]) => typeof v === "string" && (v as string).length)
              .map(([k, v]) => [String(k).toLowerCase(), v as string])
          );
        }
      } catch {
        obj = {};
      }
      const script = `<script>window.__VENDOR_SUBDOMAIN_SLUG_MAP__=${JSON.stringify(obj)}<\/script>`;
      return html.replace("<head>", `<head>\n    ${script}`);
    },
  };
}

export default defineConfig(() => {
  const vendorSubdomainBase =
    process.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN ||
    process.env.VENDOR_SUBDOMAIN_BASE_DOMAIN ||
    "";

  const slugMapJson =
    process.env.VENDOR_SUBDOMAIN_SLUG_MAP ||
    process.env.VITE_VENDOR_SUBDOMAIN_SLUG_MAP ||
    "{}";

  return {
  define: {
    "import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN": JSON.stringify(vendorSubdomainBase),
    "import.meta.env.VITE_VENDOR_SUBDOMAIN_SLUG_MAP": JSON.stringify(slugMapJson),
  },
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    figmaAssetPlugin(),
    injectSubdomainSlugMapPlugin(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Explicitly disable PostCSS processing since @tailwindcss/vite handles it
  css: {
    postcss: null,
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Build configuration - keep it simple for Figma Make
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Core React — stable caching across route chunks
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react-vendor';
          }
          if (id.includes('react-router')) return 'router';
          // Heavy optional UI (admin / editors)
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          if (id.includes('recharts')) return 'charts';
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
          if (id.includes('emoji-picker-react')) return 'emoji-picker';
          if (id.includes('react-quill')) return 'react-quill';
        },
      },
    },
  },
};
})