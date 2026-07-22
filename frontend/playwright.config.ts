import { defineConfig } from '@playwright/test'

const e2ePort = process.env.KORESIM_E2E_PORT ?? '8791'
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`

// Browser E2E against the self-contained app server (fake LLM, inline worker).
// Prerequisite: `npm run build` (the server serves frontend/dist).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `uv run python ../scripts/run_e2e_server.py --port ${e2ePort}`,
    url: `${e2eBaseUrl}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
