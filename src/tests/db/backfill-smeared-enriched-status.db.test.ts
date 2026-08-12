// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3 (Write Grain)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9/§R12
//
// C3 — backfill of smeared `enriched_status`. BEHAVIOURAL, not source-regex.
//
// RED-FIRST HERE IS THE **DATA FACT**, not a pre-existing code failure. C3 is a
// from-scratch mutation script, so "the export doesn't exist pre-fix" would be
// the incidental-failure trap, not a proof. What IS proven red-first is the
// SELECTION CONTRACT: seed the four shapes and pin exactly which rows the
// predicate claims and which it must spare. Every assertion below fails if the
// predicate is wrong, in either direction.
//
// THE DECISIVE CASE IS (c): `status IS NULL` + a non-NULL `enriched_status`.
// It is the ONLY case that distinguishes `<>` from `IS DISTINCT FROM`:
//   `status <> 'Inspection'`            -> UNKNOWN -> row SILENTLY SKIPPED
//   `status IS DISTINCT FROM 'Inspection'` -> TRUE -> row corrected
// Both spellings return an identical count on today's live data (measured), so
// nothing else in this suite — including replay-to-zero — can tell them apart.
// A skipped row is invisible forever: replay-to-zero cannot see what the
// predicate structurally excludes, and the cross-checks read `enriched_status`
// with no `status` gate.
//
// CEILING, stated rather than papered over: replay-to-`UPDATE 0` (test 6) holds
// ONLY in an isolated DB with no intervening `load_permits`. On cloud the
// population REGENERATES — `load-permits.js`'s `ON CONFLICT DO UPDATE SET
// status = EXCLUDED.status` moves a permit past 'Inspection' while its
// legitimately-written `enriched_status` stays. C3 is re-runnable by design.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { runBackfill, SMEAR_PREDICATE, backupTableName } from '../../../scripts/backfill/backfill-smeared-enriched-status.js';

const FX = 'FXC3';
const dropBackups = async (pool: any) => {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE tablename LIKE '_backup_smeared_enriched_status_%'`,
  );
  for (const r of rows) await pool.query(`DROP TABLE IF EXISTS ${r.tablename}`);
};

describe.skipIf(!dbAvailable())('C3 — backfill smeared enriched_status', () => {
  let pool: any;

  beforeAll(() => {
    pool = getTestPool();
    if (!pool) throw new Error('dbAvailable() true but no test pool');
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE '${FX}%'`);
    await dropBackups(pool);
    // (a) smear — must be corrected
    // (b) legitimate — status='Inspection', must be SPARED (the 04 166058 STE shape)
    // (c) NULL status — the ONLY case separating <> from IS DISTINCT FROM
    // (d) already clean — enriched_status NULL, must be untouched
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, last_scraped_at, last_seen_at)
       VALUES
         ('${FX} A', '00', 'Revision Issued', 'Active Inspection', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
         ('${FX} B', '00', 'Inspection',      'Permit Issued',     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
         ('${FX} C', '00', NULL,              'Active Inspection', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
         ('${FX} D', '00', 'Closed',          NULL,                '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE '${FX}%'`);
    await dropBackups(pool);
  });

  const enriched = async (suffix: string) => {
    const { rows } = await pool.query(
      `SELECT enriched_status, last_scraped_at, last_seen_at FROM permits WHERE permit_num = $1`,
      [`${FX} ${suffix}`],
    );
    return rows[0];
  };

  it('1. selection contract — claims the smear, spares the legitimate row', async () => {
    const { rows } = await pool.query(
      `SELECT permit_num FROM permits WHERE ${SMEAR_PREDICATE} AND permit_num LIKE '${FX}%' ORDER BY permit_num`,
    );
    const picked = rows.map((r: any) => r.permit_num.replace(`${FX} `, ''));
    // A = smear, C = NULL-status smear. B is status='Inspection' (spared), D has no value.
    expect(picked).toEqual(['A', 'C']);
  });

  it('1c. THE DECISIVE CASE — a NULL-status row IS selected (fails under `<>`)', async () => {
    const { rows: strict } = await pool.query(
      `SELECT count(*)::int AS n FROM permits
        WHERE enriched_status IS NOT NULL AND status <> 'Inspection' AND permit_num LIKE '${FX}%'`,
    );
    const { rows: correct } = await pool.query(
      `SELECT count(*)::int AS n FROM permits WHERE ${SMEAR_PREDICATE} AND permit_num LIKE '${FX}%'`,
    );
    // This asymmetry IS the finding: `<>` silently drops the NULL-status row.
    expect(strict[0].n).toBe(1);   // only A
    expect(correct[0].n).toBe(2);  // A and C
  });

  it('2. dry run (no --confirm) writes NOTHING', async () => {
    const before = await enriched('A');
    const res = await runBackfill(pool, { confirm: false });
    expect(res.evaluated).toBeGreaterThanOrEqual(2);
    expect(res.corrected).toBe(0);
    expect(res.backupTable).toBeNull();
    expect(await enriched('A')).toEqual(before); // byte-identical, incl. both timestamps
  });

  it('3. corrects the smear and SPARES the status=Inspection row', async () => {
    const res = await runBackfill(pool, { confirm: true });
    expect(res.corrected).toBeGreaterThanOrEqual(2);
    expect((await enriched('A')).enriched_status).toBeNull();
    expect((await enriched('C')).enriched_status).toBeNull();
    expect((await enriched('B')).enriched_status).toBe('Permit Issued'); // spared
    expect((await enriched('D')).enriched_status).toBeNull();
  });

  it('4. NEVER touches last_scraped_at — behavioural, not a source regex', async () => {
    // R4: last_scraped_at is the 7-day scraper cooldown. Nothing else pins this.
    // Asserted by observing the VALUE, not by matching the SET clause text.
    const before = (await enriched('A')).last_scraped_at;
    await runBackfill(pool, { confirm: true });
    expect((await enriched('A')).last_scraped_at).toEqual(before);
  });

  it('5. DOES bump last_seen_at so the reclassifier re-derives', async () => {
    // FOLD 2: enriched_status is not a dirty key for classify-lifecycle-phase.js.
    // Without this bump, rows that left the CKAN feed keep lifecycle_stalled=true
    // with its basis deleted, and compute-trade-forecasts filters on that flag.
    const before = (await enriched('A')).last_seen_at;
    await runBackfill(pool, { confirm: true });
    expect((await enriched('A')).last_seen_at.getTime()).toBeGreaterThan(before.getTime());
  });

  it('6. backup captures exactly what was nulled, and RESTORES', async () => {
    const res = await runBackfill(pool, { confirm: true });
    const t = res.backupTable;
    expect(t).toBe(backupTableName(new Date().toISOString()));
    const { rows: bak } = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
    expect(bak[0].n).toBe(res.corrected); // the atomicity assert, observed
    await pool.query(
      `UPDATE permits p SET enriched_status = b.enriched_status, last_seen_at = b.last_seen_at
         FROM ${t} b WHERE p.permit_num = b.permit_num AND p.revision_num = b.revision_num`,
    );
    expect((await enriched('A')).enriched_status).toBe('Active Inspection'); // round-tripped
  });

  it('7. replay is idempotent — second run corrects 0 (ISOLATED DB ONLY)', async () => {
    await runBackfill(pool, { confirm: true });
    const second = await runBackfill(pool, { confirm: true });
    expect(second.corrected).toBe(0);
    expect(second.evaluated).toBe(0);
    expect(second.backupTable).toBeNull(); // early return leaves no empty dated table
    // CEILING: true here only because no load_permits runs between the two calls.
    // On cloud the population regenerates — see the header.
  });
});
