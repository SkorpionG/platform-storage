import { Platform } from "react-native";
import type { ColorSchemeName } from "react-native";

/*
  The same palette the browser examples use, converted once from the `oklch()` tokens in `@examples/ui/src/theme.css`, because React Native's style engine parses no color function beyond `rgb` and `hsl`. Semantic names rather than a fixed scale, so the two themes are one swap rather than a conditional at every call site: canvas holds cards, a card holds insets, and text runs from `fg` down to `faint`.
*/

export interface Palette {
  readonly canvas: string;
  readonly surface: string;
  readonly inset: string;
  readonly raised: string;
  readonly line: string;
  readonly fg: string;
  readonly body: string;
  readonly muted: string;
  readonly soft: string;
  readonly faint: string;
  readonly accent: string;
  readonly danger: string;
  readonly warning: string;
  readonly success: string;
}

const LIGHT: Palette = {
  canvas: "#f9fafb",
  surface: "#ffffff",
  inset: "#f4f6f8",
  raised: "#eef0f3",
  line: "#dee0e3",
  fg: "#1c1f24",
  body: "#3f4348",
  muted: "#5f636a",
  soft: "#767b82",
  faint: "#9b9fa3",
  accent: "#0284c7",
  danger: "#be123c",
  warning: "#b45309",
  success: "#047857",
};

const DARK: Palette = {
  canvas: "#0b0d11",
  surface: "#17191d",
  inset: "#080a0e",
  raised: "#24272a",
  line: "#2b2e32",
  fg: "#f0f2f4",
  body: "#d3d4d7",
  muted: "#a2a5a8",
  soft: "#83868b",
  faint: "#616368",
  accent: "#38bdf8",
  danger: "#fda4af",
  warning: "#fcd34d",
  success: "#6ee7b7",
};

export function paletteFor(scheme: ColorSchemeName): Palette {
  return scheme === "dark" ? DARK : LIGHT;
}

/** One step, so spacing is a scale rather than a pile of unrelated numbers. */
export const SPACE = 8;

export const RADIUS = { badge: 6, inset: 8, card: 14 } as const;

/** A family name is resolved by the platform's own font list, and Menlo is on iOS only: naming it on Android silently falls back to the default sans, which is not a monospace at all. */
export const MONO = Platform.select({ android: "monospace", default: "Menlo" });
