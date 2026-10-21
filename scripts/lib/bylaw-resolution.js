/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (row shape, value_kind), §5 (the unauthored-exception
 *            gate), §7 I3 / I4 / I10 (PRIMARY)
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-231 (operator approved 2026-10-20,
 *            2026-10-20-scenario-build-rulings#R-4), M-232 (the Layer 2 status set)
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md §1 (compute purity)
 *
 * `resolve_bylaws` (Layer 2) — slice (a) of the build plan (docs/reports/2026-10-21-layer2-build-plan.md §7): the
 * pure resolution functions Spec 134 and the recorded rulings fully settle, built ahead of commit ① on fixtures (the
 * node N6a form, Spec 134 §9). No descriptor, shell, migration or runner hook exists yet (Spec 124 R-K.1: at
 * red_suite there is no descriptor file). Pure: requires nothing; no fs, pg, env, clock or randomness.
 *
 * A library, not the compute module: a file in scripts/lib/compute/ must pair with a manifest step (step-conformance
 * §5.5), and the step is registered only at ①. The compute module `scripts/lib/compute/resolve-bylaws.js` (②) will
 * require it, as compute modules require `../zoning-precedence` and `../safe-math`.
 *
 * What is still open is passed IN, never decided here (plan §6): the INCLUDE closure and the authored map (OQ-2), the
 * declared (target, structure) scope (OQ-8), which lot gate is reported first (OQ-6), and the physical status columns
 * (OQ-4). Status strings use the Spec 68 §5a part 3 written form `not_evaluated:<code>` (Spec 134 §4; M-232).
 *
 *   unauthoredException(closure, authored)       → the first exception id not fully authored, or null   (M-231)
 *   exceptionGateStatus(closure, authored)       → 'not_evaluated:exception_not_authored:<id>' or null   (M-231)
 *   gatedRows(scope, status)                     → one no-winner row per (target, structure)             (M-231; I3, I4)
 *   resolveLot({ scope, gateStatus, resolveOne }) → gated rows, or resolveOne per scope entry            (gate first)
 *   valueKindOf(value)                           → 'number' | 'unlimited' | 'unregulated'                (§3)
 */
'use strict';

/** The evaluator's closed code for this gate (evaluate.mjs NOT_EVALUATED_CODES; the test locks the membership). */
const EXCEPTION_GATE_CODE = 'exception_not_authored';
/** The Layer 2 status a lot gate writes (Spec 68 §5a part 3 / Spec 134 §4: `not_evaluated:<code>`). */
const NOT_EVALUATED_PREFIX = 'not_evaluated:';
/** Spec 134 §3 value_kind, closed: a finite number, or one of the evaluator's two terminal values (evaluate.mjs). */
const TERMINAL_VALUE_KINDS = Object.freeze(['unlimited', 'unregulated']);

/**
 * "Fully authored" is the evaluator context's authored state (evaluate.mjs makeContext `authored`: 'authored' |
 * {status: 'authored'} | {status: 'partial', targets}). `partial` is NOT fully authored, whatever targets it lists:
 * M-231 gates the whole lot, where the evaluator's own ruling (d) gate is per target. Nothing listed = not authored.
 */
function isFullyAuthored(state) {
  return state === 'authored' || (state !== null && typeof state === 'object' && state.status === 'authored');
}

/**
 * M-231: the first exception id of the lot's ordered INCLUDE closure (the lot's own exception first) that is not
 * fully authored, or null. An empty closure (no exception) is never gated. A missing closure or authored map is a
 * missing input and throws: it is never defaulted (Spec 134 I10).
 */
function unauthoredException(closure, authored) {
  if (!Array.isArray(closure)) throw new TypeError('unauthoredException: closure must be the ordered exception closure (an array); a missing input is never defaulted (Spec 134 I10)');
  if (authored === null || typeof authored !== 'object' || Array.isArray(authored)) throw new TypeError('unauthoredException: authored must be the exception → authored-state map; a missing input is never defaulted (Spec 134 I10)');
  for (const id of closure) {
    if (!isFullyAuthored(Object.prototype.hasOwnProperty.call(authored, id) ? authored[id] : undefined)) return id;
  }
  return null;
}

/** M-231's written form: `not_evaluated:exception_not_authored:<exception id>` for a gated lot, else null. */
function exceptionGateStatus(closure, authored) {
  const id = unauthoredException(closure, authored);
  return id === null ? null : `${NOT_EVALUATED_PREFIX}${EXCEPTION_GATE_CODE}:${id}`;
}

function checkedScope(scope) {
  if (!Array.isArray(scope)) throw new TypeError('scope must be the declared (target, structure) list');
  const seen = new Set();
  for (const s of scope) {
    if (!s || typeof s.target !== 'string' || !s.target) throw new TypeError(`scope entry without a target: ${JSON.stringify(s)}`);
    if (typeof s.structure !== 'string' || !s.structure) throw new TypeError(`scope entry without a structure: ${JSON.stringify(s)}`);
    const k = `${s.target}\u0000${s.structure}`;
    if (seen.has(k)) throw new Error(`duplicate scope entry ${s.target} × ${s.structure} (Spec 134 I1 counts each exactly once)`);
    seen.add(k);
  }
  return scope;
}

/**
 * M-231, "written per target": one row per declared (target, structure), each carrying the gate's status and no
 * winner (Spec 134 I3: a closed reason and no winner; I4: no winner on a gated lot).
 */
function gatedRows(scope, status) {
  if (typeof status !== 'string' || !status.startsWith(NOT_EVALUATED_PREFIX) || status.length === NOT_EVALUATED_PREFIX.length) {
    throw new TypeError(`gatedRows: a lot gate writes a not_evaluated:<code> status, got ${JSON.stringify(status)}`);
  }
  return checkedScope(scope).map((s) => ({ target: s.target, structure: s.structure, status, winner_unit_id: null }));
}

/**
 * The gate fires before effective() (M-231; Spec 134 §5): a gated lot takes the gated rows and the resolver is never
 * called, even where it could resolve a target from base (the A14 case). An ungated lot calls resolveOne once per
 * scope entry, in scope order.
 */
function resolveLot({ scope, gateStatus, resolveOne }) {
  if (gateStatus !== null && gateStatus !== undefined) return gatedRows(scope, gateStatus);
  if (typeof resolveOne !== 'function') throw new TypeError('resolveLot: resolveOne must be a function for an ungated lot');
  return checkedScope(scope).map((s) => resolveOne(s));
}

/** Spec 134 §3: value_kind ∈ number · unlimited · unregulated; anything else throws, never guessed. */
function valueKindOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (TERMINAL_VALUE_KINDS.includes(value)) return value;
  throw new TypeError(`value_kind: ${JSON.stringify(value)} is neither a finite number nor one of ${TERMINAL_VALUE_KINDS.join(', ')}`);
}

module.exports = {
  unauthoredException,
  exceptionGateStatus,
  gatedRows,
  resolveLot,
  valueKindOf,
};
