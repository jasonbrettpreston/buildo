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
];

describe('step.schema.json — the canonical vocabulary (Spec 122 S1)', () => {
  it('compiles under AJV', () => {
    expect(typeof validate).toBe('function');
  });

  it('declares 18 categories, every one of them required', () => {
    const cats = schema['x-categories'] as string[];
    const required = schema.required as string[];
    expect(cats).toHaveLength(18);
    expect(cats).toContain('terminals');
    for (const c of cats) expect(required, `${c} must be required — omission is a build failure`).toContain(c);
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
    expect(vacuumRule?.then?.properties?.txn_scope?.enum, 'a step-scoped txn cannot contain a VACUUM').not.toContain('step');
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

  it('the 13 write-discipline classes are frozen as MECHANICS (V7)', () => {
    const cls = at('definitions.writeDiscipline.properties.class');
    expect((cls.enum as string[])).toHaveLength(13);
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
    expect((cls.enum as string[])).toHaveLength(13);
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
