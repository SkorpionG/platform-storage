// @vitest-environment node

/* This suite reads a file rather than rendering anything, and `import.meta.url` is not a `file:` URL under a DOM environment. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
  A bundler emits `"use client"` for a chunk only when the chunk's own entry module carries it: a directive on a module the entry merely re-exports is dropped, the build still succeeds, and nothing warns. A published entry without it is treated as server code by every React framework that reads the directive, so this asserts the one line that cannot be refactored away.

  The built output is checked by the packaging script, which runs after a build. This checks the source, so a refactor fails here first and without one.
*/
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));

describe("the client entry", () => {
  it("opens with the client directive, before any comment or import", () => {
    const [first] = readFileSync(entry, "utf8").split("\n");

    expect(first).toBe('"use client";');
  });
});
