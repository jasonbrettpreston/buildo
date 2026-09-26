// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-BA (gate F);
//            123_step_opt_assessment_validation.md §6 (scorecard G0-G9)
//
// GATE F — UNDERSTANDABLE. Two independent halves, one closed answer set:
//
//   (1) SCORE FLOOR. Spec 123 §6's ship bar ("≥14/17, G6–G8 full,
//       hard-stop=false") has been PROSE since R-R: `step-validate.mjs`'s own
//       docblock says "score below 14/17" but nothing STOPPED. Measured
//       2026-09-25 on the committed reports: `enrich_heritage` 10/17 and
//       `compute_parcel_cost_estimates` 10/17 and `enrich_ravines` 12/17 all
//       exited `step:validate` 0. A scorecard below the floor is now a HARD
//       STOP unless the step carries a dated ledger row
//       `{gate:'F', step, item:'score', disposition:'pending_remediation'}`.
//       The floor is a POLICY CONSTANT, never a step tunable (Rule 3): a
//       per-step floor is exactly the "second copy of a tunable" Rule 3 bans,
//       so `SCORE_FLOOR` is exported and read, never re-declared in a
//       descriptor. An ORPHAN row (a step now at/above the floor, its
//       remediation landed) is RED (R-X closing-row posture).
//
//   (2) LF-ONLY (fast invariant #37). Every file a converted step OWNS must be
//       committed LF: git's INDEX blob is the artifact under review, so an
//       `i/crlf` / `i/mixed` index entry is a diff nobody can read (and, on a
//       Windows checkout with `core.autocrlf=true`, a `\n`-anchored source
//       scan silently stops matching — the same class of defect
//       `programme_record_active_task_2026-08-25.md` row 2 measured live).
//       Fold GC-7 (2026-09-25) adds `i/-text` on a `.js/.mjs/.ts/.tsx/.json`
//       path: git treats the blob as BINARY, so its diff is unreviewable —
//       measured: `src/tests/steps/link_neighbourhoods/violations.test.ts`
//       carries a literal NUL at line 695. `i/-text` on a genuinely binary
//       extension (`.shp`, `.png`, ...) is NOT a violation — that is what
//       binary attributes are FOR.
//
// `ledger.mjs` owns the row shape + the match (GATES already includes 'F');
// this file owns the answer set and the two readers. NOT WIRED YET: the
// orchestrator adds fast invariant #37 (after id 32) and the
// `computeScorecard(` hook that calls `floorDecision(`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { matchLedger, loadLedger, LEDGER_REL_PATH, GATES } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CONVERTED_REL_PATH = 'scripts/steps/_schema/converted.json';

/** Spec 123 §6 / Spec 124 Rule 13 (R-BA) — policy constant, not a step tunable. */
export const SCORE_FLOOR = 14;

/** The closed set of extensions whose CRLF/NUL-bound blob is a review defect. */
export const TEXT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json'];

/** The one item a gate-F score-floor row names. */
export const SCORE_ITEM = 'score';

/** Gate F's declared dispositions — a floor row is always pending remediation. */
export const GATE_F_DISPOSITIONS = ['pending_remediation'];

// Self-check: the shared allowlist must already speak gate F, or every row this
// module asks about would be silently orphaned by `matchLedger`'s gate filter.
if (!GATES.includes('F')) {
  throw new Error(`ledger.mjs GATES omits 'F' — gate F cannot be ledger-allowed (${GATES.join('/')})`);
}

/**
 * The gate-F decision for ONE step's scorecard. PURE — the ledger fact is
 * applied by the caller from `matchLedger('F', ...)` output (or `floorDecision`
 * below). A step AT or ABOVE the floor passes with no reason; a step BELOW it
 * hard-stops unless its own `item:'score'` row allows it.
 *
 * @param {{slug: string, total: number, maxTotal: number}} score
 * @returns {{belowFloor: boolean, hardStop: boolean, reason: string|null}}
 */
export function floorViolation({ slug, total, maxTotal }) {
  if (total >= SCORE_FLOOR) return { belowFloor: false, hardStop: false, reason: null };
  return {
    belowFloor: true,
    hardStop: true,
    reason: `score floor ${total}/${maxTotal} < ${SCORE_FLOOR}`,
  };
}

/**
 * `floorDecision(` — the wiring seam `computeScorecard(` calls after
 * `aggregateHardStop(`. `ledgerRows` is the whole ledger's `rows` array.
 *
 * Returns `{hardStop, reason, allowedByLedger, orphan}`:
 *   - below floor + no row  -> `{hardStop:true, reason, allowedByLedger:false}`
 *   - below floor + row     -> `{hardStop:false, reason:null, allowedByLedger:true}`
 *   - at/above floor        -> `{hardStop:false, reason:null}`, and a row for a
 *     step now at/above the floor is an ORPHAN -> `orphan:true` (RED, R-X).
 *
 * @param {{slug: string, total: number, maxTotal: number}} score
 * @param {Array<object>} ledgerRows
 */
export function floorDecision(score, ledgerRows) {
  const { slug } = score;
  const v = floorViolation(score);
  const rows = (Array.isArray(ledgerRows) ? ledgerRows : [])
    .filter((r) => r && r.gate === 'F' && r.item === SCORE_ITEM && r.step === slug);
  if (!v.belowFloor) {
    return { hardStop: false, reason: null, allowedByLedger: false, orphan: rows.length > 0, row: rows[0] || null };
  }
  if (rows.length > 0) {
    return { hardStop: false, reason: null, allowedByLedger: true, orphan: false, row: rows[0] };
  }
  return { hardStop: true, reason: v.reason, allowedByLedger: false, orphan: false, row: null };
}

/**
 * Gate F's score-floor half over the whole fleet. An ORPHAN makes `pass` false.
 *
 * @param {Array<{slug: string, total: number, maxTotal: number, stage?: string}>} scorecards
 * @param {Array<object>} ledgerRows
 * @param {(slug: string) => boolean} [isStageGated]
 *   A stage-gated step (a `converted.json.pending` entry whose declared `stage`
 *   is not the terminal `'shape_clean'`) is EXCLUDED — the same posture
 *   `stageExclusions(` takes in `step-validate.mjs`: the artifact being scored
 *   does not exist yet, so its low score is undecidable-not-unmet.
 */
export function checkScoreFloor(scorecards, ledgerRows, isStageGated = () => false) {
  const violations = [];
  const orphans = [];
  const allowed = [];
  for (const sc of Array.isArray(scorecards) ? scorecards : []) {
    if (!sc || typeof sc.slug !== 'string') continue;
    if (isStageGated(sc.slug)) continue;
    const d = floorDecision(sc, ledgerRows);
    if (d.hardStop) violations.push({ step: sc.slug, item: SCORE_ITEM, detail: d.reason });
    else if (d.orphan) orphans.push({ step: sc.slug, item: SCORE_ITEM });
    else if (d.allowedByLedger) allowed.push({ violation: { step: sc.slug, item: SCORE_ITEM }, row: d.row });
  }
  const blockedSlugs = [...new Set(violations.map((v) => v.step))];
  const detail = (violations.length || orphans.length)
    ? `SCORE-FLOOR (gate F): ${violations.length} step(s) below ${SCORE_FLOOR}/17`
      + (violations.length ? ` [${violations.map((v) => `${v.step} ${v.detail}`).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
      + (orphans.length ? ` [${orphans.map((o) => `${o.step} ${o.item}`).join('; ')}]` : '')
    : `SCORE-FLOOR (gate F): every scored step at/above ${SCORE_FLOOR}/17 `
      + `(${allowed.length} ledger-allowed below-floor)`;
  return { pass: violations.length === 0 && orphans.length === 0, blockedSlugs, detail, violations, orphans, allowed };
}

// ---------------------------------------------------------------------------
// LF-only half (fast invariant #37)
// ---------------------------------------------------------------------------

/** Parse `git ls-files --eol` output into `[{eol, attr, path}]`. PURE. */
export function parseLsFilesEol(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    // `<i/w> <attr> <eol> <path>` — four whitespace-separated fields, the path
    // last (so a path containing a space survives the split).
    const m = /^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!m) continue;
    rows.push({ indexEol: String(m[1]), worktreeEol: String(m[2]), attr: String(m[3]), file: String(m[4]) });
  }
  return rows;
}

/** True when this path's extension is one git must not treat as binary. */
export function isTextPath(file) {
  const lower = String(file).toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The LF violations in ONE `git ls-files --eol` parse. PURE. The INDEX field
 * (`i/...`) is compared, never the working-tree field: `core.autocrlf` rewrites
 * the checkout, so only the committed blob is evidence.
 *
 * @param {Array<{indexEol: string, attr: string, file: string}>} rows
 * @returns {Array<{step: string, item: string, detail: string}>}
 */
export function eolViolations(rows, step = '(registry)') {
  const violations = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const bad = r.indexEol === 'i/crlf' || r.indexEol === 'i/mixed'
      || (r.indexEol === 'i/-text' && isTextPath(r.file));
    if (!bad) continue;
    const why = r.indexEol === 'i/-text'
      ? 'git treats this text path as BINARY (a NUL-bound blob) — its diff is unreviewable'
      : `committed with ${r.indexEol.slice(2)} line endings — the index blob is the artifact under review`;
    violations.push({ step, item: `eol:${r.file}`, detail: `${r.file}: ${why}` });
  }
  return violations;
}

/** Gate F's LF half over a fleet. An ORPHAN row makes `pass` false (R-X).
 * Scoped to `item:` starting `eol:` — gate F is shared with the SCORE_ITEM
 * half (`checkScoreFloor`), and an un-scoped `matchLedger('F', ...)` call
 * would report every gate-F score row as an orphan of the EOL check (it
 * never appears in `violations`, which are only ever eol: items). */
export function checkEol(text, ledgerRows, step = '(registry)') {
  const violations = eolViolations(parseLsFilesEol(text), step);
  const eolRows = (Array.isArray(ledgerRows) ? ledgerRows : []).filter((r) => r && typeof r.item === 'string' && r.item.startsWith('eol:'));
  const { unallowed, orphans, allowed } = matchLedger('F', violations, eolRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const detail = (unallowed.length || orphans.length)
    ? `LF-ONLY (gate F): ${unallowed.length} path(s) not committed LF`
      + (unallowed.length ? ` [${unallowed.map((v) => v.item).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
      + (orphans.length ? ` [${orphans.map((o) => o.item).join('; ')}]` : '')
    : `LF-ONLY (gate F): ${violations.length} path(s) checked, all LF (${allowed.length} ledger-allowed)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed };
}

/** Every committed file a converted step owns (shell, descriptor, notes, compute, tests). */
export function stepFileCandidates(repoRoot, descriptor) {
  const slug = (descriptor && descriptor.identity && descriptor.identity.name) || null;
  if (!slug) return [];
  const shellGuess = `scripts/${slug.replace(/_/g, '-')}.js`;
  const base = shellGuess.replace(/\.js$/, '');
  const out = [
    shellGuess,
    `${base}.descriptor.json`,
    `${base}.notes.json`,
    `scripts/lib/compute/${path.basename(base)}.js`,
  ];
  return out;
}

/**
 * `git ls-files --eol` over the derived paths. The real read used by the
 * (orchestrator-landed) fast invariant #37. Returns `{text, status}`; a git
 * failure is surfaced, never swallowed into a vacuous pass.
 */
export function lsFilesEol(repoRoot = REPO_ROOT, paths = []) {
  const res = spawnSync('git', ['ls-files', '--eol', '--', ...paths], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error) throw new Error(`git ls-files --eol failed to spawn: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`git ls-files --eol exited ${res.status}: ${(res.stderr || '').trim()}`);
  return res.stdout || '';
}

/** The converted fleet's slugs + report scorecard paths, derived from converted.json. */
export function loadConvertedSlugs(repoRoot = REPO_ROOT) {
  const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, CONVERTED_REL_PATH), 'utf8'));
  return (Array.isArray(parsed.converted) ? parsed.converted : []).map((rel) =>
    path.basename(String(rel)).replace(/\.js$/, '').replace(/-/g, '_'));
}

// ---------------------------------------------------------------------------
// selfTestCases() — the fixture pairs a both-directions test drives. Each case is
// `{name, run, expect}` where `expect` is the exact reproduction of a known-bad
// or known-good input; a checker never proven to fire is not a check.
// ---------------------------------------------------------------------------

/** Fixture ledger rows for gate F's two items. */
export function selfTestCases() {
  const scoreRow = {
    gate: 'F', step: 'fixture_step', item: SCORE_ITEM, disposition: 'pending_remediation',
    why: 'w', closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row F',
    filed: '2026-09-25', adjudicated_by: 'operator',
  };
  const eolRow = {
    gate: 'F', step: '(registry)', item: 'eol:docs/x.ts', disposition: 'pending_remediation',
    why: 'w', closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row F (eol)',
    filed: '2026-09-25', adjudicated_by: 'operator',
  };
  const crlf = 'i/crlf w/crlf attr/ docs/x.ts';
  const lf = 'i/lf w/lf attr/ docs/x.ts';
  const mixed = 'i/mixed w/mixed attr/ docs/x.ts';
  const nulTs = 'i/-text w/-text attr/ docs/x.ts';
  const nulShp = 'i/-text w/-text attr/ docs/geom.shp';

  const cases = [
    // (1) 10/17 with NO row -> hard stop, reason names the floor.
    {
      name: '10/17 no ledger row -> hardStop with the floor reason',
      run: () => floorDecision({ slug: 'fixture_step', total: 10, maxTotal: 17 }, []),
      expect: { hardStop: true, reason: `score floor 10/17 < ${SCORE_FLOOR}` },
    },
    // (2) 10/17 + its row -> allowed, no hard stop.
    {
      name: '10/17 with a gate-F score row -> allowed, no hard stop',
      run: () => floorDecision({ slug: 'fixture_step', total: 10, maxTotal: 17 }, [scoreRow]),
      expect: { hardStop: false, allowedByLedger: true, reason: null },
    },
    // (3) exactly 14/17 -> no stop (the floor is inclusive: >= 14).
    {
      name: '14/17 exactly -> no hard stop (floor is inclusive)',
      run: () => floorDecision({ slug: 'fixture_step', total: 14, maxTotal: 17 }, []),
      expect: { hardStop: false, reason: null },
    },
    // (4) 16/17 + a row -> the row is an ORPHAN (RED, R-X).
    {
      name: '16/17 with a leftover score row -> orphan RED',
      run: () => floorDecision({ slug: 'fixture_step', total: 16, maxTotal: 17 }, [scoreRow]),
      expect: { hardStop: false, orphan: true },
    },
    // (5) EOL — index crlf -> RED.
    {
      name: 'i/crlf -> RED',
      run: () => eolViolations(parseLsFilesEol(crlf)),
      expect: { count: 1, item: 'eol:docs/x.ts' },
    },
    // (6) EOL — index lf -> GREEN.
    { name: 'i/lf -> GREEN', run: () => eolViolations(parseLsFilesEol(lf)), expect: { count: 0 } },
    // (7) EOL — index mixed -> RED.
    { name: 'i/mixed -> RED', run: () => eolViolations(parseLsFilesEol(mixed)), expect: { count: 1 } },
    // (8) EOL — index -text on a TEXT path -> RED (Fold GC-7).
    { name: 'i/-text on .ts -> RED', run: () => eolViolations(parseLsFilesEol(nulTs)), expect: { count: 1 } },
    // (9) EOL — index -text on a genuinely binary path -> GREEN.
    { name: 'i/-text on .shp -> GREEN', run: () => eolViolations(parseLsFilesEol(nulShp)), expect: { count: 0 } },
    // (10) an eol violation with its ledger row -> allowed.
    {
      name: 'eol RED with a matching gate-F row -> allowed',
      run: () => checkEol(crlf, [eolRow]),
      expect: { pass: true, unallowed: 0 },
    },
  ];
  return cases;
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const cases = selfTestCases();
  for (const c of cases) {
    const got = c.run();
    const e = c.expect;
    if (e.count !== undefined) {
      if (!Array.isArray(got) || got.length !== e.count) {
        throw new Error(`self-test FAILED (${c.name}): got ${JSON.stringify(got)}`);
      }
      if (e.item !== undefined && got[0] && got[0].item !== e.item) {
        throw new Error(`self-test FAILED (${c.name}): wrong item ${JSON.stringify(got[0])}`);
      }
    }
    if (e.hardStop !== undefined && got.hardStop !== e.hardStop) {
      throw new Error(`self-test FAILED (${c.name}): hardStop ${got.hardStop} (${JSON.stringify(got)})`);
    }
    if (e.reason !== undefined && got.reason !== e.reason) {
      throw new Error(`self-test FAILED (${c.name}): reason ${JSON.stringify(got.reason)}`);
    }
    if (e.allowedByLedger !== undefined && got.allowedByLedger !== e.allowedByLedger) {
      throw new Error(`self-test FAILED (${c.name}): allowedByLedger ${got.allowedByLedger}`);
    }
    if (e.orphan !== undefined && got.orphan !== e.orphan) {
      throw new Error(`self-test FAILED (${c.name}): orphan ${got.orphan}`);
    }
    if (e.pass !== undefined && got.pass !== e.pass) {
      throw new Error(`self-test FAILED (${c.name}): pass ${got.pass} (${JSON.stringify(got)})`);
    }
    if (e.unallowed !== undefined && (got.unallowed || []).length !== e.unallowed) {
      throw new Error(`self-test FAILED (${c.name}): unallowed ${JSON.stringify(got.unallowed)}`);
    }
  }
  // A stage-gated step is EXCLUDED from the fleet walk (undecidable-not-unmet).
  const gated = checkScoreFloor(
    [{ slug: 'fixture_step', total: 3, maxTotal: 17 }], [], (slug) => slug === 'fixture_step');
  if (!gated.pass || gated.violations.length) {
    throw new Error(`self-test FAILED (stage-gated exclusion): ${JSON.stringify(gated)}`);
  }
  // An ORPHAN row at fleet level is RED.
  const orphanRow = {
    gate: 'F', step: 'fixture_step', item: SCORE_ITEM, disposition: 'pending_remediation',
    why: 'w', closing_brief: 'b', filed: '2026-09-25', adjudicated_by: 'operator',
  };
  const orph = checkScoreFloor(
    [{ slug: 'fixture_step', total: 17, maxTotal: 17 }], [orphanRow]);
  if (orph.pass || orph.orphans.length !== 1) {
    throw new Error(`self-test FAILED (fleet orphan): ${JSON.stringify(orph)}`);
  }
  // A below-floor step with its row is allowed at fleet level, not blocked.
  const allowedFleet = checkScoreFloor(
    [{ slug: 'fixture_step', total: 10, maxTotal: 17 }], [orphanRow]);
  if (!allowedFleet.pass || allowedFleet.allowed.length !== 1) {
    throw new Error(`self-test FAILED (fleet ledger-allowed): ${JSON.stringify(allowedFleet)}`);
  }
}

/** CLI — `--list` prints orchestrator-pasteable rows for every CURRENT unallowed violation. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('score-floor self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const { rows } = loadLedger(REPO_ROOT);
    const out = [];
    for (const slug of loadConvertedSlugs(REPO_ROOT)) {
      const hit = fs.readdirSync(path.join(REPO_ROOT, 'docs/reports'))
        .find((f) => f.includes(slug.replace(/_/g, '-')));
      if (!hit) continue;
      const text = fs.readFileSync(path.join(REPO_ROOT, 'docs/reports', hit), 'utf8');
      const m = /^\*\*Score: (\d+)\/(\d+)\*\*/m.exec(text);
      if (!m) continue;
      const d = floorDecision({ slug, total: Number(m[1]), maxTotal: Number(m[2]) }, rows);
      if (d.hardStop) {
        out.push({ gate: 'F', step: slug, item: SCORE_ITEM, disposition: 'pending_remediation',
          why: d.reason, closing_brief: `wf2-remediate-${slug.replace(/_/g, '-')}`,
          filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator' });
      }
    }
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: score-floor.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH };
