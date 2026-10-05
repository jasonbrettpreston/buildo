// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (a pct check reports
//            the measured RATIO, never a 0/1 flag)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 10 (the verdict is ROW-derived:
//            the bound a descriptor declares is the bound the row's status is computed from)
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md (checks table — skip_rate_pct,
//            null_address_number_pct)
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (checks table — skip_rate_pct,
//            null_address_pct)
//
// WF3 — the red-first lock for the `pct`-flag class. `verdict.js`(evaluateLimit) compares a pct
// bound against `observation.violations` FIRST and only falls back to `observation.value`. A
// compute that reports a `pct <= N` check as a 0/1 flag therefore compares 0-or-1 to N (5, 10),
// which is PASS on every possible input — a declared FAIL check that can never FAIL, while the row
// renders the real ratio through `detail` and looks healthy. This file drives the REAL descriptor
// check + the REAL compute + the REAL verdict.checkRow (the seam every existing per-compute test
// skipped: they asserted the flag in isolation, never the row).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS verdict library
const verdict = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js'));

const SEED_REL = 'scripts/seeds/logic_variables.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

const STEPS = {
  address_points: {
    descriptor: 'scripts/load-address-points.descriptor.json',
    compute: 'scripts/lib/compute/load-address-points.js',
  },
  parcels: {
    descriptor: 'scripts/load-parcels.descriptor.json',
    compute: 'scripts/lib/compute/load-parcels.js',
  },
} as const;

type StepName = keyof typeof STEPS;

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

interface Observation {
  value?: number;
  violations?: number;
  detail?: unknown;
  error?: unknown;
}

interface CheckDef {
  id: string;
  limit?: string | { warn: number; fail: number };
  warn_limit?: string;
  limit_from_config?: string;
  severity: string;
  [k: string]: unknown;
}

interface Descriptor {
  identity: { name: string };
  checks: CheckDef[];
  execution: { on_check_error: string };
}

interface ComputeModule {
  checks: Record<string, (ctx: unknown) => unknown>;
}

/** `scripts/seeds/logic_variables.json[key].default` — the registered bound in force. */
function seed(key: string): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real seed file
  const seeds = require(abs(SEED_REL)) as Record<string, { default: number }>;
  const entry = seeds[key];
  if (!entry) throw new Error(`seed ${key} is not registered in ${SEED_REL}`);
  return entry.default;
}

function loadDescriptor(step: StepName): Descriptor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real step descriptor
  return require(abs(STEPS[step].descriptor)) as Descriptor;
}

function loadCompute(step: StepName): ComputeModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute module
  return require(abs(STEPS[step].compute)) as ComputeModule;
}

function findCheck(step: StepName, checkId: string): CheckDef {
  const descriptor = loadDescriptor(step);
  const check = descriptor.checks.find((c) => c.id === checkId);
  expect(check, `${step} descriptor declares no check "${checkId}"`).toBeDefined();
  return check as CheckDef;
}

/**
 * Drive one declared check of one step through the REAL compute and the REAL verdict row builder.
 * `config` starts from the check's own registered variable (Rule 3: the bound in force is the
 * seeded one, never a literal here) and takes any `override` on top (the variable-scale lock).
 */
function row(
  step: StepName,
  checkId: string,
  acquired: Record<string, unknown>,
  override: Record<string, number> = {},
): { obs: Observation; row: { metric: string; value: unknown; threshold: string; status: string } } {
  const descriptor = loadDescriptor(step);
  const check = findCheck(step, checkId);
  const compute = loadCompute(step);
  let obs: Observation = {};
  const config: Record<string, number> = {};
  if (check.limit_from_config) config[check.limit_from_config] = seed(check.limit_from_config);
  Object.assign(config, override);
  const fn = compute.checks[checkId];
  expect(typeof fn, `${step} compute has no check "${checkId}"`).toBe('function');
  (fn as (ctx: unknown) => unknown)({
    acquired,
    config,
    descriptor,
    log: { error() {}, warn() {} },
    report: (_id: string, o: Observation) => {
      obs = o;
    },
  });
  return { obs, row: verdict.checkRow(check, obs, descriptor.execution.on_check_error, config) };
}

describe('WF3 pct checks — the reported ratio, not a flag (Spec 122 §5.5, 124 Rule 10)', () => {
  describe('skip_rate_pct can actually FAIL (address_points + parcels)', () => {
    it.each<[StepName, number]>([
      ['address_points', 5],
      ['parcels', 10],
    ])('%s: a 50%% skip rate FAILs (RED today: the 0/1 flag compares <= %d)', (step, bound) => {
      const { row: r } = row(step, 'skip_rate_pct', { rows_read: 1000, records_skipped: 500 });
      expect(r.threshold).toBe(`pct <= ${bound}`);
      expect(r.status).toBe('FAIL');
    });

    it.each<[StepName]>([['address_points'], ['parcels']])(
      '%s: 1000 rows / 6 skipped = 0.6%% PASSes (well under the bound)',
      (step) => {
        const { row: r } = row(step, 'skip_rate_pct', { rows_read: 1000, records_skipped: 6 });
        expect(r.status).toBe('PASS');
      },
    );

    // Declared boundary delta: the pct grammar is `<=` (no strict form). At EXACTLY the bound the
    // check PASSes — legacy used `>=` for FAIL. Locked here so the delta is deliberate, not drift.
    it.each<[StepName, number, number]>([
      ['address_points', 1000, 50],
      ['parcels', 1000, 100],
    ])('%s: exactly at the bound (%d/%d) PASSes (the pct grammar is <=)', (step, rows, skipped) => {
      const { row: r } = row(step, 'skip_rate_pct', { rows_read: rows, records_skipped: skipped });
      expect(r.status).toBe('PASS');
    });

    it('renders the measured ratio through the row (50% skip -> row.value 50)', () => {
      const { obs, row: r } = row('address_points', 'skip_rate_pct', { rows_read: 1000, records_skipped: 500 });
      expect(r.value).toBe(obs.detail);
      expect(r.value).toBe(50);
    });
  });

  describe('null_address_*_pct report the RAW FRACTION (0–1), same shape', () => {
    // STATUS locks, GREEN before the fix too: the compute's own 0/1 flag compared the fraction to
    // the same registered variable, and a flag of 1 exceeds any bound < 1. The shape change (value,
    // no violations) is asserted in the 'observation shape' block below.
    it.each<[StepName, string]>([
      ['address_points', 'null_address_number_pct'],
      ['parcels', 'null_address_pct'],
    ])('%s: %s is WARN at a 100%% null fraction', (step, checkId) => {
      const { row: r } = row(step, checkId, {
        rows_shaped: 1000,
        column_nulls: { address_number: 1000 },
      });
      expect(r.status).toBe('WARN');
    });

    it.each<[StepName, string]>([
      ['address_points', 'null_address_number_pct'],
      ['parcels', 'null_address_pct'],
    ])('%s: %s is PASS at a 5%% null fraction', (step, checkId) => {
      const { row: r } = row(step, checkId, {
        rows_shaped: 1000,
        column_nulls: { address_number: 50 },
      });
      expect(r.status).toBe('PASS');
    });

    // Variable-scale lock: the bound is read on the RAW FRACTION scale. Move the registered variable
    // to 0.5 and the status must MOVE WITH IT — 0.6 WARNs, 0.4 PASSes. These STATUSES are green
    // before the fix too (the compute's own flag compared the fraction to the same variable); the
    // red here is the observation shape only.
    it.each<[StepName, string]>([
      ['address_points', 'null_address_number_pct'],
      ['parcels', 'null_address_pct'],
    ])('%s: %s WARNs at 0.6 against a 0.5 variable', (step, checkId) => {
      const check = findCheck(step, checkId);
      const varName = check.limit_from_config as string;
      const { row: r } = row(
        step,
        checkId,
        { rows_shaped: 1000, column_nulls: { address_number: 600 } },
        { [varName]: 0.5 },
      );
      expect(r.status).toBe('WARN');
    });

    it.each<[StepName, string]>([
      ['address_points', 'null_address_number_pct'],
      ['parcels', 'null_address_pct'],
    ])('%s: %s PASSes at 0.4 against a 0.5 variable', (step, checkId) => {
      const check = findCheck(step, checkId);
      const varName = check.limit_from_config as string;
      const { row: r } = row(
        step,
        checkId,
        { rows_shaped: 1000, column_nulls: { address_number: 400 } },
        { [varName]: 0.5 },
      );
      expect(r.status).toBe('PASS');
    });
  });

  // The observation SHAPE, separated from the status tests above so the committed red evidence
  // shows which BEHAVIOUR was red (only the 50% skip-rate FAIL) and which failures are the
  // contract alone: a pct check reports the measured ratio as `value` on its variable's own
  // scale, and no `violations` key (evaluateLimit would otherwise compare the flag).
  describe('observation shape — value on the variable scale, no violations key', () => {
    it.each<[StepName, string, number, Record<string, unknown>]>([
      ['address_points', 'skip_rate_pct', 50, { rows_read: 1000, records_skipped: 500 }],
      ['parcels', 'skip_rate_pct', 50, { rows_read: 1000, records_skipped: 500 }],
      ['address_points', 'skip_rate_pct', 5, { rows_read: 1000, records_skipped: 50 }],
      ['parcels', 'skip_rate_pct', 10, { rows_read: 1000, records_skipped: 100 }],
      ['address_points', 'null_address_number_pct', 1, { rows_shaped: 1000, column_nulls: { address_number: 1000 } }],
      ['parcels', 'null_address_pct', 1, { rows_shaped: 1000, column_nulls: { address_number: 1000 } }],
      ['address_points', 'null_address_number_pct', 0.4, { rows_shaped: 1000, column_nulls: { address_number: 400 } }],
      ['parcels', 'null_address_pct', 0.4, { rows_shaped: 1000, column_nulls: { address_number: 400 } }],
    ])('%s: %s reports value %s', (step, checkId, expected, acquired) => {
      const { obs } = row(step, checkId, acquired);
      expect(obs.violations).toBeUndefined();
      expect(obs.value).toBe(expected);
    });

    it.each<[StepName]>([['address_points'], ['parcels']])('%s: skip_rate_pct 6/1000 reports value 0.6', (step) => {
      const { obs } = row(step, 'skip_rate_pct', { rows_read: 1000, records_skipped: 6 });
      expect(obs.violations).toBeUndefined();
      expect(obs.value).toBeCloseTo(0.6, 10);
    });
  });

  describe('empty acquired is PASS-SAFE (value 0, detail null)', () => {
    it.each<[StepName, string]>([
      ['address_points', 'skip_rate_pct'],
      ['address_points', 'null_address_number_pct'],
      ['parcels', 'skip_rate_pct'],
      ['parcels', 'null_address_pct'],
    ])('%s: %s on {} reports {value:0, detail:null} and PASSes', (step, checkId) => {
      const { obs, row: r } = row(step, checkId, {});
      expect(obs).toEqual({ value: 0, detail: null });
      expect(r.status).toBe('PASS');
    });
  });
});

/**
 * Class lock over the whole converted fleet (Spec 122 §5.5): no `pct`-bounded check may report a
 * flag. RED today on exactly the four checks in the WF3 assessment §2.
 */
describe('class lock — every pct-bounded check reports a value, never a flag', () => {
  interface FleetCheck {
    step: string;
    stepName: string;
    check: CheckDef;
    computeRel: string;
  }

  function fleetChecks(): FleetCheck[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real converted registry
    const { converted } = require(abs(CONVERTED_REL)) as { converted: string[] };
    const out: FleetCheck[] = [];
    for (const stepRel of converted) {
      const descriptorRel = stepRel.replace(/\.js$/, '.descriptor.json');
      if (!fs.existsSync(abs(descriptorRel))) continue;
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real step descriptor
      const descriptor = require(abs(descriptorRel)) as Descriptor;
      const computeRel = `scripts/lib/compute/${path.basename(stepRel)}`;
      const stepName = descriptor.identity?.name ?? path.basename(stepRel, '.js');
      for (const check of descriptor.checks || []) {
        const isPct = (v: unknown) => typeof v === 'string' && v.startsWith('pct ');
        if (isPct(check.limit) || isPct(check.warn_limit)) {
          out.push({ step: stepRel, stepName, check, computeRel });
        }
      }
    }
    return out;
  }

  /**
   * Index of the matching close for the bracket at `open` in `text`. Skips nothing fancy — strings
   * are not parsed — which is safe here because these compute sources carry no braces inside the
   * literal object bodies this walks.
   */
  function matchBrace(text: string, open: number): number {
    const stack: string[] = [];
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ')' || ch === ']') {
        stack.pop();
        if (stack.length === 0) return i;
      }
    }
    return -1;
  }

  /**
   * EVERY `{…}` object literal reported for `checkId` via `ctx.report('<id>', {` — a check
   * reports from more than one site (the short-circuit AND the measured path), and each one is a
   * shape the verdict reads. Empty when the check is never reported through a literal.
   */
  function reportLiterals(source: string, checkId: string): string[] {
    const escaped = checkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`ctx\\.report\\(\\s*['"]${escaped}['"]\\s*,\\s*\\{`, 'g');
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = matchBrace(source, open);
      out.push(close === -1 ? '' : source.slice(open, close + 1));
    }
    return out;
  }

  /** The evaluator-name map from a compute source's `const EVALUATORS = {…}` literal. */
  function evaluatorMap(source: string): Record<string, string> {
    const at = source.indexOf('const EVALUATORS = {');
    if (at === -1) return {};
    const open = source.indexOf('{', at);
    const close = matchBrace(source, open);
    const body = source.slice(open + 1, close);
    const out: Record<string, string> = {};
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_]+)\s*,?\s*$/);
      if (m && m[1] && m[2]) out[m[1]] = m[2];
    }
    return out;
  }

  /** The body of `async function <name>(` in a compute source, brace-matched, or null. */
  function evaluatorBody(source: string, name: string): string | null {
    const at = source.indexOf(`async function ${name}(`);
    if (at === -1) return null;
    const open = source.indexOf('{', at);
    const close = matchBrace(source, open);
    return close === -1 ? null : source.slice(open, close + 1);
  }

  /** The body of a NON-async `function <name>(` in a compute source, brace-matched, or null. */
  function functionBody(source: string, name: string): string | null {
    const at = source.indexOf(`function ${name}(`);
    if (at === -1) return null;
    const open = source.indexOf('{', at);
    const close = matchBrace(source, open);
    return close === -1 ? null : source.slice(open, close + 1);
  }

  /**
   * HELPER form (enrich_centreline, converted 2026-10-04 834991c0): the check function is
   * `function <id>(ctx) { [return] <helper>(ctx, '<id>'); }`. Returns the helper body PLUS the bodies
   * of every helper it delegates to with `return <fn>(ctx, id)` (one level), or null when the check
   * is not in this form or any body cannot be found (the caller then fails closed).
   */
  function helperBodies(source: string, checkId: string): string[] | null {
    const escaped = checkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const own = functionBody(source, checkId);
    if (!own) return null;
    const call = own.match(new RegExp(`^\\{\\s*(?:return\\s+)?([A-Za-z0-9_]+)\\(\\s*ctx\\s*,\\s*['"]${escaped}['"]\\s*\\);?\\s*\\}$`));
    if (!call || !call[1]) return null;
    const helper = functionBody(source, call[1]);
    if (!helper) return null;
    const bodies = [helper];
    for (const d of helper.matchAll(/return\s+([A-Za-z0-9_]+)\(\s*ctx\s*,\s*id\s*\)/g)) {
      const delegate = d[1] ? functionBody(source, d[1]) : null;
      if (!delegate) return null;
      bodies.push(delegate);
    }
    return bodies;
  }

  it('finds at least 150 pct-bounded checks (anti-vacuous)', () => {
    expect(fleetChecks().length).toBeGreaterThanOrEqual(150);
  });

  it('no pct-bounded check reports violations() instead of value()', () => {
    const offenders: string[] = [];
    for (const { step, stepName, check, computeRel } of fleetChecks()) {
      const source = fs.readFileSync(abs(computeRel), 'utf8');
      const literals = reportLiterals(source, check.id);

      if (literals.length > 0) {
        // LITERAL: every direct `ctx.report('<id>', {…})` site in the compute source must report
        // `value:` and none may report `violations:` (evaluateLimit prefers the flag).
        // ES shorthand { value, … } is the same property as value: (load_wsib, converted 2026-10-01 bd01e07a).
        if (literals.some((l) => /\bviolations\s*:/.test(l) || !/\bvalue\s*(:|,|\})/.test(l))) {
          offenders.push(`${stepName}:${check.id}`);
        }
        continue;
      }

      // HELPER: `function <id>(ctx) { <helper>(ctx, '<id>') }` — every report literal inside the helper
      // (and its one-level `return <fn>(ctx, id)` delegates) must report `value` and never `violations`.
      const helpers = helperBodies(source, check.id);
      if (helpers) {
        const reports = helpers.flatMap((b) => {
          const re = /ctx\.report\(\s*[A-Za-z0-9_'"]+\s*,\s*\{/g;
          const found: string[] = [];
          let hm: RegExpExecArray | null;
          while ((hm = re.exec(b)) !== null) {
            const open = hm.index + hm[0].length - 1;
            const close = matchBrace(b, open);
            found.push(close === -1 ? '' : b.slice(open, close + 1));
          }
          return found;
        });
        if (reports.length === 0 || reports.some((l) => /\bviolations\s*:/.test(l) || !/\bvalue\s*(:|,|\})/.test(l))) {
          offenders.push(`${stepName}:${check.id}`);
        }
        continue;
      }

      // LOOP: reported through a shared evaluator table (assert-data-bounds / assert-global-coverage).
      const base = path.basename(step, '.js');
      let key: string | undefined;
      if (base === 'assert-data-bounds') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real field defs
        const { CHECK_DEFS } = require(abs('scripts/lib/assert-data-bounds-fields.js')) as {
          CHECK_DEFS: Array<{ id: string; kind: string }>;
        };
        key = CHECK_DEFS.find((d) => d.id === check.id)?.kind;
      } else if (base === 'assert-global-coverage') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real field defs
        const { CHECK_DEFS } = require(abs('scripts/lib/assert-global-coverage-fields.js')) as {
          CHECK_DEFS: Array<{ id: string; builder: string }>;
        };
        key = CHECK_DEFS.find((d) => d.id === check.id)?.builder;
      }
      if (!key) {
        // Neither a literal nor a known evaluator table — FAIL CLOSED, naming the check.
        offenders.push(`${stepName}:${check.id} (unresolvable)`);
        continue;
      }
      const name = evaluatorMap(source)[key];
      const body = name ? evaluatorBody(source, name) : null;
      if (!body) {
        offenders.push(`${stepName}:${check.id} (unresolvable evaluator ${key})`);
        continue;
      }
      // ES shorthand { value, … } is the same property as value: (load_wsib, converted 2026-10-01 bd01e07a).
      if (/\bviolations\s*:/.test(body) || !/\bvalue\s*(:|,|\})/.test(body)) offenders.push(`${stepName}:${check.id}`);
    }
    expect(offenders, `pct-bounded checks reporting a 0/1 flag: ${offenders.join(', ')}`).toEqual([]);
  });

  // GREEN control (2026-10-01 bd01e07a): the shorthand-tolerant predicate accepts both the
  // ES shorthand and the explicit `value:` form, and still rejects a `violations:` flag or a
  // report literal with no `value` at all. Mirrors the two predicates above (literal + body).
  it('the value predicate accepts ES shorthand { value, … } and value: v, and rejects violations:/detail-only', () => {
    const offender = (l: string) => /\bviolations\s*:/.test(l) || !/\bvalue\s*(:|,|\})/.test(l);
    expect(offender('ctx.report("id", { value, detail: x })')).toBe(false);
    expect(offender('ctx.report("id", { value: v })')).toBe(false);
    expect(offender('ctx.report("id", { violations: 1, value: 0 })')).toBe(true);
    expect(offender('ctx.report("id", { detail: 1 })')).toBe(true);
  });

  // HELPER-form controls (2026-10-04): a helper that reports value resolves GREEN; a helper that
  // reports a violations flag is an offender; a check function that is not a bare helper call is
  // not this form (null -> the caller fails closed).
  it('the helper form resolves value-reporting helpers and rejects a violations helper', () => {
    const good = [
      "function reportGradedPct(ctx, id) { const value = (ctx.matched || {})[id]; if (value === undefined) return reportNotMeasured(ctx, id); return ctx.report(id, { value }); }",
      "function reportNotMeasured(ctx, id) { ctx.report(id, { value: 0, inert: true, detail: 'x' }); }",
      "function some_pct(ctx) { reportGradedPct(ctx, 'some_pct'); }",
    ].join('\n');
    expect(helperBodies(good, 'some_pct')).toHaveLength(2);
    const bad = [
      "function reportFlag(ctx, id) { return ctx.report(id, { violations: 1, value: 0 }); }",
      "function some_pct(ctx) { reportFlag(ctx, 'some_pct'); }",
    ].join('\n');
    const bodies = helperBodies(bad, 'some_pct');
    expect(bodies).not.toBeNull();
    expect(bodies!.some((b) => /\bviolations\s*:/.test(b))).toBe(true);
    expect(helperBodies("function some_pct(ctx) { const v = 1; reportGradedPct(ctx, 'some_pct'); }", 'some_pct')).toBeNull();
  });
});
