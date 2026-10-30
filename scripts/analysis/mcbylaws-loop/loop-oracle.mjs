// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (oracle-first: a hand-authored expected answer may not move beside layer2/3 code in one range; G68-04)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 6 "Classes" (PROPOSED PR-68-3, V68-1: hand-authored oracle vs generated outputs vs code; every range that changes code binds a new loop record)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// The only disk access is loadLayer23, a read of <root>/mcbylaws/protected-paths.json.
import fs from 'node:fs';
import path from 'node:path';

// The prototype glob, ported verbatim: `**/` is zero-or-more directories, `**` is anything, `*` never crosses a slash.
export const globToRegExp = (g) =>
  new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '\u0001')
        .replace(/\*\*/g, '\u0002')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0001/g, '(?:.*/)?')
        .replace(/\u0002/g, '.*') +
      '$',
  );

// Layer 2/3 CODE: the bylaw evaluator and the bylaw-validation tooling.
export const DEFAULT_LAYER23 = [
  'scripts/analysis/bylaw/**',
  'scripts/analysis/bylaw-validation/**',
  'scripts/seeds/bylaw/**',
  'src/tests/**/bylaw*',
];

// V68-1: HAND-authored oracle (worked examples, expected answers, accepted findings, existing tests).
export const ORACLE_GLOBS = [
  'src/tests/fixtures/bylaw-golden-lots/**',
  'src/tests/fixtures/bylaw/**',
  'mcbylaws/oracle/**',
  'src/tests/mcbylaws/loop/**',
];

// The hand-authored halves that live among the layer23 code (tests and prereg expectations).
export const ORACLE_PATTERNS = [
  '^src/tests/(?:.*/)?bylaw[^/]*\\.test\\.ts$',
  '^src/tests/coa-[^/]*\\.test\\.ts$',
];

export const ORACLE_PREREG_GLOBS = ['scripts/analysis/bylaw-validation/coa-expected/prereg-*.json'];

// GENERATED outputs (pins, floors, id lists, regression set, records): must equal a regeneration.
export const GEN_GLOBS = [
  'scripts/analysis/bylaw-validation/coa-expected/expected-*.json',
  'scripts/analysis/bylaw-validation/coa-expected/floors-*.json',
  'mcbylaws/loop/floors-*.json',
  'mcbylaws/loop/regression-set.json',
  'mcbylaws/loop/data/ids-*.json',
  'docs/reports/loop-records/**',
];

const RECORD_ADDED = /^docs\/reports\/loop-records\/.+\/round-\d+\.json$/;

const toRegexes = (globs) => globs.map(globToRegExp);

const GEN_RE = toRegexes(GEN_GLOBS);
const ORACLE_GLOB_RE = [...toRegexes(ORACLE_GLOBS), ...toRegexes(ORACLE_PREREG_GLOBS)];
const ORACLE_PATTERN_RE = ORACLE_PATTERNS.map((p) => new RegExp(p));

const isGen = (p) => GEN_RE.some((r) => r.test(p));
const isOraclePath = (p) => ORACLE_GLOB_RE.some((r) => r.test(p)) || ORACLE_PATTERN_RE.some((r) => r.test(p));

// The layer23 list in effect: mcbylaws/protected-paths.json `layer23` when it is an array of strings, else the default.
export function loadLayer23(root) {
  const file = path.join(root, 'mcbylaws/protected-paths.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = parsed && parsed.layer23;
    if (Array.isArray(list) && list.every((g) => typeof g === 'string')) return list;
  } catch {
    // no protected-paths.json (or unreadable): fall through to the default
  }
  return DEFAULT_LAYER23;
}

// V68-1 classes: generated first, then hand-authored oracle, then layer23 code. Everything else is null.
export function makeClassifier(layer23 = DEFAULT_LAYER23) {
  const code = toRegexes(layer23);
  return (p) => {
    if (isGen(p)) return 'generated';
    if (isOraclePath(p)) return 'oracle';
    if (code.some((r) => r.test(p))) return 'code';
    return null;
  };
}

// G68-04: oracle-first over a whole range (the union of the range's name-status). A new (A) oracle file is allowed.
export function checkOracleFirst(commitsNameStatus, classify) {
  const all = commitsNameStatus.flat();
  const code = all.filter((x) => classify(x.p) === 'code');
  const orc = all.filter((x) => x.s !== 'A' && classify(x.p) === 'oracle');
  return code.length && orc.length
    ? [`oracle_moved_with_code:${orc.length} oracle beside ${code.length} code in range`]
    : [];
}

// G68-04: the commit stage fires on CODE, ORACLE or GENERATED.
export function commitStageFires(staged, classify) {
  return staged.some((x) => {
    const c = classify(x.p);
    return c === 'code' || c === 'oracle' || c === 'generated';
  });
}

// G68-01/G68-06: a range that touches any class must ADD a record for its round.
export function recordMissing(nameStatus, classify) {
  const touches = nameStatus.some((x) => {
    const c = classify(x.p);
    return c === 'code' || c === 'oracle' || c === 'generated';
  });
  const added = nameStatus.some((x) => x.s === 'A' && RECORD_ADDED.test(x.p));
  return touches && !added ? ['record_missing'] : [];
}

// G68-01: the bound set is derived from the tree; every classified changed file must appear in the record's inputs.
// O68-02: only CODE and ORACLE bind. A GENERATED output (the regression set, an ids list, a pin, a floor, a record) is checked by
// REGENERATION every round, so binding it would make every record stale the moment the round rewrites it.
export function boundPaths(paths, classify) {
  return paths.filter((p) => {
    const c = classify(p);
    return c === 'code' || c === 'oracle';
  });
}

// Generated outputs must equal a regeneration from the inputs (stringify equality, no normalisation).
export function genMatches(actual, regenerated) {
  return JSON.stringify(actual) === JSON.stringify(regenerated) ? [] : ['generated_not_regenerable'];
}

// Parse `git show --name-status --format=` output (tab separated). A rename yields BOTH paths with status `R`.
export function nameStatusOf(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const status = parts[0].trim();
    const s = status ? status[0] : '';
    if (s === 'R' || s === 'C') {
      for (const p of parts.slice(1)) if (p.trim()) out.push({ s, p: p.trim() });
    } else if (parts[1].trim()) {
      out.push({ s, p: parts[1].trim() });
    }
  }
  return out;
}
