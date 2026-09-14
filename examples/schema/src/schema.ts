import { defineStorageSchema } from "@platform-storage/core";
import type { KeyOf } from "@platform-storage/core";
import * as z from "zod";

/**
 * One schema, shared by every example on every platform.
 *
 * Nothing here knows where the values are stored. The web example puts them in `localStorage`, and an extension or React Native example would hand the identical definition to its own storage. That is the claim this package exists to make good on, and its tsconfig has no `DOM` library so the compiler keeps it honest.
 *
 * Each key is chosen to make one behavior visible; `KEY_NOTES` in the entry point says which.
 *
 * It sits in its own module so the playground can display this file verbatim rather than keeping a copy of it that drifts.
 */
export const appSchema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark", "system"]), default: "system" },
  displayName: { schema: z.string().min(1).max(32) },
  reducedMotion: { schema: z.boolean(), default: false },
  fontScale: { schema: z.number().min(0.75).max(2), default: 1 },
  visitCount: { schema: z.coerce.number().int().min(0), default: 0 },
  recentSearches: { schema: z.array(z.string()).default(() => []) },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  lastDismissed: { schema: z.string().nullable(), default: null },
  nickname: { schema: z.string().optional() },
});

export type AppDefinition = typeof appSchema.definition;
export type AppKey = KeyOf<AppDefinition>;
