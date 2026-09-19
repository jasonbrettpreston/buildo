// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1 (the step contract, stage S1)
//
// THE CANONICAL VOCABULARY IS THE SCHEMA (operator ruling R2, 2026-08-23), so
// this file is the tier-0 gate on it: the schema must COMPILE, the exemplar
// descriptors must validate GREEN, and every known-bad fixture must FAIL AT THE
// EXPECTED PATH.
//
// The last clause is the load-bearing one. Spec 121 §12b.6 measured ELEVEN
// green-because-it-never-looked instances in this repo: a checker that passes
// because it never fired is indistinguishable from one that passes because the
// input is clean. So each invalid fixture is pinned to the specific error it
// must produce, and the #54 enricher lock is proven in BOTH directions — the
// positive control differs from the negative by exactly one populated array.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'step.schema.json');
const FIXTURES = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'fixtures');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'violations', 'schema-to-vocab.mjs');
const VOCAB_DOC = path.join(REPO_ROOT, 'docs', 'reports', 'generated', '122-vocabulary.md');

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

const readJson = (p: string): Record<string, unknown> => JSON.parse(fs.readFileSync(p, 'utf8'));

const schema = readJson(SCHEMA_PATH);
// S2 (2026-08-24): ONE compiler. `ajv` became a real dependency at v8 (it had
// been resolving transitively to ajv 6 via eslint), and the library's
// compileStepSchema is what `pipeline.step()` itself validates with — so this
// tier-0 gate and production cannot drift into two different AJV configurations.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
const validate = compileStepSchema(schema);

function errorsFor(fixture: string): AjvErrorLike[] {
  const ok = validate(readJson(path.join(FIXTURES, 'invalid', fixture)));
  expect(ok, `${fixture} must NOT validate — a fixture that does not fire proves nothing`).toBe(false);
  return (validate.errors ?? []) as unknown as AjvErrorLike[];
}

/**
 * Each row is a RULE CLASS with the fixture that must trip it. The fixtures are
 * full descriptors differing from the exemplar by exactly one mutation, so a
 * failure here names the rule, not a fixture typo.
 */
const INVALID_FIXTURES: Array<{
  file: string;
  rule: string;
  path: string;
  keyword: string;
  param?: [string, string];
}> = [
  {
    file: 'missing-category.json',
    rule: 'omission is a build failure — the 18th category `terminals` is absent',
    path: '',
    keyword: 'required',
    param: ['missingProperty', 'terminals'],
  },
  {
    file: 'banned-value-schema-drift-warn.json',
    rule: 'V3 — guards.schema_drift is none|propagate|pause; `warn` was dropped',
    path: '/guards/schema_drift',
    keyword: 'anyOf',
  },
  {
    file: 'banned-value-severity-pass.json',
    rule: '§12.5 — severity PASS is impossible; it is a runtime outcome, never declarable',
    path: '/checks/0/severity',
    keyword: 'enum',
  },
  {
    file: 'assert-with-outputs.json',
    rule: '§1.10 archetype profile — an ASSERT must declare outputs "none"',
    path: '/outputs',
    keyword: 'const',
  },
  {
    file: 'enricher-pending-without-invalidator.json',
    rule: 'claim #54 — an ENRICHER with a lineage-predicate staleness.scope cannot omit its invalidator (the centroid defect made unexpressible)',
    path: '/outputs/invalidates',
    keyword: 'minItems',
  },
  {
    file: 'checks-none.json',
    rule: 'claim #7 — `checks` is the ONE category that may never be "none"',
    path: '/checks',
    keyword: 'type',
  },
  {
    file: 'guard-none-without-why.json',
    rule: 'V7 — guard:none is DECLARABLE but grandfathered: an unguarded write must say why it is unguarded',
    path: '/outputs/writes/0/write_discipline',
    keyword: 'required',
    param: ['missingProperty', 'guard_why'],
  },
  {
    file: 'unknown-key.json',
    rule: 'the schema is CLOSED — an unknown key is a build failure',
    path: '/identity',
    keyword: 'additionalProperties',
    param: ['additionalProperty', 'retry_policy'],
  },
  {
    file: 'invariant-missing-last-measured.json',
    rule: 'R-T addendum — an invariants[] entry with no last_measured is a blank-bound regression (Design decisions: "reachable + last_measured populated at declaration time, never left blank")',
    path: '/invariants/0',
    keyword: 'required',
    param: ['missingProperty', 'last_measured'],
  },
  {
    file: 'invariant-missing-frequency.json',
    rule: 'R-T addendum — an invariants[] entry with no frequency cannot be cadence-gated (Spec 122 P3 cost-adjudication: every_run vs validate_only is declared, never inferred)',
    path: '/invariants/0',
    keyword: 'required',
    param: ['missingProperty', 'frequency'],
  },
  {
    file: 'order-guarantee-missing-anchor.json',
    rule: 'Spec 124 §2 Rule 11 (WF2 "Rules 10/11/12 mechanical checkers", C2) — a when:"pre_write" check must declare order_guarantee {guarantee, spec_ref, anchor}; a missing anchor is unevaluable (checkOrderGuaranteesCited cannot verify a citation with no literal to look for)',
    path: '/checks/10/order_guarantee',
    keyword: 'required',
    param: ['missingProperty', 'anchor'],
  },
];

describe('step.schema.json — the canonical vocabulary (Spec 122 S1)', () => {
  it('compiles under AJV', () => {
    expect(typeof validate).toBe('function');
  });

  it('declares 20 categories, every one of them required (R-T addendum, resolved at commit 4 — invariants/plausibility flipped from staged to required)', () => {
    const cats = schema['x-categories'] as string[];
    const required = schema.required as string[];
    expect(cats).toHaveLength(20);
    expect(cats).toContain('terminals');
    expect(cats).toContain('invariants');
    expect(cats).toContain('plausibility');
    for (const c of cats) expect(required, `${c} must be required — omission is a build failure`).toContain(c);
  });

  it('invariants/plausibility are DEFINED and now REQUIRED (x-schema-rollout resolved at commit 4, mirrors converted.json PENDING/R-K.1 resolving)', () => {
    // Fold C-1's staging (commit 1) resolves here: every real descriptor already
    // had a migrated invariants[]/plausibility[] array or an explicit 'none'
    // (assert_schema, ASSERT archetype, 0 candidates by design) BEFORE this
    // flip landed — so the required-status change itself touches zero real
    // descriptor bytes; the byte-change->fingerprint cost rode each step's own
    // migration commit, exactly as staged.
    const required = schema.required as string[];
    expect(required).toContain('invariants');
    expect(required).toContain('plausibility');
    const props = schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty('invariants');
    expect(props).toHaveProperty('plausibility');
    const defs = schema.definitions as Record<string, unknown>;
    expect(defs).toHaveProperty('invariant');
    expect(defs).toHaveProperty('plausibility');
    expect(defs).toHaveProperty('bound');
    expect(defs).toHaveProperty('lastMeasured');
    const rollout = schema['x-schema-rollout'] as Record<string, { status: string; required_from_commit: number; resolved_at_commit: number }>;
    expect(rollout.invariants).toEqual({
      status: 'required',
      required_from_commit: 4,
      resolved_at_commit: 4,
      why: expect.any(String),
    });
    expect(rollout.plausibility).toEqual({
      status: 'required',
      required_from_commit: 4,
      resolved_at_commit: 4,
      why: expect.any(String),
    });
  });

  describe('exemplars validate green', () => {
    const valid = fs.readdirSync(path.join(FIXTURES, 'valid'));
    it('has at least the assert_schema pilot draft', () => {
      expect(valid).toContain('assert_schema.descriptor.json');
    });
    for (const f of valid) {
      it(f, () => {
        const ok = validate(readJson(path.join(FIXTURES, 'valid', f)));
        expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 1)).toEqual([]);
        expect(ok).toBe(true);
      });
    }
  });

  it('no two valid exemplars share an identity or a lock (V2, applied to the fixtures themselves)', () => {
    // An exemplar wearing another step's name and lock is the same
    // "declares one thing, is another" defect the contract exists to retire —
    // and it is exactly what copy-pasting a fixture produces. (The invalid
    // fixtures deliberately share their counterpart's lock: each is that
    // descriptor with one mutation.)
    const valid = fs
      .readdirSync(path.join(FIXTURES, 'valid'))
      .map((f) => readJson(path.join(FIXTURES, 'valid', f)).identity as { name: string; lock: number });
    expect(new Set(valid.map((i) => i.name)).size).toBe(valid.length);
    expect(new Set(valid.map((i) => i.lock)).size).toBe(valid.length);
  });

  describe('known-bad fixtures FIRE, at the expected path', () => {
    for (const fx of INVALID_FIXTURES) {
      it(`${fx.file} — ${fx.rule}`, () => {
        const errors = errorsFor(fx.file);
        const hit = errors.find(
          (e) =>
            errPath(e) === fx.path &&
            e.keyword === fx.keyword &&
            (!fx.param || e.params?.[fx.param[0]] === fx.param[1]),
        );
        expect(
          hit,
          `expected ${fx.keyword} at "${fx.path}"; got ${errors.map((e) => `${errPath(e)}:${e.keyword}`).join(', ')}`,
        ).toBeDefined();
      });
    }
  });

  it('V7 — a grandfathered unguarded write validates WITH its why, and only with it', () => {
    // GAP-2's real shape. Before V7 this had no legal declaration at all;
    // after V7 it is declarable, and the why is what makes it grandfathered
    // rather than merely allowed.
    const ok = readJson(path.join(FIXTURES, 'valid', 'grandfathered-unguarded.descriptor.json'));
    expect(validate(ok), JSON.stringify(validate.errors, null, 1)).toBe(true);
    const wd = (ok.outputs as { writes: Array<{ write_discipline: Record<string, unknown> }> }).writes[0]
      ?.write_discipline;
    expect(wd?.guard).toBe('none');
    expect(wd?.guard_why).toBeTruthy();
    expect(wd?.scope).not.toBe('none');

    const bad = readJson(path.join(FIXTURES, 'invalid', 'guard-none-without-why.json'));
    expect(validate(bad)).toBe(false);
  });

  // ── The x-banned-for-new ENFORCER (LINK pilot, Fold B item 2) ──────────────
  //
  // ⚠️ THE GAP THIS CLOSES WAS MEASURED, NOT SUSPECTED. `x-banned-for-new` sat in the
  // schema with NO consumer — nothing anywhere read it — so "banned for new steps" was
  // a sentence in a JSON file. Any new descriptor could carry `guard: "none"`, satisfy
  // the schema's own `guard_why` requirement, and ship. AJV cannot express the rule
  // (it needs a second committed file keyed by identity.name), so it lives in
  // validateDescriptor, which `pipeline.step()` runs at construction.
  //
  // Both directions, on descriptors that differ by IDENTITY ALONE.
  describe('x-banned-for-new is ENFORCED, not merely annotated', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
    const { validateDescriptor, loadGrandfathered } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
      validateDescriptor: (d: unknown) => unknown;
      loadGrandfathered: () => { steps: Record<string, { paths: Record<string, string>; commit: string }> };
    };
    const ALLOWED = path.join(FIXTURES, 'valid', 'grandfathered-unguarded.descriptor.json');
    const REFUSED = path.join(FIXTURES, 'invalid', 'guard-none-not-grandfathered.json');

    it('the two fixtures differ by IDENTITY ONLY — so a difference in outcome can only be the allowlist', () => {
      const a = readJson(ALLOWED);
      const b = readJson(REFUSED);
      expect(JSON.stringify(b.outputs)).toBe(JSON.stringify(a.outputs));
      expect((b.identity as { name: string }).name).not.toBe((a.identity as { name: string }).name);
    });

    it('AJV ALONE accepts the un-allowlisted descriptor — which IS the gap', () => {
      expect(validate(readJson(REFUSED)), 'if AJV rejected it, the enforcer below would be proving nothing').toBe(true);
    });

    it('GREEN — an allowlisted step keeps its unguarded write', () => {
      expect(() => validateDescriptor(readJson(ALLOWED))).not.toThrow();
      const entry = loadGrandfathered().steps[(readJson(ALLOWED).identity as { name: string }).name];
      expect(entry, 'the green direction must be green BECAUSE of an allowlist entry').toBeDefined();
      expect(entry?.paths['outputs.writes[].write_discipline.guard']).toBe('none');
      expect(/^[0-9a-f]{7,40}$/.test(entry?.commit ?? ''), 'an entry must name the commit that grandfathered it').toBe(true);
    });

    it('RED — the same write, with a why, is REFUSED when the step is not on the allowlist', () => {
      expect(() => validateDescriptor(readJson(REFUSED))).toThrow(/grandfathered/);
    });

    it('RED — removing the allowlist entry reddens the green fixture too (the rule is the allowlist, not the name)', () => {
      const d = readJson(ALLOWED) as { identity: { name: string } };
      d.identity = { ...d.identity, name: 'fixture_name_no_allowlist_will_ever_have' };
      expect(() => validateDescriptor(d)).toThrow(/grandfathered/);
    });
  });

  describe('V7 no_retraction is ENFORCED (Spec 124 GAP V7 no_retraction closure, 2026-08-29)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
    const { validateDescriptor, loadGrandfathered, assertNoRetraction } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
      validateDescriptor: (d: unknown) => unknown;
      loadGrandfathered: () => { steps: Record<string, { rules?: string[] }> };
      assertNoRetraction: (d: unknown, findings: string[]) => void;
    };
    const NR_ALLOWED = path.join(FIXTURES, 'valid', 'no-retraction-allowed.descriptor.json');
    const NR_REFUSED = path.join(FIXTURES, 'invalid', 'no-retraction-not-grandfathered.json');

    it('the two fixtures differ by IDENTITY ONLY — so a difference in outcome can only be the allowlist', () => {
      const a = readJson(NR_ALLOWED);
      const b = readJson(NR_REFUSED);
      expect(JSON.stringify(b.outputs)).toBe(JSON.stringify(a.outputs));
      expect((b.identity as { name: string }).name).not.toBe((a.identity as { name: string }).name);
    });

    it('AJV ALONE accepts the un-allowlisted descriptor — which IS the gap this closes', () => {
      expect(validate(readJson(NR_REFUSED)), 'if AJV rejected it, the enforcer below would be proving nothing').toBe(true);
    });

    it('GREEN — a rules:["no_retraction"]-allowlisted step keeps its insert-only-no-retraction write', () => {
      expect(() => validateDescriptor(readJson(NR_ALLOWED))).not.toThrow();
      const entry = loadGrandfathered().steps[(readJson(NR_ALLOWED).identity as { name: string }).name];
      expect(entry, 'the green direction must be green BECAUSE of an allowlist entry').toBeDefined();
      expect(entry?.rules).toContain('no_retraction');
    });

    it('RED — the same write is REFUSED when the step is not on the rules[] allowlist', () => {
      expect(() => validateDescriptor(readJson(NR_REFUSED))).toThrow(/no_retraction/);
      expect(() => validateDescriptor(readJson(NR_REFUSED))).toThrow(/grandfathered/);
    });

    it('RED — removing the rules[] entry reddens the green fixture too (the rule is the allowlist, not the name)', () => {
      const d = readJson(NR_ALLOWED) as { identity: { name: string } };
      d.identity = { ...d.identity, name: 'fixture_name_no_rules_allowlist_will_ever_have' };
      expect(() => validateDescriptor(d)).toThrow(/no_retraction/);
    });

    it('a write target that genuinely retracts elsewhere is NOT banned, even under the same class name (the predicate spans class AND retract)', () => {
      const d = readJson(NR_REFUSED) as { outputs: { writes: Array<{ retract: string }> } };
      const write = d.outputs.writes[0];
      expect(write, 'fixture must declare at least one write target').toBeDefined();
      (write as { retract: string }).retract = 'departed';
      const findings: string[] = [];
      assertNoRetraction(d, findings);
      expect(findings, 'a genuinely-retracting write must not trip the no_retraction predicate').toEqual([]);
    });
  });

  it('the #54 lock is proven in BOTH directions', () => {
    // Same descriptor, one array populated. If the positive control also failed,
    // the negative would be firing for some unrelated reason.
    const positive = readJson(path.join(FIXTURES, 'valid', 'enrich_heritage.descriptor.json'));
    const negative = readJson(path.join(FIXTURES, 'invalid', 'enricher-pending-without-invalidator.json'));
    expect(validate(positive)).toBe(true);
    expect(validate(negative)).toBe(false);
    const posOut = positive.outputs as { invalidates: unknown[] };
    const negOut = negative.outputs as { invalidates: unknown[] };
    expect(posOut.invalidates.length).toBeGreaterThan(0);
    expect(negOut.invalidates).toHaveLength(0);
  });
});

describe('step.schema.json — the V1-V6 and R6 rulings are actually encoded', () => {
  const at = (p: string): Record<string, unknown> =>
    p.split('.').reduce<Record<string, unknown>>((acc, k) => (acc?.[k] ?? {}) as Record<string, unknown>, schema);

  it('V1 — archetype is full words, never the ING|MAT shorthand', () => {
    const e = at('properties.identity.properties.archetype').enum as string[];
    expect(e).toEqual(['INGESTOR', 'MATERIALIZER', 'LINK', 'MATCHER', 'ENRICHER', 'BACKFILL', 'ASSERT', 'RECORDER']);
  });

  it('V3 — schema_drift dropped `warn` and kept a conditional per-layer form', () => {
    const node = at('properties.guards.properties.schema_drift');
    const branches = node.anyOf as Array<Record<string, unknown>>;
    const scalar = branches.find((b) => Array.isArray(b.enum));
    expect(scalar?.enum).toEqual(['none', 'propagate', 'pause']);
    // R6: load-zoning.js:405-407 responds differently per layer in ONE step.
    const conditional = branches.find((b) => b.type === 'array');
    expect(conditional, 'a scalar cannot express base FAIL/pause + non-base WARN/propagate').toBeDefined();
    expect(conditional?.contains).toBeDefined();
  });

  it('V4 — append_unsafe stays declarable but is machine-readably banned for new steps', () => {
    const replay = at('definitions.write.properties.replay');
    expect(replay.enum).toContain('append_unsafe');
    expect(replay['x-banned']).toEqual(['append_unsafe']);
    const bfn = schema['x-banned-for-new'] as { values: Record<string, string[]> };
    expect(bfn.values['outputs.writes[].replay']).toEqual(['append_unsafe']);
  });

  it('V5 — staleness is three axes plus fingerprint_inputs, and `pending` is gone', () => {
    const props = at('properties.staleness.properties');
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['scope', 'trigger', 'mode_select', 'fingerprint_inputs']),
    );
    expect(props.pending).toBeUndefined();
  });

  it('R6 — acquisition is a trigger POSITION and an externals cache policy, not a category', () => {
    expect(schema['x-categories']).not.toContain('acquisition');
    const pos = at('properties.staleness.properties.trigger').anyOf as Array<Record<string, unknown>>;
    const arr = pos.find((b) => b.type === 'array') as { items: { properties: Record<string, { enum?: string[] }> } };
    expect(arr.items.properties.position?.enum).toContain('acquisition');
    const cache = at('properties.inputs.properties.reads.properties.externals').items as {
      properties: Record<string, { enum?: string[] }>;
    };
    expect(cache.properties.cache?.enum).toContain('reuse_if_present');
  });

  it('R6 — maintenance is an execution field that constrains txn_scope, not a category', () => {
    expect(schema['x-categories']).not.toContain('maintenance');
    expect(at('properties.execution.properties.maintenance')).toBeDefined();
    const conditionals = at('properties.execution').allOf as Array<{
      if?: { properties?: Record<string, { type?: string }> };
      then?: { properties?: Record<string, { enum?: string[] }> };
    }>;
    const vacuumRule = conditionals.find((c) => c.if?.properties?.maintenance?.type === 'array');
    // RE-FREEZE #6 (EP-D17, WF3, 2026-09-10) — the enum was widened to admit "step".
    // The constraint this conditional actually encodes is narrower than "a step-scoped
    // step may never declare maintenance": it is that the VACUUM STATEMENT ITSELF must
    // never run inside an open transaction. enrich_parcels (txn_scope:"step") is the
    // first step to declare execution.maintenance, and its executor
    // (scripts/lib/step/plausibility.js runMaintenance) always issues the statement
    // autocommit on its own pool connection, after the step's own transaction has
    // already committed — never inside it, regardless of what txn_scope declares. This
    // assertion is flipped, not deleted: it still proves the OTHER three values
    // ("statement", "batch", "none") remain legal, and that "step" is now ALSO legal.
    expect(vacuumRule?.then?.properties?.txn_scope?.enum, 'RE-FREEZE #6 — "step" is now legal; a step-scoped txn still cannot contain the VACUUM STATEMENT itself, which is why the executor always runs autocommit').toEqual(
      expect.arrayContaining(['statement', 'batch', 'step', 'none']),
    );
  });

  it('R6 — plan_shape is a checks[].kind value and source_key_policy is a per-target field', () => {
    expect(schema['x-categories']).not.toContain('plan_shape');
    expect(schema['x-categories']).not.toContain('source_key_policy');
    expect((at('definitions.check.properties.kind').enum as string[])).toContain('plan_shape');
    expect(at('definitions.write.properties.source_key_policy')).toBeDefined();
  });

  it('R6 — guards.requires[].on_missing degrade demands an algorithm', () => {
    const req = at('definitions.requirement');
    expect((req.properties as Record<string, { enum?: string[] }>).on_missing?.enum).toEqual(['fail', 'degrade']);
    const rule = (req.allOf as Array<{ then: { required: string[] } }>)[0];
    expect(rule?.then.required).toEqual(expect.arrayContaining(['algorithm', 'why']));
  });

  it('the 15 write-discipline classes are frozen as MECHANICS (V7 + LG-11/LG-16, MATCHER pilot 2026-08-28)', () => {
    const cls = at('definitions.writeDiscipline.properties.class');
    // 13 V7 mechanics + set_based_join_update (LG-11) + set_based_null_retract (LG-16) —
    // both genuinely new mechanics (a compute-authored UPDATE...FROM a matched CTE with
    // INSERT structurally forbidden; a scoped UPDATE-to-NULL retraction for a table this
    // step does not own), not a relabelling of an existing one.
    expect((cls.enum as string[])).toHaveLength(15);
    expect(cls['x-frozen']).toBe(true);
    // The D/H bans moved to x-banned-for-new.rules — see the V7 tests below.
    expect(cls['x-banned']).toBeUndefined();
  });

  it('§12.3 — all five missing fields exist', () => {
    expect(at('definitions.write.properties.columns').items).toHaveProperty('properties.vocabulary');
    expect(at('definitions.check.properties.accept_until')).toBeDefined();
    expect(at('properties.outputs').anyOf).toBeDefined();
    expect(at('definitions.why').properties).toHaveProperty('liveness');
    const net = (at('properties.execution.properties.network').anyOf as Array<{ properties?: object }>).find((b) => b.properties);
    expect(net?.properties).toHaveProperty('redact');
    const outObj = (at('properties.outputs').anyOf as Array<{ required?: string[] }>).find((b) => b.required);
    expect(outObj?.required).toContain('write_inventory');
  });

  it('the menu-completeness finding is closed by V7 WITH a declaration behind every gap', () => {
    const mc = schema['x-menu-completeness'] as {
      status: string;
      gaps: Array<{ id: string; status: string; now_expressible_as?: string }>;
      corrections: object;
    };
    expect(mc.status).toMatch(/^RESOLVED-BY-V7/);
    expect(mc.gaps.length).toBeGreaterThan(0);
    expect(Object.keys(mc.corrections)).toHaveLength(5);
    // A gap downgraded to EXPRESSIBLE with nothing behind it is laundering.
    for (const g of mc.gaps) {
      expect(g.status, `${g.id} must not be closed outright — per-file verification is still owed`).toMatch(/^EXPRESSIBLE/);
      expect(g.now_expressible_as, `${g.id} names no declaration`).toBeTruthy();
    }
    // ...and the resolution must keep saying what is NOT closed.
    expect((schema['x-menu-completeness'] as { resolution: string }).resolution).toMatch(/not closed/i);
  });

  it('V7 — the mechanic, guard, scope and retraction axes are decoupled', () => {
    const cls = at('definitions.writeDiscipline.properties.class');
    // Guardedness left the class name...
    expect(cls['x-banned'], 'D and H are no longer fused class identities').toBeUndefined();
    expect((cls.enum as string[])).toHaveLength(15);
    expect(String(cls.description)).toMatch(/MECHANIC ONLY/);
    // ...and became its own axis, declarable-but-grandfathered.
    const guard = at('definitions.writeDiscipline.properties.guard');
    expect(guard.enum).toEqual(['is_distinct_from', 'none']);
    expect(guard['x-banned']).toEqual(['none']);
    // Scope is a required axis, or the unscoped_set_based rule is unevaluable.
    expect(at('definitions.writeDiscipline.properties.scope')).toBeDefined();
    expect(at('definitions.writeDiscipline').required).toContain('scope');
    expect(schema['x-mechanic-notes']).toHaveProperty('set_based_unscoped');
  });

  it('V7 — the D and H bans survive as evaluable RULES over those axes', () => {
    const rules = (schema['x-banned-for-new'] as { rules: Array<{ id: string; banned_when: string }> }).rules;
    const ids = rules.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['no_retraction', 'unscoped_set_based', 'unguarded_write']));
    for (const r of rules) expect(r.banned_when, `${r.id} has no predicate`).toBeTruthy();
    // The no_retraction ban spans write_discipline.class AND its sibling retract,
    // so it can only live at the write level.
    const writeRules = at('definitions.write').allOf as Array<{ x?: unknown; 'x-rule'?: string }>;
    expect(writeRules.some((r) => String(r['x-rule'] ?? '').includes('no_retraction'))).toBe(true);
    const wdRules = at('definitions.writeDiscipline').allOf as Array<{ 'x-rule'?: string }>;
    expect(wdRules.some((r) => String(r['x-rule'] ?? '').includes('unscoped_set_based'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PILOT 9 commit 7a (2026-09-04) — `execution.shape` gains "enrich" and the
// ENRICHER profile gains `execution.phases[]` (Spec 122 §1.10 profile table,
// §8 "RE-FREEZE #1").
//
// BOTH DIRECTIONS, and the positive control differs from every negative by
// EXACTLY ONE MUTATION: each negative is the committed ENRICHER exemplar
// (`fixtures/valid/enrich_heritage.descriptor.json`) with a single replaced
// `execution.phases` value, so a difference in outcome can only be that value.
// The AJV path + keyword are pinned per rule — a rule that fires at the wrong
// place is indistinguishable from one that fires by accident (§12b.6).
// ---------------------------------------------------------------------------

describe('execution.shape "enrich" + the ENRICHER execution.phases[] profile (pilot 9)', () => {
  const ENRICHER_EXEMPLAR = path.join(FIXTURES, 'valid', 'enrich_heritage.descriptor.json');

  interface Phase {
    name: string;
    order: number;
    txn: string;
    writes_ref: number;
    scope: string;
    invalidator_ref?: number;
    timeout_minutes_from_config: string;
    [k: string]: unknown;
  }
  const phase = (order: number, extra: Record<string, unknown> = {}): Phase => ({
    name: `p${order}`,
    order,
    txn: 'shared',
    writes_ref: 0,
    scope: 'full',
    timeout_minutes_from_config: 'none',
    ...extra,
  });

  /** The committed ENRICHER exemplar with `execution.phases` replaced — the ONE mutation. */
  function withPhases(phases: unknown): Record<string, unknown> {
    const d = readJson(ENRICHER_EXEMPLAR) as Record<string, unknown>;
    d.execution = { ...(d.execution as Record<string, unknown>), phases };
    return d;
  }
  function omitPhases(): Record<string, unknown> {
    const d = readJson(ENRICHER_EXEMPLAR) as Record<string, unknown>;
    const exec = { ...(d.execution as Record<string, unknown>) };
    delete exec.phases;
    d.execution = exec;
    return d;
  }
  function errorsOf(d: Record<string, unknown>): AjvErrorLike[] {
    expect(validate(d), 'the mutation must make the descriptor INVALID — a fixture that does not fire proves nothing').toBe(false);
    return (validate.errors ?? []) as unknown as AjvErrorLike[];
  }
  function pin(errors: AjvErrorLike[], at: string, keyword: string, param?: [string, unknown]): void {
    const found = errors.find(
      (e) => errPath(e) === at && e.keyword === keyword && (!param || e.params?.[param[0]] === param[1]),
    );
    expect(
      found,
      `expected ${keyword} at "${at}"; got ${errors.map((e) => `${errPath(e)}:${e.keyword}`).join(', ')}`,
    ).toBeDefined();
  }

  it('the x-frozen shape enum carries "link_column" as its 10th value and the node carries an x-ruling (Rule 1 / G-1 ratchet)', () => {
    interface ShapeNode {
      enum?: string[];
      'x-frozen'?: boolean;
      'x-ruling'?: { rungs_tried?: unknown[]; why?: string };
    }
    const shapeNode = (schema.properties as { execution: { properties: { shape: ShapeNode } } }).execution.properties.shape;
    expect(shapeNode.enum).toEqual(['assert', 'ingest', 'link', 'link_column', 'link_keyed', 'cascade', 'materialize', 'backfill', 'recorder', 'enrich']);
    expect(shapeNode['x-frozen'], 'the enum stays frozen — widening it is what costs the re-freeze').toBe(true);
    expect(shapeNode['x-ruling']?.rungs_tried?.length).toBeGreaterThan(0);
    expect((shapeNode['x-ruling']?.why ?? '').length).toBeGreaterThan(0);
  });

  it('GREEN — the committed ENRICHER exemplar (one shared phase) validates', () => {
    expect(validate(readJson(ENRICHER_EXEMPLAR)), JSON.stringify(validate.errors, null, 1)).toBe(true);
  });

  it('GREEN — a 5-phase enrich shape (4 shared + 1 post_commit, LAST) validates: enrich_parcels\'s real structure', () => {
    const d = withPhases([
      phase(1, { name: 'zoning', scope: 'incremental', invalidator_ref: 0 }),
      phase(2, { name: 'max_build', scope: 'incremental', invalidator_ref: 0 }),
      phase(3, { name: 'existing_structure', scope: 'deferred' }),
      phase(4, { name: 'comparable_builds', scope: 'incremental' }),
      phase(5, { name: 'optimal_config', txn: 'post_commit', timeout_minutes_from_config: 'enrich_parcels_pass_statement_timeout_minutes' }),
    ]);
    expect(validate(d), JSON.stringify(validate.errors, null, 1)).toBe(true);
  });

  it('RED — an ENRICHER that omits execution.phases entirely (the §1.10 profile requirement)', () => {
    pin(errorsOf(omitPhases()), '/execution', 'required', ['missingProperty', 'phases']);
  });

  it('RED — a duplicate order (1, 1): the orders_contiguous rule', () => {
    pin(errorsOf(withPhases([phase(1), phase(1)])), '/execution/phases', 'contains');
  });

  it('RED — a gap in order (1, 3): the same rule, so contiguity is not merely uniqueness', () => {
    pin(errorsOf(withPhases([phase(1), phase(3)])), '/execution/phases', 'contains');
  });

  it('RED — two post_commit phases: the post_commit_last rule caps the array at the first one', () => {
    pin(errorsOf(withPhases([phase(1), phase(2, { txn: 'post_commit' }), phase(3, { txn: 'post_commit' })])), '/execution/phases', 'maxItems', ['limit', 2]);
  });

  it('RED — a post_commit phase that is NOT last: a phase after the step\'s own COMMIT cannot be followed by one assuming the txn is open', () => {
    pin(errorsOf(withPhases([phase(1, { txn: 'post_commit' }), phase(2)])), '/execution/phases', 'maxItems', ['limit', 1]);
  });

  it('RED — an unknown key inside a phase: the per-phase shape is CLOSED', () => {
    pin(errorsOf(withPhases([phase(1, { retry_policy: 'x' })])), '/execution/phases/0', 'additionalProperties', ['additionalProperty', 'retry_policy']);
  });

  it('RED — an empty phases[]: an ENRICHER has at least one pass', () => {
    pin(errorsOf(withPhases([])), '/execution/phases', 'minItems');
  });

  it('RED — an illegal txn value: the axis is frozen to shared|post_commit', () => {
    pin(errorsOf(withPhases([phase(1, { txn: 'own_txn' })])), '/execution/phases/0/txn', 'enum');
  });

  it('the other eight profiles are UNAFFECTED — every committed step descriptor still validates, and none of their files changed in this commit beyond the known, declared exceptions (Rule 3/claim #175 probe_presence fleet fix — assert-schema.descriptor.json; WF3 I3a gate_exempt correction — compute-centroids.descriptor.json/refresh-snapshot.descriptor.json, unrelated to any archetype-profile change); enrich_parcels is the ONE ENRICHER, assert_global_coverage/assert_data_bounds/assert_engine_health are the SECOND/THIRD ASSERT-and-RECORDER cutovers (batch1 I2 commit 9 2026-09-13 + batch1 I3 commit 9 2026-09-14 — converted.json at 12 entries; assert_engine_health\'s own descriptor is unchanged this commit — pure cutover, no probe_presence regen, since assert-schema\'s probe list only regenerates when a NEW logic_variables name enters the fleet, and this step\'s 7 vars all landed at commit 7/8)', () => {
    // Pilot 9 commit 8 P8/P9 (2026-09-08) legitimately edits assert-schema.descriptor.json's
    // checks[].expect/config.probe_presence arrays (Rule 3 / claim #175's probe_presence fleet
    // union — a genuine, independent tunable-visibility fix, NOT tied to any archetype-profile
    // change). Pilot 9 commit 9 (2026-09-11) registered enrich_parcels in converted.json and
    // regenerated the same two arrays again (42 → 86 names, R-D three-way lock). Batch1 I1
    // commit 9 (2026-09-12) registered assert_global_coverage and regenerated the same two
    // arrays a third time (86 → 106 names, +20, 0 removed, R-D three-way lock). Batch1 I2
    // commit 9 (2026-09-13) registered assert_data_bounds and regenerated the same two arrays
    // a fourth time (106 → 132 names, +26, 0 removed — all 26 of this step's declared logic
    // vars were net-new to the probe list, since assert_data_bounds was the only consumer and
    // had never itself been a converted[] member before this cutover; measured, not the plan's
    // guessed 106→115 or the brief's guessed 106→124) — the same ONE known, declared exception
    // each time. Narrow the "must be clean" scope to exclude ONLY it; every other converted
    // descriptor (now ten of eleven) remains a byte-identical R-C golden fingerprint.
    const convertedJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json'), 'utf8')) as {
      converted: string[];
      pending?: Array<{ file: string }>;
    };
    const converted = convertedJson.converted;
    // Spec 124 R-AN (batch-2 Phase 0.8, 2026-09-15) — fleet counts are DERIVED,
    // never retyped. This line used to read `.toBe(12)`, hand-edited at every
    // cutover (10 -> 11 at I2, 11 -> 12 at I3) and therefore a second source of
    // truth for a number `converted.json` already owns. The assertion that
    // actually carries weight is the TOTALITY one below: the set of registered
    // descriptors is exactly the set of descriptors on disk (minus the declared
    // `pending` ones), so a descriptor that lands without registration — or a
    // registration with no descriptor — is red, at any fleet size.
    expect(converted.length, 'converted.json is never empty — an empty fleet would make every assertion below vacuous').toBeGreaterThan(0);
    const descriptorsOnDisk: string[] = [];
    (function walk(dir: string) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        // `scripts/surfaces/**` holds the Spec 126/127 SURFACE descriptor family
        // (a different schema, its own registry) — not step descriptors.
        if (ent.name === 'node_modules' || ent.name === '_schema' || ent.name === 'fixtures' || ent.name === 'surfaces') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.endsWith('.descriptor.json')) descriptorsOnDisk.push(path.relative(REPO_ROOT, full).replace(/\\/g, '/'));
      }
    })(path.join(REPO_ROOT, 'scripts'));
    const pendingDescriptors = new Set((convertedJson.pending ?? []).map((p) => p.file.replace(/\\/g, '/').replace(/\.js$/, '.descriptor.json')));
    expect(
      descriptorsOnDisk.filter((d) => !pendingDescriptors.has(d)).sort(),
      'every step descriptor on disk is registered in converted.json (and vice versa) — a descriptor that lands unregistered, or a registration with no descriptor, is a structural defect',
    ).toEqual(converted.map((f) => f.replace(/\\/g, '/').replace(/\.js$/, '.descriptor.json')).sort());
    const KNOWN_CHANGED_THIS_COMMIT = new Set([
      'scripts/quality/assert-schema.descriptor.json', // Rule 3/claim #175 probe_presence fleet fix (R-D three-way lock regen at every cutover)
      // WF3 I3a (2026-09-14, `.cursor/wf3_i3a_infra_step_exemption_active_task.md`) — the §0
      // measured mismatch correction: identity.gate_exempt flipped false -> true on both,
      // matching each slug's own always-true isInfraStep verdict (compute_ prefix /
      // refresh_snapshot name match). A value correction, not an archetype-profile change.
      'scripts/compute-centroids.descriptor.json',
      'scripts/refresh-snapshot.descriptor.json',
      // WF3 EP-PASS3-BACKLOG / EP-PHASE-DEADLINE (2026-09-15,
      // `.cursor/wf3_enrich_parcels_pass3_backlog_active_task.md`) — the ENRICHER's own
      // descriptor gains ONE config tunable (`enrich_parcels_scope_retire_after_hours`,
      // the step-start scope-retirement window; Rule 3 — the bound is an admin logic
      // variable, never a literal) and THREE checks[] rows making that retirement
      // observable (`scope_backlog_at_step_start`, `scope_retired_rows`,
      // `scope_retired_cohorts` — Spec 48 §3.6: a DELETE of 443,023 rows that no row
      // records is invisible). Additive only: no existing check's id, severity, blocking
      // or `when` is touched — in particular `pending_scope_parcels` keeps its WARN /
      // `blocking:false` / `when:"pre_write"` ruling (EP-D14 + R-H/LM-D6, Spec 48 §4.9)
      // unchanged, and the new backlog row deliberately SHARES its bound rather than
      // introducing a second source of truth for the same population.
      'scripts/enrich-parcels.descriptor.json',
      // batch-2 I4 cutover (2026-09-16): link_neighbourhoods's descriptor changes in its
      // OWN cutover commit, and it has to — Rule 11's `order_guarantee.anchor` cited the
      // exact Spec 60 sentence that same commit DELETES (it described the retired `-1`
      // sentinel). `checkOrderGuaranteesCited` resolves an anchor by a whole-file substring
      // test, so the spec amendment and the re-point are inseparable.
      'scripts/link-neighbourhoods.descriptor.json',
      // batch-2 I5 cutover (2026-09-16): geocode_permits is the ENRICHER archetype's SECOND
      // member. Its descriptor lands at the FOLDED commit 5 and is touched again at 7c (the
      // Rule 12 crash posture, measured both ways before it moved) — so it is dirty across
      // this cutover by construction, exactly as link_neighbourhoods was across its own.
      'scripts/geocode-permits.descriptor.json',
    ]);
    const descriptorPaths = converted.map((f) => f.replace(/\.js$/, '.descriptor.json'));
    const enrichers: string[] = [];
    for (const rel of descriptorPaths) {
      const d = readJson(path.join(REPO_ROOT, rel));
      if ((d.identity as { archetype: string }).archetype === 'ENRICHER') enrichers.push(rel);
      expect(validate(d), `${rel}: ${JSON.stringify(validate.errors, null, 1)}`).toBe(true);
    }
    // 1 -> 2 at the batch-2 I5 cutover (2026-09-16). This is the count the ENRICHER profile
    // was waiting for: R-AH/R-PACE-1 eligibility needs `archetype_profiles[ENRICHER].proven`
    // AND >= 2 converted members sharing the archetype, so geocode_permits' registration is
    // what makes the archetype COMPRESSED-ELIGIBLE and turns batch 2's Phase 2 from
    // 1 full + 3 compressed into 4 compressed. The list is pinned rather than counted so a
    // THIRD member still has to come here and say so.
    expect(enrichers, 'exactly three converted ENRICHERs — enrich_parcels (pilot 9 commit 9), geocode_permits (batch-2 I5 commit 9), and enrich_ravines (batch-2 row 2.1 commit 3) — the profile is exercised by REAL descriptors, and the second is what unlocked the compressed form for the archetype (the third rides it)').toEqual(['scripts/enrich-parcels.descriptor.json', 'scripts/geocode-permits.descriptor.json', 'scripts/enrich-ravines.descriptor.json']);
    // Byte-identical, not merely still-valid, for every descriptor EXCEPT the one known,
    // declared exception above — each of the other seven is still an R-C golden fingerprint.
    const unexpectedTargets = descriptorPaths.filter((rel) => !KNOWN_CHANGED_THIS_COMMIT.has(rel));
    const dirty = execFileSync('git', ['status', '--porcelain', '--', ...unexpectedTargets], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    expect(dirty, `converted descriptors changed UNEXPECTEDLY (not the one known, declared exception):\n${dirty}`).toBe('');
  });
});

describe('122-vocabulary.md — generated, gated, and not stale', () => {
  it('the generator refuses to run without its self-test passing', () => {
    const out = execFileSync('node', [GENERATOR, '--self-test'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).toContain('SELF-TEST PASSED');
  });

  it('the committed artifact is up to date (regenerate → identical)', () => {
    expect(fs.existsSync(VOCAB_DOC)).toBe(true);
    let failed = false;
    let output = '';
    try {
      output = execFileSync('node', [GENERATOR, '--check', VOCAB_DOC], { cwd: REPO_ROOT, encoding: 'utf8' });
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(failed, `122-vocabulary.md is stale:\n${output}`).toBe(false);
  });

  it('is generated FROM the schema, not from Spec 120 prose', () => {
    const doc = fs.readFileSync(VOCAB_DOC, 'utf8');
    expect(doc).toContain('scripts/violations/schema-to-vocab.mjs');
    expect(doc).toContain('scripts/steps/_schema/step.schema.json');
    expect(doc).not.toContain('extracted from Spec 120');
  });
});
