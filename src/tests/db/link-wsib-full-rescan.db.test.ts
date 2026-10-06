// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §6.6.1; O4 row 6 (registry-truth folds 14 + 15) — link_wsib full_rescan, W8 (test:db, live)
// SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md §2 (Contact Flow), §3 (Behavioral Contract)
//
// O4 row 6 W8 (design .cursor/o4-row6-link-wsib-design-2026-10-03.md §7 W8 + §11.3 item 8 + §12):
// the fake-pool locks (src/tests/steps/link_wsib/o4-row6-full-rescan.logic.test.ts W1–W6) pin the
// statement SHAPES; this file proves the BEHAVIOUR against real Postgres + pg_trgm, through
// `runCascadePhase` itself (the read-only derivation transaction, the compare-and-set W-set, the
// declared keyed W-vanish, the per-(entity, value) contacts clear, the entities flag / self-heal /
// copyContacts) and the REAL pre_write gate (`makePreWriteGate`, real default 0.10):
//   T1 same input twice ⇒ run 2's diff is empty, 0 rows changed, matched_at and entities unmoved;
//   T2 one entity renamed into a better fuzzy match ⇒ exactly one link moves, matched_at moves only on
//      it, the old entity's copied contact is cleared and the new entity is refilled;
//   T3 a vanished exact match ⇒ the link's three columns are NULLed (never DELETE), the old entity's
//      contact is cleared per (entity, value) — another old entity holding the SAME value from another
//      source keeps it (the pooled pre-D5 statement would have cleared it) — and the flag self-heals;
//   T4 (moves + vanishes) / linked > 0.10 ⇒ the pre_write gate refuses and nothing is written;
//      LINK_WSIB_ACCEPT_MASS_RELINK=1 lets the same diff through and the check still measures > 0.10.
//
// Fixture (all similarity values are pg_trgm word-trigram similarity, threshold 0.6):
//   W_ALPHA   trade 'LWR6 ALPHA PAVING'              = E_ALPHA   exact T1 (0.95)
//   W_BRAVO   legal 'LWR6 BRAVO MASONRY' (no trade)  = E_BRAVO   exact T2 (0.90), carries the shared email
//   W_CHARLIE trade 'LWR6 CHARLIE ROOFING SOLUTIONS' ~ E_CHARLIE 'LWR6 CHARLIE ROOFING SOLN' (≈0.73) fuzzy T3 (0.60)
//             E_XRAY 'LWR6 XRAY DEMOLITION' matches nothing until renamed 'LWR6 CHARLIE ROOFING SOLUTION' (≈0.91)
//   W_NOMATCH legal only, starts with Q (no entity starts with Q) — never linked
//   20 fillers W_Fnn trade 'LWR6 FILLER nn SUPPLY' = E_Fnn exact T1 — so linked_start = 23 and the mass
//             guard's real default 0.10 separates 2 changes (0.087, passes) from 3 (0.130, trips).
// Every wsib row's legal name that is not an exact-T2 target starts with Q, and every renamed-out entity
// starts with Z, so neither can enter the fuzzy arm (its first-letter block).
//
// `persistBeforeImageRows` is spied (never writes docs/reports/golden/link_wsib/before-image/*.jsonl into
// the working tree from a test) — its arguments are the R-M / LG-17 before-image rows, asserted below.
// The descriptor overlay is the row-6 target shape seat B lands (the same overlay as the logic test);
// once the real descriptor carries it, the overlay is a no-op and can be dropped.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/link-wsib-full-rescan.db.test.ts --no-file-parallelism

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

type Diff = { set: number; move: number; vanish: number };
type Target = { rows_changed: number; retracted: number; updated: number };
type CascadeResult = {
  skipped: boolean;
  writeSkipped?: boolean;
  failedPreWrite?: string[];
  gate: { mode: string | null; reason: string };
  matched: { diff: Diff; linked_start: number; contacts_cleared?: number; [k: string]: unknown };
  written: Record<string, unknown> | null;
};
type CheckReport = { value: number; detail: unknown };

/* eslint-disable @typescript-eslint/no-require-imports */
const stepIndex = require('../../../scripts/lib/step/index.js') as {
  runCascadePhase: (args: Record<string, unknown>) => Promise<CascadeResult>;
  makePreWriteGate: (args: Record<string, unknown>) => ((state: unknown) => Promise<unknown>) | null;
};
const writeLib = require('../../../scripts/lib/step/write.js') as {
  persistBeforeImageRows: (rows: unknown[], table: string, slug: string, runAt: Date) => unknown;
};
const pipelineLib = require('../../../scripts/lib/pipeline.js') as { log: unknown };
const compute = require('../../../scripts/lib/compute/link-wsib.js') as {
  VANISH_RETRACT_SCOPE: string;
  checks: Record<string, (ctx: { matched: unknown; report: (id: string, o: CheckReport) => void }) => void>;
};
const REAL = require('../../../scripts/link-wsib.descriptor.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const ACCEPT_ENV = 'LINK_WSIB_ACCEPT_MASS_RELINK';
const FX_ADDR = 'LWR6-W8 FIXTURE';
const FX_ENTITY = 'LWR6-W8 ';
const SHARED_EMAIL = 'shared@lwr6-w8.test';
const ALPHA_PHONE = '416-555-0101';
const CHARLIE_PHONE = '416-555-0103';
const RUN1 = new Date('2026-10-03T10:00:00.000Z');
const RUN2 = new Date('2026-10-03T11:00:00.000Z');
const RUN3 = new Date('2026-10-03T12:00:00.000Z');
const FILLERS = 20;
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

/** The real FLEET-2 descriptor (O4 row 6 landed in it — seat B); guards and triggers stay REAL (live DB). The former shape overlay is retired: the real descriptor carries it, and staleness.scope is deleted by Phase 3 #28 (FLEET-2 ASSEMBLY C3). */
function row6Descriptor() {
  return clone(REAL);
}

function gateFor(d: Record<string, unknown>) {
  return stepIndex.makePreWriteGate({
    descriptor: d,
    chainId: 'sources',
    stepCtx: {
      pool: null, chainId: 'sources', runId: null, descriptor: d,
      checks: (d.checks as Array<{ id: string }>).map((c) => c.id),
      log: pipelineLib.log, clock: () => Date.now(),
      config: CONFIG, acquired: null, written: null, prior: null, overrides: null, gate: null, cumulative: null, report: () => {},
    },
    compute,
    config: CONFIG,
  });
}

function rowsChanged(r: CascadeResult): number {
  return Object.entries(r.written || {})
    .filter(([k]) => /^e\d+$/.test(k))
    .reduce((sum, [, v]) => sum + (v as Target).rows_changed, 0);
}

function target(r: CascadeResult, writeIndex: number): Target {
  return (r.written as Record<string, Target>)[`e${writeIndex + 1}`]!;
}

function spyBeforeImage() {
  return vi.spyOn(writeLib, 'persistBeforeImageRows').mockImplementation(
    (rows: unknown[]) => ({ written: true, path: 'docs/reports/golden/link_wsib/before-image/stub.jsonl', rows: rows.length }),
  );
}

describe.skipIf(!dbAvailable())('O4 row 6 W8 — link_wsib full rescan against live Postgres', () => {
  let pool: Pool;
  const E: Record<string, number> = {};
  const W: Record<string, number> = {};

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  async function cleanup() {
    await pool.query('DELETE FROM wsib_registry WHERE mailing_address = $1', [FX_ADDR]);
    await pool.query('DELETE FROM entities WHERE legal_name LIKE $1', [`${FX_ENTITY}%`]);
  }

  async function addEntity(key: string, name: string, email: string | null = null) {
    const r = await pool.query(
      'INSERT INTO entities (legal_name, name_normalized, primary_email) VALUES ($1, $2, $3) RETURNING id',
      [`${FX_ENTITY}${key}`, name, email],
    );
    E[key] = Number(r.rows[0].id);
  }

  async function addWsib(key: string, legal: string, trade: string | null, phone: string | null, email: string | null) {
    const r = await pool.query(
      `INSERT INTO wsib_registry (legal_name, legal_name_normalized, trade_name, trade_name_normalized,
         predominant_class, mailing_address, primary_phone, primary_email)
       VALUES ($1, $1, $2, $2, 'G1', $3, $4, $5) RETURNING id`,
      [legal, trade, FX_ADDR, phone, email],
    );
    W[key] = Number(r.rows[0].id);
  }

  async function renameEntity(key: string, name: string) {
    await pool.query('UPDATE entities SET name_normalized = $2 WHERE id = $1', [E[key], name]);
  }

  async function wsib(key: string) {
    const r = await pool.query(
      'SELECT linked_entity_id, match_confidence::text AS match_confidence, matched_at FROM wsib_registry WHERE id = $1',
      [W[key]],
    );
    const row = r.rows[0];
    return {
      entity: row.linked_entity_id === null ? null : Number(row.linked_entity_id),
      confidence: row.match_confidence as string | null,
      matchedAt: row.matched_at === null ? null : new Date(row.matched_at).getTime(),
    };
  }

  async function entity(key: string) {
    const r = await pool.query(
      'SELECT is_wsib_registered, primary_phone, primary_email, website FROM entities WHERE id = $1',
      [E[key]],
    );
    return r.rows[0] as { is_wsib_registered: boolean; primary_phone: string | null; primary_email: string | null; website: string | null };
  }

  async function snapshot() {
    const w = await pool.query(
      'SELECT id, linked_entity_id, match_confidence::text AS c, matched_at FROM wsib_registry WHERE mailing_address = $1 ORDER BY id',
      [FX_ADDR],
    );
    const e = await pool.query(
      'SELECT id, name_normalized, is_wsib_registered, primary_phone, primary_email, website FROM entities WHERE legal_name LIKE $1 ORDER BY id',
      [`${FX_ENTITY}%`],
    );
    return {
      wsib: w.rows.map((r) => ({ ...r, matched_at: r.matched_at === null ? null : new Date(r.matched_at).getTime() })),
      entities: e.rows,
    };
  }

  async function run(clockNow: Date): Promise<CascadeResult> {
    const d = row6Descriptor();
    const result = await stepIndex.runCascadePhase({
      descriptor: d, pool, compute, config: CONFIG, chainId: 'sources',
      log: pipelineLib.log, tag: '[link_wsib]', clockNow, preWriteGate: gateFor(d), ownRunId: -1,
    });
    expect(result.skipped, 'the LG-15 ledger gate SKIPPED — a leftover link_wsib ledger row made this run a no-op; nothing below would be measured').not.toBe(true);
    expect(result.gate.reason).toBe('full_rescan');
    return result;
  }

  let beforeImage: ReturnType<typeof spyBeforeImage>;

  beforeEach(async () => {
    beforeImage = spyBeforeImage();
    await cleanup();
    const foreign = await pool.query('SELECT count(*)::int AS n FROM wsib_registry WHERE linked_entity_id IS NOT NULL');
    expect(foreign.rows[0].n, 'linked wsib_registry rows left by another file would change linked_start and the mass-guard ratios below').toBe(0);

    await addEntity('ALPHA', 'LWR6 ALPHA PAVING');
    await addEntity('BRAVO', 'LWR6 BRAVO MASONRY');
    await addEntity('CHARLIE', 'LWR6 CHARLIE ROOFING SOLN', SHARED_EMAIL);
    await addEntity('XRAY', 'LWR6 XRAY DEMOLITION');
    await addWsib('ALPHA', 'QLWR6 LEGAL ALPHA', 'LWR6 ALPHA PAVING', ALPHA_PHONE, null);
    await addWsib('BRAVO', 'LWR6 BRAVO MASONRY', null, null, SHARED_EMAIL);
    await addWsib('CHARLIE', 'QLWR6 LEGAL CHARLIE', 'LWR6 CHARLIE ROOFING SOLUTIONS', CHARLIE_PHONE, null);
    await addWsib('NOMATCH', 'QLWR6 LEGAL NOMATCH', null, null, null);
    for (let i = 1; i <= FILLERS; i++) {
      const nn = String(i).padStart(2, '0');
      await addEntity(`F${nn}`, `LWR6 FILLER ${nn} SUPPLY`);
      await addWsib(`F${nn}`, `QLWR6 LEGAL FILLER ${nn}`, `LWR6 FILLER ${nn} SUPPLY`, null, null);
    }

    // Run 1 — every fixture link is NEW (set), none moves or vanishes; the baseline every test starts from.
    const r1 = await run(RUN1);
    expect(r1.writeSkipped).toBe(false);
    expect(r1.matched.diff).toEqual({ set: 3 + FILLERS, move: 0, vanish: 0 });
    expect(await wsib('ALPHA')).toEqual({ entity: E.ALPHA, confidence: '0.95', matchedAt: RUN1.getTime() });
    expect(await wsib('BRAVO')).toEqual({ entity: E.BRAVO, confidence: '0.90', matchedAt: RUN1.getTime() });
    expect(await wsib('CHARLIE')).toEqual({ entity: E.CHARLIE, confidence: '0.60', matchedAt: RUN1.getTime() });
    expect(await wsib('NOMATCH')).toEqual({ entity: null, confidence: null, matchedAt: null });
    expect(await wsib('F01')).toEqual({ entity: E.F01, confidence: '0.95', matchedAt: RUN1.getTime() });
    expect((await entity('ALPHA')).is_wsib_registered).toBe(true);
    expect((await entity('BRAVO')).is_wsib_registered).toBe(true);
    expect((await entity('CHARLIE')).is_wsib_registered, 'LW-D19: only an EXACT-tier link flags the entity').toBe(false);
    expect((await entity('ALPHA')).primary_phone).toBe(ALPHA_PHONE);
    expect((await entity('BRAVO')).primary_email).toBe(SHARED_EMAIL);
    expect((await entity('CHARLIE')).primary_phone).toBe(CHARLIE_PHONE);
    expect((await entity('XRAY')).primary_phone).toBeNull();
    expect(beforeImage, 'run 1 moves and vanishes nothing — no before-image').not.toHaveBeenCalled();
    beforeImage.mockClear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env[ACCEPT_ENV];
    await cleanup();
  });

  it('T1 — same input twice: run 2\'s diff is empty, it changes 0 rows, matched_at and entities do not move', async () => {
    const before = await snapshot();
    const r2 = await run(RUN2);
    expect(r2.writeSkipped).toBe(false);
    expect(r2.matched.diff).toEqual({ set: 0, move: 0, vanish: 0 });
    expect(rowsChanged(r2), 'every keyed / guarded write changed 0 rows').toBe(0);
    expect(r2.matched.contacts_cleared).toBe(0);
    expect(beforeImage).not.toHaveBeenCalled();
    expect(await snapshot(), 'wsib links, matched_at (still RUN1) and every entities column are byte-identical').toEqual(before);
  });

  it('T2 — one entity renamed into a better fuzzy match: exactly one link moves, matched_at moves only on it, the contact follows the link', async () => {
    const before = await snapshot();
    await renameEntity('XRAY', 'LWR6 CHARLIE ROOFING SOLUTION');
    const r2 = await run(RUN2);
    expect(r2.writeSkipped, '1 move of 23 linked = 0.043, under the 0.10 mass guard').toBe(false);
    expect(r2.matched.diff).toEqual({ set: 0, move: 1, vanish: 0 });
    expect(target(r2, 0).rows_changed, 'W-set changed exactly one wsib row').toBe(1);
    expect(target(r2, 3).rows_changed, 'W-vanish changed nothing').toBe(0);

    expect(await wsib('CHARLIE')).toEqual({ entity: E.XRAY, confidence: '0.60', matchedAt: RUN2.getTime() });
    const after = await snapshot();
    const others = (s: typeof before) => s.wsib.filter((r: { id: number }) => Number(r.id) !== W.CHARLIE);
    expect(others(after), 'every other fixture link and its matched_at (RUN1) is unchanged').toEqual(others(before));

    // A-7 per (old entity, value): E_CHARLIE loses the phone it copied from W_CHARLIE, keeps its own email;
    // copyContacts refills the phone on the NEW entity.
    expect((await entity('CHARLIE')).primary_phone).toBeNull();
    expect((await entity('CHARLIE')).primary_email).toBe(SHARED_EMAIL);
    expect((await entity('XRAY')).primary_phone).toBe(CHARLIE_PHONE);
    expect((await entity('XRAY')).is_wsib_registered, 'a fuzzy link never flags').toBe(false);
    expect(r2.matched.contacts_cleared).toBe(1);

    // R-M / LG-17 — the before-image holds exactly the moved row's OLD link.
    expect(beforeImage).toHaveBeenCalledTimes(1);
    const [rows, table] = beforeImage.mock.calls[0] as unknown as [Array<Record<string, unknown>>, string];
    expect(table).toBe('wsib_registry');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: W.CHARLIE, linked_entity_id: E.CHARLIE, match_confidence: '0.60' });
    expect(new Date(rows[0]!.matched_at as string).getTime()).toBe(RUN1.getTime());
  });

  it('T3 — a vanished exact match is NULLed (never deleted), its contact clears per (entity, value), and the flag self-heals', async () => {
    await renameEntity('BRAVO', 'ZLWR6 RENAMED BRAVO');
    await renameEntity('XRAY', 'LWR6 CHARLIE ROOFING SOLUTION');
    const r2 = await run(RUN2);
    expect(r2.writeSkipped, '2 changes of 23 linked = 0.087 — the pass side of the real 0.10 default').toBe(false);
    expect(r2.matched.diff).toEqual({ set: 0, move: 1, vanish: 1 });
    expect(target(r2, 3).retracted, 'the declared keyed UPDATE-to-NULL NULLed exactly the vanished row').toBe(1);

    expect(await wsib('BRAVO'), 'all three link columns NULLed together').toEqual({ entity: null, confidence: null, matchedAt: null });
    const kept = await pool.query('SELECT count(*)::int AS n FROM wsib_registry WHERE id = $1', [W.BRAVO]);
    expect(kept.rows[0].n, 'a vanished link NULLs the row — the wsib row itself is never deleted').toBe(1);
    expect((await entity('BRAVO')).primary_email, 'the old entity loses the value it copied from the vanished row').toBeNull();
    expect((await entity('BRAVO')).is_wsib_registered, 'LW-D19 self-heal: no exact link left ⇒ unflagged').toBe(false);

    // D5 — keyed per (old entity, value): E_CHARLIE is ALSO an old entity this run (its link moved) and holds the
    // SAME email from another source. The pooled pre-D5 statement applied every cleared value to every old entity
    // and would have erased it; the keyed statement clears only E_CHARLIE's own copied phone.
    expect((await entity('CHARLIE')).primary_email, 'keyed clear: a value from ANOTHER row never clears this entity').toBe(SHARED_EMAIL);
    expect((await entity('CHARLIE')).primary_phone).toBeNull();
    expect((await entity('XRAY')).primary_phone).toBe(CHARLIE_PHONE);
    expect(r2.matched.contacts_cleared).toBe(2);

    expect(await wsib('ALPHA')).toEqual({ entity: E.ALPHA, confidence: '0.95', matchedAt: RUN1.getTime() });
    const [rows] = beforeImage.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(rows.map((r) => r.id).sort()).toEqual([W.BRAVO, W.CHARLIE].sort());
  });

  it('T4 — mass guard: (moves + vanishes) / linked > 0.10 refuses the write pre_write; LINK_WSIB_ACCEPT_MASS_RELINK=1 lets the same diff through', async () => {
    await renameEntity('ALPHA', 'ZLWR6 RENAMED ALPHA');
    await renameEntity('BRAVO', 'ZLWR6 RENAMED BRAVO');
    await renameEntity('XRAY', 'LWR6 CHARLIE ROOFING SOLUTION');
    const before = await snapshot();

    const refused = await run(RUN2);
    expect(refused.matched.diff).toEqual({ set: 0, move: 1, vanish: 2 });
    expect(refused.writeSkipped, '3 of 23 = 0.130 > 0.10').toBe(true);
    expect(refused.failedPreWrite).toContain('link_wsib_mass_relink_pct');
    expect(beforeImage, 'a refused run writes no before-image (nothing is destroyed)').not.toHaveBeenCalled();
    expect(await snapshot(), 'nothing written: links, matched_at, flags and contacts are unchanged').toEqual(before);

    process.env[ACCEPT_ENV] = '1';
    const accepted = await run(RUN3);
    expect(accepted.writeSkipped, 'the standing accept override lets the run write').toBe(false);
    expect(accepted.failedPreWrite).toBeUndefined();
    expect(await wsib('ALPHA')).toEqual({ entity: null, confidence: null, matchedAt: null });
    expect(await wsib('BRAVO')).toEqual({ entity: null, confidence: null, matchedAt: null });
    expect(await wsib('CHARLIE')).toEqual({ entity: E.XRAY, confidence: '0.60', matchedAt: RUN3.getTime() });
    expect((await entity('ALPHA')).is_wsib_registered).toBe(false);
    expect((await entity('ALPHA')).primary_phone).toBeNull();

    // The acceptance never suppresses the measurement: the check still observes the over-bound ratio.
    const reports: Record<string, CheckReport> = {};
    compute.checks.link_wsib_mass_relink_pct!({ matched: accepted.matched, report: (id, o) => { reports[id] = o; } });
    expect(reports.link_wsib_mass_relink_pct!.value).toBe(0.1304);
    expect(reports.link_wsib_mass_relink_pct!.detail).toEqual({ set: 0, move: 1, vanish: 2, linked_start: 3 + FILLERS });
  });
});
