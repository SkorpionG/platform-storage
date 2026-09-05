import { describe, expectTypeOf, it } from "vitest";
import type { Browser } from "webextension-polyfill";
import * as z from "zod";

import {
  createExtensionStorage,
  defineStorageSchema,
  extensionStorageAdapter,
  passthroughSerializer,
  resolveExtensionStorage,
} from "../index";
import type {
  ExtensionStorageNamespace,
  JsonValue,
  PlatformStorage,
  StorageAdapter,
} from "../index";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }) },
});

describe("extensionStorageAdapter", () => {
  it("transports JSON values and answers only asynchronously", () => {
    expectTypeOf(extensionStorageAdapter()).toEqualTypeOf<StorageAdapter<JsonValue>>();
  });

  it("takes only the areas that exist", () => {
    void extensionStorageAdapter({ area: "local" });
    void extensionStorageAdapter({ area: "sync" });
    void extensionStorageAdapter({ area: "session" });
    // @ts-expect-error - "managed" is read-only and not an area this package addresses
    void extensionStorageAdapter({ area: "managed" });
  });

  it("takes the namespace as a function that may answer with nothing, so a checked lookup fits", () => {
    void extensionStorageAdapter({ storage: () => undefined });
    void extensionStorageAdapter({ storage: resolveExtensionStorage });
    expectTypeOf(resolveExtensionStorage).returns.toEqualTypeOf<
      ExtensionStorageNamespace | undefined
    >();
  });

  /*
    The namespace counterpart of the area conformance tests in `types.test-d.ts`: whichever of these an application hands over has to satisfy `ExtensionStorageNamespace`, or the structural declaration has drifted from a real API.
  */
  it("accepts the namespace from all three real declarations", () => {
    void extensionStorageAdapter({ storage: () => polyfill.storage });
    void extensionStorageAdapter({ storage: () => chrome.storage });
    void extensionStorageAdapter({ storage: () => browser.storage });
  });
});

declare const polyfill: Browser;

describe("createExtensionStorage", () => {
  it("builds a storage without the synchronous half, typed from the schema", () => {
    const storage = createExtensionStorage({ schema });

    expectTypeOf(storage).toEqualTypeOf<PlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage).not.toHaveProperty("getSync");
    expectTypeOf(storage.get("theme")).resolves.toEqualTypeOf<"light" | "dark">();
    expectTypeOf(storage.get("user")).resolves.toEqualTypeOf<
      { id: string; name: string } | undefined
    >();
  });

  it("supplies the adapter itself", () => {
    // @ts-expect-error - the adapter is what the factory exists to provide
    void createExtensionStorage({ schema, adapter: extensionStorageAdapter() });
  });

  it("takes the adapter's options and the remaining createStorage options, with the serializer typed against a JSON wire", () => {
    void createExtensionStorage({
      schema,
      area: "session",
      name: "settings",
      serializer: passthroughSerializer,
      onInvalid: "throw",
      onError: (error) => {
        expectTypeOf(error.code).toExtend<string>();
      },
    });
    void createExtensionStorage({
      schema,
      // @ts-expect-error - the area transports JSON values, which a Date is not
      serializer: { serialize: () => new Date(), deserialize: (wire: Date) => wire },
    });
  });
});
