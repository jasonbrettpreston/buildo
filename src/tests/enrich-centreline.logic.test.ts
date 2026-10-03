// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §8d, §9 (L21/F5b/F5c/G4 grading)
//
// Pure-function tests for enrich_centreline: the diagnostic-row grading (L21 zero-intersection
// FAIL/WARN gate, the F5b/F5c/G4 WARN signals) and the row-derived verdict cascade. The §11 SQL
// behavior is covered by the DB test; this locks the threshold logic.
//
// RE-POINTED batch-2 row 3.10 commit ② (the conversion): the grading now lives in the
// descriptor's checks[] (bounds from the seeded logic variables) evaluated by the library's
// checkRow over the compute module's own check reports; the mode gate and the SQL builder
// live in the compute module. An ok WARN-severity row now renders PASS (was INFO — the tier
// rename, an explained diff); the inclusive pct boundary is EC-D11.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ec = require('../../scripts/lib/compute/enrich-centreline.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdict = require('../../scripts/lib/step/verdict.js');
const DESCRIPTOR = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/enrich-centreline.descriptor.json'), 'utf8'));
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const CFG: Record<string, number> = Object.fromEntries(
  Object.entries(SEEDS).filter(([k]) => k.startsWith('enrich_centreline_')).map(([k, v]) => [k, (v as { default: number }).default]),
);

type Row = { metric: string; value: unknown; status: string };
const byMetric = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.metric, r.status]));
const GRADED_IDS: Record<string, string> = {
  zeroPct: 'parcels_with_zero_centreline_intersections_pct',
  invalidGeom: 'parcels_invalid_geom_count',
  namePct: 'parcels_street_name_normalized_pct',
  nodeNullPct: 'centreline_intersection_id_null_pct',
  addrNullPct: 'parcels_address_number_null_pct',
};
/** The legacy gradeDiagnosticRows contract, answered by the converted path: compute check → library checkRow. */
function gradeDiagnosticRows(input: Record<string, number>): Row[] {
  const matched = Object.fromEntries(Object.entries(input).map(([k, v]) => [GRADED_IDS[k], v]));
  return Object.values(GRADED_IDS).map((id) => {
    let observation: unknown;
    ec.checks[id]({ matched, report: (_id: string, o: unknown) => { observation = o; } });
    return verdict.checkRow(DESCRIPTOR.checks.find((c: { id: string }) => c.id === id), observation, 'fail_step', CFG);
  });
}

describe('gradeDiagnosticRows — L21 zero-intersection gate (the verdict driver)', () => {
  const base = { zeroPct: 2, invalidGeom: 0, namePct: 95, nodeNullPct: 5, addrNullPct: 2 };

  it('zero-intersection < 10% → PASS', () => {
    expect(byMetric(gradeDiagnosticRows(base)).parcels_with_zero_centreline_intersections_pct).toBe('PASS');
  });
  it('10% ≤ zero-intersection < 40% → WARN', () => {
    expect(byMetric(gradeDiagnosticRows({ ...base, zeroPct: 25 })).parcels_with_zero_centreline_intersections_pct).toBe('WARN');
  });
  it('zero-intersection ≥ 40% → FAIL', () => {
    expect(byMetric(gradeDiagnosticRows({ ...base, zeroPct: 55 })).parcels_with_zero_centreline_intersections_pct).toBe('FAIL');
  });
  it('EC-D11 (declared deviation): the pct grammar is inclusive — exactly 10.0 reads PASS and exactly 40.0 reads WARN (legacy WARN / FAIL)', () => {
    expect(byMetric(gradeDiagnosticRows({ ...base, zeroPct: 10 })).parcels_with_zero_centreline_intersections_pct).toBe('PASS');
    expect(byMetric(gradeDiagnosticRows({ ...base, zeroPct: 40 })).parcels_with_zero_centreline_intersections_pct).toBe('WARN');
    expect(byMetric(gradeDiagnosticRows({ ...base, zeroPct: 10.01 })).parcels_with_zero_centreline_intersections_pct).toBe('WARN');
  });
});

describe('gradeDiagnosticRows — F5b/F5c/G4 diagnostic signals', () => {
  const ok = { zeroPct: 2, invalidGeom: 0, namePct: 95, nodeNullPct: 5, addrNullPct: 2 };

  it('street_name_normalized < 90% → WARN (P1-reliance, L29)', () => {
    expect(byMetric(gradeDiagnosticRows({ ...ok, namePct: 80 })).parcels_street_name_normalized_pct).toBe('WARN');
    expect(byMetric(gradeDiagnosticRows(ok)).parcels_street_name_normalized_pct).toBe('PASS');
  });
  it('intersection-id NULL > 50% → WARN (corner-detection signal, F5c)', () => {
    expect(byMetric(gradeDiagnosticRows({ ...ok, nodeNullPct: 60 })).centreline_intersection_id_null_pct).toBe('WARN');
    expect(byMetric(gradeDiagnosticRows(ok)).centreline_intersection_id_null_pct).toBe('PASS');
  });
  it('address_number NULL > 10% → WARN (P2 degradation, G4/F7)', () => {
    expect(byMetric(gradeDiagnosticRows({ ...ok, addrNullPct: 25 })).parcels_address_number_null_pct).toBe('WARN');
    expect(byMetric(gradeDiagnosticRows(ok)).parcels_address_number_null_pct).toBe('PASS');
  });
  it('invalid_geom_count is always INFO (root-cause signal, F2)', () => {
    expect(byMetric(gradeDiagnosticRows({ ...ok, invalidGeom: 9 })).parcels_invalid_geom_count).toBe('INFO');
  });
});

describe('verdictCascade — row-derived FAIL > WARN > PASS', () => {
  it('cascades correctly', () => {
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
    expect(verdict.deriveVerdict([{ status: 'WARN' }, { status: 'PASS' }])).toBe('WARN');
    expect(verdict.deriveVerdict([{ status: 'FAIL' }, { status: 'WARN' }])).toBe('FAIL');
  });
});

// WF2 P11-1 — version-skip gate regression locks.
describe('decideCentrelineMode — the version-skip gate', () => {
  const V = '79029bb3';
  it('changed producer version → full recompute (re-stamp all)', () => {
    expect(ec.decideCentrelineMode({ lastVersion: 'OLD', currentVersion: V, staleCount: 0 })).toBe('full');
  });
  it('no prior run (null lastVersion) → full (bootstrap)', () => {
    expect(ec.decideCentrelineMode({ lastVersion: null, currentVersion: V, staleCount: null })).toBe('full');
  });
  it('unchanged version + a NULL/stale-stamp parcel → INCREMENTAL, never skipped', () => {
    expect(ec.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 1 })).toBe('incremental');
    expect(ec.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 14512 })).toBe('incremental');
  });
  it('unchanged version + zero stale parcels → full skip', () => {
    expect(ec.decideCentrelineMode({ lastVersion: V, currentVersion: V, staleCount: 0 })).toBe('skip');
  });
});

describe('buildTempSql({scoped:true}) — the incremental restriction', () => {
  it('adds the NULL/stale-stamp predicate ($1 = current version) to the full build', () => {
    const full: string = ec.buildTempSql({ scoped: false }, CFG);
    const scoped: string = ec.buildTempSql({ scoped: true }, CFG);
    expect(scoped).not.toBe(full);
    expect(scoped).toContain('centreline_dataset_version_when_enriched IS DISTINCT FROM $1');
    expect((scoped.match(/\$1/g) || []).length).toBe(1);
    expect(full).not.toContain('IS DISTINCT FROM $1');
  });
});

describe('reduced modes — Observer-style COMPLETED emission (not a lock SKIP)', () => {
  const V = '79029bb3';
  const RUN_AT = new Date('2026-07-08T10:00:00Z');
  const noQuery = { query: async () => { throw new Error('a reduced mode must not query'); } };
  async function reduced(mode: string, staleCount: number) {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); return { rows: [{}], rowCount: 0 }; } };
    const passCtx = {
      full: false, config: CFG, onProgress: () => {},
      contract: { sourceDatasetVersion: V, lastVersion: V, staleCount, mode },
      joinUpdate: async () => 3,
    };
    const raw = await ec.runCentrelineJoinPass(client, passCtx);
    const post = await ec.computePostPhase(noQuery, { passRaw: { centreline_join: raw }, full: false, runAt: RUN_AT, config: CFG });
    const rows: Row[] = DESCRIPTOR.checks.map((check: { id: string }) => {
      let observation: unknown;
      ec.checks[check.id]({ matched: post.matched, elapsed_ms: 1, report: (_id: string, o: unknown) => { observation = o; } });
      return verdict.checkRow(check, observation, 'fail_step', CFG);
    });
    return { raw, post, rows, calls };
  }

  it('skip: no statement, 0 updated, PASS verdict, carries source_dataset_version', async () => {
    const { raw, post, rows, calls } = await reduced('skip', 0);
    expect(calls).toHaveLength(0); // no writes → stamps preserved → assertCentrelineEnriched coverage holds
    expect(raw.updated).toBe(0);
    expect(verdict.deriveVerdict(rows)).toBe('PASS');
    expect(post.matched.centreline_enrich.source_dataset_version).toBe(V); // gate reads this next run
    expect(post.matched.centreline_enrich.skip_reason).toBe('version_and_geometry_unchanged');
    expect(post.compute).toEqual({ parcels_scanned: 0, records_new_aggregate: 0 });
  });

  it('incremental: N updated, reason=incremental, recomputed = the stale count, every row INFO (EC-D1 carried)', async () => {
    const { raw, post, rows } = await reduced('incremental', 14512);
    expect(raw.updated).toBe(3);
    expect(post.matched.centreline_enrich.skip_reason).toBe('version_unchanged_incremental');
    expect(post.matched.centreline_enrich.parcels_recomputed).toBe(14512);
    expect(rows.every((r) => r.status === 'INFO')).toBe(true);
    expect(DESCRIPTOR.outputs.writes[0].columns.map((c: { name: string }) => c.name)).toContain('centreline_dataset_version_when_enriched');
  });
});

// EC-D10 FIXED (operator ruling R2 = (b), <DATE>): the producer and self reads admit every ledger
// form of the slug (scripts/lib/ledger.js slugForms) and both runner success statuses — registry-truth
// Phase 1 item 6 / gate #44 FAIL:PRODUCER. The oracle pins (violations.test.ts A2-A4) keep the legacy form.
// AMENDMENT (Spec 124 R-BG (iv), witness-unblock C3): a run whose audit table carries the
// `write_skipped_pre_write_warn` row is a skip_write preserve-and-WARN run — an empty source, never
// the loaded table — and is never selected whatever its status; `completed_with_errors` is never
// admitted. Appended to the status filter on BOTH the self read and the producer read:
//   AND NOT COALESCE(records_meta->'audit_table'->'rows' @> '[{"metric":"write_skipped_pre_write_warn"}]'::jsonb, false)
describe('enrich_centreline — EC-D10 fixed: ledger identity of the contract reads', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { slugForms } = require('../../scripts/lib/ledger.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { preWriteSkipRows } = require('../../scripts/lib/step/index.js');
  const V = '7b86fe74c3fbee4f073e631e3b17dd91';
  const PRODUCER = (name: string) => slugForms(name, ['sources']);

  /** The marked-row predicate the fix appends, as a JS stand-in for the SQL @> jsonb containment. */
  const MARKED_PREDICATE = "AND NOT COALESCE(records_meta->'audit_table'->'rows' @> '[{\"metric\":\"write_skipped_pre_write_warn\"}]'::jsonb, false)";
  /** The exact exported audit rows for a skip_write WARN run. */
  const MARKED_ROWS = preWriteSkipRows([{ writeSkippedPreWriteWarn: true, failedPreWriteWarn: ['x'] }]);
  const isMarked = (meta: { audit_table?: { rows?: { metric: string }[] } } | undefined) =>
    JSON.stringify(meta?.audit_table?.rows ?? []).includes('write_skipped_pre_write_warn');

  /** In-memory stand-in for the ledger SELECT the contract read issues. */
  const select = (
    runs: { pipeline: string; status: string; meta: { audit_table?: { rows?: { metric: string }[] } } }[],
    pipeline: string,
  ) =>
    runs
      .filter((r) => r.pipeline === pipeline)
      .filter((r) => r.status === 'completed' || r.status === 'completed_with_warnings')
      .filter((r) => !isMarked(r.meta));

  it('reads producer and self by slugForms with status IN (completed, completed_with_warnings)', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/FROM parcels/.test(sql)) return { rows: [{ n: 0 }] };
        if (JSON.stringify(params).includes('load_centreline')) {
          return { rows: [{ records_meta: { centreline_load: { spec_version: '1.1', features_inserted: 5, source_dataset_version: V } } }] };
        }
        return { rows: [{ records_meta: { centreline_enrich: { source_dataset_version: V } } }] };
      },
    };
    await expect(ec.readCentrelineContract(db)).resolves.toMatchObject({ sourceDatasetVersion: V, lastVersion: V, mode: 'skip' });
    expect(ec.PRODUCER_FORMS).toEqual(PRODUCER('load_centreline'));
    expect(ec.SELF_FORMS).toEqual(slugForms('enrich_centreline', ['sources']));
    const ledgerReads = calls.filter((c) => /FROM pipeline_runs/.test(c.sql));
    expect(ledgerReads).toHaveLength(2);
    const producerRead = ledgerReads[0];
    expect(producerRead).toBeDefined();
    if (!producerRead) throw new Error('expected the producer ledger read to be present');
    const selfRead = ledgerReads[1];
    expect(selfRead).toBeDefined();
    if (!selfRead) throw new Error('expected the self ledger read to be present');
    expect(producerRead.params[0]).toEqual(ec.PRODUCER_FORMS);
    expect(selfRead.params[0]).toEqual(ec.SELF_FORMS);
    for (const c of ledgerReads) {
      expect(c.sql).toMatch(/pipeline = ANY\(\$1::text\[\]\) AND status IN \('completed', 'completed_with_warnings'\)/);
      // gate #44 PRODUCER predicate (witness.mjs COMPLETED_ONLY_RE / COMPLETED_ANY_RE)
      expect(/status\s*=\s*'completed'/i.test(c.sql) && !/completed_with_warnings/i.test(c.sql)).toBe(false);
      // AMENDMENT: the skip_write preserve-and-WARN exclusion rides on the status filter (both reads).
      expect(c.sql).toContain(MARKED_PREDICATE);
    }
  });

  it('AMENDMENT (a): a completed_with_warnings row newer than the completed one IS selected', () => {
    const runs = [
      { pipeline: 'sources:load_centreline', status: 'completed', meta: { audit_table: { rows: [] } } },
      { pipeline: 'sources:load_centreline', status: 'completed_with_warnings', meta: { audit_table: { rows: [] } } },
    ];
    const picked = select(runs, 'sources:load_centreline');
    expect(picked).toHaveLength(2);
    const newest = picked[picked.length - 1];
    expect(newest).toBeDefined();
    if (!newest) throw new Error('expected the newest selected run to be present');
    expect(newest.status).toBe('completed_with_warnings');
    // the legacy completed-only read (the EC-D10 defect) would have picked the older row
    expect(select(runs.map((r) => ({ ...r, status: r.status === 'completed_with_warnings' ? 'completed' : r.status })), 'sources:load_centreline')).toHaveLength(2);
  });

  it('AMENDMENT (b): a write_skipped_pre_write_warn row is NEVER selected, whatever its status', () => {
    expect(MARKED_ROWS).toHaveLength(1);
    expect(MARKED_ROWS[0]).toMatchObject({ metric: 'write_skipped_pre_write_warn', status: 'WARN', source: 'gate' });
    for (const status of ['completed', 'completed_with_warnings']) {
      const runs = [{ pipeline: 'sources:load_centreline', status, meta: { audit_table: { rows: MARKED_ROWS } } }];
      expect(select(runs, 'sources:load_centreline')).toHaveLength(0);
    }
  });

  it('AMENDMENT (c): completed_with_errors is never selected', () => {
    const runs = [{ pipeline: 'sources:enrich_centreline', status: 'completed_with_errors', meta: { audit_table: { rows: [] } } }];
    expect(select(runs, 'sources:enrich_centreline')).toHaveLength(0);
  });
});
