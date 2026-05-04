/// <reference types="vite/client.d.ts" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_APIKEY: string;
  readonly VITE_FIREBASE_AUTHDOMAIN: string;
  readonly VITE_FIREBASE_PROJECTID: string;
  readonly VITE_FIREBASE_STORAGEBUCKET: string;
  readonly VITE_FIREBASE_MESSAGINGSENDERID: string;
  readonly VITE_FIREBASE_APPID: string;
  readonly VITE_FIREBASE_DATABASEURL?: string;
  readonly VITE_FIREBASE_MEASUREMENTID: string;
  readonly VITE_ENABLE_PRESENCE?: string;
  readonly VITE_PRESENCE_MODE?: 'flame' | 'footprint';
  readonly VITE_ENABLE_OXYGEN?: string;
  readonly VITE_ENABLE_OXYGEN_MEMORIALS?: string;
  readonly VITE_PRESENCE_API_BASE_URL?: string;

}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
