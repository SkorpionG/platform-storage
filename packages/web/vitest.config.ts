import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@tooling/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Web storage is a DOM API. Suites still inject the storage object rather than reaching for a global, so an adapter is testable without a DOM too.
      environment: "happy-dom",
    },
  }),
);
