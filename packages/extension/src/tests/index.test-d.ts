import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import {
  createExtensionStorage,
  defineStorageSchema,
  EXTENSION_STORAGE_AREA,
  extensionStorageAdapter,
  passthroughSerializer,
  resolveExtensionStorage,
} from "../index";
import type {
  ExtensionStorageAreaName,
  ExtensionStorageNamespace,
  JsonValue,
  PlatformStorage,
  Serializer,
  StorageAdapter,
} from "../index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }) },
});

describe("@platform-storage/extension entry point", () => {
  it("re-exports the core API, so an app installs one package", () => {
    expectTypeOf(passthroughSerializer).toEqualTypeOf<Serializer<JsonValue>>();
  });

  it("derives the area union from the constant that names them", () => {
    expectTypeOf(Object.values(EXTENSION_STORAGE_AREA)).toEqualTypeOf<
      Array<ExtensionStorageAreaName>
    >();
    expectTypeOf<ExtensionStorageAreaName>().toEqualTypeOf<"local" | "sync" | "session">();
  });
});

describe("extensionStorageAdapter", () => {
  it("transports JSON values, because an area stores them natively", () => {
    expectTypeOf(extensionStorageAdapter()).toEqualTypeOf<StorageAdapter<JsonValue>>();
  });

  it("has no synchronous half, since an area only ever answers later", () => {
    expectTypeOf(extensionStorageAdapter()).not.toHaveProperty("getSync");
  });

  it("takes the namespace as a function, so a polyfill or a fake can be handed over", () => {
    void extensionStorageAdapter({ storage: resolveExtensionStorage });
    void extensionStorageAdapter({ storage: () => undefined });
  });

  it("refuses an area the browser does not have", () => {
    void extensionStorageAdapter({ area: "sync" });
    // @ts-expect-error - "managed" is not an area this package addresses
    void extensionStorageAdapter({ area: "managed" });
  });
});

describe("createExtensionStorage", () => {
  it("builds an asynchronous storage typed from the schema", () => {
    const storage = createExtensionStorage({ schema });

    expectTypeOf(storage).toEqualTypeOf<PlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage).not.toHaveProperty("getSync");

    // The README claims this is a compile error, because an area only ever answers later.
    // @ts-expect-error - there is no synchronous half on a storage over an extension area
    void storage.getSync("theme");
    expectTypeOf(storage.get("theme")).resolves.toEqualTypeOf<"light" | "dark">();
    expectTypeOf(storage.get("user")).resolves.toEqualTypeOf<
      { id: string; name: string } | undefined
    >();
  });

  it("takes the adapter's own options alongside the storage ones", () => {
    void createExtensionStorage({ schema, area: "session", name: "settings", onInvalid: "throw" });
  });

  it("supplies the adapter itself", () => {
    // @ts-expect-error - the adapter is what the factory exists to provide
    void createExtensionStorage({ schema, adapter: extensionStorageAdapter() });
  });

  /*
    The wire type is checked on what a serializer returns, not on what it accepts: `Serializer` declares both as methods, so their parameters are bivariant. A serializer producing a string is therefore fine here, because a string is a JSON value; one producing something outside JSON is not.
  */
  it("types the serializer against the JSON values an area transports", () => {
    void createExtensionStorage({ schema, serializer: passthroughSerializer });
    void createExtensionStorage({
      schema,
      serializer: { serialize: () => JSON.stringify({}), deserialize: (wire: JsonValue) => wire },
    });
    void createExtensionStorage({
      schema,
      // @ts-expect-error - `undefined` is not a JSON value, so an area cannot hold what this produces
      serializer: { serialize: () => undefined, deserialize: (wire: JsonValue) => wire },
    });
  });
});

describe("resolveExtensionStorage", () => {
  it("answers with nothing where no extension API is present, rather than throwing", () => {
    expectTypeOf(resolveExtensionStorage).returns.toEqualTypeOf<
      ExtensionStorageNamespace | undefined
    >();
  });
});
