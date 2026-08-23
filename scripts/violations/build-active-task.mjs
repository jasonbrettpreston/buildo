#!/usr/bin/env node
/**
 * Programme plan -> `.cursor/active_task.md`, generated.
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md
 *
 * WHY THIS EXISTS. The active task is the artifact GOD MODE gates on, and it is
 * the one an implementer actually reads. Hand-transposing a 235-line programme
 * plan into it is the same transcription boundary Spec 121 measured at ~60%
 * citation error -- and a grounding audit has already caught this exact set
 * drifting: the plan said "16 categories" while the spec said 17, and `P1`
 * carried three incompatible meanings across four documents.
 *
 * So the active task is GENERATED from three sources and never typed:
 *   1. the programme plan          (stages, gates, checklists)
 *   2. plan-claims.mjs             (claims per stage -- never restated)
 *   3. extract-vocab / map-categories (the contract's own health)
 *
 * TOTALITY, hard-failed:
 *   - every stage in the plan appears in the active task
 *   - every stage's claim count matches plan-claims.mjs, not the prose
 *   - no stage id is defined twice with different meanings (the `P1` defect)
 *   - the category count agrees across plan and spec
 *
 * TOOLING GATE (Spec 121 12b.6): --self-test proves each totality check FIRES.
 *
 * Usage:
 *   node scripts/violations/build-active-task.mjs            # print
 *   node scripts/violations/build-active-task.mjs --write    # write .cursor/active_task.md
 *   node scripts/violations/build-active-task.mjs --check    # exit 1 if stale (CI/drift)
 *   node scripts/violations/build-active-task.mjs --self-test
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAN = path.join(ROOT, '.cursor/queued_task_step_opt_programme.md');
// NOT `.cursor/active_task.md`. Writing there is a GOVERNANCE ACTION: it seizes the
// GOD MODE slot and stamps whatever Status the plan carries. Measured — emitting the
// programme (Status: Planning) into it locked out the in-flight authorised task and
// blocked the very edit that fixed this generator. The operator promotes it by hand.
const TASK = path.join(ROOT, '.cursor/active_task_programme.md');
const SPEC_122 = path.join(ROOT, 'docs/specs/01-pipeline/122_pipeline_step_optimization.md');

/** Stage ids, in execution order. A stage id means ONE thing. */
const STAGE_ORDER = ['P0', 'P0b', 'P0c', 'P1', 'P2', 'P3', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

// ---------------------------------------------------------------------------

/** Pull `| **S1** | what | claims | wf | entry |` rows out of the plan. */
export function parseStages(md) {
  const out = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^\|\s*\*\*([A-Z]\d[a-z]?)\*\*\s*\|(.+)$/.exec(line.trim());
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim());
    out.push({ id: m[1], what: cells[0] ?? '', claims: cells[1] ?? '', wf: cells[2] ?? '', entry: cells[3] ?? '' });
  }
  return out;
}

/** Unchecked `- [ ]` items, attributed to the nearest preceding stage heading. */
export function parseChecklist(md) {
  const items = [];
  let stage = null;
  for (const line of md.split(/\r?\n/)) {
    // ANY heading closes the current stage. Without this, every `- [ ]` after the
    // LAST stage heading is silently attributed to it — measured: the enforcement
    // conditions and the whole execution plan were absorbed into C1 (10 stray items).
    if (/^#{2,6}\s/.test(line)) {
      const h = /^#{3,4}\s*(?:⚠️\s*)?([A-Z]\d[a-z]?)\b/.exec(line.replace(/[*`]/g, ''));
      stage = h && STAGE_ORDER.includes(h[1]) ? h[1] : null;
    }
    const c = /^-\s*\[ \]\s*(.+)$/.exec(line.trim());
    if (c) items.push({ stage, text: c[1] });
  }
  return items;
}

/** Claims per stage, from the generator -- never from prose. */
function claimsByStage() {
  const raw = execFileSync('node', [path.join(ROOT, 'scripts/violations/plan-claims.mjs'), '--json'],
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  const j = JSON.parse(raw.slice(raw.indexOf('{')));
  const by = {};
  for (const r of j.rows) by[r.stage] = (by[r.stage] ?? 0) + 1;
  return { by, total: j.total };
}

// ---------------------------------------------------------------------------

export function totality({ stages, checklist, claims, planText, specText }) {
  const f = [];

  const ids = stages.map((s) => s.id);
  const dupe = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupe.length) f.push(`stage id defined twice: ${[...new Set(dupe)].join(', ')} — this is the P1 defect`);

  const unknown = ids.filter((x) => !STAGE_ORDER.includes(x));
  if (unknown.length) f.push(`stage id not in STAGE_ORDER: ${unknown.join(', ')}`);

  const orphanItems = checklist.filter((c) => !c.stage);
  if (orphanItems.length) f.push(`${orphanItems.length} checklist item(s) belong to no stage`);

  // A stage carrying items that name a DIFFERENT stage is misattribution, which the
  // null-check cannot see. This is how 10 items were absorbed into C1.
  for (const c of checklist) {
    if (!c.stage) continue;
    const named = /^\*\*([A-Z]\d[a-z]?)\*\*/.exec(c.text.trim());
    if (named && STAGE_ORDER.includes(named[1]) && named[1] !== c.stage) {
      f.push(`checklist item under ${c.stage} names stage ${named[1]} — misattributed`);
    }
  }

  // claim counts must come from the generator, not the prose
  for (const s of stages) {
    const stated = /^\d+$/.test(s.claims.replace(/\D/g, '')) ? Number(s.claims.replace(/\D/g, '')) : null;
    const real = claims.by[s.id];
    if (stated != null && real != null && stated !== real) {
      f.push(`stage ${s.id}: plan says ${stated} claims, generator says ${real}`);
    }
  }

  // the category count must agree across plan and spec
  // NB widened 2026-08-23: the first cut matched only `**N categories**` and MISSED
  // `16-category contract` in the very plan it was checking. A drift check that
  // matches one spelling of the thing it guards is not a drift check.
  //  guard added 2026-08-23: without it, "six missing **P0 categories**" matched
  // the 0 in P0 and reported a phantom "17 vs 0" disagreement. A drift check that
  // reads a stage id as a count is worse than no drift check.
  const planCat = [...planText.matchAll(/(?:^|[^\w])(\d+)[-\s]categor(?:y|ies)/gi)].map((m) => m[1]);
  const specCat = [...specText.matchAll(/(\d+) categories, set in stone/g)].map((m) => m[1]);
  const all = new Set([...planCat, ...specCat]);
  if (all.size > 1) f.push(`category count disagrees across plan/spec: ${[...all].join(' vs ')}`);

  return f;
}

// ---------------------------------------------------------------------------

const FIXTURE_PLAN = [
  '| **S1** | Freeze the contract | 22 | WF1 | P3 green |',
  '| **S2** | Library core | 63 | WF1 | S1 |',
  '#### S1 in detail',
  '- [ ] do the thing',
  '**17 categories** here',
].join('\n');

function selfTest() {
  const fail = [];
  const stages = parseStages(FIXTURE_PLAN);
  const checklist = parseChecklist(FIXTURE_PLAN);

  if (stages.length !== 2) fail.push(`parsed ${stages.length} stages, expected 2`);
  if (checklist.length !== 1 || checklist[0].stage !== 'S1') fail.push('checklist not attributed to its stage');

  const base = { stages, checklist, claims: { by: { S1: 22, S2: 63 }, total: 85 }, planText: '**17 categories**', specText: '17 categories, set in stone' };
  if (totality(base).length) fail.push('negative control: a clean set was rejected');

  // each guard must FIRE
  if (!totality({ ...base, stages: [...stages, { id: 'S1', what: '', claims: '', wf: '', entry: '' }] }).length) fail.push('duplicate stage id not caught');
  if (!totality({ ...base, claims: { by: { S1: 99, S2: 63 } } }).length) fail.push('claim-count mismatch not caught');
  if (!totality({ ...base, planText: '**16 categories**' }).length) fail.push('category disagreement not caught — the measured drift');
  if (!totality({ ...base, checklist: [{ stage: null, text: 'x' }] }).length) fail.push('orphan checklist item not caught');
  if (!totality({ ...base, stages: [{ id: 'Z9', what: '', claims: '', wf: '', entry: '' }] }).length) fail.push('unknown stage id not caught');

  if (fail.length) { console.error('SELF-TEST FAILED:'); for (const x of fail) console.error('  - ' + x); return false; }
  console.log('SELF-TEST PASSED - 8 assertions incl. a negative control and the measured category-drift case.');
  return true;
}

function render({ stages, checklist, claims }) {
  const o = [];
  const byStage = (id) => checklist.filter((c) => c.stage === id);
  o.push('# Active Task: Step Optimization Programme');
  o.push('**Status:** Planning');
  o.push('');
  o.push('> ⚠️ **GENERATED — do not hand-edit.** `node scripts/violations/build-active-task.mjs --write`');
  o.push('> Source of record: `.cursor/queued_task_step_opt_programme.md` · claim counts from `plan-claims.mjs`, never restated.');
  o.push('> `--check` exits non-zero when this file drifts from the plan.');
  o.push('');
  o.push(`**${claims.total} claims across ${Object.keys(claims.by).length} claim-bearing stages.**`);
  o.push('');
  o.push('| Stage | What | Claims | WF | Entry criterion |');
  o.push('|---|---|---:|---|---|');
  for (const id of STAGE_ORDER) {
    const s = stages.find((x) => x.id === id);
    if (!s) continue;
    o.push(`| **${id}** | ${s.what} | ${claims.by[id] ?? '·'} | ${s.wf} | ${s.entry} |`);
  }
  o.push('');
  for (const id of STAGE_ORDER) {
    const items = byStage(id);
    if (!items.length) continue;
    const s = stages.find((x) => x.id === id);
    o.push(`### ${id} — ${s ? s.what.replace(/\|/g, '') : ''}`);
    o.push('');
    for (const it of items) o.push(`- [ ] ${it.text}`);
    o.push('');
  }
  o.push('---');
  o.push('');
  o.push('> **PLAN LOCKED. Do you authorize this programme plan? (y/n)**');
  return o.join('\n');
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  if (!selfTest()) { console.error('Refusing to emit from an unproven builder.'); return 1; }

  const planText = fs.readFileSync(PLAN, 'utf-8');
  const specText = fs.readFileSync(SPEC_122, 'utf-8');
  const stages = parseStages(planText);
  const checklist = parseChecklist(planText);
  const claims = claimsByStage();

  const f = totality({ stages, checklist, claims, planText, specText });
  if (f.length) {
    console.error('TOTALITY FAILED — the plan and its sources disagree:');
    for (const x of f) console.error('  - ' + x);
    return 1;
  }

  const text = render({ stages, checklist, claims });
  if (argv.includes('--check')) {
    const cur = fs.existsSync(TASK) ? fs.readFileSync(TASK, 'utf-8') : '';
    if (cur.trim() !== text.trim()) { console.error('STALE: .cursor/active_task.md differs from the plan. Re-run with --write.'); return 1; }
    console.log('active_task.md is in sync with the plan.');
    return 0;
  }
  if (argv.includes('--write')) { fs.writeFileSync(TASK, `${text}\n`); console.log(`Wrote ${stages.length} stages -> ${TASK}`); return 0; }
  console.log(text);
  return 0;
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) process.exitCode = main(process.argv.slice(2));
