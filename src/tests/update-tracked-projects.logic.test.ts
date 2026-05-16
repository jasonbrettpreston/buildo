// 🔗 SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3 + §2.5.c
//
// Phase F.2 pure-helper logic tests for update-tracked-projects.js.
// These tests load the script source as text and execute the pure helpers via vm/eval
// (the helpers are module-local — the test extracts and evaluates them in isolation).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/update-tracked-projects.js');

/**
 * Extract a function declaration block from the script source by name.
 * Returns the function text suitable for `new Function(...)` or vm.runInNewContext.
 */
function extractFn(src: string, name: string): string {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = src.match(re);
  if (!m) throw new Error(`Function ${name} not found in script`);
  const start = m.index!;
  // Find the matching closing brace via depth tracking.
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i++;
  }
  throw new Error(`Could not find end of function ${name}`);
}

describe('Phase F.2 — update-tracked-projects.js pure helpers', () => {
  let SRC: string;
  let sandbox: vm.Context;

  beforeAll(() => {
    SRC = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    // Build a sandbox with all 4 pure helpers + the required constants.
    const helpers = [
      'COA_TERMINAL_DECISIONS = new Set([\'Refused\', \'Withdrawn\', \'Closed\']);',
      'COA_TERMINAL_STATUSES = new Set([\'Complete\', \'Closed\']);',
      'COA_APPROVED_DECISIONS = new Set([\'Approved\', \'Approved with Conditions\']);',
      extractFn(SRC, 'extractCoaApplicationNumber'),
      extractFn(SRC, 'selectCoaStallThreshold'),
      extractFn(SRC, 'isCoaInImminentWindow'),
      extractFn(SRC, 'isCoaDecisionTerminal'),
      extractFn(SRC, 'isCoaDecisionApproved'),
      extractFn(SRC, 'isCoaTerminalState'),
    ].join('\n');
    sandbox = vm.createContext({});
    vm.runInContext(helpers, sandbox);
  });

  // ── selectCoaStallThreshold (Spec 82 §4) ─────────────────────────────

  it('selectCoaStallThreshold(\'Hearing Scheduled\', ...) returns coa_stall_threshold_p2_days', () => {
    const result = vm.runInContext(
      `selectCoaStallThreshold('Hearing Scheduled', { coa_stall_threshold_p2_days: 90, coa_stall_threshold: 30, coa_stall_threshold_postponed_days: 60 })`,
      sandbox,
    );
    expect(result).toBe(90);
  });

  it('selectCoaStallThreshold(\'Postponed\', ...) returns coa_stall_threshold_postponed_days (v2 HIGH-I — operator-tunable)', () => {
    const result = vm.runInContext(
      `selectCoaStallThreshold('Postponed', { coa_stall_threshold_postponed_days: 75 })`,
      sandbox,
    );
    expect(result).toBe(75); // reads from logicVars (not hardcoded 60)
  });

  it('selectCoaStallThreshold(\'Deferred\', ...) returns coa_stall_threshold_postponed_days (same tier)', () => {
    const result = vm.runInContext(
      `selectCoaStallThreshold('Deferred', { coa_stall_threshold_postponed_days: 60 })`,
      sandbox,
    );
    expect(result).toBe(60);
  });

  it('selectCoaStallThreshold(\'Active Review\', ...) returns coa_stall_threshold (generic default)', () => {
    const result = vm.runInContext(
      `selectCoaStallThreshold('Active Review', { coa_stall_threshold: 30 })`,
      sandbox,
    );
    expect(result).toBe(30);
  });

  it('selectCoaStallThreshold(null, ...) returns null (v3 MED-18 null-guard)', () => {
    const result = vm.runInContext(`selectCoaStallThreshold(null, { coa_stall_threshold: 30 })`, sandbox);
    expect(result).toBeNull();
  });

  it('selectCoaStallThreshold(\'\', ...) returns null (v3 MED-18 empty-guard)', () => {
    const result = vm.runInContext(`selectCoaStallThreshold('', { coa_stall_threshold: 30 })`, sandbox);
    expect(result).toBeNull();
  });

  // ── isCoaInImminentWindow (Spec 82 §4) ───────────────────────────────

  it('isCoaInImminentWindow: hearing 5 days from now with window=7 returns true', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const hearing = '2026-05-21'; // 5 days from 2026-05-16
    const result = vm.runInContext(
      `isCoaInImminentWindow('${hearing}', new Date('${now.toISOString()}'), 7)`,
      sandbox,
    );
    expect(result).toBe(true);
  });

  it('isCoaInImminentWindow: hearing in past returns false', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const hearing = '2026-05-10';
    const result = vm.runInContext(
      `isCoaInImminentWindow('${hearing}', new Date('${now.toISOString()}'), 7)`,
      sandbox,
    );
    expect(result).toBe(false);
  });

  it('isCoaInImminentWindow: hearing beyond window returns false', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const hearing = '2026-06-15'; // 30 days out
    const result = vm.runInContext(
      `isCoaInImminentWindow('${hearing}', new Date('${now.toISOString()}'), 7)`,
      sandbox,
    );
    expect(result).toBe(false);
  });

  it('isCoaInImminentWindow: null hearingDate returns false', () => {
    const result = vm.runInContext(
      `isCoaInImminentWindow(null, new Date('2026-05-16T12:00:00Z'), 7)`,
      sandbox,
    );
    expect(result).toBe(false);
  });

  it('isCoaInImminentWindow: windowDays=0 returns false (v4 NIT-XX zero-guard)', () => {
    const result = vm.runInContext(
      `isCoaInImminentWindow('2026-05-21', new Date('2026-05-16T12:00:00Z'), 0)`,
      sandbox,
    );
    expect(result).toBe(false);
  });

  it('isCoaInImminentWindow: windowDays=-1 returns false (v4 NIT-XX negative-guard)', () => {
    const result = vm.runInContext(
      `isCoaInImminentWindow('2026-05-21', new Date('2026-05-16T12:00:00Z'), -1)`,
      sandbox,
    );
    expect(result).toBe(false);
  });

  // ── isCoaDecisionTerminal (Spec 82 §4) ───────────────────────────────

  it('isCoaDecisionTerminal returns true ONLY for {Refused, Withdrawn, Closed}', () => {
    expect(vm.runInContext(`isCoaDecisionTerminal('Refused')`, sandbox)).toBe(true);
    expect(vm.runInContext(`isCoaDecisionTerminal('Withdrawn')`, sandbox)).toBe(true);
    expect(vm.runInContext(`isCoaDecisionTerminal('Closed')`, sandbox)).toBe(true);
  });

  it('isCoaDecisionTerminal returns false for non-terminal decisions', () => {
    expect(vm.runInContext(`isCoaDecisionTerminal('Approved')`, sandbox)).toBe(false);
    expect(vm.runInContext(`isCoaDecisionTerminal('Final and Binding')`, sandbox)).toBe(false);
    expect(vm.runInContext(`isCoaDecisionTerminal(null)`, sandbox)).toBe(false);
    expect(vm.runInContext(`isCoaDecisionTerminal(undefined)`, sandbox)).toBe(false);
  });

  // ── isCoaTerminalState (v4 CRIT-DD — includes Closed status) ─────────

  it('isCoaTerminalState: status=Closed with decision=Approved returns true (v4 CRIT-DD)', () => {
    // 87.6% of CoAs have status=Closed; v3 missed this — v4 CRIT-DD fixed.
    const result = vm.runInContext(`isCoaTerminalState('Closed', 'Approved')`, sandbox);
    expect(result).toBe(true);
  });

  it('isCoaTerminalState: status=Complete with decision=null returns true (P20 lifecycle complete)', () => {
    const result = vm.runInContext(`isCoaTerminalState('Complete', null)`, sandbox);
    expect(result).toBe(true);
  });

  it('isCoaTerminalState: status=Hearing Scheduled with decision=Refused returns true (decision terminal)', () => {
    const result = vm.runInContext(`isCoaTerminalState('Hearing Scheduled', 'Refused')`, sandbox);
    expect(result).toBe(true);
  });

  it('isCoaTerminalState: status=Hearing Scheduled with decision=Approved returns false (non-terminal)', () => {
    const result = vm.runInContext(`isCoaTerminalState('Hearing Scheduled', 'Approved')`, sandbox);
    expect(result).toBe(false);
  });

  // ── isCoaDecisionApproved (Spec 82 §4, v2 CRIT-G excludes FaB) ───────

  it('isCoaDecisionApproved: Approved + Approved with Conditions return true', () => {
    expect(vm.runInContext(`isCoaDecisionApproved('Approved')`, sandbox)).toBe(true);
    expect(vm.runInContext(`isCoaDecisionApproved('Approved with Conditions')`, sandbox)).toBe(true);
  });

  it('isCoaDecisionApproved: Final and Binding returns false (v2 CRIT-G — keep-the-lead semantic)', () => {
    const result = vm.runInContext(`isCoaDecisionApproved('Final and Binding')`, sandbox);
    expect(result).toBe(false);
  });

  // ── extractCoaApplicationNumber (v3 LOW-20) ──────────────────────────

  it('extractCoaApplicationNumber: extracts application number from canonical lead_id', () => {
    const result = vm.runInContext(`extractCoaApplicationNumber('coa:A0123/24TLAB')`, sandbox);
    expect(result).toBe('A0123/24TLAB');
  });

  it('extractCoaApplicationNumber: returns null on non-string input', () => {
    expect(vm.runInContext(`extractCoaApplicationNumber(null)`, sandbox)).toBeNull();
    expect(vm.runInContext(`extractCoaApplicationNumber(undefined)`, sandbox)).toBeNull();
    expect(vm.runInContext(`extractCoaApplicationNumber(123)`, sandbox)).toBeNull();
  });

  it('extractCoaApplicationNumber: returns null on permit-prefixed lead_id', () => {
    const result = vm.runInContext(`extractCoaApplicationNumber('permit:12345:00')`, sandbox);
    expect(result).toBeNull();
  });

  it('extractCoaApplicationNumber: returns null on malformed coa: with no body', () => {
    const result = vm.runInContext(`extractCoaApplicationNumber('coa:')`, sandbox);
    expect(result).toBeNull();
  });
});
