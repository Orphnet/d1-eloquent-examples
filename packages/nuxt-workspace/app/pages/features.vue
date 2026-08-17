<template>
    <div>
        <section class="card">
            <h2>Beta.3 feature showcase</h2>
            <p>
                Fourteen features shipped in <code>@orphnet/d1-eloquent</code> beta.3, each run
                <strong>live against D1</strong> by a dedicated server route and rendered below. Every card shows
                <strong>what it proves</strong>, the <strong>copyable d1-eloquent call</strong>, and the
                <strong>real result</strong> computed this request.
            </p>
            <p>
                Backing endpoint: <code>GET /api/features</code> (all at once) or
                <code>GET /api/features/:key</code> (one in isolation). Each loader reseeds its own dedicated
                <code>feat_*</code> tables, so results are deterministic and independent of the <code>acme</code> seed.
                Full source is on the <NuxtLink to="/source"><code>/source</code></NuxtLink> page.
            </p>
        </section>

        <section v-if="pending" class="card">
            <h2>Running 14 live demos…</h2>
        </section>

        <section v-else-if="error" class="card">
            <h2>Showcase failed to load</h2>
            <pre class="json">{{ String(error) }}</pre>
        </section>

        <template v-else>
            <section v-for="card in features" :key="card.key" class="card">
                <h2>
                    <span class="badge accent">{{ card.number }}</span>
                    {{ card.feature }}
                    <a
                        class="badge"
                        :href="`/api/features/${card.key}`"
                        target="_blank"
                        rel="noopener"
                        title="Run this feature in isolation"
                    >GET /api/features/{{ card.key }} ↗</a>
                </h2>

                <p class="what">{{ card.whatItShows }}</p>

                <div class="snippet-label">d1-eloquent</div>
                <pre class="json snippet">{{ card.snippet }}</pre>

                <div class="snippet-label">Live result</div>
                <pre v-if="card.error" class="json err">Error: {{ card.error }}</pre>
                <dl v-else class="kv result">
                    <template v-for="(val, key) in card.result" :key="key">
                        <dt><code>{{ key }}</code></dt>
                        <dd><code>{{ format(val) }}</code></dd>
                    </template>
                </dl>
            </section>
        </template>
    </div>
</template>

<script setup lang="ts">
interface FeatureCard {
    number: number;
    key: string;
    feature: string;
    whatItShows: string;
    snippet: string;
    result?: Record<string, unknown>;
    error?: string;
}
interface FeaturesEnvelope {
    ok: boolean;
    data?: { count: number; note: string; features: FeatureCard[] };
}

const { data, pending, error } = await useFetch<FeaturesEnvelope>("/api/features", {
    default: (): FeaturesEnvelope => ({ ok: false }),
});

const features = computed<FeatureCard[]>(() => data.value?.data?.features ?? []);

function format(val: unknown): string {
    if (typeof val === "string") return val;
    return JSON.stringify(val);
}
</script>

<style scoped>
.what {
    margin: 0 0 0.75rem;
    color: var(--fg);
}
.snippet-label {
    color: var(--fg-dim);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0.75rem 0 0.35rem;
}
pre.snippet {
    color: var(--accent-2);
    white-space: pre;
}
pre.err {
    color: var(--warn);
}
.result {
    font-size: 0.88rem;
    align-items: start;
}
.result dt {
    color: var(--fg-dim);
}
.result dd code {
    color: var(--accent);
    word-break: break-word;
}
h2 a.badge {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
}
</style>
