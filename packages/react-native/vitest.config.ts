import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@tooling/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // Declares only the AsyncStorage shape, so it compiles to nothing.
        exclude: ["src/types.ts"],
      },
    },
  }),
);
