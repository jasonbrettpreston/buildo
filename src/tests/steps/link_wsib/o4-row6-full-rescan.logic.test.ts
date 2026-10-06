// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §6.6.1; O4 row 6 (registry-truth folds 14 + 15) — link_wsib full_rescan: derive every row's best link, apply only the difference
// SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md §2 (Contact Flow), §3 (Behavioral Contract)
//
// O4 row 6 (operator ruling 2026-10-03; design + Idempotency Lens ruling in
// .cursor/o4-row6-link-wsib-design-2026-10-03.md §11, D1–D5 all (a)):
//   · ONE derivation of every wsib_registry row's best link (exact trade > exact legal > fuzzy; no
//     `linked_entity_id IS NULL` scope, no LIMIT; fuzzy tiebreak score, permit_count, name_normalized),
//     diffed against the stored link, in its OWN read-only transaction BEFORE the write transaction (D3);
//   · the diff's set/move rows are written by ONE compare-and-set UPDATE keyed on the OLD link, and the
//     vanish rows by the declared keyed UPDATE-to-NULL (never DELETE), so a row that moved between the
//     two transactions writes 0 (D3);
//   · no tier-3 cap, no convergence loop: the whole diff is applied, bounded by the pre_write
//     `link_wsib_mass_relink_pct` FAIL check + the LINK_WSIB_ACCEPT_MASS_RELINK accept override (D1, D2);
//   · the contacts reverse clear is keyed per (old entity, value) pair (D5).
// Fixture: A unchanged [absent from the diff], B moves fuzzy 7 → 9, C vanishes (exact 5 → NULL), D is new
// (NULL → fuzzy 11).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/link-wsib.js'));
const REAL = require(join(process.cwd(), 'scripts/link-wsib.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };
const RUN_AT = new Date('2026-10-03T12:00:00Z');
const ACCEPT_ENV = 'LINK_WSIB_ACCEPT_MASS_RELINK';
const CONFIG: Record<string, number> = Object.freeze({
  wsib_fuzzy_match_threshold: 0.6,
  link_wsib_link_rate_warn_pct: 5,
  link_wsib_tier1_confidence: 0.95,
  link_wsib_tier2_confidence: 0.9,
  link_wsib_tier3_confidence: 0.6,
  link_wsib_entity_fanin_warn: 20,
  link_wsib_tier3_token_overlap_fail_pct: 50,
  link_wsib_mass_relink_max_pct: 0.1,
});

type DiffRow = {
  id: number;
  old_entity_id: number | null;
  old_confidence: string | null;
  old_matched_at: string | null;
  new_entity_id: number | null;
  new_confidence: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
};

const ROW_B: DiffRow = { id: 2, old_entity_id: 7, old_confidence: '0.60', old_matched_at: '2026-09-01T00:00:00.000Z', new_entity_id: 9, new_confidence: '0.60', primary_phone: '416-555-0102', primary_email: null, website: null };
const ROW_C: DiffRow = { id: 3, old_entity_id: 5, old_confidence: '0.95', old_matched_at: '2026-09-01T00:00:00.000Z', new_entity_id: null, new_confidence: null, primary_phone: null, primary_email: 'c@example.ca', website: null };
const ROW_D: DiffRow = { id: 4, old_entity_id: null, old_confidence: null, old_matched_at: null, new_entity_id: 11, new_confidence: '0.60', primary_phone: null, primary_email: null, website: null };
const W3_DIFF: DiffRow[] = [ROW_B, ROW_C, ROW_D];

/** The real FLEET-2 descriptor (O4 row 6 landed in it — seat B), with only the two harness
 * neutralizations this fake pool needs (no DB probes, no trigger measurement). The former
 * shape overlay (mode_select, tier3, writes[3], checks splice, accept_anomaly, staleness.scope)
 * is retired: the real descriptor carries all of it, and staleness.scope is deleted by
 * Phase 3 #28 (FLEET-2 ASSEMBLY C3). */
function row6Descriptor() {
  const d = clone(REAL);
  d.guards.requires = [];
  d.staleness.trigger = 'none';
  return d;
}

type Logged = { client: number; text: string; params: unknown[] };

/** Records every statement with the client that issued it (pool = -1, each connect() a new id). */
function fakePool(opts: { diff: DiffRow[]; linkedStart?: number; wsetRowCount?: (params: unknown[]) => number }) {
  const log: Logged[] = [];
  let nextClient = 0;
  const answer = (text: string, params: unknown[]) => {
    if (/unlinked_start/.test(text)) return { rows: [{ unlinked_start: '10', linked_start: String(opts.linkedStart ?? 100), entities_count: '50' }] };
    if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
    if (/pg_extension|information_schema\.columns|pg_indexes|pg_constraint|pg_proc/i.test(text)) return { rows: [{ x: 1 }] };
    if (/^\s*SELECT count\(\*\)::int AS n\b/.test(text)) return { rows: [{ n: 0 }] };
    if (text.includes('LEFT JOIN derived d ON d.wsib_id = w.id')) return { rows: clone(opts.diff) };
    if (/AS tier3_token_overlap_pass_pct/.test(text)) return { rows: [{ total: '121116', linked: '872', orphan_linked_entity_id: '0' }] };
    if (/^\s*UPDATE wsib_registry w\s+SET linked_entity_id = u\.new_entity_id/.test(text)) {
      return { rows: [], rowCount: opts.wsetRowCount ? opts.wsetRowCount(params) : (params[1] as unknown[]).length };
    }
    if (/^\s*UPDATE wsib_registry SET linked_entity_id = null/i.test(text)) return { rows: [], rowCount: (params[0] as unknown[]).length };
    return { rows: [], rowCount: 0 };
  };
  const queryFor = (client: number) => async (text: string, params: unknown[] = []) => {
    log.push({ client, text, params });
    return answer(text, params);
  };
  return {
    log,
    query: queryFor(-1),
    connect: async () => {
      nextClient += 1;
      return { query: queryFor(nextClient), release: () => {} };
    },
  };
}

function gateFor(d: Record<string, unknown>) {
  return stepLib.makePreWriteGate({
    descriptor: d,
    chainId: null,
    stepCtx: {
      pool: null, chainId: null, runId: 1, descriptor: d,
      checks: (d.checks as Array<{ id: string }>).map((c) => c.id),
      log: NOOP_LOG, clock: () => RUN_AT.getTime(),
      config: CONFIG, acquired: null, written: null, prior: null, overrides: null, gate: null, cumulative: null, report: () => {},
    },
    compute,
    config: CONFIG,
  });
}

async function runRow6(pool: ReturnType<typeof fakePool>, d = row6Descriptor()) {
  const realGate = gateFor(d);
  const preWriteGate = async (state: unknown) => {
    pool.log.push({ client: 0, text: '<<PRE_WRITE_GATE>>', params: [] });
    return realGate(state);
  };
  return stepLib.runCascadePhase({
    descriptor: d, pool, compute, config: CONFIG, chainId: null,
    log: NOOP_LOG, tag: '[link_wsib]', clockNow: RUN_AT, preWriteGate,
  });
}

const isWSet = (t: string) => /^\s*UPDATE wsib_registry w\s+SET linked_entity_id = u\.new_entity_id/.test(t);
const isVanish = (t: string) => /^\s*UPDATE wsib_registry SET linked_entity_id = null/i.test(t);
const isReverseClear = (t: string) => /^\s*WITH c AS/.test(t) && /UPDATE entities e/.test(t);
const isFlag = (t: string) => /^\s*UPDATE entities SET is_wsib_registered = true/i.test(t);
const isUnflag = (t: string) => /^\s*UPDATE entities SET is_wsib_registered = false/i.test(t);
const isCopyContacts = (t: string) => /^\s*UPDATE entities e\s+SET primary_phone = COALESCE/.test(t);
const isWrite = (t: string) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(t) || isReverseClear(t);

function spyBeforeImage() {
  return vi.spyOn(writeLib, 'persistBeforeImageRows').mockImplementation(
    (...args: unknown[]) => ({ written: true, path: 'docs/reports/golden/link_wsib/before-image/x.jsonl', rows: (args[0] as unknown[]).length }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env[ACCEPT_ENV];
});

describe('O4 row 6 — link_wsib full_rescan: derive every row, apply only the difference', () => {
  it('W1 (RED) — ONE derivation statement: no IS NULL scope, no LIMIT, tier rank by anti-join, total fuzzy order, set_config as its own statement', () => {
    const d = row6Descriptor();
    expect(typeof compute.buildDerivationSql, 'compute must export buildDerivationSql').toBe('function');
    const der = compute.buildDerivationSql(d, CONFIG);
    expect(der.setup_sql).toMatch(/^SELECT set_config\('pg_trgm\.similarity_threshold', \$1::text, true\)$/);
    expect(der.setup_params).toEqual([0.6]);
    expect(der.diff_params, '$1 threshold, $2/$3/$4 = the three tier confidences in cascade order').toEqual([0.6, 0.95, 0.9, 0.6]);
    const sql: string = der.diff_sql;
    expect(sql).not.toMatch(/linked_entity_id IS NULL/);
    expect(sql).not.toMatch(/\bLIMIT\b/);
    expect(sql, 'an unreferenced set_config CTE is never evaluated by Postgres — it must not live in the diff statement').not.toMatch(/set_config/);
    expect(sql).toContain('ORDER BY wsib_id, score DESC, permit_count DESC, name_normalized ASC');
    expect(sql.match(/NOT EXISTS \(SELECT 1 FROM exact x WHERE x\.wsib_id = w\.id\)/g), 'both fuzzy CTEs anti-join the exact arms (L8)').toHaveLength(2);
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM exact1 x WHERE x.wsib_id = w.id)');
    expect(sql).toContain('WHERE (w.linked_entity_id, w.match_confidence) IS DISTINCT FROM (d.entity_id, d.confidence)');
    expect(sql).toMatch(/\$2::numeric\(3,2\)[\s\S]*\$3::numeric\(3,2\)[\s\S]*\$4::numeric\(3,2\)/);
    // LW-D14 / d704a447 controls — the token-overlap clause and the article-stripping block are unchanged.
    const stop = compute.tokenOverlapStopwords(d);
    expect(sql).toContain(compute.tokenOverlapClause(stop, 'w.trade_name_normalized', 'e.name_normalized'));
    expect(sql).toContain(compute.tokenOverlapClause(stop, 'w.legal_name_normalized', 'e.name_normalized'));
    expect(sql).toContain("LEFT(REGEXP_REPLACE(w.trade_name_normalized, '^(THE|A|AN) ', ''), 1)");
    // S3 + the convergence loop are retired (operator D1(a)).
    expect(compute.TIER3_LIMIT, 'S3 is retired').toBeUndefined();
    expect(stepLib.runTierToConvergence, 'the convergence loop is retired').toBeUndefined();
    expect(Object.keys(compute.checks)).not.toContain('tier3_full_not_converged');
    expect(Object.keys(compute.checks)).not.toContain('tier3_full_iterations');
    expect(Object.keys(compute.checks)).toContain('link_wsib_mass_relink_pct');
  });

  it('W2 (RED) — the cascade path routes through resolveLinkGate: mode_select "none" + a retract "all" target is refused; a tri_state descriptor with a scope-wide retraction is refused too', async () => {
    const bad = row6Descriptor();
    bad.outputs.writes[3].retract = 'all';
    bad.outputs.writes[3].retract_when = 'full_only';
    await expect(runRow6(fakePool({ diff: [] }), bad)).rejects.toThrow(/re-derives every row on every run/);

    const triState = row6Descriptor();
    triState.staleness.mode_select = 'tri_state';
    // The pre-row-6 scope-wide tier-3 retraction, spelled out (not read from REAL, which seat B re-declares keyed).
    triState.outputs.writes[3].retract = 'all';
    triState.outputs.writes[3].retract_when = 'full_only';
    triState.outputs.writes[3].write_discipline.scope = 'match_confidence = $1';
    await expect(runRow6(fakePool({ diff: [] }), triState)).rejects.toThrow(/declare retract "none" with the keyed scope/);

    const result = await runRow6(fakePool({ diff: [] }));
    expect(result.gate.mode).toBe('full');
    expect(result.gate.reason).toBe('full_rescan');
  });

  it('W3 (RED) — set / move / vanish: compare-and-set binds the OLD link, vanish binds only C, the reverse clear is per (old entity, value), one ordered write transaction', async () => {
    const bi = spyBeforeImage();
    const pool = fakePool({ diff: W3_DIFF });
    const result = await runRow6(pool);
    const log = pool.log;
    const at = (pred: (t: string) => boolean) => log.findIndex((l) => pred(l.text));

    // The derivation: its own READ ONLY transaction, set_config on the SAME client, before the gate.
    const iSetup = at((t) => /^SELECT set_config\('pg_trgm\.similarity_threshold'/.test(t));
    const iDiff = at((t) => t.includes('LEFT JOIN derived d ON d.wsib_id = w.id'));
    expect(iSetup).toBeGreaterThanOrEqual(0);
    expect(iDiff).toBeGreaterThan(iSetup);
    expect(log[iSetup]!.client, 'set_config must run on the diff statement\'s client (G-10)').toBe(log[iDiff]!.client);
    const derivClient = log[iDiff]!.client;
    const derivTxn = log.filter((l) => l.client === derivClient).map((l) => l.text);
    expect(derivTxn[0]).toBe('BEGIN');
    expect(derivTxn[1]).toBe('SET TRANSACTION READ ONLY');
    expect(derivTxn).toContain('COMMIT');
    expect(derivTxn.some(isWrite), 'the derivation transaction writes nothing').toBe(false);

    const iGate = at((t) => t === '<<PRE_WRITE_GATE>>');
    const iWSet = at(isWSet);
    const iVanish = at(isVanish);
    const iClear = at(isReverseClear);
    const iFlag = at(isFlag);
    const iUnflag = at(isUnflag);
    const iCopy = at(isCopyContacts);
    expect(iDiff).toBeLessThan(iGate);
    expect(iGate).toBeLessThan(iWSet);
    expect(iWSet).toBeLessThan(iVanish);
    expect(iVanish).toBeLessThan(iClear);
    expect(iClear).toBeLessThan(iFlag);
    expect(iFlag).toBeLessThan(iUnflag);
    expect(iUnflag).toBeLessThan(iCopy);
    const writeClient = log[iWSet]!.client;
    expect(writeClient).not.toBe(derivClient);
    for (const i of [iVanish, iClear, iFlag, iUnflag, iCopy]) expect(log[i]!.client, 'every write in ONE transaction (G-11)').toBe(writeClient);
    const writeTxn = log.filter((l) => l.client === writeClient).map((l) => l.text);
    expect(writeTxn[0]).toBe('BEGIN');
    expect(writeTxn[writeTxn.length - 1]).toBe('COMMIT');

    // W-set: B (move) + D (new), compare-and-set on the OLD link.
    const wset = log[iWSet]!;
    expect(wset.params[0]).toBe(RUN_AT);
    expect(wset.params.slice(1)).toEqual([[2, 4], [9, 11], ['0.60', '0.60'], [7, null], ['0.60', null]]);
    expect(wset.text).toContain('(w.linked_entity_id, w.match_confidence) IS NOT DISTINCT FROM (u.old_entity_id, u.old_confidence)');
    expect(wset.text).toContain('(w.linked_entity_id, w.match_confidence) IS DISTINCT FROM (u.new_entity_id, u.new_confidence)');
    expect(wset.text).not.toMatch(/INSERT INTO|ON CONFLICT/i);

    // W-vanish: C only, keyed + compare-and-set on its old link, never a DELETE.
    const vanish = log[iVanish]!;
    expect(vanish.params).toEqual([[3], [5], ['0.95']]);
    expect(vanish.text).toContain(compute.VANISH_RETRACT_SCOPE);
    expect(log.some((l) => /^\s*DELETE\b/i.test(l.text))).toBe(false);
    expect(log.filter((l) => isVanish(l.text)), 'the only NULL-writing statement').toHaveLength(1);

    // Contacts reverse clear: per (OLD entity, value) pair — B's phone on entity 7, C's email on entity 5.
    expect(log[iClear]!.params).toEqual([[7, 5], ['416-555-0102', null], [null, 'c@example.ca'], [null, null]]);

    // Flag + unflag issued ONCE (exact-tier confidences); copyContacts once per tier, in cascade order.
    expect(log.filter((l) => isFlag(l.text))).toHaveLength(1);
    expect(log[iFlag]!.params).toEqual([0.95, 0.9]);
    expect(log[iUnflag]!.params).toEqual([0.95, 0.9]);
    expect(log.filter((l) => isCopyContacts(l.text)).map((l) => l.params)).toEqual([[0.95], [0.9], [0.6]]);

    // Before-image: the move + vanish rows' OLD link (R-M / LG-17), once, before the writes.
    expect(bi).toHaveBeenCalledTimes(1);
    const [rows, table, slug, runAt] = bi.mock.calls[0]!;
    expect(rows).toEqual([
      { id: 2, linked_entity_id: 7, match_confidence: '0.60', matched_at: '2026-09-01T00:00:00.000Z' },
      { id: 3, linked_entity_id: 5, match_confidence: '0.95', matched_at: '2026-09-01T00:00:00.000Z' },
    ]);
    expect(table).toBe('wsib_registry');
    expect(slug).toBe('link_wsib');
    expect(runAt).toBe(RUN_AT);
    expect(result.beforeImage).toHaveLength(1);

    expect(result.matched.diff).toEqual({ set: 1, move: 1, vanish: 1 });
    expect(result.matched.tiers.tier3_fuzzy.linked).toBe(2);
    expect(result.matched.tiers.tier1_exact_trade.linked).toBe(0);
    expect(result.matched).not.toHaveProperty('tier3_full');
    expect(result.written.e1.updated).toBe(2);
    expect(result.written.e4.retracted).toBe(1);
  });

  it('W4 (RED) — steady state: an empty diff writes 0 rows, issues the same keyed statements with empty arrays, writes no before-image; matched_at is never in a guard', async () => {
    const bi = spyBeforeImage();
    const pool = fakePool({ diff: [] });
    const result = await runRow6(pool);
    const wset = pool.log.find((l) => isWSet(l.text))!;
    expect(wset, 'W-set is always issued (stable statement inventory, L17)').toBeDefined();
    expect(wset.params.slice(1)).toEqual([[], [], [], [], []]);
    expect(wset.text.split(/\bWHERE\b/)[1], 'matched_at is the run clock: in the SET list, never in a guard (LG-9)').not.toMatch(/matched_at/);
    const vanish = pool.log.find((l) => isVanish(l.text))!;
    expect(vanish.params).toEqual([[], [], []]);
    expect(pool.log.find((l) => isReverseClear(l.text))!.params).toEqual([[], [], [], []]);
    expect(bi).not.toHaveBeenCalled();
    expect(result.matched.diff).toEqual({ set: 0, move: 0, vanish: 0 });
    expect(result.written.e1.updated).toBe(0);
    expect(result.written.e4.retracted).toBe(0);
    expect(result.matched.contacts_cleared).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/exhausted|tier3_relink_pending/);
  });

  it('W5 (RED) — compare-and-set: a diff row whose stored link moved after the derivation writes 0 and does not fail the run', async () => {
    spyBeforeImage();
    const pool = fakePool({ diff: [ROW_B], wsetRowCount: () => 0 });
    const result = await runRow6(pool);
    expect(result.writeSkipped).toBe(false);
    expect(result.written.e1.scanned, 'the diff offered one row').toBe(1);
    expect(result.written.e1.updated, 'the stale row matched 0 rows').toBe(0);
    expect(result.written.e1.rows_changed).toBe(0);
  });

  it('W6 (RED) — mass guard: (moves + vanishes) / linked above the bound FAILs pre_write and nothing is written; the accept override lets it through and the FAIL observation stays', async () => {
    const big: DiffRow[] = [
      { ...ROW_B },
      { ...ROW_B, id: 5, old_entity_id: 8, new_entity_id: 12 },
      { ...ROW_C },
    ];
    const pool = fakePool({ diff: big, linkedStart: 10 });
    const result = await runRow6(pool);
    expect(result.writeSkipped).toBe(true);
    expect(result.failedPreWrite).toContain('link_wsib_mass_relink_pct');
    expect(pool.log.some((l) => isWrite(l.text)), 'no write statement after a pre_write FAIL').toBe(false);
    expect(pool.log.filter((l) => l.text === 'BEGIN'), 'only the read-only derivation transaction opened').toHaveLength(1);

    const reports: Record<string, { value: number; detail: unknown }> = {};
    compute.checks.link_wsib_mass_relink_pct({ matched: result.matched, report: (id: string, o: { value: number; detail: unknown }) => { reports[id] = o; } });
    expect(reports.link_wsib_mass_relink_pct!.value).toBe(0.3);
    expect(reports.link_wsib_mass_relink_pct!.detail).toEqual({ set: 0, move: 2, vanish: 1, linked_start: 10 });

    process.env[ACCEPT_ENV] = '1';
    spyBeforeImage();
    const accepted = fakePool({ diff: big, linkedStart: 10 });
    const r2 = await runRow6(accepted);
    expect(r2.writeSkipped).toBe(false);
    expect(accepted.log.some((l) => isWSet(l.text)), 'the accepted run writes').toBe(true);
  });

  it('W-DR (green control) — --dry-run runs the read-only derivation and reports the diff, but issues ZERO write statements', async () => {
    const d = row6Descriptor();
    d.override.dry_run = '--dry-run';
    const original = process.argv;
    process.argv = [...original, '--dry-run'];
    try {
      const bi = spyBeforeImage();
      const pool = fakePool({ diff: W3_DIFF });
      const result = await runRow6(pool, d);
      expect(result.overrides.dry_run).toBe(true);
      expect(pool.log.filter((l) => isWrite(l.text))).toEqual([]);
      expect(bi).not.toHaveBeenCalled();
      expect(result.matched.diff).toEqual({ set: 1, move: 1, vanish: 1 });
      expect(result.matched.tiers.tier3_fuzzy.linked).toBe(2);
    } finally {
      process.argv = original;
    }
  });
});
