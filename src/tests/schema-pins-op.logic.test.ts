// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 10
//
// S1-P-4 — `staleness.pins[]` items gain the CLOSED `op`, `statuses`, `meta_object` keys.
//
// Spec 124 Rule 10 makes the producer pin the runner's pre-flight predicate, evaluated in
// `scripts/lib/step/index.js#measureProducerPins` before any phase/compute runs. This file
// is the tier-0 gate on the DESCRIPTOR half of that contract: the schema must ADMIT the
// three new keys, and it must REFUSE every shape the runner cannot evaluate.
//
// WHY THE ITEM SUB-SCHEMA, NOT A WHOLE DESCRIPTOR. The rules under test are all local to a
// single `staleness.pins[]` item's own keys (`op`/`equals`/`stamp`/`statuses`/`meta_object`),
// and a whole descriptor buries each failure under the 20 required categories — the exact
// "green because it never looked" trap (Spec 121 §12b.6) this repo has measured eleven of
// (see src/tests/step-schema.logic.test.ts). The item node dereferences only two local
// definitions (`slug`, `why`), so the ONE house compiler (`compileStepSchema` from
// scripts/lib/step/validate.js — never a locally constructed Ajv) is reused verbatim, with
// the schema's own `definitions` carried alongside so the `$ref`s resolve. The INVARIANT
// that every EXISTING committed pin `{step, stamp, equals?, why?}` still validates unchanged
// is owned by src/tests/step-schema.logic.test.ts, which validates every committed descriptor
// against the real schema; the pre-existing LDG-10 pin fixtures (`pins-item-missing-step.json`,
// `pins-item-unknown-key.json`, `pins-equals-on-column-stamp.json`) also still fire there.
//
// The invalid fixtures are full pins ITEMS differing from a valid one by exactly one mutation,
// so a failure here names the rule, not a fixture typo. AJV error pinning is adapted from
// `src/tests/step-schema.logic.test.ts` (the `errPath` / `AjvErrorLike` normalizer and the
// pin-in-the-assertion-message style). Helpers are copied, never imported from that test file.
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

const REPO_ROOT = path.resolve(__dirname, '../../');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'step.schema.json');

const readJson = (p: string): Record<string, unknown> => JSON.parse(fs.readFileSync(p, 'utf8'));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  compileStepSchema: (schema: unknown) => ((data: unknown) => boolean) & { errors?: AjvErrorLike[] | null };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const SCHEMA = readJson(SCHEMA_PATH);

/**
 * The `staleness.pins` item node, taken FROM the canonical schema (never retyped — the
 * operator ruling R2 makes the schema the one vocabulary). The item's `$ref`s point at
 * `#/definitions/slug` and `#/definitions/why`, which are top-level in the real schema, so
 * the item is compiled with `definitions` carried alongside it.
 */
const PINS_FIELD = (
  ((SCHEMA.properties as Record<string, unknown>).staleness as {
    properties?: Record<string, unknown>;
  }).properties ?? {}
).pins as { items?: Record<string, unknown> } | undefined;

if (!PINS_FIELD || !PINS_FIELD.items) {
  throw new Error('step.schema.json has no staleness.pins.items — the sub-schema cannot be compiled, so nothing below would prove anything');
}

const PIN_ITEM_SCHEMA: Record<string, unknown> = {
  ...(clone(PINS_FIELD.items) as Record<string, unknown>),
  definitions: SCHEMA.definitions,
};

const validateItem = compileStepSchema(PIN_ITEM_SCHEMA);

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

/** A minimal VALID pin item: the pre-existing LDG-10 shape (`step` + `stamp` + `equals`). */
const pinItem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  step: 'load_ravines',
  stamp: 'records_meta.ravine_load.spec_version',
  equals: '3',
  ...overrides,
});

describe('staleness.pins[] — the S1-P `op` / `statuses` / `meta_object` keys (Spec 124 Rule 10)', () => {
  it('the pins item sub-schema compiles and carries the three new keys (a green-because-it-never-looked fence)', () => {
    // If the node were retyped in the test rather than read from the schema, a missing key
    // here would still pass. Assert the keys are the schema's OWN before depending on them.
    const props = (PINS_FIELD.items as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).toContain('op');
    expect(Object.keys(props)).toContain('statuses');
    expect(Object.keys(props)).toContain('meta_object');
  });

  it('INVARIANT — the pre-existing LDG-10 pin shape `{step, stamp, equals}` stays valid, unchanged', () => {
    // Every committed descriptor carries this shape today; if this reddens, the extension
    // broke existing pins rather than extending the item.
    const ok = validateItem(pinItem());
    expect(ok, `the existing pin shape must still validate; errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('INVARIANT — `{step, stamp}` with no literal (a watermark pin) still validates', () => {
    const ok = validateItem({ step: 'load_ravines', stamp: 'parcels.col' });
    expect(ok, `a bare watermark pin must still validate; errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('op:"nonzero" over a records_meta stamp is VALID (no equals literal)', () => {
    const item = pinItem({ stamp: 'records_meta.x', op: 'nonzero' });
    delete item.equals;
    expect(validateItem(item), `errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('op:"equals" WITH the equals literal is VALID', () => {
    const ok = validateItem(pinItem({ op: 'equals' }));
    expect(ok, `op:"equals" + equals must validate; errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('op:"nonzero" WITH an equals literal is INVALID (the non-equals arms carry no literal)', () => {
    const item = pinItem({ op: 'nonzero', stamp: 'records_meta.x', equals: '1' });
    expect(validateItem(item), 'op:"nonzero" + equals must be refused').toBe(false);
    pin(validateItem.errors, '', 'not');
  });

  it('op:"true" over a watermark stamp is INVALID (a non-equals op reads a records_meta stamp)', () => {
    const item = pinItem({ op: 'true', stamp: 'parcels.col' });
    delete item.equals;
    expect(validateItem(item), 'op:"true" over a <table>.<column> stamp must be refused').toBe(false);
    pin(validateItem.errors, '/stamp', 'pattern');
  });

  it('op:"equals" WITHOUT an equals literal is INVALID (the literal is required by the op)', () => {
    const item = pinItem({ op: 'equals' });
    delete item.equals;
    expect(validateItem(item), 'op:"equals" with no literal must be refused').toBe(false);
    pin(validateItem.errors, '', 'required', ['missingProperty', 'equals']);
  });

  it('op:"max_ratio" is INVALID — the op enum is CLOSED', () => {
    const item = pinItem({ op: 'max_ratio', stamp: 'records_meta.x' });
    delete item.equals;
    expect(validateItem(item), 'an op outside the closed enum must be refused').toBe(false);
    pin(validateItem.errors, '/op', 'enum');
  });

  it('statuses:["completed","failed"] beside an op is VALID (a verdict read declares a wider terminal set)', () => {
    const item = pinItem({ op: 'nonzero', stamp: 'records_meta.x', statuses: ['completed', 'failed'] });
    delete item.equals;
    expect(validateItem(item), `statuses must be admitted on an evaluated pin; errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('statuses:["running"] is INVALID — the terminal set is CLOSED', () => {
    const item = pinItem({ op: 'nonzero', stamp: 'records_meta.x', statuses: ['running'] });
    delete item.equals;
    expect(validateItem(item), 'a non-terminal status must be refused').toBe(false);
    pin(validateItem.errors, '/statuses/0', 'enum');
  });

  it('meta_object:"zoning_layers_loaded" beside an op is VALID', () => {
    const item = pinItem({ op: 'nonzero', stamp: 'records_meta.x', meta_object: 'zoning_layers_loaded' });
    delete item.equals;
    expect(validateItem(item), `meta_object must be admitted on an evaluated pin; errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('`{step, stamp:"parcels.col", statuses:["completed"]}` is INVALID — statuses only on an evaluated pin', () => {
    // A watermark pin is compared elsewhere; it carries no op and no equals, so it may not
    // declare a terminal set.
    const item = { step: 'load_ravines', stamp: 'parcels.col', statuses: ['completed'] };
    expect(validateItem(item), 'statuses on a watermark pin must be refused').toBe(false);
    pin(validateItem.errors, '', 'anyOf');
  });

  it('meta_object on a watermark pin is INVALID too (the same anyOf arm)', () => {
    const item = { step: 'load_ravines', stamp: 'parcels.col', meta_object: 'zoning_layers_loaded' };
    expect(validateItem(item), 'meta_object on a watermark pin must be refused').toBe(false);
    pin(validateItem.errors, '', 'anyOf');
  });

  // CP-S1 #12c (operator 2026-10-14; proposed row amends R-CB): the run-status op.
  const TERMINAL = ['completed', 'completed_with_warnings', 'completed_with_errors', 'failed', 'crashed', 'cancelled'];
  const notFailed = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    step: 'load_zoning', stamp: 'pipeline_runs.status', op: 'not_failed', statuses: TERMINAL, ...overrides,
  });

  it('op:"not_failed" on pipeline_runs.status with a declared terminal set is VALID', () => {
    expect(validateItem(notFailed()), `errors=${JSON.stringify(validateItem.errors, null, 1)}`).toBe(true);
  });

  it('op:"not_failed" on any other stamp is INVALID (it reads the run status only)', () => {
    expect(validateItem(notFailed({ stamp: 'records_meta.x' })), 'not_failed over a records_meta stamp must be refused').toBe(false);
    pin(validateItem.errors, '/stamp', 'const');
  });

  it('op:"not_failed" WITHOUT statuses is INVALID (a verdict read declares its terminal set, R-CB S1-P)', () => {
    const item = notFailed();
    delete item.statuses;
    expect(validateItem(item), 'not_failed with no statuses must be refused').toBe(false);
    pin(validateItem.errors, '', 'required', ['missingProperty', 'statuses']);
  });

  it('op:"not_failed" WITH an equals literal is INVALID', () => {
    expect(validateItem(notFailed({ equals: 'failed' })), 'not_failed + equals must be refused').toBe(false);
  });

  it('x-trust-op names the real executor, and the sibling x-trust names the pin evaluator', () => {
    // The annotation is a claim about WHERE the op is executed; a drifted path is a lie with
    // a citation, so it is pinned to the actual module#function.
    const field = PINS_FIELD as { 'x-trust'?: string; 'x-trust-op'?: string };
    expect(field['x-trust'], 'the LDG-10 x-trust must name the pin evaluator').toBe(
      'executed:scripts/lib/step/producer.js#evaluatePins',
    );
    expect(field['x-trust-op'], 'x-trust-op must name measureProducerPins').toBe(
      'executed:scripts/lib/step/index.js#measureProducerPins',
    );
  });
});
