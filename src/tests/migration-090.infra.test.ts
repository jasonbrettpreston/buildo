// 🔗 SPEC LINK: CRM Memory Columns (migration 090)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 090 — tracked_projects memory + expanded status', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/090_tracked_projects_memory.sql'),
      'utf-8',
    );
  });

  it('adds last_notified_urgency column', () => {
    expect(sql).toMatch(/last_notified_urgency\s+VARCHAR\(50\)/);
  });

  it('adds last_notified_stalled column with boolean default', () => {
    expect(sql).toMatch(/last_notified_stalled\s+BOOLEAN\s+DEFAULT\s+false/);
  });

  it('expands status CHECK to include saved, claimed, archived', () => {
    expect(sql).toMatch(/'saved'/);
    expect(sql).toMatch(/'claimed'/);
    expect(sql).toMatch(/'archived'/);
    // Backward compat: keeps original values
    expect(sql).toMatch(/'claimed_unverified'/);
    expect(sql).toMatch(/'verified'/);
    expect(sql).toMatch(/'expired'/);
  });

  it('has UPDATE safety before constraint swap', () => {
    // Prevents constraint violation if unexpected status values exist
    expect(sql).toMatch(/UPDATE tracked_projects SET status/);
  });

  it('has commented DOWN block', () => {
    expect(sql).toMatch(/-- DOWN/);
    expect(sql).toMatch(/DROP COLUMN.*last_notified/);
  });
});
