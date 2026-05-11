/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN: string;
  readonly VITE_VENDOR_SUBDOMAIN_SLUG_MAP: string;
  /** Matches Edge secret `EDGE_ADMIN_OPERATION_SECRET` for destructive admin API calls. */
  readonly VITE_ADMIN_OPERATION_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
