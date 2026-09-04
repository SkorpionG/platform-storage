import type { ViteUserConfig } from "vitest/config";

/**
 * Shared vitest configuration for every package in this repository.
 *
 * Hand-written because `base.js` is plain JavaScript consumed directly with no build step: without this, a consuming package only gets types when its own tsconfig enables `allowJs` and `checkJs`.
 */
export declare const baseConfig: ViteUserConfig;
