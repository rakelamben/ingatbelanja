import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: [
    { command: "python tasks.py api", cwd: "..", url: "http://localhost:8000/api/v1/health", reuseExistingServer: true, timeout: 120_000 },
    { command: "npm run dev -- --host localhost", cwd: ".", url: "http://localhost:5173", reuseExistingServer: true, timeout: 120_000 },
  ],
});
