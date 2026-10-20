// SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md (link_parcel_abutments — PROPOSED)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (B1)
// SQL-shape regression-lock for migration 255 - no live DB needed.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateMigration } = require('../../scripts/validate-migration.js');

const MIGRATION_FILE = '255_parcel_abutments.sql';
const TRIGGER_FUNCTION_RE =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+trg_parcels_invalidate_abutments\(\)[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql\s*;/i;

/** Strip `--` line comments so the shape checks only see executable SQL. */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

describe('migration 255 — parcel_abutments linkage', () => {
  let sql: string;
  let executable: string;
  let tableBody: string;

  beforeAll(() => {
    sql = fs.readFileSync(path.resolve(__dirname, '../../migrations', MIGRATION_FILE), 'utf-8');
    executable = stripLineComments(sql);

    const tableMatch =
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+parcel_abutments\s*\(([\s\S]*?)\);/i.exec(executable);
    expect(tableMatch).not.toBeNull();
    tableBody = tableMatch![1] as string;
  });

  it('creates parcel_abutments idempotently with the ordered-pair key and both cascading FKs', () => {
    expect(executable).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+parcel_abutments\s*\(/i);

    expect(tableBody).toMatch(
      /\bparcel_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+parcels\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE\b/i,
    );
    expect(tableBody).toMatch(
      /\bneighbour_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+parcels\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE\b/i,
    );
    expect(tableBody).toMatch(/PRIMARY\s+KEY\s*\(\s*parcel_id\s*,\s*neighbour_id\s*\)/i);
  });

  it('has the no-self-pair CHECK', () => {
    expect(tableBody).toMatch(
      /CONSTRAINT\s+parcel_abutments_no_self\s+CHECK\s*\(\s*parcel_id\s*<>\s*neighbour_id\s*\)/i,
    );
  });

  it('pins the closed est_status set in both directions', () => {
    const inList = /est_status\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*est_status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      tableBody,
    );
    expect(inList).not.toBeNull();
    const actual = Array.from(inList![1]!.matchAll(/'([^']*)'/g), (m) => String(m[1])).sort();
    const expected = [
      'estimated',
      'no_building',
      'no_frontage_street',
      'street_not_found',
      'estimate_negative',
      'estimate_out_of_bounds',
    ].sort();
    expect(actual).toEqual(expected);
    expect(expected).toEqual(actual);
  });

  it('has the estimate-iff-estimated CHECK and the building-status CHECK', () => {
    expect(tableBody).toMatch(
      /CONSTRAINT\s+parcel_abutments_estimate_iff_estimated\s+CHECK\s*\(\s*\(\s*est_status\s*=\s*'estimated'\s*\)\s*=\s*\(\s*front_setback_est_m\s+IS\s+NOT\s+NULL\s*\)\s*\)/i,
    );
    expect(tableBody).toMatch(
      /CONSTRAINT\s+parcel_abutments_building_status\s+CHECK\s*\(\s*est_status\s*=\s*'no_building'\s+OR\s+neighbour_building_id\s+IS\s+NOT\s+NULL\s*\)/i,
    );
  });

  it('creates the neighbour index', () => {
    expect(executable).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_parcel_abutments_neighbour\s+ON\s+parcel_abutments\s*\(\s*neighbour_id\s*\)/i,
    );
  });

  // rule-map: R-CR (partial) — trigger installed; guards.requires declaration not asserted (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('installs the AFTER UPDATE OF geom invalidation trigger over the material-change predicate', () => {
    const trigger =
      /CREATE\s+TRIGGER\s+trg_parcels_abutments_invalidation\s+AFTER\s+UPDATE\s+OF\s+geom\s+ON\s+parcels\s+FOR\s+EACH\s+ROW\s+WHEN\s*\(\s*public\.parcels_geom_materially_changed\s*\(\s*OLD\.geom\s*,\s*NEW\.geom\s*\)\s*\)\s+EXECUTE\s+FUNCTION\s+trg_parcels_invalidate_abutments\s*\(\s*\)/i;
    expect(executable).toMatch(trigger);

    const funcMatch = TRIGGER_FUNCTION_RE.exec(executable);
    expect(funcMatch).not.toBeNull();
    // The function body deletes BOTH orientations for the changed parcel.
    expect(funcMatch![0]).toMatch(
      /DELETE\s+FROM\s+parcel_abutments\s+WHERE\s+parcel_id\s*=\s*NEW\.id\s+OR\s+neighbour_id\s*=\s*NEW\.id/i,
    );
  });

  it('leaves the 242-254 geom trigger function untouched', () => {
    expect(executable).not.toMatch(/trg_parcels_invalidate_on_geom_change/);
  });

  it('has -- UP / -- DOWN markers and a comments-only DOWN dropping the table', () => {
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

    const dropTableLine = downText
      .split('\n')
      .find((line) => /DROP\s+TABLE\s+IF\s+EXISTS\s+parcel_abutments/i.test(line));
    expect(dropTableLine).toBeDefined();
    expect(dropTableLine).toMatch(/ALLOW-DESTRUCTIVE/);
  });

  it('passes validateMigration', () => {
    const result = validateMigration(sql, MIGRATION_FILE);
    expect(result.ok).toBe(true);
  });
});
