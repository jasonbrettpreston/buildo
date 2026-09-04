// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (seams, G2' precursor)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 7 — descriptor +
//   compute verbatim)
//
// Pilot 9 commit 7c — the SQL byte-verbatim lock. Renders every SQL-builder function pair (legacy
// scripts/enrich-parcels.js vs the new scripts/lib/compute/enrich-parcels.js) with EQUIVALENT inputs
// (the compute-side config values set to the exact legacy hardcoded defaults, confirmed against
// scripts/seeds/logic_variables.json), then asserts the rendered SQL strings are IDENTICAL after
// stripping `--` comments and collapsing whitespace — comments/prose are allowed to differ (the compute
// port rewrites narrative comments to explain the seam), but the executable SQL text may not.
//
// The ONE declared exception (Fold G3, Spec 122 §5.5 MANDATORY) is pass 4's comps window: legacy emits
// a bare `now()::date - interval '5 years'`; compute emits a bound `$1::date - (5 * interval '1 year')`
// (ctx.clock.asOfDate() + the newly-externalized enrich_parcels_comps_window_years). Both sides are
// normalised to a single `<CLOCK_WINDOW>` token before comparison — the ONLY normalisation this file
// performs; every other builder must render BYTE-IDENTICAL SQL with zero normalisation.
//
// RED-first proof (Spec 123 §4.1 kill-set equality): this file's own git history carries the
// introduce-a-one-char-diff / revert cycle in its commit message (pilot 9 commit 7c) — verified live
// this session by temporarily perturbing scripts/lib/compute/enrich-parcels.js's buildUpdateSql()
// zoning_enriched_at column name, observing every lock below fail, then reverting.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const LEGACY_REL = 'scripts/enrich-parcels.js';
const COMPUTE_REL = 'scripts/lib/compute/enrich-parcels.js';

type Fn = (...args: unknown[]) => unknown;
interface LegacyModule {
  buildUpdateSql: Fn;
  buildEnrichmentSql: Fn;
  buildMassingScopeWhere: Fn;
  buildMaxBuildSql: Fn;
  buildMaxBuildUpdateSql: Fn;
  buildMassingStampSql: Fn;
  buildExistingStructureSql: Fn;
  buildExistingStructureUpdateSql: Fn;
  buildScenarioUpdateSql: Fn;
  buildDecisionScopeWhere: Fn;
  buildCompCandidatesSql: Fn;
  buildComparableBuildsUpdateSql: Fn;
  buildOptConfigSelectSql: Fn;
}
interface ComputeModule extends LegacyModule {
  buildPass1ScopeWhere: Fn;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS modules
const legacy = require(path.join(REPO_ROOT, LEGACY_REL)) as unknown as LegacyModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS modules
const compute = require(path.join(REPO_ROOT, COMPUTE_REL)) as unknown as ComputeModule;

/** Strip `--` line comments and collapse all whitespace runs to a single space. */
function normalize(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The ONE declared clock-seam normalisation (Fold G3) — both forms collapse to one token. */
function normalizeClockWindow(sql: string): string {
  return normalize(sql)
    .replace(/now\(\)::date\s*-\s*interval\s*'5\s*years'/gi, '<CLOCK_WINDOW>')
    .replace(/\$1::date\s*-\s*\(\s*5\s*\*\s*interval\s*'1\s*year'\s*\)/gi, '<CLOCK_WINDOW>');
}

function readLegacySource(): string {
  return fs.readFileSync(path.join(REPO_ROOT, LEGACY_REL), 'utf8').replace(/\r\n/g, '\n');
}

/** Extract a top-level `function name(...) { ... }` body via brace-balancing (buildPass1ScopeWhere is
 *  the one builder this file needs source-text extraction for — it is not exported by the legacy module). */
function extractFunctionSource(src: string, fnName: string): string {
  const anchor = `function ${fnName}(`;
  const start = src.indexOf(anchor);
  expect(start, `${fnName} not found in ${LEGACY_REL}`).toBeGreaterThanOrEqual(0);
  // Balance the PARAMETER LIST parens first (a destructured param like `{ full = false }` contains its
  // own brace pair that must not be mistaken for the function body's opening brace).
  const parenStart = src.indexOf('(', start);
  let pdepth = 0;
  let j = parenStart;
  for (; j < src.length; j++) {
    if (src[j] === '(') pdepth++;
    else if (src[j] === ')') { pdepth--; if (pdepth === 0) break; }
  }
  const braceStart = src.indexOf('{', j);
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

// Legacy module-level constants this file renders BOTH sides against (grepped from
// scripts/enrich-parcels.js, never re-guessed) — the exact defaults scripts/seeds/logic_variables.json
// now also carries for the compute-side config equivalents (P4 declared-tunables ⊆ registry, already
// locked in violations.test.ts).
const COMP = {
  lotTol: 0.2, knnOverfetch: 50, topN: 10, overCaptureClamp: 1.1, fsiMinPlausible: 0.05, fsiMaxPlausible: 8,
};
const BBOX_DIVISOR = 78000;
const WINDOW_YEARS = 5;

const RENO = { coaUplift: 0.05, kitchenPct: 0.15, bathPct: 0.07, mislinkTol: 0.05 };
const ACC = {
  gardenMinLot: 400, gardenMinRearYard: 7.5, gardenMaxGfa: 60,
  garageMinLot: 300, garageMaxGfa: 40, garageMinFootprint: 18,
  accessoryMaxCovPct: 0.3, carFootprint: 15,
  lanewayMaxGfa: 60, lanewayMinLot: 300, lanewayMinRearYard: 7.5,
  minSoftPct: 0.3, lanewayStoreys: 2, gardenStoreys: 1,
};
const STOREY_HEIGHT = 3.5;
const MISLINK_TOL = 0.05;
const MIN_DIM = 3.0;

describe('SQL byte-verbatim lock (G2\' precursor) — legacy scripts/enrich-parcels.js vs scripts/lib/compute/enrich-parcels.js, rendered with equivalent inputs', () => {
  it('buildPass1ScopeWhere — full=true and full=false, extracted from legacy source (not exported) vs compute\'s exported function', () => {
    const legacySrc = extractFunctionSource(readLegacySource(), 'buildPass1ScopeWhere');
    // The legacy source includes the JS signature; render it via a throwaway eval-free comparison:
    // both full=true and full=false bodies are literal strings inside the function — assert the compute
    // export's OWN rendered output appears verbatim (modulo whitespace) inside the legacy source text,
    // for both branches.
    const computeTrue = normalize(compute.buildPass1ScopeWhere({ full: true }) as string);
    const computeFalse = normalize(compute.buildPass1ScopeWhere({ full: false }) as string);
    expect(computeTrue).toBe('TRUE');
    expect(normalize(legacySrc)).toContain(computeFalse);
  });

  it('buildUpdateSql (pass 1) — zero-arg, byte-identical after comment-strip', () => {
    const a = normalize(legacy.buildUpdateSql() as string);
    const b = normalize(compute.buildUpdateSql() as string);
    expect(b).toBe(a);
  });

  it('buildEnrichmentSql (pass 1) — rendered with the SAME bbox divisor (78000, Ask 5), full=true and full=false, empty staleOverlays', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildEnrichmentSql({ scopeWhere: 'TRUE', full, staleOverlays: new Set() }) as string);
      const b = normalize(compute.buildEnrichmentSql({ scopeWhere: 'TRUE', full, staleOverlays: new Set(), bboxDivisor: BBOX_DIVISOR }) as string);
      expect(b).toBe(a);
    }
  });

  it('buildEnrichmentSql — with a stale overlay set (height_overlay + on_priority_retail), the degrade-to-FALSE / base-only branches match byte-for-byte', () => {
    const stale = new Set(['height_overlay', 'priority_retail_overlay']);
    const a = normalize(legacy.buildEnrichmentSql({ scopeWhere: 'TRUE', full: true, staleOverlays: stale }) as string);
    const b = normalize(compute.buildEnrichmentSql({ scopeWhere: 'TRUE', full: true, staleOverlays: stale, bboxDivisor: BBOX_DIVISOR }) as string);
    expect(b).toBe(a);
  });

  it('buildMassingScopeWhere (pass 2 scope) — full=true and full=false', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildMassingScopeWhere({ full }) as string);
      const b = normalize(compute.buildMassingScopeWhere({ full }) as string);
      expect(b).toBe(a);
    }
  });

  it('buildMaxBuildSql (pass 2) — rendered with identical storeyHeight/acc/mislinkTol/minDim, full=true and full=false', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildMaxBuildSql({ scopeWhere: 'TRUE', full, storeyHeight: STOREY_HEIGHT, acc: ACC, mislinkTol: MISLINK_TOL, minDim: MIN_DIM }) as string);
      const b = normalize(compute.buildMaxBuildSql({ scopeWhere: 'TRUE', full, storeyHeight: STOREY_HEIGHT, acc: ACC, mislinkTol: MISLINK_TOL, minDim: MIN_DIM }) as string);
      expect(b).toBe(a);
    }
  });

  it('buildMaxBuildUpdateSql (pass 2) — zero-arg, byte-identical', () => {
    expect(normalize(compute.buildMaxBuildUpdateSql() as string)).toBe(normalize(legacy.buildMaxBuildUpdateSql() as string));
  });

  it('buildMassingStampSql (pass 2) — zero-arg, byte-identical', () => {
    expect(normalize(compute.buildMassingStampSql() as string)).toBe(normalize(legacy.buildMassingStampSql() as string));
  });

  it('buildExistingStructureSql (pass 3) — rendered with identical reno factors, full=true and full=false', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildExistingStructureSql({ scopeWhere: 'TRUE', full, reno: RENO }) as string);
      const b = normalize(compute.buildExistingStructureSql({ scopeWhere: 'TRUE', full, reno: RENO }) as string);
      expect(b).toBe(a);
    }
  });

  it('buildExistingStructureUpdateSql (pass 3) — zero-arg, byte-identical', () => {
    expect(normalize(compute.buildExistingStructureUpdateSql() as string)).toBe(normalize(legacy.buildExistingStructureUpdateSql() as string));
  });

  it('buildScenarioUpdateSql (pass 3) — zero-arg, byte-identical', () => {
    expect(normalize(compute.buildScenarioUpdateSql() as string)).toBe(normalize(legacy.buildScenarioUpdateSql() as string));
  });

  it('buildDecisionScopeWhere (pass 4 scope) — full=true and full=false', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildDecisionScopeWhere({ full }) as string);
      const b = normalize(compute.buildDecisionScopeWhere({ full }) as string);
      expect(b).toBe(a);
    }
  });

  it('buildCompCandidatesSql (pass 4) — the ONE declared clock-seam substitution (Fold G3): now()::date -> $1::date bound from ctx.clock.asOfDate(), the "5 years" window -> enrich_parcels_comps_window_years — every OTHER SQL token byte-identical', () => {
    const a = normalizeClockWindow(legacy.buildCompCandidatesSql() as string);
    const b = normalizeClockWindow(compute.buildCompCandidatesSql({ asOfDateParamIndex: 1, windowYears: WINDOW_YEARS }) as string);
    expect(b).toBe(a);
    // Both sides collapsed to the same token — prove the token actually appears (else the regexes
    // themselves rotted and this test would vacuously pass on two DIFFERENT un-normalised strings).
    expect(a).toContain('<CLOCK_WINDOW>');
    expect(b).toContain('<CLOCK_WINDOW>');
  });

  it('buildComparableBuildsUpdateSql (pass 4) — rendered with the 6 newly-externalized comp literals set to their exact legacy values (Ask 5, seed-verified) — EP-D1/B4.5 pin (no IS DISTINCT FROM) preserved byte-for-byte', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildComparableBuildsUpdateSql({ full, scopeWhere: 'TRUE' }) as string);
      const b = normalize(compute.buildComparableBuildsUpdateSql({ full, scopeWhere: 'TRUE', comp: COMP }) as string);
      expect(b).toBe(a);
      expect(a).not.toMatch(/IS DISTINCT FROM/i); // EP-D1 pin, both sides
    }
  });

  it('buildOptConfigSelectSql (pass 5) — full=true and full=false, byte-identical (no seam substitution — pass 5 has no clock/literal dependency)', () => {
    for (const full of [true, false]) {
      const a = normalize(legacy.buildOptConfigSelectSql({ scopeWhere: 'TRUE', full }) as string);
      const b = normalize(compute.buildOptConfigSelectSql({ scopeWhere: 'TRUE', full }) as string);
      expect(b).toBe(a);
    }
  });

  it('the zoning_dominant_area_share round(...::numeric, 4) cast (fence 7e130bff, lessons.md:28) is present, byte-identical, on BOTH sides — the float8-vs-NUMERIC IS DISTINCT FROM trap fix, never regenerated generically', () => {
    const a = legacy.buildEnrichmentSql({ scopeWhere: 'TRUE', full: true, staleOverlays: new Set() }) as string;
    const b = compute.buildEnrichmentSql({ scopeWhere: 'TRUE', full: true, staleOverlays: new Set(), bboxDivisor: BBOX_DIVISOR }) as string;
    const CAST = 'round(MAX(area_share)::numeric, 4) AS zoning_dominant_area_share';
    expect(a).toContain(CAST);
    expect(b).toContain(CAST);
  });
});
