#!/usr/bin/env node
/**
 * Programme backlog generator — Spec 122 §10.3 (R-T, 2026-08-29).
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10.3
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 (R-T)
 *
 * WHY THIS EXISTS. Six pilots landed the Spec 122 step standard for their own
 * archetype, but a battery of CROSS-CUTTING promises — the eight-archetype
 * coverage claim, the four Spec 120 §6 state tables, the "freeze after the
 * eighth" mechanism itself — belonged to no single pilot's nine-commit
 * sequence. They were found only by a manually-commissioned inventory
 * (docs/reports/generated/122-programme-backlog.md's own source document),
 * the exact "found by noticing, not by a tool" failure class
 * scripts/violations/map-categories.mjs already exists to retire for
 * per-claim category coverage. This generator does the same for programme-
 * level items: reads scripts/steps/_schema/programme-items.json (the
 * declared data), renders one table grouped by gate, and is drift-checked
 * by src/tests/programme-backlog.infra.test.ts so the generated file can
 * never silently diverge from the seed.
 *
 * Usage:
 *   node scripts/violations/generate-programme-backlog.mjs
 *   node scripts/violations/generate-programme-backlog.mjs --check   (exit 1 on drift, writes nothing)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS_PATH = path.join(ROOT, 'scripts/steps/_schema/programme-items.json');
const SCHEMA_PATH = path.join(ROOT, 'scripts/steps/_schema/programme-items.schema.json');
const OUT_PATH = path.join(ROOT, 'docs/reports/generated/122-programme-backlog.md');

const GATE_ORDER = ['batching_prereq', 'cutover_prereq', 'nice_to_have'];
const GATE_LABEL = {
  batching_prereq: 'Batching prerequisite — blocks "freeze after the eighth" (Spec 122 §8.2/§10.3)',
  cutover_prereq: 'Cutover prerequisite — blocks a specific pilot slug registering in converted.json',
  nice_to_have: 'Nice-to-have — real gap, not currently blocking',
};

export function loadItems() {
  const raw = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // Minimal structural check without pulling in ajv at generator scope — the
  // conformance suite (src/tests/programme-backlog.infra.test.ts) is the
  // authoritative schema gate; this generator refuses to emit off a shape
  // that would make its own counts meaningless.
  if (raw.contract_version !== schema['x-contract-version']) {
    throw new Error(
      `programme-items.json contract_version (${raw.contract_version}) disagrees with the schema's x-contract-version (${schema['x-contract-version']})`,
    );
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('programme-items.json declares no items — an empty backlog is never a vacuous pass; if the programme is genuinely clear, say so explicitly, do not delete the array');
  }
  const ids = raw.items.map((i) => i.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`duplicate programme-item ids: ${dupes.join(', ')}`);
  return raw.items;
}

function statusBadge(status) {
  return { NOT_STARTED: '⬜ NOT_STARTED', PARTIAL: '⚠️ PARTIAL', BUILT: '✅ BUILT', SUPERSEDED: '⏭️ SUPERSEDED' }[status] ?? status;
}

/**
 * Does this declared item still block "batching"? A BUILT/SUPERSEDED item's
 * promise is already delivered; it does not block anything. The ONE
 * predicate every caller in the estate uses — this file's own
 * `openBatchingCount` AND `scripts/steps/_schema/generate-template-freeze.
 * mjs`'s `batching_prereq_snapshot` (WF2 "template freeze" remediation,
 * 2026-09-04) — so a second, independently-drifting reimplementation of the
 * same filter can never creep back in.
 */
export function isOpenBatchingItem(it) {
  return it.gate.blocks.includes('batching') && it.status !== 'BUILT' && it.status !== 'SUPERSEDED';
}

/**
 * How many declared items still block "batching" — G9 defect (WF2 "template
 * freeze" C1, 2026-09-04), mirrors step-validate.mjs's blocksBatchingCount.
 * The ONE shared implementation every caller in this file uses (render()'s
 * two printed lines AND main()'s --write console summary) so a third
 * independent status-blind reimplementation can never creep back in —
 * exactly what happened once already (main()'s own console line still read
 * the raw unfiltered count after render() was fixed, caught by inspecting
 * `--write`'s own console output during C2, not by a test).
 */
export function openBatchingCount(items) {
  return items.filter(isOpenBatchingItem).length;
}

function renderTable(items) {
  const lines = ['| id | spec | title | status | owner | blocks | last reviewed |', '|---|---|---|---|---|---|---|'];
  for (const it of items) {
    const owner = it.owner.kind === 'none' ? '—' : `${it.owner.kind}: ${it.owner.ref}`;
    const blocks = it.gate.blocks.length ? it.gate.blocks.join(', ') : '—';
    lines.push(`| \`${it.id}\` | ${it.spec} | ${it.title} | ${statusBadge(it.status)} | ${owner} | ${blocks} | ${it.last_reviewed} |`);
  }
  return lines.join('\n');
}

export function render(items) {
  const byStatus = {};
  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
  }
  // Both counts below (the summary line AND the freeze-readiness line, which
  // used to read the unfiltered byGate.batching_prereq) share the one honest
  // openBatchingCount() so they can never disagree with each other or with
  // main()'s --write console summary.
  const openBatchingPrereq = openBatchingCount(items);
  const blocksBatching = openBatchingPrereq;

  const parts = [];
  parts.push('# Spec 122 programme backlog (generated)');
  parts.push('');
  parts.push('> **GENERATED — do not hand-edit.** Source of record: `scripts/steps/_schema/programme-items.json`.');
  parts.push('> Regenerate: `npm run programme-backlog`. Drift-guarded by `src/tests/programme-backlog.infra.test.ts`.');
  parts.push('> SPEC LINK: `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §10.3 (R-T)');
  parts.push('');
  parts.push('## Counts');
  parts.push('');
  parts.push(`Total items: **${items.length}**`);
  parts.push('');
  parts.push('| status | count |');
  parts.push('|---|---|');
  for (const s of ['NOT_STARTED', 'PARTIAL', 'BUILT', 'SUPERSEDED']) {
    parts.push(`| ${statusBadge(s)} | ${byStatus[s] ?? 0} |`);
  }
  parts.push('');
  parts.push(`**blocks batching: ${blocksBatching}**`);
  parts.push('');
  for (const gateKind of GATE_ORDER) {
    const rows = items.filter((it) => it.gate.kind === gateKind);
    parts.push(`## ${GATE_LABEL[gateKind]} (${rows.length})`);
    parts.push('');
    if (rows.length === 0) {
      parts.push('_none_');
    } else {
      parts.push(renderTable(rows));
    }
    parts.push('');
  }
  parts.push('---');
  parts.push('');
  parts.push(
    `*Freeze-readiness (Spec 122 §8.2/§10.3): the template may honestly "freeze after the eighth" only when the ` +
      `batching_prereq set above is EMPTY. Currently **${openBatchingPrereq}** item(s) block it.*`,
  );
  parts.push('');
  return parts.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const items = loadItems();
  const rendered = render(items);
  if (check) {
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
    if (current !== rendered) {
      console.error('[generate-programme-backlog] DRIFT — docs/reports/generated/122-programme-backlog.md is stale. Run `npm run programme-backlog` to regenerate.');
      process.exit(1);
    }
    console.log('[generate-programme-backlog] clean — no drift');
    return;
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, rendered);
  console.log(`[generate-programme-backlog] wrote ${path.relative(ROOT, OUT_PATH)} (${items.length} items, blocks batching: ${openBatchingCount(items)})`);
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) main();
