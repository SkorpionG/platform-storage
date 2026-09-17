import { paletteFor } from "../theme";
import type { Palette } from "../theme";
import { useAppliedScheme } from "./use-theme";

/** The colors for whichever scheme is in force, which is the stored `theme` key resolved against the device. */
export function usePalette(): Palette {
  return paletteFor(useAppliedScheme());
}
