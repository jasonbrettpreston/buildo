// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-BA (gate F), R-DU;
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
import { readConvertedJson } from '../../scripts/analysis/gates/converted-set.mjs';
import {
  notLookedReasons, parseNonBlockingSlugs, parseSummaryScores, pendingNoDescriptorSlugs, pendingStageBySlug, rduScoreScope,
} from './helpers/step-validate-run';
import { stageAwaitsCaptures } from '../../scripts/analysis/step-validate.mjs';

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
  // HARD STOP — no ledger row permitted — for steps "in development now":
  // the INGESTOR slugs `load_centreline`, `massing`, `neighbourhoods` (not
  // yet in converted.json, so they never appear in a live `--all` run's
  // scores at all). `link_massing` and `link_neighbourhoods` are PREVIOUSLY
  // CONVERTED steps (both in converted.json) — a same-named-suffix
  // coincidence, not the same slug. A prior revision of this test hard-coded
  // those two AS a "no-ledger exemption" (`RBA_NO_LEDGER_EXEMPT`), which
  // conflated them with the in-development ingestor names and became an
  // unsanctioned bypass: Spec 124 §5 R-BA is explicit that a dated ledger row
  // is the ONLY sanctioned exception, "in-development steps get none" refers
  // to slugs with no descriptor yet, never to a converted step whose report
  // score later dipped. `link_massing`'s genuine 10/17 (a knock-on of gate
  // K's scoreG7 tightening, commit 7d807c0b) now carries its own dated
  // `{gate:'F', step:'link_massing', item:'score'}` ledger row instead — this
  // suite asserts a fully clean fleet, no exemption needed.
  //
  // Spec 124 R-DU (amended 2026-10-18): a pending entry whose descriptor FILE is
  // absent (an early ①, e.g. permits/coa at red_suite) prints its red scorecard
  // but does not gate — its scorecard reads a descriptor that does not exist yet.
  // T6 scores every other row: every converted step and every pending step WITH a
  // descriptor. The skipped set is derived from the files, never the stage label,
  // and must equal the rows step-validate itself labels non-blocking, so no
  // converted row can be dropped this way.
  it('T6: live — every converted step scores >= 14/17 or has a gate-F score row; 0 orphans', () => {
    // timeout 420 s: a direct run measured 214 s (2026-10-14); the old 180 s
    // killed it, leaving 0 rows. notLookedReasons names any such run (LM-D14).
    const run = spawnSync('node', ['scripts/analysis/step-validate.mjs', '--all', '--fast'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 420_000,
    });
    expect(notLookedReasons(run, readConvertedJson(REPO_ROOT).converted.length)).toEqual([]);
    const scores = parseSummaryScores(`${run.stdout || ''}`);
    const convertedJson = readConvertedJson(REPO_ROOT);
    const scripts = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')).scripts;
    const noDescriptor = pendingNoDescriptorSlugs(convertedJson, scripts, (rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
    expect([...parseNonBlockingSlugs(`${run.stdout || ''}`)].sort()).toEqual([...noDescriptor].sort());
    const { gated } = rduScoreScope(scores, noDescriptor);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    // W4A-R6 amended (Spec 124 R-EF, operator y 2026-10-19): a pending step whose DECLARED stage awaits its captures
    // (stageAwaitsCaptures: the stage excludes G8) is undecidable-not-unmet, so checkScoreFloor's stage gate skips it.
    const stageBySlug = pendingStageBySlug(convertedJson, scripts);
    const out = gateF.checkScoreFloor(gated, rows, (slug: string) => stageBySlug.has(slug) && stageAwaitsCaptures(stageBySlug.get(slug)));
    expect(out.orphans).toEqual([]);
    expect(out.violations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T6-R6 — the W4A-R6 stage gate, fixtures only: a below-floor pending step whose declared stage awaits its
  // captures leaves the walk; a below-floor converted step and a below-floor pending step at a capture-bearing
  // stage are still violations (the gate never widens past the declared stage).
  // -------------------------------------------------------------------------
  it('T6-R6: only a pending step whose declared stage awaits captures leaves the score-floor walk', () => {
    const conv = { converted: ['scripts/c.js'], pending: [{ file: 'scripts/cp.js', stage: 'compute_ported' }, { file: 'scripts/rw.js', stage: 'runner_wired' }] };
    const scripts = { c: { file: 'scripts/c.js' }, cp: { file: 'scripts/cp.js' }, rw: { file: 'scripts/rw.js' } };
    const stageBySlug = pendingStageBySlug(conv, scripts);
    expect([...stageBySlug.entries()]).toEqual([['cp', 'compute_ported'], ['rw', 'runner_wired']]);
    const scores = ['c', 'cp', 'rw'].map((slug) => ({ slug, total: 13, maxTotal: 17 }));
    const out = gateF.checkScoreFloor(scores, [], (slug: string) => stageBySlug.has(slug) && stageAwaitsCaptures(stageBySlug.get(slug)));
    expect(out.violations.map((v) => v.step)).toEqual(['c', 'rw']);
  });

  // -------------------------------------------------------------------------
  // T6-RDU — the R-DU scope, fixtures only: a pending row with no descriptor
  // file is skipped by name; a pending row WITH a descriptor and every
  // converted row are still scored (a converted below-floor row still fails).
  // -------------------------------------------------------------------------
  it('T6-RDU: only a pending row with no descriptor file leaves the score-floor walk', () => {
    const conv = { converted: ['scripts/c.js'], pending: [{ file: 'scripts/red.js' }, { file: 'scripts/desc.js' }] };
    const scripts = { c: { file: 'scripts/c.js' }, red: { file: 'scripts/red.js' }, desc: { file: 'scripts/desc.js' } };
    const onDisk = new Set(['scripts/desc.descriptor.json']); // c's descriptor absent: converted, never skipped
    const skip = pendingNoDescriptorSlugs(conv, scripts, (rel) => onDisk.has(rel));
    expect(skip).toEqual(['red']);
    const scores = [
      { slug: 'c', total: 10, maxTotal: 17 }, { slug: 'red', total: 7, maxTotal: 17 }, { slug: 'desc', total: 13, maxTotal: 17 },
    ];
    const { gated, skipped } = rduScoreScope(scores, skip);
    expect(skipped).toEqual(['red']);
    expect(gateF.checkScoreFloor(gated, []).violations.map((v) => v.step)).toEqual(['c', 'desc']);
    expect(parseNonBlockingSlugs([
      '  c: 10/17 hard-stop=true #44-attributed=0 | X',
      '  red: 7/17 hard-stop=true (non-blocking: doc-only touch or R-DU no-descriptor pending) #44-attributed=0 | X',
    ].join('\n'))).toEqual(['red']);
  });

  // -------------------------------------------------------------------------
  // T6b — REGRESSION: a converted step named `link_x` must never be treated
  // as the in-development ingestor slug `x` just because its name contains
  // `x` as a suffix (the exact confusion T6's removed `RBA_NO_LEDGER_EXEMPT`
  // made). `checkScoreFloor` takes slugs as opaque, case-sensitive exact
  // strings — never a substring/`.includes()` match — so a below-floor
  // `link_massing` row must not silently cover a different, in-development
  // `massing` slug, and vice versa.
  // -------------------------------------------------------------------------
  it('T6b: a gate-F row for "link_massing" does not allow a below-floor "massing" (exact-match only, no substring confusion)', () => {
    const row = {
      gate: 'F', step: 'link_massing', item: gateF.SCORE_ITEM, disposition: 'pending_remediation',
      why: 'w', closing_brief: 'b', filed: '2026-09-26', adjudicated_by: 'operator',
    };
    const out = gateF.checkScoreFloor(
      [{ slug: 'massing', total: 10, maxTotal: 17 }, { slug: 'link_massing', total: 10, maxTotal: 17 }],
      [row],
    );
    expect(out.violations.map((v) => v.step)).toEqual(['massing']);
    expect(out.allowed.map((a) => a.violation.step)).toEqual(['link_massing']);
  });

  // -------------------------------------------------------------------------
  // T6c — ANTI-VACUITY (Spec 124 §7 LM-D14, WF3 lane D4 2026-10-14): a live
  // `--all --fast` run "looked" only if it completed AND printed a score row
  // for at least every converted step. The summary prints at the END of the
  // run, so a timed-out spawn (measured: status null, SIGTERM, ETIMEDOUT,
  // 0 rows) leaves nothing to assert against. Both directions, fixtures only.
  // -------------------------------------------------------------------------
  describe('T6c: notLookedReasons — a run that did not complete is never green', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `  s${i}: 16/17 hard-stop=false #44-attributed=0 | X`).join('\n');
    const done = (stdout: string, status: number | null = 0) => ({ status, signal: null, stdout });
    it('T6c-1: complete run with >= converted rows -> [] (looked)', () => {
      expect(notLookedReasons(done(`[step-validate] summary:\n${rows(3)}\n`), 3)).toEqual([]);
      expect(notLookedReasons(done(`[step-validate] summary:\n${rows(3)}\n`, 1), 3)).toEqual([]);
    });
    it('T6c-2: timed-out spawn (measured shape) -> not looked', () => {
      const r = notLookedReasons({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '' }, 3);
      expect(r.join(' ')).toMatch(/ETIMEDOUT/);
      expect(r.join(' ')).toMatch(/SIGTERM/);
    });
    it('T6c-3: maxBuffer kill -> not looked', () => {
      expect(notLookedReasons({ status: null, signal: 'SIGTERM', error: { code: 'ENOBUFS' }, stdout: 'x' }, 3).join(' ')).toMatch(/ENOBUFS/);
    });
    it('T6c-4: crash before the summary -> not looked', () => {
      expect(notLookedReasons(done('boom', 1), 3).join(' ')).toMatch(/no summary/);
    });
    it('T6c-5: fewer score rows than converted steps -> not looked', () => {
      expect(notLookedReasons(done(`[step-validate] summary:\n${rows(2)}\n`), 3).join(' ')).toMatch(/2 score rows < 3 converted/);
    });
    it('T6c-6: an unexpected exit code -> not looked', () => {
      expect(notLookedReasons(done(`[step-validate] summary:\n${rows(3)}\n`, 2), 3).join(' ')).toMatch(/exit 2/);
    });
    it('T6c-7: parseSummaryScores reads the summary row format', () => {
      expect(parseSummaryScores('  link_massing: 16/17 hard-stop=false #44-attributed=0 | W')).toEqual([
        { slug: 'link_massing', total: 16, maxTotal: 17 },
      ]);
    });
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
