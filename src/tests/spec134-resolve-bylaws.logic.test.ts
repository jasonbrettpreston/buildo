// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md (the resolve_bylaws contract);
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-GY, R-HB, R-HC, R-HD, R-HE, R-HF, R-HG;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-231…M-234
//
// The operator's 2026-10-20 scenario-build rulings (docs/reports/decisions/2026-10-20-scenario-build-rulings.json)
// for the Layer 2 step, locked as spec text until the step is built (Spec 134 §9: commit ① adds the step's own
// red suite). Each case pins one ruling where Spec 134, Spec 68, Spec 78 or the chain manifest states it, so a
// later edit that drops or contradicts a ruling fails here, by name.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ck from '../../scripts/analysis/spec-split-check.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const SPEC_134_REL = 'docs/specs/01-pipeline/134_resolve_bylaws.md';
const spec = () => read(SPEC_134_REL);
const section = (text: string, heading: string) => {
  const start = text.indexOf(`\n## ${heading}`);
  expect(start, heading).toBeGreaterThan(-1);
  const end = text.indexOf('\n## ', start + 4);
  return text.slice(start, end === -1 ? undefined : end);
};

describe('R-GY — Spec 134 owns resolve_bylaws; Spec 68 §11 and Spec 78 D-1 point to it', () => {
  it('Spec 134 exists with its title, one standard role banner, a Status line and Operating Boundaries', () => {
    const text = spec();
    expect(text.split('\n')[0]).toBe('# SPEC 134 — resolve_bylaws — Layer 2 by-law resolution');
    expect(ck.extractRoleBanners(text)).toEqual(['standard']);
    expect(text).toMatch(/^\*\*Status:\*\* PROPOSED 2026-10-20/m);
    for (const h of ['### Target Files', '### Out-of-Scope Files', '### Cross-Spec Dependencies']) expect(text).toContain(h);
  });

  it('is registered: spec-split-check SPEC_FILES, an arm (iv) budget, and a system-map row', () => {
    expect(ck.SPEC_FILES['134']).toBe('134_resolve_bylaws.md');
    const manifest = JSON.parse(read('docs/specs/01-pipeline/122_split_manifest.json')) as { budgets: Record<string, unknown> };
    expect(manifest.budgets['134']).toBeDefined();
    expect(read('docs/specs/00-architecture/00_system_map.md')).toMatch(/^\| 134 \| `01-pipeline\/134_resolve_bylaws\.md` \|/m);
  });

  it('Spec 68 §11 carries one pointer line (not the contract) and Spec 78 D-1 a dated note, both citing R-GY', () => {
    const s68 = read('docs/specs/01-pipeline/68_mcbylaw_standard.md');
    const pointer = s68.split('\n').filter((l) => l.includes('134_resolve_bylaws.md'));
    expect(pointer).toHaveLength(1);
    expect(pointer[0]).toContain('Spec 124 R-GY');
    const d1 = read('docs/specs/01-pipeline/78_optimal_lot_configuration.md').split('\n').find((l) => l.startsWith('| | *Dated note 2026-10-20 (D-1;'));
    expect(d1).toBeDefined();
    expect(d1).toContain('Spec 134');
    expect(d1).toContain('R-GY');
  });

  it('the plan it replaces is kept verbatim as history and the never-created "Spec 72" is named as superseded', () => {
    expect(read('docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md').split('\n')[3]).toMatch(/new owner spec \(Spec 72\)/);
    expect(spec()).toContain('names an owner "Spec 72" that was never created (P2:4); this spec is that owner');
  });
});

describe('R-HB — MATERIALIZER, rows form', () => {
  it('the header and §7 name MATERIALIZER with the R-EH rows form; ENRICHER appears only as the replaced plan value', () => {
    const text = spec();
    expect(text).toContain('**Archetype:** MATERIALIZER (Spec 124 R-HB)');
    const s7 = section(text, '7. Step shape');
    expect(s7).toContain('**Archetype MATERIALIZER** (Spec 124 R-HB');
    expect(s7).toContain('`execution.materialize_form: "rows"`');
    expect(s7).toContain('`recovery.reset` truncates its tables');
    for (const line of text.split('\n').filter((l) => l.includes('ENRICHER'))) expect(line).toMatch(/not P2's provisional ENRICHER/);
  });
});

describe('R-HC — R-DK covers both new steps; no R-AS adaptation', () => {
  it('§8 states net-new under R-DK and closes the R-AS adaptation as superseded', () => {
    const s8 = section(spec(), '8. Born V3');
    expect(s8).toContain('Spec 124 R-DK');
    expect(s8).toContain('**R-AS does not apply:** R-DK covers both new steps');
    expect(s8).toContain('Spec 124 R-HC');
  });
});

describe('R-HD — chain placement: sources, after enrich_parcels, before link_parcel_abutments', () => {
  it('Spec 134 states the placement, and the step never reads parcel_abutments (written later in the chain)', () => {
    const text = spec();
    expect(text).toContain('**Chain:** `sources`, after `enrich_parcels`, before `link_parcel_abutments` and `compute_maxbld_scenarios` (Spec 124 R-HD)');
    expect(section(text, '2. Inputs')).toContain('**Not an input at v1: `parcel_abutments`.**');
    expect(section(text, '8. Born V3')).toContain('every read table declared (`parcels`, `bylaw_map_areas`)');
  });

  it('the manifest has the slot (enrich_parcels before link_parcel_abutments) and, once chained, resolve_bylaws sits in it', () => {
    const chain = (JSON.parse(read('scripts/manifest.json')) as { chains: { sources: string[] } }).chains.sources;
    const ep = chain.indexOf('enrich_parcels');
    const lpa = chain.indexOf('link_parcel_abutments');
    expect(ep).toBeGreaterThan(-1);
    expect(lpa).toBeGreaterThan(ep);
    const rb = chain.indexOf('resolve_bylaws');
    if (rb !== -1) {
      expect(rb).toBeGreaterThan(ep);
      expect(rb).toBeLessThan(lpa);
    }
  });
});

describe('R-HL — front-yard averaging stays in the scenario step (operator CHAT-2)', () => {
  it('Spec 134 leaves averaging to compute_maxbld_scenarios, cites R-HL, and no longer lists it as open', () => {
    const text = spec();
    expect(section(text, '2. Inputs')).toContain('the operator ruled that averaging stays in the scenario step (Spec 124 R-HL;');
    expect(section(text, '11. Open questions')).not.toContain('Front-yard averaging and the chain order');
  });
});

describe('R-HE, R-HF, R-HG — the consumer contract, the named locks and the runner-rulings check are in the contract', () => {
  it('R-HE: the app reads scenario data only through the amended Spec 100 contract', () => {
    const s10 = section(spec(), '10. Consumers');
    expect(s10).toContain('amended with an explicit whitelisted block (Spec 124 R-HE; no new endpoint); no app reads a Layer 2 table');
  });

  it('R-HF: the N1 node carries the stale owed-entry reconcile, and its lock file exists', () => {
    expect(spec()).toContain('the stale owed-entry reconcile (Spec 124 R-HF)');
    expect(fs.existsSync(path.join(REPO_ROOT, 'src/tests/bylaw-evaluator-fixes.logic.test.ts'))).toBe(true);
  });

  it('R-HG: the scenario step\'s ① (node N6), and only it, is scheduled after the 18 runner rulings are confirmed built', () => {
    const s8 = section(spec(), '8. Born V3');
    expect(s8).toContain('**Runner rulings** (Spec 124 R-HG');
    expect(s8).toContain("before scheduling the scenario step's ① (node N6");
    expect(s8).toContain("The ruling does not cover this step's own ①.");
  });
});

describe('M-231…M-234 — the by-law-side rulings Spec 134 applies', () => {
  it('M-234: the v1 scope (classes, base + authored exceptions, full rescan)', () => {
    const s1 = section(spec(), '1. Goal and the v1 scope');
    expect(s1).toContain('Spec 69a M-234');
    for (const cls of ['`detached_house`', '`detached_houseplex`', '`semi_detached_houseplex`', '`semi_detached_house`', '`garden_suite`', '`laneway_suite`']) expect(s1).toContain(cls);
    expect(s1).toContain('v1 is a full rescan');
  });

  it('M-231: the unauthored-exception gate is lot-wide and written per target, before effective()', () => {
    const s5 = section(spec(), '5. The unauthored-exception gate');
    expect(s5).toContain('Spec 69a M-231');
    expect(s5).toContain('takes **no winner on any target**');
    expect(s5).toContain('every target row of the lot carries `not_evaluated:exception_not_authored:<exception id>`');
  });

  it('M-232: the Layer 2 set is Spec 68 §5a part 3, joined to the §11.1 set by a total map locked both ways', () => {
    const s4 = section(spec(), '4. Status sets');
    expect(s4).toContain('Spec 69a M-232');
    expect(s4).toContain('`applies` (a value) · `not_applicable:<clause>` · `undecided` · `not_evaluated:<code>`');
    expect(s4).toContain('**The lock is total in both directions:**');
  });

  it('M-233: three structures and a measured storage budget under the §6.8 kill line', () => {
    const s6 = section(spec(), '6. Structures and the storage budget');
    expect(s6).toContain('Spec 69a M-233');
    expect(s6).toContain('**principal + garden suite + laneway suite**');
    expect(s6).toContain("**Spec 78 §6.8's kill line stays:**");
    expect(s6).toContain('`resolve_bylaws_storage_budget_mb`');
  });
});
