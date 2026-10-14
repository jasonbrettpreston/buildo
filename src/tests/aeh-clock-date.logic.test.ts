// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-CE
//
// R-CE (operator y 2026-10-12; string-typed var operator y 2026-10-13): "A step
// needing a calendar date derives it from ctx.clock in the zone named by a
// registered logic variable (`pipeline_timezone`), bound as a parameter;
// captured_at binds ctx.clock too; no SQL CURRENT_DATE/NOW() in compute, and the
// zone is never a literal."
//
// The invariants this conversion KEEPS are unchanged and asserted elsewhere: the
// 8 upsert columns + the `IS DISTINCT FROM` guard + `RETURNING xmax`. R-CD moved the
// per-row loop and the non-fatal catch out of compute (no compute-side DML: the compute
// returns a `write_plan` the runner executes). Only the two clock values
// (`snapshot_date`, `captured_at`) change source. These cases pin:
//   (a) UPSERT_SQL carries neither CURRENT_DATE nor NOW(), and derives
//       snapshot_date from the bound clock via the bound zone;
//   (b) buildSnapshotPlan binds exactly the run's clock, epoch ms ($8) and the
//       declared zone ($9) — the zone is a parameter, never a SQL literal;
//   (c) the compute issues no DML and no catch — a write failure is the runner's (R-CD);
//   (d) the descriptor registers `pipeline_timezone` as a string var, schema-enforced;
//   (e) the compute reads `config.pipeline_timezone` — never a zone literal.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS compute module */
const mod = require(
  path.join(process.cwd(), 'scripts/lib/compute/assert-engine-health.js'),
) as {
  UPSERT_SQL: string;
  buildSnapshotPlan: (
    tableResults: Array<Record<string, number | string>>,
    clockMs: number,
    zone: string,
  ) => { table: string; sql: string; rows: Array<Array<number | string>>; report_check: string };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const COMPUTE_REL = 'scripts/lib/compute/assert-engine-health.js';
const DESCRIPTOR_REL = 'scripts/quality/assert-engine-health.descriptor.json';

const CLOCK_MS = Date.parse('2026-10-12T03:07:05.000Z');

/** One discovered table's stats row, as buildTableResults emits them. */
const ENTRY: Record<string, number | string> = {
  table_name: 'parcels',
  n_live_tup: 100,
  n_dead_tup: 5,
  dead_ratio: 0.05,
  seq_scan: 2,
  idx_scan: 20,
  seq_ratio: 0.1,
};

function computeSource(): string {
  return fs.readFileSync(path.join(process.cwd(), COMPUTE_REL), 'utf-8');
}

interface DeclaredVarShape {
  name: string;
  min?: string | number;
  max?: string | number;
  enum?: string[];
  on_invalid?: string;
}

function descriptorConfig(): { logic_variables: DeclaredVarShape[] } {
  const doc = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), DESCRIPTOR_REL), 'utf-8'),
  ) as { config: 'none' | { logic_variables: DeclaredVarShape[] } };
  expect(doc.config, 'the descriptor must declare config').not.toBe('none');
  return doc.config as { logic_variables: DeclaredVarShape[] };
}

describe('assert_engine_health — clock-derived snapshot_date/captured_at (R-CE)', () => {
  it('(a) UPSERT_SQL carries no CURRENT_DATE/NOW() and derives the date from the bound clock+zone ($8, $9)', () => {
    const sql = mod.UPSERT_SQL;
    // No server clock anywhere — the run's own ctx.clock supplies BOTH values.
    expect(sql).not.toContain('CURRENT_DATE');
    expect(sql).not.toContain('NOW()');
    // snapshot_date is derived in the declared zone (a bound parameter via $9); captured_at binds the clock ($8).
    expect(sql).toContain('(to_timestamp($8::float8 / 1000) AT TIME ZONE $9)::date');
    expect(sql).toContain('to_timestamp($8::float8 / 1000))');
    // The DO UPDATE SET refreshes captured_at from the (already clock-derived) excluded row, not NOW().
    expect(sql).toContain('captured_at = EXCLUDED.captured_at');
    // captured_at is a real INSERT column now.
    expect(sql).toContain('seq_ratio, captured_at)');
  });

  it('(b) buildSnapshotPlan binds the clock epoch ms ($8) and the zone ($9) verbatim, once per row', () => {
    const plan = mod.buildSnapshotPlan([ENTRY], CLOCK_MS, 'UTC');

    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toHaveLength(9);
    expect(plan.rows[0]![7]).toBe(CLOCK_MS);
    expect(plan.rows[0]![8]).toBe('UTC');
    expect(plan.sql).toBe(mod.UPSERT_SQL);
    // The zone travels as a PARAMETER (a row value), never baked into the statement text.
    expect(plan.sql).not.toContain('UTC');
    expect(plan.sql).not.toContain('America/Toronto');
  });

  it('(c) the compute issues no DML and no catch - a write failure is the runner\'s (R-CD)', () => {
    const text = computeSource();
    expect(text).not.toContain('writeFailed');
    expect(text).not.toContain('pool.query(UPSERT_SQL');
  });

  it('(d) the descriptor registers pipeline_timezone as a schema-enforced string var (enum + on_invalid fail)', () => {
    const decl = descriptorConfig().logic_variables.find((v) => v.name === 'pipeline_timezone');
    expect(decl, 'descriptor must declare pipeline_timezone').toBeDefined();
    expect(decl!.min).toBe('none');
    expect(decl!.max).toBe('none');
    expect(decl!.enum).toEqual(['UTC', 'America/Toronto']);
    expect(decl!.on_invalid).toBe('fail');
  });

  it('(e) the compute reads config.pipeline_timezone — the zone is never a literal', () => {
    const text = computeSource();
    // The call site binds ctx.clock() (epoch ms, no Date in compute) + the config-supplied zone.
    expect(text).toContain('buildSnapshotPlan(tableResults, ctx.clock(), config.pipeline_timezone)');
    expect(text).not.toContain('new Date(');
    expect(text).toContain('config.pipeline_timezone');
    // No zone name is hardcoded in the compute — it always arrives via config.
    expect(text).not.toContain("'UTC'");
    expect(text).not.toContain('"UTC"');
    expect(text).not.toContain("'America/Toronto'");
    expect(text).not.toContain('"America/Toronto"');
  });
});
