// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan Phase 3 → E row #75: terminals.records_meta vs golden — fold 11 item 6)
//
// WF2 GATE — ROW #75: `terminals[].records_meta` vs the golden POST captures.
//
// THE RULE (final):
//   A terminal's `records_meta` object is a claim about the keys that exit
//   path emits. For every golden POST capture of a converted step:
//
//   (a) its `records_meta.terminal` must be a string naming a declared
//       `terminals[].id` — a capture with no terminal string, or naming an
//       undeclared id, is RED (the terminals list is incomplete);
//
//   (b) when that terminal's `records_meta` is an object, EVERY declared key
//       must be present in the capture (absent = RED: the declared shape is
//       false) and its value must match the declared type by P2-C5's
//       `valueMatchesType` (null accepted for any type; RED otherwise).
//
//   `"runner_default"` declares no keys. Keys the capture carries but the
//   terminal does not declare are NOT checked here (gate C `emits-equiv.mjs`
//   owns emitted-vs-declared completeness, and the runner adds its own keys).
//   A declared terminal no capture exercises is UNWITNESSED: counted and
//   printed, never RED (not every exit path has a capture). A step with no
//   golden POST dir contributes nothing (gate C REDs `no-golden-dir`).
//
// Fix for a RED: reconcile the terminal's key list (or the runner) in the same
// commit (fold 11 item 6). No allowlist, no ledger (R-BC).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valueMatchesType, loadModeEmitsFleet } from './mode-emits-type.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/**
 * ROW #75 for ONE step: every (capture, declared key) pair is `checked`.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @param {Array<{file: string, meta: object}>|null} goldenMetas
 * @returns {{checked: number, violations: Array<{step: string, item: string, detail: string}>, unwitnessed: string[]}}
 */
export function terminalsResult(descriptor, goldenMetas) {
  if (!Array.isArray(goldenMetas) || !Array.isArray(descriptor?.terminals)) {
    return { checked: 0, violations: [], unwitnessed: [] };
  }
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const byId = new Map(
    descriptor.terminals
      .filter((t) => t && typeof t.id === 'string')
      .map((t) => [t.id, t]),
  );
  const seen = new Set();
  let checked = 0;
  const violations = [];
  for (const { file, meta } of goldenMetas) {
    if (!meta || typeof meta !== 'object') continue;
    const id = meta.terminal;
    if (typeof id !== 'string') {
      violations.push({
        step,
        item: 'terminals',
        detail: `${step}: golden ${file} carries no records_meta.terminal string — the capture cannot be attributed to a declared terminal`,
      });
      continue;
    }
    seen.add(id);
    const term = byId.get(id);
    if (!term) {
      violations.push({
        step,
        item: 'terminals',
        detail: `${step}: golden ${file} ends on terminal "${id}" which no terminals[] row declares (declared: ${[...byId.keys()].join(', ')})`,
      });
      continue;
    }
    const declared = term.records_meta;
    if (!declared || typeof declared !== 'object' || Array.isArray(declared)) continue;
    for (const [key, type] of Object.entries(declared)) {
      checked++;
      const item = `terminals.${id}.records_meta.${key}`;
      if (!Object.prototype.hasOwnProperty.call(meta, key)) {
        violations.push({
          step,
          item,
          detail: `${step}: terminal "${id}" declares records_meta.${key} (${type}) but golden ${file} does not carry it — the declared shape is false`,
        });
      } else if (!valueMatchesType(type, meta[key])) {
        violations.push({
          step,
          item,
          detail: `${step}: terminal "${id}" declares records_meta.${key} ${type} but golden ${file} carries ${JSON.stringify(meta[key]).slice(0, 80)}`,
        });
      }
    }
  }
  const unwitnessed = [...byId.keys()]
    .filter((id) => !seen.has(id))
    .map((id) => `${step}:${id}`);
  return { checked, violations, unwitnessed };
}

/**
 * Spec 124 R-DE (iii) (McDonald's Airtight V3): `terminals[].kind` is the cross-step grouping key, and ids
 * follow it — a `fail_*` kind's id is `failed_<cause>`, a `skip_gated` id is `skipped_<reason>`, lock
 * contention is `lock_held_elsewhere`, and a runner-owned exit uses the fleet id (`failed_missing_precondition`,
 * never `failed_precondition`). The generator-owned ASSERT ids below predate the rule (closed list).
 */
export const TERMINAL_ID_GRANDFATHER = Object.freeze([
  'coverage_gate_failed', 'data_bounds_check_error', 'data_bounds_check_failed', 'parcel_sanity_gate_failed', 'schema_drift_detected',
]);
const RUNNER_FLEET_IDS = Object.freeze({ failed_precondition: 'failed_missing_precondition' });

/** R-DE (iii) on ONE descriptor. PURE. */
export function terminalVocabularyViolations(descriptor) {
  const step = (descriptor && descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const out = [];
  for (const term of Array.isArray(descriptor && descriptor.terminals) ? descriptor.terminals : []) {
    if (!term || typeof term.id !== 'string' || typeof term.kind !== 'string') continue;
    const { id, kind } = term;
    if (TERMINAL_ID_GRANDFATHER.includes(id)) continue;
    let why = null;
    if (RUNNER_FLEET_IDS[id]) why = `a runner-owned exit uses the fleet id "${RUNNER_FLEET_IDS[id]}"`;
    else if (kind.startsWith('fail') && !id.startsWith('failed_')) why = `a "${kind}" terminal id is failed_<cause>`;
    else if (kind === 'skip_gated' && !id.startsWith('skipped_')) why = 'a "skip_gated" terminal id is skipped_<reason>';
    else if (kind === 'skip_lock_contention' && id !== 'lock_held_elsewhere') why = 'lock contention is "lock_held_elsewhere"';
    if (why) out.push({ step, item: `terminals.${id}.id`, detail: `${step}: terminal "${id}" (${kind}): ${why} (Spec 124 R-DE (iii))` });
  }
  return out;
}

/**
 * ROW #75 over the whole converted fleet.
 * @param {Array<{descriptor: object, goldenMetas: Array<{file: string, meta: object}>|null}>} entries
 * @returns {{pass: boolean, blockedSlugs: string[], detail: string, violations: Array<{step: string, item: string, detail: string}>, checked: number, unwitnessed: string[]}}
 */
export function checkTerminalsRecordsMeta(entries) {
  const violations = [];
  const unwitnessed = [];
  let checked = 0;
  for (const entry of entries || []) {
    const out = terminalsResult(entry?.descriptor, entry?.goldenMetas);
    checked += out.checked;
    violations.push(...out.violations);
    if (entry?.descriptor) violations.push(...terminalVocabularyViolations(entry.descriptor));
    unwitnessed.push(...out.unwitnessed);
  }
  const blockedSlugs = [...new Set(violations.map((v) => v.step))].sort();
  const pass = violations.length === 0;
  const detail = violations.length
    ? `TERMINALS-RECORDS-META (#75): ${violations.length} violation(s) [${violations.map((v) => `${v.step} ${v.item}`).join('; ')}]; ${checked} declared-key check(s); ${unwitnessed.length} terminal(s) unwitnessed`
    : `TERMINALS-RECORDS-META (#75): ${(entries || []).length} step(s); ${checked} declared-key check(s), 0 violations; ${unwitnessed.length} terminal(s) unwitnessed (no capture)`;
  return { pass, blockedSlugs, detail, violations, checked, unwitnessed };
}

/**
 * Every converted step joined to its golden POST metas, in `converted.json`
 * order (R-AN). REAL already — the same fleet loader gate P2-C5 uses.
 * @param {string} [repoRoot]
 * @returns {Array<{descriptor: object, slug: string, goldenMetas: Array<{file: string, meta: object}>|null}>}
 */
export function loadTerminalsFleet(repoRoot = REPO_ROOT) {
  return loadModeEmitsFleet(repoRoot);
}

/**
 * In-memory fixtures + assertions. Throws on the first failure.
 */
export function selfTest() {
  const mkTerm = (id, records_meta) => ({ id, kind: 'success', status: 'completed', records_meta });
  const mkDesc = (terminals) => ({ identity: { name: 'fixture_step' }, terminals });
  const mkGold = (file, meta) => ({ file, meta });
  const fail = (label, extra) => {
    throw new Error(`self-test FAILED (${label}): ${extra}`);
  };
  const want = (label, got, expected) => {
    if (got !== expected) fail(label, `expected ${expected}, got ${got}`);
  };

  const ok = mkDesc([mkTerm('ok', { n: 'int', e: 'array' })]);

  const good = terminalsResult(ok, [mkGold('a.json', { terminal: 'ok', n: 1, e: [] })]);
  want('good violations', good.violations.length, 0);
  want('good checked', good.checked, 2);

  want(
    'absent key',
    terminalsResult(ok, [mkGold('a.json', { terminal: 'ok', n: 1 })]).violations.length,
    1,
  );

  const undeclared = terminalsResult(ok, [mkGold('a.json', { terminal: 'zzz' })]);
  want('undeclared violations', undeclared.violations.length, 1);
  if (undeclared.violations[0]?.item !== 'terminals') {
    fail('undeclared item', `expected terminals, got ${undeclared.violations[0]?.item}`);
  }

  want(
    'mistyped value',
    terminalsResult(ok, [mkGold('a.json', { terminal: 'ok', n: '1', e: [] })]).violations.length,
    1,
  );

  const both = mkDesc([mkTerm('ok', { n: 'int', e: 'array' }), mkTerm('skip', { reason: 'string' })]);
  const unwit = terminalsResult(both, [mkGold('a.json', { terminal: 'ok', n: 1, e: [] })]);
  want('unwitnessed length', unwit.unwitnessed.length, 1);

  // R-DE (iii): ids follow their kind; grandfathered generator ids pass.
  const vocab = (id, kind) => terminalVocabularyViolations({ identity: { name: 'fixture_step' }, terminals: [{ id, kind }] }).length;
  want('failed_ prefix', vocab('failed_rows_floor', 'fail_check'), 0);
  want('fail without failed_', vocab('rows_floor', 'fail_check'), 1);
  want('runner fleet id', vocab('failed_precondition', 'fail_error'), 1);
  want('skip_gated prefix', vocab('skip_gated_no_activity', 'skip_gated'), 1);
  want('lock id', vocab('lock_busy', 'skip_lock_contention'), 1);
  want('grandfathered ASSERT id', vocab('coverage_gate_failed', 'fail_check'), 0);
}
