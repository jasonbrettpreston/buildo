// SPEC LINK: MB-73 plan sections 1, 5, 7 and 8; R-KQ (a row needs an artifact and a green), R-KU (an id never vanishes),
//            R-KK (the audit pack is a generated witness), F-IDEM (byte-identical output for one ref).
// The promises CLI: --check | --status | --write-green | --write-red | --audit-pack. Exit 0 green, 1 red, 2 could not run.
// main() returns the exit code and never calls process.exit; every refusal or throw fails closed, never as a pass.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../mcbylaws/git-util.mjs';
import { runCheck } from './promise-check.mjs';
import { statusTable, summaryLine, auditPack } from './promise-status.mjs';
import { writeRed, writeGreen } from './promise-write.mjs';
import { buildRegister, readArtifacts } from './promise-register.mjs';
import { readIncrementIds } from './promise-increment.mjs';

const USAGE = 'usage: mcbylaws-promises --check | --status | --write-red <id> | --write-green <id> | --audit-pack '
  + '[--rev <r>] [--base <b>] [--increment <n>] [--audit <file> --pack <file>] [--out <file>]';
const CANNOT = 'FAIL:R:cannot-decide';
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

/** One check against one ref with the CLI's inputs and printed lines; `{lines, res, exit}`. */
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
  const res = runCheck({
    cwd: args.cwd, rev: opts['--rev'] ?? 'HEAD', base: opts['--base'] ?? null, incArg: opts['--increment'],
    auditText, auditPack: auditPackValue, run: args.run, queue: args.queue,
  });
  const lines = [...res.lines, summaryLine(res.counts)];
  return { lines, res };
}

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

/** `--audit-pack`: one entry per id the artifact map declares; the pack is written to `--out` or printed. */
function auditMode(args, opts, out) {
  const artifacts = readArtifacts(args.cwd, 'HEAD').artifacts;
  const entries = Object.keys(artifacts).sort().map((id) => ({
    id, command: `npx vitest run ${artifacts[id].artifact} --run`, counts: 'Tests  1 passed (1)',
  }));
  const text = `${JSON.stringify(auditPack(entries), null, 2)}\n`;
  if (opts['--out'] === undefined) out(text);
  else fs.writeFileSync(path.resolve(args.cwd, opts['--out']), text);
  return 0;
}

/**
 * The promises CLI.
 * @param {string[]} argv
 * @param {{cwd?: string, out?: Function, err?: Function, run?: Function, queue?: Function}} [io]
 * @returns {number} the exit code
 */
export function main(argv, { cwd = process.cwd(), out = (s) => console.log(s), err = (s) => console.error(s), run, queue } = {}) {
  const args = { cwd, run, queue };
  try {
    const parsed = parseArgs(argv);
    if (parsed.error !== undefined) {
      err(USAGE);
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
      for (const line of once.lines) out(line);
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
