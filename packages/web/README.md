# @platform-storage/web

[![npm version](https://img.shields.io/npm/v/@platform-storage%2Fweb.svg)](https://www.npmjs.com/package/@platform-storage/web) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Schema-first, type-safe `localStorage` and `sessionStorage`. The browser half of [platform-storage](https://github.com/SkorpionG/platform-storage).

## Installation

```sh
# Install with npm
npm install @platform-storage/web zod

# Install with pnpm
pnpm add @platform-storage/web zod

# Install with Yarn
yarn add @platform-storage/web zod

# Install with Bun
bun add @platform-storage/web zod
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need. Zod is one choice among many: any [Standard Schema](https://standardschema.dev) validator works.

## Quick Start

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

storage.getSync("theme"); // "light" | "dark", read during a render
```

Web storage answers immediately, so the storage also carries the synchronous half. `createSessionStorage` is the same over `sessionStorage`: each is a storage of its own, so one schema can back both without either seeing the other's values.

Values are stored as JSON text under the physical key, with nothing wrapped around them. `clear()` removes only the keys the schema declares, never the rest of an origin that other code shares.

## API Usage

Everything `@platform-storage/core` exports is available here too — `defineStorageSchema`, `defineKey`, `createStorage`, the errors and the guards. See [its README](https://github.com/SkorpionG/platform-storage/tree/main/packages/core#readme) for those. What follows is what this package adds.

### `createLocalStorage(options)`

Builds a storage over `localStorage`, with the adapter supplied for you.

**Parameters:**

- `options`: everything `createStorage` takes apart from `adapter`:
  - `schema: StorageSchema` — from `defineStorageSchema`. Required.
  - `serializer?: Serializer<string>` — replaces the JSON default. Web storage transports strings, so the wire type is `string`.
  - `onInvalid?: "throw" | "fallback" | "remove" | callback` — the policy for keys that declare none. Defaults to `"fallback"`.
  - `onError?: (error: PlatformStorageError) => void` — called for every failure, thrown or handled.

**Returns:** `SyncPlatformStorage<Definition>` — the asynchronous API plus `getSync`, `setSync`, `removeSync`, `hasSync` and `clearSync`.

```ts
const storage = createLocalStorage({
  schema,
  onInvalid: "throw",
  onError: (error) => console.warn(error.code, error.message),
});
```

### `createSessionStorage(options)`

The same over `sessionStorage`, taking and returning the same things. Values are cleared when the tab closes.

### `localStorageAdapter(options?)` and `sessionStorageAdapter(options?)`

The adapters the factories above are built from, for `createStorage`, for `withFallback`, or for anything else that takes an adapter.

**Parameters:**

- `options?`:
  - `name?: string` — what errors report. Defaults to `"localStorage"` or `"sessionStorage"`.

**Returns:** `SyncStorageAdapter<string>`

### `webStorageAdapter(getStorage, options?)`

An adapter over any object with the `Storage` shape, which is what both of the above are built from.

**Parameters:**

- `getStorage: () => Storage | null | undefined` — called on every operation, not once at construction. A throw, or a `null` or `undefined` result, is reported as `StorageUnavailableError`.
- `options?`: `name?: string`, as above. Defaults to `"web-storage"`.

**Returns:** `SyncStorageAdapter<string>`

```ts
const storage = createStorage({
  schema,
  adapter: webStorageAdapter(() => window.localStorage, { name: "prefs" }),
});
```

### `isWebStorageAvailable(getStorage)`

Whether the storage can actually be written to, checked by writing and removing a probe key.

**Parameters:** `getStorage`, as above.

**Returns:** `boolean`

Presence is not availability: a `Storage` object can exist whose `setItem` throws, as it does in Safari private browsing. This is also what the adapters' own `isAvailable` answers with.

### `isQuotaExceeded(cause)`

Whether an exception a browser threw means the origin is full.

**Parameters:** `cause: unknown` — whatever was caught.

**Returns:** `boolean`

Recognizes the four shapes browsers use: the standard `QuotaExceededError`, Firefox's `NS_ERROR_DOM_QUOTA_REACHED`, and the legacy numeric codes 22 and 1014. The adapters apply this themselves, so reach for it only where you touch `localStorage` directly; for an error this library raised, `isStorageQuotaError` is the one to use.

## Examples

### Reading during a render, with no loading state

The synchronous half is the point of this package. A value is on screen in the first paint rather than after an effect.

```ts
import { createLocalStorage, defineStorageSchema } from "@platform-storage/web";

const storage = createLocalStorage({
  schema: defineStorageSchema({
    theme: { schema: z.enum(["light", "dark"]), default: "light" },
  }),
});

document.documentElement.dataset["theme"] = storage.getSync("theme");
```

### Surviving a server render

`localStorageAdapter` reaches for `window.localStorage` on every operation and reports a missing or refused storage as `StorageUnavailableError`. Pair it with memory and one storage works in both places:

```ts
import {
  createStorage,
  localStorageAdapter,
  memoryAdapter,
  withFallback,
} from "@platform-storage/web";

export const storage = createStorage({
  schema,
  adapter: withFallback(localStorageAdapter(), memoryAdapter({ name: "server-memory" })),
});
```

The choice is made on first use and then kept, so a value is never written to one backend and read from the other.

That is half of what a server-rendered app needs; the other half is React's. A synchronous read during render answers with the declared defaults on a server and with the stored values in a browser, so the first client render has to be handed the server's answer or hydration fails. `@platform-storage/react` supplies that through `readDeclaredValue`.

### Handling a full origin

```ts
import { isStorageQuotaError } from "@platform-storage/web";

async function remember(term: string) {
  const recent = [...(await storage.get("recentSearches")), term];

  try {
    await storage.set("recentSearches", recent);
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
    await storage.set("recentSearches", recent.slice(-10));
  }
}
```

### Two storages over one schema

`localStorage` and `sessionStorage` are separate backends. Neither sees the other's values, even under the same key.

```ts
const durable = createLocalStorage({ schema });
const perTab = createSessionStorage({ schema });

await durable.set("theme", "dark");
await perTab.get("theme"); // "light" — its own backend holds nothing
```

## Where it runs

Anywhere the Web Storage API exists. That is a browser tab, and it is also an Electron renderer process, which is a Chromium page running to web standards; Electron's own guidance is to share data between renderers with `localStorage`, `sessionStorage` or IndexedDB. Nothing here is Electron-specific, and no separate package is needed for it.

The Electron main process is a different environment: Node.js, with no `window`. A storage built there reports `StorageUnavailableError` on first use rather than crashing, so pair it with another adapter or fall back as above.

## Why the storage is passed as a function

Reaching for `window.localStorage` can throw on its own, not just on write. Safari in private browsing and sandboxed iframes both fail at the property access, and so does a page whose origin the browser does not treat as a normal scheme, host and port, such as one loaded over `file:`. The adapters here take a function and call it inside a guard on every operation, so a storage that becomes unavailable is reported rather than crashing the page.

A refused write becomes `StorageAdapterError` with the browser's own exception as its `cause`. A write refused because the origin is full becomes `StorageQuotaExceededError`, which extends it and carries the code `QUOTA`, so an application can evict something and try again rather than only report the failure.

## License

MIT © SkorpionG
