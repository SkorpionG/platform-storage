# @platform-storage/webextension

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
