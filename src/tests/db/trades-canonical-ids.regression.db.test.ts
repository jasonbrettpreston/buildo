// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §2 (canonical trade ids 1-32 + realtor 33;
//    invariant: "Trade IDs 1-32 are stable, never renumbered").
//
// Regression guard for the trades-taxonomy SERIAL-drift bug (migration 131 seeded drain-plumbing
// at id 34 instead of its canonical 32; fixed by migration 177). Asserts the SEEDED `trades`
// table's id↔slug pairs match the canonical SoT (`src/lib/classification/trades.ts`) for every
// canonical trade — so a future SERIAL-seed can't silently renumber a canonical trade again.
// Compares PAIRS, not a count, per the Regression-Guardian note.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { TRADES } from '../../lib/classification/trades';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('trades canonical ids — seeded DB matches trades.ts (Spec 80 §2)', () => {
  afterAll(async () => { if (pool) await pool.end(); });

  it('every canonical trade in trades.ts has the identical id↔slug in the seeded trades table', async () => {
    if (!pool) return;
    const dbById = new Map(
      (await pool.query(`SELECT id, slug FROM trades`)).rows.map((r) => [r.id as number, r.slug as string]),
    );
    for (const t of TRADES) {
      expect(dbById.get(t.id), `trades.id=${t.id} should be slug '${t.slug}'`).toBe(t.slug);
    }
  });

  it('drain-plumbing is canonically id 32 (the bug this guards against)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(`SELECT id FROM trades WHERE slug = 'drain-plumbing'`);
    expect(rows[0]?.id).toBe(32);
  });

  it('no canonical id (1-33) is occupied by a slug trades.ts does not declare', async () => {
    if (!pool) return;
    const canonicalSlugById = new Map(TRADES.map((t) => [t.id, t.slug]));
    const dbCanonical = (await pool.query(`SELECT id, slug FROM trades WHERE id <= 33 ORDER BY id`)).rows;
    for (const row of dbCanonical) {
      expect(canonicalSlugById.get(row.id), `seeded trades.id=${row.id} ('${row.slug}') is not in trades.ts`).toBe(row.slug);
    }
  });
});
