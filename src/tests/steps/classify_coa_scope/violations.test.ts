// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.6.D, §6.8
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-CT, R-DE, R-DF, R-DL
//
// Phase 4 wave 4 — `classify_coa_scope` (scripts/classify-coa-scope.js), ENRICHER: a per-row JS classifier
// (scripts/lib/coa-scope-classifier.js) over the coa_applications pending cursor, writing six columns back
// onto its own input table; McDonald's Airtight V3 from ①. Commit form compressed (R-PACE-1): ① assessment +
// this suite, ② descriptor + compute + notes + shell + seeds migration, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L13: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy text
// via `./fixtures/legacy-harness` (never source-text assertions), recording what the legacy script DOES so the
// conversion can prove it reproduced the same observables (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D9: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor / compute /
// notes / shell / registry) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOracle, type LegacyOpts, type SourceRow } from './fixtures/legacy-harness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyCoaScope } = require('../../../../scripts/lib/coa-scope-classifier.js') as {
  classifyCoaScope(i: { description: string | null; status?: string | null; decision?: string | null }): { coa_type_class: string | null; project_type: string | null; scope_tags: string[] | null; structure_type: string | null };
};

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/classify-coa-scope.descriptor.json';
const NOTES_REL = 'scripts/classify-coa-scope.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/classify-coa-scope.js';
const SHELL_REL = 'scripts/classify-coa-scope.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-4-classify-coa-scope-assessment.md';
/** Spec 42 §6.8 Phase D advisory lock of the legacy step (`classify-coa-scope.js:37`). */
const LOCK_ID = 4202;
const RUN_AT = new Date('2026-10-18T12:00:00Z');

const DESC_ADDITION = 'To construct a rear two-storey addition to the existing detached dwelling.';
const DESC_SEVER = 'To sever the property into two undersized residential lots.';
const DESC_NONE = 'Zzzz qqqq.';

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

function src(id: number, description: string | null, over: Partial<SourceRow> = {}): SourceRow {
  return { id, description, status: 'Closed', decision: 'Approved', ...over };
}
async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy({ runAt: RUN_AT, ...opts });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[classify_coa_scope ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[classify_coa_scope ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[classify_coa_scope ①] audit row ' + metric + ' missing');
  return r;
}
function updates(o: LegacyOracle): { sql: string; params: unknown[] }[] {
  return o.queries.filter((q) => q.via === 'client');
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('classify_coa_scope ① — legacy oracle pins A: cursor, config, lock (GREEN today)', () => {
  it('L1 — RUN_AT and the config are read BEFORE the lock (fail-fast hoist); the stream opens inside it', async () => {
    const { o, err } = await run({ rows: [src(1, DESC_ADDITION)] });
    expect(err).toBeNull();
    expect(o.events).toEqual(['run_at', 'config:classify-coa-scope', 'lock', 'stream']);
  });

  it('L2 — the pending cursor: non-empty description AND (scope_classified_at IS NULL OR < last_seen_at), ORDER BY id, no params', async () => {
    const { o } = await run({ rows: [] });
    const s = o.queries.filter((q) => q.via === 'stream');
    expect(s).toHaveLength(1);
    expect((s[0]?.sql ?? '').replace(/\s+/g, ' ').trim()).toBe(
      "SELECT id, description, status, decision FROM coa_applications WHERE description IS NOT NULL AND description <> '' AND (scope_classified_at IS NULL OR scope_classified_at < last_seen_at) ORDER BY id ASC",
    );
    expect(s[0]?.params).toEqual([]);
  });

  it('L3 — an invalid threshold (> 100) throws "logicVars validation failed" before the lock; nothing streams', async () => {
    const { o, err } = await run({ rows: [src(1, DESC_ADDITION)], logicVars: { coa_scope_unmapped_threshold_pct: 101 } });
    expect(err?.message).toMatch(/^logicVars validation failed/);
    expect(o.lockIds).toHaveLength(0);
    expect(o.queries).toHaveLength(0);
  });

  it('L4 — advisory lock 4202; when not acquired, nothing streams, writes or emits', async () => {
    const { o, err } = await run({ rows: [src(1, DESC_ADDITION)], lockAcquired: false });
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
  });
});

describe('classify_coa_scope ① — legacy oracle pins B: the write (GREEN today)', () => {
  it('L5 — one VALUES UPDATE per batch in its own txn: SETs the four classifier columns, scope_classified_at = RUN_AT, scope_source = \'description\'; no IS DISTINCT FROM guard', async () => {
    const { o } = await run({ rows: [src(7, DESC_ADDITION)] });
    expect(o.txns()).toBe(1);
    const u = updates(o);
    expect(u).toHaveLength(1);
    const sql = (u[0]?.sql ?? '').replace(/\s+/g, ' ').trim();
    expect(sql).toBe(
      "UPDATE coa_applications ca SET coa_type_class = v.coa_type_class, project_type = v.project_type, scope_tags = v.scope_tags, structure_type = v.structure_type, scope_classified_at = $6::timestamptz, scope_source = 'description' FROM (VALUES ($1::bigint, $2::text, $3::text, $4::text[], $5::text)) AS v(id, coa_type_class, project_type, scope_tags, structure_type) WHERE ca.id = v.id",
    );
    expect(sql).not.toMatch(/IS DISTINCT FROM/);
  });

  it('L6 — the bound values are the REAL classifier output per row, then RUN_AT last', async () => {
    const { o } = await run({ rows: [src(7, DESC_ADDITION), src(8, DESC_NONE)] });
    const a = classifyCoaScope({ description: DESC_ADDITION, status: 'Closed', decision: 'Approved' });
    const b = classifyCoaScope({ description: DESC_NONE, status: 'Closed', decision: 'Approved' });
    expect(updates(o)[0]?.params).toEqual([7, a.coa_type_class, a.project_type, a.scope_tags, a.structure_type, 8, b.coa_type_class, b.project_type, b.scope_tags, b.structure_type, RUN_AT]);
    expect(b.scope_tags).toBeNull();
  });

  it('L7 — the batch is 1000 rows (Math.min(1000, floor(65535 / 5))): 1001 rows → two txns of 1000 + 1', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => src(i + 1, DESC_ADDITION));
    const { o } = await run({ rows: many });
    expect(o.txns()).toBe(2);
    expect(updates(o).map((u) => (u.params.length - 1) / 5)).toEqual([1000, 1]);
  });

  it('L8 — records_updated is the SUM of UPDATE rowCounts (not the classified count); records_total = processed; records_new 0', async () => {
    const { o } = await run({ rows: [src(1, DESC_ADDITION), src(2, DESC_SEVER)], rowCountFor: () => 1 });
    expect(o.summaries[0]).toMatchObject({ records_total: 2, records_new: 0, records_updated: 1 });
  });

  it('L9 — an empty pending set: no txn, no UPDATE, PASS with 0.0% rows', async () => {
    const { o } = await run({ rows: [] });
    expect(o.txns()).toBe(0);
    expect(updates(o)).toHaveLength(0);
    expect(meta(o).audit_table?.verdict).toBe('PASS');
    expect(row(o, 'unmapped_scope_count')).toMatchObject({ value: '0.0%', status: 'PASS' });
  });
});

describe('classify_coa_scope ① — legacy oracle pins C: audit, summary, meta (GREEN today)', () => {
  it('L10 — ten audit rows in order, phase 42 "CoA Scope Classification", distributions keyed "(null)" for nulls', async () => {
    const { o } = await run({ rows: [src(1, DESC_ADDITION), src(2, DESC_NONE)] });
    expect(meta(o).audit_table).toMatchObject({ phase: 42, name: 'CoA Scope Classification' });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'coa_processed', 'scope_classified', 'unmapped_scope_count', 'scope_classified_pct', 'no_class',
      'coa_type_class_null_pct', 'no_project_type', 'structure_type_classified_pct', 'project_type_distribution', 'coa_type_class_distribution',
    ]);
    const pt = row(o, 'project_type_distribution').value as Record<string, number>;
    expect(pt['(null)']).toBe(1);
  });

  it('L11 — unmapped_scope_count and scope_classified_pct share ONE decision (unmapped% <= threshold): the boundary is inclusive, both rows flip together', async () => {
    const half = [src(1, DESC_ADDITION), src(2, DESC_NONE)];
    const at = await run({ rows: half, logicVars: { coa_scope_unmapped_threshold_pct: 50 } });
    expect(row(at.o, 'unmapped_scope_count')).toEqual({ metric: 'unmapped_scope_count', value: '50.0%', threshold: '<= 50%', status: 'PASS' });
    expect(row(at.o, 'scope_classified_pct')).toEqual({ metric: 'scope_classified_pct', value: '50.0%', threshold: '>= 50%', status: 'PASS' });
    const over = await run({ rows: half, logicVars: { coa_scope_unmapped_threshold_pct: 49 } });
    expect(row(over.o, 'unmapped_scope_count').status).toBe('WARN');
    expect(row(over.o, 'scope_classified_pct')).toMatchObject({ threshold: '>= 51%', status: 'WARN' });
    expect(meta(over.o).audit_table?.verdict).toBe('WARN');
  });

  it('L12 — records_meta keys and emitMeta: reads coa_applications[id, description, status, decision, last_seen_at, scope_classified_at], writes the six columns', async () => {
    const { o } = await run({ rows: [src(1, DESC_ADDITION)] });
    expect(Object.keys(meta(o))).toEqual(['duration_ms', 'coa_processed', 'scope_classified', 'unmapped_scope', 'no_class', 'no_project_type', 'structure_typed', 'project_type_distribution', 'coa_type_class_distribution', 'audit_table']);
    expect(o.metas).toEqual([{
      reads: { coa_applications: ['id', 'description', 'status', 'decision', 'last_seen_at', 'scope_classified_at'] },
      writes: { coa_applications: ['coa_type_class', 'project_type', 'scope_tags', 'structure_type', 'scope_classified_at', 'scope_source'] },
    }]);
  });

  it('L13 — counters: scope_tags null → unmapped; structure_type non-null → structure_typed; coa_type_class null → no_class', async () => {
    const descs = [DESC_ADDITION, DESC_SEVER, DESC_NONE];
    const { o } = await run({ rows: descs.map((d, i) => src(i + 1, d)) });
    const out = descs.map((d) => classifyCoaScope({ description: d, status: 'Closed', decision: 'Approved' }));
    const m = meta(o);
    expect(m.unmapped_scope).toBe(out.filter((x) => x.scope_tags === null).length);
    expect(m.scope_classified).toBe(out.filter((x) => x.scope_tags !== null).length);
    expect(m.structure_typed).toBe(out.filter((x) => x.structure_type !== null).length);
    expect(m.no_class).toBe(out.filter((x) => x.coa_type_class === null).length);
  });
});

// PART 2 — the converted claims D1–D9 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a named
// legacy fact the conversion removes, never as a TS/import error. They flip to `it` at ② (D1–D8) and ③ (D9).
interface Check { id: string; limit: string; limit_from_config?: string; severity: string }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  execution: { shape: string };
  outputs: { writes: { table: string; columns: { name: string }[] }[] };
  guards: { requires?: { kind: string; name: string }[] };
  checks: Check[];
  config: { logic_variables: { name: string }[]; retired?: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('classify_coa_scope ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ENRICHER, shape "enrich", lock 4202, spec "42"; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'classify_coa_scope', archetype: 'ENRICHER', spec: '42', lock: LOCK_ID });
    expect(d.execution.shape).toBe('enrich');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it.fails('D2 — one write target coa_applications with exactly the six legacy columns, and an rls_bypass_or_policy requirement (R-CT; RLS on, 0 policies) (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.outputs.writes.map((w) => w.table)).toEqual(['coa_applications']);
    expect(d.outputs.writes[0]?.columns.map((c) => c.name).sort()).toEqual(['coa_type_class', 'project_type', 'scope_classified_at', 'scope_source', 'scope_tags', 'structure_type']);
    const req = (d.guards.requires ?? []).filter((r) => r.kind === 'rls_bypass_or_policy').map((r) => r.name);
    expect(req).toEqual(['coa_applications']);
  });

  it.fails('D3 — R-DE (v) + EXTERNALIZED: classify_coa_scope_unmapped_max_pct and classify_coa_scope_batch_size are step-owned variables; coa_scope_unmapped_threshold_pct is retired (flips at ②)', () => {
    const c = loadDescriptor().config;
    const names = c.logic_variables.map((v) => v.name);
    expect(names).toContain('classify_coa_scope_unmapped_max_pct');
    expect(names).toContain('classify_coa_scope_batch_size');
    expect((c.retired ?? []).map((v) => v.name)).toEqual(['coa_scope_unmapped_threshold_pct']);
  });

  it.fails('D4 — the verdict is declared: unmapped_scope_pct is "pct <= 10" from classify_coa_scope_unmapped_max_pct, WARN (the library compares, compute no longer decides) (flips at ②)', () => {
    const byId = new Map(loadDescriptor().checks.map((c) => [c.id, c]));
    expect(byId.get('unmapped_scope_pct')).toMatchObject({ limit: 'pct <= 10', limit_from_config: 'classify_coa_scope_unmapped_max_pct', severity: 'WARN' });
  });

  it.fails('D5 — compute is pure (R-BZ): runner seams ctx.stream / ctx.flushBatch only; no clock, txn, lock, config loader or batch literal (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).toMatch(/ctx\.stream\(/);
    expect(c).toMatch(/ctx\.flushBatch\(/);
    expect(c).not.toMatch(/Date\.now\(|getDbTimestamp|withTransaction|withAdvisoryLock|streamQuery|loadMarketplaceConfigs/);
    expect(c).not.toMatch(/\b65535\b|Math\.min\(\s*1000/);
  });

  it.fails('D6 — the stale last_seen_at claim is gone: no file says it moves "ONLY when" data_hash changes; notes.json records the R-DW every-fed-key touch (flips at ②)', () => {
    for (const rel of [SHELL_REL, COMPUTE_REL]) expect(readText(rel)).not.toMatch(/ONLY when/);
    const notes = readText(NOTES_REL);
    expect(notes).toMatch(/last_seen_at/);
    expect(notes).toMatch(/every fed key/);
  });

  it.fails('D7 — R-DL: PIPELINE_TABLE_MAP maps classify_coa_scope to its declared write table; manifest supports_full is false (no --full path) (flips at ②)', () => {
    expect(readText('src/lib/admin/funnel.ts')).toMatch(/classify_coa_scope: 'coa_applications'/);
    const m = JSON.parse(readText('scripts/manifest.json')) as { scripts: Record<string, { supports_full?: boolean }> };
    expect(m.scripts.classify_coa_scope?.supports_full).toBe(false);
  });

  // FLIPPED at RE-FREEZE #37 / replay night N1 (operator y 2026-10-19): step-validate --all --write writes the generated
  // scorecard into the assessment report of EVERY registry step — converted[] and pending[] alike, red_suite included —
  // as designed by Spec 124 R-R / Rule 13 (step-validate.mjs is the ONE command that generates the Spec 123 §6
  // scorecard, over the registry derived from converted.json + pending). The block now exists before ②.
  it('D8 — the assessment report carries the generated validation scorecard (written by step-validate --all --write at N1, R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D9 — registered: census archetype ENRICHER and converted.json converted[] holds scripts/classify-coa-scope.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/classify-coa-scope.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "classify_coa_scope",[\s\S]{0,200}"archetype": "ENRICHER"/);
  });
});
