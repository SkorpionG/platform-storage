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
| `@platform-storage/extension`    | The WebExtension storage area and namespace shapes                                |
| `@platform-storage/react-native` | The AsyncStorage shape                                                            |
| `tooling/*`                      | Private, shared TypeScript, oxlint, vitest and formatting configuration           |

Every platform package depends only on core and re-exports it, so an application installs one package. Platform packages never depend on each other. The extension and React Native packages do not have their adapters yet; what each is to hold is in `ROADMAP.md`.

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
| Record a change   | `pnpm changeset`                                    |

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

Every user-facing change needs a changeset: `pnpm changeset`. All four published packages share one version, so a changeset on any of them versions the set.

Commits follow [Conventional Commits](https://www.conventionalcommits.org): a `type: subject` line in the imperative mood, and a body of bullet points where the change is worth explaining. The subject says what the commit does; each bullet says what changed and, where it is not obvious, why. Prose is not hard-wrapped here either, so a bullet stays on one line however long it runs.

## Boundaries

- **Never let a browser type package reach a consumer.** `@types/chrome`, `@types/firefox-webext-browser` and `@types/webextension-polyfill` are development dependencies used only by conformance tests. `src` declares the browser APIs it uses structurally. If a conformance test starts failing, the structural declaration has drifted from a real API and needs widening to the common denominator of all of them, not narrowing to one.
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

Nothing has been published. `.github/workflows/release.yml` runs on every push to `main`, and its first job checks for an `NPM_TOKEN` secret: without one the release job is skipped and the run reports why. Adding that secret is the single switch that turns publishing on, so the workflow needs no edit to stay off.

## Deferred work

`ROADMAP.md` records what was cut from v0.1 and what each item needs. When scope is cut, add it there rather than leaving it in a conversation.
