# platform-storage

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Schema-first, type-safe storage for every JavaScript platform.**

Declare what your app stores, once. Every read and write is then validated at runtime and typed at compile time, whether the values live in `localStorage`, a browser extension's storage area, or React Native's AsyncStorage.

## Installation

One package per platform. Each re-exports the whole core API, so it is the only one you need.

| Platform                                 | Package                          |
| ---------------------------------------- | -------------------------------- |
| Browsers and Electron renderers          | `@platform-storage/web`          |
| Browser extensions, Chromium and Firefox | `@platform-storage/extension`    |
| React Native and Expo                    | `@platform-storage/react-native` |

```sh
npm install @platform-storage/web zod
```

```sh
pnpm add @platform-storage/web zod
```

```sh
yarn add @platform-storage/web zod
```

```sh
bun add @platform-storage/web zod
```

Zod is one choice among many: any [Standard Schema](https://standardschema.dev) validator works, and none of them is a dependency of this project. Swap in Valibot or ArkType if you prefer.

Using React? Add the hooks beside whichever platform package you installed. They are not a platform package and do not replace one.

```sh
npm install @platform-storage/react
```

## Quick Start

```ts
import * as z from "zod";
import { createLocalStorage, defineStorageSchema } from "@platform-storage/web";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createLocalStorage({ schema });

await storage.set("theme", "dark"); // ✅
await storage.set("theme", "blue"); // ❌ Type error

const theme = await storage.get("theme"); // "light" | "dark"
const user = await storage.get("user"); // { id: string; name: string } | undefined
```

`theme` has no `undefined` in its type because the key declares a default. `user` does, because nothing answers for it when the backend holds nothing.

## Features

### 1. Typed keys and values, from one declaration

The schema is the single source of truth. Keys autocomplete, values are checked against the validator you wrote, and nothing is restated at a call site.

```ts
await storage.get("theme"); // ✅ "light" | "dark"
await storage.get("them"); // ❌ Type error: not a declared key
await storage.set("user", { id: "u1" }); // ❌ Type error: `name` is missing
```

### 2. Validated on the way in and on the way out

Persisted data outlives the code that wrote it. A value may have been written by an older release, edited by hand in devtools, synced from another device, or written by different code on the same origin — so it is checked when it comes back, not only when it goes in.

```ts
localStorage.setItem("theme", '"solarized"'); // something else wrote this

await storage.get("theme"); // "light" — the declared default, not a crash
```

### 3. A read that survives bad data, without being silent

A value that no longer matches its schema falls back to the key's default rather than breaking the read. The `onError` observer still sees every failure, so nothing is swallowed. Choose `"throw"` when you would rather know loudly — per call, per key, or per storage.

```ts
const storage = createLocalStorage({
  schema,
  onError: (error) => console.warn(error.code, error.message),
});

await storage.get("theme", { onInvalid: "throw" }); // rejects instead of falling back
```

### 4. Synchronous reads where the platform allows one

Web storage answers immediately, so those storages also expose `getSync` and its siblings — which is what lets a first render paint a stored value with no loading state. On a platform that can only answer later, those methods are simply absent from the type.

```ts
const theme = storage.getSync("theme"); // "light" | "dark", no await

const area = createExtensionStorage({ schema });
area.getSync("theme"); // ❌ Type error: an area only ever answers later
```

### 5. One schema, every platform

Switching platform means switching the import. The schema module itself has no DOM types and does not change.

```ts
import { createExtensionStorage } from "@platform-storage/extension";
import { createReactNativeStorage } from "@platform-storage/react-native";

const synced = createExtensionStorage({ schema, area: "sync" });
const onDevice = createReactNativeStorage({ schema, asyncStorage: AsyncStorage });
```

### 6. `clear()` that only clears yours

An origin is shared. `clear()` removes the keys your schema declares and nothing else, so another library's data, another storage's data, and a token written by something else all survive.

```ts
localStorage.setItem("analytics:session", "abc");

await storage.clear();

localStorage.getItem("analytics:session"); // "abc" — untouched
```

### 7. Errors you can branch on

Every failure carries a stable `code`. Branch on that rather than on the class, because an application that resolves two copies of a package holds two copies of each class and `instanceof` quietly stops matching across them.

```ts
import { isStorageQuotaError } from "@platform-storage/web";

try {
  await storage.set("recentSearches", next);
} catch (error) {
  if (!isStorageQuotaError(error)) throw error;
  await storage.set("recentSearches", next.slice(-10)); // evict and retry
}
```

## Why

Key-value storage APIs have no idea what you intend to keep in them, so every project rebuilds the same scaffolding:

```ts
// Which keys are valid? What shape is this? Who else writes here?
const raw = localStorage.getItem("theme");
const theme = raw ? (JSON.parse(raw) as Theme) : "light";
```

That cast is a lie. The value may have been written by an older version of the app, edited by hand, synced from another device, or written by different code on the same origin. TypeScript cannot see any of it, so the failure surfaces somewhere else entirely.

Then the same code gets written again for the browser extension, and again for the mobile app, against three different APIs.

## Packages

| Package                                                   | Holds                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`@platform-storage/core`](packages/core)                 | The schema API, the storage engine, the adapter contract, the errors   |
| [`@platform-storage/web`](packages/web)                   | The `localStorage` and `sessionStorage` adapters                       |
| [`@platform-storage/extension`](packages/extension)       | The `local`, `sync` and `session` area adapters                        |
| [`@platform-storage/react-native`](packages/react-native) | The AsyncStorage adapter                                               |
| [`@platform-storage/react`](packages/react)               | React hooks over any of them, on the client and across a server render |

Install core directly only when you are writing your own adapter. Each package's README documents what it adds; [`packages/core`](packages/core) documents the API they all share.

## Validation library

> [!NOTE]
> You may use any [Standard Schema](https://github.com/standard-schema/standard-schema) compliant validator of your choice.

Schemas are consumed through the specification rather than through any one library, so [every validator that implements the spec](https://github.com/standard-schema/standard-schema?tab=readme-ov-file#what-schema-libraries-implement-the-spec) works here, Zod, Valibot and ArkType among them. None of them is a dependency of this project, and core imports no validation library at runtime: the one you already use is the one that runs.

Your validator's own features carry through without being restated. `z.number().default(0)` answers for a key that holds nothing, and `z.enum(["light", "dark"]).catch("light")` absorbs a value that no longer matches, both directly from the schema.

> [!IMPORTANT]
> A schema has to accept its own output as input, because storage is a loop: what a write validates and stores is what the next read validates again. Nearly every schema qualifies. `z.string()`, `z.enum()` and `z.object()` each return what they took, and `z.coerce.number()` accepts anything at all. A one-way transform does not: `z.string().transform(Number)` produces a number that its own schema would reject. Since `set` is typed to the value a key holds, passing that number is exactly what the types ask for, and validation then refuses it with `StorageValidationError`. Reach for `z.coerce.number()`, which accepts both sides; [`ROADMAP.md`](ROADMAP.md) tracks the per-key serializers that would lift the restriction.

## Development

```sh
pnpm install
pnpm build         # every package
pnpm test          # runtime and type-level tests
pnpm typecheck
pnpm lint
pnpm format
pnpm check-package # publint and Are The Types Wrong, on the packed tarballs
pnpm changeset     # record a user-facing change
```

`examples/` holds a working application per platform — a Vite browser app, a Next.js server-rendered one, a WXT browser extension and an Expo app — each built on the same schema module, so a change can be seen running rather than only tested. [`examples/AGENTS.md`](examples/AGENTS.md) says how to run each one.

Conventions, boundaries, the settled design decisions and the traps worth knowing are in [AGENTS.md](AGENTS.md). What is deliberately deferred is in [ROADMAP.md](ROADMAP.md), and the release process is in [RELEASING.md](RELEASING.md).

## License

MIT © SkorpionG
