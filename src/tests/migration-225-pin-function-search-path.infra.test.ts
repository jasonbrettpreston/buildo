// 🔗 SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §6
//
// Mig 225 fixes the Phase 0.5 restore blocker: pg_restore forces
// search_path='' (CVE-2018-1058 hardening) and permits_set_lead_id()
// referenced permit_type_classifications unqualified, aborting the COPY
// into `permits`. The DO block pins search_path=public on every
// Buildo-authored public-schema function while excluding extension-owned
// (PostGIS/pg_trgm/fuzzystrmatch) routines via the pg_depend deptype='e'
// filter, and excludes aggregates/window functions via prokind.
//
// SQL-shape regression-lock — no live DB needed (the real coverage is the
// BUILDO_TEST_DB / local-Supabase replay, per this file's own commentary
// convention — see migration-159's equivalent note).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 225 — pin function search_path', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/225_pin_function_search_path.sql'),
      'utf-8',
    );
  });

  it('pins search_path=public via ALTER FUNCTION inside a dynamic EXECUTE', () => {
    expect(sql).toMatch(/EXECUTE\s+format\(\s*'ALTER FUNCTION %s SET search_path = public'/i);
  });

  it('excludes extension-owned routines via pg_depend deptype=\'e\'', () => {
    expect(sql).toMatch(/pg_depend/i);
    expect(sql).toMatch(/deptype\s*=\s*'e'/);
  });

  it('excludes aggregates and window functions via prokind', () => {
    expect(sql).toMatch(/prokind\s+NOT\s+IN\s*\(\s*'a'\s*,\s*'w'\s*\)/i);
  });

  it('SPEC LINK header references Spec 113 §6', () => {
    expect(sql).toMatch(/Spec\s+113|113_supabase_infrastructure/i);
  });

  it('DOWN block is comments-only (Rule 6)', () => {
    const downIdx = sql.search(/^--\s*DOWN\b/im);
    expect(downIdx).toBeGreaterThan(-1);
    const downBlock = sql.slice(downIdx);
    const executableLines = downBlock
      .split('\n')
      .slice(1)
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('--'));
    expect(executableLines).toEqual([]);
  });
});
