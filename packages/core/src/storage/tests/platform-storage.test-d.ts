import { describe, expectTypeOf, it } from "vitest";

import type { StorageAdapter, SyncStorageAdapter } from "../../adapter/adapter";
import type { JsonValue } from "../../types/json";
import type { Serializer } from "../../serializer/serializer";
import type { StorageSchema } from "../../schema/storage-schema";
import { countSchema, themeSchema } from "../../../tests/fixtures/schemas";
import { defineStorageSchema } from "../../schema/define-storage-schema";
import type {
  CreateStorageOptions,
  CreateStorageResult,
  PlatformStorage,
  SyncPlatformStorage,
  SyncStorageMethods,
} from "../platform-storage";

const schema = defineStorageSchema({
  theme: { schema: themeSchema },
  count: { schema: countSchema },
});

type Definition = typeof schema.definition;

/*
  These assert the shape of the published storage types themselves, independently of the factory that builds one. `create-storage.test-d.ts` covers what `createStorage` infers; this covers what a consumer can write the types down as.
*/

describe("CreateStorageResult", () => {
  it("carries the synchronous half for an adapter that can answer immediately", () => {
    expectTypeOf<CreateStorageResult<Definition, SyncStorageAdapter<string>>>().toEqualTypeOf<
      SyncPlatformStorage<Definition>
    >();
  });

  it("omits it for one that cannot", () => {
    expectTypeOf<CreateStorageResult<Definition, StorageAdapter<string>>>().toEqualTypeOf<
      PlatformStorage<Definition>
    >();
  });

  it("decides on the adapter alone, whatever the adapter transports", () => {
    expectTypeOf<CreateStorageResult<Definition, SyncStorageAdapter<JsonValue>>>().toEqualTypeOf<
      SyncPlatformStorage<Definition>
    >();
  });
});

describe("SyncPlatformStorage", () => {
  it("is the asynchronous surface plus the synchronous methods, never a replacement for it", () => {
    expectTypeOf<SyncPlatformStorage<Definition>>().toExtend<PlatformStorage<Definition>>();
    expectTypeOf<SyncPlatformStorage<Definition>>().toExtend<SyncStorageMethods<Definition>>();
    expectTypeOf<PlatformStorage<Definition>>().not.toExtend<SyncStorageMethods<Definition>>();
  });
});

describe("PlatformStorage", () => {
  it("exposes the schema it was built from, so tooling can read the declaration back", () => {
    expectTypeOf<PlatformStorage<Definition>["schema"]>().toEqualTypeOf<
      StorageSchema<Definition>
    >();
  });

  it("widens the adapter it exposes, since a storage does not carry its backend's wire type", () => {
    expectTypeOf<PlatformStorage<Definition>["adapter"]>().toEqualTypeOf<StorageAdapter<unknown>>();
  });
});

describe("CreateStorageOptions", () => {
  it("types the serializer against what the adapter transports", () => {
    expectTypeOf<
      NonNullable<CreateStorageOptions<Definition, SyncStorageAdapter<string>>["serializer"]>
    >().toEqualTypeOf<Serializer<string>>();
    expectTypeOf<
      NonNullable<CreateStorageOptions<Definition, StorageAdapter<JsonValue>>["serializer"]>
    >().toEqualTypeOf<Serializer<JsonValue>>();
  });

  it("makes everything but the schema and the adapter optional", () => {
    expectTypeOf<{
      schema: StorageSchema<Definition>;
      adapter: SyncStorageAdapter<string>;
    }>().toExtend<CreateStorageOptions<Definition, SyncStorageAdapter<string>>>();
  });
});
