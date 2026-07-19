// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
// SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B deny-all)
// SPEC LINK: .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22)
//
// Migration 231 creates `admin_backup_codes` (hashed one-time MFA backup
// codes, RLS deny-all, server-only via the D1 pool). SQL-shape
// regression-lock, no live DB needed — same convention as migration-228's
// test; live coverage is the local-Supabase apply + the pgTAP suite
// (supabase/tests/rls_admin_backup_codes.test.sql).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 231 — admin_backup_codes', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/231_admin_backup_codes.sql'),
      'utf-8',
    );
  });

  it('SPEC LINK header references Spec 13 (auth) and fold 22 / P1-F4.3', () => {
    expect(sql).toMatch(/13_authentication/i);
    expect(sql).toMatch(/fold 22|P1-F4\.3/i);
  });

  it('creates admin_backup_codes', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+admin_backup_codes\s*\(/i);
  });

  it('user_id is UUID NOT NULL FK to auth.users(id) ON DELETE CASCADE', () => {
    expect(sql).toMatch(
      /user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it('stores hash + per-code salt, both NOT NULL — never a plaintext code column', () => {
    expect(sql).toMatch(/code_hash\s+TEXT\s+NOT\s+NULL/i);
    expect(sql).toMatch(/code_salt\s+TEXT\s+NOT\s+NULL/i);
    // Defense against a future "convenience" plaintext column sneaking in —
    // evaluated on EXECUTABLE lines only (the prose comments legitimately
    // discuss plaintext handling).
    const executableSql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executableSql).not.toMatch(/code_plain|plaintext|\bcode\s+TEXT/i);
  });

  it('used_at is nullable (single-use watermark) and created_at defaults to NOW()', () => {
    expect(sql).toMatch(/used_at\s+TIMESTAMPTZ\s*,/i);
    expect(sql).not.toMatch(/used_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i);
  });

  it('creates the partial unused-codes index on user_id', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+idx_admin_backup_codes_user_unused\s+ON\s+admin_backup_codes\s*\(\s*user_id\s*\)\s+WHERE\s+used_at\s+IS\s+NULL/i,
    );
  });

  it('enables RLS with ZERO policies (Class B deny-all — Spec 114 §4 + §11 guard)', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+admin_backup_codes\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
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

  it('UP block is wrapped in an explicit transaction', () => {
    const upIdx = sql.search(/^--\s*UP\b/im);
    const downIdx = sql.search(/^--\s*DOWN\b/im);
    const upBlock = sql.slice(upIdx, downIdx === -1 ? undefined : downIdx);
    expect(upBlock).toMatch(/\bBEGIN;/);
    expect(upBlock).toMatch(/\bCOMMIT;/);
  });
});
