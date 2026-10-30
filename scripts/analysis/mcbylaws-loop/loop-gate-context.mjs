// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (one gate command: the ctx it decides on is collected from git, never invented)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 6, 7, 8 (revisions, policy and classes, register, records, prereg, the bound set, regression and floors, the run)
//
// B7b: buildContext(parsed, deps) -> the plain `ctx` object evaluateGate reads (see loop-gate-eval.mjs). Every fact is read at the
// round's revision (`':index'` for commit, `HEAD` for push/ci) and the base copy decides the base side (the policy, the regression
// set, the floors and the green history). Nothing here decides a rule: this module only reports what git and the JSON files say.
// loop-gate.mjs (the git readers) is imported LAZILY, inside the function: loop-gate.mjs imports this module lazily too, and a
// top-level import in either direction would make the other half of the cycle eagerly evaluated. `deps` is the test seam.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_OF_MODULE = path.resolve(HERE, '../../..');

// The paths buildContext reads. Kept in step with loop-regression.mjs / loop-record.mjs / loop-prereg.mjs, which own the shapes.
const SET_REL = 'mcbylaws/loop/regression-set.json';
const IDS_DIR_REL = 'mcbylaws/loop/data';
const PROTECTED_REL = 'mcbylaws/protected-paths.json';
const RECORD_DIR_REL = 'docs/reports/loop-records';
const PREREG_DIR_REL = 'scripts/analysis/bylaw-validation/coa-expected';
const COUNT_FLOORS_RE = /^mcbylaws\/loop\/floors-[^/]*\.json$/;
const PREREG_RE = /^scripts\/analysis\/bylaw-validation\/coa-expected\/prereg-MB-[^/]*-[^/]*\.json$/;
const DIGITS = '\\d+';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);

/** JSON.parse that answers null instead of throwing (a missing or unparsable file is simply "not there"). */
function readJson(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Every line of git stdout as a single-line string: `git` (execFileSync) does NOT strip CRs, so on a checkout with CRLF-safe
 * config (`core.autocrlf`) a `git show` of a text file answers `{\r\n ...}` and a plain JSON.parse fails on it (observed: record
 * rounds read as `0`). JSON ignores leading whitespace, so stripping a trailing CR per line is free and lossless for parsing.
 */
const linesOf = (text) => String(text === null || text === undefined ? '' : text).split('\n').map((line) => line.replace(/\r$/, ''));

/** The layer23 list of a `mcbylaws/protected-paths.json` text, or null when that text does not carry one. */
function layer23Of(text) {
  const parsed = readJson(text);
  const list = parsed && parsed.layer23;
  return Array.isArray(list) && list.every((g) => typeof g === 'string') ? list : null;
}

/** Two records compared by increment (register order first, then natural order) and then by round: the sort `last` reads. */
function byIncrementThenRound(incrementIds) {
  const rank = new Map(incrementIds.map((id, i) => [id, i]));
  const order = (inc) => (rank.has(inc) ? rank.get(inc) : incrementIds.length);
  return (a, b) => {
    const ia = order(a.rec.increment);
    const ib = order(b.rec.increment);
    if (ia !== ib) return ia - ib;
    if (a.rec.increment !== b.rec.increment) return a.rec.increment < b.rec.increment ? -1 : 1;
    return a.rec.round - b.rec.round;
  };
}

/** The commit a ref names at `root`, or '' when it does not resolve (a bad --base is exit 2, never a raw git failure). */
function revOf(git, root, ref) {
  try {
    return git.git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    return '';
  }
}

/** The merge base of HEAD and `ref`; '' when neither gives one. A shallow CI checkout (one commit, no ref) falls back to HEAD's parent. */
function targetBase(git, root, ref) {
  const merged = git.mergeBase(root, ref);
  if (merged) return merged;
  return revOf(git, root, 'HEAD^');
}

/**
 * The files of a tree under `rel`, as relative repo paths (never throws: a missing directory is an empty list).
 * The index is listed with ls-files; a commit sha (the base) with ls-tree of THAT sha, HEAD for push and ci. A fixed `HEAD`
 * here would read the base's files off the round's own tip (observed: the base record set held the round's records).
 */
function listFiles(git, root, rev, rel) {
  try {
    if (rev === ':index') {
      return linesOf(git.git(root, ['ls-files', '--', rel])).map((s) => s.trim()).filter(Boolean);
    }
    const tree = rev || 'HEAD';
    return linesOf(git.git(root, ['ls-tree', '-r', '--name-only', tree, '--', rel]))
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** `readText` for loadRegression: a file of `rev` as text, `data_missing` when it is not there (loadRegression's own code). */
const readAtAsText = (git, root, rev) => (absPath) => {
  const text = git.readAt(root, rev, path.relative(root, absPath));
  if (text === null) throw new Error(`data_missing: ${absPath}`);
  return text;
};

/** loadRegression of one revision, null when the set (or one of its ids files) is not there at all. */
function loadRegressionAt(loadRegression, git, root, rev) {
  try {
    return loadRegression(root, readAtAsText(git, root, rev));
  } catch {
    return null;
  }
}

/** The floors file a group names (`producer.floors`), first group that names one, or null. */
function floorsFileOf(regression) {
  for (const group of asArray(regression && regression.groups)) {
    const file = group && isObject(group.producer) ? group.producer.floors : null;
    if (typeof file === 'string' && file) return file;
  }
  return null;
}

/** The first `mcbylaws/loop/floors-*.json` at `rev`, or null. */
function countFloorsFileAt(git, root, rev) {
  const files = listFiles(git, root, rev, 'mcbylaws/loop').filter((p) => COUNT_FLOORS_RE.test(p)).sort();
  return files.length ? files[0] : null;
}

/** Every group present in `cur` but not in `base`, or added to a group: {id, introduced_in}. */
function newCasesOf(base, cur) {
  const out = [];
  const baseIds = new Map();
  for (const group of asArray(base && base.groups)) baseIds.set(group.id, new Set(asArray(group.ids)));
  const seen = new Set();
  for (const group of asArray(cur && cur.groups)) {
    const before = baseIds.get(group.id);
    for (const id of asArray(group.ids)) {
      if (before && before.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, introduced_in: group.introduced_in });
    }
  }
  return out;
}

const registerModuleUrl = () => pathToFileURL(path.join(ROOT_OF_MODULE, 'scripts/analysis/bylaw/universe.mjs')).href;

/**
 * The ctx for evaluateGate, collected from git. `parsed` = parseArgs' { root, mode, base, target }; `deps` =
 * { git, computeRun, readRegisterText }, every one injectable. An unresolvable base throws `base_not_resolvable` (exit 2).
 * `parsed` is the WHOLE parseArgs object: the user-facing flags are `command`, `mode`, `root`, `base`, `target`.
 */
export async function buildContext(parsed = {}, deps = {}) {
  const { git, parseRulings, makeClassifier, boundPaths, loadRegression, loadIncrements, parseRecord, RECORD_RE,
    gitPreregHistory, DEFAULT_LAYER23, computeRun } = await resolveDeps(deps);

  const p = isObject(parsed) ? parsed : {};
  const mode = typeof p.mode === 'string' ? p.mode : '';
  const root = typeof p.root === 'string' && p.root ? p.root : '.';
  const commit = mode === 'commit';

  // 1. The revisions: commit reads the index, push and ci read HEAD against a base.
  let base;
  let rev;
  let nameStatus;
  let commits;
  if (commit) {
    base = 'HEAD';
    nameStatus = git.stagedNameStatus(root);
    commits = [nameStatus];
  } else {
    // An explicit --base is a ref too: an unverifiable one is unresolvable (not a raw git failure leaking out of the reader).
    const explicit = typeof p.base === 'string' ? p.base : '';
    if (explicit) {
      const sha = revOf(git, root, explicit);
      if (!sha) throw new Error('base_not_resolvable');
      base = sha;
    } else {
      // CI has no upstream: its base is the target branch's merge base (loop-gate.mjs documents `--target` for it).
      const target = typeof p.target === 'string' && p.target ? p.target : '@{upstream}';
      base = mode === 'ci' ? targetBase(git, root, target) : git.mergeBase(root, target);
      if (!base) throw new Error('base_not_resolvable');
    }
  }
  // The ref the range is read at: commit reads the index below, push and ci read HEAD.
  rev = commit ? ':index' : 'HEAD';
  if (!commit) {
    nameStatus = git.rangeNameStatus(root, base, 'HEAD');
    commits = git.perCommitNameStatus(root, base, 'HEAD');
  }

  // 2. The policy is the BASE copy (a round cannot widen its own classes), the classes and the closed increment set.
  const layer23 = layer23Of(git.readAt(root, base, PROTECTED_REL)) || DEFAULT_LAYER23;
  const classify = makeClassifier(layer23);
  const incrementIds = loadIncrements(root);

  // 3. The register (69a + Spec 69, one text) and its rulings; no card index exists yet (loop-gate-eval's cardExists seam).
  const registerText = typeof deps.readRegisterText === 'function'
    ? deps.readRegisterText(root)
    : await defaultRegisterText(root);
  const rulings = parseRulings(registerText);
  const cardExists = () => false;

  // 4. The records at `rev`: the new ones (an `A` row of the range) pick the round; the last record sorts by increment, then round.
  const records = listRecords(git, root, rev, nameStatus, parseRecord, RECORD_RE);
  const baseRecords = listRecords(git, root, base, [], parseRecord, RECORD_RE);
  const added = new Set(nameStatus.filter((row) => row && row.s === 'A').map((row) => row.p));
  const newRecords = records.filter((entry) => added.has(entry.path));
  const order = byIncrementThenRound(incrementIds);
  // The round under judgement is the last NEW record (the whole set at HEAD also holds the earlier commits of the range).
  const last = newRecords.length ? [...newRecords].sort(order)[newRecords.length - 1] : null;
  const latest = last || pickLatest(records, order);
  const increment = latest ? latest.rec.increment : null;
  const round = latest ? latest.rec.round : null;
  // The first round of an increment: no record of that increment landed at the base.
  const firstRoundOfIncrement = increment === null ? false : !baseRecords.some((entry) => entry.rec.increment === increment);
  // An accepted record can only have landed through a green gate: the accept door refuses a red round, so an accept in the base
  // history is proof the increment was green there. The green history is therefore the distinct increments of the accepted records.
  const greenHistory = distinct(baseRecords.filter((entry) => entry.rec.decision === 'accept').map((entry) => entry.rec.increment));
  const prev = increment === null ? null : previousRound(records, increment, round);
  const prevCases = {};
  if (prev) {
    for (const item of asArray(prev.rec.cases)) {
      if (item && typeof item.id === 'string') prevCases[item.id] = { status: item.status, got_sha: item.got_sha };
    }
  }

  // The preregs at `rev` (only to know whether the round's file is there: the round's prereg is the file named after its round).
  const preregs = listFiles(git, root, rev, PREREG_DIR_REL).filter((rel) => PREREG_RE.test(rel)).sort();
  let prereg = null;
  let preregFile = null;
  // O68-05: the prereg is found by FILE NAME, prereg-MB-<digits>-<round>.json (the record's loop round); its `round` field is the CoA
  // batch counter, so it never joins the record. What must agree is the increment: the prereg registers this increment's rows.
  if (latest && typeof latest.rec.round === 'number') {
    const candidate = `${PREREG_DIR_REL}/prereg-MB-68-${latest.rec.round}.json`;
    const parsedPrereg = preregs.includes(candidate) ? readJson(git.readAt(root, rev, candidate)) : null;
    if (isObject(parsedPrereg) && parsedPrereg.increment === increment) {
      prereg = parsedPrereg;
      preregFile = candidate;
    }
  }
  const preregHistory = commit || !latest || !preregFile ? null : gitPreregHistory(root, preregFile, latest.path);
  const rowsTouched = asArray(prereg && prereg.rows_touched);

  // 6. The bound set: every changed path of a class, plus every input the record names, at the round's revision. A record is
  // generated by the tool AFTER the round's other files are bound, so it cannot list its own blob: it is never a bound input.
  const changedBound = boundPaths(nameStatus.map((row) => row.p), classify).filter((p) => !RECORD_RE.test(p));
  const inputs = latest && isObject(latest.rec.inputs) ? Object.keys(latest.rec.inputs) : [];
  const treeBlobs = git.blobIdsAt(root, rev, [...new Set([...changedBound, ...inputs])]);

  // 7. Regression (base vs cur, from git) and the floors the two sides hold.
  const regression = {
    base: loadRegressionAt(loadRegression, git, root, base),
    cur: loadRegression(root, readAtAsText(git, root, rev)),
  };
  const newCases = newCasesOf(regression.base, regression.cur);
  const percentFile = floorsFileOf(regression.cur) || floorsFileOf(regression.base);
  const countFileCur = countFloorsFileAt(git, root, rev);
  const countFileBase = countFloorsFileAt(git, root, base);
  const floors = {
    percentBase: percentFile ? readJson(git.readAt(root, base, percentFile)) : null,
    percentCur: percentFile ? readJson(git.readAt(root, rev, percentFile)) : null,
    countBase: countFileBase ? readJson(git.readAt(root, base, countFileBase)) : null,
    countCur: countFileCur ? readJson(git.readAt(root, rev, countFileCur)) : null,
  };
  const owed = floors.countCur && isObject(floors.countCur.owed_baseline) ? floors.countCur.owed_baseline : {};

  // 8. The run: only CI may answer null (the external groups do not run there). No prereg rows = no baseline to diff moves against.
  // A computeRun that supplied its own base rows keeps them (O68-04): forcing null here is why moves were never compared.
  const run = computeRun({ root, regression: regression.cur, mode, registerText }) || null;
  if (run && run.baseRows === undefined) {
    run.baseRows = null;
  }

  return {
    mode,
    nameStatus,
    commits,
    classify,
    incrementIds,
    rulings,
    cardExists,
    latest,
    newRecords,
    firstRoundOfIncrement,
    greenHistory,
    prereg,
    preregFile,
    preregHistory,
    treeBlobs,
    changedBound,
    regression,
    floors,
    baselineOwed: owed,
    prevCases,
    newCases,
    rowsTouched,
    run,
  };
}

/** The readers buildContext needs: the injected ones win, every default is imported lazily (loop-gate.mjs imports this module). */
async function resolveDeps(deps) {
  const gate = deps.git && deps.git.git ? deps.git : gitReaders(await import('./loop-gate.mjs'));
  const recordMod = await import('./loop-record.mjs');
  const oracleMod = await import('./loop-oracle.mjs');
  const regressionMod = await import('./loop-regression.mjs');
  const incrementMod = await import('./loop-increment.mjs');
  const preregMod = await import('./loop-prereg.mjs');
  return {
    git: gate,
    parseRulings: asyncRulings(await import(pathToFileURL(path.join(ROOT_OF_MODULE, 'scripts/analysis/bylaw/universe.mjs')).href)),
    makeClassifier: oracleMod.makeClassifier,
    boundPaths: oracleMod.boundPaths,
    DEFAULT_LAYER23: oracleMod.DEFAULT_LAYER23,
    loadRegression: regressionMod.loadRegression,
    loadIncrements: incrementMod.loadIncrements,
    parseRecord: recordMod.parseRecord || defaultParseRecord,
    RECORD_RE: recordMod.RECORD_RE,
    gitPreregHistory: preregMod.gitPreregHistory,
    computeRun: typeof deps.computeRun === 'function'
      ? deps.computeRun
      : (await import('./loop-gate-run.mjs')).computeRun,
  };
}

const asyncRulings = (mod) => mod.parseRulings;

const gitReaders = (mod) => ({
  git: mod.git,
  stagedNameStatus: mod.stagedNameStatus,
  rangeNameStatus: mod.rangeNameStatus,
  perCommitNameStatus: mod.perCommitNameStatus,
  mergeBase: mod.mergeBase,
  blobIdsAt: mod.blobIdsAt,
  readAt: mod.readAt,
});

/** The records of a revision, parsed: {path, rec}; a file that does not parse is skipped (record_shape reports it at `rev`). */
function listRecords(git, root, rev, _nameStatus, parseRecord, RECORD_RE) {
  const files = listFiles(git, root, rev, RECORD_DIR_REL).filter((rel) => RECORD_RE.test(rel)).sort();
  const out = [];
  for (const rel of files) {
    const text = git.readAt(root, rev, rel);
    const rec = readJson(text);
    if (!isObject(rec)) continue;
    void parseRecord;
    out.push({ path: rel, rec });
  }
  return out;
}

/** The highest round of the newest increment, as the ctx's `latest`. */
function pickLatest(records, order) {
  if (!records.length) return null;
  const sorted = [...records].sort(order);
  const last = sorted[sorted.length - 1];
  const increment = last.rec.increment;
  let best = null;
  for (const entry of sorted) {
    if (entry.rec.increment !== increment) continue;
    if (!best || entry.rec.round > best.rec.round) best = entry;
  }
  return best;
}

/** The previous round (the round before `round`) of one increment, or null. */
function previousRound(records, increment, round) {
  let best = null;
  for (const entry of records) {
    if (entry.rec.increment !== increment) continue;
    if (typeof round === 'number' && !(entry.rec.round < round)) continue;
    if (!best || entry.rec.round > best.rec.round) best = entry;
  }
  return best;
}

const distinct = (list) => [...new Set(list)];

const defaultParseRecord = (text) => readJson(text);

/** The default register text: 69a + Spec 69 through readSpec69Rulings (the one reader every ruling consumer uses). */
async function defaultRegisterText(root) {
  const mod = await import(registerModuleUrl());
  return mod.readSpec69Rulings(root);
}
