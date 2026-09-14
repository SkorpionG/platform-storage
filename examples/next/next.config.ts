import path from "node:path";

import type { NextConfig } from "next";

const config: NextConfig = {
  /*
    These packages export TypeScript source through their `exports` map rather than a build, and pnpm links them under `node_modules`, which Next does not compile by default.
  */
  transpilePackages: ["@examples/schema", "@examples/ui", "@examples/web"],
  turbopack: {
    /* The workspace root, so module resolution and the file watcher both reach the sibling packages this app renders and imports its design tokens from. */
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default config;
