import { Host } from "@expo/ui";
import type { ReactNode } from "react";

export interface ControlProps {
  readonly children: ReactNode;
  /** Give a control that has no intrinsic width of its own, such as a slider, something to fill. */
  readonly width?: number;
}

/**
 * The native boundary every `@expo/ui` tree needs.
 *
 * `Host` is a real native view holding a SwiftUI or Jetpack Compose tree, so it cannot be nested inside another one and every control needs its own. It claims the whole row unless told otherwise: `matchContents` sizes it to what it holds, and a control that would rather stretch gets a width and keeps only its height matched.
 */
export function Control({ children, width }: ControlProps) {
  if (width === undefined) return <Host matchContents>{children}</Host>;

  return (
    <Host matchContents={{ vertical: true }} style={{ width }}>
      {children}
    </Host>
  );
}
