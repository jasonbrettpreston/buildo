// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.1, §3.7, §9, §12.1
//
// Source-contract tests for load-centreline.js — lock the wiring the spec freezes:
// lock 63, the four name tokens, SPEC_VERSION 1.1, the L26 staging-CTE full-replace,
// the L15 F-C1 dual-mode guard, inline VALIDATION_SQL (NOT the shared validator),
// emitMeta two-arg write-set, and the unhappy-path branches (F9).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../scripts/load-centreline.js'), 'utf8');

describe('load-centreline.js — source contract (Spec 62 §8c)', () => {
  it('lock 63 + the four name tokens (run / marketplace / chain-scoped / cross-run)', () => {
    expect(SCRIPT).toMatch(/ADVISORY_LOCK_ID\s*=\s*63/);
    expect(SCRIPT).toMatch(/pipeline\.run\('load-centreline'/);
    expect(SCRIPT).toContain("MARKETPLACE_KEY = 'source-centreline'");
    expect(SCRIPT).toContain("PIPELINE_NAME = 'sources:load_centreline'");
  });

  it('SPEC_VERSION pinned to 1.1 (L10 re-baseline)', () => {
    expect(SCRIPT).toMatch(/SPEC_VERSION\s*=\s*'1\.1'/);
  });

  it('L26 staging-table full-replace (INCLUDING DEFAULTS INCLUDING CONSTRAINTS; DELETE then INSERT-from-temp)', () => {
    expect(SCRIPT).toContain('CREATE TEMP TABLE temp_centreline (LIKE toronto_centreline INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
    expect(SCRIPT).toContain('DELETE FROM toronto_centreline');
    expect(SCRIPT).toContain('INSERT INTO toronto_centreline');
    // full-replace ⇒ records_updated is always 0 (never UPDATE).
    expect(SCRIPT).toMatch(/records_updated:\s*0/);
  });

  it('L15 F-C1 dual-mode guard (first-run empty = FAIL; subsequent-run empty = WARN + preserve)', () => {
    expect(SCRIPT).toContain('f_c1_empty_temp_guard_fired');
    expect(SCRIPT).toContain('hasPriorRun');
    expect(SCRIPT).toContain('delete_skipped_empty_guard');
    // the guard runs before any DELETE/INSERT (insertable.length === 0 branch).
    expect(SCRIPT).toMatch(/if \(insertable\.length === 0\)/);
  });

  it('inline VALIDATION_SQL (ST_MakeValid + LineString) — NOT the shared geometry-validator', () => {
    expect(SCRIPT).toContain('const VALIDATION_SQL');
    expect(SCRIPT).toContain('ST_GeomFromGeoJSON');
    expect(SCRIPT).toContain("ST_GeometryType(repaired) = 'ST_LineString'");
    expect(SCRIPT).not.toMatch(/require\([^)]*geometry-validator/);
  });

  it('L16: validation runs in 5K-row chunks, not a single 47K-row call', () => {
    expect(SCRIPT).toMatch(/VALIDATION_CHUNK\s*=\s*5000/);
    // the VALIDATION_SQL query is inside a chunk loop (slice the kept features per chunk).
    expect(SCRIPT).toMatch(/for \(let i = 0; i < kept\.length; i \+= VALIDATION_CHUNK\)/);
  });

  it('F13: validateShapefileColumns is invoked during parse', () => {
    expect(SCRIPT).toContain('validateShapefileColumns(props)');
  });

  it('emitMeta two-arg: reads the CKAN external, writes the toronto_centreline column set (§9)', () => {
    expect(SCRIPT).toMatch(/emitMeta\(/);
    expect(SCRIPT).toContain('toronto_centreline: [');
    expect(SCRIPT).toContain("['CKAN']");
  });

  it('unhappy paths wired (F9): HEAD-fail → WARN+proceed, download/parse → FAIL, L8 skipped-pct → FAIL', () => {
    expect(SCRIPT).toContain('centreline_head_error'); // HEAD 4xx/5xx
    expect(SCRIPT).toMatch(/centreline_head_error[^]*?'WARN'/); // WARN, then proceeds (headInfo defaulted)
    expect(SCRIPT).toContain('centreline_acquisition_error'); // download/zip/parse → FAIL
    expect(SCRIPT).toContain('centreline_geometry_skipped_pct'); // L8
  });

  it('L25 sets are lowercase + normalized via trim().toLowerCase() (F14); FEDERAL excluded', () => {
    expect(SCRIPT).toContain("'major arterial'"); // include set lowercase
    expect(SCRIPT).toMatch(/\.trim\(\)\.toLowerCase\(\)/);
    expect(SCRIPT).toMatch(/ju === 'federal'/);
  });
});
