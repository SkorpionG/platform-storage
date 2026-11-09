import * as z from "zod";
import { describe, expect, it } from "vitest";

import { defineStorageSchema, defineVersions, StorageSchemaError } from "../../index";
import type { KeyDefinition, StorageSchemaDefinition } from "../../index";
import { themeSchema, userSchema } from "../../../tests/fixtures/schemas";

const userV1 = z.object({ id: z.string() });

/** Hand-written entries, as only JavaScript or a cast can produce them. */
function declaring(entry: unknown): () => void {
  return () => {
    defineStorageSchema({ user: entry as KeyDefinition } as StorageSchemaDefinition);
  };
}

const up = (previous: { id: string }): { id: string; name: string } => ({
  ...previous,
  name: "Unknown",
});

const unrepairable = (): undefined => undefined;

describe("defineVersions", () => {
  it("starts with one version, which is also the latest", () => {
    const chain = defineVersions(userV1);

    expect(chain.schema).toBe(userV1);
    expect(chain.versions).toEqual([{ schema: userV1 }]);
  });

  it("makes each added version the latest, keeping its step", () => {
    const chain = defineVersions(userV1).next(userSchema, up);

    expect(chain.schema).toBe(userSchema);
    expect(chain.versions).toEqual([{ schema: userV1 }, { schema: userSchema, up }]);
  });

  it("leaves the chain it was called on as it was, so one chain can be extended two ways", () => {
    const first = defineVersions(userV1);

    first.next(userSchema, up);

    expect(first.schema).toBe(userV1);
    expect(first.versions).toHaveLength(1);
  });

  it("freezes the versions, so a declared chain cannot be edited afterwards", () => {
    expect(Object.isFrozen(defineVersions(userV1).versions)).toBe(true);
    expect(Object.isFrozen(defineVersions(userV1).next(userSchema, up).versions)).toBe(true);
  });

  it("carries the options beside the chain", () => {
    const key = defineVersions(userV1)
      .next(userSchema, up)
      .options({ key: "app:user", readFrom: ["old"], onInvalid: "throw" });

    expect(key.schema).toBe(userSchema);
    expect(key.versions).toHaveLength(2);
    expect(key.key).toBe("app:user");
    expect(key.readFrom).toEqual(["old"]);
    expect(key.onInvalid).toBe("throw");
  });

  it("keeps the chain even when an options object carries one of its own", () => {
    const smuggled = { schema: themeSchema, versions: [] } as object;
    const key = defineVersions(userV1).options(smuggled);

    expect(key.schema).toBe(userV1);
    expect(key.versions).toHaveLength(1);
  });

  it("offers nothing further once the options are given", () => {
    expect(defineVersions(userV1).options({})).not.toHaveProperty("next");
  });

  it("goes straight into a schema with no options", () => {
    const schema = defineStorageSchema({ user: defineVersions(userV1).next(userSchema, up) });

    expect(schema.physicalKeys.user).toBe("user");
    expect(schema.definition.user.schema).toBe(userSchema);
  });

  it("uses the stored name the options declare", () => {
    const schema = defineStorageSchema({
      user: defineVersions(userV1).options({ key: "app:user" }),
    });

    expect(schema.physicalKeys.user).toBe("app:user");
  });
});

function refused(entry: unknown, message: RegExp): void {
  expect(declaring(entry)).toThrow(StorageSchemaError);
  expect(declaring(entry)).toThrow(message);
}

describe("what a schema refuses about a version chain", () => {
  it("refuses versions that are not a list", () => {
    refused({ schema: userV1, versions: "v1" }, /`versions` is not a list/);
  });

  it("refuses an empty list", () => {
    refused({ schema: userV1, versions: [] }, /`versions` is not a list/);
  });

  it("refuses a version with no validator, and says which", () => {
    refused(
      { schema: userSchema, versions: [{ schema: userV1 }, { schema: "nope", up }] },
      /Version 2 of "user" has no Standard Schema/,
    );
  });

  it("refuses a version that is not an object at all", () => {
    refused({ schema: userV1, versions: [null] }, /Version 1 of "user" has no Standard Schema/);
  });

  it("refuses a first version with a step, since nothing comes before it", () => {
    refused({ schema: userV1, versions: [{ schema: userV1, up }] }, /no earlier version/);
  });

  it("refuses a later version with no step, which is a gap in the chain", () => {
    refused(
      { schema: userSchema, versions: [{ schema: userV1 }, { schema: userSchema }] },
      /Version 2 of "user" has no migration from version 1/,
    );
  });

  it("refuses a step that is not a function", () => {
    refused(
      { schema: userSchema, versions: [{ schema: userV1 }, { schema: userSchema, up: "x" }] },
      /no migration from version 1/,
    );
  });

  it("refuses a chain whose last version is not the key's schema", () => {
    refused(
      { schema: userSchema, versions: [{ schema: userV1 }] },
      /last version of "user" is not its `schema`/,
    );
  });

  it("refuses a chain through defineVersions when a step goes missing", () => {
    const untyped = defineVersions(userV1) as unknown as {
      next(schema: unknown, step?: unknown): unknown;
    };

    refused(untyped.next(userSchema), /no migration from version 1/);
  });
});

describe("what a schema refuses about recover", () => {
  it("refuses a recover that is not a function", () => {
    expect(declaring({ schema: userV1, recover: "fix" })).toThrow(StorageSchemaError);
    expect(declaring({ schema: userV1, recover: "fix" })).toThrow(/`recover` is not a function/);
  });

  it("accepts a key with a recover and no versions", () => {
    const schema = defineStorageSchema({ user: { schema: userV1, recover: unrepairable } });

    expect(schema.definition.user.recover).toBe(unrepairable);
  });
});
