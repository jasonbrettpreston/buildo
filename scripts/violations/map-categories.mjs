#!/usr/bin/env node
/**
 * Claim -> descriptor CATEGORY coverage map.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md
 *
 * WHY THIS EXISTS — and it is a process fix, not a feature.
 * Four descriptor categories (database, counters, config, sharing) were found
 * REACTIVELY: the operator noticed a gap, and only then was it filled. That is
 * the same failure Spec 121 12.9 already made — its coverage matrix mapped ID
 * *spaces* to stages, looked complete, and hid 162 uncited claims.
 *
 * The fix is deterministic coverage: EVERY claim must land in a descriptor
 * category, or in one of two explicit non-descriptor buckets. Anything else is
 * an ORPHAN, and an orphan means a concern the step contract cannot express.
 * Orphans are the gaps. They are found by the tool, never by noticing.
 *
 *   DECLARED       the step declares it in one of the 17 categories
 *   RUNNER         the library owns it; nothing is declared per step
 *   METHOD         a Spec 121 method claim; no step-level surface at all
 *   ORPHAN         no home -> a candidate category or field. HARD FAIL.
 *
 * TOOLING GATE (Spec 121 12b.6): --self-test proves orphan detection FIRES.
 *
 * Usage:
 *   node scripts/violations/map-categories.mjs
 *   node scripts/violations/map-categories.mjs out.md
 *   node scripts/violations/map-categories.mjs --orphans     # just the gaps
 *   node scripts/violations/map-categories.mjs --self-test
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseRegister } from './extract-claims.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_121 = path.join(ROOT, 'docs/specs/01-pipeline/121_assessment_and_verification_methodology.md');

/** The 17 frozen categories, plus the two legitimate non-descriptor buckets. */
export const HOMES = [
  'identity', 'inputs', 'outputs', 'staleness', 'guards', 'execution',
  'checks', 'override', 'emits', 'deviations', 'limitations',
  'interpretation', 'recovery', 'database', 'counters', 'config', 'sharing',
  'RUNNER', 'METHOD',
];

/**
 * Keyword -> home. Ordered; first match wins. Deliberately small and readable:
 * this is the authored half, and it must stay auditable by eye.
 */
const RULES = [
  // --- the four that were found reactively. Listed FIRST so their coverage is visible.
  { re: /current_database|application_name|:6543|permitted database|wrong.database|pooler/i, home: 'database' },
  { re: /records_total|records_new|records_updated|counter|RETURNING scoped|writes\.key/i, home: 'counters' },
  { re: /logic_var|marketplace|\.strict\(\)|passthrough|config load|unreachable config|zod/i, home: 'config' },
  { re: /PIPELINE_CHAIN|chain-scoped|shared step|per-chain|slug|pipeline name|phase:/i, home: 'sharing' },

  // --- the original 13
  { re: /lock|why_lock|archetype|contract_version|spec_version|SPEC LINK/i, home: 'identity' },
  { re: /producer|upstream|expect_nonempty|on_missing|version_pin|assert_health|freshness of dependenc/i, home: 'inputs' },
  { re: /retract|replay|append_unsafe|upsert|IS DISTINCT FROM|invalidat|publish|blanket|write amplif/i, home: 'outputs' },
  { re: /pending|checkpoint|stale|fingerprint|logic_version|watermark|incremental scope/i, home: 'staleness' },
  { re: /extension|GIST|SRID|empty_source|schema.drift|precondition|disk precheck/i, home: 'guards' },
  { re: /budget|txn_scope|transaction|chunked|statement_timeout|batch|on_row_error|criticality|needs_disk|timeout|duration tripwire|deadline/i, home: 'execution' },
  { re: /check|validator|severity|blocking|threshold|limit|population|verdict|audit row|coverage floor|WARN|FAIL/i, home: 'checks' },
  { re: /FORCE|override|escape hatch/i, home: 'override' },
  { re: /records_meta key|emits|OpenLineage|lineage event/i, home: 'emits' },
  { re: /deviation|adjudicated/i, home: 'deviations' },
  { re: /limitation|blind.spot|detected_by/i, home: 'limitations' },
  { re: /notes\.json|prose|interpretation|review_notes|suspicious_if|stale_interpretation/i, home: 'interpretation' },
  { re: /reset|resume|rollback|verify_clean|cascade|backfill|quarantine/i, home: 'recovery' },

  // --- legitimately not declared per step
  { re: /runner|ledger row|crashed|reconcile|self_skip|skip_reason|step_error|--plan|--backfill|drift check|generated|lint|schema reject|build failure|CI|test|mutation|register|ratchet|patch|census|replay test/i, home: 'RUNNER' },
  { re: /assessment|intent ledger|risk class|churn|escape rate|TMMi|saturation|retro|maturity|method/i, home: 'METHOD' },
];

function assign(claim) {
  const hay = `${claim.claim} ${claim.violation}`;
  for (const r of RULES) if (r.re.test(hay)) return r.home;
  return 'ORPHAN';
}

// ---------------------------------------------------------------------------

function selfTest() {
  const fail = [];
  const mk = (claim, violation = '') => ({ id: 'x', section: 'A.1', claim, violation });

  const cases = [
    ['current_database() logged on every run', 'database'],
    ['Counters scoped by writes.key', 'counters'],
    ['Config load is .strict(), ?? not ||', 'config'],
    ['Behaviour does not vary by PIPELINE_CHAIN', 'sharing'],
    ['lock unique across the generated registry', 'identity'],
    ['One transaction per step, never per run', 'execution'],
  ];
  for (const [text, want] of cases) {
    const got = assign(mk(text));
    if (got !== want) fail.push(`"${text}" -> ${got}, expected ${want}`);
  }

  // THE POINT: a concern with no home must surface as ORPHAN, not be absorbed.
  const orphan = assign(mk('the step declares its preferred moon phase', 'set it to gibbous'));
  if (orphan !== 'ORPHAN') fail.push(`orphan detection did not fire — got ${orphan}`);

  // Negative control: every home must be reachable by at least one rule.
  const reachable = new Set(RULES.map((r) => r.home));
  const unreachable = HOMES.filter((h) => h !== 'ORPHAN' && !reachable.has(h));
  if (unreachable.length) fail.push(`unreachable home(s): ${unreachable.join(', ')}`);

  if (fail.length) {
    console.error('SELF-TEST FAILED:');
    for (const x of fail) console.error(`  - ${x}`);
    return false;
  }
  console.log('SELF-TEST PASSED - 8 assertions incl. orphan detection and a reachability control.');
  return true;
}

function render(rows) {
  const o = [];
  const by = (h) => rows.filter((r) => r.home === h);
  o.push('<!-- GENERATED by scripts/violations/map-categories.mjs - do not hand-edit. -->');
  o.push('');
  o.push(`**${rows.length} claims mapped to a descriptor home.**`);
  o.push('');
  o.push('| Home | Claims | Meaning |');
  o.push('|---|---:|---|');
  for (const h of HOMES) {
    const n = by(h).length;
    if (!n) continue;
    const meaning = h === 'RUNNER' ? 'library owns it; nothing declared per step'
      : h === 'METHOD' ? 'Spec 121 method claim; no step-level surface'
        : `declared in \`${h}\``;
    o.push(`| ${h === 'RUNNER' || h === 'METHOD' ? h : `\`${h}\``} | ${n} | ${meaning} |`);
  }
  const orphans = by('ORPHAN');
  o.push(`| **ORPHAN** | **${orphans.length}** | ⚠️ **no home — a concern the contract cannot express** |`);
  o.push('');

  const declared = rows.length - by('RUNNER').length - by('METHOD').length - orphans.length;
  o.push(`> **${declared} claims are DECLARED** across the 17 categories · **${by('RUNNER').length} are RUNNER-owned** · **${by('METHOD').length} are METHOD**.`);
  o.push('');

  if (orphans.length) {
    o.push('## ⚠️ ORPHANS — candidate categories or fields');
    o.push('');
    o.push('| # | § | Claim |');
    o.push('|---|---|---|');
    for (const r of orphans) o.push(`| ${r.id} | ${r.section} | ${String(r.claim).replace(/\|/g, '\\|').slice(0, 130)} |`);
    o.push('');
    o.push('> Each orphan is either a **missing field**, a **missing category**, or a rule gap in this file. **Adjudicate every one** — that is the check the reactive process skipped.');
  } else {
    o.push('## ORPHANS — none');
    o.push('');
    o.push('Every claim has a declared home, a runner owner, or is a method claim.');
  }
  o.push('');

  for (const h of HOMES) {
    const hr = by(h);
    if (!hr.length) continue;
    o.push(`### ${h} — ${hr.length}`);
    o.push('');
    o.push(hr.map((r) => r.id).join(', '));
    o.push('');
  }
  return o.join('\n');
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  if (!selfTest()) { console.error('Refusing to emit from an unproven mapper.'); return 1; }

  const claims = parseRegister(fs.readFileSync(SPEC_121, 'utf8'));
  if (claims.length < 200) { console.error(`Only ${claims.length} claims parsed - refusing.`); return 1; }

  const rows = claims.map((c) => ({ ...c, home: assign(c) }));
  const orphans = rows.filter((r) => r.home === 'ORPHAN');

  if (argv.includes('--orphans')) {
    for (const r of orphans) console.log(`#${r.id} [${r.section}] ${r.claim}`);
  } else {
    const text = render(rows);
    const out = argv.find((a) => !a.startsWith('--'));
    if (out) { fs.writeFileSync(out, `${text}\n`); console.log(`Wrote ${rows.length} mapped claims -> ${out}`); }
    else console.log(text);
  }

  if (orphans.length) {
    console.error(`\n${orphans.length} ORPHAN claim(s) - concerns the step contract cannot express.`);
    console.error('Adjudicate each: missing field, missing category, or a rule gap here.');
    return 1;
  }
  return 0;
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) process.exitCode = main(process.argv.slice(2));
