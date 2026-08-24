#!/usr/bin/env node
/**
 * Controlled-vocabulary extractor — ports Spec 120 §3.2 into a frozen contract.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md
 *
 * WHY THIS EXISTS. Spec 122 §3 must state the descriptor's allowed responses
 * "set in stone, not re-written 27 times." Hand-transcribing §3.2 is exactly how
 * Spec 121 measured a ~60% citation-error rate on hand-written detail.
 *
 * IT MUST NOT SILENTLY RESOLVE THE KNOWN SPLIT-TABLE DEFECT. Spec 121 §12.1a
 * records that §3.2 is TWO tables: a 4-column table, a stray 3-column separator,
 * then an 11-row orphan fragment RE-DECLARING fields already declared above.
 * Three of the eleven are genuine value conflicts, not notation:
 *   identity.archetype   INGESTOR|... vs ING|...
 *   identity.lock        "the generated registry" vs "manifest u one-time u backfill"
 *   guards.schema_drift  none/warn/pause vs pause/propagate/none   <-- warn != propagate
 * A generator that picks one silently produces a clean-looking frozen contract
 * built on an unresolved conflict. This one REPORTS them and exits non-zero
 * unless --allow-conflicts is passed.
 *
 * TOOLING GATE (Spec 121 12b.6): --self-test proves conflict detection FIRES,
 * using a fixture that carries a deliberate genuine conflict, plus a negative
 * control asserting a clean table reports none.
 *
 * ⛔ SUPERSEDED BY RULING R2 (2026-08-23) — one-time migration tool. The schema
 * is canonical and schema-to-vocab.mjs generates the artifact; every invocation
 * here now requires --force so a stray re-run cannot clobber it. --self-test is
 * exempt and stays green.
 *
 * Usage:
 *   node scripts/violations/extract-vocab.mjs --force         # print + conflict report
 *   node scripts/violations/extract-vocab.mjs out.md
 *   node scripts/violations/extract-vocab.mjs --json
 *   node scripts/violations/extract-vocab.mjs --self-test
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_120 = path.join(ROOT, 'docs/specs/01-pipeline/120_pipeline_step_runner.md');

/** Spec 120 3.1's 13, plus the four Spec 122 adds. Order is frozen. */
export const CATEGORIES = [
  'identity', 'inputs', 'outputs', 'staleness', 'guards', 'execution',
  'checks', 'override', 'emits', 'deviations', 'limitations',
  'interpretation', 'recovery',
  // --- Spec 122 additions, each retiring a MEASURED defect class ---
  'database', 'counters', 'config', 'sharing',
];

const MARKERS = { '†': 'required', '~': 'derived - do not declare', '!': 'runner change to extend' };

function splitRow(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const body = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
  return body.split('|').map((c) => c.trim());
}
const isSep = (c) => c.every((x) => /^:?-{2,}:?$/.test(x.replace(/\s/g, '')));

function parseField(cell) {
  const markers = [];
  for (const g of Object.keys(MARKERS)) if (cell.includes(g)) markers.push(g);
  const name = cell.replace(/\*\*/g, '').replace(/[†~!]/g, '').replace(/`/g, '').trim();
  return { name, markers };
}

/** Split an "allowed values" cell into discrete values where it is an enum. */
function parseValues(cell) {
  const banned = [];
  let s = cell;
  // Both ~~strikethrough~~ and the no-entry glyph mark a banned value here.
  for (const m of s.matchAll(/~~`?([A-Za-z_]+)`?~~/g)) banned.push(m[1]);
  for (const m of s.matchAll(/⛔\s*`?([A-Za-z_]+)`?/g)) banned.push(m[1]);
  s = s.replace(/~~[^~]*~~/g, '').replace(/⛔/g, '');
  const ticks = [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const looksEnum = s.includes('·') && ticks.length >= 2;
  return { enum: looksEnum ? ticks : null, prose: cell, banned: [...new Set(banned)] };
}

export function parseVocab(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let inSection = false;
  let sawHeader = false;

  for (const line of lines) {
    const h = /^###\s+(3\.2b|3\.2|3\.3)\b/.exec(line);
    if (h) { inSection = h[1] === '3.2'; sawHeader = false; continue; }
    if (!inSection) continue;

    const cells = splitRow(line);
    if (!cells || isSep(cells)) continue;
    if (/^Category$/i.test(cells[0])) { sawHeader = true; continue; }
    if (!sawHeader) continue;                       // skip 3.1's leftover 13-row table
    if (cells.length < 3) continue;
    if (!CATEGORIES.includes(cells[0])) continue;   // category column must be a known category

    const f = parseField(cells[1]);
    const v = parseValues(cells[2]);
    rows.push({
      category: cells[0],
      field: f.name,
      markers: f.markers,
      required: f.markers.includes('†'),
      derived: f.markers.includes('~'),
      frozen: f.markers.includes('!'),
      values: v.enum,
      banned: v.banned,
      prose: v.prose,
      default: (cells[3] ?? '').replace(/`/g, '').trim() || null,
      columns: cells.length,
    });
  }
  return rows;
}

/**
 * Normalize a declaration to its SEMANTIC token set, so the conflict test does
 * not fire on notation.
 *
 * A first cut compared raw strings and reported 8 conflicts where only 3 are
 * real: it flagged `ordered: true` vs `ordered:true` (whitespace) and `int;`
 * vs `integer;` (a synonym). ⚠️ A checker that cries wolf gets ignored, which
 * is the same failure class as one that never fires — so the normalizer is
 * itself part of the tooling gate, and the self-test pins both directions.
 */
function normalizeTokens(r) {
  const src = r.values ? r.values.join(' ') : r.prose;
  const SYNONYMS = { integer: 'int', 'sql predicate': 'sqlpredicate', table: 'tablename' };
  return new Set(
    src
      .toLowerCase()
      .replace(/\[sourced[^\]]*\]/g, '')       // provenance tags are not values
      .replace(/[`*~⛔<>{}().,;:|]/g, ' ')
      .replace(/\bfalse\b|\btrue\b/g, '')       // boolean pairs carry no discriminating info
      .split(/[\s·]+/)
      .map((t) => SYNONYMS[t] ?? t)
      .filter((t) => t && t.length > 1),
  );
}

const setsEqual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/** Find fields declared twice, separating genuine VALUE conflicts from notation. */
export function findConflicts(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.category}.${r.field}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  const out = [];
  for (const [k, list] of byKey) {
    if (list.length < 2) continue;
    const norm = list.map(normalizeTokens);
    const genuine = norm.some((s, i) => i > 0 && !setsEqual(s, norm[0]));
    // Report the raw variants so a human can see what actually differs.
    const variants = [...new Set(list.map((r) => (r.values ? r.values.join('|') : `PROSE:${r.prose}`)))];
    const diff = genuine
      ? [...new Set(norm.flatMap((s, i) => [...s].filter((t) => norm.some((o, j) => j !== i && !o.has(t)))))]
      : [];
    out.push({ key: k, count: list.length, genuine, variants, differingTokens: diff });
  }
  return out;
}

// ---------------------------------------------------------------------------

const FIXTURE = [
  '### 3.2 Controlled vocabularies',
  '| Category | Field | Allowed values | Default |',
  '|---|---|---|---|',
  '| identity | `archetype` **† !** | `INGESTOR` · `MATERIALIZER` · `ASSERT` | — |',
  '| outputs | `replay` **† !** | `idempotent_upsert` · `full_replace` · ⛔ `append_unsafe` | — |',
  '| guards | `schema_drift` **!** | `none` · `warn` · `pause` | `pause` |',
  '|---|---|---|',
  '| identity | `archetype` | `ING` · `MAT` · `AST` |',
  '| guards | `schema_drift` | `none` · `propagate` · `pause` |',
  '### 3.2b Status vocabularies',
  '| Scope | Values |',
  '| Run status | `running` · `completed` |',
].join('\n');

function selfTest() {
  const fail = [];
  const rows = parseVocab(FIXTURE);
  const conflicts = findConflicts(rows);

  if (!rows.some((r) => r.category === 'identity' && r.field === 'archetype' && r.required)) fail.push('required marker not parsed');
  if (!rows.some((r) => r.field === 'replay' && r.banned.includes('append_unsafe'))) fail.push('banned value not captured');
  if (rows.some((r) => r.category === 'Run status')) fail.push('leaked past 3.2 into 3.2b');

  const drift = conflicts.find((c) => c.key === 'guards.schema_drift');
  if (!drift || !drift.genuine) fail.push('GENUINE value conflict (warn vs propagate) not detected - the whole point');
  const arch = conflicts.find((c) => c.key === 'identity.archetype');
  if (!arch || !arch.genuine) fail.push('archetype notation conflict not detected');

  // Negative control: the clean prefix alone must report no conflict.
  const clean = parseVocab(FIXTURE.split('\n').slice(0, 6).join('\n'));
  if (findConflicts(clean).length) fail.push('negative control: clean table reported a conflict');

  if (fail.length) {
    console.error('SELF-TEST FAILED:');
    for (const x of fail) console.error(`  - ${x}`);
    return false;
  }
  console.log('SELF-TEST PASSED - 8 assertions incl. two negative controls.');
  return true;
}

function render(rows, conflicts) {
  const o = [];
  o.push('<!-- GENERATED by scripts/violations/extract-vocab.mjs - do not hand-edit. -->');
  o.push('<!-- Regenerate: node scripts/violations/extract-vocab.mjs docs/reports/generated/122-vocabulary.md -->');
  o.push('');
  o.push(`**${rows.length} field rows extracted from Spec 120 §3.2**, across ${new Set(rows.map((r) => r.category)).size} categories.`);
  o.push('');
  o.push('**Legend:** † required · ~ derived, do not declare · ! extending is a RUNNER CHANGE, never a per-step invention.');
  o.push('');

  if (conflicts.length) {
    o.push('## ⚠️ UNRESOLVED — fields declared more than once');
    o.push('');
    o.push('| Field | Times declared | Genuine value conflict? | Variants |');
    o.push('|---|---:|---|---|');
    for (const c of conflicts) {
      o.push(`| \`${c.key}\` | ${c.count} | ${c.genuine ? '⚠️ **YES — a generator cannot choose**' : 'no, notation only'} | ${c.variants.map((v) => `\`${v}\``).join(' vs ')} |`);
    }
    o.push('');
    o.push('> **A frozen contract cannot be emitted over an unresolved conflict.** Resolve in Spec 120 §3.2 — this is stage S1 — and re-run.');
    o.push('');
  }

  for (const cat of CATEGORIES) {
    const cr = rows.filter((r) => r.category === cat);
    if (!cr.length) continue;
    o.push(`### ${cat}`);
    o.push('');
    o.push('| Field | Allowed values | Default | Markers |');
    o.push('|---|---|---|---|');
    for (const r of cr) {
      const vals = r.values ? r.values.map((v) => `\`${v}\``).join(' · ') : r.prose;
      const ban = r.banned.length ? ` ⛔ banned: ${r.banned.map((b) => `\`${b}\``).join(', ')}` : '';
      o.push(`| \`${r.field}\` | ${vals}${ban} | ${r.default ?? '—'} | ${r.markers.join(' ') || '—'} |`);
    }
    o.push('');
  }
  return o.join('\n');
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;

  // ⛔ SUPERSEDED BY OPERATOR RULING R2 (2026-08-23). The canonical vocabulary is
  // scripts/steps/_schema/step.schema.json, and docs/reports/generated/122-vocabulary.md
  // is now generated FROM it by schema-to-vocab.mjs. This extractor is a one-time
  // migration tool: its conflict list seeded rulings V1-V6 and its job is done.
  // It kept the SAME default output path, so a stray re-run would silently clobber
  // the schema-generated artifact with an 8-of-18-category prose extract — a
  // downgrade that would look like a successful regeneration.
  if (!argv.includes('--force')) {
    console.error('extract-vocab.mjs is SUPERSEDED by scripts/violations/schema-to-vocab.mjs (ruling R2).');
    console.error('The canonical vocabulary is scripts/steps/_schema/step.schema.json; this tool extracts');
    console.error('8 of 18 categories from Spec 120 prose and would CLOBBER the generated artifact.');
    console.error('  Regenerate properly: node scripts/violations/schema-to-vocab.mjs docs/reports/generated/122-vocabulary.md');
    console.error('  Historical re-run:   node scripts/violations/extract-vocab.mjs --force [out.md]');
    return 1;
  }

  if (!selfTest()) { console.error('Refusing to emit from an unproven extractor.'); return 1; }

  const rows = parseVocab(fs.readFileSync(SPEC_120, 'utf8'));
  if (rows.length < 20) {
    console.error(`Extracted only ${rows.length} rows from §3.2 - refusing to emit a truncated vocabulary.`);
    return 1;
  }
  const conflicts = findConflicts(rows);
  const genuine = conflicts.filter((c) => c.genuine);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ rows, conflicts }, null, 2));
  } else {
    const text = render(rows, conflicts);
    const out = argv.find((a) => !a.startsWith('--'));
    if (out) { fs.writeFileSync(out, `${text}\n`); console.log(`Wrote ${rows.length} vocabulary rows -> ${out}`); }
    else console.log(text);
  }

  if (genuine.length) {
    console.error(`\n${genuine.length} GENUINE value conflict(s): ${genuine.map((c) => c.key).join(', ')}`);
    console.error('These must be resolved in Spec 120 §3.2 (stage S1) before the contract can be frozen.');
    if (!argv.includes('--allow-conflicts')) return 1;
  }
  return 0;
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) process.exitCode = main(process.argv.slice(2));
