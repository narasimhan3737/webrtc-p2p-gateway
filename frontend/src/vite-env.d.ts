/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SIGNALING_URL: string;
  readonly VITE_DM_MEDIASERVER_BASE: string;
  /** @deprecated use VITE_DM_MEDIASERVER_BASE */
  readonly VITE_GO2RTC_BASE?: string;
  readonly VITE_TURN_HOST: string;
  readonly VITE_TURN_USERNAME: string;
  readonly VITE_TURN_CREDENTIAL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
