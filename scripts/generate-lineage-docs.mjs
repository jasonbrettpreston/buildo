#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Data-Lineage Map Generator
//   → docs/reference/data-lineage-map.md
//
// AI-operator reference: for every enriched column, which pipeline step PRODUCES
// it and which steps CONSUME it — derived from the reads/writes contracts each
// step emits via pipeline.emitMeta (§R11) and merges into
// pipeline_runs.records_meta.pipeline_meta (run-chain.js).
//
// The DB pipeline_meta is PREFERRED over a static source parse because it
// resolves the COMPUTED emitMeta calls a static parse can't see (e.g.
// enrich-permits.js / link-coa.js build their column lists at runtime).
//
// Two-tier design keeps the drift-guard test DB-free + deterministic:
//   • `--refresh` (needs DB) queries the latest pipeline_meta per chain:step,
//     folds in a static emitMeta parse for one-time/backfill scripts that never
//     run in-chain, and writes BOTH the committed snapshot
//     (scripts/seeds/lineage-meta-snapshot.json) AND the doc.
//   • default / `--check` render the doc from the COMMITTED snapshot only — no
//     DB — so `data-lineage-map.infra.test.ts` can diff deterministically.
//
// Usage:
//   npm run lineage-docs -- --refresh   # re-read the live DB → snapshot + doc
//   npm run lineage-docs                # regenerate doc from the committed snapshot
//   node scripts/generate-lineage-docs.mjs --check   # exit 1 if the doc is stale
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'scripts', 'manifest.json');
const SNAPSHOT_PATH = path.join(ROOT, 'scripts', 'seeds', 'lineage-meta-snapshot.json');
const ONE_TIME_DIRS = [path.join(ROOT, 'scripts', 'one-time'), path.join(ROOT, 'scripts', 'backfill')];
const OUTPUT = path.join(ROOT, 'docs', 'reference', 'data-lineage-map.md');

const REFRESH = process.argv.includes('--refresh');
const CHECK = process.argv.includes('--check');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
function scriptForStep(step) {
  const entry = manifest.scripts?.[step];
  return entry && entry.file ? entry.file : null;
}

// ── Static emitMeta fallback (one-time / backfill scripts never in a chain) ──
// Best-effort: capture TABLE-level reads/writes (object keys of the first two
// emitMeta arguments). Column lists are frequently computed in these scripts, so
// columns are marked (dynamic) when not a plain string-array literal.
function parseEmitMetaStatic(src) {
  const out = { reads: {}, writes: {} };
  const idx = src.indexOf('emitMeta(');
  if (idx === -1) return out;
  // Grab the argument span up to the matching close paren (paren-balanced).
  let depth = 0;
  let i = src.indexOf('(', idx);
  const start = i + 1;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) break; }
  }
  const args = src.slice(start, i);
  // Split the first two top-level {...} object literals.
  const objs = [];
  let d = 0;
  let objStart = -1;
  for (let j = 0; j < args.length && objs.length < 2; j++) {
    if (args[j] === '{') { if (d === 0) objStart = j; d++; }
    else if (args[j] === '}') { d--; if (d === 0 && objStart >= 0) { objs.push(args.slice(objStart, j + 1)); objStart = -1; } }
  }
  const grabTables = (obj) => {
    const tables = {};
    if (!obj) return tables;
    // top-level keys `table: [ ... ]`
    const keyRe = /([a-z_][a-z0-9_]*)\s*:\s*\[([\s\S]*?)\]/gi;
    let m;
    let dd = 0;
    // walk to only take top-level (depth 1 inside the object) keys
    for (let j = 0; j < obj.length; j++) {
      if (obj[j] === '{') dd++;
      else if (obj[j] === '}') dd--;
    }
    while ((m = keyRe.exec(obj)) !== null) {
      const cols = [...m[2].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]);
      tables[m[1]] = cols.length ? cols : ['(dynamic)'];
    }
    return tables;
  };
  out.reads = grabTables(objs[0]);
  out.writes = grabTables(objs[1]);
  return out;
}

// ── Refresh path: read the live DB, build + persist the snapshot ─────────────
async function refresh() {
  // Reuse the pipeline SDK pool factory (PG_* env, dev-default localhost/buildo)
  // — same connection contract as every chain step; avoids a bespoke new Pool().
  const { createPool } = await import('./lib/pipeline.js');
  const pool = createPool();

  const { rows } = await pool.query(`
    SELECT DISTINCT ON (pipeline) pipeline, started_at,
           records_meta->'pipeline_meta' AS pm
    FROM pipeline_runs
    WHERE records_meta ? 'pipeline_meta'
    ORDER BY pipeline, started_at DESC
  `);
  await pool.end();

  const steps = {};
  for (const row of rows) {
    const pm = row.pm;
    if (!pm) continue;
    const colon = row.pipeline.indexOf(':');
    const chain = colon >= 0 ? row.pipeline.slice(0, colon) : '(standalone)';
    const step = colon >= 0 ? row.pipeline.slice(colon + 1) : row.pipeline;
    if (!steps[step]) steps[step] = { chains: [], script: scriptForStep(step), reads: {}, writes: {}, external: [] };
    if (!steps[step].chains.includes(chain)) steps[step].chains.push(chain);
    for (const [t, cols] of Object.entries(pm.reads || {})) {
      steps[step].reads[t] = [...new Set([...(steps[step].reads[t] || []), ...cols])];
    }
    for (const [t, cols] of Object.entries(pm.writes || {})) {
      steps[step].writes[t] = [...new Set([...(steps[step].writes[t] || []), ...cols])];
    }
    for (const ext of pm.external || []) if (!steps[step].external.includes(ext)) steps[step].external.push(ext);
  }

  // Static fallback for one-time / backfill scripts that never run in-chain.
  const staticSteps = {};
  for (const dir of ONE_TIME_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const rel = path.relative(ROOT, path.join(dir, f)).replace(/\\/g, '/');
      const parsed = parseEmitMetaStatic(fs.readFileSync(path.join(dir, f), 'utf-8'));
      if (Object.keys(parsed.reads).length || Object.keys(parsed.writes).length) {
        staticSteps[rel] = { script: rel, ...parsed };
      }
    }
  }

  const snapshot = {
    _generated: 'DB pipeline_runs.records_meta.pipeline_meta (latest per chain:step) + static emitMeta parse of one-time/backfill scripts. Refresh with `npm run lineage-docs -- --refresh`.',
    _runs_scanned: rows.length,
    inchain: steps,
    static: staticSteps,
  };
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`✔ Refreshed ${path.relative(ROOT, SNAPSHOT_PATH)} (${rows.length} in-chain steps, ${Object.keys(staticSteps).length} static scripts)`);
  return snapshot;
}

// ── Render the doc from a snapshot ───────────────────────────────────────────
function render(snapshot) {
  const inchain = snapshot.inchain || {};
  const staticSteps = snapshot.static || {};

  // column "table.col" → { producers:Set, consumers:Set }
  const lineage = new Map();
  const ref = (col) => {
    if (!lineage.has(col)) lineage.set(col, { producers: new Set(), consumers: new Set() });
    return lineage.get(col);
  };
  const tableConsumers = new Map(); // table → Set(step) for static table-level entries

  for (const [step, info] of Object.entries(inchain)) {
    for (const [t, cols] of Object.entries(info.writes || {})) for (const c of cols) ref(`${t}.${c}`).producers.add(step);
    for (const [t, cols] of Object.entries(info.reads || {})) for (const c of cols) ref(`${t}.${c}`).consumers.add(step);
  }
  for (const [name, info] of Object.entries(staticSteps)) {
    for (const t of Object.keys(info.writes || {})) {
      if (!tableConsumers.has(t)) tableConsumers.set(t, { producers: new Set(), consumers: new Set() });
      tableConsumers.get(t).producers.add(name);
    }
    for (const t of Object.keys(info.reads || {})) {
      if (!tableConsumers.has(t)) tableConsumers.set(t, { producers: new Set(), consumers: new Set() });
      tableConsumers.get(t).consumers.add(name);
    }
  }

  // group columns by table
  const byTable = new Map();
  for (const [col, io] of lineage) {
    const [table, ...rest] = col.split('.');
    const column = rest.join('.');
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push({ column, io });
  }

  const tables = [...byTable.keys()].sort();
  const totalCols = lineage.size;

  let md = `# Data-Lineage Map
*Auto-generated by \`npm run lineage-docs\` — do NOT edit manually.*
*DB-derived; refresh the underlying snapshot with \`npm run lineage-docs -- --refresh\`, then commit. The \`data-lineage-map.infra.test.ts\` drift guard fails CI if the doc drifts from the committed snapshot.*

For every column touched by the pipeline: which step **produces** it (writes) and
which steps **consume** it (reads). Derived from each step's \`emitMeta\` reads/writes
contract as merged into \`pipeline_runs.records_meta.pipeline_meta\` — the DB source
resolves the runtime-computed \`emitMeta\` column lists a static parse cannot.

- **Producers/Consumers** are chain step slugs (see \`scripts/manifest.json\` for slug → script; a step may run in more than one chain).
- One-time / backfill scripts (never in a chain) contribute **table-level** lineage only (their \`emitMeta\` columns are frequently computed); listed separately below.

**Cross-refs:** Spec 30 §2 (\`docs/specs/01-pipeline/30_pipeline_architecture.md\`, archetypes / emitMeta reads-writes contract) · Spec 40 (\`docs/specs/01-pipeline/40_pipeline_system.md\`, §R11 PIPELINE_META).

Coverage: **${totalCols}** columns across **${tables.length}** tables, from **${Object.keys(inchain).length}** in-chain steps.

---

`;

  for (const table of tables) {
    const cols = byTable.get(table).sort((a, b) => a.column.localeCompare(b.column));
    md += `## \`${table}\`\n\n`;
    md += `| Column | Produced by | Consumed by |\n|--------|-------------|-------------|\n`;
    for (const { column, io } of cols) {
      const prod = [...io.producers].sort().map((s) => `\`${s}\``).join(', ') || '—';
      const cons = [...io.consumers].sort().map((s) => `\`${s}\``).join(', ') || '—';
      md += `| \`${column}\` | ${prod} | ${cons} |\n`;
    }
    md += '\n';
  }

  if (tableConsumers.size) {
    md += `---\n\n## One-time / backfill scripts (table-level lineage)\n\n`;
    md += `| Table | Produced by | Consumed by |\n|-------|-------------|-------------|\n`;
    for (const t of [...tableConsumers.keys()].sort()) {
      const io = tableConsumers.get(t);
      const prod = [...io.producers].sort().map((s) => `\`${s}\``).join(', ') || '—';
      const cons = [...io.consumers].sort().map((s) => `\`${s}\``).join(', ') || '—';
      md += `| \`${t}\` | ${prod} | ${cons} |\n`;
    }
    md += '\n';
  }

  md += `---\n\n*Snapshot: ${snapshot._runs_scanned ?? '?'} in-chain steps scanned. ${snapshot._generated ?? ''}*\n`;
  return md;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let snapshot;
  if (REFRESH) {
    snapshot = await refresh();
  } else {
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      console.error(`✗ Missing snapshot ${path.relative(ROOT, SNAPSHOT_PATH)} — run \`npm run lineage-docs -- --refresh\` (needs DB) first.`);
      process.exitCode = 1;
      return;
    }
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
  }

  const md = render(snapshot);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  if (CHECK) {
    const existing = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf-8') : '';
    if (existing !== md) {
      console.error(`✗ ${path.relative(ROOT, OUTPUT)} is STALE — run \`npm run lineage-docs\` (or --refresh)`);
      process.exitCode = 1;
    } else {
      console.log(`✔ ${path.relative(ROOT, OUTPUT)} is up to date`);
    }
  } else {
    fs.writeFileSync(OUTPUT, md);
    console.log(`✔ Generated ${path.relative(ROOT, OUTPUT)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
