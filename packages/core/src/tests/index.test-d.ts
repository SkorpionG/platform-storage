import { describe, expectTypeOf, it } from "vitest";

import {
  createStorage,
  defineKey,
  defineStorageSchema,
  DEFAULT_INVALID_POLICY,
  INVALID_POLICY,
  isPlatformStorageError,
  isStorageSchema,
  isSyncStorageAdapter,
  jsonSerializer,
  memoryAdapter,
  passthroughSerializer,
  STORAGE_ERROR_CODE,
  STORAGE_OPERATION,
} from "../index";
import type {
  InvalidPolicy,
  JsonValue,
  Serializer,
  StorageErrorCode,
  StorageOperation,
  SyncPlatformStorage,
} from "../index";
import { themeSchema } from "../../tests/fixtures/schemas";

const schema = defineStorageSchema({ theme: defineKey(themeSchema, { default: "light" }) });

describe("@platform-storage/core entry point", () => {
  it("publishes the serializers with the wire type each transports", () => {
    expectTypeOf(jsonSerializer).toEqualTypeOf<Serializer<string>>();
    expectTypeOf(passthroughSerializer).toEqualTypeOf<Serializer<JsonValue>>();
  });

  it("publishes the guards as type predicates, so a caught value narrows", () => {
    const caught: unknown = undefined;

    if (isPlatformStorageError(caught)) expectTypeOf(caught.code).toEqualTypeOf<StorageErrorCode>();
    if (isStorageSchema(caught)) expectTypeOf(caught.keys).toExtend<ReadonlyArray<string>>();
  });

  /* Each constant is published as a value and its union as a type. Reading the values back proves both halves arrived and that every member of the constant is a member of the union. */
  it("derives every union from the constant it is declared with, so the two cannot drift", () => {
    expectTypeOf(Object.values(STORAGE_ERROR_CODE)).toEqualTypeOf<Array<StorageErrorCode>>();
    expectTypeOf(Object.values(STORAGE_OPERATION)).toEqualTypeOf<Array<StorageOperation>>();
    expectTypeOf(Object.values(INVALID_POLICY)).toEqualTypeOf<Array<InvalidPolicy>>();
    expectTypeOf(DEFAULT_INVALID_POLICY).toEqualTypeOf<InvalidPolicy>();
  });

  it("builds a storage whose keys and values come from the schema alone", () => {
    const storage = createStorage({ schema, adapter: memoryAdapter() });

    expectTypeOf(storage).toEqualTypeOf<SyncPlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage.getSync("theme")).toEqualTypeOf<"light" | "dark">();
    // @ts-expect-error - "nope" is not one of the declared keys
    void storage.get("nope");
  });

  it("narrows an adapter to its synchronous form, which is what unlocks the synchronous half", () => {
    const adapter = memoryAdapter();

    if (isSyncStorageAdapter(adapter)) expectTypeOf(adapter.getSync).toBeFunction();
  });
});

describe("what the entry point deliberately withholds", () => {
  /*
    The pipeline stages, the adapter-call wrapper and the `MaybePromise` helpers are the engine's own vocabulary. Publishing them would freeze the internals into the contract, and nothing outside needs them to write an adapter or a schema.
  */
  it("keeps the engine internals unpublished", async () => {
    const entry = await import("../index");

    expectTypeOf(entry).not.toHaveProperty("callAdapter");
    expectTypeOf(entry).not.toHaveProperty("chain");
    expectTypeOf(entry).not.toHaveProperty("expectSync");
    expectTypeOf(entry).not.toHaveProperty("isPromiseLike");
    expectTypeOf(entry).not.toHaveProperty("deserializeWire");
    expectTypeOf(entry).not.toHaveProperty("serializeValue");
    expectTypeOf(entry).not.toHaveProperty("validateValue");
    expectTypeOf(entry).not.toHaveProperty("resolveMissing");
    expectTypeOf(entry).not.toHaveProperty("createAsyncIo");
    expectTypeOf(entry).not.toHaveProperty("createSyncIo");
    expectTypeOf(entry).not.toHaveProperty("applyInvalidPolicy");
    expectTypeOf(entry).not.toHaveProperty("resolveOnInvalid");
  });
});
