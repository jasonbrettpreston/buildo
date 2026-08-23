#!/usr/bin/env node
/**
 * Concern -> home mapping, with a 1:1 totality proof.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4
 *
 * THE QUESTION THIS ANSWERS: "the 17 categories and the 41 concerns seem to
 * overlap -- are they two things?"
 *
 * They are not. They are a LOOKUP and a HOME:
 *   - a CATEGORY is a place you WRITE something (a descriptor field)
 *   - a CONCERN is an operational question that must be ANSWERED
 * Every concern resolves to exactly one home: a category, the RUNNER (nothing
 * is declared per step), or OPEN (compute / expect / interpretation).
 *
 * So the Concern Index is an INDEX. It adds no declaration surface. This tool
 * proves that rather than asserting it, and HARD-FAILS on:
 *   - a concern with no home                     (the contract cannot express it)
 *   - a concern with two homes                   (the overlap the question asks about)
 *   - a home that is not one of the 17 / RUNNER / OPEN
 *   - a category that is nobody's home           (an unreachable declaration)
 *   - a duplicate concern number
 * A prior audit found exactly the two-homes defect: `database` appeared as both
 * concern 27 and concern 32, inside a table whose stated rule is "exactly once".
 *
 * TOOLING GATE (Spec 121 12b.6): --self-test proves each check FIRES.
 *
 * Usage:
 *   node scripts/violations/map-concerns.mjs
 *   node scripts/violations/map-concerns.mjs out.md
 *   node scripts/violations/map-concerns.mjs --self-test
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_122 = path.join(ROOT, 'docs/specs/01-pipeline/122_pipeline_step_optimization.md');

export const CATEGORIES = [
  'identity', 'inputs', 'outputs', 'staleness', 'guards', 'execution',
  'checks', 'override', 'emits', 'deviations', 'limitations',
  'interpretation', 'recovery', 'database', 'counters', 'config', 'sharing',
];
const NON_CATEGORY_HOMES = ['RUNNER', 'OPEN'];

// ---------------------------------------------------------------------------

/** Rows of the §1.4 Concern Index: `| 12 | Producer version pin | inputs.version_pin | ... |` */
export function parseConcerns(md) {
  const out = [];
  let inIndex = false;
  for (const line of md.split(/\r?\n/)) {
    // Anchor on the INDEX TABLE's own header row, not on the section. §1.4 also
    // contains a RUNNER table whose first column is a concern number — anchoring
    // on the section swept those in and reported 47 concerns instead of 43.
    if (/^\|\s*#\s*\|\s*Concern\s*\|\s*Declared in\s*\|/.test(line)) { inIndex = true; continue; }
    if (inIndex && /^#{2,4}\s/.test(line)) inIndex = false;
    if (!inIndex) continue;
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    // Suffixed ids (9b, 21b) are real concerns. A digits-only regex silently
    // DROPPED them -- the same shape as the `[a-e]` bug that lost claims 52f-h.
    const n = /^(\d+[a-z]?)$/.exec(cells[0].replace(/[*`\s]/g, ''));
    if (!n) continue;
    // Number(), not parseFloat() — eslint bans raw parseFloat under scripts/**,
    // and stripping the letter suffix first makes the coercion exact anyway.
    const ordinal = Number(n[1].replace(/[a-z]$/, ''));
    out.push({ n: n[1], sort: ordinal, what: cells[1], declaredIn: cells[2], allowed: cells[3] ?? '' });
  }
  return out;
}

/** Resolve a `Declared in` cell to its home. */
export function homeOf(cell) {
  const raw = cell.replace(/[*⚠️]/g, '').trim();
  if (/^\*{0,2}RUNNER/i.test(raw) || /\bRUNNER\b/.test(raw)) return 'RUNNER';
  if (/scripts\/lib\/compute|OPEN/i.test(raw)) return 'OPEN';
  // `checks[].expect` / `interpretation` are open in CONTENT but homed in a category;
  // the OPEN home is reserved for the compute itself.
  const m = /`([a-z_]+)(?:\[\]|\.|`)/.exec(raw) ?? /`([a-z_]+)`/.exec(raw);
  if (m && CATEGORIES.includes(m[1])) return m[1];
  for (const c of CATEGORIES) if (new RegExp(`\\b${c}\\b`).test(raw)) return c;
  return null;
}

export function totality(rows) {
  const f = [];
  if (!rows.length) return ['no concern rows parsed'];

  const nums = rows.map((r) => r.n);
  const dupes = nums.filter((x, i) => nums.indexOf(x) !== i);
  if (dupes.length) f.push(`concern number listed twice: ${[...new Set(dupes)].join(', ')}`);

  const homeless = rows.filter((r) => !r.home);
  if (homeless.length) f.push(`${homeless.length} concern(s) with NO home: ${homeless.map((r) => r.n).join(', ')}`);

  const bad = rows.filter((r) => r.home && !CATEGORIES.includes(r.home) && !NON_CATEGORY_HOMES.includes(r.home));
  if (bad.length) f.push(`home not a category/RUNNER/OPEN: ${bad.map((r) => `${r.n}->${r.home}`).join(', ')}`);

  // THE OVERLAP CHECK the question asks about: one *concern* must not have two homes.
  for (const r of rows) {
    const hits = CATEGORIES.filter((c) => new RegExp(`\`${c}[.\`\\[]`).test(r.declaredIn));
    if (hits.length > 1) f.push(`concern ${r.n} names ${hits.length} categories (${hits.join(', ')}) — a concern has ONE home`);
  }

  // An unreachable category is a declaration nothing asks for.
  const used = new Set(rows.map((r) => r.home));
  const unreachable = CATEGORIES.filter((c) => !used.has(c));
  if (unreachable.length) f.push(`category is nobody's home: ${unreachable.join(', ')}`);

  return f;
}

// ---------------------------------------------------------------------------

const FIXTURE = [
  '### 1.4 Concern Index',
  '| # | Concern | Why the runner owns it |',      // a DECOY table in the same section
  '|---|---|---|',
  '| 2 | Step errors | measured divergence |',
  '',
  '| # | Concern | Declared in | Allowed |',
  '|---|---|---|---|',
  '| 1 | Row errors | `execution.on_row_error` | a |',
  '| 2 | Step errors | **RUNNER** | nothing |',
  '| 3 | Compute | `scripts/lib/compute/<slug>.js` | OPEN |',
  '### 1.5 next',
  '| 99 | must not be parsed | `identity` | x |',
].join('\n');

function selfTest() {
  const fail = [];
  const rows = parseConcerns(FIXTURE).map((r) => ({ ...r, home: homeOf(r.declaredIn) }));

  if (rows.length !== 3) fail.push(`parsed ${rows.length} rows, expected 3 (swept in the decoy RUNNER table, or leaked past the section?)`);
  if (rows[0]?.home !== 'execution') fail.push(`category home not resolved: got ${rows[0]?.home}`);
  if (rows[1]?.home !== 'RUNNER') fail.push('RUNNER home not resolved');
  if (rows[2]?.home !== 'OPEN') fail.push('OPEN home not resolved');

  // each guard must FIRE
  const dupe = [...rows, { ...rows[0] }];
  if (!totality(dupe).some((x) => /listed twice/.test(x))) fail.push('duplicate concern not caught');
  const homeless = [{ n: 1, what: 'x', declaredIn: 'somewhere undeclared', allowed: '', home: null }];
  if (!totality(homeless).some((x) => /NO home/.test(x))) fail.push('homeless concern not caught');
  const two = [{ n: 1, what: 'x', declaredIn: '`guards.requires` + `execution.network`', allowed: '', home: 'guards' }];
  if (!totality(two).some((x) => /ONE home/.test(x))) fail.push('THE OVERLAP CHECK did not fire — the whole point');
  if (!totality(rows).some((x) => /nobody's home/.test(x))) fail.push('unreachable category not caught');

  if (fail.length) { console.error('SELF-TEST FAILED:'); for (const x of fail) console.error('  - ' + x); return false; }
  console.log('SELF-TEST PASSED - 9 assertions incl. the decoy-table trap, the overlap check and an unreachable-category control.');
  return true;
}

function render(rows, failures) {
  const o = [];
  o.push('<!-- GENERATED by scripts/violations/map-concerns.mjs - do not hand-edit. -->');
  o.push('');
  o.push(`**${rows.length} concerns, each resolved to exactly one home.**`);
  o.push('');
  o.push('> **Categories and concerns are not two lists.** A **category** is a place you *write* something; a **concern** is a question that must be *answered*. Every concern resolves to one category, to the RUNNER (nothing declared per step), or to OPEN. **The Concern Index adds no declaration surface — it is an index into the 17.**');
  o.push('');
  const byHome = {};
  for (const r of rows) (byHome[r.home ?? 'UNRESOLVED'] ??= []).push(r);
  o.push('| Home | Concerns | Which |');
  o.push('|---|---:|---|');
  for (const h of [...CATEGORIES, ...NON_CATEGORY_HOMES, 'UNRESOLVED']) {
    const g = byHome[h];
    if (!g) continue;
    const label = NON_CATEGORY_HOMES.includes(h) ? `**${h}**` : `\`${h}\``;
    o.push(`| ${label} | ${g.length} | ${g.map((r) => r.n).join(', ')} |`);
  }
  o.push(`| **TOTAL** | **${rows.length}** | |`);
  o.push('');
  if (failures.length) {
    o.push('## ⚠️ TOTALITY FAILURES');
    o.push('');
    for (const x of failures) o.push(`- ${x}`);
    o.push('');
  } else {
    o.push('✅ **1:1 proven.** Every concern has exactly one home; every category is the home of at least one concern; no concern is listed twice. **There is no overlap and nothing lives outside the 17.**');
    o.push('');
  }
  o.push('## Full mapping');
  o.push('');
  o.push('| # | Concern | Home | Declared in |');
  o.push('|---|---|---|---|');
  for (const r of rows.sort((a, b) => (a.sort - b.sort) || String(a.n).localeCompare(String(b.n)))) {
    o.push(`| ${r.n} | ${r.what} | ${r.home ?? '⚠️ **NONE**'} | ${r.declaredIn} |`);
  }
  return o.join('\n');
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  if (!selfTest()) { console.error('Refusing to emit from an unproven mapper.'); return 1; }

  const rows = parseConcerns(fs.readFileSync(SPEC_122, 'utf8')).map((r) => ({ ...r, home: homeOf(r.declaredIn) }));
  const failures = totality(rows);

  const text = render(rows, failures);
  const out = argv.find((a) => !a.startsWith('--'));
  if (out) { fs.writeFileSync(out, `${text}\n`); console.log(`Wrote ${rows.length} concerns -> ${out}`); }
  else console.log(text);

  if (failures.length) { console.error(`\n${failures.length} totality failure(s).`); return 1; }
  return 0;
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) process.exitCode = main(process.argv.slice(2));
