# @platform-storage/webextension

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

- 3b3eb58: Schema-first, type-safe storage for browser extensions: one schema shared across the background service worker, content scripts, popup and options page. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

  - `createWebExtensionStorage` builds a storage over one area, `local` unless another is named. Every method returns a promise, since an area only ever answers later.
  - `local`, `sync` and `session` are each a storage of their own, over their own schema. That keeps a schema platform-agnostic: the same one can back an area here and `localStorage` on the web.
  - Values are handed to the area untouched rather than stringified, because it stores JSON values natively. They stay readable by code that wrote the key without this library, and the `sync` quota is not spent twice over.
  - A value the area could not hold, such as a `Date` or a `Map`, is refused with the part at fault named, rather than being stored as something else.
  - The `storage` namespace is found on every operation, preferring `browser` over `chrome`, and is never depended on at build time.
  - A context without the API, an area the browser does not have, and an extension without the `storage` permission all report `StorageUnavailableError` rather than crashing.
  - A call the browser rejects becomes `StorageAdapterError` with that rejection as its cause.
  - A full area becomes `StorageQuotaExceededError`. An area names the limit it passed in its message rather than raising an error type of its own, so reading that is done here rather than left to the caller.
  - `webExtensionStorageAdapter` is the adapter behind the factory, and takes the namespace as a function so a polyfill or a test fake can be handed over.
  - `WebExtensionStorageArea` and `WebExtensionStorageNamespace` declare the API structurally, as the common denominator of Chrome's, Firefox's and the WebExtension polyfill's own types, so no browser type package reaches a consumer's type graph.

### Patch Changes

- Updated dependencies [7343ffd]
  - @platform-storage/core@0.1.0
