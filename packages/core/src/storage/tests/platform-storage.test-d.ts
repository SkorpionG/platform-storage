import { describe, expectTypeOf, it } from "vitest";

import type { StorageAdapter, SyncStorageAdapter } from "../../adapter/adapter";
import type { JsonValue } from "../../types/json";
import type { Serializer } from "../../serializer/serializer";
import type { StorageSchema } from "../../schema/storage-schema";
import { countSchema, themeSchema } from "../../../tests/fixtures/schemas";
import { defineStorageSchema } from "../../schema/define-storage-schema";
import { memoryAdapter } from "../../adapter/memory-adapter";
import { createStorage } from "../create-storage";
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

/* A consumer's own option type, built the way the platform factories build theirs. */
interface WrappedOptions extends Omit<
  CreateStorageOptions<Definition, SyncStorageAdapter<string>>,
  "adapter"
> {
  readonly label: string;
}

function wrap(options: WrappedOptions): SyncPlatformStorage<Definition> {
  const { label, ...rest } = options;

  return createStorage({ ...rest, adapter: memoryAdapter({ name: label }) });
}

describe("CreateStorageOptions as something to build on", () => {
  it("can be extended by an interface and spread back into createStorage after an Omit", () => {
    expectTypeOf(wrap).returns.toEqualTypeOf<SyncPlatformStorage<Definition>>();
  });

  it("types prefix and readUnprefixed as plain options, leaving their pairing to createStorage", () => {
    expectTypeOf<
      CreateStorageOptions<Definition, SyncStorageAdapter<string>>["prefix"]
    >().toEqualTypeOf<string | undefined>();
    expectTypeOf<
      CreateStorageOptions<Definition, SyncStorageAdapter<string>>["readUnprefixed"]
    >().toEqualTypeOf<boolean | undefined>();
  });
});

describe("watch", () => {
  it("types a change after the key it follows", () => {
    const storage = {} as PlatformStorage<Definition>;

    storage.watch("count", (change) => {
      expectTypeOf(change.key).toEqualTypeOf<"count">();
      expectTypeOf(change.oldValue).toEqualTypeOf<number>();
      expectTypeOf(change.newValue).toEqualTypeOf<number>();
    });
  });

  it("names only declared keys, or none", () => {
    const storage = {} as PlatformStorage<Definition>;

    storage.onChange((key) => {
      expectTypeOf(key).toEqualTypeOf<"theme" | "count" | undefined>();
    });

    // @ts-expect-error The schema declares no such key.
    storage.watch("nope", () => undefined);
  });
});

describe("update", () => {
  it("hands the updater what get would answer with, and takes what set would accept", () => {
    const storage = {} as PlatformStorage<Definition>;

    void storage.update("count", (current) => {
      expectTypeOf(current).toEqualTypeOf<number>();

      return current + 1;
    });
  });

  it("refuses a next value of the wrong type", () => {
    const storage = {} as SyncPlatformStorage<Definition>;

    // @ts-expect-error The key holds a number.
    storage.updateSync("count", () => "nine");
  });
});
