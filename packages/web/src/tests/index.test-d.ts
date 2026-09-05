import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import {
  createLocalStorage,
  createSessionStorage,
  defineStorageSchema,
  isWebStorageAvailable,
  jsonSerializer,
  localStorageAdapter,
  sessionStorageAdapter,
  webStorageAdapter,
} from "../index";
import type {
  Serializer,
  SyncPlatformStorage,
  SyncStorageAdapter,
  WebStorageSource,
} from "../index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }) },
});

describe("@platform-storage/web entry point", () => {
  it("re-exports the core API, so an app installs one package", () => {
    expectTypeOf(jsonSerializer).toEqualTypeOf<Serializer<string>>();
  });
});

describe("the adapters", () => {
  it("are synchronous, since web storage always answers immediately", () => {
    expectTypeOf(localStorageAdapter()).toEqualTypeOf<SyncStorageAdapter<string>>();
    expectTypeOf(sessionStorageAdapter()).toEqualTypeOf<SyncStorageAdapter<string>>();
    expectTypeOf(webStorageAdapter(() => localStorage)).toEqualTypeOf<SyncStorageAdapter<string>>();
  });

  it("take the storage as a function, so the access itself can be guarded", () => {
    expectTypeOf(webStorageAdapter).parameter(0).toEqualTypeOf<WebStorageSource>();
    expectTypeOf(isWebStorageAvailable).parameter(0).toEqualTypeOf<WebStorageSource>();
  });

  it("accept a getter that answers with nothing, which is how a checked access is usually written", () => {
    void webStorageAdapter(() => (typeof window === "undefined" ? undefined : window.localStorage));
    void webStorageAdapter(() => null);
  });
});

describe("createLocalStorage and createSessionStorage", () => {
  it("build a storage with the synchronous half, typed from the schema", () => {
    const storage = createLocalStorage({ schema });

    expectTypeOf(storage).toEqualTypeOf<SyncPlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage.getSync("theme")).toEqualTypeOf<"light" | "dark">();
    expectTypeOf(storage.getSync("user")).toEqualTypeOf<{ id: string; name: string } | undefined>();
    expectTypeOf(createSessionStorage({ schema })).toEqualTypeOf<
      SyncPlatformStorage<typeof schema.definition>
    >();
  });

  it("supply the adapter themselves", () => {
    // @ts-expect-error - the adapter is what the factory exists to provide
    void createLocalStorage({ schema, adapter: localStorageAdapter() });
  });

  it("take the remaining createStorage options, with the serializer typed against a string wire", () => {
    void createLocalStorage({
      schema,
      serializer: jsonSerializer,
      onInvalid: "throw",
      onError: (error) => {
        expectTypeOf(error.code).toExtend<string>();
      },
    });
    void createSessionStorage({
      schema,
      // @ts-expect-error - web storage transports strings, not JSON values
      serializer: { serialize: () => ({}), deserialize: (wire: object) => wire },
    });
  });
});
