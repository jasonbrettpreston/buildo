// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1; O4 row 1 (registry-truth fold 14) — LN-D4 full_rescan
//
// O4 row 1 — LN-D4 full_rescan. The INVALIDATOR-LIST ruling (.cursor/o4-no-invalidator-list-2026-10-03.md,
// registry-truth fold 14) widens link_neighbourhoods from "stamp only the NULL rows" to a FULL RESCAN:
// every geocoded permit is re-derived every run, and the write is guarded IS DISTINCT FROM so only real
// changes are written. A stamped permit that no longer has coordinates, or no longer falls inside any
// polygon, is NULLed (the NULL-out arm reaches stamped permits, not just NULL ones). It stays ONE
// statement (execution.txn_scope: "statement", executed by write.executeSetBasedJoinUpdate, which refuses
// INSERT/ON CONFLICT) — no batch loop, no INSERT, no ON CONFLICT.
//
// N1 is the scope lock (the incremental `neighbourhood_id IS NULL` conjunct is gone; the coordinate-
// bearing predicate stays). N2 is the statement-shape lock (guarded, deterministic, NULL-out-arm-capable,
// INSERT-free). N3 pins full_rescan as a property of the STATEMENT, not a mode branch (identical text for
// 'incremental' and 'full'). N4/N5 are GREEN controls that must survive the scope change untouched.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports */
const compute = require(join(process.cwd(), 'scripts/lib/compute/link-neighbourhoods.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/link-neighbourhoods.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const CORPUS_FILTER = compute.CORPUS_FILTER;

describe('O4 row 1 — link_neighbourhoods LN-D4 full_rescan', () => {
  // N1 — RED today: ELIGIBLE_SCOPE still carries `p.neighbourhood_id IS NULL`, which is the incremental
  // conjunct that makes a run touch only arrivals. full_rescan drops it; the coordinate predicate is what
  // makes NULLing a no-longer-geocodable permit reachable.
  it('N1 (RED) — ELIGIBLE_SCOPE drops `neighbourhood_id IS NULL`, keeps the coordinate predicate', () => {
    expect(compute.ELIGIBLE_SCOPE).not.toContain('neighbourhood_id IS NULL');
    expect(compute.ELIGIBLE_SCOPE).toContain('p.latitude IS NOT NULL');
    expect(compute.ELIGIBLE_SCOPE).toContain('p.longitude IS NOT NULL');
  });

  // N2 — RED today: the statement is the incremental, unguarded-scope port. full_rescan's write must be
  // scoped to geography (not to `IS NULL`), change-guarded, deterministic when polygons overlap, able to
  // reach a stamped permit that no longer falls in any polygon, and INSERT-free.
  it('N2 (RED) — update_sql is the guarded, deterministic, full-rescan set-based join UPDATE', () => {
    const { update_sql: sql } = compute.buildMatchSql(DESCRIPTOR, null, 'incremental');
    // Starts from the one statement's own head — no wrapper, no CTE prefix.
    expect(sql.startsWith('UPDATE permits p SET neighbourhood_id')).toBe(true);
    // The change guard: only real changes are written.
    expect(sql).toContain('IS DISTINCT FROM');
    // The incremental conjunct is gone — the write is scoped by geography, not by "no value yet".
    expect(sql).not.toContain('neighbourhood_id IS NULL');
    // Deterministic pick when more than one polygon contains the point.
    expect(sql).toContain('ORDER BY n.id');
    expect(sql).toContain('LIMIT 1');
    // The NULL-out arm: a stamped permit (neighbourhood_id IS NOT NULL) with no coordinates is reachable.
    expect(sql).toContain('neighbourhood_id IS NOT NULL');
    // The write reports what it touched; executeSetBasedJoinUpdate reads rowCount.
    expect(sql).toContain('RETURNING p.permit_num');
    // executeSetBasedJoinUpdate REFUSES INSERT/ON CONFLICT — the statement must stay UPDATE ... FROM.
    expect(sql).not.toContain('INSERT');
    expect(sql).not.toContain('ON CONFLICT');
    // SRID still sourced from the descriptor (Rule 3), not a bare interpolated literal.
    expect(sql).toContain(', 4326)');
  });

  // N3 — RED today: full_rescan has NO mode branch. A caller resolving 'full' must get the identical
  // statement, so `override.force_full`/`mode_select` cannot silently resurrect the old incremental text.
  it('N3 (RED) — update_sql is mode-invariant (full_rescan is a property of the statement, not a mode branch)', () => {
    const incr = compute.buildMatchSql(DESCRIPTOR, null, 'incremental').update_sql;
    const full = compute.buildMatchSql(DESCRIPTOR, null, 'full').update_sql;
    expect(incr).toBe(full);
  });

  // N4 — GREEN control: the polygon corpus read is a separate pre-write statement and must not move.
  it('N4 (GREEN) — corpus_sql still counts the geom-bearing neighbourhood corpus', () => {
    const { corpus_sql: sql } = compute.buildMatchSql(DESCRIPTOR, null, 'incremental');
    expect(sql).toBe(`SELECT count(*)::int AS n FROM neighbourhoods WHERE ${CORPUS_FILTER};`);
  });

  // N5 — GREEN control: the post-write cumulative round trip (the observed population) survives the scope
  // change intact — `AS linked` and the no-match remainder are still reported by this ONE query.
  it('N5 (GREEN) — cumulative_sql still reports the observed post-write population', () => {
    const { cumulative_sql: sql } = compute.buildMatchSql(DESCRIPTOR, null, 'incremental');
    expect(sql).toContain('AS no_match_remaining');
    expect(sql).toContain('AS linked');
  });
});
