// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (one gate command the hooks call: exit 0 green, 1 red, 2 could not run; MB-67 treats 2 as a FAIL)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 1 and 8 (CLI shape agreed with MB-67 line 255: node scripts/analysis/mcbylaws-loop/loop-gate.mjs --mode <commit|push|ci>)
//
// B7a: the CLI shell only. Argument parsing, the exit-code mapping, the report format, the dispatch of main(), and the git readers.
// The verdicts live in loop-gate-context / loop-gate-eval / loop-gate-run and are imported LAZILY (run/verify/remove and the check path)
// so this module loads, and its parsers can be tested, without them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nameStatusOf } from './loop-oracle.mjs';

export const COMMANDS = ['check', 'run', 'verify', 'regression-remove'];
export const MODES = ['commit', 'push', 'ci'];
export const USAGE = 'usage: loop-gate [check|run|verify|regression-remove] --mode <commit|push|ci> [--root <dir>] [--json]';

const BOOL_FLAGS = { json: true, write: true, 'write-ids': true };
const VALUE_FLAGS = ['mode', 'root', 'ruling', 'group', 'ids', 'increment', 'decision', 'reason', 'base', 'findings', 'target'];

/** argv without node and script -> the full argument object. `error` is a plain string ('' when the arguments are well formed). */
export function parseArgs(argv) {
  const a = {
    command: '', mode: '', root: '.', json: false, write: false, writeIds: false, ruling: '', group: '', ids: '',
    increment: '', decision: '', reason: '', base: '', findings: '', target: '', error: '',
  };
  const list = Array.isArray(argv) ? argv.map(String) : [];
  for (let i = 0; i < list.length; i++) {
    const tok = list[i];
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq < 0 ? tok.slice(2) : tok.slice(2, eq);
      const inline = eq < 0 ? null : tok.slice(eq + 1);
      if (BOOL_FLAGS[name]) {
        if (inline === null) a[toKey(name)] = true;
        else a[toKey(name)] = !(inline === 'false' || inline === '0' || inline === '');
        continue;
      }
      if (VALUE_FLAGS.includes(name)) {
        const v = inline !== null ? inline : nextValue(list, i);
        if (inline === null) i += 1;
        a[toKey(name)] = v;
        continue;
      }
      if (!a.error) a.error = `unknown_flag:--${name}`;
      continue;
    }
    if (COMMANDS.includes(tok)) {
      if (!a.command) a.command = tok;
      continue;
    }
    if (!a.error) a.error = `unknown_argument:${tok}`;
  }
  if (!a.error && !a.command) {
    if (!a.mode) a.error = USAGE;
    else a.command = 'check';
  }
  // `--mode` is only validated where it is the check command's mode (run/verify/remove take no mode).
  if (!a.error && a.command === 'check') {
    if (!a.mode) a.error = 'mode_needed';
    else if (!MODES.includes(a.mode)) a.error = `bad_mode:${a.mode}`;
  }
  if (!a.error && a.command === 'regression-remove' && !a.ruling && !a.group && !a.ids) a.error = 'removal_needs:ruling|group|ids';
  return a;
}

const toKey = (name) => (name === 'write-ids' ? 'writeIds' : name);
const nextValue = (list, i) => {
  const n = list[i + 1];
  return typeof n === 'string' && !n.startsWith('--') ? n : '';
};

/** 2 when the gate could not run, else 1 when it found violations, else 0. */
export function exitCodeFor({ violations = [], error = '' } = {}) {
  if (error) return 2;
  return violations.length ? 1 : 0;
}

/** The report lines: `FAIL <code>` each, `note: <text>` each, then one summary line (or the JSON console when --json). */
export function formatReport({ command = 'check', mode = 'check', violations = [], notes = [], json = false, report = null } = {}) {
  const v = Array.isArray(violations) ? violations.map(String) : [];
  const n = Array.isArray(notes) ? notes.map(String) : [];
  if (json) return [JSON.stringify(report === null || report === undefined ? { command, mode, violations: v, notes: n } : report)]; // the console reads JSON only when asked
  const lines = v.map((code) => `FAIL ${code}`);
  for (const note of n) lines.push(`note: ${note}`);
  lines.push(v.length ? `loop-gate ${mode}: ${v.length} failure(s)` : `loop-gate ${mode}: ok`);
  return lines;
}

/** The reader name `nameStatusFromText`. loop-oracle.nameStatusOf parses the TAB format (no path may contain a tab). */
export const nameStatusFromText = nameStatusOf;

/**
 * O68-09: parse `--name-status -z` output. NUL separated: `<status>\0<path>\0`, and for renames/copies `<R100>\0<old>\0<new>\0`
 * (both paths with status `R`). A path is taken verbatim, never trimmed, so spaces / non-ASCII / backslashes survive.
 */
export function nameStatusZOf(text) {
  const parts = String(text || '').split('\0');
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const status = parts[i];
    const raw = typeof status === 'string' ? status.replace(/\n/g, '') : '';
    i += 1;
    if (!raw) continue;
    const s = raw[0];
    if (s === 'R' || s === 'C') {
      const oldPath = parts[i];
      const newPath = parts[i + 1];
      i += 2;
      if (typeof oldPath === 'string' && oldPath) out.push({ s, p: oldPath });
      if (typeof newPath === 'string' && newPath) out.push({ s, p: newPath });
      continue;
    }
    const p = parts[i];
    i += 1;
    if (typeof p === 'string' && p) out.push({ s, p });
  }
  return out;
}

// --- git readers ----------------------------------------------------------------------------------------------------------------
// Reading process.env only to build the scrubbed copy is the single permitted use (no GIT_* leaks in: a hook exports GIT_DIR / GIT_INDEX_FILE).
const scrubbedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

// O68-08: `git commit -a` / `git commit -- <path>` write an ALTERNATE index (GIT_INDEX_FILE inside .git). For the STAGED readers only that
// variable is kept, and only when its resolved path lies inside the repository's git dir: anywhere else it is ignored like every other GIT_*.
const realOr = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return '';
  }
};

/** The git dir of `root`, realpath'd; '' when it cannot be resolved. */
function absoluteGitDir(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], {
      encoding: 'utf8', env: scrubbedEnv(), maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
    return realOr(out.trim());
  } catch {
    return '';
  }
}

/** The index file the hook is committing, when it is set AND inside the git dir of `root`; null otherwise. */
export function trustedIndexFile(root) {
  const raw = process.env.GIT_INDEX_FILE;
  if (typeof raw !== 'string' || !raw) return null;
  const gitDir = absoluteGitDir(root);
  if (!gitDir) return null;
  const resolved = realOr(path.resolve(root, raw));
  if (!resolved || resolved === gitDir) return null;
  const prefix = gitDir.endsWith(path.sep) ? gitDir : `${gitDir}${path.sep}`;
  return resolved.startsWith(prefix) ? resolved : null;
}

/** The env for a STAGED read: the full scrub plus GIT_INDEX_FILE when it is trusted (inside the git dir); every other call is scrubbed. */
export function stagedEnv(root) {
  const env = scrubbedEnv();
  const index = trustedIndexFile(root);
  if (index) env.GIT_INDEX_FILE = index;
  return env;
}

const readGit = (root, args, env) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
});

/** `git -C root <args>` -> stdout text (never trimmed: readAt returns the file as is). No shell. */
export function git(root, args) {
  return readGit(root, args, scrubbedEnv());
}

/** A STAGED read (`:index` / `--cached`): the scrubbed env with the hook's trusted index kept (see stagedEnv). */
const gitStaged = (root, args) => readGit(root, args, stagedEnv(root));

const tryGit = (root, args) => {
  try {
    return git(root, args);
  } catch {
    return null;
  }
};

const tryGitStaged = (root, args) => {
  try {
    return gitStaged(root, args);
  } catch {
    return null;
  }
};

/** The staged tree vs HEAD, renames resolved: a rename yields BOTH paths with status `R`. Reads the hook's index (stagedEnv). */
export function stagedNameStatus(root) {
  return nameStatusZOf(gitStaged(root, ['diff', '--cached', '--name-status', '-z', '-M']));
}

/** The union over `base..tip`. */
export function rangeNameStatus(root, base, tip) {
  return nameStatusZOf(git(root, ['diff', '--name-status', '-z', '-M', `${base}..${tip}`]));
}

/** One name-status list per commit of `base..tip`, oldest first, merge commits skipped. */
export function perCommitNameStatus(root, base, tip) {
  const shas = git(root, ['rev-list', '--reverse', '--no-merges', `${base}..${tip}`]).split('\n').map((s) => s.trim()).filter(Boolean);
  return shas.map((sha) => nameStatusZOf(git(root, ['show', '--name-status', '-z', '-M', '--format=', sha])));
}

/** The merge base of HEAD and `targetRef`; '' when there is none (unrelated histories, absent ref). */
export function mergeBase(root, targetRef) {
  const out = tryGit(root, ['merge-base', 'HEAD', targetRef]);
  return out === null ? '' : out.trim();
}

const looksLikePath = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith(':') && !p.startsWith('--');

/** `{path: blob id}` at `rev` (`':index'` = the index). Paths absent at that rev are simply not in the map. */
export function blobIdsAt(root, rev, paths) {
  const list = (Array.isArray(paths) ? paths : []).filter(looksLikePath);
  const out = {};
  if (!list.length) return out;
  if (rev === ':index') {
    const outText = (() => {
      try {
        return gitStaged(root, ['ls-files', '-s', '--', ...list]);
      } catch {
        return '';
      }
    })();
    for (const line of outText.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const meta = (parts[0] || '').trim().split(' ');
      const p = parts.slice(1).join('\t');
      const id = meta[1];
      if (id && p && !out[p]) out[p] = id;
    }
    return out;
  }
  for (const p of list) {
    const id = tryGit(root, ['rev-parse', '--verify', '--quiet', `${rev}:${p}`]);
    if (id && id.trim()) out[p] = id.trim();
  }
  return out;
}

/** The file's text at `rev` (`':index'` = the staged copy); null when it does not exist there. */
export function readAt(root, rev, filePath) {
  if (!looksLikePath(filePath)) return null;
  const spec = rev === ':index' ? `:${filePath}` : `${rev}:${filePath}`;
  const out = rev === ':index' ? tryGitStaged(root, ['show', spec]) : tryGit(root, ['show', spec]);
  return out === null ? null : out;
}

// --- main -----------------------------------------------------------------------------------------------------------------------

const defaultWrite = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Run the gate. Returns the exit code (0 green, 1 red, 2 could not run). `deps` is the test seam. */
export async function main(argv, deps = {}) {
  const write = typeof deps.write === 'function' ? deps.write : defaultWrite;
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    write(`loop-gate: cannot run: ${messageOf(err)}`);
    return 2;
  }
  if (parsed.error) {
    write(parsed.error === USAGE ? USAGE : `loop-gate: ${parsed.error}`);
    if (!parsed.error.startsWith('usage:')) write(USAGE);
    return 2;
  }
  try {
    if (parsed.command === 'run') return await dispatchRun(parsed, write);
    if (parsed.command === 'verify') return await dispatchVerify(parsed, write);
    if (parsed.command === 'regression-remove') return await dispatchRemove(parsed, write);
    return await check(parsed, deps, write);
  } catch (err) {
    write(`loop-gate: cannot run: ${messageOf(err)}`);
    return 2;
  }
}

const messageOf = (err) => {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) return err.message;
  return String(err);
};

/** O68-16: a verdict is only trustworthy when it is an object carrying an ARRAY `violations`; anything else is exit 2 (fail closed). */
const isVerdict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.violations);

const BAD_VERDICT = 'loop-gate: cannot run: bad verdict';

/** The check path: buildContext -> evaluateGate -> report. Both are injectable so the shell is tested alone. */
async function check(parsed, deps, write) {
  const buildContext = typeof deps.buildContext === 'function'
    ? deps.buildContext
    : async (a) => (await import('./loop-gate-context.mjs')).buildContext(a);
  const evaluateGate = typeof deps.evaluateGate === 'function'
    ? deps.evaluateGate
    : async (ctx, a) => (await import('./loop-gate-eval.mjs')).evaluateGate(ctx, a);
  const ctx = await buildContext(parsed);
  const verdict = await evaluateGate(ctx, parsed);
  if (!isVerdict(verdict)) {
    write(BAD_VERDICT);
    return 2;
  }
  const violations = verdict.violations.map(String);
  const notes = Array.isArray(verdict.notes) ? verdict.notes.map(String) : [];
  const report = verdict.report === undefined ? null : verdict.report;
  for (const line of formatReport({ command: parsed.command, mode: parsed.mode, violations, notes, json: parsed.json, report })) write(line);
  if (verdict.error) {
    write(`loop-gate: cannot run: ${verdict.error}`);
    return 2;
  }
  return exitCodeFor({ violations, error: '' });
}

// run / verify / regression-remove are imported LAZILY: this module must load (and be testable) without them.
const dispatchRun = async (parsed, write) => {
  const mod = await import('./loop-gate-run.mjs');
  return toExit(await mod.runCommand(parsed, write), parsed, write);
};

const dispatchVerify = async (parsed, write) => {
  const mod = await import('./loop-gate-run.mjs');
  return toExit(await mod.verifyCommand(parsed, write), parsed, write);
};

const dispatchRemove = async (parsed, write) => {
  const mod = await import('./loop-gate-run.mjs');
  const fn = typeof mod.removeCommand === 'function' ? mod.removeCommand : mod.regressionRemoveCommand;
  return toExit(await fn(parsed, write), parsed, write);
};

/** The run/verify/remove commands answer `{violations, notes, report}` or a bare exit code. A bad verdict is exit 2 (fail closed). */
const toExit = (res, parsed, write) => {
  if (typeof res === 'number') return res;
  if (!isVerdict(res)) {
    write(BAD_VERDICT);
    return 2;
  }
  const verdict = res;
  const violations = verdict.violations.map(String);
  const notes = Array.isArray(verdict.notes) ? verdict.notes.map(String) : [];
  const report = verdict.report === undefined ? null : verdict.report;
  if (verdict.error) {
    write(`loop-gate: cannot run: ${verdict.error}`);
    return 2;
  }
  for (const line of formatReport({ command: parsed.command, mode: parsed.mode || parsed.command, violations, notes, json: parsed.json, report })) write(line);
  return exitCodeFor({ violations, error: '' });
};

// --- entry guard -----------------------------------------------------------------------------------------------
// Shells differ on argv[1]: macOS shimmed binaries pass the RESOLVED symlink target (/opt/homebrew/Cellar/...) while import.meta.url
// keeps the invoked path, so compare real paths when both resolve.
const realOf = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return '';
  }
};
const isEntry = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    if (import.meta.url === pathToFileURL(path.resolve(entry)).href) return true;
    return realOf(fileURLToPath(import.meta.url)) === realOf(entry);
  } catch {
    return false;
  }
})();

if (isEntry) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    process.stderr.write(`loop-gate: cannot run: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 2;
  });
}
