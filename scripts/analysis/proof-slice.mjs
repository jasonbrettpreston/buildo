#!/usr/bin/env node
// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md (the S-gate table whose rows this runner calls),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md,
//            docs/specs/00-architecture/08_agents.md:490 (red tests first).
//
// task-68 PROOF.TOOL, stage 2 (minimum). Plan: docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md sections 4 and 5.
//   node scripts/analysis/proof-slice.mjs --slice S --out <dir> [--suite-pass <station pass file>]
// One table of compliance rows for a slice, from scripts/analysis/proof-slices.json. It CALLS the existing checks (argv rows, spawnSync, no shell),
// READS the push station pass file (suite row; never runs the suite), and prints NOT BUILT rows with the tasks that unblock them.
// Each command row's full output is written to <out>/<row-id>.txt. Commits nothing; reads and writes no database.
//   exit 0 every row PASS · 1 any FAIL · 2 usage, bad data file or an --out that cannot be created · 3 no FAIL but a row is NOT BUILT or GAP.
// Caller: the PROOF.S lane (task-268) runs it as its acceptance command; no hook, station step or CI job calls it.
// The tree it reads is the one the script sits in, never the cwd.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateVariable } from './gates/variables.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(REPO, 'scripts/analysis/proof-slices.json');
const DEFAULT_TIMEOUT_MS = 120000; // task-375 D10b OPEN: replaced by the registered variable below once the operator's DB GO registers it (seed + migration); until then this typed value stays
/**
 * task-375 D10b: the registered tooling variable the row timeout is read from (R-EB (b); NOT yet registered: the seed entry and migration need the operator's typed DB GO after the MCINC-7 rehearsal).
 * The name is the builder's choice, to be confirmed at registration.
 */
export const TIMEOUT_VARIABLE = 'tooling_proof_slice_timeout_ms';
/** The timeout (ms) from the variable's stored value (a number or the text of one): a positive integer, else a refusal naming the variable (no default, no unbounded run). */
export function timeoutMsFromVariable(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${TIMEOUT_VARIABLE} must be a positive integer number of milliseconds (got ${JSON.stringify(value)}): set it in logic_variables; there is no default and no unbounded run`);
  return n;
}
const ID_RE = /^[a-z0-9-]{1,40}$/;
const TASK_RE = /^task-\d+$/;
const KEYS = ['id', 'proof', 'argv', 'waits', 'expect', 'timeoutMs', 'suite', 'notbuilt'];
const STATUSES = ['PASS', 'FAIL', 'NOT BUILT', 'GAP'];

// Shape problems of one slice (fail closed: any problem is exit 2).
export function checkSpec(spec, slice) {
  const rows = spec?.[slice]?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return [`slice ${slice}: no rows`];
  const problems = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = `row ${i} (${r?.id ?? '?'})`;
    if (typeof r?.id !== 'string' || !ID_RE.test(r.id)) problems.push(`${at}: id must match ${ID_RE}`);
    else if (seen.has(r.id)) problems.push(`${at}: duplicate id`);
    else seen.add(r.id);
    if (typeof r?.proof !== 'string' || r.proof === '') problems.push(`${at}: proof text missing`);
    const kinds = ['argv', 'suite', 'notbuilt'].filter((k) => r?.[k] !== undefined);
    if (kinds.length !== 1) problems.push(`${at}: needs exactly one of argv, suite, notbuilt`);
    if (r?.argv !== undefined && !(Array.isArray(r.argv) && r.argv.length > 0 && r.argv.every((a) => typeof a === 'string'))) problems.push(`${at}: argv must be an array of strings`);
    for (const k of Object.keys(r ?? {})) if (!KEYS.includes(k)) problems.push(`${at}: unknown key ${k}`);
    for (const k of ['waits', 'expect']) {
      if (r?.[k] !== undefined && (typeof r[k] !== 'string' || r[k] === '')) problems.push(`${at}: ${k} must be a non-empty string`);
      if (r?.[k] !== undefined && r.argv === undefined) problems.push(`${at}: ${k} is only read on an argv row`);
    }
    if (r?.suite !== undefined && (typeof r.suite !== 'object' || r.suite === null || Array.isArray(r.suite))) problems.push(`${at}: suite must be an object`);
    else if (r?.suite !== undefined && !(Array.isArray(r.suite.suite_files) && r.suite.suite_files.length > 0)) problems.push(`${at}: suite.suite_files missing`);
    if (r?.timeoutMs !== undefined && !(Number.isInteger(r.timeoutMs) && r.timeoutMs > 0)) problems.push(`${at}: timeoutMs must be a positive integer`);
    if (r?.notbuilt !== undefined && (typeof r.notbuilt !== 'object' || r.notbuilt === null)) problems.push(`${at}: notbuilt must be an object`);
    else if (r?.notbuilt !== undefined) {
      const b = r.notbuilt.blockedBy;
      if (!Array.isArray(b) || !b.every((t) => TASK_RE.test(t))) problems.push(`${at}: notbuilt.blockedBy must be an array of task ids`);
      else if (b.length === 0 && !(typeof r.notbuilt.reason === 'string' && r.notbuilt.reason !== '')) problems.push(`${at}: notbuilt needs a blocker or a reason`);
    }
  });
  return problems;
}

const text = (r) => `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`;

function commandRow(row, { run, outDir, writeFile }) {
  const res = run(row.argv, { timeoutMs: row.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  const evidence = path.join(outDir, `${row.id}.txt`);
  const out = text(res);
  const why = res.error ? `\nerror: ${res.error.code ?? ''} ${res.error.message ?? ''}`.trimEnd() : '';
  writeFile(evidence, `$ ${row.argv.join(' ')}\nexit: ${res.status ?? `none (${res.signal ?? res.error?.code ?? 'unknown'})`}${why}\n\n${out}`);
  const base = { id: row.id, proof: row.proof, evidence, blockedBy: [] };
  if (res.status === null || res.status === undefined) {
    const code = res.error?.code;
    if (code === 'ETIMEDOUT') return { ...base, status: 'FAIL', cause: `timeout after ${row.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms` };
    if (res.signal) return { ...base, status: 'FAIL', cause: `killed by ${res.signal}` };
    return { ...base, status: 'GAP', cause: `could not start (${code ?? 'unknown'})` };
  }
  if (res.status !== 0) return { ...base, status: 'FAIL', cause: `exit ${res.status}` };
  if (row.waits && out.split('\n').some((l) => l.startsWith(row.waits))) return { ...base, status: 'NOT BUILT', cause: `${row.waits} in the check's own output` };
  // Positive proof of a run: when the row names the line its check prints, a clean exit without that line is GAP, never PASS.
  if (row.expect && !out.split('\n').some((l) => l.includes(row.expect))) return { ...base, status: 'GAP', cause: `exit 0 but the expected output line was not found: ${row.expect}` };
  return { ...base, status: 'PASS' };
}

function suiteRow(row, { readFile, head, suitePass }) {
  const base = { id: row.id, proof: `${row.proof} (covers: ${row.suite.suite_files.join(', ')})`, evidence: suitePass ?? '-', blockedBy: [] };
  if (!suitePass) return { ...base, status: 'GAP', cause: 'no pass file given' };
  let body;
  try { body = readFile(suitePass); } catch (e) { return { ...base, status: 'GAP', cause: `pass file unreadable (${e?.code ?? e?.message ?? 'error'})` }; }
  const field = (k) => new RegExp(`^${k}:\\s*(\\S+)`, 'm').exec(body)?.[1];
  if (field('sha') !== head) return { ...base, status: 'GAP', cause: `pass file is for ${String(field('sha')).slice(0, 9)}, HEAD is ${String(head).slice(0, 9)}` };
  if (field('RESULT') === 'PASS') return { ...base, status: 'PASS' };
  return { ...base, status: 'FAIL', cause: `station RESULT ${field('RESULT') ?? 'missing'} at HEAD` };
}

/** @param {{spec:any, slice:string, run:any, readFile:any, head:string, suitePass?:string, outDir:string, writeFile:any}} a */
export function runSlice({ spec, slice, run, readFile, head, suitePass, outDir, writeFile }) {
  const problems = checkSpec(spec, slice);
  if (problems.length) return { rows: [], counts: {}, exit: 2, problems };
  const rows = spec[slice].rows.map((row) => {
    if (row.argv) return commandRow(row, { run, outDir, writeFile });
    if (row.suite) return suiteRow(row, { readFile, head, suitePass });
    return { id: row.id, proof: row.proof, status: 'NOT BUILT', evidence: '-', blockedBy: row.notbuilt.blockedBy, cause: row.notbuilt.reason };
  });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const exit = counts.FAIL > 0 ? 1 : counts.PASS === rows.length ? 0 : 3;
  return { rows, counts, exit, problems: [] };
}

export function renderTable({ rows, counts, exit }) {
  const lines = ['| row | proof | result | evidence | unblocked by |', '| --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    const why = r.cause ? ` [${r.cause}]` : '';
    lines.push(`| ${r.id} | ${r.proof} | ${r.status}${why} | ${r.evidence} | ${r.blockedBy.length ? r.blockedBy.join(', ') : '-'} |`);
  }
  lines.push('', `${STATUSES.map((s) => `${s} ${counts[s]}`).join(' · ')} · exit ${exit}`);
  return lines.join('\n');
}

const USAGE = 'usage: node scripts/analysis/proof-slice.mjs --slice <id> --out <dir> [--suite-pass <file>]';
const parseArgs = (argv) => {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = { '--slice': 'slice', '--out': 'out', '--suite-pass': 'suitePass' }[argv[i]];
    if (!k || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) return null;
    o[k] = argv[i + 1];
  }
  return o.slice && o.out ? o : null;
};

export const realIo = () => ({
  readFile: (f) => fs.readFileSync(f, 'utf8'),
  run: (argv, { timeoutMs }) => {
    const [cmd, ...rest] = argv;
    return spawnSync(cmd === 'node' ? process.execPath : cmd, rest, { cwd: REPO, encoding: 'utf8', timeout: timeoutMs, maxBuffer: gateVariable('tooling_spawn_max_buffer_mb') * 1024 * 1024 });
  },
  head: (spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout ?? '').trim(), // T4 (task-453): git that cannot start gives '' (main exits 2), not a TypeError
  writeFile: (f, t) => fs.writeFileSync(f, t),
  mkdir: (d) => fs.mkdirSync(d, { recursive: true }),
  print: (s) => console.log(s),
});

/** @param {string[]} argv @param {{readFile:(f:string)=>string, run:(argv:string[], o:{timeoutMs:number})=>any, head:string, writeFile:(f:string,t:string)=>void, mkdir:(d:string)=>void, print:(s:string)=>void}} [io] */
export function main(argv, io = realIo()) {
  const a = parseArgs(argv);
  if (!a) { console.error(USAGE); return 2; }
  if (!io.head) { console.error('proof-slice: cannot determine HEAD (git rev-parse failed)'); return 2; }
  let spec;
  try { spec = JSON.parse(io.readFile(DATA)); } catch (e) { console.error(`proof-slices.json unreadable or malformed: ${e.message}`); return 2; }
  const outDir = path.resolve(a.out);
  try { io.mkdir(outDir); } catch (e) { console.error(`proof-slice: cannot create --out ${outDir} (${e?.code ?? e?.message ?? 'error'})`); return 2; }
  const r = runSlice({ spec, slice: a.slice, run: io.run, readFile: io.readFile, head: io.head, suitePass: a.suitePass, outDir, writeFile: io.writeFile });
  if (r.problems.length) { for (const p of r.problems) console.error(`proof-slice: ${p}`); return 2; }
  io.print(renderTable(r));
  return r.exit;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
