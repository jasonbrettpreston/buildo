// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 (dated note 2026-11-11 item 3: the support inbox is ONE setting),
//            §11b.3 (dated note 2026-11-12, MF-46: the mailto role and the inbox setting); migration 219 (the JSONB-string precedent).
//
// MF-46 follow-up (Help & Support contact). Reads migrations/313_maxbld_support_inbox.sql as text (no DB; the operator's DB job applies it):
//   the one row is inserted EMPTY as a JSONB string with the sentinel 0 (the 219 precedent), ON CONFLICT (variable_key) DO NOTHING (an
//   operator-set address is never clobbered), in one transaction, no table altered, the DOWN comment-only, and no email address anywhere in it
//   (the address comes only from the operator's setting). Each RED plant is an in-memory copy of the text, never a file edit.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SUPPORT_INBOX_KEY } from '@/lib/surfaces/maxbld-support';

const MIGRATION = 'migrations/313_maxbld_support_inbox.sql';
const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

export const migrationProblems = (s: string): string[] => {
  const up = upOf(s);
  const out: string[] = [];
  const ins = new RegExp(`INSERT INTO logic_variables \\(variable_key, variable_value, variable_value_json, description\\) VALUES\\s+\\('${SUPPORT_INBOX_KEY}', 0, '""'::jsonb, '(?:[^']|'')*'\\)\\s+ON CONFLICT \\(variable_key\\) DO NOTHING;`).exec(up);
  if (!ins) out.push(`${SUPPORT_INBOX_KEY}: no empty JSONB-string INSERT ... ON CONFLICT DO NOTHING`);
  if (/ALTER TABLE|DROP |DELETE FROM|UPDATE /i.test(up)) out.push('a table altered or rows changed');
  if (!up.trim().startsWith('BEGIN;') || !up.trim().endsWith('COMMIT;')) out.push('not one transaction');
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)) out.push('an email address in the migration');
  const down = (s.split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1);
  if (down.some((l) => l.trim() !== '' && !l.trim().startsWith('--'))) out.push('a DOWN line is not a comment');
  return out;
};

describe('migration 313: the support inbox setting (seeded empty, never typed)', () => {
  it('the committed migration is clean', () => {
    expect(migrationProblems(read(MIGRATION))).toEqual([]);
  });
  it('RED: a typed address, a missing ON CONFLICT, an uncommented DOWN line', () => {
    const m = read(MIGRATION);
    const at = ['help', 'example.ca'].join('@');
    expect(migrationProblems(m.replace(`'""'::jsonb`, `'"${at}"'::jsonb`))).toEqual([`${SUPPORT_INBOX_KEY}: no empty JSONB-string INSERT ... ON CONFLICT DO NOTHING`, 'an email address in the migration']);
    expect(migrationProblems(m.replace(/\s+ON CONFLICT \(variable_key\) DO NOTHING;/, ';'))).toEqual([`${SUPPORT_INBOX_KEY}: no empty JSONB-string INSERT ... ON CONFLICT DO NOTHING`]);
    expect(migrationProblems(`${m}\nDELETE FROM logic_variables WHERE variable_key = '${SUPPORT_INBOX_KEY}';\n`)).toEqual(['a DOWN line is not a comment']);
  });
});
