# @platform-storage/react-native

## 0.1.0

### Minor Changes

- 72e67ec: Schema-first, type-safe React Native and Expo storage over AsyncStorage. This package re-exports the whole `@platform-storage/core` API, so an application installs one package.

  - `createReactNativeStorage` builds a storage over an AsyncStorage instance you supply. Every method returns a promise, since AsyncStorage only ever answers later.
  - It is named for the platform rather than the backend, because AsyncStorage exports a `createAsyncStorage` of its own.
  - The instance is passed in rather than imported, so this package never loads a native module. It stays loadable under a test runner or on a server, and AsyncStorage itself is an optional peer dependency.
  - Anything with AsyncStorage's `getItem`, `setItem` and `removeItem` can stand in for it.
  - Values are stored as JSON text under the physical key, with nothing wrapped around them.
  - A missing key, which AsyncStorage reports as `null`, is read as `undefined`, so a schema that stores `null` keeps it.
  - A call the storage rejects becomes `StorageAdapterError` carrying that rejection as its cause.
  - A full device is not told apart from any other failure, unlike on the web and in an extension. What one produces depends on the native layer under AsyncStorage and differs between iOS and Android, so it keeps the general code rather than being guessed at.
  - `asyncStorageAdapter` is the adapter behind the factory, for `createStorage` or anything else that takes one.
  - `AsyncStorageLike` declares the shape structurally, and a conformance test checks it against AsyncStorage's own declaration, so the native module never reaches a consumer's dependency graph.

### Patch Changes

- Updated dependencies [7343ffd]
  - @platform-storage/core@0.1.0
