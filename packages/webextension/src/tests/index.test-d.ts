import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import {
  createWebExtensionStorage,
  defineStorageSchema,
  WEB_EXTENSION_STORAGE_AREA,
  webExtensionStorageAdapter,
  passthroughSerializer,
  resolveWebExtensionStorage,
} from "../index";
import type {
  WebExtensionStorageAreaName,
  WebExtensionStorageNamespace,
  JsonValue,
  PlatformStorage,
  Serializer,
  StorageAdapter,
} from "../index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }) },
});

describe("@platform-storage/webextension entry point", () => {
  it("re-exports the core API, so an app installs one package", () => {
    expectTypeOf(passthroughSerializer).toEqualTypeOf<Serializer<JsonValue>>();
  });

  it("derives the area union from the constant that names them", () => {
    expectTypeOf(Object.values(WEB_EXTENSION_STORAGE_AREA)).toEqualTypeOf<
      Array<WebExtensionStorageAreaName>
    >();
    expectTypeOf<WebExtensionStorageAreaName>().toEqualTypeOf<"local" | "sync" | "session">();
  });
});

describe("webExtensionStorageAdapter", () => {
  it("transports JSON values, because an area stores them natively", () => {
    expectTypeOf(webExtensionStorageAdapter()).toEqualTypeOf<StorageAdapter<JsonValue>>();
  });

  it("has no synchronous half, since an area only ever answers later", () => {
    expectTypeOf(webExtensionStorageAdapter()).not.toHaveProperty("getSync");
  });

  it("takes the namespace as a function, so a polyfill or a fake can be handed over", () => {
    void webExtensionStorageAdapter({ storage: resolveWebExtensionStorage });
    void webExtensionStorageAdapter({ storage: () => undefined });
  });

  it("refuses an area the browser does not have", () => {
    void webExtensionStorageAdapter({ area: "sync" });
    // @ts-expect-error - "managed" is not an area this package addresses
    void webExtensionStorageAdapter({ area: "managed" });
  });
});

describe("createWebExtensionStorage", () => {
  it("builds an asynchronous storage typed from the schema", () => {
    const storage = createWebExtensionStorage({ schema });

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
    void createWebExtensionStorage({
      schema,
      area: "session",
      name: "settings",
      onInvalid: "throw",
    });
  });

  it("supplies the adapter itself", () => {
    // @ts-expect-error - the adapter is what the factory exists to provide
    void createWebExtensionStorage({ schema, adapter: webExtensionStorageAdapter() });
  });

  /*
    The wire type is checked on what a serializer returns, not on what it accepts: `Serializer` declares both as methods, so their parameters are bivariant. A serializer producing a string is therefore fine here, because a string is a JSON value; one producing something outside JSON is not.
  */
  it("types the serializer against the JSON values an area transports", () => {
    void createWebExtensionStorage({ schema, serializer: passthroughSerializer });
    void createWebExtensionStorage({
      schema,
      serializer: { serialize: () => JSON.stringify({}), deserialize: (wire: JsonValue) => wire },
    });
    void createWebExtensionStorage({
      schema,
      // @ts-expect-error - `undefined` is not a JSON value, so an area cannot hold what this produces
      serializer: { serialize: () => undefined, deserialize: (wire: JsonValue) => wire },
    });
  });
});

describe("resolveWebExtensionStorage", () => {
  it("answers with nothing where no extension API is present, rather than throwing", () => {
    expectTypeOf(resolveWebExtensionStorage).returns.toEqualTypeOf<
      WebExtensionStorageNamespace | undefined
    >();
  });
});
