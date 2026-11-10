# @platform-storage/core

[![npm version](https://img.shields.io/npm/v/@platform-storage%2Fcore.svg)](https://www.npmjs.com/package/@platform-storage/core) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The engine behind [platform-storage](https://github.com/SkorpionG/platform-storage): schema definition, type inference, runtime validation, serialization, the storage engine, the adapter contract, and the error hierarchy.

## Installation

Install the package for your platform instead where one exists, since each re-exports everything here. Install core directly when you are writing your own adapter.

```sh
# Install with npm
npm install @platform-storage/core zod

# Install with pnpm
pnpm add @platform-storage/core zod

# Install with Yarn
yarn add @platform-storage/core zod

# Install with Bun
bun add @platform-storage/core zod
```

Zod, Valibot and ArkType all work; none is a dependency, and nothing here imports a validation library at runtime.

## Quick Start

```ts
import * as z from "zod";
import { createStorage, defineStorageSchema, memoryAdapter } from "@platform-storage/core";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createStorage({ schema, adapter: memoryAdapter() });

await storage.set("theme", "dark");
await storage.get("theme"); // "light" | "dark"
```

## API Usage

### `defineStorageSchema(definition)`

Declares what a storage holds, and returns a checked, frozen schema object. Both the key union and the value types are inferred from the object you pass.

**Parameters:**

- `definition`: an object mapping each logical key to its definition:
  - `schema: StandardSchemaV1` — the validator. Required.
  - `key?: string` — the name the backend stores under. Defaults to the logical key.
  - `prefixed?: boolean` — `false` keeps this key and its `readFrom` names out of a storage's `prefix`, for a name something else owns.
  - `readFrom?: ReadonlyArray<string>` — names this key used to be stored under. See [Renaming a stored key](#renaming-a-stored-key).
  - `default?: Output` — what a read returns when nothing is stored. Declaring one removes `undefined` from the result type.
  - `onInvalid?: "throw" | "fallback" | "remove" | ((context) => Output)` — overrides the storage's policy for this key.
  - `recover?: (raw: unknown) => Output | undefined` — repairs a stored value the schema rejects, and has the repair written back. Answer `undefined` when it cannot be repaired.

**Returns:** `StorageSchema<Definition>`

**Throws:** `StorageSchemaError` if an entry has no Standard Schema validator, if its `recover` is not a function, if its `prefixed` is not a boolean, if its version chain is malformed, if `readFrom` is not an array or names a current stored name, or if two keys resolve to the same stored key or claim the same old one.

```ts
const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: userSchema, key: "app:user" },
});
```

### `defineKey(schema, options?)`

Declares one key with everything about it checked against its schema. Reach for this when a key has an `onInvalid` or `recover` callback, or when it is worth naming and sharing on its own.

**Parameters:**

- `schema`: the Standard Schema validator.
- `options?`: `key`, `prefixed`, `readFrom`, `default`, `onInvalid` and `recover`, as above.

**Returns:** a key definition, to be placed in a `defineStorageSchema` object.

The schema comes first for a reason: TypeScript reads arguments left to right, so by the time it checks the options it knows the schema and can hold an `onInvalid` callback to the values that schema produces. The same callback written inline inside `defineStorageSchema` is trusted rather than checked.

```ts
const theme = defineKey(z.enum(["light", "dark"]), {
  default: "light",
  onInvalid: (context) => (context.raw === "auto" ? "dark" : "light"),
});

const schema = defineStorageSchema({ theme });
```

### `defineVersions(schema)`

Declares a key by the shapes it has had, so a value written by an older release is brought forward when it is read. A chain rather than a numbered list, so a missing step cannot be written down and each step is typed against the version before it.

**Parameters:**

- `schema`: the first version. For an existing key, the schema it has today.

**Returns:** a chain, which is a key definition as it stands:

- `.next(schema, up)` adds a version. `up` receives the previous version's output and returns this version's. It is synchronous, because a synchronous read has to be able to run it.
- `.options(options)` finishes the key with `key`, `prefixed`, `readFrom`, `default`, `onInvalid` and `recover`, all checked against the latest version. There is no `.next` after it.

A value stored before the key had versions reads as version 1, so the schema a key already has becomes the first version and no separate migration is needed.

```ts
const user = defineVersions(z.object({ id: z.string() }))
  .next(userSchema, (previous) => ({ ...previous, name: "Unknown" }))
  .options({ key: "app:user" });

const schema = defineStorageSchema({ user });
```

### `createStorage(options)`

Builds a storage over a schema and a backend.

**Parameters:**

- `options`:
  - `schema: StorageSchema` — from `defineStorageSchema`. Required.
  - `adapter: StorageAdapter<Wire>` — the backend. Required.
  - `serializer?: Serializer<Wire>` — replaces the adapter's own, typed against what that adapter transports.
  - `prefix?: string` — put before every stored name, so the storage can share a backend. See [Prefixing stored names](#prefixing-stored-names).
  - `readUnprefixed?: boolean` — also read each key's names without the prefix, to move existing values in. Only with a `prefix`.
  - `onInvalid?: OnInvalid` — the policy for every key that does not declare its own. Defaults to `"fallback"`.
  - `onError?: (error: PlatformStorageError) => void` — called for every failure, whether thrown or handled.

**Returns:** `PlatformStorage<Definition>`, plus the synchronous methods when the adapter can answer immediately.

**Throws:** `StorageSchemaError` if `prefix` is empty or not a string, if `readUnprefixed` is not a boolean or is asked for without a `prefix`, or if the names a prefix gives clash.

```ts
const storage = createStorage({
  schema,
  adapter: memoryAdapter(),
  onInvalid: "throw",
  onError: (error) => console.warn(error.code, error.message),
});
```

### Storage Methods

#### `get(key, options?): Promise<Value>`

Reads, deserializes and validates. Returns the key's default when nothing is stored, and applies the invalid-data policy when what is stored no longer matches. `options.onInvalid` overrides the policy for this read alone, and is checked against what the key can hold.

#### `set(key, value): Promise<void>`

Validates and writes. Stores what the schema produced, so a coercion is persisted in its normalized form. Throws `StorageValidationError` and writes nothing if the schema refuses the value.

#### `update(key, updater): Promise<void>`

Works out the next value from the current one and stores it, as one step. `updater` is synchronous and receives what `get` would answer with, so the key's default where nothing is stored. Throwing from it rejects and writes nothing, and a result that validation or serialization refuses leaves the stored value as it was. It rejects without calling `updater` where a versioned key holds data from a newer version or a migration step failed, because the result would replace data this code cannot read.

`updater` receives its own copy, so it may change plain objects, arrays, dates, maps and sets in place. Anything else, such as a class instance, is handed over as it is.

Writes to a key made through this storage run one at a time, so two updates started together cannot lose one another. That guarantee ends at this storage: no backend offers an atomic update across tabs or extension contexts.

```ts
await storage.update("recent", (current) => [...current, "new item"]);
```

#### `remove(key): Promise<void>`

Deletes the stored value, so the key reads as its default again.

#### `has(key): Promise<boolean>`

Whether anything is stored, without validating or deserializing it.

#### `clear(): Promise<void>`

Removes only the keys this schema declares, and the old names they declare in `readFrom`, never anything else sharing the backend.

#### `physicalKey(key): string`

The name the backend stores this key under, the storage's `prefix` included, for tooling that has to address it directly. The schema's own `physicalKeys` are the names before any prefix.

#### `watch(key, listener): () => void`

Follows one key. `listener` receives `{ key, oldValue, newValue, oldValueKnown }`, with both values read as `get` would read them. Returns a function that stops listening. See [Following changes](#following-changes).

#### `onChange(listener): () => void`

Says which key changed, without reading anything, and `undefined` where anything may have. Returns a function that stops listening.

#### `getSync` / `setSync` / `updateSync` / `removeSync` / `hasSync` / `clearSync`

The same six operations without a promise, present only when the adapter can answer immediately. Absent from the type otherwise, so a call to one is a compile error rather than a runtime surprise.

### `memoryAdapter(options?)`

A backend that keeps everything in a `Map`. Useful in tests, as the second half of `withFallback`, and anywhere a real backend may be missing.

**Parameters:**

- `options?`:
  - `name?: string` — what errors report. Defaults to `"memory"`.
  - `initial?: Record<string, Wire>` — values to start from, already serialized, as though a previous run had written them.
  - `serializer?: Serializer<Wire>` — what to hold values in. Defaults to JSON text, and is required for anything else, such as pairing with an extension area through `withFallback`.

**Returns:** `MemoryStorageAdapter`, which also exposes `entries` so a test can assert against it without going back through a storage. Values are copied on the way in and out, as a real backend would, so changing one you read does not change what is stored.

### `withFallback(primary, fallback)`

Builds one adapter that uses the first backend where it exists and the second where it does not. The choice is made on first use, which following its changes counts as, and then kept, so a value cannot be written to one and read from the other. The result is synchronous only when both halves are, and can list keys only when both halves can.

The result also has `chosen()`, answering `"primary"` or `"fallback"`, or `undefined` until first use has decided. Asking never forces the decision.

### `defineSyncAdapter(definition)`

Builds a full adapter from its synchronous half, so each operation is written once and the asynchronous methods are derived.

### Listing what a backend holds

An adapter may offer `keys()`, and a synchronous one `keysSync()`, answering with every name the backend holds, including those no schema declares. It is optional because not every backend can answer, so reach for it through the adapter:

```ts
const names = await storage.adapter.keys?.();
```

This calls the adapter rather than a storage, so a failure arrives as the backend reported it and `onError` does not hear about it.

### Following what a backend reports

An adapter may offer `subscribe(listener)`, which reports changes the backend can see, including those to names no schema declares. It connects synchronously and answers with `{ stop, reportsOwnWrites }`. Most code wants `watch` or `onChange` instead; this is for tooling that has to see everything.

### `requireBackend(source, context)`

Resolves a backend that may not be there, reporting `StorageUnavailableError` when the source throws or answers with `null` or `undefined`. Call it on every operation rather than once at construction.

### Errors and guards

`PlatformStorageError` is the base; every error carries a stable `code` from `STORAGE_ERROR_CODE`. `isPlatformStorageError`, `isStorageValidationError` and `isStorageQuotaError` are the guards. See [Errors](#errors) below.

### Serializers

`jsonSerializer` for a backend that stores strings, `passthroughSerializer` for one that stores JSON values natively.

## Examples

### A schema shared across platforms

Keep the schema in a module of its own with no DOM types, and every platform imports it unchanged.

```ts
// schema.ts
import * as z from "zod";
import { defineStorageSchema } from "@platform-storage/core";

export const appSchema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark", "system"]), default: "system" },
  recentSearches: { schema: z.array(z.string()).default(() => []) },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  lastDismissed: { schema: z.string().nullable(), default: null },
});
```

`recentSearches` takes its default from a factory, so each read gets a fresh array rather than one shared object. `lastDismissed` shows that a stored `null` is a value: only an absent key reads as `undefined`.

### Deciding what a bad value means, per key

```ts
import { defineKey, defineStorageSchema } from "@platform-storage/core";

const schema = defineStorageSchema({
  // Anything unrecognized becomes the default, and the read succeeds.
  theme: defineKey(z.enum(["light", "dark"]), { default: "light", onInvalid: "fallback" }),

  // A corrupt cache is worth deleting rather than keeping.
  cache: defineKey(cacheSchema, { onInvalid: "remove" }),

  // Decide per read, with the raw value in hand.
  legacy: defineKey(prefsSchema, {
    onInvalid: (context) => (typeof context.raw === "string" ? { name: context.raw } : undefined),
  }),
});
```

### Writing an adapter

Implement `StorageAdapter<Wire>`, or hand `defineSyncAdapter` the synchronous half and let it derive the rest.

```ts
import {
  defineSyncAdapter,
  jsonSerializer,
  requireBackend,
  STORAGE_OPERATION,
} from "@platform-storage/core";
import type { StorageOperation, SyncStorageAdapter } from "@platform-storage/core";

export function cookieAdapter(): SyncStorageAdapter<string> {
  const reach = (operation: StorageOperation, physicalKey: string): Document =>
    requireBackend(() => globalThis.document, { adapter: "cookie", operation, physicalKey });

  return defineSyncAdapter({
    name: "cookie",
    serializer: jsonSerializer,
    getSync: (key) => readCookie(reach(STORAGE_OPERATION.Get, key), key),
    setSync: (key, value) => {
      writeCookie(reach(STORAGE_OPERATION.Set, key), key, value);
    },
    removeSync: (key) => {
      deleteCookie(reach(STORAGE_OPERATION.Remove, key), key);
    },
  });
}
```

The adapter owns its serializer, because backends disagree about what they can hold: strings for web storage, JSON values for an extension storage area. Resolve the backend on every operation rather than once at construction, since a storage is usually built while a module is loading and long before anything reads from it.

### Surviving a server render

Pair a platform adapter with memory, and one storage works both where the backend exists and where it does not.

```ts
import { createStorage, memoryAdapter, withFallback } from "@platform-storage/core";
import { localStorageAdapter } from "@platform-storage/web";

export const storage = createStorage({
  schema,
  adapter: withFallback(localStorageAdapter(), memoryAdapter({ name: "server-memory" })),
});
```

## Following changes

```ts
const stop = storage.watch("theme", ({ oldValue, newValue }) => {
  applyTheme(newValue);
});
```

`watch` reports writes made through this storage and changes from other tabs or extension contexts, and each is delivered once, in order. Delivery connects during the first call, so a Manifest V3 service worker can register in its first turn.

- Invalid data arrives as a read would answer it, from `recover`, an `onInvalid` callback or otherwise the fallback, and `onError` hears about it. A watcher never writes, removes or throws, and a listener that throws is reported through `onError` while the others still run.
- Each listener gets its own copy of plain objects, arrays, dates, maps and sets, so it may change them. Anything else, such as a class instance, is handed over as it is.
- A listener hears only changes that arrive after it started listening. A write still under way when it starts counts, with `oldValueKnown` `false`.
- A key's stored old names are not reported, and moving a value from one is not a change. In a context the backend tells, the move can arrive as the key going from empty to its value, and overwriting a value still under an old name reports the old value as empty.
- A read saving a migration or a `recover` is not a change either, so neither `watch` nor `onChange` hears of it, in this context or another. Between two contexts on different releases, or with a step that gives a different answer each time, the save can arrive as one extra change, and one saved under a new name after a `readFrom` hit can arrive as the key going from empty to its value.
- Another tab clearing all of `localStorage` says nothing about what it replaced, so `oldValueKnown` is `false` and `oldValue` is what an empty key reads as.
- A second storage over the same `localStorage` in one document hears nothing, because the browser does not tell a page about its own writes. A write of an identical value may or may not be reported.
- AsyncStorage reports nothing, so React Native hears writes made through the same storage only.

## Renaming a stored key

Changing a key's stored name would otherwise lose what it holds: reads look under the new name, find nothing, and return the default. List the old names in `readFrom` and the value comes with you:

```ts
const schema = defineStorageSchema({
  recent: { schema: z.array(z.string()), key: "app:recent", readFrom: ["recentSearches"] },
});
```

When the current name holds nothing, a read tries the old names in order. A value found under one is validated, written to the current name, removed from the old one, and returned. Nothing happens until that key is read, and a key still holding its value under the current name never looks further.

- Invalid data under an old name goes through the usual invalid-data policy, which reports the old name. `"remove"` deletes only that name, so one tried later can still answer.
- If the move fails, the read still returns the value, `onError` hears about it, and the old value stays for the next read to try.
- A [versioned key](#versioned-keys) found under an old name runs its chain, and the latest version is what gets written to the current name.
- `has` counts the old names, and `set`, `remove` and `clear` clear them.
- Delete the entry once the old names no longer matter. Keeping it costs only an extra lookup when the key is empty.

## Prefixing stored names

```ts
const settings = createLocalStorage({ schema, prefix: "app:" });

await settings.set("theme", "dark"); // stored as "app:theme"
```

A prefix lets several storages, or a storage and other code, share one backend without their names colliding. It belongs to the storage rather than the schema, so one schema can back several storages under different prefixes.

- It is taken literally: `"app:"` gives `app:theme`, and `"app"` would give `apptheme`. The separator is yours to choose.
- A key's `readFrom` names take the prefix too, so a storage only ever looks inside its own prefix.
- `prefixed: false` keeps a key and its `readFrom` names exactly as written, for a name something else owns, such as another library's token.
- `physicalKey(key)` answers with the prefixed name. `clear()` removes only this storage's names, so a second storage under another prefix is left alone.
- A prefix can make two names clash where the schema alone could not, such as a key opting out with `key: "app:user"` beside `user` under `"app:"`. `createStorage` checks the final names and throws `StorageSchemaError`.

### Adopting a prefix

Adding a prefix to a storage that already holds data moves every name, so existing values would read as missing. `readUnprefixed` moves them across as they are read:

```ts
const settings = createLocalStorage({ schema, prefix: "app:", readUnprefixed: true });
```

A read tries each key's prefixed names first, then the same names without the prefix: the current name, then its `readFrom` names. A value found under a bare name is validated, migrated if the key has versions, written under the prefix and removed from the bare name. A key declaring `prefixed: false` is unaffected.

It needs a `prefix`. Asking without one is refused with `StorageSchemaError` when the storage is built; the types do not catch it, so that `CreateStorageOptions` stays an interface you can extend and `Omit` from.

Turn it off once old data has moved. While it is on, the bare names count as this storage's:

- On a backend other code shares, a bare `theme` may be someone else's, and a read would take it and delete it.
- `has` counts the bare names, and `clear()` and every write remove them.
- Two storages over one backend under different prefixes would race for the same bare names, and whichever read first takes the value.
- A prefix without a separator can make a bare name land on another key's prefixed name, as `"a"` does for keys `b` and `ab`. `createStorage` refuses that.

## Versioned keys

A key declared with `defineVersions` stores its version beside its value, as `{ "v": 2, "d": value }`. Every other key stays bare. A read brings an older value forward one step at a time, validating against each version on the way, answers with the latest shape, and saves it so the chain does not run again.

Saving never costs the read its answer. If the backend refuses, the read still returns the migrated value, `onError` hears about it, and the save is not tried again until the stored data changes or the page reloads. A value written since the read is never overwritten. If the result would not read back as the latest version and the same value, as with a schema that rejects its own output or changes it again, the save is skipped and reported, and the original stays.

To move an existing key onto versions, its current schema becomes version 1. Nothing else has to run: a stored value that is not an envelope counts as version 1.

```ts
// Before: stored bare, as {"compact":true}.
const prefs = defineKey(prefsV1, { default: { compact: false } });

// After: the old schema is untouched and becomes version 1.
const prefs = defineVersions(prefsV1)
  .next(prefsV2, (previous) => ({ density: previous.compact ? "compact" : "comfortable" }))
  .options({ default: { density: "comfortable" } });
```

- Never edit an old version's schema. It describes data already on people's devices.
- Version 1 has to describe what is really stored, because that is what the first step is handed. [`recover`](#recovering-a-value-by-hand) catches the leftovers.
- If the stored name is changing too, add `readFrom`.
- An envelope is exactly the fields `v` and `d`, with `v` a positive integer. An old bare object with exactly those two fields reads as an envelope, and normally fails validation there.
- Anything reading the key without this library has to understand the envelope, or the key can use `recover` instead and stay bare.
- A version's schema has to accept its own output and answer the same for it, as every key's schema does. A transform that would change a saved value again leaves the old form stored, and the step runs on every read.
- A top-level catch-all such as `z.array(...).catch([])` or `z.unknown()` on a later version accepts whatever a faulty step returns, so a step's mistake goes unnoticed. A `.catch` on a single field does not have that effect.

Some stored data cannot be judged by the code reading it, and a read never destroys that data:

| What was found                | What a read does                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------- |
| A version newer than the code | Answers through the invalid-data policy and reports `UnknownStorageVersionError` |
| A step that throws or fails   | Answers through the invalid-data policy and reports `StorageMigrationError`      |

In both cases `"remove"` falls back instead of deleting and `update` rejects, so a rollback or a faulty release leaves the value for a later release to read. `set`, `remove` and `clear` still work, since those replace the value on purpose. A value failing the schema of its own version is ordinary corruption, and every policy applies to it as usual.

A step can run in two contexts at once, so keep steps pure. On a backend with no synchronous calls, another context can write between a read's check and its save.

A context still on code from before the key had versions sees an envelope as invalid data. Under `"remove"` it would delete it, so drop that policy a release before adopting versions.

## Recovering a value by hand

`recover` repairs a stored value the schema rejects and saves the repair. It is for a key other code also reads, which has to stay bare, and for data no version describes: another program's writes, a removed enum member, text that was never JSON.

```ts
const prefs = defineKey(prefsSchema, {
  recover: (raw) => {
    if (typeof raw !== "object" || raw === null) return undefined;

    return { compact: "dense" in raw && raw.dense === true };
  },
});
```

It receives the stored value as `unknown`, or the stored text where that could not be parsed. Under a versioned key it receives the value without its envelope.

- Its result is validated against the key's latest schema, then written back, bare on an ordinary key and as the latest version on a versioned one.
- Answer `undefined` when the value cannot be repaired, and the invalid-data policy decides as usual.
- It runs after a version chain, on what the chain could not bring forward, and its saved result replaces that data. It never runs on data newer than the code.
- It takes precedence over `onInvalid`. A repair is not a failure, so `onError` hears nothing. A `recover` that throws or returns something invalid is reported, and the policy runs.
- It is synchronous, so a synchronous read can use it, and a `watch` listener sees its result without anything being saved.
- Found under an old name, only that name is removed once the repair is saved, so a later one is left for you to clean up.

|              | `defineVersions`                     | `recover`                  |
| ------------ | ------------------------------------ | -------------------------- |
| Stored as    | `{ v, d }`                           | Bare                       |
| Runs when    | The stored version is behind         | The value fails validation |
| Types        | Each step knows the previous version | None, deliberately         |
| Saves result | Yes                                  | Yes                        |

`onInvalid` decides only what one read answers, and also works per call and per storage, so it never writes anything but the deletion `"remove"` asks for.

## Defaults

A read returns `Output | undefined` unless something answers for a missing key, in which case `undefined` is dropped from the type:

- the key declares a `default`, or
- the schema accepts `undefined` as input and answers for itself, as `z.number().default(0)` and `z.string().optional()` do.

`z.catch()` is not one of those. Its input type is its value type, so it governs data that is _invalid_, which it absorbs before any policy runs, and says nothing about data that is _absent_. Declare a `default` alongside it to cover both.

A declared default is returned as given rather than copied. Where each read should get a fresh object, put the default in the schema as a factory instead.

## Invalid stored data

Persisted data outlives the code that wrote it, so a read has to decide what a value that no longer matches its schema means. The policy resolves narrowest-first: what the call asked for, then the key, then the storage, then the built-in default.

| Policy       | What a read does                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `"fallback"` | Returns the default, leaving the stored value in place. The built-in default.                                                                  |
| `"throw"`    | Rejects with the error that caused it, usually `StorageValidationError`.                                                                       |
| `"remove"`   | Deletes the stored value and falls back, leaving alone a value written since the read, or one [a versioned key cannot judge](#versioned-keys). |
| A callback   | Returns whatever it gives back, having been handed the key, the raw value and the issues.                                                      |

Falling back is not silent: the storage-level `onError` observer sees every failure whichever policy runs. Use `onInvalid: "throw"` in tests and development.

A callback written inline in `defineStorageSchema` has its return value trusted rather than checked, because there the definition and the rule it must satisfy are worked out from each other. Declare the key with `defineKey(schema, options)` to have it checked; a callback passed to a single `get` call is checked too.

## Writes

`set` takes the schema's output type and stores what the schema produced, so a coercion is persisted in its normalized form. A value the schema rejects throws `StorageValidationError` and nothing is written.

Writes to one key made through one storage run in the order they were started, and a read waits for the ones already under way, so a caller always reads its own writes. A validator that never answers would hold up later writes to that key.

## Errors

Every error extends `PlatformStorageError` and carries a `code`.

| Error                        | Code              | Raised when                                          |
| ---------------------------- | ----------------- | ---------------------------------------------------- |
| `StorageValidationError`     | `VALIDATION`      | A value does not match its schema                    |
| `StorageSerializationError`  | `SERIALIZATION`   | A value cannot be converted to or from its wire form |
| `StorageAdapterError`        | `ADAPTER`         | The backend itself failed                            |
| `StorageQuotaExceededError`  | `QUOTA`           | The backend has run out of room                      |
| `StorageUnavailableError`    | `UNAVAILABLE`     | The backend is not there at all                      |
| `UnknownStorageKeyError`     | `UNKNOWN_KEY`     | A key the schema does not declare                    |
| `StorageSchemaError`         | `INVALID_SCHEMA`  | The schema, or the way it is used, is wrong          |
| `StorageMigrationError`      | `MIGRATION`       | A step in a version chain failed                     |
| `UnknownStorageVersionError` | `UNKNOWN_VERSION` | A stored value is newer than any declared version    |

`StorageQuotaExceededError` and `StorageUnavailableError` both extend `StorageAdapterError`, so catching that one still catches both. A full backend is worth telling apart because it is the one failure an application can usually act on: evict something and the same write succeeds. Recognizing it is each adapter's job, since only the adapter knows how its own platform reports one, and a platform that gives no usable signal reports the general `ADAPTER` code instead.

Branch on the code rather than the class, and spell it with `STORAGE_ERROR_CODE` rather than the string. Prefer `isPlatformStorageError`, `isStorageValidationError` and `isStorageQuotaError` to `instanceof`: an application that resolves two copies of this package holds two copies of each class, and `instanceof` then fails across them.

```ts
import { isPlatformStorageError, STORAGE_ERROR_CODE } from "@platform-storage/core";

try {
  await storage.set("user", next);
} catch (error) {
  if (!isPlatformStorageError(error)) throw error;
  if (error.code === STORAGE_ERROR_CODE.Quota) return evictAndRetry();
  throw error;
}
```

## Synchronous reads

`get`, `set`, `update`, `remove`, `has` and `clear` always return promises. When the adapter can answer immediately, the storage additionally exposes `getSync`, `setSync`, `updateSync`, `removeSync`, `hasSync` and `clearSync`, and the type reflects it. An adapter that cannot answer immediately does not expose them at all.

## License

MIT © SkorpionG
