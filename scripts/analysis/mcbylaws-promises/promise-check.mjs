// SPEC LINK: MB-73 plan sections 2 to 9; R-KQ (a row needs an artifact and a green), R-KU (an id never vanishes),
//            R-KK (the queue and the audit pack are witnesses), R-BF (a green increment has no red in scope).
// The whole `--check` pipeline: each step APPENDS its lines, a `FAIL:R:cannot-decide` stops what needs its output.

import { listTracked, readAt } from '../mcbylaws/git-util.mjs';
import { queueCheck } from '../mcbylaws/mcbylaws-queue-check.mjs';
import {
  readIncrementIds, recordsAt, derivedN, checkIncrementArg, scopeLines, incrementLines,
} from './promise-increment.mjs';
import { buildRegister, readArtifacts, joinArtifacts, idsAt, vanishedLines, registerHash } from './promise-register.mjs';
import { addOnlyLines } from './promise-record.mjs';
import { runVitest, matchTests, emptyTestLines } from './promise-run.mjs';
import { greenLines } from './promise-greens.mjs';
import { loadScanConfig, oldEngineLines, notDoingLines, notDoingTokens } from './promise-drift.mjs';
import { heldLines, dirtyLines, literalLines } from './promise-drift-mb67.mjs';
import { countStates, auditLines } from './promise-status.mjs';

const CANNOT = 'FAIL:R:cannot-decide';
const isCannot = (line) => typeof line === 'string' && line.startsWith(CANNOT);
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The exit code of a line list: 2 when anything could not be decided, else 1 when there is any line, else 0. PURE. */
export function classify(lines) {
  const list = Array.isArray(lines) ? lines : [];
  if (list.some((l) => typeof l === 'string' && l.startsWith('FAIL:R:cannot-decide'))) return 2;
  return list.length > 0 ? 1 : 0;
}

/** The lines without duplicates, first occurrence kept. PURE. */
export function dedupe(lines) {
  return [...new Set(Array.isArray(lines) ? lines : [])];
}

/** The unique artifact paths of the rows whose entry resolves at `rev`. */
function resolvable(rows, artifacts, cwd, rev) {
  return (rows || [])
    .filter((row) => isObject(artifacts[row.id]) && readAt(cwd, rev, artifacts[row.id].artifact) !== null)
    .map((row) => ({ id: row.id, path: artifacts[row.id].artifact, entry: artifacts[row.id] }));
}

/** Runs `fn` and turns a throw into one cannot-decide line (a step never swallows a failure as a pass). */
function guard(code, fn) {
  try {
    return fn();
  } catch {
    return [`${CANNOT}:${code}`];
  }
}

/**
 * The full check against one commit.
 * @param {{cwd: string, rev?: string, base?: string|null, incArg?: string, auditText?: string, auditPack?: object,
 *          drift?: {policy: object, home?: string, literalArgs?: object}, run?: Function, queue?: Function}} opts
 * @returns {{lines: string[], exit: number, rows: object[], states: object, counts: object, registerHash: string}}
 */
export function runCheck(opts = {}) {
  const cwd = opts.cwd;
  const rev = typeof opts.rev === 'string' && opts.rev !== '' ? opts.rev : 'HEAD';
  const base = typeof opts.base === 'string' && opts.base !== '' ? opts.base : null;
  const queue = typeof opts.queue === 'function' ? opts.queue : queueCheck;
  const run = typeof opts.run === 'function' ? opts.run : runVitest;
  const out = [];
  const add = (lines) => {
    for (const line of Array.isArray(lines) ? lines : []) out.push(line);
    return out.some(isCannot);
  };
  const done = (rows, artifacts, states, counts) => ({
    lines: dedupe(out), exit: classify(out), rows: rows || [], states: states || {}, counts, registerHash: registerHash(rows || [], artifacts || {}),
  });
  const abort = (extra) => done([], {}, {}, countStates([]), { ...extra });

  // 1. increments
  const inc = guard('increment-ids', () => readIncrementIds(cwd, rev));
  const incIds = inc.ids || [];
  if (add(inc.lines)) return abort();

  // 2. the queue, verbatim
  const qLines = guard('queue', () => queue({ cwd, rev }));
  if (add(qLines)) return abort();

  // 3. the register
  const reg = guard('register', () => buildRegister({ cwd, rev, incIds }));
  const rows = reg.rows || [];
  if (add(reg.lines)) return abort();

  // 4. the declared artifact map and its join
  const art = guard('artifacts', () => readArtifacts(cwd, rev));
  const artifacts = isObject(art.artifacts) ? art.artifacts : {};
  if (add(art.lines)) return abort();
  add(guard('join', () => joinArtifacts({ rows, artifacts, cwd, rev })));

  // 5. the base: ids never vanish, records are add-only
  if (base !== null) {
    const baseIds = guard('base-ids', () => idsAt(cwd, base));
    if (add(Array.isArray(baseIds) ? [`${CANNOT}:base-ids`] : [])) return abort();
    add(vanishedLines({ baseIds, rows }));
    add(guard('add-only', () => addOnlyLines({ cwd, base, rev })));
  }

  // 6. the run: one call over the unique artifact paths, plus the empty-test scan
  const entries = [...new Map(resolvable(rows, artifacts, cwd, rev).map((e) => [`${e.id}\u0000${e.path}`, e])).values()];
  for (const e of entries) {
    const source = readAt(cwd, rev, e.path);
    if (typeof source === 'string') add(emptyTestLines(e.id, source, e.entry.test_name));
  }
  let matches = null;
  if (entries.length > 0) {
    const result = guard('run', () => run({ cwd, files: [...new Set(entries.map((e) => e.path))] }));
    if (!isObject(result) || Array.isArray(result)) {
      add([`${CANNOT}:run:threw`]);
    } else if (result.ok !== true) {
      add([`${CANNOT}:run:${typeof result.reason === 'string' && result.reason !== '' ? result.reason : 'unknown'}`]);
    } else {
      const mapped = entries.map((e) => ({ id: e.id, artifact: e.path, test_name: e.entry.test_name }));
      const matched = guard('run:tests', () => matchTests(result.json, mapped));
      matches = isObject(matched) ? matched : {};
    }
  }

  // 7. the greens
  const greens = guard('greens', () => greenLines({ cwd, rev, rows, artifacts, matches: matches ?? {} }));
  add(greens.lines);
  const states = {};
  for (const row of rows) states[row.id] = (greens.states || {})[row.id] || 'red';

  // 8. the increment scope
  if (matches !== null) {
    const recs = guard('records', () => recordsAt({ cwd, rev }));
    const der = guard('increment', () => (Array.isArray(recs) ? [null, CANNOT] : derivedN(recs.records, incIds)));
    const n = Array.isArray(der) ? null : der.n;
    add(Array.isArray(recs) ? recs : recs.lines);
    add(Array.isArray(der) ? der.slice(1) : der.lines);
    add(scopeLines(rows, incIds));
    add(checkIncrementArg(opts.incArg, n, incIds));
    add(incrementLines({ rows, states, n, ids: incIds }));
  }

  // 9. drift: the old-engine scan and the "not doing" tokens, over the tracked files of the scan roots
  const cfg = guard('scan-config', () => loadScanConfig(cwd, base || rev));
  const config = isObject(cfg.config) ? cfg.config : null;
  add(cfg.lines);
  if (config !== null) {
    const roots = Array.isArray(config.scan_roots) ? config.scan_roots : [];
    const tracked = listTracked(cwd, rev);
    const files = (tracked || []).filter((p) => roots.some((r) => typeof r === 'string' && p.startsWith(r)))
      .map((p) => ({ path: p, text: readAt(cwd, rev, p) ?? '' }));
    add(oldEngineLines({ files, config }));
    const items = rows.filter((row) => row.kind === 'not-doing')
      .map((row) => ({ id: row.id, tokens: notDoingTokens(row.quoted_line) }));
    add(notDoingLines({ items, files, config }));
  }
  if (isObject(opts.drift)) {
    add(guard('held', () => heldLines(opts.drift.policy)));
    add(guard('worktree', () => dirtyLines(opts.drift.policy, opts.drift.home)));
    if (opts.drift.literalArgs) add(guard('literal-scan', () => literalLines(opts.drift.literalArgs)));
  }

  // 10. the audit pack against the audit text
  if (typeof opts.auditText === 'string') {
    if (!isObject(opts.auditPack)) add([`${CANNOT}:audit-pack`]);
    else add(guard('audit', () => auditLines({ pack: opts.auditPack, auditText: opts.auditText })));
  }

  const counts = countStates(rows.map((row) => ({ id: row.id, state: states[row.id] })));
  return done(rows, artifacts, states, counts);
}
