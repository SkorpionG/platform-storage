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

Most panels are the browser playground's, reworked for a backend that only ever answers later. These four have no counterpart there:

- **A change made somewhere else.** Write a value in the options page and watch the open popup follow it. The library does not wrap `storage.onChanged` yet, so the relay doing that belongs to this demo; its whole source is on the panel.
- **The service worker.** Two counters, one in the worker's memory and one in the area. Terminate the worker from `chrome://extensions` and only the first goes back to zero — which is what resolving the backend on every operation buys you.
- **Which API was found.** `browser` is preferred over `chrome`. Load the Firefox build to see that it was, since Firefox defines both.
- **When the browser says no.** Push a value past the `sync` area's eight kilobytes an item and watch it come back as `StorageAdapterError` with the browser's own message as its cause, while the same write to `local` succeeds.

Two differences from the browser examples are worth noticing, because neither is a limitation of this demo:

- Every read reports a status, because an extension area has no synchronous half. `getSync` is not on the storage and the synchronous hooks refuse it at compile time.
- The inspector shows values rather than text. An area transports JSON natively, so the library hands values over untouched instead of encoding them.

On Firefox the extension is Manifest V2, where `storage.session` does not exist. The areas panel reports that rather than hiding it, which is the missing-area path working as designed.

Conventions and traps for the examples are in [`examples/AGENTS.md`](../AGENTS.md).
