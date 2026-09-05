export * from "@platform-storage/core";

export { extensionStorageAdapter } from "./extension-storage-adapter";
export type { ExtensionStorageAdapterOptions } from "./extension-storage-adapter";
export { createExtensionStorage } from "./extension-storage";
export type { CreateExtensionStorageOptions } from "./extension-storage";
export { resolveExtensionStorage } from "./resolve-storage";
export { EXTENSION_STORAGE_AREA } from "./types";
export type {
  ExtensionStorageArea,
  ExtensionStorageAreaName,
  ExtensionStorageNamespace,
} from "./types";
