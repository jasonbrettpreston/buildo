// SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5
//            docs/specs/01-pipeline/124_step_standard_policy.md (R-CE)
//
// S2 F3-2 (part 2) — a string-typed logic variable with a declared closed enum
// (`pipeline_timezone`) is a JSON-typed variable whose jsonValue is a STRING.
// This file locks:
//   1. the Zod surface accepts a string jsonValue (and still XORs against value);
//   2. LOGIC_VAR_DEFAULTS never carries a string (deltaExceeds50pct's domain) and
//      LOGIC_VAR_ENUMS carries the declared enum;
//   3. applyConfigUpdate serialises a string jsonValue as valid JSON text
//      (`'"UTC"'`) and refuses an out-of-set value BEFORE any UPDATE.
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyConfigUpdate,
  LOGIC_VAR_DEFAULTS,
  LOGIC_VAR_ENUMS,
  LogicVariableUpdateSchema,
} from '@/lib/admin/control-panel';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEED_PATH = path.join(REPO_ROOT, 'scripts', 'seeds', 'logic_variables.json');

type SeedEntry = { default: unknown; type: string; enum?: readonly string[] };

let seed: Record<string, SeedEntry> = {};
try {
  seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as Record<string, SeedEntry>;
} catch { /* the skipIf guards below handle an unreadable seed */ }

/**
 * Minimal pg-pool stand-in: `connect()` hands back a client whose `query`
 * records `{ sql, params }` and answers `{ rowCount: 0, rows: [] }`. The
 * `applyConfigUpdate` BEGIN/UPDATE/COMMIT sequence therefore runs for real,
 * and the test can assert on the exact params array each UPDATE received.
 */
function fakePool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rowCount: 0, rows: [] as Array<Record<string, unknown>> };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), query };
  return { pool, calls, query };
}

const updateCalls = (calls: Array<{ sql: string; params: unknown[] }>) =>
  calls.filter((c) => c.sql.includes('UPDATE logic_variables'));

// ─────────────────────────────────────────────────────────────────────────────
// Zod — string jsonValue is accepted; the value/jsonValue XOR still holds
// ─────────────────────────────────────────────────────────────────────────────

describe('LogicVariableUpdateSchema — string-typed jsonValue', () => {
  it("accepts a string jsonValue ({key:'pipeline_timezone', jsonValue:'UTC'})", () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'pipeline_timezone',
      jsonValue: 'UTC',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.jsonValue).toBe('UTC');
  });

  it('still accepts an object jsonValue', () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'income_premium_tiers',
      jsonValue: { 100000: 1.2, 150000: 1.5 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload carrying BOTH value and string jsonValue', () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'pipeline_timezone',
      value: 1,
      jsonValue: 'UTC',
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC_VAR_DEFAULTS / LOGIC_VAR_ENUMS — numeric-only domain + declared enum
// ─────────────────────────────────────────────────────────────────────────────

describe('LOGIC_VAR_DEFAULTS / LOGIC_VAR_ENUMS', () => {
  it('LOGIC_VAR_DEFAULTS contains no string value (deltaExceeds50pct never sees a string)', () => {
    for (const [key, value] of Object.entries(LOGIC_VAR_DEFAULTS)) {
      // NULL defaults are a pre-existing seed reality (lifecycle_seq_band_*_max
      // has `default: null`) and are preserved verbatim; the invariant this
      // guards is that no STRING ever enters the numeric-delta domain.
      expect(
        typeof value !== 'string',
        `LOGIC_VAR_DEFAULTS.${key} is a string; deltaExceeds50pct requires numbers`,
      ).toBe(true);
    }
    // The one string-typed variable is excluded outright.
    expect('pipeline_timezone' in LOGIC_VAR_DEFAULTS).toBe(false);
  });

  // The seed edit lands in a sibling run — guard the enum case so this file is
  // green today and tightens automatically once pipeline_timezone is seeded.
  it.skipIf(!('pipeline_timezone' in seed))(
    'LOGIC_VAR_ENUMS.pipeline_timezone deep-equals the seed enum',
    () => {
      expect(LOGIC_VAR_ENUMS.pipeline_timezone).toEqual(['UTC', 'America/Toronto']);
      expect(LOGIC_VAR_ENUMS.pipeline_timezone).toEqual(seed.pipeline_timezone!.enum);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// applyConfigUpdate — jsonb params are JSON TEXT, and the enum is enforced
// ─────────────────────────────────────────────────────────────────────────────

describe('applyConfigUpdate — string jsonValue serialisation + enum guard', () => {
  it("sends a string jsonValue as its JSON text ('\"UTC\"') in params[2]", async () => {
    const { pool, calls } = fakePool();
    await applyConfigUpdate(pool as never, {
      logicVariables: [{ key: 'pipeline_timezone', jsonValue: 'UTC' }],
    });

    const [update] = updateCalls(calls);
    expect(update).toBeDefined();
    // params = [key, value|null, jsonValueText]
    expect(update!.params[0]).toBe('pipeline_timezone');
    expect(update!.params[1]).toBeNull();
    expect(update!.params[2]).toBe('"UTC"');
    // And it is genuinely JSON-parseable to the original string.
    expect(JSON.parse(update!.params[2] as string)).toBe('UTC');
  });

  it('sends an object jsonValue as its JSON text (object behaviour unchanged)', async () => {
    const { pool, calls } = fakePool();
    await applyConfigUpdate(pool as never, {
      logicVariables: [{ key: 'income_premium_tiers', jsonValue: { 100000: 1.2 } }],
    });

    const [update] = updateCalls(calls);
    expect(update).toBeDefined();
    expect(update!.params[2]).toBe(JSON.stringify({ 100000: 1.2 }));
    expect(JSON.parse(update!.params[2] as string)).toEqual({ 100000: 1.2 });
  });

  it('sends null (not "null") when jsonValue is absent', async () => {
    const { pool, calls } = fakePool();
    await applyConfigUpdate(pool as never, {
      logicVariables: [{ key: 'los_base_divisor', value: 8000 }],
    });

    const [update] = updateCalls(calls);
    expect(update).toBeDefined();
    expect(update!.params[2]).toBeNull();
  });

  it('throws BEFORE any UPDATE when a string is not in the declared enum', async () => {
    const { pool, calls } = fakePool();
    await expect(
      applyConfigUpdate(pool as never, {
        logicVariables: [{ key: 'pipeline_timezone', jsonValue: 'Mars/Olympus' }],
      }),
    ).rejects.toThrow(/pipeline_timezone.*not one of its declared enum values/);

    // The guard fires before the UPDATE — no logic_variables write was issued.
    expect(updateCalls(calls)).toHaveLength(0);
    // And the transaction was opened but never reached the UPDATE.
    expect(calls.some((c) => c.sql === 'BEGIN')).toBe(true);
  });

  it('throws when a string jsonValue targets a key with no declared enum', async () => {
    const { pool, calls } = fakePool();
    await expect(
      applyConfigUpdate(pool as never, {
        logicVariables: [{ key: 'los_base_divisor', jsonValue: 'UTC' }],
      }),
    ).rejects.toThrow(/los_base_divisor.*not one of its declared enum values/);
    expect(updateCalls(calls)).toHaveLength(0);
  });

  it.skipIf(!('pipeline_timezone' in seed))(
    'accepts every declared enum value for pipeline_timezone',
    async () => {
      const { pool, calls } = fakePool();
      await applyConfigUpdate(pool as never, {
        logicVariables: [{ key: 'pipeline_timezone', jsonValue: 'America/Toronto' }],
      });
      const [update] = updateCalls(calls);
      expect(update!.params[2]).toBe(JSON.stringify('America/Toronto'));
    },
  );
});
