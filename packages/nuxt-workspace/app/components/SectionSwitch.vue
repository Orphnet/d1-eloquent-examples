<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
    orm?: string
    sql?: string
    bindings?: string
    /** Free-form helper text shown above the code views. */
    note?: string
}>()

type View = 'result' | 'orm' | 'sql'
const view = ref<View>('result')

const TS_KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'class', 'extends', 'new', 'return',
    'await', 'async', 'if', 'else', 'export', 'import', 'from', 'static',
    'interface', 'type', 'true', 'false', 'null', 'undefined', 'public', 'private',
])
const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
    'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'UPDATE', 'SET',
    'INSERT', 'INTO', 'VALUES', 'EXISTS', 'IN', 'AS', 'DESC', 'ASC',
    'IGNORE', 'NULL', 'IS', 'NOT', 'OFFSET',
])

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightTs(raw: string): string {
    return raw.split('\n').map(line => {
        let out = '', i = 0
        const len = line.length
        while (i < len) {
            const ch = line[i]!
            if (ch === '/' && line[i + 1] === '/') {
                out += `<span class="t-c">${esc(line.slice(i))}</span>`
                return out
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                const q = ch
                let j = i + 1
                while (j < len) {
                    if (line[j] === '\\') { j += 2; continue }
                    if (line[j] === q) { j++; break }
                    j++
                }
                out += `<span class="t-s">${esc(line.slice(i, j))}</span>`
                i = j
                continue
            }
            if (/\d/.test(ch)) {
                let j = i + 1
                while (j < len && /[\d.]/.test(line[j]!)) j++
                out += `<span class="t-l">${esc(line.slice(i, j))}</span>`
                i = j
                continue
            }
            if (/[A-Za-z_$]/.test(ch)) {
                let j = i + 1
                while (j < len && /[A-Za-z0-9_$]/.test(line[j]!)) j++
                const w = line.slice(i, j)
                out += TS_KEYWORDS.has(w) ? `<span class="t-kw">${esc(w)}</span>` : esc(w)
                i = j
                continue
            }
            out += esc(ch)
            i++
        }
        return out
    }).join('\n')
}

function highlightSql(raw: string): string {
    return raw.split('\n').map(line => {
        if (line.trimStart().startsWith('--')) return `<span class="t-c">${esc(line)}</span>`
        let out = '', i = 0
        const len = line.length
        while (i < len) {
            const ch = line[i]!
            if (ch === '?') {
                out += `<span class="t-l">?</span>`
                i++
                continue
            }
            if (ch === "'" || ch === '"') {
                const q = ch
                let j = i + 1
                while (j < len) {
                    if (line[j] === '\\') { j += 2; continue }
                    if (line[j] === q) { j++; break }
                    j++
                }
                out += `<span class="t-s">${esc(line.slice(i, j))}</span>`
                i = j
                continue
            }
            if (/[A-Za-z_]/.test(ch)) {
                let j = i + 1
                while (j < len && /[A-Za-z0-9_]/.test(line[j]!)) j++
                const w = line.slice(i, j)
                out += SQL_KEYWORDS.has(w.toUpperCase()) ? `<span class="t-kw">${esc(w)}</span>` : esc(w)
                i = j
                continue
            }
            if (/\d/.test(ch)) {
                let j = i + 1
                while (j < len && /[\d.]/.test(line[j]!)) j++
                out += `<span class="t-l">${esc(line.slice(i, j))}</span>`
                i = j
                continue
            }
            out += esc(ch)
            i++
        }
        return out
    }).join('\n')
}

const ormHtml = computed(() => props.orm ? highlightTs(props.orm) : '')
const sqlHtml = computed(() => props.sql ? highlightSql(props.sql) : '')
</script>

<template>
    <div class="switch">
        <div class="switch__tabs" role="tablist" aria-label="View mode">
            <button
                v-for="v in (['result', 'orm', 'sql'] as const)"
                :key="v"
                role="tab"
                :aria-selected="view === v"
                :class="['switch__tab', { active: view === v }]"
                :disabled="(v === 'orm' && !orm) || (v === 'sql' && !sql)"
                @click="view = v"
            >
                <span class="switch__dot" :class="`switch__dot--${v}`" />
                {{ v === 'result' ? 'Result' : v === 'orm' ? 'd1-eloquent' : 'SQL' }}
            </button>
        </div>

        <div v-show="view === 'result'" class="switch__pane switch__pane--result">
            <slot />
        </div>

        <div v-show="view === 'orm'" class="switch__pane switch__pane--code">
            <p v-if="note" class="switch__note">{{ note }}</p>
            <div class="code">
                <div class="code__chrome">
                    <span class="code__filename">server/api/...</span>
                    <span class="code__badge">d1-eloquent</span>
                </div>
                <pre class="code__body" v-html="ormHtml" />
            </div>
        </div>

        <div v-show="view === 'sql'" class="switch__pane switch__pane--code">
            <p v-if="note" class="switch__note">{{ note }}</p>
            <div class="code">
                <div class="code__chrome">
                    <span class="code__filename">prepared by d1-eloquent</span>
                    <span class="code__badge code__badge--sql">D1 SQL</span>
                </div>
                <pre class="code__body" v-html="sqlHtml" />
                <div v-if="bindings" class="code__bindings">
                    <span class="code__bindings-label">Bindings</span>
                    <code>{{ bindings }}</code>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.switch {
    margin-bottom: 1rem;
}
.switch__tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
}
.switch__tab {
    appearance: none;
    background: var(--bg-elev);
    border: 1px solid var(--rule);
    color: var(--fg-dim);
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 150ms;
}
.switch__tab:hover:not(:disabled) {
    color: var(--fg);
    border-color: rgba(110, 231, 183, 0.35);
}
.switch__tab.active {
    background: rgba(110, 231, 183, 0.12);
    color: var(--accent);
    border-color: rgba(110, 231, 183, 0.35);
}
.switch__tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.switch__dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.7;
}
.switch__dot--result { background: var(--accent); }
.switch__dot--orm { background: var(--accent-2); }
.switch__dot--sql { background: #facc15; }

.switch__pane {
    min-height: 1px;
}
.switch__note {
    margin: 0 0 0.5rem;
    color: var(--fg-dim);
    font-size: 0.82rem;
    font-style: italic;
}

.code {
    background: var(--bg);
    border: 1px solid var(--rule);
    border-radius: 8px;
    overflow: hidden;
}
.code__chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--rule);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
}
.code__filename { color: var(--fg-dim); }
.code__badge {
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(110, 231, 183, 0.14);
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}
.code__badge--sql {
    background: rgba(250, 204, 21, 0.14);
    color: #facc15;
}
.code__body {
    margin: 0;
    padding: 14px 18px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--fg);
    overflow-x: auto;
    white-space: pre;
    max-height: 360px;
}
:deep(.t-kw)  { color: var(--accent-2); }
:deep(.t-s)   { color: var(--accent); }
:deep(.t-l)   { color: #facc15; }
:deep(.t-c)   { color: var(--fg-dim); font-style: italic; }

.code__bindings {
    padding: 10px 18px;
    border-top: 1px dashed var(--rule);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.code__bindings-label {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
    color: var(--fg-dim);
    letter-spacing: 0.1em;
    text-transform: uppercase;
}
.code__bindings code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11.5px;
    color: #facc15;
    background: rgba(250, 204, 21, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
}
</style>
