// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-CE
//
// F3-2 part 1 (S2, operator 2026-10-13) — the FIRST string-typed logic variable.
//
// Before this, every declared variable was numeric: `invalidReason` guarded with
// `typeof raw !== 'number'`, and `config-loader` read `variable_value_json` only
// when it was an object. A closed-enum STRING (the IANA zone `pipeline_timezone`)
// is the smallest shape that exercises a second kind end to end:
//
//   seed (type "string" + enum)  →  apply-logic-variables (sentinel 0 + to_jsonb($2::text))
//     →  config-loader (string in variable_value_json)  →  config.js invalidReason(raw, min, max, allowed)
//
// The numeric path is locked here too, so a change that made the enum arm leak
// into it would turn this red: the enum guard must be reachable ONLY when the
// descriptor declares an `enum`.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runnerVariableRows } from './helpers/runner-variables';

const ROOT = path.resolve(__dirname, '..', '..');
const SEED_PATH = path.join(ROOT, 'scripts/seeds/logic_variables.json');
const APPLY_PATH = path.join(ROOT, 'scripts/seeds/apply-logic-variables.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { invalidReason, resolveConfig } = require('../../scripts/lib/step/config.js');

const ENUM = ['UTC', 'America/Toronto'];

describe('invalidReason — the enum arm (R-CE string-typed variable)', () => {
  it("'UTC' with enum ['UTC','America/Toronto'] → null (an allowed member)", () => {
    expect(invalidReason('UTC', null, null, ENUM)).toBeNull();
  });

  it("'Europe/Paris' → 'not_in_enum' (a string, but not a member)", () => {
    expect(invalidReason('Europe/Paris', null, null, ENUM)).toBe('not_in_enum');
  });

  it("5 → 'not_in_enum' (a number is never a string enum member)", () => {
    expect(invalidReason(5, null, null, ENUM)).toBe('not_in_enum');
  });

  it('an undefined/absent enum leaves the numeric path untouched (defence in depth)', () => {
    expect(invalidReason('UTC', null, null, undefined)).toBe('non_finite');
  });
});

describe('invalidReason — the numeric path is unchanged byte-for-byte', () => {
  it('(5, 0, 10) → null (in bounds)', () => {
    expect(invalidReason(5, 0, 10)).toBeNull();
  });

  it('(11, 0, 10) → above_max', () => {
    expect(invalidReason(11, 0, 10)).toBe('above_max');
  });

  it("('x', 0, 10) → non_finite", () => {
    expect(invalidReason('x', 0, 10)).toBe('non_finite');
  });
});

describe('seed entry — pipeline_timezone is a string-typed, closed-enum variable', () => {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as Record<string, {
    default: unknown; type?: string; enum?: string[]; description?: string; admin?: { group?: string };
  }>;

  it('exists with type "string"', () => {
    expect(seed.pipeline_timezone).toBeTruthy();
    expect(seed.pipeline_timezone!.type).toBe('string');
  });

  it("default 'UTC' is a member of the declared enum", () => {
    expect(seed.pipeline_timezone!.default).toBe('UTC');
    expect(seed.pipeline_timezone!.enum).toContain(seed.pipeline_timezone!.default);
  });

  it('the enum is a closed, non-empty set of strings', () => {
    expect(Array.isArray(seed.pipeline_timezone!.enum)).toBe(true);
    expect(seed.pipeline_timezone!.enum!.length).toBeGreaterThan(0);
    for (const member of seed.pipeline_timezone!.enum!) expect(typeof member).toBe('string');
  });
});

describe('apply-logic-variables — string-typed rows store the value in variable_value_json', () => {
  it('the source contains the sentinel-0 + to_jsonb($2::text) insert', () => {
    expect(fs.readFileSync(APPLY_PATH, 'utf8')).toContain('to_jsonb($2::text)');
  });
});

describe('resolveConfig — a string-typed variable resolves through the JSON branch', () => {
  /**
   * Answer the two SELECTs resolveConfig issues: the registry-wide read
   * (config-loader) and the declared-names presence read (config.js's LM-D15
   * query). A string-typed var returns its value in `variable_value_json` with a
   * 0 sentinel in `variable_value`, exactly as migration 219 stores it.
   */
  function poolWith(logicVars: Record<string, { value: unknown; json?: unknown; sentinel?: number }>) {
    const rows = Object.entries(logicVars).map(([variable_key, v]) => ({
      variable_key,
      variable_value: v.sentinel ?? 0,
      variable_value_json: v.json ?? v.value ?? null,
    }));
    // Spec 124 R-EB (a): every step also resolves the runner-owned step_* rows.
    return { query: async () => ({ rows: [...runnerVariableRows(), ...rows] }) };
  }

  it('a valid enum member is projected into values/stamp as the STRING itself', async () => {
    const pool = poolWith({ pipeline_timezone: { value: 'America/Toronto' } });
    const descriptor = {
      identity: { name: 'test_step' },
      config: { logic_variables: [{ name: 'pipeline_timezone', min: 'none', max: 'none', on_invalid: 'fail', enum: ENUM }] },
    };
    const { values, stamp } = await resolveConfig(pool, descriptor);
    expect(values.pipeline_timezone).toBe('America/Toronto');
    expect(stamp.pipeline_timezone).toBe('America/Toronto');
  });

  it('a non-member string is refused by on_invalid "fail" (names the enum, not [min, max])', async () => {
    const pool = poolWith({ pipeline_timezone: { value: 'Europe/Paris' } });
    const descriptor = {
      identity: { name: 'test_step' },
      config: { logic_variables: [{ name: 'pipeline_timezone', min: 'none', max: 'none', on_invalid: 'fail', enum: ENUM }] },
    };
    await expect(resolveConfig(pool, descriptor)).rejects.toThrow(/not_in_enum/);
    await expect(resolveConfig(pool, descriptor)).rejects.toThrow(/one of/);
  });

  it('an enum with on_invalid other than "fail" throws the defence-in-depth error', async () => {
    const pool = poolWith({ pipeline_timezone: { value: 'UTC' } });
    const descriptor = {
      identity: { name: 'test_step' },
      config: { logic_variables: [{ name: 'pipeline_timezone', min: 'none', max: 'none', on_invalid: 'clamp', enum: ENUM }] },
    };
    await expect(resolveConfig(pool, descriptor)).rejects.toThrow(/on_invalid .* "fail" only/);
  });
});
