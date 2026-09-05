# @platform-storage/core

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The engine behind [platform-storage](https://github.com/SkorpionG/platform-storage): schema definition, type inference, runtime validation, serialization, the storage engine, the adapter contract, and the error hierarchy.

> This package is not published to npm.

## Installation

Install the package for your platform instead where one exists, since each re-exports everything here. Install core directly when you are writing your own adapter.

```sh
npm install @platform-storage/core
```

Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it. Zod, Valibot and ArkType all work; none is a dependency, and nothing here imports a validation library at runtime.

## Usage

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

```ts
const storage = createStorage({
  schema,
  adapter: memoryAdapter(),
  onInvalid: "throw",
  onError: (error) => console.warn(error.code, error.message),
});
```

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
| `StorageUnavailableError`   | `UNAVAILABLE`    | The backend is not there at all                      |
| `UnknownStorageKeyError`    | `UNKNOWN_KEY`    | A key the schema does not declare                    |
| `StorageSchemaError`        | `INVALID_SCHEMA` | The schema, or the way it is used, is wrong          |

Prefer `isPlatformStorageError` and `isStorageValidationError` to `instanceof`: an application that resolves two copies of this package holds two copies of each class, and `instanceof` then fails across them.

## Synchronous reads

`get`, `set`, `remove`, `has` and `clear` always return promises. When the adapter can answer immediately, the storage additionally exposes `getSync`, `setSync`, `removeSync`, `hasSync` and `clearSync`, and the type reflects it. An adapter that cannot answer immediately does not expose them at all.

## Writing an adapter

Implement `StorageAdapter<Wire>`, or `defineSyncAdapter` when the backend answers immediately and you want the asynchronous half derived for you. The adapter owns its serializer, because backends disagree about what they can hold: strings for web storage, JSON values for an extension storage area.

`requireBackend(source, context)` resolves a backend that may not be there. Call it on every operation rather than once at construction, since a storage is usually built while a module is loading: it takes a function, and reports `StorageUnavailableError` when calling that function throws or when it answers with `null` or `undefined`.

`withFallback(primary, fallback)` builds one adapter that uses the first backend where it exists and the second where it does not.

## License

MIT © SkorpionG
