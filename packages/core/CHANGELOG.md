# @platform-storage/core

## 0.6.0

### Minor Changes

- `clear(target)` and `clearSync(target)` take a target, or a list of them added together, saying what to remove. With none, `clear()` removes exactly what it always has: every name the schema declares.

  - `"declared"` is the default.
  - `"readFrom"` removes only the old names in `readFrom`, once a rename has run everywhere.
  - `"unprefixed"` removes the names from before a prefix, to tidy up after `readUnprefixed`, and never one another key stores under.
  - `"undeclared"` removes stored names the schema does not list, only under the storage's prefix where it has one.
  - `"everything"` removes the whole backend and has to be asked for on its own. A list cannot hold it, at compile time or at runtime.

  `CLEAR_TARGET` spells the targets, and `ClearTarget` and `ClearTargets` type them.

  `"undeclared"` and `"everything"` list the backend through the adapter's `keys`, or `keysSync` for `clearSync`, and every shipped adapter can. Where an adapter cannot, the call throws the new `StorageUnsupportedError`, code `UNSUPPORTED`, before removing anything. A failure to list reports the `keys` operation through `onError`.

  `"unprefixed"` on a storage with no prefix removes nothing and tells `onError` with a `StorageSchemaError`.

  Watchers hear about a key whose value changed because a name it was reading from was removed, with what it reads as once the removal has landed.

  `clear` and `clearSync` now take an argument, so passing either straight where a callback receives one, such as `onClick={storage.clear}` or `.then(storage.clear)`, no longer typechecks, and from JavaScript rejects with `StorageSchemaError` when the argument is not a target. Wrap it in an arrow function: `onClick={() => storage.clear()}`.

### Patch Changes

- `remove`, `removeSync`, `clear` and `clearSync` now tell watchers about a key that a refused removal changed anyway. A key with old names is removed from each of them, one at a time on a backend without a batch call, so a refusal partway could leave it reading from a later old name while `watch` and `onChange` heard nothing. Each such key is now read again and announced, with `oldValueKnown` `false`, before the call rejects with the same error.

## 0.5.0

### Minor Changes

- `storage.getMany(keys)` reads several keys at once, answering an object keyed by the keys asked for, and `getManySync` does the same where the backend answers immediately. Each key reads exactly as `get` would, with its default, policy, versions, `recover` and repairs, but every name the keys could be under is fetched in one backend call. `options.onInvalid` takes a named policy only. Adds the `GetManyOptions` and `GetManyResult` types.

  `storage.setMany(values)` writes several keys at once and `storage.removeMany(keys)` removes several, with `setManySync` and `removeManySync` where the backend answers immediately. Every value is validated before any is written, so one refusal leaves the backend as it was. The call holds every key's turn at once, and watchers hear about each key, all of a batch before any change a listener makes in response. Adds the `SetManyValues` type.

  `clear()` now removes every declared name in one backend call where the backend has a batch call. A refusal there reports the `removeMany` operation without naming a key, where it used to report `remove` and the key the backend refused. On an extension area or AsyncStorage, code that branches on `error.operation === "remove"` or reads `error.physicalKey` from a failed `clear()` has to handle `removeMany` with no key as well. Single-key operations report exactly as before.

  When a write to several keys fails partway, which keys changed is unknown, so every key it touched is read again and announced to its watchers before the call rejects.

  An adapter can now work on several names in one call. `StorageAdapter` gains the optional `getMany`, `setMany` and `removeMany`, and `SyncStorageAdapter` the optional `getManySync`, `setManySync` and `removeManySync`; `defineSyncAdapter` carries them through, and `withFallback` offers them when both halves have them. An adapter without them keeps working, one call per name.

  The extension adapter reads, writes and removes several names in one area call. The AsyncStorage adapter uses AsyncStorage 3's `getMany`, `setMany` and `removeMany`, or AsyncStorage 2's `multiGet`, `multiSet` and `multiRemove`, whichever the instance has, and `AsyncStorageLike` declares both groups as optional.

  `STORAGE_OPERATION` gains `GetMany`, `SetMany` and `RemoveMany`, which an error reports when a batch call fails.

### Patch Changes

- `defineSyncAdapter` now calls every optional method on the definition it was given. `hasSync`, `isAvailable`, `keysSync` and `subscribe` were called detached, so a definition written with method syntax that reached its other methods through `this` threw.

## 0.4.0

### Minor Changes

- A storage can now put a prefix before every name it stores under. `createStorage({ schema, adapter, prefix: "app:" })`, and every platform factory, stores `theme` as `app:theme`, so several storages, or a storage and other code, can share one backend without their names colliding. The prefix is taken literally, so the separator is yours to choose.

  A key's `readFrom` names take the prefix too. A key declaring `prefixed: false` keeps its name and its `readFrom` names exactly as written, for a name something else owns. `storage.physicalKey(key)` answers with the prefixed name, while `schema.physicalKeys` stays unprefixed.

  `createStorage` now throws `StorageSchemaError` for a `prefix` that is empty or not a string, and where the names a prefix gives clash. Adding a prefix to a storage that already holds data moves every name. `readUnprefixed: true` moves existing values across as they are read, trying each key's names without the prefix after the prefixed ones. Turn it off once old data has moved: while it is on, `has`, `clear()` and every write treat the bare names as this storage's, which on a shared backend can take another program's value.

  `readUnprefixed` needs a `prefix`, and asking without one is refused with `StorageSchemaError` when the storage is built. The types do not catch it, so `CreateStorageOptions` stays an interface that can be extended and `Omit`ted.

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
