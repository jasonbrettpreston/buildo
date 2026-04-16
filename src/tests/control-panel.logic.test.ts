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
// LOGIC_VAR_DEFAULTS — verify all 26 expected keys are present
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
  'inspection_stall_days',        // WF3-E1
  'stale_closure_abort_pct',      // WF3-E2
  'pending_closed_grace_days',    // WF3-E3
  'pre_permit_expiry_months',     // WF3-E4
  'pre_permit_stale_months',      // WF3-E4
  'coa_freshness_warn_days',          // WF3-E5
  'scrape_early_phase_threshold_pct', // WF3-E6
  'scrape_stale_days',                // WF3-E6
  'calibration_min_sample_size',
  'urban_coverage_ratio',
  'suburban_coverage_ratio',
  'trust_threshold_pct',
  'commercial_shell_multiplier',
  'placeholder_cost_threshold',
];

describe('LOGIC_VAR_DEFAULTS — complete key set', () => {
  it('contains all 26 expected logic variable keys', () => {
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
// Schema parity test — LOGIC_VAR_DEFAULTS ↔ logic_variables.json ↔ config-loader
//
// After WF3-0 (seed refactor), both LOGIC_VAR_DEFAULTS (TS) and
// FALLBACK_LOGIC_VARS (JS) are derived from scripts/seeds/logic_variables.json.
// This test verifies:
//   1. The JSON exists and contains all expected keys.
//   2. LOGIC_VAR_DEFAULTS keys + values match the JSON (both directions).
//   3. config-loader.js derives FALLBACK_LOGIC_VARS from the JSON
//      (text check for the require statement — prevents manual drift).
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema parity — LOGIC_VAR_DEFAULTS ↔ logic_variables.json ↔ config-loader', () => {
  const jsonPath = path.join(REPO_ROOT, 'scripts', 'seeds', 'logic_variables.json');
  const configLoaderPath = path.join(REPO_ROOT, 'scripts', 'lib', 'config-loader.js');

  type LogicVarMeta = { default: number; type: string; description?: string };
  let jsonData: Record<string, LogicVarMeta> = {};
  let configLoaderSource = '';

  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, LogicVarMeta>;
  } catch { /* handled by the readable test below */ }

  try {
    configLoaderSource = fs.readFileSync(configLoaderPath, 'utf-8');
  } catch { /* handled by the readable test below */ }

  const jsonKeys = Object.keys(jsonData);

  it('logic_variables.json is readable and non-empty', () => {
    expect(jsonKeys.length).toBeGreaterThan(0);
  });

  it('logic_variables.json contains all 26 expected keys', () => {
    for (const key of EXPECTED_LOGIC_VAR_KEYS) {
      expect(jsonData, `JSON missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('logic_variables.json has no extra keys beyond the expected set', () => {
    const extra = jsonKeys.filter((k) => !EXPECTED_LOGIC_VAR_KEYS.includes(k));
    expect(extra).toHaveLength(0);
  });

  it('LOGIC_VAR_DEFAULTS keys match logic_variables.json keys (both directions)', () => {
    for (const key of jsonKeys) {
      expect(LOGIC_VAR_DEFAULTS, `LOGIC_VAR_DEFAULTS missing JSON key: ${key}`).toHaveProperty(key);
    }
    for (const key of Object.keys(LOGIC_VAR_DEFAULTS)) {
      expect(jsonData, `JSON missing LOGIC_VAR_DEFAULTS key: ${key}`).toHaveProperty(key);
    }
  });

  it('LOGIC_VAR_DEFAULTS values match logic_variables.json defaults', () => {
    for (const [key, meta] of Object.entries(jsonData)) {
      expect(LOGIC_VAR_DEFAULTS[key]).toBe(meta.default);
    }
  });

  it('config-loader.js derives FALLBACK_LOGIC_VARS from logic_variables.json', () => {
    expect(configLoaderSource.length).toBeGreaterThan(100);
    // After WF3-0, config-loader requires the seed JSON — no inline key list.
    expect(configLoaderSource).toMatch(/require.*seeds\/logic_variables/);
    // The derived assignment must still exist.
    expect(configLoaderSource).toMatch(/FALLBACK_LOGIC_VARS\s*=/);
  });
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

  it('rejects a payload with both numeric value and jsonValue populated (XOR invariant)', () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'income_premium_tiers',
      value: 5,
      jsonValue: { 100000: 1.2 },
    });
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
