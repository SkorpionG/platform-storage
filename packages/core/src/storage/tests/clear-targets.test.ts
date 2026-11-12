import { describe, expect, it } from "vitest";

import { CLEAR_TARGET, defineStorageSchema, StorageSchemaError } from "../../index";
import { themeSchema, userSchema } from "../../../tests/fixtures/schemas";
import { resolveStoredNames } from "../../schema/stored-names";
import type { StorageSchema, StorageSchemaDefinition } from "../../schema/storage-schema";
import { needsListing, planClear, readClearTargets } from "../clear-targets";
import type { ClearTarget } from "../clear-targets";

const schema = defineStorageSchema({
  theme: { schema: themeSchema, readFrom: ["colorMode"] },
  user: { schema: userSchema },
});

/* What the backend holds in every case below: this storage's names, the names from before its prefix, a key since deleted, and two owners besides this storage. */
const LISTED = [
  "app:theme",
  "app:user",
  "app:colorMode",
  "theme",
  "colorMode",
  "user",
  "app:draft",
  "other:token",
  "analytics:session",
];

interface Setup {
  readonly prefix?: string;
  readonly readUnprefixed?: boolean;
  readonly listed?: ReadonlyArray<string>;
}

function plan<Definition extends StorageSchemaDefinition>(
  over: StorageSchema<Definition>,
  targets: ReadonlyArray<ClearTarget>,
  { prefix, readUnprefixed = false, listed = LISTED }: Setup = {},
): ReturnType<typeof planClear> {
  return planClear({
    targets: new Set(targets),
    storedNames: resolveStoredNames(over, prefix, readUnprefixed),
    prefix,
    listed,
  });
}

describe("CLEAR_TARGET", () => {
  it("names exactly the targets clear accepts", () => {
    expect(CLEAR_TARGET).toEqual({
      Declared: "declared",
      ReadFrom: "readFrom",
      Unprefixed: "unprefixed",
      Undeclared: "undeclared",
      Everything: "everything",
    });
  });
});

describe("readClearTargets", () => {
  it("asks for the declared names when given nothing", () => {
    expect(readClearTargets(undefined)).toEqual(new Set(["declared"]));
  });

  it("takes one target on its own, everything included", () => {
    expect(readClearTargets("undeclared")).toEqual(new Set(["undeclared"]));
    expect(readClearTargets("everything")).toEqual(new Set(["everything"]));
  });

  it("takes a list, each target once", () => {
    expect(readClearTargets(["readFrom", "unprefixed", "readFrom"])).toEqual(
      new Set(["readFrom", "unprefixed"]),
    );
  });

  it("takes an empty list as nothing to remove", () => {
    expect(readClearTargets([])).toEqual(new Set());
  });

  it("refuses everything inside a list, even alone", () => {
    expect(() => readClearTargets(["everything"])).toThrow(StorageSchemaError);
    expect(() => readClearTargets(["declared", "everything"])).toThrow(
      /has to be asked for on its own/,
    );
  });

  it("refuses something that is not a target, naming what it was given", () => {
    expect(() => readClearTargets("all")).toThrow(/"all" is not something `clear` can remove/);
    expect(() => readClearTargets(3)).toThrow(/3 is not something `clear` can remove/);
    expect(() => readClearTargets(["declared", "nope"])).toThrow(
      /"nope" is not something `clear` can remove. A list can hold "declared", "readFrom", "unprefixed", "undeclared"\./,
    );
  });
});

describe("needsListing", () => {
  it("is true only for the targets that reach past the schema", () => {
    expect(needsListing(new Set<ClearTarget>(["declared", "readFrom", "unprefixed"]))).toBe(false);
    expect(needsListing(new Set<ClearTarget>(["undeclared"]))).toBe(true);
    expect(needsListing(new Set<ClearTarget>(["everything"]))).toBe(true);
  });
});

describe("planClear", () => {
  describe("declared", () => {
    it("removes current and readFrom names, old ones first", () => {
      expect(plan(schema, ["declared"], { prefix: "app:" })).toEqual({
        names: ["app:colorMode", "app:theme", "app:user"],
        keys: ["theme", "user"],
      });
    });

    it("adds the names from before the prefix only while they are read", () => {
      expect(plan(schema, ["declared"], { prefix: "app:", readUnprefixed: true }).names).toEqual([
        "app:colorMode",
        "theme",
        "colorMode",
        "user",
        "app:theme",
        "app:user",
      ]);
    });

    it("works without a prefix", () => {
      expect(plan(schema, ["declared"]).names).toEqual(["colorMode", "theme", "user"]);
    });
  });

  describe("readFrom", () => {
    it("removes only the readFrom names, under the prefix", () => {
      expect(plan(schema, ["readFrom"], { prefix: "app:" })).toEqual({
        names: ["app:colorMode"],
        keys: ["theme"],
      });
    });

    it("leaves the bare form of a readFrom name, even while it is read", () => {
      expect(plan(schema, ["readFrom"], { prefix: "app:", readUnprefixed: true }).names).toEqual([
        "app:colorMode",
      ]);
    });

    it("removes nothing where no key declares readFrom", () => {
      const plain = defineStorageSchema({ user: { schema: userSchema } });

      expect(plan(plain, ["readFrom"], { prefix: "app:" })).toEqual({ names: [], keys: [] });
    });
  });

  describe("unprefixed", () => {
    it("removes the names from before the prefix, changing no key that does not read them", () => {
      expect(plan(schema, ["unprefixed"], { prefix: "app:" })).toEqual({
        names: ["theme", "colorMode", "user"],
        keys: [],
      });
    });

    it("counts every key reading them as one it can change", () => {
      expect(plan(schema, ["unprefixed"], { prefix: "app:", readUnprefixed: true }).keys).toEqual([
        "theme",
        "user",
      ]);
    });

    it("removes nothing without a prefix, where the bare names are the current ones", () => {
      expect(plan(schema, ["unprefixed"])).toEqual({ names: [], keys: [] });
    });

    it("leaves a key that opts out of the prefix alone", () => {
      const optedOut = defineStorageSchema({
        vendor: { schema: userSchema, key: "vendor-token", prefixed: false },
      });

      expect(plan(optedOut, ["unprefixed"], { prefix: "app:" }).names).toEqual([]);
    });

    /* A prefix without a separator can make a bare name land on another key's stored name: `app:x` under `app:` is bare `app:x`, which is where `x` stores. */
    it("never takes a name another key stores under", () => {
      const overlapping = defineStorageSchema({
        x: { schema: userSchema },
        nested: { schema: userSchema, key: "app:x" },
      });

      expect(plan(overlapping, ["unprefixed"], { prefix: "app:" }).names).toEqual(["x"]);
    });

    it("never takes another key's name, whichever is declared first", () => {
      const overlapping = defineStorageSchema({
        nested: { schema: userSchema, key: "app:x" },
        x: { schema: userSchema },
      });

      expect(plan(overlapping, ["unprefixed"], { prefix: "app:" }).names).toEqual(["x"]);
    });

    it("never takes a key's own current name, which its own readFrom can land on", () => {
      const own = defineStorageSchema({ u: { schema: userSchema, readFrom: ["app:u"] } });

      expect(plan(own, ["unprefixed"], { prefix: "app:" }).names).toEqual(["u"]);
    });

    it("never takes a name another key reads from", () => {
      const overlapping = defineStorageSchema({
        x: { schema: userSchema, readFrom: ["y"] },
        nested: { schema: userSchema, key: "app:y" },
      });

      expect(plan(overlapping, ["unprefixed"], { prefix: "app:" }).names).toEqual(["x", "y"]);
    });
  });

  describe("undeclared", () => {
    it("removes only names under the prefix that the schema does not list", () => {
      expect(plan(schema, ["undeclared"], { prefix: "app:" })).toEqual({
        names: ["app:draft"],
        keys: [],
      });
    });

    it("counts the names from before the prefix as the schema's, even while they are not read", () => {
      const nested = defineStorageSchema({
        nested: { schema: userSchema, key: "app:z" },
      });

      expect(
        plan(nested, ["undeclared"], { prefix: "app:", listed: ["app:z", "app:app:z", "app:w"] })
          .names,
      ).toEqual(["app:w"]);
    });

    it("reaches every unlisted name on the backend without a prefix", () => {
      expect(plan(schema, ["undeclared"]).names).toEqual([
        "app:theme",
        "app:user",
        "app:colorMode",
        "app:draft",
        "other:token",
        "analytics:session",
      ]);
    });

    /* Matched by the prefix as written, so a longer prefix beginning with this one is inside it. The documentation says so. */
    it("takes a longer prefix's names as its own", () => {
      expect(
        plan(schema, ["undeclared"], { prefix: "app:", listed: ["app:v2:theme", "app:theme"] })
          .names,
      ).toEqual(["app:v2:theme"]);
    });

    it("removes nothing when the backend holds nothing", () => {
      expect(plan(schema, ["undeclared"], { prefix: "app:", listed: [] }).names).toEqual([]);
    });
  });

  describe("everything", () => {
    it("removes every listed name and every declared one, current names last", () => {
      expect(plan(schema, ["everything"], { prefix: "app:" })).toEqual({
        names: [
          "app:colorMode",
          "theme",
          "colorMode",
          "user",
          "app:draft",
          "other:token",
          "analytics:session",
          "app:theme",
          "app:user",
        ],
        keys: ["theme", "user"],
      });
    });

    it("still removes the declared names when the listing missed them", () => {
      expect(plan(schema, ["everything"], { prefix: "app:", listed: [] }).names).toEqual([
        "app:colorMode",
        "app:theme",
        "app:user",
      ]);
    });
  });

  describe("several targets", () => {
    it("adds their names together, each once", () => {
      expect(plan(schema, ["readFrom", "unprefixed"], { prefix: "app:" })).toEqual({
        names: ["app:colorMode", "theme", "colorMode", "user"],
        keys: ["theme"],
      });
      expect(plan(schema, ["declared", "readFrom"], { prefix: "app:" }).names).toEqual([
        "app:colorMode",
        "app:theme",
        "app:user",
      ]);
    });

    it("comes out the same whichever order they were listed in", () => {
      expect(plan(schema, ["unprefixed", "undeclared", "readFrom"], { prefix: "app:" })).toEqual(
        plan(schema, ["readFrom", "unprefixed", "undeclared"], { prefix: "app:" }),
      );
    });

    it("removes nothing for an empty list", () => {
      expect(plan(schema, [], { prefix: "app:" })).toEqual({ names: [], keys: [] });
    });
  });
});
