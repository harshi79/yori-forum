import { defineConfig, devices } from "@playwright/test";
const port = 3100;
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.E2E_CHROMIUM_PATH
          ? {
              executablePath: process.env.E2E_CHROMIUM_PATH,
              args: ["--no-sandbox", "--disable-dev-shm-usage"],
            }
          : undefined,
      },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/mock-services.mjs",
      url: "http://127.0.0.1:54387/__ready",
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 30000,
    },
    {
      command: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54387 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-publishable TURSO_DATABASE_URL=http://127.0.0.1:54387 TURSO_AUTH_TOKEN=test-only APP_ORIGIN=http://127.0.0.1:${port} npm run dev -- -p ${port}`,
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 120000,
    },
  ],
});
