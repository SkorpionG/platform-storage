import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@tooling/vitest-config/base";

/*
  Every glob here is additive: `mergeConfig` concatenates arrays rather than replacing them, so restating the base patterns would run each suite twice.
*/
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Rendering a hook needs a document, even though nothing under `src` touches one.
      environment: "happy-dom",
      include: ["**/tests/**/*.test.tsx"],
      typecheck: { include: ["**/tests/**/*.test-d.tsx"] },
      coverage: { include: ["src/**/*.tsx"], exclude: ["src/server.ts"] },
    },
  }),
);
