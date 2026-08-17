<template>
    <div>
        <section class="card">
            <h2>About this demo</h2>
            <p>
                A multi-tenant workspace platform — projects, tasks, posts, comments, tags, and an activity feed — built on
                <strong>Nuxt 4</strong> with all server routes hitting
                <strong>Cloudflare D1</strong> directly via <code>@orphnet/d1-eloquent</code>. No separate API tier.
            </p>
            <p>
                Each card below has a <strong>Result / d1-eloquent / SQL</strong> toggle so you can see the rendered data, the ORM code that produced it, and the actual prepared statement d1-eloquent emits. The full source for every model, migration and seed lives on the <NuxtLink to="/source"><code>/source</code></NuxtLink> page.
            </p>
            <p>
                The Hono sibling example at
                <a href="https://hono-example.d1-eloquent.orph.dev">hono-example.d1-eloquent.orph.dev</a>
                exposes the same endpoints with identical responses; both apps use the
                <strong>same migrations and the same models</strong> — only the HTTP transport differs.
            </p>
        </section>

        <section class="card" v-if="pending">
            <h2>Loading…</h2>
        </section>

        <section v-else-if="error" class="card">
            <h2>Backend not ready</h2>
            <p>
                The workspace hasn't been seeded yet. Hit the seed endpoint, then refresh:
            </p>
            <pre class="json">curl -X POST {{ origin }}/api/admin/seed?fresh=1</pre>
            <p style="margin-top: 0.5rem;">
                <button @click="seed" :disabled="seeding">
                    {{ seeding ? "Seeding…" : "Run seed now →" }}
                </button>
            </p>
            <pre v-if="seedResult" class="json">{{ JSON.stringify(seedResult, null, 2) }}</pre>
        </section>

        <template v-else-if="workspace">
            <section class="card">
                <h2>Workspace: {{ workspace.name }}</h2>
                <SectionSwitch
                    :orm="snippets.workspace.orm"
                    :sql="snippets.workspace.sql"
                    :bindings="snippets.workspace.bindings"
                    note="withCount eager-aggregates + members belongsToMany + settings JSON cast in a single query batch."
                >
                    <dl class="kv">
                        <dt>Slug</dt><dd><code>{{ workspace.slug }}</code></dd>
                        <dt>Members</dt><dd><span class="badge accent">{{ workspace.members_count }}</span></dd>
                        <dt>Projects</dt><dd><span class="badge accent">{{ workspace.projects_count }}</span></dd>
                        <dt>Posts</dt><dd><span class="badge accent">{{ workspace.posts_count }}</span></dd>
                        <dt>Settings (JSON cast)</dt><dd><code>{{ JSON.stringify(workspace.settings) }}</code></dd>
                    </dl>
                </SectionSwitch>
            </section>

            <div class="grid grid-2">
                <section class="card">
                    <h2>Members <span class="badge">belongsToMany</span></h2>
                    <SectionSwitch
                        :orm="snippets.members.orm"
                        :sql="snippets.members.sql"
                        :bindings="snippets.members.bindings"
                        note="Pivot row joins workspace_members → users; eager-loaded along with the workspace."
                    >
                        <ul class="list">
                            <li v-for="m in workspace.members" :key="m.id">
                                <strong>{{ m.name }}</strong>
                                <span class="badge" style="margin-left: 0.5em;" v-if="m.is_admin">admin</span>
                                <div style="color: var(--fg-dim); font-size: 0.85rem;">{{ m.email }}</div>
                            </li>
                        </ul>
                    </SectionSwitch>
                </section>

                <section class="card">
                    <h2>Projects <span class="badge">withCount("tasks")</span></h2>
                    <SectionSwitch
                        :orm="snippets.projects.orm"
                        :sql="snippets.projects.sql"
                        :bindings="snippets.projects.bindings"
                        note="One main SELECT + a correlated subquery for the count; no second round-trip."
                    >
                        <ul class="list">
                            <li v-for="p in projects" :key="p.id">
                                <strong>{{ p.name }}</strong>
                                <span class="badge accent" style="margin-left: 0.5em;">{{ p.tasks_count }} tasks</span>
                                <div style="color: var(--fg-dim); font-size: 0.85rem;">{{ p.description }}</div>
                            </li>
                        </ul>
                    </SectionSwitch>
                </section>
            </div>

            <section class="card">
                <h2>Tasks (default scope: open + in_progress) <span class="badge">morphToMany("tags")</span></h2>
                <SectionSwitch
                    :orm="snippets.tasks.orm"
                    :sql="snippets.tasks.sql"
                    :bindings="snippets.tasks.bindings"
                    note="Subquery filter on project_id, plus a second batched query for tags via the shared 'taggables' pivot scoped to taggable_type='task'."
                >
                    <ul class="list">
                        <li v-for="t in tasks.slice(0, 8)" :key="t.id">
                            <div style="display: flex; justify-content: space-between; gap: 1em;">
                                <strong>{{ t.title }}</strong>
                                <span>
                                    <span class="badge" :class="t.status === 'done' ? 'accent' : t.status === 'in_progress' ? 'warn' : ''">{{ t.status }}</span>
                                    <span class="badge">P{{ t.priority }}</span>
                                </span>
                            </div>
                            <div style="color: var(--fg-dim); font-size: 0.85rem; margin-top: 0.25rem;">
                                <span v-if="t.assignee">→ {{ t.assignee.name }}</span>
                                <span v-if="t.tags?.length" style="margin-left: 0.5em;">
                                    <span class="badge" v-for="tg in t.tags" :key="tg.id">{{ tg.label }}</span>
                                </span>
                            </div>
                        </li>
                    </ul>
                    <p style="margin: 1rem 0 0; color: var(--fg-dim); font-size: 0.85rem;">
                        Showing 8 of {{ tasks.length }}. Try
                        <a :href="`/api/workspaces/${slug}/tasks?status=done`"><code>/api/workspaces/{{ slug }}/tasks?status=done</code></a>
                        to see completed ones.
                    </p>
                </SectionSwitch>
            </section>

            <section class="card">
                <h2>Posts <span class="badge">paginateCursor</span></h2>
                <SectionSwitch
                    :orm="snippets.posts.orm"
                    :sql="snippets.posts.sql"
                    :bindings="snippets.posts.bindings"
                    note="Keyset pagination — fetches perPage+1 rows, encodes the trailing key into the opaque cursor. No offset drift under concurrent inserts."
                >
                    <ul class="list">
                        <li v-for="p in posts" :key="p.id">
                            <strong>
                                <NuxtLink :to="`/posts/${p.slug}`">{{ p.title }}</NuxtLink>
                            </strong>
                            <span class="badge" style="margin-left: 0.5em;">{{ p.view_count }} views</span>
                            <div style="color: var(--fg-dim); font-size: 0.85rem;">by {{ p.author?.name }} — {{ formatDate(p.published_at) }}</div>
                        </li>
                    </ul>
                    <p style="margin: 1rem 0 0; color: var(--fg-dim); font-size: 0.85rem;" v-if="nextCursor">
                        Cursor: <code>{{ nextCursor.slice(0, 20) }}…</code> ·
                        Next page: <code>?after={{ nextCursor.slice(0, 12) }}…</code>
                    </p>
                </SectionSwitch>
            </section>

            <section class="card">
                <h2>Activity feed <span class="badge">morphTo (actor + subject)</span></h2>
                <SectionSwitch
                    :orm="snippets.feed.orm"
                    :sql="snippets.feed.sql"
                    :bindings="snippets.feed.bindings"
                    note="morphTo eager-load batches all subject_ids per type into one SELECT, then maps them back to the parent events."
                >
                    <ul class="list">
                        <li v-for="e in feed.slice(0, 6)" :key="e.id">
                            <strong>{{ e.verb }}</strong>
                            <span style="color: var(--fg-dim);"> by {{ e.actor?.name || "system" }}</span>
                            <div style="color: var(--fg-dim); font-size: 0.85rem;">
                                {{ e.subject_type }} →
                                {{ e.subject?.title || e.subject?.name || e.subject?.body?.slice(0, 60) || "(deleted)" }}
                            </div>
                        </li>
                    </ul>
                </SectionSwitch>
            </section>

            <section class="card">
                <h2>Try the API directly</h2>
                <p style="color: var(--fg-dim); font-size: 0.9rem; margin-top: 0;">
                    GETtable links open the live JSON in a new tab. Write endpoints (POST/PATCH/DELETE) are listed below as <code>curl</code> recipes.
                </p>
                <ul class="list">
                    <li v-for="ep in liveLinks" :key="ep.href">
                        <a :href="ep.href" target="_blank" rel="noopener">
                            <code>GET {{ ep.label }}</code>
                        </a>
                    </li>
                </ul>
                <details style="margin-top: 1rem;">
                    <summary style="cursor: pointer; color: var(--fg-dim);">curl recipes for write endpoints (POST / PATCH / DELETE)</summary>
                    <pre class="json" style="margin-top: 0.5rem;">{{ curlRecipes }}</pre>
                </details>
                <details style="margin-top: 0.5rem;">
                    <summary style="cursor: pointer; color: var(--fg-dim);">full manifest from /api</summary>
                    <ul class="list" style="margin-top: 0.5rem;">
                        <li v-for="e in endpoints" :key="e"><code>{{ e }}</code></li>
                    </ul>
                </details>
            </section>
        </template>
    </div>
</template>

<script setup lang="ts">
import SectionSwitch from "../components/SectionSwitch.vue";

const slug = "acme";
const origin = ref("");

// Per-section ORM + SQL snippets shown by the Result / d1-eloquent / SQL toggle.
// These are pulled verbatim from `server/api/**/*.ts` and the prepared statements
// d1-eloquent emits at runtime. View the full source in /source.
const snippets = {
    workspace: {
        orm: `// server/api/workspaces/[slug].get.ts
const ws = await Workspace.query()
    .whereEq('slug', slug)
    .withCount('projects')
    .withCount('posts')
    .withCount('members')
    .with(['members'])
    .first()

return ok(event, {
    ...(ws as any).toJSON(),
    members_count:  (ws as any).get('members_count'),
    projects_count: (ws as any).get('projects_count'),
    posts_count:    (ws as any).get('posts_count'),
})`,
        sql: `-- 1) Main row with three correlated count subqueries
SELECT
  workspaces.*,
  (SELECT COUNT(*) FROM projects
    WHERE projects.workspace_id = workspaces.id
      AND projects.deleted_at IS NULL) AS projects_count,
  (SELECT COUNT(*) FROM posts
    WHERE posts.workspace_id = workspaces.id
      AND posts.deleted_at IS NULL) AS posts_count,
  (SELECT COUNT(*) FROM workspace_members
    WHERE workspace_members.workspace_id = workspaces.id) AS members_count
FROM workspaces
WHERE slug = ?
  AND deleted_at IS NULL
LIMIT 1

-- 2) Eager-load belongsToMany('members') via pivot
SELECT
  workspace_members.workspace_id AS __pivot_fk,
  users.*
FROM users
INNER JOIN workspace_members
  ON workspace_members.user_id = users.id
WHERE workspace_members.workspace_id IN (?)
  AND users.deleted_at IS NULL`,
        bindings: "['acme', <workspaceId>]",
    },
    members: {
        orm: `// belongsToMany declared on the Workspace model
class Workspace extends BaseModel<WorkspaceAttrs> {
    static table = 'workspaces'
    static relations = {
        members: {
            type: 'belongsToMany',
            model: () => User,
            pivot: 'workspace_members',
            foreignPivotKey: 'workspace_id',
            relatedPivotKey:  'user_id',
            extras: ['role', 'joined_at'],
        },
    }
}

// Eager-loaded along with the workspace via .with(['members'])`,
        sql: `SELECT
  workspace_members.workspace_id AS __pivot_fk,
  workspace_members.role,
  workspace_members.joined_at,
  users.*
FROM users
INNER JOIN workspace_members
  ON workspace_members.user_id = users.id
WHERE workspace_members.workspace_id IN (?)
  AND users.deleted_at IS NULL`,
        bindings: "[<workspaceId>]",
    },
    projects: {
        orm: `// server/api/workspaces/[slug]/projects.get.ts
const projects = await Project.query()
    .whereEq('workspace_id', (ws as any).get('id'))
    .withCount('tasks')
    .orderBy('name')
    .get()`,
        sql: `SELECT
  projects.*,
  (SELECT COUNT(*) FROM tasks
    WHERE tasks.project_id = projects.id
      AND tasks.deleted_at IS NULL) AS tasks_count
FROM projects
WHERE workspace_id = ?
  AND deleted_at IS NULL
ORDER BY name ASC`,
        bindings: "[<workspaceId>]",
    },
    tasks: {
        orm: `// server/api/workspaces/[slug]/tasks.get.ts
const qb = Task.query()
    .whereIn(
        'project_id',
        Project.query().select(['id'])
            .whereEq('workspace_id', (ws as any).get('id')),
    )
    .with(['assignee', 'tags'])
    .orderBy('priority', 'desc')
    .orderBy('created_at', 'desc')

if (status) qb.whereEq('status', status)
else        qb.scoped('open')   // open + in_progress

const tasks = await qb.get()`,
        sql: `-- 1) Tasks for projects in this workspace, default scope
SELECT * FROM tasks
WHERE project_id IN (
    SELECT id FROM projects
    WHERE workspace_id = ?
      AND deleted_at IS NULL
)
  AND status IN (?, ?)
  AND deleted_at IS NULL
ORDER BY priority DESC, created_at DESC

-- 2) Eager-loaded assignees (belongsTo)
SELECT * FROM users
WHERE id IN (?, ?, ?, ...)
  AND deleted_at IS NULL

-- 3) Eager-loaded tags via shared 'taggables' pivot (morphToMany)
SELECT
  taggables.taggable_id AS __pivot_fk,
  tags.*
FROM tags
INNER JOIN taggables ON taggables.tag_id = tags.id
WHERE taggables.taggable_type = ?
  AND taggables.taggable_id IN (?, ?, ?, ...)`,
        bindings: "[<workspaceId>, 'open', 'in_progress', ...assigneeIds, 'task', ...taskIds]",
    },
    posts: {
        orm: `// server/api/workspaces/[slug]/posts/index.get.ts
const page = await Post.query()
    .whereEq('workspace_id', (ws as any).get('id'))
    .whereEq('status', 'published')
    .with(['author'])
    .paginateCursor({
        orderBy: 'published_at',
        direction: 'desc',
        perPage,
        ...(after ? { after } : {}),
    })

// page.data         — Post[]
// page.nextCursor   — opaque base64url string
// page.hasMore      — boolean (computed by fetching perPage+1)`,
        sql: `-- Keyset pagination — fetch perPage+1 rows, encode the
-- trailing (published_at, id) as the next cursor.
SELECT * FROM posts
WHERE workspace_id = ?
  AND status = ?
  AND deleted_at IS NULL
  AND (
    published_at < ?
    OR (published_at = ? AND id < ?)
  )                                  -- only when ?after=<cursor> supplied
ORDER BY published_at DESC, id DESC
LIMIT 11

-- Eager-load authors (belongsTo)
SELECT * FROM users
WHERE id IN (?, ?, ?, ...)
  AND deleted_at IS NULL`,
        bindings: "[<workspaceId>, 'published', cursor.published_at, cursor.published_at, cursor.id, ...authorIds]",
    },
    feed: {
        orm: `// server/api/feed.get.ts
const page = await ActivityEvent.query()
    .whereEq('workspace_id', (ws as any).get('id'))
    .with(['actor', 'subject'])     // actor = belongsTo User
                                    // subject = morphTo (Task | Post)
    .paginateCursor({
        orderBy: 'created_at',
        direction: 'desc',
        perPage,
        ...(after ? { after } : {}),
    })`,
        sql: `-- 1) Events for this workspace (keyset paginated)
SELECT * FROM activity_events
WHERE workspace_id = ?
ORDER BY created_at DESC, id DESC
LIMIT 21

-- 2) Eager-load actors (belongsTo)
SELECT * FROM users
WHERE id IN (?, ?, ?, ...)
  AND deleted_at IS NULL

-- 3) morphTo subject — one SELECT per subject_type
-- d1-eloquent groups events by subject_type, then batches each group:
SELECT * FROM tasks
WHERE id IN (?, ?, ...) AND deleted_at IS NULL

SELECT * FROM posts
WHERE id IN (?, ?, ...) AND deleted_at IS NULL`,
        bindings: "[<workspaceId>, ...actorIds, ...taskSubjectIds, ...postSubjectIds]",
    },
} as const;

if (import.meta.client) {
    origin.value = window.location.origin;
}

const seeding = ref(false);
const seedResult = ref<unknown>(null);

const { data: workspace, error, pending, refresh: refreshWorkspace } = await useFetch<any>(`/api/workspaces/${slug}`, {
    transform: (r: any) => r?.data,
    default: () => null,
});

const { data: projects, refresh: refreshProjects } = await useFetch<any>(`/api/workspaces/${slug}/projects`, {
    transform: (r: any) => r?.data,
    default: () => [],
});

const { data: tasks, refresh: refreshTasks } = await useFetch<any>(`/api/workspaces/${slug}/tasks`, {
    transform: (r: any) => r?.data,
    default: () => [],
});

const { data: postsResp, refresh: refreshPosts } = await useFetch<any>(`/api/workspaces/${slug}/posts`, {
    transform: (r: any) => r?.data,
    default: () => ({ data: [], nextCursor: null, hasMore: false }),
});
const posts = computed(() => postsResp.value?.data ?? []);
const nextCursor = computed(() => postsResp.value?.nextCursor ?? null);

const { data: feed, refresh: refreshFeed } = await useFetch<any>(`/api/feed?workspace=${slug}`, {
    transform: (r: any) => r?.data?.data ?? [],
    default: () => [],
});

const { data: manifest } = await useFetch<any>("/api", {
    transform: (r: any) => r?.data?.endpoints ?? [],
    default: () => [],
});
const endpoints = manifest;

const liveLinks = computed(() => {
    const firstPost = posts.value?.[0];
    const firstTask = tasks.value?.[0];
    const out: { label: string; href: string }[] = [
        { label: "/api", href: "/api" },
        { label: "/api/workspaces", href: "/api/workspaces" },
        { label: `/api/workspaces/${slug}`, href: `/api/workspaces/${slug}` },
        { label: `/api/workspaces/${slug}/projects`, href: `/api/workspaces/${slug}/projects` },
        { label: `/api/workspaces/${slug}/tasks`, href: `/api/workspaces/${slug}/tasks` },
        { label: `/api/workspaces/${slug}/tasks?status=done`, href: `/api/workspaces/${slug}/tasks?status=done` },
        { label: `/api/workspaces/${slug}/posts`, href: `/api/workspaces/${slug}/posts` },
    ];
    if (firstPost?.slug) {
        out.push({
            label: `/api/workspaces/${slug}/posts/${firstPost.slug}`,
            href: `/api/workspaces/${slug}/posts/${firstPost.slug}`,
        });
        out.push({ label: `/api/audit/post/${firstPost.id}`, href: `/api/audit/post/${firstPost.id}` });
    }
    if (firstTask?.id) {
        out.push({ label: `/api/audit/task/${firstTask.id}`, href: `/api/audit/task/${firstTask.id}` });
    }
    out.push({ label: `/api/feed?workspace=${slug}`, href: `/api/feed?workspace=${slug}` });
    out.push({ label: "/api/search?q=lorem", href: "/api/search?q=lorem" });
    out.push({ label: "/api/tags", href: "/api/tags" });
    return out;
});

const curlRecipes = computed(() => {
    const o = origin.value || "https://nuxt-example.d1-eloquent.orph.dev";
    const taskId = tasks.value?.[0]?.id ?? "<task-id>";
    const tagId = "<tag-id>  # GET /api/tags";
    const subjectId = taskId;
    const authorId = workspace.value?.members?.[0]?.id ?? "<user-id>";
    return [
        `# Re-seed (wipes + reseeds the workspace)`,
        `curl -X POST ${o}/api/admin/seed?fresh=1`,
        ``,
        `# Create a task (records an activity event + create revision)`,
        `curl -X POST ${o}/api/workspaces/${slug}/tasks \\`,
        `  -H "content-type: application/json" \\`,
        `  -d '{"project_id":"<project-id>","title":"new task","priority":3}'`,
        ``,
        `# Update a task (writes a revision row)`,
        `curl -X PATCH ${o}/api/workspaces/${slug}/tasks/${taskId} \\`,
        `  -H "content-type: application/json" \\`,
        `  -d '{"status":"done","priority":5}'`,
        ``,
        `# Soft-delete a task`,
        `curl -X DELETE ${o}/api/workspaces/${slug}/tasks/${taskId}`,
        ``,
        `# Comment on a task (morphMany)`,
        `curl -X POST ${o}/api/workspaces/${slug}/tasks/${taskId}/comments \\`,
        `  -H "content-type: application/json" \\`,
        `  -d '{"author_id":"${authorId}","body":"LGTM"}'`,
        ``,
        `# Attach a tag to a task (morphToMany pivot)`,
        `curl -X POST ${o}/api/tags/${tagId}/attach \\`,
        `  -H "content-type: application/json" \\`,
        `  -d '{"subject_type":"task","subject_id":"${subjectId}"}'`,
        ``,
        `# Sync a task's tags (replace the full set)`,
        `curl -X POST ${o}/api/tags/sync \\`,
        `  -H "content-type: application/json" \\`,
        `  -d '{"subject_type":"task","subject_id":"${subjectId}","tag_ids":["<tag1>","<tag2>"]}'`,
    ].join("\n");
});

async function seed() {
    seeding.value = true;
    try {
        const r = await $fetch<any>("/api/admin/seed?fresh=1", { method: "POST" });
        seedResult.value = r?.data ?? r;
        await Promise.all([
            refreshWorkspace(),
            refreshProjects(),
            refreshTasks(),
            refreshPosts(),
            refreshFeed(),
        ]);
    } finally {
        seeding.value = false;
    }
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); }
    catch { return iso; }
}
</script>
