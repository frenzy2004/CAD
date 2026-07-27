import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3217";
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = externalBaseURL || localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          "npm run dev -- --hostname 127.0.0.1 --port 3217",
        url: localBaseURL,
        reuseExistingServer: false,
      },
});
