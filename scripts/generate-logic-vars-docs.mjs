#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Logic-Variables Registry Generator
//   → docs/reference/logic-variables-registry.md
//
// AI-operator reference: every Control-Panel logic variable, its default /
// bounds, whether it is a numeric or JSONB var, its description, and the
// pipeline scripts that consume it.
//
// Sources (all static — NO live DB required, so the drift-guard test runs
// under a plain `npm run test`):
//   1. scripts/seeds/logic_variables.json — the 391 numeric vars (default,
//      type, min/max, description with hand-annotated CONSUMED-by).
//   2. migrations/*.sql — INSERT/UPDATE INTO logic_variables for the vars that
//      are seeded via MIGRATIONS ONLY and are absent from the seed JSON
//      (the 3 JSONB vars income_premium_tiers / forecast_excluded_trade_slugs /
//      coa_gate_policy + the ~11 numeric migration-only vars). Auto-discovered
//      so a future migration-seeded var is picked up without a hand edit.
//   3. scripts/**/*.js LOGIC_VARS_SCHEMA = z.object({...}) — the per-script Zod
//      unions give the authoritative var → consuming-script map.
//
// Caveat (documented in the output): a handful of consumers read COMPUTED keys
// (e.g. assert-lifecycle-phase-distribution.js builds `lifecycle_band_${x}`
// keys at runtime) that no static scan can see; those are covered by the seed
// JSON's CONSUMED-by annotations, surfaced in the Description column.
//
// Usage:
//   npm run logic-vars-docs           # regenerate the doc
//   node scripts/generate-logic-vars-docs.mjs --check   # exit 1 if stale (CI/husky/test)
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED_PATH = path.join(ROOT, 'scripts', 'seeds', 'logic_variables.json');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SCRIPTS_DIRS = [path.join(ROOT, 'scripts'), path.join(ROOT, 'scripts', 'quality')];
const OUTPUT = path.join(ROOT, 'docs', 'reference', 'logic-variables-registry.md');

// ── 1. Seed JSON ────────────────────────────────────────────────────────────
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));

// ── 2. Migration-only vars (static SQL parse) ───────────────────────────────
// Split a VALUES tuple / SET clause on top-level commas, respecting single-quoted
// strings with '' escaping.
function splitTopLevel(str) {
  const out = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (c === "'") {
        if (str[i + 1] === "'") { cur += "''"; i++; continue; }
        inStr = false; cur += c; continue;
      }
      cur += c; continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function unquote(field) {
  const t = field.trim();
  if (t.startsWith("'")) {
    // strip outer quotes, optional ::cast, unescape ''
    const m = t.match(/^'((?:[^']|'')*)'/);
    if (m) return m[1].replace(/''/g, "'");
  }
  // strip ::cast on bare values
  return t.replace(/::[a-z_]+\s*$/i, '').trim();
}

// Scan a VALUES tuple list starting at `start` (index right after "VALUES").
// String-aware: inline `;` / `(` / `)` inside single-quoted descriptions do NOT
// terminate the statement (the bug a `;`-terminated regex hits). Returns the
// top-level ( ... ) tuples, stopping at the first non-tuple token (ON CONFLICT,
// RETURNING, a bare `;`, etc.).
function scanTuples(str, start) {
  const tuples = [];
  let i = start;
  const N = str.length;
  while (i < N) {
    // skip whitespace + separating commas between tuples
    while (i < N && /[\s,]/.test(str[i])) i++;
    if (i >= N || str[i] !== '(') break; // ON CONFLICT / ; / RETURNING / EOF
    // consume one ( ... ) tuple, respecting single-quoted strings
    let depth = 0;
    let cur = '';
    let inStr = false;
    for (; i < N; i++) {
      const c = str[i];
      if (inStr) {
        cur += c;
        if (c === "'") {
          if (str[i + 1] === "'") { cur += "'"; i++; continue; }
          inStr = false;
        }
        continue;
      }
      if (c === "'") { inStr = true; cur += c; continue; }
      if (c === '(') { depth++; if (depth === 1) { cur = ''; continue; } }
      if (c === ')') { depth--; if (depth === 0) { tuples.push(cur); i++; break; } }
      cur += c;
    }
  }
  return tuples;
}

// migVar: key → { value, json, description, migration }
const migVars = new Map();
const migFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
for (const file of migFiles) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

  // INSERT INTO logic_variables (cols) VALUES (...),(...) [ON CONFLICT|;]
  const insertRe = /INSERT\s+INTO\s+logic_variables\s*\(([^)]*)\)\s*VALUES/gi;
  let m;
  while ((m = insertRe.exec(sql)) !== null) {
    const cols = m[1].split(',').map((c) => c.trim());
    const keyIdx = cols.indexOf('variable_key');
    const valIdx = cols.indexOf('variable_value');
    const jsonIdx = cols.indexOf('variable_value_json');
    const descIdx = cols.indexOf('description');
    if (keyIdx === -1) continue;
    for (const tuple of scanTuples(sql, insertRe.lastIndex)) {
      const fields = splitTopLevel(tuple);
      if (fields.length < cols.length) continue;
      const key = unquote(fields[keyIdx]);
      if (!key) continue;
      const rawJson = jsonIdx >= 0 ? fields[jsonIdx].trim() : 'NULL';
      migVars.set(key, {
        value: valIdx >= 0 ? unquote(fields[valIdx]) : null,
        json: /^null$/i.test(rawJson) ? null : unquote(rawJson),
        description: descIdx >= 0 ? unquote(fields[descIdx]) : '',
        migration: file,
      });
    }
  }

  // UPDATE logic_variables SET variable_value_json = X ... WHERE variable_key = 'k'
  const updateRe = /UPDATE\s+logic_variables\s+SET\s+([\s\S]*?)\s+WHERE\s+variable_key\s*=\s*('(?:[^']|'')*')/gi;
  while ((m = updateRe.exec(sql)) !== null) {
    const key = unquote(m[2]);
    const existing = migVars.get(key);
    if (!existing) continue; // only re-baseline vars we already discovered
    const sets = splitTopLevel(m[1]);
    for (const s of sets) {
      const eq = s.indexOf('=');
      if (eq === -1) continue;
      const col = s.slice(0, eq).trim();
      const val = s.slice(eq + 1).trim();
      if (col === 'variable_value_json') existing.json = unquote(val);
      else if (col === 'variable_value') existing.value = unquote(val);
    }
    existing.migration = file; // last touch
  }
}

// ── 3. Consumer map from per-script LOGIC_VARS_SCHEMA = z.object({ ... }) ────
const consumers = new Map(); // varKey → Set<scriptRelPath>
for (const dir of SCRIPTS_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const abs = path.join(dir, file);
    const src = fs.readFileSync(abs, 'utf-8');
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const schemaRe = /LOGIC_VARS_SCHEMA\s*=\s*z\.object\(\{([\s\S]*?)\}\)/g;
    let sm;
    while ((sm = schemaRe.exec(src)) !== null) {
      const keyRe = /^\s*([a-z_][a-z0-9_]*)\s*:\s*z\./gim;
      let km;
      while ((km = keyRe.exec(sm[1])) !== null) {
        const key = km[1];
        if (!consumers.has(key)) consumers.set(key, new Set());
        consumers.get(key).add(rel);
      }
    }
  }
}

// ── Merge into a single registry ────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

const rows = [];
// numeric seed vars
for (const [key, v] of Object.entries(seed)) {
  const bounds = v.min !== undefined && v.max !== undefined ? `${v.min} – ${v.max}` : '—';
  rows.push({
    key,
    kind: 'numeric',
    default: v.default,
    bounds,
    source: 'seed',
    description: v.description || '',
    consumers: consumers.has(key) ? [...consumers.get(key)].sort() : [],
  });
}
// migration-only vars (not in seed)
for (const [key, v] of migVars) {
  if (key in seed) continue;
  const isJson = v.json !== null && v.json !== undefined;
  rows.push({
    key,
    kind: isJson ? 'JSONB' : 'numeric',
    default: isJson ? v.json : v.value,
    bounds: '— (migration-seeded)',
    source: `migration ${v.migration.replace(/_.*$/, '')}`,
    description: v.description || '',
    consumers: consumers.has(key) ? [...consumers.get(key)].sort() : [],
  });
}
rows.sort((a, b) => a.key.localeCompare(b.key));

const numericCount = rows.filter((r) => r.kind === 'numeric').length;
const jsonCount = rows.filter((r) => r.kind === 'JSONB').length;
const migCount = rows.filter((r) => r.source.startsWith('migration')).length;

// ── Render ──────────────────────────────────────────────────────────────────
let md = `# Logic-Variables Registry
*Auto-generated by \`npm run logic-vars-docs\` — do NOT edit manually.*
*Regenerate after seeding a new logic variable; the \`logic-vars-registry.infra.test.ts\` drift guard fails CI on staleness.*

The single AI-operator index of every Control-Panel logic variable: default,
bounds, numeric-vs-JSONB, description, and the pipeline scripts that consume it.
Values are operator-tunable at runtime via the Spec 86 Control Panel; the
defaults below are the seed / migration baselines.

- **Numeric vars** (${numericCount}) live in \`scripts/seeds/logic_variables.json\` (the parity-tested surface re-exported as \`LOGIC_VAR_DEFAULTS\` in \`src/lib/admin/control-panel.ts\`), except the ${migCount} seeded via migrations only (last column notes the migration).
- **JSONB vars** (${jsonCount}) carry non-numeric values in \`logic_variables.variable_value_json\`; they are migration-seeded (never in the seed JSON — a JSONB value cannot live in the numeric \`variable_value\` column) and read directly (config-loader passes object JSON through untouched).
- **Consuming scripts** are derived from each script's local \`LOGIC_VARS_SCHEMA = z.object({...})\` Zod union. A blank cell means no static consumer was found; some consumers read **computed keys** (e.g. \`assert-lifecycle-phase-distribution.js\` builds \`lifecycle_band_\${…}\` at runtime) invisible to a static scan — those are named in the seed JSON's \`CONSUMED by …\` annotation, surfaced in the Description.

**Cross-refs:** Spec 40 (\`docs/specs/01-pipeline/40_pipeline_system.md\`, config-loader / logicVars contract) · Spec 86 (\`docs/specs/02-web-admin/86_control_panel.md\`, the Control Panel that edits these).

Total: **${rows.length}** logic variables (${numericCount} numeric, ${jsonCount} JSONB).

---

| Variable | Kind | Default | Bounds | Consumers | Source | Description |
|----------|------|---------|--------|-----------|--------|-------------|
`;

for (const r of rows) {
  const cons = r.consumers.length ? r.consumers.map((c) => `\`${c}\``).join('<br>') : '—';
  md += `| \`${r.key}\` | ${r.kind} | ${esc(r.default)} | ${r.bounds} | ${cons} | ${r.source} | ${esc(r.description)} |\n`;
}

md += `\n---\n\n*Generated from ${Object.keys(seed).length} seed vars + ${migCount} migration-only vars + ${consumers.size} consumer-mapped keys across ${SCRIPTS_DIRS.length} script dirs.*\n`;

// ── Emit / check ────────────────────────────────────────────────────────────
const CHECK = process.argv.includes('--check');
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
if (CHECK) {
  const existing = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf-8') : '';
  if (existing !== md) {
    console.error(`✗ ${path.relative(ROOT, OUTPUT)} is STALE — run \`npm run logic-vars-docs\``);
    process.exitCode = 1;
  } else {
    console.log(`✔ ${path.relative(ROOT, OUTPUT)} is up to date`);
  }
} else {
  fs.writeFileSync(OUTPUT, md);
  console.log(`✔ Generated ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  ${rows.length} vars (${numericCount} numeric, ${jsonCount} JSONB, ${migCount} migration-only)`);
}
