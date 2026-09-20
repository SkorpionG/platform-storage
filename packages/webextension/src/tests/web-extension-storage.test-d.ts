import { describe, expectTypeOf, it } from "vitest";
import type { Browser } from "webextension-polyfill";
import * as z from "zod";

import {
  createWebExtensionStorage,
  defineStorageSchema,
  webExtensionStorageAdapter,
  passthroughSerializer,
  resolveWebExtensionStorage,
} from "../index";
import type {
  WebExtensionStorageNamespace,
  JsonValue,
  PlatformStorage,
  StorageAdapter,
} from "../index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }) },
});

describe("webExtensionStorageAdapter", () => {
  it("transports JSON values and answers only asynchronously", () => {
    expectTypeOf(webExtensionStorageAdapter()).toEqualTypeOf<StorageAdapter<JsonValue>>();
  });

  it("takes only the areas that exist", () => {
    void webExtensionStorageAdapter({ area: "local" });
    void webExtensionStorageAdapter({ area: "sync" });
    void webExtensionStorageAdapter({ area: "session" });
    // @ts-expect-error - "managed" is read-only and not an area this package addresses
    void webExtensionStorageAdapter({ area: "managed" });
  });

  it("takes the namespace as a function that may answer with nothing, so a checked lookup fits", () => {
    void webExtensionStorageAdapter({ storage: () => undefined });
    void webExtensionStorageAdapter({ storage: resolveWebExtensionStorage });
    expectTypeOf(resolveWebExtensionStorage).returns.toEqualTypeOf<
      WebExtensionStorageNamespace | undefined
    >();
  });

  /*
    The namespace counterpart of the area conformance tests in `types.test-d.ts`: whichever of these an application hands over has to satisfy `WebExtensionStorageNamespace`, or the structural declaration has drifted from a real API.
  */
  it("accepts the namespace from all three real declarations", () => {
    void webExtensionStorageAdapter({ storage: () => polyfill.storage });
    void webExtensionStorageAdapter({ storage: () => chrome.storage });
    void webExtensionStorageAdapter({ storage: () => browser.storage });
  });
});

declare const polyfill: Browser;

describe("createWebExtensionStorage", () => {
  it("builds a storage without the synchronous half, typed from the schema", () => {
    const storage = createWebExtensionStorage({ schema });

    expectTypeOf(storage).toEqualTypeOf<PlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage).not.toHaveProperty("getSync");
    expectTypeOf(storage.get("theme")).resolves.toEqualTypeOf<"light" | "dark">();
    expectTypeOf(storage.get("user")).resolves.toEqualTypeOf<
      { id: string; name: string } | undefined
    >();
  });

  it("supplies the adapter itself", () => {
    // @ts-expect-error - the adapter is what the factory exists to provide
    void createWebExtensionStorage({ schema, adapter: webExtensionStorageAdapter() });
  });

  it("takes the adapter's options and the remaining createStorage options, with the serializer typed against a JSON wire", () => {
    void createWebExtensionStorage({
      schema,
      area: "session",
      name: "settings",
      serializer: passthroughSerializer,
      onInvalid: "throw",
      onError: (error) => {
        expectTypeOf(error.code).toExtend<string>();
      },
    });
    void createWebExtensionStorage({
      schema,
      // @ts-expect-error - the area transports JSON values, which a Date is not
      serializer: { serialize: () => new Date(), deserialize: (wire: Date) => wire },
    });
  });
});
