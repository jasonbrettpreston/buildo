// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-BA (gate F);
//            123_step_opt_assessment_validation.md §6
//
// WF2 gate F — `scripts/analysis/gates/score-floor.mjs`, fast invariant #37
// (LF-only) + the `computeScorecard()` per-step hard-stop (score floor).
//
// Two independent halves, one shared ledger gate:
//   F1 SCORE FLOOR — a scorecard below 14/17 is a HARD STOP unless a
//      `{gate:'F', item:'score'}` row allows it; a row for a step now
//      at/above the floor is an ORPHAN (R-X).
//   F2 LF-ONLY — every file a converted step owns must be committed LF (the
//      git INDEX blob); `i/crlf`/`i/mixed`/`i/-text`-on-text is RED unless a
//      `{gate:'F', item:'eol:<path>'}` row allows it.
//
// `checkEol` is scoped to `item:` starting `eol:` so the shared gate 'F'
// never reports a SCORE row as an orphan of the LF check (measured live
// 2026-09-26 before the fix in this commit — 3 false orphans).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as gateF from '../../scripts/analysis/gates/score-floor.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = process.cwd();

describe('gate F — score floor 14/17 hard stop + LF-only (fast invariant #37)', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => gateF.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — 10/17 with no ledger row hard-stops, naming the floor reason.
  // -------------------------------------------------------------------------
  it('T2: 10/17 with no ledger row -> hardStop with the floor reason', () => {
    const d = gateF.floorDecision({ slug: 'fixture_step', total: 10, maxTotal: 17 }, []);
    expect(d.hardStop).toBe(true);
    expect(d.reason).toBe(`score floor 10/17 < ${gateF.SCORE_FLOOR}`);
  });

  // -------------------------------------------------------------------------
  // T3 — exactly 14/17 does not hard-stop (floor is inclusive).
  // -------------------------------------------------------------------------
  it('T3: 14/17 exactly -> no hard stop', () => {
    const d = gateF.floorDecision({ slug: 'fixture_step', total: 14, maxTotal: 17 }, []);
    expect(d.hardStop).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T4 — a leftover score row for a step now at/above the floor is an orphan.
  // -------------------------------------------------------------------------
  it('T4: 16/17 with a leftover score row -> orphan (RED, R-X)', () => {
    const row = {
      gate: 'F', step: 'fixture_step', item: gateF.SCORE_ITEM, disposition: 'pending_remediation',
      why: 'w', closing_brief: 'b', filed: '2026-09-26', adjudicated_by: 'operator',
    };
    const d = gateF.floorDecision({ slug: 'fixture_step', total: 16, maxTotal: 17 }, [row]);
    expect(d.hardStop).toBe(false);
    expect(d.orphan).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T5 — eolViolations parses both directions: i/crlf RED, i/lf GREEN,
  // i/mixed RED, i/-text on a text path RED, i/-text on a binary path GREEN.
  // -------------------------------------------------------------------------
  describe('T5: eolViolations both directions', () => {
    it('T5a: i/crlf -> RED', () => {
      const rows = gateF.parseLsFilesEol('i/crlf w/crlf attr/ docs/x.ts');
      expect(gateF.eolViolations(rows)).toHaveLength(1);
    });
    it('T5b: i/lf -> GREEN', () => {
      const rows = gateF.parseLsFilesEol('i/lf w/lf attr/ docs/x.ts');
      expect(gateF.eolViolations(rows)).toHaveLength(0);
    });
    it('T5c: i/mixed -> RED', () => {
      const rows = gateF.parseLsFilesEol('i/mixed w/mixed attr/ docs/x.ts');
      expect(gateF.eolViolations(rows)).toHaveLength(1);
    });
    it('T5d: i/-text on a .ts path -> RED (Fold GC-7, binary-blob diff)', () => {
      const rows = gateF.parseLsFilesEol('i/-text w/-text attr/ docs/x.ts');
      expect(gateF.eolViolations(rows)).toHaveLength(1);
    });
    it('T5e: i/-text on a genuinely binary path (.shp) -> GREEN', () => {
      const rows = gateF.parseLsFilesEol('i/-text w/-text attr/ docs/geom.shp');
      expect(gateF.eolViolations(rows)).toHaveLength(0);
    });
    it('T5f: checkEol never reports a SCORE row as an orphan of the LF check', () => {
      const scoreRow = {
        gate: 'F', step: 'fixture_step', item: gateF.SCORE_ITEM, disposition: 'pending_remediation',
        why: 'w', closing_brief: 'b', filed: '2026-09-26', adjudicated_by: 'operator',
      };
      const out = gateF.checkEol('i/lf w/lf attr/ docs/x.ts', [scoreRow]);
      expect(out.orphans).toEqual([]);
      expect(out.pass).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // T6 — LIVE: every committed step-conformance report's Score is >= 14/17 OR
  // has a gate-F score ledger row, and there are zero orphans.
  // -------------------------------------------------------------------------
  // R-BA's own scope note (Spec 124 §5, operator 2026-09-26): every gate is a
  // HARD STOP — no ledger row permitted — for steps "in development now"
  // (`load_centreline`, `massing`, `neighbourhoods`). `link_massing` genuinely
  // sits below the floor as a knock-on of gate K's scoreG7 tightening and MUST
  // stay unledgered by design; this suite honours that sanctioned exception
  // rather than asserting a fully-green fleet gate F never intended.
  const RBA_NO_LEDGER_EXEMPT = ['link_massing', 'link_neighbourhoods'];

  it('T6: live — every converted step scores >= 14/17 or has a gate-F score row; 0 orphans (outside the R-BA no-ledger exemption)', () => {
    const run = spawnSync('node', ['scripts/analysis/step-validate.mjs', '--all', '--fast'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 180_000,
    });
    const stdout = `${run.stdout || ''}`;
    const scores: Array<{ slug: string, total: number, maxTotal: number }> = [];
    for (const m of stdout.matchAll(/^\s*(\S+): (\d+)\/17 hard-stop=/gm)) {
      scores.push({ slug: m[1] as string, total: Number(m[2]), maxTotal: 17 });
    }
    expect(scores.length).toBeGreaterThan(0);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = gateF.checkScoreFloor(scores, rows);
    expect(out.orphans).toEqual([]);
    expect(out.violations.filter((v) => !RBA_NO_LEDGER_EXEMPT.includes(v.step))).toEqual([]);
    expect(out.violations.every((v) => RBA_NO_LEDGER_EXEMPT.includes(v.step))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T7 — LIVE: every real EOL finding over the converted fleet's owned files
  // has a gate-F eol ledger row, and there are zero orphans.
  // -------------------------------------------------------------------------
  it('T7: live EOL findings ⊆ ledger, 0 orphans', () => {
    const descriptors = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, gateF.LEDGER_REL_PATH), 'utf8'),
    );
    expect(descriptors).toBeTruthy(); // the ledger itself parses
    const slugs = gateF.loadConvertedSlugs(REPO_ROOT);
    const candidatePaths = new Set<string>();
    for (const slug of slugs) {
      const shellGuess = `scripts/${slug.replace(/_/g, '-')}.js`;
      candidatePaths.add(shellGuess);
      candidatePaths.add(shellGuess.replace(/\.js$/, '.descriptor.json'));
      candidatePaths.add(shellGuess.replace(/\.js$/, '.notes.json'));
      candidatePaths.add(`scripts/lib/compute/${path.basename(shellGuess)}`);
      candidatePaths.add(`src/tests/steps/${slug}`);
    }
    const text = gateF.lsFilesEol(REPO_ROOT, [...candidatePaths]);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = gateF.checkEol(text, rows);
    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
  });
});
