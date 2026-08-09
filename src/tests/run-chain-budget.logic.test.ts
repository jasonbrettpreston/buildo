// 🔗 SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (chain soft time-budget, WF3 2026-08-09)
//
// Source locks on run-chain.js's soft time-budget self-stop — the d6eb9f31 deep-scrapes ruling
// generalized to chain orchestration: a chain must stop launching steps before ANY platform
// boundary (GH step/job timeouts) and finalize through its NORMAL terminal path, exit 0. The
// 2026-08-08 incident: coa (ungated, 102 min) outran its 90-min step timeout — the kill never
// reached the node process (it ran 12 more minutes concurrently with permits), and permits then
// died dirty at its own 120-min ceiling (2 orphaned rows). Model: chain-cascade.integration.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'scripts/run-chain.js'), 'utf8');

describe('run-chain.js — soft time-budget self-stop (Spec 115 §2.2)', () => {
  it('reads CHAIN_TIME_BUDGET_MINUTES from env (absent/0 → inert)', () => {
    expect(SRC).toMatch(/CHAIN_TIME_BUDGET_MINUTES/);
  });

  it('budget-skipped step rows carry a NAMED error_message (cause-distinguishable, unlike disabled/gate skips)', () => {
    // Obs F2: today's skip INSERTs are byte-identical with no persisted cause. The budget skip
    // must write 'chain time budget' into error_message so the DB row explains itself.
    expect(SRC).toMatch(/INSERT INTO pipeline_runs[^;]*error_message[^;]*\)/);
    expect(SRC).toMatch(/chain time budget/);
  });

  it('budget-stop maps to completed_with_warnings via an EXPLICIT status-ladder branch (not verdict coincidence)', () => {
    // Int F4: hasVerdictWarns is sourced only from step audit verdicts — an all-PASS budget-stopped
    // chain would otherwise read plain 'completed'. FAIL verdicts must still win (branch sits after
    // completed_with_errors).
    expect(SRC).toMatch(/budgetStopped/);
    const errorsIdx = SRC.indexOf("chainStatus = 'completed_with_errors'");
    const budgetBranch = SRC.search(/budgetStopped\)\s*chainStatus = 'completed_with_warnings'/);
    expect(errorsIdx).toBeGreaterThan(-1);
    expect(budgetBranch).toBeGreaterThan(errorsIdx); // FAIL wins; budget branch after it
  });

  it('budget-stop sets a human-readable chainError (renders in FreshnessTimeline; meta alone is invisible)', () => {
    // Obs F1: 33% of coa runs are already completed_with_warnings — status alone cannot distinguish
    // a budget-stop. The gateSkipped precedent writes error_message; the budget path must too.
    expect(SRC).toMatch(/budgetStopped[\s\S]{0,400}time budget|time budget[\s\S]{0,400}budgetStopped/);
  });

  it('emits records_meta.budget_stopped with elapsed/budget/steps_skipped', () => {
    expect(SRC).toMatch(/budget_stopped/);
    expect(SRC).toMatch(/steps_skipped/);
  });

  it('the budget check NEVER sets failedStep (exit stays 0 — the deep-scrapes exit-semantics fence)', () => {
    // The cancel path sets failedStep (deliberate exit-1); the budget path must not. Lock: within
    // the budget-break block there is no failedStep assignment.
    const m = SRC.match(/CHAIN_TIME_BUDGET[\s\S]{0,1500}?break;/);
    expect(m, 'budget check block with break must exist').not.toBeNull();
    expect(m![0]).not.toMatch(/failedStep\s*=/);
  });

  it('the budget check sits OUTSIDE the if (chainRunId) cancel guard (works when tracking-row INSERT failed)', () => {
    // Int F1 caveat: the cancel DB-poll is nested in if(chainRunId); the budget check is pure
    // arithmetic and must not be. Lock: the budget comparison does not reference chainRunId in
    // its own conditional line.
    const line = SRC.split('\n').find((l) => /elapsed|Date\.now\(\)/.test(l) && /budget/i.test(l));
    expect(line, 'an elapsed-vs-budget comparison line must exist').toBeTruthy();
    expect(line!).not.toMatch(/chainRunId/);
  });
});

describe('check-chain-verdict.js — budget-stopped chains are green-allowlisted (assert, not assume)', () => {
  it('completed_with_warnings is in OK_STATUSES', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/check-chain-verdict.js'), 'utf8');
    expect(src).toMatch(/OK_STATUSES\s*=\s*new Set\(\[\s*'completed',\s*'completed_with_warnings'\s*\]\)/);
  });
});
