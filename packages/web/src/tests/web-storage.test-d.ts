import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import {
  createLocalStorage,
  createSessionStorage,
  defineStorageSchema,
  jsonSerializer,
  memoryAdapter,
  sessionStorageAdapter,
} from "../index";
import type { StorageAdapter, SyncPlatformStorage } from "../index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
});
type Definition = typeof schema.definition;

/** A backend that only answers later, which a web storage's fallback may not be. */
const later: StorageAdapter<string> = {
  name: "later",
  serializer: jsonSerializer,
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

describe("a web factory's fallback", () => {
  it("keeps the synchronous half, whether the fallback is memory, another web storage or none", () => {
    expectTypeOf(createLocalStorage({ schema, fallback: "memory" })).toEqualTypeOf<
      SyncPlatformStorage<Definition>
    >();
    expectTypeOf(createLocalStorage({ schema, fallback: sessionStorageAdapter() })).toEqualTypeOf<
      SyncPlatformStorage<Definition>
    >();
    expectTypeOf(createSessionStorage({ schema, fallback: memoryAdapter() })).toEqualTypeOf<
      SyncPlatformStorage<Definition>
    >();
    expectTypeOf(createLocalStorage({ schema })).toEqualTypeOf<SyncPlatformStorage<Definition>>();
  });

  it("refuses a fallback that only answers later, which would cost the synchronous half", () => {
    // @ts-expect-error A web storage's fallback has to answer immediately.
    createLocalStorage({ schema, fallback: later });
    // @ts-expect-error Only "memory" is a name a fallback can be given by.
    createSessionStorage({ schema, fallback: "disk" });
  });
});
