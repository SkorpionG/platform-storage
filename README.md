# platform-storage

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Schema-first, type-safe storage for every JavaScript platform.**

Define your storage once. Get validation, TypeScript inference and serialization from that one definition.

> These packages are not published to npm. `ROADMAP.md` records what is out of scope for the first release.

## The problem

Key-value storage APIs have no idea what you intend to keep in them. Every project ends up rebuilding the same scaffolding around them:

```ts
// Which keys are valid? What shape is this? Who else writes here?
const raw = localStorage.getItem("theme");
const theme = raw ? (JSON.parse(raw) as Theme) : "light";
```

That cast is a lie. The value may have been written by an older version of the app, edited by hand, synced from another device, or written by a different app on the same origin. TypeScript cannot see any of it, so the failure surfaces somewhere else entirely.

Then the same code is written again for the browser extension, and again for the mobile app, against three different APIs.

## The approach

One schema, one API, one adapter per platform.

```text
Application code
      ↓  typed get / set / remove
  createStorage(schema, adapter)
      ↓  physical key, wire value
  StorageAdapter
```

- **One source of truth.** A schema maps each logical key to its validation schema, its physical storage key, and its default.
- **Typed keys and values.** Both come from the schema. Your editor completes the keys; a wrong value is a compile error.
- **Validated at the boundary.** Data is checked on the way in and on the way out, because persisted data outlives the code that wrote it.
- **Honest about platforms.** An adapter exposes what its backend can actually do, rather than pretending every backend is the same.

## Example

```ts
import * as z from "zod";
import { createStorage, defineStorageSchema, memoryAdapter } from "@platform-storage/core";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createStorage({ schema, adapter: memoryAdapter() });

await storage.set("theme", "dark");

const theme = await storage.get("theme"); // "light" | "dark"
const user = await storage.get("user"); // { id: string; name: string } | undefined
```

`theme` has no `undefined` in its type because the key declares a default. `user` does, because nothing answers for it when the backend holds nothing.

A value that fails validation on the way out does not break the read: by default it falls back to the key's default, and the `onError` observer sees the failure. Pass `onInvalid: "throw"` per call, per key, or per storage to get the strict behaviour instead.

## Packages

| Package                          | Holds                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| `@platform-storage/core`         | The schema API, the storage engine, the adapter contract, the errors       |
| `@platform-storage/web`          | Re-exports core, and adds the `localStorage` and `sessionStorage` adapters |
| `@platform-storage/extension`    | Re-exports core, and adds the `local`, `sync` and `session` area adapters  |
| `@platform-storage/react-native` | Re-exports core, and declares the AsyncStorage shape                       |

Every platform package re-exports the whole core API, so an application installs one package. The web package serves anything with the Web Storage API, an Electron renderer process included.

## Validation library

Schemas are consumed through [Standard Schema](https://standardschema.dev), so Zod, Valibot, ArkType and anything else implementing the specification all work. None of them is a dependency of this project, and core imports no validation library at runtime.

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

Conventions, boundaries and the settled design decisions are in [AGENTS.md](AGENTS.md).

## License

MIT © SkorpionG
