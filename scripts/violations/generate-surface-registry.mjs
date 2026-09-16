#!/usr/bin/env node
/**
 * Surface registry generator — WF1 "Spec 126/127/128 surface standard" (2026-09-15).
 * SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md §8 (Surface registry (generated))
 * SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §2, §3, §10
 * SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md §5 R-13 (owns.components[] totality)
 *
 * WHY THIS EXISTS.
 *
 * Specs 126/127/128 describe a standard. They are not reviewable AS AN ESTATE: no
 * reader can open them and see what the 53 surfaces, 61 contracts and 6 jobs
 * actually are, what each one does in plain words, which tables it touches, which
 * contracts it calls, and who is allowed to open it. That is what the System Map
 * does for specs (`npm run system-map`), and the estate has no analogue for
 * surfaces — which is precisely the gap that let `/api/leads/view` stay a live,
 * fully-tested, zero-caller meter for months.
 *
 * This generator is that analogue. It reads ONE declared source of record —
 * scripts/surfaces/_schema/surface-census.json, whose every field was MEASURED
 * against the tree — and renders docs/reports/generated/127-surface-registry.md.
 *
 * The column data (which columns each table actually has) is NOT typed into the
 * census: it is read from src/lib/db/generated/schema.ts, which is itself produced
 * by `npm run db:generate` (drizzle-kit introspect) from the live database. So the
 * registry's table/field index cannot drift from the database without db:generate
 * being stale, which its own drift lock already covers.
 *
 * REFUSES TO EMIT (loud, never silent):
 *   - a census row missing a required field, or carrying an unknown kind/archetype;
 *   - a duplicate id;
 *   - an archetype not declared in scripts/surfaces/_schema/surface.schema.json;
 *   - a component file under src/components/** or mobile/src/components/** claimed
 *     by TWO surfaces (R-13 totality, one direction);
 *   - a `calls` entry naming a contract id that is not in the census;
 *   - a `consumers` entry naming a surface id that is not in the census.
 * The OTHER direction of R-13 totality — a component file owned by NOBODY — is
 * rendered as the "Unowned components" section and is asserted empty by the drift
 * lock rather than thrown here, so that the report still renders while the estate
 * is being brought under ownership.
 *
 * TOOLING GATE: `--self-test` proves the refusals FIRE.
 *
 * Usage:
 *   node scripts/violations/generate-surface-registry.mjs
 *   node scripts/violations/generate-surface-registry.mjs --check    (exit 1 on drift)
 *   node scripts/violations/generate-surface-registry.mjs --self-test
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// TEST-ONLY overrides — same convention as BUILDO_LOGIC_VARS_SEED_PATH /
// BUILDO_CENSUS_PATH, so a RED canary points at a fixture instead of the committed file.
// The census is SHARDED so researchers can work in parallel without collisions.
// The merge order is fixed here, so the generated output is stable whatever order
// the filesystem returns.
const CENSUS_DIR = process.env.BUILDO_SURFACE_CENSUS_DIR
  || path.join(ROOT, 'scripts/surfaces/_schema/census');
const CENSUS_SHARDS = ['mobile-product', 'web-product', 'admin-existing', 'admin-new', 'contracts', 'jobs'];
// A single-file override, used only by the RED canaries.
const CENSUS_PATH = process.env.BUILDO_SURFACE_CENSUS_PATH || null;
const SCHEMA_PATH = process.env.BUILDO_SURFACE_SCHEMA_PATH
  || path.join(ROOT, 'scripts/surfaces/_schema/surface.schema.json');
const DRIZZLE_PATH = process.env.BUILDO_DRIZZLE_SCHEMA_PATH
  || path.join(ROOT, 'src/lib/db/generated/schema.ts');
const OUT_PATH = process.env.BUILDO_SURFACE_REGISTRY_OUT
  || path.join(ROOT, 'docs/reports/generated/127-surface-registry.md');

const COMPONENT_ROOTS = ['src/components', 'mobile/src/components'];

// Where the emitted descriptors live — the location the SurfaceEngine, the Supabase
// seeder and the checkers read, mirroring the pipeline's scripts/<step>.descriptor.json.
const DESCRIPTOR_DIR = process.env.BUILDO_SURFACE_DESCRIPTOR_DIR
  || path.join(ROOT, 'scripts/surfaces');
const KIND_DIR = { SURFACE: 'surfaces', CONTRACT: 'contracts', JOB: 'jobs' };
const FEATURES_PATH = process.env.BUILDO_SURFACE_FEATURES_PATH
  || path.join(ROOT, 'scripts/surfaces/_schema/features.json');
const QUEUE_OUT = process.env.BUILDO_SURFACE_QUEUE_OUT
  || path.join(ROOT, 'docs/reports/generated/127-surface-review-queue.md');
const TYPES_OUT = process.env.BUILDO_SURFACE_TYPES_OUT
  || path.join(ROOT, 'src/lib/surfaces/generated/surface-descriptor.d.ts');
const VALIDATOR_OUT = process.env.BUILDO_SURFACE_VALIDATOR_OUT
  || path.join(ROOT, 'src/lib/surfaces/generated/validate-descriptor.mjs');

const SPEC_126 = 'docs/specs/02-web-admin/126_maxbld_surface_standard.md';
const SPEC_127 = 'docs/specs/02-web-admin/127_surface_conversion_procedure.md';
const SPEC_128 = 'docs/specs/02-web-admin/128_surface_standard_policy.md';
const SCHEMA_REL = 'scripts/surfaces/_schema/surface.schema.json';

/** The 21 categories, in schema order. Read from the schema so this cannot drift. */
function loadCategories() {
  const schema = JSON.parse(read(SCHEMA_PATH));
  const cats = schema['x-categories'];
  CATEGORY_KEYS = new Set(cats);
  if (!Array.isArray(cats) || cats.length === 0) {
    throw new Error(`[surface-registry] ${rel(SCHEMA_PATH)} declares no x-categories — it cannot anchor the registry.`);
  }
  const archetypes = archetypeValues(schema);
  if (!Array.isArray(archetypes) || archetypes.length === 0) {
    throw new Error(`[surface-registry] ${rel(SCHEMA_PATH)} declares no identity.archetype.enum.`);
  }
  return { cats, archetypes };
}

/** The archetype vocabulary, whether the schema spells it `enum` or `oneOf` of consts. */
function archetypeValues(schema) {
  const node = schema?.properties?.identity?.properties?.archetype;
  if (!node) return [];
  if (Array.isArray(node.enum)) return node.enum;
  if (Array.isArray(node.oneOf)) return node.oneOf.map((o) => o.const).filter((v) => typeof v === 'string');
  return [];
}

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`[surface-registry] missing input: ${p}`);
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

// ───────────────────────────────────────────────────────────────────────────
// Column data — read from the INTROSPECTED drizzle schema, never typed by hand.
// ───────────────────────────────────────────────────────────────────────────

export function parseDrizzleColumns(src) {
  const tables = new Map();
  const re = /pgTable\(\s*"([^"]+)"\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    // walk braces from the opening { to its match
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    const body = src.slice(re.lastIndex, i - 1);
    const cols = [];
    for (const line of body.split('\n')) {
      const c = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_.]*\(\s*(?:"([^"]+)")?/);
      if (!c) continue;
      cols.push(c[2] || c[1]);
    }
    if (!tables.has(table)) tables.set(table, cols);
  }
  return tables;
}

// ───────────────────────────────────────────────────────────────────────────
// Census validation — refuse loudly.
// ───────────────────────────────────────────────────────────────────────────

const KINDS = new Set(['SURFACE', 'CONTRACT', 'JOB']);

/** A descriptor exposes its id and archetype under identity; older rows had them flat. */
const idOf = (r) => r?.identity?.id ?? r?.id;
const archOf = (r) => r?.identity?.archetype ?? r?.archetype;
const platformsOf = (r) => r?.identity?.platforms ?? r?.platforms ?? [];
const STATUSES = new Set(['exists', 'new', 'generated']);
const REQUIRED = ['id', 'kind', 'archetype', 'platforms', 'status', 'purpose', 'data_story', 'under_126'];
// NOTE: these are checked on the FLATTENED render view; the authoritative check is AJV
// against surface.schema.json, run on every build (validateAgainstSchema).

export function validateCensus(rows, archetypes) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('[surface-registry] census is empty');
  const seen = new Set();
  const allowed = new Set([...archetypes, 'QUERY', 'MUTATION', 'WEBHOOK', 'COMMAND', 'EXPORT', 'TRANSLATION', 'SCHEDULED', 'DISPATCH']);
  for (const r of rows) {
    for (const k of REQUIRED) {
      if (r[k] === undefined || r[k] === null || r[k] === '') {
        throw new Error(`[surface-registry] row "${r.id || '(no id)'}" is missing required field "${k}". Every census row states every field; "unmeasured" is the answer for a fact nobody measured, and an omission is not.`);
      }
    }
    if (seen.has(r.id)) throw new Error(`[surface-registry] duplicate census id: ${r.id}`);
    seen.add(r.id);
    if (!KINDS.has(r.kind)) throw new Error(`[surface-registry] row ${r.id}: unknown kind "${r.kind}"`);
    if (!STATUSES.has(r.status)) throw new Error(`[surface-registry] row ${r.id}: unknown status "${r.status}"`);
    if (!allowed.has(r.archetype)) {
      throw new Error(`[surface-registry] row ${r.id}: archetype "${r.archetype}" is not declared in ${SCHEMA_REL} (nor a CONTRACT/JOB archetype). A vocabulary the schema does not know is a vocabulary nobody can validate against.`);
    }
  }
  // cross-references
  const ids = seen;
  const contractByPath = new Map();
  for (const r of rows) if (r.kind === 'CONTRACT' && r.path) contractByPath.set(r.path, r.id);
  for (const r of rows) {
    for (const c of r.calls || []) {
      if (c === 'unmeasured') continue;
      if (!contractByPath.has(c) && !ids.has(c)) {
        throw new Error(`[surface-registry] row ${r.id} calls "${c}", which is neither a census contract path nor a census id. A dangling edge is how a fan-out graph lies.`);
      }
    }
    for (const c of r.consumers || []) {
      if (typeof c === 'string' && c.startsWith('unmeasured')) continue;
    }
  }
  return rows;
}

/** R-13 totality, direction 1: no component file is claimed by two surfaces. */
export function ownershipIndex(rows) {
  const owner = new Map();
  for (const r of rows) {
    for (const f of componentsOwnedBy(r)) {
      if (owner.has(f)) {
        throw new Error(`[surface-registry] component "${f}" is claimed by BOTH ${owner.get(f)} and ${r.id}. Spec 128 R-13: every component file appears in exactly one surface's owns.components[].`);
      }
      owner.set(f, r.id);
    }
  }
  return owner;
}

export function componentsOwnedBy(row) {
  const files = Array.isArray(row.owns_components) ? row.owns_components : (row.files || []);
  return files.filter((f) => typeof f === 'string' && COMPONENT_ROOTS.some((rt) => f.startsWith(`${rt}/`)));
}

/** R-13 totality, direction 2: every component file on disk is owned by somebody. */
function allComponentFiles() {
  const out = [];
  for (const rt of COMPONENT_ROOTS) {
    const abs = path.join(ROOT, rt);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); continue; }
        if (!/\.tsx$/.test(e.name)) continue;
        if (/\.test\.tsx$/.test(e.name)) continue;
        out.push(rel(p));
      }
    };
    walk(abs);
  }
  return out.sort();
}

// ───────────────────────────────────────────────────────────────────────────
// Render
// ───────────────────────────────────────────────────────────────────────────

const UNMEASURED = '_unmeasured_';

function fmtList(v) {
  if (v === undefined || v === null) return UNMEASURED;
  if (typeof v === 'string') return v === 'unmeasured' ? UNMEASURED : `\`${v}\``;
  if (!Array.isArray(v)) return String(v);
  if (v.length === 0) return '—';
  if (v.length === 1 && v[0] === 'unmeasured') return UNMEASURED;
  return v.map((x) => `\`${x}\``).join(' · ');
}

function fmtScalar(v) {
  if (v === undefined || v === null || v === '') return UNMEASURED;
  if (v === 'unmeasured') return UNMEASURED;
  return String(v);
}

/**
 * The stable anchor for an entry is its REF, not its heading text: a heading can be
 * reworded, a ref cannot. Every detail section emits `<a id="s-001"></a>` and every
 * mention anywhere in the document links to it, so the registry is navigable rather
 * than merely ordered.
 */
function refAnchor(ref) { return String(ref).toLowerCase(); }

/** Render one entry as a link, wherever it is mentioned. */
function refLink(r, label) {
  return `[\`${r.ref}\`](#${refAnchor(r.ref)})${label === false ? '' : ` \`${label || r.id}\``}`;
}

/** Look an entry up by id and render it as a link; falls back to plain code if unknown. */
function linkById(rows, id, label) {
  const r = rows.find((x) => x.id === id);
  return r ? refLink(r, label) : `\`${id}\``;
}

function anchor(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Group every remaining UNRESEARCHED field by WHY it is still open. The paths are
 * read off the descriptors, not typed — so this table cannot drift from the census.
 */
export function groupReasons(rows) {
  const at = {};
  const walk = (v, p) => {
    if (v === U || (typeof v === 'string' && v.startsWith(U))) { at[p] = (at[p] || 0) + 1; return; }
    if (typeof v === 'string') return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, `${p}[]`)); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k === 'x-draft') continue; walk(v[k], p ? `${p}.${k}` : k); }
  };
  for (const r of rows) walk(r._descriptor || r, '');
  const sum = (...keys) => keys.reduce((t, k) => t + (at[k] || 0), 0);
  const groups = [
    {
      label: 'no owner spec',
      n: sum('identity.spec', 'identity.spec_refs[]', 'inputs.tables[].owner_spec', 'outputs.tables[].owner_spec'),
      closes: 'The file carries no `SPEC LINK` header and the System Map has no row for it — so there is nothing to cite. Closing it means **writing or assigning a spec**, not finding one. Three of these cite a spec path that does not exist (a dead citation is filed as a defect, not resolved here).',
    },
    {
      label: 'no lineage producer',
      n: sum('inputs.tables[].producing_steps', 'inputs.tables[].chain_position', 'outputs.tables[].producing_steps', 'outputs.tables[].chain_position'),
      closes: 'The table is absent from `docs/reference/data-lineage-map.md`, so no pipeline step declares it as a write. Either it is written by an API route or a migration seed (answer `none`), or a step writes it without declaring it — which is a pipeline defect, not a research gap.',
    },
    {
      label: 'no declared owner',
      n: sum('identity.owner'),
      closes: 'Nobody is recorded as owning it. This is an organisational answer, not a measurable one.',
    },
    {
      label: 'vocabulary escalation',
      n: sum('a11y.touch_target_min_px', 'guards.session.answer', 'outputs.answer', 'inputs.answer', 'staleness.answer', 'guards.rls_class.answer'),
      closes: 'The closed menu lacked a value and the researcher escalated rather than inventing one — exactly the rule. **All are now ruled** and land as Spec 128 §6 `ASK-15` … `ASK-23`; the rows are re-answered on the next research pass.',
    },
    {
      label: 'archetype profile field, newly required',
      n: sum('render.list', 'render.wizard', 'render.tiles', 'render.refresh', 'render.routing', 'guards.statuses_handled', 'config.debounce_ms', 'config.min_query_len', 'guards.rate_bucket', 'inputs.query_key', 'outputs.rollback'),
      closes: 'ASK-22 made the archetype profiles REAL, so these fields became required AFTER the research pass ran. The field must now be present; it may hold the sentinel. Each is a short, well-defined lookup — the pagination idiom, the poll interval, the debounce, the resume key.',
    },
    {
      label: 'measurement not yet made',
      n: sum('inputs.tables[].columns', 'inputs.tables[].evidence[]', 'outputs.tables[].columns', 'outputs.tables[].evidence[]', 'inputs.field_whitelist', 'sharing.varies_by_surface'),
      closes: 'An ordinary lookup nobody has done yet — read the query, name the columns, cite the line.',
    },
  ];
  const named = groups.reduce((t, g) => t + g.n, 0);
  const total = Object.values(at).reduce((t, n) => t + n, 0);
  if (total > named) {
    groups.push({
      label: 'other',
      n: total - named,
      closes: `Fields at paths this grouping does not name: ${Object.entries(at).filter(([k]) => !groups.some(() => false)).slice(0, 0).map(([k]) => k).join(', ') || 'see the per-row badges'}.`,
    });
  }
  return groups.filter((g) => g.n > 0);
}

const SCOPES = [
  {
    key: 'parcel_product', letter: 'A', title: 'the MaxBLD parcel cost tool', compact: false,
    blurb: '**This is the programme.** The surfaces, contracts and jobs a customer of the parcel tool touches, plus the five business requirements that hang off them: the metered lookup, the PDF sent to a client, the ad placements, and the Vercel web front door. Governed by Spec 100 and Spec 126; batched first by Spec 127 §4.4.',
  },
  {
    key: 'parcel_admin', letter: 'B', title: 'admin surfaces that operate the parcel product', compact: false,
    blurb: 'Usage and entitlements, placements and advertiser accounts, the PDF audit, the `app_outputs` recompute, and the descriptor-native registry / drift / roles pages. These convert **with** the product, not after it — an unobservable product is not shipped.',
  },
  {
    key: 'platform_shared', letter: 'C', title: 'shared by both products, owned by neither', compact: false,
    blurb: 'Auth, the user profile, the subscription and Stripe hand-off, entitlements, notifications, and the navigation shells. Changing one of these changes **both** products, which is exactly why it is its own scope rather than being filed under whichever product noticed it first.',
  },
  {
    key: 'estate_other', letter: 'D', title: 'the OTHER product — inventory and seam only', compact: true,
    blurb: '**Not governed by this programme.** Lead generation, the flight center, the lead feed, permit and job detail, builders and entities. Spec 100 §1 fences the parcel tool off from these (*"not coupled to the Lead Feed, Flight Center, or LeadDetail"*), and Spec 128 **R-03** keeps that fence. They appear here for one reason: so a contract shared with scope C, or a contract with no caller at all, is **visible** rather than hidden. They convert under the same standard in a later programme.',
  },
];

function loadFeatures() {
  return JSON.parse(read(FEATURES_PATH));
}

const KIND_LABEL = { SURFACE: 'surface', CONTRACT: 'contract', JOB: 'job' };

function pct(r) {
  const n = unresearchedCount(r);
  return n === 0 ? '100%' : `${Math.max(0, 100 - Math.min(99, n * 3))}%`;
}

function legend(rows) {
  const feats = loadFeatures();
  const featName = Object.fromEntries(feats.map((f) => [f.id, f.name]));
  const L = [];
  L.push('### 2.6 Legend — every entry Spec 126 governs, in BUILD ORDER');
  L.push('');
  L.push('One line per entry in scopes A, B and C, organised **scope → type → build order**. `build_order` is derived, not chosen: scope rank × 1000 + feature rank × 10 + kind rank, where the kind rank puts **tables before contracts before surfaces before admin** — it answers *"what must exist before this can be built"*. Follow an id to its detail in §3.');
  L.push('');
  for (const sc of SCOPES.filter((x) => x.key !== 'estate_other')) {
    const g = rows.filter((r) => r.scope === sc.key).sort((a, b) => a.build_order - b.build_order || a.id.localeCompare(b.id));
    if (g.length === 0) continue;
    L.push(`**§${sc.letter} \`${sc.key}\` (${g.length})**`);
    L.push('');
    L.push('| id | type | name | archetype | feature | build | researched | detail |');
    L.push('|---|---|---|---|---|---:|---:|---|');
    for (const r of g) {
      L.push(`| [\`${r.ref}\`](#${refAnchor(r.ref)}) | ${KIND_LABEL[r.kind]} | \`${r.id}\`${r.pilot ? ' **(pilot)**' : ''} | \`${r.archetype}\` | \`${r.feature}\` ${featName[r.feature] || ''} | ${r.build_order} | ${pct(r)} | [detail](#${refAnchor(r.ref)}) |`);
    }
    L.push('');
  }
  const d = rows.filter((r) => r.scope === 'estate_other').sort((a, b) => a.build_order - b.build_order || a.id.localeCompare(b.id));
  L.push(`**§D \`estate_other\` (${d.length}) — appendix, not governed.** Listed with ids so a shared contract or an orphan can be cited; not batched.`);
  L.push('');
  L.push('<details><summary>expand the appendix</summary>');
  L.push('');
  L.push('| id | type | name | archetype | feature |');
  L.push('|---|---|---|---|---|');
  for (const r of d) L.push(`| <a id="${refAnchor(r.ref)}"></a>\`${r.ref}\` | ${KIND_LABEL[r.kind]} | \`${r.id}\` | \`${r.archetype}\` | \`${r.feature}\` ${featName[r.feature] || ''} |`);
  L.push('');
  L.push('</details>');
  L.push('');
  return L.join('\n');
}

function featuresSection(rows, cols) {
  const feats = loadFeatures();
  const L = [];
  L.push('### 2.7 Feature modules — what removing one would delete');
  L.push('');
  L.push('Spec 125 §2 recommends building schemas **by feature, so a feature can be removed**. That only means something if the estate can say what removal costs. Each row below is a unit of deletion: its entries, its contracts, and the tables that would be left with no reader.');
  L.push('');
  L.push('| Feature | Scope | Entries (linked, in build order) | Contracts | Tables reached | Removing it deletes |');
  L.push('|---|---|---|---:|---:|---|');
  for (const f of feats) {
    const g = rows.filter((r) => r.feature === f.id);
    const contracts = g.filter((r) => r.kind === 'CONTRACT');
    const tables = new Set();
    for (const r of g) for (const t of [...(r.reads_tables || []), ...(r.writes_tables || [])]) tables.add(t);
    const owned = [...tables].filter((t) => !rows.some((r) => r.feature !== f.id && [...(r.reads_tables || []), ...(r.writes_tables || [])].includes(t)));
    const deletes = g.length === 0
      ? '**nothing — the feature is specified and nothing implements it yet.** That is the finding, not an error.'
      : `${g.length} descriptor(s)${contracts.length ? `, ${contracts.length} contract(s)` : ''}${owned.length ? `, and would orphan ${owned.length} table(s): ${owned.map((t) => `\`${t}\``).join(' · ')}` : ', and would orphan no table — every table it touches is shared'}`;
    const members = g.length
      ? g.slice().sort((a, b) => a.build_order - b.build_order).map((r) => refLink(r, false)).join(' · ')
      : '—';
    L.push(`| **${f.id}** ${f.name} | \`${f.scope}\` | ${members} | ${contracts.length} | ${tables.size} | ${deletes} |`);
  }
  L.push('');
  L.push('The emitted descriptor tree mirrors this exactly — `scripts/surfaces/<scope>/<feature>/<kind>/<id>.descriptor.json` — so removing a feature is removing a directory, and the `--check` arm reports precisely what went with it.');
  L.push('');
  return L.join('\n');
}

function consolidated(rows) {
  const L = [];
  const leaks = rows.filter((r) => Array.isArray(r.leakage) && r.leakage.length);
  const qs = rows.filter((r) => Array.isArray(r.product_questions) && r.product_questions.length);
  L.push('### 2.8 Cross-product leakage — recorded, never deleted');
  L.push('');
  L.push('The misclassification sweep re-checked every scope A/B/C row against Spec 100 §1\'s fence and the live product key. Where a behaviour belongs to the OTHER product and merely lives in a parcel-product file today, it is recorded here. **Nothing is removed on the strength of this table** — a behaviour nobody wrote down is a behaviour nobody can knowingly retire (Spec 124 §4).');
  L.push('');
  if (leaks.length === 0) { L.push('_none found_'); } else {
    L.push('| Entry | Behaviour | Owning product | Proposed | Evidence |');
    L.push('|---|---|---|---|---|');
    for (const r of leaks) for (const k of r.leakage) {
      L.push(`| ${refLink(r)} | ${k.behaviour} | \`${k.owning_product}\` | \`${k.disposition}\` | ${k.evidence.map((e) => `\`${e}\``).join(' · ')} |`);
    }
  }
  L.push('');
  L.push('### 2.9 Product questions for the operator');
  L.push('');
  L.push('Where the **measured** behaviour contradicts what a MaxBLD user would reasonably expect. These are not defects — in every case below the code matches its spec. The question is whether the SPEC matches the product.');
  L.push('');
  const total = qs.reduce((t, r) => t + r.product_questions.length, 0);
  L.push(`**${total} question(s) across ${qs.length} entr(ies).**`);
  L.push('');
  let i = 0;
  for (const r of qs) for (const q of r.product_questions) {
    i += 1;
    L.push(`**Q${i} — ${refLink(r)}.** ${q.question}`);
    L.push('');
    L.push(`- **Measured:** ${q.measured}`);
    if (q.spec_says) L.push(`- **The spec says:** ${q.spec_says}`);
    L.push(`- **Evidence:** ${q.evidence.map((e) => `\`${e}\``).join(' · ')}`);
    L.push('');
  }
  return L.join('\n');
}

function scopeSummary(rows, cols) {
  const L = [];
  L.push('## 2.4 Programme scope — what this registry is actually about');
  L.push('');
  L.push('A reader opening this document sees 137 entries and cannot tell the parcel cost tool from the lead-generation estate it shares a repository with. Every row therefore declares `programme.scope`, with a measured one-line reason.');
  L.push('');
  L.push('| § | Scope | Rows | Researched | Tables reached | Governed by Spec 126? |');
  L.push('|---|---|---:|---:|---:|---|');
  for (const sc of SCOPES) {
    const g = rows.filter((r) => r.scope === sc.key);
    if (g.length === 0) continue;
    const done = g.filter((r) => unresearchedCount(r) === 0).length;
    const tables = new Set();
    for (const r of g) for (const t of [...(r.reads_tables || []), ...(r.writes_tables || [])]) tables.add(t);
    L.push(`| **${sc.letter}** | \`${sc.key}\` | ${g.length} | ${done} (${Math.round((done / g.length) * 100)}%) | ${tables.size} | ${sc.key === 'estate_other' ? '**no** — inventory + seam only (R-03)' : 'yes'} |`);
  }
  L.push(`| | **total** | **${rows.length}** | **${rows.filter((r) => unresearchedCount(r) === 0).length}** | | |`);
  L.push('');
  const pilot = rows.find((r) => r.pilot);
  if (pilot) {
    L.push(`**The pilot is ${refLink(pilot)}** — ${String(pilot.purpose).split(/(?<=\.)\s/)[0]} It is the one surface in the estate marked \`programme.pilot: true\`.`);
    L.push('');
  }
  L.push('### 2.5 How the parcel product hangs together');
  L.push('');
  L.push('The path from a customer tapping a screen to the pipeline step that built what they see. Everything left of the ledger is scope A; everything right of it is scope B.');
  L.push('');
  L.push('```');
  L.push('  SCOPE A — the product                          SCOPE B — operating it');
  L.push('  ─────────────────────                          ──────────────────────');
  L.push('  mobile_parcel_search  ─┐');
  L.push('  mobile_parcel_detail  ─┼─► contract_parcels_lookup ─┐');
  L.push('  web_landing (web)     ─┘   (entitlement: parcel_tool)│');
  L.push('  overlay_sponsor_slot  ────► offers / placements ─────┤');
  L.push('                                                       │');
  L.push('                                                       ▼');
  L.push('                                            ┌──────────────────────┐');
  L.push('                                            │  app_outputs         │──► admin_run_ledger');
  L.push('                                            │  usage_events        │──► admin_export_audit');
  L.push('                                            │  offers / placements │──► admin_placements');
  L.push('                                            │  pdf_exports         │──► admin_advertiser_accounts');
  L.push('                                            └──────────┬───────────┘    advertiser_self_metrics');
  L.push('                                                       │');
  L.push('                                                       ▼');
  L.push('                                   a converted pipeline step, LAST in chain `sources`');
  L.push('                                   (writes app_outputs; Spec 128 R-07 — chain position');
  L.push('                                    is load-bearing: never build a projection from a');
  L.push('                                    half-enriched corpus)');
  L.push('                                                       │');
  L.push('                                                       ▼');
  L.push('                                   admin_surface_registry · admin_contract_fanout');
  L.push('                                   admin_orphan_panel · admin_drift_status · admin_role_matrix');
  L.push('                                   (generated from the SAME descriptors as this document)');
  L.push('```');
  L.push('');
  L.push(legend(rows));
  L.push(featuresSection(rows, cols));
  L.push(consolidated(rows));
  L.push('**The entries in that diagram, linked:** ' + [
    'mobile_parcel_search', 'mobile_parcel_detail', 'web_landing', 'overlay_sponsor_slot',
    'contract_parcels_lookup', 'admin_run_ledger', 'admin_export_audit', 'admin_placements',
    'admin_advertiser_accounts', 'advertiser_self_metrics', 'admin_surface_registry',
    'admin_contract_fanout', 'admin_orphan_panel', 'admin_drift_status', 'admin_role_matrix',
  ].map((id) => linkById(rows, id)).join(' · ') + '.');
  L.push('');
  L.push('**Four of those tables do not exist yet** — `app_outputs`, `usage_events`, `offers`, `placements`, `pdf_exports` are net-new (§4 marks each one). That is the honest state: the product is specified, the admin that operates it is specified, and the substrate under both is still to be declared, migrated and drift-asserted.');
  L.push('');
  return L.join('\n');
}

function answeredIn(row) {
  const c = row.categories || {};
  return Object.keys(c).filter((k) => c[k] && c[k] !== U && !String(c[k]).startsWith(U)).length;
}

function unres(v) { return v === U || (typeof v === 'string' && v.startsWith(U)); }
function fmtCell(v) {
  if (v === undefined || v === null || v === '') return `**${U}**`;
  if (unres(v)) return `**${U}**`;
  if (Array.isArray(v)) return v.length ? v.map((x) => (unres(x) ? `**${U}**` : `\`${x}\``)).join(' · ') : '—';
  return `\`${v}\``;
}

/** table -> columns -> producing step -> chain position -> owner spec */
function lineageBlock(row, cols) {
  const lin = row.lineage;
  if (!lin || ((lin.reads || []).length === 0 && (lin.writes || []).length === 0)) {
    return '_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._';
  }
  const L = ['| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |', '|---|---|---|---|---|---|---|'];
  const emit = (kind, list) => {
    for (const t of list || []) {
      const all = cols.get(t.table);
      L.push([
        '', kind, `\`${t.table}\`${all ? '' : ' **(net-new)**'}`,
        fmtCell(t.columns),
        all ? all.map((x) => `\`${x}\``).join(' · ') : '_does not exist yet_',
        fmtCell(t.producing_steps),
        fmtCell(t.chain_position),
        fmtCell(t.owner_spec), '',
      ].join(' | ').replace(/^ \| /, '| ').replace(/ \| $/, ' |'));
    }
  };
  emit('reads', lin.reads);
  emit('writes', lin.writes);
  return L.join('\n');
}

function evidenceBlock(row) {
  const e = row.evidence || {};
  const rows = [];
  for (const k of ['files', 'contracts', 'tables', 'gate', 'states', 'emits']) {
    rows.push(`| \`${k}\` | ${fmtCell(e[k])} |`);
  }
  rows.push(`| \`spec_refs\` | ${fmtCell(row.spec_refs)} |`);
  return ['| Claim | Citation (`file:line`, `migration:line`, or a spec §anchor) |', '|---|---|', ...rows].join('\n');
}

function categoriesTable(row, cats) {
  const known = row.categories && typeof row.categories === 'object' ? row.categories : {};
  const L = ['| # | Category | Answer (closed vocabulary) | Why / evidence |', '|---:|---|---|---|'];
  cats.forEach((c, i) => {
    const a = known[c];
    let answer;
    let whyCell;
    if (a === undefined || a === null || a === '' || unres(a)) {
      answer = `**${U}**`;
      whyCell = `_to be researched — see the closed vocabulary for \`${c}\` in [the schema](../../../${SCHEMA_REL})_`;
    } else if (typeof a === 'string') {
      answer = a;
      whyCell = '_derived from the census measurement; a researcher replaces this with the closed value + why_';
    } else {
      answer = `\`${a.answer ?? U}\``;
      whyCell = `${a.why ?? `**${U}**`}${Array.isArray(a.evidence) && a.evidence.length ? ` — ${a.evidence.map((x) => `\`${x}\``).join(', ')}` : ''}`;
    }
    L.push(`| ${i + 1} | \`${c}\` | ${answer} | ${whyCell} |`);
  });
  return L.join('\n');
}

function tablesBlock(row, cols) {
  const rows = [];
  const push = (kind, list) => {
    for (const t of list || []) {
      if (t === 'unmeasured') { rows.push(`| ${kind} | ${UNMEASURED} | ${UNMEASURED} | ${UNMEASURED} |`); continue; }
      const c = cols.get(t);
      const exists = c ? '**exists**' : '**net-new**';
      rows.push(`| ${kind} | \`${t}\` | ${exists} | ${c ? c.map((x) => `\`${x}\``).join(' · ') : '_no introspected columns — the table does not exist yet_'} |`);
    }
  };
  push('reads', row.reads_tables);
  push('writes', row.writes_tables);
  if (rows.length === 0) return '_No table is touched by this entry._';
  return ['| | Table | | Columns (introspected from the live DB via `db:generate`) |', '|---|---|---|---|', ...rows].join('\n');
}

/**
 * THE AUTHORED HALF — the explanatory scaffolding. Kept here, in one place, and
 * emitted into the report, because the report is generated and must never be
 * hand-edited. It is deliberately readable by eye, the same posture as
 * map-categories.mjs's RULES table.
 */
function preamble(rows, cols) {
  const nS = rows.filter((r) => r.kind === 'SURFACE').length;
  const nC = rows.filter((r) => r.kind === 'CONTRACT').length;
  const nJ = rows.filter((r) => r.kind === 'JOB').length;
  const orphans = rows.filter((r) => r.kind === 'CONTRACT' && Array.isArray(r.consumers) && r.consumers.length === 0).length;
  return `
## 0. How to read this registry

### 0.1 What this is

This is the **reviewable projection of the surface census** — the application estate's equivalent of what the System Map is for specs and what the target-files list is for the pipeline. It is one document in which every screen, every page, every API endpoint and every scheduled job in this product appears exactly once, in plain language, with the data it touches and the rules that gate it.

It is **not** a design document and it is **not** a plan. It is an inventory you can argue with. Each entry states what something is, who it is for, what it reads and writes, and what happens to it under the Spec 126 surface standard — so that the argument happens **here**, before anything is built, rather than in a code review six weeks later.

There are **${nS} surfaces, ${nC} contracts and ${nJ} jobs** in it today.

### 0.2 Why it exists

The standard it serves rests on one idea: **one contract per surface, and the descriptor is the contract.** A single declaration per thing drives the tables it may touch, the API shape it returns, how it renders on web, on mobile and in the admin console, the checks that must pass, and the golden captures that pin its behaviour. Everything downstream is a projection of that one declaration.

That only works if a human can *review the declaration before it becomes code*. Without a document like this one, the declaration is 137 JSON files nobody reads together, and the estate keeps its current failure mode. The measured example: \`/api/leads/view\` is a live, 153-line metered endpoint with 44 passing test cases and **zero callers**, and the paywall copy downstream of it is unreachable in production. Every individual artifact was green. Nothing held the join between *"a contract exists"* and *"a surface calls it"* — so nobody saw it for months. **${orphans} contracts in this registry have no caller today**, and §3 renders each of them as an orphan rather than leaving them to be discovered later.

### 0.3 How it works

\`\`\`
  scripts/surfaces/_schema/surface-census.json     the source of record, in git, measured
                  |
                  v
  scripts/violations/generate-surface-registry.mjs the generator (--check, --self-test)
                  |
                  v
  docs/reports/generated/127-surface-registry.md   this document
                  ^
                  |
  src/tests/surface-registry.infra.test.ts         the drift lock, with RED canaries
\`\`\`

The census is measured against the tree — file by file, route by route — and nothing in it is inferred from a filename. **Table column lists are not in the census at all**: they are read from \`src/lib/db/generated/schema.ts\`, which \`npm run db:generate\` (\`drizzle-kit introspect\`) produces from the live database, so the ${cols.size} tables below cannot drift from the database without that generator being stale.

**Researching a row** is a defined procedure with a reading order, an evidence standard and the closed vocabulary cheat-sheet: **docs/reports/2026-09-15-surface-research-brief.md**. Correcting this document means **correcting the census and regenerating**. The drift lock re-runs the generator and fails if the committed file differs by a byte.

**Where it is going.** Today a census row is a hand-measured record. As Phase 1 lands, \`${SCHEMA_REL}\` (currently **DRAFT**, \`x-frozen: false\`) becomes the authority for what a row must answer, and each row becomes a real per-surface descriptor file validated against it. A row becomes a descriptor by answering its 21 categories in substance instead of \`_unanswered — assessment_\`, gaining a golden capture per declared state, and being registered at cutover. The registry keeps rendering — it just stops being the only place the answers live.

### 0.4 The words in the Status column

| Status | Meaning |
|---|---|
| **exists** | The code is in the tree today. The row describes what is there, not what it should be. |
| **new** | Specified, not built. Nothing is measured, and the row says so. |
| **generated** | Will be rendered from descriptors rather than hand-written, from its first commit. |

### 0.5 What an archetype is, and why it gates fields

An **archetype** is the *kind* of thing an entry is — a LIST, a DETAIL, a REPORT, a FORM. It is **not a label on a renderer**. It selects which descriptor fields are **mandatory**: a REPORT is forced to declare \`outputs: "none"\` and must carry a field whitelist; a LIST must declare its empty and offline states; a SLOT must carry a \`disclosure\` check at \`severity: FAIL\`, \`blocking: true\`.

That is what makes the standard enforce rather than describe. The pipeline side proved the mechanism: a new enricher there *cannot* omit its invalidator, because its archetype makes the field required. The same defect becomes **unexpressible** rather than merely visible.

### 0.6 How to review a row — five questions

1. **Is the purpose right?** Read the first paragraph as a non-engineer. If it does not describe something a real person does, the row is wrong — and a descriptor built on it will be wrong in the same way.
2. **Are the tables and columns right?** Second paragraph and the Tables block. A table listed that it should not touch is a boundary violation; a table missing is a projection that cannot work.
3. **Is the archetype right?** It decides which fields become mandatory. A DETAIL mislabelled as a REPORT loses the requirement to handle an error state.
4. **Is the gate and the role right?** Who may open it, under which entitlement, in which role. A page gated more loosely than the data it renders is the measured \`/builders\` defect — the page is behind a login, the data is not.
5. **Is anything owned twice, or owned by nobody?** §5. A component claimed by two surfaces makes the generator throw; a component claimed by none is a gap in the ownership rule.

### 0.7 Field legend

| Field | One-line meaning |
|---|---|
| **kind** | SURFACE (renders), CONTRACT (an API endpoint), or JOB (server work with no screen and no request). |
| **archetype** | The kind of thing it is — and therefore which descriptor fields are mandatory (§0.5). |
| **platforms** | Where it renders: \`web\`, \`mobile\`, \`pdf\`. Admin surfaces are \`web\` only. |
| **status** | exists / new / generated (§0.4). |
| **path** | The route, for a contract. |
| **methods** | The HTTP method handlers actually exported by the route file. |
| **cron** | The literal schedule expression, for a job. |
| **lines** | Line count of the files that make up the entry — a rough size, not a quality measure. |
| **Gate** | Who may reach it: auth class, session, entitlement product, feature flag, device permission, role. |
| **Calls** | The contracts a surface reaches, and by which idiom (a named hook, or a bare fetch). |
| **Called by** | The surfaces that reach a contract. Empty renders as **orphan contract**. |
| **Components owned** | The component files this surface, and only this surface, renders. Totality is enforced both ways. |
| **Emits** | Analytics events or ledger events it records. Empty means nothing it does is countable. |
| **Render states** | The distinct outcomes visible in the code — loading, empty, error, offline, and so on. |
| **Tables** | Every table it reads or writes, with the real column names, marked **exists** or **net-new**. |
| **21 category answers** | The descriptor contract. \`_unanswered — assessment_\` means nobody has assessed it yet. |
| **_unmeasured_** | A fact a sweep could not determine. It is never replaced by a plausible-looking guess. |

### 0.8 How the "under Spec 126" verdict is derived

The third paragraph of every surface row carries a verdict, and it is **derived by a stated rule, never asserted per file**:

- **RE-PROJECT** — it writes nothing and holds no client-side (Layer-3) store. The server already assembles the payload; only the rendering is client-side, so the move is short.
- **REBUILD** — it holds client state or drives writes. A decision currently made on the client has to be re-homed on the server before a server-driven projection can be honest.
- **NEW** — it does not exist; it is generated from descriptors from its first commit.
- **LEAVE ALONE** — it talks to a third-party SDK rather than to our contracts, so a descriptor would describe someone else's protocol.

If you disagree with a verdict, the thing to change is the measured signal it is derived from — or the rule — not the sentence.
`;
}

function workedExample(rows, cols) {
  const surface = rows.find((r) => r.id === 'mobile_parcel_detail');
  const contract = rows.find((r) => r.kind === 'CONTRACT' && r.path === '/api/parcels/lookup');
  const admin = rows.find((r) => r.id === 'admin_parcel_cost');
  const search = rows.find((r) => r.id === 'mobile_parcel_search');
  if (!surface || !contract) {
    throw new Error('[surface-registry] the worked example needs the pilot surface (mobile_parcel_detail) and its contract (/api/parcels/lookup) in the census — one of them is missing, so the example would be fiction.');
  }
  const tbl = (contract.reads_tables || []).filter((t) => t !== 'unmeasured');
  const proj = Array.isArray(contract.projection) ? contract.projection : [];
  return `
## 1. Worked example — the pilot, traced end to end

Everything in §2 is a row. This section is one row followed all the way through, so the shape is concrete before the inventory starts. The subject is the **property preview** — the pilot of the whole programme, chosen because it writes nothing, holds no client state, and already has three separate renderings of one payload.

### 1.1 The census row

\`\`\`
id          ${surface.id}
kind        SURFACE
archetype   ${surface.archetype}          <- forces outputs:"none" and a field whitelist
platforms   ${(surface.platforms || []).join(', ')}
status      ${surface.status}
files       ${(surface.files || []).join(', ')}
calls       ${(surface.calls || []).join(', ')}
gate        session ${surface.gate?.session} · entitlement ${surface.gate?.entitlement}
states      ${(surface.states || []).join(', ')}
emits       ${(surface.emits || []).length ? (surface.emits || []).join(', ') : '(none — nothing it does is countable today)'}
\`\`\`

### 1.2 The descriptor it becomes (sketch, real field names)

\`\`\`jsonc
{
  "identity": {
    "id": "${surface.id}",
    "archetype": "${surface.archetype}",
    "platforms": ["mobile", "web", "pdf"],
    "owns": { "components": [] },
    "spec": "${surface.spec}",
    "spec_version": "1"
  },
  "inputs": {
    "contract_ref": ["${contract.id}"],        // by REFERENCE — never an inline schema
    "query_key": ["parcel-lookup", "parcelId"], // single-param: Spec 99 §4 hygiene, as schema
    "field_whitelist": [${proj.slice(0, 6).map((f) => `"${f}"`).join(', ')}, ...]
  },
  "outputs": "none",                            // forced by the REPORT profile
  "state": "none",                              // forced by the REPORT profile
  "guards": {
    "session": "authenticated",
    "entitlement": { "product": "parcel_tool", "statuses": ["trial","active","past_due","admin_managed"], "on_missing": "paywall" },
    "flag": "none", "permission": "none", "rate_bucket": "parcel_lookup"
  },
  "render":   { "targets": ["screen", "pdf"], "projection": "detail" },
  "metering": { "unit": "property_view", "product": "parcel_tool",
                "ledger_event": "property_view", "subject_kind": "parcel_ref",
                "quota_from_config": "parcel_tool_monthly_views", "on_exceeded": "paywall" },
  "offers":   { "placement": "parcel_preview_footer", "inventory_source": "offers", ... },
  "checks":   [ { "id": "cost_line_keys_match_engine", "kind": "field_whitelist_parity",
                  "severity": "FAIL", "blocking": true, "when": "pre", "why": "..." } ],
  "states":   [ ${(surface.states || []).slice(0, 3).map((x) => `{ "name": "${x}", "golden": "..." }`).join(', ')}, ... ]
}
\`\`\`

### 1.3 Tables

The surface touches **no table**. Its contract touches ${tbl.length}: ${tbl.map((t) => `\`${t}\``).join(', ')}. Every one of them **exists today** — this pilot needs no migration, which is a large part of why it is the pilot. The column lists are in §4.

The one net-new table the pilot introduces is \`usage_events\`, for the metering block above — because the estate's only existing meter is permit-shaped and **structurally cannot hold a parcel id**.

### 1.4 The API contract

\`\`\`
${contract.path}   ${(contract.methods || []).join(', ')}   archetype ${contract.archetype}   auth ${contract.auth_class}
reads       ${tbl.join(', ')}
writes      (nothing)
projection  ${proj.length} named fields — an explicit pick-by-name whitelist
consumers   ${(contract.consumers || []).join(', ')}
\`\`\`

The contract is a **separate descriptor**, not a section inside the surface. That is what lets one contract serve many projections — and it is measured necessity, not elegance: one contract in this estate is reached from eleven surfaces by two different idioms.

### 1.5 The three projections of that one payload

| Projection | Renderer | What differs |
|---|---|---|
| **web** | Next.js RSC on Vercel — the descriptor is parsed and the projection assembled **server-side** | Nothing of substance. This is the cheap half. |
| **mobile** | a **fetched projection** rendered by the REPORT archetype component | React Native has no Server Components, so the server returns the projected screen as JSON and the client draws it. Not SSR. |
| **admin** | the same contract with a **wider field whitelist**${admin ? ` — today \`${admin.id}\` (${admin.loc} lines, hand-written)` : ''} | More fields, not different arithmetic. If the admin tool cannot be re-expressed this way, the model is wrong — and we learn it cheaply. |

${search ? `The sibling search surface \`${search.id}\` reads the same contract by the \`q\` path, which is the fourth reading of one payload.` : ''}

### 1.6 Ledger events

\`property_view\` on open, \`pdf_send\` when a report is shared, \`offer_impression\` and \`offer_click\` for the sponsor slot. Each is a row in one generic \`usage_events\` ledger, which is **both** the meter the product bills from **and** the observability spine the admin registry reads its "usage, last 7 days" column from. One table, two jobs, no second source of truth.

### 1.7 Checks and goldens

The descriptor declares its checks; the conversion pins every declared state with a **golden pair** — the API response fixture *and* the rendered-tree snapshot produced from it. The fingerprint spans the descriptor, the contract descriptor, the archetype component and the format helpers, so changing any of them forces a recapture.

The check worth naming: the mobile cost-line order is a hand-copied transcription of the pipeline engine's line ids, **with no lock**. The admin copy of that same constant shipped broken from its first commit — three cost lines rendered *"n/a — not computable"* on 100% of 486,000 parcels, with a green UI suite, because the fixture was authored against the wrong keys. A test closed the admin side. **The mobile side is today in exactly the pre-fix state.**

### 1.8 Back to the registry row

Converting the pilot moves its row here: the category answers stop reading \`_unanswered — assessment_\`, the states gain goldens, \`owns.components[]\` is declared, and the usage column stops reading \`not_yet_metered\`. **A conversion that does not move its registry row has not been recorded.**
`;
}

function glossary() {
  return `
## 6. Glossary

| Term | Meaning |
|---|---|
| **Surface** | One thing that renders — a mobile screen, a web page, an admin tool, an overlay, a navigation shell. The unit this standard is built around. |
| **Contract** | One API endpoint: its request, its response projection, the tables it touches, its auth class, and the surfaces that call it. A separate unit from the surface, because one contract commonly serves several. |
| **Job** | Server work with no screen and no request — a scheduled database task or a workflow that runs on a timer. |
| **Archetype** | The *kind* of a surface, contract or job, which determines **which descriptor fields are mandatory**. Not a renderer label (§0.5). |
| **Descriptor** | The machine-readable declaration of one surface, contract or job — 21 categories, answered from a closed menu, validated before anything runs. The contract of the whole standard. |
| **Projection** | The server-assembled shape a surface renders. One payload can have several projections (web, mobile, admin, PDF) without being declared more than once. |
| **Ledger** | An append-only record of things that happened — a usage event, a pipeline run, an admin action. Counters are derived from it by counting rows, never stored alongside it. |
| **Gate** | What must be true before a surface renders or a contract answers: a session, an entitlement product, a feature flag, a device permission, a role. |
| **Golden** | A captured artifact that pins behaviour — here a **pair**: the API response fixture, and the rendered tree produced from it. A change that alters either shows up as a diff. |
| **Drift lock** | A test that regenerates a generated artifact and fails if the committed copy differs. It is what makes "generated, do not hand-edit" true rather than aspirational. |
| **RE-PROJECT / REBUILD** | Whether a surface can be re-rendered from a server projection as-is, or first needs a client-side decision re-homed on the server (§0.8). |
| **Orphan** | A contract with no caller, or a surface with no contract. Both are rendered, because the join between them is the thing nothing in this estate has held. |
`;
}

/**
 * The registry is a PURE PROJECTION of the descriptors. This is the only place that
 * flattens one into the shape the renderer reads — no other file re-keys a descriptor.
 */
export function renderView(d) {
  const x = d['x-draft'] || {};
  const inTables = (d.inputs && Array.isArray(d.inputs.tables)) ? d.inputs.tables : [];
  const outTables = (d.outputs && Array.isArray(d.outputs.tables)) ? d.outputs.tables : [];
  return {
    _descriptor: d,
    _shard: x.shard,
    id: d.identity.id,
    scope: d.programme.scope,
    phase: d.programme.phase,
    pilot: d.programme.pilot === true,
    scope_why: d.programme.why,
    ref: d.identity.ref,
    feature: d.programme.feature,
    build_order: d.programme.build_order,
    leakage: d.programme.leakage,
    product_questions: d.programme.product_questions,
    review: d.programme.review,
    kind: d.kind,
    archetype: d.identity.archetype,
    platforms: d.identity.platforms,
    status: d.status,
    purpose: d.docs.purpose,
    data_story: d.docs.data_story,
    under_126: d.docs.under_126,
    notes: d.notes,
    spec: d.identity.spec,
    spec_refs: d.identity.spec_refs,
    files: x.files || [],
    owns_components: d.identity.owns.components,
    loc: x.loc,
    methods: x.methods,
    cron: x.cron,
    call_idiom: x.call_idiom,
    role: x.role,
    path: d.kind === 'CONTRACT' ? d.identity.route : undefined,
    calls: d.kind === 'SURFACE' ? (d.inputs.contract_ref || []) : undefined,
    consumers: d.kind === 'CONTRACT' ? (x.consumers || d.sharing.surfaces || []) : undefined,
    auth_class: d.guards.session && d.guards.session.answer !== 'UNRESEARCHED' ? d.guards.session.answer : undefined,
    auth_why: d.guards.session && d.guards.session.why !== 'UNRESEARCHED' ? d.guards.session.why : undefined,
    gate: x.measured_gate,
    states: x.measured_states,
    emits: (d.emits && d.emits.analytics) || [],
    reads_tables: inTables.map((t) => t.table),
    writes_tables: outTables.map((t) => t.table),
    lineage: { reads: inTables, writes: outTables },
    evidence: d.evidence,
    categories: Object.fromEntries(Object.keys(d).filter((k) => CATEGORY_KEYS.has(k)).map((k) => [k, d[k]])),
  };
}

let CATEGORY_KEYS = new Set();

function render(rows, cats, archetypes, cols, unowned, owner) {
  const L = [];
  const surfaces = rows.filter((r) => r.kind === 'SURFACE');
  const contracts = rows.filter((r) => r.kind === 'CONTRACT');
  const jobs = rows.filter((r) => r.kind === 'JOB');

  L.push('# Surface registry (generated)');
  L.push('');
  L.push('> **GENERATED — do not hand-edit.** Source of record: the sharded census under `scripts/surfaces/_schema/census/` (' + CENSUS_SHARDS.map((x) => '`' + x + '.json`').join(', ') + '), merged in that fixed order.');
  L.push('> Column data is read from `src/lib/db/generated/schema.ts` (produced by `npm run db:generate`, i.e. `drizzle-kit introspect` against the live database) — it is never typed into the census.');
  L.push('> Regenerate: `node scripts/violations/generate-surface-registry.mjs`. Drift-guarded by `src/tests/surface-registry.infra.test.ts`.');
  L.push(`> SPEC LINK: \`${SPEC_127}\` §8 · \`${SPEC_126}\` §2/§3/§10 · \`${SPEC_128}\` §5 R-13`);
  L.push('');
  L.push('**New here? Start at §0** — it explains what this registry is, why it exists, how it is produced, and how to review a row. §1 then traces one surface end to end before the inventory begins.');
  L.push('');
  L.push('---');
  L.push(preamble(rows, cols));
  L.push('---');
  L.push(workedExample(rows, cols));
  L.push('---');
  L.push('');

  // ── summary ──
  L.push('## 2. Summary');
  L.push('');
  L.push('| Kind | Count |');
  L.push('|---|---:|');
  L.push(`| SURFACE | ${surfaces.length} |`);
  L.push(`| CONTRACT | ${contracts.length} |`);
  L.push(`| JOB | ${jobs.length} |`);
  L.push(`| **Total** | **${rows.length}** |`);
  L.push('');
  L.push('### 2.1 By archetype');
  L.push('');
  L.push('| Archetype | Kind | exists | new | generated | total |');
  L.push('|---|---|---:|---:|---:|---:|');
  const byArch = new Map();
  for (const r of rows) {
    const k = `${r.archetype} ${r.kind}`;
    if (!byArch.has(k)) byArch.set(k, { exists: 0, new: 0, generated: 0 });
    byArch.get(k)[r.status] += 1;
  }
  for (const [k, v] of [...byArch.entries()].sort()) {
    const [a, kind] = k.split(' ');
    L.push(`| \`${a}\` | ${kind} | ${v.exists} | ${v.new} | ${v.generated} | ${v.exists + v.new + v.generated} |`);
  }
  L.push('');
  L.push('### 2.2 Research progress');
  L.push('');
  const counts = rows.map((r) => ({ id: r.id, shard: r._shard, n: unresearchedCount(r) }));
  const totalUn = counts.reduce((t, c) => t + c.n, 0);
  const done = counts.filter((c) => c.n === 0).length;
  L.push(`**${done} of ${rows.length} rows fully researched · ${rows.length - done} still open · ${totalUn} unresearched fields in total.**`);
  L.push('');
  L.push('Every open field is the literal string `UNRESEARCHED` in the census — never a blank and never a guess — so the number below is a count of real work, not an estimate.');
  L.push('');
  L.push('| Shard | Rows | Fully researched | Rows with an open field | Unresearched fields |');
  L.push('|---|---:|---:|---:|---:|');
  for (const name of CENSUS_SHARDS) {
    const g = counts.filter((c) => c.shard === name);
    if (g.length === 0) continue;
    L.push(`| \`${name}.json\` | ${g.length} | ${g.filter((c) => c.n === 0).length} | ${g.filter((c) => c.n > 0).length} | ${g.reduce((t, c) => t + c.n, 0)} |`);
  }
  L.push(`| **total** | **${rows.length}** | **${done}** | **${rows.length - done}** | **${totalUn}** |`);
  L.push('');
  L.push('**What is left, grouped by REASON.** Every remaining field is open for one of a small number of reasons, and they are not equally actionable — three are lookups a researcher can finish, and one is an escalation that needed a ruling.');
  L.push('');
  const reasons = groupReasons(rows);
  L.push('| Reason | Fields | What closes it |');
  L.push('|---|---:|---|');
  for (const r of reasons) L.push(`| **${r.label}** | ${r.n} | ${r.closes} |`);
  L.push(`| | **${reasons.reduce((t, r) => t + r.n, 0)}** | |`);
  L.push('');
  L.push('### 2.3 By status');
  L.push('');
  const byStatus = { exists: 0, new: 0, generated: 0 };
  for (const r of rows) byStatus[r.status] += 1;
  L.push('| Status | Count | Meaning |');
  L.push('|---|---:|---|');
  L.push(`| exists | ${byStatus.exists} | the code is in the tree today |`);
  L.push(`| new | ${byStatus.new} | specified, not built |`);
  L.push(`| generated | ${byStatus.generated} | will be rendered from descriptors, not hand-written |`);
  L.push('');
  L.push('---');
  L.push('');

  L.push(scopeSummary(rows, cols));
  L.push('---');
  L.push('');

  // ── entries, PARTITIONED BY PROGRAMME SCOPE, then archetype, then platform ──
  L.push('## 3. Entries, by programme scope');
  L.push('');
  L.push('The estate shares one repository; it does not share one programme. Sections A–C are what **Spec 126 governs**. Section D is the other product — inventoried so a shared contract or an orphan is visible, and deliberately rendered in one line each rather than in full (Spec 126 §2; the fence is Spec 128 R-03).');
  L.push('');
  // The schema's archetype vocabulary now covers all three KINDS, so the contract/job
  // names are already in `archetypes`. Appending them again rendered every QUERY group
  // twice — dedupe rather than assume the two lists are disjoint.
  const archOrder = [...new Set([...archetypes, 'QUERY', 'MUTATION', 'WEBHOOK', 'COMMAND', 'EXPORT', 'TRANSLATION', 'SCHEDULED', 'DISPATCH'])];
  for (const sc of SCOPES) {
  const scoped = rows.filter((r) => r.scope === sc.key);
  if (scoped.length === 0) continue;
  L.push(`### §${sc.letter} \`${sc.key}\` — ${sc.title} (${scoped.length})`);
  L.push('');
  L.push(sc.blurb);
  L.push('');
  if (sc.compact) {
    L.push('| id | kind · archetype | what it is | scope reason |');
    L.push('|---|---|---|---|');
    for (const r of scoped.sort((x, y) => x.id.localeCompare(y.id))) {
      const first = String(r.purpose).split(/(?<=\.)\s/)[0];
      L.push(`| \`${r.id}\` | ${r.kind} · \`${r.archetype}\` | ${first} | ${r.scope_why} |`);
    }
    L.push('');
    L.push('_Rendered in one line each on purpose. These convert under the same standard in a later programme; expanding them here would bury the programme this registry exists to review._');
    L.push('');
    continue;
  }
  // Ordered EXACTLY as the §2.6 legend — scope, then type (kind rank), then build_order
  // — so a reader walking the detail sections walks them in build order, and a
  // dependency is read before the things that depend on it. The archetype is stated on
  // every row's facts line rather than used as a grouping heading, because grouping by
  // archetype and ordering by build order are different documents.
  {
    const ordered = scoped.slice().sort((x, y) => x.build_order - y.build_order || x.id.localeCompare(y.id));
    {
      const sub = ordered;
      for (const r of sub) {
        L.push(`<a id="${refAnchor(r.ref)}"></a>`);
        L.push('');
        L.push(`###### \`${r.ref}\` \`${r.id}\`${r.pilot ? ' — **THE PILOT**' : ''}`);
        L.push('');
        L.push(`**Programme.** \`${r.ref}\` · scope \`${r.scope}\` · feature \`${r.feature}\` · build order ${r.build_order} · batch ${r.phase === 'UNRESEARCHED' ? '**UNRESEARCHED**' : `\`${r.phase}\``} · review \`${(r.review && r.review.status) || 'unreviewed'}\`${r.pilot ? ' · **pilot of the whole programme**' : ''} — ${r.scope_why}`);
        L.push('');
        if (Array.isArray(r.leakage) && r.leakage.length) {
          L.push(`**⚠️ Cross-product leakage (${r.leakage.length}).** ${r.leakage.map((k) => `${k.behaviour} → \`${k.disposition}\` (${k.evidence.map((e) => `\`${e}\``).join(', ')})`).join(' · ')}`);
          L.push('');
        }
        if (Array.isArray(r.product_questions) && r.product_questions.length) {
          L.push(`**❓ Product question(s) (${r.product_questions.length}).** ${r.product_questions.map((q) => q.question).join(' · ')} — see §2.9.`);
          L.push('');
        }
        L.push(`**What it is.** ${r.purpose}`);
        L.push('');
        L.push(`**What it reads and writes.** ${r.data_story || UNMEASURED}`);
        L.push('');
        L.push(`**Under Spec 126.** ${r.under_126 || UNMEASURED}`);
        L.push('');
        const facts = [];
        facts.push(`**kind** ${r.kind}`);
        facts.push(`**archetype** \`${r.archetype}\``);
        facts.push(`**platforms** ${fmtList(r.platforms)}`);
        facts.push(`**status** ${r.status}`);
        if (r.path) facts.push(`**path** \`${r.path}\``);
        if (r.methods) facts.push(`**methods** ${fmtList(r.methods)}`);
        if (r.cron) facts.push(`**cron** \`${r.cron}\``);
        if (r.loc !== undefined) facts.push(`**lines** ${fmtScalar(r.loc)}`);
        const nUn = unresearchedCount(r);
        facts.push(`**shard** \`${r._shard}\``);
        facts.push(nUn === 0 ? '**researched** ✅ every field' : `**unresearched fields: ${nUn}**`);
        L.push(facts.join(' · '));
        L.push('');
        // gate
        const g = r.gate || {};
        const gateBits = [];
        if (r.auth_class) gateBits.push(`auth class **${r.auth_class}**${r.auth_why ? ` (${r.auth_why})` : ''}`);
        if (g.session) gateBits.push(`session **${fmtScalar(g.session)}**${g.why ? ` (${g.why})` : ''}`);
        if (g.entitlement) gateBits.push(`entitlement ${fmtScalar(g.entitlement)}`);
        if (g.flag) gateBits.push(`flag ${fmtScalar(g.flag)}`);
        if (g.permission) gateBits.push(`device permission ${fmtScalar(g.permission)}`);
        if (r.role) gateBits.push(`role **${r.role}**`);
        L.push(`**Gate.** ${gateBits.length ? gateBits.join(' · ') : UNMEASURED}`);
        L.push('');
        // edges
        if (r.kind === 'SURFACE') {
          L.push(`**Calls.** ${fmtList(r.calls)}${r.call_idiom ? ` — idiom: ${fmtScalar(r.call_idiom)}` : ''}`);
        } else if (r.kind === 'CONTRACT') {
          const cons = r.consumers;
          L.push(`**Called by.** ${Array.isArray(cons) && cons.length === 0 ? '**nothing — orphan contract**' : fmtList(cons)}`);
        }
        L.push('');
        const owned = componentsOwnedBy(r);
        if (r.kind === 'SURFACE') {
          L.push(`**Components owned.** ${owned.length === 0 ? '—' : owned.map((f) => `\`${f}\``).join(' · ')}`);
          L.push('');
        }
        if (r.emits || r.ledger_events) {
          L.push(`**Emits.** ${fmtList(r.ledger_events || r.emits)}`);
          L.push('');
        }
        if (r.states) { L.push(`**Render states seen in code.** ${fmtList(r.states)}`); L.push(''); }
        L.push('**Data lineage.**');
        L.push('');
        L.push(lineageBlock(r, cols));
        L.push('');
        L.push('**Evidence.**');
        L.push('');
        L.push(evidenceBlock(r));
        L.push('');
        L.push(`<details><summary>21 category answers — ${answeredIn(r)} answered, ${21 - answeredIn(r)} unresearched</summary>`);
        L.push('');
        L.push(categoriesTable(r, cats));
        L.push('');
        L.push('</details>');
        L.push('');
        const links = [];
        links.push(`schema: [\`${SCHEMA_REL}\`](../../../${SCHEMA_REL})`);
        links.push(`owning spec: ${r.spec && r.spec !== 'unmeasured' ? `[\`${r.spec}\`](../../../${r.spec})` : UNMEASURED}`);
        if (r.files && r.files.length) links.push(`files: ${r.files.map((f) => `\`${f}\``).join(' · ')}`);
        else if (r.file) links.push(`file: \`${r.file}\``);
        L.push(`**Links.** ${links.join(' · ')}`);
        if (r.notes) { L.push(''); L.push(`> ⚠️ ${r.notes}`); }
        L.push('');
      }
    }
  }

  }
  L.push('---');
  L.push('');

  // ── tables & fields index ──
  L.push('## 4. Tables & fields index');
  L.push('');
  L.push('Every table any entry reads or writes, its real columns, and who touches it. **exists** = present in the introspected schema; **net-new** = specified but not yet in the database.');
  L.push('');
  const touch = new Map();
  for (const r of rows) {
    for (const t of r.reads_tables || []) {
      if (t === 'unmeasured') continue;
      if (!touch.has(t)) touch.set(t, { reads: [], writes: [] });
      touch.get(t).reads.push(r.id);
    }
    for (const t of r.writes_tables || []) {
      if (t === 'unmeasured') continue;
      if (!touch.has(t)) touch.set(t, { reads: [], writes: [] });
      touch.get(t).writes.push(r.id);
    }
  }
  const existing = [...touch.keys()].filter((t) => cols.has(t)).sort();
  const netNew = [...touch.keys()].filter((t) => !cols.has(t)).sort();
  L.push(`**${touch.size}** distinct tables are touched — **${existing.length}** exist today, **${netNew.length}** are net-new.`);
  L.push('');
  for (const [label, list] of [['Existing tables', existing], ['Net-new tables', netNew]]) {
    L.push(`### ${label} (${list.length})`);
    L.push('');
    if (list.length === 0) { L.push('_none_'); L.push(''); continue; }
    L.push('| Table | Columns | Read by | Written by |');
    L.push('|---|---|---|---|');
    for (const t of list) {
      const c = cols.get(t);
      const v = touch.get(t);
      L.push(`| \`${t}\` | ${c ? c.map((x) => `\`${x}\``).join(' · ') : '_net-new — no introspected columns_'} | ${v.reads.length ? v.reads.map((x) => `\`${x}\``).join(' · ') : '—'} | ${v.writes.length ? v.writes.map((x) => `\`${x}\``).join(' · ') : '—'} |`);
    }
    L.push('');
  }

  // ── R-13 totality, direction 2 ──
  L.push('---');
  L.push('');
  L.push('## 5. Unowned components');
  L.push('');
  L.push('Spec 128 **R-13**: every component file under `src/components/**` or `mobile/src/components/**` appears in exactly **one** surface\'s `owns.components[]`. A file claimed by two surfaces makes this generator throw; a file claimed by **none** is listed here. Review question 5 of §0.6.');
  L.push('');
  L.push(`**This section must be empty.** It is asserted empty by \`src/tests/surface-registry.infra.test.ts\`. Today it is **not** — ${unowned.length} of ${unowned.length + owner.size} component files have no declared owner, which is the measurement R-13 exists to retire, stated rather than hidden.`);
  L.push('');
  if (unowned.length === 0) {
    L.push('_none — every component file is owned._');
  } else {
    L.push('| Component file | Owner |');
    L.push('|---|---|');
    for (const f of unowned) L.push(`| \`${f}\` | **none** |`);
  }
  L.push('');
  L.push('---');
  L.push(glossary());
  L.push('---');
  L.push('');
  L.push(`*Generated from ${rows.length} census rows and ${cols.size} introspected tables. Nothing in this file is hand-written; correct it by correcting \`scripts/surfaces/_schema/surface-census.json\` and regenerating.*`);
  L.push('');
  return L.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────

/** Merge the shards in the declared order; a missing shard is a refusal, not an empty list. */
/**
 * AJV-validate every row against surface.schema.json on EVERY run. A census row IS a
 * draft descriptor in the exact shape the schema defines — there is no second shape
 * and no re-keying step between "reviewed in the registry" and "read by the engine".
 * Draft rows may carry the "UNRESEARCHED" sentinel only where the schema marks the
 * field `x-draft-optional`; the registry counts every one.
 */
export function validateAgainstSchema(rows) {
  let Ajv;
  try { Ajv = require_('ajv'); } catch {
    throw new Error('[surface-registry] ajv is not installed, so descriptors cannot be validated. A generator that silently skips validation is worse than one that fails.');
  }
  const schema = JSON.parse(read(SCHEMA_PATH));
  const ajv = new (Ajv.default || Ajv)({ strict: false, allErrors: true });
  const validate = ajv.compile(schema);
  const bad = [];
  for (const r of rows) {
    if (!validate(r)) {
      const id = r?.identity?.id || '(no identity.id)';
      bad.push(`${id}: ${(validate.errors || []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
    }
  }
  if (bad.length) {
    throw new Error(`[surface-registry] ${bad.length} descriptor(s) do not validate against ${rel(SCHEMA_PATH)}:\n  ${bad.slice(0, 10).join('\n  ')}`);
  }
  return rows;
}

/** Read the descriptors, from the emitted files if they exist, else from the shards. Identical result. */
export function loadDescriptors() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (e.name.endsWith('.descriptor.json')) out.push(JSON.parse(read(full)));
    }
  };
  walk(DESCRIPTOR_DIR);
  return out;
}

export function loadCensus() {
  if (CENSUS_PATH) {
    const one = JSON.parse(read(CENSUS_PATH));
    return Array.isArray(one) ? one : one.entries;
  }
  const out = [];
  for (const name of CENSUS_SHARDS) {
    const f = path.join(CENSUS_DIR, `${name}.json`);
    if (!fs.existsSync(f)) {
      throw new Error(`[surface-registry] census shard "${name}.json" is missing from ${rel(CENSUS_DIR)}. The merge order is fixed (${CENSUS_SHARDS.join(', ')}); a missing shard silently shrinks the estate, so it is a refusal.`);
    }
    const list = JSON.parse(read(f));
    if (!Array.isArray(list)) throw new Error(`[surface-registry] shard ${name}.json is not an array`);
    // Do NOT mutate the descriptor — additionalProperties:false means any bookkeeping
    // key would make it invalid. The shard is already recorded at x-draft.shard.
    for (const r of list) out.push(r);
  }
  return out;
}

const U = 'UNRESEARCHED';

/** Count the fields a researcher still has to fill in, per row. Recursive over the row. */
export function unresearchedCount(rowOrDescriptor) {
  const row = rowOrDescriptor._descriptor || rowOrDescriptor;
  let n = 0;
  const walk = (v) => {
    if (v === U) { n += 1; return; }
    if (typeof v === 'string') { if (v.startsWith(U)) n += 1; return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) { if (k === '_shard') continue; walk(v[k]); } }
  };
  walk(row);
  return n;
}

/**
 * THE REVIEW QUEUE — one card per scope A/B/C entry, rendered in build order.
 * A fixed question set, answered FROM THE DESCRIPTOR with its evidence, so a reviewer
 * walks the same nine questions every time instead of improvising a different pass per
 * surface. "Fine-tooth comb" is a method only if the teeth are the same width.
 */
export function buildQueue(rows, cols) {
  const feats = loadFeatures();
  const featName = Object.fromEntries(feats.map((f) => [f.id, f.name]));
  const q = rows.filter((r) => r.scope !== 'estate_other').sort((a, b) => a.build_order - b.build_order || a.id.localeCompare(b.id));
  const L = [];
  L.push('# Surface review queue (generated)');
  L.push('');
  L.push('> **GENERATED — do not hand-edit.** Source of record: the sharded census under `scripts/surfaces/_schema/census/`.');
  L.push('> Regenerate: `node scripts/violations/generate-surface-registry.mjs`. Drift-guarded by `src/tests/surface-registry.infra.test.ts`.');
  L.push(`> SPEC LINK: \`${SPEC_127}\` §9 (Review procedure) · \`${SPEC_126}\` §2.0 (the programme partition)`);
  L.push('');
  L.push('## How to use this');
  L.push('');
  L.push('One card per entry that Spec 126 governs — scopes A, B and C — **in build order**, so reviewing top to bottom reviews dependencies before the things that depend on them. Scope D (the other product) is not queued.');
  L.push('');
  L.push('Every card answers the **same nine questions** from the descriptor, with the evidence inline. Walk them in order. When a card is right, set `programme.review` to `{"status": "reviewed", "reviewer": "...", "date": "..."}` in the census shard and regenerate; when something must change, set `needs_change` and put what in `notes`. **The status lives in the descriptor, not in anyone\'s memory.**');
  L.push('');
  const byStatus = {};
  for (const r of q) byStatus[(r.review && r.review.status) || 'unreviewed'] = (byStatus[(r.review && r.review.status) || 'unreviewed'] || 0) + 1;
  L.push(`**${q.length} cards** — ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(' · ')}.`);
  L.push('');
  L.push('| # | id | entry | scope | feature | build | review |');
  L.push('|---:|---|---|---|---|---:|---|');
  q.forEach((r, i) => {
    L.push(`| ${i + 1} | [\`${r.ref}\`](#${refAnchor(`card-${r.ref}`)}) | [\`${r.id}\`](#${refAnchor(`card-${r.ref}`)}) | \`${r.scope}\` | \`${r.feature}\` | ${r.build_order} | \`${(r.review && r.review.status) || 'unreviewed'}\` |`);
  });
  L.push('');
  L.push('---');
  L.push('');

  q.forEach((r, i) => {
    const d = r._descriptor;
    L.push(`<a id="${refAnchor(`card-${r.ref}`)}"></a>`);
    L.push('');
    L.push(`## Card ${i + 1} — \`${r.ref}\` \`${r.id}\`${r.pilot ? ' — **THE PILOT**' : ''}`);
    L.push('');
    L.push(`Registry detail: [\`${r.ref}\`](../../../docs/reports/generated/127-surface-registry.md#${refAnchor(r.ref)}) \`${r.id}\`.`);
    L.push('');
    L.push(`\`${r.kind}\` · \`${r.archetype}\` · scope \`${r.scope}\` · feature \`${r.feature}\` ${featName[r.feature] || ''} · build order ${r.build_order} · batch ${r.phase} · **review: \`${(r.review && r.review.status) || 'unreviewed'}\`**${r.review && r.review.reviewer ? ` (${r.review.reviewer}, ${r.review.date})` : ''}`);
    if (r.review && r.review.notes) { L.push(''); L.push(`> ${r.review.notes}`); }
    L.push('');

    L.push('**1. What does it do, and for whom?**');
    L.push('');
    L.push(r.purpose);
    L.push('');

    L.push('**2. Which tables and columns, produced by which step?**');
    L.push('');
    L.push(lineageBlock(r, cols));
    L.push('');

    L.push('**3. Which contracts, and who calls them?**');
    L.push('');
    if (r.kind === 'CONTRACT') {
      const cons = r.consumers || [];
      L.push(cons.length === 0 ? '**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.' : `Called by ${cons.length}: ${cons.map((c) => `\`${c}\``).join(' · ')}`);
    } else {
      const calls = r.calls || [];
      L.push(calls.length === 0 ? 'It reaches no contract — every value is local, a prop, or device state.' : `Calls ${calls.length}: ${calls.map((c) => `\`${c}\``).join(' · ')}${r.call_idiom ? ` (idiom: ${r.call_idiom})` : ''}`);
    }
    L.push('');

    L.push('**4. What gate, role or entitlement stands in front of it?**');
    L.push('');
    const g = d.guards || {};
    const bits = [];
    bits.push(`session \`${(g.session && g.session.answer) || UNMEASURED}\`${g.session && g.session.why && g.session.why !== U ? ` — ${g.session.why}` : ''}`);
    bits.push(`RLS class \`${(g.rls_class && g.rls_class.answer) || UNMEASURED}\``);
    bits.push(`entitlement ${typeof g.entitlement === 'object' ? `\`${g.entitlement.product}\`` : `\`${g.entitlement}\``}`);
    if (g.role_name && g.role_name !== U) bits.push(`role \`${g.role_name}\``);
    L.push(bits.join(' · '));
    L.push('');

    L.push('**5. What archetype, and why that one?**');
    L.push('');
    L.push(`\`${r.archetype}\` — its profile makes specific fields mandatory (see [the schema](../../../${SCHEMA_REL})). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.`);
    L.push('');

    L.push('**6. Is any behaviour here lead-gen leakage?**');
    L.push('');
    if (Array.isArray(r.leakage) && r.leakage.length) {
      for (const k of r.leakage) L.push(`- ⚠️ ${k.behaviour} → owning product \`${k.owning_product}\`, proposed \`${k.disposition}\`. Evidence: ${k.evidence.map((e) => `\`${e}\``).join(' · ')}`);
    } else if (r.leakage === U) {
      L.push('**UNRESEARCHED** — not yet swept.');
    } else {
      L.push('Swept; none found.');
    }
    L.push('');

    L.push('**7. Does it match its owning spec section?**');
    L.push('');
    L.push(`Spec: ${r.spec && r.spec !== U ? `[\`${r.spec}\`](../../../${r.spec})` : `**${U}** — no SPEC LINK header and no System Map row, so there is nothing to check it against`}${Array.isArray(r.spec_refs) && r.spec_refs[0] !== U ? ` · anchors: ${r.spec_refs.map((x) => `\`${x}\``).join(' · ')}` : ''}`);
    if (Array.isArray(r.product_questions) && r.product_questions.length) {
      L.push('');
      for (const pq of r.product_questions) L.push(`- ❓ ${pq.question} **Measured:** ${pq.measured}${pq.spec_says ? ` **Spec:** ${pq.spec_says}` : ''}`);
    }
    L.push('');

    L.push('**8. What is still unresearched?**');
    L.push('');
    const n = unresearchedCount(r);
    L.push(n === 0 ? 'Nothing — every field is answered with a why and a citation.' : `**${n} field(s).** They are the literal \`UNRESEARCHED\` in the descriptor; §2.2 of the registry groups them by reason.`);
    L.push('');

    L.push('**9. What would removing it delete?**');
    L.push('');
    const sameFeature = rows.filter((x) => x.feature === r.feature);
    const myTables = new Set([...(r.reads_tables || []), ...(r.writes_tables || [])]);
    const soleReader = [...myTables].filter((t) => !rows.some((x) => x.id !== r.id && [...(x.reads_tables || []), ...(x.writes_tables || [])].includes(t)));
    L.push(`It is 1 of ${sameFeature.length} entr(ies) in feature \`${r.feature}\`. ${r.owns_components && r.owns_components.length ? `Removing it deletes ${r.owns_components.length} owned component(s): ${r.owns_components.map((f) => `\`${f}\``).join(' · ')}. ` : 'It owns no component. '}${soleReader.length ? `It is the ONLY reader or writer of ${soleReader.map((t) => `\`${t}\``).join(' · ')} — removing it orphans ${soleReader.length === 1 ? 'that table' : 'those tables'}.` : 'Every table it touches is touched by something else, so removing it orphans none.'}`);
    L.push('');
    L.push('---');
    L.push('');
  });
  return L.join('\n');
}

export function build() {
  const { cats, archetypes } = loadCategories();
  const descriptors = loadCensus();
  validateAgainstSchema(descriptors);
  const rows = descriptors.map(renderView);
  validateCensus(rows, archetypes);
  const owner = ownershipIndex(rows);
  const cols = parseDrizzleColumns(read(DRIZZLE_PATH));
  const unowned = allComponentFiles().filter((f) => !owner.has(f));
  return { md: render(rows, cats, archetypes, cols, unowned, owner), queue: buildQueue(rows, cols), rows, cols, unowned };
}

/**
 * TYPES + RUNTIME VALIDATOR, both generated from the ONE schema.
 * json-schema-to-typescript is not a dependency of this repo, so this is a small
 * deliberate generator over the shapes this schema actually uses (const unions,
 * anyOf/oneOf, objects, arrays) rather than a new dependency for one file.
 * There is NO second hand-written type: the engine, the tests and the seeder all
 * import from here.
 */
function tsTypeOf(node, name, out, depth = 0, root = null) {
  if (!node || typeof node !== 'object') return 'unknown';
  if (node.$ref && root) {
    const seg = String(node.$ref).replace(/^#\//, '').split('/');
    let t = root;
    for (const k of seg) t = t && t[k];
    return t && depth < 8 ? tsTypeOf(t, name, out, depth + 1, root) : 'unknown';
  }
  if (node.$ref) return 'unknown';
  const alts = node.oneOf || node.anyOf;
  if (Array.isArray(alts)) {
    const parts = alts.map((a) => tsTypeOf(a, name, out, depth + 1, root));
    return [...new Set(parts)].join(' | ');
  }
  if (typeof node.const === 'string') return JSON.stringify(node.const);
  if (Array.isArray(node.enum)) return node.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (node.type === 'array') return `Array<${tsTypeOf(node.items || {}, name, out, depth + 1, root)}>`;
  if (node.type === 'string') return 'string';
  if (node.type === 'integer' || node.type === 'number') return 'number';
  if (node.type === 'boolean') return 'boolean';
  if (node.type === 'object' || node.properties) {
    const req = new Set(node.required || []);
    const props = node.properties || {};
    const keys = Object.keys(props);
    if (keys.length === 0) return node.additionalProperties === false ? 'Record<string, never>' : 'Record<string, unknown>';
    const body = keys
      .map((k) => {
        const doc = props[k].description ? `  /** ${String(props[k].description).replace(/\*\//g, '*\/').slice(0, 240)} */\n` : '';
        return `${doc}  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}${req.has(k) ? '' : '?'}: ${tsTypeOf(props[k], name, out, depth + 1, root)};`;
      })
      .join('\n');
    return `{\n${body}\n}`;
  }
  return 'unknown';
}

export function emitTypes() {
  const schema = JSON.parse(read(SCHEMA_PATH));
  const L = [];
  L.push('// GENERATED FROM scripts/surfaces/_schema/surface.schema.json — DO NOT EDIT.');
  L.push('// Regenerate: node scripts/violations/generate-surface-registry.mjs --emit-descriptors');
  L.push('// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §5 (the one-source rule:');
  L.push('//   schema -> descriptor -> { types, validator, migration assertions, contracts, projections, registry, seed }).');
  L.push('// There is no second hand-written type for a descriptor. If this file is wrong, the SCHEMA is wrong.');
  L.push('');
  L.push('/** The literal a draft descriptor carries where a field is `x-draft-optional` and nobody has researched it yet. */');
  L.push("export type Unresearched = 'UNRESEARCHED';");
  L.push('');
  const topLevel = tsTypeOf(schema, 'SurfaceDescriptor', L, 0, schema);
  L.push('/** One SURFACE, CONTRACT or JOB descriptor. */');
  L.push(`export type SurfaceDescriptor = ${topLevel};`);
  L.push('');
  const arch = schema.properties.identity.properties.archetype;
  const archVals = (arch.oneOf || arch.anyOf || []).map((o) => o.const).filter(Boolean);
  L.push(`export type Archetype = ${archVals.map((v) => JSON.stringify(v)).join(' | ')};`);
  L.push(`export type DescriptorKind = ${(schema.properties.kind.oneOf || []).map((o) => JSON.stringify(o.const)).join(' | ')};`);
  L.push(`export type DescriptorStatus = ${(schema.properties.status.oneOf || []).map((o) => JSON.stringify(o.const)).join(' | ')};`);
  L.push(`export const CATEGORIES = ${JSON.stringify(schema['x-categories'])} as const;`);
  L.push('export type Category = (typeof CATEGORIES)[number];');
  L.push('');
  fs.mkdirSync(path.dirname(TYPES_OUT), { recursive: true });
  fs.writeFileSync(TYPES_OUT, L.join('\n'));

  const V = [];
  V.push('// GENERATED — DO NOT EDIT. Regenerate with `--emit-descriptors`.');
  V.push('// The ONE runtime validator. The SurfaceEngine, the checkers, the Supabase seeder and');
  V.push('// the tests all import this; nobody re-implements descriptor validation.');
  V.push("import fs from 'node:fs';");
  V.push("import path from 'node:path';");
  V.push("import { fileURLToPath } from 'node:url';");
  V.push("import { createRequire } from 'node:module';");
  V.push('');
  V.push("const require_ = createRequire(import.meta.url);");
  V.push("const HERE = path.dirname(fileURLToPath(import.meta.url));");
  V.push("export const SCHEMA_PATH = path.resolve(HERE, '../../../../scripts/surfaces/_schema/surface.schema.json');");
  V.push('export const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, \'utf8\'));');
  V.push('');
  V.push('const Ajv = require_(\'ajv\');');
  V.push("const ajv = new (Ajv.default || Ajv)({ strict: false, allErrors: true });");
  V.push('const _validate = ajv.compile(schema);');
  V.push('');
  V.push('/** Validate one descriptor. Returns { valid, errors }. Throws nothing — callers decide. */');
  V.push('export function validateDescriptor(descriptor) {');
  V.push('  const valid = _validate(descriptor);');
  V.push('  return { valid, errors: valid ? [] : (_validate.errors || []).map((e) => `${e.instancePath || \'/\'} ${e.message}`) };');
  V.push('}');
  V.push('');
  V.push('/** Validate, or throw with every error named. Used where a bad descriptor must refuse. */');
  V.push('export function assertDescriptor(descriptor) {');
  V.push('  const { valid, errors } = validateDescriptor(descriptor);');
  V.push('  if (!valid) throw new Error(`invalid descriptor ${descriptor?.identity?.id ?? \'(no id)\'}: ${errors.join(\'; \')}`);');
  V.push('  return descriptor;');
  V.push('}');
  V.push('');
  V.push('/** The fields a draft descriptor may leave as the UNRESEARCHED sentinel. */');
  V.push('export const DRAFT_SENTINEL = \'UNRESEARCHED\';');
  V.push('');
  V.push('/** How many fields of this descriptor are still unresearched. */');
  V.push('export function unresearchedCount(descriptor) {');
  V.push('  let n = 0;');
  V.push('  const walk = (v) => {');
  V.push('    if (v === DRAFT_SENTINEL) { n += 1; return; }');
  V.push('    if (typeof v === \'string\') { if (v.startsWith(DRAFT_SENTINEL)) n += 1; return; }');
  V.push('    if (Array.isArray(v)) { v.forEach(walk); return; }');
  V.push('    if (v && typeof v === \'object\') for (const k of Object.keys(v)) { if (k === \'x-draft\') continue; walk(v[k]); }');
  V.push('  };');
  V.push('  walk(descriptor);');
  V.push('  return n;');
  V.push('}');
  V.push('');
  fs.writeFileSync(VALIDATOR_OUT, V.join('\n'));
  return 5;
}

/**
 * The emitted tree is partitioned by PROGRAMME SCOPE first, then by kind. The standard
 * is estate-wide — all 137 descriptors are emitted — but a reader, a checker and the
 * SurfaceEngine all want to address one programme at a time, and a flat directory of
 * 137 files makes the parcel product indistinguishable from the estate it shares a
 * repository with. Scope is a directory, not a filter.
 */
function descriptorPath(d) {
  return path.join(DESCRIPTOR_DIR, d.programme.scope, d.programme.feature, KIND_DIR[d.kind], `${d.identity.id}.descriptor.json`);
}

/** One file per descriptor, at the location the engine, the seeder and the checkers read. */
export function emitDescriptors(descriptors, { write }) {
  const planned = new Map();
  for (const d of descriptors) planned.set(descriptorPath(d), JSON.stringify(d, null, 2) + '\n');
  const drift = [];
  // direction 1: every planned file exists with exactly this content
  for (const [f, body] of planned) {
    const cur = fs.existsSync(f) ? read(f) : null;
    if (cur !== body) drift.push(`${cur === null ? 'missing' : 'stale'}: ${rel(f)}`);
  }
  // direction 2: no emitted file that the shards no longer declare — walked over the
  // whole tree, so a descriptor left behind by a scope change is caught, not orphaned.
  const walkEmitted = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walkEmitted(full); continue; }
      if (!e.name.endsWith('.descriptor.json')) continue;
      if (!planned.has(full)) drift.push(`orphan: ${rel(full)} — no census row declares it`);
    }
  };
  walkEmitted(DESCRIPTOR_DIR);
  if (write) {
    for (const [f, body] of planned) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, body);
    }
  }
  return { count: planned.size, drift };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();
  if (argv.includes('--emit-descriptors')) {
    const descriptors = validateAgainstSchema(loadCensus());
    const { count, drift } = emitDescriptors(descriptors, { write: true });
    console.log(`[surface-registry] emitted ${count} descriptor(s) under ${rel(DESCRIPTOR_DIR)}`);
    if (drift.length) console.log(`[surface-registry] (${drift.length} were stale or orphaned and are now reconciled)`);
    const t = emitTypes();
    console.log(`[surface-registry] wrote ${rel(TYPES_OUT)} and ${rel(VALIDATOR_OUT)} (${t} exported types)`);
    return;
  }
  const check = argv.includes('--check');
  const { md, queue, rows, cols, unowned } = build();
  if (check) {
    const curQ = fs.existsSync(QUEUE_OUT) ? read(QUEUE_OUT) : null;
    if (curQ !== queue) {
      console.error(`[surface-registry] DRIFT — ${rel(QUEUE_OUT)} is stale. Run \`node scripts/violations/generate-surface-registry.mjs\` to regenerate.`);
      process.exit(1);
    }
    const current = fs.existsSync(OUT_PATH) ? read(OUT_PATH) : null;
    if (current !== md) {
      console.error(`[surface-registry] DRIFT — ${rel(OUT_PATH)} is stale. Run \`node scripts/violations/generate-surface-registry.mjs\` to regenerate.`);
      process.exit(1);
    }
    // descriptors must equal the shards, in BOTH directions, so the shards can be retired
    const { count, drift } = emitDescriptors(validateAgainstSchema(loadCensus()), { write: false });
    if (drift.length) {
      console.error(`[surface-registry] DESCRIPTOR DRIFT — ${drift.length} file(s) disagree with the census. Run \`--emit-descriptors\`.`);
      for (const d of drift.slice(0, 10)) console.error(`  ${d}`);
      process.exit(1);
    }
    console.log(`[surface-registry] clean — no drift (${rows.length} rows, ${count} descriptors)`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, md);
  fs.writeFileSync(QUEUE_OUT, queue);
  console.log(`[surface-registry] wrote ${rel(QUEUE_OUT)} (${rows.filter((r) => r.scope !== 'estate_other').length} review cards)`);
  console.log(`[surface-registry] wrote ${rel(OUT_PATH)} — ${rows.length} rows · ${cols.size} introspected tables · ${unowned.length} unowned components`);
}

function selfTest() {
  const results = [];
  const expectThrow = (label, fn, needle) => {
    let e = null;
    try { fn(); } catch (err) { e = err; }
    const ok = !!e && String(e.message).includes(needle);
    results.push({ label, ok, got: e ? e.message.slice(0, 110) : '(no throw)' });
  };
  const A = ['LIST', 'REPORT'];

  expectThrow('a row missing a required field throws', () => {
    validateCensus([{ id: 'x', kind: 'SURFACE', archetype: 'LIST', platforms: ['web'], status: 'exists' }], A);
  }, 'missing required field');

  expectThrow('a duplicate id throws', () => {
    const r = { id: 'x', kind: 'SURFACE', archetype: 'LIST', platforms: ['web'], status: 'exists', purpose: 'p', data_story: 'd', under_126: 'u' };
    validateCensus([r, { ...r }], A);
  }, 'duplicate census id');

  expectThrow('an archetype the schema does not declare throws', () => {
    validateCensus([{ id: 'x', kind: 'SURFACE', archetype: 'MAP', platforms: ['web'], status: 'exists', purpose: 'p', data_story: 'd', under_126: 'u' }], A);
  }, 'is not declared in');

  expectThrow('an unknown status throws', () => {
    validateCensus([{ id: 'x', kind: 'SURFACE', archetype: 'LIST', platforms: ['web'], status: 'someday', purpose: 'p', data_story: 'd', under_126: 'u' }], A);
  }, 'unknown status');

  expectThrow('a dangling calls edge throws', () => {
    validateCensus([{ id: 'x', kind: 'SURFACE', archetype: 'LIST', platforms: ['web'], status: 'exists', purpose: 'p', data_story: 'd', under_126: 'u', calls: ['/api/ghost'] }], A);
  }, 'dangling edge');

  expectThrow('a component owned by TWO surfaces throws (R-13)', () => {
    ownershipIndex([
      { id: 'a', kind: 'SURFACE', files: ['src/components/Shared.tsx'] },
      { id: 'b', kind: 'SURFACE', files: ['src/components/Shared.tsx'] },
    ]);
  }, 'claimed by BOTH');

  expectThrow('RED: a LIST row that lacks render.list is REFUSED (the archetype profile is real, not vacuous)', () => {
    const rows = loadCensus();
    const list = rows.find((r) => r.identity && r.identity.archetype === 'LIST');
    if (!list) throw new Error('[surface-registry] no LIST row to prove the profile against');
    const broken = JSON.parse(JSON.stringify(list));
    delete broken.render.list;
    validateAgainstSchema([broken]);
  }, "must have required property 'list'");

  expectThrow('RED: a DASHBOARD row that lacks render.tiles is REFUSED', () => {
    const rows = loadCensus();
    const dash = rows.find((r) => r.identity && r.identity.archetype === 'DASHBOARD');
    if (!dash) throw new Error('[surface-registry] no DASHBOARD row to prove the profile against');
    const broken = JSON.parse(JSON.stringify(dash));
    delete broken.render.tiles;
    validateAgainstSchema([broken]);
  }, "must have required property 'tiles'");

  expectThrow('RED: a REPORT row whose outputs are not "none" is REFUSED', () => {
    const rows = loadCensus();
    const rep_ = rows.find((r) => r.identity && r.identity.archetype === 'REPORT');
    if (!rep_) throw new Error('[surface-registry] no REPORT row to prove the profile against');
    const broken = JSON.parse(JSON.stringify(rep_));
    broken.outputs.answer = 'contract_only';
    validateAgainstSchema([broken]);
  }, 'do not validate against');

  // positive control: the drizzle parser actually finds tables and columns
  const cols = parseDrizzleColumns(read(DRIZZLE_PATH));
  results.push({
    label: 'drizzle parser extracts tables and columns from the introspected schema',
    ok: cols.size > 50 && [...cols.values()].every((c) => c.length > 0),
    got: `${cols.size} tables`,
  });

  let fail = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.ok ? '' : ` — got: ${r.got}`}`);
    if (!r.ok) fail += 1;
  }
  console.log(`[surface-registry] self-test: ${results.length - fail}/${results.length} passed`);
  if (fail) process.exit(1);
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) main();
