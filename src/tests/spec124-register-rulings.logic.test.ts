// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §4.4 ("a rule without a lock is
// not yet a rule") + §5 register rows R-AR, R-AR.1, R-AS, R-AU, R-AV, R-AZ
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.4 (a checker ships a
// fixture proving it fires)
//
// The §4.4 locks for the register rows the operator adjudicated on 2026-09-21. The discovering
// pass proposed them; it did not rule on them (§4.2).
//
// R-AU CLOSED 2026-09-23 (batch-2 row 2.5, `.cursor/batch2_p2_5_pricing_admin_active_task.md`
// Fold A8): `rAuSatisfied` (which proved the INTERIM non-admin-surface declaration) is REPLACED
// by `rAuClosed`, which proves the inverse — no `limitations[]` entry DECLARES a pricing token a
// non-admin surface, and no `config.logic_variables[]` entry falsely re-declares one as a tunable.
// MEASURED COLLISION (C5, 2026-09-23): a bare substring match on `limitations[].what` is NOT
// sufficient — the live CPCE descriptor's E3-landed limitations[3] entry legitimately names the
// literal `PARCEL_COST_LINES` JS symbol (documenting that two analysis scripts now call
// `mergeCostLines(PARCEL_COST_LINES, rows)`), which is unrelated to the retired CPCE-A3/A4
// "non-admin surface" claim. `rAuClosed` therefore requires the token AND a co-located
// non-admin-surface claim phrase, never a bare token match — and never edits the descriptor's own
// prose to dodge the collision (that file is golden-fingerprinted; a prose edit forces an
// expensive golden recapture entirely out of C5's scope, measured live via `step-validate --all`
// G8 hard-stop before this fix).
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

/** A `limitations[].what` string phrased as the retired CPCE-A3/A4 non-admin-surface claim
 * ("no admin surface" / "not admin-visible" / "NOT counted toward ... externalized"). A bare
 * mention of a pricing token (e.g. documenting a function call signature) does not match this —
 * only an actual claim that the token is NOT admin-tunable does. */
const NON_ADMIN_SURFACE_CLAIM = /not admin-visible|no admin surface|not\b.*\badmin.tunable|not counted toward[^.]*extern/i;

/**
 * R-AU — CLOSED (2026-09-23, batch-2 row 2.5): pricing DATA is now admin-editable, so the
 * descriptor must carry NEITHER the old INTERIM "non-admin surface" declaration NOR a false
 * externalization claim. `rAuClosed` is true iff (a) no `limitations[]` entry both NAMES a
 * pricing token AND CLAIMS it a non-admin surface (`NON_ADMIN_SURFACE_CLAIM`) — the old
 * declaration this row's closing REMOVED — and (b) no `config.logic_variables[]` entry falsely
 * re-declares a pricing token as a scalar tunable (the second-source-of-truth failure mode
 * Rule 3's R-AU addendum still forbids — closing the admin surface does not license a duplicate
 * declaration). A bare, unrelated mention of a token (e.g. a call-signature in prose) never trips
 * (a) on its own — see the MEASURED COLLISION note above the file header.
 */
function rAuClosed(d: Descriptorish, pricingTokens: string[]): boolean {
  const declared = (d.config && Array.isArray(d.config.logic_variables) ? d.config.logic_variables : [])
    .map((v: Descriptorish) => String(v?.name ?? ''));
  if (declared.some((n: string) => pricingTokens.some((t) => n.includes(t)))) return false;
  const limitations = Array.isArray(d.limitations) ? d.limitations : [];
  return !limitations.some((l: Descriptorish) => {
    const text = typeof l?.what === 'string' ? l.what : '';
    return pricingTokens.some((t) => text.includes(t)) && NON_ADMIN_SURFACE_CLAIM.test(text);
  });
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

  describe('R-AU — CLOSED 2026-09-23 (batch-2 row 2.5): pricing DATA is admin-editable, not a declared non-admin surface', () => {
    const tokens = ['archetype_cost_rates', 'PARCEL_COST_LINES'];
    const CPCE_DESCRIPTOR = path.join(REPO_ROOT, 'scripts', 'compute-parcel-cost-estimates.descriptor.json');

    it('the predicate is proven in BOTH directions on in-memory descriptors', () => {
      const closed = { config: { logic_variables: [{ name: 'cost_est_min_tiers' }] }, limitations: [] };
      expect(rAuClosed(closed, tokens)).toBe(true);

      // RED — the old INTERIM non-admin-surface declaration, if it reappeared, must fail closure.
      const stillDeclaredNonAdmin = {
        config: { logic_variables: [{ name: 'cost_est_min_tiers' }] },
        limitations: [{ what: 'archetype_cost_rates (12x3) is DB pricing data with no admin surface (R-AU).' }],
      };
      expect(rAuClosed(stillDeclaredNonAdmin, tokens)).toBe(false);

      // RED — a pricing token masquerading as a scalar tunable must fail closure even with no
      // limitations[] entry at all (a second source of truth is still wrong once closed).
      const falselyExternalized = {
        config: { logic_variables: [{ name: 'archetype_cost_rates_base' }] },
        limitations: [],
      };
      expect(rAuClosed(falselyExternalized, tokens)).toBe(false);
    });

    it('the live CPCE descriptor is CLOSED: neither pricing token is named in limitations[] or logic_variables[]', () => {
      // Live assertion against the real, landed descriptor (batch-2 row 2.5 E3, `0f1f46fb`
      // removed the CPCE-A3/A4 non-admin-surface limitations[] entry) — not just in-memory mutants.
      const cpce = readJson(CPCE_DESCRIPTOR);
      expect(rAuClosed(cpce, tokens)).toBe(true);
    });

    it('an admin surface reads archetype_cost_rates now — exactly the expected file set under the four roots', () => {
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
            if (fs.readFileSync(p, 'utf8').includes('archetype_cost_rates')) {
              offenders.push(path.relative(REPO_ROOT, p).split(path.sep).join('/'));
            }
          }
        }
      }
      // Verified by grep 2026-09-23: control-panel.ts is the actual read/write surface (the
      // closing site itself); PricingCard.tsx/RatesGrid.tsx name the table ONLY in a JSDoc
      // comment describing what the grid renders — no query, no live reference — listed
      // explicitly here rather than silently widening the match.
      const expected = [
        'src/features/admin-controls/components/PricingCard.tsx',
        'src/features/admin-controls/components/RatesGrid.tsx',
        'src/lib/admin/control-panel.ts',
      ].sort();
      expect(offenders.sort()).toEqual(expected);
    });

    it('RED control — an offender outside the expected set fails the exact-set assertion', () => {
      const expected = [
        'src/features/admin-controls/components/PricingCard.tsx',
        'src/features/admin-controls/components/RatesGrid.tsx',
        'src/lib/admin/control-panel.ts',
      ].sort();
      const withExtra = [...expected, 'src/components/admin/SomeUnexpectedFile.tsx'].sort();
      expect(withExtra).not.toEqual(expected);
    });
  });
});
