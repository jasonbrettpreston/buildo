// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1, §5 R-X, §5 R-BA (gate C);
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2
//
// GATE C — a converted step's DECLARED `emits[]` (its `records_meta` contract,
// Spec 122 §6.2 / §4 table row 9) must EQUAL the keys its runs ACTUALLY emit,
// read from the step's own golden POST captures (`summary.records_meta`). Rule 1
// "nothing hidden" rung (b): a producer key the descriptor never declares is a
// contract nobody wrote down; a declared key no run ever emits is a dead fence.
//
// The closed answer set, per converted step, over the sets
//   G = union of top-level `summary.records_meta` keys across every golden POST
//       capture for the step's `identity.name`, MINUS RUNNER_META_KEYS
//   E = `emits[].key` (a literal `"none"` ⇒ ∅), MINUS RUNNER_META_KEYS — a runner
//       key may legitimately be re-declared by a descriptor (assert-schema et al.
//       re-list `checks_passed`/`errors`/`config` merely to carry `consumers`);
//       that re-declaration is not drift and is IGNORED here
//   T = every `staleness.trigger[].emit_key` present in the descriptor
// is:
//   (1) `E \ G` ⇒ RED `declared-not-emitted:<key>`  (item `emits.<key>`) — the
//       descriptor promises a key the compute never returns.
//   (2) `G \ E` ⇒ RED `emitted-not-declared:<key>`  (item `emits.<key>`) — a key
//       is emitted that the descriptor never declared.
//   (3) `T \ (G ∪ RUNNER_META_KEYS)` ⇒ RED `trigger-baseline-missing:<key>`
//       (item `staleness.trigger.<key>`) — THE B3 CLASS (Spec 122 §6.2 GET-row 10):
//       a self-consumed trigger whose baseline the compute never persists reads
//       "unchanged" forever (`selectMode` treats an absent baseline as
//       `changed:false` by design), so a real version bump can never force FULL.
//   (4) a RED is allowed ONLY by a ledger row
//       `{gate:'C', step, item, disposition:'pending_remediation'}`; a ledger row
//       with no matching RED is an ORPHAN ⇒ RED (R-X closing-row posture).
// A converted step with NO golden POST dir at all is RED (`no-golden-dir`) —
// never a vacuous pass: an unmeasurable contract is not a verified one.
//
// `ledger.mjs` owns the row shape + the match; this file owns the answer set, the
// golden reader, and the fleet walk (DERIVED from converted.json, R-AN — never a
// retyped list). RUNNER_META_KEYS is required (not re-listed) from the library so
// the runner's own literal set and this gate can never drift apart (T4 locks it).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH } from './ledger.mjs';
import { loadConvertedDescriptors } from './closed-bounds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
/** The runner-owned `records_meta` keys, declared ONCE in the step library. */
export const RUNNER_META_KEYS = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')).RUNNER_META_KEYS;
const RUNNER = new Set(RUNNER_META_KEYS);
const GOLDEN_DIR_REL = 'docs/reports/golden';
const kebab = (slug) => String(slug).replace(/_/g, '-');

/**
 * The union of top-level `summary.records_meta` keys across every `*.json` in the
 * step's `post/` golden directory. Returns `null` when the directory does not
 * exist (an unmeasurable step — the caller REDs, never treats it as ∅, which
 * would vacuously pass an all-declared step).
 * @param {string} dir absolute or repo-relative post/ dir
 * @returns {Set<string>|null}
 */
export function goldenMetaKeys(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const keys = new Set();
  for (const name of entries.filter((f) => f.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    const meta = parsed && parsed.summary && parsed.summary.records_meta;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      for (const k of Object.keys(meta)) keys.add(k);
    }
  }
  return keys;
}

/** The declared step-produced `records_meta` keys: `emits[].key`, minus runner defaults. */
export function declaredEmitKeys(descriptor) {
  const emits = descriptor && descriptor.emits;
  if (!Array.isArray(emits)) return new Set();
  const keys = new Set();
  for (const e of emits) {
    if (e && typeof e.key === 'string' && e.key.length > 0 && !RUNNER.has(e.key)) keys.add(e.key);
  }
  return keys;
}

/** Every `staleness.trigger[].emit_key` declared by the descriptor. */
export function triggerEmitKeys(descriptor) {
  const triggers = descriptor && descriptor.staleness && descriptor.staleness.trigger;
  const keys = new Set();
  if (Array.isArray(triggers)) {
    for (const t of triggers) {
      if (t && typeof t.emit_key === 'string' && t.emit_key.length > 0) keys.add(t.emit_key);
    }
  }
  return keys;
}

/**
 * Every gate-C violation in ONE step. PURE — no disk, no ledger (answer 4 is a
 * ledger fact, applied by `checkEmitsEquiv`). `goldenKeys` is the set returned by
 * `goldenMetaKeys` (or `null` when the step has no golden dir).
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @param {Set<string>|null} goldenKeys
 * @param {Iterable<string>} [runnerKeys]
 * @returns {Array<{step:string, item:string, detail:string}>}
 */
export function emitsViolations(descriptor, goldenKeys, runnerKeys = RUNNER_META_KEYS) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  if (goldenKeys === null) {
    return [{ step, item: 'emits', detail: `no golden POST captures for "${step}" — the emits contract is unmeasurable, which is never a vacuous pass` }];
  }
  const runner = new Set(runnerKeys);
  const E = new Set([...declaredEmitKeys(descriptor)].filter((k) => !runner.has(k)));
  const G = new Set([...goldenKeys].filter((k) => !runner.has(k)));
  const T = triggerEmitKeys(descriptor);
  const violations = [];
  for (const key of E) {
    if (!G.has(key)) violations.push({ step, item: `emits.${key}`, detail: `emits[] declares "${key}" but no golden POST records_meta carries it (declared-not-emitted)` });
  }
  for (const key of G) {
    if (!E.has(key)) violations.push({ step, item: `emits.${key}`, detail: `golden POST records_meta carries "${key}" but emits[] never declares it (emitted-not-declared)` });
  }
  for (const key of T) {
    if (!G.has(key) && !runner.has(key)) violations.push({ step, item: `staleness.trigger.${key}`, detail: `staleness.trigger[].emit_key "${key}" is self-consumed but no golden POST records_meta persists it — the baseline reads "unchanged" forever (trigger-baseline-missing)` });
  }
  return violations;
}

/** Gate C over the whole converted fleet. An ORPHAN makes `pass` false (R-X). */
export function checkEmitsEquiv(entries, ledgerRows) {
  const violations = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    violations.push(...emitsViolations(entry.descriptor, entry.goldenKeys));
  }
  const { unallowed, orphans, allowed } = matchLedger('C', violations, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const where = (v) => `${v.step} ${v.item}`;
  const detail = (unallowed.length || orphans.length)
    ? `EMITS-EQUIV (gate C): ${unallowed.length} unallowed emits drift(s)`
      + (unallowed.length ? ` [${unallowed.map(where).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)` + (orphans.length ? ` [${orphans.map(where).join('; ')}]` : '')
    : `EMITS-EQUIV (gate C): ${violations.length} emits drift(s) checked, all closed `
      + `(${allowed.length} ledger-allowed, ${violations.length - allowed.length} from declared==emitted)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed, violations };
}

/**
 * Every converted step joined to its golden POST keys, in `converted.json` order
 * (R-AN). Reads the descriptor and the golden dir for the step's `identity.name`.
 * @param {string} [repoRoot]
 */
export function loadEmitsFleet(repoRoot = REPO_ROOT) {
  return loadConvertedDescriptors(repoRoot).map((descriptor) => {
    const slug = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
    const dir = path.join(repoRoot, GOLDEN_DIR_REL, slug, 'post');
    return { descriptor, slug, goldenKeys: goldenMetaKeys(dir) };
  });
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const d = (over = {}) => ({
    identity: { name: 'fixture_step' },
    emits: [{ key: 'x', type: 'int', consumers: [] }],
    ...over,
  });
  const v = (descriptor, goldenKeys) => emitsViolations(descriptor, new Set(goldenKeys));
  const items = (list) => list.map((x) => x.item).sort();
  const eq = (got, want, label) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`self-test FAILED (${label}): got ${JSON.stringify(got)}`);
  };
  // (1) declared `x` absent from goldens → RED declared-not-emitted.
  eq(items(v(d(), ['x'])), [], '1a declared==emitted GREEN');
  eq(items(v(d(), [])), ['emits.x'], '1b declared-not-emitted RED');
  // (2) golden `y` undeclared → RED emitted-not-declared.
  eq(items(v(d({ emits: 'none' }), ['y'])), ['emits.y'], '2a emitted-not-declared RED');
  eq(items(v(d(), ['x', 'y'])), ['emits.y'], '2b one emitted-not-declared');
  // (3) runner key `errors` declared but absent from goldens → GREEN (excluded).
  eq(items(emitsViolations(d({ emits: [{ key: 'errors', type: 'array', consumers: [] }] }), new Set())), [], '3 runner key excluded');
  // (4) a golden carrying ONLY runner keys → GREEN against emits:"none".
  eq(items(emitsViolations(d({ emits: 'none' }), new Set(['config', 'terminal', 'errors']))), [], '4 golden runner-only');
  // (5) trigger emit_key `code_version` absent from goldens → RED trigger-baseline-missing
  // (and, since the key is declared but not emitted, also declared-not-emitted — both fire).
  const trig = d({ emits: [{ key: 'code_version', type: 'string', consumers: [] }], staleness: { trigger: [{ signal: 'code_version', emit_key: 'code_version' }] } });
  const t5 = items(emitsViolations(trig, new Set()));
  if (!t5.includes('staleness.trigger.code_version')) throw new Error(`self-test FAILED (5): trigger-baseline-missing not RED (${JSON.stringify(t5)})`);
  // A trigger-only key declared and present is the GREEN direction (below, 6).
  // (6) trigger emit_key declared AND present in goldens → GREEN.
  eq(items(emitsViolations(trig, new Set(['code_version']))), [], '6 trigger present GREEN');
  // (7) everything equal → GREEN (declared==emitted, trigger persisted).
  eq(items(emitsViolations(d({ staleness: { trigger: [{ signal: 'code_version', emit_key: 'x' }] } }), new Set(['x']))), [], '7 all-equal GREEN');
  // (8) a pending_remediation ledger row allows its RED.
  const row = { gate: 'C', step: 'fixture_step', item: 'emits.x', disposition: 'pending_remediation', why: 'w', closing_brief: '.cursor/plan.md row C', filed: '2026-09-27', adjudicated_by: 'operator' };
  const ok = checkEmitsEquiv([{ descriptor: d(), goldenKeys: new Set() }], [row]);
  if (!ok.pass || ok.unallowed.length || ok.orphans.length || ok.allowed.length !== 1) throw new Error(`self-test FAILED (8): ledger-allowed drift not GREEN (${JSON.stringify(ok)})`);
  // (9) an orphan row (no live RED) → RED.
  const orph = checkEmitsEquiv([{ descriptor: d(), goldenKeys: new Set(['x']) }], [row]);
  if (orph.pass || orph.orphans.length !== 1 || !orph.detail.includes('orphan')) throw new Error(`self-test FAILED (9): orphan row not RED (${JSON.stringify(orph)})`);
  // (10) an empty/missing golden dir → RED no-golden-dir, never vacuous.
  const empty = emitsViolations(d({ emits: 'none' }), null);
  if (empty.length !== 1 || empty[0].item !== 'emits') throw new Error(`self-test FAILED (10): empty golden dir not RED (${JSON.stringify(empty)})`);
}

/** CLI — `--list` prints the orchestrator-pasteable row for every CURRENT unallowed violation. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('emits-equiv self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const fleet = loadEmitsFleet(REPO_ROOT);
    const violations = [];
    for (const { descriptor, goldenKeys } of fleet) violations.push(...emitsViolations(descriptor, goldenKeys));
    const { unallowed } = matchLedger('C', violations, loadLedger(REPO_ROOT).rows);
    const out = unallowed.map((u) => {
      const src = violations.find((x) => x.step === u.step && x.item === u.item) || {};
      return {
        gate: 'C', step: u.step, item: u.item, disposition: 'pending_remediation',
        why: src.detail || '', closing_brief: `wf2-remediate-${kebab(u.step)}`,
        filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator',
      };
    });
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: emits-equiv.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH, loadConvertedDescriptors };
