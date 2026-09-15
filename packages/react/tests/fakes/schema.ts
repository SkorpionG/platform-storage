import { defineStorageSchema } from "@platform-storage/core";
import type { KeyOf } from "@platform-storage/core";
import * as z from "zod";

/**
 * A schema chosen to break a careless cache.
 *
 * `recentSearches` takes its default from a factory, so a read answers with a new array even for a key holding nothing; `user` is parsed out of text, so a read answers with a new object. Either one makes a snapshot that is not cached fail to settle. `nickname` and `displayName` keep `undefined` in their type, and `lastDismissed` proves a stored `null` is not the same as an absent key.
 */
export const testSchema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark", "system"]), default: "system" },
  displayName: { schema: z.string().min(1) },
  visitCount: { schema: z.number().int().min(0), default: 0 },
  recentSearches: { schema: z.array(z.string()).default(() => []) },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  lastDismissed: { schema: z.string().nullable(), default: null },
  nickname: { schema: z.string().optional() },
});

export type TestDefinition = typeof testSchema.definition;
export type TestKey = KeyOf<TestDefinition>;
