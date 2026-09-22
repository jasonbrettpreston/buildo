// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-X, R-AW
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 RE-FREEZE #12
//
// WF2 "runner row-error policy" (2026-09-21) — R-X's own POST-B1-1 addendum named this
// exact generalization "not yet built": `write-class-disposition.json` covers only
// `outputs.write_discipline.class` and `sharing.on_contention`; extending R-X's registry
// to the OTHER `execution.*` POSTURE enums (`on_row_error`, `on_batch_error`,
// `on_check_error`, `on_degrade`) is this suite's target,
// `scripts/steps/_schema/execution-posture-disposition.json`.
//
// (`execution-budget-disposition.json`/its own infra test, R-AJ, already covers the
// `execution.*` DURATION declarations — budget/txn_budget/statement_timeout/step_timeout —
// a free-form `duration` value, not a frozen enum. This is the sibling registry for the
// frozen ENUM postures, mirroring `write-class-disposition.json`'s own shape instead.)
//
// Assertions, both directions:
//  (1) every value of every live x-frozen `execution.*` posture enum has EXACTLY one row;
//      no orphan row;
//  (2) every row's `disposition` is one of the registry's own closed 3-value menu;
//  (3) every `executed` row that cites `executor.file`+`executor.anchor` is GREPPED out
//      of that file, never trusted from the registry's own prose;
//  (4) no live descriptor declares a `retire`d value;
//  (5) every `descriptive`/`retire` row is named in Spec 124's own R-X/R-AW text — a
//      reader of the spec, not just of this file, learns the declaration is inert/retired.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const REGISTRY_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/execution-posture-disposition.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json');
const SPEC124_PATH = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md');

/** The four `execution.*` fields this registry covers — every one a frozen ENUM. */
const POSTURE_FIELDS = ['on_row_error', 'on_batch_error', 'on_check_error', 'on_degrade'] as const;
type PostureField = (typeof POSTURE_FIELDS)[number];

interface ExecutorRow { file: string; anchor: string; role?: string }
interface DispositionRow {
  disposition: string;
  basis?: string;
  executor?: ExecutorRow | null;
  why?: string;
}
interface Registry {
  menu: string[];
  declarations: Record<PostureField, Record<string, DispositionRow>>;
}

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as {
  properties: { execution: { properties: Record<string, { enum?: string[]; 'x-frozen'?: boolean }> } };
};

/** The LIVE enum values step.schema.json declares for a posture field (must be x-frozen). */
function liveEnumValues(field: PostureField): string[] {
  const node = schema.properties.execution.properties[field];
  expect(node, `step.schema.json declares no properties.execution.properties.${field}`).toBeTruthy();
  if (!node) throw new Error(`unreachable: ${field}`);
  expect(node['x-frozen'], `execution.${field} is not x-frozen — this registry only covers frozen posture enums`).toBe(true);
  expect(Array.isArray(node.enum), `execution.${field} has no enum array`).toBe(true);
  return node.enum as string[];
}

/** Every live descriptor, keyed by identity.name (the manifest slug). */
function liveDescriptors(): Array<{ slug: string; file: string; execution: Record<string, unknown> }> {
  const dirs = ['scripts', 'scripts/quality'];
  const out: Array<{ slug: string; file: string; execution: Record<string, unknown> }> = [];
  for (const dir of dirs) {
    const abs = path.join(REPO_ROOT, dir);
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.descriptor.json')) continue;
      const file = path.join(dir, f);
      const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')) as {
        identity: { name: string }; execution?: Record<string, unknown>;
      };
      out.push({ slug: d.identity.name, file, execution: d.execution || {} });
    }
  }
  return out;
}

describe('execution-posture-disposition (Spec 124 R-X/R-AW) — every execution.* posture enum value is executed or dispositioned', () => {
  it('(1) every LIVE enum value of every posture field has EXACTLY one registry row; no orphan row', () => {
    for (const field of POSTURE_FIELDS) {
      const live = new Set(liveEnumValues(field));
      const rowKeys = new Set(Object.keys(registry.declarations[field] || {}));
      for (const v of live) {
        expect(rowKeys, `execution.${field}="${v}" is a live enum value with no registry row`).toContain(v);
      }
      for (const v of rowKeys) {
        expect(live, `orphan registry row: execution.${field}="${v}" is dispositioned but not a live enum value`).toContain(v);
      }
    }
  });

  it('(2) every row declares one of EXACTLY the registry\'s own closed 3-value menu', () => {
    expect(registry.menu.slice().sort()).toEqual(['descriptive', 'executed', 'retire']);
    for (const field of POSTURE_FIELDS) {
      for (const [value, row] of Object.entries(registry.declarations[field] || {})) {
        expect(registry.menu, `execution.${field}="${value}": disposition "${row.disposition}" is not on the closed menu`).toContain(row.disposition);
      }
    }
  });

  it('(3) every `executed` row that cites executor.file+executor.anchor is GREPPED out of that file — never trusted from the registry\'s own prose', () => {
    let checkedCount = 0;
    for (const field of POSTURE_FIELDS) {
      for (const [value, row] of Object.entries(registry.declarations[field] || {})) {
        if (row.disposition !== 'executed') continue;
        expect(row.executor, `execution.${field}="${value}": an "executed" row must cite an executor`).toBeTruthy();
        const executor = row.executor!;
        expect(executor.file, `execution.${field}="${value}": executed row's executor has no file`).toBeTruthy();
        expect(executor.anchor, `execution.${field}="${value}": executed row's executor has no anchor`).toBeTruthy();
        const abs = path.join(REPO_ROOT, executor.file);
        expect(fs.existsSync(abs), `execution.${field}="${value}": cited executor file ${executor.file} does not exist`).toBe(true);
        const src = fs.readFileSync(abs, 'utf8');
        expect(src.includes(executor.anchor), `execution.${field}="${value}": cited anchor "${executor.anchor}" not found in ${executor.file} — the citation has rotted or was never true`).toBe(true);
        checkedCount += 1;
      }
    }
    expect(checkedCount, 'at least one executed row with a grep-checkable anchor, or (3) proves nothing').toBeGreaterThan(0);
  });

  it('(4) no live descriptor declares a `retire`d posture value', () => {
    const retired = new Map<PostureField, Set<string>>();
    for (const field of POSTURE_FIELDS) {
      retired.set(field, new Set(Object.entries(registry.declarations[field] || {}).filter(([, r]) => r.disposition === 'retire').map(([v]) => v)));
    }
    let checkedCount = 0;
    for (const d of liveDescriptors()) {
      for (const field of POSTURE_FIELDS) {
        const declared = d.execution[field];
        if (declared === undefined) continue;
        checkedCount += 1;
        expect(retired.get(field)!, `${d.slug} (${d.file}) declares execution.${field}="${String(declared)}", which is RETIRED per the disposition registry`).not.toContain(declared);
      }
    }
    expect(checkedCount, 'at least one live descriptor must declare a posture field, or this lock is vacuous').toBeGreaterThan(0);
  });

  it('(5) every `descriptive`/`retire` row is named in Spec 124\'s own R-X/R-AW text — a spec reader, not just a reader of this file, learns the declaration is inert', () => {
    const spec = fs.readFileSync(SPEC124_PATH, 'utf8');
    let namedCount = 0;
    for (const field of POSTURE_FIELDS) {
      for (const [, row] of Object.entries(registry.declarations[field] || {})) {
        if (row.disposition !== 'descriptive' && row.disposition !== 'retire') continue;
        namedCount += 1;
        expect(
          spec.includes(`\`${field}\``) || spec.includes(field),
          `Spec 124 never mentions execution.${field} in a way this check can find — the disposition would live only in a JSON file no reader of the policy opens`,
        ).toBe(true);
      }
    }
    expect(namedCount, 'at least one descriptive/retire row, or (5) is vacuous').toBeGreaterThan(0);
    // The retired VALUES themselves (not just the field names) must be legible from the
    // spec text — quarantine/retry/prior_values/zeroes are the four first `retire` rows
    // in the estate (R-AW's own claim) and must each be findable by name.
    for (const [field, values] of Object.entries(registry.declarations) as Array<[PostureField, Record<string, DispositionRow>]>) {
      for (const [value, row] of Object.entries(values)) {
        if (row.disposition !== 'retire') continue;
        expect(spec.includes(value), `Spec 124 never names the retired value "${value}" (execution.${field}) anywhere — R-AW must state it, not just this registry`).toBe(true);
      }
    }
  });
});
