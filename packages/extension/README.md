# @platform-storage/extension

[![npm version](https://img.shields.io/npm/v/@platform-storage%2Fextension.svg)](https://www.npmjs.com/package/@platform-storage/extension) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Schema-first, type-safe storage for browser extensions: one schema shared across your background service worker, content scripts, popup and options page. The extension half of [platform-storage](https://github.com/SkorpionG/platform-storage).

## Installation

```sh
npm install @platform-storage/extension zod
```

```sh
pnpm add @platform-storage/extension zod
```

```sh
yarn add @platform-storage/extension zod
```

```sh
bun add @platform-storage/extension zod
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need. Zod is one choice among many: any [Standard Schema](https://standardschema.dev) validator works.

## Quick Start

```ts
import * as z from "zod";
import { createExtensionStorage, defineStorageSchema } from "@platform-storage/extension";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createExtensionStorage({ schema });

await storage.set("theme", "dark");
await storage.get("theme"); // "light" | "dark"
```

The storage is over the `local` area unless another is named. Every method returns a promise, because an extension storage area only ever answers later: there is no synchronous half here.

## API Usage

Everything `@platform-storage/core` exports is available here too — `defineStorageSchema`, `defineKey`, `createStorage`, the errors and the guards. See [its README](https://github.com/SkorpionG/platform-storage/tree/main/packages/core#readme) for those. What follows is what this package adds.

### `createExtensionStorage(options)`

Builds a storage over one WebExtension storage area, with the adapter supplied for you.

**Parameters:**

- `options`: everything `createStorage` takes apart from `adapter`, plus the adapter's own:
  - `schema: StorageSchema` — from `defineStorageSchema`. Required.
  - `area?: "local" | "sync" | "session"` — which area to store in. Defaults to `"local"`.
  - `storage?: () => ExtensionStorageNamespace | null | undefined` — where to find the `storage` namespace. Defaults to `resolveExtensionStorage`. Give one to go through a polyfill, or to hand a test a fake.
  - `name?: string` — what errors report. Defaults to the area's own name, such as `storage.local`.
  - `serializer?: Serializer<JsonValue>` — replaces the passthrough default. An area transports JSON values, so the wire type is `JsonValue`.
  - `onInvalid?: "throw" | "fallback" | "remove" | callback` — the policy for keys that declare none. Defaults to `"fallback"`.
  - `onError?: (error: PlatformStorageError) => void` — called for every failure, thrown or handled.

**Returns:** `PlatformStorage<Definition>` — asynchronous only, with no synchronous half.

```ts
const synced = createExtensionStorage({
  schema,
  area: "sync",
  onError: (error) => console.warn(error.code, error.message),
});
```

### `extensionStorageAdapter(options?)`

The adapter the factory above is built from, for `createStorage` or anything else that takes an adapter.

**Parameters:**

- `options?`: `area`, `storage` and `name`, exactly as above.

**Returns:** `StorageAdapter<JsonValue>`

### `resolveExtensionStorage()`

Finds the `storage` namespace in this context.

**Returns:** `ExtensionStorageNamespace | undefined` — `browser.storage` where it exists, otherwise `chrome.storage`, otherwise `undefined`.

`browser` comes first because it is promise-based everywhere it exists, whereas `chrome` is a compatibility namespace on Firefox. Both are read off `globalThis` and narrowed by shape, so this package never depends on a browser type package.

### `EXTENSION_STORAGE_AREA` and `ExtensionStorageAreaName`

The area names as an object of literals, and the union of them. `ExtensionStorageAreaName` is the type to reach for when writing a function that takes an area, since it is what `area` accepts.

```ts
function storageFor(area: ExtensionStorageAreaName) {
  return createExtensionStorage({ schema, area });
}
```

### `ExtensionStorageArea` and `ExtensionStorageNamespace`

The structural declarations of an area and of the namespace. They are the common denominator of Chrome's, Firefox's and the WebExtension polyfill's own types, and conformance tests check them against all three, so no browser type package reaches your type graph.

## Examples

### One schema across every extension context

Declare it once in a module with no browser types, and import it from the service worker, the popup and the options page alike.

```ts
// storage.ts
import * as z from "zod";
import { createExtensionStorage, defineStorageSchema } from "@platform-storage/extension";

export const settings = createExtensionStorage({
  schema: defineStorageSchema({
    theme: { schema: z.enum(["light", "dark", "system"]), default: "system" },
    excludedSites: { schema: z.array(z.string()).default(() => []) },
  }),
});
```

```ts
// popup.tsx
import { settings } from "./storage";

const theme = await settings.get("theme"); // "light" | "dark" | "system"
```

### Separate areas for separate lifetimes

`local`, `sync` and `session` are each a storage of their own, over their own schema. That keeps a schema platform-agnostic: the same one can back `local` here, `localStorage` on the web, and AsyncStorage on a phone.

```ts
const durable = createExtensionStorage({ schema: settingsSchema }); // local
const synced = createExtensionStorage({ schema: syncedSchema, area: "sync" });
const perSession = createExtensionStorage({ schema: cacheSchema, area: "session" });
```

`clear()` removes only the keys the schema declares, so another storage over the same area, or other code writing to it, is left alone.

### Going through the polyfill, or handing a test a fake

The namespace is resolved on every operation, so it can come from anywhere:

```ts
import browser from "webextension-polyfill";

const storage = createExtensionStorage({ schema, storage: () => browser.storage });
```

```ts
const fake = { local: inMemoryArea(), sync: inMemoryArea() };
const storage = createExtensionStorage({ schema, storage: () => fake });
```

### Handling a full `sync` area

The `sync` area is small and rate limited, so it is where a quota is met first.

```ts
import { isStorageQuotaError } from "@platform-storage/extension";

try {
  await synced.set("recentSearches", next);
} catch (error) {
  if (!isStorageQuotaError(error)) throw error;
  await synced.set("recentSearches", next.slice(-10));
}
```

An area says so by naming the limit it passed — `QUOTA_BYTES`, `QUOTA_BYTES_PER_ITEM`, `MAX_ITEMS` or one of the write-rate limits — rather than with an error type of its own, so reading the message is the only way to tell one apart. That is done here so a caller does not have to.

## Values are stored as objects

Extension storage areas hold JSON values natively, so values are handed over untouched rather than stringified. That keeps them readable by code that stored the key without this library, and it does not spend the `storage.sync` quota twice over.

Because nothing is encoded on the way in, a value outside JSON is refused rather than stored as something else. A `Date` or a `Map` would come back as a string or an empty object, so a write carrying one throws `StorageSerializationError` naming the part of the value at fault.

## Browser support

The promise-based storage API is used, which means Manifest V3 on Chromium and the `browser` namespace on Firefox. Both are found automatically, preferring `browser` where it exists. The `session` area needs Chrome 102 or Firefox 115.

The API is looked up on every operation rather than once, so a storage can be built in a module that is also loaded somewhere the API does not exist, such as a test or a page opened outside the extension. An operation there reports `StorageUnavailableError` rather than crashing. So does addressing `session` on a browser without it, and so does an extension that has not declared the `storage` permission. A call the browser itself rejects becomes `StorageAdapterError` with the browser's rejection as its `cause`.

## License

MIT © SkorpionG
