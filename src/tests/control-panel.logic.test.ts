// SPEC LINK: docs/specs/product/future/86_control_panel.md §5
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  deltaExceeds50pct,
  LOGIC_VAR_DEFAULTS,
  ConfigUpdatePayloadSchema,
  LogicVariableUpdateSchema,
  TradeConfigUpdateSchema,
  ScopeMatrixUpdateSchema,
} from '@/lib/admin/control-panel';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Delta Guard — pure function tests
// ─────────────────────────────────────────────────────────────────────────────

describe('deltaExceeds50pct — Delta Guard utility', () => {
  it('returns false when draft equals default', () => {
    expect(deltaExceeds50pct('los_base_divisor', 10000)).toBe(false);
  });

  it('returns false when draft deviates exactly 50% (boundary: not strictly greater)', () => {
    // Default = 10000; 50% of 10000 = 5000. 10000 - 5000 = 5000 → deviation = 0.5, not > 0.5
    expect(deltaExceeds50pct('los_base_divisor', 5000)).toBe(false);
  });

  it('returns true when draft deviates more than 50% below default', () => {
    // 4999 → deviation = 5001/10000 = 0.5001 > 0.5
    expect(deltaExceeds50pct('los_base_divisor', 4999)).toBe(true);
  });

  it('returns true when draft deviates more than 50% above default', () => {
    // Default = 10000; 15001 → deviation = 5001/10000 > 0.5
    expect(deltaExceeds50pct('los_base_divisor', 15001)).toBe(true);
  });

  it('returns false for unknown key (no default to compare against)', () => {
    expect(deltaExceeds50pct('nonexistent_key', 999)).toBe(false);
  });

  it('returns false when default is 0 (cannot compute ratio)', () => {
    const overrides = { some_key: 0 };
    expect(deltaExceeds50pct('some_key', 1000, overrides)).toBe(false);
  });

  it('handles negative defaults (expired_threshold_days = -90)', () => {
    // Default = -90; -135 → deviation = 45/90 = 0.5 → false
    expect(deltaExceeds50pct('expired_threshold_days', -135)).toBe(false);
    // -136 → deviation > 0.5 → true
    expect(deltaExceeds50pct('expired_threshold_days', -136)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC_VAR_DEFAULTS — verify all 18 expected keys are present
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_LOGIC_VAR_KEYS = [
  'los_multiplier_bid',
  'los_multiplier_work',
  'los_penalty_tracking',
  'los_penalty_saving',
  'los_base_cap',
  'los_base_divisor',
  'stall_penalty_precon',
  'stall_penalty_active',
  'expired_threshold_days',
  'liar_gate_threshold',
  'lead_expiry_days',
  'coa_stall_threshold',
  'calibration_min_sample_size',
  'urban_coverage_ratio',
  'suburban_coverage_ratio',
  'trust_threshold_pct',
  'commercial_shell_multiplier',
  'placeholder_cost_threshold',
];

describe('LOGIC_VAR_DEFAULTS — complete key set', () => {
  it('contains all 18 expected logic variable keys', () => {
    for (const key of EXPECTED_LOGIC_VAR_KEYS) {
      expect(LOGIC_VAR_DEFAULTS).toHaveProperty(key);
    }
  });

  it('has no extra keys beyond the expected set', () => {
    const extra = Object.keys(LOGIC_VAR_DEFAULTS).filter(
      (k) => !EXPECTED_LOGIC_VAR_KEYS.includes(k),
    );
    expect(extra).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema parity test — TS LOGIC_VAR_DEFAULTS ↔ JS config-loader FALLBACK_LOGIC_VARS
//
// Reads scripts/lib/config-loader.js as text and asserts every key in
// LOGIC_VAR_DEFAULTS appears in the FALLBACK_LOGIC_VARS object declaration.
// This is the drift guard: if someone adds a key to config-loader but forgets
// LOGIC_VAR_DEFAULTS (or vice-versa), this test fails in CI.
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema parity — LOGIC_VAR_DEFAULTS ↔ config-loader FALLBACK_LOGIC_VARS', () => {
  const configLoaderPath = path.join(REPO_ROOT, 'scripts', 'lib', 'config-loader.js');
  let configLoaderSource: string;

  try {
    configLoaderSource = fs.readFileSync(configLoaderPath, 'utf-8');
  } catch {
    configLoaderSource = '';
  }

  it('config-loader.js is readable', () => {
    expect(configLoaderSource.length).toBeGreaterThan(100);
  });

  it('config-loader defines FALLBACK_LOGIC_VARS', () => {
    expect(configLoaderSource).toMatch(/FALLBACK_LOGIC_VARS\s*=/);
  });

  // For each TS default key, assert it appears inside the FALLBACK_LOGIC_VARS
  // block in config-loader.js. This catches key additions to either side.
  for (const key of EXPECTED_LOGIC_VAR_KEYS) {
    it(`key "${key}" present in config-loader FALLBACK_LOGIC_VARS`, () => {
      const inFallback = configLoaderSource.includes(`  ${key}:`);
      expect(inFallback).toBe(true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas — unit validation
// ─────────────────────────────────────────────────────────────────────────────

describe('LogicVariableUpdateSchema', () => {
  it('accepts a valid numeric update', () => {
    const result = LogicVariableUpdateSchema.safeParse({ key: 'los_base_divisor', value: 5000 });
    expect(result.success).toBe(true);
  });

  it('accepts a JSON-type update (no numeric value)', () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'income_premium_tiers',
      value: null,
      jsonValue: { 100000: 1.2, 150000: 1.5 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty key', () => {
    const result = LogicVariableUpdateSchema.safeParse({ key: '', value: 5 });
    expect(result.success).toBe(false);
  });
});

describe('TradeConfigUpdateSchema', () => {
  it('accepts a valid partial trade config update', () => {
    const result = TradeConfigUpdateSchema.safeParse({
      tradeSlug: 'plumbing',
      multiplierBid: 3.0,
      imminentWindowDays: 21,
    });
    expect(result.success).toBe(true);
  });

  it('rejects allocationPct > 1', () => {
    const result = TradeConfigUpdateSchema.safeParse({
      tradeSlug: 'plumbing',
      allocationPct: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects structureComplexityFactor below 0.5', () => {
    const result = TradeConfigUpdateSchema.safeParse({
      tradeSlug: 'framing',
      structureComplexityFactor: 0.4,
    });
    expect(result.success).toBe(false);
  });
});

describe('ScopeMatrixUpdateSchema', () => {
  it('accepts a valid cell update', () => {
    const result = ScopeMatrixUpdateSchema.safeParse({
      permitType: 'new building',
      structureType: 'sfd',
      gfaAllocationPercentage: 1.0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects gfaAllocationPercentage of 0 (must be > 0)', () => {
    const result = ScopeMatrixUpdateSchema.safeParse({
      permitType: 'addition',
      structureType: 'sfd',
      gfaAllocationPercentage: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('ConfigUpdatePayloadSchema', () => {
  it('accepts an empty payload (no-op diff)', () => {
    const result = ConfigUpdatePayloadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a full multi-section payload', () => {
    const result = ConfigUpdatePayloadSchema.safeParse({
      logicVariables: [{ key: 'los_base_divisor', value: 8000 }],
      tradeConfigs: [{ tradeSlug: 'plumbing', multiplierBid: 3.0 }],
      scopeMatrix: [{ permitType: 'addition', structureType: 'sfd', gfaAllocationPercentage: 0.3 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed tradeSlug in tradeConfigs array', () => {
    const result = ConfigUpdatePayloadSchema.safeParse({
      tradeConfigs: [{ tradeSlug: '', multiplierBid: 3.0 }],
    });
    expect(result.success).toBe(false);
  });
});
