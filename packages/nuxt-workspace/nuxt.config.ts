// d1-eloquent example: Nuxt 4 + Nitro + Cloudflare Pages
// Server routes hit D1 directly through @orphnet/d1-eloquent.
export default defineNuxtConfig({
    devtools: { enabled: false },
    future: { compatibilityVersion: 4 },
    compatibilityDate: "2026-03-01",

    modules: ["nitro-cloudflare-dev"],

    runtimeConfig: {
        public: {
            appName: "Workspace (Nuxt)",
        },
    },

    nitro: {
        preset: "cloudflare_module",
        cloudflare: {
            deployConfig: true,
            nodeCompat: true,
        },
    },

    app: {
        head: {
            title: "d1-eloquent example — Nuxt workspace",
            viewport: "width=device-width, initial-scale=1",
        },
    },
});
