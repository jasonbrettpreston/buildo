#!/usr/bin/env node
/**
 * capture-step-golden — golden-master capture harness for ONE pipeline step.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3 (Condition 3 — the
 *            golden-master differential, per conversion)
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §14.2 (the 4-tuple)
 *
 * Runs a step script as a child process EXACTLY the way `scripts/run-chain.js#spawnStepChild`
 * does (`runtime = node|python`, argv = `[scriptPath, ...args]`, env = `{...process.env,
 * PIPELINE_CHAIN: <chain>}`, stdin inherited) and captures the 4-tuple:
 *
 *   (a) exit code
 *   (b) stdout — raw, plus the LAST `PIPELINE_SUMMARY:` line and every `PIPELINE_META:` line
 *       parsed (markers are the literal prefixes `scripts/lib/pipeline.js#emitSummary/emitMeta`
 *       print; run-chain takes the LAST summary because multi-worker scripts emit several)
 *   (c) the `pipeline_runs` row(s) written during the run — `SELECT max(id)` before, rows with
 *       `id > that` after. NOTE: a step run under `PIPELINE_CHAIN` skips its OWN ledger row
 *       (run-chain owns it — `assert-schema.js:272`), so in-chain captures legitimately show
 *       zero rows; the standalone (`--chain=none`) capture is the one that exercises the
 *       step's own ledger path.
 *   (d) a normalised form + a non-determinism inventory: every key / pattern the normaliser
 *       stripped or masked is listed under `nondeterminism`, declared BEFORE the first diff
 *       (§5.3: "Non-determinism inventory declared *before* the first diff").
 *
 * USAGE
 *   node -r dotenv/config scripts/analysis/capture-step-golden.js \
 *     --step=scripts/quality/assert-schema.js --chain=permits --out=docs/reports/golden/x.json
 *   --chain=none        run standalone (PIPELINE_CHAIN unset — a DIFFERENT ledger path)
 *   --compare=<a>,<b>   diff two captures' normalised forms; exit code 1 on ANY difference
 *   --args=a,b,c        extra argv for the child (run-chain's `chain_args`), comma-separated
 *
 * DB target: `scripts/lib/resolve-db.js` — no silent default, host+database printed before the
 * child runs (tasks/lessons.md 2026-07-30: "print the host+database you connected to").
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const { StringDecoder } = require('string_decoder');
const fs = require('fs');
const path = require('path');
const { createResolvedPool } = require('../lib/resolve-db');

const SUMMARY_MARKER = 'PIPELINE_SUMMARY:';
const META_MARKER = 'PIPELINE_META:';

// ── Non-determinism inventory ─────────────────────────────────────────────────
// Keys deleted wherever they appear (recursively) in summary / meta / ledger rows.
// Every entry here is something that varies run-to-run on IDENTICAL code + data.
const VOLATILE_KEYS = [
  'id', // pipeline_runs.id — serial
  'started_at',
  'completed_at',
  'duration_ms',
  'run_id',
  'timestamp',
  'elapsed_ms',
  'elapsed_s',
  'generated_at',
  'checked_at',
  'captured_at',
];
// audit_table rows whose `metric` is auto-injected timing by emitSummary (pipeline.js:346-352)
const VOLATILE_METRIC_PREFIXES = ['sys_'];
// String patterns masked inside stdout log lines (and inside string leaf values).
const VOLATILE_PATTERNS = [
  { name: 'iso_timestamp', re: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, mask: '<TS>' },
  { name: 'pg_timestamp', re: /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?/g, mask: '<TS>' },
  { name: 'duration_literal', re: /\b\d+(?:\.\d+)?\s?(?:ms|s|sec|seconds|min|minutes)\b/g, mask: '<DUR>' },
  { name: 'rows_per_sec', re: /\b\d[\d,]*(?:\.\d+)?\s?rows\/s/g, mask: '<RATE>' },
  { name: 'run_id_literal', re: /\b(run[ _#-]?id|runId|run)\s*[=#:]\s*\d+/gi, mask: '$1=<RUN_ID>' },
  { name: 'pipeline_runs_id_literal', re: /\bpipeline_runs(?:\s+row)?\s*#?\s*\d+/g, mask: 'pipeline_runs <ID>' },
  { name: 'pid_literal', re: /\bpid[=: ]\s*\d+/gi, mask: 'pid=<PID>' },
];

// ── CLI parsing (no parseInt: nothing numeric is parsed from argv) ────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

// ── Parsing of the child's stdout ─────────────────────────────────────────────
/**
 * Extract the parsed LAST PIPELINE_SUMMARY and ALL PIPELINE_META payloads from raw stdout.
 * Mirrors run-chain.js: `matchAll(/PIPELINE_SUMMARY:(.+)/g)` → last element.
 * @param {string} stdout
 * @returns {{summary: object|null, summary_count: number, meta: object[], parse_errors: string[]}}
 */
function parseMarkers(stdout) {
  const parse_errors = [];
  const summaries = [];
  const meta = [];
  for (const line of stdout.split('\n')) {
    const si = line.indexOf(SUMMARY_MARKER);
    const mi = line.indexOf(META_MARKER);
    try {
      if (si >= 0) summaries.push(JSON.parse(line.slice(si + SUMMARY_MARKER.length)));
      else if (mi >= 0) meta.push(JSON.parse(line.slice(mi + META_MARKER.length)));
    } catch (err) {
      parse_errors.push(`${line.slice(0, 80)}… — ${err.message}`);
    }
  }
  return {
    summary: summaries.length > 0 ? summaries[summaries.length - 1] : null,
    summary_count: summaries.length,
    meta,
    parse_errors,
  };
}

// ── Normaliser ────────────────────────────────────────────────────────────────
function maskString(s, hits) {
  let out = s;
  for (const p of VOLATILE_PATTERNS) {
    const before = out;
    out = out.replace(p.re, p.mask);
    if (out !== before) hits.add(`pattern:${p.name}`);
  }
  return out;
}

/**
 * Recursively drop VOLATILE_KEYS, drop `sys_*` audit rows, and mask volatile string patterns.
 * Records what it stripped into `hits`. Pure; never mutates its input.
 */
function scrub(value, hits, keyPath) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        const isVolatileRow =
          item && typeof item === 'object' && typeof item.metric === 'string' &&
          VOLATILE_METRIC_PREFIXES.some((p) => item.metric.startsWith(p));
        if (isVolatileRow) hits.add(`row:${item.metric}`);
        return !isVolatileRow;
      })
      .map((item, i) => scrub(item, hits, `${keyPath}[${i}]`));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.includes(k)) {
        hits.add(`key:${keyPath ? keyPath + '.' : ''}${k}`);
        continue;
      }
      out[k] = scrub(value[k], hits, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  if (typeof value === 'string') return maskString(value, hits);
  return value;
}

/**
 * Normalise a raw capture into its deterministic form + a non-determinism inventory.
 * @param {object} capture - a raw capture object (see buildCapture)
 * @returns {{normalised: object, nondeterminism: string[]}}
 */
function normalise(capture) {
  const hits = new Set();
  const stdoutLines = capture.stdout
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')
    // structured markers are represented by the parsed forms below, not as text
    .filter((l) => !l.includes(SUMMARY_MARKER) && !l.includes(META_MARKER))
    // JSON log entries from pipeline.log carry no timestamp but may carry volatile context
    .map((l) => {
      if (l.startsWith('{') && l.endsWith('}')) {
        try { return JSON.stringify(scrub(JSON.parse(l), hits, 'log')); } catch (err) {
          hits.add(`unparsed_json_log_line:${err.message.slice(0, 40)}`);
          return maskString(l, hits);
        }
      }
      return maskString(l, hits);
    });
  const normalised = {
    step: capture.step,
    chain: capture.chain,
    exit_code: capture.exit_code,
    summary: scrub(capture.summary, hits, 'summary'),
    summary_count: capture.summary_count,
    meta: scrub(capture.meta, hits, 'meta'),
    parse_errors: capture.parse_errors,
    pipeline_runs: scrub(capture.pipeline_runs, hits, 'pipeline_runs'),
    stdout_lines: stdoutLines,
  };
  return { normalised, nondeterminism: [...hits].sort() };
}

// ── Compare ───────────────────────────────────────────────────────────────────
/**
 * Deep-diff two normalised captures. Returns a list of `{path, a, b}` records; empty = identical.
 */
function diffNormalised(a, b, basePath = '') {
  const diffs = [];
  const isObj = (v) => v && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length || i >= b.length) diffs.push({ path: `${basePath}[${i}]`, a: a[i], b: b[i] });
      else diffs.push(...diffNormalised(a[i], b[i], `${basePath}[${i}]`));
    }
    return diffs;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const p = basePath ? `${basePath}.${k}` : k;
      if (!(k in a) || !(k in b)) diffs.push({ path: p, a: a[k], b: b[k] });
      else diffs.push(...diffNormalised(a[k], b[k], p));
    }
    return diffs;
  }
  if (a !== b) diffs.push({ path: basePath || '(root)', a, b });
  return diffs;
}

function formatDiff(diffs) {
  return diffs
    .map((d) => `  ${d.path}\n    - ${JSON.stringify(d.a)}\n    + ${JSON.stringify(d.b)}`)
    .join('\n');
}

// ── Child spawn (mirrors run-chain.js#spawnStepChild) ─────────────────────────
function runtimeFor(scriptPath) {
  return scriptPath.endsWith('.py')
    ? (process.platform === 'win32' ? 'python' : 'python3')
    : 'node';
}

/**
 * Spawn the step as run-chain does; buffer stdout FULLY (not just marker lines — the golden
 * master wants the whole surface) while teeing it to the console. stderr is captured too so a
 * network failure is recorded in the capture rather than lost.
 */
function spawnStep({ scriptPath, args, env }) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    const runtime = runtimeFor(scriptPath);
    const child = spawn(runtime, [scriptPath, ...args], { env, stdio: ['inherit', 'pipe', 'pipe'] });
    const outDec = new StringDecoder('utf8');
    const errDec = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { const c = outDec.write(d); process.stdout.write(c); stdout += c; });
    child.stderr.on('data', (d) => { const c = errDec.write(d); process.stderr.write(c); stderr += c; });
    child.on('close', (code, signal) => {
      stdout += outDec.end();
      stderr += errDec.end();
      resolveSpawn({ runtime, exit_code: code, signal, stdout, stderr });
    });
    child.on('error', rejectSpawn);
  });
}

// ── Capture ───────────────────────────────────────────────────────────────────
async function capture({ step, chain, args }) {
  const pool = createResolvedPool({ label: 'capture-step-golden' });
  // Print the target BEFORE running (lessons.md) — assertDbTarget logs database + migrations on
  // the first checkout below; this line names the host even if that first checkout fails.
  console.log(`[capture-step-golden] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    const beforeRes = await pool.query('SELECT COALESCE(max(id), 0)::int AS max_id FROM pipeline_runs');
    const maxIdBefore = beforeRes.rows[0].max_id;

    const env = { ...process.env };
    if (chain === 'none') delete env.PIPELINE_CHAIN; else env.PIPELINE_CHAIN = chain;
    console.log(`[capture-step-golden] spawning: ${runtimeFor(step)} ${step} ${args.join(' ')} ` +
      `(PIPELINE_CHAIN=${chain === 'none' ? '<unset>' : chain}; pipeline_runs max(id) before = ${maxIdBefore})`);

    const child = await spawnStep({ scriptPath: step, args, env });

    const rowsRes = await pool.query(
      `SELECT id, pipeline, status, started_at, completed_at, duration_ms,
              records_total, records_new, records_updated, records_meta, error_message
         FROM pipeline_runs WHERE id > $1 ORDER BY id`,
      [maxIdBefore],
    );
    const markers = parseMarkers(child.stdout);
    const raw = {
      step,
      chain,
      args,
      runtime: child.runtime,
      db_target: pool.buildoTarget.description,
      pipeline_runs_max_id_before: maxIdBefore,
      exit_code: child.exit_code,
      signal: child.signal,
      stdout: child.stdout,
      stderr: child.stderr,
      ...markers,
      pipeline_runs: rowsRes.rows,
    };
    return raw;
  } finally {
    await pool.end();
  }
}

function buildCapture(raw) {
  const { normalised, nondeterminism } = normalise(raw);
  const verdict = raw.summary?.records_meta?.audit_table?.verdict ?? null;
  return {
    harness: 'scripts/analysis/capture-step-golden.js',
    spec: 'docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3',
    step: raw.step,
    chain: raw.chain,
    git_head: gitHead(),
    // (a) exit code
    exit_code: raw.exit_code,
    signal: raw.signal,
    // (b) stdout + parsed markers
    summary: raw.summary,
    summary_count: raw.summary_count,
    meta: raw.meta,
    parse_errors: raw.parse_errors,
    verdict,
    ledger_status: raw.pipeline_runs.map((r) => r.status),
    stdout: raw.stdout,
    stderr: raw.stderr,
    // (c) ledger rows
    pipeline_runs: raw.pipeline_runs,
    pipeline_runs_max_id_before: raw.pipeline_runs_max_id_before,
    db_target: raw.db_target,
    runtime: raw.runtime,
    args: raw.args,
    // (d) normalised form + inventory
    nondeterminism,
    normalised,
  };
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (err) {
    return `unknown (${err.message.split('\n')[0]})`;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.compare) {
    const [fa, fb] = String(opts.compare).split(',');
    if (!fa || !fb) throw new Error('--compare needs two comma-separated capture paths');
    const load = (f) => {
      const doc = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
      // accept either a full capture (has .normalised) or a bare normalised object
      return doc.normalised ?? doc;
    };
    const diffs = diffNormalised(load(fa), load(fb));
    if (diffs.length === 0) {
      console.log(`[capture-step-golden] IDENTICAL (normalised): ${fa} == ${fb}`);
      return;
    }
    console.log(`[capture-step-golden] ${diffs.length} difference(s): ${fa} vs ${fb}\n${formatDiff(diffs)}`);
    process.exitCode = 1;
    return;
  }

  if (!opts.step || !opts.chain) {
    throw new Error('usage: --step=<script> --chain=<chainId|none> [--out=<file>] [--args=a,b]  |  --compare=<a>,<b>');
  }
  const step = String(opts.step);
  if (!fs.existsSync(step)) throw new Error(`step script not found: ${step}`);
  const args = opts.args ? String(opts.args).split(',').filter(Boolean) : [];

  const raw = await capture({ step, chain: String(opts.chain), args });
  const doc = buildCapture(raw);

  const line = `[capture-step-golden] ${step} chain=${doc.chain} exit=${doc.exit_code} ` +
    `verdict=${doc.verdict} ledger=[${doc.ledger_status.join(',')}] ` +
    `summaries=${doc.summary_count} meta=${doc.meta.length} nondeterminism=${doc.nondeterminism.length}`;
  if (opts.out) {
    const outPath = path.resolve(String(opts.out));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
    console.log(`${line}\n[capture-step-golden] wrote ${outPath}`);
  } else {
    console.log(line);
    console.log(JSON.stringify(doc.normalised, null, 2));
  }
  console.log(`[capture-step-golden] nondeterminism: ${doc.nondeterminism.join(', ') || '(none)'}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[capture-step-golden] ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  VOLATILE_KEYS,
  VOLATILE_METRIC_PREFIXES,
  VOLATILE_PATTERNS,
  SUMMARY_MARKER,
  META_MARKER,
  parseArgs,
  parseMarkers,
  normalise,
  diffNormalised,
  formatDiff,
  buildCapture,
};
