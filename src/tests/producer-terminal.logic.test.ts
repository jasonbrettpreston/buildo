// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-CB / R-BZ G1
//
// S1-P-4b — `producer()` grows the `'terminal'` status alias (R-CB: a
// verdict / activity read declares its wider CLOSED set, while the default
// stays the R-BG(iv) two-status baseline) and the neutral `audit_outcome`
// field (a compute may not spell the property `verdict` — R-BZ G1,
// ast-grep `compute-no-verdict-derivation`). These tests drive the REAL
// producer against a fake pool whose `query` records its params, so a
// producer that stops forwarding the frozen terminal list, that lets the
// alias leak a raw string to `readRunHistory`, that swallows the resulting
// ERROR (it must NEVER throw), or that re-derives (rather than passes
// through verbatim) the run's own audit verdict fails here.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Producer = (slug: string, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
type ProducerLib = {
  makeProducer: (deps: { pool: unknown; chains?: string[] }) => Producer;
  TERMINAL_STATUSES: readonly string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module under test
const lib: ProducerLib = require(join(process.cwd(), 'scripts/lib/step/producer'));

const TERMINAL = ['completed', 'completed_with_warnings', 'completed_with_errors', 'failed', 'crashed', 'cancelled'];

/** A pool whose `query` records every call, returning `rows` (the ONE projection the producer reads). */
function makePool(rows: unknown[] = []) {
  const query = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows }));
  return { pool: { query }, query };
}

/** The params `readRunHistory` bound for its ONE query: `[forms, [...statuses], limit]`. */
function boundStatuses(query: ReturnType<typeof vi.fn>): unknown {
  expect(query).toHaveBeenCalledTimes(1);
  return (query.mock.calls[0]![1] as unknown[])[1];
}

describe('producer — the `terminal` status alias (R-CB)', () => {
  it("expands statuses: 'terminal' to the frozen six-status set at $2", async () => {
    const { pool, query } = makePool([]);
    await lib.makeProducer({ pool, chains: ['sources'] })('x', { statuses: 'terminal' });
    expect(boundStatuses(query)).toEqual(TERMINAL);
  });

  it('leaves the R-BG(iv) baseline default intact when no statuses option is given', async () => {
    const { pool, query } = makePool([]);
    await lib.makeProducer({ pool, chains: ['sources'] })('x', {});
    expect(boundStatuses(query)).toEqual(['completed', 'completed_with_warnings']);
  });

  it('forwards an explicit array verbatim', async () => {
    const { pool, query } = makePool([]);
    await lib.makeProducer({ pool, chains: ['sources'] })('x', { statuses: ['failed'] });
    expect(boundStatuses(query)).toEqual(['failed']);
  });

  it("turns any OTHER string (e.g. 'all') into a caught ERROR, never a throw", async () => {
    const { pool, query } = makePool([]);
    const res = await lib.makeProducer({ pool, chains: ['sources'] })('x', { statuses: 'all' });
    expect(res.reason).toBe('ERROR');
    expect(res.audit_outcome).toBeNull();
    // The rejection came from `readRunHistory` (the ONLY source of this message).
    expect(String(res.error)).toMatch(/statuses/);
    // ...and the bad string never reached the pool as a bound param.
    expect(query).toHaveBeenCalledTimes(0);
  });

  it('TERMINAL_STATUSES is frozen, has length 6, and is the schema pin-statuses enum', () => {
    expect(Object.isFrozen(lib.TERMINAL_STATUSES)).toBe(true);
    expect(lib.TERMINAL_STATUSES).toHaveLength(6);
    expect([...lib.TERMINAL_STATUSES]).toEqual(TERMINAL);

    const schemaPath = join(process.cwd(), 'scripts/steps/_schema/step.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const enumList =
      schema.properties.staleness.properties.pins.items.properties.statuses.items.enum;
    expect(lib.TERMINAL_STATUSES).toEqual(enumList);
  });
});

describe('producer — the `audit_outcome` pass-through (R-BZ G1)', () => {
  const found = { id: 7, status: 'completed_with_errors', records_meta: { audit_table: { verdict: 'FAIL' } } };

  it('passes a FOUND run verdict through verbatim, with sid from the row', async () => {
    const { pool } = makePool([found]);
    const res = await lib.makeProducer({ pool, chains: ['sources'] })('x');
    expect(res.audit_outcome).toBe('FAIL');
    expect(res.sid).toBe(7);
  });

  it('passes a PASS verdict through verbatim', async () => {
    const { pool } = makePool([{ ...found, records_meta: { audit_table: { verdict: 'PASS' } } }]);
    const res = await lib.makeProducer({ pool, chains: ['sources'] })('x');
    expect(res.audit_outcome).toBe('PASS');
  });

  it('is null when records_meta carries no audit_table', async () => {
    const { pool } = makePool([{ ...found, records_meta: {} }]);
    const res = await lib.makeProducer({ pool, chains: ['sources'] })('x');
    expect(res.audit_outcome).toBeNull();
  });

  it('is null when the recorded verdict is not a string (derives nothing)', async () => {
    const { pool } = makePool([{ ...found, records_meta: { audit_table: { verdict: 5 } } }]);
    const res = await lib.makeProducer({ pool, chains: ['sources'] })('x');
    expect(res.audit_outcome).toBeNull();
  });

  it('is null on a MISSING run (no rows)', async () => {
    const { pool } = makePool([]);
    const res = await lib.makeProducer({ pool, chains: ['sources'] })('x');
    expect(res.reason).toBe('MISSING');
    expect(res.audit_outcome).toBeNull();
  });
});
