import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/offline', workers: 1, fullyParallel: false, timeout: 30_000,
  reporter: 'list', outputDir: 'test-results/offline',
  use: { baseURL: 'http://127.0.0.1:8731', headless: true, viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/offline/server.mjs', url: 'http://127.0.0.1:8731', reuseExistingServer: false, timeout: 10_000 },
});
