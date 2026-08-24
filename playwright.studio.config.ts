import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const customChromium = '/opt/pw-browsers/chromium';
const useCustomChromium = existsSync(customChromium);

export default defineConfig({
  testDir: './tests',
  testMatch: 'studio-blocks.spec.ts',
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: useCustomChromium ? customChromium : '/usr/local/bin/google-chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'npm run studio -- --port 4321 --host 127.0.0.1',
    url: 'http://127.0.0.1:4321/studio',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
