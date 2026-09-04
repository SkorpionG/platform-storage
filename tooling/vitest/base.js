// @ts-check
import { defineConfig } from "vitest/config";

/*
  Plain JavaScript rather than TypeScript: vitest loads a config file from a linked workspace package before any build step exists, so a `.ts` source here would have to be compiled just to be read. `base.d.ts` carries the types.

  A named export only. A default export alongside it reads as two different configurations at the import site when it is the same one.
*/
/*
  Tests live in a `tests/` folder beside the code they cover, so moving or renaming a module takes its tests with it and there is no parallel tree to keep in step. The package's own top-level `tests/` folder holds the rest: shared fixtures and fakes, and the cross-cutting suites that belong to no single module.
*/
export const baseConfig = defineConfig({
  test: {
    environment: "node",
    include: ["**/tests/**/*.test.ts"],
    // Type-level assertions live beside the runtime tests and run in the same command, so a type regression fails `pnpm test` like any other bug.
    typecheck: {
      enabled: true,
      include: ["**/tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      /*
        Tests sit beside the code they cover, so the source set has to be named rather than inferred: without this the suites would count themselves, and every file would look covered.
      */
      include: ["src/**/*.ts"],
      /*
        Suites, and the modules that compile to nothing: an entry point that only re-exports, and anything under `types/`. A file with no statements is reported as zero of zero, which reads as untested code when there is no code. A package with type-only modules outside this shape adds them to its own config, so they stay visible rather than hidden behind a repository-wide rule.
      */
      exclude: ["src/**/tests/**", "src/index.ts", "src/types/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
