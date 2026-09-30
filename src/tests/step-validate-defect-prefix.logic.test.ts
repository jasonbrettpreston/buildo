// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (G6 defect ledger)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (closed answers)
//
// fix(123_step_opt_assessment_validation) (2026-09-30): `step-validate.mjs`'s
// `defectPrefixFor(slug)` (line 782) derived a defect prefix from the slug's own
// INITIALS (one letter per underscore-separated word, uppercased). Both suffixes
// are literally "wsib": `load_wsib` and `link_wsib` therefore BOTH resolve to
// `LW` — so G6's `defectLedgerRowsFor(row)` matched the WRONG step's ledger rows.
// Measured: `node scripts/analysis/step-validate.mjs --step=load_wsib --fast`
// scored G6 as "22 ledger row(s)" — those are `link_wsib`'s `LW-D1..LW-D22`
// (`docs/reports/defect-ledger.md:49-74`), while `load_wsib`'s OWN rows are
// `WS-D1..WS-D8` (`:239-246`), unscored. Per Spec 124 §5 R-BA, the closed answer
// being locked: every converted/pending slug resolves to a UNIQUE defect prefix;
// a collision is a FAIL naming BOTH slugs and the `DEFECT_PREFIX_OVERRIDES` fix.
//
// This suite is RED today: the module exports below do not exist yet (they are
// the p1 lock for the p2 fix). Model the ESM import on
// `src/tests/step-validate-vitest-fork-cap.infra.test.ts:1-47` — `pathToFileURL`
// dynamic import of `scripts/analysis/step-validate.mjs`, no `any`.
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');

type DefectPrefixOverrides = Record<string, string>;
type DefectPrefixForFn = (slug: string, overrides?: DefectPrefixOverrides) => string;
type CollisionResult = {
  pass: boolean;
  blockedSlugs: string[];
  detail: string;
};
type CheckDefectPrefixCollisionsFn = (
  slugs: string[],
  overrides?: DefectPrefixOverrides,
) => CollisionResult;
type DefectLedgerRow = {
  id: string;
  step: string;
  anchor: string;
  summary: string;
  status: string;
  closesAt: string;
  source: string;
};
type DefectLedgerRowsForFn = (row: { prefix: string }) => DefectLedgerRow[];

type StepValidateModule = {
  defectPrefixFor: DefectPrefixForFn;
  DEFECT_PREFIX_OVERRIDES: DefectPrefixOverrides;
  checkDefectPrefixCollisions: CheckDefectPrefixCollisionsFn;
  defectLedgerRowsFor: DefectLedgerRowsForFn;
};

async function loadModule(): Promise<StepValidateModule> {
  return (await import(pathToFileURL(STEP_VALIDATE).href)) as unknown as StepValidateModule;
}

describe('step-validate.mjs — defect-prefix overrides + collision check (G6, Spec 123 §6 / Spec 124 §5 R-BA)', () => {
  // Imported once: the module runs a substantial import-time selfTest(), so
  // paying it per-`it` would spuriously trip the default 5000ms test timeout
  // and mask the real failure (the missing exports below).
  let mod: StepValidateModule;
  beforeAll(async () => {
    mod = await loadModule();
  }, 120000);

  it('defectPrefixFor resolves load_wsib to WS and link_wsib to LW; a bare-overrides call falls back to the initials convention', async () => {
    const { defectPrefixFor, DEFECT_PREFIX_OVERRIDES } = mod;
    expect(defectPrefixFor('load_wsib')).toBe('WS');
    expect(defectPrefixFor('link_wsib')).toBe('LW');
    // the bare initials convention (no overrides) collapses both to LW — the defect
    expect(defectPrefixFor('load_wsib', {})).toBe('LW');
    expect(DEFECT_PREFIX_OVERRIDES).toEqual({ load_wsib: 'WS' });
  });

  it('RED direction — the live overrides were removed: load_wsib/link_wsib collide on LW, blocked, naming both slugs and the override fix', async () => {
    const result = mod.checkDefectPrefixCollisions(['load_wsib', 'link_wsib'], {});
    expect(result.pass).toBe(false);
    expect([...result.blockedSlugs].sort()).toEqual(['link_wsib', 'load_wsib']);
    expect(result.detail).toContain('load_wsib');
    expect(result.detail).toContain('link_wsib');
    expect(result.detail).toContain('LW');
    expect(result.detail).toContain('DEFECT_PREFIX_OVERRIDES');
  });

  it('GREEN direction — the live overrides de-collide load_wsib/link_wsib, and the check is general (a synthetic load_foo/link_foo collision still fails)', async () => {
    const live = mod.checkDefectPrefixCollisions(['load_wsib', 'link_wsib']);
    expect(live.pass).toBe(true);
    expect(live.blockedSlugs).toEqual([]);
    // not wsib-special: the same initials collision on any other suffix still fails
    const synthetic = mod.checkDefectPrefixCollisions(['load_foo', 'link_foo']);
    expect(synthetic.pass).toBe(false);
  });

  it('defectLedgerRowsFor scores only the rows under the resolved prefix — load_wsib never reads link_wsib LW-D rows', async () => {
    const { defectPrefixFor, defectLedgerRowsFor } = mod;
    const wsibRows = defectLedgerRowsFor({ prefix: defectPrefixFor('load_wsib') });
    expect(wsibRows.length).toBeGreaterThanOrEqual(8);
    for (const row of wsibRows) {
      expect(row.step).toBe('load_wsib');
      expect(row.id).toMatch(/^WS-D\d+$/);
    }
    const linkRows = defectLedgerRowsFor({ prefix: defectPrefixFor('link_wsib') });
    for (const row of linkRows) {
      // link_wsib's step cells carry annotations ("link_wsib (library, …)", "link_wsib + link_massing …")
      expect(row.step).toMatch(/^link_wsib\b/);
      expect(row.step).not.toContain('load_wsib');
    }
    expect(linkRows.length).toBeGreaterThanOrEqual(22);
  });
});
