import { INVALID_POLICY } from "@platform-storage/core";
import type { InvalidPolicy, KeyDefinition } from "@platform-storage/core";

import { appSchema } from "./schema";
import type { AppKey } from "./schema";

export { appSchema } from "./schema";
export type { AppDefinition, AppKey } from "./schema";

export interface KeyNote {
  /** What to call the key on screen. */
  readonly label: string;
  /** The type a read of this key returns, written out so the UI can show it beside the value. */
  readonly readType: string;
  /** The one thing this key is here to demonstrate. */
  readonly note: string;
}

/** Why each key is in the schema. Keyed by every declared key, so adding one to the schema without explaining it fails to compile. */
export const KEY_NOTES: { readonly [Key in AppKey]: KeyNote } = {
  theme: {
    label: "Theme",
    readType: '"light" | "dark" | "system"',
    note: "A closed set of strings with a declared default, so a read can never come back empty and `undefined` is absent from the type.",
  },
  displayName: {
    label: "Display name",
    readType: "string | undefined",
    note: "A plain string with no default. Nothing answers for it when the backend holds nothing, so `undefined` stays in the type.",
  },
  reducedMotion: {
    label: "Reduced motion",
    readType: "boolean",
    note: "A boolean stored as a boolean. `false` is a real value here, distinct from the key holding nothing at all.",
  },
  fontScale: {
    label: "Font scale",
    readType: "number",
    note: "A number with a range. A value outside 0.75 to 2 fails validation on the way in and on the way out.",
  },
  visitCount: {
    label: "Visit count",
    readType: "number",
    note: 'Coerced, so a hand-edited `"42"` in devtools still reads back as the number 42. Coercion accepts its own output, which is what lets it round-trip.',
  },
  recentSearches: {
    label: "Recent searches",
    readType: "Array<string>",
    note: "An array defaulted from the schema with a factory. A declared `default: []` would hand every read the same array to share.",
  },
  user: {
    label: "User",
    readType: "{ id: string; name: string } | undefined",
    note: "An object stored under the physical key `app:user`, so the name the code uses and the name the backend holds can differ.",
  },
  lastDismissed: {
    label: "Last dismissed",
    readType: "string | null",
    note: "Nullable, and defaulted to `null`. A stored `null` reads back as `null`; only an absent key reads as `undefined`.",
  },
  nickname: {
    label: "Nickname",
    readType: "string | undefined",
    note: "Optional in the schema rather than through a default. Unlike display name, a write of `undefined` is accepted and removes the entry.",
  },
};

interface CorruptionBase {
  readonly key: AppKey;
  readonly label: string;
  /** Why this particular value fails, in one sentence. */
  readonly explains: string;
}

/** A well-formed value the backend can hold that the schema nonetheless rejects. Every backend can store one. */
export interface ValueCorruption extends CorruptionBase {
  readonly kind: "value";
  readonly value: unknown;
}

/** Text that is not JSON at all. Only a backend transporting strings can hold this, so a JSON-value backend has no equivalent. */
export interface TextCorruption extends CorruptionBase {
  readonly kind: "text";
  readonly text: string;
}

export type Corruption = ValueCorruption | TextCorruption;

/**
 * Bad data to plant behind the library's back, so a read has to cope with it.
 *
 * Writing these through `storage.set` would be refused, which is the point: this is what a previous version of an app, a hand edit, or another script on the same origin leaves behind.
 */
export const CORRUPTIONS: ReadonlyArray<Corruption> = [
  {
    kind: "value",
    key: "theme",
    label: "Theme outside the union",
    value: "solarized",
    explains: "A string, but not one of the three the enum allows.",
  },
  {
    kind: "value",
    key: "fontScale",
    label: "Font scale out of range",
    value: 12,
    explains: "The right type, refused by the range the schema declares.",
  },
  {
    kind: "value",
    key: "reducedMotion",
    label: "Boolean stored as a string",
    value: "yes",
    explains: 'The shape a hand edit produces: `"yes"` where a boolean belongs.',
  },
  {
    kind: "value",
    key: "user",
    label: "Object missing a field",
    value: { id: "u_42" },
    explains: "An object of the right kind with `name` missing.",
  },
  {
    kind: "value",
    key: "recentSearches",
    label: "String where an array belongs",
    value: "coffee",
    explains: "A single value where the schema expects a list of them.",
  },
  {
    kind: "text",
    key: "displayName",
    label: "Not JSON at all",
    text: "{not json",
    explains: "Deserialization fails before validation is even reached.",
  },
];

/** The policies the library names, plus the callback it also accepts. Declared here rather than per app, because nothing about the list depends on where the values are stored. */
export type PolicyName = InvalidPolicy | "callback";

/** Keyed by every policy, so one added to the library fails to compile until it is described here. */
export const POLICY_LABELS: { readonly [Name in PolicyName]: string } = {
  fallback: "fallback — the built-in default",
  throw: "throw — reject the read",
  remove: "remove — delete, then fall back",
  callback: "callback — decide per read",
};

/** The same list, in the shape a select takes. */
export const POLICIES: ReadonlyArray<{ readonly value: PolicyName; readonly label: string }> = [
  ...Object.values(INVALID_POLICY),
  "callback" as const,
].map((value) => ({ value, label: POLICY_LABELS[value] }));

/**
 * Every key's declared default, keyed by the logical key.
 *
 * An invalid-data callback is handed the key as a plain string, so recovering that key's own default means a lookup built once rather than an index into the definition.
 */
export const DECLARED_DEFAULTS: Readonly<Record<string, unknown>> = Object.fromEntries(
  appSchema.keys.map((key) => {
    const definition: KeyDefinition = appSchema.definition[key];
    return [key, definition.default];
  }),
);

/** Every physical key the schema declares, for telling ours apart from whatever else shares the backend. Built once rather than per read. */
export const DECLARED_PHYSICAL_KEYS: ReadonlySet<string> = new Set<string>(
  Object.values(appSchema.physicalKeys),
);
