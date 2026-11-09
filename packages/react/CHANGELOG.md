# @platform-storage/react

## 0.3.0

### Minor Changes

- A key can now declare the shapes it has had. `defineVersions(schema).next(schema, up)` builds a key definition that goes in the same schema object as any other, with each `up` typed against the version before it, and `.options(...)` adding `key`, `readFrom`, `default`, `onInvalid` and `recover` checked against the latest version.

  A versioned key stores `{ v, d }`, and every other key stays bare. A value written before the key had versions reads as version 1, so adopting versions needs no migration of its own. A read brings an older value forward one step at a time, validating at every step.

  Data the running code cannot judge is never destroyed. Where a stored version is newer than the code or a step fails, a read answers through the invalid-data policy, `"remove"` falls back instead of deleting, and `update` rejects.

  A migrated value is saved in the key's turn, never over a newer write, and a failed save still returns the migrated value and reports through `onError`. A versioned key found under a `readFrom` name runs its chain, and the latest version is what is written to the current name.

  A new `recover` option repairs a stored value the schema rejects and saves the repair. It keeps a key bare, receives the stored value as `unknown` or text that could not be parsed, runs after a version chain, and hands over to `onInvalid` when it answers `undefined`.

  Saving a migration or a `recover` result is not reported as a change. `watch` and `onChange` stay quiet, in the context that saved it and in any other tab or extension context seeing the same write.

  `InvalidContext.error` now includes the two new errors, which matters only to code that narrows it exhaustively.

  Before adopting versions on a key, drop the `"remove"` policy for it one release earlier, because a context still on older code sees an envelope as invalid data. Anything reading that key without this library has to understand the envelope, or the key can use `recover` and stay bare.

  Adds `StorageMigrationError` and `UnknownStorageVersionError`, with the codes `MIGRATION` and `UNKNOWN_VERSION`, and the types `VersionChain`, `VersionedKey`, `KeyVersion`, `StorageMigrationErrorOptions` and `UnknownStorageVersionErrorOptions`. A malformed chain is refused by `defineStorageSchema` with `StorageSchemaError`.

  `Immutable` now keeps a tuple a tuple, so a declared `default` for a tuple schema has to have its members in the right order.

### Patch Changes

- Updated dependencies
  - @platform-storage/core@0.3.0

## 0.2.0

### Minor Changes

- 79a52f6: A storage now reports changes. `storage.watch(key, listener)` delivers the value before and after, read through the schema, and `storage.onChange(listener)` names the key that changed without reading anything. Both cover writes made through the storage and changes from other tabs or extension contexts.

  Adapters report what their backend can see through an optional `subscribe`: the web adapters follow the `storage` event, and the extension adapter follows `storage.onChanged`. AsyncStorage reports nothing, so React Native hears writes made through the same storage only.

  The React hooks follow every change by themselves while anything is mounted, so a value changed in another tab or context appears without further code. Writers gain `update`, which works out the next value from the current one. `notifyStorageChanged` is now needed only for a write made past the library.

  `STORAGE_OPERATION` gains `Subscribe`.

### Patch Changes

- Updated dependencies [79a52f6]
- Updated dependencies [2ca9009]
  - @platform-storage/core@0.2.0

## 0.1.0

### Minor Changes

- 3505fd0: React hooks, installed alongside a platform package rather than instead of one. It exports hooks only, and re-exports no core API.

  - `useStorageValue(storage, key)` returns the value and a writer, read during the render with no promise and no loading state.
  - A write re-renders the components reading that key, and no others.
  - `useStorageWriter` is the writer alone, for a component that writes a key it never displays.
  - `useAsyncStorageValue` is the same pair over any storage, which is what extension areas and AsyncStorage need.
  - It reports `{ status, value, error }`, where `"ready"` with a value of `undefined` means the key holds nothing rather than that the read is still running.
  - The synchronous hooks refuse those storages at compile time.
  - `createStorageHooks(storage)` binds the hooks to one storage and picks the half its backend can serve.
  - `useHydrated` reports when React has taken over the server's markup, for rendering something browser-only without a hydration mismatch.
  - `useStorageErrors`, paired with `recordStorageError` as a storage's `onError`, is where a fallback stops being invisible.
  - `notifyStorageChanged` announces a change the writers did not make, such as a `clear()`.
  - `readDeclaredValue`, from the `./server` subpath, is what a server render answers with. It is the one export carrying no `"use client"`.

### Patch Changes

- Updated dependencies [7343ffd]
  - @platform-storage/core@0.1.0
