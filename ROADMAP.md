# Roadmap

What is deliberately not in the first release, and what each item needs when it lands. Nothing here is a promise of a date; the list exists so that scope cut from v0.1 is recorded rather than remembered.

## v0.1 — the current target

Built: schema definition, typed keys and values, runtime validation on read and write, automatic serialization, typed errors, the layered invalid-data policy, an asynchronous API with a typed synchronous extension for synchronous adapters, the memory adapter, `withFallback`, and `@platform-storage/web`: `localStorage` and `sessionStorage`, over a `Storage` reached through a function so the access itself stays guarded.

Still to build, each with a convenience factory over `createStorage`:

- **`@platform-storage/extension`** — the `local`, `sync` and `session` areas, resolved from `browser` or `chrome`, storing JSON values natively rather than as text.
- **`@platform-storage/react-native`** — AsyncStorage, with the instance supplied by the application so the package never imports a native module.

## Next

### Change subscription

`storage.subscribe(key, listener)`, backed by the `storage` event on the web, `storage.onChanged` in extensions, and an in-process emitter for memory and AsyncStorage. Needs an optional capability on the adapter interface, because the backends genuinely differ: an extension reports changes made by other contexts, the web `storage` event fires only in _other_ tabs, and AsyncStorage reports nothing at all.

### Batch reads and writes

`getMany` / `setMany`, preserving each key's own type in the result. Extension storage areas take batches natively, so the adapter interface grows optional `getMany` / `removeMany` hooks with a loop fallback elsewhere. This is where the per-operation round trip currently costs the most.

### Namespace prefix

`createStorage({ namespace: "myapp" })`, prefixing every physical key that does not already declare its own. Cheap to add because physical-key resolution is already a single function.

### Parameterized keys

`key: (params) => string`, for per-entity values such as a tab selection stored per record. Adds a params argument to `get` / `set` / `remove` and a second type parameter to the key definition. The schema shape does not otherwise change.

### Per-key serializers

A `serializer` on the key definition, overriding the adapter's. Two motivations: storing a bare enum string so other code can read the key without this library, and making non-idempotent transforms work (a schema like `z.string().transform(Number)` currently breaks, because the stored output is re-validated as if it were input on the next read).

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

### Richer serializers

`Date`, `Map`, `Set` and `BigInt` round trips, as an opt-in serializer rather than a change to the JSON default.

### Encryption hooks

A serializer boundary is the natural seam. Needs care around key management, so it is deliberately not a v0.1 concern.

### Devtools

Inspecting what is stored, against which schema, and what failed to validate.

## Tooling

### Publishing

Nothing has been published. The release workflow runs but skips itself until an `NPM_TOKEN` secret exists; adding one turns publishing on.

### Type-aware linting

`oxlint` gains type-aware rules through `oxlint-tsgolint`, which tracks the TypeScript 7 line. This repository pins TypeScript 6 (see the note in `pnpm-workspace.yaml`), so the rules are unavailable for now. Every package already has its own `tsconfig.json`, so enabling them later is a config change.

### TypeScript 7

`latest` on npm is now the Go-native 7.x port. Revisit once `tsdown`'s declaration emit and `vitest`'s typecheck mode are validated against it.

### Checking an inline `onInvalid` callback

A callback written inline inside `defineStorageSchema` has its return value trusted rather than checked. The object is inferred and then constrained against a type derived from itself, so an inline callback gets no usable expectation to meet: its literal return widens to `string`, and a narrower rule would reject `() => "dark"` for a schema that plainly allows it.

`defineKey(schema, options)` is the checked form and covers the case today, because taking the schema as its own argument means it is known before the options are read. Everything else about an inline entry, `default` and policy names included, is already checked. Revisit only if TypeScript's contextual typing through an F-bounded `const` type parameter improves enough to make both forms equivalent.

### Isolated declarations

`isolatedDeclarations` would enforce explicit types on every export and unlock a faster declaration-emit path. Left off while the generic-heavy core types are still being written, since the two interact badly during design churn.
