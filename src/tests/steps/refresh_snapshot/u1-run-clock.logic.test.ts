// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (columns[].source run_at); Spec 47 §R3.5; FLEET-2 ASSEMBLY 2.13 (U1)
//
// FLEET-2 A-4 U1 — the run clock binds `created_at`. The seat's `created_at` column
// is declared `source: "run_at"` (not guarded, LG-9): the value IS the run clock
// (`pipeline.getDbTimestamp`, Spec 47 R3.5), so the compute must bind it as a
// parameter instead of emitting the server-side `NOW()` default. The runner already
// captures the clock ONCE and passes it in: `compute.buildWriteSql(assembled.row, clockNow)`
// (scripts/lib/step/index.js runRecorderPhase).
//
// RED today (U1a, U1c): the compute still authors `created_at=NOW()` and takes no runAt.
// U1b (CP-PLANA, R-CE): `snapshot_date` is the bound run clock's date in the bound
// `pipeline_timezone` — the server-side `CURRENT_DATE` is gone too.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS compute module (no DB, no network)
const compute = require(join(process.cwd(), 'scripts/lib/compute/refresh-snapshot.js')) as {
  buildWriteSql: (row: Record<string, unknown>, runAt?: unknown, config?: Record<string, unknown>) => { sql: string; params: unknown[] };
};

/** CP-PLANA (R-CE): snapshot_date's zone is the resolved `pipeline_timezone` logic variable. */
const CFG = { pipeline_timezone: 'UTC' };

describe('refresh_snapshot compute — U1: created_at binds the run clock (never NOW())', () => {
  // U1a — RED today: the run clock is a BOUND parameter, last in `params`, and the SQL
  // carries no NOW() anywhere; the INSERT column list and the ON CONFLICT SET clause both
  // reference the same `$N::timestamptz` placeholder.
  it('U1a: binds the run clock for created_at and emits no NOW()', () => {
    const runAt = new Date('2026-10-04T12:00:00Z');
    const { sql, params } = compute.buildWriteSql({}, runAt, CFG);

    // no server-side clock default survives anywhere in the statement
    expect(sql).not.toMatch(/NOW\(\)/i);

    // the run clock rides as the LAST bound parameter, verbatim (same Date instance)
    expect(params[params.length - 1]).toBe(runAt);

    const runAtParam = `$${params.length}::timestamptz`;

    // ON CONFLICT (snapshot_date) DO UPDATE SET ... created_at=$N::timestamptz
    expect(sql).toContain(`created_at=${runAtParam}`);

    // the INSERT column list names created_at, and its VALUES list binds the same placeholder
    const insertPart = sql.slice(0, sql.indexOf('ON CONFLICT'));
    expect(insertPart).toContain('created_at');
    expect(insertPart).toContain(runAtParam);
  });

  // U1b — CP-PLANA (Spec 124 R-BZ G6 + R-CE): `snapshot_date` is the run clock's calendar
  // date in the declared `pipeline_timezone`, both bound — the server-side CURRENT_DATE is gone.
  it('U1b: snapshot_date is the bound run clock in the bound pipeline_timezone — never CURRENT_DATE', () => {
    const runAt = new Date('2026-10-04T12:00:00Z');
    const { sql, params } = compute.buildWriteSql({}, runAt, CFG);

    expect(sql).not.toMatch(/CURRENT_DATE/i);
    const runAtParam = `$${params.length}::timestamptz`;
    const zoneParam = `$${params.length - 1}`;
    expect(params[params.length - 2]).toBe('UTC');
    expect(sql).toContain(`(${runAtParam} AT TIME ZONE ${zoneParam})::date`);
    // fail closed: no zone ⇒ a loud error, never a literal or session-zone fallback
    expect(() => compute.buildWriteSql({}, runAt, {})).toThrow(/pipeline_timezone/);
  });

  // U1c — RED today: fail closed. A missing run clock is a loud error, never a silent
  // fallback to NOW() (LG-9: not guarded, so the bound value MUST be present).
  it('U1c: throws on a missing run clock — never falls back to NOW()', () => {
    expect(() => compute.buildWriteSql({})).toThrow(/run clock/i);
  });
});
