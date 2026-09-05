export { defineSyncAdapter, isSyncStorageAdapter } from "./adapter/adapter";
export type {
  StorageAdapter,
  SyncAdapterDefinition,
  SyncStorageAdapter,
  WireOf,
} from "./adapter/adapter";
export { memoryAdapter } from "./adapter/memory-adapter";
export type { MemoryAdapterOptions, MemoryStorageAdapter } from "./adapter/memory-adapter";
export { requireBackend } from "./adapter/require-backend";
export type { BackendContext, BackendSource } from "./adapter/require-backend";
export { withFallback } from "./adapter/with-fallback";

export { ERROR_BRAND, STORAGE_ERROR_CODE, STORAGE_OPERATION } from "./errors/codes";
export type { StorageErrorCode, StorageOperation, ValueOperation } from "./errors/codes";
export {
  PlatformStorageError,
  StorageAdapterError,
  StorageSchemaError,
  StorageSerializationError,
  StorageUnavailableError,
  StorageValidationError,
  UnknownStorageKeyError,
} from "./errors/errors";
export type {
  StorageAdapterErrorOptions,
  StorageSerializationErrorOptions,
  StorageValidationErrorOptions,
  UnknownStorageKeyErrorOptions,
} from "./errors/errors";
export { formatIssues } from "./errors/format-issues";
export { isPlatformStorageError, isStorageValidationError } from "./errors/guards";

export { defineKey } from "./schema/define-key";
export { defineStorageSchema } from "./schema/define-storage-schema";
export type { ValidateDefinition } from "./schema/define-storage-schema";
export type {
  GetResult,
  KeyDefinition,
  KeyOf,
  KeyOptions,
  SetValue,
} from "./schema/key-definition";
export { isStorageSchema, SCHEMA_BRAND } from "./schema/storage-schema";
export type {
  StorageSchema,
  StorageSchemaBrand,
  StorageSchemaDefinition,
} from "./schema/storage-schema";

export { jsonSerializer } from "./serializer/json-serializer";
export { passthroughSerializer } from "./serializer/passthrough-serializer";
export type { SerializationDirection, Serializer } from "./serializer/serializer";

export { createStorage } from "./storage/create-storage";
export type {
  CreateStorageOptions,
  CreateStorageResult,
  GetOptions,
  PlatformStorage,
  SyncPlatformStorage,
  SyncStorageMethods,
} from "./storage/create-storage";
export { DEFAULT_INVALID_POLICY, INVALID_POLICY } from "./storage/invalid-policy";
export type {
  InvalidContext,
  InvalidPolicy,
  OnInvalid,
  OnInvalidCallback,
} from "./storage/invalid-policy";

export type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from "./types/json";
export type {
  SchemaInput,
  SchemaIssue,
  SchemaOutput,
  StandardSchemaV1,
} from "./types/standard-schema";
export type { Immutable, MaybePromise } from "./types/utils";
