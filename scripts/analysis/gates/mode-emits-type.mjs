// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan P2-C5: emits.type + mode_select — fold 8 item 8, fold 8c item 15, fold 11 item 5, fold 17 item 1)
//
// GATE P2-C5 — TWO closed rules over the CONVERTED fleet, one per half:
//
// (1) `staleness.mode_select` — THE RULE (final):
//     A LINK or MATCHER must select `tri_state`, OR `none` AND carry at least
//     one `outputs.invalidates[]` row with `by: "full_rescan"` — the `none`
//     arm is legitimate ONLY when the runner's own `resolveLinkGate` can still
//     force a full rescan through that declared row (fold 17 item 1). Fold 8
//     item 8's "LINK-keyed / CASCADE" are RUNNER VARIANTS of LINK/MATCHER, not
//     archetypes (the schema enum carries neither), so they fall under the same
//     LINK/MATCHER arm; MATCHER is link_wsib's archetype (the arm is the
//     same). An INGESTOR whose `staleness.trigger[]` carries an entry with
//     `signal: "source_validator"` must select `skip` (fold 8 item 8).
//     EVERY other archetype/case must select `none` — enrich runners never call
//     `selectMode` at all, so `tri_state` on an ENRICHER is RED.
//
// (2) `emits[].type` — ONE closed rule (fold 11 item 5):
//     every golden POST `summary.records_meta[key]` for a DECLARED `emits[]`
//     key is checked against the declared `type`. `null` = the key is present
//     with no measurement, accepted for ANY declared type. An integer is
//     accepted for `number` (3 and 1.5 are both numbers). A mistyped non-null
//     value is RED. A declared key ABSENT from a golden file is not checked
//     here — gate C (`emits-equiv.mjs`) owns presence. A step with no golden
//     POST dir contributes no emits.type rows (gate C already REDs it
//     `no-golden-dir`), and neither does a golden file that carries no
//     `summary.records_meta` object.
//
// No allowlist, no ledger (R-BC) — both halves are derived from converted.json
// (R-AN) and the captures on disk, never from a retyped list.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConvertedDescriptors } from './closed-bounds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const GOLDEN_DIR_REL = 'docs/reports/golden';

/** The archetypes whose mode_select is gated (LINK and its MATCHER twin). */
const MODE_SELECT_ARCHETYPES = Object.freeze(['LINK', 'MATCHER']);

/** The closed `emits[].type` enum (Spec 122 §6.2 / §4 table row 9). */
const EMITS_TYPES = Object.freeze(['string', 'int', 'number', 'bool', 'object', 'array', 'null']);

/** THE mode_select rule, one line — LINK/MATCHER ⇒ tri_state | none+full_rescan; INGESTOR+source_validator ⇒ skip; else none. */
export const MODE_SELECT_RULE = 'LINK/MATCHER ⇒ staleness.mode_select tri_state, OR none WITH an outputs.invalidates[] row `by: "full_rescan"`; INGESTOR with a staleness.trigger[] entry `signal: "source_validator"` ⇒ skip; every other archetype/case ⇒ none.';

/**
 * The mode_select values the descriptor is ALLOWED to declare.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @returns {string[]}
 */
export function allowedModeSelect(descriptor) {
  const archetype = descriptor?.identity?.archetype;
  if (MODE_SELECT_ARCHETYPES.includes(archetype)) {
    const rows = descriptor?.outputs?.invalidates;
    const hasFullRescan =
      Array.isArray(rows) && rows.some((row) => row && row.by === 'full_rescan');
    return hasFullRescan ? ['tri_state', 'none'] : ['tri_state'];
  }
  if (archetype === 'INGESTOR') {
    const triggers = descriptor?.staleness?.trigger;
    const hasSourceValidator =
      Array.isArray(triggers) && triggers.some((row) => row && row.signal === 'source_validator');
    if (hasSourceValidator) return ['skip'];
  }
  return ['none'];
}

/**
 * Every mode_select violation in ONE step. PURE — no disk. Item is always
 * `'staleness.mode_select'`.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @returns {Array<{step: string, item: string, detail: string}>}
 */
export function modeSelectViolations(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const value = descriptor?.staleness?.mode_select;
  const allowed = allowedModeSelect(descriptor);
  if (allowed.includes(value)) return [];
  const archetype = descriptor?.identity?.archetype;
  const detail = `${step}: ${archetype} declares mode_select ${JSON.stringify(value)}; allowed ${allowed.join(' | ')} — ${MODE_SELECT_RULE}`;
  return [{ step, item: 'staleness.mode_select', detail }];
}

/**
 * Does `value` match the declared `emits[].type`? The closed rule: `null`
 * (a present key with no measurement) matches EVERY type; otherwise the type
 * enum's own predicate — `int` exact, `number` also accepting an integer.
 * @param {string} type one of `EMITS_TYPES`
 * @param {unknown} value the value measured in a golden POST `records_meta`
 * @returns {boolean}
 */
export function valueMatchesType(type, value) {
  if (value === null) return true;
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'int':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'bool':
      return typeof value === 'boolean';
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return false;
    default:
      return false;
  }
}

/**
 * The emits.type half for ONE step: every (declared key, golden file carrying
 * that key) pair is `checked` against the declared type.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @param {Array<{file: string, meta: object}>|null} goldenMetas the step's
 *   golden POST metas (`null` when the step has no golden POST dir at all)
 * @returns {{checked: number, violations: Array<{step: string, item: string, detail: string}>}}
 */
export function emitsTypeResult(descriptor, goldenMetas) {
  if (!Array.isArray(goldenMetas) || !Array.isArray(descriptor?.emits)) {
    return { checked: 0, violations: [] };
  }
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  let checked = 0;
  const violations = [];
  for (const emit of descriptor.emits) {
    if (!emit || typeof emit.key !== 'string' || typeof emit.type !== 'string') continue;
    const { key, type } = emit;
    for (const { file, meta } of goldenMetas) {
      if (!meta || typeof meta !== 'object') continue;
      if (!Object.prototype.hasOwnProperty.call(meta, key)) continue;
      checked++;
      if (!valueMatchesType(type, meta[key])) {
        const shown = JSON.stringify(meta[key]).slice(0, 80);
        violations.push({
          step,
          item: `emits.${key}.type`,
          detail: `${step}: emits.${key} declared ${type} but golden ${file} carries ${shown} (mistyped non-null value)`,
        });
      }
    }
  }
  return { checked, violations };
}

/**
 * The step's golden POST captures as `{file, meta}` rows, in directory order.
 * REAL I/O (not a rule): `meta` is `summary.records_meta`, the only part of a
 * capture this gate measures. Returns `null` when the directory does not exist
 * (an unmeasurable step — gate C owns the RED); an unreadable or unparsable
 * file is SKIPPED, never a throw; a capture with no `summary.records_meta`
 * object is skipped too.
 * @param {string} dir absolute or repo-relative `<golden>/<identity.name>/post`
 * @returns {Array<{file: string, meta: object}>|null}
 */
export function readGoldenMetas(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const rows = [];
  for (const name of entries.filter((f) => f.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    const meta = parsed && parsed.summary && parsed.summary.records_meta;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) rows.push({ file: name, meta });
  }
  return rows;
}

/**
 * Gate P2-C5 over the whole converted fleet.
 * @param {Array<{descriptor: object, goldenMetas: Array<{file: string, meta: object}>|null}>} entries
 * @returns {{pass: boolean, blockedSlugs: string[], detail: string, violations: Array<object>, checked: number}}
 */
export function checkModeEmitsType(entries) {
  const violations = [];
  let checked = 0;
  for (const entry of entries || []) {
    violations.push(...modeSelectViolations(entry?.descriptor));
    const out = emitsTypeResult(entry?.descriptor, entry?.goldenMetas);
    checked += out.checked;
    violations.push(...out.violations);
  }
  const blockedSlugs = [...new Set(violations.map((v) => v.step))].sort();
  const pass = violations.length === 0;
  const detail = violations.length
    ? `MODE-EMITS-TYPE (P2-C5): ${violations.length} violation(s) [${violations.map((v) => `${v.step} ${v.item}`).join('; ')}]; ${checked} emits.type check(s)`
    : `MODE-EMITS-TYPE (P2-C5): ${(entries || []).length} step(s) mode_select per archetype; ${checked} emits.type check(s), 0 mismatches`;
  return { pass, blockedSlugs, detail, violations, checked };
}

/**
 * Every converted step joined to its golden POST metas, in `converted.json`
 * order (R-AN). REAL I/O: reads each descriptor's `identity.name` golden dir.
 * @param {string} [repoRoot]
 * @returns {Array<{descriptor: object, slug: string, goldenMetas: Array<{file: string, meta: object}>|null}>}
 */
export function loadModeEmitsFleet(repoRoot = REPO_ROOT) {
  return loadConvertedDescriptors(repoRoot).map((descriptor) => {
    const slug = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
    return {
      descriptor,
      slug,
      goldenMetas: readGoldenMetas(path.join(repoRoot, GOLDEN_DIR_REL, slug, 'post')),
    };
  });
}

/**
 * In-memory fixtures + assertions. Throws on the first failure.
 */
export function selfTest() {
  const mk = (over = {}) => ({
    identity: { name: 'fixture_step', archetype: 'LINK' },
    staleness: { mode_select: 'tri_state', trigger: 'none' },
    outputs: { invalidates: [] },
    emits: 'none',
    ...over,
  });
  const fullRescanRow = { table: 't', column: 'c', by: 'full_rescan' };
  const fail = (label, extra) => {
    throw new Error(`self-test FAILED (${label}): ${extra}`);
  };
  const want = (label, got, expected) => {
    if (got !== expected) fail(label, `expected ${expected}, got ${got}`);
  };

  want('LINK tri_state', modeSelectViolations(mk()).length, 0);
  want(
    'LINK none + full_rescan',
    modeSelectViolations(
      mk({ staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [fullRescanRow] } }),
    ).length,
    0,
  );
  want(
    'LINK none no row',
    modeSelectViolations(mk({ staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [] } })).length,
    1,
  );
  want(
    'ENRICHER tri_state',
    modeSelectViolations(mk({ identity: { name: 'fixture_step', archetype: 'ENRICHER' } })).length,
    1,
  );
  want(
    'INGESTOR none + source_validator',
    modeSelectViolations(
      mk({
        identity: { name: 'fixture_step', archetype: 'INGESTOR' },
        staleness: { mode_select: 'none', trigger: [{ signal: 'source_validator' }] },
      }),
    ).length,
    1,
  );

  if (valueMatchesType('number', 3) !== true) fail('number 3', 'expected true');
  if (valueMatchesType('int', '3') !== false) fail('int "3"', 'expected false');
  if (valueMatchesType('object', null) !== true) fail('object null', 'expected true');

  const emits = emitsTypeResult(
    { identity: { name: 'fixture_step' }, emits: [{ key: 'n', type: 'int', consumers: [] }] },
    [{ file: 'a.json', meta: { n: 'x' } }],
  );
  want('emitsTypeResult checked', emits.checked, 1);
  want('emitsTypeResult violations', emits.violations.length, 1);
}

export { EMITS_TYPES, MODE_SELECT_ARCHETYPES, GOLDEN_DIR_REL };
