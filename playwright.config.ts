import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // The live Tauri scenarios write into the running app's database, so they
  // only run through playwright.tauri.config.ts.
  testIgnore: ['**/adagu-scenarios.spec.ts'],
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
  },
})
