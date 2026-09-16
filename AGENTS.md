# AGENTS.md

Guide for agents and contributors working on `platform-storage`.

## What this is

A schema-first, type-safe, cross-platform key-value storage abstraction. You declare your storage once, and every read and write is validated at runtime and typed at compile time, whether the values live in `localStorage`, a browser extension's storage area, or React Native's AsyncStorage.

The repository is a pnpm + Turborepo monorepo. Adapters are thin; nearly all of the behavior lives in the core package.

## Package map

| Package                          | Holds                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `@platform-storage/core`         | Schema definition, type inference, validation, serialization, engine, errors      |
| `@platform-storage/web`          | The `localStorage` and `sessionStorage` adapters, and storage factories over them |
| `@platform-storage/extension`    | The `local`, `sync` and `session` area adapters, and a storage factory over them  |
| `@platform-storage/react-native` | The AsyncStorage adapter, and a storage factory over it                           |
| `@platform-storage/react`        | React hooks over any storage, and the server-safe declared read                   |
| `tooling/*`                      | Private, shared TypeScript, oxlint, vitest and formatting configuration           |
| `examples/*`                     | Demonstrations of the published packages. Every one is private and never released |

Every platform package depends only on core and re-exports it, so an application installs one package. Platform packages never depend on each other.

`@platform-storage/react` is not one of them. It exports hooks and nothing else, because a consumer already has a platform package for the schema and the errors, and it is installed alongside one rather than instead of one.

The demonstration apps have conventions, tooling and traps of their own, and [`examples/AGENTS.md`](examples/AGENTS.md) is where those live: how the three sharing layers work, why `tooling/typescript/react.json` and `tooling/oxlint/react.json` exist, what Tailwind has to be told about a sibling package, and how to run each app. Read it before changing anything under `examples/`.

## Commands

| Task              | Command                                             |
| ----------------- | --------------------------------------------------- |
| Install           | `pnpm install`                                      |
| Build             | `pnpm build`                                        |
| Typecheck         | `pnpm typecheck`                                    |
| Lint              | `pnpm lint` / `pnpm lint:fix`                       |
| Test              | `pnpm test`                                         |
| Coverage          | `pnpm test:coverage`                                |
| Format            | `pnpm format` / `pnpm format:check`                 |
| Comment wrapping  | `pnpm format:comments` / `pnpm format:comments:fix` |
| Packaging checks  | `pnpm check-package`                                |
| One package       | `pnpm --filter @platform-storage/core test`         |
| Watch one package | `pnpm --filter @platform-storage/core test:watch`   |
| Run an example    | See [`examples/AGENTS.md`](examples/AGENTS.md)      |
| Record a change   | `pnpm changeset`                                    |
| Version the set   | `pnpm version-packages`                             |
| Publish           | `pnpm release`                                      |

Root scripts only delegate to `turbo run`. Task logic belongs in the package that owns it, which is what lets turbo parallelize and cache per package.

## Conventions

### Code

- Functional and declarative. No classes, with one exception: `Error` subclasses, which have to be classes to be catchable by type.
- `interface` for object shapes, `type` for unions, aliases and mapped types.
- No TypeScript `enum`. Use an `as const` object plus a derived union type. oxlint has no rule for this, so it is on review to catch.
- Explicit types on everything exported. `explicit-function-return-type` is an error, and a public type is part of the contract.
- No `any`. `unknown` plus a narrowing check instead.
- Guard clauses and early returns over nesting.

### Prose is never hard-wrapped

In Markdown and in code comments, keep each paragraph and each list item on a single line. No line breaks inside a sentence or a paragraph. Wrapping is the editor's job, and a hard-wrapped paragraph makes a search miss any phrase split across two lines, while every small edit rewraps the rest of it into diff noise. This applies to commit messages too. Tables and fenced code blocks are unaffected, as is anything indented past the paragraph margin inside a comment.

`pnpm format:comments` reports every paragraph that wraps and `pnpm format:comments:fix` joins them. oxfmt does not format comment interiors and leaves Markdown prose as it finds it, so this pass owns them; `pnpm format` runs both.

### Spelling is American

`color`, `behavior`, `serialize`, `normalize`, `labeled`, `canceled`. Not `colour`, `behaviour`, `serialise`, `normalise`, `labelled`, `cancelled`. In prose, comments and identifiers alike, since the platform APIs this library wraps are spelled American themselves. No tool checks it; it is on review, the same way the ban on `enum` is.

### Comments

A comment says **why**, never what the code already says. State the rule, not the incident that produced it, and do not leave a comment describing an approach that was replaced: a reader cannot tell whether it documents the code or contradicts it. Avoid numbers that drift. Keep JSDoc on public API to what it guarantees and the one non-obvious reason it works that way.

### Tests

- **A test lives in a `tests/` folder beside the code it covers**: `src/schema/tests/define-key.test.ts` next to `src/schema/define-key.ts`. Moving or renaming a module takes its tests with it, and there is no parallel tree to keep in step.
- The package's own top-level `tests/` folder holds only what belongs to no single module: shared fixtures, shared fakes, and cross-cutting suites such as the one binding `STORAGE_OPERATION` to every interface that exposes an operation.
- Test files never ship: `files: ["dist"]` decides what is published, and the bundler only follows what the entry point imports.
- `*.test.ts` for runtime behavior, `*.test-d.ts` for type-level assertions with `expectTypeOf`. Both run under `pnpm test`; a type regression fails the build like any other bug.
- Active-voice test titles that name the behavior, such as "returns the default when no value is stored" rather than "test default".
- Fakes live in the package's top-level `tests/fakes/`, shared rather than redeclared per suite. Prefer a fake that behaves like the real backend (including its quirks, such as AsyncStorage returning `null`) over a mock.
- This library's whole purpose is surviving bad persisted data, so a change to read behavior needs a test that stores something invalid.

### Changes

Every user-facing change needs a changeset: `pnpm changeset`. All five published packages share one version, so a changeset on any of them versions the set. `RELEASING.md` covers when one is needed, what to write in it, and how to choose the bump.

Commits follow [Conventional Commits](https://www.conventionalcommits.org): a `type: subject` line in the imperative mood, and a body of bullet points where the change is worth explaining. The subject says what the commit does; each bullet says what changed and, where it is not obvious, why. Prose is not hard-wrapped here either, so a bullet stays on one line however long it runs.

## Boundaries

- **Never let a platform's own package reach a consumer.** `@types/chrome`, `@types/firefox-webext-browser`, `@types/webextension-polyfill` and `@react-native-async-storage/async-storage` are development dependencies used only by conformance tests. `src` declares the platform APIs it uses structurally. If a conformance test starts failing, the structural declaration has drifted from a real API and needs widening to the common denominator of all of them, not narrowing to one.
- **Core knows nothing about any platform.** It depends on the adapter contract and on Standard Schema, and imports no browser, Node or React Native API.
- **Core never imports a validation library at runtime.** Schemas are consumed through Standard Schema, so Zod, Valibot and ArkType all work and none is a dependency.
- **`demos/`, `.docs/` and `.specstory/` are local-only.** They are ignored by git and hold reference material and working notes. Never cite, name or copy from them in source, comments, documentation or commit messages.
- **`.agents/` and `.claude/` hold vendored skills.** They are committed but authored elsewhere, and the formatter ignores them. Do not edit them by hand.

## Design decisions worth knowing

These were settled deliberately. Reopen them with the maintainer rather than in passing.

- **Missing is `undefined`, never `null`.** A schema may legitimately store `null`, so `null` cannot also mean absence.
- **The API is asynchronous everywhere.** Adapters that can act synchronously additionally expose `getSync` and friends, unlocked at the type level, so application code can be written once and still support an SSR-safe synchronous read where the backend allows one.
- **Adapters own their serializer and their wire type.** Web and React Native transport strings; extension storage areas transport JSON values natively. Encoding a string for the latter would double-encode it, waste the `sync` quota, and break interoperability with data other code already wrote.
- **Values are stored bare, with no envelope.** What the backend holds is exactly what the schema produced, with nothing wrapped around it. `ROADMAP.md` records why that shape was chosen.
- **Invalid persisted data falls back by default.** The policy resolves per call, then per key, then per storage, then to `"fallback"`. It is not silent: the `onError` observer sees every failure. Use `onInvalid: "throw"` in tests and development.
- **`clear()` removes only the keys the schema declares.** It must never wipe an origin that other code shares.

## Releasing

Releases are published by hand from a maintainer's machine, and `RELEASING.md` is the procedure.

All five packages share one version through the `fixed` group in `.changeset/config.json`, so a changeset on any one of them versions and publishes the set. That is what keeps the `workspace:*` dependency between them resolvable at every version.

No package sets `publishConfig.provenance`, because npm issues a provenance statement only to a build running on a cloud CI provider: asking for one from a laptop fails the publish rather than skipping it. `.github/workflows/release.yml` is the optional path for a release that wants provenance, and it is manual-trigger only, so nothing publishes on its own.

## Deferred work

`ROADMAP.md` records what was cut from v0.1 and what each item needs. When scope is cut, add it there rather than leaving it in a conversation.

## Traps

Read the relevant one before changing something here that looks arbitrary, and add to the list when something proves expensive to work out.

### Types

- **A default type argument switches off contextual typing for that parameter.** Giving `defineKey` a default such as `const Options extends KeyOptions<Schema> = Record<never, never>` silently stops the options argument from being checked against the schema. There is a comment on the function saying so; it has no default, and it must not gain one.
- **A callback written inline in `defineStorageSchema` cannot be type-checked.** The object is inferred and then constrained against a type derived from itself, so the callback gets no expectation to meet and its literal return widens to `string`. `defineKey(schema, options)` is the checked form, because taking the schema as its own argument means it is known before the options are read. Splitting `onInvalid` into two fields does not help; nor does dropping `const`.
- **A constraint that inspects its own type parameter is rejected outright** as a circular constraint. `defineStorageSchema` gets away with it only because its conditional tests `Definition[Key]` rather than `Definition`.
- **Zod's `.catch()` takes the value type as its input, not `unknown`.** A catch schema therefore does not drop `undefined` from a read: it governs invalid data, not absent data. Pair it with a `default` to cover both.
- **`exactOptionalPropertyTypes` rejects assigning `undefined` to an optional property**, which is why public option types spell `| undefined` explicitly.
- TypeScript is pinned to the 6.x line. `latest` on npm is the Go-native 7.x port, which the declaration-emit and typecheck tooling here is not validated against.

### Platforms

- **Widen a structural declaration to the common denominator; narrow at the adapter instead.** The extension storage area's values stay `unknown` because the WebExtension polyfill declares them that way, and narrowing them to JSON values stops it conforming even though Chrome and Firefox still would. The one narrowing lives at the adapter's read boundary, where the schema validates the value straight afterwards.
- **`Reflect.get(globalThis, name)` reads a global as `unknown`** whatever type packages the compilation includes. That is what lets the extension resolver stay structural inside a package whose tests load `@types/chrome` and the Firefox declarations globally.
- **The web adapters read the storage off `window`, never `globalThis`.** Node exposes a `localStorage` of its own, and a server has to look unavailable so `withFallback` moves on rather than writing somewhere no browser will ever read.
- **Resolve a backend on every operation, never once at construction.** A storage is usually built while a module loads, long before anything reads from it, and in a context that may not have the backend yet. `requireBackend` is the shared way to do it.
- **A module importing a client-only React hook needs `"use client"`, even in a package no server ever renders.** Under the `react-server` condition `react` does not export `useState`, `useEffect` or `useSyncExternalStore` at all, so such a module fails to build the moment a Server Component reaches it through a barrel. `@examples/ui` splits on exactly this line: `controls.tsx` and `code-block.tsx` carry the directive and the presentational files deliberately do not, which is what lets a panel with no hooks in it render on a server.
- **An `Error` does not survive the Server Components boundary.** React's serialization substitutes its own error object for yours, so the subclass, the `code` and the brand are gone by the time a client component could read them. Read what is wanted while the error is still itself and hand a plain object across.
- **A storage built while a module loads is shared by every request that server handles.** Safe only where nothing writes during a render; an application that writes needs one built per request.
- **A `getSnapshot` handed to `useSyncExternalStore` has to return the same reference until something changes.** `getSync` deserializes on every call and a factory default answers fresh even for a key holding nothing, so a snapshot reading either straight through never settles and React stops the render with `Maximum update depth exceeded`. `@examples/web` caches against its revision counter, which is stable for exactly as long as nothing has written.

### Dependencies

- **Shared runtime code goes in core, never in a private package.** `tsdown` keeps dependencies external, so a platform bundle imports what it depends on rather than inlining it. A private `@tooling/*` package would be unresolvable for a consumer at install time, and bundling it instead would put a second copy inside every platform package. Core is already a dependency of all three platform packages and is re-exported by each.
- **Check a backend's own export names before naming a factory after it.** AsyncStorage exports a `createAsyncStorage` of its own, which is why the factory here is `createReactNativeStorage`, named for the platform the way `createExtensionStorage` is.
- **A development dependency drags its peers in.** pnpm installs missing peers automatically, and AsyncStorage's are React and the whole React Native toolchain, all for one type assertion. A scoped override in `pnpm-workspace.yaml`, of the form `"<package>>react": "-"`, drops them from that one parent's graph and leaves every other package's peers alone.

### Packaging

- **In-repo `exports` point at `src`; `publishConfig` swaps them for `dist` on publish.** That is what lets the editor, `tsc` and vitest resolve workspace packages to source while consumers get the build. It works only through `pnpm pack` and `pnpm publish`, never `npm pack`, because npm does not apply `publishConfig`.
- **A workspace package therefore reaches a bundler as source, and source transforms apply to it.** A consumer's build sees `dist` and treats it as a dependency; an app in this repository sees `src` at a path outside `node_modules`, so anything filtering on that path treats library code as its own. A framework transform that rewrites free identifiers is the case that bites, since library code is written against no such convention. Keep such a transform scoped to the app, never widened to make the library survive it; `examples/AGENTS.md` records the one that has happened.
- **Declaration maps are off deliberately.** They point at `src`, which `files` does not publish, so shipping them would hand every consumer a map to nothing. JavaScript source maps stay on.
- **A bundler emits `"use client"` only for a chunk whose own entry module carries it.** A directive on a module the entry merely re-exports is dropped, the build succeeds, and nothing warns; the package is then server code to every framework that reads the directive. `packages/react/src/index.ts` carries it for that reason, and a test asserts it is the first line. The rule under **Platforms** is the source-level counterpart, with a different fix.
- **Errors are identified by `code` and by brand, never by `instanceof`.** An application that resolves two copies of a package holds two copies of each class, and `instanceof` silently stops matching across them.

### Writing tests

- **Prove a new type assertion actually bites** by temporarily breaking the thing it guards. A `@ts-expect-error` case passes just as happily when it fails for a reason nobody intended.
- `expectTypeOf(fn).parameter(0)` resolves to `never` for a generic method. Assert against the schema type instead.
- `expect(fn).toThrow(expect.objectContaining({ ... }))` checks an error's own fields, so asserting on a synchronous throw needs no capture helper and no `expect.assertions` count.
- A `// @vitest-environment node` docblock at the top of one suite runs it without a DOM inside a package whose config is happy-dom. That is how the web package proves its server behavior without a second config.
- **A fake backend must be held in a variable, not built inside the source function.** Returning a fresh fake on every call sends a write and the following read to different backends, because the source really is called per operation.

### Linting and formatting

- **oxlint's `ignorePatterns` is not inherited through `extends`.** It only takes effect in the config a file actually resolves to, so it belongs in the root `.oxlintrc.json` rather than in `tooling/oxlint/base.json`. This hid for a long time because oxlint already skips anything gitignored, and every path the key named was gitignored; `.agents` is the first that is committed, and so the first where the key had to work.
- **A fixer that a git hook drives is handed paths, not asked to find them.** An exclusion applied only where a tool walks the tree is bypassed the moment lefthook passes `{staged_files}`, and for a rewriting tool that means editing files this repository does not author — which then conflicts with lefthook's stash of unstaged changes and leaves the commit unfinishable. `format-comments` applies its exclusions to both paths for that reason.

### Editor tooling

- **A `$schema` path inside a config file resolves against that file's own URI.** Opening one from git history therefore looks for the schema under `git:` and fails. The mapping lives in `.vscode/settings.json` under `json.schemas` instead, whose paths resolve against the workspace root, and points at the copy in `node_modules` so there is no version to keep in step.
