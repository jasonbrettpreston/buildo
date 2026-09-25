// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, RE-FREEZE #20; docs/specs/01-pipeline/124_step_standard_policy.md Rules 8/9/12
//
// WF3 (2026-09-24) — `buildWritePlan` refuses the class-C `staging_full_replace` whole-table
// replace. `load_centreline` (the FIRST class-C step, batch-2 row 3.2 ②) declares
// `retract:"all"` + `scope:"none"` — EXACTLY the shape `step.schema.json`'s class-C x-rule
// sanctions ("full_replace must be declared, never silent", Spec 62 L26, and the
// `grandfathered.json` entry lands with that descriptor). The pre-existing guard at
// `write.js`'s `if (retract === 'all' && !scope)` predates class C (0h, RE-FREEZE #20) and
// threw "would DELETE THE WHOLE TABLE" on it, blocking that step before its first write.
//
// The class-C executor `executeStagingReplace` never reads `plan.delete_sql`: it issues its
// OWN `DELETE FROM <table>` inside ONE `pipeline.withTransaction`, behind the empty-set
// guard. So the exemption is keyed on the DECLARED class (never a step name, Spec 124 Rule 8
// / Spec 122 §5.1) and `plan.delete_sql` for class C is the truthful, unconditional
// `DELETE FROM <table>` a reset generator reads — never a `WHERE undefined` fragment.
//
// A NEW file, never appended to the 7,200-line `step-library.logic.test.ts`. Its stub
// helpers (`clone`, the fake pool) are copied from `ingest-prereq-0t.logic.test.ts` /
// `step-library.logic.test.ts`, never imported.
import { describe, expect, it, vi } from 'vitest';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const pipeline = require(path.join(process.cwd(), 'scripts/lib/pipeline.js'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const LINK_PARCELS = require(path.join(process.cwd(), 'scripts/link-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

const log = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });

/** Whitespace-normalise a statement so a plan's text is asserted on MEANING, not layout. */
const norm = (sql: unknown): string => String(sql).trim().replace(/\s+/g, ' ');

/**
 * `load-ravines`' declared write (class B, `retract:"departed"`, `scope:"none"`) — the
 * base every spec below is DERIVED from, never hand-built, so a test cannot accidentally
 * declare a shape no descriptor could carry.
 */
const baseSpec = () => clone(LOAD_RAVINES.outputs.writes[0]) as {
  table: string;
  write_discipline: { class: string; scope?: string; guard?: string; guard_columns?: string[] };
  retract: string;
  [k: string]: unknown;
};

/**
 * A fake pool matching `pipeline.withTransaction`'s contract (`pool.connect()` →
 * `{query, release}`), recording every statement/params pair — the same shape
 * `stagingPool` uses in `step-library.logic.test.ts`'s own class-C locks.
 */
function stagingPool({ deleteRowCount = 0, insertSelectRowCount = 0 } = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const statement = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    if (/^DELETE FROM ravines\b/i.test(text)) return { rows: [], rowCount: deleteRowCount };
    if (/^INSERT INTO ravines \(/i.test(text)) return { rows: [], rowCount: insertSelectRowCount };
    return { rows: [], rowCount: 0 };
  };
  return { sql, params, connect: async () => ({ query: statement, release: () => {} }) };
}

describe('buildWritePlan — the retract-all/no-scope guard EXEMPTS class C only (WF3, Spec 122 §1.4 RE-FREEZE #20)', () => {
  // -------------------------------------------------------------------------
  // T1 — the class-C declaration `load_centreline` will make actually plans.
  // RED today: `buildWritePlan` throws "would DELETE THE WHOLE TABLE".
  // -------------------------------------------------------------------------
  it('T1 — class C + retract "all" + scope "none": the plan is BUILT, and delete_sql is the unconditional DELETE FROM <table>', () => {
    const spec = baseSpec();
    spec.write_discipline.class = writeLib.STAGING_FULL_REPLACE_CLASS;
    spec.write_discipline.scope = 'none';
    spec.retract = 'all';

    // The premise: absent a class exemption this shape throws (that IS the bug). The
    // declaration itself is what class C's schema x-rule sanctions.
    expect(writeLib.STAGING_FULL_REPLACE_CLASS).toBe('staging_full_replace');

    const plan = writeLib.buildWritePlan(spec, LOAD_RAVINES);
    expect(plan.mechanic).toBe('staging_full_replace');
    expect(plan.scope, 'scope "none" is a DECLARED none, carried as null').toBeNull();
    expect(plan.retract).toBe('all');
    // RED value: today this is `DELETE FROM ravines WHERE null;` — never reached, because
    // the throw fires first. GREEN value: an unconditional, truthful wipe description.
    expect(norm(plan.delete_sql)).toBe('DELETE FROM ravines;');
    expect(norm(plan.delete_sql)).not.toMatch(/WHERE/i);
  });

  it('T1b — the SAME spec at class A/B is still refused (the exemption is class-keyed, never name- or table-keyed)', () => {
    for (const cls of ['guarded_upsert', 'upsert_scoped_departure_delete']) {
      const spec = baseSpec();
      spec.write_discipline.class = cls;
      spec.write_discipline.scope = 'none';
      spec.retract = 'all';
      expect(() => writeLib.buildWritePlan(spec, LOAD_RAVINES), `${cls} must still be refused`).toThrow(
        /DELETE THE WHOLE TABLE/,
      );
    }
  });

  // -------------------------------------------------------------------------
  // T2 — the guard is INTACT for the class it was written for.
  // GREEN both sides: this passed before this WF3 and must still pass after.
  // -------------------------------------------------------------------------
  it('T2 — guarded_upsert + retract "all" + no scope: the throw is unchanged, word for word', () => {
    const spec = baseSpec();
    spec.write_discipline.class = 'guarded_upsert';
    spec.write_discipline.scope = 'none';
    spec.retract = 'all';
    spec.write_discipline.guard = 'is_distinct_from';
    spec.write_discipline.guard_columns = ['geom', 'source_dataset_version'];

    expect(() => writeLib.buildWritePlan(spec, LOAD_RAVINES)).toThrow(/DELETE THE WHOLE TABLE/);
  });

  // -------------------------------------------------------------------------
  // T3 — a SECOND non-class-C class that legitimately accepts `retract:"all"`.
  // `link_full_retraction` (link_parcels' permit_parcels target) exists in the
  // schema for a scoped full retraction, so it is the sharpest control: the guard
  // discriminates by CLASS, not by "does any class accept retract all at all".
  // GREEN both sides.
  // -------------------------------------------------------------------------
  it('T3 — link_full_retraction + retract "all" + no scope: still throws; with a scope it plans a SCOPED delete', () => {
    const base = clone(LINK_PARCELS.outputs.writes[1]) as {
      table: string;
      write_discipline: { class: string; scope?: string };
      retract: string;
      [k: string]: unknown;
    };
    expect(base.write_discipline.class, 'the control must name a real, different class').toBe('link_full_retraction');
    base.retract = 'all';

    base.write_discipline.scope = 'none';
    expect(() => writeLib.buildWritePlan(base, LINK_PARCELS)).toThrow(/DELETE THE WHOLE TABLE/);

    // …and the SCOPED direction is unaffected by this guard at all: `link_full_retraction`
    // (class F) is DESCRIPTIVE ONLY — `delete_sql` stays `null` regardless of scope, because
    // the keyed-DELETE statement is authored by the compute (`buildDeleteByKeySql`), not by
    // `buildWritePlan` [READ write.js:941-960]. The guard simply does not fire once a scope
    // is declared, so the plan builds — proving the exemption is CLASS-keyed, not a general
    // "any retract:all needs a scope" relaxation.
    const scoped = clone(base);
    scoped.write_discipline.scope = "match_type = 'spatial'";
    const plan = writeLib.buildWritePlan(scoped, LINK_PARCELS);
    expect(plan.mechanic).toBe('link_full_retraction');
    expect(plan.delete_sql).toBeNull();
    expect(plan.generated_by).toBe('compute');
  });

  it('T3b — a scoped retract-all class-B plan is byte-identical to pre-WF3 (the class-C branch is not on its path)', () => {
    const spec = clone(LINK_PARCELS.outputs.writes[0]) as {
      write_discipline: { class: string; scope: string };
      retract: string;
      [k: string]: unknown;
    };
    expect(spec.write_discipline.class).toBe('guarded_upsert');
    expect(spec.retract).toBe('all');
    const plan = writeLib.buildWritePlan(spec, LINK_PARCELS);
    expect(norm(plan.delete_sql)).toBe(`DELETE FROM ${spec.table} WHERE ${spec.write_discipline.scope};`);
    expect(plan.delete_sql).not.toMatch(/^\s*DELETE FROM \w+;\s*$/);
  });

  // -------------------------------------------------------------------------
  // T4 — the class-C plan's delete_sql is never EXECUTED by the executor.
  // Proved structurally rather than by text-matching: the plan object handed to
  // `executeStagingReplace` is made to THROW on any read of `delete_sql`, so a
  // silent `plan.delete_sql` read anywhere in the executor's own call tree is a
  // failure, not a coincidence of statement text. RED today: unreachable, because
  // T1's `buildWritePlan` call threw before this point.
  // -------------------------------------------------------------------------
  it('T4 — executeStagingReplace issues its OWN DELETE FROM <table> and NEVER reads plan.delete_sql', async () => {
    const spec = baseSpec();
    spec.write_discipline.class = writeLib.STAGING_FULL_REPLACE_CLASS;
    spec.write_discipline.scope = 'none';
    spec.retract = 'all';
    const realPlan = writeLib.buildWritePlan(spec, LOAD_RAVINES);

    let deleteSqlReads = 0;
    const guardedPlan = Object.defineProperty({ ...realPlan }, 'delete_sql', {
      enumerable: true,
      configurable: true,
      get() {
        deleteSqlReads += 1;
        throw new Error('executeStagingReplace must not read plan.delete_sql — the wipe is its own statement');
      },
    });

    const carried = [{ source_id: 101, geom: '\\\\x00' }, { source_id: 102, geom: '\\\\x00' }];
    const pool = stagingPool({ deleteRowCount: 2, insertSelectRowCount: 2 });
    const written = await writeLib.executeStagingReplace(pool, {
      plan: guardedPlan,
      writeSpec: spec,
      carried,
      columnValues: (row: Record<string, unknown>) => ({ ...row, source_dataset_version: 3, updated_at: 'now' }),
      prior: null,
      log: log(),
      tag: 'load_centreline',
    });

    expect(deleteSqlReads, 'nothing on the executor path may read the descriptive statement').toBe(0);
    expect(written.rows_before).toBe(2);
    expect(written.replace_skipped_empty_guard).toBe(false);

    // The DELETE that DID run is the executor's own text (a bare `DELETE FROM <table>;`),
    // never the plan's field — and no recorded statement is the plan's own text unless the
    // executor authored it itself.
    const deletes = pool.sql.filter((s) => /^\s*DELETE/i.test(s.trim()));
    expect(deletes).toHaveLength(1);
    expect(norm(deletes[0])).toBe(`DELETE FROM ${spec.table};`);
    // The executor's own DELETE text happens to equal the plan's descriptive `delete_sql`
    // (both are the truthful unconditional wipe) — but T4's real proof is `deleteSqlReads`
    // above: the executor never actually reads `plan.delete_sql` to produce it.
    expect(norm(deletes[0])).toBe(norm(realPlan.delete_sql));
  });

  it('T4b — the empty-set guard still short-circuits BEFORE any DELETE (the class-C safety lock is untouched)', async () => {
    const spec = baseSpec();
    spec.write_discipline.class = writeLib.STAGING_FULL_REPLACE_CLASS;
    spec.write_discipline.scope = 'none';
    spec.retract = 'all';
    const plan = writeLib.buildWritePlan(spec, LOAD_RAVINES);

    const pool = stagingPool({ deleteRowCount: 999, insertSelectRowCount: 999 });
    const l = log();
    const written = await writeLib.executeStagingReplace(pool, {
      plan,
      writeSpec: spec,
      carried: [],
      columnValues: (row: Record<string, unknown>) => row,
      prior: null,
      log: l,
      tag: 'load_centreline',
    });
    expect(written.replace_skipped_empty_guard).toBe(true);
    expect(pool.sql.some((s) => /^\s*DELETE/i.test(s.trim()))).toBe(false);
    expect(l.warn).toHaveBeenCalledTimes(1);
  });

  it('T5 — AJV: the class-C declaration with retract "all" + scope "none" is schema-VALID (the guard, not the schema, was the blocker)', () => {
    const d = clone(LOAD_RAVINES) as {
      outputs: { writes: Array<Record<string, unknown>> };
      recovery?: Record<string, unknown>;
    };
    const w = d.outputs.writes[0]!;
    (w.write_discipline as Record<string, unknown>).class = writeLib.STAGING_FULL_REPLACE_CLASS;
    (w.write_discipline as Record<string, unknown>).scope = 'none';
    w.retract = 'all';
    d.recovery = { ...(d.recovery ?? {}), interrupted: 'force_full_on_next_run' };
    expect(() => pipeline.step(d, async () => {})).not.toThrow();
  });
});
