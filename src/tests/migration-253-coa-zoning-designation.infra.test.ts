// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md (Target Table: zoning_designation)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (C1)
// SQL-shape regression-lock for migration 253 - no live DB needed.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateMigration } = require('../../scripts/validate-migration.js');

const MIGRATION_FILE = '253_coa_zoning_designation.sql';

describe('migration 253 — coa_applications.zoning_designation column', () => {
  let sql: string;
  let executable: string;

  beforeAll(() => {
    sql = fs.readFileSync(path.resolve(__dirname, '../../migrations', MIGRATION_FILE), 'utf-8');
    // Strip `--` line comments so the shape checks only see executable SQL.
    executable = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  });

  it('adds zoning_designation as a nullable TEXT column, idempotently', () => {
    expect(executable).toMatch(
      /ALTER\s+TABLE\s+coa_applications\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+zoning_designation\s+TEXT\s+NULL/i,
    );
  });

  it('has no DEFAULT and no NOT NULL on the added column (catalog-only ADD COLUMN, no rewrite)', () => {
    const addColumn = executable.match(
      /ALTER\s+TABLE\s+coa_applications\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+zoning_designation[^;]*/i,
    );
    expect(addColumn).not.toBeNull();
    expect(addColumn![0]).not.toMatch(/DEFAULT/i);
    expect(addColumn![0]).not.toMatch(/NOT\s+NULL/i);
  });

  it('does not backfill: no UPDATE coa_applications and no CREATE INDEX', () => {
    expect(executable).not.toMatch(/UPDATE\s+coa_applications/i);
    expect(executable).not.toMatch(/CREATE\s+INDEX/i);
  });

  it('documents the column with a COMMENT ON COLUMN', () => {
    expect(executable).toMatch(
      /COMMENT\s+ON\s+COLUMN\s+coa_applications\.zoning_designation\s+IS/i,
    );
  });

  it('has -- UP / -- DOWN markers and a comments-only DOWN', () => {
    expect(sql).toMatch(/^\s*--\s*UP\s*$/m);
    expect(sql).toMatch(/^\s*--\s*DOWN\b/m);

    const downIndex = sql.search(/^\s*--\s*DOWN\b/m);
    expect(downIndex).toBeGreaterThan(-1);
    const downText = sql.slice(downIndex);

    const afterDown = downText.split('\n').slice(1);
    for (const line of afterDown) {
      if (line.trim() === '') continue;
      expect(line.trimStart().startsWith('--')).toBe(true);
    }

    expect(downText).toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS\s+zoning_designation/i);
    expect(downText).toContain('ALLOW-DESTRUCTIVE');
  });

  it('passes validateMigration', () => {
    const result = validateMigration(sql, MIGRATION_FILE);
    expect(result.ok).toBe(true);
  });
});
