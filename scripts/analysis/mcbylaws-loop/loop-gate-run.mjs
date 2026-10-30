// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (the loop gate runs the scorer itself and hashes every case)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 8 (the scorer is spawned, never inlined; got_sha covers the printed class and value, G68-11; per-mode groups)
// The only disk I/O is the scorecard spawn (a temp --out file, removed afterwards) and reading the floors / pin files; no process.env, no network.
// Everything else is pure: the gate runner decides, the caller (loop-gate.mjs) prints and exits.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPercentFloors } from './loop-floors.mjs';
import { runCanary } from './loop-decide.mjs';
import { canon, gotSha } from './loop-record.mjs';

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
