import * as z from "zod";

import type { StandardSchemaV1 } from "../../src/index";

/** A closed set of values, with no default of its own: a read can legitimately find nothing. */
export const themeSchema = z.enum(["light", "dark"]);

/** Supplies its own value when given `undefined`, so a read never produces one. */
export const countSchema = z.number().default(0);

/**
 * Absorbs an invalid value and answers with the fallback, so a read of bad data never reaches the invalid-data policy at all. Its input type is still the value type, so it says nothing about a missing key.
 */
export const themeCatchSchema = z.enum(["light", "dark"]).catch("light");

/** Optional in the schema itself: `undefined` is a value it accepts and returns. */
export const nicknameSchema = z.string().optional();

export const userSchema = z.object({ id: z.string(), name: z.string() });

export const tagsSchema = z.array(z.string());

/** Stores `null` as a real value, which is why absence is reported as `undefined` and never as `null`. */
export const nullableNameSchema = z.string().nullable();

/** Accepts anything, so a write can carry a value no serializer can represent. */
export const anythingSchema = z.unknown();

/**
 * A validator that resolves asynchronously.
 *
 * Standard Schema permits this, so the engine has to cope: fine on the asynchronous path, and a typed error on the synchronous one rather than a promise leaking out as a value.
 */
export const asyncStringSchema: StandardSchemaV1<string, string> = {
  "~standard": {
    version: 1,
    vendor: "platform-storage-tests",
    validate: (value) =>
      Promise.resolve(
        typeof value === "string" ? { value } : { issues: [{ message: "expected a string" }] },
      ),
  },
};
