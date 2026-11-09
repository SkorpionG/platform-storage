# @platform-storage/web

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

- 2ca9009: A key can now change where it is stored without losing what it holds: `readFrom` on a key definition lists the names it used to have, and a read that finds nothing at the current name moves a value found under one of them.

  `update` and `updateSync` work out a key's next value from its current one as a single step. The updater receives its own copy of the current value, so it may change it in place, and an update that fails leaves the stored value and the key's default as they were. Writes to one key through one storage now run in the order they were started, and `get` and `has` wait for writes already under way.

  Adapters can list every name a backend holds through an optional `keys`, and `keysSync` on the synchronous ones. The web, extension, React Native and memory adapters all offer it, the React Native one when the instance has `getAllKeys`.

  `withFallback` adapters gain `chosen()`, which says which half is in use without forcing the decision. `memoryAdapter` takes a `serializer`, so it can hold something other than text and be paired with an extension area, and copies values on the way in and out as a real backend does.

  `STORAGE_OPERATION` gains `Update` and `Keys`.

### Patch Changes

- Updated dependencies [79a52f6]
- Updated dependencies [2ca9009]
  - @platform-storage/core@0.2.0

## 0.1.0

### Minor Changes

- 7343ffd: Schema-first, type-safe `localStorage` and `sessionStorage`. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

  - `createLocalStorage` and `createSessionStorage` build a storage over the respective backend.
  - Web storage answers immediately, so both carry the synchronous half: a first render can read a stored value with no loading state.
  - `localStorageAdapter` and `sessionStorageAdapter` are the adapters behind them. `webStorageAdapter` builds one over anything with the `Storage` shape.
  - The storage is reached through a function on every operation rather than held from construction, because the access itself can throw: Safari in private browsing, a sandboxed iframe, and a page on an unusual origin all fail at the property access.
  - A storage that cannot be reached is reported as `StorageUnavailableError`, and one that refuses a write as `StorageAdapterError` carrying the browser's own exception as its cause.
  - A write refused because the origin is full is reported as `StorageQuotaExceededError`, recognized across the four shapes browsers use: the standard `QuotaExceededError` that current browsers raise, the `NS_ERROR_DOM_QUOTA_REACHED` older Firefox raised, and the legacy codes 22 and 1014.
  - `isQuotaExceeded` exposes that check for code reaching `localStorage` directly.
  - `withFallback(localStorageAdapter(), memoryAdapter())` builds one storage that works both in a browser and where there is no `window`, so application code never branches on where it is running.
  - `isWebStorageAvailable` reports whether a storage can actually be written to, by writing and removing a probe key, because presence is not availability.
  - Runs anywhere the Web Storage API does, which includes an Electron renderer process. The Electron main process has no `window` and needs a different adapter.

### Patch Changes

- Updated dependencies [7343ffd]
  - @platform-storage/core@0.1.0
