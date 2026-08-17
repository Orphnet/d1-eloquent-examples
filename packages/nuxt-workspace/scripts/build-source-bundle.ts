/**
 * Build-time helper — writes `public/source-bundle.json` containing the
 * raw text of every model / migration / route / util file. The /source
 * page (client) fetches this static asset.
 *
 * Run via `bun run scripts/build-source-bundle.ts`, wired to `predev`
 * and `prebuild` in package.json so it stays current.
 *
 * Why not Vite import.meta.glob?
 * - Allowed in Vue components: but Nuxt blocks importing from server/ in the
 *   Vue layer.
 * - In a Nitro server route: Nitro doesn't run Rollup over server route
 *   handlers at dev-time, so `import.meta.glob` is undefined.
 *
 * A pre-build script is the simplest portable option — no runtime fs needed.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

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

function walk(dir: string, out: string[] = []): string[] {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const name of entries) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (name.endsWith(".ts") || name.endsWith(".vue") || name.endsWith(".jsonc")) {
            out.push(full);
        }
    }
    return out;
}

function group(label: string, blurb: string, id: string, files: string[]): FileGroup {
    const repoPrefix = "packages/nuxt-workspace/";
    return {
        id,
        label,
        blurb,
        files: files
            .map((full) => ({
                name: relative(ROOT, full),
                path: repoPrefix + relative(ROOT, full),
                content: readFileSync(full, "utf8"),
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
            // For server route group, strip the leading `server/api/` so the
            // displayed name is just the route file path.
            .map((f) => {
                if (id === "routes") {
                    return { ...f, name: f.name.replace(/^server\/api\//, "") };
                }
                if (id === "models") {
                    return { ...f, name: f.name.replace(/^server\/models\//, "") };
                }
                if (id === "migrations") {
                    return { ...f, name: f.name.replace(/^database\/migrations\//, "") };
                }
                if (id === "seeders") {
                    return { ...f, name: f.name.replace(/^database\/(seeders|factories)\//, "") };
                }
                if (id === "utils") {
                    return { ...f, name: f.name.replace(/^server\/utils\//, "") };
                }
                return f;
            }),
    };
}

const groups: FileGroup[] = [
    group(
        "Migrations",
        "Schema-builder definitions — one per domain entity.",
        "migrations",
        walk(join(ROOT, "database/migrations")),
    ),
    group(
        "Models",
        "BaseModel subclasses with relations, casts, hooks, and scopes.",
        "models",
        walk(join(ROOT, "server/models")),
    ),
    group(
        "Seeders & factories",
        "CLI seeders + factories (built-in faker) that populate the demo data.",
        "seeders",
        [...walk(join(ROOT, "database/seeders")), ...walk(join(ROOT, "database/factories"))],
    ),
    group(
        "Server routes",
        "Nitro filesystem-routed endpoints; each calls d1-eloquent directly.",
        "routes",
        walk(join(ROOT, "server/api")),
    ),
    group(
        "Utils",
        "configure(env) + response helpers used by every route.",
        "utils",
        walk(join(ROOT, "server/utils")),
    ),
];

const outDir = join(ROOT, "public");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "source-bundle.json");
writeFileSync(outPath, JSON.stringify({ groups }, null, 0));

const total = groups.reduce((n, g) => n + g.files.length, 0);
console.log(`✓ Wrote ${total} file(s) to public/source-bundle.json`);
for (const g of groups) {
    console.log(`  ${g.id}: ${g.files.length} file(s)`);
}
