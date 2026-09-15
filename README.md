# platform-storage

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Schema-first, type-safe storage for every JavaScript platform.**

Declare what your app stores, once. Every read and write is then validated at runtime and typed at compile time, whether the values live in `localStorage`, a browser extension's storage area, or React Native's AsyncStorage.

## Install

One package per platform. Each re-exports the whole core API, so it is the only one you need.

```sh
npm install @platform-storage/web            # localStorage, sessionStorage, Electron renderers
npm install @platform-storage/extension      # browser extensions: local, sync, session
npm install @platform-storage/react-native   # React Native and Expo, via AsyncStorage
```

Add a [Standard Schema](https://standardschema.dev) validation library such as Zod alongside it.

Using React? Add the hooks beside whichever of those you installed. They are not a platform package and do not replace one.

```sh
npm install @platform-storage/react
```

## Example

```ts
import * as z from "zod";
import { createLocalStorage, defineStorageSchema } from "@platform-storage/web";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createLocalStorage({ schema });

await storage.set("theme", "dark");

const theme = await storage.get("theme"); // "light" | "dark"
const user = await storage.get("user"); // { id: string; name: string } | undefined
```

`theme` has no `undefined` in its type because the key declares a default. `user` does, because nothing answers for it when the backend holds nothing.

Switching platform means switching the import. The schema does not change:

```ts
import { createExtensionStorage } from "@platform-storage/extension";

const storage = createExtensionStorage({ schema, area: "sync" });
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

## What you get

- **One source of truth.** A schema maps each logical key to its validation schema, the key its backend stores under, and its default. Keys and value types are both inferred from it.
- **Validated at the boundary.** Data is checked on the way in and on the way out, because persisted data outlives the code that wrote it.
- **A read that survives bad data.** A value that no longer matches its schema falls back to the key's default instead of breaking the read, and an `onError` observer sees every failure. Choose `"throw"` per call, per key, or per storage when you would rather know loudly.
- **Synchronous reads where the platform allows.** Web storage answers immediately, so those storages also expose `getSync` and friends, typed so they are simply absent elsewhere.
- **Honest about platforms.** An adapter exposes what its backend can actually do, rather than pretending every backend is the same. A missing backend is reported, never a crash.
- **`clear()` that only clears yours.** It removes the keys your schema declares and nothing else on the origin.

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
```

Conventions, boundaries, the settled design decisions and the traps worth knowing are in [AGENTS.md](AGENTS.md). The release process is in [RELEASING.md](RELEASING.md).

## License

MIT © SkorpionG
