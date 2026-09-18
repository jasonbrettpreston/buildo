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

  // batch2 P1.1 (assert_parcel_sanity, F-G2, 2026-09-18): "the audit cannot read
  // logic_variables" is KNOWINGLY RETIRED — the audit is now descriptor-driven
  // (scripts/analysis/parcel-sanity-audit.js resolveCliConfig() -> resolveConfig
  // against the live registry), reusing max_build_min_dimension_m (Ask A6(a))
  // rather than pinning a divorced literal. Re-pointed at buildChecks()'s
  // RESOLVED output — no DB needed, since buildChecks(config) is pure given an
  // already-resolved config object (the fields sidecar's LOGIC_VAR_DEFS defaults).
  it('parcel-sanity-audit buildChecks() consumes max_build_min_dimension_m FROM config (no longer a pinned literal)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildChecks } = require('../../scripts/analysis/parcel-sanity-audit.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOGIC_VAR_DEFS } = require('../../scripts/lib/assert-parcel-sanity-fields.js');
    const cfg: Record<string, number> = Object.fromEntries(LOGIC_VAR_DEFS.map((v: { name: string; default: number }) => [v.name, v.default]));
    cfg.max_build_min_dimension_m = seed.max_build_min_dimension_m.default;
    cfg.mislink_footprint_lot_tol = seed.mislink_footprint_lot_tol.default;
    const checks = buildChecks(cfg);
    const c = checks.find((x: { id: string }) => x.id === 'max_build_dim_below_floor');
    expect(c, 'max_build_dim_below_floor check must exist').toBeTruthy();
    expect(c.applies).toContain(String(seed.max_build_min_dimension_m.default));
    // Changing the config value changes the resolved SQL — proof it is read, not pinned.
    cfg.max_build_min_dimension_m = seed.max_build_min_dimension_m.default + 1;
    const checks2 = buildChecks(cfg);
    const c2 = checks2.find((x: { id: string }) => x.id === 'max_build_dim_below_floor');
    expect(c2.applies).toContain(String(seed.max_build_min_dimension_m.default + 1));
    expect(c2.applies).not.toBe(c.applies);
  });
});
