# @platform-storage/extension

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Schema-first, type-safe storage for browser extensions: one schema shared across your background service worker, content scripts, popup and options page. The extension half of [platform-storage](https://github.com/SkorpionG/platform-storage).

## Installation

```sh
npm install @platform-storage/extension
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need. Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

## Usage

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

## Areas

`local`, `sync` and `session` are each a storage of their own, over their own schema:

```ts
const settings = createExtensionStorage({ schema: settingsSchema, area: "sync" });
const cache = createExtensionStorage({ schema: cacheSchema, area: "session" });
```

That keeps a schema platform-agnostic: the same one can back `local` here, `localStorage` on the web, and AsyncStorage on a phone.

`clear()` removes only the keys the schema declares, so another storage over the same area, or other code writing to it, is left alone.

## Values are stored as objects

Extension storage areas hold JSON values natively, so values are handed over untouched rather than stringified. That keeps them readable by code that stored the key without this library, and it does not spend the `storage.sync` quota twice over.

## Browser support

The promise-based storage API is used, which means Manifest V3 on Chromium and the `browser` namespace on Firefox. Both are found automatically, preferring `browser` where it exists. The `session` area needs Chrome 102 or Firefox 115.

The API is looked up on every operation rather than once, so a storage can be built in a module that is also loaded somewhere the API does not exist, such as a test or a page opened outside the extension. An operation there reports `StorageUnavailableError` rather than crashing. So does addressing `session` on a browser without it, and so does an extension that has not declared the `storage` permission. A call the browser itself rejects, as a `sync` write over quota is, becomes `StorageAdapterError` with the browser's rejection as its `cause`.

To go through a polyfill, or to hand a test a fake, pass the namespace yourself:

```ts
import browser from "webextension-polyfill";

const storage = createExtensionStorage({ schema, storage: () => browser.storage });
```

## API

### `createExtensionStorage(options)`

`createStorage` with the adapter supplied. Takes everything `createStorage` does apart from `adapter`, plus the adapter's own options below. Returns `PlatformStorage`.

### `extensionStorageAdapter(options?)`

A `StorageAdapter<JsonValue>` over one area, for `createStorage` or anything else that takes an adapter. `area` is `"local"` unless given. `storage` is a function answering with the `storage` namespace, `resolveExtensionStorage` unless given. `name` is what errors report, the area's own name such as `storage.local` unless given.

### `resolveExtensionStorage()`

The `storage` namespace in this context: `browser.storage` where it exists, otherwise `chrome.storage`, otherwise `undefined`.

### `EXTENSION_STORAGE_AREA`, `ExtensionStorageArea` and `ExtensionStorageNamespace`

The area names as an object of literals, and the structural declarations of an area and of the namespace. The declarations are the common denominator of Chrome's, Firefox's and the WebExtension polyfill's own types, and conformance tests check them against all three, so no browser type package reaches your type graph.

## License

MIT © SkorpionG
