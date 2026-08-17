// Ambient test-env types. The app ships no worker-configuration.d.ts, so the
// pool's `ProvidedEnv` needs the D1 binding declared for test files + the
// migration setup hook.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
  }
}

// Vite/vitest build macro used by the migration setup (no vite/client types here).
interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { eager?: boolean }): Record<string, T>;
}
