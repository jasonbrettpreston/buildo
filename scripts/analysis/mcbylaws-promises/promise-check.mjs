// SPEC LINK: MB-73 plan sections 2 to 9; R-KQ (a row needs an artifact and a green), R-KU (an id never vanishes),
//            R-KK (the queue and the audit pack are witnesses), R-BF (a green increment has no red in scope).
// The whole `--check` pipeline: each step APPENDS its lines through `guard`, a `FAIL:R:cannot-decide` aborts.

import { git, listTracked, readAt } from '../mcbylaws/git-util.mjs';
import { queueCheck } from '../mcbylaws/mcbylaws-queue-check.mjs';
import {
  readIncrementIds, recordsAt, derivedN, checkIncrementArg, scopeLines, incrementLines, inScope,
} from './promise-increment.mjs';
import { buildRegister, readArtifacts, joinArtifacts, idsAt, vanishedLines, registerHash } from './promise-register.mjs';
import { addOnlyLines } from './promise-record.mjs';
import { runVitest, runAtRef, withCheckout, matchTests, emptyTestLines } from './promise-run.mjs';
import { greenLines } from './promise-greens.mjs';
import { loadScanConfig, oldEngineLines, notDoingLines, notDoingTokens } from './promise-drift.mjs';
import { heldLines, dirtyLines, literalLines } from './promise-drift-mb67.mjs';
import { countStates, auditLines } from './promise-status.mjs';

const CANNOT = 'FAIL:R:cannot-decide';
/** Condition 4: the two WAIT lines, always present, never part of `lines` and never changing `exit`. */
export const WAITS = [
  'WAIT:R:withdrawn-has-commits: blocked by WAIT-P67-2 (queue tracked, scope globs on withdrawn rows), dated 2026-10-31',
  'WAIT:W:untraced-number: blocked by MB-31 (no Layer 3 result rows exist), dated 2026-10-31',
];

const isCannot = (line) => typeof line === 'string' && line.startsWith(CANNOT);
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

/** The exit code of a line list: 2 when anything could not be decided, else 1 when there is any line, else 0. PURE. */
export function classify(lines) {
  const list = Array.isArray(lines) ? lines : [];
  if (list.some(isCannot)) return 2;
  return list.length > 0 ? 1 : 0;
}

/** The lines without duplicates, first occurrence kept. PURE. */
export function dedupe(lines) {
  return [...new Set(Array.isArray(lines) ? lines : [])];
}

/** The unique artifact paths of the rows whose entry resolves at `rev`; `cwd` not a repo throws. */
function resolvable(rows, artifacts, cwd, rev) {
  const probe = git(cwd, ['rev-parse', '--git-dir']);
  if (probe.status !== 0) throw new Error('not-a-repository');
  return arr(rows)
    .filter((row) => isObject(artifacts[row.id]) && readAt(cwd, rev, artifacts[row.id].artifact) !== null)
    .map((row) => ({ id: row.id, path: artifacts[row.id].artifact, entry: artifacts[row.id] }));
}

/** Runs `fn`: `{value: fn(), lines: []}`, or on a throw `{value: undefined, lines: [cannot-decide:<code>]}`. */
export function guard(code, fn) {
  try {
    return { value: fn(), lines: [] };
  } catch {
    return { value: undefined, lines: [`${CANNOT}:${code}`] };
  }
}

/**
 * The lines of one drift scan: held, then dirty, then the literal scan. An args function runs inside a checkout of the
 * checked ref, so the scan reads that ref's files; a ref that cannot be checked out fails closed.
 */
function driftScan(cwd, rev, drift, step, add) {
  step('held', () => heldLines(drift.policy));
  step('worktree', () => dirtyLines(drift.policy, drift.home));
  if (drift.literalArgs === undefined) return;
  if (typeof drift.literalArgs !== 'function') {
    step('literal-scan', () => literalLines(drift.literalArgs));
    return;
  }
  // The args function runs inside a checkout of `rev`: a `null` checkout (or a failed one) is cannot-decide.
  const co = guard('literal-checkout', () => withCheckout(cwd, rev, (dir) => drift.literalArgs(dir)));
  const ok = co.lines.length === 0 && isObject(co.value) && co.value.ok === true;
  if (!ok) add([`${CANNOT}:literal-checkout`]);
  else step('literal-scan', () => literalLines(co.value.value));
}

/**
 * The full check against one commit.
 * @param {{cwd: string, rev?: string, base?: string|null, incArg?: string, auditText?: string, auditPack?: object,
 *          drift?: {policy: object, home?: string, literalArgs?: object|Function}, run?: Function, queue?: Function}} opts
 * @returns {{lines: string[], exit: number, waits: string[], rows: object[], states: object, counts: object, registerHash: string}}
 */
export function runCheck(opts) {
  const o = isObject(opts) ? opts : {}; const cwd = o.cwd;
  const rev = typeof o.rev === 'string' && o.rev !== '' ? o.rev : 'HEAD';
  const base = typeof o.base === 'string' && o.base !== '' ? o.base : null;
  const queue = typeof o.queue === 'function' ? o.queue : queueCheck;
  const run = typeof o.run === 'function'
    ? o.run
    : (a) => runAtRef({ cwd: a.cwd, rev, files: a.files });
  const out = [];
  const add = (lines) => {
    for (const line of Array.isArray(lines) ? lines : []) out.push(line);
    return out.some(isCannot);
  };
  // One step: a throw is one cannot-decide line AND every line the value carries (an array, or an object's own
  // `.lines`) is added in full, so a step's judgement is never silently dropped.
  const step = (code, fn) => {
    const g = guard(code, fn);
    add(g.lines);
    if (Array.isArray(g.value)) add(g.value);
    else if (isObject(g.value) && Array.isArray(g.value.lines)) add(g.value.lines);
    return g;
  };
  const done = (rows, artifacts, states, counts) => ({
    lines: dedupe(out), exit: classify(out), waits: [...WAITS], rows: rows || [], states: states || {}, counts,
    registerHash: registerHash(rows || [], artifacts || {}),
  });
  const abort = () => done([], {}, {}, countStates([]));

  // 0. the base is REQUIRED: records, the scan config and the vanished ids are all read from it.
  if (base === null) {
    add([`${CANNOT}:no-base`]);
    return abort();
  }

  // 1. increments
  const inc = step('increment-ids', () => readIncrementIds(cwd, rev));
  if (!isObject(inc.value)) return abort();
  const incIds = arr(inc.value.ids);

  // 2. the queue, verbatim
  const q = guard('queue', () => queue({ cwd, rev }));
  if (add(q.lines) || !Array.isArray(q.value)) return abort();
  add(q.value);

  // 3. the register: no rows means there is nothing to judge, never a pass.
  const reg = guard('register', () => buildRegister({ cwd, rev, incIds }));
  if (add(reg.lines) || !isObject(reg.value)) return abort();
  const rows = arr(reg.value.rows);
  add(arr(reg.value.lines));
  if (out.some(isCannot)) return abort();
  if (rows.length === 0) {
    add([`${CANNOT}:no-promises`]);
    return abort();
  }

  // 4. the declared artifact map and its join
  const art = step('artifacts', () => readArtifacts(cwd, rev));
  if (!isObject(art.value)) return abort();
  const artifacts = isObject(art.value.artifacts) ? art.value.artifacts : {};
  step('join', () => joinArtifacts({ rows, artifacts, cwd, rev }));

  // 5. the base: ids never vanish, records are add-only
  const baseIds = step('base-ids', () => idsAt(cwd, base));
  if (!(baseIds.value instanceof Set)) return abort();
  step('vanished', () => vanishedLines({ baseIds: baseIds.value, rows }));
  step('add-only', () => addOnlyLines({ cwd, base, rev }));

  // 6. the run at the CHECKED ref: one call over the unique artifact paths, plus the empty-test scan
  const res = guard('resolvable', () => resolvable(rows, artifacts, cwd, rev));
  if (add(res.lines)) return abort();
  const entries = [...new Map(arr(res.value).map((e) => [`${e.id}\u0000${e.path}`, e])).values()];
  for (const e of entries) {
    const src = guard('source', () => readAt(cwd, rev, e.path));
    if (add(src.lines) || typeof src.value !== 'string') continue;
    add(emptyTestLines(e.id, src.value, e.entry.test_name));
  }
  let matches = null;
  if (entries.length > 0) {
    const r = guard('run', () => run({ cwd, files: [...new Set(entries.map((e) => e.path))] }));
    if (add(r.lines)) return abort();
    if (!isObject(r.value) || r.value.ok !== true) {
      add([`${CANNOT}:run:${isObject(r.value) && typeof r.value.reason === 'string' && r.value.reason !== '' ? r.value.reason : 'unknown'}`]);
      return abort();
    }
    const mapped = entries.map((e) => ({ id: e.id, artifact: e.path, test_name: e.entry.test_name }));
    const m = guard('run:tests', () => matchTests(r.value.json, mapped));
    if (add(m.lines) || !isObject(m.value)) return abort();
    matches = m.value;
  }

  // 7. the greens
  const greens = step('greens', () => greenLines({ cwd, rev, rows, artifacts, matches: matches ?? {} }));
  if (!isObject(greens.value)) return abort();
  const states = {};
  for (const row of rows) states[row.id] = isObject(greens.value.states) ? greens.value.states[row.id] || 'red' : 'red';

  // 8. the increment scope: ALWAYS, derived from the records at the checked ref
  const recs = step('records', () => recordsAt({ cwd, rev }));
  if (!isObject(recs.value)) return abort();
  const der = step('increment', () => derivedN(arr(recs.value.records), incIds));
  if (!isObject(der.value)) return abort();
  const n = der.value.n;
  add(scopeLines(rows, incIds));
  add(checkIncrementArg(o.incArg, n, incIds));
  if (!rows.some((row) => inScope(row, n, incIds))) add([`${CANNOT}:no-promises-in-scope`]);
  add(incrementLines({ rows, states, n, ids: incIds }));

  // 9. drift: the old-engine scan and the "not doing" tokens over the tracked files of the scan roots. The config is
  //    read at BASE, so the checked ref cannot loosen the rule that judges it.
  const cfg = isObject(o.drift) ? step('scan-config', () => loadScanConfig(cwd, base)) : { value: undefined };
  const config = isObject(cfg.value) && isObject(cfg.value.config) ? cfg.value.config : null;
  if (config !== null) {
    const roots = arr(config.scan_roots);
    const tracked = guard('tracked-list', () => listTracked(cwd, rev));
    if (add(tracked.lines) || !Array.isArray(tracked.value)) {
      add([`${CANNOT}:tracked-list`]);
      return abort();
    }
    const files = [];
    for (const p of tracked.value.filter((x) => roots.some((r) => typeof r === 'string' && x.startsWith(r)))) {
      const text = guard(`unreadable:${p}`, () => readAt(cwd, rev, p));
      if (add(text.lines) || typeof text.value !== 'string') {
        add([`${CANNOT}:unreadable:${p}`]);
        return abort();
      }
      files.push({ path: p, text: text.value });
    }
    step('old-engine', () => oldEngineLines({ files, config }));
    const items = rows.filter((row) => row.kind === 'not-doing').map((row) => ({ id: row.id, tokens: notDoingTokens(row.quoted_line) }));
    step('not-doing', () => notDoingLines({ items, files, config }));
  }
  if (isObject(o.drift)) driftScan(cwd, rev, o.drift, step, add);
  else add([`${CANNOT}:drift-not-supplied`]);

  // 10. the audit pack against the audit text
  if (typeof o.auditText === 'string') {
    if (!isObject(o.auditPack)) add([`${CANNOT}:audit-pack`]);
    else step('audit', () => auditLines({ pack: o.auditPack, auditText: o.auditText }));
  }

  const counts = countStates(rows.map((row) => ({ id: row.id, state: states[row.id] })));
  return done(rows, artifacts, states, counts);
}
