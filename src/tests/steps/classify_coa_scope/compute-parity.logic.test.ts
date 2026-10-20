// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ), Rule 9, R-DF, R-ER; W4A-R4
//
// Phase-4 wave 4, classify_coa_scope commit ② (compressed form). The pure compute
// `scripts/lib/compute/classify-coa-scope.js` is EXECUTED through fake runner seams (ctx.stream / ctx.flushBatch /
// ctx.clock) on the same source rows the frozen legacy text is executed on (./fixtures/legacy-harness), and must:
//   P1 stream the same pending cursor (no params);
//   P2 write the same rows with the same bound values (the four classifier columns, then the run clock last), in
//      the same 1000-row batches, through the legacy statement itself — unguarded, so no row the legacy UPDATE wrote
//      is skipped (guard "none", Spec 124 Rule 9 / V7, grandfathered; 124a §B14);
//   P3 count records_updated as the SUM of the flushes' rowCounts (WF3 BUG-1) and the same per-run counters;
//   P4 grade unmapped_scope_pct with the real library verdict exactly where the legacy row decided (inclusive).
import { describe, it, expect } from 'vitest';
import path from 'path';

import { loadLegacy, type SourceRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
type Pass = { scanned: number; updated: number; counts: Record<string, number>; projectTypeDist: Record<string, number>; coaTypeClassDist: Record<string, number> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/classify-coa-scope.js')) as ((ctx: unknown) => Promise<{ records_meta: Record<string, unknown> }>) & {
  buildSourceSql(): string;
  runClassifyPass(client: unknown, ctx: unknown): Promise<Pass>;
  computePostPhase(pool: unknown, a: { passRaw: Record<string, Pass> }): { matched: Record<string, unknown>; compute: Record<string, number> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdictLib = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  buildAuditTable(d: unknown, chain: string | null, obs: Record<string, unknown>, extra: unknown[], config: Record<string, number> | null): { audit_table: { verdict: string; rows: { metric: string; value: unknown; status: string }[] } };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require(path.join(REPO_ROOT, 'scripts/classify-coa-scope.descriptor.json')) as { checks: { id: string }[] };

const RUN_AT = new Date('2026-10-19T12:00:00Z');
const DESC = [
  'To construct a rear two-storey addition to the existing detached dwelling.',
  'To sever the property into two undersized residential lots.',
  'Zzzz qqqq.',
  'To alter the existing restaurant and add a rear patio.',
  'To construct a new three-storey semi-detached dwelling with a garage.',
];
function rows(n: number): SourceRow[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, description: DESC[i % DESC.length] ?? null, status: 'Closed', decision: 'Approved' }));
}

async function converted(src: SourceRow[], rowCountFor: (n: number) => number = (n) => n) {
  const streamed: { sql: string; params: unknown[] }[] = [];
  const flushed: { sql: string; params: unknown[] }[] = [];
  const ctx = {
    config: { classify_coa_scope_batch_size: 1000, classify_coa_scope_unmapped_max_pct: 10 },
    clock: { now: () => RUN_AT },
    async *stream(sql: string, params: unknown[]) {
      streamed.push({ sql, params });
      for (const r of src) yield r;
    },
    async flushBatch(sql: string, params: unknown[]) {
      flushed.push({ sql, params });
      return { rowCount: rowCountFor((params.length - 1) / 5) };
    },
  };
  const pass = await compute.runClassifyPass(null, ctx);
  const post = compute.computePostPhase(null, { passRaw: { classify: pass } });
  return { streamed, flushed, pass, post };
}

async function legacy(src: SourceRow[], rowCountFor?: (n: number) => number) {
  const o = loadLegacy({ runAt: RUN_AT, rows: src, ...(rowCountFor ? { rowCountFor } : {}) });
  await o.runMain();
  return o;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('classify_coa_scope ② — the converted compute reproduces the legacy writes and counters', () => {
  it('P1 — the same pending cursor, no params', async () => {
    const o = await legacy(rows(3));
    const c = await converted(rows(3));
    const legacyStream = o.queries.filter((q) => q.via === 'stream');
    expect(c.streamed).toHaveLength(1);
    expect(norm(c.streamed[0]?.sql ?? '')).toBe(norm(legacyStream[0]?.sql ?? ''));
    expect(c.streamed[0]?.params).toEqual([]);
  });

  it('P2 — the same bound values per row and RUN_AT last, the same 1000 + 1 batching; the legacy statement byte-for-byte (unguarded, Rule 9 / V7)', async () => {
    const src = rows(1001);
    const o = await legacy(src);
    const c = await converted(src);
    const legacyUpdates = o.queries.filter((q) => q.via === 'client');
    expect(c.flushed.map((f) => f.params)).toEqual(legacyUpdates.map((q) => q.params));
    const sql = norm(c.flushed[0]?.sql ?? '');
    const legacySql = norm(legacyUpdates[0]?.sql ?? '');
    // guard "none" (grandfathered, the Q-CE2 / Q-W4G-1 form): the converted statement IS the legacy statement, so
    // every streamed row is written and its watermark advances (the legacy :124-131 "No IS DISTINCT FROM guard" fix).
    expect(sql).toBe(legacySql);
    expect(sql).not.toMatch(/IS DISTINCT FROM/);
  });

  it('P3 — records_updated is the SUM of the flushes\' rowCounts, records_total the processed count, and the per-run counters match the legacy records_meta', async () => {
    const src = rows(12);
    const o = await legacy(src, () => 1);
    const c = await converted(src, () => 1);
    const s = o.summaries[0];
    expect(c.post.compute).toMatchObject({ coa_processed: s?.records_total, records_new_aggregate: 0, records_updated_aggregate: s?.records_updated });
    const lm = s?.records_meta as Record<string, unknown>;
    for (const k of ['coa_processed', 'scope_classified', 'unmapped_scope', 'no_class', 'no_project_type', 'structure_typed']) {
      expect(c.post.matched[k], k).toBe(lm[k]);
    }
    const nonZero = (d: unknown) => Object.fromEntries(Object.entries(d as Record<string, number>).filter(([, n]) => n > 0));
    expect(nonZero(c.post.matched.project_type_distribution)).toEqual(lm.project_type_distribution);
    expect(nonZero(c.post.matched.coa_type_class_distribution)).toEqual(lm.coa_type_class_distribution);
  });

  it('P4 — unmapped_scope_pct reads PASS / WARN exactly where the legacy row did (inclusive bound), graded by the real library verdict', async () => {
    // 1 unmapped of 5 = 20 %; of 10 = 10 % (the inclusive boundary); of 20 = 5 %.
    for (const [n, threshold] of [[5, 10], [10, 10], [20, 10], [5, 25]] as const) {
      const src = rows(n).map((r, i) => (i === 2 ? r : { ...r, description: DESC[0] ?? null }));
      const o = loadLegacy({ runAt: RUN_AT, rows: src, logicVars: { coa_scope_unmapped_threshold_pct: threshold } });
      await o.runMain();
      const legacyRow = ((o.summaries[0]?.records_meta as { audit_table: { rows: { metric: string; status: string }[] } }).audit_table.rows).find((r) => r.metric === 'unmapped_scope_count');
      const c = await converted(src);
      const observations: Record<string, unknown> = {};
      await compute({
        descriptor: { identity: { name: 'classify_coa_scope' } },
        checks: descriptor.checks.map((x) => x.id),
        matched: c.post.matched,
        log: { error: () => {} },
        report: (id: string, ob: unknown) => { observations[id] = ob; },
      });
      const table = verdictLib.buildAuditTable(descriptor, 'coa', observations, [], { classify_coa_scope_unmapped_max_pct: threshold, classify_coa_scope_batch_size: 1000 });
      const row = table.audit_table.rows.find((r) => String(r.metric).split(':')[0] === 'unmapped_scope_pct');
      expect(row?.status, `n=${n} t=${threshold}`).toBe(legacyRow?.status);
    }
  });
});
