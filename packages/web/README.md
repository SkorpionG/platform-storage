# @platform-storage/web

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Schema-first, type-safe `localStorage` and `sessionStorage`. The browser half of [platform-storage](https://github.com/SkorpionG/platform-storage).

## Installation

```sh
npm install @platform-storage/web
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need. Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

## Usage

```ts
import * as z from "zod";
import { createLocalStorage, defineStorageSchema } from "@platform-storage/web";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createLocalStorage({ schema });

await storage.set("theme", "dark");
await storage.get("theme"); // "light" | "dark"
```

Web storage answers immediately, so the storage also carries the synchronous half: `getSync`, `setSync`, `removeSync`, `hasSync` and `clearSync`. A first render can read `storage.getSync("theme")` without a loading state.

`createSessionStorage` is the same over `sessionStorage`. Each is a storage of its own, so one schema can back both without either seeing the other's values.

Values are stored as JSON text under the physical key, with nothing wrapped around them. `clear()` removes only the keys the schema declares, never the rest of an origin that other code shares.

## Where it runs

Anywhere the Web Storage API exists. That is a browser tab, and it is also an Electron renderer process, which is a Chromium page running to web standards; Electron's own guidance is to share data between renderers with `localStorage`, `sessionStorage` or IndexedDB. Nothing here is Electron-specific, and no separate package is needed for it.

The Electron main process is a different environment: Node.js, with no `window`. A storage built there reports `StorageUnavailableError` on first use rather than crashing, so pair it with another adapter or fall back as below.

## Server rendering, and other places without a window

`localStorageAdapter` reaches for `window.localStorage` on every operation and reports a missing or refused storage as `StorageUnavailableError`. To write application code once for both the server and the browser, fall back to memory:

```ts
import {
  createStorage,
  localStorageAdapter,
  memoryAdapter,
  withFallback,
} from "@platform-storage/web";

const storage = createStorage({
  schema,
  adapter: withFallback(localStorageAdapter(), memoryAdapter()),
});
```

The choice is made on first use and then kept, so a value is never written to one backend and read from the other.

That is half of what a server-rendered app needs; the other half is React's. A synchronous read during render answers with the declared defaults on a server and with the stored values in a browser, so the first client render has to be handed the server's answer or hydration fails. Give `useSyncExternalStore` a `getServerSnapshot` backed by an empty backend and React prints the server's markup once, then swaps in what is stored. `examples/next` in the repository is a working demonstration, beside `examples/vite-react` running the identical panels client-side.

## Why the storage is passed as a function

Reaching for `window.localStorage` can throw on its own, not just on write. Safari in private browsing and sandboxed iframes both fail at the property access, and so does a page whose origin the browser does not treat as a normal scheme, host and port, such as one loaded over `file:`. The adapters here take a function and call it inside a guard on every operation, so a storage that becomes unavailable is reported rather than crashing the page.

A write the storage refuses, as an exhausted quota is, becomes `StorageAdapterError` with the browser's own exception as its `cause`.

## API

### `createLocalStorage(options)` and `createSessionStorage(options)`

`createStorage` with the adapter supplied. They take everything `createStorage` does apart from `adapter`: `schema`, `serializer`, `onInvalid` and `onError`. Both return `SyncPlatformStorage`.

### `localStorageAdapter(options?)` and `sessionStorageAdapter(options?)`

A `SyncStorageAdapter<string>` over the respective storage, for `createStorage`, for `withFallback`, or for anything else that takes an adapter. `options.name` renames the adapter in error messages.

### `webStorageAdapter(getStorage, options?)`

What both of those are built from: an adapter over any object with the `Storage` shape. `getStorage` is called on every operation, and a throw, or a `null` or `undefined` result, is reported as `StorageUnavailableError`.

### `isWebStorageAvailable(getStorage)`

Whether the storage can actually be written to, checked by writing and removing a probe key. Presence is not availability: a `Storage` object can exist whose `setItem` throws. This is also what the adapters' own `isAvailable` answers with.

## License

MIT © SkorpionG
