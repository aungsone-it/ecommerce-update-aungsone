/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN: string;
  readonly VITE_VENDOR_SUBDOMAIN_SLUG_MAP: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
