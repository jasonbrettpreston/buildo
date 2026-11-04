// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (one gate command: the ctx it decides on is collected from git, never invented)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 6, 7, 8 (revisions, policy and classes, register, records, prereg, the bound set, regression and floors, the run)
//
// B7b: buildContext(parsed, deps) -> the plain `ctx` object evaluateGate reads (see loop-gate-eval.mjs). Every fact is read at the
// round's revision (`':index'` for commit, the tip for push/ci) and the base copy decides the base side (the policy, the regression
// set, the floors and the green history). Nothing here decides a rule: this module only reports what git and the JSON files say.
// loop-gate.mjs (the git readers) is imported LAZILY, inside the function: loop-gate.mjs imports this module lazily too, and a
// top-level import in either direction would make the other half of the cycle eagerly evaluated. `deps` is the test seam.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseMessage } from '../mcbylaws/cite-parse.mjs';
import { byNewest, parsePreregName } from '../mcbylaws/prereg-name.mjs';
import { recordAddCommit } from './loop-prereg.mjs';
import { preregOnly, nameStatusOf, checkOracleFirst } from './loop-oracle.mjs';
import { parseOwedTable, parseRegisterRows } from '../mcbylaws/cite-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_OF_MODULE = path.resolve(HERE, '../../..');

// The paths buildContext reads. Kept in step with loop-regression.mjs / loop-record.mjs / loop-prereg.mjs, which own the shapes.
const SET_REL = 'mcbylaws/loop/regression-set.json';
const IDS_DIR_REL = 'mcbylaws/loop/data';
const PROTECTED_REL = 'mcbylaws/protected-paths.json';
const RECORD_DIR_REL = 'docs/reports/loop-records';
const PREREG_DIR_REL = 'scripts/analysis/bylaw-validation/coa-expected';
const COUNT_FLOORS_RE = /^mcbylaws\/loop\/floors-[^/]*\.json$/;
// N68-1: the register (69a + Spec 69, one text) and the closed increment list are read at the round's revision, like every other fact.
const REGISTER_PARTS = ['docs/specs/01-pipeline/69a_mcbylaw_register.md', 'docs/specs/01-pipeline/69_mcbylaw_policy.md'];
// R-LZ (drafts.md:237): the FOUR copies the move check reads (gate.mjs CITE_INPUTS: 133's OWED table, then the three registers),
// each at the tree the prereg was joined from. A copy absent there is no register at all (null), never a partial one.
const MOVE_REG = {
  spec133: 'docs/specs/01-pipeline/133_bylaw_handbook.md',
  registers: [
    'docs/specs/01-pipeline/69a_mcbylaw_register.md',
    'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md',
    'docs/specs/01-pipeline/131_lot_configuration_policy.md',
  ],
};
const INCREMENTS_REL = 'scripts/analysis/mcbylaws-loop/data/increments.json';

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

/**
 * The paths that EXIST at the round's revision: a deletion (`D`) has no blob there, and a rename (`R`) yields BOTH paths with the OLD
 * one first (loop-gate.mjs nameStatusZOf), so only its new side lives at the revision. Returns the paths (a flat list for boundPaths).
 */
function livingPaths(nameStatus) {
  const rows = asArray(nameStatus).filter((row) => row && typeof row.p === 'string' && row.p);
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.s === 'D') continue;
    if (row.s === 'R') {
      // old, new: skip the old side, keep the new one (the reader pushes the two in that order)
      i += 1;
      const next = rows[i];
      if (next) out.push(next.p);
      continue;
    }
    out.push(row.p);
  }
  return out;
}

const registerModuleUrl = () => pathToFileURL(path.join(ROOT_OF_MODULE, 'scripts/analysis/bylaw/universe.mjs')).href;

/** The text of a file at `rev`; `data_missing: <path>@<rev>` when it is not there (N68-1: a fact read at a revision, named). */
function textAt(git, root, rev, rel) {
  const text = git.readAt(root, rev, rel);
  if (text === null || text === undefined) throw new Error(`data_missing: ${rel}@${rev}`);
  return text;
}

/** The closed increment list (`ids`) at `rev`; `data_missing: <path>@<rev>` for a missing, unparsable or empty list. */
function incrementsAt(git, root, rev) {
  const parsed = readJson(textAt(git, root, rev, INCREMENTS_REL));
  const ids = parsed && Array.isArray(parsed.ids) ? parsed.ids : null;
  if (!ids || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error(`data_missing: ${INCREMENTS_REL}@${rev}`);
  }
  return ids;
}

/** git(root, args) as text, or null when git fails (a reader here never throws). */
function tryGitText(git, root, args) {
  try {
    return String(git.git(root, args));
  } catch {
    return null;
  }
}

/** R-MA, commit time: the ONE task among the prereg-<task>-<k>.json files HEAD's commit adds (status A), else null. */
export function headPreregTask(git, root) {
  const out = tryGitText(git, root, ['diff-tree', '--no-commit-id', '--root', '-r', '--name-status', '-z', 'HEAD']);
  if (out === null) return null;
  const parts = out.split('\0');
  const tasks = new Set();
  for (let i = 0; i < parts.length;) {
    const status = parts[i].trim();
    if (!status) { i += 1; continue; }
    if (status[0] === 'R' || status[0] === 'C') { i += 3; continue; }
    const rel = parts[i + 1];
    i += 2;
    if (status === 'A') {
      const name = parsePreregName(rel);
      if (name) tasks.add(name.task);
    }
  }
  return tasks.size === 1 ? [...tasks][0] : null;
}

/**
 * MB-79 (p), R-MA dated note 2026-11-01: the ONE merge head of a merge in progress, or null. `git rev-parse --git-path MERGE_HEAD`
 * prints the path relative to `root` in a plain repo (`.git/MERGE_HEAD`), so it is read at path.resolve(root, <printed path>). No
 * file, a read that fails, or more than one head (an octopus) is null.
 */
function singleMergeHead(git, root) {
  const printed = tryGitText(git, root, ['rev-parse', '--git-path', 'MERGE_HEAD']);
  if (printed === null || !printed.trim()) return null;
  let text;
  try {
    text = fs.readFileSync(path.resolve(root, printed.trim()), 'utf8');
  } catch {
    return null;
  }
  const heads = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return heads.length === 1 ? heads[0] : null;
}

/**
 * MB-79 (p) (R-MA dated note 2026-11-01), extracted unchanged by MB-79 (f) step D5a-0 (R-MC; plan.v9.1.md 2.3, V8-4) so the gate's join
 * of `ctx.latest` and the door's join of every new record apply ONE rule: the history a record's prereg is joined in and whether it is
 * new. Push and ci read the tip. At commit time a lane merge in progress with ONE merge head joins a NEW record by the push-and-CI source
 * (the merge head's history, isNew false) when the record is absent from HEAD's tree and its index blob equals its MERGE_HEAD blob.
 */
export function joinArgsFor({ git, root, mode, record, isNew, tip }) {
  const commit = mode === 'commit';
  let rev = commit ? 'HEAD' : tip;
  let joinIsNew = isNew;
  if (commit && isNew && record) {
    const mergeHead = singleMergeHead(git, root);
    if (mergeHead) {
      const rec = record.path;
      const atHead = git.blobIdsAt(root, 'HEAD', [rec]);
      const atIndex = git.blobIdsAt(root, ':index', [rec]);
      const atMerge = git.blobIdsAt(root, mergeHead, [rec]);
      if (!atHead[rec] && atIndex[rec] && atIndex[rec] === atMerge[rec]) {
        rev = mergeHead;
        joinIsNew = false;
      }
    }
  }
  return { rev, isNew: joinIsNew };
}

/** R-MA, push and ci: the McBylaws-Task trailer of a commit (cite-parse owns the trailer form), or null. */
export function trailerTask(git, root, sha) {
  const text = tryGitText(git, root, ['log', '-1', '--format=%B', sha]);
  return text === null ? null : parseMessage(text).task;
}

/**
 * R-MA (amends R-KV; 2026-11-01-batch-ao#CHAT-216.O-28): the prereg of one record. The task T: at commit time for a NEW record, the
 * task of the prereg HEAD's commit adds (the tree is HEAD); otherwise (push, ci, or a record already committed) the trailer of the
 * commit that adds the record (the tree is that commit's first parent: "committed strictly before"). Candidates: T's
 * prereg-<T>-<k>.json files in the tree, filtered by NAME before any read (another task's file is never read), newest integer k
 * first: unparsable stops (prereg_unparsable), a JSON task that is not T stops (prereg_name_task_mismatch), another increment is
 * skipped, else it is the prereg. `record` = {path, rec}. `rev` is the history the record's add commit is looked up in: the commit
 * that adds the record in `rev`'s history (default HEAD; MB-79 (o): the tip). Returns {prereg, preregFile, task, source, violations}
 * and, MB-79 (x) B3 (a), `tree`: the revision the prereg was joined from ('HEAD' at commit time, else the add commit's first parent),
 * null whenever no prereg is returned, so the register can be read from that SAME tree (a record cannot grade its own commit).
 * On the one NONE answer that still joins a tree (`[]` with a task: the tree was searched and no prereg of the record's increment
 * is there), `tree` is that searched tree; the readers below return null/[] for it exactly because no prereg was found.
 */
export function findPreregFor({ git, root, mode, record, isNew, rev = 'HEAD' }) {
  const none = (violations, task = null, source = null) => ({ prereg: null, preregFile: null, task, source, violations, tree: null });
  if (!record || typeof record.path !== 'string' || !isObject(record.rec)) return none([]);
  let task;
  let source;
  let tree;
  if (mode === 'commit' && isNew) {
    source = 'head-prereg';
    tree = 'HEAD';
    task = headPreregTask(git, root);
    if (!task) return none(['prereg_task_unknown:commit'], null, source);
  } else {
    source = 'trailer';
    let add = null;
    try {
      add = recordAddCommit((r, args) => git.git(r, args), root, record.path, rev);
    } catch {
      add = null;
    }
    if (!add) return none(['prereg_task_unknown:no-add-commit'], null, source);
    const parent = revOf(git, root, `${add}^`);
    if (!parent) return none(['prereg_task_unknown:no-parent'], null, source);
    task = trailerTask(git, root, add);
    if (!task) return none(['prereg_task_unknown:no-trailer'], null, source);
    tree = parent;
  }
  const candidates = [];
  for (const rel of listFiles(git, root, tree, PREREG_DIR_REL)) {
    const name = parsePreregName(rel);
    if (name && name.task === task) candidates.push({ rel, k: name.k });
  }
  candidates.sort(byNewest);
  for (const { rel } of candidates) {
    const parsed = readJson(git.readAt(root, tree, rel));
    if (!isObject(parsed)) return none([`prereg_unparsable:${rel}`], task, source);
    if (parsed.task !== task) return none([`prereg_name_task_mismatch:${rel}`], task, source);
    if (parsed.increment !== record.rec.increment) continue;
    return { prereg: parsed, preregFile: rel, task, source, violations: [], tree };
  }
  // The tree WAS searched: report it, so the context's register/entries read answer null/[] from the same tree the join read.
  return { ...none([], task, source), tree };
}

/**
 * R-LZ (drafts.md:237) + R-LE 124a:1049: the `{rows, owed}` register the move check reads, at the tree the prereg was joined from
 * (arm C's citeInputs shape: gate.mjs reads 133's OWED table and the three registers at one revision, first row wins across the
 * three). Every copy is read in its own try/catch: a null `tree` (no prereg), or a copy that is absent or unreadable there, is null
 * -- never a partial register, which would read as "nothing is ruled". `git` is the reader set buildContext resolved.
 */
export function readMoveRegister(git, root, tree) {
  if (!tree) return null;
  const read = (rel) => {
    try {
      return git.readAt(root, tree, rel);
    } catch {
      return null;
    }
  };
  try {
    const spec = read(MOVE_REG.spec133);
    const texts = MOVE_REG.registers.map(read);
    if (typeof spec !== 'string' || texts.some((t) => typeof t !== 'string')) return null;
    const rows = new Map();
    for (const text of texts) {
      for (const [id, v] of parseRegisterRows(text)) if (!rows.has(id)) rows.set(id, v);
    }
    return { owed: parseOwedTable(spec), rows };
  } catch {
    return null;
  }
}

/** `nameStatusZOf`'s `{s, p}` rows as the `{status, path}` the move check's `entries` reads (gate.mjs arms spell them so). */
const landingEntries = (rows) => asArray(rows)
  .filter((row) => row && typeof row.p === 'string' && row.p && typeof row.s === 'string' && row.s)
  .map((row) => ({ status: row.s, path: row.p }));

/**
 * R-LZ / R-KG (124a:1015): the rows of the commit that LANDS the round, so an OWED rule's own lock may land with it. Commit mode: the
 * staged name-status, and only when what is staged is the record's own landing under judgement (`isNew`: the round under judgement is
 * the record the round adds). Push and ci: the diff of the commit that ADDS the record against its first parent, the other `tree`
 * candidate in the join (`rev` is the history the add commit is found in, tip at push and ci). Never throws: `[]`.
 */
export function readMoveLandEntries(git, root, record, { mode, rev = 'HEAD', tree = null, isNew = false } = {}) {
  try {
    if (mode === 'commit') return isNew ? landingEntries(git.stagedNameStatus(root)) : [];
    if (!record || typeof record.path !== 'string' || !tree) return [];
    const add = recordAddCommit((r, args) => git.git(r, args), root, record.path, rev);
    if (!add) return [];
    return landingEntries(nameStatusOf(tryGitText(git, root, ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', add])));
  } catch {
    return [];
  }
}

/**
 * MB-79 (m) (R-MA, R-LZ, M-321, R-LE; rule.md s2.4): true when range path `p` is a prereg ADDED by exactly one non-merge commit of
 * `base..tip` (--full-history), that commit is prereg-only under the BASE classifier, and the tip blob is that commit's blob: such a
 * prereg "opens the increment ... and has no run to bind" (O68-01), so it is not an input of another record. Push and CI only. Any
 * git read that fails answers false (the path stays bound).
 */
function preregCommittedAlone(git, root, base, tip, nameStatus, classify, p) {
  const rows = asArray(nameStatus).filter((row) => row && row.p === p);
  if (!rows.some((row) => row.s === 'A')) return false;
  if (!preregOnly([{ s: 'A', p }], classify)) return false;
  // default history simplification hides a side-branch commit whose blob equals the main-line one: --full-history is required.
  const commits = String(tryGitText(git, root, ['rev-list', '--no-merges', '--full-history', `${base}..${tip}`, '--', p]) || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (commits.length !== 1) return false;
  const sha = commits[0];
  const shown = tryGitText(git, root, ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', sha]);
  if (shown === null) return false;
  if (!preregOnly(nameStatusOf(shown), classify)) return false;
  const atCommit = tryGitText(git, root, ['rev-parse', `${sha}:${p}`]);
  const atTip = tryGitText(git, root, ['rev-parse', `${tip}:${p}`]);
  if (atCommit === null || atTip === null) return false;
  return atCommit.trim() === atTip.trim();
}

/**
 * The ctx for evaluateGate, collected from git. `parsed` = parseArgs' { root, mode, base, target, tip }; `deps` =
 * { git, computeRun, readRegisterText, execFileSync }, every one injectable. An unresolvable base throws `base_not_resolvable` (exit 2).
 * `parsed` is the WHOLE parseArgs object: the user-facing flags are `command`, `mode`, `root`, `base`, `target`, and (MB-79 (o)) `tip`
 * for push and ci, which also carries an unresolvable tip (`tip_not_resolvable`), an extraction failure (`tip_extract_failed`) and a
 * tree that is not git's tree (`tip_extract_mismatch`); all exit 2.
 */
export async function buildContext(parsed = {}, deps = {}) {
  const { git, parseRulings, makeClassifier, boundPaths, loadRegression, parseRecord, RECORD_RE,
    gitPreregHistory, DEFAULT_LAYER23, computeRun, extractRev, checkTipTree } = await resolveDeps(deps);

  const p = isObject(parsed) ? parsed : {};
  const mode = typeof p.mode === 'string' ? p.mode : '';
  const root = typeof p.root === 'string' && p.root ? p.root : '.';
  const commit = mode === 'commit';
  // MB-79 (o) (R-KP, R-LF): push and ci judge the pushed tip (--tip, default HEAD); commit mode reads the index as before.
  const tipRef = commit ? 'HEAD' : (typeof p.tip === 'string' && p.tip ? p.tip : 'HEAD');
  const tip = commit ? 'HEAD' : revOf(git, root, tipRef);
  if (!tip) throw new Error('tip_not_resolvable');

  // 1. The revisions: commit reads the index, push and ci read the tip (MB-79 (o)) against a base.
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
  // The ref the range is read at: commit reads the index below, push and ci read the tip (MB-79 (o)).
  rev = commit ? ':index' : tip;
  if (!commit) {
    nameStatus = git.rangeNameStatus(root, base, tip);
    // O68-22: the per-commit lists skip merge commits, so a hand-oracle edit made only in a merge's conflict resolution would never
    // be seen. The whole range name-status (git diff merges everything, a merge's resolution included) is appended as ONE extra list:
    // checkOracleFirst then sees that edit, while the per-commit lists themselves stay as the reader hands them.
    commits = [...asArray(git.perCommitNameStatus(root, base, tip)), asArray(nameStatus)];
  }

  // 2. The policy is the BASE copy (a round cannot widen its own classes), the classes and the closed increment set.
  const layer23 = layer23Of(git.readAt(root, base, PROTECTED_REL)) || DEFAULT_LAYER23;
  const classify = makeClassifier(layer23);
  // N68-1: the closed increment list is read at the round's revision too (`:index` for commit): a worktree edit the round does not
  // stage must not widen the set the round is judged against.
  const incrementIds = incrementsAt(git, root, rev);

  // 3. The register (69a + Spec 69, one text) at the round's revision, and its rulings; no card index exists yet (loop-gate-eval's
  // cardExists seam). N68-1: an UNSTAGED worktree edit of the register is not a ruling of the round under judgement.
  const registerText = typeof deps.readRegisterText === 'function'
    ? deps.readRegisterText(root)
    : REGISTER_PARTS.map((rel) => textAt(git, root, rev, rel)).join('\n');
  const rulings = parseRulings(registerText);
  const cardExists = () => false;

  // 4. The records at `rev`: the new ones (an `A` row of the range) pick the round; the last record sorts by increment, then round.
  const records = listRecords(git, root, rev, nameStatus, parseRecord, RECORD_RE);
  const baseRecords = listRecords(git, root, base, [], parseRecord, RECORD_RE);
  // O68-15: a record that does not parse at the round's revision is named; the rules below only read the parsed ones.
  const unparsable = unparsableRecords(records);
  const parsedNow = parsedRecords(records);
  const parseableBase = parsedRecords(baseRecords);
  const added = new Set(nameStatus.filter((row) => row && row.s === 'A').map((row) => row.p));
  const newRecords = parsedNow.filter((entry) => added.has(entry.path));
  const order = byIncrementThenRound(incrementIds);
  // The round under judgement is the last NEW record (the whole set at HEAD also holds the earlier commits of the range).
  const last = newRecords.length ? [...newRecords].sort(order)[newRecords.length - 1] : null;
  const latest = last || pickLatest(parsedNow, order);
  const increment = latest ? latest.rec.increment : null;
  const round = latest ? latest.rec.round : null;
  // The first round of an increment: no record of that increment landed at the base.
  const firstRoundOfIncrement = increment === null ? false : !parseableBase.some((entry) => entry.rec.increment === increment);
  // An accepted record can only have landed through a green gate: the accept door refuses a red round, so an accept in the
  // history is proof the increment was green there. N68-2: the history is not the base's alone. A record added INSIDE the range
  // was judged by the per-commit hooks at its own commit, so an accepted record at `rev` (the tip) counts too; the increment
  // under judgement (latest.rec.increment) never counts, or a round would vouch for its own greenness.
  const acceptedIncrements = (entries) => entries
    .filter((entry) => entry.rec.decision === 'accept')
    .map((entry) => entry.rec.increment)
    .filter((inc) => inc !== increment);
  const greenHistory = distinct([
    ...acceptedIncrements(parseableBase),
    ...acceptedIncrements(parsedNow),
  ]);
  const prev = increment === null ? null : previousRound(parsedNow, increment, round);
  const prevCases = {};
  if (prev) {
    for (const item of asArray(prev.rec.cases)) {
      if (item && typeof item.id === 'string') prevCases[item.id] = { status: item.status, got_sha: item.got_sha };
    }
  }

  // R-MA (amends R-KV; 2026-11-01-batch-ao#CHAT-216.O-28): the landing task's newest prereg of the record's increment, committed
  // strictly before the commit that adds the record (findPreregFor). Its violations reach evaluateGate through ctx.preregJoin.
  // MB-79 (p) (R-MA dated note 2026-11-01): at commit time, a lane merge in progress with ONE merge head joins the round's NEW record by
  // the push-and-CI source (the trailer of the commit that adds it in MERGE_HEAD's history) when the record is absent from HEAD's tree
  // and its index blob equals its MERGE_HEAD blob. Every other case keeps the join by the prereg HEAD's commit adds.
  const isNew = Boolean(last) && latest === last;
  const { rev: joinRev, isNew: joinIsNew } = joinArgsFor({ git, root, mode, record: latest, isNew, tip });
  const join = findPreregFor({ git, root, mode, record: latest, isNew: joinIsNew, rev: joinRev });
  const prereg = join.prereg;
  const preregFile = join.preregFile;
  const preregJoin = { task: join.task, source: join.source, violations: join.violations };
  // MB-79 (x) B3 (c) (R-LZ, drafts.md:237; R-LE 124a:1049; R-KG 124a:1015): the register and the landing commit's rows, read from the
  // SAME tree the prereg was joined from, so a round's own staged register edit cannot rule its own move. No joined prereg, no
  // register (the move check only reads one with a prereg). `deps.readMoveRegister` and `deps.readMoveLandEntries` are the test seam.
  const moveRegister = !prereg ? null : typeof deps.readMoveRegister === 'function'
    ? deps.readMoveRegister(root, join.tree)
    : readMoveRegister(git, root, join.tree);
  const moveLandEntries = typeof deps.readMoveLandEntries === 'function'
    ? deps.readMoveLandEntries(root, latest, join.tree)
    : readMoveLandEntries(git, root, latest, { mode, rev: joinRev, tree: join.tree, isNew: joinIsNew });
  const preregHistory = commit || !latest || !preregFile ? null : gitPreregHistory(root, preregFile, latest.path, tip);
  const rowsTouched = asArray(prereg && prereg.rows_touched);

  // 6. The bound set: every changed path of a class, plus every input the record names, at the round's revision. A record is
  // generated by the tool AFTER the round's other files are bound, so it cannot list its own blob: it is never a bound input.
  // O68-06: a DELETED path (name-status `D`) and the OLD side of a rename (`R` names both paths) have no blob at the round's
  // revision, so they cannot bind: an honest deletion of a bound file with a fresh record is not `input_not_bound`. recordMissing
  // still sees the deletion through `nameStatus`, which keeps every row.
  // MB-79 (m): a prereg committed alone in the range binds no record (rule.md s2.4); every other changed bound path still binds.
  const changedBound = boundPaths(livingPaths(nameStatus), classify)
    .filter((p) => !RECORD_RE.test(p))
    .filter((p) => commit || !preregCommittedAlone(git, root, base, tip, nameStatus, classify, p));
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
  // O68-11: the OWED baseline is a PREREG-side fact: it is read from the BASE copy of the count-floors file, so a round cannot raise
  // its own baseline (that would widen the ratchet it is measured against). No base file, or no baseline in it, is `{}`.
  const owed = floors.countBase && isObject(floors.countBase.owed_baseline) ? floors.countBase.owed_baseline : {};

  // 8. The run: only CI may answer null (the external groups do not run there). No prereg rows = no baseline to diff moves against.
  // A computeRun that supplied its own base rows keeps them (O68-04): forcing null here is why moves were never compared.
  // B1 (re-check): with a prereg the moves are compared with the BASE revision's own scorer rows (plan s7); CI runs no external group.
  const baseRev = prereg && mode !== 'ci' ? base : undefined;
  let run;
  if (commit) {
    run = computeRun({ root, regression: regression.cur, mode, registerText, ...(baseRev ? { baseRev } : {}) }) || null;
  } else {
    // MB-79 (o): score the tip's own committed tree, never the (possibly dirty) worktree; `root` stays the repo for the base side.
    const treeDeps = typeof deps.execFileSync === 'function' ? { execFileSync: deps.execFileSync } : {};
    let tipTree;
    try {
      tipTree = extractRev(root, tip, treeDeps);
    } catch (err) {
      throw new Error(`tip_extract_failed: ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    }
    try {
      checkTipTree(root, tip, tipTree, treeDeps);
      run = computeRun({ root, runRoot: tipTree, regression: regression.cur, mode, registerText, ...(baseRev ? { baseRev } : {}) }) || null;
    } finally {
      fs.rmSync(tipTree, { recursive: true, force: true });
    }
  }
  if (run && run.baseRows === undefined) {
    run.baseRows = null;
  }

  // R-MC (PR-79f-1, MB-79 (f); plan.v9.1.md 2.3): the door's facts, collected ONLY when the oracle-first refusal would fire.
  const door = checkOracleFirst(asArray(commits), classify).length
    ? await collectDoor({ git, root, mode, base, tip, commits, nameStatus, classify, newRecords, latest, isNew, rulings })
    : null;

  return {
    mode,
    nameStatus,
    commits,
    classify,
    incrementIds,
    rulings,
    moveRegister,
    moveLandEntries,
    cardExists,
    latest,
    newRecords,
    unparsable,
    firstRoundOfIncrement,
    greenHistory,
    prereg,
    preregFile,
    preregHistory,
    preregJoin,
    treeBlobs,
    changedBound,
    regression,
    floors,
    baselineOwed: owed,
    prevCases,
    newCases,
    rowsTouched,
    run,
    ...(door ? { door } : {}),
  };
}

/**
 * R-MC (PR-79f-1, MB-79 (f); plan.v9.1.md 2.3): `ctx.door`. Every record of the range is joined by (h)'s findPreregFor with the
 * `{rev, isNew}` of joinArgsFor (V8-3: `isNew: true` for every new record at commit; the tip at push and ci). A record with no prereg
 * returns the door at once, before any further git call (P-3). Otherwise the diffs of the eligible moved oracle paths, and per joined
 * prereg that lists door entries its history (the door's own walk) and its authority (a) at the prereg's parent, plus (b), the
 * pushed-ruling condition, at commit and push only (O-29 YES). Reads that fail with a named code answer null; log, rev-list,
 * merge-base and an unresolvable commit propagate (P-18).
 */
async function collectDoor({ git, root, mode, base, tip, commits, nameStatus, classify, newRecords, latest, isNew, rulings }) {
  const DG = await import('./loop-door-git.mjs');
  const { pushedAuthority } = await import('./loop-door-remote.mjs');
  const { ineligibleWhy } = await import('./loop-oracle-door.mjs');
  const { rowOf, stemOf } = await import('./loop-door-authority.mjs');
  const commit = mode === 'commit';
  const lists = asArray(commits).map(asArray);
  const perCommit = commit ? lists : lists.slice(0, -1);
  const movedPaths = distinct(lists.flat().filter((x) => x && x.s !== 'A' && classify(x.p) === 'oracle').map((x) => x.p));
  const moved = new Set(movedPaths);
  const perCommitStatus = {};
  for (const list of perCommit) {
    for (const r of list) {
      if (r && moved.has(r.p)) (perCommitStatus[r.p] = perCommitStatus[r.p] || []).push(r.s);
    }
  }
  const net = {};
  for (const r of asArray(nameStatus)) if (r && moved.has(r.p) && !(r.p in net)) net[r.p] = r.s;
  const classes = {};
  for (const p of movedPaths) classes[p] = classify(p);
  const records = [];
  const unjoined = [];
  for (const rec of asArray(newRecords)) {
    const args = joinArgsFor({ git, root, mode, record: rec, isNew: commit ? true : isNew, tip });
    const j = findPreregFor({ git, root, mode, record: rec, isNew: args.isNew, rev: args.rev });
    if (j.prereg) records.push({ recordPath: rec.path, prereg: j.prereg, preregFile: j.preregFile, task: j.task, source: j.source });
    else unjoined.push({ recordPath: rec.path, violations: asArray(j.violations) });
  }
  const door = {
    mode,
    latestRecordPath: latest ? latest.path : null,
    movedPaths,
    perCommitStatus,
    net,
    classes,
    diffs: {},
    fileText: {},
    records,
    unjoined,
    rulingsAtRevision: Object.fromEntries(rulings instanceof Map ? rulings : []),
  };
  if (unjoined.length || !records.length) return door;
  for (const p of movedPaths) {
    if (ineligibleWhy(p, door) !== null) continue;
    door.diffs[p] = commit ? DG.stagedDiff(root, p) : DG.rangeDiff(root, base, tip, p);
    // P-13: operator context only, never authority.
    door.fileText[p] = { base: git.readAt(root, commit ? 'HEAD' : base, p), cur: git.readAt(root, commit ? ':index' : tip, p) };
  }
  const seen = new Map();
  for (const r of records) {
    if (seen.has(r.preregFile)) {
      Object.assign(r, { history: seen.get(r.preregFile).history, authority: seen.get(r.preregFile).authority });
      continue;
    }
    const entries = asArray(r.prereg.expected_value_changes).filter((e) => isObject(e) && typeof e.path === 'string');
    let history = null;
    let authority = { register: null, decisions: {}, pushed: commit || mode === 'push' ? {} : null };
    if (entries.length) {
      const h = DG.preregHistory(root, r.preregFile, tip, mode);
      const first = h.commits.length ? h.commits[0].sha : null;
      history = { ...h, work: DG.workCommits(root, { mode, base, tip, perCommit, first }) };
      const parent = first ? DG.parentOf(root, first) : null;
      const register = DG.registerAt(root, parent);
      const keys = distinct(entries.map((e) => `${e.ruling}#${e.ruling_ref}`)).map((k) => ({ id: k.slice(0, k.indexOf('#')), ref: k.slice(k.indexOf('#') + 1) }));
      const stems = keys.map((k) => (register ? stemOf(rowOf(register, k.id), k.ref) : null)).filter(Boolean);
      authority = {
        register,
        decisions: DG.decisionsAt(root, parent, stems),
        pushed: mode === 'ci' ? null : pushedAuthority(root, { parent, keys }),
      };
    }
    Object.assign(r, { history, authority });
    seen.set(r.preregFile, { history, authority });
  }
  return door;
}

/** The readers buildContext needs: the injected ones win, every default is imported lazily (loop-gate.mjs imports this module). */
async function resolveDeps(deps) {
  const gate = deps.git && deps.git.git ? deps.git : gitReaders(await import('./loop-gate.mjs'));
  const recordMod = await import('./loop-record.mjs');
  const oracleMod = await import('./loop-oracle.mjs');
  const regressionMod = await import('./loop-regression.mjs');
  const preregMod = await import('./loop-prereg.mjs');
  const runMod = await import('./loop-gate-run.mjs');
  return {
    git: gate,
    parseRulings: asyncRulings(await import(pathToFileURL(path.join(ROOT_OF_MODULE, 'scripts/analysis/bylaw/universe.mjs')).href)),
    makeClassifier: oracleMod.makeClassifier,
    boundPaths: oracleMod.boundPaths,
    DEFAULT_LAYER23: oracleMod.DEFAULT_LAYER23,
    loadRegression: regressionMod.loadRegression,
    parseRecord: recordMod.parseRecord || defaultParseRecord,
    RECORD_RE: recordMod.RECORD_RE,
    gitPreregHistory: preregMod.gitPreregHistory,
    extractRev: runMod.extractRev,
    checkTipTree: runMod.checkTipTree,
    computeRun: typeof deps.computeRun === 'function' ? deps.computeRun : runMod.computeRun,
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

/**
 * The records of a revision, parsed: {path, rec}. O68-15: a record file that does not parse is KEPT with `rec: null` (the gate emits
 * `record_unparsable:<path>` for it; dropping it silently would let the round fall back to the previous round's record).
 */
function listRecords(git, root, rev, _nameStatus, parseRecord, RECORD_RE) {
  const files = listFiles(git, root, rev, RECORD_DIR_REL).filter((rel) => RECORD_RE.test(rel)).sort();
  const out = [];
  for (const rel of files) {
    const text = git.readAt(root, rev, rel);
    const rec = readJson(text);
    void parseRecord;
    out.push({ path: rel, rec: isObject(rec) ? rec : null });
  }
  return out;
}

/** Every record path that does not parse, at the round's revision (O68-15: `record_unparsable:<path>` each). */
const unparsableRecords = (records) => records.filter((entry) => !isObject(entry.rec)).map((entry) => entry.path);

/** The records that DID parse: the ones every record rule reads (an unparsable one is already a violation of its own). */
const parsedRecords = (records) => records.filter((entry) => isObject(entry.rec));

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
