// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 / R-BZ G9
//
// S1-P-6a — a declared producer pin may carry a `pct` BOUND over TWO producer
// stamps, with the limit taken from a declared logic variable.
//
// Spec 124 Rule 1 / R-BZ G9 (a tunable is never a function-scope literal) and
// Rule 3 (the limit is a DECLARED logic variable). The founding case is the
// ravines `MAX_INVALID_GEOM_RATIO = 0.05` — a module-level literal in
// scripts/lib/ravines/enrich-ravines.js, unreadable from any descriptor and
// therefore untunable (Fold 1 item 2 of the S1-P producer design).
//
// THE OP SET STAYS CLOSED. `scripts/lib/step/producer.js#PIN_OPS` is still
// `['equals','nonzero','true']`; the `max_ratio` op is NOT added. A pin that
// carries `bound` instead of `op`/`equals` makes `evaluatePins` DERIVE the ratio
// `100 * <stamp> / <of>` and hand it to the EXISTING `verdict.js`
// `resolveLimit` + `evaluateLimit` — the one pct grammar estate-wide
// (`definitions/bound`, PCT_RE), never a second one.
//
// WHAT THIS FILE PINS (tier 0, logic-only — no DB, no runner):
//   1. the five numeric cases the derived ratio must classify (plus den === 0),
//   2. the config-resolved limit (`limit_from_config`) actually moving the verdict,
//   3. an unresolved logic variable is an ERROR ROW (Rule 10: a violation is a
//      row, never a throw) — and the producer's own MISSING/ERROR reasons still
//      short-circuit before the ratio arm,
//   4. the three CLOSED ops behave byte-identically in the same call,
//   5. the schema admits the three new keys and REFUSES every shape the evaluator
//      cannot read (a bound pin without `of`, a bare `of`, a mismatched `stamp`,
//      a malformed bound, a bound pin that also declares `op`).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

type AjvErrorLike = {
  instancePath?: string;
  dataPath?: string;
  keyword: string;
  params?: Record<string, unknown>;
};

const REPO_ROOT = path.resolve(__dirname, '../../');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'step.schema.json');

const readJson = (p: string): Record<string, unknown> => JSON.parse(fs.readFileSync(p, 'utf8'));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const { evaluatePins, PIN_OPS } = require(path.join(
  REPO_ROOT,
  'scripts/lib/step/producer.js',
)) as {
  evaluatePins: (
    pins: unknown[],
    resultsBySlug: Record<string, unknown>,
    config?: Record<string, number>,
  ) => Array<Record<string, unknown>>;
  PIN_OPS: readonly string[];
};

const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  compileStepSchema: (schema: unknown) => ((data: unknown) => boolean) & { errors?: AjvErrorLike[] | null };
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The pin ITEM node, read FROM the canonical schema — never retyped (operator
 * ruling R2: the schema is the one vocabulary). Same helper as
 * src/tests/schema-pins-op.logic.test.ts, which owns the `op` half of this node;
 * the item's `$ref`s (`slug`, `why`) need the schema's own `definitions` carried
 * alongside. A local Ajv is NOT constructed — the house compiler is reused.
 */
const SCHEMA = readJson(SCHEMA_PATH);
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

/** The ravines pin: `invalid_geometry_skipped / feature_count` against a config limit. */
const PIN: Record<string, unknown> = {
  step: 'load_ravines',
  stamp: 'records_meta.ravine_load.invalid_geometry_skipped',
  of: 'records_meta.ravine_load.feature_count',
  bound: 'pct <= 5',
  limit_from_config: 'v',
};

/**
 * Evaluate `PIN` against one `ravine_load` records_meta object (a FOUND producer
 * run, the shape `makeProducer` returns) and return the single row.
 */
function run(meta: Record<string, unknown>, config?: Record<string, number>): Record<string, unknown> {
  return evaluatePins(
    [PIN],
    {
      load_ravines: {
        reason: 'FOUND',
        sid: 9,
        status: 'completed',
        completed_at: 't',
        records_meta: { ravine_load: meta },
      },
    },
    config,
  )[0]!;
}

describe('S1-P-6a — a `bound` pin derives 100 * stamp / of and cannot fail to be measured', () => {
  it('the closed op set is UNCHANGED — `max_ratio` was dropped, not added', () => {
    expect([...PIN_OPS]).toEqual(['equals', 'nonzero', 'true']);
  });

  it('5 of 100 against the declared 5% is a PASS reporting the measured ratio as its value', () => {
    const row = run({ feature_count: 100, invalid_geometry_skipped: 5 }, { v: 5 });
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(5);
    expect(row.value).toBe(5);
    expect(row.status).toBe('INFO');
    // The threshold column shows THE VALUE IN FORCE (the resolved bound), never `bound`.
    expect(row.threshold).toBe('pct <= 5');
    expect(row.predicate).toBe('records_meta.ravine_load.invalid_geometry_skipped / records_meta.ravine_load.feature_count (pct) <= 5');
    expect(row.metric).toBe('producer_pin_load_ravines_records_meta_ravine_load_invalid_geometry_skipped_bound');
    expect(String(row.note)).toContain('= 5%');
  });

  it('6 of 100 against 5% is a FAIL row (Rule 10: the violation is a row, not a throw)', () => {
    const row = run({ feature_count: 100, invalid_geometry_skipped: 6 }, { v: 5 });
    expect(row.result).toBe('FAIL');
    expect(row.status).toBe('FAIL');
    expect(row.observed).toBe(6);
  });

  it('0 of 100 passes the bound', () => {
    const row = run({ feature_count: 100, invalid_geometry_skipped: 0 }, { v: 5 });
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(0);
  });

  it('a ZERO denominator is vacuously within the bound (the legacy `featureCount > 0 &&`)', () => {
    const row = run({ feature_count: 0, invalid_geometry_skipped: 7 }, { v: 5 });
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(0);
  });

  it('both stamps absent → 0/0, a PASS with observed 0 — NEVER a MISSING row (the legacy `Number(x) || 0` coercion)', () => {
    const row = run({}, { v: 5 });
    expect(row.result).toBe('PASS');
    expect(row.observed).toBe(0);
  });

  it('the limit comes FROM CONFIG: the same 6 of 100 passes at a declared 10%', () => {
    const row = run({ feature_count: 100, invalid_geometry_skipped: 6 }, { v: 10 });
    expect(row.result).toBe('PASS');
    expect(row.threshold).toBe('pct <= 10');
  });

  it('an unresolved logic variable is an ERROR row, never a throw and never a silent literal fallback', () => {
    const row = run({ feature_count: 100, invalid_geometry_skipped: 6 }, {});
    expect(row.result).toBe('ERROR');
    expect(String(row.note)).toContain('logic variable v did not resolve — ERROR');
    // …and the same when no config map is passed at all (the evaluator defaults it).
    expect(run({ feature_count: 100, invalid_geometry_skipped: 6 }).result).toBe('ERROR');
  });

  it('the producer read reasons still short-circuit BEFORE the ratio arm', () => {
    const rowFor = (reason: string) =>
      evaluatePins([PIN], { load_ravines: { reason, sid: null, status: null, completed_at: null, records_meta: null } }, { v: 5 })[0]!;
    expect(rowFor('MISSING').result).toBe('MISSING');
    expect(rowFor('ERROR').result).toBe('ERROR');
  });

  it('the three CLOSED ops keep their old results in the same call', () => {
    const rows = evaluatePins(
      [
        { step: 'load_ravines', stamp: 'records_meta.ravine_load.spec_version', equals: '3' },
        { step: 'load_ravines', stamp: 'records_meta.ravine_load.feature_count', op: 'nonzero' },
        PIN,
      ],
      {
        load_ravines: {
          reason: 'FOUND',
          sid: 9,
          status: 'completed',
          completed_at: 't',
          records_meta: { ravine_load: { spec_version: '3', feature_count: 100, invalid_geometry_skipped: 4 } },
        },
      },
      { v: 5 },
    );
    expect(rows[0]!.result).toBe('PASS');
    expect(rows[0]!.metric).toBe('producer_pin_load_ravines_records_meta_ravine_load_spec_version');
    expect(rows[1]!.result).toBe('PASS');
    expect(rows[1]!.metric).toBe('producer_pin_load_ravines_records_meta_ravine_load_feature_count_nonzero');
    expect(rows[2]!.result).toBe('PASS');
    expect(rows[2]!.metric).toBe('producer_pin_load_ravines_records_meta_ravine_load_invalid_geometry_skipped_bound');
  });
});

describe('S1-P-6a — the `bound` / `of` / `limit_from_config` pin keys (schema)', () => {
  it('the pins item sub-schema really carries the three keys (a green-because-it-never-looked fence)', () => {
    const props = (PINS_FIELD.items as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).toContain('bound');
    expect(Object.keys(props)).toContain('of');
    expect(Object.keys(props)).toContain('limit_from_config');
  });

  it('a bound pin with a `why` validates — the FULL declared shape', () => {
    const pin = {
      ...PIN,
      why: {
        text: 'ravines invalid-geometry ratio (Spec 124 Rule 1; the founding function-scope literal)',
        liveness: 'none',
      },
    };
    const ok = validateItem(pin);
    expect(ok, JSON.stringify(validateItem.errors)).toBe(true);
  });

  it('every shape the evaluator cannot read is REFUSED', () => {
    // A bound pin that also declares `op` — two predicates on one pin.
    expect(validateItem({ ...PIN, op: 'nonzero' })).toBe(false);
    // A bound pin with no denominator.
    const { of: _of, ...withoutOf } = PIN;
    expect(validateItem(withoutOf)).toBe(false);
    // `of` without `bound` (the inverse rule).
    expect(validateItem({ step: 'load_ravines', stamp: 'records_meta.x', of: 'records_meta.y' })).toBe(false);
    // A watermark/table stamp has no ratio to derive.
    expect(validateItem({ ...PIN, stamp: 'parcels.col' })).toBe(false);
    // The closed pct grammar — `==` is not a form.
    expect(validateItem({ ...PIN, bound: 'pct == 5' })).toBe(false);
    // `limit_from_config` without `bound`.
    expect(validateItem({ step: 'load_ravines', stamp: 'records_meta.x', equals: '1', limit_from_config: 'v' })).toBe(false);
  });

  it('`statuses` IS admitted on a bound pin (it is an EVALUATED pin, like op/equals)', () => {
    const pin = { step: 'load_ravines', stamp: 'records_meta.x', bound: 'pct <= 5', of: 'records_meta.y', statuses: ['completed'] };
    const ok = validateItem(pin);
    expect(ok, JSON.stringify(validateItem.errors)).toBe(true);
  });
});
