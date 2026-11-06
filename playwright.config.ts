import { defineConfig } from '@playwright/test';

// E2E gegen Testseiten und Fixtures (Spez. §14.1); Fixtures und Portal-Abspielen folgen mit H6.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
});
