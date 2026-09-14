import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/*
  No `server.port`. Vite and Next default to different ports and each moves to the next free one when its own is taken, so the two examples can run side by side and a server left over from an earlier run never blocks a start.
*/
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
