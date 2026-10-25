import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: {
    timeout: 8000,
  },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: [
    {
      command: 'npm.cmd run dev --prefix backend',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      env: {
        ADMIN_PASSWORD: 'admin-test-password-2026',
        JWT_SECRET: 'jwt-test-secret-key-32-chars-long-2026',
        PORT: '3001',
        LOGIN_RATE_LIMIT_MAX: '100',
      },
      timeout: 30000,
    },
    {
      command: 'npm.cmd run dev --prefix frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
