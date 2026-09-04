import { describe, expectTypeOf, it } from "vitest";

import { defineKey, defineStorageSchema } from "../../index";
import type {
  GetResult,
  InvalidContext,
  KeyOf,
  OnInvalidCallback,
  SchemaIssue,
  StorageSchema,
} from "../../index";
import { countSchema, tagsSchema, themeSchema, userSchema } from "../../../tests/fixtures/schemas";

interface User {
  id: string;
  name: string;
}

const schema = defineStorageSchema({
  theme: { schema: themeSchema, default: "light" },
  user: { schema: userSchema, key: "app:user" },
  count: { schema: countSchema },
});

type Definition = (typeof schema)["definition"];

/* Declared out here so it is checked the way a consumer's own named callback would be, with nothing being inferred around it. */
const recover: OnInvalidCallback<"light" | "dark"> = () => "dark";

// @ts-expect-error - "purple" is not one of the schema's values
const brokenRecover: OnInvalidCallback<"light" | "dark"> = () => "purple";
void brokenRecover;

describe("defineStorageSchema inference", () => {
  it("derives the key union from the object literal, with no type argument to write", () => {
    expectTypeOf<KeyOf<Definition>>().toEqualTypeOf<"theme" | "user" | "count">();
  });

  it("carries the definition through, so each key keeps its own result type", () => {
    expectTypeOf<GetResult<Definition["theme"]>>().toEqualTypeOf<"light" | "dark">();
    expectTypeOf<GetResult<Definition["user"]>>().toEqualTypeOf<User | undefined>();
    expectTypeOf<GetResult<Definition["count"]>>().toEqualTypeOf<number>();
  });

  it("maps every declared key to a physical key", () => {
    expectTypeOf(schema.physicalKeys).toEqualTypeOf<{
      readonly theme: string;
      readonly user: string;
      readonly count: string;
    }>();
  });

  it("produces a schema a storage can accept", () => {
    expectTypeOf(schema).toExtend<StorageSchema<Definition>>();
  });
});

describe("defineStorageSchema checking", () => {
  it("rejects a default the schema would not accept", () => {
    defineStorageSchema({
      // @ts-expect-error - "purple" is not one of the schema's values
      theme: { schema: themeSchema, default: "purple" },
    });
  });

  it("rejects a default of the wrong shape entirely", () => {
    defineStorageSchema({
      // @ts-expect-error - the schema describes an object, not a string
      user: { schema: userSchema, default: "nobody" },
    });
  });

  it("accepts an array default, which the const inference makes readonly", () => {
    const withTags = defineStorageSchema({ tags: { schema: tagsSchema, default: ["a", "b"] } });

    expectTypeOf<GetResult<(typeof withTags)["definition"]["tags"]>>().toEqualTypeOf<
      Array<string>
    >();
  });

  it("rejects an array default whose elements are wrong", () => {
    defineStorageSchema({
      // @ts-expect-error - the schema describes strings, not numbers
      tags: { schema: tagsSchema, default: [1, 2] },
    });
  });

  it("rejects an entry with no schema at all", () => {
    defineStorageSchema({
      // @ts-expect-error - every entry needs a schema
      theme: { default: "light" },
    });
  });
});

describe("per-key onInvalid", () => {
  it("types the context handed to a callback", () => {
    defineStorageSchema({
      theme: {
        schema: themeSchema,
        default: "light",
        onInvalid: (context: InvalidContext) => {
          expectTypeOf(context.key).toEqualTypeOf<string>();
          expectTypeOf(context.physicalKey).toEqualTypeOf<string>();
          expectTypeOf(context.raw).toEqualTypeOf<unknown>();
          expectTypeOf(context.issues).toEqualTypeOf<ReadonlyArray<SchemaIssue>>();
          return "dark";
        },
      },
    });
  });

  /*
    A callback declared inline is trusted rather than checked. Constraining the object being inferred against a type derived from that same object leaves an inline callback without a usable contextual type, so its literal return widens to `string`; a narrower expectation would then reject `() => "dark"`, which the schema plainly allows. The next test shows the checked form.
  */
  it("accepts an inline callback without checking what it returns", () => {
    defineStorageSchema({
      theme: { schema: themeSchema, default: "light", onInvalid: () => "anything at all" },
    });
  });

  it("checks a callback given the OnInvalidCallback type, where nothing is being inferred", () => {
    defineStorageSchema({ theme: { schema: themeSchema, default: "light", onInvalid: recover } });

    expectTypeOf(recover).toExtend<OnInvalidCallback<"light" | "dark">>();
  });

  it("accepts a named policy in place of a callback", () => {
    const withPolicy = defineStorageSchema({
      theme: { schema: themeSchema, default: "light", onInvalid: "remove" },
    });

    expectTypeOf<GetResult<(typeof withPolicy)["definition"]["theme"]>>().toEqualTypeOf<
      "light" | "dark"
    >();
  });

  it("rejects a policy name that does not exist", () => {
    defineStorageSchema({
      // @ts-expect-error - "reset" is not one of the policies
      theme: { schema: themeSchema, onInvalid: "reset" },
    });
  });
});

describe("defineKey", () => {
  it("keeps the same inference when a key is declared on its own", () => {
    const theme = defineKey(themeSchema, { default: "light" });
    const composed = defineStorageSchema({ theme });

    expectTypeOf<GetResult<(typeof composed)["definition"]["theme"]>>().toEqualTypeOf<
      "light" | "dark"
    >();
  });

  it("declares a key with no options at all", () => {
    const composed = defineStorageSchema({ theme: defineKey(themeSchema) });

    expectTypeOf<GetResult<(typeof composed)["definition"]["theme"]>>().toEqualTypeOf<
      "light" | "dark" | undefined
    >();
  });

  it("rejects a default the schema would not accept", () => {
    // @ts-expect-error - "purple" is not one of the schema's values
    defineKey(themeSchema, { default: "purple" });
  });

  /*
    The reason this form exists. Taking the schema as its own argument means it is known before the options are read, so an inline callback gets a real expectation to meet and its literal return no longer widens.
  */
  it("checks an inline callback, in both the expression and the statement form", () => {
    defineKey(themeSchema, { onInvalid: () => "dark" });
    defineKey(themeSchema, {
      onInvalid: (context) => {
        expectTypeOf(context).toEqualTypeOf<InvalidContext>();
        return context.raw === "auto" ? "dark" : "light";
      },
    });
  });

  it("rejects a callback returning a value the schema would not accept", () => {
    // @ts-expect-error - "purple" is not one of the schema's values
    defineKey(themeSchema, { onInvalid: () => "purple" });
  });

  it("rejects a callback that returns nothing, which the fallback policy already expresses", () => {
    // @ts-expect-error - a callback supplies a value; use "fallback" to ask for the default instead
    defineKey(themeSchema, { onInvalid: () => undefined });
  });

  it("still accepts a named policy", () => {
    const composed = defineStorageSchema({
      theme: defineKey(themeSchema, { default: "light", onInvalid: "remove" }),
    });

    expectTypeOf<GetResult<(typeof composed)["definition"]["theme"]>>().toEqualTypeOf<
      "light" | "dark"
    >();
  });

  it("carries a physical key through", () => {
    const composed = defineStorageSchema({ user: defineKey(userSchema, { key: "app:user" }) });

    expectTypeOf<GetResult<(typeof composed)["definition"]["user"]>>().toEqualTypeOf<
      User | undefined
    >();
  });
});
