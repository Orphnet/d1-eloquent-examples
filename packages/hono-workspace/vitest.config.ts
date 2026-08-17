import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    // Applies the app's d1-eloquent TS migrations to each test file's isolated D1.
    setupFiles: ["./src/test-apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
