# @platform-storage/react-native

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Schema-first, type-safe React Native and Expo storage. The mobile half of [platform-storage](https://github.com/SkorpionG/platform-storage).

## Installation

```sh
npm install @platform-storage/react-native @react-native-async-storage/async-storage
```

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need from this project. Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

AsyncStorage is an optional peer. This package never imports it, and any storage with its `getItem`, `setItem` and `removeItem` can stand in for it.

## API Usage

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as z from "zod";
import { createReactNativeStorage, defineStorageSchema } from "@platform-storage/react-native";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createReactNativeStorage({ schema, asyncStorage: AsyncStorage });

await storage.set("theme", "dark");
await storage.get("theme"); // "light" | "dark"
```

Every method returns a promise, because AsyncStorage only ever answers later: there is no synchronous half here.

Values are stored as JSON text under the physical key, with nothing wrapped around them. `clear()` removes only the keys the schema declares, never the rest of the storage.

## Why AsyncStorage is passed in

The storage instance is supplied by your application rather than imported here, so this package never pulls in a native module. It stays loadable under a test runner or on a server, and any compatible storage your app already uses can be handed over instead.

A call the storage rejects becomes `StorageAdapterError` with the rejection as its `cause`.

## One schema, every platform

A schema knows nothing about where it is stored, so the same one can back AsyncStorage here, `localStorage` on the web through `@platform-storage/web`, and a storage area in an extension through `@platform-storage/extension`.

## API

### `createReactNativeStorage(options)`

`createStorage` with the adapter supplied. Takes `asyncStorage`, and everything `createStorage` does apart from `adapter`. Returns `PlatformStorage`. It is named for the platform rather than the backend because AsyncStorage exports a `createAsyncStorage` of its own.

### `asyncStorageAdapter(asyncStorage, options?)`

A `StorageAdapter<string>` over the instance, for `createStorage` or anything else that takes an adapter. `options.name` renames the adapter in error messages.

### `AsyncStorageLike`

The part of AsyncStorage this package uses, declared structurally: `getItem`, `setItem` and `removeItem`. A conformance test checks it against AsyncStorage's own declaration.

## License

MIT © SkorpionG
