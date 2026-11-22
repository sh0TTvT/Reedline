import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', viewport: { width: 1230, height: 822 } },
  webServer: { command: 'npm exec -- vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
})
