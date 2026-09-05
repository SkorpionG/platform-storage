---
"@platform-storage/extension": minor
---

Schema-first, type-safe storage for browser extensions: one schema shared across the background service worker, content scripts, popup and options page. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

- `createExtensionStorage` builds a storage over one area, `local` unless another is named. Every method returns a promise, since an area only ever answers later.
- `local`, `sync` and `session` are each a storage of their own, over their own schema. That keeps a schema platform-agnostic, so the same one can back an area here and `localStorage` on the web.
- Values are handed to the area untouched rather than stringified, because it stores JSON values natively. They stay readable by code that wrote the key without this library, and the `sync` quota is not spent twice over.
- The `storage` namespace is found on every operation, preferring `browser` where it exists and falling back to `chrome`, and is never depended on at build time. A context without the API, an area the browser does not have, and an extension without the `storage` permission all report `StorageUnavailableError` rather than crashing. A call the browser rejects becomes `StorageAdapterError` with that rejection as its cause.
- `extensionStorageAdapter` is the adapter behind the factory, for `createStorage` or anything else that takes one, and accepts the namespace as a function so a polyfill or a test fake can be handed over.
- `ExtensionStorageArea` and `ExtensionStorageNamespace` declare the API structurally, as the common denominator of Chrome's, Firefox's and the WebExtension polyfill's own types, so no browser type package reaches a consumer's type graph.
