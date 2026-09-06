import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import {
  asyncStorageAdapter,
  createReactNativeStorage,
  defineStorageSchema,
  jsonSerializer,
} from "../index";
import type { PlatformStorage, StorageAdapter } from "../index";
import { fakeAsyncStorage } from "../../tests/fakes/fake-async-storage";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }) },
});

describe("asyncStorageAdapter", () => {
  it("transports strings and answers only asynchronously", () => {
    expectTypeOf(asyncStorageAdapter(fakeAsyncStorage())).toEqualTypeOf<StorageAdapter<string>>();
  });

  it("takes anything with AsyncStorage's shape, so no native module is needed to build one", () => {
    void asyncStorageAdapter({
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    });
  });
});

describe("createReactNativeStorage", () => {
  it("builds a storage without the synchronous half, typed from the schema", () => {
    const storage = createReactNativeStorage({ schema, asyncStorage: fakeAsyncStorage() });

    expectTypeOf(storage).toEqualTypeOf<PlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage).not.toHaveProperty("getSync");
    expectTypeOf(storage.get("theme")).resolves.toEqualTypeOf<"light" | "dark">();
    expectTypeOf(storage.get("user")).resolves.toEqualTypeOf<
      { id: string; name: string } | undefined
    >();
  });

  it("requires the storage instance, since nothing here can import one", () => {
    // @ts-expect-error - the instance is the application's to supply
    void createReactNativeStorage({ schema });
  });

  it("supplies the adapter itself", () => {
    void createReactNativeStorage({
      schema,
      asyncStorage: fakeAsyncStorage(),
      // @ts-expect-error - the adapter is what the factory exists to provide
      adapter: asyncStorageAdapter(fakeAsyncStorage()),
    });
  });

  it("takes the remaining createStorage options, with the serializer typed against a string wire", () => {
    void createReactNativeStorage({
      schema,
      asyncStorage: fakeAsyncStorage(),
      name: "device",
      serializer: jsonSerializer,
      onInvalid: "throw",
      onError: (error) => {
        expectTypeOf(error.code).toExtend<string>();
      },
    });
    void createReactNativeStorage({
      schema,
      asyncStorage: fakeAsyncStorage(),
      // @ts-expect-error - AsyncStorage transports strings, not JSON values
      serializer: { serialize: () => ({}), deserialize: (wire: object) => wire },
    });
  });
});
