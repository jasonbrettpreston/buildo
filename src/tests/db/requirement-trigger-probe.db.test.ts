// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4 / §6.6 (LDG-10 class 4, T3 db half)
// SPEC LINK: migrations/245_parcels_centroid_geom_invalidation.sql (the live trigger this probes)
//
// LDG-10 T3 — the `trigger` requirement probe against a REAL catalog. The file-only half (T14,
// src/tests/cloud-pre-dispatch.logic.test.ts) locks the SQL text; this half proves that SQL answers
// correctly on Postgres: the live parcels.trg_parcels_geom_invalidation reads present, the SAME
// trigger DISABLED inside a rolled-back transaction reads absent, and an unknown trigger reads absent.
// Read-only apart from the ALTER inside BEGIN … ROLLBACK (nothing persists).
// MQ-D3 (a): the probe also checks the live function BODY for every outputs.invalidates[] by:"trigger" column (a missing NEW.<col> := NULL arm is refused; R-BF, Rule 1).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/requirement-trigger-probe.db.test.ts --no-file-parallelism

import { describe, it, expect } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { probeRequirement, assertRequirements } = require('../../../scripts/lib/step/index.js') as {
  probeRequirement: (pool: unknown, requirement: Record<string, unknown>, descriptor?: unknown) => Promise<{ present: boolean; detail: string }>;
  assertRequirements: (pool: unknown, descriptor: unknown, opts: { log: { warn: () => void }; tag: string }) => Promise<Record<string, boolean>>;
};

const pool = getTestPool();
const REQ = { kind: 'trigger', name: 'parcels.trg_parcels_geom_invalidation', on_missing: 'fail' };

describe.skipIf(!dbAvailable())('LDG-10 T3 — REQUIREMENT_PROBES.trigger against the live catalog', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  it('GREEN: the live parcels.trg_parcels_geom_invalidation (migrations 242/245) reads present', async () => {
    expect((await probeRequirement(pool, REQ)).present).toBe(true);
  });

  it('RED: the same trigger DISABLED (inside a rolled-back txn) reads absent', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE parcels DISABLE TRIGGER trg_parcels_geom_invalidation');
      expect((await probeRequirement(client, REQ)).present).toBe(false);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect((await probeRequirement(pool, REQ)).present).toBe(true);
  });

  it('RED: an unknown trigger name reads absent', async () => {
    expect((await probeRequirement(pool, { ...REQ, name: 'parcels.trg_does_not_exist' })).present).toBe(false);
  });

  // MQ-D3 (a) — a throwaway trigger inside a rolled-back txn proves the function-BODY arm check: with
  // every declared NEW.<col> := NULL arm the probe reads present, without one it is refused.
  async function withProbeTrigger(
    body: string,
    fn: (client: { query: (sql: string, v?: unknown[]) => Promise<unknown> }) => Promise<void>,
  ) {
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TABLE t3_probe_tbl (id int, stamp_col timestamptz, other_col timestamptz)');
      await client.query(`CREATE FUNCTION t3_probe_fn() RETURNS trigger LANGUAGE plpgsql AS $fn$ ${body} $fn$`);
      await client.query('CREATE TRIGGER t3_probe_trg BEFORE UPDATE ON t3_probe_tbl FOR EACH ROW EXECUTE FUNCTION t3_probe_fn()');
      await fn(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  const PROBE_REQ = { kind: 'trigger', name: 't3_probe_tbl.t3_probe_trg', on_missing: 'fail' };
  const probeDescriptor = {
    guards: { requires: [PROBE_REQ] },
    outputs: {
      invalidates: [
        { table: 't3_probe_tbl', column: 'stamp_col', when: 'x', by: 'trigger', trigger: 't3_probe_tbl.t3_probe_trg' },
        { table: 't3_probe_tbl', column: 'other_col', when: 'x', by: 'trigger', trigger: 't3_probe_tbl.t3_probe_trg' },
      ],
    },
  };
  const log = { warn: () => {} };

  it('T3-D3a GREEN: a live function WITH every declared NEW.<col> := NULL arm reads present', async () => {
    await withProbeTrigger('BEGIN NEW.stamp_col := NULL; NEW.other_col := NULL; RETURN NEW; END;', async (client) => {
      expect((await probeRequirement(client, PROBE_REQ, probeDescriptor)).present).toBe(true);
      await expect(assertRequirements(client, probeDescriptor, { log, tag: '[t3]' }))
        .resolves.toEqual({ 't3_probe_tbl.t3_probe_trg': true });
    });
  });

  it('T3-D3b RED: a live function MISSING one declared arm is refused (detail names the column)', async () => {
    await withProbeTrigger('BEGIN NEW.stamp_col := NULL; RETURN NEW; END;', async (client) => {
      const res = await probeRequirement(client, PROBE_REQ, probeDescriptor);
      expect(res.present).toBe(false);
      expect(res.detail).toContain('other_col');
      await expect(assertRequirements(client, probeDescriptor, { log, tag: '[t3]' }))
        .rejects.toThrow(/required trigger "t3_probe_tbl\.t3_probe_trg" is ABSENT/);
    });
  });

  it('T3-D3c RED: a declared arm that is COMMENTED OUT is still refused', async () => {
    await withProbeTrigger('BEGIN NEW.stamp_col := NULL; -- NEW.other_col := NULL;\n RETURN NEW; END;', async (client) => {
      expect((await probeRequirement(client, PROBE_REQ, probeDescriptor)).present).toBe(false);
    });
  });

  it('T3-D3d: with no by:"trigger" invalidates[] column the check is presence only', async () => {
    await withProbeTrigger('BEGIN NEW.stamp_col := NULL; NEW.other_col := NULL; RETURN NEW; END;', async (client) => {
      const res = await probeRequirement(client, PROBE_REQ, { guards: { requires: [PROBE_REQ] } });
      expect(res.present).toBe(true);
      expect(res.detail).toContain('presence only');
    });
  });

  it('T3-D3e GREEN: the live parcels trigger stamps its declared columns in the real body (migrations 242/245)', async () => {
    // NOTE: the heritage/ravine stamp columns need migration 249, so those descriptors are NOT asserted here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parcelsDescriptor = require('../../../scripts/enrich-parcels.descriptor.json') as unknown;
    expect((await probeRequirement(pool, REQ, parcelsDescriptor)).present).toBe(true);
  });
});
