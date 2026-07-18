// SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §5 (Class C)
// SPEC LINK: docs/specs/00-architecture/13_authentication.md (Decision D7)
//
// Migration 226 creates `profiles` (Class C: self-read/self-update-minus-
// is_admin), the `handle_new_user` bootstrap trigger, and the
// `prevent_is_admin_self_escalation` column-guard trigger. This is a
// SQL-shape regression-lock — no live DB needed, following the same
// convention as migration-225's test (the real coverage is the
// BUILDO_TEST_DB / local-Supabase replay this session already ran
// interactively — see the task's psql-equivalent verification output).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 226 — profiles + admin bootstrap', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/226_profiles_admin_bootstrap.sql'),
      'utf-8',
    );
  });

  it('SPEC LINK header references Spec 114 §5', () => {
    expect(sql).toMatch(/Spec\s+114|114_rls_policy_catalog/i);
  });

  it('creates profiles with id UUID PK FK to auth.users(id) ON DELETE CASCADE', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+profiles\s*\(/i);
    expect(sql).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  });

  it('is_admin is BOOLEAN NOT NULL DEFAULT false', () => {
    expect(sql).toMatch(/is_admin\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
  });

  it('creates handle_new_user trigger function that inserts a profiles row on auth.users INSERT', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+handle_new_user\(\)/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.profiles\s*\(id\)\s+VALUES\s*\(NEW\.id\)/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+on_auth_user_created\s+AFTER\s+INSERT\s+ON\s+auth\.users/i);
  });

  it('handle_new_user pins search_path=public (SECURITY DEFINER)', () => {
    const fnMatch = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+handle_new_user\(\)[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql\s+SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public/i;
    expect(sql).toMatch(fnMatch);
  });

  it('enables RLS on profiles with self-read/self-update-own policies', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+profiles\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/CREATE\s+POLICY\s+profiles_select_own\s+ON\s+profiles\s+FOR\s+SELECT\s+USING\s*\(auth\.uid\(\)\s*=\s*id\)/i);
    expect(sql).toMatch(/CREATE\s+POLICY\s+profiles_update_own\s+ON\s+profiles\s+FOR\s+UPDATE\s+USING\s*\(auth\.uid\(\)\s*=\s*id\)\s+WITH\s+CHECK\s*\(auth\.uid\(\)\s*=\s*id\)/i);
  });

  it('is_admin self-escalation guard trigger exists and checks IS DISTINCT FROM', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+prevent_is_admin_self_escalation\(\)/i);
    expect(sql).toMatch(/NEW\.is_admin\s+IS\s+DISTINCT\s+FROM\s+OLD\.is_admin/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+trg_prevent_is_admin_self_escalation\s+BEFORE\s+UPDATE\s+ON\s+profiles/i);
  });

  it('prevent_is_admin_self_escalation pins search_path=public (Spec 113 §6 / migration 225 lesson)', () => {
    const fnMatch = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+prevent_is_admin_self_escalation\(\)[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql\s+SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public/i;
    expect(sql).toMatch(fnMatch);
  });

  it('documents the trigger as inert-by-design under D1/raw-pg (not silently assumed live)', () => {
    expect(sql).toMatch(/INERT BY DESIGN/i);
    expect(sql).toMatch(/request\.jwt\.claims/i);
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
