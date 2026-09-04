import { describe, expectTypeOf, it } from "vitest";

import { createStorage, defineStorageSchema, jsonSerializer, memoryAdapter } from "../../index";
import type { InvalidContext, KeyOf, PlatformStorage, SyncPlatformStorage } from "../../index";
import {
  countSchema,
  nicknameSchema,
  tagsSchema,
  themeCatchSchema,
  themeSchema,
  userSchema,
} from "../../../tests/fixtures/schemas";
import { asyncOnlyAdapter } from "../../../tests/fakes/adapters";

interface User {
  id: string;
  name: string;
}

const schema = defineStorageSchema({
  theme: { schema: themeSchema },
  themeWithDefault: { schema: themeSchema, default: "light" },
  themeCatch: { schema: themeCatchSchema },
  count: { schema: countSchema },
  nickname: { schema: nicknameSchema },
  user: { schema: userSchema },
  tags: { schema: tagsSchema },
});

const storage = createStorage({ schema, adapter: memoryAdapter() });

const asyncStorage = createStorage({ schema, adapter: asyncOnlyAdapter });

describe("get", () => {
  it("returns the schema's output, admitting undefined only where a read can produce it", async () => {
    expectTypeOf(await storage.get("theme")).toEqualTypeOf<"light" | "dark" | undefined>();
    expectTypeOf(await storage.get("themeWithDefault")).toEqualTypeOf<"light" | "dark">();
    expectTypeOf(await storage.get("count")).toEqualTypeOf<number>();
    expectTypeOf(await storage.get("user")).toEqualTypeOf<User | undefined>();
    expectTypeOf(await storage.get("nickname")).toEqualTypeOf<string | undefined>();
  });

  it("keeps undefined for a catch schema, which covers invalid rather than missing data", async () => {
    expectTypeOf(await storage.get("themeCatch")).toEqualTypeOf<"light" | "dark" | undefined>();
  });

  it("completes only the keys the schema declares", () => {
    // Read off the schema rather than the method: `get` is generic, and asking a generic signature for its parameter type resolves it to `never`.
    expectTypeOf<KeyOf<typeof schema.definition>>().toEqualTypeOf<
      "theme" | "themeWithDefault" | "themeCatch" | "count" | "nickname" | "user" | "tags"
    >();
  });

  it("rejects a key the schema does not declare", () => {
    // @ts-expect-error - "nope" is not one of the declared keys
    void storage.get("nope");
  });

  /*
    The per-call option is the checked place to write a callback. Nothing is being inferred here, so the callback gets a real expectation and its literal return does not widen the way an inline one in a schema declaration does.
  */
  it("checks a callback given for one read", () => {
    void storage.get("theme", { onInvalid: () => "dark" });
    void storage.get("theme", {
      onInvalid: (context) => {
        expectTypeOf(context).toEqualTypeOf<InvalidContext>();
        return context.raw === "auto" ? "dark" : undefined;
      },
    });
  });

  it("rejects a callback returning a value the key cannot hold", () => {
    // @ts-expect-error - "purple" is not one of the schema's values
    void storage.get("theme", { onInvalid: () => "purple" });
  });

  it("refuses undefined from a callback for a key that promised a value", () => {
    // @ts-expect-error - this key declares a default, so a read never comes back empty
    void storage.get("themeWithDefault", { onInvalid: () => undefined });
  });

  it("accepts a named policy for one read", () => {
    void storage.get("theme", { onInvalid: "remove" });
    // @ts-expect-error - "reset" is not one of the policies
    void storage.get("theme", { onInvalid: "reset" });
  });
});

describe("set", () => {
  it("takes the schema's output type", () => {
    void storage.set("theme", "dark");
    void storage.set("count", 3);
    void storage.set("user", { id: "u1", name: "Ada" });
    void storage.set("tags", ["a"]);
  });

  it("rejects a value the schema does not describe", () => {
    // @ts-expect-error - "purple" is not one of the schema's values
    void storage.set("theme", "purple");
  });

  it("rejects a value of the wrong shape entirely", () => {
    // @ts-expect-error - the schema describes an object, not a string
    void storage.set("user", "Ada");
  });

  it("stays narrow for a catch schema, whose input type would be unusably wide", () => {
    // @ts-expect-error - `z.catch()` accepts anything as input; the write still takes the value type
    void storage.set("themeCatch", 123);
  });

  it("accepts undefined only where the schema produces it", () => {
    void storage.set("nickname", undefined);
    // @ts-expect-error - this schema never produces undefined
    void storage.set("theme", undefined);
  });
});

describe("the rest of the surface", () => {
  it("returns promises from every asynchronous method", () => {
    expectTypeOf(storage.remove).returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf(storage.has).returns.toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(storage.clear).returns.toEqualTypeOf<Promise<void>>();
  });

  it("resolves a logical key to the key its backend stores under", () => {
    expectTypeOf(storage.physicalKey).returns.toEqualTypeOf<string>();
  });

  it("rejects an undeclared key everywhere a key is taken", () => {
    // @ts-expect-error - "nope" is not one of the declared keys
    void storage.remove("nope");
    // @ts-expect-error - "nope" is not one of the declared keys
    void storage.has("nope");
    // @ts-expect-error - "nope" is not one of the declared keys
    void storage.physicalKey("nope");
  });
});

describe("the synchronous half", () => {
  it("is present when the adapter can answer immediately", () => {
    expectTypeOf(storage).toExtend<SyncPlatformStorage<typeof schema.definition>>();
    expectTypeOf(storage.getSync("themeWithDefault")).toEqualTypeOf<"light" | "dark">();
    expectTypeOf(storage.getSync("theme")).toEqualTypeOf<"light" | "dark" | undefined>();
    expectTypeOf(storage.hasSync).returns.toEqualTypeOf<boolean>();
    expectTypeOf(storage.clearSync).returns.toEqualTypeOf<void>();
  });

  it("is absent when the adapter cannot", () => {
    expectTypeOf(asyncStorage).toEqualTypeOf<PlatformStorage<typeof schema.definition>>();
    expectTypeOf(asyncStorage).not.toHaveProperty("getSync");
    expectTypeOf(asyncStorage).not.toHaveProperty("setSync");
    expectTypeOf(asyncStorage).not.toHaveProperty("clearSync");
  });

  it("checks values the same way the asynchronous half does", () => {
    // @ts-expect-error - "purple" is not one of the schema's values
    storage.setSync("theme", "purple");
  });
});

describe("createStorage options", () => {
  it("requires a serializer matching what the adapter transports", () => {
    void createStorage({ schema, adapter: memoryAdapter(), serializer: jsonSerializer });
  });

  it("rejects a serializer for a different wire type", () => {
    void createStorage({
      schema,
      adapter: memoryAdapter(),
      // @ts-expect-error - this adapter transports strings, not JSON values
      serializer: { serialize: () => ({}), deserialize: (wire: object) => wire },
    });
  });

  it("takes an observer over the errors this library raises", () => {
    void createStorage({
      schema,
      adapter: memoryAdapter(),
      onError: (error) => {
        expectTypeOf(error.code).toExtend<string>();
      },
    });
  });
});
