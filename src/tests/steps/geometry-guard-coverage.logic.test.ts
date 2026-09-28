// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (declared write discipline — the guard is the ONLY thing that makes a write converge)
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (the source producer contract; WF3 2026-09-28 geom guard)
//
// WF3 2026-09-28 class lock (plan §6, "Class lock (no new gate)"). REPLACES the manual
// "VERIFY before ③" note (plan §2) that missed this at ②: the note measured the WRONG
// TABLE (massing's building_footprints, never parcels), so a derivation change slipped
// through conversion unobserved and 9,855 parcel rows have stored geom IS NULL while 16
// more hold an unrepaired shape the step's own validator would rewrite.
//
// THE INVARIANT (one sentence): a DERIVED geometry column must be a guard term, else a
// derivation change — a repair-arm change, or a NULL left by an older writer — is invisible
// to the write guard and NEVER re-derives on a re-run. `geom = f(source)` holds only while
// the guard watches `geom` itself.
//
// THE CLASS (derived, never a retyped step list — R-AN): for every path in
// scripts/steps/_schema/converted.json `.converted`, read `<path minus .js>.descriptor.json`;
// for every outputs.writes[i] whose write_discipline.guard === 'is_distinct_from', for every
// column with bind === 'wkb_geometry' and (written ?? 'step') === 'step' (an insert_only
// column is never re-derived by the conflict UPDATE — massing's geom is keyed by md5(source),
// so a changed geometry is a new INSERT; n/a rather than an exemption).
//
// COVERED iff ANY of:
//   · guard_columns === 'all_declared'                 (every declared column is a guard term)
//   · guard_columns includes the column's name         (the direct fleet precedent — §8)
//   · some outputs.invalidates[] entry with table === write.table has
//       set_null_on_change_of === <name>               (the codegen folds the watched column
//                                                       into the guard FIRST, write.js:1134)
//
// EXPECTED RED TODAY (2026-09-28, pre-fix): exactly
//   `load-parcels.descriptor.json:parcels.geom`
// load_ravines (guard_columns ["geom","source_dataset_version"]) and address_points
// (guard_columns [...,"geom"]) PASS; load_centreline is exempt (guard "none", class C
// staging_full_replace — every run rewrites the whole table); massing is exempt by
// written:"insert_only".

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../');

const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

interface Column {
  name?: string;
  bind?: string;
  written?: string;
}
interface Invalidate {
  table?: string;
  column?: string;
  set_null_on_change_of?: string;
}
interface WriteSpec {
  table?: string;
  columns?: Column[];
  write_discipline?: { guard?: string; guard_columns?: string[] | 'all_declared' };
}
interface Descriptor {
  outputs?: 'none' | { writes?: WriteSpec[]; invalidates?: Invalidate[] };
}

/** A derived geometry column the write guard fails to watch. */
interface Offender {
  descriptor: string;
  table: string;
  column: string;
}

/**
 * Scan every converted descriptor and collect the `<descriptor basename>:<table>.<column>`
 * of each step-written wkb_geometry column that no guard term covers. Derived from
 * converted.json (R-AN), never a retyped fleet list.
 */
function scanOffenders(): { offenders: Offender[]; checkedColumns: number } {
  const converted = (
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, CONVERTED_REL), 'utf8')) as {
      converted: string[];
    }
  ).converted;

  const offenders: Offender[] = [];
  let checkedColumns = 0;

  for (const stepPath of converted) {
    const descriptorRel = stepPath.replace(/\.js$/, '.descriptor.json');
    const descriptor = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, descriptorRel), 'utf8'),
    ) as Descriptor;
    const basename = path.basename(descriptorRel);

    const outputs = descriptor.outputs;
    if (!outputs || outputs === 'none') continue;
    const invalidates = Array.isArray(outputs.invalidates) ? outputs.invalidates : [];

    for (const write of outputs.writes ?? []) {
      const discipline = write.write_discipline;
      // The class under test: a guard that compares each declared column IS DISTINCT FROM.
      if (!discipline || discipline.guard !== 'is_distinct_from') continue;

      const guardColumns = discipline.guard_columns;
      const guardTermNames = Array.isArray(guardColumns) ? guardColumns : [];
      const allDeclared = guardColumns === 'all_declared';

      // The watched-column axes the codegen folds into the guard FIRST (write.js
      // `changeOfGuardColumns`), for entries naming THIS write target's table.
      const watchedOfThisTable = invalidates
        .filter((e) => e.table === write.table && e.set_null_on_change_of)
        .map((e) => e.set_null_on_change_of as string);

      for (const column of write.columns ?? []) {
        if (column.bind !== 'wkb_geometry') continue;
        // A column the conflict UPDATE never rewrites is out of the class.
        if ((column.written ?? 'step') !== 'step') continue;
        const name = column.name;
        if (!name) continue;

        checkedColumns += 1;

        const covered =
          allDeclared || guardTermNames.includes(name) || watchedOfThisTable.includes(name);
        if (!covered) {
          offenders.push({ descriptor: basename, table: write.table ?? '?', column: name });
        }
      }
    }
  }

  return { offenders, checkedColumns };
}

describe('WF3 2026-09-28 — every step-written derived geometry column is a guard term (Spec 122 §5.1, Spec 55)', () => {
  it('no is_distinct_from write leaves a step-written wkb_geometry column outside its guard (RED today: load-parcels.descriptor.json:parcels.geom)', () => {
    const { offenders } = scanOffenders();
    const labels = offenders.map((o) => `${o.descriptor}:${o.table}.${o.column}`).sort();

    // The expected red names ONLY parcels — the fix (WF3 2026-09-28) adds `geom` to
    // the write guard + makes DEC-FENCE2 watch it, and this list becomes [].
    expect(labels).toEqual([]);
  });

  it('the class lock is not vacuous — it actually inspects ≥ 3 step-written geometry columns (address_points, load_ravines, parcels)', () => {
    const { checkedColumns } = scanOffenders();
    // If a future refactor stopped matching (a bind renamed, a written value changed),
    // the offender list above would pass by inspecting NOTHING. Anchor the count.
    expect(checkedColumns).toBeGreaterThanOrEqual(3);
  });
});
