import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const customChromium = '/opt/pw-browsers/chromium';
const useCustomChromium = existsSync(customChromium);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
    ...(useCustomChromium
      ? { launchOptions: { executablePath: customChromium } }
      : {}),
  },
  webServer: {
    command: 'npx serve dist -l 4322',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
