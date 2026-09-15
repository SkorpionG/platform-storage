# AGENTS.md

Guide for the demonstration apps under `examples/`. Everything in [the repository guide](../AGENTS.md) still applies; this file covers only what is different about an example, and is the place to record anything learned here that the next person would otherwise have to work out again.

## What these are

Demonstrations of the published packages, and the only thing in the repository that exercises them the way a consumer would. The test suite covers the logic thoroughly and cannot cover the integration surface at all: a real bundler resolving an `exports` map, a real browser with a real quota, a real extension host, a real server render. Each app exists to put one of those under load.

Every one is private and never released. They are named outside the `@platform-storage/*` scope — `@examples/next`, `@examples/extension` — so they cannot match the `fixed` group glob in `.changeset/config.json` either. Changesets is configured with `privatePackages: { version: false, tag: false }`, so **an example never needs a changeset**; only a user-facing change to a published package does.

## Package map

| Package                | Holds                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| `@examples/schema`     | One schema definition, with no platform imports and no DOM types                  |
| `@examples/ui`         | Presentational components that know nothing about storage, and the design tokens  |
| `@examples/web`        | The panels, hooks and storages demonstrating `@platform-storage/web`              |
| `@examples/vite-react` | A browser playground for the web package, client only                             |
| `@examples/next`       | The same playground on the App Router, which is what runs the server path         |
| `@examples/extension`  | A WXT extension demonstrating `@platform-storage/extension` across three contexts |

## Commands

| Task                   | Command                                                 |
| ---------------------- | ------------------------------------------------------- |
| Run the Vite demo      | `pnpm --filter @examples/vite-react dev`                |
| Run the Next demo      | `pnpm --filter @examples/next dev`                      |
| Run the extension      | `pnpm --filter @examples/extension dev`                 |
| …and open a browser    | `pnpm --filter @examples/extension dev:browser`         |
| The extension, Firefox | `pnpm --filter @examples/extension dev:firefox:browser` |
| Package the extension  | `pnpm --filter @examples/extension zip`                 |

`dev` is `cache: false` and `persistent: true` in the root `turbo.json`, because a development server never finishes and never produces an output worth keeping.

## How the sharing works

The examples share in three layers, each knowing strictly less than the one above it: nothing in `@examples/schema` knows where the values are stored, nothing in `@examples/ui` knows they are stored at all, and a platform layer such as `@examples/web` adds the panels, hooks and storages for exactly one published package — note the name, one character from the package it demonstrates.

Panels are shared _within_ a platform and split _across_ platforms: two browser apps demonstrate the same package and differ only in how they render it, while an extension or a React Native app shares nothing below the schema. Each app is then a shell, supplying its own copy and whichever panels its platform alone can show.

`@examples/extension` is that rule applied. It depends on the schema and the UI kit and on nothing else in `examples/`, and keeps its own panels in `src/panels/`. There is no `@examples/extension-ui` beside it, because `@examples/web` earns its keep by being shared between two apps and there is one extension app: its popup and its options page are two entrypoints inside one package rather than two packages. Split it only when a second extension app exists.

A component that is presentational, carries no `"use client"` and imports no storage belongs in `@examples/ui` rather than in a platform layer, so that a second platform can render it without copying it. `Masthead` moved there for exactly that reason.

Anything platform-agnostic that is _data_ rather than a component goes in `@examples/schema`, which already depends on core and pulls in neither React nor the DOM: `KEY_NOTES` and `CORRUPTIONS` were there first, and `POLICY_LABELS`, `POLICIES`, `DECLARED_DEFAULTS` and `DECLARED_PHYSICAL_KEYS` joined them once a second app needed the same lists. A policy list that disagreed between two demos would be worse than the duplication it saved.

**There is deliberately no fourth layer for platform-agnostic panels**, and the duplication that leaves is intended. `EventLog` is the case to weigh it against: it is nearly identical between `@examples/web` and `@examples/extension` and depends on no platform. Sharing it would mean a package of its own, since `@examples/schema` has no React and `@examples/ui` has no storage — its own config, two dependency edges and a `@source` line in every app's stylesheet, to save a few dozen lines once the copy that genuinely differs is passed in as props. Each app keeping its own also lets that copy say something true about its platform, which is most of what a demo panel is for. Revisit if a third React DOM example appears, such as the Electron renderer; a React Native one would not qualify, because it can use neither the DOM nor Tailwind.

## Tooling

They need tooling a published API does not, which is what `tooling/typescript/react.json` and `tooling/oxlint/react.json` exist for. The first adds `jsx` and reaches past `ES2022`, because a browser demo can rely on more of the language than a library shipped to unknown runtimes. The second relaxes three rules, each because the code it governs is an application rather than a contract:

- `explicit-function-return-type`, which is right on a published API and would otherwise be demanded of every component and every handler inside it.
- `import/no-unassigned-import`, so a stylesheet can be imported for its side effect.
- `import/default`, because a bundler query such as `?raw` names a module the resolver cannot follow. TypeScript still checks those imports, so nothing is lost.

Neither file carries comments, because nothing under `tooling/` does and an editor reads a plain `.json` as strict JSON.

`react-in-jsx-scope` is turned off in `tooling/oxlint/base.json` rather than in the React config, even though only the examples write JSX. The command line resolves the nearest `.oxlintrc.json` per file, but an editor extension generally loads the root one, so a rule left on in the base config is reported against every `.tsx` file no matter what the package beside it says. The rule describes the classic JSX runtime, which nothing here uses.

An example extends the shared configs the same way every package does: `tsconfig.json` by package name (`@tooling/typescript-config/react.json`) and `.oxlintrc.json` by relative path (`../../tooling/oxlint/react.json`). That asymmetry is why the tooling packages are devDependencies at all.

## Styling

**Tailwind does not see a sibling package unless it is told to.** Content detection scans outward from the file holding the CSS and stops at the package boundary, so classes used in `@examples/ui` or `@examples/web` never reach the build and their components render unstyled with no error anywhere. The app's stylesheet names each one with `@source`, and every further shared package needs its own line. The design tokens travel the other way: they live in `@examples/ui/src/theme.css` and each app `@import`s them by relative path, so a palette is defined once rather than per app.

An app whose panels live inside its own package needs only the `@source` line for `@examples/ui`, since its own files are found by the same outward scan.

The app mark is one file, `@examples/ui/src/icon.svg`, for the same reason the tokens are. The Vite app points its `<link rel="icon">` at it by relative path and the extension rasterizes it into every size a manifest asks for, through `@wxt-dev/auto-icons`, so no icon is committed per size. `examples/next/app/icon.svg` is the one copy: the App Router reads that exact path as a file convention, and a Next example that did something cleverer would be a worse example.

## Traps

Read the relevant one before changing something here that looks arbitrary, and add to the list when something proves expensive to work out.

### Every app

- **A demo has to obey the rule it is demonstrating.** The library's whole claim is that a missing backend is reported and never a crash, so demo code that reaches a platform API directly has to look for it rather than assume it. The extension's change relay assumed `browser.storage` and threw on a page that had none, blanking the whole playground.
- **Say which of "still reading" and "the read failed" is meant.** Branching on `status === "ready"` alone and rendering one fixed caption for everything else tells the reader a failed read is still in flight, which is the distinction an asynchronous storage exists to keep. A placeholder has to be handed the read, the way `NotReady` in `@examples/extension` is, so it can report the error code instead.

### The extension

- **WXT registers unimport's transform even with `imports: false`.** Only the generated type declarations honor the flag; `UnimportPlugin.vite(...)` is added unconditionally. Its preset claims the bare name `storage`, and because in-repo `exports` point at `src`, a workspace package reaches the bundler as source: `@platform-storage/react` names a parameter `storage`, and an `import { storage } from "wxt/utils/storage"` was injected above it that resolves from nowhere. `wxt.config.ts` keeps the transform away from `packages/` with `exclude`, which reaches the plugin and works but is missing from WXT's own option type, so it goes through a variable rather than an object literal.
- **`wxt dev` opens a browser only if `web-ext` is installed.** It is an optional peer of WXT, and when it is missing the runner falls back to printing the output directory to load by hand — no warning, no error, just a quieter line in a wall of build output. It is a devDependency of this example for that reason.
- **Opening a browser is a config option, not a flag**, so the `dev` and `dev:browser` scripts differ only by an environment variable that `wxt.config.ts` reads into `webExt.disabled`. Keeping what is stored between runs needs both `keepProfileChanges` and a profile path of your own, since the default profile is a temporary directory; the path has to exist before the browser starts, because `web-ext` opens a log inside it rather than creating it. Those profiles are hundreds of megabytes, which is why they live under `.cache`.
- **`.wxt` is generated, so the typecheck writes it.** `typecheck` is `wxt prepare && tsc --noEmit`, the same shape as the Next example's `next typegen && tsc`, and `.wxt/**` is declared an output of `typecheck` rather than of `build` in the package's own `turbo.json`. The build output is `.output/**`, not `dist/**`.
- **Nothing here depends on Vite.** WXT depends on it, and `.wxt/wxt.d.ts` references `wxt/vite-builder-env`, which is how `?raw` and the rest of Vite's module types arrive without this package declaring one. Tailwind goes through `@tailwindcss/postcss` and a `postcss.config.mjs`, which Vite discovers on its own; `@tailwindcss/vite` would work too, since WXT resolves the same Vite the other examples use.
- **Extend the shared tsconfig, not WXT's.** WXT writes a `.wxt/tsconfig.json` and expects to be extended; doing so would let its compiler options win over this repository's. Including `.wxt/wxt.d.ts` gets the generated declarations without the options, and `wxt/utils/*` and `wxt/browser` are real module paths, so the `#imports` alias is never needed.
- **WXT builds Firefox as Manifest V2.** `storage.session` does not exist there, which is not a defect to hide: addressing a missing area reports `StorageUnavailableError` exactly as a missing extension API does, and the areas panel renders that. Firefox also wants an add-on ID and a data-collection declaration, both set for that target alone because Chromium rejects them.
- **An extension page cannot pre-paint a stored theme.** The two web apps read the theme synchronously from `localStorage` in an inline script before the first frame. An area only answers later, so each entrypoint paints the operating system's preference from `matchMedia` alone and the stored choice corrects it once the first read lands.
- **The origin inspector does not port from `@examples/web`.** That one reads synchronously and caches a snapshot for `useSyncExternalStore`; an area answers with a promise, so `use-area-contents.ts` keeps the answer in state and re-reads when the storage over that area reports a change.
- **A text corruption has no equivalent on an extension area.** Areas transport JSON values rather than text, so there is no encoding step to fail in. `@examples/schema` marks that entry `kind: "text"` and the extension's corrupt panel filters to `kind === "value"`.
- **`no-console` is on here too.** The React config does not relax it, and a service worker has no other obvious way to report itself — which is the point: everything observable goes through storage, messaging or `onError`, where a page can actually see it.
