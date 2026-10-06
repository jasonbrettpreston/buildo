// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 + §8 (RE-FREEZE); registry-truth plan fold 10 item 1 (soft-retire schema)
//
// FLEET-2 fold 10 (soft-retire) — RED SCHEMA locks for `outputs.writes[].retract: "departed_mark"`.
//
// ⚠️ THESE LOCKS ARE RED BEFORE THE SCHEMA IMPLEMENTATION, ON PURPOSE. `retract` is
// `x-frozen: true` with enum `["none","departed","all"]` today [scripts/steps/_schema/step.schema.json],
// so a `departed_mark` write is rejected on the enum alone, and the four NEW declarations
// the mechanic needs (`retire_max_pct_from_config`, a `retired_at` column with
// `written: "insert_only"`, a single-column key, and the `const` on `write_discipline.class`)
// are all unknown keys inside an `additionalProperties: false` write item — i.e. they cannot
// even be EXPRESSED, let alone ruled on. Each RED assertion below fails for the stated reason
// and NOT because of a typo; each GREEN control pins a descriptor that validates today so a
// failure in this file is a broken stub, never a missing feature.
//
// The mechanic the schema must admit (design is the sibling `src/tests/fleet2-soft-retire.logic.test.ts`):
// a class-B departure DELETE is a HARD retraction (`retract: "departed"`), the row is gone.
// `departed_mark` retracts by MARK: `retired_at` is set on the stale rows and cleared on the
// carried rows, so the row survives and a reader declaring `retired_at IS NULL` sees exactly
// the class-B row set. `retire_max_pct_from_config` names (never inlines — Rule 3) the
// mass-retire bound; it is legal ONLY beside `departed_mark`, so `retract: "none"` carrying
// it must be rejected.
//
// AJV error pinning is adapted from `src/tests/step-schema.logic.test.ts` (the `errPath` /
// `AjvErrorLike` normalizer and the pin-in-the-assertion-message style) and the ONE-compiler
// rule is honoured: `compileStepSchema` from `scripts/lib/step/validate.js`, never a locally
// constructed Ajv. Helpers are copied, never imported from that test file.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

type AjvErrorLike = {
  instancePath?: string;
  dataPath?: string;
  keyword: string;
  params?: Record<string, unknown>;
};

/** ajv 6 reports `dataPath` (".a.b[0]"); ajv 8 reports `instancePath` ("/a/b/0"). Normalize to slashes. */
function errPath(e: AjvErrorLike): string {
  if (typeof e.instancePath === 'string' && e.instancePath !== '') return e.instancePath;
  if (typeof e.instancePath === 'string' && e.dataPath === undefined) return e.instancePath;
  const d = e.dataPath ?? '';
  return d.replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/');
}

const SCHEMA_PATH = path.join(process.cwd(), 'scripts', 'steps', '_schema', 'step.schema.json');
const AP_PATH = path.join(process.cwd(), 'scripts', 'load-address-points.descriptor.json');
const RAVINES_PATH = path.join(process.cwd(), 'scripts', 'load-ravines.descriptor.json');

const readJson = (p: string): Record<string, unknown> => JSON.parse(fs.readFileSync(p, 'utf8'));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + JSON */
const { compileStepSchema } = require(path.join(process.cwd(), 'scripts/lib/step/validate.js')) as {
  compileStepSchema: (schema: unknown) => ((data: unknown) => boolean) & { errors?: AjvErrorLike[] | null };
};
const SCHEMA = readJson(SCHEMA_PATH);
const LOAD_AP = readJson(AP_PATH);
const LOAD_RAVINES = readJson(RAVINES_PATH);
/* eslint-enable @typescript-eslint/no-require-imports */

const validate = compileStepSchema(SCHEMA);

/**
 * The PRE-FOLD address_points write: the real target with the fold-10 soft-retire edits REMOVED
 * (retract "none", no retire_max_pct_from_config, no retired_at column). Works whether or not the
 * real descriptor already carries them (seat B's B-1 lands them in the FLEET-2 assembly), so the
 * retract-none controls and the "three declared edits" builders always start from the same base.
 */
const preFoldApWrite = (): Record<string, unknown> => {
  const w = clone((LOAD_AP.outputs as { writes: Array<Record<string, unknown>> }).writes[0]!) as Record<string, unknown>;
  w.retract = 'none';
  delete w.retire_max_pct_from_config;
  w.columns = (w.columns as Array<{ name: string }>).filter((c) => c.name !== 'retired_at');
  return w;
};

/** The write item this fold extends: the address_points target with the soft-retire edits removed (pre-fold), so the controls hold before AND after B-1. */
const apWrite = (): Record<string, unknown> => preFoldApWrite();

/** The address_points DESCRIPTOR with its write in the pre-fold retract-none shape — the GREEN control's first subject */
const apNone = (): Record<string, unknown> => {
  const d = clone(LOAD_AP);
  (d.outputs as { writes: Array<Record<string, unknown>> }).writes = [preFoldApWrite()];
  return d;
};

/**
 * The WRITE ITEM the schema must admit. Exactly THREE declared edits to the real
 * `address_points` write (class `guarded_upsert`, key `address_point_id`):
 *
 *   · `retract: 'departed_mark'` — the axis this fold adds to the frozen enum;
 *   · `retire_max_pct_from_config: 'address_points_mass_retire_max_pct'` — the mass-retire
 *     bound, NAMED rather than inlined (Rule 3: no bare percentage literal);
 *   · one NEW column, `retired_at`, `written: 'insert_only'` — the INSERT list carries it
 *     (seeded NULL: a new key is live) and the conflict UPDATE never rewrites it; the
 *     MARK/UNMARK statements are the only writers, which is why `db_default` is untruthful.
 *
 * `overrides` is shallow-merged LAST so a test can replace any single top-level field
 * (`retract`, `key`, `columns`, `write_discipline`, `retire_max_pct_from_config`) without
 * restating the rest.
 */
const apMarkedWrite = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const base = apWrite();
  return {
    ...base,
    retract: 'departed_mark',
    retire_max_pct_from_config: 'address_points_mass_retire_max_pct',
    columns: [
      ...(base.columns as Array<Record<string, unknown>>),
      { name: 'retired_at', vocabulary: 'none', written: 'insert_only' },
    ],
    ...overrides,
  };
};

/**
 * A FULL descriptor the schema validates: the real address_points descriptor with its one
 * write REPLACED. The schema validates a whole step, so every assertion below must run on a
 * descriptor — a bare write item fails on the descriptor's own 20 required categories and
 * never reaches `/outputs/writes/0`, which is exactly the "green because it never looked"
 * trap this file exists to avoid.
 */
const apMarked = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const d = clone(LOAD_AP);
  (d.outputs as { writes: Array<Record<string, unknown>> }).writes = [apMarkedWrite(overrides)];
  return d;
};

/** Build a full descriptor around an already-mutated write item. */
const descriptorWith = (write: Record<string, unknown>): Record<string, unknown> => {
  const d = clone(LOAD_AP);
  (d.outputs as { writes: Array<Record<string, unknown>> }).writes = [write];
  return d;
};

/**
 * Pin ONE AJV error by keyword + path (+ an optional params pair), reporting the ACTUAL
 * errors in the assertion message. A boolean-only assertion cannot distinguish "the rule
 * fired" from "the rule never looked" (Spec 121 §12b.6, eleven green-because-it-never-looked).
 */
function pin(errors: AjvErrorLike[] | null | undefined, at: string, keyword: string, param?: [string, string]): void {
  const list = errors ?? [];
  const hit = list.some(
    (e) =>
      errPath(e) === at &&
      e.keyword === keyword &&
      (!param || e.params?.[param[0]] === param[1]),
  );
  expect(
    hit,
    `expected ${keyword} at "${at}"${param ? ` with ${param[0]}=${param[1]}` : ''}; got ` +
      (list.map((e) => `${errPath(e)}:${e.keyword}`).join(', ') || '(no errors)'),
  ).toBe(true);
}

describe('fleet2 soft-retire — the schema admits retract:"departed_mark" (fold 10 item 1)', () => {
  it('SC1 — a departed_mark write validates green', () => {
    // RED today: `departed_mark` is not in the frozen retract enum, so AJV rejects on the enum alone.
    const ok = validate(apMarked());
    expect(ok, `apMarked() must validate; validate.errors=${JSON.stringify(validate.errors, null, 1)}`).toBe(true);
  });

  it('SC2 — departed_mark REQUIRES retire_max_pct_from_config', () => {
    // RED today: the schema has no `retire_max_pct_from_config` property and no require rule;
    // once the enum lands this must be the REQUIRED sibling of `departed_mark`.
    const write = apMarkedWrite();
    delete write.retire_max_pct_from_config;
    expect(validate(descriptorWith(write)), 'a departed_mark write with no mass-retire bound must be invalid').toBe(false);
    pin(validate.errors, '/outputs/writes/0', 'required', ['missingProperty', 'retire_max_pct_from_config']);
  });

  it('SC3 — departed_mark REQUIRES a retired_at column', () => {
    // RED today / specific-to-the-new-rule: without the column the write cannot express the mark.
    const write = apMarkedWrite();
    write.columns = (write.columns as Array<Record<string, unknown>>).filter((c) => c.name !== 'retired_at');
    expect(validate(descriptorWith(write)), 'a departed_mark write with no retired_at column must be invalid').toBe(false);
    pin(validate.errors, '/outputs/writes/0/columns', 'contains');
  });

  it('SC4 — the retired_at column must be written:"insert_only" (the conflict UPDATE never rewrites it)', () => {
    // RED today / specific-to-the-new-rule: a `written:"db_default"` retired_at would declare a
    // column nothing writes, while the MARK/UNMARK statements demonstrably do — and a traced
    // write of a `db_default` column is a witness-gate violation.
    const write = apMarkedWrite();
    write.columns = (write.columns as Array<Record<string, unknown>>).map((c) =>
      c.name === 'retired_at' ? { ...c, written: 'db_default' } : c,
    );
    expect(validate(descriptorWith(write)), 'a departed_mark write whose retired_at is written:"db_default" must be invalid').toBe(false);
    pin(validate.errors, '/outputs/writes/0/columns', 'contains');
  });

  it('SC5 — a departed_mark key must be a single column name string', () => {
    // RED today / specific-to-the-new-rule: the mark/unmark statements bind ONE key array,
    // so a composite key has no legal rendering under this retract shape.
    expect(validate(apMarked({ key: ['address_point_id', 'latitude'] })), 'a departed_mark write with a composite key must be invalid').toBe(false);
    pin(validate.errors, '/outputs/writes/0/key', 'type');
  });

  it('SC6 — a departed_mark write may NOT declare the hard-delete write class', () => {
    // RED today / specific-to-the-new-rule: `upsert_scoped_departure_delete` IS the
    // departure DELETE — the two retraction shapes must not be declared together.
    const write = apMarkedWrite({
      write_discipline: {
        ...(apMarkedWrite().write_discipline as Record<string, unknown>),
        class: 'upsert_scoped_departure_delete',
      },
    });
    expect(validate(descriptorWith(write)), 'a departed_mark write carrying the departure-delete class must be invalid').toBe(false);
    pin(validate.errors, '/outputs/writes/0/write_discipline/class', 'const');
  });

  it('SC7 — retire_max_pct_from_config is legal ONLY beside departed_mark', () => {
    // RED today: the field is unknown to the write item (additionalProperties), never the
    // specific `const` the rule promises — a retract:"none" write must not carry a bound
    // for a retraction it does not perform.
    const write = apWrite();
    write.retire_max_pct_from_config = 'address_points_mass_retire_max_pct';
    expect(validate(descriptorWith(write)), 'retract:"none" with a mass-retire bound must be invalid').toBe(false);
    pin(validate.errors, '/outputs/writes/0/retract', 'const');
  });

  it('SC8 — the retract node itself is re-frozen with the fourth member and its ruling', () => {
    // RED today: the enum has three members, and the node carries no x-ruling.
    const writesItem = (
      ((
        (SCHEMA.definitions as Record<string, unknown>).write as { properties?: Record<string, Record<string, unknown>> }
      ).properties ?? {}).retract ?? {}
    ) as { enum?: string[]; 'x-frozen'?: boolean; 'x-ruling'?: { rungs_tried?: string[]; why?: string } };

    expect(writesItem.enum, 'the retract enum must name the fourth member').toEqual([
      'none',
      'departed',
      'all',
      'departed_mark',
    ]);
    expect(writesItem['x-frozen'], 'the extended enum must stay frozen').toBe(true);
    expect(writesItem['x-ruling'], 'a re-freeze of a frozen enum owes its ruling').toBeDefined();
    expect(Array.isArray(writesItem['x-ruling']?.rungs_tried), 'rungs_tried must be an array').toBe(true);
    expect((writesItem['x-ruling']?.rungs_tried ?? []).length, 'rungs_tried must be non-empty').toBeGreaterThan(0);
    expect(typeof writesItem['x-ruling']?.why, 'why must be a non-empty string').toBe('string');
    expect((writesItem['x-ruling']?.why ?? '').length, 'why must be non-empty').toBeGreaterThan(0);
  });

  it('SC9 GREEN control — the pre-fold (retract-none) address_points and load_ravines descriptors validate today', () => {
    // GREEN today: both descriptors are the real, shipped shapes. If THIS row fails, the
    // harness (schema load, compiler, clone) is broken and every RED above proves nothing.
    const okAp = validate(apNone());
    expect(okAp, `load-address-points must validate; validate.errors=${JSON.stringify(validate.errors, null, 1)}`).toBe(true);
    const apRetract = ((apNone().outputs as { writes: Array<{ retract: string }> }).writes[0]!).retract;
    expect(apRetract, 'the control subject must still be retract:"none"').toBe('none');

    const okRavines = validate(LOAD_RAVINES);
    expect(okRavines, `load-ravines must validate; validate.errors=${JSON.stringify(validate.errors, null, 1)}`).toBe(true);
  });
});
