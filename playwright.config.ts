import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const customChromium = '/opt/pw-browsers/chromium';
const useCustomChromium = existsSync(customChromium);

// Two built sites (npm run build makes both):
// - fixtures: dist-fixtures/, the frozen test content in tests/fixtures/site. Feature and layout specs
//   run here, so dashboard publishes that take pages down cannot break them.
// - site: dist/, the real content that gets deployed. Only tests/site/ runs here, and it pins no
//   titles, counts or slugs.
const FIXTURES_URL = 'http://localhost:4322';
const SITE_URL = 'http://localhost:4323';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    launchOptions: {
      ...(useCustomChromium ? { executablePath: customChromium } : {}),
      args: ['--host-resolver-rules=MAP dashboard.test 127.0.0.1'],
    },
  },
  projects: [
    { name: 'fixtures', testIgnore: 'site/**', use: { baseURL: FIXTURES_URL } },
    { name: 'site', testMatch: 'site/**/*.spec.ts', use: { baseURL: SITE_URL } },
  ],
  webServer: [
    {
      command: 'node --experimental-strip-types scripts/preview.mjs --port 4322 --dist dist-fixtures',
      url: FIXTURES_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node --experimental-strip-types scripts/preview.mjs --port 4323',
      url: SITE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
