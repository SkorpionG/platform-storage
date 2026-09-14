"use client";

import { useEffect } from "react";

import { local } from "../store/storage";
import { useStoredValue } from "./use-storage";

/**
 * Applies the stored `theme` to the document, resolving `system` against the operating system.
 *
 * This is what makes the key more than a value in a table: writing it through the typed API repaints the page. The class is set on `<html>` before React runs, by the inline script in `index.html`, so a reload never flashes the wrong theme.
 */
export function useAppliedTheme(): void {
  const theme = useStoredValue(local, "theme");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (): void => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };

    apply();
    media.addEventListener("change", apply);

    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
