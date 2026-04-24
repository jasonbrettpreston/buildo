// Logic Layer Tests — FK orphan audit RELATIONSHIPS registry
// 🔗 SPEC LINK: docs/specs/00-architecture/01_database_schema.md §FK Tier Classification
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RELATIONSHIPS } = require('../../scripts/quality/audit-fk-orphans.js') as {
  RELATIONSHIPS: Array<{
    tier: number;
    child: string;
    parent: string;
    childCols: string[];
    parentCols: string[];
    nullable?: boolean;
    note?: string;
  }>;
};

const DROPPED_TABLES = ['builders', 'builder_contacts'];

describe('audit-fk-orphans RELATIONSHIPS registry', () => {
  it('has no entries referencing dropped tables (builders, builder_contacts)', () => {
    const stale = RELATIONSHIPS.filter(
      (r) => DROPPED_TABLES.includes(r.child) || DROPPED_TABLES.includes(r.parent),
    );
    expect(stale).toEqual([]);
  });

  it('RELATIONSHIPS is non-empty', () => {
    expect(RELATIONSHIPS.length).toBeGreaterThan(0);
  });

  it('all entries have a valid tier value (1, 2, or 3)', () => {
    const invalid = RELATIONSHIPS.filter((r) => ![1, 2, 3].includes(r.tier));
    expect(invalid).toEqual([]);
  });

  it('all entries have non-empty childCols and parentCols', () => {
    const invalid = RELATIONSHIPS.filter(
      (r) => r.childCols.length === 0 || r.parentCols.length === 0,
    );
    expect(invalid).toEqual([]);
  });

  it('all entries have childCols and parentCols of equal length', () => {
    const mismatched = RELATIONSHIPS.filter(
      (r) => r.childCols.length !== r.parentCols.length,
    );
    expect(mismatched).toEqual([]);
  });

  it('has no duplicate child→parent+childCols+parentCols relationships', () => {
    const keys = RELATIONSHIPS.map(
      (r) =>
        `${r.child}:${r.childCols.join(',')}→${r.parent}:${r.parentCols.join(',')}`,
    );
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it('all Tier 3 entries have a meaningful note (non-empty, non-whitespace)', () => {
    const tier3 = RELATIONSHIPS.filter((r) => r.tier === 3);
    const missing = tier3.filter((r) => !r.note || r.note.trim().length === 0);
    expect(missing).toEqual([]);
  });
});
