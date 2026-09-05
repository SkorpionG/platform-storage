---
"@platform-storage/core": minor
---

Declare a storage schema once, and every read and write is validated at runtime and typed at compile time.

- `defineStorageSchema` maps each logical key to its validator, the key its backend stores under, its default, and its own invalid-data policy. Both the key union and the value types are inferred from that one object, so nothing is restated at a call site.
- Any [Standard Schema](https://standardschema.dev) validator works, so Zod, Valibot and ArkType are all usable and none of them is a dependency. Nothing here imports a validation library at runtime.
- `createStorage` returns an asynchronous API, and additionally exposes `getSync` and its siblings when the adapter can answer immediately. Application code is written once and still reads without waiting where the platform allows it.
- Persisted data outlives the code that wrote it, so a value that no longer matches its schema falls back to the key's default rather than breaking the read. It is not silent: the `onError` observer sees every failure. The policy resolves per call, then per key, then per storage, and `"throw"`, `"remove"` and a callback returning a replacement are the alternatives.
- A missing value is always `undefined` and never `null`, because a schema may legitimately store `null`. Values are stored bare, exactly as the schema produced them, with no envelope wrapped around them.
- `clear()` removes only the keys the schema declares, so it can never wipe an origin shared with other code.
- Every error extends `PlatformStorageError` and carries a stable `code`. Prefer the `isPlatformStorageError` and `isStorageValidationError` guards to `instanceof`, which stops matching across two resolved copies of the package.
- Adapter authors get the `StorageAdapter` contract, `defineSyncAdapter` to derive the asynchronous half from the synchronous one, `requireBackend` for a backend that may not be there, `withFallback` to pair two backends, and `memoryAdapter`.
