// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CU (one upsert statement binds at most 65,535 parameters)
//
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CU (one upsert statement binds at most 65,535 parameters)
//
// A single statement can never carry more than PostgreSQL's 65,535-parameter wire
// limit. `executeUpsertBatch` used to push EVERY row of the caller's batch into one
// statement, so a LINK whose rows fan out per key overflowed (link_parcel_abutments
// at 1,000 parcels → 67,400 parameters → `bind message has 1864 parameter formats
// but 0 parameters`). The stride below mirrors the INGESTOR precedent in
// `executeWrite` (`pipeline.maxRowsPerInsert(plan.columnsPerRow)`).
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const write = require(join(process.cwd(), 'scripts/lib/step/write.js'));

const POSTGRES_PARAM_LIMIT = 65535;

/**
 * A fake `client` that records the arity of every bound statement and echoes,
 * for each input row, a `RETURNING (xmax = 0)`-shaped row: `is_insert: true` for
 * the first half of the rows, `false` for the rest. Returning rows derived from
 * the bound values (not a caller-supplied literal) keeps `inserted` a measurement.
 */
function makeRecordingClient() {
  const calls: number[] = [];
  // A GLOBAL row index across statements, so "the first half of the input rows" is
  // half of the caller's 7,000 — not half of each stride slice.
  let seenRows = 0;
  const totalRows = 7000;
  const client = {
    calls,
    query: async (_sql: string, values: unknown[]) => {
      calls.push(values.length);
      const rows = [];
      for (let i = 0; i < values.length; i += 10) {
        rows.push({ is_insert: seenRows < Math.floor(totalRows / 2) });
        seenRows += 1;
      }
      return { rows };
    },
  };
  return client;
}

function makePlan(columnsPerRow: number) {
  return {
    columnsPerRow,
    bindRow: (row: { a: number; b: number }) => [
      row.a,
      row.b,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ],
    upsertSqlFor: (n: number) => `SQL with ${n} rows`,
  };
}

const SEVEN_THOUSAND = Array.from({ length: 7000 }, (_, i) => ({ a: i, b: i + 1 }));

describe('executeUpsertBatch — R-CU one upsert statement binds at most 65,535 parameters', () => {
  it('strides 7,000 rows × 10 columns across statements, none over the limit', async () => {
    const client = makeRecordingClient();
    const result = await write.executeUpsertBatch(client, makePlan(10), SEVEN_THOUSAND);

    expect(client.calls.length).toBeGreaterThanOrEqual(2);
    for (const bound of client.calls) {
      expect(bound).toBeLessThanOrEqual(POSTGRES_PARAM_LIMIT);
    }
    const totalBound = client.calls.reduce((sum, n) => sum + n, 0);
    expect(totalBound).toBe(70000);

    expect(result.inserted + result.updated).toBe(7000);
    expect(result.inserted).toBe(3500);
  });

  it('issues exactly one statement for 100 rows (no behaviour change below the limit)', async () => {
    const client = makeRecordingClient();
    const rows = Array.from({ length: 100 }, (_, i) => ({ a: i, b: i + 1 }));
    const result = await write.executeUpsertBatch(client, makePlan(10), rows);

    expect(client.calls.length).toBe(1);
    expect(client.calls[0]).toBe(1000);
    expect(result.inserted + result.updated).toBe(100);
  });

  it('issues no statement for 0 rows and returns the empty shape', async () => {
    const client = makeRecordingClient();
    const result = await write.executeUpsertBatch(client, makePlan(10), []);

    expect(client.calls.length).toBe(0);
    expect(result).toEqual({ inserted: 0, updated: 0 });
  });
});
