# @platform-storage/react-native

[![npm version](https://img.shields.io/npm/v/@platform-storage%2Freact-native.svg)](https://www.npmjs.com/package/@platform-storage/react-native) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Schema-first, type-safe React Native and Expo storage. The mobile half of [platform-storage](https://github.com/SkorpionG/platform-storage).

## Installation

```sh
# Install with npm
npm install @platform-storage/react-native @react-native-async-storage/async-storage zod

# Install with pnpm
pnpm add @platform-storage/react-native @react-native-async-storage/async-storage zod

# Install with Yarn
yarn add @platform-storage/react-native @react-native-async-storage/async-storage zod

# Install with Bun
bun add @platform-storage/react-native @react-native-async-storage/async-storage zod
```

For Expo, `npx expo install @react-native-async-storage/async-storage` picks the version your SDK was built against.

This package re-exports the whole `@platform-storage/core` API, so it is the only one you need from this project. Zod is one choice among many: any [Standard Schema](https://standardschema.dev) validator works.

AsyncStorage is an optional peer. This package never imports it, and any storage with its `getItem`, `setItem` and `removeItem` can stand in for it.

## Quick Start

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

## API Usage

Everything `@platform-storage/core` exports is available here too — `defineStorageSchema`, `defineKey`, `createStorage`, the errors and the guards. See [its README](https://github.com/SkorpionG/platform-storage/tree/main/packages/core#readme) for those. What follows is what this package adds.

### `createReactNativeStorage(options)`

Builds a storage over an AsyncStorage instance, with the adapter supplied for you.

**Parameters:**

- `options`: everything `createStorage` takes apart from `adapter`, plus the instance:
  - `schema: StorageSchema` — from `defineStorageSchema`. Required.
  - `asyncStorage: AsyncStorageLike` — the instance your application supplies. Required.
  - `name?: string` — what errors report. Defaults to `"AsyncStorage"`.
  - `serializer?: Serializer<string>` — replaces the JSON default. AsyncStorage transports strings, so the wire type is `string`.
  - `onInvalid?: "throw" | "fallback" | "remove" | callback` — the policy for keys that declare none. Defaults to `"fallback"`.
  - `onError?: (error: PlatformStorageError) => void` — called for every failure, thrown or handled.

**Returns:** `PlatformStorage<Definition>` — asynchronous only, with no synchronous half.

It is named for the platform rather than the backend because AsyncStorage exports a `createAsyncStorage` of its own, and two functions of that name in one file would be a trap.

```ts
const storage = createReactNativeStorage({
  schema,
  asyncStorage: AsyncStorage,
  onInvalid: "throw",
  onError: (error) => console.warn(error.code, error.message),
});
```

### `asyncStorageAdapter(asyncStorage, options?)`

The adapter the factory above is built from, for `createStorage` or anything else that takes an adapter.

**Parameters:**

- `asyncStorage: AsyncStorageLike` — the instance. Required.
- `options?`:
  - `name?: string` — what errors report. Defaults to `"AsyncStorage"`.

**Returns:** `StorageAdapter<string>`

AsyncStorage reports a missing key as `null`; the adapter maps that to `undefined`, because a schema may legitimately store `null` and the two cannot share a meaning.

### `AsyncStorageLike`

The part of AsyncStorage this package uses, declared structurally so no native module reaches your type graph:

```ts
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

A conformance test checks it against AsyncStorage's own declaration, so anything satisfying these three can stand in.

## Examples

### A storage shared by the whole app

```ts
// storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as z from "zod";
import { createReactNativeStorage, defineStorageSchema } from "@platform-storage/react-native";

export const storage = createReactNativeStorage({
  asyncStorage: AsyncStorage,
  schema: defineStorageSchema({
    theme: { schema: z.enum(["light", "dark", "system"]), default: "system" },
    visitCount: { schema: z.coerce.number().int().min(0), default: 0 },
    user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
  }),
});
```

```tsx
// App.tsx
import { useEffect, useState } from "react";
import { storage } from "./storage";

export function App() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">();

  useEffect(() => {
    void storage.get("theme").then(setTheme);
  }, []);

  return theme === undefined ? <Splash /> : <Shell theme={theme} />;
}
```

`@platform-storage/react` replaces that effect with `useAsyncStorageValue`, which also keeps "still loading" apart from "holds nothing".

### Standing in for AsyncStorage in a test

Nothing here imports a native module, so a plain object is enough:

```ts
import { createReactNativeStorage } from "@platform-storage/react-native";

function fakeAsyncStorage() {
  const entries = new Map<string, string>();

  return {
    getItem: (key: string) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key: string, value: string) => Promise.resolve(void entries.set(key, value)),
    removeItem: (key: string) => Promise.resolve(void entries.delete(key)),
  };
}

const storage = createReactNativeStorage({ schema, asyncStorage: fakeAsyncStorage() });
```

### Reading data an older release wrote

A value that no longer matches its schema falls back rather than breaking the read, and `onError` still sees it:

```ts
const storage = createReactNativeStorage({
  schema,
  asyncStorage: AsyncStorage,
  onError: (error) => reportToCrashlytics(error),
});

// Even if the device holds `{"id":"u1"}` from a version before `name` existed:
await storage.get("user"); // undefined, and onError saw a VALIDATION failure
```

## Why AsyncStorage is passed in

The storage instance is supplied by your application rather than imported here, so this package never pulls in a native module. It stays loadable under a test runner or on a server, and any compatible storage your app already uses can be handed over instead.

A call the storage rejects becomes `StorageAdapterError` with the rejection as its `cause`.

A device that has run out of room is **not** told apart here, unlike on the web and in an extension, where each platform names the case and the adapter raises `StorageQuotaExceededError` for it. What a full device produces depends on the native layer under AsyncStorage, and no signal means the same thing on both iOS and Android, so guessing from a message would be wrong more often than right. Such a failure arrives with the general `ADAPTER` code, and the rejection itself is still reachable through `cause`.

## One schema, every platform

A schema knows nothing about where it is stored, so the same one can back AsyncStorage here, `localStorage` on the web through `@platform-storage/web`, and a storage area in an extension through `@platform-storage/extension`.

## License

MIT © SkorpionG
