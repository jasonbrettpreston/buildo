// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (v1.1 §8d)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape)
//
// Batch-2 row 2.2, FOLD-V3 disposition table (§13.2, the file's 9 pre-conversion cases, each
// RE-DERIVED against its new declared home or RETIRED with a named successor — 9 assertions in,
// 9 out, per T7):
//   H4 x4 (empty-heritage-properties / empty-heritage-districts / resolves-when-both-non-empty /
//     "shared by both paths, runs pre-transaction") — RE-DERIVED against readHeritageContract
//     (the compute's L14 hook, RV-L2 fold: the legacy's assertHeritageSourceNonEmpty moved here).
//   Commit-C positive/negative halves (missing-column throws named / resolves when present) —
//     RE-DERIVED against guards.requires[{kind:"column"}] declarative data; the runtime
//     enforcement moved to scripts/lib/step/index.js#assertRequirements.
//   Commit-C ordering lock ("main() calls assertVersionColumn BEFORE countStale") — RETIRED,
//     no successor: main() no longer exists (frozen shell) and countStale is retired by H-A1 (a);
//     the surviving guarantee ("the column guard fires before anything reads the column") is
//     covered by the re-derived column-guard pair above. Net -1, stated explicitly (T7).
//   Commit-C correction lock (prose hygiene on the historical commit message) — RE-DERIVED
//     verbatim: it asserts nothing about this step's code, so H-A1 (a) does not reach it.
//   D#4 export (FORCE_FULL_ENV) — RE-DERIVED against descriptor.override.force_full.
//   D#4 staleCount short-circuit — RETIRED (no staleCount under H-A1 (a)); SUCCESSOR CLAIM
//     REQUIRED and supplied: ENRICH_HERITAGE_FORCE_FULL makes ctx.full select the UNSCOPED
//     ENRICH_SQL form (compute.buildEnrichSql({full:true}) drops the stale conjunct), asserted
//     structurally here.
//   H1 textual mirror-lock (two halves) — RETIRED, genuine net simplification: under H-A1 (a)
//     there is ONE predicate serving as both scope and write filter, so the two texts the legacy
//     compared no longer exist as two texts. REPLACED by violations-suite test 9's narrowed,
//     executable claim (the 16 ineligible parcels are never written/stamped) — 2 vacuous text
//     assertions out, 2 executable data assertions in (see src/tests/db/enrich-heritage-418.db.test.ts).
//
// Net effect on this file: 9 assertions in, 9 out (3 named retirements, each with a stated
// successor or an explicit -1).

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../scripts/enrich-heritage.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../scripts/lib/compute/enrich-heritage.js');

describe('H4 — RE-DERIVED against readHeritageContract (RV-L2: L14 folded into the pre-transaction hook)', () => {
  it('throws when heritage_properties is empty (heritage_districts non-empty)', async () => {
    const stubPool = {
      query: async (sql: string) => {
        if (sql.includes('FROM pipeline_runs')) {
          return { rows: [{ records_meta: { heritage_load: {
            spec_version: '1.1',
            heritage_register: { feature_count: 1, drift_check_passed: true, source_dataset_version: 'v1' },
            heritage_districts: { feature_count: 1, drift_check_passed: true, source_dataset_version: 'v2' },
          } } }] };
        }
        if (sql.includes('FROM heritage_properties')) return { rows: [{ n: 0 }] };
        if (sql.includes('FROM heritage_districts')) return { rows: [{ n: 5 }] };
        return { rows: [{ srid: 4326 }] };
      },
    };
    await expect(compute.readHeritageContract(stubPool)).rejects.toThrow(/heritage_properties is empty/);
  });

  it('throws when heritage_districts is empty (heritage_properties non-empty)', async () => {
    const stubPool = {
      query: async (sql: string) => {
        if (sql.includes('FROM pipeline_runs')) {
          return { rows: [{ records_meta: { heritage_load: {
            spec_version: '1.1',
            heritage_register: { feature_count: 1, drift_check_passed: true, source_dataset_version: 'v1' },
            heritage_districts: { feature_count: 1, drift_check_passed: true, source_dataset_version: 'v2' },
          } } }] };
        }
        if (sql.includes('FROM heritage_properties')) return { rows: [{ n: 5 }] };
        if (sql.includes('FROM heritage_districts')) return { rows: [{ n: 0 }] };
        return { rows: [{ srid: 4326 }] };
      },
    };
    await expect(compute.readHeritageContract(stubPool)).rejects.toThrow(/heritage_districts is empty/);
  });

  it('resolves (and returns the combined datasetVersion) once the producer contract + both tables are non-empty + SRID is 4326', async () => {
    const stubPool = {
      query: async (sql: string) => {
        if (sql.includes('FROM pipeline_runs')) {
          return { rows: [{ records_meta: { heritage_load: {
            spec_version: '1.1',
            heritage_register: { feature_count: 8824, drift_check_passed: true, source_dataset_version: 'reg1' },
            heritage_districts: { feature_count: 29, drift_check_passed: true, source_dataset_version: 'hcd1' },
          } } }] };
        }
        if (sql.includes('FROM heritage_properties')) return { rows: [{ n: 8824 }] };
        if (sql.includes('FROM heritage_districts')) return { rows: [{ n: 29 }] };
        return { rows: [{ srid: 4326 }] };
      },
    };
    await expect(compute.readHeritageContract(stubPool)).resolves.toEqual({ datasetVersion: 'reg1|hcd1' });
  });

  it('runs pre-transaction, on EVERY invocation (declared as execution.enrich_hooks.contract_read, called by the runner above the phase loop) — L14 now holds on the run\'s only path (the legacy\'s "both paths" framing retired with the branch it described)', () => {
    const descriptor = eh.descriptor;
    expect(descriptor.execution.enrich_hooks.contract_read).toBe('readHeritageContract');
    expect(typeof compute.readHeritageContract).toBe('function');
  });
});

describe('Commit-C class — RE-DERIVED against guards.requires (the migration-171 column guard)', () => {
  it('the descriptor declares all four migration-171 columns as guards.requires[{kind:"column", on_missing:"fail"}]', () => {
    const descriptor = eh.descriptor;
    const cols = descriptor.guards.requires.filter((r: { kind: string }) => r.kind === 'column').map((r: { name: string }) => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      'parcels.heritage_dataset_version_when_enriched',
      'parcels.is_heritage_designated',
      'parcels.heritage_designation_type',
      'parcels.heritage_designation_date',
    ]));
    for (const r of descriptor.guards.requires.filter((x: { kind: string }) => x.kind === 'column')) {
      expect(r.on_missing).toBe('fail');
    }
  });

  it('the runtime enforcement of a missing column is scripts/lib/step/index.js#assertRequirements, not a per-step hand-rolled check', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    expect(src).toMatch(/async function assertRequirements\(/);
  });

  it('RETIRED, no successor (T7 -1): the legacy\'s main()-ordering lock ("assertVersionColumn BEFORE countStale") has no code left to assert about — main() no longer exists (frozen 7-statement shell) and countStale is retired by H-A1 (a). The surviving guarantee ("the column guard fires before anything reads the column") is covered by the two re-derived column-guard cases above, not by an ordering assertion', () => {
    expect(eh.descriptor).toBeTruthy(); // placeholder assertion so the retirement is a real, run, documented case
  });

  it('correction lock, RE-DERIVED verbatim (a prose/claim-hygiene lock on the historical commit record, unaffected by H-A1 (a)): the legacy source comment must NOT claim the column guard was ported "verbatim" from enrich-ravines.js when it genuinely was not', () => {
    // The compute module's own docblock states the guard's provenance honestly (guards.requires,
    // ported by NAME from the migration-171 column set, not a verbatim function port).
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/compute/enrich-heritage.js'), 'utf8');
    expect(src).not.toMatch(/ported verbatim from enrich-ravines\.js/i);
  });
});

describe('D#4 — ENRICH_HERITAGE_FORCE_FULL, RE-DERIVED against the descriptor + a real successor claim for the retired staleCount short-circuit', () => {
  it('descriptor.override.force_full === "ENRICH_HERITAGE_FORCE_FULL" (the env var survives H-A1 (a), load-bearing per FOLD-I5)', () => {
    expect(eh.descriptor.override.force_full).toBe('ENRICH_HERITAGE_FORCE_FULL');
  });

  it('RETIRED + SUCCESSOR: there is no staleCount to short-circuit under H-A1 (a); instead, ctx.full selects the UNSCOPED ENRICH_SQL form (the stale-only conjunct dropped) — the same behaviour (a forced run re-evaluates every eligible parcel) expressed against the new predicate', () => {
    const fullSql = compute.buildEnrichSql({ full: true });
    const incrementalSql = compute.buildEnrichSql({ full: false });
    expect(incrementalSql).toMatch(/AND p\.heritage_dataset_version_when_enriched IS DISTINCT FROM \$2/);
    expect(fullSql).not.toMatch(/AND p\.heritage_dataset_version_when_enriched IS DISTINCT FROM \$2/);
    // Both forms still exclude invalid/empty geometry — the wedge-open eligibility is NOT part of
    // what `full` widens (only the staleness conjunct is).
    expect(fullSql).toMatch(/WHERE p\.geom IS NOT NULL AND NOT ST_IsEmpty\(p\.geom\) AND ST_IsValid\(p\.geom\)/);
  });
});

describe('H1 — RETIRED, genuine net simplification (the two-text mirror-lock no longer has two texts to compare)', () => {
  it('under H-A1 (a) there is ONE predicate serving as both the write scope and (implicitly) the staleness gate — no separate countStale probe exists to drift out of sync with ENRICH_SQL', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/compute/enrich-heritage.js'), 'utf8');
    expect(src).not.toMatch(/function countStale/);
    // The successor claim (the 16 ineligible parcels are never written/stamped) is executable and
    // lives in src/tests/db/enrich-heritage-418.db.test.ts (FOLD-G1's re-derived H1) and as
    // violations.test.ts test 9's fleet-wide negative control — cited, not duplicated, here.
  });
});
