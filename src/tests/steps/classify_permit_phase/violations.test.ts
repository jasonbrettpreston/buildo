// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.4, core.6, core.8, core.9, core.12, core.14, core.16, ingestor.5, x-stages.1-2
//
// C6-2 — `classify_permit_phase` (scripts/classify-permit-phase.js), ENRICHER: one guarded set-based
// UPDATE that sets permits.enriched_status = 'Examination' on base-revision 'Inspection' permits with no
// real issued_date, and in the same UPDATE bumps permits.last_seen_at to RUN_AT (census finding F1).
// Runs in the permits chain only (position 4 of 32). Wave W2 of the V3-CoA path (PERMITS-MAP §4).
// McDonald's Airtight V3 from ①. Commit form compressed (Spec 132 §x-tooling.2 (R-PACE-1)):
// ① assessment + this suite, ② descriptor + compute + notes + seeds, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L13: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions on the script), recording what the
// legacy script DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// The defects the assessment files (CPP-D1..D9) are pinned in their LEGACY form here.
// PART 2 = the CONVERTED claims D1–D11: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / registry / spec text) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOracle, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/classify-permit-phase.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/classify-permit-phase.js';
const SHELL_REL = 'scripts/classify-permit-phase.js';
const ORACLE_REL = 'src/tests/steps/classify_permit_phase/fixtures/legacy-classify-permit-phase.js.txt';
const REPORT_REL = 'docs/reports/2026-10-23-batch5-p2-1-classify-permit-phase-assessment.md';
/** `ADVISORY_LOCK_ID` (`classify-permit-phase.js:30`; Spec 47 §A.5 registry row 89). */
const LOCK_ID = 89;
const RUN_AT = new Date('2026-10-23T12:00:00Z');

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

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
  if (last === undefined) throw new Error('[classify_permit_phase ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[classify_permit_phase ①] audit_table.rows[] missing');
  return t.rows;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJson<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}
const WRITE = /^(INSERT|UPDATE|DELETE)\b/;
const UPDATE_SQL =
  "UPDATE permits SET enriched_status = 'Examination', last_seen_at = $1::timestamptz WHERE status = 'Inspection' AND revision_num = '00' AND (issued_date IS NULL OR issued_date < '1970-01-02') AND enriched_status IS DISTINCT FROM 'Examination' RETURNING permit_num";
const ELIGIBLE_SQL =
  "SELECT COUNT(*) AS cnt FROM permits WHERE status = 'Inspection' AND revision_num = '00' AND (issued_date IS NULL OR issued_date < '1970-01-02')";
const STATS_SQL =
  "SELECT COUNT(*) FILTER (WHERE enriched_status = 'Examination') AS total_examination, COUNT(*) AS total_inspection FROM permits WHERE status = 'Inspection' AND revision_num = '00'";

describe('classify_permit_phase ① — legacy oracle pins A: lock, order and the one write (GREEN today)', () => {
  it('L1 — advisory lock 89 first, then RUN_AT, then the eligible count on the pool, then ONE transaction holding the UPDATE, then the stats read on the pool, then summary and meta (three snapshots, CPP-D5)', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.helpers.ADVISORY_LOCK_ID).toBe(LOCK_ID);
    expect(o.events).toEqual(['lock 89', 'run_at', 'SELECT eligible', 'BEGIN', 'UPDATE permits', 'COMMIT', 'SELECT stats', 'summary', 'meta']);
    expect(o.txns()).toBe(1);
    expect(o.queries.map((q) => [q.via, q.txn])).toEqual([['pool', null], ['client', 1], ['pool', null]]);
    expect(o.requiredModules.sort()).toEqual(['./lib/pipeline', './lib/safe-math']);
  });

  it('L2 — the only write is one guarded set-based UPDATE: it sets enriched_status = \'Examination\' AND bumps last_seen_at to RUN_AT (finding F1, CPP-D1) on base-revision Inspection permits with no real issued_date', async () => {
    const { o } = await run();
    const writes = o.queries.filter((q) => WRITE.test(q.norm));
    expect(writes).toHaveLength(1);
    expect(writes[0]?.norm).toBe(UPDATE_SQL);
    expect(writes[0]?.params).toEqual([RUN_AT]);
    // the guard is enriched_status alone: last_seen_at moves only on rows whose enriched_status changes
    expect(writes[0]?.norm).toMatch(/AND enriched_status IS DISTINCT FROM 'Examination' RETURNING permit_num$/);
  });

  it('L3 — the eligible pool is the UPDATE scope without the guard; the stats denominator drops the issued_date clause (it counts every base-revision Inspection permit)', async () => {
    const { o } = await run();
    expect(o.queries[0]?.norm).toBe(ELIGIBLE_SQL);
    expect(o.queries[2]?.norm).toBe(STATS_SQL);
    expect(o.queries[0]?.params).toEqual([]);
    expect(o.queries[2]?.params).toEqual([]);
  });

  it('L4 — a rerun with nothing left to change still issues the one UPDATE and counts zero: records_updated 0, records_total the full eligible pool', async () => {
    const { o, err } = await run({ examined: [], eligible: '5' });
    expect(err).toBeNull();
    expect(o.queries.filter((q) => WRITE.test(q.norm))).toHaveLength(1);
    const s = o.summaries[0];
    expect(s?.records_updated).toBe(0);
    expect(s?.records_total).toBe(5);
    expect(s?.records_new).toBe(0);
  });

  it('L5 — no statement ever clears or replaces Examination: the step has no reverse arm, so a permit that gains a real issued_date while its status stays Inspection keeps Examination (CPP-D6, inferred impact)', async () => {
    const { o } = await run();
    const enrichedWrites = o.queries.filter((q) => /SET enriched_status/.test(q.norm));
    expect(enrichedWrites).toHaveLength(1);
    expect(enrichedWrites[0]?.norm).toContain("SET enriched_status = 'Examination'");
    expect(o.queries.some((q) => /enriched_status = NULL|enriched_status = CASE/.test(q.norm))).toBe(false);
  });
});

describe('classify_permit_phase ① — legacy oracle pins B: audit table, verdict and summary (GREEN today)', () => {
  it('L6 — summary: records_total = the eligible pool, records_new = 0, records_updated = the RETURNING row count; records_meta carries duration (process clock) and the three counts', async () => {
    const { o } = await run({ eligible: '7', examined: ['A', 'B'], totalExamination: '40', totalInspection: '160' });
    expect(o.summaries).toHaveLength(1);
    const s = o.summaries[0]!;
    expect([s.records_total, s.records_new, s.records_updated]).toEqual([7, 0, 2]);
    const m = meta(o);
    expect(Object.keys(m).sort()).toEqual(['audit_table', 'duration_ms', 'examination_classified', 'total_examination', 'total_inspection']);
    expect(m.duration_ms).toBe(0); // Date.now() is the process clock (frozen here), not RUN_AT (CPP-D5)
    expect([m.examination_classified, m.total_examination, m.total_inspection]).toEqual([2, 40, 160]);
  });

  it('L7 — one audit table "Permit Phase Classification", phase 4, four INFO rows in a fixed order; examination_rate is a STRING with a percent sign (CPP-D7)', async () => {
    const { o } = await run({ examined: ['A'], totalExamination: '40', totalInspection: '160' });
    const t = meta(o).audit_table!;
    expect([t.phase, t.name]).toEqual([4, 'Permit Phase Classification']);
    expect(rows(o)).toEqual([
      { metric: 'examination_classified', value: 1, threshold: null, status: 'INFO' },
      { metric: 'total_examination', value: 40, threshold: null, status: 'INFO' },
      { metric: 'total_inspection', value: 160, threshold: null, status: 'INFO' },
      { metric: 'examination_rate', value: '25.0%', threshold: null, status: 'INFO' },
    ]);
  });

  it('L8 — the verdict is the literal \'PASS\', whatever the numbers: no row has a bound, so no run can WARN or FAIL (CPP-D2)', async () => {
    for (const opts of [{}, { examined: [], eligible: '0', totalExamination: '0', totalInspection: '0' }, { examined: [], eligible: '90000', totalExamination: '0', totalInspection: '90000' }] as LegacyOpts[]) {
      const { o, err } = await run(opts);
      expect(err).toBeNull();
      expect(meta(o).audit_table?.verdict).toBe('PASS');
      expect(rows(o).every((r) => r.status === 'INFO' && r.threshold === null)).toBe(true);
    }
  });

  it('L9 — zero base-revision Inspection permits gives examination_rate "0.0%" (the division guard)', async () => {
    const { o } = await run({ examined: [], eligible: '0', totalExamination: '0', totalInspection: '0' });
    expect(rows(o).find((r) => r.metric === 'examination_rate')?.value).toBe('0.0%');
  });

  it('L10 — failure lanes: an unparseable eligible count throws before any write; an UPDATE failure rolls back with no summary; a stats failure throws AFTER the UPDATE committed, with no summary and no meta', async () => {
    const badCount = await run({ eligible: null });
    expect(badCount.err?.message).toMatch(/\[safe-math\] cnt/);
    expect(badCount.o.queries.filter((q) => WRITE.test(q.norm))).toHaveLength(0);
    expect(badCount.o.summaries).toHaveLength(0);

    const upd = await run({ updateFail: true });
    expect(upd.err?.message).toBe('update failed');
    expect(upd.o.events).toContain('ROLLBACK');
    expect(upd.o.summaries).toHaveLength(0);

    const stats = await run({ statsFail: true });
    expect(stats.err?.message).toBe('stats read failed');
    expect(stats.o.events.slice(0, 6)).toEqual(['lock 89', 'run_at', 'SELECT eligible', 'BEGIN', 'UPDATE permits', 'COMMIT']);
    expect(stats.o.summaries).toHaveLength(0);
    expect(stats.o.metas).toHaveLength(0);
  });

  it('L11 — emitMeta: the declared reads include last_seen_at, which no statement reads (it is only written), and omit permit_num, which the RETURNING reads (CPP-D4)', async () => {
    const { o } = await run();
    expect(o.metas).toEqual([{
      reads: { permits: ['status', 'revision_num', 'issued_date', 'enriched_status', 'last_seen_at'] },
      writes: { permits: ['enriched_status', 'last_seen_at'] },
    }]);
    const readSql = o.queries.filter((q) => !WRITE.test(q.norm)).map((q) => q.norm).join(' ');
    expect(readSql).not.toMatch(/last_seen_at/);
    expect(o.queries.find((q) => WRITE.test(q.norm))?.norm).toMatch(/RETURNING permit_num$/);
  });

  it('L12 — a contended lock returns with no SQL, no summary and no meta; the script reads no argv or env and the manifest says supports_dry_run false, supports_full false, telemetry permits', async () => {
    const { o, err } = await run({ lockAcquired: false });
    expect(err).toBeNull();
    expect(o.events).toEqual(['lock 89']);
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
    expect(o.metas).toHaveLength(0);
    expect(readText(ORACLE_REL)).not.toMatch(/process\.(argv|env)/);
    const manifest = readJson<{ scripts: Record<string, { supports_dry_run?: boolean; supports_full?: boolean; telemetry_tables?: string[] }> }>('scripts/manifest.json');
    expect(manifest.scripts.classify_permit_phase).toMatchObject({ supports_dry_run: false, supports_full: false, telemetry_tables: ['permits'] });
  });

  it('L13 — the frozen oracle text is byte-identical to the shipped script while it is still legacy (pipeline.run, not pipeline.step)', () => {
    const shell = readText(SHELL_REL);
    if (!/pipeline\.run\(/.test(shell)) return; // ② swapped the shell: the oracle stays frozen, this pin retires
    expect(readText(ORACLE_REL)).toBe(shell);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — the converted claims D1–D11 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a
// named registry / spec state; ② / ③ flip each to `it` in the commit that lands it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type Column = { name: string; source?: string; written?: string };
type WriteSpec = { table: string; key?: string[]; columns?: Column[]; write_discipline?: { class?: string; guard?: string; guard_columns?: unknown; idempotent_rerun?: string } };
type Descriptor = {
  identity: { name: string; archetype: string; lock: number; spec: string };
  inputs: { reads: { steps?: Array<{ step: string }>; tables?: unknown } & Record<string, unknown> };
  outputs: { writes: WriteSpec[] };
  guards?: { requires?: Array<{ kind: string; name: string }> };
  checks?: Array<{ id: string; severity?: string }>;
  deviations?: Array<Record<string, unknown>>;
};

describe('classify_permit_phase ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ENRICHER (census, Spec 132 §core.4 (R-AO)), lock 89, spec "41"; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.identity).toMatchObject({ name: 'classify_permit_phase', archetype: 'ENRICHER', lock: LOCK_ID, spec: '41' });
    const shell = readText(SHELL_REL);
    expect(shell).toMatch(/pipeline\.step\(/);
    expect(shell).not.toMatch(/pipeline\.run\(/);
  });

  it.fails('D2 — write discipline per target (Spec 132 §core.12 (R-CT)): one permits target keyed (permit_num, revision_num), guarded IS DISTINCT FROM on enriched_status only (a run_at column in the guard rewrites every row, the geocode_permits LG-9 fence), zero writes on a rerun, and rls_bypass_or_policy on permits (RLS on, migrations/227:75) (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.outputs.writes.map((w) => w.table)).toEqual(['permits']);
    const w = d.outputs.writes[0]!;
    expect(w.key).toEqual(['permit_num', 'revision_num']);
    expect(w.write_discipline).toMatchObject({ guard: 'is_distinct_from', guard_columns: ['enriched_status'], idempotent_rerun: 'zero_writes' });
    expect(typeof w.write_discipline?.class).toBe('string');
    expect((d.guards?.requires ?? []).some((r) => r.kind === 'rls_bypass_or_policy' && r.name === 'permits')).toBe(true);
  });

  it.fails('D3 — the last_seen_at bump is never silent (card CPP-Q1; Spec 132 §ingestor.5 (R-DZ), §core.14 (R-FF), R-JM): a written last_seen_at is a source:"run_at" column (never written:"seen", which stays INGESTOR-only) AND a declared deviation citing the ruling; or the column is not written at all (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const seen = d.outputs.writes.flatMap((w) => (w.columns ?? []).filter((c) => c.name === 'last_seen_at'));
    for (const c of seen) {
      expect(c.written).not.toBe('seen');
      expect(c.source).toBe('run_at');
    }
    if (seen.length > 0) {
      const dev = (d.deviations ?? []).map((x) => JSON.stringify(x)).filter((s) => s.includes('last_seen_at'));
      expect(dev.length).toBeGreaterThan(0);
      expect(dev.some((s) => /CHAT-\d+|R-[A-Z]{2}\b/.test(s))).toBe(true);
    }
  });

  it.fails('D4 — declared equals witnessed (Spec 132 §core.14): inputs.reads names status, revision_num, issued_date and enriched_status, never last_seen_at, and inputs.reads.steps holds permits (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const flat = JSON.stringify(d.inputs.reads);
    for (const c of ['status', 'revision_num', 'issued_date', 'enriched_status']) expect(flat).toContain(`"${c}"`);
    expect(flat).not.toContain('"last_seen_at"');
    expect((d.inputs.reads.steps ?? []).map((s) => s.step)).toContain('permits');
  });

  it.fails('D5 — EXTERNALIZED (Spec 132 §core.8 (R-CV)): compute holds no epoch cutoff literal and no lock number; a classify_permit_phase_ variable is seeded (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/1970-01-02|\b89\b/);
    expect(readText('scripts/seeds/logic_variables.json')).toContain('"classify_permit_phase_');
  });

  it.fails('D6 — compute is pure (Spec 132 §core.9 (R-BZ)): no Date.now, no NOW(), no .query(, no transaction / lock wrapper, no pipeline require, no process.env / argv, no catch (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/Date\.now\(|\bNOW\(\)|\.query\(|withTransaction|withAdvisoryLock|require\(['"]\.\.\/pipeline['"]\)|process\.(env|argv)|\bcatch\b/);
  });

  it.fails('D7 — the verdict comes only from check rows (Spec 132 §core.6): the four legacy audit metrics are declared checks and compute decides no verdict (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const ids = (d.checks ?? []).map((c) => c.id).join(' ');
    for (const m of ['examination_classified', 'total_examination', 'total_inspection', 'examination_rate']) expect(ids).toContain(m);
    expect(readText(COMPUTE_REL)).not.toMatch(/verdict\s*:/);
  });

  it.fails('D8 — the owner specs describe the step the code is (CPP-D9): Spec 41 step 4 and Spec 42 §6 no longer call it an early/structural/finishing/landscaping construction-phase classifier, and Spec 80 (§3 Files line and the Operating Boundaries entry) no longer names the script as implementing the 4-phase vocabulary (flips at ②, its spec diff)', () => {
    const s41 = readText('docs/specs/01-pipeline/41_chain_permits.md');
    expect(s41).not.toMatch(/`classify_permit_phase` \| `classify-permit-phase\.js` \| Assign construction phase/);
    const s42 = readText('docs/specs/01-pipeline/42_chain_coa.md');
    expect(s42).not.toMatch(/`classify_permit_phase` \(early\/structural\/finishing\/landscaping\)/);
    const s80 = readText('docs/specs/01-pipeline/80_taxonomies.md');
    expect(s80).not.toMatch(/\*\*Files:\*\* `src\/lib\/classification\/phases\.ts` \+ `scripts\/classify-permit-phase\.js`/);
    expect(s80).not.toMatch(/`scripts\/classify-permit-phase\.js` — §3 defines the 4-phase lifecycle vocabulary and timing thresholds this script implements/);
  });

  it.fails('D9 — admin-verifiable (Spec 132 §core.16 (R-DL)): PIPELINE_TABLE_MAP maps classify_permit_phase (flips at ③, descriptor-derived under R-DV)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const mapBlock = funnel.slice(funnel.indexOf('export const PIPELINE_TABLE_MAP'));
    expect(mapBlock.slice(0, mapBlock.indexOf('\n};'))).toMatch(/\bclassify_permit_phase:/);
  });

  it.fails('D10 — the assessment report carries the generated validation scorecard (flips at ②)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D11 — registered: converted.json converted[] holds scripts/classify-permit-phase.js (flips at ③)', () => {
    const conv = readJson<{ converted: string[] }>('scripts/steps/_schema/converted.json');
    expect(conv.converted).toContain(SHELL_REL);
  });
});
