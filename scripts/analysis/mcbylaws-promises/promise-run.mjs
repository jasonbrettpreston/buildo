// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan section 4 "The run (K5)", "Test-body scan (K19)"); R-KQ, R-KU.
// A skipped or pending test is never green: it is `FAIL:R:empty-test:<id>`.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Returns a copy of `env` without any `GIT_*` or `VITEST*` key. */
export function cleanEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (k.startsWith('GIT_') || k.startsWith('VITEST')) continue;
    out[k] = v;
  }
  return out;
}

/** Runs the whole promise test set in one vitest call -> {ok:true,json} | {ok:false,reason}. */
export function runVitest({ cwd, files, bin, config, timeoutMs = 300000 }) {
  const exe = bin || path.join(cwd, 'node_modules', '.bin', 'vitest');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-promises-run-'));
  const outFile = path.join(dir, 'results.json');
  try {
    const args = ['run', ...(config ? ['--config', config] : []), '--reporter=json', `--outputFile=${outFile}`, ...files];
    const res = spawnSync(exe, args, {
      cwd, env: cleanEnv(process.env), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) return { ok: false, reason: `spawn:${res.error.code || res.error.message}` };
    if (res.signal) return { ok: false, reason: `signal:${res.signal}` };
    if (res.status !== 0 && res.status !== 1) return { ok: false, reason: `exit:${res.status}` };
    if (!fs.existsSync(outFile)) return { ok: false, reason: 'no-output' };
    let json;
    try { json = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { return { ok: false, reason: 'bad-json' }; }
    if (!json || !Array.isArray(json.testResults)) return { ok: false, reason: 'no-testResults' };
    return { ok: true, json };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs `fn(dir)` on a temp extraction of `rev` -> {ok:true,value} | {ok:false,reason}; never reads the tree. */
export function withCheckout(cwd, rev, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-promises-co-'));
  try {
    const env = cleanEnv(process.env);
    const archive = spawnSync('git', ['archive', '--format=tar', rev], {
      cwd, env, timeout: 300000, maxBuffer: 512 * 1024 * 1024,
    });
    if (archive.error || archive.signal || archive.status !== 0 || !Buffer.isBuffer(archive.stdout)) {
      return { ok: false, reason: 'archive' };
    }
    const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout, env, maxBuffer: 512 * 1024 * 1024 });
    if (untar.error || untar.signal || untar.status !== 0) return { ok: false, reason: 'archive' };
    const mods = path.join(cwd, 'node_modules');
    if (fs.existsSync(mods)) fs.symlinkSync(mods, path.join(dir, 'node_modules'), 'dir');
    try {
      return { ok: true, value: fn(dir) };
    } catch {
      return { ok: false, reason: 'checkout-fn' };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs the promise test set at `rev` (not the working tree) -> same shape as runVitest. */
export function runAtRef({ cwd, rev, files, bin, config, timeoutMs }) {
  const res = withCheckout(cwd, rev, (dir) => runVitest({
    cwd: dir, files, bin: bin ?? path.join(cwd, 'node_modules', '.bin', 'vitest'), config, timeoutMs,
  }));
  if (!res.ok) return { ok: false, reason: `checkout:${res.reason}` };
  return res.value;
}

/** Maps each entry to {state, fullName}: passed|failed|pending|skipped|todo, or missing|ambiguous. */
export function matchTests(json, entries) {
  const results = Array.isArray(json?.testResults) ? json.testResults : [];
  const out = {};
  for (const entry of entries || []) {
    const hits = [];
    for (const file of results) {
      const name = typeof file?.name === 'string' ? file.name : '';
      if (!(name.endsWith('/' + entry.artifact) || name === entry.artifact)) continue;
      for (const a of Array.isArray(file?.assertionResults) ? file.assertionResults : []) {
        if (a?.fullName === entry.test_name) hits.push(a);
      }
    }
    if (hits.length === 1) out[entry.id] = { state: hits[0].status, fullName: hits[0].fullName };
    else out[entry.id] = { state: hits.length === 0 ? 'missing' : 'ambiguous', fullName: entry.test_name };
  }
  return out;
}

/** Turns matches into R verdict lines: skipped/pending/todo/ambiguous is never green. */
export function runLines(matches) {
  const lines = [];
  for (const id of Object.keys(matches || {}).sort()) {
    const state = matches[id]?.state;
    if (state === 'passed') continue;
    if (state === 'failed' || state === 'missing') lines.push(`FAIL:R:not-green:${id}`);
    else lines.push(`FAIL:R:empty-test:${id}`);
  }
  return lines;
}

const SKIP_RE = /\b(?:it|test|describe)\s*\.\s*(?:skip|todo|only|fails)\b/;
const CALL_RE = /\b(?:it|test)\s*\(/g;
const NEXT_RE = /^\s*(?:it|test)\s*\(/m;
const LIT_RE = /^\s*(['"`])((?:(?!\1).)*)\1/;

/** K19: fails when the source has a skip/todo/only/fails form, or the named test body has no expect(. */
export function emptyTestLines(id, source, testName) {
  const line = [`FAIL:R:empty-test:${id}`];
  const src = typeof source === 'string' ? source : '';
  if (!src) return line;
  if (SKIP_RE.test(src)) return line;
  let body = null;
  for (const m of src.matchAll(CALL_RE)) {
    const rest = src.slice(m.index + m[0].length);
    const lit = LIT_RE.exec(rest);
    if (!lit) continue;
    const name = lit[2];
    if (testName === name || (typeof testName === 'string' && testName.endsWith(' ' + name))) {
      body = rest.slice(lit[0].length);
      break;
    }
  }
  if (body === null) return line;
  const next = NEXT_RE.exec(body);
  const text = next ? body.slice(0, next.index) : body;
  return text.includes('expect(') ? [] : line;
}
