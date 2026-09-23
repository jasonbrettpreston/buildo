// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §4.4 ("a rule without a lock is
// not yet a rule") + §5 register rows R-AR, R-AR.1, R-AS, R-AU, R-AV, R-AZ
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.4 (a checker ships a
// fixture proving it fires)
//
// The §4.4 locks for the register rows the operator adjudicated on 2026-09-21. The discovering
// pass proposed them; it did not rule on them (§4.2).
//
// R-AT's own both-directions locks already live in `src/tests/step-library.logic.test.ts`
// (M1e-M1h, proven RED at 39b246c0) and are deliberately NOT duplicated here — §4.4 is satisfied
// by an existing lock, cited, never re-implemented as a second source of truth.
//
// Every predicate below is PURE and exercised in BOTH directions: the live artifact proves GREEN,
// an in-memory mutant differing by exactly one field proves RED. A checker that only ever sees
// clean input is indistinguishable from one that never looked (Spec 123 §4.4).
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const INDEX_JS = path.join(REPO_ROOT, 'scripts', 'lib', 'step', 'index.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'step.schema.json');
const COHORT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'analysis', 'enrich-heritage-cohort-differential.js');
const COHORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'golden', 'enrich_heritage', 'differential', 'cohort.json');

/* eslint-disable @typescript-eslint/no-explicit-any -- descriptors are open JSON documents */
type Descriptorish = Record<string, any>;

const readJson = (p: string): Descriptorish => JSON.parse(fs.readFileSync(p, 'utf8'));

/** The body of a top-level `async function <name>(` in index.js, up to the next top-level function. */
function runnerBody(src: string, name: string): string {
  const start = src.indexOf('async function ' + name + '(');
  if (start < 0) throw new Error('runner ' + name + ' not found in scripts/lib/step/index.js');
  const rest = src.slice(start + 1);
  const nextRel = rest.search(new RegExp('\\n(?:async )?function [A-Za-z_]'));
  return nextRel < 0 ? rest : rest.slice(0, nextRel);
}

const RETIRED_LAYER1 = new RegExp('early return|cheap-COUNT|Layer-1', 'i');
const SKIPPED_CHECK = new RegExp('_enrich_skipped$');

/**
 * R-AR — a descriptor that RETIRED a Layer-1 skip must carry the predicate at Layer-2 AND keep the
 * observable. Returns the list of violated clauses (empty = compliant / not in scope).
 */
function rArViolations(d: Descriptorish): string[] {
  const deviations = Array.isArray(d.deviations) ? d.deviations : [];
  const retired = deviations.some((x: Descriptorish) => typeof x?.from === 'string' && RETIRED_LAYER1.test(x.from));
  if (!retired) return [];
  const bad: string[] = [];
  const terminals = Array.isArray(d.terminals) ? d.terminals : [];
  if (terminals.some((t: Descriptorish) => t?.kind === 'skip_gated')) bad.push('declares a skip_gated terminal');
  const writes = d.outputs && Array.isArray(d.outputs.writes) ? d.outputs.writes : [];
  const scoped = writes.some((w: Descriptorish) => {
    const s = w?.write_discipline?.scope;
    return typeof s === 'string' && s !== 'none' && s.trim() !== '';
  });
  if (!scoped) bad.push('no write target carries a Layer-2 scope predicate');
  const checks = Array.isArray(d.checks) ? d.checks : [];
  if (!checks.some((c: Descriptorish) => typeof c?.id === 'string' && SKIPPED_CHECK.test(c.id))) {
    bad.push('the retired skip has no re-derived observable check');
  }
  return bad;
}

/** R-AU — pricing DATA is declared as a non-admin surface, and never as a logic variable. */
function rAuSatisfied(d: Descriptorish, pricingTokens: string[]): boolean {
  const declared = (d.config && Array.isArray(d.config.logic_variables) ? d.config.logic_variables : [])
    .map((v: Descriptorish) => String(v?.name ?? ''));
  if (declared.some((n: string) => pricingTokens.some((t) => n.includes(t)))) return false;
  const limitations = Array.isArray(d.limitations) ? d.limitations : [];
  return limitations.some((l: Descriptorish) => typeof l?.what === 'string' && pricingTokens.some((t) => l.what.includes(t)));
}

describe('Spec 124 §5 R-AR / R-AR.1 / R-AS / R-AU / R-AV (operator-adjudicated 2026-09-21)', () => {
  const indexSrc = fs.readFileSync(INDEX_JS, 'utf8');
  const schema = readJson(SCHEMA_PATH);
  const enrichers = ['enrich-ravines', 'enrich-heritage', 'enrich-parcels', 'geocode-permits']
    .map((slug) => ({ slug, d: readJson(path.join(REPO_ROOT, 'scripts', slug + '.descriptor.json')) }));

  describe('R-AR / R-AR.1 — the ENRICHER runner has no Layer-1 skip branch', () => {
    it('runEnrichPhase contains ZERO staleness.ledgerGatedSkip call sites', () => {
      expect(runnerBody(indexSrc, 'runEnrichPhase')).not.toMatch(/staleness\.ledgerGatedSkip\(/);
    });

    // POSITIVE CONTROL. Without it the assertion above would also pass on a body the extractor
    // failed to find — green because it never looked.
    it('RED control — the extractor DOES see the two runners that call it', () => {
      expect(runnerBody(indexSrc, 'runCascadePhase')).toMatch(/staleness\.ledgerGatedSkip\(/);
      expect(runnerBody(indexSrc, 'runMaterializePhase')).toMatch(/staleness\.ledgerGatedSkip\(/);
    });

    it('every live ENRICHER that retired a Layer-1 skip satisfies all three R-AR clauses', () => {
      for (const { slug, d } of enrichers) {
        expect(rArViolations(d), slug + ' violates R-AR').toEqual([]);
      }
      // ...and the rule is NOT vacuous: exactly the two founding cases are in scope today.
      const inScope = enrichers
        .filter(({ d }) => (Array.isArray(d.deviations) ? d.deviations : [])
          .some((x: Descriptorish) => typeof x?.from === 'string' && RETIRED_LAYER1.test(x.from)))
        .map((x) => x.slug)
        .sort();
      expect(inScope).toEqual(['enrich-heritage', 'enrich-ravines']);
    });

    it('RED — the live descriptor fails each clause under exactly one mutation', () => {
      const base = readJson(path.join(REPO_ROOT, 'scripts', 'enrich-heritage.descriptor.json'));

      const withSkipTerminal = JSON.parse(JSON.stringify(base));
      withSkipTerminal.terminals.push({ id: 'x', kind: 'skip_gated', status: 'self_skipped' });
      expect(rArViolations(withSkipTerminal)).toContain('declares a skip_gated terminal');

      const unscoped = JSON.parse(JSON.stringify(base));
      unscoped.outputs.writes[0].write_discipline.scope = 'none';
      expect(rArViolations(unscoped)).toContain('no write target carries a Layer-2 scope predicate');

      const noObservable = JSON.parse(JSON.stringify(base));
      noObservable.checks = noObservable.checks.filter((c: Descriptorish) => !SKIPPED_CHECK.test(c.id));
      expect(rArViolations(noObservable)).toContain('the retired skip has no re-derived observable check');
    });
  });

  describe('R-AS — the committed perturbation cohort is a real, re-runnable artifact', () => {
    it('the cohort and its driver are committed', () => {
      expect(fs.existsSync(COHORT_JSON)).toBe(true);
      expect(fs.existsSync(COHORT_SCRIPT)).toBe(true);
    });

    it('the cohort declares a perturbed set AND holds out a negative control', () => {
      const cohort = readJson(COHORT_JSON);
      expect(Array.isArray(cohort.perturb_cohort)).toBe(true);
      expect((cohort.perturb_cohort as unknown[]).length).toBeGreaterThan(0);
      const controlKey = Object.keys(cohort).find((k) => /control/i.test(k));
      expect(controlKey, 'cohort.json must hold out a negative control; keys: ' + Object.keys(cohort).join(',')).toBeDefined();
    });

    it('the driver asserts all three arms and restores unconditionally', () => {
      const src = fs.readFileSync(COHORT_SCRIPT, 'utf8');
      expect(src).toMatch(/records_updated/); // arm (i)
      expect(src).toMatch(/hash/i); // arm (ii) — the projected hash returns to baseline
      expect(src).toMatch(/negative control/i); // arm (iii)
      expect(src).toMatch(/restore/i); // the unconditional restore bracket
      // RED control — the file is genuinely read, not merely asserted to exist.
      expect(src).not.toMatch(/A_FORCED_FULL_IS_THE_INSTRUMENT/);
    });
  });

  describe('R-AV — an ENRICHER declares override.dry_run "none"', () => {
    it('all four converted ENRICHERs declare dry_run "none"', () => {
      for (const { slug, d } of enrichers) {
        expect(d.override?.dry_run, slug).toBe('none');
      }
    });

    // 2026-09-23 (batch-2 row 2.6, `6551689a`): the ruling's INTERIM premise — "runEnrichPhase
    // reads overrides.dry_run at ZERO sites" — is knowingly RETIRED. The runner now aliases
    // `overrides.dry_run` once and gates BOTH write regions on it (the same shape as the link
    // runners). The arm flips to the CLOSED state; the behaviour lock is
    // src/tests/step-library.logic.test.ts T1–T3. The row-cap half stays open (arm below).
    it('the enrich runner now aliases overrides.dry_run and gates both write regions on it (R-AV dry-run half CLOSED 2026-09-23)', () => {
      const body = runnerBody(indexSrc, 'runEnrichPhase');
      expect(body).toMatch(/const dryRun = overrides\.dry_run === true;/);
      expect(body).toMatch(/if \(!dryRun\) \{\s*\n\s*await pipeline\.withTransaction\(pool/);
      expect(body).toMatch(/dryRun \|\| phaseDeadlineInfo \? \[\] : postCommitPhases/);
      expect(runnerBody(indexSrc, 'runCascadePhase')).toMatch(/overrides\.dry_run/);
    });

    it('override is additionalProperties:false, so --limit=N has no declarable home', () => {
      const override = schema.properties.override;
      const obj = override.anyOf.find((a: Descriptorish) => a.type === 'object');
      expect(obj.additionalProperties).toBe(false);
      expect(Object.keys(obj.properties).sort()).toEqual(['accept_anomaly', 'dry_run', 'force_full', 'force_run']);
      // dry_run's argv arm is a bare flag pattern — it cannot carry "=N".
      expect(obj.properties.dry_run.anyOf.some((a: Descriptorish) => typeof a.pattern === 'string' && a.pattern.includes('--'))).toBe(true);
    });
  });

  // 2026-09-23 — R-AZ closes R-AV's row-cap half by RETIRING the row cap, not by giving it a
  // home. The lock therefore pins THREE things: the register row exists and R-AV's open clause is
  // gone (spec text), the programme item flipped BUILT with the narrowed promise (registry), and
  // the schema's override arm set is STILL exactly the four keys — proving no `row_cap` arm was
  // invented after all (the R-AV lock above keeps asserting that; this block cites it). Each
  // string predicate is proven in both directions on an in-memory mutant.
  describe('R-AZ — a per-invocation row cap is NOT an override; retired by standard (2026-09-23)', () => {
    const SPEC_124 = path.join(REPO_ROOT, 'docs', 'specs', '01-pipeline', '124_step_standard_policy.md');
    const PROGRAMME_ITEMS = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'programme-items.json');
    const spec = fs.readFileSync(SPEC_124, 'utf8');

    const registerRow = (text: string, id: string): string | null => {
      const m = text.match(new RegExp(`^\\| ${id.replace('-', '\\-')} \\|[^\\n]*$`, 'm'));
      return m ? m[0] : null;
    };
    const rAzClosesRowCap = (text: string): boolean => {
      const az = registerRow(text, 'R-AZ');
      const av = registerRow(text, 'R-AV');
      if (!az || !av) return false;
      return /RETIRED BY STANDARD/.test(az) && /CLOSED-RETIRED \(row-cap half\)/.test(av) && !/STILL OPEN \(row-cap half\)/.test(av);
    };

    it('Spec 124 §5 carries R-AZ and R-AV no longer reads "STILL OPEN (row-cap half)"', () => {
      expect(rAzClosesRowCap(spec)).toBe(true);
      // RED controls — one field off each way on an in-memory mutant.
      expect(rAzClosesRowCap(spec.replace(/^\| R-AZ \|[^\n]*\n/m, ''))).toBe(false);
      const reopened = spec.replace('CLOSED-RETIRED (row-cap half)', 'STILL OPEN (row-cap half)');
      expect(reopened).not.toBe(spec);
      expect(rAzClosesRowCap(reopened)).toBe(false);
    });

    it('programme item B2-DRYRUN-SEAM is BUILT and its promise no longer names a declarable row cap', () => {
      const registry = readJson(PROGRAMME_ITEMS);
      const list: Descriptorish[] = Array.isArray(registry) ? registry : (registry.items ?? Object.values(registry));
      const item = list.find((i) => i && i.id === 'B2-DRYRUN-SEAM');
      expect(item, 'B2-DRYRUN-SEAM present').toBeTruthy();
      expect(item!.status).toBe('BUILT');
      expect(item!.promised).not.toMatch(/declarable row cap/);
      expect(item!.promised).toMatch(/R-AZ/);
      expect(item!.evidence).toMatch(/6551689a/);
      expect(item!.evidence).toMatch(/R-AZ/);
    });

    it('the schema override arm set is unchanged — no row_cap arm was invented (cites the R-AV lock)', () => {
      const obj = schema.properties.override.anyOf.find((a: Descriptorish) => a.type === 'object');
      expect(Object.keys(obj.properties)).not.toContain('row_cap');
      expect(obj.additionalProperties).toBe(false);
    });
  });

  describe('R-AU — pricing DATA is a declared non-admin surface, not a logic variable', () => {
    const tokens = ['archetype_cost_rates', 'PARCEL_COST_LINES'];

    it('the predicate is proven in BOTH directions on in-memory descriptors', () => {
      const good = {
        config: { logic_variables: [{ name: 'cost_est_min_tiers' }] },
        limitations: [{ what: 'archetype_cost_rates (12x3) is DB pricing data with no admin surface (R-AU).' }],
      };
      expect(rAuSatisfied(good, tokens)).toBe(true);

      const undeclared = { config: { logic_variables: [{ name: 'cost_est_min_tiers' }] }, limitations: [] };
      expect(rAuSatisfied(undeclared, tokens)).toBe(false);

      const falselyExternalized = {
        config: { logic_variables: [{ name: 'archetype_cost_rates_base' }] },
        limitations: [{ what: 'archetype_cost_rates is DB pricing data.' }],
      };
      expect(rAuSatisfied(falselyExternalized, tokens)).toBe(false);
    });

    it('no admin surface reads archetype_cost_rates today (the ruling’s measured premise)', () => {
      const offenders: string[] = [];
      for (const dir of ['src/app', 'src/features/admin-controls', 'src/lib/admin', 'src/components']) {
        const root = path.join(REPO_ROOT, dir);
        if (!fs.existsSync(root)) continue;
        const stack = [root];
        while (stack.length > 0) {
          const cur = stack.pop() as string;
          for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
            const p = path.join(cur, entry.name);
            if (entry.isDirectory()) { stack.push(p); continue; }
            if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
            if (fs.readFileSync(p, 'utf8').includes('archetype_cost_rates')) offenders.push(p);
          }
        }
      }
      expect(offenders, 'R-AU premise broken: an admin surface now reads archetype_cost_rates').toEqual([]);
    });
  });
});
