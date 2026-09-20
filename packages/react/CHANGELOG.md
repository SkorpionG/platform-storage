# @platform-storage/react

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
