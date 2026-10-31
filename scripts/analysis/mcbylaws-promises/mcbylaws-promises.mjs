// SPEC LINK: MB-73 plan sections 1, 5, 7 and 8; R-KQ (a row needs an artifact and a green), R-KU (an id never vanishes),
//            R-KK (the audit pack is a generated witness), F-IDEM (byte-identical output for one ref).
// The promises CLI: --check | --status | --write-green | --write-red | --audit-pack. Exit 0 green, 1 red, 2 could not run.
// main() returns the exit code and never calls process.exit; every refusal or throw fails closed, never as a pass.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, listTracked, readAt } from '../mcbylaws/git-util.mjs';
import { RULE_FILE, ALLOW_REL } from '../mcbylaws/literal-scan.mjs';
import { runCheck } from './promise-check.mjs';
import { statusTable, summaryLine, auditPack } from './promise-status.mjs';
import { auditEntries } from './promise-counts.mjs';
import { runAtRef } from './promise-run.mjs';
import { writeRed, writeGreen } from './promise-write.mjs';
import { buildRegister, readArtifacts } from './promise-register.mjs';
import { readIncrementIds } from './promise-increment.mjs';

const USAGE = 'usage: mcbylaws-promises --check | --status | --write-red <id> | --write-green <id> | --audit-pack '
  + '[--rev <r>] [--base <b>] [--increment <n>] [--audit <file> --pack <file>] [--out <file>]';
const CANNOT = 'FAIL:R:cannot-decide';
const POLICY_REL = 'mcbylaws/protected-paths.json';
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
// A mode takes NO value except the two writers; those and every option take one.
const MODES = ['--check', '--status', '--write-red', '--write-green', '--audit-pack'];
const WRITERS = ['--write-red', '--write-green'];
const OPTIONS = ['--rev', '--base', '--increment', '--audit', '--pack', '--out'];
const NEEDS_VALUE = ['--write-red', '--write-green', ...OPTIONS];

/** The parsed argv: `{mode, target, opts}` or `{error}` when the flags cannot be read. PURE. */
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.map(String) : [];
  const opts = {};
  let mode = null;
  let target = null;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (MODES.includes(flag) && !WRITERS.includes(flag)) {
      if (mode !== null) return { error: `two modes: ${mode} ${flag}` };
      mode = flag;
      continue;
    }
    if (!NEEDS_VALUE.includes(flag)) return { error: `unknown flag: ${flag}` };
    const value = args[i + 1];
    if (value === undefined || value === '' || MODES.includes(value) || NEEDS_VALUE.includes(value)) return { error: `missing value: ${flag}` };
    i += 1;
    if (MODES.includes(flag)) {
      if (mode !== null) return { error: `two modes: ${mode} ${flag}` };
      mode = flag;
      target = value;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(opts, flag)) return { error: `duplicate flag: ${flag}` };
    opts[flag] = value;
  }
  if (mode === null) return { error: 'no mode' };
  if ((mode === '--write-red' || mode === '--write-green') !== (target !== null)) return { error: 'unexpected value' };
  if (Object.prototype.hasOwnProperty.call(opts, '--pack') !== Object.prototype.hasOwnProperty.call(opts, '--audit')) {
    return { error: '--audit and --pack go together' };
  }
  return { mode, target, opts };
}

/** `{text}` of a readable file, else `{error}`. */
function readText(file) {
  try {
    return { text: fs.readFileSync(file, 'utf8') };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** The parsed JSON object at `rev:rel` (`null` when it is absent or unparsable). PURE-ish. */
function readJsonAt(cwd, rev, rel) {
  const text = readAt(cwd, rev, rel);
  if (typeof text !== 'string') return null;
  try {
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The CLI's drift block, built from the BASE ref (the checked ref cannot loosen what judges it), or `{error}`.
 * @returns {{drift?: object, error?: string}}
 */
function buildDrift(args, opts) {
  const base = opts['--base'];
  const rev = opts['--rev'] ?? 'HEAD';
  const policy = readJsonAt(args.cwd, base, POLICY_REL);
  if (policy === null) return { error: `${CANNOT}:policy` };
  const allow = readJsonAt(args.cwd, base, ALLOW_REL);
  if (allow === null) return { error: `${CANNOT}:literal-allow` };
  const literalArgs = (dir) => ({
    root: dir, files: listTracked(args.cwd, rev) ?? [], policy, allow,
    astGrepBin: path.join(args.cwd, 'node_modules', '.bin', 'ast-grep'), ruleFile: path.join(dir, RULE_FILE),
  });
  return { drift: { policy, home: args.home, literalArgs } };
}

/** One check against one ref with the CLI's inputs and printed lines; `{lines, res}` or `{fatal}`. */
function checkOnce(args, opts) {
  let auditText;
  let auditPackValue;
  if (opts['--audit'] !== undefined) {
    const read = readText(opts['--audit']);
    if (read.error !== undefined) return { fatal: `${CANNOT}:audit-file` };
    auditText = read.text;
    const packFile = readText(opts['--pack']);
    if (packFile.error !== undefined) return { fatal: `${CANNOT}:audit-pack` };
    try {
      auditPackValue = JSON.parse(packFile.text);
    } catch {
      return { fatal: `${CANNOT}:audit-pack` };
    }
  }
  const built = buildDrift(args, opts);
  if (built.error !== undefined) return { fatal: built.error };
  const res = runCheck({
    cwd: args.cwd, rev: opts['--rev'] ?? 'HEAD', base: opts['--base'], incArg: opts['--increment'],
    auditText, auditPack: auditPackValue, drift: built.drift, run: args.run, queue: args.queue,
  });
  const lines = [...res.lines, summaryLine(res.counts)];
  return { lines, res };
}

/** The WAIT lines (condition 4): always printed after the FAIL lines, never part of the exit code. */
const waitsOf = (res) => (Array.isArray(res.waits) ? res.waits.filter((l) => typeof l === 'string') : []);

/** The done evidence (`green/<id>.json`) or the FAIL line naming this id; the summary and run lines never count as evidence. */
function evidenceOf(id, lines) {
  const bad = lines.find((l) => l.startsWith('FAIL:') && l.endsWith(`:${id}`));
  return bad === undefined ? '' : bad;
}

/** `--status`: reports the table at one ref; exit 2 only when the check could not decide. */
function statusMode(args, opts, out) {
  const once = checkOnce(args, opts);
  if (once.fatal !== undefined) {
    out(once.fatal);
    return 2;
  }
  const head = git(args.cwd, ['rev-parse', opts['--rev'] ?? 'HEAD']);
  const commit = head.status === 0 ? head.stdout.trim() : '';
  const rows = once.res.rows.map((row) => ({
    id: row.id,
    state: once.res.states[row.id],
    evidence: once.res.states[row.id] === 'done' ? `mcbylaws/promises/green/${row.id}.json` : evidenceOf(row.id, once.res.lines),
  }));
  out(statusTable({ commit, registerHash: once.res.registerHash, rows }));
  for (const line of waitsOf(once.res)) out(line);
  return once.res.exit === 2 ? 2 : 0;
}

/** `--write-red` / `--write-green`: the register entry for the id, then the writer; a throw is a red. */
function writeMode(args, opts, mode, id, out, err) {
  const reg = buildRegister({ cwd: args.cwd, rev: 'HEAD', incIds: readIncrementIds(args.cwd, 'HEAD').ids });
  const artifacts = readArtifacts(args.cwd, 'HEAD').artifacts;
  const row = reg.rows.find((r) => r.id === id);
  const entry = Object.prototype.hasOwnProperty.call(artifacts, id) ? artifacts[id] : undefined;
  if (row === undefined || entry === undefined) {
    out(`${CANNOT}:no-entry:${id}`);
    return 2;
  }
  try {
    const rel = mode === '--write-red'
      ? writeRed({ cwd: args.cwd, id, entry, runner: args.run })
      : writeGreen({ cwd: args.cwd, id, row, entry, runner: args.run });
    out(rel);
    return 0;
  } catch (e) {
    err(`refused: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

/** `--audit-pack`: the tests run AT the checked ref, one entry per declared id, with the real counts. */
function auditMode(args, opts, out) {
  const rev = opts['--rev'] ?? 'HEAD';
  const artifacts = readArtifacts(args.cwd, rev);
  const map = isObject(artifacts.artifacts) ? artifacts.artifacts : {};
  if (!isObject(artifacts.artifacts)) {
    out(`${CANNOT}:artifacts`);
    return 2;
  }
  const rows = Object.keys(map).sort().map((id) => ({ id, artifact: map[id].artifact }));
  const run = typeof args.run === 'function' ? args.run : (a) => runAtRef({ cwd: args.cwd, rev, files: a.files });
  const res = rows.length === 0 ? { ok: true, json: {} } : run({ cwd: args.cwd, files: [...new Set(rows.map((r) => r.artifact))] });
  if (!res || res.ok !== true) {
    const reason = res && typeof res.reason === 'string' && res.reason !== '' ? res.reason : 'unknown';
    out(`${CANNOT}:run:${reason}`);
    return 2;
  }
  const audited = auditEntries({ artifacts: rows, json: res.json });
  const cannot = audited.lines.find((l) => l.startsWith(CANNOT));
  if (cannot !== undefined) {
    out(cannot);
    return 2;
  }
  const text = `${JSON.stringify(auditPack(audited.entries), null, 2)}\n`;
  if (opts['--out'] === undefined) out(text);
  else fs.writeFileSync(path.resolve(args.cwd, opts['--out']), text);
  for (const line of audited.lines) out(line);
  return audited.lines.length > 0 ? 1 : 0;
}

/**
 * The promises CLI.
 * @param {string[]} argv
 * @param {{cwd?: string, home?: string, out?: Function, err?: Function, run?: Function, queue?: Function}} [io]
 * @returns {number} the exit code
 */
export function main(argv, { cwd = process.cwd(), home = os.homedir(), out = (s) => console.log(s), err = (s) => console.error(s), run, queue } = {}) {
  const args = { cwd, home, run, queue };
  try {
    const parsed = parseArgs(argv);
    if (parsed.error !== undefined) {
      err(USAGE);
      return 2;
    }
    // B3: a mode that judges needs `--base`; without it the check could not be decided, which is not a usage error.
    if ((parsed.mode === '--check' || parsed.mode === '--status') && parsed.opts['--base'] === undefined) {
      out(`${CANNOT}:no-base`);
      return 2;
    }
    if (parsed.mode === '--status') return statusMode(args, parsed.opts, out);
    if (parsed.mode === '--audit-pack') return auditMode(args, parsed.opts, out);
    if (parsed.mode === '--check') {
      const once = checkOnce(args, parsed.opts);
      if (once.fatal !== undefined) {
        out(once.fatal);
        return 2;
      }
      const waits = waitsOf(once.res);
      for (const line of once.lines.slice(0, -1)) out(line);
      for (const line of waits) out(line);
      out(once.lines[once.lines.length - 1]);
      return once.res.exit;
    }
    return writeMode(args, parsed.opts, parsed.mode, parsed.target, out, err);
  } catch (e) {
    out(`${CANNOT}:${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

// `--run` is invoked as `npx vitest run <test> --run`; the compare is unaffected by any argv tail.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
