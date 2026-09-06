import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  // Declaration maps are deliberately off: they point at `src`, which `files` does not publish, so shipping them would leave every consumer with a map to nothing.
  dts: { sourcemap: false },
  sourcemap: true,
  clean: true,
});
