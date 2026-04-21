// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/close-stale-permits.js must read both its
// Ops-tunable thresholds from logicVars rather than hardcoding them:
//   - stale_closure_abort_pct  (E2): safety abort gate (default 10%)
//   - pending_closed_grace_days (E3): Pending Closed → Closed grace (default 30 days)
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/close-stale-permits.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('close-stale-permits.js — threshold externalization (§6.4)', () => {
  // ── E2: safety abort gate ─────────────────────────────────────────────────

  it('seed JSON has stale_closure_abort_pct with correct defaults and bounds', () => {
    expect(SEED).toHaveProperty('stale_closure_abort_pct');
    const entry = SEED.stale_closure_abort_pct;
    if (!entry) throw new Error('stale_closure_abort_pct missing from seed JSON');
    expect(entry.default).toBe(10);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads stale_closure_abort_pct from logicVars (not hardcoded)', () => {
    expect(SRC).toMatch(/logicVars\.stale_closure_abort_pct/);
    // The hardcoded >= 10 comparison must be gone
    expect(SRC).not.toMatch(/pendingClosedRate\s*>=\s*10[^0-9]/);
  });

  // ── E3: grace period ──────────────────────────────────────────────────────

  it('seed JSON has pending_closed_grace_days with correct defaults and bounds', () => {
    expect(SEED).toHaveProperty('pending_closed_grace_days');
    const entry = SEED.pending_closed_grace_days;
    if (!entry) throw new Error('pending_closed_grace_days missing from seed JSON');
    expect(entry.default).toBe(30);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads pending_closed_grace_days from logicVars — no hardcoded INTERVAL 30 days', () => {
    expect(SRC).toMatch(/logicVars\.pending_closed_grace_days/);
    expect(SRC).not.toMatch(/INTERVAL '30 days'/);
  });

  // ── Shared wiring ─────────────────────────────────────────────────────────

  it('LOGIC_VARS_SCHEMA includes both keys with numeric type', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/stale_closure_abort_pct/);
    expect(SRC).toMatch(/pending_closed_grace_days/);
    expect(SRC).toMatch(/z\.coerce\.number/);
  });
});
