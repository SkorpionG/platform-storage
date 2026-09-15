import { useAsyncStorageValue } from "@platform-storage/react";
import { useEffect } from "react";

import { local } from "../store/storages";

/**
 * Applies the stored `theme` to the document, resolving `system` against the operating system.
 *
 * The web examples paint the stored theme before the first frame from an inline script. An extension area only answers later, so there is nothing to read at that moment: the entrypoint HTML paints the operating system's preference alone, and this corrects it once the first read lands.
 */
export function useAppliedTheme(): void {
  const [theme] = useAsyncStorageValue(local, "theme");

  useEffect(() => {
    if (theme.status !== "ready") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (): void => {
      const dark = theme.value === "dark" || (theme.value === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };

    apply();
    media.addEventListener("change", apply);

    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
