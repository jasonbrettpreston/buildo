// Logic Layer Tests — Migration 069 (lead_views table) + factory
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createMockLeadView } from './factories';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '069_lead_views.sql'
);

describe('Migration 069 — lead_views table', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('creates the lead_views table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS lead_views/);
  });

  it('has user_id, permit_num, revision_num, viewed_at columns', () => {
    expect(sql).toMatch(/user_id\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/permit_num\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/revision_num\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/viewed_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/);
  });

  it('uses (user_id, permit_num, revision_num) as composite PK', () => {
    expect(sql).toMatch(/PRIMARY KEY \(user_id, permit_num, revision_num\)/);
  });

  it('creates the user/viewed_at descending index for "recently viewed" queries', () => {
    expect(sql).toMatch(/idx_lead_views_user_viewed[\s\S]*\(user_id, viewed_at DESC\)/);
  });

  it('creates the (permit_num, revision_num) index for "who has seen this lead" queries', () => {
    expect(sql).toMatch(/idx_lead_views_permit[\s\S]*\(permit_num, revision_num\)/);
  });
});

describe('createMockLeadView factory', () => {
  it('returns sensible defaults matching the lead_views schema', () => {
    const v = createMockLeadView();
    expect(v.user_id).toBeTypeOf('string');
    expect(v.permit_num).toBeTypeOf('string');
    expect(v.revision_num).toBeTypeOf('number');
    expect(v.viewed_at).toBeInstanceOf(Date);
  });

  it('respects overrides', () => {
    const v = createMockLeadView({ user_id: 'other-uid', revision_num: 3 });
    expect(v.user_id).toBe('other-uid');
    expect(v.revision_num).toBe(3);
  });
});
