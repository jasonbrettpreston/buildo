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
// GREEN control (U1b): `snapshot_date` stays bound to the server-side `CURRENT_DATE`
// literal, unchanged — only `created_at` moves to the bound run clock.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS compute module (no DB, no network)
const compute = require(join(process.cwd(), 'scripts/lib/compute/refresh-snapshot.js')) as {
  buildWriteSql: (row: Record<string, unknown>, runAt?: unknown) => { sql: string; params: unknown[] };
};

describe('refresh_snapshot compute — U1: created_at binds the run clock (never NOW())', () => {
  // U1a — RED today: the run clock is a BOUND parameter, last in `params`, and the SQL
  // carries no NOW() anywhere; the INSERT column list and the ON CONFLICT SET clause both
  // reference the same `$N::timestamptz` placeholder.
  it('U1a: binds the run clock for created_at and emits no NOW()', () => {
    const runAt = new Date('2026-10-04T12:00:00Z');
    const { sql, params } = compute.buildWriteSql({}, runAt);

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

  // U1b — GREEN control: `snapshot_date` is untouched — still the server-side
  // CURRENT_DATE literal (its own server-clock semantics are out of U1's scope).
  it('U1b: snapshot_date still binds the server-side CURRENT_DATE literal (unchanged)', () => {
    const runAt = new Date('2026-10-04T12:00:00Z');
    const { sql } = compute.buildWriteSql({}, runAt);

    expect(sql).toContain('CURRENT_DATE');
  });

  // U1c — RED today: fail closed. A missing run clock is a loud error, never a silent
  // fallback to NOW() (LG-9: not guarded, so the bound value MUST be present).
  it('U1c: throws on a missing run clock — never falls back to NOW()', () => {
    expect(() => compute.buildWriteSql({})).toThrow(/run clock/i);
  });
});
