# @examples/extension

A browser extension demonstrating [`@platform-storage/webextension`](../../packages/webextension), built with [WXT](https://wxt.dev). It is the only example that cannot be opened at a URL, which is what this file is for.

It has three contexts — a popup, an options page and a background service worker — and they all read one storage over [the schema the browser examples use](../schema/src/schema.ts), unchanged.

## Run it

```sh
pnpm --filter @examples/extension dev                   # Chromium, no browser opened
pnpm --filter @examples/extension dev:browser           # Chromium, opens one
pnpm --filter @examples/extension dev:firefox           # Firefox, no browser opened
pnpm --filter @examples/extension dev:firefox:browser   # Firefox, opens one
```

The plain commands build and watch, and leave your browser alone: use them when the extension is already loaded, or when you would rather load it yourself. The `:browser` ones open a browser with the extension already in it, so there is nothing to load by hand; pressing `o` then enter in the terminal reopens it if you close it.

Click the toolbar icon for the popup, and the button inside it for the options page, which is where the full playground is. Both reload as you edit.

The browser those commands open keeps a profile of its own under `.cache`, so what you store survives stopping the dev server — worth having in a storage demo, and worth knowing about because those profiles run to a few hundred megabytes. `pnpm --filter @examples/extension clean` removes them along with everything else generated.

## Load a build by hand

```sh
pnpm --filter @examples/extension build
pnpm --filter @examples/extension build:firefox
```

**Chromium** — open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select `.output/chrome-mv3`.

**Firefox** — open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select any file inside `.output/firefox-mv2`. It is removed again when Firefox closes.

## What to look at

The options page is split into tabs, with the inspector and the error log beside every one:

- **Tour.** One button runs the seven checks every example shares, and each row links to the tab that shows it in full.
- **Values.** Every kind of value the schema declares, and several keys read or written in one call to the `sync` area, with the calls counted.
- **Bad data.** Corrupt values under each invalid-data policy, versioned and repaired keys, and the `sync` area refusing a write that `local` accepts.
- **Areas.** One schema over `local`, `sync` and `session`, and what each `clear` target takes.
- **Contexts.** The background worker writing while this page follows it, and which extension API the library found.
- **Schema.** The keys, their stored names and read types, and the source.

Two differences from the browser examples are worth noticing, because neither is a limitation of this demo:

- Every read reports a status, because an extension area has no synchronous half. `getSync` is not on the storage and the synchronous hooks refuse it at compile time.
- The inspector shows values rather than text. An area transports JSON natively, so the library hands values over untouched instead of encoding them.

On Firefox the extension is Manifest V2, where `storage.session` does not exist. The Areas tab reports that rather than hiding it, which is the missing-area path working as designed.

Conventions and traps for the examples are in [`examples/AGENTS.md`](../AGENTS.md).
