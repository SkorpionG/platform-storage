# AGENTS.md

Guide for the five published packages. Everything in [the repository guide](../AGENTS.md) still applies; this file covers only what is true of library code, and is where to record anything learned here that the next person would otherwise work out again.

## The packages

| Package                          | Holds                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `@platform-storage/core`         | Schema definition, type inference, validation, serialization, engine, errors      |
| `@platform-storage/web`          | The `localStorage` and `sessionStorage` adapters, and storage factories over them |
| `@platform-storage/extension`    | The `local`, `sync` and `session` area adapters, and a storage factory over them  |
| `@platform-storage/react-native` | The AsyncStorage adapter, and a storage factory over it                           |
| `@platform-storage/react`        | React hooks over any storage, and the server-safe declared read                   |

Every platform package depends only on core and re-exports it, so an application installs one package. Platform packages never depend on each other.

`@platform-storage/react` is not one of them. It exports hooks and nothing else, because a consumer already has a platform package for the schema and the errors, and it is installed alongside one rather than instead of one.

Adapters are thin. Nearly all of the behavior lives in core, which is what keeps the platforms consistent with each other.

## Boundaries

- **Never let a platform's own package reach a consumer.** `@types/chrome`, `@types/firefox-webext-browser`, `@types/webextension-polyfill` and `@react-native-async-storage/async-storage` are development dependencies used only by conformance tests. `src` declares the platform APIs it uses structurally. If a conformance test starts failing, the structural declaration has drifted from a real API and needs widening to the common denominator of all of them, not narrowing to one.
- **Core knows nothing about any platform.** It depends on the adapter contract and on Standard Schema, and imports no browser, Node or React Native API.
- **Core never imports a validation library at runtime.** Schemas are consumed through Standard Schema, so Zod, Valibot and ArkType all work and none is a dependency.
- **Shared runtime code goes in core, never in a private package.** `tsdown` keeps dependencies external, so a platform bundle imports what it depends on rather than inlining it. A private `@tooling/*` package would be unresolvable for a consumer at install time, and bundling it instead would put a second copy inside every platform package. Core is already a dependency of all three platform packages and is re-exported by each.

## Design decisions worth knowing

These were settled deliberately. Reopen them with the maintainer rather than in passing.

- **Missing is `undefined`, never `null`.** A schema may legitimately store `null`, so `null` cannot also mean absence.
- **The API is asynchronous everywhere.** Adapters that can act synchronously additionally expose `getSync` and friends, unlocked at the type level, so application code can be written once and still support an SSR-safe synchronous read where the backend allows one.
- **Adapters own their serializer and their wire type.** Web and React Native transport strings; extension storage areas transport JSON values natively. Encoding a string for the latter would double-encode it, waste the `sync` quota, and break interoperability with data other code already wrote.
- **Values are stored bare, with no envelope.** What the backend holds is exactly what the schema produced, with nothing wrapped around it. `ROADMAP.md` records why that shape was chosen.
- **Invalid persisted data falls back by default.** The policy resolves per call, then per key, then per storage, then to `"fallback"`. It is not silent: the `onError` observer sees every failure. Use `onInvalid: "throw"` in tests and development.
- **`clear()` removes only the keys the schema declares.** It must never wipe an origin that other code shares.
- **Errors are identified by `code` and by brand, never by `instanceof`.** An application that resolves two copies of a package holds two copies of each class, and `instanceof` silently stops matching across them.
- **Check a backend's own export names before naming a factory after it.** AsyncStorage exports a `createAsyncStorage` of its own, which is why the factory here is `createReactNativeStorage`, named for the platform the way `createExtensionStorage` is.

## Tests

- **A test lives in a `tests/` folder beside the code it covers**: `src/schema/tests/define-key.test.ts` next to `src/schema/define-key.ts`. Moving or renaming a module takes its tests with it, and there is no parallel tree to keep in step.
- **Every module with runtime behavior has a suite named for it**, whether or not the entry point publishes it. An internal module such as `src/storage/pipeline.ts` is covered directly rather than only through whatever calls it, because a suite reached through the engine tests the engine's use of it and not the module's own contract.
- **A module that declares only types gets a `*.test-d.ts` instead, or nothing.** Nothing is the right answer where the compiler already proves the whole of what the module says; a `.test-d.ts` is worth writing where a type encodes a rule, such as a union derived from a constant or a conditional result type.
- **Every published entry point has an `index.test-d.ts`** asserting what it exports, and asserting that the engine internals stay unpublished. That second half is what keeps an accidental `export *` from freezing an internal into the contract.
- The package's own top-level `tests/` folder holds only what belongs to no single module: shared fixtures, shared fakes, and cross-cutting suites such as the one binding `STORAGE_OPERATION` to every interface that exposes an operation, or the one covering the synchronous half across adapters and schemas alike.
- Test files never ship: `files: ["dist"]` decides what is published, and the bundler only follows what the entry point imports.
- `*.test.ts` for runtime behavior, `*.test-d.ts` for type-level assertions with `expectTypeOf`. Both run under `pnpm test`; a type regression fails the build like any other bug.
- Active-voice test titles that name the behavior, such as "returns the default when no value is stored" rather than "test default".
- Fakes live in the package's top-level `tests/fakes/`, shared rather than redeclared per suite. Prefer a fake that behaves like the real backend (including its quirks, such as AsyncStorage returning `null`) over a mock.
- This library's whole purpose is surviving bad persisted data, so a change to read behavior needs a test that stores something invalid.

## Traps

Read the relevant one before changing something here that looks arbitrary, and add to the list when something proves expensive to work out. Repository-wide traps live in [the repository guide](../AGENTS.md).

### Types

- **A default type argument switches off contextual typing for that parameter.** Giving `defineKey` a default such as `const Options extends KeyOptions<Schema> = Record<never, never>` silently stops the options argument from being checked against the schema. There is a comment on the function saying so; it has no default, and it must not gain one.
- **A callback written inline in `defineStorageSchema` cannot be type-checked.** The object is inferred and then constrained against a type derived from itself, so the callback gets no expectation to meet and its literal return widens to `string`. `defineKey(schema, options)` is the checked form, because taking the schema as its own argument means it is known before the options are read. Splitting `onInvalid` into two fields does not help; nor does dropping `const`.
- **A constraint that inspects its own type parameter is rejected outright** as a circular constraint. `defineStorageSchema` gets away with it only because its conditional tests `Definition[Key]` rather than `Definition`.
- **Zod's `.catch()` takes the value type as its input, not `unknown`.** A catch schema therefore does not drop `undefined` from a read: it governs invalid data, not absent data. Pair it with a `default` to cover both.
- **`exactOptionalPropertyTypes` rejects assigning `undefined` to an optional property**, which is why public option types spell `| undefined` explicitly.
- **`erasableSyntaxOnly` is what keeps the codebase functional**, not review. It rejects every construct that emits runtime code from a type position, which is the whole of the `enum` rule and more besides. Prove a change to it still bites by adding an `enum` and watching the build fail.
- **`noPropertyAccessFromIndexSignature` means a record is read with a bracket**, so `record["self"]` rather than `record.self` wherever the key is not declared. It reads worse and is worth it: dotted access to a key nothing declares is how a typo becomes `undefined` at runtime.
- `noImplicitReturns` and `noUncheckedSideEffectImports` are on as well, and neither has ever fired here; they are guards rather than corrections.
- TypeScript is pinned to the 6.x line. `latest` on npm is the Go-native 7.x port, which the declaration-emit and typecheck tooling here is not validated against.

### Platforms

- **Widen a structural declaration to the common denominator; narrow at the adapter instead.** The extension storage area's values stay `unknown` because the WebExtension polyfill declares them that way, and narrowing them to JSON values stops it conforming even though Chrome and Firefox still would. The one narrowing lives at the adapter's read boundary, where the schema validates the value straight afterwards.
- **`Reflect.get(globalThis, name)` reads a global as `unknown`** whatever type packages the compilation includes. That is what lets the extension resolver stay structural inside a package whose tests load `@types/chrome` and the Firefox declarations globally.
- **The web adapters read the storage off `window`, never `globalThis`.** Node exposes a `localStorage` of its own, and a server has to look unavailable so `withFallback` moves on rather than writing somewhere no browser will ever read.
- **Resolve a backend on every operation, never once at construction.** A storage is usually built while a module loads, long before anything reads from it, and in a context that may not have the backend yet. `requireBackend` is the shared way to do it.
- **Browsers agree on the full-origin error, and older ones did not.** Current Chromium, Firefox and WebKit all raise `QuotaExceededError` with code 22, checked by hand against all three. The older Firefox name and the legacy codes stay recognized for the browsers that still send them.
- **A module importing a client-only React hook needs `"use client"`, even in a package no server ever renders.** Under the `react-server` condition `react` does not export `useState`, `useEffect` or `useSyncExternalStore` at all, so such a module fails to build the moment a Server Component reaches it through a barrel.
- **An `Error` does not survive the Server Components boundary.** React's serialization substitutes its own error object for yours, so the subclass, the `code` and the brand are gone by the time a client component could read them. Read what is wanted while the error is still itself and hand a plain object across.
- **A storage built while a module loads is shared by every request that server handles.** Safe only where nothing writes during a render; an application that writes needs one built per request.
- **A `getSnapshot` handed to `useSyncExternalStore` has to return the same reference until something changes.** `getSync` deserializes on every call and a factory default answers fresh even for a key holding nothing, so a snapshot reading either straight through never settles and React stops the render with `Maximum update depth exceeded`.

### Packaging

- **In-repo `exports` point at `src`; `publishConfig` swaps them for `dist` on publish.** That is what lets the editor, `tsc` and vitest resolve workspace packages to source while consumers get the build. It works only through `pnpm pack` and `pnpm publish`, never `npm pack`, because npm does not apply `publishConfig`.
- **Nothing in this repository consumes the built packages, so `pnpm verify-tarballs` is what does.** Every example resolves `workspace:*` to source, which means a broken `exports` map, a missing subpath or a declaration that vanishes under `node16` passes the whole suite. That script builds and packs all five, installs them with npm into a throwaway project, and imports, requires and typechecks against them. `publint` and `attw` read a tarball; this one runs it. CI runs it on a push to `main`, and `RELEASING.md` requires it before a release.
- **pnpm puts the workspace-root `LICENSE` into every package tarball**, so no package needs a copy of its own. `README.md`, `LICENSE`, `package.json` and `CHANGELOG.md` are included whatever `files` says, but only when they are in the package directory — and the license is the one that is not.
- **A workspace package reaches a bundler as source, and source transforms apply to it.** A consumer's build sees `dist` and treats it as a dependency; an app in this repository sees `src` at a path outside `node_modules`, so anything filtering on that path treats library code as its own. A framework transform that rewrites free identifiers is the case that bites, since library code is written against no such convention. Keep such a transform scoped to the app; `examples/AGENTS.md` records the one that has happened.
- **Declaration maps are off deliberately.** They point at `src`, which `files` does not publish, so shipping them would hand every consumer a map to nothing. JavaScript source maps stay on.
- **A bundler emits `"use client"` only for a chunk whose own entry module carries it.** A directive on a module the entry merely re-exports is dropped, the build succeeds, and nothing warns; the package is then server code to every framework that reads the directive. `packages/react/src/index.ts` carries it for that reason, and a test asserts it is the first line. The rule under **Platforms** is the source-level counterpart, with a different fix.

### Writing tests

- **Prove a new type assertion actually bites** by temporarily breaking the thing it guards. A `@ts-expect-error` case passes just as happily when it fails for a reason nobody intended.
- `expectTypeOf(fn).parameter(0)` resolves to `never` for a generic method. Assert against the schema type instead.
- `expect(fn).toThrow(expect.objectContaining({ ... }))` checks an error's own fields, so asserting on a synchronous throw needs no capture helper and no `expect.assertions` count.
- A `// @vitest-environment node` docblock at the top of one suite runs it without a DOM inside a package whose config is happy-dom. That is how the web package proves its server behavior without a second config.
- **A fake backend must be held in a variable, not built inside the source function.** Returning a fresh fake on every call sends a write and the following read to different backends, because the source really is called per operation.
