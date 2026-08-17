<script setup lang="ts">
import { computed, ref, watch } from "vue";

interface FileEntry {
    name: string;
    path: string;
    content: string;
}
interface FileGroup {
    id: string;
    label: string;
    blurb: string;
    files: FileEntry[];
}

// Fetched from /source-bundle.json — a static asset generated at build time
// by `scripts/build-source-bundle.ts` (wired to predev / prebuild). Static
// asset keeps it portable across Workers / Pages without needing fs at runtime
// and without crossing Nuxt's server-dir import boundary.
const { data: payload } = await useFetch<{ groups: FileGroup[] }>(
    "/source-bundle.json",
    { default: () => ({ groups: [] }) },
);
const groups = computed<FileGroup[]>(() => payload.value?.groups ?? []);

const activeGroup = ref<string>("");
const activeFile = ref<string>("");

watch(groups, (g) => {
    if (!activeGroup.value && g.length > 0) {
        activeGroup.value = g[0]!.id;
        activeFile.value = g[0]!.files[0]?.name ?? "";
    }
}, { immediate: true });

const currentGroup = computed(() => groups.value.find((g) => g.id === activeGroup.value));
const currentFile = computed(() => currentGroup.value?.files.find((f) => f.name === activeFile.value) ?? currentGroup.value?.files[0]);

function selectGroup(id: string) {
    activeGroup.value = id;
    const first = groups.value.find((g) => g.id === id)?.files[0];
    if (first) activeFile.value = first.name;
}

// Lightweight TS highlighter — same approach as SectionSwitch / docs site.
const KEYWORDS = new Set([
    "const", "let", "var", "function", "class", "extends", "new", "return",
    "await", "async", "if", "else", "export", "import", "from", "static",
    "interface", "type", "true", "false", "null", "undefined", "public", "private",
    "default", "as", "of", "in", "void", "this", "throw", "try", "catch",
    "finally", "switch", "case", "break", "continue", "for", "while", "do",
]);

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(raw: string): string {
    return raw.split("\n").map((line) => {
        let out = "", i = 0;
        const len = line.length;
        while (i < len) {
            const ch = line[i]!;
            // line comment to EOL
            if (ch === "/" && line[i + 1] === "/") {
                out += `<span class="t-c">${esc(line.slice(i))}</span>`;
                return out;
            }
            // block-comment fragment (single-line)
            if (ch === "/" && line[i + 1] === "*") {
                const end = line.indexOf("*/", i + 2);
                const stop = end === -1 ? len : end + 2;
                out += `<span class="t-c">${esc(line.slice(i, stop))}</span>`;
                i = stop;
                continue;
            }
            // strings
            if (ch === '"' || ch === "'" || ch === "`") {
                const q = ch;
                let j = i + 1;
                while (j < len) {
                    if (line[j] === "\\") { j += 2; continue; }
                    if (line[j] === q) { j++; break; }
                    j++;
                }
                out += `<span class="t-s">${esc(line.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // numbers
            if (/\d/.test(ch)) {
                let j = i + 1;
                while (j < len && /[\d.]/.test(line[j]!)) j++;
                out += `<span class="t-l">${esc(line.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // identifiers / keywords
            if (/[A-Za-z_$]/.test(ch)) {
                let j = i + 1;
                while (j < len && /[A-Za-z0-9_$]/.test(line[j]!)) j++;
                const w = line.slice(i, j);
                out += KEYWORDS.has(w) ? `<span class="t-kw">${esc(w)}</span>` : esc(w);
                i = j;
                continue;
            }
            out += esc(ch);
            i++;
        }
        return out;
    }).join("\n");
}

const fileHtml = computed(() => currentFile.value ? highlight(currentFile.value.content) : "");
const githubBase = "https://github.com/Orphnet/d1-eloquent-examples/blob/develop/";
</script>

<template>
    <div>
        <section class="card">
            <h2>Source</h2>
            <p>
                The complete source for this Nuxt 4 + Nitro example — migrations, models, server routes, and the
                <code>configure(env)</code> util that wires it into <code>@orphnet/d1-eloquent</code>. Same migrations and
                model classes drive the <a href="https://hono-example.d1-eloquent.orph.dev">Hono sibling deployment</a>.
            </p>
            <p>
                <NuxtLink to="/">← back to the live demo</NuxtLink>
            </p>
        </section>

        <section class="card source">
            <nav class="source__groups">
                <button
                    v-for="g in groups"
                    :key="g.id"
                    :class="['source__group', { active: g.id === activeGroup }]"
                    @click="selectGroup(g.id)"
                >
                    {{ g.label }}
                    <span class="source__count">{{ g.files.length }}</span>
                </button>
            </nav>

            <p v-if="currentGroup" class="source__blurb">{{ currentGroup.blurb }}</p>

            <div class="source__layout">
                <aside class="source__files">
                    <ul>
                        <li v-for="f in currentGroup?.files" :key="f.name">
                            <button
                                :class="['source__file', { active: f.name === activeFile }]"
                                @click="activeFile = f.name"
                            >
                                {{ f.name }}
                            </button>
                        </li>
                    </ul>
                </aside>

                <div v-if="currentFile" class="source__viewer">
                    <div class="source__chrome">
                        <span class="source__path">{{ currentFile.path }}</span>
                        <a
                            class="source__link"
                            :href="githubBase + currentFile.path"
                            target="_blank"
                            rel="noopener"
                        >View on GitHub ↗</a>
                    </div>
                    <pre class="source__body"><code v-html="fileHtml" /></pre>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.source {
    padding: 1.25rem;
}
.source__groups {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 0.75rem;
}
.source__group {
    appearance: none;
    background: var(--bg-elev);
    border: 1px solid var(--rule);
    color: var(--fg-dim);
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 150ms;
}
.source__group:hover { color: var(--fg); border-color: rgba(110, 231, 183, 0.35); }
.source__group.active {
    background: rgba(110, 231, 183, 0.12);
    color: var(--accent);
    border-color: rgba(110, 231, 183, 0.35);
}
.source__count {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.7rem;
    color: var(--fg-dim);
    background: var(--bg);
    padding: 1px 6px;
    border-radius: 999px;
}
.source__blurb {
    color: var(--fg-dim);
    font-size: 0.9rem;
    margin: 0 0 1rem;
}

.source__layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 1rem;
    align-items: start;
}

.source__files ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 540px;
    overflow-y: auto;
    border-right: 1px solid var(--rule);
    padding-right: 8px;
}
.source__file {
    appearance: none;
    background: transparent;
    border: 0;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.78rem;
    color: var(--fg-dim);
    transition: all 100ms;
    word-break: break-all;
}
.source__file:hover { color: var(--fg); background: var(--bg-elev); }
.source__file.active {
    background: rgba(110, 231, 183, 0.12);
    color: var(--accent);
}

.source__viewer {
    background: var(--bg);
    border: 1px solid var(--rule);
    border-radius: 8px;
    overflow: hidden;
}
.source__chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--rule);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
}
.source__path { color: var(--fg-dim); }
.source__link {
    color: var(--accent-2);
    text-decoration: none;
}
.source__link:hover { color: var(--accent); }
.source__body {
    margin: 0;
    padding: 16px 18px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--fg);
    overflow-x: auto;
    overflow-y: auto;
    white-space: pre;
    max-height: 540px;
}
.source__body :deep(.t-kw)  { color: var(--accent-2); }
.source__body :deep(.t-s)   { color: var(--accent); }
.source__body :deep(.t-l)   { color: #facc15; }
.source__body :deep(.t-c)   { color: var(--fg-dim); font-style: italic; }

@media (max-width: 720px) {
    .source__layout { grid-template-columns: 1fr; }
    .source__files ul { max-height: 200px; border-right: 0; padding-right: 0; }
}
</style>
