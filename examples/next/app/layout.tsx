import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "platform-storage · server-rendered playground",
  description: "The same schema-first storage, rendered on a server and hydrated in a browser.",
};

/*
  Paints the right theme before the first frame, so a reload never flashes the other one. This has to run before React hydrates, which is why the key and its values are spelled out here rather than imported from the schema. Reading the raw entry is the point worth noticing: the stored value is ordinary JSON text under an ordinary key, and anything on the origin can read it.
*/
const THEME_SCRIPT = `try {
  const raw = window.localStorage.getItem("theme");
  const theme = raw === null ? "system" : JSON.parse(raw);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (theme === "dark" || (theme !== "light" && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
} catch {}`;

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    /*
      The script below changes this element's class before React reaches it, so React is told that the server's copy and the browser's copy are expected to differ here. The attribute covers this element alone, not the tree under it.
    */
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
