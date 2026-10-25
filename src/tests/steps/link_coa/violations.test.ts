// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D, §6.6.X, §6.9, §6.11 Phase D R5.1 + R5.6
// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md (Link CoA)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.8, core.9, core.12, core.16, core.18, link.1, x-stages.1-2
//
// V3-COA package H (C6-4) — `link_coa` (scripts/link-coa.js), LINK: a five-tier address cascade plus a
// description-FTS tier from coa_applications to permits, writing coa_applications.linked_permit_num /
// linked_confidence, the permits.linked_coa_application_number back-ref, the permits.last_seen_at bump
// and the permit -> CoA lat/lng/ward inheritance; runs in the permits AND coa chains. McDonald's
// Airtight V3 from ①. Commit form compressed (Spec 132 §x-tooling.2 (R-PACE-1)): ① assessment + this
// suite, ② descriptor + compute + notes + seeds, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L17: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions on the script), recording what the
// legacy script DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// The defects the assessment files (LCOA-D1..D14) are pinned in their LEGACY form here.
// PART 2 = the CONVERTED claims D1–D10: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / registry) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, DEFAULT_LOGIC_VARS, type LegacyOracle, type LegacyOpts, type Tier3Row } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/link-coa.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/link-coa.js';
const SHELL_REL = 'scripts/link-coa.js';
const ORACLE_REL = 'src/tests/steps/link_coa/fixtures/legacy-link-coa.js.txt';
const REPORT_REL = 'docs/reports/2026-10-23-batch5-p4-4-link-coa-assessment.md';
/** `ADVISORY_LOCK_ID` (`link-coa.js:39`). */
const LOCK_ID = 12;
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
  if (last === undefined) throw new Error('[link_coa ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[link_coa ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[link_coa ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp) {
  return o.queries.filter((q) => re.test(q.norm));
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJson<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}
const TIER_UPDATE = /^UPDATE coa_applications ca SET linked_permit_num = matched\.permit_num, linked_confidence = (\d\.\d+) FROM/;
const WRITE = /^(INSERT|UPDATE|DELETE)\b|\bUPDATE coa_applications ca SET\b/;

/** 5 unlinked CoAs; Tier 1a links P1 and P2, Tier 2a links P3; nothing left that could still link. */
const HAPPY: LegacyOpts = { unlinked: 5, tiers: { '0.95': ['P1', 'P2'], '0.6': ['P3'] }, potential: 0 };

describe('link_coa ① — legacy oracle pins A: lock, config, eligibility and the tier cascade (GREEN today)', () => {
  it('L1 — advisory lock 12 is taken FIRST, then RUN_AT, then the logic variables load and validate INSIDE the lock; an invalid or missing variable throws with the lock held', async () => {
    const ok = await run(HAPPY);
    expect(ok.err).toBeNull();
    expect(ok.o.lockIds).toEqual([LOCK_ID]);
    expect(ok.o.events.slice(0, 3)).toEqual(['lock 12', 'run_at', 'config']);
    const bad = await run({ ...HAPPY, logicVars: { ...DEFAULT_LOGIC_VARS, coa_match_conf_high: 2 } });
    expect(bad.err?.message).toMatch(/^logicVars validation failed: coa_match_conf_high/);
    expect(bad.o.lockIds).toEqual([LOCK_ID]);
    expect(bad.o.queries).toHaveLength(0);
    const missing = await run({ ...HAPPY, logicVars: { coa_match_conf_high: 0.9, coa_match_conf_medium: 0.5 } });
    expect(missing.err?.message).toMatch(/coa_inherit_from_permit_min_confidence/);
  });

  it('L2 — the tier confidences are JS literals interpolated into the SQL (0.95 / 0.85 / 0.1 / 0.6 / 0.5; Tier 3 0.10–0.50 in the SQL text); coa_match_conf_high/medium reach only the final stats SELECT, whose result feeds only a log line', async () => {
    const { o } = await run({ ...HAPPY, logicVars: { ...DEFAULT_LOGIC_VARS, coa_match_conf_high: 0.99, coa_match_conf_medium: 0.11 } });
    expect(sqlOf(o, TIER_UPDATE).map((q) => q.norm.match(TIER_UPDATE)?.[1])).toEqual(['0.95', '0.85', '0.1', '0.6', '0.5']);
    const stats = sqlOf(o, /^SELECT COUNT\(\*\) AS total, COUNT\(\*\) FILTER/);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.params).toEqual([0.99, 0.11]);
    expect(rows(o).some((r) => /^(high_conf|med_conf|low_conf|upcoming)$/.test(r.metric))).toBe(false);
    expect(o.logs.some((l) => String(l.args[1]).startsWith('DB stats: 100 total | 90 linked (50 high, 20 med, 20 low) | 3 upcoming leads'))).toBe(true);
  });

  it('L3 — WRITE-ONCE eligibility: every tier UPDATE and the Tier-3 candidate SELECT filter linked_permit_num IS NULL, so a linked CoA is never re-matched; each tier is its own transaction, DISTINCT ON (ca2.id), newest permit wins, Pre-Permit excluded, RETURNING the linked permit', async () => {
    const { o } = await run(HAPPY);
    const tiers = sqlOf(o, TIER_UPDATE);
    expect(tiers).toHaveLength(5);
    for (const t of tiers) {
      expect(t.via).toBe('client');
      expect(t.norm).toMatch(/ca2\.linked_permit_num IS NULL/);
      expect(t.norm).toMatch(/SELECT DISTINCT ON \(ca2\.id\) ca2\.id, p\.permit_num/);
      expect(t.norm).toMatch(/ORDER BY ca2\.id, COALESCE\(p\.issued_date, p\.application_date\) DESC NULLS LAST, p\.permit_num DESC/);
      expect(t.norm).toMatch(/p\.permit_type != 'Pre-Permit'/);
      expect(t.norm).toMatch(/RETURNING ca\.linked_permit_num$/);
    }
    expect(sqlOf(o, /^SELECT id, application_number, ward, description FROM coa_applications WHERE linked_permit_num IS NULL AND description IS NOT NULL AND LENGTH\(TRIM\(description\)\) >= 10 ORDER BY decision_date DESC NULLS LAST$/)).toHaveLength(1);
    // one transaction for the pre-pass, five tiers, the bump, the back-ref and the enrichment
    expect(o.txns()).toBe(9);
  });

  it('L4 — the ward matrix: Tiers 1a/1c/2a require a CoA ward; Tiers 1b/2b (the only tiers with no CoA-ward filter) require p.ward IS NULL — so a NULL-ward CoA is never address-linked to a permit that HAS a ward (reached only by Tier 3)', async () => {
    const { o } = await run(HAPPY);
    const byConf = Object.fromEntries(sqlOf(o, TIER_UPDATE).map((q) => [q.norm.match(TIER_UPDATE)?.[1], q.norm]));
    for (const c of ['0.95', '0.1', '0.6']) expect(byConf[c]).toMatch(/ca2\.ward IS NOT NULL/);
    for (const c of ['0.85', '0.5']) {
      expect(byConf[c]).not.toMatch(/ca2\.ward IS NOT NULL/);
      expect(byConf[c]).toMatch(/AND p\.ward IS NULL AND p\.permit_type/);
    }
    expect(byConf['0.95']).toMatch(/UPPER\(TRIM\(p\.street_num\)\) = UPPER\(TRIM\(ca2\.street_num\)\)/);
    expect(byConf['0.6']).not.toMatch(/street_num/);
  });

  it('L5 — zero unlinked: a SKIPPED summary (phase 12, or 4 in the coa chain), verdict PASS, and NOTHING else runs — no cross-ward pre-pass, no back-ref refresh, no permit -> CoA inheritance', async () => {
    const { o, err } = await run({ unlinked: 0 });
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(1);
    expect(meta(o).audit_table).toMatchObject({ phase: 12, name: 'Link CoA', verdict: 'PASS' });
    expect(rows(o).map((r) => [r.metric, r.value])).toEqual([['status', 'SKIPPED'], ['reason', 'No unlinked CoA applications — all already linked']]);
    expect(o.metas[0]?.writes).toEqual({ coa_applications: ['linked_permit_num', 'linked_confidence', 'latitude', 'longitude', 'ward'] });
    const coaChain = await run({ unlinked: 0, chain: 'coa' });
    expect(meta(coaChain.o).audit_table?.phase).toBe(4);
  });

  it('L6 — the cross-ward pre-pass: one transaction SELECTs the pairs, unlinks them (sparing the 0.10 sentinel), then NULLs a permit back-ref only when no other CoA still points at it; the unlinked count joins the candidates', async () => {
    const { o } = await run({ ...HAPPY, crossWard: [{ application_number: 'A1', permit_num: 'P9' }], staleBackRefs: 1 });
    const pre = o.queries.slice(1, 4);
    expect(pre.map((q) => q.via)).toEqual(['client', 'client', 'client']);
    expect(pre[0]?.norm).toMatch(/^SELECT ca\.application_number, ca\.linked_permit_num AS permit_num FROM coa_applications ca JOIN permits p ON p\.permit_num = ca\.linked_permit_num WHERE ca\.ward IS NOT NULL AND p\.ward IS NOT NULL AND LTRIM\(ca\.ward, '0'\) != LTRIM\(p\.ward, '0'\) AND ca\.linked_confidence != 0\.10$/);
    expect(pre[1]?.norm).toMatch(/^UPDATE coa_applications ca SET linked_permit_num = NULL, linked_confidence = NULL FROM permits p .*AND ca\.linked_confidence != 0\.10$/);
    expect(pre[2]?.params).toEqual([['P9'], ['A1']]);
    expect(pre[2]?.norm).toMatch(/AND NOT EXISTS \( SELECT 1 FROM coa_applications other WHERE other\.linked_permit_num = p\.permit_num AND other\.application_number IS DISTINCT FROM cleared\.an \)/);
    expect(row(o, 'cross_ward_cleaned')).toMatchObject({ value: 1, status: 'INFO' });
    expect(row(o, 'total_candidates').value).toBe(6);
    expect(row(o, 'stale_back_refs_cleared_count').value).toBe(1);
    const none = await run(HAPPY);
    expect(sqlOf(none.o, /^UPDATE permits p SET linked_coa_application_number = NULL FROM/)).toHaveLength(0);
    expect(row(none.o, 'cross_ward_cleaned')).toMatchObject({ value: 0, status: 'PASS' });
  });
});

function t3(id: number, description: string, ward: string | null = '10'): Tier3Row {
  return { id, application_number: 'A' + id, ward, description };
}

describe('link_coa ① — legacy oracle pins B: Tier 3 and the three post-link passes (GREEN today)', () => {
  it('L7 — Tier 3 keywords: upper-cased, non-alphanumerics to spaces, words of 3+ characters, the first 8, at least 2 or the candidate is dropped; a NULL ward binds as \'\'; batches of 500 through unnest + CROSS JOIN LATERAL with the literal confidence formula', async () => {
    const many = Array.from({ length: 499 }, (_, i) => t3(100 + i, 'rear addition deck'));
    const { o } = await run({
      ...HAPPY,
      tier3: [t3(1, 'Construct a rear two-storey addition, per plans!'), t3(2, 'ok go to it now'), t3(3, 'one two three four five six seven eight nine ten', null), ...many],
      tier3Links: { 1: 'P7' },
    });
    const batches = sqlOf(o, /^WITH candidates AS \(/);
    expect(batches).toHaveLength(2);
    const [ids, wards, queries] = batches[0]?.params as [number[], string[], string[]];
    expect(ids.slice(0, 2)).toEqual([1, 3]);
    expect(wards.slice(0, 2)).toEqual(['10', '']);
    expect(queries.slice(0, 2)).toEqual(['CONSTRUCT REAR TWO STOREY ADDITION PER PLANS', 'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT']);
    expect(ids).toHaveLength(500);
    expect((batches[1]?.params[0] as number[])).toHaveLength(1);
    expect(batches[0]?.norm).toMatch(/WHEN c\.ward != '' AND lat\.ward IS NOT NULL AND LTRIM\(lat\.ward, '0'\) = LTRIM\(c\.ward, '0'\) THEN LEAST\(0\.50, 0\.30 \+ lat\.rank \* 0\.1\) WHEN lat\.ward IS NULL OR c\.ward = '' THEN LEAST\(0\.40, 0\.25 \+ lat\.rank \* 0\.1\) ELSE 0\.10 END AS conf/);
    expect(batches[0]?.norm).toMatch(/plainto_tsquery\('english', c\.ts_query\)/);
    expect(row(o, 'matches_tier_3_desc').value).toBe(1);
  });

  it('L8 — a failing Tier-3 batch is SWALLOWED: the run continues, tier_3_errors counts it (WARN, "== 0"), its candidates leave unlinked_remaining, and the verdict reads WARN', async () => {
    const { o, err } = await run({ ...HAPPY, tier3: [t3(1, 'rear addition deck'), t3(2, 'front porch stairs')], tier3FailBatches: [0] });
    expect(err).toBeNull();
    expect(row(o, 'tier_3_errors')).toMatchObject({ value: 1, threshold: '== 0', status: 'WARN' });
    expect(o.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('Tier 3 batch at offset 0 failed (2 candidates skipped)'))).toBe(true);
    expect(row(o, 'unlinked_remaining').value).toBe(0); // 5 candidates - 3 linked - 2 skipped
    expect(meta(o).audit_table?.verdict).toBe('WARN');
    expect(o.events).toContain('BUMP permits.last_seen_at');
  });

  it('L9 — the permits.last_seen_at bump: permits linked THIS run (tier RETURNING, R-JM) on the run clock, guarded by the WALL clock (NOW() - 1 second) and the SKIP_PHASES exclusion; no statement writes coa_applications.last_seen_at; a permit whose CoA was unlinked is not bumped', async () => {
    const { o } = await run({ ...HAPPY, crossWard: [{ application_number: 'A1', permit_num: 'P9' }], tier3: [t3(1, 'rear addition deck')], tier3Links: { 1: 'P7' } });
    const bump = sqlOf(o, /^UPDATE permits SET last_seen_at = \$2::timestamptz/);
    expect(bump).toHaveLength(1);
    expect(bump[0]?.params).toEqual([['P1', 'P2', 'P3', 'P7'], RUN_AT]);
    expect(bump[0]?.norm).toMatch(/WHERE permit_num = ANY\(\$1::text\[\]\) AND last_seen_at < NOW\(\) - INTERVAL '1 second' AND \(lifecycle_phase IS NULL OR lifecycle_phase NOT IN \('P19','P20','O1','O2','O3'\)\)$/);
    expect(row(o, 'permits_bumped_last_seen_at')).toMatchObject({ value: 4, status: 'INFO' });
    expect(o.queries.filter((q) => /^UPDATE coa_applications/.test(q.norm) && /last_seen_at/.test(q.norm))).toHaveLength(0);
  });

  it('L10 — the back-ref pass: one transaction, CLEAR every back-ref with no CoA link >= the floor, then SET the floored winner (approved first, newest decision, application_number), IS DISTINCT FROM guarded', async () => {
    const { o } = await run({ ...HAPPY, backRefCleared: 2, backRefSet: 7 });
    const i = o.events.indexOf('BACKREF clear');
    expect(o.events.slice(i - 1, i + 3)).toEqual(['BEGIN', 'BACKREF clear', 'BACKREF set', 'COMMIT']);
    const set = sqlOf(o, /^UPDATE permits p SET linked_coa_application_number = src\.application_number/);
    expect(set[0]?.params).toEqual([0.6]);
    expect(set[0]?.norm).toMatch(/ORDER BY linked_permit_num, \(decision ILIKE 'approved%'\)::int DESC, decision_date DESC NULLS LAST, application_number \) src/);
    expect(set[0]?.norm).toMatch(/AND p\.linked_coa_application_number IS DISTINCT FROM src\.application_number$/);
    expect(row(o, 'permits_back_ref_updated').value).toBe(7);
    expect(row(o, 'permits_back_ref_cleared_below_floor').value).toBe(2);
  });

  it('L11 — the permit -> CoA inheritance: three pre-counts and one UPDATE in one transaction over the newest geocoded permit revision, floored, ward filled only when NULL; then three pool reads (below floor, eligible, post mismatch WARN)', async () => {
    const { o } = await run({ ...HAPPY, wardMismatch: 4, wardFill: 3, latLngUpgrade: 5, inherited: 6, belowFloor: 8, eligible: 9, leadMismatch: 1 });
    const enrich = sqlOf(o, /UPDATE coa_applications ca SET latitude = bp\.latitude/);
    expect(enrich).toHaveLength(1);
    expect(enrich[0]?.params).toEqual([0.6]);
    expect(enrich[0]?.norm).toMatch(/ORDER BY p\.permit_num, COALESCE\(p\.issued_date, p\.application_date\) DESC NULLS LAST, p\.revision_num DESC/);
    expect(enrich[0]?.norm).toMatch(/ward = COALESCE\(ca\.ward, bp\.ward\)/);
    const best = sqlOf(o, /^WITH best_permit AS/);
    expect(best.map((q) => q.via)).toEqual(['client', 'client', 'client', 'client', 'pool']);
    expect([row(o, 'coa_ward_mismatch_with_permit_count').value, row(o, 'coa_ward_filled_from_permit_count').value, row(o, 'coa_lat_lng_upgraded_from_permit_count').value, row(o, 'coa_inherited_from_permit_count').value]).toEqual([4, 3, 5, 6]);
    expect([row(o, 'coa_below_confidence_floor_count').value, row(o, 'enrichment_eligible_count').value]).toEqual([8, 9]);
    expect(row(o, 'lead_identity_lat_lng_mismatch_count')).toMatchObject({ value: 1, status: 'WARN' });
    expect(row(o, 'inherited_confidence_floor').value).toBe(0.6);
  });
});

describe('link_coa ① — legacy oracle pins C: verdict, audit, meta and run lanes (GREEN today)', () => {
  it('L12 — the verdict: effective rate = (1a+1b+2a+2b) / (that + potential); < 50 FAIL, < 80 WARN (literals), nothing achievable PASS; any Pre-Permit link FAILs; a Tier-1c link or a cross-ward link WARNs', async () => {
    const steady = await run({ unlinked: 4, tiers: {}, potential: 0 });
    expect(row(steady.o, 'effective_match_rate_pct')).toMatchObject({ value: 100, threshold: '>= 50%', status: 'PASS' });
    const fail = await run({ unlinked: 4, tiers: { '0.95': ['P1'], '0.1': ['P5'] }, potential: 3 });
    expect(row(fail.o, 'effective_match_rate_pct')).toMatchObject({ value: 25, status: 'FAIL' });
    expect(row(fail.o, 'matches_tier_1c_ward_conflict').status).toBe('WARN');
    expect(meta(fail.o).audit_table?.verdict).toBe('FAIL');
    const warn = await run({ unlinked: 4, tiers: { '0.95': ['P1', 'P2', 'P3'] }, potential: 1 });
    expect(row(warn.o, 'effective_match_rate_pct')).toMatchObject({ value: 75, status: 'WARN' });
    const pre = await run({ ...HAPPY, prePermitLinks: 1 });
    expect(row(pre.o, 'links_to_pre_permits')).toMatchObject({ value: 1, threshold: '== 0', status: 'FAIL' });
    expect(meta(pre.o).audit_table?.verdict).toBe('FAIL');
    const xw = await run({ ...HAPPY, crossWardLinks: 2 });
    expect(row(xw.o, 'cross_ward_links')).toMatchObject({ value: 2, status: 'WARN' });
    expect(meta(xw.o).audit_table?.verdict).toBe('WARN');
  });

  it('L13 — the measurement reads: potential matches compare street_num RAW (the tiers compare UPPER(TRIM())); the stats SELECT reads the WALL clock (NOW() - 90 days)', async () => {
    const { o } = await run(HAPPY);
    const pot = sqlOf(o, /AS could_link/);
    expect(pot[0]?.norm).toMatch(/ON p\.street_num = c\.street_num AND p\.street_name_normalized = c\.street_name_normalized/);
    expect(sqlOf(o, /^SELECT COUNT\(\*\) AS total/)[0]?.norm).toMatch(/decision_date >= NOW\(\) - INTERVAL '90 days'/);
    expect(o.queries.slice(-4).map((q) => q.via)).toEqual(['pool', 'pool', 'pool', 'pool']);
  });

  it('L14 — audit rows and order, phase 12 / 4 by PIPELINE_CHAIN, the summary counts, records_meta keys and emitMeta', async () => {
    const { o } = await run({ ...HAPPY, chain: 'permits' });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'permits_bumped_last_seen_at', 'permits_back_ref_updated', 'permits_back_ref_cleared_below_floor', 'cross_ward_cleaned',
      'total_candidates', 'potential_matches', 'effective_match_rate_pct', 'match_rate_pct',
      'matches_tier_1a_exact_ward', 'matches_tier_1b_exact_null_ward', 'matches_tier_1c_ward_conflict', 'matches_tier_2a_name_ward',
      'matches_tier_2b_name_null_ward', 'matches_tier_3_desc', 'tier_3_errors', 'unlinked_remaining', 'links_to_pre_permits',
      'cross_ward_links', 'enrichment_eligible_count', 'coa_inherited_from_permit_count', 'coa_lat_lng_upgraded_from_permit_count',
      'coa_ward_filled_from_permit_count', 'coa_ward_mismatch_with_permit_count', 'coa_below_confidence_floor_count',
      'lead_identity_lat_lng_mismatch_count', 'stale_back_refs_cleared_count', 'inherited_confidence_floor',
    ]);
    expect(meta(o).audit_table).toMatchObject({ phase: 12, name: 'Link CoA', verdict: 'PASS' });
    expect(row(o, 'match_rate_pct')).toMatchObject({ value: 60, status: 'INFO' });
    const s = o.summaries[0];
    expect([s?.records_total, s?.records_new, s?.records_updated]).toEqual([3, 0, 3]);
    expect(Object.keys(meta(o))).toEqual([
      'duration_ms', 'cross_ward_cleaned', 'matches_tier_1a_exact_ward', 'matches_tier_1b_exact_null_ward', 'matches_tier_1c_ward_conflict',
      'matches_tier_2a_name_ward', 'matches_tier_2b_name_null_ward', 'matches_tier_3_desc', 'tier_3_errors', 'match_rate_pct',
      'potential_matches', 'effective_match_rate_pct', 'unlinked_remaining', 'audit_table',
    ]);
    expect(o.metas[0]?.writes).toEqual({
      coa_applications: ['linked_permit_num', 'linked_confidence', 'latitude', 'longitude', 'ward'],
      permits: ['last_seen_at', 'linked_coa_application_number'],
    });
    // the declared reads omit columns the statements read (permit_type, lifecycle_phase, decision, linked_coa_application_number)
    expect(o.metas[0]?.reads.permits).not.toContain('permit_type');
    expect(o.metas[0]?.reads.coa_applications).not.toContain('decision');
    const coaChain = await run({ ...HAPPY, chain: 'coa' });
    expect(meta(coaChain.o).audit_table?.phase).toBe(4);
  });

  it('L15 — --dry-run (argv): COUNT-only tiers, no write of any kind, no bump / back-ref / inheritance; candidates exclude the would-be unlinks; while the manifest declares supports_dry_run false', async () => {
    const { o, err } = await run({ unlinked: 5, crossWard: [{ application_number: 'A1', permit_num: 'P9' }], dryTierCounts: [2, 0, 0, 1, 0], tier3: [t3(1, 'rear addition deck')], tier3Links: { 1: 'P7' }, argv: ['--dry-run'] });
    expect(err).toBeNull();
    expect(o.txns()).toBe(0);
    expect(o.queries.filter((q) => WRITE.test(q.norm))).toHaveLength(0);
    expect(sqlOf(o, /^SELECT COUNT\(DISTINCT ca2\.id\) as cnt/)).toHaveLength(5);
    expect(row(o, 'cross_ward_cleaned').value).toBe(1);
    expect(row(o, 'total_candidates').value).toBe(5);
    expect(row(o, 'matches_tier_3_desc').value).toBe(1);
    expect([row(o, 'permits_bumped_last_seen_at').value, row(o, 'permits_back_ref_updated').value, row(o, 'coa_inherited_from_permit_count').value]).toEqual([0, 0, 0]);
    const manifest = readJson<{ scripts: Record<string, { supports_dry_run?: boolean }> }>('scripts/manifest.json');
    expect(manifest.scripts.link_coa?.supports_dry_run).toBe(false);
  });

  it('L16 — a contended lock returns with no config load, no SQL and no summary (the SDK emits the SKIP)', async () => {
    const { o, err } = await run({ ...HAPPY, lockAcquired: false });
    expect(err).toBeNull();
    expect(o.events).toEqual(['lock 12']);
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
  });

  it('L17 — the frozen oracle text is byte-identical to the shipped script while it is still legacy (pipeline.run, not pipeline.step)', () => {
    const shell = readText(SHELL_REL);
    if (!/pipeline\.run\(/.test(shell)) return; // ② swapped the shell: the oracle stays frozen, this pin retires
    expect(readText(ORACLE_REL)).toBe(shell);
    expect(Object.keys(DEFAULT_LOGIC_VARS)).toEqual(['coa_match_conf_high', 'coa_match_conf_medium', 'coa_inherit_from_permit_min_confidence']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — the converted claims D1–D10 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a
// named registry state; ② / ③ flip each to `it` in the commit that lands it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type WriteSpec = { table: string; columns?: Array<{ name: string }>; write_discipline?: { class?: string; guard?: unknown } };
type Descriptor = {
  identity: { name: string; archetype: string; lock: number; spec: string };
  execution?: { shape?: string; tiers?: Array<{ id: string; confidence_from_config?: string }> };
  outputs: { writes: WriteSpec[]; invalidates?: Array<{ table: string; column: string; by?: string }> };
  staleness?: { mode_select?: string };
  guards?: { requires?: Array<{ kind: string; name: string }> };
  override?: { dry_run?: unknown };
  deviations?: Array<Record<string, unknown>>;
};

describe('link_coa ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype LINK (census, Spec 132 §core.4), lock 12, spec "42"; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.identity).toMatchObject({ name: 'link_coa', archetype: 'LINK', lock: LOCK_ID, spec: '42' });
    const shell = readText(SHELL_REL);
    expect(shell).toMatch(/pipeline\.step\(/);
    expect(shell).not.toMatch(/pipeline\.run\(/);
  });

  it.fails('D2 — mode and invalidators (Spec 132 §link.1): mode_select tri_state, or none with a full_rescan invalidator; both link columns (coa_applications.linked_permit_num, permits.linked_coa_application_number) are declared invalidators (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const inv = d.outputs.invalidates ?? [];
    expect(['tri_state', 'none']).toContain(d.staleness?.mode_select);
    if (d.staleness?.mode_select === 'none') expect(inv.some((i) => i.by === 'full_rescan')).toBe(true);
    expect(inv.some((i) => i.table === 'coa_applications' && i.column === 'linked_permit_num')).toBe(true);
    expect(inv.some((i) => i.table === 'permits' && i.column === 'linked_coa_application_number')).toBe(true);
  });

  it.fails('D3 — write discipline per target (Spec 132 §core.12): every write target declares a class and a guard; coa_applications and permits are both declared; coa_applications (RLS on, measured 2026-10-18) carries rls_bypass_or_policy (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.outputs.writes.length).toBeGreaterThan(0);
    for (const w of d.outputs.writes) {
      expect(typeof w.write_discipline?.class).toBe('string');
      expect(w.write_discipline?.guard).toBeDefined();
    }
    expect([...new Set(d.outputs.writes.map((w) => w.table))].sort()).toEqual(['coa_applications', 'permits']);
    expect((d.guards?.requires ?? []).some((r) => r.kind === 'rls_bypass_or_policy' && r.name === 'coa_applications')).toBe(true);
  });

  it.fails('D4 — EXTERNALIZED (Spec 132 §core.8): every tier confidence comes from a registered link_coa_* variable, and compute holds none of the legacy literals (tier confidences, the Tier-3 formula, the 500 batch, the 50 / 80 rate bands, 1 second, 90 days) (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const tiers = d.execution?.tiers ?? [];
    expect(tiers.length).toBeGreaterThanOrEqual(6);
    const seeds = readText('scripts/seeds/logic_variables.json');
    for (const t of tiers) {
      expect(t.confidence_from_config ?? '').toMatch(/^link_coa_/);
      expect(seeds).toContain(`"${t.confidence_from_config}"`);
    }
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/\b0\.(95|85|60|50|30|25|40|10)\b|\b500\b|INTERVAL '(1 second|90 days)'|<\s*50\b|<\s*80\b/);
  });

  it.fails('D5 — compute is pure (Spec 132 §core.9): no Date.now, no NOW(), no .query(, no transaction / lock wrapper, no pipeline require, no process.env / argv, no swallowing catch (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/Date\.now\(|\bNOW\(\)|\.query\(|withTransaction|withAdvisoryLock|require\(['"]\.\.\/pipeline['"]\)|process\.(env|argv)|\bcatch\b/);
  });

  it.fails('D6 — the permits.last_seen_at bump has a declared disposition (operator card Q-H1): either the descriptor writes no permits.last_seen_at, or a deviations[] entry names it and cites R-JM (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const writesSeen = d.outputs.writes.some((w) => w.table === 'permits' && (w.columns ?? []).some((c) => c.name === 'last_seen_at'));
    if (writesSeen) {
      expect((d.deviations ?? []).some((x) => /permits\.last_seen_at/.test(JSON.stringify(x)) && /R-JM/.test(JSON.stringify(x)))).toBe(true);
    } else {
      expect(readText(COMPUTE_REL)).not.toMatch(/last_seen_at/);
    }
  });

  it.fails('D7 — admin-verifiable (Spec 132 §core.16 (R-DL)): manifest telemetry_tables cover both written tables and STEP_EXPECTED_RANGES carries no hand-written link_coa range (derived from check bounds) (flips at ③)', () => {
    const manifest = readJson<{ scripts: Record<string, { telemetry_tables?: string[] }> }>('scripts/manifest.json');
    expect([...(manifest.scripts.link_coa?.telemetry_tables ?? [])].sort()).toEqual(['coa_applications', 'permits']);
    const funnel = readText('src/lib/admin/funnel.ts');
    expect(funnel).not.toMatch(/\n {2}link_coa: \{\n {4}behavior:/);
  });

  // Written by the CHAT-105 DB-backed step-validate --all --write at ① (ec981c21; Spec 124 R-R / Rule 13; compute_phase_calibration D6 precedent).
  it('D8 — the assessment report carries the generated validation scorecard (R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D9 — registered: converted.json converted[] holds scripts/link-coa.js (flips at ③)', () => {
    const conv = readJson<{ converted: string[] }>('scripts/steps/_schema/converted.json');
    expect(conv.converted).toContain(SHELL_REL);
  });

  it.fails('D10 — override honesty (Spec 132 §core.18): the descriptor declares override.dry_run and the manifest supports_dry_run agrees with it (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.override?.dry_run).toBeDefined();
    const manifest = readJson<{ scripts: Record<string, { supports_dry_run?: boolean }> }>('scripts/manifest.json');
    expect(manifest.scripts.link_coa?.supports_dry_run).toBe(d.override?.dry_run !== 'none');
  });
});
