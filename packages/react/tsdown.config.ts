import { defineConfig } from "tsdown";

export default defineConfig({
  /*
    Two entries, because `"use client"` is emitted only for a chunk whose own entry module carries it. The hooks need the directive and the server helper must not have it, so they cannot share one entry.
  */
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  // Declaration maps are deliberately off: they point at `src`, which `files` does not publish, so shipping them would leave every consumer with a map to nothing.
  dts: { sourcemap: false },
  sourcemap: true,
  clean: true,
});
