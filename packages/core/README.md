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
  - `readFrom?: ReadonlyArray<string>` — names this key used to be stored under. See [Renaming a stored key](#renaming-a-stored-key).
  - `default?: Output` — what a read returns when nothing is stored. Declaring one removes `undefined` from the result type.
  - `onInvalid?: "throw" | "fallback" | "remove" | ((context) => Output)` — overrides the storage's policy for this key.

**Returns:** `StorageSchema<Definition>`

**Throws:** `StorageSchemaError` if an entry has no Standard Schema validator, if `readFrom` is not an array or names a current stored name, or if two keys resolve to the same stored key or claim the same old one.

```ts
const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: userSchema, key: "app:user" },
});
```

### `defineKey(schema, options?)`

Declares one key with everything about it checked against its schema. Reach for this when a key has an `onInvalid` callback, or when it is worth naming and sharing on its own.

**Parameters:**

- `schema`: the Standard Schema validator.
- `options?`: `key`, `readFrom`, `default` and `onInvalid`, as above.

**Returns:** a key definition, to be placed in a `defineStorageSchema` object.

The schema comes first for a reason: TypeScript reads arguments left to right, so by the time it checks the options it knows the schema and can hold an `onInvalid` callback to the values that schema produces. The same callback written inline inside `defineStorageSchema` is trusted rather than checked.

```ts
const theme = defineKey(z.enum(["light", "dark"]), {
  default: "light",
  onInvalid: (context) => (context.raw === "auto" ? "dark" : "light"),
});

const schema = defineStorageSchema({ theme });
```

### `createStorage(options)`

Builds a storage over a schema and a backend.

**Parameters:**

- `options`:
  - `schema: StorageSchema` — from `defineStorageSchema`. Required.
  - `adapter: StorageAdapter<Wire>` — the backend. Required.
  - `serializer?: Serializer<Wire>` — replaces the adapter's own, typed against what that adapter transports.
  - `onInvalid?: OnInvalid` — the policy for every key that does not declare its own. Defaults to `"fallback"`.
  - `onError?: (error: PlatformStorageError) => void` — called for every failure, whether thrown or handled.

**Returns:** `PlatformStorage<Definition>`, plus the synchronous methods when the adapter can answer immediately.

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

Works out the next value from the current one and stores it, as one step. `updater` is synchronous and receives what `get` would answer with, so the key's default where nothing is stored. Throwing from it rejects and writes nothing, and a result that validation or serialization refuses leaves the stored value as it was.

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

The name the backend stores this key under, for tooling that has to address it directly.

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

- Invalid data arrives as a read would answer it, from an `onInvalid` callback or otherwise the fallback, and `onError` hears about it. A watcher never writes, removes or throws, and a listener that throws is reported through `onError` while the others still run.
- Each listener gets its own copy of plain objects, arrays, dates, maps and sets, so it may change them. Anything else, such as a class instance, is handed over as it is.
- A listener hears only changes that arrive after it started listening. A write still under way when it starts counts, with `oldValueKnown` `false`.
- A key's stored old names are not reported, and moving a value from one is not a change. In a context the backend tells, the move can arrive as the key going from empty to its value, and overwriting a value still under an old name reports the old value as empty.
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
- `has` counts the old names, and `set`, `remove` and `clear` clear them.
- Delete the entry once the old names no longer matter. Keeping it costs only an extra lookup when the key is empty.

## Defaults

A read returns `Output | undefined` unless something answers for a missing key, in which case `undefined` is dropped from the type:

- the key declares a `default`, or
- the schema accepts `undefined` as input and answers for itself, as `z.number().default(0)` and `z.string().optional()` do.

`z.catch()` is not one of those. Its input type is its value type, so it governs data that is _invalid_, which it absorbs before any policy runs, and says nothing about data that is _absent_. Declare a `default` alongside it to cover both.

A declared default is returned as given rather than copied. Where each read should get a fresh object, put the default in the schema as a factory instead.

## Invalid stored data

Persisted data outlives the code that wrote it, so a read has to decide what a value that no longer matches its schema means. The policy resolves narrowest-first: what the call asked for, then the key, then the storage, then the built-in default.

| Policy       | What a read does                                                                          |
| ------------ | ----------------------------------------------------------------------------------------- |
| `"fallback"` | Returns the default, leaving the stored value in place. The built-in default.             |
| `"throw"`    | Rejects with `StorageValidationError`.                                                    |
| `"remove"`   | Deletes the stored value and falls back, leaving alone a value written since the read.    |
| A callback   | Returns whatever it gives back, having been handed the key, the raw value and the issues. |

Falling back is not silent: the storage-level `onError` observer sees every failure whichever policy runs. Use `onInvalid: "throw"` in tests and development.

A callback written inline in `defineStorageSchema` has its return value trusted rather than checked, because there the definition and the rule it must satisfy are worked out from each other. Declare the key with `defineKey(schema, options)` to have it checked; a callback passed to a single `get` call is checked too.

## Writes

`set` takes the schema's output type and stores what the schema produced, so a coercion is persisted in its normalized form. A value the schema rejects throws `StorageValidationError` and nothing is written.

Writes to one key made through one storage run in the order they were started, and a read waits for the ones already under way, so a caller always reads its own writes. A validator that never answers would hold up later writes to that key.

## Errors

Every error extends `PlatformStorageError` and carries a `code`.

| Error                       | Code             | Raised when                                          |
| --------------------------- | ---------------- | ---------------------------------------------------- |
| `StorageValidationError`    | `VALIDATION`     | A value does not match its schema                    |
| `StorageSerializationError` | `SERIALIZATION`  | A value cannot be converted to or from its wire form |
| `StorageAdapterError`       | `ADAPTER`        | The backend itself failed                            |
| `StorageQuotaExceededError` | `QUOTA`          | The backend has run out of room                      |
| `StorageUnavailableError`   | `UNAVAILABLE`    | The backend is not there at all                      |
| `UnknownStorageKeyError`    | `UNKNOWN_KEY`    | A key the schema does not declare                    |
| `StorageSchemaError`        | `INVALID_SCHEMA` | The schema, or the way it is used, is wrong          |

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
