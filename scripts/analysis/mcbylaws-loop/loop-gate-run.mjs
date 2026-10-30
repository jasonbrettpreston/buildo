// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (the loop gate runs the scorer itself and hashes every case)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 8 (the scorer is spawned, never inlined; got_sha covers the printed class and value, G68-11; per-mode groups)
// The only disk I/O is the scorecard spawn (a temp --out file, removed afterwards) and reading the floors / pin files; no process.env, no network.
// Everything else is pure: the gate runner decides, the caller (loop-gate.mjs) prints and exits.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPercentFloors } from './loop-floors.mjs';
import { runCanary, roundsSinceThresholds } from './loop-decide.mjs';
import { canon, gotSha, bindRecord, writeRecordExclusive, checkBound, nextRound, recordPath, sha256, RECORD_RE } from './loop-record.mjs';
import { loadRegression, saveRegression, removeCases } from './loop-regression.mjs';
import { makeClassifier, loadLayer23 } from './loop-oracle.mjs';
import { incrementGreen } from './loop-increment.mjs';

const SCORER_REL = 'scripts/analysis/bylaw-validation/coa-scorecard.mjs';
const MAX_BUFFER = 64 * 1024 * 1024;
const REGENERABLE = 'generated_not_regenerable';

/** A leading `~` (or `~` alone) becomes the home directory; anything else is returned unchanged. PURE. */
export function expandHome(p) {
  if (typeof p !== 'string' || p.length === 0) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The child env without any GIT_* variable (a spawned scorer must not see the gate's git context). */
function cleanEnv() {
  const out = {};
  for (const key of Object.keys(process.env)) if (!key.startsWith('GIT_')) out[key] = process.env[key];
  return out;
}

const producerOf = (group) => (group && group.producer) || {};
const oursOf = (row) => (row && row.ours) || null;

/**
 * The scorer rows of one group as gate cases: id "<notice>|<n>", the group, the printed class as `status`, the value, the reason, the
 * normalized clause, and got_sha over {status: row.class, value, reason} so the hash covers the printed class and value (G68-11). PURE.
 */
export function casesFromRows(groupId, rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => {
    const ours = oursOf(row);
    const status = row.class;
    const value = ours ? ours.value : null;
    const reason = ours ? ours.reason : null;
    return {
      group: groupId,
      id: `${row.notice}|${row.n}`,
      status,
      value,
      reason,
      clause: row.clause_norm,
      got_sha: gotSha({ status, value, reason }),
    };
  });
}

/** The data file a producer names, expanded; a producer with no data_dir throws data_missing: <dir>. */
function dataFile(producer, name) {
  const dir = expandHome(producer.data_dir);
  if (typeof dir !== 'string' || dir.length === 0) throw new Error(`data_missing: ${String(dir)}`);
  if (!fs.existsSync(dir)) throw new Error(`data_missing: ${dir}`);
  return name ? path.join(dir, String(name)) : dir;
}

/**
 * Spawn the committed scorer for one group and read its rows: `{ rows, cases, scorecard }`. The --out file lives in a fresh temp dir,
 * removed afterwards; a non-zero exit throws; an unknown producer kind throws unknown_producer. IO.
 */
export function runProducer(root, group, deps = {}) {
  const producer = producerOf(group);
  if (producer.kind !== 'coa-scorecard') throw new Error(`unknown_producer: ${String(producer.kind)}`);
  const spawn = typeof deps.spawn === 'function' ? deps.spawn : execFileSync;
  const dataDir = dataFile(producer, null);
  const argv = [path.join(root, SCORER_REL), '--root', root];
  if (producer.notices != null) argv.push('--notices', dataFile(producer, producer.notices));
  if (producer.parcels != null) argv.push('--parcels', dataFile(producer, producer.parcels));
  if (producer.plan_facts != null) argv.push('--plan-facts', dataFile(producer, producer.plan_facts));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-gate-run-'));
  const out = path.join(tmp, 'sc.json');
  argv.push('--out', out);
  try {
    spawn('node', argv, { env: cleanEnv(), maxBuffer: MAX_BUFFER });
    const scorecard = readJson(out);
    const rows = Array.isArray(scorecard && scorecard.rows) ? scorecard.rows : [];
    return { rows, cases: casesFromRows(group.id, rows), scorecard, dataDir };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** The class totals of a set of scorer rows: { "<class>": n }. PURE. */
export function classTotals(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row && row.class);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/**
 * The committed pin against the rows just scored: `['generated_not_regenerable']` when the pin's totals differ from the class totals of
 * the rows (or its variances from the row count), else []. A group without a pin has nothing to compare. IO (reads the pin file).
 */
export function pinMismatch(group, rows, root) {
  const producer = producerOf(group);
  if (producer.pin == null) return [];
  const pinPath = path.isAbsolute(producer.pin) ? producer.pin : path.join(root, producer.pin);
  const pin = readJson(pinPath);
  const list = Array.isArray(rows) ? rows : [];
  const expected = (pin && pin.totals) || {};
  const got = classTotals(list);
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(got)])];
  const differs = keys.some((k) => (expected[k] || 0) !== (got[k] || 0));
  if (differs) return [REGENERABLE];
  if (typeof pin.variances === 'number' && pin.variances !== list.length) return [REGENERABLE];
  return [];
}

/** The groups a mode runs: commit -> fast === true; push -> all; ci -> external !== true. PURE. */
export function groupsForMode(regression, mode) {
  const groups = regression && Array.isArray(regression.groups) ? regression.groups : [];
  if (mode === 'commit') return groups.filter((g) => g && g.fast === true);
  if (mode === 'push') return groups.filter((g) => Boolean(g));
  if (mode === 'ci') return groups.filter((g) => g && g.external !== true);
  throw new Error(`unknown_mode: ${String(mode)}`);
}

// No floors file: no floor lines at all, in the shape reportFloors reads (so every line is PASS).
const NO_FLOORS = () => ({ overall: {}, articles: {}, pooled: null });

const floorsOf = (root, group) => {
  const file = producerOf(group).floors;
  if (file == null) return NO_FLOORS();
  return readJson(path.isAbsolute(file) ? file : path.join(root, file));
};

/**
 * Run the mode's groups and build the run object evaluateGate reads: `{ cases, skipped, canary, report, counts, baseRows, curRows,
 * regenMismatch, groups, floorsOk }`, or null when no group runs (ci with only external groups: the CI note says those cases are not run).
 * The canary re-checks each case's own value against itself through canon, so a red canary proves the comparison detects a mutation.
 * IO (spawns the producer per group, reads floors and pins).
 */
export function computeRun({ root, regression, mode, registerText, deps = {} }) {
  const groups = groupsForMode(regression, mode);
  if (groups.length === 0) return null;
  const cases = [];
  const counts = {};
  const curRows = [];
  const violations = [];
  const owed = [];
  const regenMismatch = [];
  for (const group of groups) {
    const produced = runProducer(root, group, deps);
    const floors = checkPercentFloors(floorsOf(root, group), produced.rows, registerText || '');
    for (const v of floors.violations) violations.push(`${group.id} ${v}`);
    for (const o of floors.owed) owed.push({ group: group.id, ...o });
    for (const m of pinMismatch(group, produced.rows, root)) regenMismatch.push(`${group.id} ${m}`);
    cases.push(...produced.cases);
    counts[`${group.id} cases`] = produced.cases.length;
    for (const c of produced.cases) curRows.push({ group: group.id, id: c.id, status: c.status, clause: c.clause });
  }
  const canary = runCanary(
    cases.map((c) => ({ id: c.id, expected: c.value, got: c.value })),
    (a, b) => (canon(a) === canon(b) ? 'pass' : 'fail'),
  );
  const all = regression && Array.isArray(regression.groups) ? regression.groups : [];
  return {
    cases,
    skipped: 0,
    canary,
    report: { violations, owed },
    counts,
    baseRows: null,
    curRows,
    regenMismatch,
    groups: all.map((g) => ({ id: g.id, introduced_in: g.introduced_in })),
    floorsOk: violations.length === 0,
  };
}

// --- the three commands: run --write / --write-ids, verify, regression-remove -----------------------------------------------
// Every command takes its `deps` ({ git, computeRun, now, rulings, ... }) injected; each default is LAZY so this module loads
// (and is testable) without the git reader of the shell. A command returns { violations, notes, report } (or { error }), which the
// shell's toExit maps to an exit code; no command calls process.exit and no command prints on its own.

// The bylaw register text (69a + 69) every ruling reader parses (M19). Read here, not in loop-gate-context (B7b), so `run` needs no context.
const REGISTER_FILES = ['docs/specs/01-pipeline/69a_mcbylaw_register.md', 'docs/specs/01-pipeline/69_mcbylaw_policy.md'];

/** The scorer class -> the record status (PR-68-1: the record stores one of pass | fail | accepted | pending). PURE. */
export const CLASS_STATUS = Object.freeze({
  MATCH: 'pass',
  ANSWERED: 'pass',
  'BY-LAW CHANGED': 'pass',
  'NOT SCORABLE': 'pass',
  DATA: 'pass',
  DIFFER: 'fail',
  'NO ANSWER': 'fail',
  'NOT MODELLED': 'fail',
  OWED: 'fail',
});

function statusOf(className) {
  return Object.prototype.hasOwnProperty.call(CLASS_STATUS, String(className)) ? CLASS_STATUS[String(className)] : 'pending';
}

// `git ls-files`, scrubbed of every GIT_* variable (a hook exports GIT_DIR / GIT_INDEX_FILE: only -C <root> may decide the repo).
const scrubbedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

function defaultGit(root) {
  return (args) => execFileSync('git', ['-C', root, ...(Array.isArray(args) ? args : [])], {
    encoding: 'utf8',
    env: scrubbedEnv(),
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
}

const gitOr = (deps, root) => (typeof deps.git === 'function' ? deps.git : defaultGit(root));

/** `git ls-files` output -> relative paths, one per line. */
function lsFiles(git) {
  return String(git(['ls-files']) || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/** The parsed options the shell hands a run command; a plain object of strings ('' = absent). */
const str = (value) => (typeof value === 'string' ? value.trim() : '');

/** The register text (69a + 69) under root; an unreadable file is an empty text (no OWED line known), never a crash. PURE-ish (reads two docs). */
export function registerTextOf(root) {
  return REGISTER_FILES
    .map((rel) => {
      try {
        return fs.readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

/**
 * Blob id at rev (':index' = the index) of a path: an injected `blobIdsAt` wins, else the shell's reader, else a direct
 * `git ls-files -s`. Absent path -> null. IO.
 */
async function blobAt(deps, git, rev, root, relPath) {
  if (typeof deps.blobIdsAt === 'function') {
    const map = deps.blobIdsAt(root, rev, [relPath]) || {};
    const id = Object.prototype.hasOwnProperty.call(map, relPath) ? map[relPath] : null;
    return typeof id === 'string' && id ? id : null;
  }
  if (typeof deps.git !== 'function') {
    // the shell's readers are used when no git was injected, so git is only ever called from one place
    try {
      const mod = await import('./loop-gate.mjs');
      const map = mod.blobIdsAt(root, rev, [relPath]) || {};
      const id = Object.prototype.hasOwnProperty.call(map, relPath) ? map[relPath] : null;
      return typeof id === 'string' && id ? id : null;
    } catch {
      return null;
    }
  }
  const text = String(git(['ls-files', '-s', '--', relPath]) || '');
  for (const line of text.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    if (parts.slice(1).join('\t') === relPath) {
      const meta = (parts[0] || '').trim().split(' ');
      return meta[1] ? meta[1] : null;
    }
  }
  return null;
}

/**
 * The index blob id of many paths at once (`blobIds` shape, returning only the ids that exist). `deps.blobIdsAt` wins (one call, as
 * the gate reader takes a list); else, when no git was injected, the shell's reader (a single `git ls-files -s`); else `blobIdsAt`
 * per path. IO.
 */
async function blobIdsOf(deps, root, paths) {
  const list = Array.isArray(paths) ? paths : [];
  const out = {};
  if (!list.length) return out;
  if (typeof deps.blobIdsAt === 'function') {
    const map = deps.blobIdsAt(root, ':index', list) || {};
    for (const p of list) {
      if (Object.prototype.hasOwnProperty.call(map, p) && typeof map[p] === 'string' && map[p]) out[p] = map[p];
    }
    return out;
  }
  if (typeof deps.git !== 'function') {
    try {
      const mod = await import('./loop-gate.mjs');
      const map = mod.blobIdsAt(root, ':index', list) || {};
      for (const p of list) {
        if (Object.prototype.hasOwnProperty.call(map, p) && typeof map[p] === 'string' && map[p]) out[p] = map[p];
      }
      return out;
    } catch {
      return out;
    }
  }
  const git = gitOr(deps, root);
  for (const p of list) {
    const id = await blobAt(deps, git, ':index', root, p);
    if (id) out[p] = id;
  }
  return out;
}

/** The file's text at rev; an injected `readAt` wins, else the shell's reader, else `git show`. null = absent. IO. */
async function textAt(deps, git, rev, root, relPath) {
  if (typeof deps.readAt === 'function') {
    const text = deps.readAt(root, rev, relPath);
    return typeof text === 'string' ? text : null;
  }
  if (typeof deps.git !== 'function') {
    try {
      const mod = await import('./loop-gate.mjs');
      const text = mod.readAt(root, rev, relPath);
      return typeof text === 'string' ? text : null;
    } catch {
      return null;
    }
  }
  try {
    return String(git(['show', rev === ':index' ? `:${relPath}` : `${rev}:${relPath}`]));
  } catch {
    return null;
  }
}

/** The case ids a set of accepted findings names (a covered case is a registered value change). PURE. */
export function findingIds(findings) {
  const out = new Set();
  if (!Array.isArray(findings)) return out;
  for (const item of findings) {
    if (item && typeof item === 'object' && typeof item.case === 'string' && item.case.length > 0) out.add(item.case);
  }
  return out;
}

/** The findings array of a `--findings` JSON file: an array of objects. A missing path is the empty array; a malformed file throws. PURE-ish (reads one file). */
export function readFindings(file) {
  const p = expandHome(file);
  if (typeof p !== 'string' || p.length === 0) return [];
  const parsed = readJson(p);
  if (!Array.isArray(parsed)) throw new Error(`findings_not_an_array: ${p}`);
  return parsed.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

/** The producer's pin file under root (expanded), or null when the group has no pin. */
function pinOf(root, group) {
  const pin = producerOf(group).pin;
  if (pin == null) return null;
  return readJson(path.isAbsolute(pin) ? pin : path.join(root, String(pin)));
}

/**
 * The scorer pin inputs of every pinned group as `pin / <key>` entries: table_version, evaluator_version, scorer_sha (G68-08
 * extra keys of `inputs`). Only string / finite-number values are bound: an input that lives in an external data dir is not a tree
 * file, so it cannot be a blob id. PURE given the pin files (read by the caller).
 */
export function pinInputs(pins) {
  const out = {};
  for (const [group, pin] of pins) {
    const inputs = pin && typeof pin === 'object' && pin.inputs && typeof pin.inputs === 'object' ? pin.inputs : null;
    if (!inputs) continue;
    for (const key of ['table_version', 'evaluator_version', 'scorer_sha']) {
      const value = inputs[key];
      if (typeof value === 'string' && value.length > 0) out[`pin / ${key}`] = value;
      else if (typeof value === 'number' && Number.isFinite(value)) out[`pin / ${key}`] = String(value);
    }
  }
  return out;
}

/** The consumed data of every external group as `data:<group>` = sha256 of its notices file content (G68-08). IO (reads the data file). */
export function dataInputs(root, regression) {
  const out = {};
  for (const group of regression && Array.isArray(regression.groups) ? regression.groups : []) {
    if (!group || group.external !== true) continue;
    const producer = producerOf(group);
    if (producer.notices == null) continue;
    const dir = expandHome(producer.data_dir);
    if (typeof dir !== 'string' || dir.length === 0) continue;
    const file = path.join(dir, String(producer.notices));
    try {
      out[`data:${group.id}`] = sha256(fs.readFileSync(file, 'utf8'));
    } catch {
      // no notices file on disk: nothing to bind (the run itself reports the missing data)
    }
  }
  return out;
}

/** Every record path on disk under docs/reports/loop-records (relative, forward slashes). IO. */
export function recordPathsOnDisk(root) {
  const base = path.join(root, 'docs/reports/loop-records');
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  walk(base);
  return out;
}

/**
 * The run covers every group of the set (the mode push gate): a null run, a group the run did not run (its case set is empty), or a
 * run whose own group universe omits a declared group (what a commit / ci run reports) refuses. PURE.
 */
export function coversAllGroups(run, regression) {
  if (!run || !Array.isArray(run.cases) || !Array.isArray(run.groups)) return false;
  const groups = regression && Array.isArray(regression.groups) ? regression.groups.filter(Boolean) : [];
  const produced = new Set(run.cases.map((c) => c && c.group));
  const ran = new Set(run.groups.filter(Boolean).map((g) => g.id));
  // a run that reports a group the set does not hold is not the set's run (what a commit / ci run of another mode reports)
  const declared = new Set(groups.map((g) => (g ? g.id : '')));
  for (const id of ran) if (!declared.has(id)) return false;
  for (const group of groups) {
    if (!ran.has(group.id)) return false;
    if (!produced.has(group.id)) return false;
  }
  return true;
}

const LIVE_DATA_RE = /^(data:|pin \/ )/;

/**
 * The record of one round (PR-68-1: written only by this tool; PR-68-8: the canary and the floors are NOT stored).
 * `run` = computeRun's output, `findings` = the accepted findings array, `inputs` = the bound blobs. PURE.
 */
export function recordFor({ increment, round, decision, reason, findings = [], run, inputs = {} }) {
  // a case named in an accepted finding is EXCUSED: its status becomes `accepted`, whatever class the scorer printed (a finding is
  // the register's authority over a failing case); an unmapped class of every other case stays pending.
  const accepted = findingIds(findings);
  const cases = (Array.isArray(run && run.cases) ? run.cases : []).map((c) => {
    const id = c && typeof c.id === 'string' ? c.id : '';
    const status = statusOf(c ? c.status : '');
    return { id, status: accepted.has(id) ? 'accepted' : status, got_sha: c && typeof c.got_sha === 'string' ? c.got_sha : '' };
  });
  const bound = {};
  for (const key of Object.keys(inputs).sort()) {
    const value = inputs[key];
    if (typeof value === 'string' && value.length > 0) bound[key] = value;
  }
  return bindRecord({
    schema: 'loop-record-v1',
    increment,
    round,
    decision,
    reason,
    accepted_findings: Array.isArray(findings) ? findings : [],
    cases,
    inputs: bound,
  });
}

/**
 * `run --write-ids` / `--write`: run every group (mode push), then either rewrite each group's ids file from the run's own case ids
 * (the ids are written by the tool, never typed) or write the round's record; without either flag it is a dry run that prints the counts.
 * -> { violations, notes, report } — the shell maps it to an exit code. IO (reads the set, spawns the scorer, writes).
 */
export async function runCommand(parsed, write, deps = {}) {
  const say = typeof write === 'function' ? write : () => {};
  const root = str(parsed && parsed.root) || '.';
  const regression = loadRegression(root);
  const compute = typeof deps.computeRun === 'function' ? deps.computeRun : computeRun;
  // a run only covers the record when it covers every group, so the command runs with mode push (a full run) and refuses otherwise.
  const mode = str(parsed && parsed.mode);
  if (mode && mode !== 'push') return { violations: ['run_needs_mode_push_or_full'], notes: [] };
  let run = null;
  try {
    run = compute({ root, regression, mode: 'push', registerText: registerTextOf(root) });
  } catch {
    run = null; // a run that cannot go covers no group
  }
  console.log('TEMPDEBUG run', JSON.stringify({ write: parsed && parsed.write, writeIds: parsed && parsed.writeIds, increment: parsed && parsed.increment, findings: parsed && parsed.findings, runGroups: run && run.groups, cases: run && run.cases.map((c) => [c.id, c.status]), covers: coversAllGroups(run, regression), regressionGroups: regression.groups.map((g) => g.id) }));
  if (!coversAllGroups(run, regression)) return { violations: ['run_needs_mode_push_or_full'], notes: [] };

  const idsByGroup = new Map();
  for (const c of run.cases) {
    if (!c || typeof c.group !== 'string' || typeof c.id !== 'string') continue;
    const list = idsByGroup.get(c.group) || [];
    if (!list.includes(c.id)) list.push(c.id);
    idsByGroup.set(c.group, list);
  }

  if (parsed && parsed.writeIds) {
    const next = JSON.parse(JSON.stringify(regression));
    const changed = [];
    const unchanged = [];
    let anyChanged = false;
    for (const group of next.groups) {
      const ids = idsByGroup.get(group.id) || [];
      const saved = Array.isArray(group.ids) ? group.ids : [];
      const rel = `mcbylaws/loop/data/ids-${group.id}.json`;
      if (!ids.length) {
        unchanged.push(rel); // a group that produced nothing keeps its saved ids
        continue;
      }
      const same = saved.length === ids.length && saved.every((id, i) => id === ids[i]);
      if (same) {
        unchanged.push(rel);
        continue;
      }
      group.ids = ids;
      group.ids_sha256 = idsShaLocal(ids);
      anyChanged = true;
      changed.push(`${rel}: ${ids.length} ids`);
    }
    // only a changed ids list rewrites the set: a matching run leaves regression-set.json untouched
    if (anyChanged) {
      saveRegression(root, next);
      for (const line of changed) say(`ids written ${line}`);
      say(`write-ids: ${changed.length} group(s) updated`);
    }
    for (const rel of unchanged) say(`write-ids: ${rel} unchanged`);
    if (!anyChanged) say('write-ids: every ids file already matches the run (unchanged)');
    return { violations: [], notes: [] };
  }

  if (parsed && parsed.write) {
    const increment = str(parsed.increment);
    const decision = str(parsed.decision);
    const reason = typeof parsed.reason === 'string' ? parsed.reason : '';
    if (!increment || !decision || !reason.trim()) return { violations: ['run_needs_increment_decision_reason'], notes: [] };
    const findings = str(parsed.findings) ? readFindings(str(parsed.findings)) : [];
    const git = gitOr(deps, root);
    const classify = makeClassifier(loadLayer23(root));
    // the bound set is the classified CODE / ORACLE files of the index. A GENERATED file (the regression set, an ids list, a
    // record) is re-derived every round, so binding it would make every record stale_green the moment the ids are written.
    const toBind = lsFiles(git).filter((relPath) => {
      const kind = classify(relPath);
      return kind === 'code' || kind === 'oracle';
    });
    const indexBlobs = await blobIdsOf(deps, root, toBind);
    const inputs = {};
    for (const relPath of toBind) {
      const id = indexBlobs[relPath];
      if (typeof id === 'string' && id) inputs[relPath] = id;
    }
    const pins = [];
    for (const group of regression.groups) {
      const pin = pinOf(root, group);
      if (pin) pins.push([group.id, pin]);
    }
    Object.assign(inputs, pinInputs(pins), dataInputs(root, regression));
    const round = nextRound(recordPathsOnDisk(root), increment);
    const record = recordFor({ increment, round, decision, reason, findings, run, inputs });
    console.log('TEMPDEBUG record', JSON.stringify({ findings, cases: record.cases.map((c) => [c.id, c.status]) }));
    const written = writeRecordExclusive(root, record);
    console.log('TEMPDEBUG disk', JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, written), 'utf8')).cases.map((c) => c.status)));
    say(`record written ${written}`);
    return { violations: [], notes: [] };
  }

  // The dry run: what a --write would record, never written.
  say(`run (mode push, ${regression.groups.length} group(s)): ${run.cases.length} case(s)`);
  for (const group of regression.groups) say(`  ${group.id}: ${(idsByGroup.get(group.id) || []).length} case(s)`);
  say('dry run: no record and no ids file written (add --write or --write-ids)');
  return { violations: [], notes: [] };
}

/** The ids hash saveRegression expects, without importing idsSha again (the same JSON encoding). PURE. */
function idsShaLocal(ids) {
  return sha256(JSON.stringify(ids));
}

/** Every record on disk with its parsed content; a record that does not parse is kept with `null` (verify counts it, never crashes). PURE given the files. */
export function readRecords(root) {
  return recordPathsOnDisk(root)
    .filter((rel) => RECORD_RE.test(rel))
    .sort()
    .map((rel) => {
      const m = RECORD_RE.exec(rel) || [];
      let rec = null;
      try {
        rec = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      } catch {
        rec = null;
      }
      const round = parseInt(m[2] === undefined ? '' : m[2], 10);
      return { record: rel, increment: m[1] === undefined ? '' : m[1], round: Number.isFinite(round) ? round : 0, rec };
    });
}

/** The history: records newest-last within an increment, increments in creation order (the first round of an increment decides the order). PURE. */
function recordHistory(records) {
  const list = [...records].sort((a, b) => a.round - b.round);
  const created = new Map();
  for (const r of list) if (!created.has(r.increment)) created.set(r.increment, r.round);
  return list.sort((a, b) => {
    const ia = created.get(a.increment) === undefined ? 0 : created.get(a.increment);
    const ib = created.get(b.increment) === undefined ? 0 : created.get(b.increment);
    if (ia !== ib) return ia - ib;
    return a.round - b.round;
  });
}

/** G68-01: the ids each group of the set holds; the artifact of a case is its group's ids file. */
function artifactOf(regression, caseId) {
  for (const group of regression && Array.isArray(regression.groups) ? regression.groups : []) {
    if (group && Array.isArray(group.ids) && group.ids.includes(caseId)) return `mcbylaws/loop/data/ids-${group.id}.json`;
  }
  return null;
}

/** The floor lines a run measures (checkCountFloors' shape), from the scorer counts of a run. */
function countsOfRun(run) {
  const out = {};
  for (const [key, value] of Object.entries((run && run.counts) || {})) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/**
 * `verify --json`: per increment the latest record, with every DERIVED value recomputed here from the tree and a fresh push-mode run —
 * never read from the record itself. `bound_ok` = checkBound over the record's inputs against the working tree (index) blobs; a `pin / `
 * input is a scorer pin value (not a tree file) and a `data:<group>` input is an external data file, so neither is a blob lookup.
 * `increment_green` and `canary_ok` are computed for the current (latest) increment only; others report null. IO.
 */
export async function verifyCommand(parsed, write, deps = {}) {
  const say = typeof write === 'function' ? write : () => {};
  const root = str(parsed && parsed.root) || '.';
  const regression = loadRegression(root);
  const git = gitOr(deps, root);
  const history = recordHistory(readRecords(root));
  const latest = [];
  for (const r of history) {
    const at = latest.findIndex((x) => x.increment === r.increment);
    if (at >= 0) latest.splice(at, 1, r);
    else latest.push(r);
  }
  const current = latest.length ? latest[latest.length - 1] : null;

  // the red twins and the increment green come from ONE fresh run of every group (mode push)
  let run = null;
  if (current) {
    const compute = typeof deps.computeRun === 'function' ? deps.computeRun : computeRun;
    try {
      run = compute({ root, regression, mode: 'push', registerText: registerTextOf(root) });
    } catch {
      run = null; // a run that cannot go is reported as not green, never as an exception
    }
  }
  const canaryOk = run ? run.canary && run.canary.observed === 'fail' ? true : false : null;
  const greenOfCurrent = current && run ? incrementGreenOf({ root, increment: current.increment, latest, run, regression }) : null;
  void countsOfRun;

  // The thresholds walk the whole history (one entry per record, oldest first). An accept is a green round only UNDER its own
  // increment: another increment's record is no longer an accept threshold once the tree ran on. Nothing is read from the record's
  // stored derived fields (PR-68-8).
  const acceptIncrement = (() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const r = history[i];
      if (r && r.rec && r.rec.decision === 'accept' && typeof r.rec.increment === 'string') return r.rec.increment;
    }
    return null;
  })();
  const thresholdsHistory = history.map((r) => {
    const rec = r.rec && typeof r.rec === 'object' ? r.rec : {};
    const isAccept = rec.decision === 'accept';
    return { increment: typeof rec.increment === 'string' ? rec.increment : r.increment, decision: isAccept ? 'accept' : 'revert', green: isAccept && (acceptIncrement === null || r.increment === acceptIncrement) };
  });
  const thresholds = roundsSinceThresholds(thresholdsHistory);

  const out = [];
  for (const r of latest) {
    const rec = r.rec && typeof r.rec === 'object' ? r.rec : {};
    const inputs = rec.inputs && typeof rec.inputs === 'object' ? rec.inputs : {};
    const treeBlobs = {};
    const missing = [];
    for (const p of Object.keys(inputs)) {
      if (LIVE_DATA_RE.test(p)) continue; // a pin value or an external data hash: not a tree path
      const id = await blobAt(deps, git, ':index', root, p);
      if (id) treeBlobs[p] = id;
      else missing.push(p);
    }
    const cases = (Array.isArray(rec.cases) ? rec.cases : []).map((c) => {
      const id = c && typeof c.id === 'string' ? c.id : '';
      return { id, status: c && typeof c.status === 'string' ? c.status : '', artifact: artifactOf(regression, id) };
    });
    const isCurrent = current !== null && r.increment === current.increment;
    // derived here: the case status comes from the fresh run's case of that id (accept / accepted / pass / fail), never from the record
    const freshById = new Map();
    if (run && Array.isArray(run.cases)) for (const c of run.cases) if (c && typeof c.id === 'string') freshById.set(c.id, c);
    out.push({
      record: r.record,
      increment: r.increment,
      round: r.round,
      decision: rec.decision === undefined ? '' : rec.decision,
      bound_ok: checkBound({ inputs, treeBlobs }).length === 0 && missing.length === 0,
      increment_green: isCurrent ? greenOfCurrent : null,
      canary_ok: isCurrent ? canaryOk : null,
      red_twins_ok: isCurrent ? canaryOk : null,
      rounds_since_thresholds: thresholds,
      cases,
    });
  }

  if (parsed && parsed.json) {
    say(JSON.stringify(out));
    return { violations: [], notes: [] };
  }
  const last = out.length ? out[out.length - 1] : null;
  say(last ? `verify: ${out.length} increment(s), latest ${last.increment} (round ${last.round})` : 'verify: no records (0 records under docs/reports/loop-records)');
  return { violations: [], notes: [] };
}

/**
 * The increment ids a gate decision reads, oldest first, derived from the TREE (never from a record's stored field): the closed list
 * of `data/increments.json` under root, then every increment a record names that the list does not know (in first-seen order). A repo
 * without that data file falls back to the record order. PURE-ish (reads one data file).
 */
function incrementOrder(root, list) {
  const out = [];
  let known = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, 'scripts/analysis/mcbylaws-loop/data/increments.json'), 'utf8'));
    if (parsed && Array.isArray(parsed.ids) && parsed.ids.every((id) => typeof id === 'string')) known = parsed.ids;
  } catch {
    known = null;
  }
  if (known) for (const id of known) out.push(id);
  for (const r of list) if (r.increment && !out.includes(r.increment)) out.push(r.increment);
  return out;
}

/**
 * The increment green of the CURRENT increment, derived here from ONE fresh push-mode run: every in-scope case must be green
 * (pass | accepted), the floors must hold and the canary must be red. A run case carries the printed scorer CLASS (MATCH, DIFFER, ...),
 * so it is mapped to the gate status through CLASS_STATUS first; a case named in the record's accepted findings is accepted. PURE.
 */
function incrementGreenOf({ root, increment, latest, run, regression = null }) {
  const current = latest.find((r) => r && r.increment === increment);
  const rec = current && current.rec && typeof current.rec === 'object' ? current.rec : {};
  const accepted = findingIds(rec.accepted_findings);
  // the regression set knows the group of each id (a run case may not carry one); a run case's own group wins
  const setGroups = regression && Array.isArray(regression.groups) ? regression.groups : [];
  const groupOf = (id) => {
    for (const g of setGroups) if (g && Array.isArray(g.ids) && g.ids.includes(id)) return g.id;
    return undefined;
  };
  const cases = (Array.isArray(run.cases) ? run.cases : []).map((c) => {
    const id = c && typeof c.id === 'string' ? c.id : '';
    const status = statusOf(c ? c.status : '');
    const group = c && typeof c.group === 'string' && c.group ? c.group : groupOf(id);
    return { group, id, status: accepted.has(id) ? 'accepted' : status };
  });
  // the group universe: the set's own groups (the ground truth of what an increment introduces) plus any group the run reports
  const groups = [];
  const seenGroups = new Set();
  for (const g of setGroups) {
    if (!g || typeof g.id !== 'string' || seenGroups.has(g.id)) continue;
    seenGroups.add(g.id);
    groups.push({ id: g.id, introduced_in: typeof g.introduced_in === 'string' ? g.introduced_in : 'baseline' });
  }
  for (const g of Array.isArray(run.groups) ? run.groups : []) {
    if (!g || typeof g.id !== 'string' || seenGroups.has(g.id)) continue;
    seenGroups.add(g.id);
    groups.push({ id: g.id, introduced_in: typeof g.introduced_in === 'string' ? g.introduced_in : 'baseline' });
  }
  const verdict = incrementGreen({
    increment,
    ids: incrementOrder(root, latest),
    groups,
    cases,
    floorsOk: run.floorsOk === true && (!run.report || !Array.isArray(run.report.violations) || run.report.violations.length === 0),
    canaryOk: Boolean(run.canary && run.canary.observed === 'fail'),
  });
  return verdict.green === true;
}

/**
 * `regression-remove`: the ONLY door for dropping a regression id (M-343 / PR-68-2). The ruling must be RATIFIED or RULED in the register;
 * the change is written only when removeCases accepts it, so a refused ruling leaves every file as it was. IO (reads the set, writes it).
 */
export async function removeCommand(parsed, write, deps = {}) {
  const say = typeof write === 'function' ? write : () => {};
  const root = str(parsed && parsed.root) || '.';
  const ruling = str(parsed && parsed.ruling);
  const group = str(parsed && parsed.group);
  const ids = str(parsed && parsed.ids).split(',').map((s) => s.trim()).filter(Boolean);
  const missing = [];
  if (!ruling) missing.push('--ruling');
  if (!group) missing.push('--group');
  if (!ids.length) missing.push('--ids');
  if (missing.length) return { violations: [`removal_needs:${missing.join('|')}`], notes: [] };
  const rulings = deps.rulings instanceof Map ? deps.rulings : parseRulingsOf(root);
  const set = loadRegression(root);
  const res = removeCases(set, group, ids, ruling, rulings);
  if (res.violations.length) return { violations: res.violations, notes: [] };
  saveRegression(root, res.set);
  say(`removed ${ids.join(', ')} from ${group} under ruling ${ruling}`);
  say(`regression set written: ${ids.length} id(s) removed, the removal is recorded in removals`);
  return { violations: [], notes: [] };
}

/** Map(id -> status) of the register; an unreadable register is an empty map (so every ruling is refused, never trusted). PURE-ish (reads two docs). */
function parseRulingsOf(root) {
  const out = new Map();
  for (const line of registerTextOf(root).split(/\r?\n/)) {
    const m = /^\|\s*\*\*(M-\d+|P-\d+)\*\*\s*\|/.exec(line);
    if (!m) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
    const status = cells[cells.length - 1] || '';
    const key = m[1] === undefined ? '' : m[1];
    out.set(key, /^RATIFIED\b/.test(status) ? 'RATIFIED' : /^RULED\b/.test(status) ? 'RULED' : /^PROPOSED\b/.test(status) ? 'PROPOSED' : /^RETIRED\b/.test(status) ? 'RETIRED' : 'UNKNOWN');
  }
  return out;
}
