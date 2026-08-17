<template>
    <div>
        <p><NuxtLink to="/">← back to workspace</NuxtLink></p>
        <article class="card" v-if="post">
            <h3>{{ post.title }}</h3>
            <p style="color: var(--fg-dim); font-size: 0.9rem;">
                by {{ post.author?.name }} —
                {{ post.published_at ? new Date(post.published_at).toLocaleString() : "draft" }} —
                <span class="badge">{{ post.view_count }} views</span>
            </p>
            <div style="white-space: pre-wrap; line-height: 1.7;">{{ post.body }}</div>
            <div style="margin-top: 1rem;" v-if="post.tags?.length">
                <span class="badge accent" v-for="t in post.tags" :key="t.id">{{ t.label }}</span>
            </div>
        </article>
        <p v-else>Loading…</p>
    </div>
</template>

<script setup lang="ts">
const route = useRoute();
const slug = route.params.slug as string;

const { data: post } = await useFetch<any>(`/api/workspaces/acme/posts/${slug}`, {
    transform: (r: any) => r?.data,
    default: () => null,
});
</script>
