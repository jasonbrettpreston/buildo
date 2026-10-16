// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (load_bylaw_map_areas — PROPOSED)
// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (sixplex overlay pass — PROPOSED)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A2)
// SQL-shape regression-lock for migration 254 - no live DB needed.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateMigration } = require('../../scripts/validate-migration.js');

const MIGRATION_FILE = '254_bylaw_map_areas_sixplex.sql';
const PREDECESSOR_FILE = '251_parcels_geom_material_change.sql';
const TRIGGER_FUNCTION_RE =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+trg_parcels_invalidate_on_geom_change\(\)[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql\s*;/i;

/** Strip `--` line comments so the shape checks only see executable SQL. */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** Extract the whole trg_parcels_invalidate_on_geom_change() definition block. */
function extractTriggerFunction(sql: string): string {
  const match = TRIGGER_FUNCTION_RE.exec(sql);
  if (!match) throw new Error('trg_parcels_invalidate_on_geom_change() block not found');
  return match[0];
}

describe('migration 254 — bylaw_map_areas + parcels sixplex membership', () => {
  let sql: string;
  let executable: string;

  beforeAll(() => {
    sql = fs.readFileSync(path.resolve(__dirname, '../../migrations', MIGRATION_FILE), 'utf-8');
    executable = stripLineComments(sql);
  });

  it('creates bylaw_map_areas idempotently with the pinned key, checks and geometry types', () => {
    expect(executable).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+bylaw_map_areas\s*\(/i);

    const tableMatch = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+bylaw_map_areas\s*\(([\s\S]*?)\);/i.exec(
      executable,
    );
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![1];

    expect(body).toMatch(/\barea_key\s+TEXT\s+PRIMARY\s+KEY\b/i);
    expect(body).toMatch(/\bmap_code\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*map_code\s+IN\s*\(\s*'600\.60'\s*\)\s*\)/i);
    expect(body).toMatch(
      /\bsource\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*source\s+IN\s*\(\s*'city_gis_layer80'\s*,\s*'ckan_wards_2018'\s*\)\s*\)/i,
    );
    expect(body).toMatch(/\barea_type\s+SMALLINT\s+NOT\s+NULL\s+CHECK\s*\(\s*area_type\s+IN\s*\(\s*3\s*,\s*4\s*\)\s*\)/i);
    expect(body).toMatch(/\bgeom\s+geometry\s*\(\s*MultiPolygon\s*,\s*4326\s*\)\s+NOT\s+NULL\b/i);
    expect(body).toMatch(/\bUNIQUE\s*\(\s*source\s*,\s*source_feature_id\s*\)/i);
    expect(body).toMatch(
      /CHECK\s*\(\s*area_key\s*=\s*source\s*\|\|\s*':'\s*\|\|\s*source_feature_id::text\s*\)/i,
    );
    expect(body).toMatch(/\bseed_sha256\s+CHAR\(64\)\s+NOT\s+NULL\b/i);
  });

  it('has exactly one CREATE INDEX — the GiST on bylaw_map_areas.geom — and none on parcels', () => {
    const indexStatements = executable.match(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*;/gi) ?? [];
    expect(indexStatements).toHaveLength(1);
    expect(indexStatements[0]).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_bylaw_map_areas_geom_gist\s+ON\s+bylaw_map_areas\s+USING\s+GIST\s*\(\s*geom\s*\)/i,
    );
    expect(executable).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*\bON\s+parcels\b/i);
  });

  it('adds the three nullable parcels columns, catalog-only (no DEFAULT, no NOT NULL)', () => {
    const columns: Array<[string, string]> = [
      ['in_sixplex_area', 'BOOLEAN'],
      ['sixplex_area_type', 'SMALLINT'],
      ['sixplex_membership_basis', 'TEXT'],
    ];
    for (const [column, type] of columns) {
      const addColumn = new RegExp(
        `ALTER\\s+TABLE\\s+parcels\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${column}\\s+${type}\\s+NULL[^;]*`,
        'i',
      ).exec(executable);
      expect(addColumn, `missing ADD COLUMN ${column}`).not.toBeNull();
      expect(addColumn![0]).not.toMatch(/DEFAULT/i);
      expect(addColumn![0]).not.toMatch(/NOT\s+NULL/i);
    }
  });

  it('does not backfill: no UPDATE parcels', () => {
    expect(executable).not.toMatch(/UPDATE\s+parcels/i);
  });

  it("the basis CHECK lists exactly the six closed values and ends NOT VALID", () => {
    const constraint = executable.match(
      /ALTER\s+TABLE\s+parcels\s+ADD\s+CONSTRAINT\s+parcels_sixplex_membership_basis_check\s+CHECK\s*\(([\s\S]*?)\)\s*NOT\s+VALID\s*;/i,
    );
    expect(constraint).not.toBeNull();
    const body = constraint![1] as string;
    expect(constraint![0]).toMatch(/\)\s*NOT\s+VALID\s*;$/i);

    const inList = /IN\s*\(([\s\S]*?)\)/i.exec(body);
    expect(inList).not.toBeNull();
    const actual = Array.from(inList![1]!.matchAll(/'([^']*)'/g), (m) => String(m[1])).sort();
    const expected = [
      'gis_in',
      'gis_out_ward_out',
      'gis_hole_ward_in',
      'gis_edge_ward_in',
      'straddle',
      'no_geom',
    ].sort();
    expect(actual).toEqual(expected);
    expect(expected).toEqual(actual);
  });

  it('pins the consistency CHECK arms, mutually exclusive with the basis set, and drops it on DOWN', () => {
    // Executable SQL carries the exact ADD CONSTRAINT and its statement ends NOT VALID;
    const addConstraint =
      /ALTER\s+TABLE\s+parcels\s+ADD\s+CONSTRAINT\s+parcels_sixplex_membership_consistency\s+CHECK\s*\(([\s\S]*?)\)\s*NOT\s+VALID\s*;/i.exec(
        executable,
      );
    expect(addConstraint).not.toBeNull();
    const rawBody = addConstraint![1] as string;
    // The statement itself ends `NOT VALID;` (not something later in the file).
    expect(addConstraint![0]).toMatch(/\)\s*NOT\s+VALID\s*;\s*$/i);
    expect(executable).toContain('ADD CONSTRAINT parcels_sixplex_membership_consistency CHECK (');

    const body = rawBody.replace(/\s+/g, ' ');

    // All-NULL arm: an untouched row / pre-enrichment row.
    expect(body).toContain(
      'sixplex_membership_basis IS NULL AND in_sixplex_area IS NULL AND sixplex_area_type IS NULL',
    );
    // gis_in arm: TRUE and a concrete area_type in {3, 4}.
    expect(body).toContain(
      "sixplex_membership_basis = 'gis_in' AND in_sixplex_area IS TRUE AND sixplex_area_type IN (3, 4)",
    );
    // gis_out_ward_out arm: FALSE and no area_type.
    expect(body).toContain(
      "sixplex_membership_basis = 'gis_out_ward_out' AND in_sixplex_area IS FALSE AND sixplex_area_type IS NULL",
    );
    // The NULL-basis arm: exactly the four disputed/unevaluable bases.
    const nullArm =
      /sixplex_membership_basis\s+IN\s*\(([^)]*)\)\s+AND\s+in_sixplex_area\s+IS\s+NULL\s+AND\s+sixplex_area_type\s+IS\s+NULL/i.exec(
        body,
      );
    expect(nullArm).not.toBeNull();
    const nullArmValues = Array.from(nullArm![1]!.matchAll(/'([^']*)'/g), (m) => String(m[1])).sort();
    expect(nullArmValues).toEqual(
      ['gis_hole_ward_in', 'gis_edge_ward_in', 'straddle', 'no_geom'].sort(),
    );

    // Every basis value has EXACTLY ONE consistency arm: the union of the singleton arms and
    // the four-value NULL-basis arm equals the six-value basis set pinned in this file.
    const basisSet = [
      'gis_in',
      'gis_out_ward_out',
      'gis_hole_ward_in',
      'gis_edge_ward_in',
      'straddle',
      'no_geom',
    ].sort();
    const armValues = ['gis_in', 'gis_out_ward_out', ...nullArmValues].sort();
    expect(armValues).toEqual(basisSet);
    expect(basisSet).toEqual(armValues);

    // DOWN comments drop the consistency CHECK alongside the basis CHECK.
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS parcels_sixplex_membership_consistency');
  });

  it('re-creates the geom-change trigger function from 251 verbatim, plus the sixplex arm', () => {
    const predecessorSql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations', PREDECESSOR_FILE),
      'utf-8',
    );
    const current = extractTriggerFunction(sql);
    const predecessor = extractTriggerFunction(predecessorSql);

    // Remove from 254's block the 5 lines that are new to migration 254 (the "Migration 254"
    // marker comment, the two comment lines, and the zoning_enriched_at re-scope parenthetical).
    const migration254LineFragments = [
      'Migration 254',
      'zoning_enriched_at NULL above',
      'in_sixplex_area',
      'sixplex_area_type',
      'sixplex_membership_basis',
    ];
    const withoutNewLines = current
      .split('\n')
      .filter((line) => !migration254LineFragments.some((frag) => line.includes(frag)))
      .filter((line, index, lines) => !(line.trim() === '' && lines[index - 1]?.trim() === ''))
      .join('\n');

    expect(withoutNewLines).toBe(predecessor);

    // The three membership NULLs must be set BEFORE the nested `IF material THEN` block.
    const ifMaterialIndex = current.search(/\bIF\s+material\s+THEN\b/i);
    expect(ifMaterialIndex).toBeGreaterThan(-1);
    for (const assignment of [
      'NEW.in_sixplex_area := NULL;',
      'NEW.sixplex_area_type := NULL;',
      'NEW.sixplex_membership_basis := NULL;',
    ]) {
      const assignmentIndex = current.indexOf(assignment);
      expect(assignmentIndex, `missing ${assignment}`).toBeGreaterThan(-1);
      expect(assignmentIndex).toBeLessThan(ifMaterialIndex);
    }
  });

  it('does not re-create the 242 trigger', () => {
    expect(executable).not.toMatch(/CREATE\s+TRIGGER/i);
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

    expect(downText).toMatch(/DROP\s+TABLE\s+IF\s+EXISTS\s+bylaw_map_areas/i);

    const dropColumns = downText.match(/DROP\s+COLUMN\s+IF\s+EXISTS\s+(\w+)/gi) ?? [];
    expect(dropColumns).toHaveLength(3);
    for (const dropColumn of dropColumns) {
      expect(dropColumn).toMatch(/in_sixplex_area|sixplex_area_type|sixplex_membership_basis/i);
    }
    // Each DROP COLUMN line carries the ALLOW-DESTRUCTIVE marker.
    for (const line of downText.split('\n')) {
      if (/DROP\s+COLUMN\s+IF\s+EXISTS/i.test(line)) {
        expect(line).toMatch(/ALLOW-DESTRUCTIVE/);
      }
    }
  });

  it('passes validateMigration', () => {
    const result = validateMigration(sql, MIGRATION_FILE);
    expect(result.ok).toBe(true);
  });
});
