/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_BASE?: string;
  readonly VITE_PLUNK_WEB_URL?: string;
  readonly VITE_CESDK_LICENSE?: string;
  readonly VITE_CESDK_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
