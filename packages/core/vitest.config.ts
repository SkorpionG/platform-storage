import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@tooling/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // Two modules that declare only types, and so compile to nothing. They sit beside code that does not, which is why the shared config cannot exclude them by shape.
        exclude: ["src/schema/key-definition.ts", "src/serializer/serializer.ts"],
      },
    },
  }),
);
