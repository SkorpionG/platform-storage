# Roadmap

What is deliberately out of scope, and what each item needs when it lands. Nothing here is a promise of a date; the list exists so that cut scope is recorded rather than remembered.

## v0.1 — the current target

Schema definition, typed keys and values, runtime validation on read and write, automatic serialization, typed errors, the layered invalid-data policy, an asynchronous API with a typed synchronous extension for synchronous adapters, the memory adapter, `withFallback`, and one adapter package per platform: `@platform-storage/web` over `localStorage` and `sessionStorage`, `@platform-storage/extension` over the `local`, `sync` and `session` areas, and `@platform-storage/react-native` over AsyncStorage.

## Next

### A wire type on the memory adapter

`memoryAdapter` declares its wire as `string`. Pairing it with an adapter that transports JSON values, such as an extension area, does work: `withFallback` hands both halves the primary's serializer, so values reach memory unencoded and read back unchanged. What does not hold is the typing around it. `entries` is declared `ReadonlyMap<string, string>` while holding objects, so a test asserting against it is typed wrong, and `initial` is documented as already-serialized text when in that pairing it is not text at all. A wire-type parameter, `memoryAdapter<Wire>()`, would make both honest without changing the default.

### Change subscription

`storage.subscribe(key, listener)`, backed by the `storage` event on the web, `storage.onChanged` in extensions, and an in-process emitter for memory and AsyncStorage. Needs an optional capability on the adapter interface, because the backends genuinely differ: an extension reports changes made by other contexts, the web `storage` event fires only in _other_ tabs, and AsyncStorage reports nothing at all.

`examples/web` shows what its absence costs an application: a revision counter every write has to bump, and a cache keyed on that counter so a snapshot holds still between writes. The cache is not incidental. `useSyncExternalStore` compares snapshots by identity, `getSync` deserializes on every call, and a schema default built by a factory answers with a fresh value even for a key holding nothing, so without it React never settles. A real subscription removes both, and the React bindings below are where they would go in the meantime.

### Asking `withFallback` which half it chose

The composite adapter decides on first use and keeps the decision, and nothing exposes it. `adapter.name` names both halves whichever one is live, and `isAvailable()` forces the choice rather than reporting it. The server-rendering demo has to infer it by comparing values across the hydration boundary. A read-only accessor would make a storage explain itself in a devtools panel or a log line.

### Batch reads and writes

`getMany` / `setMany`, preserving each key's own type in the result. Extension storage areas take batches natively, so the adapter interface grows optional `getMany` / `removeMany` hooks with a loop fallback elsewhere. This is where the per-operation round trip currently costs the most.

### Namespace prefix

`createStorage({ namespace: "myapp" })`, prefixing every physical key that does not already declare its own. Cheap to add because physical-key resolution is already a single function.

### Parameterized keys

`key: (params) => string`, for per-entity values such as a tab selection stored per record. Adds a params argument to `get` / `set` / `remove` and a second type parameter to the key definition. The schema shape does not otherwise change.

### Per-key serializers

A `serializer` on the key definition, overriding the adapter's. Two motivations: storing a bare enum string so other code can read the key without this library, and lifting the requirement that a schema accept its own output as input. A schema like `z.string().transform(Number)` cannot be used today, because `set` is typed to the value the key holds and validation then rejects that value as input. Separating the stored form from the validated form is what would make one-way transforms work.

### Versioning and migrations

The largest deferred piece, and the reason several v0.1 decisions look the way they do.

- Layered on top, not folded in: `defineVersionedStorage` consumes the same `StorageSchema` objects that `createStorage` does, so adopting versioning never means rewriting a schema.
- Values are stored bare in v0.1. The versioning layer introduces an envelope around the value and treats a non-envelope value as unversioned, which is what lets it be adopted without a migration of its own.
- Migrations are keyed by source version and applied in sequence, each one typed against the previous version's shape rather than against `unknown`.
- A missing migration in the chain is an error, never a silent partial upgrade.
- The whole chain runs in memory and is validated at every step before anything is written back.
- Errors extend the existing hierarchy: `StorageMigrationError`, `MissingMigrationError`, `UnknownStorageVersionError`.

### React bindings

A separate package. The core stays framework-agnostic; the web adapter's synchronous reads are what make an SSR-safe initial value possible without a loading state.

`examples/web` is the working prototype, and it is deliberately generic over the schema rather than written against the demo's own, so lifting it is a move rather than a rewrite. What it establishes: `useStoredValue(storage, key)` over `useSyncExternalStore`, a `getServerSnapshot` reading an empty backend derived from the storage's own schema so a server render and the first client render agree, and the identity cache above. The honest limit belongs in its README, because `getSync` cannot abolish the flash under server rendering: no server knows what a given browser stored, so what it removes is the promise, the effect and the loading state, not the repaint.

### Richer serializers

`Date`, `Map`, `Set` and `BigInt` round trips, as an opt-in serializer rather than a change to the JSON default.

### Encryption hooks

A serializer boundary is the natural seam. Needs care around key management, so it is deliberately not a v0.1 concern.

### Devtools

Inspecting what is stored, against which schema, and what failed to validate.

## Tooling

### Type-aware linting

`oxlint` gains type-aware rules through `oxlint-tsgolint`, which tracks the TypeScript 7 line. This repository pins TypeScript 6 (see the note in `pnpm-workspace.yaml`), so the rules are unavailable for now. Every package already has its own `tsconfig.json`, so enabling them later is a config change.

### TypeScript 7

`latest` on npm is now the Go-native 7.x port. Revisit once `tsdown`'s declaration emit and `vitest`'s typecheck mode are validated against it.

### Checking an inline `onInvalid` callback

A callback written inline inside `defineStorageSchema` has its return value trusted rather than checked. The object is inferred and then constrained against a type derived from itself, so an inline callback gets no usable expectation to meet: its literal return widens to `string`, and a narrower rule would reject `() => "dark"` for a schema that plainly allows it.

`defineKey(schema, options)` is the checked form and covers the case today, because taking the schema as its own argument means it is known before the options are read. Everything else about an inline entry, `default` and policy names included, is already checked. Revisit only if TypeScript's contextual typing through an F-bounded `const` type parameter improves enough to make both forms equivalent.

### Isolated declarations

`isolatedDeclarations` would enforce explicit types on every export and unlock a faster declaration-emit path. Left off while the generic-heavy core types are still being written, since the two interact badly during design churn.
