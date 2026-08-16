// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (v1.1 §8d)
// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §11.1 (#418 — the ported mechanism)
//
// Phase B B3 — pure/structural cases for the enrich-heritage.js #418 port that
// do not need a live DB. Live-DB behavioral cases (the wedge-open trap itself,
// version-bump re-staling, skip-path emit) live in
// src/tests/db/enrich-heritage-418.db.test.ts.
//   H4 — assertHeritageSourceNonEmpty (L14) throws on either table being empty,
//     resolves when both are non-empty (stubbed client — no DB needed to prove
//     the pure branch logic) + g/b: main() calls it BEFORE countStale (source-scan).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ENRICH_HERITAGE_PATH = join(process.cwd(), 'scripts/enrich-heritage.js');
const enrichHeritageSrc = () => readFileSync(ENRICH_HERITAGE_PATH, 'utf8');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../scripts/enrich-heritage.js') as {
  assertHeritageSourceNonEmpty: (db: { query: (sql: string) => Promise<{ rows: Array<{ n: number }> }> }) => Promise<void>;
  countStale: unknown;
  ENRICH_SQL: string;
};

/** Fake pg-shaped client: first query = heritage_properties count, second = heritage_districts count. */
function stubDb(hpCount: number, hdCount: number) {
  let call = 0;
  return {
    query: async () => {
      call++;
      return { rows: [{ n: call === 1 ? hpCount : hdCount }] };
    },
  };
}

describe('H4 — assertHeritageSourceNonEmpty (L14, ported from enrich-ravines.js assertRavinesNonEmpty)', () => {
  it('throws when heritage_properties is empty', async () => {
    await expect(eh.assertHeritageSourceNonEmpty(stubDb(0, 5))).rejects.toThrow(/heritage_properties is empty/);
  });

  it('throws when heritage_districts is empty (heritage_properties non-empty)', async () => {
    await expect(eh.assertHeritageSourceNonEmpty(stubDb(5, 0))).rejects.toThrow(/heritage_districts is empty/);
  });

  it('resolves when both are non-empty', async () => {
    await expect(eh.assertHeritageSourceNonEmpty(stubDb(5, 5))).resolves.toBeUndefined();
  });

  it(
    'g/b — main() calls assertHeritageSourceNonEmpty BEFORE countStale (L14 must hold on the skip branch too, ' +
      'ravines precedent: "a wiped ravines table must HALT even when matching stamps would otherwise satisfy the #418 skip")',
    () => {
      const src = enrichHeritageSrc();
      const mainBody = src.match(/async function main\(pool\)[\s\S]*?\n}\n/);
      expect(mainBody, 'main(pool) function body not found').not.toBeNull();
      const nonEmptyIdx = mainBody![0].indexOf('assertHeritageSourceNonEmpty(pool)');
      const countStaleIdx = mainBody![0].indexOf('countStale(pool');
      expect(nonEmptyIdx).toBeGreaterThan(-1);
      expect(countStaleIdx).toBeGreaterThan(-1);
      expect(nonEmptyIdx).toBeLessThan(countStaleIdx);
    },
  );
});

describe('H1 (textual mirror-lock, pre-behavioral) — countStale probe mirrors ENRICH_SQL eligibility', () => {
  it(
    'ENRICH_SQL excludes invalid/empty geometry from parcel_c (the wedge-open trap source)',
    () => {
      const src = enrichHeritageSrc();
      const enrichSqlBlock = src.match(/const ENRICH_SQL = `[\s\S]*?`;/);
      expect(enrichSqlBlock, 'ENRICH_SQL block not found').not.toBeNull();
      expect(enrichSqlBlock![0]).toMatch(/NOT ST_IsEmpty\(p\.geom\)/);
      expect(enrichSqlBlock![0]).toMatch(/ST_IsValid\(p\.geom\)/);
    },
  );

  it(
    'countStale mirrors that SAME eligibility predicate (NOT ST_IsEmpty + ST_IsValid) — the fix that closes the trap',
    () => {
      const src = enrichHeritageSrc();
      const fnBody = src.match(/async function countStale\(db, datasetVersion\)[\s\S]*?\n}\n/);
      expect(fnBody, 'countStale function body not found').not.toBeNull();
      expect(fnBody![0]).toMatch(/NOT ST_IsEmpty\(geom\)/);
      expect(fnBody![0]).toMatch(/ST_IsValid\(geom\)/);
    },
  );
});
