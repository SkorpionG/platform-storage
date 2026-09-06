---
"@platform-storage/react-native": minor
---

Schema-first, type-safe React Native and Expo storage over AsyncStorage. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

- `createReactNativeStorage` builds a storage over an AsyncStorage instance the application supplies. Every method returns a promise, since AsyncStorage only ever answers later. It is named for the platform rather than the backend, since AsyncStorage exports a `createAsyncStorage` of its own.
- The instance is passed in rather than imported, so this package never loads a native module: it stays loadable under a test runner or on a server, and any storage with AsyncStorage's `getItem`, `setItem` and `removeItem` can stand in for it. AsyncStorage itself is an optional peer dependency.
- Values are stored as JSON text under the physical key, with nothing wrapped around them. A missing key, which AsyncStorage reports as `null`, is read as `undefined`, so a schema that stores `null` keeps it.
- A call the storage rejects becomes `StorageAdapterError` carrying that rejection as its cause.
- `asyncStorageAdapter` is the adapter behind the factory, for `createStorage` or anything else that takes one.
- `AsyncStorageLike` declares the shape structurally, and a conformance test checks it against AsyncStorage's own declaration, so the native module never reaches a consumer's dependency graph.
