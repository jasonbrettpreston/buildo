#!/usr/bin/env node
/**
 * PH-2 churn × complexity BATCH generator — Spec 123 §2 ("BATCH, once") + §6 (gate G2).
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §2, §6 (G2)
 * SPEC LINK: docs/specs/01-pipeline/121_assessment_and_verification_methodology.md §3 PH-2, §12b.6 (self-test / refuse-to-emit)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.4 A3 (`reconcile` is chain-head infrastructure, not a domain step)
 *
 * WHY THIS EXISTS. Gate G2 ("structure — churn × complexity, four quadrants... the
 * top-right quadrant, named", Spec 123 §6) was never actually run as the BATCH pass
 * Spec 123 §2 defines it to be — every report that scored G2=1 did so through the
 * `ASSESSMENT-INCOMPLETE` waiver, never through a real plot. This tool IS that batch
 * pass: one deterministic table, over every domain step, run once and re-verified
 * for drift rather than hand-edited or re-derived per report.
 *
 * POPULATION (27, not manifest.chains.sources' raw 28): `reconcile` is chain-head
 * infrastructure per Spec 122 §7.4 A3, not a domain step — it is excluded from the
 * churn/complexity population and the median-split quadrant computation, but still
 * gets a row in the generated table (marked `excluded: chain-head (A3)`) so every
 * manifest.chains.sources slug is accounted for.
 *
 * METRICS.
 *   churn_score      = commits touching the file, `git log <window_end> --follow
 *                       --numstat --format=%H -- <file>` (lines_changed = Σ added+
 *                       deleted, reported alongside, not blended into the score).
 *   complexity_score  = branches — a cyclomatic-complexity PROXY counting
 *                       if/for/while/case/catch/&&/||/??/?: over a comment-and-
 *                       string-stripped copy of the file's content AT window_end
 *                       (`git show <window_end>:<file>`). LOC (non-blank,
 *                       non-comment lines of the same stripped copy) is reported
 *                       alongside, not blended.
 *   No AST parser — this is a declared, self-tested REGEX proxy (Spec 121 §12b.6:
 *   the stripper+counter is the risk, so it is what the self-test pins).
 *
 * QUADRANTS. Population-relative MEDIAN split on both axes (median, not mean —
 * churn is long-tailed). `top-right` = churn >= median_churn AND complexity >=
 * median_complexity; the other three named symmetrically. Ties land on the high
 * side (`>=`), so the assignment is reproducible from the two median numbers alone.
 *
 * DETERMINISM. The table's header records `window_end` (a full commit SHA).
 * `--check` re-derives every column AT THAT SHA (never HEAD) and compares against
 * the committed file byte-for-byte — a hand-edited row, or a rebase that drops the
 * recorded window_end from history, both fail loudly. `--refresh` advances
 * window_end to the CURRENT HEAD and rewrites the whole table.
 *
 * Usage:
 *   node scripts/analysis/step-churn-complexity.mjs --refresh     (write, window_end := HEAD)
 *   node scripts/analysis/step-churn-complexity.mjs --check       (drift -> exit 1, writes nothing)
 *   node scripts/analysis/step-churn-complexity.mjs --self-test   (Spec 121 §12b.6 proof, no I/O beyond git)
 *
 * Exit codes: 0 = clean · 1 = drift (--check) or a bad window_end · 2 = self-test failed / bad setup.
 */
'use strict';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
// BUILDO_CHURN_TABLE_PATH is a TEST-ONLY override (same convention as
// step-validate.mjs's CHURN_TABLE_PATH / BUILDO_PROGRAMME_ITEMS_PATH) so
// src/tests/step-conformance.infra.test.ts can point `--check` at a fixture
// file (e.g. a hand-tampered row) without touching the real committed table.
export const TABLE_PATH = process.env.BUILDO_CHURN_TABLE_PATH
  ? path.join(REPO_ROOT, process.env.BUILDO_CHURN_TABLE_PATH)
  : path.join(REPO_ROOT, 'docs/reports/generated/122-churn-complexity.md');

// `reconcile` is chain-head infrastructure (Spec 122 §7.4 A3) — a real row is
// still emitted (every manifest.chains.sources slug is covered, per the
// conformance lock), but it never enters the population or the median split.
export const EXCLUDED_SLUGS = ['reconcile'];
const EXCLUDED_REASON = { reconcile: 'excluded: chain-head (A3)' };

// ---------------------------------------------------------------------------
// git — every invocation checked for non-zero exit and THROWS. A failed `git
// log`/`git show` must never read as "0 commits" / "empty file" — that is the
// exact silent-zero, vacuous-green class this instrument exists to kill.
// ---------------------------------------------------------------------------
function runGit(args, { allowNonZero = false } = {}) {
  const res = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.error) throw new Error(`git ${args.join(' ')} failed to spawn: ${res.error.message}`);
  if (!allowNonZero && res.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${res.status}: ${(res.stderr || '').trim()}`);
  }
  return res;
}

function currentHeadSha() {
  return runGit(['rev-parse', 'HEAD']).stdout.trim();
}

/** true/false — never throws; a bad/missing sha is a legitimate "not an ancestor" answer. */
function isAncestorOfHead(sha) {
  const res = runGit(['merge-base', '--is-ancestor', sha, 'HEAD'], { allowNonZero: true });
  return res.status === 0;
}

/** `{commits, linesChanged}` for `file`, over history reachable from `sha`. */
function computeChurn(file, sha) {
  const res = runGit([
    'log', sha, '--follow', '--numstat', '--format=%H', '--', file,
  ]);
  const lines = res.stdout.split('\n');
  const commits = new Set();
  let linesChanged = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^[0-9a-f]{40}$/.test(line)) {
      commits.add(line);
      continue;
    }
    // `<added>\t<deleted>\t<path>` — `-` for a binary file's add/del column.
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (m) {
      linesChanged += (m[1] === '-' ? 0 : Number(m[1])) + (m[2] === '-' ? 0 : Number(m[2]));
    }
  }
  return { commits: commits.size, linesChanged };
}

/** File content at `sha` — throws if the file did not exist at that commit. */
function readFileAtSha(file, sha) {
  return runGit(['show', `${sha}:${file}`]).stdout;
}

// ---------------------------------------------------------------------------
// The regex proxy — no JS parser is a declared dependency of this repo, and
// pulling one in for a *proxy* metric is unearned weight (plan ruling). The
// stripper is the risk; selfTest() pins it against decoys (comment/string
// text that must NOT be counted).
// ---------------------------------------------------------------------------

/**
 * Character-level stripper: replaces block comments, line comments, and
 * string/template-literal CONTENT with spaces — preserving every newline (and
 * therefore every line number) so LOC and per-line reasoning stay accurate.
 * Regex literals are not special-cased (out of scope, Spec 121 §12b.6 — the
 * proxy's declared risk is the stripper+counter pinned by the fixture below,
 * not full JS-lexer fidelity).
 */
export function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      out += '  ';
      i += 2;
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += ' ';
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) { out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += ' '; i++; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Non-blank lines of an already-stripped source. */
export function countLoc(stripped) {
  return stripped.split('\n').filter((l) => l.trim().length > 0).length;
}

// `if` also matches the `if (` half of `else if (` — both are decision points
// (McCabe); a bare `else` with no `if` adds none, so it is deliberately not a
// separate token. `?:` excludes `?.` (optional chaining) and either half of
// `??` (nullish coalescing, counted by its own token).
const BRANCH_PATTERNS = [
  { name: 'if', re: /\bif\s*\(/g },
  { name: 'for', re: /\bfor\s*\(/g },
  { name: 'while', re: /\bwhile\s*\(/g },
  { name: 'case', re: /\bcase\b/g },
  { name: 'catch', re: /\bcatch\s*[({]/g },
  { name: '&&', re: /&&/g },
  { name: '||', re: /\|\|/g },
  { name: '??', re: /\?\?/g },
  { name: '?:', re: /(?<!\?)\?(?!\.|\?)/g },
];

/** `{total, breakdown}` over an already-stripped source. */
export function countBranches(stripped) {
  const breakdown = {};
  let total = 0;
  for (const { name, re } of BRANCH_PATTERNS) {
    const n = (stripped.match(re) || []).length;
    breakdown[name] = n;
    total += n;
  }
  return { total, breakdown };
}

function computeComplexity(file, sha) {
  const stripped = stripCommentsAndStrings(readFileAtSha(file, sha));
  return { loc: countLoc(stripped), branches: countBranches(stripped).total };
}

// ---------------------------------------------------------------------------
// Population + quadrants
// ---------------------------------------------------------------------------
function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/** `[{slug, file}]` for every manifest.chains.sources entry — never hand-maintained. */
export function loadPopulation(manifest = loadManifest()) {
  return manifest.chains.sources.map((slug) => {
    const entry = manifest.scripts[slug];
    if (!entry || !entry.file) throw new Error(`manifest.scripts has no file entry for chains.sources slug "${slug}"`);
    return { slug, file: entry.file };
  });
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Assigns a quadrant to every non-excluded row via a population-relative
 * MEDIAN split (median, not mean — churn is long-tailed) on both axes. Ties
 * land on the high side (`>=`), so the split is reproducible from the two
 * medians alone. Mutates and returns `rows`; excluded rows are left untouched
 * (their `quadrant` stays the EXCLUDED_REASON sentinel set by the caller).
 */
export function assignQuadrants(rows) {
  const scored = rows.filter((r) => !r.excluded);
  const medianChurn = median(scored.map((r) => r.commits));
  const medianComplexity = median(scored.map((r) => r.branches));
  for (const r of scored) {
    const high = r.commits >= medianChurn;
    const wide = r.branches >= medianComplexity;
    r.quadrant = high && wide ? 'top-right' : high && !wide ? 'bottom-right' : !high && wide ? 'top-left' : 'bottom-left';
  }
  return { medianChurn, medianComplexity };
}

// ---------------------------------------------------------------------------
// Render — deterministic given (windowEnd, rows). `--refresh` computes rows at
// HEAD; `--check` re-computes rows at the COMMITTED window_end and diffs the
// re-render byte-for-byte against the file on disk (mirrors
// generate-programme-backlog.mjs's own --check pattern).
// ---------------------------------------------------------------------------
function fmt(v) {
  return v === null || v === undefined ? '—' : String(v);
}

export function render(windowEnd, rows, medians) {
  const lines = [];
  lines.push('# Spec 122/123 PH-2 — churn × complexity (generated)');
  lines.push('');
  lines.push('<!-- GENERATED by scripts/analysis/step-churn-complexity.mjs - do not hand-edit. -->');
  lines.push('<!-- Regenerate: npm run churn-complexity -- --refresh -->');
  lines.push('');
  lines.push('> SPEC LINK: `docs/specs/01-pipeline/123_step_opt_assessment_validation.md` §2, §6 (G2)');
  lines.push(`> window_end: \`${windowEnd}\` (must be an ancestor of HEAD — \`--check\` enforces this and recomputes every column at this SHA, never HEAD)`);
  lines.push('> Population: 27 domain steps (`manifest.chains.sources` minus `reconcile`, chain-head infrastructure per Spec 122 §7.4 A3 — excluded from the population and the median split; still listed below for coverage).');
  lines.push(`> Median split (ties → high side, \`>=\` on both axes): median churn (commits) = ${medians.medianChurn} · median complexity (branches) = ${medians.medianComplexity}`);
  lines.push('');
  const topRight = rows.filter((r) => !r.excluded && r.quadrant === 'top-right').map((r) => r.slug).sort();
  lines.push(`## Top-right quadrant (named) — ${topRight.length}`);
  lines.push('');
  if (topRight.length === 0) {
    lines.push('_none_');
  } else {
    for (const slug of topRight) lines.push(`- ${slug}`);
  }
  lines.push('');
  lines.push('## All steps');
  lines.push('');
  lines.push('| slug | file | commits | lines_changed | LOC | branches | quadrant |');
  lines.push('|---|---|---:|---:|---:|---:|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.slug} | \`${r.file}\` | ${fmt(r.commits)} | ${fmt(r.linesChanged)} | ${fmt(r.loc)} | ${fmt(r.branches)} | ${r.quadrant} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Pure parse of a rendered table back into `{windowEnd, rows: Map<slug, {quadrant}>}`.
 * Split out from disk I/O (mirrors `validateNotesFences`/`parseDefectLedgerRow` in
 * step-validate.mjs) so it is self-testable in-memory. `quadrant` is `null` for an
 * excluded row or a genuinely empty cell — both read as "no quadrant" downstream.
 */
export function parseChurnTable(text) {
  const windowMatch = /window_end:\s*`([0-9a-f]{40})`/.exec(text);
  const windowEnd = windowMatch ? windowMatch[1] : null;
  const bySlug = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    if (/^\|[-\s|:]+\|$/.test(line)) continue; // separator row
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] and cells[last] are the empty boundary strings from a leading/
    // trailing '|'; the 7 declared columns live at cells[1..7].
    const slug = cells[1];
    const quadrantRaw = cells[7];
    if (!slug || slug === 'slug') continue; // header row guard
    const quadrant = quadrantRaw && quadrantRaw.length > 0 && !quadrantRaw.startsWith('excluded') ? quadrantRaw : null;
    bySlug.set(slug, { quadrant });
  }
  return { windowEnd, bySlug };
}

// ---------------------------------------------------------------------------
// Self-test (Spec 121 §12b.6) — main() refuses to emit unless this passes.
// Mirrors scripts/violations/plan-claims.mjs's selfTest()/refuse-to-emit shape.
// ---------------------------------------------------------------------------
const FIXTURE_SOURCE = `// if this is a comment, it must not count: if (x) {}
const s = "a && b to ignore, and a ?? c, also a ? b : c inside a string";
function f(a, b) {
  if (a > 0) {
    return a;
  } else if (b > 0) { // else if decoy comment && ignored
    return b;
  }
  for (let i = 0; i < 10; i++) {
    while (i < 5) {
      switch (a) {
        case 1:
        case 2:
          break;
        default:
          break;
      }
      try {
        doThing();
      } catch (e) {
        log(e);
      }
      const x = a && b || c;
      const y = a ?? b;
      const z = a ? b : c;
      i++;
    }
  }
  return null;
}
`;
// Hand-counted (verified 2026-09-03 by running the real stripper/counter against
// this exact fixture): if×2 (plain + else-if) + for×1 + while×1 + case×2 +
// catch×1 + &&×1 + ||×1 + ??×1 + ?:×1 = 11 branches, 29 non-blank stripped lines.
// A stripper that fails to remove line comments (the historical bug this proves
// against) instead counts 13 — proven by hand during C1, see the commit body.
const FIXTURE_EXPECTED_BRANCHES = 11;
const FIXTURE_EXPECTED_LOC = 29;

export function selfTest() {
  const fail = [];

  const stripped = stripCommentsAndStrings(FIXTURE_SOURCE);
  const { total: branchTotal } = countBranches(stripped);
  const loc = countLoc(stripped);
  if (branchTotal !== FIXTURE_EXPECTED_BRANCHES) {
    fail.push(`branch counter: expected ${FIXTURE_EXPECTED_BRANCHES}, got ${branchTotal} (comment/string decoys leaked into the count, or a real branch was missed)`);
  }
  if (loc !== FIXTURE_EXPECTED_LOC) {
    fail.push(`LOC counter: expected ${FIXTURE_EXPECTED_LOC}, got ${loc}`);
  }
  // Comment/string decoys must not survive stripping.
  if (/if \(x\)/.test(stripped) || /decoy/.test(stripped)) fail.push('a line-comment decoy survived stripping');
  if (/a && b to ignore/.test(stripped)) fail.push('a string-literal decoy survived stripping');

  // assignQuadrants — median split + tie-to-high-side, on a small known set.
  {
    const rows = [
      { slug: 'a', commits: 1, branches: 1 },
      { slug: 'b', commits: 5, branches: 5 },
      { slug: 'c', commits: 10, branches: 10 },
    ];
    const { medianChurn, medianComplexity } = assignQuadrants(rows);
    if (medianChurn !== 5 || medianComplexity !== 5) fail.push(`assignQuadrants: expected medians (5,5), got (${medianChurn},${medianComplexity})`);
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.quadrant]));
    if (bySlug.a !== 'bottom-left') fail.push(`assignQuadrants: 'a' (below both medians) expected bottom-left, got ${bySlug.a}`);
    // 'b' sits exactly ON both medians — the tie must land HIGH (top-right), not low.
    if (bySlug.b !== 'top-right') fail.push(`assignQuadrants: 'b' (a tie on both axes) expected top-right (ties land high), got ${bySlug.b}`);
    if (bySlug.c !== 'top-right') fail.push(`assignQuadrants: 'c' (above both medians) expected top-right, got ${bySlug.c}`);
  }

  // parseChurnTable — round-trips a rendered fixture, and correctly reads an
  // excluded row and a genuinely empty quadrant cell as "no quadrant" (null).
  {
    const fixtureRows = [
      { slug: 'reconcile', file: 'scripts/reconcile-runs.js', commits: null, linesChanged: null, loc: null, branches: null, quadrant: EXCLUDED_REASON.reconcile, excluded: true },
      { slug: 'assert_schema', file: 'scripts/quality/assert-schema.js', commits: 38, linesChanged: 500, loc: 400, branches: 60, quadrant: 'top-right' },
      { slug: 'load_ravines', file: 'scripts/load-ravines.js', commits: 3, linesChanged: 10, loc: 50, branches: 2, quadrant: '' },
    ];
    const rendered = render('a'.repeat(40), fixtureRows, { medianChurn: 20, medianComplexity: 10 });
    const parsed = parseChurnTable(rendered);
    if (parsed.windowEnd !== 'a'.repeat(40)) fail.push(`parseChurnTable: window_end round-trip failed (got ${parsed.windowEnd})`);
    if (parsed.bySlug.get('assert_schema')?.quadrant !== 'top-right') fail.push('parseChurnTable: did not read a real quadrant back');
    if (parsed.bySlug.get('reconcile')?.quadrant !== null) fail.push(`parseChurnTable: an "excluded" row must parse as quadrant=null, got ${JSON.stringify(parsed.bySlug.get('reconcile'))}`);
    if (parsed.bySlug.get('load_ravines')?.quadrant !== null) fail.push('parseChurnTable: a genuinely empty quadrant cell must parse as null, not an empty-string "hit"');
  }

  if (fail.length) {
    console.error('[step-churn-complexity] self-test FAILED:');
    for (const f of fail) console.error(`  - ${f}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function computeAllRows(sha) {
  const population = loadPopulation();
  const rows = [];
  for (const { slug, file } of population) {
    if (EXCLUDED_SLUGS.includes(slug)) {
      rows.push({ slug, file, commits: null, linesChanged: null, loc: null, branches: null, quadrant: EXCLUDED_REASON[slug], excluded: true });
      continue;
    }
    const { commits, linesChanged } = computeChurn(file, sha);
    const { loc, branches } = computeComplexity(file, sha);
    rows.push({ slug, file, commits, linesChanged, loc, branches, quadrant: null, excluded: false });
  }
  const medians = assignQuadrants(rows);
  return { rows, medians };
}

function doRefresh() {
  const sha = currentHeadSha();
  const { rows, medians } = computeAllRows(sha);
  const rendered = render(sha, rows, medians);
  mkdirSync(path.dirname(TABLE_PATH), { recursive: true });
  writeFileSync(TABLE_PATH, rendered);
  const topRight = rows.filter((r) => !r.excluded && r.quadrant === 'top-right').length;
  console.log(`[step-churn-complexity] wrote ${path.relative(REPO_ROOT, TABLE_PATH)} — window_end=${sha.slice(0, 7)}, 27 domain steps (+1 excluded), top-right=${topRight}, median churn=${medians.medianChurn}, median complexity=${medians.medianComplexity}`);
}

function doCheck() {
  if (!existsSync(TABLE_PATH)) {
    console.error(`[step-churn-complexity] DRIFT — ${path.relative(REPO_ROOT, TABLE_PATH)} does not exist. Run \`npm run churn-complexity -- --refresh\`.`);
    return 1;
  }
  const current = readFileSync(TABLE_PATH, 'utf8');
  const { windowEnd } = parseChurnTable(current);
  if (!windowEnd) {
    console.error('[step-churn-complexity] DRIFT — the committed table has no parseable window_end header.');
    return 1;
  }
  if (!isAncestorOfHead(windowEnd)) {
    console.error(`[step-churn-complexity] STALE window_end — ${windowEnd} is not an ancestor of HEAD (a rebase/dangling window). Run \`npm run churn-complexity -- --refresh\`.`);
    return 1;
  }
  const { rows, medians } = computeAllRows(windowEnd);
  const rendered = render(windowEnd, rows, medians);
  if (rendered !== current) {
    console.error(`[step-churn-complexity] DRIFT — ${path.relative(REPO_ROOT, TABLE_PATH)} does not match a re-render at its own recorded window_end (${windowEnd.slice(0, 7)}). Either the file was hand-edited, or run \`npm run churn-complexity -- --refresh\` to advance the window.`);
    return 1;
  }
  console.log(`[step-churn-complexity] clean — no drift at window_end=${windowEnd.slice(0, 7)}`);
  return 0;
}

function main(argv) {
  if (!selfTest()) {
    console.error('[step-churn-complexity] refusing to run against unproven totality checks.');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    console.log('[step-churn-complexity] self-test PASSED');
    return;
  }
  if (argv.includes('--refresh')) {
    doRefresh();
    return;
  }
  if (argv.includes('--check')) {
    process.exit(doCheck());
  }
  throw new Error('usage: --refresh | --check | --self-test');
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`[step-churn-complexity] ${err.stack || err.message}`);
    process.exit(2);
  }
}
