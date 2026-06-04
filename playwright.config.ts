import { defineConfig, devices } from "@playwright/test";

// Streaming preview e2e. Drives the /preview-dev mock harness, which exercises
// useStreamingIframe in isolation — no Gemini calls, no password gate.
//
// Server is a production build (`next build && next start`), not `next dev`,
// so the spec exercises the same bundling/optimizations as a real deployment.
// Port defaults to 3100 (not 3000) so a developer's `npm run dev` on the
// default port is never disturbed.
const PORT = process.env.PW_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview",
    env: { PORT, ENABLE_PREVIEW_DEV: "1" },
    url: `http://localhost:${PORT}/preview-dev`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // accommodates `next build` on cold start
  },
});
