import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

/* A port of its own and a server started on demand, so the suite never lands on a development server left running for something else. */
export default defineConfig({
  testDir: "e2e",
  forbidOnly: true,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
