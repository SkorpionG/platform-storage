export * from "@platform-storage/core";

export { webExtensionStorageAdapter } from "./web-extension-storage-adapter";
export type { WebExtensionStorageAdapterOptions } from "./web-extension-storage-adapter";
export { createWebExtensionStorage } from "./web-extension-storage";
export type { CreateWebExtensionStorageOptions } from "./web-extension-storage";
export { resolveWebExtensionStorage } from "./resolve-storage";
export { WEB_EXTENSION_STORAGE_AREA } from "./types";
export type {
  WebExtensionStorageArea,
  WebExtensionStorageAreaName,
  WebExtensionStorageNamespace,
} from "./types";
