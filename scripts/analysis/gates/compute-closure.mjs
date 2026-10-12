// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ, compute purity G0);
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
//
// GATE G0 — PURE. Rule 2's "compute is JUST compute" and §5.5's layer table
// ("Compute | scripts/lib/compute/<slug>.js | MEASURES ONLY … never compares,
// never decides, never writes a row") both rest on a claim about what compute
// is ALLOWED TO REACH: a compute module measures data and reports an
// observation; it must not pull in the runner, the ledger, or the pipeline SDK,
// because a reachable `require('../pipeline')` is exactly how a "just compute"
// file starts opening a run and deciding a verdict. That reachability is a
// property of the STATIC require graph, and this module computes it — the
// least-fixpoint closure of `require()` edges from a set of entry files,
// measured from the source text, never by executing anything.
//
// Two things make this the ANSWER SET rather than a word about a word:
//
//   · The graph is read through the TypeScript compiler API. Only call
//     expressions are visited, so a `// require('../pipeline')` in a comment (or
//     in a string) adds no edge — the shape of the AST is the evidence, not a
//     pattern match over bytes.
//   · A `require(...)` whose argument is NOT a plain string literal (a
//     variable, a template, a concatenation) is UNRESOLVABLE statically. Such a
//     site is recorded as `dynamic`, and rule G0 makes any dynamic site RED:
//     "compute reached nothing else" cannot be asserted about an edge this
//     gate cannot see. (`scripts/lib/step/validate.js`'s `require(SCHEMA_PATH)`
//     is the canonical example — a runner-closure dynamic site, which is why
//     the runner is expected RED here while compute is expected GREEN.)
//
// Bare specifiers (`pg`, `node:fs`, `pg-query-stream`) are neither followed nor
// recorded: a package is not a module of this repo and cannot smuggle in one of
// its files. `.json` targets ARE recorded (a descriptor is a real edge a
// reviewer wants to see) but never parsed — JSON has no require graph.
//
// G0's verdict is closed:
//   PASS               — ≥1 module in the closure, zero dynamic sites, zero parse errors.
//   FAIL:G0:empty      — nothing was reached (an entry that resolves to nothing,
//                        or a compute dir with no modules, would otherwise pass vacuously).
//   FAIL:G0:dynamic:<file>:<line> — an unresolvable require argument (first one, by BFS order).
//   FAIL:G0:parse:<file>          — a followed module did not parse (first one, by BFS order).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** Every `*.js` DIRECTLY in this dir (sorted) is a compute entry. */
export const COMPUTE_GLOB_DIR = 'scripts/lib/compute';

/** The runner entries a compute module must never reach (closure itself, entries included). */
export const RUNNER_ENTRY_FILES = ['scripts/lib/step/index.js', 'scripts/lib/pipeline.js'];

/** CJS resolution candidates, in Node's own order for a require() of a relative path. */
const RESOLVE_SUFFIXES = ['', '.js', '.cjs', '.mjs', '.json', '/index.js'];

/** A repo-relative path, POSIX slashes, for stable keys and output on every platform. */
function relOf(repoRoot, abs) {
  return path.relative(repoRoot, abs).split(path.sep).join('/');
}

function isInside(repoRoot, abs) {
  const rel = path.relative(repoRoot, abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolve a relative `require('<spec>)` specifier the way Node's CJS resolver
 * would, but only with the suffix set this gate declares. Returns the absolute
 * file path, or null when nothing exists there.
 */
function resolveRelative(fromAbs, spec) {
  const base = path.resolve(path.dirname(fromAbs), spec);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // A racing deletion (or a permission error) is "does not resolve", not a crash.
    }
  }
  return null;
}

/** Every `require(...)` call site in one parsed source file, in source order. */
function requireCalls(sf) {
  const sites = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isRequire = (ts.isIdentifier(callee) && callee.text === 'require')
        || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'require');
      if (isRequire && node.arguments.length > 0) {
        sites.push({ arg: node.arguments[0], call: node });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return sites;
}

/** `line` (1-based) + `text` (the trimmed source line) of a node — for a `dynamic` record. */
function siteOf(sf, lines, node) {
  const start = node.getStart(sf);
  const { line } = sf.getLineAndCharacterOfPosition(start);
  const lineText = (lines[line] || '').trim();
  return { line: line + 1, text: lineText };
}

/**
 * The require graph: BFS the `require()` edges of `entryFiles`.
 *
 * @param {string[]} entryFiles - repo-relative OR absolute entry paths.
 * @param {{repoRoot: string, includeEntries?: boolean}} opts
 * @returns {{modules: string[], dynamic: Array<{file,line,text}>, parseErrors: Array<{file,message}>}}
 *   `modules` — repo-relative, sorted, deduped; the entries themselves are
 *   EXCLUDED unless `includeEntries` is set (the runner closure includes them).
 */
export function requireClosure(entryFiles, { repoRoot, includeEntries = false } = {}) {
  const entriesAbs = entryFiles.map((f) => (path.isAbsolute(f) ? f : path.resolve(repoRoot, f)));
  const seen = new Set(entriesAbs); // RECORDED modules, by absolute path (a `.json` is recorded, never walked)
  const entrySet = new Set(entriesAbs);
  const queue = []; // only modules that still need parsing
  const dynamic = [];
  const parseErrors = [];

  const enqueue = (abs) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    // A `.json` target is a real edge and is RECORDED, but JSON has no require
    // graph — parsing it (as JS, `{"a":1}` reads as a labeled block) would be
    // nonsense, so it is never queued.
    if (abs.endsWith('.json')) return;
    queue.push(abs);
  };
  for (const abs of entriesAbs) {
    if (fs.existsSync(abs)) queue.push(abs);
  }

  let head = 0;
  while (head < queue.length) {
    const abs = queue[head++];
    const file = relOf(repoRoot, abs);
    let text = null;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      parseErrors.push({ file, message: `unreadable: ${err && err.message ? err.message : String(err)}` });
      continue;
    }
    const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, /* setParentNodes */ false, ts.ScriptKind.JS);
    const lines = text.split(/\r?\n/);
    for (const site of requireCalls(sf)) {
      const arg = site.arg;
      // A plain string literal ('x' or "x") — a template literal (even with no
      // substitutions), a concatenation, an identifier, etc. are all NOT
      // statically resolvable.
      if (!ts.isStringLiteral(arg)) {
        const { line, text: lineText } = siteOf(sf, lines, site.call);
        dynamic.push({ file, line, text: lineText });
        continue;
      }
      const spec = arg.text;
      // Only relative specifiers are edges into this repo; a bare specifier is a package.
      if (!spec.startsWith('.')) continue;
      const resolved = resolveRelative(abs, spec);
      if (resolved === null) continue; // does not exist → not a module of this repo
      if (!isInside(repoRoot, resolved)) continue; // outside the repo → not our graph
      enqueue(resolved);
    }
  }

  const modules = [...seen]
    .filter((abs) => includeEntries || !entrySet.has(abs))
    .map((abs) => relOf(repoRoot, abs))
    .sort();
  return { modules, dynamic, parseErrors };
}

/** Every `*.js` directly in `COMPUTE_GLOB_DIR`, sorted (repo-relative). */
export function computeEntries(repoRoot = REPO_ROOT) {
  const abs = path.join(repoRoot, COMPUTE_GLOB_DIR);
  let names;
  try {
    names = fs.readdirSync(abs);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.js'))
    .sort()
    .map((n) => `${COMPUTE_GLOB_DIR}/${n}`);
}

/** The compute closure: what `scripts/lib/compute/**` can reach. Entries are excluded. */
export function computeClosure({ repoRoot = REPO_ROOT } = {}) {
  return requireClosure(computeEntries(repoRoot), { repoRoot });
}

/** The runner closure: what the two runner entries can reach, ENTRIES INCLUDED. */
export function runnerClosure({ repoRoot = REPO_ROOT } = {}) {
  return requireClosure(RUNNER_ENTRY_FILES, { repoRoot, includeEntries: true });
}

/** Rule G0's closed verdict over one closure. */
export function verdict(c) {
  if (c.dynamic.length > 0) {
    const d = c.dynamic[0];
    return `FAIL:G0:dynamic:${d.file}:${d.line}`;
  }
  if (c.parseErrors.length > 0) return `FAIL:G0:parse:${c.parseErrors[0].file}`;
  if (c.modules.length === 0) return 'FAIL:G0:empty';
  return 'PASS';
}

/** CLI — `--list [--runner]` prints one module per line, then the verdict line. */
function main(argv) {
  const useRunner = argv.includes('--runner');
  const closure = useRunner ? runnerClosure({ repoRoot: REPO_ROOT }) : computeClosure({ repoRoot: REPO_ROOT });
  const v = verdict(closure);
  const label = useRunner ? 'G0(compute-closure runner)' : 'G0';
  const lines = [...closure.modules];
  for (const d of closure.dynamic) lines.push(`n/a dynamic ${d.file}:${d.line}: ${d.text}`);
  for (const p of closure.parseErrors) lines.push(`n/a parse-error ${p.file}: ${p.message}`);
  lines.push(`${label} ${v} modules=${closure.modules.length} dynamic=${closure.dynamic.length}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (v !== 'PASS') process.exitCode = 1;
}

// `process.argv[1]` is undefined when this module is imported by `node -e` or a worker;
// the guard is the brief's exact comparison, prefixed so a missing path does not throw.
if (!!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
