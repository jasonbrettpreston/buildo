// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §3, §9
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 7)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5 (lock 61)
//
// Batch-2 row 3.4 — `load_heritage`, INGESTOR (converted members before it: load_ravines, address_points,
// parcels, load_centreline, massing, neighbourhoods) and the FIRST multi-primary INGESTOR: two CKAN
// shapefiles (register points, district polygons) → two targets, one txn per target (0x, RE-FREEZE #29).
// Commit form: compressed (R-PACE-1) — ① assessment + this suite, ② descriptor + compute + shell +
// seeds + POST goldens (every `it.fails` flips to `it`), ③ cutover.
//
// PART 1 (this peel, ①/1a) = the legacy ORACLE PINS: plain `it(...)`, GREEN today. The oracle
// (fixtures/legacy-harness.ts) evaluates the VERBATIM legacy source text
// (fixtures/legacy-load-heritage.js.txt, identical to scripts/load-heritage.js at the ① freeze)
// against a curated require shim and exposes the ordered pool.query()/emitSummary()/emitMeta()
// observables. These pins record what the legacy script DOES today, so a future conversion can
// prove it reproduced the same observable behaviour (Spec 123 §4.5) — they are NOT source-text
// assertions.
//
// PART 2 (peel 1c) = the CONVERTED claims. At ① each was wrapped `it.fails(...)` and RED as a NAMED
// MISSING ARTIFACT (descriptor / compute / notes / shell), recorded in
// docs/reports/red-evidence/load_heritage/pre2-artifacts-missing.json; at ② (2026-09-30) the
// artifacts landed and every claim flipped to a plain `it` (flipped GREEN at ②).
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOracle, type LegacyOpts, type FeaturesFixture } from './fixtures/legacy-harness';
import heritageFeatures from './fixtures/heritage-features.json';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/load-heritage.descriptor.json';
const NOTES_REL = 'scripts/load-heritage.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-heritage.js';
const SHELL_REL = 'scripts/load-heritage.js';
const REPORT_REL = 'docs/reports/2026-09-30-batch2-p3-4-load-heritage-assessment.md';
/** Spec 47 §A.5 lock registry row 61 [READ scripts/load-heritage.js:36]. */
const LOCK_ID = 61;

/** `records_meta.heritage_load` — the per-dataset sub-blocks the loader emits. */
interface HeritageLoadMeta {
  spec_version?: string;
  heritage_register?: Record<string, unknown>;
  heritage_districts?: Record<string, unknown>;
  geometry_update_pct?: number;
  mass_delete_pct?: number;
}

/** `records_meta.audit_table` — the §9 named-row block + its row-derived verdict. */
interface AuditTable {
  phase?: number;
  name?: string;
  verdict?: string;
  rows?: Array<{ metric: string; value: unknown; status: string }>;
}

/** `records_meta`, as an open bag (audit_table + heritage_load are the two keys we read). */
type RecordsMeta = Record<string, unknown> & { audit_table?: AuditTable; heritage_load?: HeritageLoadMeta };

/** A named §9 audit row (`records_meta.audit_table.rows[]`). */
interface AuditRow {
  metric: string;
  value: unknown;
  status: string;
}

/** `records_meta` of a summary payload (last payload wins). */
function summaryOf(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1]!;
  if (last === undefined) throw new Error('[row 3.4] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}

/** The §9 named audit rows from `records_meta.audit_table.rows[]`. */
function rows(o: LegacyOracle): AuditRow[] {
  const table = summaryOf(o).audit_table;
  if (table === undefined || !Array.isArray(table.rows)) {
    throw new Error('[row 3.4] records_meta.audit_table.rows[] missing from the emitted summary');
  }
  return table.rows;
}

/** Look up one named audit row by metric (last write wins). */
function row(o: LegacyOracle, metric: string): AuditRow {
  const hits = rows(o).filter((r) => r.metric === metric);
  const hit = hits[hits.length - 1];
  if (hit === undefined) {
    throw new Error(
      `[row 3.4] audit metric "${metric}" absent; emitted metrics were ${JSON.stringify([...new Set(rows(o).map((r) => r.metric))])}`,
    );
  }
  return hit;
}

/** The `records_meta.heritage_load` sub-object (per-dataset sub-blocks + combined pcts). */
function hl(o: LegacyOracle): HeritageLoadMeta {
  const sub = summaryOf(o).heritage_load;
  if (sub === null || typeof sub !== 'object' || Array.isArray(sub)) {
    throw new Error('[row 3.4] records_meta.heritage_load missing or not an object');
  }
  return sub;
}

/** The row-derived verdict from `records_meta.audit_table.verdict`. */
function verdict(o: LegacyOracle): string {
  const v = summaryOf(o).audit_table?.verdict;
  if (typeof v !== 'string') throw new Error('[row 3.4] records_meta.audit_table.verdict missing');
  return v;
}

/** The `records_meta.heritage_load.heritage_register` sub-block (feature_count, drift flags). */
function registerSub(o: LegacyOracle): Record<string, unknown> {
  const sub = hl(o).heritage_register;
  if (sub === null || sub === undefined || Array.isArray(sub)) {
    throw new Error('[row 3.4] records_meta.heritage_load.heritage_register missing');
  }
  return sub as Record<string, unknown>;
}

/** Every captured pool.query() whose SQL matches `re`. */
function sqlCalls(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[] }[] {
  return o.pool.queries.filter((q) => re.test(q.sql));
}

describe('row 3.4 — legacy oracle pins (GREEN today)', () => {
  // L1 (L25 classify) — status/HCD-type classification + filtering, from the committed fixture.
  it('L1 — L25 classify: per-dataset status counts, feature_count, and the three WARN/INFO rows', async () => {
    const o = loadLegacy();
    await o.runMain();

    // Register: 101 (Part IV), 102 (part v member), 103 (Part IV), 104 (Listed → filtered),
    // 105 (Demolished → filtered), 106 (Folder_Row=abc → bad source id), 107 (dup 101), 108 (no
    // Folder_Row). The three keyed rows are 101, 102, 103.
    expect(registerSub(o).filtered_out_listed).toBe(1);
    expect(registerSub(o).unknown_status_count).toBe(1);
    expect(registerSub(o).feature_count).toBe(3);

    // Districts: 1 (Designated District), 2 (DESIGNATED DISTRICT), 3 (Under Appeal → filtered),
    // 4 (Under Study → filtered), 5 (Proposed → unknown HCD type).
    const districts = hl(o).heritage_districts;
    if (districts === null || districts === undefined || Array.isArray(districts)) {
      throw new Error('[row 3.4] heritage_load.heritage_districts missing');
    }
    expect(districts.filtered_out_appeal_study).toBe(2);
    expect(districts.unknown_hcd_type_count).toBe(1);
    expect(districts.feature_count).toBe(2);

    // The register INSERT carries the three CLASSIFIED statuses, not the raw STATUS text.
    const insert = sqlCalls(o, /INSERT INTO heritage_properties/);
    expect(insert.length).toBeGreaterThan(0);
    const params = insert[0]!.params;
    expect(params[1]).toBe('part_iv'); // row 1 = 101
    expect(params[13]).toBe('part_v_member'); // row 2 = 102
    expect(params[25]).toBe('part_iv'); // row 3 = 103

    expect(row(o, 'heritage_unknown_status_count').value).toBe(1);
    expect(row(o, 'heritage_unknown_status_count').status).toBe('WARN');
    expect(row(o, 'heritage_unknown_hcd_type_count').value).toBe(1);
    expect(row(o, 'heritage_unknown_hcd_type_count').status).toBe('WARN');
    expect(row(o, 'heritage_filtered_listed_pct').value).toBe(0.2);
    expect(row(o, 'heritage_filtered_listed_pct').status).toBe('INFO');
  });

  // L2 (#426 fence) — source identity is Folder_Row, NEVER OBJECTID.
  it('L2 — key fence (#426): register ids are Folder_Row-derived (101/102/103), the OBJECTID-only row is a bad source id', async () => {
    const o = loadLegacy();
    await o.runMain();

    const insert = sqlCalls(o, /INSERT INTO heritage_properties/);
    const params = insert[0]!.params;
    expect(params[0]).toBe(101);
    expect(params[12]).toBe(102);
    expect(params[24]).toBe(103);
    // 999 (the OBJECTID-only row) and the filtered/bad rows are NEVER ids.
    for (let i = 0; i < params.length; i += 12) {
      expect(params[i]).not.toBe(999);
      expect(params[i]).not.toBe(104);
      expect(params[i]).not.toBe(105);
      expect(params[i]).not.toBe(106);
    }

    // Two bad ids: Folder_Row='abc' + the row with no Folder_Row but an OBJECTID.
    expect(row(o, 'heritage_register_bad_source_id_count').value).toBe(2);
    expect(row(o, 'heritage_register_bad_source_id_count').status).toBe('WARN');

    // Districts key on HCD_NO (a real integer column): 1 and 2.
    const dInsert = sqlCalls(o, /INSERT INTO heritage_districts/);
    expect(dInsert[0]!.params[0]).toBe(1);
    expect(dInsert[0]!.params[9]).toBe(2);
  });

  // L3 (BIGINT round-trip) — the id set is bound as a Postgres BIGINT[] both ways, and the
  // heritage_properties INSERT carries exactly 12 columns × 3 rows = 36 bind params.
  it('L3 — BIGINT round-trip: DELETE … <> ALL($1::BIGINT[]) and WITH input AS unnest($1::BIGINT[]) both bind [101,102,103]; the INSERT binds 36 params', async () => {
    const o = loadLegacy();
    await o.runMain();

    const del = sqlCalls(o, /DELETE FROM heritage_properties/);
    expect(del.length).toBeGreaterThan(0);
    expect(del[0]!.sql).toContain('source_id <> ALL($1::BIGINT[])');
    expect(del[0]!.params[0]).toEqual([101, 102, 103]);

    const input = sqlCalls(o, /WITH input AS/);
    expect(input.length).toBeGreaterThan(0);
    expect(input[0]!.sql).toContain('unnest($1::BIGINT[])');
    expect(input[0]!.params[0]).toEqual([101, 102, 103]);

    const insert = sqlCalls(o, /INSERT INTO heritage_properties/);
    expect(insert.length).toBeGreaterThan(0);
    expect(insert[0]!.params).toHaveLength(36);
  });

  // L4 (dedupe keep-first) — 101 appears twice (r1 Part IV, r7 Part V); the FIRST wins.
  it('L4 — dedupe keep-first: duplicate Folder_Row 101 keeps r1 (part_iv) over r7 (Part V), and the duplicate row is reported', async () => {
    const o = loadLegacy();
    await o.runMain();

    const insert = sqlCalls(o, /INSERT INTO heritage_properties/);
    const params = insert[0]!.params;
    expect(params[0]).toBe(101);
    expect(params[1]).toBe('part_iv');

    expect(row(o, 'heritage_register_duplicate_source_id_count').value).toBe(1);
    expect(row(o, 'heritage_register_duplicate_source_id_count').status).toBe('WARN');
  });

  // L5 (sentinel + address) — the 1899-11-30 sentinel date becomes NULL and a blank ADDRESS ''.
  it('L5 — sentinel + address: 102 designated_date 1899-11-30 → null, blank ADDRESS → "", 101 keeps 1990-05-01, and one coerced-empty row', async () => {
    const o = loadLegacy();
    await o.runMain();

    const insert = sqlCalls(o, /INSERT INTO heritage_properties/);
    const params = insert[0]!.params;
    expect(params[15]).toBeNull(); // 102 designated_date (sentinel)
    expect(params[20]).toBe(''); // 102 address (blank → coerced empty)
    expect(params[3]).toBe('1990-05-01'); // 101 designated_date (real)

    expect(row(o, 'heritage_address_coerced_empty_count').value).toBe(1);
    expect(row(o, 'heritage_address_coerced_empty_count').status).toBe('WARN');
  });

  // L6 (L14 zero-features first run) — a register with zero loadable features on the FIRST run
  // fails the register lane, does NOT touch heritage_properties, but districts still land, and
  // main() resolves (the failure is a REPORTED verdict, not a thrown error).
  it('L6 — L14 zero-features first run: register reports zero_features_first_run FAIL, writes no rows, districts still load, and main() resolves', async () => {
    const opts: LegacyOpts = {
      features: {
        heritage_register: [
          {
            properties: { Folder_Row: '104', STATUS: 'Listed', ADDRESS: '4 D ST' },
            geometry: { type: 'Point', coordinates: [-79.400003, 43.700003] },
          },
        ],
        heritage_districts: (heritageFeatures as FeaturesFixture).heritage_districts ?? [],
      },
    };
    const o = loadLegacy(opts);
    await expect(o.runMain()).resolves.toBeUndefined();

    expect(row(o, 'heritage_register_load_failed').value).toBe('zero_features_first_run');
    expect(row(o, 'heritage_register_load_failed').status).toBe('FAIL');
    expect(sqlCalls(o, /INSERT INTO heritage_properties/)).toHaveLength(0);
    expect(sqlCalls(o, /INSERT INTO heritage_districts/).length).toBeGreaterThan(0);
    expect(verdict(o)).toBe('FAIL');
  });

  // L7 (L7 count drift) — the prior-run feature_count is compared against the new load; ≥ the
  // threshold blocks the write unless the documented override env var is set.
  it('L7 — L7 count drift: 10→3 is drift 0.7 FAIL and blocks the register write; HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT=1 lets the write through but still reports drift', async () => {
    const priorMeta = {
      heritage_load: {
        heritage_register: {
          feature_count: 10,
          last_modified: 'Mon, 01 Jan 2024 00:00:00 GMT',
          content_hash: 'old',
        },
      },
    };

    const blocked = loadLegacy({ priorMeta });
    await blocked.runMain();
    expect(row(blocked, 'heritage_count_drift_pct').value).toBe(0.7);
    expect(row(blocked, 'heritage_count_drift_pct').status).toBe('FAIL');
    expect(row(blocked, 'heritage_register_load_failed').value).toBe('count_drift 0.7');
    expect(sqlCalls(blocked, /INSERT INTO heritage_properties/)).toHaveLength(0);
    // The drift check ran and did NOT pass; the failure is visible on the sub-block too.
    expect(registerSub(blocked).drift_check_passed).toBe(false);
    expect(registerSub(blocked).feature_count).toBe(3);

    const overridden = loadLegacy({
      priorMeta,
      env: { HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT: '1' },
    });
    await overridden.runMain();
    expect(sqlCalls(overridden, /INSERT INTO heritage_properties/).length).toBeGreaterThan(0);
    expect(row(overridden, 'heritage_count_drift_pct').status).toBe('FAIL');
    expect(row(overridden, 'heritage_override_feature_count_drift_present').status).toBe('WARN');
    // The override lane reports no register load failure, but the drift check itself still failed.
    expect(rows(overridden).some((r) => r.metric === 'heritage_register_load_failed')).toBe(false);
    expect(registerSub(overridden).drift_check_passed).toBe(false);
  });

  // L8 (L8 geometry skipped) — a `skipped_null` validation status can push the skipped ratio over
  // its limit and block the register write while districts still commit independently.
  it('L8 — L8 geometry skipped: a skipped_null on 102 gives skipped_pct 0.333 FAIL and blocks the register write; only districts commit (txns()=1)', async () => {
    const o = loadLegacy({ validation: { 102: 'skipped_null' } });
    await o.runMain();

    expect(row(o, 'heritage_geometry_skipped_pct').value).toBe(0.333);
    expect(row(o, 'heritage_geometry_skipped_pct').status).toBe('FAIL');
    expect(row(o, 'heritage_register_load_failed').value).toBe('geometry_skipped 0.333');
    expect(sqlCalls(o, /INSERT INTO heritage_properties/)).toHaveLength(0);
    expect(o.txns()).toBe(1);
  });
});

// L9–L13 (peel 1b) — the later-run / skip-tier / failure / mass-delete pins. Still plain `it`s:
// every one of these is GREEN today against the verbatim legacy text, and each names the fence
// or defect it locks (F-C1, DEC-K, LH-D8, LH-D1) so the ② conversion can prove it reproduced the
// same observable behaviour — never a source-text assertion.
describe('row 3.4 — legacy oracle pins, gates and skips (GREEN today)', () => {
  /** The prior-run last_modified the fixture's default HEAD validators never match. */
  const OLD = 'Mon, 01 Jan 2024 00:00:00 GMT';

  // L9 (F-C1 later run) — a LATER run whose parsed register set is EMPTY (every feature filtered
  // out) must NOT fire the orphan DELETE (the empty-set guard suppresses it, WARN only) and must
  // NOT create the first-run `zero_features_first_run` FAIL either. The guard is a log line, not
  // an audit row.
  it('L9 — F-C1 later-run empty set: no DELETE, delete_skipped_empty_guard true, a WARN log naming F-C1, and no empty_guard audit row', async () => {
    const o = loadLegacy({
      priorMeta: {
        heritage_load: {
          heritage_register: { feature_count: 0, last_modified: OLD, content_hash: 'old' },
        },
      },
      features: {
        ...(heritageFeatures as FeaturesFixture),
        // The r4 row (104, STATUS 'Listed') is the ONLY register feature → filtered_listed → the
        // parsed register set is empty while a prior sub-block makes this a LATER run.
        heritage_register: [
          {
            properties: { Folder_Row: '104', STATUS: 'Listed', ADDRESS: '4 D ST' },
            geometry: { type: 'Point', coordinates: [-79.400003, 43.700003] },
          },
        ],
      },
    });
    await o.runMain();

    // F-C1: the empty parsed set means the orphan DELETE is NEVER issued.
    expect(sqlCalls(o, /DELETE FROM heritage_properties/)).toHaveLength(0);
    expect(registerSub(o).delete_skipped_empty_guard).toBe(true);

    // The suppression is reported through the LOG, not as a named §9 audit row.
    const guardLogs = o.logs.filter(
      (l) => l.level === 'warn' && l.args.map((a) => String(a)).join(' ').includes('F-C1'),
    );
    expect(guardLogs.length).toBeGreaterThan(0);
    expect(rows(o).some((r) => String(r.metric).includes('empty_guard'))).toBe(false);
  });

  // L10 (DEC-K tier-1 carry) — a matching Last-Modified validator skips the register BEFORE any
  // download (HEAD only), carries the prior feature_count, and STILL re-pins spec_version to the
  // CURRENT version AFTER the prior spread (the load-ravines BUG-2 rule). The districts lane is
  // independent and still loads.
  it('L10 — DEC-K tier-1 skip: HEAD-only fetch, carried feature_count, spec_version re-pinned to 1.1, skipped_reason unchanged_last_modified, no register INSERT', async () => {
    const priorMeta = {
      heritage_load: {
        heritage_register: {
          spec_version: '1.0',
          feature_count: 8824,
          last_modified: 'Tue, 01 Sep 2026 22:16:33 GMT',
          etag: '"e1"',
          content_hash: 'bdca',
          source_dataset_version: 'bdca',
          drift_check_passed: true,
        },
      },
    };
    const o = loadLegacy({ priorMeta });
    await o.runMain();

    // Tier-1 fired on metadata before the download: the register lane issued HEAD and NO GET.
    const regFetches = o.fetchCalls.filter((c) => c.key === 'heritage_register');
    expect(regFetches.length).toBeGreaterThan(0);
    expect(regFetches.every((c) => c.method === 'HEAD')).toBe(true);
    expect(regFetches.some((c) => c.method === 'GET')).toBe(false);

    const sub = registerSub(o);
    expect(sub.feature_count).toBe(8824);
    expect(sub.spec_version).toBe('1.1'); // re-pinned AFTER the prior spread
    expect(sub.skipped_reason).toBe('unchanged_last_modified');
    expect(sub.features_inserted).toBe(0);

    expect(row(o, 'heritage_register_load_skipped').value).toBe('unchanged_last_modified');
    expect(row(o, 'heritage_register_load_skipped').status).toBe('INFO');
    const last = o.summaries[o.summaries.length - 1]!;
    expect(last.records_total).toBe(8826); // 8824 register (carried) + 2 districts
    expect(sqlCalls(o, /INSERT INTO heritage_properties/)).toHaveLength(0);
  });

  // L11 (tier-2 content-hash skip) — metadata differs (tier-1 says "changed") so the bytes ARE
  // downloaded, but the md5 of those bytes equals the prior content_hash, so tier-2 skips AFTER
  // the download, BEFORE parse/validate/upsert.
  it('L11 — tier-2 content-hash skip: GET issued, md5 matches, exactly one validation round-trip (districts), sub pin unchanged_content_hash', async () => {
    const H = createHash('md5')
      .update(JSON.stringify((heritageFeatures as FeaturesFixture).heritage_register))
      .digest('hex');
    const priorMeta = {
      heritage_load: {
        heritage_register: {
          feature_count: 8824,
          last_modified: OLD,
          content_hash: H,
          source_dataset_version: H,
        },
      },
    };
    const o = loadLegacy({ priorMeta });
    await o.runMain();

    // Tier-1 could not skip (Last-Modified differs) → the register bytes were fetched.
    expect(
      o.fetchCalls.some((c) => c.key === 'heritage_register' && c.method === 'GET'),
    ).toBe(true);
    // Tier-2 skipped before parse, so the ONLY §3.5 validation round-trip is the districts lane's.
    expect(sqlCalls(o, /WITH input AS/)).toHaveLength(1);

    const sub = registerSub(o);
    expect(sub.skipped_reason).toBe('unchanged_content_hash');
    expect(sub.feature_count).toBe(8824);
    expect(sub.spec_version).toBe('1.1');
    expect(sub.content_hash).toBe(H);
    expect(row(o, 'heritage_register_load_skipped').value).toBe('unchanged_content_hash');
  });

  // L12 (DEC-K + LH-D8, pinned WRONG form) — a non-2xx HEAD fails the register lane with a
  // `head:HEAD 500` reason, but the districts lane commits INDEPENDENTLY, and main() still
  // RESOLVES (the legacy returns {failed:true}, which pipeline.run ignores ⇒ the run is recorded
  // completed). The zero-skeleton sub the consumer halts on.
  it('L12 — LH-D8 head 500: heritage_register_load_failed "head:HEAD 500…" FAIL, districts still insert, skeleton sub, verdict FAIL, main() resolves', async () => {
    const o = loadLegacy({ head: { heritage_register: { status: 500 } } });
    await expect(o.runMain()).resolves.toBeUndefined();

    const failed = row(o, 'heritage_register_load_failed');
    expect(String(failed.value).startsWith('head:HEAD 500')).toBe(true);
    expect(failed.status).toBe('FAIL');
    // Districts are an INDEPENDENT primary (DEC-K): the register failure does not block them.
    expect(sqlCalls(o, /INSERT INTO heritage_districts/).length).toBeGreaterThan(0);

    const sub = registerSub(o);
    expect(sub.feature_count).toBe(0);
    expect(sub.source_dataset_version).toBeNull();
    expect(verdict(o)).toBe('FAIL');
    const last = o.summaries[o.summaries.length - 1]!;
    expect(last.records_total).toBe(2); // 0 register + 2 districts
  });

  // L13 (LH-D1, pinned WRONG form) — the mass-delete check is scored AFTER the orphan DELETE has
  // already committed inside the transaction: the guard catches the deletion retroactively, never
  // prevents it. drift_check_passed stays true (the only flag `enrich_heritage` reads).
  it('L13 — LH-D1 mass delete scored post-commit: DELETE present, features_deleted 3, mass_delete 0.75 FAIL, override removes the FAIL row but not the pct', async () => {
    const priorMeta = {
      heritage_load: {
        heritage_register: { feature_count: 4, last_modified: OLD, content_hash: 'old' },
      },
    };

    const o = loadLegacy({ priorMeta, existing: { heritage_properties: [201, 202, 203] } });
    await o.runMain();

    // The DELETE ran: 3 of the 4 previously-known rows are gone.
    expect(sqlCalls(o, /DELETE FROM heritage_properties/).length).toBeGreaterThan(0);
    const sub = registerSub(o);
    expect(sub.features_deleted).toBe(3);
    expect(sub.mass_delete_check_passed).toBe(false);
    expect(sub.drift_check_passed).toBe(true); // enrich_heritage reads ONLY this flag
    expect(row(o, 'heritage_mass_delete_pct').value).toBe(0.75);
    expect(row(o, 'heritage_mass_delete_pct').status).toBe('FAIL');
    expect(row(o, 'heritage_register_load_failed').value).toBe('mass_delete 0.75');

    const overridden = loadLegacy({
      priorMeta,
      existing: { heritage_properties: [201, 202, 203] },
      env: { HERITAGE_ACCEPT_MASS_DELETE: '1' },
    });
    await overridden.runMain();

    expect(rows(overridden).some((r) => r.metric === 'heritage_register_load_failed')).toBe(false);
    expect(row(overridden, 'heritage_mass_delete_pct').value).toBe(0.75);
    expect(row(overridden, 'heritage_mass_delete_pct').status).toBe('FAIL');
    expect(row(overridden, 'heritage_override_mass_delete_present').status).toBe('WARN');
  });
});

// L14–L18 (peel 1c) — the guard / prior / lock / age / emit-shape pins. Still plain `it`s: every
// one is GREEN today against the verbatim legacy text and names the fence or defect it locks
// (LH-D2, LH-D3, §R12 lock, L9 age, §9 meta freeze) so the ② conversion can prove it reproduced
// the same observable behaviour — never a source-text assertion.
describe('row 3.4 — legacy oracle pins, guard / prior / lock / age / emit shape (GREEN today)', () => {
  /** The prior-run last_modified the fixture's default HEAD validators never match. */
  const OLD = 'Mon, 01 Jan 2024 00:00:00 GMT';

  /** Collapse an upsert's SQL to single spaces so a `.contains` pin is whitespace-insensitive. */
  const norm = (s: string): string => s.replace(/\s+/g, ' ');

  /** Split an upsert at the LAST ` WHERE ` into the DO UPDATE SET arm and the query's guard. */
  function splitUpsert(sql: string): { setPart: string; wherePart: string } {
    const s = norm(sql);
    const at = s.lastIndexOf(' WHERE ');
    if (at < 0) throw new Error(`[row 3.4] upsert SQL carries no WHERE clause: ${s}`);
    return { setPart: s.slice(0, at), wherePart: s.slice(at + ' WHERE '.length) };
  }

  // The first (and only, at these feature counts) upsert per table — the SQL/text shape pins.
  const registerUpsert = (o: LegacyOracle): { setPart: string; wherePart: string } => {
    const calls = sqlCalls(o, /INSERT INTO heritage_properties/);
    if (calls.length === 0) throw new Error('[row 3.4] no heritage_properties upsert was issued');
    return splitUpsert(calls[0]!.sql);
  };
  const districtUpsert = (o: LegacyOracle): { setPart: string; wherePart: string } => {
    const calls = sqlCalls(o, /INSERT INTO heritage_districts/);
    if (calls.length === 0) throw new Error('[row 3.4] no heritage_districts upsert was issued');
    return splitUpsert(calls[0]!.sql);
  };

  // L14 (LH-D2, pinned WRONG form) — the version stamp forces an UPDATE: `source_dataset_version`
  // sits in the ON CONFLICT guard, so EVERY rewritten row counts as `updated` even when nothing
  // but the version changed. A version-only rewrite therefore reads as a 100% geometry update.
  it('L14 — LH-D2 version stamp in the guard: source_dataset_version IS DISTINCT FROM is a guard arm (not on the five plain SET columns), districts guard the four arms only, and a version-only rewrite reads geometry_update_pct 1 WARN', async () => {
    const o = loadLegacy({
      priorMeta: {
        heritage_load: {
          heritage_register: { feature_count: 3, last_modified: OLD, content_hash: 'old' },
        },
      },
      existing: { heritage_properties: [101, 102, 103] },
    });
    await o.runMain();

    const reg = registerUpsert(o);
    // The version stamp IS a guard arm → a version-only change still fires the UPDATE.
    expect(reg.wherePart).toContain(
      'heritage_properties.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version',
    );
    // The five plain SET columns are rewritten, but NONE of them is a guard arm.
    for (const c of ['bylaw_no', 'htg_conser_name', 'building_type', 'reason', 'construction_year']) {
      expect(reg.setPart).toContain(`${c} = EXCLUDED.${c}`);
      expect(reg.wherePart).not.toContain(`${c} IS DISTINCT FROM`);
    }

    const hcd = districtUpsert(o);
    for (const c of ['geom', 'name', 'designated_date', 'source_dataset_version']) {
      expect(hcd.wherePart).toContain(`heritage_districts.${c} IS DISTINCT FROM`);
    }
    for (const c of ['hcd_type', 'bylaw_no', 'wards']) {
      expect(hcd.wherePart).not.toContain(`${c} IS DISTINCT FROM`);
    }

    // The version stamp re-writes all three previously-known rows → updated 3 of prior 3.
    const sub = registerSub(o);
    expect(sub.features_updated).toBe(3);
    expect(sub.geometry_update_pct).toBe(1);
    // …and the WARN row records the version-only rewrite as a 100% geometry update.
    expect(row(o, 'heritage_geometry_update_pct').value).toBe(1);
    expect(row(o, 'heritage_geometry_update_pct').status).toBe('WARN');
  });

  // L15 (LH-D3) — a FAILED prior-run read degrades to a first-run baseline (WARN log, never a
  // throw): the register still loads, and NO *_load_skipped row is emitted for either dataset.
  it('L15 — LH-D3 prior-read failure degrades to first run: a warn log names the failure, heritage_properties still inserts, and no *_load_skipped row appears', async () => {
    const o = loadLegacy({ priorError: true });
    await expect(o.runMain()).resolves.toBeUndefined();

    const warned = o.logs.filter(
      (l) => l.level === 'warn' && l.args.map((a) => String(a)).join(' ').includes('prior-run query failed'),
    );
    expect(warned.length).toBeGreaterThan(0);

    expect(sqlCalls(o, /INSERT INTO heritage_properties/).length).toBeGreaterThan(0);
    expect(rows(o).some((r) => String(r.metric).endsWith('_load_skipped'))).toBe(false);
  });

  // L16 (§R12 lock 61) — lock contention short-circuits main(): no summary, no meta, no fetch.
  it('L16 — lock contention: withAdvisoryLock { acquired:false } leaves summaries, metas and fetchCalls all empty', async () => {
    const o = loadLegacy({ lockAcquired: false });
    await o.runMain();

    expect(o.summaries).toHaveLength(0);
    expect(o.metas).toHaveLength(0);
    expect(o.fetchCalls).toHaveLength(0);
  });

  // L19 (force seam, operator ruling 2026-10-01) — the ① PRE golden is captured by running the
  // LEGACY loader with HERITAGE_FORCE_RELOAD=1. A register whose HEAD validators MATCH its prior
  // sub-block would normally take the DEC-K tier-1 skip; forced, the skip decision is overridden to
  // "load" (a GET is issued, the register lane loads normally) and the audit table carries
  // heritage_override_force_reload_present = true / WARN. Unset, the register skips
  // (unchanged_last_modified) and that row is ABSENT.
  it('L19 — force seam (operator ruling 2026-10-01): HERITAGE_FORCE_RELOAD=1 loads a register whose validators match its prior sub-block and pushes heritage_override_force_reload_present WARN; unset, the register skips and the row is absent', async () => {
    // L10's register prior, at the fixture's own register count (3) so the L7 drift check cannot
    // block the forced write; validators match the served HEAD exactly (same Last-Modified, no etag).
    const priorMeta = {
      heritage_load: {
        heritage_register: {
          spec_version: '1.0',
          feature_count: 3,
          last_modified: 'Tue, 01 Sep 2026 22:16:33 GMT',
          content_hash: 'bdca',
          source_dataset_version: 'bdca',
          drift_check_passed: true,
        },
      },
    };

    // Unset: the tier-1 skip fires, so no register GET and no force-override row.
    const off = loadLegacy({ priorMeta });
    await off.runMain();
    expect(registerSub(off).skipped_reason).toBe('unchanged_last_modified');
    expect(rows(off).some((r) => r.metric === 'heritage_override_force_reload_present')).toBe(false);
    expect(off.fetchCalls.filter((c) => c.key === 'heritage_register').some((c) => c.method === 'GET')).toBe(false);

    // Forced: the skip is overridden, the register bytes are downloaded, validated, and written.
    const on = loadLegacy({ priorMeta, env: { HERITAGE_FORCE_RELOAD: '1' } });
    await on.runMain();
    expect(on.fetchCalls.filter((c) => c.key === 'heritage_register').some((c) => c.method === 'GET')).toBe(true);
    expect(registerSub(on).skipped_reason).toBeNull();
    expect(sqlCalls(on, /INSERT INTO heritage_properties/).length).toBeGreaterThan(0);
    expect(row(on, 'heritage_override_force_reload_present').value).toBe(true);
    expect(row(on, 'heritage_override_force_reload_present').status).toBe('WARN');
  });

  // L17 (L9 dataset age) — both HEAD Last-Modified validators sit ~2 years before RUN_AT
  // (2026-09-30T00:00:00Z): the FLOOR'd year count is 3 and 3 > the 2-year threshold → WARN.
  it('L17 — dataset age (L9 knob, 2 years): both datasets re-stamped 2023-09-01 → heritage_dataset_age_years 3 WARN', async () => {
    const AGED = 'Fri, 01 Sep 2023 00:00:00 GMT';
    const o = loadLegacy({
      head: {
        heritage_register: { lastModified: AGED },
        heritage_districts: { lastModified: AGED },
      },
    });
    await o.runMain();

    expect(row(o, 'heritage_dataset_age_years').value).toBe(3);
    expect(row(o, 'heritage_dataset_age_years').status).toBe('WARN');
  });

  // L18 (§9 emit freeze) — the emitted records_meta shape a converted implementation must
  // reproduce byte-for-byte: the audit-table identity, the two key sets (no extras, none
  // missing), the register version pinning, and the emitMeta read/write/external triple.
  it('L18 — emit shape (§9 freeze): audit_table phase 61 / name "Heritage Properties", the frozen heritage_load + register key sets, source_dataset_version === md5 GET bytes, records 5/5/0, and the emitMeta read/write/external triple', async () => {
    const o = loadLegacy();
    await o.runMain();

    const table = summaryOf(o).audit_table;
    expect(table?.phase).toBe(61);
    expect(table?.name).toBe('Heritage Properties');

    expect(Object.keys(hl(o)).sort()).toEqual([
      'geometry_update_pct',
      'heritage_districts',
      'heritage_register',
      'mass_delete_pct',
      'spec_version',
    ]);

    const sub = registerSub(o);
    expect(Object.keys(sub).sort()).toEqual([
      'content_hash',
      'delete_skipped_empty_guard',
      'drift_check_passed',
      'etag',
      'feature_count',
      'features_deleted',
      'features_inserted',
      'features_updated',
      'filtered_out_listed',
      'geometry_collection_extracted',
      'geometry_update_pct',
      'invalid_geometry_repaired',
      'invalid_geometry_skipped',
      'last_modified',
      'mass_delete_check_passed',
      'skipped_reason',
      'source_dataset_version',
      'spec_version',
      'unknown_status_count',
    ]);

    // The register's version IS the md5 of the exact GET bytes the oracle served for it.
    const registerBytes = JSON.stringify((heritageFeatures as FeaturesFixture).heritage_register);
    const expectedHash = createHash('md5').update(registerBytes).digest('hex');
    expect(sub.content_hash).toBe(expectedHash);
    expect(sub.source_dataset_version).toBe(expectedHash);

    const last = o.summaries[o.summaries.length - 1]!;
    expect(last.records_total).toBe(5); // 3 register + 2 districts
    expect(last.records_new).toBe(5);
    expect(last.records_updated).toBe(0);

    expect(o.metas).toHaveLength(1);
    const meta = o.metas[0]!;
    expect(Object.keys(meta.reads)).toEqual([
      'ckan:heritage-register-wgs84',
      'ckan:heritage-conservation-districts',
    ]);
    expect(meta.writes.heritage_properties).toHaveLength(13);
    expect(meta.writes.heritage_districts).toHaveLength(10);
    expect(meta.externals).toEqual(['CKAN']);
  });
});
// ===========================================================================
// PART 2a (peel 1c) — the converted claims D1–D7 (it.fails at ①, flipped to it at ②)
// and RED today as a NAMED MISSING ARTIFACT (descriptor / compute / notes /
// shell / assert-schema copy), never as a TS or import error — `it.fails()`
// INVERTS, so a fully-green run of this block is itself the proof every claim
// is genuinely red at this commit. Each body's FIRST statement reaches for a
// future artifact through `loadDescriptor()` / `loadComputeModule()` /
// `artifact(...)`, so the RED reason is the missing file, named.
//
// Gate answers folded into these claims (as recorded): external ids
// `heritage_register` / `heritage_districts` (NOT the `ckan:` keys), the ①
// sub-block-name decision; `on_failure:"fail_row_continue"`;
// `retries_from_config:"none"` (the legacy has no retry);
// guard columns = the legacy set; `identity.lock` 61; `spec_version` "1.1".
// The oracle's `module.exports` helpers (`REGISTER_URL`, `HCD_URL`,
// `LICENSE_URL`, `coerceSourceId`, `dedupeBySourceId`) are the parity source.
// ===========================================================================

// ---------------------------------------------------------------------------
// Artifact helpers (copied from src/tests/steps/neighbourhoods/violations.test.ts:68-145)
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.4 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (Spec 122 §4.2)
  return d;
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  coerceKey?: (raw: unknown, ctx?: { geojson?: string | null }) => number | null;
  shapeRecord?: (record: unknown, seam: unknown) => Record<string, unknown> | null;
  dedupeBySourceId?: (rows: Record<string, unknown>[]) => {
    kept: Record<string, unknown>[];
    duplicateCount: number;
  };
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return mod;
}

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

// ---------------------------------------------------------------------------
// Descriptor / compute shapes (declared here so the types are one home)
// ---------------------------------------------------------------------------

interface Check {
  id: string;
  kind: string;
  severity: string;
  blocking: boolean;
  when: string;
  limit: unknown;
  limit_from_config?: string;
  [k: string]: unknown;
}

interface ExternalSpec {
  id: string;
  kind: string;
  format: string;
  license?: string;
  on_failure?: string;
  key_property?: string;
  [k: string]: unknown;
}

interface WriteSpec {
  table: string;
  key: string | string[];
  key_sql_type?: string;
  retract?: string;
  geometry_kind?: string;
  columns: Array<{ name: string; on_empty?: string; written?: string; bind?: string }>;
  write_discipline: {
    class: string;
    guard_columns: unknown;
    idempotent_rerun?: string;
    set_source?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface Descriptor {
  identity: {
    name: string;
    archetype: string;
    lock: number;
    spec: string;
    spec_version?: string;
    display_name?: string;
    [k: string]: unknown;
  };
  /** Spec 122 §5.1 — the frozen shape lives under `execution`. */
  execution: {
    shape: string;
    network?: { retries_from_config?: string; timeout_from_config?: string; [k: string]: unknown };
    [k: string]: unknown;
  };
  inputs: { reads: { externals: ExternalSpec[] } };
  outputs: 'none' | { writes: WriteSpec[]; invalidates?: unknown };
  checks: Check[];
  [k: string]: unknown;
}

// Copied for parity with the neighbourhoods helper block (row 3.4); claimed by part 2b.
function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function writeByTable(d: Descriptor, table: string): WriteSpec {
  const w = writes(d).find((x) => x.table === table);
  expect(w, `descriptor declares no write target "${table}"`).toBeDefined();
  return w as WriteSpec;
}

describe('row 3.4 — converted claims part A (flipped GREEN at ②)', () => {
  // D1 — identity / shape / shell (the §5.1 frozen shell + §A.5 lock 61).
  it('D1 — identity and frozen shell: descriptor AJV-valid, identity lock 61 / spec "61" / spec_version "1.1" / archetype INGESTOR, execution.shape "ingest", notes + shell exist, shell is a pipeline.step() with ADVISORY_LOCK_ID = 61 (flipped GREEN at ②)',
    () => {
      const d = loadDescriptor();

      expect(d.identity.name).toBe('load_heritage');
      expect(d.identity.archetype).toBe('INGESTOR');
      expect(d.identity.spec).toBe('61');
      expect(d.identity.lock).toBe(LOCK_ID);
      expect(d.identity.spec_version).toBe('1.1');
      expect(d.identity.display_name).toBe('Heritage Properties');
      expect(d.execution.shape).toBe('ingest');

      // The notes file exists (read its text — the named missing artifact if absent).
      expect(readText(NOTES_REL).length).toBeGreaterThan(0);

      // The frozen shell is a `pipeline.step(...)` declaration carrying the lock textual, and is
      // NOT the pre-conversion `pipeline.run(...)` loader.
      const shell = readText(SHELL_REL);
      expect(shell).toContain('pipeline.step(');
      expect(shell).toContain('ADVISORY_LOCK_ID = 61');
      expect(shell).not.toContain('pipeline.run(');
    },
  );

  // D2 — TWO primaries (① decision: ids are the frozen §9 sub-block names, not the `ckan:` keys).
  it('D2 — two primaries: externals ids ["heritage_register","heritage_districts"] in order, each http_file/shapefile_zip/license=LICENSE_URL/on_failure "fail_row_continue", key_property Folder_Row/HCD_NO, target heritage_properties/heritage_districts, url === legacy REGISTER_URL/HCD_URL AND the assert-schema.js copy matches verbatim (flipped GREEN at ②)',
    () => {
      const d = loadDescriptor();
      const legacy = loadLegacy().helpers;
      const LICENSE_URL = legacy.LICENSE_URL as string;
      const REGISTER_URL = legacy.REGISTER_URL as string;
      const HCD_URL = legacy.HCD_URL as string;

      const ext = d.inputs.reads.externals;
      expect(ext.map((e) => e.id)).toEqual(['heritage_register', 'heritage_districts']);

      for (const e of ext) {
        expect(e.kind).toBe('http_file');
        expect(e.format).toBe('shapefile_zip');
        expect(e.license).toBe(LICENSE_URL);
        expect(e.on_failure).toBe('fail_row_continue');
        expect(e).not.toHaveProperty('on_head_error');
      }

      expect(ext[0]!.key_property).toBe('Folder_Row');
      expect(ext[1]!.key_property).toBe('HCD_NO');
      expect(ext[0]!.url).toBe(REGISTER_URL);
      expect(ext[1]!.url).toBe(HCD_URL);
      expect(ext[0]!.target).toBe('heritage_properties');
      expect(ext[1]!.target).toBe('heritage_districts');

      expect(writeByTable(d, 'heritage_properties')).toBeDefined();
      expect(writeByTable(d, 'heritage_districts')).toBeDefined();

      // The second copy of both urls must not drift (the assert-schema.js §3.5 constants).
      const assertSchema = fs.readFileSync(abs('scripts/lib/compute/assert-schema.js'), 'utf8');
      expect(assertSchema).toContain(REGISTER_URL);
      expect(assertSchema).toContain(HCD_URL);
    },
  );

  // D3 — network: no retry (legacy has none), the download timeout from config.
  it('D3 — network: execution.network.retries_from_config "none" and timeout_from_config "load_heritage_download_timeout_ms" (flipped GREEN at ②)',
    () => {
      const d = loadDescriptor();
      expect(d.execution.network?.retries_from_config).toBe('none');
      expect(d.execution.network?.timeout_from_config).toBe('load_heritage_download_timeout_ms');
    },
  );

  // D4 — two write targets; the guard columns are the legacy set (LH-D2 pins the version stamp
  // INTO the guard until ④).
  it('D4 — two write targets: tables [heritage_properties, heritage_districts], each key source_id / key_sql_type BIGINT / retract "departed" / class upsert_scoped_departure_delete / guard is_distinct_from / idempotent_rerun zero_writes; geometry_kind point/polygon; sorted guard_columns match the legacy set (flipped GREEN at ②)',
    () => {
      const d = loadDescriptor();
      expect(writes(d).map((w) => w.table)).toEqual(['heritage_properties', 'heritage_districts']);

      for (const w of writes(d)) {
        expect(w.key).toBe('source_id');
        expect(w.key_sql_type).toBe('BIGINT');
        expect(w.retract).toBe('departed');
        expect(w.write_discipline.class).toBe('upsert_scoped_departure_delete');
        expect(w.write_discipline.guard).toBe('is_distinct_from');
        expect(w.write_discipline.idempotent_rerun).toBe('zero_writes');
      }

      expect(writeByTable(d, 'heritage_properties').geometry_kind).toBe('point');
      expect(writeByTable(d, 'heritage_districts').geometry_kind).toBe('polygon');

      // The guard set is derived from the legacy upsert's `IS DISTINCT FROM` arms.
      const guardColumns = (table: string): string[] => {
        const w = writeByTable(d, table);
        const raw = (w.write_discipline as { guard_columns?: unknown }).guard_columns;
        return Array.isArray(raw) ? [...(raw as string[])].sort() : [];
      };
      expect(guardColumns('heritage_properties')).toEqual([
        'address_text',
        'designated_date',
        'geom',
        'source_dataset_version',
        'status',
      ]);
      expect(guardColumns('heritage_districts')).toEqual([
        'designated_date',
        'geom',
        'name',
        'source_dataset_version',
      ]);
    },
  );

  // D5 — coerceKey parity with the oracle (L2 fence).
  it('D5 — coerceKey parity (L2): coerceKey(x) === legacy.coerceSourceId(x) for ["101",101,"0",0,"-5","abc","",undefined,null], and coerceKey("101") === 101 (flipped GREEN at ②)',
    () => {
      const mod = loadComputeModule();
      const legacy = loadLegacy().helpers;
      const coerceSourceId = legacy.coerceSourceId as (raw: unknown) => number | null;

      for (const x of ['101', 101, '0', 0, '-5', 'abc', '', undefined, null]) {
        expect(mod.coerceKey?.(x as never)).toBe(coerceSourceId(x));
      }
      expect(mod.coerceKey?.('101' as never)).toBe(101);
    },
  );

  // D6 — shapeRecord by record shape (L1/L5). The runner seam (`scripts/lib/step/index.js`
  // `shapeRecord(f.record, { geojson, config, run_at, tag })`) carries NO external id.
  it('D6 — shapeRecord by record shape: r1 ⇒ part_iv/1990-05-01/"1 A ST"/1900/B1, r2 ⇒ part_v_member/null/"" + tag "address_coerced_empty", r4 ⇒ filtered_listed, r5 ⇒ unknown_status, d1 ⇒ designated_district/Alpha HCD/2001-01-01/wards "10", d3 ⇒ filtered_appeal_study, d5 ⇒ unknown_hcd_type (flipped GREEN at ②)',
    () => {
      const mod = loadComputeModule();
      const fx = heritageFeatures as FeaturesFixture;
      const shaped = (record: unknown, tag: (n: string) => void): Record<string, unknown> | null =>
        mod.shapeRecord?.(record, {
          geojson: '{}',
          config: {},
          run_at: new Date(0),
          tag,
        }) ?? null;

      const r1 = shaped(fx.heritage_register![0]!.properties, () => {});
      expect(r1?.status).toBe('part_iv');
      expect(r1?.designated_date).toBe('1990-05-01');
      expect(r1?.address_text).toBe('1 A ST');
      expect(r1?.construction_year).toBe(1900);
      expect(r1?.bylaw_no).toBe('B1');

      const tags: string[] = [];
      const r2 = shaped(fx.heritage_register![1]!.properties, (n) => tags.push(n));
      expect(r2?.status).toBe('part_v_member');
      expect(r2?.designated_date).toBeNull();
      expect(r2?.address_text).toBe('');
      expect(tags).toEqual(['address_coerced_empty']);

      expect(shaped(fx.heritage_register![3]!.properties, () => {})).toBe('filtered_listed');
      expect(shaped(fx.heritage_register![4]!.properties, () => {})).toBe('unknown_status');

      const d1 = shaped(fx.heritage_districts![0]!.properties, () => {});
      expect(d1?.hcd_type).toBe('designated_district');
      expect(d1?.name).toBe('Alpha HCD');
      expect(d1?.designated_date).toBe('2001-01-01');
      expect(d1?.wards).toBe('10');

      expect(shaped(fx.heritage_districts![2]!.properties, () => {})).toBe('filtered_appeal_study');
      expect(shaped(fx.heritage_districts![4]!.properties, () => {})).toBe('unknown_hcd_type');
    },
  );

  // D7 — dedupe keep-first (L4).
  it('D7 — dedupe keep-first (L4): dedupeBySourceId([{source_id:1,a:"x"},{source_id:1,a:"y"},{source_id:2}]) deep-equals the legacy result and {kept:[{source_id:1,a:"x"},{source_id:2}], duplicateCount:1} (flipped GREEN at ②)',
    () => {
      const mod = loadComputeModule();
      const legacy = loadLegacy().helpers;
      const legacyDedupe = legacy.dedupeBySourceId as (
        rows: Record<string, unknown>[],
      ) => { kept: Record<string, unknown>[]; duplicateCount: number };

      const input = [{ source_id: 1, a: 'x' }, { source_id: 1, a: 'y' }, { source_id: 2 }];
      const mine = mod.dedupeBySourceId?.(input);
      expect(mine).toEqual(legacyDedupe(input));
      expect(mine).toEqual({ kept: [{ source_id: 1, a: 'x' }, { source_id: 2 }], duplicateCount: 1 });
    },
  );
});

describe('row 3.4 — converted claims part B (flipped GREEN at ②)', () => {
  // The declared seed row shape (`scripts/seeds/logic_variables.json`) — one `default` per name.
  interface SeedRow {
    default: unknown;
    [k: string]: unknown;
  }
  type Seed = Record<string, SeedRow>;

  /**
   * The slice of `step.schema.json` part 2b reads BEYOND the part-2a `Descriptor`: the §11 counter
   * contract, the Rule-3 config declaration, the §A.5 override block, the §9 emit freeze (with the
   * INGESTOR-pilot `skeleton` field set) and the DEC-K staleness posture. Read through ONE cast so
   * the part-2a interface stays the single home of the already-claimed fields.
   */
  interface StepDescriptorExtras {
    staleness?: {
      trigger?: 'none' | Array<{ signal: string; position: string; external?: string }>;
      on_prior_run_error?: string;
      [k: string]: unknown;
    };
    override?: unknown;
    emits?: 'none' | Array<{ key: string; type?: string; consumers: string[]; skeleton?: unknown }>;
    counters?: 'none' | {
      records_total: { source: string; scoped_by?: unknown };
      records_new: { source: string };
      records_updated: { source: string };
    };
    config?: 'none' | {
      logic_variables: Array<{ name: string; min?: unknown; max?: unknown; on_invalid: string }>;
      [k: string]: unknown;
    };
  }

  /** The part-2a descriptor plus the fields part 2b claims (one cast, one cast only). */
  function loadDescriptorExtras(): Descriptor & StepDescriptorExtras {
    return loadDescriptor() as Descriptor & StepDescriptorExtras;
  }

  /** `scripts/seeds/logic_variables.json` — parsed, not required (the RED reason stays the seed row). */
  function loadSeed(): Seed {
    const rel = 'scripts/seeds/logic_variables.json';
    expect(
      fs.existsSync(abs(rel)),
      `MISSING ARTIFACT ${rel} (the declared-variable registry)`,
    ).toBe(true);
    return JSON.parse(readText(rel)) as Seed;
  }

  /** A descriptor variable's declaration row, by name (the Rule-3 config.logic_variables entry). */
  function configVar(d: Descriptor & StepDescriptorExtras, name: string): { name: string; on_invalid: string } {
    const cfg = d.config;
    expect(cfg, 'config:"none" while the legacy ConfigSchema knobs exist is the hidden-variable failure Rule 3 closes').not.toBe('none');
    const declared = (cfg as { logic_variables: Array<{ name: string; on_invalid: string }> }).logic_variables;
    const row = declared.find((v) => v.name === name);
    expect(row, `config.logic_variables declares no "${name}"`).toBeDefined();
    return row as { name: string; on_invalid: string };
  }

  // D8 — the SEVEN logic variables (Rule 3) that externalize the legacy Zod-defaulted literals. The
  // names are the `load_heritage`-prefixed §6 knobs; each is a VERDICT bound (`on_invalid:"fail"`
  // gate answers) and its ratified default is the value the seed row carries, byte for byte.
  it('D8 — seven logic variables (Rule 3): config.logic_variables declares load_heritage_dataset_age_warn_years / _count_drift_fail_pct / _invalid_geometry_fail_pct / _mass_delete_fail_pct / _geometry_update_warn_pct / _download_timeout_ms / _round_scale, each on_invalid "fail", and the seed defaults are 2 / 0.5 / 0.05 / 0.5 / 0.5 / 60000 / 1000 (flipped GREEN at ②)',
    () => {
      const d = loadDescriptorExtras();
      const seed = loadSeed();

      // [config-variable name, expected ratified default] — order is the §6 / brief order.
      const VARS: Array<[string, number]> = [
        ['load_heritage_dataset_age_warn_years', 2],
        ['load_heritage_count_drift_fail_pct', 0.5],
        ['load_heritage_invalid_geometry_fail_pct', 0.05],
        ['load_heritage_mass_delete_fail_pct', 0.5],
        ['load_heritage_geometry_update_warn_pct', 0.5],
        ['load_heritage_download_timeout_ms', 60000],
        ['load_heritage_round_scale', 1000],
      ];

      const declaredNames = (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name);
      for (const [name] of VARS) {
        expect(declaredNames, `config.logic_variables must include "${name}"`).toContain(name);
        // Every one of the seven is a VERDICT bound — the gate answer is "fail".
        expect(configVar(d, name).on_invalid, `${name} is a verdict bound: on_invalid "fail"`).toBe('fail');
        // The seed row exists and its ratified default is the frozen literal.
        expect(seed[name], `${name} missing from scripts/seeds/logic_variables.json`).toBeDefined();
        expect(seed[name]?.default, `${name}.default must be the ratified literal`).toBe(VARS.find(([n]) => n === name)?.[1]);
      }
    },
  );

  // D9 — the five §7 checks (L7/L8/L7c/L7b/L9). Two are `pre_write` (they gate the register write
  // BEFORE the transaction opens — the "abort BEFORE any DB write" guarantee), the mass-delete is
  // `post` (LH-D1 PIN: scored AFTER the commit until ④), and the geometry-update / dataset-age are
  // WARN. Each limit is a `limit_from_config` verdict bound; and EVERY declared check is either
  // config-bound or the generic `viol == 0` form (Rule 3: no hidden literals).
  it('D9 — checks (L7/L8/L7c/L7b/L9): heritage_count_drift_pct pre_write FAIL limit_from_config load_heritage_count_drift_fail_pct; heritage_geometry_skipped_pct pre_write FAIL load_heritage_invalid_geometry_fail_pct; heritage_mass_delete_pct post FAIL load_heritage_mass_delete_fail_pct; heritage_geometry_update_pct post WARN load_heritage_geometry_update_warn_pct; heritage_dataset_age_years WARN load_heritage_dataset_age_warn_years; and every check is config-bound or limit "viol == 0" (flipped GREEN at ②)',
    () => {
      const d = loadDescriptorExtras();
      const declared = new Set(
        (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name),
      );

      // [check id, severity, when, limit_from_config] — the five §7 rules.
      const CHECKS: Array<[string, string, string, string]> = [
        ['heritage_count_drift_pct', 'FAIL', 'pre_write', 'load_heritage_count_drift_fail_pct'],
        ['heritage_geometry_skipped_pct', 'FAIL', 'pre_write', 'load_heritage_invalid_geometry_fail_pct'],
        ['heritage_mass_delete_pct', 'FAIL', 'post', 'load_heritage_mass_delete_fail_pct'],
        ['heritage_geometry_update_pct', 'WARN', 'post', 'load_heritage_geometry_update_warn_pct'],
        ['heritage_dataset_age_years', 'WARN', 'local', 'load_heritage_dataset_age_warn_years'],
      ];

      for (const [id, severity, when, varName] of CHECKS) {
        const c = checkById(d, id);
        expect(c.severity, `${id} severity`).toBe(severity);
        if (when !== 'local') expect(c.when, `${id} lifecycle position`).toBe(when);
        expect(c.limit_from_config, `${id} limit_from_config`).toBe(varName);
        // A bound that names a variable the config never declares is a dangling reference.
        expect(declared, `${id} limit_from_config "${varName}" must be a declared variable`).toContain(varName);
      }

      // LH-D1 PIN (flips at ④): the mass-delete is scored AFTER the commit, not before it.
      expect(checkById(d, 'heritage_mass_delete_pct').when, 'LH-D1: mass delete scored post-commit until ④').toBe('post');

      // EVERY declared check: config-bound OR the generic `viol == 0` form — no hidden literal.
      for (const c of d.checks) {
        const bound = c.limit_from_config;
        const generic = c.limit === 'viol == 0';
        expect(
          typeof bound === 'string' ? declared.has(bound) : generic,
          `${c.id}: limit must be a declared limit_from_config or the generic "viol == 0" (Rule 3)`,
        ).toBe(true);
      }
    },
  );

  // D10 — the override block (A-5 accept-anomaly + the force reload hatch). Each accept-anomaly
  // entry names a declared FAIL check; the env names are the two ad-hoc legacy reads, made
  // structural.
  it('D10 — overrides: override.accept_anomaly has {env:"HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT", check_id:"heritage_count_drift_pct"} and {env:"HERITAGE_ACCEPT_MASS_DELETE", check_id:"heritage_mass_delete_pct"}; override.force_run is "HERITAGE_FORCE_RELOAD" (flipped GREEN at ②)',
    () => {
      const d = loadDescriptorExtras();
      expect(d.override, 'override:"none" — no accept-anomaly hatch, the L7c rule becomes textual again').not.toBe('none');
      const o = d.override as {
        force_run?: string;
        accept_anomaly?: Array<{ env: string; check_id: string }>;
      };

      expect(Array.isArray(o.accept_anomaly), 'override.accept_anomaly[] (A-5 box)').toBe(true);
      expect(o.accept_anomaly).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            env: 'HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT',
            check_id: 'heritage_count_drift_pct',
          }),
          expect.objectContaining({
            env: 'HERITAGE_ACCEPT_MASS_DELETE',
            check_id: 'heritage_mass_delete_pct',
          }),
        ]),
      );

      expect(o.force_run, 'the force-reload hatch').toBe('HERITAGE_FORCE_RELOAD');
    },
  );

  // D11 — the emit + counters freeze (§9; ① decision: records_total is the declared two-sub-block
  // SUM). The emit key + consumer are the §8d contract; the two skeleton key sets are the frozen
  // per-dataset blocks (register + districts differ by exactly two counters).
  it('D11 — emit + counters: emits[0] key "heritage_load" consumers ["enrich_heritage", the cohort-differential tool]; skeleton.heritage_register ⊇ the frozen register field set; skeleton.heritage_districts the same with filtered_out_appeal_study / unknown_hcd_type_count in place of the register counters; counters.records_total.source is the two-sub-block SUM, records_new/updated are written.inserted/updated (flipped GREEN at ②)',
    () => {
      const d = loadDescriptorExtras();

      expect(d.emits, 'the loader emits records_meta.heritage_load').not.toBe('none');
      const emit = (d.emits as Array<{ key: string; consumers: string[]; skeleton?: unknown }>)[0];
      expect(emit, 'emits[0]').toBeDefined();
      expect(emit?.key).toBe('heritage_load');
      expect(emit?.consumers).toEqual(['enrich_heritage', 'scripts/analysis/load-heritage-cohort-differential.js']); // + the differential reader (gate D, P1-C8a 2026-10-03)

      // The two per-dataset skeleton key sets (the field set a gated skip / failure terminal
      // re-emits). Register carries the listed counter; districts the HCD-type one.
      const registerKeys = [
        'source_dataset_version',
        'last_modified',
        'etag',
        'content_hash',
        'feature_count',
        'filtered_out_listed',
        'unknown_status_count',
        'features_inserted',
        'features_updated',
        'features_deleted',
        'invalid_geometry_skipped',
        'drift_check_passed',
        'delete_skipped_empty_guard',
      ];
      const districtKeys = [
        'source_dataset_version',
        'last_modified',
        'etag',
        'content_hash',
        'feature_count',
        'filtered_out_appeal_study',
        'unknown_hcd_type_count',
        'features_inserted',
        'features_updated',
        'features_deleted',
        'invalid_geometry_skipped',
        'drift_check_passed',
        'delete_skipped_empty_guard',
      ];

      const skeleton = emit?.skeleton as
        | { heritage_register?: Record<string, unknown>; heritage_districts?: Record<string, unknown> }
        | undefined;
      expect(skeleton, 'emits[0].skeleton — the frozen producer block(s)').toBeDefined();
      const regSk = skeleton?.heritage_register;
      const dstSk = skeleton?.heritage_districts;
      expect(regSk, 'emits[0].skeleton.heritage_register').toBeDefined();
      expect(dstSk, 'emits[0].skeleton.heritage_districts').toBeDefined();
      for (const k of registerKeys) {
        expect(Object.keys(regSk as object), `heritage_register skeleton declares "${k}"`).toContain(k);
      }
      for (const k of districtKeys) {
        expect(Object.keys(dstSk as object), `heritage_districts skeleton declares "${k}"`).toContain(k);
      }
      // The two key sets differ by exactly the two dataset-specific counters.
      expect(Object.keys(regSk as object)).toContain('filtered_out_listed');
      expect(Object.keys(regSk as object)).not.toContain('filtered_out_appeal_study');
      expect(Object.keys(dstSk as object)).toContain('filtered_out_appeal_study');
      expect(Object.keys(dstSk as object)).not.toContain('filtered_out_listed');

      // §11 Counter Semantic Contract — records_total is the ① decision's declared two-sub-block SUM.
      expect(d.counters, 'a LOADER declares its counters (§11)').not.toBe('none');
      const c = d.counters as {
        records_total: { source: string };
        records_new: { source: string };
        records_updated: { source: string };
      };
      expect(c.records_total.source).toBe(
        'records_meta.heritage_load.heritage_register.feature_count + records_meta.heritage_load.heritage_districts.feature_count',
      );
      expect(c.records_new.source).toBe('written.inserted');
      expect(c.records_updated.source).toBe('written.updated');
    },
  );

  // D12 — staleness (DEC-K). BOTH primaries carry the two-tier gate: a `source_validator` @
  // pre_acquisition (tier-1 HEAD) and a `content_hash` @ post_acquisition (tier-2 md5), one pair
  // per external id. `on_prior_run_error:"warn_row"` is the LH-D3 parity posture (④a moves it to
  // `fail_step`).
  it('D12 — staleness (DEC-K): staleness.trigger has exactly 4 entries — {signal:"source_validator",position:"pre_acquisition",external:<id>} and {signal:"content_hash",position:"post_acquisition",external:<id>} for id in [heritage_register, heritage_districts]; staleness.on_prior_run_error is "warn_row" (flipped GREEN at ②)',
    () => {
      const d = loadDescriptorExtras();
      const triggers = d.staleness?.trigger;
      expect(Array.isArray(triggers), 'staleness.trigger must be an explicit array (DEC-K)').toBe(true);
      const t = triggers as Array<{ signal: string; position: string; external?: string }>;
      expect(t).toHaveLength(4);

      for (const id of ['heritage_register', 'heritage_districts']) {
        expect(t).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              signal: 'source_validator',
              position: 'pre_acquisition',
              external: id,
            }),
            expect.objectContaining({
              signal: 'content_hash',
              position: 'post_acquisition',
              external: id,
            }),
          ]),
        );
      }

      // LH-D3 parity (④a moves it to fail_step).
      expect(d.staleness?.on_prior_run_error).toBe('warn_row');
    },
  );
  // D13 — buildLoadMeta (LH-D8(b) PIN, flips at ④b): the failing-primary skeleton is pinned as the
  // WRONG zero form for now — a `failed` register/districts sub-block re-emits the zero skeleton
  // (feature_count 0, source_dataset_version null) instead of the carried prior sub-block. The
  // register lane here is `loaded` and surfaces its feature_count / filtered counters / inserts.
  it('D13 — buildLoadMeta (LH-D8(b) pinned wrong form): {heritage_load} with spec_version "1.1"; register feature_count 3 / filtered_out_listed 1 / unknown_status_count 1 / features_inserted 3; failing districts sub is the zero skeleton (feature_count 0, source_dataset_version null) (flipped GREEN at ②)',
    () => {
      const mod = loadComputeModule();
      const buildLoadMeta = mod.buildLoadMeta as (ctx: unknown) => {
        heritage_load?: HeritageLoadMeta;
      };

      const meta = buildLoadMeta({
        acquired: {
          primaries: {
            heritage_register: {
              outcome: 'loaded',
              feature_count: 3,
              shaped_skipped_by_reason: { filtered_listed: 1, unknown_status: 1 },
              content_hash: 'h1',
              source_dataset_version: 'h1',
            },
            heritage_districts: { outcome: 'failed', error: 'HEAD 500' },
          },
        },
        written: {
          by_target: { heritage_properties: { inserted: 3, updated: 0, deleted: 0 } },
        },
        config: { load_heritage_round_scale: 1000 },
        prior: null,
      });

      const sub = meta.heritage_load;
      expect(sub).toBeDefined();
      expect(sub?.spec_version).toBe('1.1');

      expect(sub?.heritage_register?.feature_count).toBe(3);
      expect(sub?.heritage_register?.filtered_out_listed).toBe(1);
      expect(sub?.heritage_register?.unknown_status_count).toBe(1);
      expect(sub?.heritage_register?.features_inserted).toBe(3);

      // LH-D8(b) PIN (flips at ④b): the failed primary re-emits the ZERO skeleton, losing the
      // prior/known sub-block — a zero feature_count and a null source_dataset_version.
      expect(sub?.heritage_districts?.feature_count).toBe(0);
      expect(sub?.heritage_districts?.source_dataset_version).toBeNull();
    },
  );

  // D14 — the declared defects the ① conversion records: the deviations (LH-D8, LH-D11) and the
  // limitations (LH-D6, LH-D9) must each be named by their LH-D id so the ④ work is traceable.
  it('D14 — declared defects: JSON.stringify(deviations) names LH-D8 and LH-D11; JSON.stringify(limitations) names LH-D6 and LH-D9 (flipped GREEN at ②)',
    () => {
      const d = loadDescriptor() as Descriptor & { deviations?: unknown; limitations?: unknown };

      expect(JSON.stringify(d.deviations)).toContain('LH-D8');
      expect(JSON.stringify(d.deviations)).toContain('LH-D11');
      expect(JSON.stringify(d.limitations)).toContain('LH-D6');
      expect(JSON.stringify(d.limitations)).toContain('LH-D9');
    },
  );

  // D15 — the converted force claim (L19): the descriptor declares an `invariant` / WARN / `pre` /
  // `blocking:false` check, limit `viol == 0`, that sits DIRECTLY AFTER the mass-delete row — the
  // forced legacy run pushed `heritage_override_force_reload_present` (value true) and the PRE and
  // POST audit tables must differ by exactly that one row (Rule 5: the check reads
  // `ctx.overrides.force_run`, which `resolveOverrides` derives from `override.force_run` =
  // HERITAGE_FORCE_RELOAD, never `process.env`).
  it('D15 — force row parity (L19): descriptor declares heritage_override_force_reload_present (invariant, WARN, when pre, limit "viol == 0") directly after heritage_override_mass_delete_present, and the compute check reports violations 1 / detail true under resolveOverrides(HERITAGE_FORCE_RELOAD=1), violations 0 / detail false unset',
    () => {
      // 1) the descriptor declaration, next to the mass-delete row it must accompany.
      const d = loadDescriptor();
      const c = checkById(d, 'heritage_override_force_reload_present');
      expect(c.kind).toBe('invariant');
      expect(c.severity).toBe('WARN');
      expect(c.when).toBe('pre');
      expect(c.limit).toBe('viol == 0');
      expect(c.blocking).toBe(false);

      const ids = d.checks.map((x) => x.id);
      expect(ids.indexOf('heritage_override_force_reload_present')).toBe(
        ids.indexOf('heritage_override_mass_delete_present') + 1,
      );

      // 2) the REAL check, driven by the REAL resolver for both branches.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
      const staleness = require(path.join(REPO_ROOT, 'scripts/lib/step/staleness.js')) as {
        resolveOverrides: (descriptor: unknown, env: unknown, argv?: unknown) => { force_run?: unknown };
      };

      const mod = loadComputeModule();
      const check = mod.checks?.heritage_override_force_reload_present as
        | ((ctx: unknown) => unknown)
        | undefined;
      expect(typeof check).toBe('function');

      const BRANCHES: Array<{ label: string; env: Record<string, string>; forced: boolean }> = [
        { label: 'HERITAGE_FORCE_RELOAD=1', env: { HERITAGE_FORCE_RELOAD: '1' }, forced: true },
        { label: 'unset', env: {}, forced: false },
      ];

      for (const { label, env, forced } of BRANCHES) {
        const reported: Array<[string, unknown]> = [];
        const ctx = {
          overrides: staleness.resolveOverrides(d, env),
          report: (id: string, r: unknown) => reported.push([id, r]),
        };

        (check as (ctx: unknown) => unknown)(ctx);

        expect(reported, `${label}: exactly the force row is reported`).toEqual([
          [
            'heritage_override_force_reload_present',
            forced ? { violations: 1, detail: true } : { violations: 0, detail: false },
          ],
        ]);
      }
    },
  );
});

// ===========================================================================
// Part 2c (peel 1c) — the commit-① assessment REPORT marker. A PLAIN `it`
// (GREEN today): it asserts the report narrative carries the compressed-form
// marker (R-PACE-1): two INGESTOR members are converted, so compressed is the default form (R-AH).
// ===========================================================================
describe('row 3.4 — the commit-① assessment report (plain it: GREEN today)', () => {
  it('the commit-① report states the compressed-form marker (R-PACE-1)', () => {
    expect(readText(REPORT_REL)).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});
