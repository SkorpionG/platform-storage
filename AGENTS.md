# AGENTS.md

Guide for agents and contributors working on `platform-storage`. This file holds what applies to the whole repository. Two others go deeper:

- [`packages/AGENTS.md`](packages/AGENTS.md) — the five published packages: what each one is, the boundaries between them, the settled API decisions, and the traps that only apply to library code.
- [`examples/AGENTS.md`](examples/AGENTS.md) — the demonstration apps: how they share code, the tooling they need, and how to run each one.

Read the matching one before changing anything under `packages/` or `examples/`.

## What this is

A schema-first, type-safe, cross-platform key-value storage abstraction. You declare your storage once, and every read and write is validated at runtime and typed at compile time, whether the values live in `localStorage`, a browser extension's storage area, or React Native's AsyncStorage.

The repository is a pnpm + Turborepo monorepo. Adapters are thin; nearly all of the behavior lives in the core package.

## Where things live

| Path        | Holds                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| `packages/` | The five published packages. One core, three platform adapters, one for React  |
| `examples/` | Demonstration apps. Every one is private and never released                    |
| `tooling/`  | Shared TypeScript, oxlint, vitest and formatting config, and workspace scripts |

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
| API documentation | `pnpm check-docs`                                   |
| Unused code       | `pnpm knip` / `pnpm knip:production`                |
| Consumer check    | `pnpm verify-tarballs`                              |
| One package       | `pnpm --filter @platform-storage/core test`         |
| Watch one package | `pnpm --filter @platform-storage/core test:watch`   |
| Run an example    | See [`examples/AGENTS.md`](examples/AGENTS.md)      |
| Record a change   | `pnpm changeset`                                    |
| Version the set   | `pnpm version-packages`                             |
| Publish           | `pnpm release`                                      |

Root scripts only delegate to `turbo run`. Task logic belongs in the package that owns it, which is what lets turbo parallelize and cache per package. The exceptions are the tools that read the whole workspace in one pass — the formatters, knip and `check-docs` — which have no per-package task to delegate to.

## Code

- Functional and declarative. No classes, with one exception: `Error` subclasses, which have to be classes to be catchable by type.
- `interface` for object shapes, `type` for unions, aliases and mapped types.
- No TypeScript `enum`. Use an `as const` object plus a derived union type. `erasableSyntaxOnly` is what enforces this: everything here has to erase to nothing at runtime, which rules out `enum`, a value-bearing `namespace`, a parameter property and `import =`.
- Explicit types on everything exported. `explicit-function-return-type` is an error, and a public type is part of the contract.
- No `any`. `unknown` plus a narrowing check instead.
- Guard clauses and early returns over nesting.

## Writing

Everything below applies to Markdown, code comments and commit messages alike.

- **Prose is never hard-wrapped.** Keep each paragraph and each list item on one line. Wrapping is the editor's job: a hard-wrapped paragraph makes a search miss any phrase split across two lines, and every small edit rewraps the rest into diff noise. Tables and fenced code blocks are unaffected, as is anything indented past the paragraph margin inside a comment. `pnpm format:comments` reports what wraps and `pnpm format:comments:fix` joins it; oxfmt leaves comment interiors and Markdown prose alone, so that pass owns them.
- **Spelling is American.** `color`, `behavior`, `serialize`, `normalize`, `labeled`, `canceled`. In prose, comments and identifiers alike, since the platform APIs this library wraps are spelled that way themselves. No tool checks it.
- **Say the thing, then stop.** Lead with what something is, not how it works. Link to a specification or to MDN rather than explaining it — a comment that teaches the platform has stopped being a comment.
- **One reason per paragraph, and a paragraph is a few sentences.** A comment earns its length by the number of reasons it gives, not by how thoroughly it gives one. When a second reason arrives, start a new paragraph. If a paragraph runs past roughly four lines on screen, it is doing more than one job.
- **A comment says why, never what the code already says.** State the rule, not the incident that produced it, and never leave a comment describing an approach that was replaced: a reader cannot tell whether it documents the code or contradicts it. Avoid numbers that drift.

### Documenting the public API

Every value a package entry point exports carries the same block: a one-line summary, a short paragraph of why, then the tags. `pnpm check-docs` enforces it, so drift fails CI rather than review.

````ts
/**
 * A storage over `localStorage`.
 *
 * Web storage answers immediately, so the result carries the synchronous half as well: a first render can read `getSync` without a loading state.
 *
 * @param options - The `schema`, and optionally `onInvalid` and `onError`. The adapter is supplied for you.
 * @returns A storage carrying both halves of the API.
 * @example
 * ```ts
 * const storage = createLocalStorage({ schema });
 *
 * await storage.set("theme", "dark");
 * const theme = storage.getSync("theme");
 * ```
 */
````

- `@param` for every parameter, saying what it is and what happens when it is left out. `@returns` for anything that returns a value; a constructor needs none. `@throws` where a caller can trigger one. `@example` always, and short — one call, not a tour.
- Examples across the packages read as one set: the same `schema`, the same key names. A reader moving between two of them should not have to learn a new cast of characters.
- A type or an interface needs the description alone.
- **The README entry and the doc block have to agree.** Both are the contract, and neither is a summary of the other. Change one and change the other in the same commit.

### Documenting everything else

An internal module gets a one-line block, or a short paragraph where the reason is not obvious. No tags and no example: the reader is already in the file.

```ts
/** Names the key in a message, and the physical key too when the two differ. */
```

## Commits and changesets

Every user-facing change needs a changeset: `pnpm changeset`. All five published packages share one version, so a changeset on any of them versions the set. `RELEASING.md` covers when one is needed and how to choose the bump.

Commits follow [Conventional Commits](https://www.conventionalcommits.org): a `type: subject` line in the imperative mood, then a body of bullets.

- One bullet per change, one line each, and as short as it can be while still saying something. A long list of short bullets reads far better than a short list of long ones.
- Say what changed, and why only where the why is not obvious from the what.
- Group under `Adds:` and `Fixes:` only when a commit does both, or when the list runs past roughly eight bullets. A single-purpose commit takes a flat list.
- Never name a gitignored file.

```text
fix(web): recognize every quota shape

- Add the two legacy numeric codes, 22 and 1014.
- Keep the older Firefox name alongside the standard one.
- Assert each shape in the adapter tests.
```

```text
chore: prepare the release metadata

Adds:

- A CI badge in the root README.
- The same base keywords on every package.

Fixes:

- `RELEASING.md` said CI skips the tarball check. It runs on every push to `main`.
```

## Things to note

Read the relevant one before changing something that looks arbitrary, and add to the list when something proves expensive to work out. Library-only traps live in [`packages/AGENTS.md`](packages/AGENTS.md).

### What is committed and what is not

- **`demos/`, `.docs/` and `.specstory/` are local-only.** They are ignored by git and hold reference material and working notes. Never cite, name or copy from them in source, comments, documentation or commit messages.
- **`.agents/` and `.claude/` hold vendored skills.** They are committed but authored elsewhere, and the formatter ignores them. Do not edit them by hand.

### Workspace dependencies

- **A development dependency drags its peers in.** pnpm installs missing peers automatically, and AsyncStorage's are React and the whole React Native toolchain, all for one type assertion. An override in `pnpm-workspace.yaml`, of the form `"<package>>react": "-"`, drops them.
- **That override matches its parent by name, so it needs a version too.** It rewrites the named package's manifest for **every** consumer, not only the one that wanted the peer gone — so once a real application depends on the same package, the peer it genuinely needs is missing and resolves only through pnpm's implicit hoisting. Write the selector as `"<package>@<range>>react": "-"` and the two copies stay independent. `examples/AGENTS.md` records the case that caught it.

### Linting and formatting

- **oxlint's `ignorePatterns` is not inherited through `extends`.** It only takes effect in the config a file actually resolves to, so it belongs in the root `.oxlintrc.json` rather than in `tooling/oxlint/base.json`. This hid for a long time because oxlint already skips anything gitignored, and every path the key named was gitignored; `.agents` is the first that is committed, and so the first where the key had to work.
- **A comment matcher has to exclude the triple slash.** `format-comments` matched `//` and treated the third slash of a `/// <reference … />` directive as content, rewrapping it into `// / <reference … />` and silently destroying it. Nothing warns, because the result is still a valid comment. Its matchers use `\/\/(?!\/)` for that reason.
- **A bulleted list inside a blockquote gets joined into one line.** `format-comments` reads consecutive `>` lines as one wrapped paragraph, so a `> - …` list comes back as a single bullet and the list is gone. Keep a callout to prose, and put the list after it.
- **A workspace script writes with `process.stdout.write`, not `console`.** `no-console` is on everywhere, including `tooling/`, and a script that reports to a terminal is not an exception worth carving out.
- **knip runs twice, and the second run is the one that protects consumers.** `pnpm knip` covers the whole workspace, tests included. `pnpm knip:production` checks only the published packages' shipped code, in strict mode, against `dependencies` alone, so a package cannot import something only its `devDependencies` provide. Strict is scoped to `@platform-storage/*` because a bundled example app correctly keeps its build tools in `devDependencies`.
- **Strict mode reads the build, so `knip:production` builds first.** A type-only import counts as a published dependency only if the built declarations carry it, and knip finds those by following `publishConfig.types` into `dist`. With no build it sees no published types and reports a genuine dependency such as `@standard-schema/spec` as unused. That is also why the commit hook runs only the default mode, and CI runs this one after its build.
- **knip cannot see two things here, and `knip.jsonc` tells it.** Vitest reads type-level suites from `typecheck.include`, which the plugin does not follow, so `*.test-d.ts` files are named as entries. And every package extends the oxlint config by relative path, so `@tooling/oxlint-config` looks unused while being what puts that config in turbo's graph.
- **A fixer that a git hook drives is handed paths, not asked to find them.** An exclusion applied only where a tool walks the tree is bypassed the moment lefthook passes `{staged_files}`, and for a rewriting tool that means editing files this repository does not author — which then conflicts with lefthook's stash of unstaged changes and leaves the commit unfinishable. `format-comments` applies its exclusions to both paths for that reason.

### Editor tooling

- **A `// @ts-check` file with no `tsconfig.json` is checked against the editor's defaults**, not against this repository's. A workspace script then fails on `toSorted` and on its own `node:` imports, and every binding downstream of the failure is reported as an implicit `any`, which points at the wrong line. `tooling/scripts` has a config of its own for that reason: `lib` at ES2023 and `types: ["node"]`, matching the Node it actually runs on.
- **A `$schema` path inside a config file resolves against that file's own URI.** Opening one from git history therefore looks for the schema under `git:` and fails. The mapping lives in `.vscode/settings.json` under `json.schemas` instead, whose paths resolve against the workspace root, and points at the copy in `node_modules` so there is no version to keep in step.
- **A config file may hold comments even where the editor says it may not.** `tsc` and oxlint both accept them, and the configs here use them to explain a setting beside the setting itself, but the editor decides a file is JSONC from its name and knows `tsconfig.json` rather than the shared bases packages extend. The tools stay happy and only the editor complains, so the fix is a `files.associations` entry in `.vscode/settings.json`, not the removal of the comment.

## Releasing

Releases are published by hand from a maintainer's machine, and `RELEASING.md` is the procedure.

All five packages share one version through the `fixed` group in `.changeset/config.json`, so a changeset on any one of them versions and publishes the set. That is what keeps the `workspace:*` dependency between them resolvable at every version.

No package sets `publishConfig.provenance`, because npm issues a provenance statement only to a build running on a cloud CI provider: asking for one from a laptop fails the publish rather than skipping it. `.github/workflows/release.yml` is the optional path for a release that wants provenance, and it is manual-trigger only, so nothing publishes on its own.

## Deferred work

`ROADMAP.md` records what was cut from v0.1 and the direction each item would take. It stays deliberately short of a specification: an entry says what the thing is and what makes it awkward, not what its API will be, so that nothing there reads as a promise. When scope is cut, add it there rather than leaving it in a conversation.
