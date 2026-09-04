import { describe, expectTypeOf, it } from "vitest";

import type {
  PlatformStorage,
  StorageAdapter,
  StorageOperation,
  StorageSchemaDefinition,
  SyncStorageAdapter,
  SyncStorageMethods,
} from "../src/index";

/*
  These assertions tie the operation names errors report to the operations that actually exist. Adding a method to the adapter contract or to the storage interface without naming it in `STORAGE_OPERATION` fails here, rather than producing an error at runtime that reports an operation nothing else knows about.
*/

/** Everything an adapter exposes that is an operation rather than metadata. */
type AdapterOperationMethods = Exclude<
  Extract<keyof StorageAdapter, string>,
  "name" | "serializer" | "isAvailable"
>;

/** Everything a storage exposes that is an operation rather than metadata. */
type StorageOperationMethods = Exclude<
  Extract<keyof PlatformStorage<StorageSchemaDefinition>, string>,
  "schema" | "adapter" | "physicalKey"
>;

/** A name with the synchronous suffix removed, so both halves compare against the same words. */
type WithoutSyncSuffix<Name> = Name extends `${infer Base}Sync` ? Base : never;

describe("StorageOperation", () => {
  it("names every operation the adapter contract exposes", () => {
    expectTypeOf<AdapterOperationMethods>().toExtend<StorageOperation>();
  });

  it("names every operation the synchronous adapter contract exposes", () => {
    expectTypeOf<
      WithoutSyncSuffix<Extract<keyof SyncStorageAdapter, string>>
    >().toExtend<StorageOperation>();
  });

  it("matches the storage interface exactly, in both directions", () => {
    expectTypeOf<StorageOperationMethods>().toExtend<StorageOperation>();
    expectTypeOf<Exclude<StorageOperation, StorageOperationMethods>>().toEqualTypeOf<never>();
  });

  it("matches the synchronous half of the storage interface exactly", () => {
    expectTypeOf<
      WithoutSyncSuffix<Extract<keyof SyncStorageMethods<StorageSchemaDefinition>, string>>
    >().toEqualTypeOf<StorageOperation>();
  });

  it("declares exactly one operation an adapter does not implement", () => {
    // `clear` belongs to the storage, which removes the keys its schema declares one at a time rather than asking a backend to wipe an origin it shares with other code.
    expectTypeOf<Exclude<StorageOperation, AdapterOperationMethods>>().toEqualTypeOf<"clear">();
  });
});
