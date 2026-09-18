# @platform-storage/core

[![npm version](https://img.shields.io/npm/v/@platform-storage%2Fcore.svg)](https://www.npmjs.com/package/@platform-storage/core) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The engine behind [platform-storage](https://github.com/SkorpionG/platform-storage): schema definition, type inference, runtime validation, serialization, the storage engine, the adapter contract, and the error hierarchy.

## Installation

Install the package for your platform instead where one exists, since each re-exports everything here. Install core directly when you are writing your own adapter.

```sh
npm install @platform-storage/core zod
```

```sh
pnpm add @platform-storage/core zod
```

```sh
yarn add @platform-storage/core zod
```

```sh
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
  - `default?: Output` — what a read returns when nothing is stored. Declaring one removes `undefined` from the result type.
  - `onInvalid?: "throw" | "fallback" | "remove" | ((context) => Output)` — overrides the storage's policy for this key.

**Returns:** `StorageSchema<Definition>`

**Throws:** `StorageSchemaError` if an entry has no Standard Schema validator, or if two keys resolve to the same stored key.

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
- `options?`: `key`, `default` and `onInvalid`, as above.

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

#### `remove(key): Promise<void>`

Deletes the stored value, so the key reads as its default again.

#### `has(key): Promise<boolean>`

Whether anything is stored, without validating or deserializing it.

#### `clear(): Promise<void>`

Removes only the keys this schema declares, never anything else sharing the backend.

#### `physicalKey(key): string`

The name the backend stores this key under, for tooling that has to address it directly.

#### `getSync` / `setSync` / `removeSync` / `hasSync` / `clearSync`

The same five operations without a promise, present only when the adapter can answer immediately. Absent from the type otherwise, so a call to one is a compile error rather than a runtime surprise.

### `memoryAdapter(options?)`

A backend that keeps everything in a `Map`. Useful in tests, as the second half of `withFallback`, and anywhere a real backend may be missing.

**Parameters:**

- `options?`:
  - `name?: string` — what errors report. Defaults to `"memory"`.
  - `initial?: Record<string, string>` — values to start from, already serialized, as though a previous run had written them.

**Returns:** `MemoryStorageAdapter`, which also exposes `entries` so a test can assert against it without going back through a storage.

### `withFallback(primary, fallback)`

Builds one adapter that uses the first backend where it exists and the second where it does not. The choice is made on first use and then kept, so a value cannot be written to one and read from the other. The result is synchronous only when both halves are.

### `defineSyncAdapter(definition)`

Builds a full adapter from its synchronous half, so each operation is written once and the asynchronous methods are derived.

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
| `"remove"`   | Deletes the stored value, then falls back.                                                |
| A callback   | Returns whatever it gives back, having been handed the key, the raw value and the issues. |

Falling back is not silent: the storage-level `onError` observer sees every failure whichever policy runs. Use `onInvalid: "throw"` in tests and development.

A callback written inline in `defineStorageSchema` has its return value trusted rather than checked, because there the definition and the rule it must satisfy are worked out from each other. Declare the key with `defineKey(schema, options)` to have it checked; a callback passed to a single `get` call is checked too.

## Writes

`set` takes the schema's output type and stores what the schema produced, so a coercion is persisted in its normalized form. A value the schema rejects throws `StorageValidationError` and nothing is written.

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

`get`, `set`, `remove`, `has` and `clear` always return promises. When the adapter can answer immediately, the storage additionally exposes `getSync`, `setSync`, `removeSync`, `hasSync` and `clearSync`, and the type reflects it. An adapter that cannot answer immediately does not expose them at all.

## License

MIT © SkorpionG
