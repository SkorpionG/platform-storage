# @platform-storage/core

## 0.2.0

### Minor Changes

- 79a52f6: A storage now reports changes. `storage.watch(key, listener)` delivers the value before and after, read through the schema, and `storage.onChange(listener)` names the key that changed without reading anything. Both cover writes made through the storage and changes from other tabs or extension contexts.

  Adapters report what their backend can see through an optional `subscribe`: the web adapters follow the `storage` event, and the extension adapter follows `storage.onChanged`. AsyncStorage reports nothing, so React Native hears writes made through the same storage only.

  The React hooks follow every change by themselves while anything is mounted, so a value changed in another tab or context appears without further code. Writers gain `update`, which works out the next value from the current one. `notifyStorageChanged` is now needed only for a write made past the library.

  `STORAGE_OPERATION` gains `Subscribe`.

- 2ca9009: A key can now change where it is stored without losing what it holds: `readFrom` on a key definition lists the names it used to have, and a read that finds nothing at the current name moves a value found under one of them.

  `update` and `updateSync` work out a key's next value from its current one as a single step. The updater receives its own copy of the current value, so it may change it in place, and an update that fails leaves the stored value and the key's default as they were. Writes to one key through one storage now run in the order they were started, and `get` and `has` wait for writes already under way.

  Adapters can list every name a backend holds through an optional `keys`, and `keysSync` on the synchronous ones. The web, extension, React Native and memory adapters all offer it, the React Native one when the instance has `getAllKeys`.

  `withFallback` adapters gain `chosen()`, which says which half is in use without forcing the decision. `memoryAdapter` takes a `serializer`, so it can hold something other than text and be paired with an extension area, and copies values on the way in and out as a real backend does.

  `STORAGE_OPERATION` gains `Update` and `Keys`.

## 0.1.0

### Minor Changes

- 7343ffd: Declare a storage schema once. Every read and write is then validated at runtime and typed at compile time.

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
