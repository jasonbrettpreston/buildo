// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5; 132_step_standard_handbook.md §6 R-BA
//
// GATE A (COMPLY.3 stage 1, task-367) — "engine compute is reached only where the compute gates look". REPORT-ONLY.
//
// THE RULES IT LEANS ON (quoted from source; it applies them, it does not restate them):
//  - 122_pipeline_step_optimization.md:811-815 "the shape rule bans the commonest hiding places (console, bare fetch, wall clock, `process.env`,
//    forbidden `require`s) but says nothing about a bare numeric or SQL literal deciding a check's outcome". Its scope, 122:804-806: "Enforced by
//    `scripts/ast-grep-rules/compute-shape.yml` over `scripts/lib/compute/**` ... the directory IS the scope".
//  - 132_step_standard_handbook.md:154 core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero."
//  - 132_step_standard_handbook.md:158 core.9 "Compute is pure. ... The runner owns every read set-up, write, transaction, ... calendar date".
//  - 122a_step_optimization_appendix.md:753 §A26 "Compute purity: Rule 2 as closed-answer gate codes (R-BZ, R-CA)".
// WHAT IT BINDS (do not stretch): 122:806 binds the shape rules to scripts/lib/compute/** by directory. A file under src/ or mobile/ that IMPORTS
// the compute core is outside that directory, so no existing gate scans it (the gap). Gate A (1) LISTS every such file, and (2) runs the SAME
// rule data (compute-shape.yml, read through compute-literals.mjs RULE_FILE; not copied) on it as an ADVISORY: core.8 names "admin surface or tool"
// and core.9 says the runner owns I/O, so a route that drives the core is where those words bite. The scanner is ast-grep (compute-literals.mjs
// scanGateE's own binary); the rule files are JavaScript-only with a files: glob, so the rule objects are read from RULE_FILE at run time and
// re-pointed at TypeScript with the glob dropped: rule logic unchanged, nothing copied. The purity codes G1-G8 (compute-purity.mjs) are NOT applied:
// they read .js/.cjs compute entries against a step descriptor (declaredFor), which a route does not have (UNVERIFIED that they could run on a .ts file).
//
// Report-only: exit 0 with a findings list; --strict exits 1 on findings. Not wired into any hook, the push station or CI (stage 1).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { RULE_FILE, GATE_E_RULE_IDS } from './compute-literals.mjs';
import { gateVariable } from './variables.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Where a reacher may live (closed). */
export const SCAN_ROOTS = ['src', 'mobile'];
/** Never a reacher: tests (they import the core to assert it), dependencies, build output. */
export const SKIP_DIR = /(^|\/)(node_modules|\.next|dist|build|coverage|\.expo|tests|__tests__)(\/|$)/;
export const SKIP_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
export const SCAN_EXT = /\.(?:[cm]?[jt]sx?)$/;
/** The two compute homes a reach lands on (closed). */
export const REACH_TARGETS = ['scripts/lib/compute', 'scripts/lib/step'];
/** Static import / dynamic import() / require() of a target; one regex per form, closed. */
export const REACH_FORMS = {
  static: /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  sideEffect: /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  dynamic: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  require: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
};

/**
 * Rule ids of compute-shape.yml applied to a reacher (closed). The 5.5 hiding places, the forbidden require, the literal ids gate E owns.
 * EXCLUDED with reason: compute-forbidden-require-dynamic (a reacher's dynamic import is the reach itself, listed by REACH_FORMS: flagging it is
 * circular); compute-no-postgis-branch, compute-no-verdict-derivation, compute-no-literal-threshold, compute-no-literal-byte-window,
 * compute-no-literal-url-tunable (bind a compute's own check/verdict code, not a route).
 */
export const GATE_A_RULE_IDS = [
  'compute-no-console', 'compute-no-bare-fetch', 'compute-no-wall-clock', 'compute-no-process-env', 'compute-forbidden-require',
  ...GATE_E_RULE_IDS.filter((id) => id !== 'compute-forbidden-require-dynamic' && id !== 'compute-no-literal-violation-compare'),
];

export function walk(root, dir = '') {
  const out = [];
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (SKIP_DIR.test(rel + '/')) continue;
    if (e.isDirectory()) out.push(...walk(root, rel));
    else if (SCAN_EXT.test(e.name) && !SKIP_FILE.test(e.name)) out.push(rel);
  }
  return out;
}

/** The targets reached by `text`, as `[{form, spec, line}]`. A spec reaches when its path contains `scripts/lib/compute` or `scripts/lib/step` as a whole segment run. */
export function reaches(text) {
  const out = [];
  for (const [form, re] of Object.entries(REACH_FORMS)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1];
      if (!REACH_TARGETS.some((t) => new RegExp(`(^|/)${t.replace(/\//g, '\\/')}(/|$)`).test(spec.replace(/^(\.\.\/)+/, '')))) continue;
      out.push({ form, spec, line: text.slice(0, m.index + m[0].indexOf(m[1])).split('\n').length });
    }
  }
  return out;
}

export function listReachers(root = REPO_ROOT, roots = SCAN_ROOTS) {
  const found = [];
  for (const r of roots) {
    for (const f of walk(root, r)) {
      const hits = reaches(fs.readFileSync(path.join(root, f), 'utf8'));
      if (hits.length) found.push({ file: f, hits });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** The reused rule objects, re-pointed at TypeScript with the compute-only glob dropped. Throws when an id the gate names is missing from RULE_FILE. */
export function reusedRules(root = REPO_ROOT, language = 'TypeScript') {
  const docs = fs.readFileSync(path.join(root, RULE_FILE), 'utf8').split(/^---\s*$/m).map((d) => yaml.load(d)).filter(Boolean);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const missing = GATE_A_RULE_IDS.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`compute-reach: rule id(s) not in ${RULE_FILE}: ${missing.join(', ')}`);
  return GATE_A_RULE_IDS.map((id) => {
    const { files, ...rest } = byId.get(id);
    return { ...rest, language };
  });
}

const LINE_RE = /^(.+?):(\d+):(\d+): (?:error|warning|info)\[([\w-]+)\]:/;

/** Run the reused rules on one file. Returns `[{file, line, ruleId, lineText}]`. */
export function scanFile(file, root = REPO_ROOT) {
  const lang = /\.tsx$/.test(file) ? 'Tsx' : /\.tsx?$/.test(file) ? 'TypeScript' : 'JavaScript';
  const rules = reusedRules(root, lang);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-reach-'));
  const ruleFile = path.join(tmp, 'rules.yml');
  fs.writeFileSync(ruleFile, rules.map((r) => yaml.dump(r, { lineWidth: -1 })).join('---\n'));
  try {
    const bin = path.join(root, 'node_modules', '.bin', 'ast-grep');
    const res = spawnSync(bin, ['scan', '--rule', ruleFile, '--report-style=short', '--color=never', file], { cwd: root, encoding: 'utf8', maxBuffer: gateVariable('tooling_spawn_max_buffer_mb') * 1024 * 1024 });
    if (res.error) throw res.error;
    if (res.status !== 0 && res.status !== 1) throw new Error(`ast-grep failed (exit ${res.status}): ${res.stderr}`);
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    const out = [];
    for (const l of (res.stdout || '').split(/\r?\n/)) {
      const m = LINE_RE.exec(l);
      if (m) out.push({ file, line: Number(m[2]), ruleId: m[4], lineText: (lines[Number(m[2]) - 1] || '').trim() });
    }
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * ONE HOP: files under the scan roots that import a reacher (the route that calls the compute entry). The rule 122:806 does not scan them either, and
 * core.9 puts the I/O of a compute run (clock, reads) on the caller, so the same advisory rules run on them. One hop only (closed, no graph walk).
 * A spec resolves to a reacher when it ends in the reacher's path without extension, with '@/' read as 'src/' (or 'mobile/src/' for a mobile file); UNVERIFIED against each tsconfig paths map.
 */
export function listCallers(reachers, root = REPO_ROOT, roots = SCAN_ROOTS) {
  const stems = reachers.map((r) => ({ file: r.file, stem: r.file.replace(/\.[^.]+$/, '') }));
  const out = [];
  for (const r of roots) {
    for (const f of walk(root, r)) {
      if (reachers.some((x) => x.file === f)) continue;
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      const via = new Set();
      for (const re of Object.values(REACH_FORMS)) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          const spec = m[1].replace(/^@\//, f.startsWith('mobile/') ? 'mobile/src/' : 'src/');
          for (const s of stems) {
            const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
            if (spec === s.stem || base === s.stem) via.add(s.file);
          }
        }
      }
      if (via.size) out.push({ file: f, via: [...via] });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function run(root = REPO_ROOT, roots = SCAN_ROOTS) {
  const reachers = listReachers(root, roots);
  const callers = listCallers(reachers, root, roots);
  const findings = [...reachers, ...callers].flatMap((r) => scanFile(r.file, root));
  return { reachers, callers, findings };
}

function main() {
  const t0 = Date.now();
  const { reachers, callers, findings } = run();
  console.log(`GATE A compute-reach (report-only): ${reachers.length} file(s) under ${SCAN_ROOTS.join(', ')} reach ${REACH_TARGETS.join(' / ')}; ${callers.length} one-hop caller(s); ${findings.length} finding(s)`);
  for (const r of reachers) for (const h of r.hits) console.log(`REACH ${r.file}:${h.line} ${h.form} ${h.spec}`);
  for (const c of callers) console.log(`CALLER ${c.file} -> ${c.via.join(', ')}`);
  for (const f of findings) console.log(`FINDING ${f.file}:${f.line} ${f.ruleId} | ${f.lineText}`);
  console.log(`run time ${Date.now() - t0} ms`);
  if (process.argv.includes('--strict') && findings.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
