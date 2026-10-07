// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-CODE (i)(ii)(iv), §6.3 (heuristic list re-derived
//            mechanically at S9), §10 stage 8 (`bylaw-code-findings.md`, drift-locked render), §2 (the F-1 stale suite constants);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-11, M-25, M-46; docs/reports/mcbylaw-phase1-plan.md S9, F-1, F-2, STAND_SET
//
// S9 locks over the REAL tree (offline, parse-only): every proposed root module parses; the classifier finds the
// root-module constants (the S12b heuristic-list input); the known F-1 drifts surface as (ii) findings through
// fixture rows citing the live code; STAND_SET resolves and is banned as a setback; the committed findings render
// equals an in-memory regeneration (G-DRIFT shape).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const CL = await load('scripts/analysis/bylaw/code-link.mjs');
const ROOT = process.cwd();
const OC = 'scripts/lib/optimal-config.js';
const MB = 'scripts/lib/max-build.js';

describe('S9 on the real tree', () => {
  const ctx = typeof CL.createContext === 'function' ? CL.createContext({ root: ROOT }) : {};
  const classify = () => CL.classifyConstants({ ctx, codeRoots: CL.PROPOSED_CODE_ROOTS, rows: [], heuristics: [] });

  it('every proposed root module exists and parses (an unparseable file would fail G-CODE (i))', () => {
    for (const p of CL.PROPOSED_CODE_ROOTS) expect({ p, exists: fs.existsSync(path.join(ROOT, p)) }).toEqual({ p, exists: true });
    expect(classify().findings.filter((f: Json) => f.code === 'unparseable_code_file')).toEqual([]);
  });

  it('the classifier re-derives the root-module constant list (≈ 60 expected by the plan), each with a line and a proposed class', () => {
    const r = classify();
    expect(r.counts.total).toBeGreaterThanOrEqual(40);
    expect(r.counts.unmapped).toBe(r.counts.total); // no authored or heuristic rows exist yet
    for (const c of r.constants) {
      expect(c.line).toBeGreaterThan(0);
      expect(['by_law_cited', 'by_law_claimed_unsourced', 'heuristic']).toContain(c.proposed);
    }
    const m = (p: string, member: string) => r.constants.find((c: Json) => c.path === p && c.member === member);
    expect(m(OC, 'BYLAW.GARDEN_HEIGHT_HIGH_M')).toMatchObject({ value: 6, proposed: 'by_law_cited', clauses: ['150.7.60.40(1)(B)'] });
    expect(m(MB, 'LOT_TOLERANCE')).toMatchObject({ value: 0.15, proposed: 'heuristic' });
    expect(m(MB, 'RAVINE_SETBACK_M')).toMatchObject({ value: 10, proposed: 'heuristic', proposed_reason: 'proxy_for_unmodelled_rule' });
    // F-2: a comment claims a by-law source with no clause — the operator classifies (Spec 68 §6.3), never assumed
    for (const k of ['GARDEN_SUITE_MIN_LOT_SQM', 'MIN_SOFT_LANDSCAPING_PCT']) expect(m(MB, k)).toMatchObject({ proposed: 'by_law_claimed_unsourced' });
    expect(m(MB, 'GARDEN_SUITE_MIN_LOT_SQM').logic_variable).toMatchObject({ key: 'garden_suite_min_lot_sqm' });
  });

  it('the F-1 drift surfaces as (ii) findings from fixture rows citing the live code — report-only (Spec 68 §2)', () => {
    const rows = [
      { regulation_id: '150.7.60.40(1)', calculation_handling: { status: 'modelled' }, code_refs: [{ ref: `${OC}#BYLAW.GARDEN_HEIGHT_HIGH_M`, expects: 6.3 }], units: [] },
      { regulation_id: '150.7.60.30(1)', calculation_handling: { status: 'modelled' }, code_refs: [{ ref: `${OC}#BYLAW.GARDEN_SEP_LOW_M`, expects: 4.0 }], units: [] },
    ];
    const r = CL.checkCodeLinkage({ ctx, rows, codeRoots: CL.PROPOSED_CODE_ROOTS, bannedCodeRefs: [] });
    expect(r.pass).toBe(true);
    expect(r.findings.map((f: Json) => [f.code, f.code_value, f.expects])).toEqual([['expects_mismatch', 6, 6.3], ['expects_mismatch', 5, 4]]);
  });

  it('STAND_SET: parcels.bylaw_standard_setback_m resolves as a column and is banned as a setback (Spec 67 KFM-14)', () => {
    const banned = [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'CR standard-set selector, not metres', targets: ['front_setback_m'] }];
    const rows = [{ regulation_id: '10.20.40.70(1)', calculation_handling: { status: 'modelled' }, code_refs: ['parcels.bylaw_standard_setback_m'], units: [{ unit_id: 'u', target: 'front_setback_m' }] }];
    expect(CL.resolveCodeRef(ctx, CL.parseCodeRef('parcels.bylaw_standard_setback_m')).resolved).toBe(true);
    expect(CL.checkCodeLinkage({ ctx, rows, codeRoots: CL.PROPOSED_CODE_ROOTS, bannedCodeRefs: banned }).items.map((i: Json) => i.code)).toEqual(['banned_code_ref']);
  });

  // Staleness of the committed render is reported by --check, never a blocker (M-32; excluded from the pre-commit
  // compare like census.json), so this locks determinism and shape, not byte-equality with the committed file.
  it('the findings render is deterministic (LF, no timestamp) and the committed file exists with the same shape', () => {
    const a = CL.buildReportFromTree({ root: ROOT }).markdown;
    expect(CL.buildReportFromTree({ root: ROOT }).markdown).toBe(a);
    expect(a.includes('\r')).toBe(false);
    const committed = fs.readFileSync(path.join(ROOT, CL.FINDINGS_PATH), 'utf8');
    for (const h of ['## Summary', '## G-CODE (i)', '## G-CODE (iv)']) expect(committed).toContain(h);
  });
});
