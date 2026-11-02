// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-436..M-447 (McProof, MB-77 sub-item (b));
//            docs/reports/decisions/2026-10-31-batch-an.json M-444 (sizing by risk), M-446 (record integrity).
//
// MB-77 (b) — the approval rules of the McProof builder:
//   item 4  the stage-order gate (MCPROOF-6, CARD-mcproof-lessons item 1) and the planned n/a set;
//   item 5  the A7 mandatory-stage table per layer (data file `mandatory-stages.json`) and the A6/A7 path overrides;
//   item 7  deriveOverall (MCPROOF-12) and the C3.4 model-agreement rule.
//
// Every settled value comes from the config through `cv(config, key)`, never as a literal in code (MCPROOF-10).
// Pure functions, no clock, no environment: the same inputs yield the same output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeKeys, compareIds, cv, keySha } from './config.mjs';

/** The module directory; the shipped A7 table lives beside this file. */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The default A7 table path. */
export const DEFAULT_TABLE_PATH = path.join(HERE, 'mandatory-stages.json');

/** The six stage keys of one record, in vocabulary order (`question` 0, `city` 1, `regression` 2, `blind` 3,
 * `claude` 4, `arithmetic` 5). */
export const STAGES = ['question', 'city', 'regression', 'blind', 'claude', 'arithmetic'];

/** The stage states the gate treats as finished (parked = retries exhausted; `n/a` needs a reason elsewhere). */
const GATE_FINISHED = new Set(['approved', 'differs', 'n/a', 'parked', 'needs_you']);

/** A config switch naming the low-risk Arithmetic stages 3 and 5 skip. */
const SKIP_SWITCH = 'quick_arithmetic_skips_stage5';

/** True when `v` is a plain object (not null, not an array). */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** True when `s` is a non-empty, non-blank string. */
function hasText(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

/** Copy `xs` to a fresh array; a non-array reads as the empty array. */
function asArray(xs) {
  return Array.isArray(xs) ? xs.slice() : [];
}

/**
 * `loadTable(path?)` -> the A7 table as a null-prototype map layer -> `{required[], may_na[]}`, plus `_source`.
 * The data file is checked with `assertSafeKeys` so a layer named `__proto__` can never reach the prototype.
 */
export function loadTable(tablePath = DEFAULT_TABLE_PATH) {
  const raw = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  if (!isPlainObject(raw)) throw new Error('table_not_an_object');
  assertSafeKeys(raw);
  const out = Object.create(null);
  for (const k of Object.keys(raw)) {
    const row = raw[k];
    if (k === '_source') {
      out[k] = row;
      continue;
    }
    if (!isPlainObject(row)) throw new Error(`table_malformed:${k}`);
    out[k] = { required: asArray(row.required), may_na: asArray(row.may_na) };
  }
  return out;
}

/** The shipped A7 table, read once (read-only data, no clock, so the result never changes). */
const TABLE = loadTable();

/** The size of one example's not-low-risk quick proof set: `quick_path_stages` plus stage 4 (`claude`). */
const LOW_RISK_OFF_COMPLETE = ['arithmetic', 'claude', 'question'];

/**
 * `mandatoryStages(layer, {path, lowRisk, config}) -> {required[], may_na[]}`: the A7 row for the layer, narrowed
 * by the A6/A7 path overrides. `quick` -> required = `cv(quick_path_stages)`. A low-risk example with
 * `quick_arithmetic_skips_stage5` true requires `question` + `claude` (blind and arithmetic `n/a`); with the
 * switch false it requires `question` + `arithmetic` + `claude` (blind `n/a`). `sample` and `full` -> the layer
 * table. Unknown layer throws `unknown_layer:<layer>`.
 */
export function mandatoryStages(layer, opts) {
  const name = String(layer);
  const row = Object.prototype.hasOwnProperty.call(TABLE, name) ? TABLE[name] : undefined;
  if (!isPlainObject(row)) throw new Error(`unknown_layer:${name}`);
  const { path: sizePath, lowRisk = false, config } = opts ?? {};
  const tableRequired = asArray(row.required);
  const tableMayNa = asArray(row.may_na);

  if (sizePath === 'quick') {
    const quick = asArray(cv(config, 'quick_path_stages')).map((s) => String(s));
    const skip = cv(config, SKIP_SWITCH) === true;
    if (lowRisk) {
      if (skip) return { required: ['question', 'claude'], may_na: ['blind', 'city', 'arithmetic'] };
      return { required: LOW_RISK_OFF_COMPLETE.slice(), may_na: ['blind', 'city'] };
    }
    const live = new Set(quick);
    return {
      required: quick,
      may_na: ['blind', 'claude', 'regression', 'arithmetic', 'city'].filter((s) => !live.has(s)),
    };
  }

  // `sample` and `full`, and no path at all: exactly the layer table.
  return { required: tableRequired, may_na: tableMayNa };
}

/**
 * `plannedNa(sizingRow, config) -> {[stage]: {reason, cites_config?, config_key_sha?}}`: the n/a set the sizing
 * decision plans BEFORE any review runs (CARD-mcproof-lessons item 2). Precedence: when `low_risk_arithmetic`
 * is true ONLY the low-risk branch applies and replaces the generic quick branch, so `claude` is never planned
 * `n/a` for a low-risk example, whatever the switch says. City is never planned here: it is `n/a` on both
 * through `cityState` in records.mjs.
 */
export function plannedNa(sizingRow, config) {
  const sizing = isPlainObject(sizingRow) ? sizingRow : {};
  const rule = String(sizing.rule);
  const out = Object.create(null);

  // A sizing.json row carries its size path in `path` (`sizing_path` is only a key inside the config entry).
  const lowRisk =
    sizing.layer === cv(config, 'low_risk_arithmetic').layer && sizing.path === cv(config, 'low_risk_arithmetic').sizing_path;
  if (lowRisk) {
    out.regression = { reason: `sizing rule ${rule}` };
    out.blind = { reason: `low-risk Arithmetic, sizing rule ${rule}, CARD-mcproof-lessons item 2` };
    if (cv(config, SKIP_SWITCH) === true) {
      out.arithmetic = {
        reason: `low-risk Arithmetic, sizing rule ${rule}, CARD-mcproof-lessons item 2`,
        cites_config: SKIP_SWITCH,
        config_key_sha: keySha(config, SKIP_SWITCH),
      };
    }
  } else if (sizing.path === 'quick') {
    out.regression = { reason: `sizing rule ${rule}` };
    out.blind = { reason: `sizing rule ${rule}` };
    out.claude = { reason: `sizing rule ${rule}` };
  }

  return out;
}

/**
 * True when one stage entry counts as finished for the stage-order gate: `approved`, `differs`, `n/a`, `parked`,
 * `open` with `routed:'needs_you'` (a "cannot decide" answer), or `errored` whose retries are exhausted
 * (`attempts - 1 >= cv(max_retries_per_stage)`, which A4 turns into `parked`). A plain `open` and an `errored`
 * stage with retries left are unfinished.
 */
function gateFinished(stage, config) {
  if (!isPlainObject(stage)) return false;
  const status = stage.status;
  if (status === 'errored') {
    const attempts = stage.attempts;
    if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) return false;
    return attempts - 1 >= Number(cv(config, 'max_retries_per_stage'));
  }
  if (status === 'open') return stage.routed === 'needs_you';
  return GATE_FINISHED.has(status);
}

/**
 * `stageOrderGate(records, config) -> {open, unfinished[]}` over the stages named in
 * `cv(stage_order_gate).complete_before_stages_3_and_5` for EVERY example: finished = `approved`, `differs`,
 * `n/a`, `parked`, `open` with `routed:'needs_you'`, or `errored` with its retries exhausted; an `errored` stage
 * with retries left and a plain `open` are unfinished. `unfinished` lists every id with at least one unfinished
 * gate stage, sorted with `compareIds`.
 */
export function stageOrderGate(records, config) {
  const gateCfg = cv(config, 'stage_order_gate');
  const stages = asArray(isPlainObject(gateCfg) ? gateCfg.complete_before_stages_3_and_5 : []).map((s) => String(s));
  const src = isPlainObject(records) ? records : {};
  const unfinished = [];
  for (const id of Object.keys(src).sort(compareIds)) {
    const record = src[id];
    const done = stages.every((stage) => gateFinished(isPlainObject(record) ? record[stage] : undefined, config));
    if (!done) unfinished.push(id);
  }
  return { open: unfinished.length === 0, unfinished };
}

/** True when a stage entry is FINISHED in the gate sense: the same rule `gateFinished` applies. */
function finishedStage(stage) {
  if (!isPlainObject(stage)) return false;
  const status = stage.status;
  if (status === 'approved' || status === 'differs' || status === 'n/a' || status === 'parked') return true;
  if (status === 'open') return stage.routed === 'needs_you';
  return false;
}

/**
 * `mayCall(stageKey, id, gate, records) -> boolean`, defined for all six stages: `question` and `regression`
 * always; `blind` and `arithmetic` only when the gate is open and that example's question is approved; `claude`
 * when the gate is open, the question is approved and blind is FINISHED (approved, differs, n/a, parked, or open
 * with `routed:'needs_you'`). Any other key answers false.
 */
export function mayCall(stageKey, id, gate, records) {
  const record = isPlainObject(records) ? records[String(id)] : undefined;
  const question = isPlainObject(record) ? record.question : undefined;
  const blind = isPlainObject(record) ? record.blind : undefined;
  if (stageKey === 'question' || stageKey === 'regression') return true;
  if (stageKey === 'city') return false;
  const open = isPlainObject(gate) && gate.open === true;
  const questionApproved = isPlainObject(question) && question.status === 'approved';
  if (stageKey === 'blind' || stageKey === 'arithmetic') return open && questionApproved;
  if (stageKey === 'claude') return open && questionApproved && finishedStage(blind);
  return false;
}

/**
 * True when the stage entry carries a real answer: a `differs` stage needs a finding, and either status needs a
 * non-empty `model` (two `n/a` stages carry none and are never compared).
 */
function carriesModel(stage) {
  return isPlainObject(stage) && typeof stage.model === 'string' && stage.model.length > 0;
}

/** True when `finding` is an accepted finding for `stage`: the stage and a non-empty reason and accepted_by. */
function isAcceptedFinding(finding, stage) {
  return (
    isPlainObject(finding) &&
    finding.stage === stage &&
    hasText(finding.reason) &&
    hasText(finding.accepted_by) &&
    hasText(finding.finding_id) &&
    hasText(finding.date)
  );
}

/** True when some accepted finding satisfies `stage`. */
function hasAcceptedFinding(findings, stage) {
  return findings.some((f) => isAcceptedFinding(f, stage));
}

/** `satisfied(stage, entry, findings)`: approved, or differs with an accepted finding (`counts as satisfied`). */
function satisfied(stage, entry, findings) {
  if (!isPlainObject(entry)) return false;
  if (entry.status === 'approved') return true;
  if (entry.status === 'differs') return hasAcceptedFinding(findings, stage);
  return false;
}

/**
 * `deriveOverall(record, ctx) -> {state, text}` (MCPROOF-12). The order of the rulings:
 *   errored or parked -> `needs_you`; `cannot_decide` -> `needs_you`;
 *   blind and claude both approved with the same non-empty `model` -> `needs_you` (C3.4 independence);
 *   a `differs` with no matching accepted finding -> `change`;
 *   a Ruling without `operator_answered` -> `needs_you`;
 *   every required stage satisfied (or `n/a` with a reason and in `may_na`) -> `approved`; else `needs_you`.
 * A hand-written `overall` on the record is never read.
 */
export function deriveOverall(record, ctx) {
  const rec = isPlainObject(record) ? record : {};
  const context = isPlainObject(ctx) ? ctx : {};
  const layer = String(context.layer);
  const findings = asArray(context.accepted_findings).filter((f) => isPlainObject(f));

  const keys = STAGES;
  for (const key of keys) {
    const entry = rec[key];
    if (!isPlainObject(entry)) continue;
    if (entry.status === 'errored') return { state: 'needs_you', text: `stage ${key} errored: needs you` };
    if (entry.status === 'parked') return { state: 'needs_you', text: `stage ${key} parked: needs you` };
    if (entry.cannot_decide === true) return { state: 'needs_you', text: `stage ${key} cannot decide: needs you` };
  }

  const blind = rec.blind;
  const claude = rec.claude;
  if (carriesModel(blind) && carriesModel(claude) && blind.model === claude.model) {
    return { state: 'needs_you', text: `stage blind and stage claude carry the same model ${String(blind.model)}` };
  }

  if (layer === 'Ruling' && context.operator_answered !== true) {
    return { state: 'needs_you', text: 'Ruling needs operator_answered' };
  }

  let stages;
  try {
    stages = mandatoryStages(layer, { path: context.path, lowRisk: context.lowRisk, config: context.config });
  } catch (err) {
    return { state: 'needs_you', text: String(err instanceof Error ? err.message : err) };
  }
  const mayNa = new Set(stages.may_na.map((s) => String(s)));
  const required = stages.required.map((s) => String(s));

  // A `differs` on a required stage with no accepted finding is the one `change` verdict (C3.x); a `differs`
  // on a stage outside the required set is not consulted, since that stage is not part of what must be finished.
  for (const stage of required) {
    const entry = rec[stage];
    if (isPlainObject(entry) && entry.status === 'differs' && !hasAcceptedFinding(findings, stage)) {
      return { state: 'change', text: `stage ${stage} differs without an accepted finding` };
    }
  }

  for (const stage of required) {
    if (stage === 'operator_answered') {
      if (context.operator_answered !== true) return { state: 'needs_you', text: 'Ruling needs operator_answered' };
      continue;
    }
    const entry = rec[stage];
    if (satisfied(stage, entry, findings)) continue;
    if (isPlainObject(entry) && entry.status === 'n/a' && hasText(entry.reason) && mayNa.has(stage)) continue;
    return { state: 'needs_you', text: `stage ${stage} is not satisfied` };
  }

  return { state: 'approved', text: 'every required stage is satisfied' };
}
