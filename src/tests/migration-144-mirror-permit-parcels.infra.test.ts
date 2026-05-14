// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C R5.3
//
// Migration 144 — mirror trigger on permit_parcels → lead_parcels.
// Same pattern as migration 143. Column rename: linked_at → matched_at.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 144 — mirror permit_parcels → lead_parcels trigger (Phase C R5.3)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/144_mirror_permit_parcels_to_lead_parcels.sql'),
      'utf-8',
    );
  });

  it('creates the mirror trigger function', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+mirror_permit_parcels_to_lead_parcels\s*\(\s*\)\s+RETURNS\s+TRIGGER/i);
  });

  it('INSERT branch derives lead_id', () => {
    expect(sql).toMatch(/IF\s+TG_OP\s*=\s*'INSERT'/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+lead_parcels[\s\S]*?'permit:'\s*\|\|\s*NEW\.permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*NEW\.revision_num\s*,\s*2\s*,\s*'0'\s*\)/i);
  });

  it('INSERT branch uses ON CONFLICT (lead_id, parcel_id) DO UPDATE (idempotent)', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*lead_id\s*,\s*parcel_id\s*\)\s+DO\s+UPDATE/i);
  });

  it('maps linked_at → matched_at (column rename across the schema delta)', () => {
    // The lead_parcels table uses matched_at; permit_parcels uses linked_at.
    // The INSERT must source matched_at from NEW.linked_at.
    expect(sql).toMatch(/matched_at\b[\s\S]*?NEW\.linked_at|NEW\.linked_at[\s\S]*?matched_at/i);
  });

  it('handles UPDATE + DELETE branches', () => {
    expect(sql).toMatch(/ELSIF\s+TG_OP\s*=\s*'UPDATE'/i);
    expect(sql).toMatch(/ELSIF\s+TG_OP\s*=\s*'DELETE'/i);
    expect(sql).toMatch(/'permit:'\s*\|\|\s*OLD\.permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*OLD\.revision_num\s*,\s*2\s*,\s*'0'\s*\)/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+lead_parcels[\s\S]*?WHERE\s+lead_id\s*=/i);
    expect(sql).toMatch(/AND\s+parcel_id\s*=\s*OLD\.parcel_id/i);
  });

  it('UPDATE branch uses INSERT ON CONFLICT DO UPDATE (R5.3.f defensive upsert)', () => {
    // Two INSERT...ON CONFLICT in the function: INSERT branch + UPDATE branch
    const inserts = sql.match(/INSERT\s+INTO\s+lead_parcels/gi) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });

  it('UPDATE branch raises EXCEPTION on key change (R5.3.f defensive guard)', () => {
    expect(sql).toMatch(/IF\s+old_lead_id\s+IS\s+DISTINCT\s+FROM\s+new_lead_id\s+THEN[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('creates AFTER trigger on permit_parcels', () => {
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+trg_mirror_permit_parcels_to_lead_parcels[\s\S]*?AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+permit_parcels/i);
  });

  it('uses DROP TRIGGER IF EXISTS for idempotency', () => {
    expect(sql).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_mirror_permit_parcels_to_lead_parcels\s+ON\s+permit_parcels/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });
});
