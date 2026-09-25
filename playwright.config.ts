import { defineConfig } from "@playwright/test";

// Full-event dry run against the local Supabase stack (`npx supabase start`),
// on a production build: that is what Vercel serves, and the offline scorer
// cannot be judged in dev mode (the dev hot-reload socket holds up hydration).
// Run with `npm run e2e`.
export default defineConfig({
  testDir: "e2e",
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
