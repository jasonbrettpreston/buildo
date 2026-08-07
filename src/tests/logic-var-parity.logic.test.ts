// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 MB-3 (WF3 Phase 1 D-C)
//
// Literal-parity lock for max_build_min_dimension_m — the D-C viability floor crosses FOUR surfaces
// that cannot read each other at runtime: the seed JSON (fresh DB), migration 239 (existing DB), the
// max-build.js code default (missing-variable window), and the parcel-sanity-audit literal (the
// audit is a sync-require CLI with no config path — CF-3/SF-F5 ruled parity-lock over refactor).
// A divergence gives two environments two different floors → two different envelopes → two
// different cost menus, with no other CI catch. contracts.infra.test.ts pins the same value from
// _contracts.json; this test pins the surfaces against EACH OTHER including the audit literal.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('WF3 D-C max_build_min_dimension_m — four-surface literal parity', () => {
  const seed = JSON.parse(read('scripts/seeds/logic_variables.json'));

  it('seed JSON default === max-build.js code default', () => {
    expect(seed.max_build_min_dimension_m?.default).toBe(mb.MAX_BUILD_MIN_DIMENSION_M_DEFAULT);
  });

  it('migration 239 seed literal === seed JSON default', () => {
    const sql = read('migrations/239_seed_max_build_min_dimension.sql');
    const m = sql.match(/'max_build_min_dimension_m',\s*([\d.]+)/);
    expect(m, 'migration 239 must seed max_build_min_dimension_m').not.toBeNull();
    expect(Number(m![1])).toBe(seed.max_build_min_dimension_m.default);
  });

  it('migration 239 description is byte-identical to the seed JSON description (docs-generator contract)', () => {
    const sql = read('migrations/239_seed_max_build_min_dimension.sql');
    // The seed description with SQL-escaped single quotes must appear verbatim in the migration.
    const escaped = String(seed.max_build_min_dimension_m.description).replace(/'/g, "''");
    expect(sql).toContain(escaped);
  });

  it('parcel-sanity-audit literal === seed JSON default (the audit cannot read logic_variables)', () => {
    const audit = read('scripts/analysis/parcel-sanity-audit.js');
    const m = audit.match(/MAX_BUILD_MIN_DIMENSION_M\s*=\s*([\d.]+)/);
    expect(m, 'parcel-sanity-audit.js must pin MAX_BUILD_MIN_DIMENSION_M as a literal').not.toBeNull();
    expect(Number(m![1])).toBe(seed.max_build_min_dimension_m.default);
  });
});
