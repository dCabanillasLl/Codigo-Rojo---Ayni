import { defineConfig } from '@playwright/test';
import offline from './playwright.offline.config';

export default defineConfig({
  ...offline,
  testDir: './tests/account',
  outputDir: 'test-results/account',
});
