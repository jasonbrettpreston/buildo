// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A18 (0x; RE-FREEZE #29, logged in 122 §8)
//
// INGESTOR prerequisite 0x — the SCHEMA arm of the MULTI-PRIMARY INGESTOR: two new OPTIONAL
// fields on `inputs.reads.externals[]` that bind each primary to the write target it fills.
//
//   `target`      — the `outputs.writes[].table` this external's features become rows in;
//   `on_failure`  — enum `abort_step|fail_row_continue|warn_row_continue`, the DECLARED
//                   posture when this primary's acquisition or parse fails.
//
// Today `externals.items` is `additionalProperties: false` and declares neither field, so
// `target` is an UNKNOWN KEY: a descriptor with two primaries feeding two tables (the shape
// the multi-primary runner needs — one primary, one target, per external) is unrepresentable,
// and there is no way to say which primary a failed acquisition killed. Two of the four rules
// below exist to stop the fields from being used where they mean nothing:
//
//   item rule M1  `on_failure` REQUIRES a declared `target` (a posture is per-target here, so
//                 an untargeted external has no target whose rows it could continue or warn
//                 over), and a `target`-bearing external forbids `role: "lookup"` (a lookup
//                 folds into another external's rows via buildLookup; it writes no target);
//   top-level M2  an external declaring `target` REQUIRES `execution.shape: "ingest"` — a
//                 targeted external names a write target, and only the ingest phase has one.
//
// Every RED assertion below fails TODAY for the stated reason and NOT because of a typo:
//   T1 fails because `target` is an unknown property of an item declared
//      `additionalProperties: false`, so the measured 2-primary/2-target fixture is rejected;
//   T2(1) fails because no rule requires `target` beside an `on_failure`, so deleting `target`
//         leaves a descriptor the schema accepts;
//   T2(2) fails because no rule forbids `role: "lookup"` beside a `target`;
//   T2(3) fails because `on_failure` is an unknown key, so its enum is never reached (the
//         `keyword: "enum"` error at …/on_failure is ABSENT today, whatever else is reported);
//   T2(4) fails because M2 does not exist, so deleting `execution.shape` from a targeted
//         descriptor leaves it valid.
// Each T2 row asserts its SPECIFIC AJV error (keyword + instancePath + params), never a bare
// `false`.
import { describe, it, expect } from 'vitest';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- exercising the real CJS json */
const Ajv: any = require('ajv');
const SCHEMA_PATH = path.join(process.cwd(), 'scripts/steps/_schema/step.schema.json');
const RAVINES_PATH = path.join(process.cwd(), 'scripts/load-ravines.descriptor.json');
const SCHEMA = require(SCHEMA_PATH);
const RAVINES = require(RAVINES_PATH);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// 0x fixture rules: the base is the ravines descriptor (a shapefile_zip INGESTOR), whose own
// staleness.trigger is "none"-shaped only in that it declares no mode name — it DOES declare
// two triggers, both re-pointed below at the two new primaries. The clone keeps every other
// field byte-identical: these tests move nothing but the two new fields, the write targets,
// the emits skeleton and the triggers.
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(SCHEMA);
const errText = (errors: unknown) => JSON.stringify(errors ?? []);

type AjvError = { keyword?: string; instancePath?: string; params?: Record<string, unknown> };

/** Locate one AJV error by keyword + instancePath (+ params), never by a bare boolean. */
const errAt = (errors: unknown, match: Record<string, unknown>) =>
  (((errors as AjvError[] | null) ?? [])).some(
    (e) =>
      e.keyword === match.keyword &&
      e.instancePath === match.instancePath &&
      Object.entries((match.params as Record<string, unknown>) ?? {}).every(([k, v]) => e.params?.[k] === v),
  );

/**
 * `H2()` — the multi-primary fixture: TWO http_file primaries (`a` → table `ta`, `b` → table
 * `tb`), each declaring its `target` and an `on_failure`, with `outputs.writes` grown to the
 * two matching targets, the emit skeleton widened to one key per primary, and the four
 * staleness triggers re-pointed at `a`/`b`. Measured: H2 WITHOUT `target`/`on_failure`
 * already validates today — so every failure below is attributable to the 0x fields and rules,
 * not to the two-primary reshape itself (which is asserted as a precondition in T1).
 */
function H2() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fixture is rewritten field by field
  const d: Record<string, any> = clone(RAVINES);
  const e0 = d.inputs.reads.externals[0];
  const w0 = d.outputs.writes[0];
  d.inputs.reads.externals = [
    { ...e0, id: 'a', target: 'ta', on_failure: 'fail_row_continue' },
    { ...e0, id: 'b', url: `${e0.url}?b`, target: 'tb', on_failure: 'fail_row_continue' },
  ];
  d.outputs.writes = [
    { ...w0, table: 'ta' },
    { ...w0, table: 'tb' },
  ];
  d.emits = [{ ...d.emits[0], key: 'k', skeleton: { a: {}, b: {} } }];
  d.execution.shape = 'ingest';
  d.staleness.trigger = ['a', 'b'].flatMap((x: string) => [
    { signal: 'source_validator', position: 'pre_acquisition', external: x },
    { signal: 'content_hash', position: 'post_acquisition', external: x },
  ]);
  d.guards.requires = [];
  return d;
}

describe('INGESTOR prerequisite 0x — multi-primary externals[].target + on_failure (schema)', () => {
  // -------------------------------------------------------------------------
  // T1 — the multi-primary shape is EXPRESSIBLE. RED today: `target` is an unknown property of
  // an item declared `additionalProperties: false`, so the very descriptor the runner needs
  // for a two-table INGESTOR is rejected by the schema.
  // -------------------------------------------------------------------------
  it('T1 — a two-primary, two-target INGESTOR validates (target + on_failure are declared fields)', () => {
    // Precondition, independent of the 0x fields: the two-primary/two-target RESHAPE itself is
    // already accepted today, so T1's RED is the 0x fields and nothing else.
    const withoutNewFields = H2();
    for (const e of withoutNewFields.inputs.reads.externals) {
      delete e.target;
      delete e.on_failure;
    }
    expect(
      validate(withoutNewFields),
      `the multi-primary reshape alone must already validate (so T1's RED is the 0x fields): ${errText(validate.errors)}`,
    ).toBe(true);

    expect(
      validate(H2()),
      `a multi-primary INGESTOR with per-primary target + on_failure must be representable: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T2 — the four refusals, each located by its OWN AJV error. Today all four are absent:
  // (1)/(2) have no rule text, (3)'s enum is unreachable behind `additionalProperties`, and
  // (4)'s top-level rule does not exist at all.
  // -------------------------------------------------------------------------
  it('T2(1) — M1: an `on_failure` without a `target` is refused at the item', () => {
    const d = H2();
    delete d.inputs.reads.externals[0].target;
    expect(validate(d), 'an on_failure with no target has no target to continue or warn over').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'required', instancePath: '/inputs/reads/externals/0', params: { missingProperty: 'target' } }),
      `expected the M1 required/target error at /inputs/reads/externals/0: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('T2(2) — M1: a targeted external must not declare role "lookup"', () => {
    const d = H2();
    d.inputs.reads.externals.push({
      id: 'l',
      kind: 'http_file',
      url: 'http://ex/p.xlsx',
      format: 'xlsx',
      role: 'lookup',
      cache: 'none',
      target: 'ta',
    });
    expect(validate(d), 'a lookup folds into another external\'s rows — it fills no target').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'not', instancePath: '/inputs/reads/externals/2' }),
      `expected the M1 not/target+lookup error at /inputs/reads/externals/2: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('T2(3) — the on_failure enum admits exactly abort_step|fail_row_continue|warn_row_continue', () => {
    const d = H2();
    d.inputs.reads.externals[0].on_failure = 'skip';
    expect(validate(d), '`skip` is not a declared on_failure posture').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'enum', instancePath: '/inputs/reads/externals/0/on_failure' }),
      `expected the on_failure enum error at /inputs/reads/externals/0/on_failure: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('T2(4) — M2: a targeted external requires execution.shape "ingest"', () => {
    const d = H2();
    delete d.execution.shape;
    expect(validate(d), 'a targeted external names a write target only the ingest phase has').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'required', instancePath: '/execution', params: { missingProperty: 'shape' } }),
      `expected the M2 required/shape error at /execution: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T3 — PIN: the rule set is ADDITIVE. Every converted INGESTOR keeps validating, and none of
  // them declares a `target` or an `on_failure` — so 0x's byte change cannot alter their
  // behaviour. (This is the half that PASSES today; the RED half is T1 + the four T2 rows.)
  // -------------------------------------------------------------------------
  it('T3 — all six converted INGESTOR descriptors still validate, none declares target or on_failure', () => {
    const slugs = ['ravines', 'address-points', 'parcels', 'centreline', 'massing', 'neighbourhoods'];
    for (const slug of slugs) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const descriptor = require(path.join(process.cwd(), `scripts/load-${slug}.descriptor.json`));
      expect(validate(descriptor), `${slug} must stay valid: ${errText(validate.errors)}`).toBe(true);
      for (const e of descriptor.inputs.reads.externals) {
        expect(e.target, `${slug}'s external ${e.id} must not declare a target`).toBeUndefined();
        expect(e.on_failure, `${slug}'s external ${e.id} must not declare an on_failure`).toBeUndefined();
      }
    }
  });
});
