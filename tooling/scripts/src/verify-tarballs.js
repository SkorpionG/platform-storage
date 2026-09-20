#!/usr/bin/env node
// @ts-check

/*
  Installs the packed tarballs into a throwaway project and uses them the way a consumer would.

  Why this exists: every app in this repository resolves `workspace:*` to `src`, because the in-repo `exports` point there. Nothing else therefore exercises the published shape — `publishConfig` swapping `exports` to `dist`, the dual ESM and CommonJS builds, the declaration files, and the re-export chain from a platform package to core. An `exports` map can be wrong in a way the whole test suite passes over.

  `publint` and `attw` already read a tarball and check it statically. This goes the last step: it installs one and runs it.

  Packing has to go through pnpm. `npm pack` does not apply `publishConfig`, so it would produce a tarball still pointing at `src` and prove nothing.

  ```
  node tooling/scripts/src/verify-tarballs.js
  node tooling/scripts/src/verify-tarballs.js --keep    # leave the project behind to poke at
  ```
*/

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every published package, and the entry each one is reached through. */
const PACKAGES = ["core", "web", "webextension", "react-native", "react"];

const keep = process.argv.includes("--keep");

/**
 * Runs a command, letting its output through only when it fails.
 *
 * @param {string} command
 * @param {ReadonlyArray<string>} args
 * @param {string} cwd
 * @returns {string}
 */
function run(command, args, cwd) {
  try {
    return execFileSync(command, [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    const { stdout, stderr } = /** @type {{ stdout?: string; stderr?: string }} */ (cause ?? {});
    const detail = [stdout, stderr].filter(Boolean).join("\n").trim();

    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}\n${detail}`, { cause });
  }
}

/**
 * @param {string} label
 * @param {() => void} work
 */
function step(label, work) {
  process.stdout.write(`  ${label} … `);
  work();
  process.stdout.write("ok\n");
}

/*
  A workspace dependency is rewritten to a plain version on pack, and that version is not on the registry yet. An override per package points every one of them back at the local tarball, which is also what proves a platform package can reach core through the published `exports` rather than through this repository's layout.
*/
/**
 * @param {Record<string, string>} tarballs
 * @returns {Record<string, unknown>}
 */
function consumerManifest(tarballs) {
  const local = Object.fromEntries(
    PACKAGES.map((name) => [`@platform-storage/${name}`, `file:${tarballs[name]}`]),
  );

  return {
    name: "tarball-consumer",
    private: true,
    version: "1.0.0",
    type: "module",
    dependencies: { ...local, react: "^19.3.0", typescript: "^6.0.3", zod: "^4.5.4" },
    overrides: local,
  };
}

const ESM_CHECK = `
import assert from "node:assert/strict";
import * as z from "zod";
import { createStorage, defineStorageSchema, isStorageQuotaError, jsonSerializer, memoryAdapter, STORAGE_ERROR_CODE } from "@platform-storage/core";
import { createLocalStorage, isQuotaExceeded } from "@platform-storage/web";
import { createWebExtensionStorage, WEB_EXTENSION_STORAGE_AREA } from "@platform-storage/webextension";
import { createReactNativeStorage } from "@platform-storage/react-native";
import { STORED_VALUE_STATUS, useStorageValue } from "@platform-storage/react";
import { readDeclaredValue } from "@platform-storage/react/server";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createStorage({ schema, adapter: memoryAdapter() });

assert.equal(await storage.get("theme"), "light");
await storage.set("theme", "dark");
assert.equal(await storage.get("theme"), "dark");
assert.equal(storage.getSync("theme"), "dark");
assert.equal(storage.physicalKey("user"), "app:user");

const planted = createStorage({ schema, adapter: memoryAdapter({ initial: { theme: '"purple"' } }) });
assert.equal(await planted.get("theme"), "light", "a value that no longer matches falls back");

const web = createLocalStorage({ schema });
await assert.rejects(() => web.get("theme"), (error) => error.code === STORAGE_ERROR_CODE.Unavailable);

assert.equal(readDeclaredValue(storage, "theme"), "light");
assert.equal(STORAGE_ERROR_CODE.Quota, "QUOTA");
assert.equal(WEB_EXTENSION_STORAGE_AREA.Sync, "sync");
assert.equal(STORED_VALUE_STATUS.Ready, "ready");
assert.equal(isStorageQuotaError(new Error("x")), false);
assert.equal(isQuotaExceeded({ name: "QuotaExceededError" }), true);
assert.equal(typeof jsonSerializer.serialize, "function");
assert.equal(typeof createWebExtensionStorage, "function");
assert.equal(typeof createReactNativeStorage, "function");
assert.equal(typeof useStorageValue, "function");
`;

const CJS_CHECK = `
const assert = require("node:assert/strict");
const z = require("zod");
const core = require("@platform-storage/core");
const web = require("@platform-storage/web");
const webExtension = require("@platform-storage/webextension");
const reactNative = require("@platform-storage/react-native");
const react = require("@platform-storage/react");
const server = require("@platform-storage/react/server");

const schema = core.defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
});
const storage = core.createStorage({ schema, adapter: core.memoryAdapter() });

void (async () => {
  assert.equal(await storage.get("theme"), "light");
  await storage.set("theme", "dark");
  assert.equal(storage.getSync("theme"), "dark");

  assert.equal(typeof web.createLocalStorage, "function");
  assert.equal(typeof web.defineStorageSchema, "function", "a platform package re-exports core");
  assert.equal(typeof webExtension.createWebExtensionStorage, "function");
  assert.equal(typeof reactNative.createReactNativeStorage, "function");
  assert.equal(typeof react.useStorageValue, "function");
  assert.equal(typeof server.readDeclaredValue, "function");
  assert.equal(core.STORAGE_ERROR_CODE.Quota, "QUOTA");
})();
`;

/* The `@ts-expect-error` lines are half the point: `tsc` fails on one that turns out to be unnecessary, so each is an assertion that the published types still refuse what they should. */
const TYPES_CHECK = `
import * as z from "zod";
import { createStorage, defineStorageSchema, memoryAdapter } from "@platform-storage/core";
import type { StorageQuotaExceededError, SyncPlatformStorage } from "@platform-storage/core";
import { createWebExtensionStorage } from "@platform-storage/webextension";
import { createLocalStorage } from "@platform-storage/web";
import { readDeclaredValue } from "@platform-storage/react/server";

const schema = defineStorageSchema({
  theme: { schema: z.enum(["light", "dark"]), default: "light" },
  user: { schema: z.object({ id: z.string(), name: z.string() }), key: "app:user" },
});

const storage = createStorage({ schema, adapter: memoryAdapter() });

const theme: "light" | "dark" = storage.getSync("theme");
const user: { id: string; name: string } | undefined = await storage.get("user");
const web: SyncPlatformStorage<typeof schema.definition> = createLocalStorage({ schema });
const declared: "light" | "dark" = readDeclaredValue(storage, "theme");

const area = createWebExtensionStorage({ schema });
// @ts-expect-error - an extension area has no synchronous half
area.getSync("theme");
// @ts-expect-error - "blue" is not one of the declared values
await storage.set("theme", "blue");
// @ts-expect-error - "nope" is not a declared key
await storage.get("nope");

void theme;
void user;
void web;
void declared;
export type Quota = StorageQuotaExceededError;
`;

/**
 * @param {"bundler" | "node16"} moduleResolution
 * @param {ReadonlyArray<string>} include
 * @returns {Record<string, unknown>}
 */
function tsconfig(moduleResolution, include) {
  return {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: moduleResolution === "bundler" ? "ESNext" : "node16",
      moduleResolution,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include,
  };
}

function main() {
  const project = mkdtempSync(join(tmpdir(), "platform-storage-tarball-"));

  process.stdout.write(`Verifying the packed tarballs in ${project}\n`);

  try {
    /** @type {Record<string, string>} */
    const tarballs = {};

    // `dist` is not committed, so a checkout has none, and a tarball packed without it ships only a manifest. Building here also keeps the check from passing on whatever stale build a working copy happens to hold. Turbo's cache makes it close to free when nothing has changed.
    step("building", () =>
      run("pnpm", ["exec", "turbo", "run", "build", "--filter=@platform-storage/*"], REPO),
    );

    step("packing", () => {
      for (const name of PACKAGES) {
        const packageDir = join(REPO, "packages", name);
        const out = join(packageDir, ".cache", "verify.tgz");

        mkdirSync(dirname(out), { recursive: true });
        // pnpm rather than npm: only pnpm applies `publishConfig`, which is what swaps `exports` from `src` to `dist`.
        run("pnpm", ["pack", "--out", out], packageDir);
        tarballs[name] = out;
      }
    });

    writeFileSync(
      join(project, "package.json"),
      `${JSON.stringify(consumerManifest(tarballs), undefined, 2)}\n`,
    );
    writeFileSync(join(project, "esm.mjs"), ESM_CHECK);
    writeFileSync(join(project, "cjs.cjs"), CJS_CHECK);
    writeFileSync(join(project, "types.ts"), TYPES_CHECK);
    writeFileSync(join(project, "node16.ts"), TYPES_CHECK);
    writeFileSync(
      join(project, "tsconfig.json"),
      `${JSON.stringify(tsconfig("bundler", ["types.ts"]), undefined, 2)}\n`,
    );
    writeFileSync(
      join(project, "tsconfig.node16.json"),
      `${JSON.stringify(tsconfig("node16", ["node16.ts"]), undefined, 2)}\n`,
    );

    // npm rather than pnpm, deliberately: a consumer's installer is not this repository's, and a flat `node_modules` is the harder case for an `exports` map.
    step("installing", () => run("npm", ["install", "--no-audit", "--no-fund"], project));
    step("importing as ESM", () => run("node", ["esm.mjs"], project));
    step("requiring as CommonJS", () => run("node", ["cjs.cjs"], project));
    step("resolving types (bundler)", () =>
      run(join(project, "node_modules", ".bin", "tsc"), ["--noEmit"], project),
    );
    step("resolving types (node16)", () =>
      run(join(project, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.node16.json"], project),
    );

    process.stdout.write(
      "\nThe published packages install, import and typecheck for a consumer.\n",
    );
  } finally {
    for (const name of PACKAGES) {
      rmSync(join(REPO, "packages", name, ".cache", "verify.tgz"), { force: true });
    }

    if (keep) process.stdout.write(`\nLeft in place: ${project}\n`);
    else rmSync(project, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
