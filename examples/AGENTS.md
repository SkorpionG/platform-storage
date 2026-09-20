# AGENTS.md

Guide for the demonstration apps under `examples/`. Everything in [the repository guide](../AGENTS.md) still applies; this file covers only what is different about an example, and is the place to record anything learned here that the next person would otherwise have to work out again.

## What these are

Demonstrations of the published packages, and the only thing in the repository that exercises them the way a consumer would. The test suite covers the logic thoroughly and cannot cover the integration surface at all: a real bundler resolving an `exports` map, a real browser with a real quota, a real extension host, a real server render, a real device. Each app exists to put one of those under load.

Every one is private and never released. They are named outside the `@platform-storage/*` scope — `@examples/next`, `@examples/extension` — so they cannot match the `fixed` group glob in `.changeset/config.json` either. Changesets is configured with `privatePackages: { version: false, tag: false }`, so **an example never needs a changeset**; only a user-facing change to a published package does.

## Package map

| Package                | Holds                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `@examples/schema`     | One schema definition, with no platform imports and no DOM types                     |
| `@examples/ui`         | Presentational components that know nothing about storage, and the design tokens     |
| `@examples/web`        | The panels, hooks and storages demonstrating `@platform-storage/web`                 |
| `@examples/vite-react` | A browser playground for the web package, client only                                |
| `@examples/next`       | The same playground on the App Router, which is what runs the server path            |
| `@examples/extension`  | A WXT extension demonstrating `@platform-storage/webextension` across three contexts |
| `@examples/expo`       | An Expo app demonstrating `@platform-storage/react-native` on a real device          |

## Commands

| Task                   | Command                                                 |
| ---------------------- | ------------------------------------------------------- |
| Run the Vite demo      | `pnpm --filter @examples/vite-react dev`                |
| Run the Next demo      | `pnpm --filter @examples/next dev`                      |
| Run the extension      | `pnpm --filter @examples/extension dev`                 |
| …and open a browser    | `pnpm --filter @examples/extension dev:browser`         |
| The extension, Firefox | `pnpm --filter @examples/extension dev:firefox:browser` |
| Package the extension  | `pnpm --filter @examples/extension zip`                 |
| Run the Expo app       | `pnpm --filter @examples/expo start`                    |
| …on one platform       | `pnpm --filter @examples/expo ios` / `… android`        |
| Check its dependencies | `pnpm --filter @examples/expo doctor`                   |

`dev` is `cache: false` and `persistent: true` in the root `turbo.json`, because a development server never finishes and never produces an output worth keeping.

## How the sharing works

The examples share in three layers, each knowing strictly less than the one above it: nothing in `@examples/schema` knows where the values are stored, nothing in `@examples/ui` knows they are stored at all, and a platform layer such as `@examples/web` adds the panels, hooks and storages for exactly one published package — note the name, one character from the package it demonstrates.

Panels are shared _within_ a platform and split _across_ platforms: two browser apps demonstrate the same package and differ only in how they render it, while an extension or a React Native app shares nothing below the schema. Each app is then a shell, supplying its own copy and whichever panels its platform alone can show.

`@examples/extension` is that rule applied. It depends on the schema and the UI kit and on nothing else in `examples/`, and keeps its own panels in `src/panels/`. There is no `@examples/extension-ui` beside it, because `@examples/web` earns its keep by being shared between two apps and there is one extension app: its popup and its options page are two entrypoints inside one package rather than two packages. Split it only when a second extension app exists.

A component that is presentational, carries no `"use client"` and imports no storage belongs in `@examples/ui` rather than in a platform layer, so that a second platform can render it without copying it. `Masthead` moved there for exactly that reason.

Anything platform-agnostic that is _data_ rather than a component goes in `@examples/schema`, which already depends on core and pulls in neither React nor the DOM: `KEY_NOTES` and `CORRUPTIONS` were there first, and `POLICY_LABELS`, `POLICIES`, `DECLARED_DEFAULTS` and `DECLARED_PHYSICAL_KEYS` joined them once a second app needed the same lists. A policy list that disagreed between two demos would be worse than the duplication it saved.

**There is deliberately no fourth layer for platform-agnostic panels**, and the duplication that leaves is intended. `EventLog` is the case to weigh it against: it is nearly identical between `@examples/web` and `@examples/extension` and depends on no platform. Sharing it would mean a package of its own, since `@examples/schema` has no React and `@examples/ui` has no storage — its own config, two dependency edges and a `@source` line in every app's stylesheet, to save a few dozen lines once the copy that genuinely differs is passed in as props. Each app keeping its own also lets that copy say something true about its platform, which is most of what a demo panel is for. Revisit if a third React DOM example appears, such as the Electron renderer. `@examples/expo` is the case that settles the other direction: it can use neither the DOM nor Tailwind, so it reimplements `EventLog` in `View` and `Text` and shares nothing below the schema, exactly as predicted.

## Tooling

They need tooling a published API does not, which is what `tooling/typescript/react.json` and `tooling/oxlint/react.json` exist for. The first adds `jsx` and reaches past `ES2022`, because a browser demo can rely on more of the language than a library shipped to unknown runtimes. The second relaxes three rules, each because the code it governs is an application rather than a contract:

- `explicit-function-return-type`, which is right on a published API and would otherwise be demanded of every component and every handler inside it.
- `import/no-unassigned-import`, so a stylesheet can be imported for its side effect.
- `import/default`, because a bundler query such as `?raw` names a module the resolver cannot follow. TypeScript still checks those imports, so nothing is lost.

Neither file carries comments, because nothing under `tooling/` does and an editor reads a plain `.json` as strict JSON.

`react-in-jsx-scope` is turned off in `tooling/oxlint/base.json` rather than in the React config, even though only the examples write JSX. The command line resolves the nearest `.oxlintrc.json` per file, but an editor extension generally loads the root one, so a rule left on in the base config is reported against every `.tsx` file no matter what the package beside it says. The rule describes the classic JSX runtime, which nothing here uses.

An example extends the shared configs the same way every package does: `tsconfig.json` by package name (`@tooling/typescript-config/react.json`) and `.oxlintrc.json` by relative path (`../../tooling/oxlint/react.json`). That asymmetry is why the tooling packages are devDependencies at all.

## Styling

**None of this section applies to `@examples/expo`.** React Native has no CSS, no cascade and no Tailwind, so that app carries its own tokens in `src/theme.ts`: the same palette converted once from the `oklch()` values in `@examples/ui/src/theme.css`, because React Native's style engine parses no color function beyond `rgb` and `hsl`. A palette change therefore has to be made in both places, which is the price of a platform that cannot read the stylesheet.

**Tailwind does not see a sibling package unless it is told to.** Content detection scans outward from the file holding the CSS and stops at the package boundary, so classes used in `@examples/ui` or `@examples/web` never reach the build and their components render unstyled with no error anywhere. The app's stylesheet names each one with `@source`, and every further shared package needs its own line. The design tokens travel the other way: they live in `@examples/ui/src/theme.css` and each app `@import`s them by relative path, so a palette is defined once rather than per app.

An app whose panels live inside its own package needs only the `@source` line for `@examples/ui`, since its own files are found by the same outward scan.

The app mark is one file, `@examples/ui/src/icon.svg`, for the same reason the tokens are. The Vite app points its `<link rel="icon">` at it by relative path and the extension rasterizes it into every size a manifest asks for, through `@wxt-dev/auto-icons`, so no icon is committed per size. `examples/next/app/icon.svg` is the one copy: the App Router reads that exact path as a file convention, and a Next example that did something cleverer would be a worse example.

## Traps

Read the relevant one before changing something here that looks arbitrary, and add to the list when something proves expensive to work out.

### Every app

- **A demo has to obey the rule it is demonstrating.** The library's whole claim is that a missing backend is reported and never a crash, so demo code that reaches a platform API directly has to look for it rather than assume it. The extension's change relay assumed `browser.storage` and threw on a page that had none, blanking the whole playground.
- **Say which of "still reading" and "the read failed" is meant.** Branching on `status === "ready"` alone and rendering one fixed caption for everything else tells the reader a failed read is still in flight, which is the distinction an asynchronous storage exists to keep. A placeholder has to be handed the read, the way `NotReady` in `@examples/extension` is, so it can report the error code instead.
- **`@examples/ui` splits on the `"use client"` line.** `controls.tsx` and `code-block.tsx` carry the directive and the presentational files deliberately do not, which is what lets a panel with no hooks in it render on a server. `packages/AGENTS.md` records why the directive is needed at all.
- **`@examples/web` caches its origin snapshot against a revision counter.** A `getSnapshot` has to answer with the same reference until something changes, and both `getSync` and a factory default answer fresh every call, so reading either straight through never settles. The counter is stable for exactly as long as nothing has been written.

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

### The Expo app

#### Workspace

- **A peer override matches its parent by name, so version-scope it.** `"@react-native-async-storage/async-storage>react-native": "-"` removed that peer for _every_ consumer, not just the package that wanted it gone, and AsyncStorage's runtime imports `react-native` directly. A real app would then have resolved it only through pnpm's implicit hoisting, which is the phantom dependency the Boundaries section exists to prevent. Pinning the selector to `@^3` leaves the library's copy stripped and the app's properly peered.
- **`catalogs.expo` exists because the Expo SDK pins exact versions.** SDK 57 wants React 19.2.3 and AsyncStorage 2.2.0 where the default catalog holds 19.3.0 and ^3.1.1, and Expo Go ships the _native_ half at the SDK's version, so a 3.x JavaScript half would be talking to a 2.2.0 native module. Moving the default catalog would drag every other example along with it. A pleasing side effect: the workspace now holds AsyncStorage 2.2.0 and 3.1.1 at once and `AsyncStorageLike` satisfies both, which is the structural-typing claim demonstrated across a major version.
- **`@types/react` is deliberately not in that catalog.** Putting it there changed which copy pnpm hoists and broke `@examples/next` with `TS2883`, in a package that was never touched. The app takes the default catalog's copy and records the mismatch in `expo.install.exclude`, so `expo install` stops offering to fix it.
- **`expo-doctor` reports a duplicate React and that is expected.** The app is on the SDK's version and `packages/react` is on the workspace's for its tests. It is a check on the tree, not the bundle; Metro emits one React, and two would throw "Invalid hook call" on the first render.
- **Do not add a `metro.config.js`.** One was written to force React to a single copy, then deleted to test whether it did anything: the bundle was byte-identical. Expo's default config already resolves it.

#### Writing the app

- **`tooling/typescript/native.json`, not `react.json`.** The React config ships the DOM lib, which would let `document`, `window` and `localStorage` typecheck and then crash. The native one drops it, sets `types: ["expo/types"]` because the base sets `types: []`, and adds `moduleSuffixes` so `tsc` can resolve a platform-specific file.
- **A bare string inside a `View` is a runtime error**, where inside a `div` it is ordinary. `Field` wraps a string hint in `<Text>` itself rather than making every call site remember.
- **`@expo/ui`'s `Button` takes a `label` prop, not string children.** iOS hands children straight to the native view as an element. Three runtime errors came from `<Button>−</Button>`.
- **`@expo/ui`'s `TextInput` takes an `ObservableState`**, not a string, so a value arriving later from storage cannot simply be passed in. `TextRow` commits on blur, because writing per keystroke round-trips through storage and drags the cursor back.
- **Every `@expo/ui` tree needs its own `Host`**, and `Host matchContents` sizes to what it holds — which collapses a slider to its thumb. `Control` takes an optional width and matches only the height.
- **A host re-measures whenever the native tree inside it changes size**, so anything whose width depends on state belongs outside it. A stepper built as one host around `[button, count, button]` reflows every time the count gains a digit, which moves the buttons and clips their labels; three hosts with the count between them as a React Native `Text` keeps each button a fixed size and lets the row center the number.
- **A native stack over the tabs brings the keyboard back.** `RNSScreen` records the first responder before a transition and calls `becomeFirstResponder` on it once the transition finishes, so on any screen where a text field has been used, presenting anything reopens the keyboard. It is iOS-only and it is why the schema is a React Native `Modal` rather than a `formSheet` route: the tabs are the root, with no stack around them.
- **Hermes does not implement `Array#toSorted`.** It throws `undefined is not a function` at runtime, and `unicorn/no-array-sort` recommends exactly that method, so the rule is off for this package rather than disabled per line. Browser code elsewhere in `examples/` uses `toSorted` safely.
- **`fontFamily` is resolved against the platform's own font list.** Naming Menlo on Android silently falls back to the default sans rather than erroring, so the monospace family goes through `MONO` in `src/theme.ts`.
- **Navigation decides when a tab's screen mounts**, so anything that must happen once per launch is guarded by a module-level record rather than by a mount. `NativeTabs` was observed mounting every tab's screen at startup, which a mount-guarded launch counter would have counted wrongly.
- **The native tab bar is themed per platform.** iOS repaints its own bar from the `ThemeProvider` value, and giving it explicit colors costs it the system material and truncates a label. Android's bar follows the operating system instead and stays light under a stored dark theme, so the root layout hands it the palette there and only there.
- **A device cannot pre-paint a stored theme either.** The browser examples read `localStorage` synchronously in an inline script and paint the stored choice on the first frame. AsyncStorage only answers later, so `useAppliedScheme` shows the device's own setting until the first read lands and the app corrects itself, exactly as the extension does and for the same reason.
- **`?raw` has no Metro equivalent**, so this is the one app that cannot display the schema module verbatim. Its schema panel lists the keys instead.
- **Four dependencies are imported by nothing and still required.** `expo-constants`, `expo-linking`, `react-native-safe-area-context` and `react-native-screens` are non-optional peers of `expo-router`, so a search for unused dependencies will offer all four and removing any of them breaks the app at runtime rather than at build time.

#### Verifying it

- **A route can be opened without touching the screen.** `xcrun simctl openurl <device> "exp://127.0.0.1:8081/--/<route>"` navigates Expo Go on iOS, and `adb shell am start -a android.intent.action.VIEW -d "exp://<host>:8081/--/<route>"` does the same on Android. `xcrun simctl terminate <device> host.exp.Exponent` followed by that `openurl` is a genuine force-quit and relaunch, which a reload is not.
- **Android can be driven; iOS cannot.** `adb shell input tap|swipe` works, so the Android emulator can be taken through the whole app. There is no equivalent for the iOS simulator without an accessibility grant, so iOS panels below the fold are reached by temporarily reducing the screen to the panel under test.
- **The store can be read and written from outside the app.** On iOS it is a `manifest.json` under `Documents/ExponentExperienceData/@anonymous/<slug>/RCTAsyncLocalStorage` inside the container `xcrun simctl get_app_container <device> host.exp.Exponent data` prints. Planting into it and relaunching is how the corrupt-read path was first proven, and reading it afterwards is how a value was shown to have survived on disk rather than in a runtime.
