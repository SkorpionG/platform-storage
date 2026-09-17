import { useAsyncStorageValue } from "@platform-storage/react";
import { useColorScheme } from "react-native";
import type { ColorSchemeName } from "react-native";

import { local } from "../store/storages";

/**
 * The scheme the app paints: the stored `theme` key, with `"system"` resolved against the device.
 *
 * The device's own setting is what shows until the first read lands, because a device storage cannot answer during a render. The browser examples read `localStorage` synchronously in an inline script and paint the stored choice on the very first frame; nothing here can, so a stored theme arrives a frame late and the app corrects itself. The extension example has the same gap for the same reason.
 */
export function useAppliedScheme(): ColorSchemeName {
  const device = useColorScheme();
  const [stored] = useAsyncStorageValue(local, "theme");

  if (stored.status !== "ready" || stored.value === "system") return device;

  return stored.value;
}
