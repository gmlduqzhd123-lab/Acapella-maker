import { defineConfig } from "@playwright/test";
import { resolvePagesBase } from "./config/pagesBase.ts";
const localUrl = `http://127.0.0.1:4173${resolvePagesBase(process.env)}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL ?? localUrl,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: localUrl,
        reuseExistingServer: false,
      },
});
