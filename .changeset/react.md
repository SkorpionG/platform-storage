---
"@platform-storage/react": minor
---

React hooks, as a package installed alongside a platform package rather than instead of one: it exports hooks only and re-exports no core API.

`useStorageValue(storage, key)` returns the value and a writer, reading during the render with no promise and no loading state. A write re-renders the components reading that key and no others. `useStorageWriter` is the writer alone, for a component that writes a key it never displays.

`useAsyncStorageValue` is the same pair over any storage, which is what extension areas and AsyncStorage need. It reports `{ status, value, error }`, where `"ready"` with a value of `undefined` means the key holds nothing rather than that the read is still running. The synchronous hooks refuse those storages at compile time.

`createStorageHooks(storage)` binds the hooks to one storage and picks the half its backend can serve. `useHydrated`, `useStorageErrors` with `recordStorageError`, and `notifyStorageChanged` for a change the writers did not make, complete the surface. `readDeclaredValue`, from the `./server` subpath, is what a server render answers with, and is the one export carrying no `"use client"`.
