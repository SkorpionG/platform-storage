export * from "@platform-storage/core";

export { isQuotaExceeded, isWebStorageAvailable, webStorageAdapter } from "./web-storage-adapter";
export type { WebStorageAdapterOptions, WebStorageSource } from "./web-storage-adapter";
export {
  createLocalStorage,
  createSessionStorage,
  localStorageAdapter,
  sessionStorageAdapter,
} from "./web-storage";
export type { CreateWebStorageOptions } from "./web-storage";
