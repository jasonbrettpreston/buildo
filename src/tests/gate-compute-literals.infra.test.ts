// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, §5 R-BA (gate E);
//            122_pipeline_step_optimization.md §5.5
//
// WF2 gate E — `scripts/analysis/gates/compute-literals.mjs`, fast invariant #32.
//
// The five-word standard's gate E draws every SQL INTERVAL/date literal, a
// module-level numeric constant of ANY identifier case (STANDARDIZED
// 2026-09-26 — renaming an UPPER_SNAKE_CASE constant to camelCase used to
// bypass this gate; case no longer decides whether a literal is a tunable),
// `violations:` non-zero comparison, and literal numeric SQL bound inside
// `scripts/lib/compute/**` from a CLOSED answer set: none at all, OR a
// `{gate:'E'}` ledger row keyed on `<rule-id>@<trimmed source line text>`.
// `scripts/hooks/check-step-shape.mjs` applies the SAME allowlist at commit
// time — only these 11 rule ids are ever filterable by a ledger row; every
// pre-existing compute-shape rule is not. The first five ids are FROZEN and in
// order (a reorder would re-point every gate-E ledger row); the six ids appended
// 2026-10-11 (R-BZ) each EXTEND one of them (or, for
// `compute-forbidden-require-descriptor`, are a sibling extension).
//
// T1/T2 re-run the module's own selfTest() both as a whole and via its direct
// assertions (Spec 121 §12b.6: a checker never proven to fire is not a check).
// T3/T4 are LIVE: the fleet's real findings are exactly the ledger's gate-E
// rows (0 orphans), landed 2026-09-26.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as gateE from '../../scripts/analysis/gates/compute-literals.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';
import { scanPurity } from '../../scripts/analysis/gates/compute-purity.mjs';

const REPO_ROOT = process.cwd();

// The five rule ids gate E owned before the 2026-10-11 R-BZ extension, in the
// exact order the rule table lists them. The six ids appended after are EXTENSIONS
// of these (or, for `compute-forbidden-require-descriptor`, a sibling): the first
// five are frozen — a reorder or a removal would silently re-point every gate-E
// ledger row at a different rule.
const GATE_E_ORIGINAL_FIVE = [
  'compute-no-sql-interval-literal',
  'compute-no-sql-date-literal',
  'compute-no-module-numeric-const',
  'compute-no-literal-violation-compare',
  'compute-no-sql-numeric-bound',
];
const GATE_E_NEW_SIX = [
  'compute-no-sql-clock',
  'compute-no-local-numeric-const',
  'compute-no-literal-url',
  'compute-forbidden-require-dynamic',
  'compute-forbidden-require-descriptor',
  'compute-no-swallow',
];

describe('gate E — no hard-coded compute literals (SQL INTERVAL/date, module-level numeric const of any case, violations-compare, SQL bound)', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => gateE.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — each of the 11 rule ids fires on the known-bad fixture (RED), and a
  // clean compute module fires 0 (GREEN).
  // -------------------------------------------------------------------------
  describe('T2: each rule id fires on the fixture; a clean compute fires 0', () => {
    it('T2a: all 11 gate-E rule ids fire on the known-bad fixture', () => {
      const findings = gateE.scanGateE([gateE.FIXTURE_FILE]);
      const seen = new Set(findings.map((f: { ruleId: string | undefined }) => f.ruleId));
      for (const ruleId of gateE.GATE_E_RULE_IDS) {
        expect(seen.has(ruleId), `rule "${ruleId}" did not fire on the fixture`).toBe(true);
      }
    });

    it('T2a2: GATE_E_RULE_IDS is 11 ids — the frozen first five unchanged, then the six new ids', () => {
      expect(gateE.GATE_E_RULE_IDS.length).toBe(11);
      expect(gateE.GATE_E_RULE_IDS.slice(0, 5)).toEqual(GATE_E_ORIGINAL_FIVE);
      expect(gateE.GATE_E_RULE_IDS.slice(5)).toEqual(GATE_E_NEW_SIX);
    });

    it('T2a3: each of the six new ids is an `id:` line in compute-shape.yml (21 ids total)', () => {
      const yml = fs.readFileSync(path.join(REPO_ROOT, gateE.RULE_FILE), 'utf8');
      const ids = yml.split(/\r?\n/)
        .map((l) => /^id:\s*(\S+)\s*$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => m[1]);
      // 21 ids total — the pre-existing compute-shape rules plus the 11 gate-E ids.
      expect(ids.length).toBe(21);
      for (const id of GATE_E_NEW_SIX) {
        expect(ids, `id "${id}" is not a top-level \`id:\` line in ${gateE.RULE_FILE}`).toContain(id);
      }
    });

    it('T2b: the clean compute fixture (clean-compute-purity.js) yields 0 gate-E hits', () => {
      const findings = gateE.scanGateE([gateE.CLEAN_FIXTURE_FILE]);
      expect(findings).toEqual([]);
    });

    it('T2b2: assert-schema.js yields ONLY compute-no-literal-url hits (9) among the 11 gate-E ids', () => {
      // The real step-1 compute module is NOT gate-E-clean: it holds nine literal
      // `https://` CKAN endpoints — the measured G10 `compute-no-literal-url`
      // sites that receive ledger rows at Step 3. Until those rows exist this is
      // RED by design, so the sites stay visible here rather than disappearing
      // behind a "clean module" claim. What this locks is the SHAPE: no other
      // gate-E id may fire on this file, so a future rule regression cannot hide
      // behind the nine known URL findings.
      const findings = gateE.scanGateE(['scripts/lib/compute/assert-schema.js']);
      expect(findings.length).toBe(9);
      for (const f of findings as { ruleId: string }[]) {
        expect(f.ruleId).toBe('compute-no-literal-url');
      }
      // Every one of the nine is a real gate-E id (not a pre-existing rule that
      // scanGateE happens to keep), and it is the URL id — nothing else.
      const seen = new Set(findings.map((f: { ruleId: string | undefined }) => f.ruleId));
      expect([...seen]).toEqual(['compute-no-literal-url']);
      expect(gateE.GATE_E_RULE_IDS).toContain('compute-no-literal-url');
    });

    it('T2c: a finding with a matching ledger row is filtered (allowed), not reported', () => {
      // The fixture carries THREE compute-no-module-numeric-const findings
      // (UPPER_SNAKE_CASE + two camelCase) so a case-blind rule is proven —
      // a row matching ONLY the UPPER_SNAKE_CASE finding's exact text must
      // filter that one finding and leave the other two (camelCase) findings
      // reported, not swallow the whole rule id.
      const row = {
        gate: 'E', step: 'bad-compute-literals', file: gateE.FIXTURE_FILE,
        item: 'compute-no-module-numeric-const@const MAX_RETRY_COUNT = 5;',
        disposition: 'pending_remediation', why: 'fixture', closing_brief: 'fixture',
        filed: '2026-09-26', adjudicated_by: 'operator',
      };
      const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], [row]);
      const stillReported = out.unallowed.filter((v: { item: string }) => v.item === row.item);
      expect(stillReported).toEqual([]);
      const camelCaseFindings = out.unallowed.filter(
        (v: { item: string }) => v.item.startsWith('compute-no-module-numeric-const@') && v.item !== row.item,
      );
      expect(camelCaseFindings.length).toBeGreaterThan(0);
    });

    it('T2d: the fixture RED-fails with no ledger rows at all', () => {
      const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], []);
      expect(out.pass).toBe(false);
      expect(out.unallowed.length).toBeGreaterThan(0);
    });

    it('T2e: a ledger row with no matching finding is an ORPHAN (R-X closing-row posture)', () => {
      const row = {
        gate: 'E', step: 'bad-compute-literals', file: gateE.FIXTURE_FILE,
        item: 'compute-no-module-numeric-const@no such line exists anywhere',
        disposition: 'pending_remediation', why: 'fixture', closing_brief: 'fixture',
        filed: '2026-09-26', adjudicated_by: 'operator',
      };
      const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], [row]);
      expect(out.pass).toBe(false);
      expect(out.orphans.length).toBeGreaterThan(0);
    });

    it('T2g: a camelCase module-level numeric const fires (the McDonald\'s Airtight bug) — UPPER_SNAKE_CASE still fires too', () => {
      const findings = gateE.scanGateE([gateE.FIXTURE_FILE]);
      const moduleConstFindings = findings.filter((f: { ruleId: string | undefined }) => f.ruleId === 'compute-no-module-numeric-const');
      expect(moduleConstFindings.some((f: { lineText: string }) => /const\s+roundScale\s*=/.test(f.lineText))).toBe(true);
      expect(moduleConstFindings.some((f: { lineText: string }) => /const\s+msPerHour\s*=/.test(f.lineText))).toBe(true);
      expect(moduleConstFindings.some((f: { lineText: string }) => /const\s+MAX_RETRY_COUNT\s*=/.test(f.lineText))).toBe(true);
    });

    it('T2h: a function-local numeric const does not fire this rule', () => {
      const findings = gateE.scanGateE([gateE.FIXTURE_FILE]);
      const moduleConstFindings = findings.filter((f: { ruleId: string | undefined }) => f.ruleId === 'compute-no-module-numeric-const');
      expect(moduleConstFindings.some((f: { lineText: string }) => /const\s+n\s*=\s*5/.test(f.lineText))).toBe(false);
    });

    it('T2f: old (pre-existing) rule ids are never filtered by a ledger row', () => {
      // compute-no-console is NOT in GATE_E_RULE_IDS — scanGateE drops it
      // entirely before matchLedger ever sees it, so no row could widen it.
      expect(gateE.GATE_E_RULE_IDS).not.toContain('compute-no-console');
      expect(gateE.GATE_E_RULE_IDS).not.toContain('compute-no-literal-threshold');
    });
  });

  // -------------------------------------------------------------------------
  // T3 — LIVE: the fleet's real gate-E findings are exactly the ledger's
  // gate-E rows, and there are zero orphans.
  // -------------------------------------------------------------------------
  it('T3: live — every compute-literal finding has a gate-E ledger row, and zero orphans', async () => {
    const files = gateE.loadComputeFiles(REPO_ROOT);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const sites = await scanPurity({ repoRoot: REPO_ROOT });
    const out = gateE.checkComputeLiterals(files, rows, REPO_ROOT, sites);

    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
    // Every gate-E ledger row is consumed by exactly one live finding (V3: rows only close as seams retire them).
    expect(out.allowed.length).toBe(ledger.loadLedger(REPO_ROOT).rows.filter((r: { gate?: string }) => r.gate === 'E').length);
  }, 120000);

  // -------------------------------------------------------------------------
  // T4 — the live scan actually finds something (a suite whose fleet scan
  // silently matches nothing proves nothing — Spec 121 §12b.6).
  // -------------------------------------------------------------------------
  it('T4: the live compute corpus has ≥1 real gate-E finding (all ledger-allowed)', () => {
    const files = gateE.loadComputeFiles(REPO_ROOT);
    const findings = gateE.scanGateE(files, REPO_ROOT);
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Airtight V3 (R-BZ, operator ruling 2026-10-11) — every conversion from now on
// needs CLEAN compute: the ledger's PURITY rows are FROZEN at the Phase 1 set,
// so a purity finding can never be ledgered to slip past gate E again.
// ---------------------------------------------------------------------------
describe('Airtight V3 (R-BZ, operator 2026-10-11)', () => {
  const loadRows = () => ledger.loadLedger(REPO_ROOT).rows;

  it('V1: the live ledger is frozen — 0 freeze problems, ≤143 purity rows (V3: rows only close — seams delete them; a row removed while its site remains is caught by T3)', () => {
    const rows = loadRows();
    expect(gateE.purityRowFreeze(rows)).toEqual([]);
    expect(rows.filter((r: object) => gateE.isPurityRow(r)).length).toBeLessThanOrEqual(143);
  });

  it('V2: a purity row filed on a later date is a freeze problem (RED)', () => {
    const rows = loadRows();
    const row = rows.find((r: object) => gateE.isPurityRow(r));
    expect(row).toBeTruthy();
    const bad = { ...(row as object), filed: '2026-10-12' };
    expect(gateE.purityRowFreeze([bad]).length).toBe(1);
  });

  it('V3: a purity row moved to a fresh module is a freeze problem (RED)', () => {
    const rows = loadRows();
    const row = rows.find((r: object) => gateE.isPurityRow(r));
    expect(row).toBeTruthy();
    const bad = { ...(row as object), step: 'link-coa-to-parcels' };
    expect(gateE.purityRowFreeze([bad]).length).toBe(1);
  });

  it('V4: a NON-purity gate-E row with a later date is not a freeze problem', () => {
    const row = {
      gate: 'E', step: 'link-wsib', file: 'scripts/lib/compute/link-wsib.js',
      item: 'compute-no-sql-interval-literal@no such line exists anywhere',
      disposition: 'pending_remediation', why: 'fixture', closing_brief: 'fixture',
      filed: '2026-10-12', adjudicated_by: 'operator',
    };
    expect(gateE.isPurityRow(row)).toBe(false);
    expect(gateE.purityRowFreeze([row])).toEqual([]);
  });

  it('V5: standardFor speaks V2 for a frozen module, V3 for a clean one', () => {
    const rows = loadRows();
    // enrich-parcels left the frozen set when CP-S1 closed its purity rows (2026-10-16); load-zoning is still frozen.
    expect(gateE.standardFor('load-zoning', rows)).toBe('V2');
    expect(gateE.standardFor('load-wsib', rows)).toBe('V3');
  });

  it('V6: a frozen (rogue) purity row RED-fails checkComputeLiterals with frozen.length === 1', () => {
    const rows = loadRows();
    const live = rows.find((r: object) => gateE.isPurityRow(r));
    expect(live).toBeTruthy();
    const frozenBadRow = { ...(live as object), filed: '2026-10-12' };
    const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], [frozenBadRow]);
    expect(out.pass).toBe(false);
    expect(out.frozen.length).toBe(1);
  });
});
