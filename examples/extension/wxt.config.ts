import { mkdirSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "wxt";

/*
  Auto-imports, kept away from the workspace packages.

  `imports: false` will not do it: WXT registers unimport's plugin either way, and only the generated declarations honor the flag. Its preset claims the bare name `storage`, and in-repo `exports` point at `src`, so `@platform-storage/react` arrives as source with its `storage` parameter reading as a free identifier — and the import injected above it resolves from nowhere, since that package does not depend on WXT.

  A variable rather than an object literal, because `exclude` reaches the plugin and works but is absent from WXT's own option type.
*/
const imports = {
  /* No directory scanning: everything here is imported by name, from the `wxt/utils/*` and `wxt/browser` paths the `#imports` alias stands for. */
  dirs: [],
  eslintrc: { enabled: false },
  exclude: [/[\\/]node_modules[\\/]/, /[\\/]packages[\\/]/],
};

/* Which of `dev` and `dev:browser` is running. WXT has no flag for it, so the scripts set this and the config reads it. */
const opensBrowser = process.env["WXT_OPEN_BROWSER"] === "true";

/**
 * A profile of this example's own, so that what you store survives restarting the dev server.
 *
 * It has to exist before the browser starts, because `web-ext` opens a log inside it rather than creating it. Under `.cache`, which is already ignored and which `clean` removes.
 */
function profile(browser: string): string {
  const directory = path.resolve(import.meta.dirname, ".cache", `${browser}-profile`);

  if (opensBrowser) mkdirSync(directory, { recursive: true });

  return directory;
}

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  imports,
  webExt: {
    disabled: !opensBrowser,
    keepProfileChanges: true,
    chromiumProfile: profile("chromium"),
    firefoxProfile: profile("firefox"),
  },
  autoIcons: {
    /*
      The same mark the browser examples show, rasterized into the sizes a manifest asks for at build time rather than committed once per size. Absolute, because a relative path here is resolved against `srcDir` rather than against this file, which is a difference no reader should have to know about.
    */
    baseIconPath: path.resolve(import.meta.dirname, "../ui/src/icon.svg"),
  },
  manifest: ({ browser }) => ({
    name: "platform-storage · extension playground",
    description:
      "One schema over the local, sync and session areas, read from a popup, an options page and a background service worker.",
    /* `alarms` is what lets the service worker be observed writing while nothing is open, and then be torn down and respawned. */
    permissions: ["storage", "alarms"],
    /*
      Firefox wants an add-on ID and warns without one. Chromium assigns its own and rejects the key, so it is set for the one target that asks for it. WXT builds Firefox as Manifest V2, which is why `storage.session` is missing there: the areas panel reports that rather than hiding it.
    */
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "platform-storage-playground@example.com",
              /* Everything this demo stores stays in the browser's own areas, so there is nothing to declare. Firefox asks new add-ons to say so explicitly. */
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
