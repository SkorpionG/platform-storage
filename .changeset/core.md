---
"@platform-storage/core": minor
---

Declare a storage schema once. Every read and write is then validated at runtime and typed at compile time.

- `defineStorageSchema` maps each key to its validator, the name its backend stores under, its default, and its own invalid-data policy.
- Keys and value types are both inferred from that one object, so nothing is restated at a call site.
- Any [Standard Schema](https://standardschema.dev) validator works: Zod, Valibot, ArkType. None of them is a dependency, and nothing here imports one at runtime.
- `createStorage` returns an asynchronous API, and adds `getSync` and its siblings when the adapter can answer immediately.
- A stored value that no longer matches its schema falls back to the key's default rather than breaking the read.
- Falling back is never silent: the `onError` observer sees every failure.
- The invalid-data policy resolves per call, then per key, then per storage. `"throw"`, `"remove"` and a callback returning a replacement are the alternatives.
- A missing value is always `undefined`, never `null`, because a schema may legitimately store `null`.
- Values are stored bare, exactly as the schema produced them, with no envelope around them.
- `clear()` removes only the keys the schema declares, so it can never wipe an origin shared with other code.
- Every error extends `PlatformStorageError` and carries a stable `code`. Prefer `isPlatformStorageError` to `instanceof`, which stops matching across two resolved copies of the package.
- Adapter authors get the `StorageAdapter` contract, `defineSyncAdapter`, `requireBackend`, `withFallback` and `memoryAdapter`.
