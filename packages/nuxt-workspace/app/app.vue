<template>
    <div class="page">
        <header class="banner">
            <div class="container banner__row">
                <div>
                    <h1>
                        <span class="brand">d1-eloquent</span>
                        <span class="sep">/</span>
                        <span class="route">Nuxt workspace example</span>
                    </h1>
                    <p class="tag">Nuxt 4 + Nitro on Cloudflare. Server routes hit D1 directly via <code>@orphnet/d1-eloquent</code> - no separate API tier.</p>
                </div>
                <nav class="banner__nav">
                    <NuxtLink to="/" exact-active-class="active">Live demo</NuxtLink>
                    <NuxtLink to="/features" active-class="active">Features</NuxtLink>
                    <NuxtLink to="/source" active-class="active">Source</NuxtLink>
                    <a href="https://hono-example.d1-eloquent.orph.dev" target="_blank" rel="noopener">Hono sibling ↗</a>
                </nav>
            </div>
        </header>
        <main class="container">
            <NuxtPage />
        </main>
        <footer class="container footer">
            <p>
                Source: <a href="https://github.com/Orphnet/d1-eloquent-examples">Orphnet/d1-eloquent-examples</a>
                · ORM: <a href="https://github.com/Orphnet/d1-eloquent">d1-eloquent</a>
                · Sibling demo: <a href="https://hono-example.d1-eloquent.orph.dev">Hono workspace</a>
            </p>
        </footer>
    </div>
</template>

<style>
:root {
    --bg: #0b0f17;
    --bg-elev: #131a26;
    --bg-card: #18212f;
    --fg: #e6ebf2;
    --fg-dim: #9aa6b8;
    --accent: #6ee7b7;
    --accent-2: #93c5fd;
    --rule: #243046;
    --warn: #fbbf24;
    color-scheme: dark;
}

* { box-sizing: border-box; }

html, body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
}

a { color: var(--accent-2); }
a:hover { color: var(--accent); }

code, pre {
    font-family: ui-monospace, "SF Mono", Monaco, Menlo, monospace;
    font-size: 0.92em;
}

.page { min-height: 100vh; display: flex; flex-direction: column; }
.container { max-width: 1080px; margin: 0 auto; padding: 1.5rem 1.5rem; width: 100%; }

.banner {
    border-bottom: 1px solid var(--rule);
    background: linear-gradient(180deg, rgba(110,231,183,0.04), transparent);
}
.banner__row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap; }
.banner__nav { display: flex; gap: 6px; align-items: center; }
.banner__nav a {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: var(--bg-elev);
    color: var(--fg-dim);
    font-size: 0.85rem;
    text-decoration: none;
    transition: all 150ms;
}
.banner__nav a:hover { color: var(--fg); border-color: rgba(110, 231, 183, 0.35); }
.banner__nav a.active {
    background: rgba(110, 231, 183, 0.12);
    color: var(--accent);
    border-color: rgba(110, 231, 183, 0.35);
}
.banner h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; }
.brand { color: var(--accent); }
.sep { color: var(--fg-dim); margin: 0 0.5em; }
.route { color: var(--fg); }
.tag { margin: 0; color: var(--fg-dim); font-size: 0.95rem; }
.tag code { background: var(--bg-elev); padding: 0.1em 0.4em; border-radius: 4px; }

main.container { flex: 1; }

.footer { color: var(--fg-dim); font-size: 0.85rem; border-top: 1px solid var(--rule); margin-top: 2rem; }
.footer p { margin: 0; }

.card {
    background: var(--bg-card);
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1rem;
}
.card h2 {
    margin: 0 0 0.75rem;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.72rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }

.kv { display: grid; grid-template-columns: minmax(120px, 1fr) 3fr; gap: 0.5rem 1rem; font-size: 0.92rem; }
.kv dt { color: var(--fg-dim); }
.kv dd { margin: 0; }

.list { list-style: none; padding: 0; margin: 0; }
.list li { padding: 0.5rem 0; border-bottom: 1px solid var(--rule); }
.list li:last-child { border-bottom: 0; }

.badge {
    display: inline-block;
    padding: 0.25em 0.7em;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 500;
    line-height: 1.4;
    background: var(--bg-elev);
    color: var(--fg-dim);
    margin-right: 0.3em;
    border: 1px solid var(--rule);
    /* card h2 has text-transform: uppercase - keep badges showing their original case so
       things like "morphTo (actor + subject)" stay readable. */
    text-transform: none;
    letter-spacing: 0;
}
.badge.accent { color: var(--accent); border-color: rgba(110,231,183,0.35); }
.badge.warn { color: var(--warn); border-color: rgba(251,191,36,0.35); }

.grid { display: grid; gap: 1rem; }
@media (min-width: 720px) {
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
}

button, .btn {
    appearance: none;
    background: var(--bg-elev);
    color: var(--fg);
    border: 1px solid var(--rule);
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.92rem;
    font-family: inherit;
}
button:hover, .btn:hover { border-color: var(--accent); color: var(--accent); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

pre.json {
    background: var(--bg-elev);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    overflow-x: auto;
    color: var(--fg-dim);
    font-size: 0.8rem;
    max-height: 320px;
}
</style>
