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
  assertVersionColumn: (db: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<void>;
  countStale: unknown;
  ENRICH_SQL: string;
  // D#4's export, folded into the ONE module handle below (P0b, 2026-08-23):
  // this file used to re-`require` the same module inside the D#4 describe,
  // which tripped @typescript-eslint/no-require-imports and made `npm run
  // verify` exit before the test phase ever ran.
  FORCE_FULL_ENV: string;
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
    'g/b — main() calls assertPreconditions(pool) BEFORE countStale (L14 must hold on the skip branch too, ' +
      'ravines precedent: "a wiped ravines table must HALT even when matching stamps would otherwise satisfy the #418 skip"). ' +
      'Commit C (B3 output-panel remediation): L14 now holds via assertPreconditions(pool) — which calls ' +
      'assertHeritageSourceNonEmpty internally — hoisted onto the skip path alongside the PostGIS/index/SRID checks.',
    () => {
      const src = enrichHeritageSrc();
      const mainBody = src.match(/async function main\(pool\)[\s\S]*?\n}\n/);
      expect(mainBody, 'main(pool) function body not found').not.toBeNull();
      const preconditionsIdx = mainBody![0].indexOf('assertPreconditions(pool)');
      const countStaleIdx = mainBody![0].indexOf('countStale(pool');
      expect(preconditionsIdx).toBeGreaterThan(-1);
      expect(countStaleIdx).toBeGreaterThan(-1);
      expect(preconditionsIdx).toBeLessThan(countStaleIdx);
    },
  );
});

// Commit C (B3 output-panel remediation) — assertVersionColumn (mirrors
// enrich-ravines.js:82's DEC-E) + the skip-path PostGIS/index/SRID hoist.
describe('Commit C — assertVersionColumn + skip-path precondition hoist', () => {
  it('C-R1: a missing lineage column throws a CLEAR diagnostic naming migration 171, not a raw 42703', async () => {
    const missingColumnDb = { query: async () => ({ rows: [] }) };
    await expect(eh.assertVersionColumn(missingColumnDb)).rejects.toThrow(
      /heritage_dataset_version_when_enriched missing — migration 171 not applied/,
    );
  });

  it('resolves when the column is present', async () => {
    const presentDb = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
    await expect(eh.assertVersionColumn(presentDb)).resolves.toBeUndefined();
  });

  it('g/b — main() calls assertVersionColumn(pool) BEFORE countStale (countStale reads the column this guards)', () => {
    const src = enrichHeritageSrc();
    const mainBody = src.match(/async function main\(pool\)[\s\S]*?\n}\n/);
    expect(mainBody, 'main(pool) function body not found').not.toBeNull();
    const versionColIdx = mainBody![0].indexOf('assertVersionColumn(pool)');
    const countStaleIdx = mainBody![0].indexOf('countStale(pool');
    expect(versionColIdx).toBeGreaterThan(-1);
    expect(countStaleIdx).toBeGreaterThan(-1);
    expect(versionColIdx).toBeLessThan(countStaleIdx);
  });

  it('correction lock: the commit body must NOT claim this mechanism was ported "verbatim" from enrich-ravines.js — ' +
     'enrich-ravines.js HAS assertVersionColumn; enrich-heritage.js did not, until this commit', () => {
    const src = enrichHeritageSrc();
    expect(src).toContain('was NOT: enrich-ravines.js HAS this');
  });
});

// D#4 (B3 output-panel remediation) — ENRICH_HERITAGE_FORCE_FULL escape hatch.
// Structural (source-scan), not a live-DB E2E: ENRICH_SQL's parcel_c CTE has no
// scope filter (it spatial-joins the WHOLE parcels table), so exercising main()
// end-to-end here would mutate heritage designation state on every parcel in
// the shared testcontainer DB — too invasive for this fixture. The forceFull
// -> staleCount=1 -> "if (staleCount === 0)" skip-branch-never-taken wiring is
// unconditional JS logic (no DB round-trip in the branch itself), so the
// source-scan proves the same thing a live run would.
describe('D#4 — ENRICH_HERITAGE_FORCE_FULL escape hatch', () => {
  it('exports FORCE_FULL_ENV = ENRICH_HERITAGE_FORCE_FULL', () => {
    expect(eh.FORCE_FULL_ENV).toBe('ENRICH_HERITAGE_FORCE_FULL');
  });

  it('forceFull short-circuits staleCount to a non-zero value, bypassing the #418 skip unconditionally', () => {
    const src = enrichHeritageSrc();
    expect(src).toMatch(/const forceFull = process\.env\[FORCE_FULL_ENV\] === '1';/);
    expect(src).toMatch(/const staleCount = forceFull \? 1 : await countStale\(pool, datasetVersion\);/);
  });
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
