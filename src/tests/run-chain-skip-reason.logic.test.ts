// 🔗 SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §6c, §9.3 ①
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// P3 (2026-08-24) — null `skip_reason`. run-chain.js has THREE
// `INSERT … status='skipped'` sites and, before this change, only ONE wrote a
// message:
//
//   :508 budget stop   → error_message = "skipped: chain time budget reached (…)"  ✅
//   :526 disabled step → no error_message at all                                   ❌
//   :556 gate skip     → no error_message at all                                   ❌
//
// The consequence is on record: the 2026-08-07 `chain_sources` run finished
// `completed_with_warnings` with many steps at status='skipped' and a null
// reason — the "silent green" class. The row exists, so the step looks
// accounted for, and nothing in the database can say what happened.
//
// Source locks (the established idiom for run-chain.js — see
// run-chain-budget.logic.test.ts). RED before the fix on the disabled + gate
// sites. Stated ceiling: static. These prove each site's INSERT carries an
// error_message column and a distinct literal; they do not execute the chain.
//
// The 4th skip site (`coming_soon`, :566) is deliberately NOT in scope: it
// writes no ledger row at all, so there is no null reason to fix — a different
// (real, filed) gap, not this one.
//
// Run: npx vitest run src/tests/run-chain-skip-reason.logic.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ⚠️ CRLF normalization is load-bearing on a Windows checkout (core.autocrlf=true,
// no .gitattributes yet — P0b item 2). JS `.` and `$` do not match past a `\r`, so a
// `\n`-anchored regex over a CRLF file silently never matches and every lock below
// would pass vacuously.
const SRC = readFileSync(join(process.cwd(), 'scripts/run-chain.js'), 'utf8').replace(/\r\n/g, '\n');

/**
 * Every `INSERT INTO pipeline_runs … 'skipped' …` statement together with its
 * bound parameters — the statement ends at the params array's closing bracket,
 * which is the first `]` after the SQL (no `]` occurs inside these queries).
 */
function skipInserts(): string[] {
  const out: string[] = [];
  let idx = SRC.indexOf('INSERT INTO pipeline_runs');
  while (idx !== -1) {
    const window = SRC.slice(idx, idx + 600);
    const end = window.indexOf(']');
    const stmt = end === -1 ? window : window.slice(0, end + 1);
    if (/'skipped'/.test(stmt)) out.push(stmt);
    idx = SRC.indexOf('INSERT INTO pipeline_runs', idx + 1);
  }
  return out;
}

describe('run-chain.js — every skipped ledger row records WHY (Spec 120 §6c)', () => {
  it('there are exactly three ledger-writing skip sites (census lock — a 4th must be adjudicated, not silently added)', () => {
    expect(skipInserts()).toHaveLength(3);
  });

  it('ALL THREE write an error_message column (2 of 3 wrote none — the 2026-08-07 null-reason run)', () => {
    const missing = skipInserts().filter((s) => !/error_message/.test(s));
    expect(
      missing,
      `skip INSERT sites with no error_message column:\n${missing.join('\n---\n')}`,
    ).toEqual([]);
  });

  it('every skipped row is written with a `skipped: …` reason literal, not a bare status', () => {
    // A count of literals, not their positions — the three sites are in three
    // different code paths and their order in the file is not a contract.
    const reasons = SRC.match(/'skipped: [^']+'|`skipped: [^`]+`/g) ?? [];
    expect(reasons.length, `found reason literals: ${JSON.stringify(reasons)}`).toBeGreaterThanOrEqual(3);
  });

  it('the three reasons are DISTINCT causes — budget, disabled, gate (a shared string is a non-answer)', () => {
    expect(SRC).toMatch(/skipped: chain time budget reached/);
    expect(SRC).toMatch(/skipped: step is disabled/);
    expect(SRC).toMatch(/skipped: gate/);
  });

  it('the gate-skip reason names the gate\'s own cause (0 new records), not just "gate"', () => {
    // The gate skip is the one that produced the 2026-08-07 run's silent rows.
    // "skipped by a gate" would still leave an operator guessing WHICH gate.
    expect(SRC).toMatch(/skipped: gate[^'`\n]*0 new records/);
  });

  it('the disabled reason names the REAL source of the decision — pipeline_schedules, not the manifest', () => {
    // Found writing this fix: `disabledSlugs` is populated from
    // `pipeline_schedules WHERE enabled = FALSE` (:349-357), NOT from
    // scripts/manifest.json. A reason string that said "manifest" would send an
    // operator to the wrong file — the whole point of the message is to end the
    // hunt, so it names the table AND the chain-vs-global scoping (H-W19).
    expect(SRC).toMatch(/skipped: step is disabled in pipeline_schedules/);
    expect(SRC).toMatch(/skipped: step is disabled in pipeline_schedules[^'`\n]*enabled=FALSE/);
  });

  it('the budget site keeps its existing message verbatim (regression lock — it was already correct)', () => {
    expect(SRC).toMatch(/skipped: chain time budget reached \(\$\{budgetStopElapsedMin\}m >= \$\{chainBudgetMinutes\}m\)/);
  });

  it('none of the three sites can throw the chain — each stays inside its own try/catch', () => {
    // Pre-existing behaviour, locked because the fix touches every one of them:
    // a tracking-row INSERT failure must never take down a chain that is
    // otherwise proceeding correctly.
    for (const site of skipInserts()) {
      const idx = SRC.indexOf(site);
      const before = SRC.slice(Math.max(0, idx - 700), idx);
      expect(before, `skip INSERT not preceded by a try {:\n${site}`).toMatch(/try \{/);
    }
  });
});
