import * as z from "zod";
import { describe, expectTypeOf, it } from "vitest";

import { defineKey, defineStorageSchema, defineVersions } from "../../index";
import type { GetResult, KeyDefinition, SetValue } from "../../index";

const v1 = z.object({ id: z.string() });
const v2 = z.object({ id: z.string(), email: z.string() });
const v3 = z.object({ id: z.string(), email: z.string(), name: z.string() });

interface Latest {
  id: string;
  email: string;
  name: string;
}

const latest: Latest = { id: "1", email: "e", name: "n" };

const chain = defineVersions(v1)
  .next(v2, (previous) => ({ ...previous, email: "e" }))
  .next(v3, (previous) => ({ ...previous, name: "n" }));

describe("a step in the chain", () => {
  it("is handed exactly what the version before it produced", () => {
    defineVersions(v1)
      .next(v2, (previous) => {
        expectTypeOf(previous).toEqualTypeOf<{ id: string }>();

        return { ...previous, email: "e" };
      })
      .next(v3, (previous) => {
        expectTypeOf(previous).toEqualTypeOf<{ id: string; email: string }>();

        return { ...previous, name: "n" };
      });
  });

  it("keeps a literal it returns, inside an object as well as at the top", () => {
    const flags = z.object({ compact: z.boolean() });
    const density = z.object({ density: z.enum(["compact", "comfortable"]) });

    defineVersions(flags).next(density, (previous) => ({
      density: previous.compact ? "compact" : "comfortable",
    }));
    defineVersions(z.string()).next(z.enum(["a", "b"]), () => "a");
    defineVersions(z.string()).next(z.array(z.enum(["a"])), () => ["a"]);
  });

  it("refuses a literal the next version does not allow", () => {
    const density = z.object({ density: z.enum(["compact", "comfortable"]) });

    // @ts-expect-error "tight" is not one of the densities this version allows.
    defineVersions(v1).next(density, () => ({ density: "tight" }));
  });

  it("keeps a tuple's members in order", () => {
    const pair = z.tuple([z.string(), z.number()]);

    defineVersions(z.string()).next(pair, () => ["a", 1]);

    // @ts-expect-error The members are the wrong way round.
    defineVersions(z.string()).next(pair, () => [1, "a"]);
  });

  it("cannot read a field the previous version did not have yet", () => {
    defineVersions(v1).next(v2, (previous) => ({
      ...previous,
      // @ts-expect-error `email` arrives with this version, so the one before it has none.
      email: previous.email,
    }));
  });

  it("has to produce the shape of the version it reaches", () => {
    // @ts-expect-error `email` is required by the version this step reaches.
    defineVersions(v1).next(v2, (previous) => ({ id: previous.id }));
  });

  it("cannot be asynchronous, because a synchronous read has to run it", () => {
    // @ts-expect-error A promise is not the next version's shape.
    defineVersions(v1).next(v2, async (previous) => ({ ...previous, email: "e" }));
  });

  it("cannot be left out", () => {
    // @ts-expect-error Without a step a value at the previous version could not be brought forward.
    defineVersions(v1).next(v2);
  });
});

describe("the options of a versioned key", () => {
  it("accepts a default, a callback and a recover in the latest shape", () => {
    chain.options({
      default: latest,
      onInvalid: (context) => ({ ...latest, id: context.key }),
      recover: (raw) => (raw === null ? undefined : latest),
    });
  });

  it("refuses a default in an older shape", () => {
    // @ts-expect-error The default has to match the latest version.
    chain.options({ default: { id: "1" } });
  });

  it("refuses an onInvalid callback answering in an older shape", () => {
    // @ts-expect-error The replacement has to match the latest version.
    chain.options({ onInvalid: () => ({ id: "1" }) });
  });

  it("refuses a recover answering in an older shape", () => {
    // @ts-expect-error The repair has to match the latest version.
    chain.options({ recover: () => ({ id: "1" }) });
  });

  it("types the stored value a recover receives as unknown", () => {
    chain.options({
      recover: (raw) => {
        expectTypeOf(raw).toBeUnknown();

        return undefined;
      },
    });
  });

  it("has no next, so a version cannot follow options checked against the one before it", () => {
    expectTypeOf(chain.options({})).not.toHaveProperty("next");
  });

  it("is not reachable through a method named after the stored name", () => {
    expectTypeOf(chain).not.toHaveProperty("key");
  });
});

describe("what a versioned key reads and writes as", () => {
  const schema = defineStorageSchema({
    bare: chain,
    withDefault: chain.options({ default: latest }),
  });

  type Definition = typeof schema.definition;

  it("reads as the latest version, and may be missing with no default", () => {
    expectTypeOf<GetResult<Definition["bare"]>>().toEqualTypeOf<Latest | undefined>();
  });

  it("drops undefined when the options declare a default", () => {
    expectTypeOf<GetResult<Definition["withDefault"]>>().toEqualTypeOf<Latest>();
  });

  it("writes only the latest version", () => {
    expectTypeOf<SetValue<Definition["bare"]>>().toEqualTypeOf<Latest>();
  });

  it("is a key definition", () => {
    expectTypeOf(chain).toExtend<KeyDefinition>();
  });
});

describe("recover written inline in a schema", () => {
  it("has its return trusted, as an inline onInvalid does", () => {
    defineStorageSchema({ user: { schema: v1, recover: () => "anything" } });
  });

  it("still has to be a function", () => {
    // @ts-expect-error A recover is a function.
    defineStorageSchema({ user: { schema: v1, recover: "fix" } });
  });
});

describe("recover on an ordinary key", () => {
  it("is checked against the schema through defineKey", () => {
    defineKey(v1, { recover: () => ({ id: "1" }) });

    // @ts-expect-error The repair has to match the schema.
    defineKey(v1, { recover: () => ({ nope: true }) });
  });

  it("may answer undefined, meaning it could not repair the value", () => {
    defineKey(v1, { recover: () => undefined });
  });
});

describe("opting a key out of a prefix", () => {
  it("is accepted as a boolean wherever a key takes options", () => {
    chain.options({ prefixed: false });
    defineKey(v1, { prefixed: false });
    defineStorageSchema({ user: { schema: v1, prefixed: false } });
  });

  it("refuses anything but a boolean", () => {
    // @ts-expect-error `prefixed` is a boolean.
    chain.options({ prefixed: "no" });
    // @ts-expect-error `prefixed` is a boolean.
    defineKey(v1, { prefixed: 0 });
  });
});
