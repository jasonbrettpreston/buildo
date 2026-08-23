#!/usr/bin/env node
/**
 * Claim -> tier -> scope -> stage -> test-artifact planner.
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md
 *
 * WHY THIS EXISTS. Spec 121 §12.9's coverage matrix mapped ID *spaces* to stages
 * and looked complete; a per-claim check found 162 of 283 claims (57%) cited
 * NOWHERE in the plan. The same granularity failure recurred four times in that
 * session (ID-space vs claim, claim vs table-row, field vs property, stage-gate vs
 * item). This tool refuses to repeat it: it maps EVERY claim individually and
 * hard-fails on a single orphan.
 *
 * It answers three questions the implementation plan must answer per claim:
 *   1. TIER   — the cheapest mechanism that actually holds it (Spec 121 §5.12)
 *   2. SCOPE  — built ONCE, or authored PER STEP at conversion (x27)
 *   3. STAGE  — which stage of the plan delivers it
 * and emits the TEST ARTIFACT for each, so "is the test written?" is checkable.
 *
 * DESIGN — the same split as extract-claims.mjs: a SMALL authored rule set, a
 * GENERATED rendering. Unmatched claims fall to UNASSIGNED and the run FAILS.
 * A planner that silently defaults reports full coverage it has not earned.
 *
 * TOOLING GATE (Spec 121 §12b.6): --self-test proves the totality checks FIRE
 * on a deliberately-broken rule set before any output is believed.
 *
 * Usage:
 *   node scripts/violations/plan-claims.mjs                 # print
 *   node scripts/violations/plan-claims.mjs out.md          # write
 *   node scripts/violations/plan-claims.mjs --self-test
 *   node scripts/violations/plan-claims.mjs --json
 *   node scripts/violations/plan-claims.mjs --checklist     # the per-step template
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegister } from './extract-claims.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_121 = path.join(ROOT, 'docs/specs/01-pipeline/121_assessment_and_verification_methodology.md');
const MIN_PLAUSIBLE_CLAIMS = 200;

// ---------------------------------------------------------------------------
// VOCABULARIES — closed. An unknown value is a bug, not a new category.
// ---------------------------------------------------------------------------

/** Spec 121 §5.12, cheapest first. Assign the cheapest tier that actually holds it. */
const TIERS = {
  0: { name: 'schema', artifact: 'scripts/steps/_schema/step.schema.json + invalid fixtures' },
  1: { name: 'db-constraint', artifact: 'migrations 245-248 (CHECK / NOT NULL)' },
  2: { name: 'lint', artifact: 'scripts/ast-grep-rules/*.yml + eslint.config.mjs' },
  3: { name: 'drift', artifact: 'src/tests/violations/generated-drift.infra.test.ts' },
  4: { name: 'census', artifact: 'src/tests/violations/wiring-census.db.test.ts' },
  5: { name: 'incident-replay', artifact: 'src/tests/violations/incidents/*.test.ts' },
  6: { name: 'reversion', artifact: 'src/tests/violations/patches/*.patch + revert-check.mjs' },
  7: { name: 'per-conversion', artifact: 'src/tests/steps/<slug>/*.test.ts' },
};

/** Spec 121 §5.7 — claim shape decides test shape. */
const SHAPE_TEST = {
  P: 'violation test — do the forbidden thing, assert the specific failure',
  B: 'reversion patch + kill-set EQUALITY — the red set is observed, never declared',
  R: 'observed-set equality — execute the corpus, assert emitted set == declared vocabulary',
  W: 'consumer census — assert >=1 reader, and that deleting it reds a named test',
};

const SCOPES = ['UNIVERSAL', 'PER_STEP'];

/** Stages of the implementation plan. Order is execution order. */
const STAGES = [
  ['P0', 'Audit instrument — make DATABASE_URL required in the 4 defaulting scripts; re-baseline'],
  ['P1', 'Centroid invalidator — the HIGH followup; pinned first per Spec 121 §4.3'],
  ['P2', 'Phase B lands — 20 commits, migrations 240/242/243/244'],
  ['P3', 'Envelope + ONE GREEN CLOUD RUN — the launch gate'],
  ['S1', 'Descriptor schema + controlled vocabularies (generated from one source)'],
  ['S2', 'pipeline.step() library core + the validator'],
  ['S3', 'Conformance suite + ast-grep shape rule'],
  ['S4', 'State tables (migrations 245-248) + DB CHECKs'],
  ['S5', 'Cross-step ledger generator + drift guard'],
  ['S6', 'Violation suite: register, ratchet, reversion harness, census, incident replays'],
  ['C1', 'Pilot 3 — simplest / median / enrich-parcels'],
  ['C2', 'Kill criteria evaluated'],
  ['C3', 'Freeze template'],
  ['C4', 'Shared steps (10 steps, 28 slots)'],
  ['C*', 'EVERY conversion (C1, C4, C5, C6) — the per-step checklist'],
  ['C5', 'Rest of sources'],
  ['C6', 'Remaining chains'],
];
const STAGE_IDS = STAGES.map(([id]) => id);

// ---------------------------------------------------------------------------
// THE AUTHORED RULE SET — the only hand-maintained data.
// Ordered; first match wins. ids beat sections.
// ---------------------------------------------------------------------------

const ids = (s) => s.split(/[,\s]+/).filter(Boolean);

const RULES = [
  // ---- tier 1: DB constraints. Free — the migrations are written anyway.
  { ids: ids('22 60 83 94 103 105 186'), tier: 1, scope: 'UNIVERSAL', stage: 'S4' },

  // ---- tier 3: drift over generated artifacts. One assertion covers all.
  { ids: ids('20 82 129 146 197'), tier: 3, scope: 'UNIVERSAL', stage: 'S5' },

  // ---- tier 4: census / observed-set. One query each over the fleet.
  { ids: ids('26 27 28 29 95 166 194 225 249 250 251 252 253'), tier: 4, scope: 'UNIVERSAL', stage: 'S6' },

  // ---- tier 2: lint. The fixture each rule already ships IS the violation test.
  { ids: ids('23 32 57 77 78 89 90 92 96 125 126 127 128 130 131 133 134 135 136 137 138 254 263 271'),
    tier: 2, scope: 'UNIVERSAL', stage: 'S3' },

  // ---- the ledger claims: cross-step, generated, drift-guarded (Spec 122 §5).
  { ids: ids('45 53 54 61 88 117 145'), tier: 3, scope: 'UNIVERSAL', stage: 'S5' },

  // ---- recovery + admin: ship with the library, not after the fleet converts.
  { section: 'A.8', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },

  // ---- incident replay: patches are free via `git revert` over 96 fence commits.
  { section: 'A.18', tier: 5, scope: 'UNIVERSAL', stage: 'S6' },
  { section: 'A.21', tier: 5, scope: 'UNIVERSAL', stage: 'S6' },
  { ids: ids('272 273 274 275 276 277 278'), tier: 5, scope: 'UNIVERSAL', stage: 'S6' },

  // ---- schema: the closed descriptor. Everything in A.1 not already claimed.
  { section: 'A.1', tier: 0, scope: 'UNIVERSAL', stage: 'S1' },
  { section: 'A.2', tier: 1, scope: 'UNIVERSAL', stage: 'S1' },

  // ---- interpretation: notes.json caps + CI checks. Authored per step, checked once.
  { section: 'A.3', tier: 2, scope: 'PER_STEP', stage: 'C*' },

  // ---- the lifecycle. The library's own behaviour: reversion patches, built once.
  { section: 'A.4', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },
  { section: 'A.5', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },
  { section: 'A.6', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },
  { section: 'A.7', tier: 1, scope: 'UNIVERSAL', stage: 'S4' },

  // ---- authoring, lint, maintainability: enforcement layer.
  { section: 'A.9', tier: 2, scope: 'UNIVERSAL', stage: 'S3' },
  { section: 'A.10', tier: 2, scope: 'UNIVERSAL', stage: 'S3' },
  { section: 'A.11', tier: 3, scope: 'UNIVERSAL', stage: 'S5' },

  // ---- conversion workflow + step testing + load-bearing intent: PER STEP.
  //      These are the claims that cannot be discharged once. They are the
  //      per-conversion checklist, and they are why C5 is 27 iterations.
  { section: 'A.12', tier: 7, scope: 'PER_STEP', stage: 'C*' },
  { section: 'A.13', tier: 7, scope: 'PER_STEP', stage: 'C*' },
  { section: 'A.15', tier: 7, scope: 'PER_STEP', stage: 'C*' },

  // ---- red team: grades the library, runs nightly.
  { section: 'A.14', tier: 6, scope: 'UNIVERSAL', stage: 'S6' },

  // ---- method claims (Spec 121 itself) + database identity.
  { section: 'A.16', tier: 4, scope: 'UNIVERSAL', stage: 'S6' },
  { section: 'A.19', tier: 4, scope: 'UNIVERSAL', stage: 'S6' },
  { section: 'A.20', tier: 2, scope: 'UNIVERSAL', stage: 'P0' },
];

function assign(claim) {
  for (const r of RULES) {
    if (r.ids && r.ids.includes(claim.id)) return r;
    if (r.section && r.section === claim.section) return r;
  }
  return null; // -> UNASSIGNED -> hard fail
}

/** Test id + target file, derived. Never hand-written. */
function testArtifact(row) {
  const t = TIERS[row.tier];
  const file = row.scope === 'PER_STEP'
    ? 'src/tests/steps/<slug>/violations.test.ts'
    : t.artifact;
  return { testId: `R-${String(row.id).padStart(3, '0')}`, file };
}

// ---------------------------------------------------------------------------
// TOTALITY CHECKS — the whole point. Each returns [] or a list of failures.
// ---------------------------------------------------------------------------

function totality(rows, total) {
  const f = [];
  const un = rows.filter((r) => r.tier === undefined);
  if (un.length) f.push(`${un.length} claim(s) UNASSIGNED: ${un.map((r) => r.id).join(', ')}`);
  if (rows.length !== total) f.push(`row count ${rows.length} != parsed ${total}`);

  const tierSum = Object.keys(TIERS).reduce((n, k) => n + rows.filter((r) => String(r.tier) === k).length, 0);
  if (tierSum !== rows.length) f.push(`tier counts sum to ${tierSum}, not ${rows.length} — an unsummed tier table is how 107 claims hid`);

  const scopeSum = SCOPES.reduce((n, s) => n + rows.filter((r) => r.scope === s).length, 0);
  if (scopeSum !== rows.length) f.push(`scope counts sum to ${scopeSum}, not ${rows.length}`);

  const badStage = rows.filter((r) => !STAGE_IDS.includes(r.stage));
  if (badStage.length) f.push(`${badStage.length} claim(s) at an unknown stage`);

  const noTest = rows.filter((r) => !r.testId || !r.file);
  if (noTest.length) f.push(`${noTest.length} claim(s) have no test artifact`);

  // Every stage that owns claims must be reachable, and no stage may be a
  // silent dumping ground: >40% of the register in one stage is a smell.
  for (const s of STAGE_IDS) {
    const n = rows.filter((r) => r.stage === s).length;
    if (n / rows.length > 0.4) f.push(`stage ${s} holds ${n}/${rows.length} claims (>40%) — likely an over-broad rule`);
  }
  return f;
}

// ---------------------------------------------------------------------------
// SELF-TEST — prove the totality checks fire before believing a green run.
// ---------------------------------------------------------------------------

function selfTest() {
  const fail = [];
  const mk = (id, over = {}) => ({ id, section: 'A.1', tier: 0, scope: 'UNIVERSAL', stage: 'S1', testId: 'R-001', file: 'x', ...over });

  // 1. an unassigned claim must be caught
  if (!totality([mk('1'), { id: '2', section: 'A.1' }], 2).length) fail.push('UNASSIGNED not caught');
  // 2. a bad stage must be caught
  if (!totality([mk('1', { stage: 'ZZ' })], 1).length) fail.push('unknown stage not caught');
  // 3. a missing test artifact must be caught
  if (!totality([mk('1', { testId: null })], 1).length) fail.push('missing test artifact not caught');
  // 4. a count mismatch must be caught
  if (totality([mk('1')], 2).length === 0) fail.push('count mismatch not caught');
  // 5. an over-broad stage must be caught
  if (!totality(Array.from({ length: 10 }, (_, i) => mk(String(i))), 10).length) fail.push('over-broad stage not caught');
  // 6. NEGATIVE CONTROL — a genuinely clean set must pass
  const clean = [mk('1'), mk('2', { stage: 'S2', tier: 6 }), mk('3', { stage: 'S3', tier: 2 })];
  if (totality(clean, 3).length) fail.push('negative control: a clean set was rejected');

  if (fail.length) {
    console.error('SELF-TEST FAILED:');
    for (const x of fail) console.error(`  - ${x}`);
    return false;
  }
  console.log('SELF-TEST PASSED — 6 totality assertions incl. a negative control.');
  return true;
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

function render(rows) {
  const o = [];
  const by = (k, v) => rows.filter((r) => r[k] === v);

  o.push('<!-- GENERATED by scripts/violations/plan-claims.mjs — do not hand-edit. -->');
  o.push('<!-- Regenerate: node scripts/violations/plan-claims.mjs docs/reports/generated/123-claim-plan.md -->');
  o.push('');
  o.push(`**${rows.length} claims, each assigned a tier, a scope, a stage and a test artifact. Zero unassigned.**`);
  o.push('');

  o.push('## Scope split — the number that sizes the programme');
  o.push('');
  o.push('| Scope | Claims | Meaning |');
  o.push('|---|---:|---|');
  o.push(`| UNIVERSAL | ${by('scope', 'UNIVERSAL').length} | discharged ONCE, before any step converts |`);
  o.push(`| PER_STEP | ${by('scope', 'PER_STEP').length} | authored at each conversion — **×27 for \`sources\`** |`);
  o.push('');
  const per = by('scope', 'PER_STEP').length;
  o.push(`> **${by('scope', 'UNIVERSAL').length} of ${rows.length} claims are front-loaded.** The per-step tail is **${per} claims × 27 steps**, and those are the ones that cannot be written in advance — they need the step's own tables, predicates and fences.`);
  o.push('');

  o.push('## Tier distribution (Spec 121 §5.12 — cheapest mechanism that holds it)');
  o.push('');
  o.push('| Tier | Mechanism | Claims | Artifact |');
  o.push('|---|---|---:|---|');
  for (const k of Object.keys(TIERS)) {
    const n = rows.filter((r) => String(r.tier) === k).length;
    o.push(`| ${k} | ${TIERS[k].name} | ${n} | \`${TIERS[k].artifact}\` |`);
  }
  o.push(`| | **TOTAL** | **${rows.length}** | |`);
  o.push('');

  o.push('## Claims per stage — the implementation plan');
  o.push('');
  o.push('| Stage | What | Claims | Test shapes |');
  o.push('|---|---|---:|---|');
  for (const [id, what] of STAGES) {
    const sr = by('stage', id);
    const shapes = [...new Set(sr.map((r) => r.shape).filter(Boolean))].sort().join(' ') || '—';
    o.push(`| **${id}** | ${what} | ${sr.length || '·'} | ${shapes} |`);
  }
  o.push('');

  o.push('## Test shape distribution (Spec 121 §5.7)');
  o.push('');
  o.push('| Shape | Claims | Test form |');
  o.push('|---|---:|---|');
  for (const [k, v] of Object.entries(SHAPE_TEST)) {
    o.push(`| ${k} | ${rows.filter((r) => r.shape === k).length} | ${v} |`);
  }
  const noShape = rows.filter((r) => !SHAPE_TEST[r.shape]).length;
  if (noShape) o.push(`| *(unstated)* | ${noShape} | shape not declared in the register — defaults to violation test |`);
  o.push('');

  o.push('## Full assignment — every claim, its stage, its test');
  o.push('');
  for (const [id, what] of STAGES) {
    const sr = by('stage', id);
    if (!sr.length) continue;
    o.push(`### ${id} — ${what} (${sr.length})`);
    o.push('');
    o.push('| # | § | Tier | Scope | Test ID | Test artifact | Claim |');
    o.push('|---|---|---|---|---|---|---|');
    for (const r of sr) {
      o.push(`| ${r.id} | ${r.section} | ${r.tier} ${TIERS[r.tier].name} | ${r.scope} | \`${r.testId}\` | \`${r.file}\` | ${String(r.claim).replace(/\|/g, '\\|').slice(0, 90)} |`);
    }
    o.push('');
  }
  return o.join('\n');
}

function renderChecklist(rows) {
  const per = rows.filter((r) => r.scope === 'PER_STEP');
  const o = [];
  o.push('<!-- GENERATED by scripts/violations/plan-claims.mjs --checklist — do not hand-edit. -->');
  o.push('');
  o.push(`# Per-conversion claim checklist — ${per.length} items`);
  o.push('');
  o.push('> Copy into each step\'s conversion task. **These claims cannot be discharged in advance** — they need the step\'s own tables, predicates and fences. Every line becomes a test in `src/tests/steps/<slug>/`.');
  o.push('');
  o.push('| ☐ | # | Test ID | Claim | The violation to write |');
  o.push('|---|---|---|---|---|');
  for (const r of per) {
    o.push(`| ☐ | ${r.id} | \`${r.testId}\` | ${String(r.claim).replace(/\|/g, '\\|').slice(0, 80)} | ${String(r.violation).replace(/\|/g, '\\|').slice(0, 110)} |`);
  }
  o.push('');
  o.push(`**Gate:** all ${per.length} present and proven red before the conversion's Gate 4d passes.`);
  return o.join('\n');
}

// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  if (!selfTest()) {
    console.error('Refusing to emit a plan from unproven totality checks.');
    return 1;
  }

  const claims = parseRegister(fs.readFileSync(SPEC_121, 'utf8'));
  if (claims.length < MIN_PLAUSIBLE_CLAIMS) {
    console.error(`Parsed only ${claims.length} claims — refusing to plan against a truncated register.`);
    return 1;
  }

  const rows = claims.map((c) => {
    const a = assign(c);
    const row = { ...c, ...(a ?? {}) };
    if (a) Object.assign(row, testArtifact(row));
    return row;
  });

  const failures = totality(rows, claims.length);
  if (failures.length) {
    console.error('TOTALITY FAILED — the plan does not cover every claim:');
    for (const x of failures) console.error(`  - ${x}`);
    return 1;
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ total: rows.length, rows }, null, 2));
    return 0;
  }

  const text = argv.includes('--checklist') ? renderChecklist(rows) : render(rows);
  const outPath = argv.find((a) => !a.startsWith('--'));
  if (outPath) {
    fs.writeFileSync(outPath, `${text}\n`);
    console.log(`Wrote ${rows.length} planned claims -> ${outPath}`);
  } else {
    console.log(text);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
