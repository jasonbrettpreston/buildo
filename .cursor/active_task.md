# Active Task: WF1 #lifecycle-phase-engine-migration-E.1 — Bug 84-W12 fix + `mapToUniversalStream` + TS twin extension

**Status:** Implementation (authorized 2026-05-14; v4 plan locked; user authorized via "proceed"; same-sprint mitigation Option 2 active — Legacy adapter consumer switch in E.1 commit)
**Workflow:** WF1 (New Feature — substrate work for Phase E; pure-function additions + TS twin extension; no DB schema changes in E.1)
**Domain Mode:** Backend/Pipeline (`scripts/lib/`, `src/lib/classification/`, `docs/specs/`)
**Rollback Anchor:** `9d32ba3` (R5.6 Phase D close-out)
**Parent WF:** Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension (Spec 42 §6.11)
**Sub-deliverable position:** **E.1 (substrate — THIS task)** → **E.2 (consumer wiring + matchedStatus columns migration + downstream `lead_id` guards** ← scope expanded per Gemini v3 CRIT folds, user-authorized) → E.3 (`compute-phase-calibration.js` cohort-key) → E.4 (`assert-lifecycle-phase-distribution.js` per-seq bands) → E.5 (band recalibration — operational)
**Adversarial review:** USER-REQUESTED — 4 reviewers (Gemini + DeepSeek + independent code-reviewer worktree + observability worktree using Spec 48 lens) at BOTH plan stage AND diff stage.
**Plan-review history:** v1 (30 findings, 7 CRIT) → v2 (28 findings, 7 new convergent CRIT) → v3 (18 findings, 0 new CRIT, 3 convergent HIGH + 2 user-authorized E.2-scope CRITs) → **v4 = this version**.

## v3 → v4 Revision Summary

v3 surfaced 0 new CRITICALs (genuine convergence) + 3 convergent HIGH findings + 2 Gemini E.2-scope CRITs the user authorized to fold. Plus single-reviewer HIGHs and MEDIUMs:

| # | New v4 fold | Source convergence | Severity |
|---|---|---|---|
| 1 | E.2 scope expanded: `coa_applications` migration to persist `matched_status`/`matched_rule`/`unmapped_status`/`unmapped_decision` columns (improves diagnosability — direct queries instead of audit-log archaeology) | Gemini v3 CRIT 1 (user-authorized) | CRITICAL |
| 2 | E.2 scope expanded: `lead_id LIKE 'coa:%'` guards in `compute-trade-forecasts.js` + `update-tracked-projects.js` ship in E.2 (NOT Phase F) | Gemini v3 CRIT 2 (user-authorized) | CRITICAL |
| 3 | `NORMALIZED_DECISION_TO_STATUS_MAP`: enumerate all 16 existing variants explicitly (no `...EXISTING_VARIANTS` placeholder) — test #8 completeness assertion drives correctness | DeepSeek v3 HIGH + Independent v3 NEW-H2 (2-way) | HIGH |
| 4 | `mapToUniversalStream` JSDoc: explicit warning that returned `.phase` is the catalog's descriptive label (e.g., `'UNMAPPED→null'` at seq 35, `'P7a/P7b/P7c'` for some permit rows) — **NOT** the `lifecycle_phase` write target | Independent v3 NEW-H3 + Observability v3 H1 (2-way) | HIGH |
| 5 | `mapToUniversalStream` post-lookup validation: if catalog row's `.phase` is non-standard (not in `{'P1','P2','P3','P4','P19','P20'}`), return null AND drive E.2 to emit `catalog_invalid_phase_count` (7th metric) | Observability v3 H1 | HIGH |
| 6 | E.1↔E.2 gap mitigation: `classify-lifecycle-phase.js` (the existing consumer) must be EITHER updated in same commit as E.1 OR switched to `classifyCoaPhaseLegacy` adapter via a one-line consumer-side guard | Gemini v3 HIGH + Observability v3 H2 (2-way) | HIGH |
| 7 | `isDeferredDecisionVariant` negative guard extended to P19/P20 sets (`'deferred but refused'` regression case) | Gemini v3 HIGH | HIGH |
| 8 | `classifyCoaPhaseLegacy` JSDoc clarified: "preserves OLD RETURN SHAPE, not OLD BUGGY BEHAVIOR" (decision='Approved' → null in adapter is correct narrowing, not regression) | Gemini v3 HIGH | HIGH |
| 9 | **22-status appendix table** added to plan with `(status, expected_phase, expected_rule)` per §2.5.c — drives the test fixture | DeepSeek v3 HIGH | HIGH |
| 10 | `unmappedStatus: boolean` SPLIT into `unmappedStatus: boolean` + `unmappedDecision: boolean` (cleaner than Gemini's enum — both can fire independently when both inputs are garbage) | Gemini v3 MEDIUM (refined) | MEDIUM |
| 11 | Rule 6 hardcoded `'Deferred'` matchedStatus: explicitly documented in rule-body pseudocode + map exception note + test for date-stamped variant | Gemini v3 MEDIUM + Observability v3 M1 (2-way) | MEDIUM |
| 12 | `computeStallFromActivity` defined inline with null-safe guards (mirrors existing JS lines 388-397 behavior exactly) | DeepSeek v3 MEDIUM | MEDIUM |
| 13 | Two-flow regression test: `linked_permit_num='X'` + `status='Approved'` → P3 (anti-Rule-0 regression) | DeepSeek v3 MEDIUM | MEDIUM |
| 14 | `source` callsite invariant: documented that CoA classifier always emits CoA-side matchedStatus; E.2 caller must pass `source='coa.status'` for CoA lookups | DeepSeek v3 MEDIUM | MEDIUM |
| 15 | `'approved with conditions'` marked **existing** in `NORMALIZED_APPROVED_DECISIONS` (not NEW) per actual file state | DeepSeek v3 LOW | LOW |
| 16 | `typeof input !== 'object'` defensive guard added (handles `undefined`/string/null input without TypeError) | DeepSeek v3 LOW | LOW |
| 17 | Explicit `module.exports` list in plan: every new function and set named | DeepSeek v3 NIT | LOW |
| 18 | Spec 48 Improvement C unavailability noted: pinned-baseline option requires that WF2 to ship first; current state is queued-not-authorized — fallback (manual annotation + operator pre-ack) is the only viable mitigation | Observability v3 concern A | LOW |
| 19 | `.cursor/queued_task_phase_f_ordinal_guards.md` creation noted as E.1 close-out deliverable artifact — REMOVED since T1+T2 folded into E.2 scope; replaced by `.cursor/queued_task_phase_e2_consumer_wiring.md` (created at E.1 ship to lock the expanded E.2 scope) | Observability v3 concern D + E.2 scope expansion | LOW |
| 20 | `${source}:${matchedStatus}` colon fragility — `` separator considered but DEFERRED to Phase F (no current CoA status contains `:`) | Gemini v3 LOW | NIT |

## Two-Flow Awareness (Spec 42 §6.6.X reminder)

Two real-world flows produce CoA applications:

- **Flow A — CoA-first** (most CoAs): applicant files variance hearing → if approved, *later* files permit. The permit may not exist at CoA ingest.
- **Flow B — Permit-first via Examiner's Notice**: applicant files permit → examiner identifies need for variance → applicant files CoA in response. The permit exists *before* the CoA at ingest.

**Implication for E.1**: regardless of flow, every CoA has its OWN lifecycle in the Universal Stream (CoA-side rows = seq 1-22). The classifier reads `coa_applications.status` + `decision` and emits the CoA's position — irrespective of whether `linked_permit_num` is set. R5.6 already handled the data-inheritance side (lat/long/ward inheritance from linked permit). Phase E.1 handles the lifecycle-classification side.

**Removing Rule 0 is the structural change that accommodates Flow B properly.** A linked CoA can be in "Approved" status (its own lifecycle position) while its linked permit is in "Plan Review" (the permit's lifecycle position) — both are correct simultaneously.

## Context

### Goal

Land the foundational substrate for Phase E lifecycle engine migration:

1. **Bug 84-W12 fix** — `classifyCoaPhase()` reads BOTH `coa_applications.status` AND `coa_applications.decision`. Rule 0 (linked_permit_num short-circuit) removed. Status-set membership matches Spec 84 §2.5.c (22 distinct CKAN status values). Expected outcome on E.2 ship: CoA `lifecycle_phase` non-NULL rate climbs from 0.6% → ≥95%.

2. **`mapToUniversalStream` substrate** — NEW pure function returning the granular catalog row. Catalog passed in as a pre-built Map (pure-function contract). Direct `(source, matchedStatus)` lookup — no wildcard fallback. **Post-lookup phase validation** (v4 fold #5): if catalog row's `.phase` is non-standard (e.g., `'UNMAPPED→null'` at seq 35), return null + drive `catalog_invalid_phase_count` audit increment.

3. **TS twin EXTENSION** — `src/lib/classification/lifecycle-phase.ts` (673 lines, exists). E.1 EXTENDS: widens `CoaClassifierResult` type, rewrites `classifyCoaPhase` per the corrected precedence, adds `mapToUniversalStream`, adds `classifyCoaPhaseLegacy` adapter.

4. **Spec amendments (14)** — Spec 42 §6.3 figure + §6.7 step 1 + step 2 + threshold strike + §6.9 modified-scripts table (4 row updates) + §6.11 Phase E row (expanded E.2 scope); Spec 84 §2.5.f row 4 + §2.5.c table + §3 contract rewrite + §3.1 narrative rewrite + 84-W12 resolution + 84-W11 transitional-collision deferred to Phase F minus T1/T2 (T1/T2 absorbed into E.2 per scope expansion).

### Target Specs (full path)

- `docs/specs/01-pipeline/42_chain_coa.md` §6.3 + §6.7 step 1 + §6.7 step 2 + §6.7 threshold + §6.9 (4 modified-scripts rows) + §6.11 Phase E row (expanded) + §6.6.X (two-flow lead-identity continuity — already in spec)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §2.5.b + §2.5.c + §2.5.f row 4 + §2.5.h Universal Stream catalog + §3 Behavioral Contract + §3.1 narrative + line 1016 namespace deprecation + 84-W11/W12 bug entries
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` — N/A for substrate; E.2 engages
- `docs/specs/01-pipeline/48_pipeline_observability.md` — Spec 48 Improvement C (pinned baseline) NOT shipped; manual annotation fallback only
- `docs/specs/00_engineering_standards.md` §7 Dual Code Path Safety

### Key Files

- `scripts/lib/lifecycle-phase.js` (target — 579 lines; `classifyCoaPhase` lines 371-401 ignores status)
- `src/lib/classification/lifecycle-phase.ts` (target — **ALREADY EXISTS, 673 lines**; `CoaClassifierResult` line 79 needs widening)
- `migrations/128_create_universal_stream_catalog.sql` + `migrations/129_seed_universal_stream_catalog.sql` (110-row catalog; `source CHECK IN ('coa.status', 'permits.status', 'insp.stage')`; seq 35 has `phase='UNMAPPED→null'` — poisoned-row test target)
- `src/tests/lifecycle-phase.logic.test.ts` (extend with ~170-case regression matrix + tiebreakers + stall + map-completeness + two-flow + typo variants + poisoned catalog row)
- `scripts/classify-lifecycle-phase.js` (E.1↔E.2 gap risk — primary consumer of `classifyCoaPhase`; see Same-Sprint Mitigation below)

## Technical Implementation

### Part 1 — `classifyCoaPhase()` rewrite (`scripts/lib/lifecycle-phase.js`)

**NEW return shape** (additive; legacy `{phase, stalled}` destructure preserved):

```js
{
  phase:            'P1'|'P2'|'P3'|'P4'|'P19'|'P20'|null,
  stalled:          boolean,
  matchedStatus:    string|null,    // canonical CoA status for mapToUniversalStream lookup; NULL for rule 9 catchall
  matchedRule:      number,         // 1..9 — rule that fired. 0 = defensive sentinel (null/non-object input)
  unmappedStatus:   boolean,        // true when input.status was non-null but not in any status set (data drift signal)
  unmappedDecision: boolean,        // true when input.decision was non-null but not in any decision set/helper (data drift signal — v4 fold #10 split from unmappedStatus)
}
```

**Defensive input guard** (v4 fold #16 — DeepSeek v3 LOW):

```js
if (typeof input !== 'object' || input === null) {
  return {phase: null, stalled: false, matchedStatus: null, matchedRule: 0, unmappedStatus: false, unmappedDecision: false};
}
```

**Status & decision normalization at function entry:**

```js
function normalizeCoaStatus(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}
const status = normalizeCoaStatus(input.status);
const decision = normalizeCoaDecision(input.decision);  // existing lowercase+collapse-whitespace
```

**Stall computation helper** (v4 fold #12 — DeepSeek v3 MEDIUM; mirrors existing lib lines 388-397):

```js
function computeStallFromActivity(daysSinceActivity, stallThresholdDays) {
  if (daysSinceActivity == null || stallThresholdDays == null) return false;
  const d = Number(daysSinceActivity);
  const t = Number(stallThresholdDays);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return false;
  return d > t;
}
```

**Precedence — 9 rules, top-down, first match wins:**

| # | Match | Phase | Catalog seq | matchedStatus derivation |
|---|---|---|---|---|
| 1 | `status IN COA_TERMINAL_P20_STATUSES` OR `decision IN NORMALIZED_P20_DECISIONS` | `P20` | 21, 22 | `status` if status-driven, else `NORMALIZED_DECISION_TO_STATUS_MAP.get(decision)` |
| 2 | `status IN COA_TERMINAL_P19_STATUSES` OR `decision IN NORMALIZED_P19_DECISIONS` | `P19` | 13, 19, 20 | `status` if status-driven, else `NORMALIZED_DECISION_TO_STATUS_MAP.get(decision)` |
| 3 | `status IN COA_FINAL_AND_BINDING_STATUSES` OR `decision IN NORMALIZED_FINAL_AND_BINDING_DECISIONS` | `P4` | 14 | `'Final and Binding'` (single canonical) |
| 4 | `status IN COA_POST_DECISION_STATUSES` (Appealed, TLAB Appeal, OMB Appeal, Await Expiry Date) — **reordered above approved** | `P3` | 15, 16, 17, 18 | `status` |
| 5 | `status IN COA_APPROVED_STATUSES` OR `decision IN NORMALIZED_APPROVED_DECISIONS` | `P3` | 10, 11, 12 | `status` if status-driven, else `NORMALIZED_DECISION_TO_STATUS_MAP.get(decision)` |
| 6 | `isDeferredDecisionVariant(decision)` — **reordered above review-status** | `P2` | 9 | `'Deferred'` (hardcoded canonical — see Note A below) |
| 7 | `status IN COA_REVIEW_STATUSES` | `P2` | 3-9 | `status` |
| 8 | `status IN COA_INTAKE_STATUSES` | `P1` | 1, 2 | `status` |
| 9 | **catchall** — emit P1, `matchedStatus: null`, set `unmappedStatus`/`unmappedDecision` per which input(s) were unrecognized | `P1` | n/a | `null` (drives lifecycle_seq=NULL in E.2) |

**Note A (v4 fold #11 — Gemini v3 + Observability v3 convergent)**: Rule 6 fires for `'deferred'`, `'deffered'`, `startsWith('deferred ')` variants, and `includes('decision not made')` outliers. The map lookup for date-stamped variants returns `undefined`; the rule body uses a hardcoded fallback `matchedStatus = 'Deferred'`. Pseudocode:

```js
// Rule 6
if (isDeferredDecisionVariant(decision)) {
  const mapped = NORMALIZED_DECISION_TO_STATUS_MAP.get(decision);
  return {phase: 'P2', matchedRule: 6, matchedStatus: mapped ?? 'Deferred', /* ... */};
}
```

**Unmapped signal logic** (v4 fold #10 split):

```js
const unmappedStatus = status != null && !ANY_STATUS_SET_MATCHED;
const unmappedDecision = decision != null && !ANY_DECISION_SET_MATCHED && !isDeferredDecisionVariant(decision);
```

**Stall — forced false for non-{P1, P2}:**

```js
const isInFlightPhase = (phase === 'P1' || phase === 'P2');
const stalled = isInFlightPhase
  ? computeStallFromActivity(input.daysSinceActivity, input.stallThresholdDays)
  : false;
```

Rule 9 catchall → P1, so stall IS computed for the catchall (in-flight unrecognized status may still be stalled).

### Status-set membership (verified against Spec 84 §2.5.c — full 22-row appendix at end of plan)

```js
const COA_REVIEW_STATUSES = new Set([
  'Prepare Notice', 'Notice Prepared',
  'Tentatively Scheduled', 'Hearing Scheduled', 'Hearing Rescheduled',
  'Postponed', 'Deferred',
]);
const COA_INTAKE_STATUSES = new Set(['Application Received', 'Accepted']);
const COA_TERMINAL_P20_STATUSES = new Set(['Closed', 'Complete']);
const COA_TERMINAL_P19_STATUSES = new Set(['Application Withdrawn', 'Cancelled', 'Refused']);
const COA_APPROVED_STATUSES = new Set(['Approved', 'Approved with Conditions', 'Conditional Consent']);
const COA_FINAL_AND_BINDING_STATUSES = new Set(['Final and Binding']);
const COA_POST_DECISION_STATUSES = new Set([
  'Await Expiry Date', 'Appealed', 'TLAB Appeal', 'OMB Appeal',
]);
```

### Decision-side sets (split P19 vs P20 per DeepSeek v2 CRIT)

```js
const NORMALIZED_P19_DECISIONS = new Set([
  'refused', 'withdrawn', 'application withdrawn', 'delegated consent refused',
]);
const NORMALIZED_P20_DECISIONS = new Set([
  'closed', 'application closed', 'delegated consent closed',
]);
const NORMALIZED_FINAL_AND_BINDING_DECISIONS = new Set(['final and binding']);

// Approved decisions — KEEP existing 16 variants from lib/lifecycle-phase.js:110-127
// (v4 fold #15 — 'approved with conditions' is EXISTING, not NEW)
// + add 'conditional consent' / 'consent with conditions' (DeepSeek v2 CRIT fold)
const NORMALIZED_APPROVED_DECISIONS = new Set([
  // 16 existing variants:
  'approved', 'approved with conditions', 'approved with condition',
  'approved wih conditions', 'conditional approval', 'conditionally approved',
  'approved conditionally', 'approved on conditional', 'approved on condation',
  'approved on condtion', 'approved on condition', 'approved, as amended, on condition',
  'partially approved', 'conitional approval', 'modified approval', 'conditional approved',
  // New variants (v4 fold #3 — DeepSeek v3 + Indep v3 convergent enumeration):
  'conditional consent', 'consent with conditions',
]);

const NORMALIZED_DEFERRED_DECISIONS = new Set(['deferred', 'deffered']);  // 'deffered' = §2.5.b row 53 typo

// v4 fold #7 (Gemini v3 HIGH) — negative guard extended to P19/P20
function isDeferredDecisionVariant(normalized) {
  if (normalized == null) return false;
  if (NORMALIZED_APPROVED_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_P19_DECISIONS.has(normalized))      return false;
  if (NORMALIZED_P20_DECISIONS.has(normalized))      return false;
  if (NORMALIZED_FINAL_AND_BINDING_DECISIONS.has(normalized)) return false;
  return (
    NORMALIZED_DEFERRED_DECISIONS.has(normalized) ||
    normalized.startsWith('deferred ') ||
    normalized.includes('decision not made')
  );
}
```

### `NORMALIZED_DECISION_TO_STATUS_MAP` — explicit enumeration (v4 fold #3)

Every key in the union of decision sets gets an explicit canonical-status entry. Test #8 asserts completeness.

```js
const NORMALIZED_DECISION_TO_STATUS_MAP = new Map([
  // P19 decision-side
  ['refused',                       'Refused'],
  ['withdrawn',                     'Application Withdrawn'],
  ['application withdrawn',         'Application Withdrawn'],
  ['delegated consent refused',     'Refused'],
  // P20 decision-side
  ['closed',                        'Closed'],
  ['application closed',            'Closed'],
  ['delegated consent closed',      'Closed'],
  // P4 decision-side
  ['final and binding',             'Final and Binding'],
  // P3 decision-side — all 16 existing approved variants + 2 new
  ['approved',                       'Approved'],
  ['approved with conditions',       'Approved with Conditions'],
  ['approved with condition',        'Approved with Conditions'],
  ['approved wih conditions',        'Approved with Conditions'],
  ['conditional approval',           'Approved with Conditions'],
  ['conditionally approved',         'Approved with Conditions'],
  ['approved conditionally',         'Approved with Conditions'],
  ['approved on conditional',        'Approved with Conditions'],
  ['approved on condation',          'Approved with Conditions'],
  ['approved on condtion',           'Approved with Conditions'],
  ['approved on condition',          'Approved with Conditions'],
  ['approved, as amended, on condition', 'Approved with Conditions'],
  ['partially approved',             'Approved'],
  ['conitional approval',            'Approved with Conditions'],
  ['modified approval',              'Approved'],
  ['conditional approved',           'Approved with Conditions'],
  ['conditional consent',            'Conditional Consent'],
  ['consent with conditions',        'Conditional Consent'],
  // P2 decision-side (canonical only — date-stamped variants resolve via Rule 6 hardcoded fallback per Note A)
  ['deferred',                       'Deferred'],
  ['deffered',                       'Deferred'],
]);
```

### `classifyCoaPhaseLegacy` adapter (v4 fold #8 clarification — Gemini v3 HIGH)

**Purpose: preserves OLD RETURN SHAPE, not OLD BUGGY BEHAVIOR.** The old shape was `{phase: 'P1'|'P2'|null, stalled}`. With the bug fix, decisions like `'Approved'` now correctly map to P3; the adapter narrows P3/P4/P19/P20 → null for callers that destructure only `{phase, stalled}`. This is **correct narrowing** for the adapter contract, NOT a regression — the buggy behavior (decision='Approved' → P2) was wrong; we are not preserving wrongness.

```js
function classifyCoaPhaseLegacy(input) {
  const r = classifyCoaPhase(input);
  return {
    phase: (r.phase === 'P1' || r.phase === 'P2') ? r.phase : null,
    stalled: r.stalled,
  };
}
```

### Same-Sprint Mitigation (v4 fold #6 — Gemini v3 HIGH + Observability v3 H2)

`scripts/classify-lifecycle-phase.js` is the existing consumer. Three options:

1. **(Preferred)** E.1 + E.2 ship in the SAME COMMIT — eliminates gap entirely. Strict interpretation of the user's "accommodate where we can" framing.
2. **(Fallback)** If E.2 slips, `classify-lifecycle-phase.js` is patched in the E.1 commit to call `classifyCoaPhaseLegacy` (one-line consumer switch). This preserves 0.6% non-NULL coverage until E.2 wires the new consumer.
3. **(Reject)** Ship E.1 standalone with `classify-lifecycle-phase.js` calling `classifyCoaPhase` — would write new phase codes (P3/P4/P19/P20) to production CoA rows before the audit_table contract exists. Not acceptable.

Decision: **Option 1 is the target.** If schedule forces split, Option 2 lands in the same E.1 commit as a contingency. The plan-lock authorization should commit to Option 1; deviation requires E.2 plan-lock to begin same-day.

### Module exports list (v4 fold #17 — DeepSeek v3 NIT)

`scripts/lib/lifecycle-phase.js` `module.exports` adds:

- `classifyCoaPhase` (rewritten — existing export retained)
- `classifyCoaPhaseLegacy` (NEW)
- `mapToUniversalStream` (NEW)
- `normalizeCoaStatus` (NEW)
- `computeStallFromActivity` (NEW — was inline in old `classifyCoaPhase`; now hoisted)
- `isDeferredDecisionVariant` (NEW)
- Sets: `COA_REVIEW_STATUSES`, `COA_INTAKE_STATUSES`, `COA_TERMINAL_P20_STATUSES`, `COA_TERMINAL_P19_STATUSES`, `COA_APPROVED_STATUSES`, `COA_FINAL_AND_BINDING_STATUSES`, `COA_POST_DECISION_STATUSES`, `NORMALIZED_P19_DECISIONS`, `NORMALIZED_P20_DECISIONS`, `NORMALIZED_FINAL_AND_BINDING_DECISIONS`, `NORMALIZED_DEFERRED_DECISIONS`, `NORMALIZED_DECISION_TO_STATUS_MAP`
- Existing `NORMALIZED_APPROVED_DECISIONS` (mutated — adds 'conditional consent' + 'consent with conditions')

`src/lib/classification/lifecycle-phase.ts` mirrors the same export list with TypeScript types (`UniversalStreamRow`, `UniversalStreamSource`, `CoaClassifierResult`).

### Part 2 — `mapToUniversalStream` (`scripts/lib/lifecycle-phase.js`)

```js
/**
 * Map a CoA/permit row to its Universal Stream catalog position.
 *
 * @param {Map<string, UniversalStreamRow>} catalogByStatusSource
 *   Pre-built lookup: key=`${source}:${matchedStatus}`, value=catalog row.
 *   Built once by the calling pipeline script (E.2) at startup.
 *
 * @param {string|null} matchedStatus
 *   Canonical status string from classifyCoaPhase().matchedStatus or classifyLifecyclePhase output.
 *   When null/undefined → returns null (defensive).
 *
 * @param {'coa.status' | 'permits.status' | 'insp.stage'} source
 *   Catalog source enum (matches migration 128 CHECK exactly).
 *
 *   **Callsite invariant** (v4 fold #14 — DeepSeek v3 MEDIUM):
 *   - CoA-side callsites always pass `'coa.status'` (classifyCoaPhase emits CoA-side matchedStatus only).
 *   - Permit-side callsites (E.2 permit consumer) pass `'permits.status'`.
 *   - Inspection-stage callsites pass `'insp.stage'`.
 *
 * @returns {Readonly<UniversalStreamRow> | null}
 *   Returns null when:
 *   - matchedStatus is null/undefined
 *   - matchedStatus is unknown to the catalog (data drift)
 *   - **catalog row's `.phase` is non-standard** (v4 fold #5): not in {'P1','P2','P3','P4','P19','P20'}.
 *     E.g., seq 35 has `phase='UNMAPPED→null'` — returning that row would poison E.2's UPDATE.
 *     Treated as a miss; drives E.2 to emit `catalog_invalid_phase_count` audit metric.
 *
 * **Critical JSDoc warning** (v4 fold #4 — Independent v3 + Observability v3 convergent):
 *   The returned `.phase` field is the catalog's DESCRIPTIVE label and MAY contain
 *   multi-value strings like 'P7a/P7b/P7c (or P9-P17)' (seq 47) or '(NULL)' (terminal rows).
 *   It is NOT the canonical lifecycle_phase. E.2 MUST use `classifyCoaPhase().phase`
 *   (or `classifyLifecyclePhase().phase`) as the authoritative write target. The catalog
 *   `.phase` is for cross-reference and audit only.
 *
 * **Key-format note** (v4 fold #20 — Gemini v3 LOW): `${source}:${matchedStatus}` uses ':' as separator.
 *   No current CoA status contains ':'. Phase F may migrate to '' separator if needed.
 */
function mapToUniversalStream(catalogByStatusSource, matchedStatus, source) → UniversalStreamRow|null
```

**Post-lookup validation pseudocode:**

```js
const STANDARD_PHASES = new Set(['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','P11','P12','P13','P14','P15','P16','P17','P18','P19','P20']);
function mapToUniversalStream(catalogByStatusSource, matchedStatus, source) {
  if (matchedStatus == null) return null;
  const key = `${source}:${matchedStatus}`;
  const row = catalogByStatusSource.get(key);
  if (!row) return null;
  if (row.phase != null && !STANDARD_PHASES.has(row.phase)) {
    // Poisoned catalog row (e.g., seq 35 'UNMAPPED→null', seq 47 'P7a/P7b/P7c')
    return null;  // E.2 emits catalog_invalid_phase_count
  }
  return Object.freeze({...row});
}
```

**Null-handling contract for E.2:**
- `matchedStatus = null` (rule 9 catchall): function returns null → E.2 writes `lifecycle_phase = 'P1'` + `lifecycle_seq = NULL` + `unmapped_status_count` and/or `unmapped_decision_count` increment.
- `matchedStatus = string but not in catalog`: function returns null → E.2 writes phase from classifier + `lifecycle_seq = NULL` + `unmapped_status_count` increment.
- `matchedStatus = string but catalog row has non-standard .phase`: function returns null → E.2 writes phase from classifier + `lifecycle_seq = NULL` + `catalog_invalid_phase_count` increment (7th audit metric).

### Part 3 — TS twin EXTENSION (`src/lib/classification/lifecycle-phase.ts`)

**Already exists (673 lines).** Changes:

```ts
export interface CoaClassifierResult {
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P19' | 'P20' | null;
  stalled: boolean;
  matchedStatus: string | null;
  matchedRule: number;
  unmappedStatus: boolean;
  unmappedDecision: boolean;  // v4 fold #10
}

export type UniversalStreamSource = 'coa.status' | 'permits.status' | 'insp.stage';

export interface UniversalStreamRow {
  readonly seq:        number;
  readonly group:      string;
  readonly block:      string;
  readonly stage:      string;
  readonly phase:      string;        // descriptive — NOT a write target
  readonly bid_value:  number | null;
}
```

Mirror all sets + maps + helpers. Rewrite `classifyCoaPhase`. Add `classifyCoaPhaseLegacy`. Add `mapToUniversalStream`. `classifyLifecyclePhase` untouched.

### Part 4 — Spec amendments (14)

**1. `docs/specs/01-pipeline/42_chain_coa.md` §6.7 step 1** — replace 6-rule precedence with corrected 9-rule precedence.

**2. `docs/specs/01-pipeline/42_chain_coa.md` §6.7 step 2** — `mapToUniversalStream(catalogByStatusSource, matchedStatus, source)` signature + null-return contract + post-lookup phase validation note.

**3. `docs/specs/01-pipeline/42_chain_coa.md` §6.9 "Modified Existing Scripts" table — 4 row updates**:
- `scripts/lib/lifecycle-phase.js`: new signature for `mapToUniversalStream`; new exports; full export list per Part 1.
- `scripts/classify-lifecycle-phase.js` (E.2): consumer wiring; writes new columns `matched_status`/`matched_rule`/`unmapped_status`/`unmapped_decision` + `lifecycle_seq`.
- **NEW** `scripts/compute-trade-forecasts.js` (E.2 per v4 scope expansion #2): add `lead_id LIKE 'coa:%'` guard before `PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)` lookup. CoA rows skip the ISSUED calibration path until Phase F adds dedicated CoA cohorts.
- **NEW** `scripts/update-tracked-projects.js` (E.2 per v4 scope expansion #2): add `lead_id LIKE 'coa:%'` guard before `PHASE_ORDINAL[lifecycle_phase]` lookup. CoA rows use a separate ordinal map keyed on decision status, or skip ordinal comparison entirely.

**4. `docs/specs/01-pipeline/42_chain_coa.md` §6.7 catchall threshold** — strike `"≤ 5 WARN, ≤ 1 PASS"` → `[PLACEHOLDER — TBD E.2; preliminary unmapped_decision_count ≤ 3 from §2.5.b rows 52-54]`.

**5. `docs/specs/01-pipeline/42_chain_coa.md` §6.3** — `~147` figure → `~30,000+ CoAs reclassified on first E.2 run`.

**6. `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §2.5.f row 4** — Rule 0 **REMOVED 2026-05-14 in Phase E.1** + commit anchor.

**7. `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §2.5.c table** — "Current code maps to" column filled in with new phase per precedence.

**8. `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3 CoA-side phase emission rules table** — rewrite: P19 row, P20 row, corrected P2 trigger, corrected P1 trigger (no Prepare Notice), P3 row (approved + post-decision), P4 row (Final and Binding).

**9. `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3.1 narrative** — full rewrite for 9-rule precedence.

**10. `docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase E row — EXPANDED per v4 scope** — E.1 substrate delivered; E.2 scope now reads: "consumer wiring (`classify-lifecycle-phase.js`) + `coa_applications` migration adding `matched_status TEXT`, `matched_rule SMALLINT`, `unmapped_status BOOLEAN`, `unmapped_decision BOOLEAN` columns + `audit_table` contract (7 metrics) + `lead_id` guards in `compute-trade-forecasts.js` and `update-tracked-projects.js`."

**11. `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` 84-W12 bug entry** — resolution note: substrate in E.1; consumer wiring in E.2.

**12. `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` 84-W11 bug entry — REDUCED per v4 scope** — `lead_id` guards in `compute-trade-forecasts.js` + `update-tracked-projects.js` MOVED FROM Phase F INTO E.2 (per Gemini v3 CRIT 2 + user authorization). Phase F retains only: CoA UNION source extension in `compute-trade-forecasts.js`, per-seq cohort key in E.3 (now T3 only).

**13. `docs/specs/01-pipeline/42_chain_coa.md` §6.11 — E.2 prerequisites note** (NEW v4 scope deliverable):
- E.2 migration: `ALTER TABLE coa_applications ADD COLUMN matched_status TEXT, ADD COLUMN matched_rule SMALLINT, ADD COLUMN unmapped_status BOOLEAN NOT NULL DEFAULT false, ADD COLUMN unmapped_decision BOOLEAN NOT NULL DEFAULT false;` — UPDATE strategy: backfill via `classifyCoaPhase` row-by-row during E.2 first run.
- Persistence enables direct queries like `SELECT matched_status, COUNT(*) FROM coa_applications WHERE lifecycle_phase='P3' GROUP BY matched_status` — replaces audit-log archaeology.

**14. `.cursor/queued_task_phase_e2_consumer_wiring.md`** (NEW file — v4 fold #19 — created at E.1 commit) — locks the expanded E.2 scope: consumer wiring + migration + audit_table + `lead_id` guards. Replaces the original Phase F deferral planning artifact.

### Database Impact

**NO migrations in E.1.** E.1 is pure-function substrate. **E.2** ships the `coa_applications` migration per amendment 13 (v4 scope expansion #1). UPDATE strategy: row-by-row via classifier; first-run backfill ~30,000+ rows; transaction-batched per Spec 47 §R8.

### Audit Observability (Spec 48 observer)

**E.1 ships no audit_table rows.** **E.2 audit_table contract** (7 metrics — v4 fold #5 adds 7th):

1. `unmapped_status_count` — rule 9 + `unmappedStatus: true`
2. `unmapped_decision_count` — `unmappedDecision: true`
3. `rule_distribution: Map<int, int>` — fire count rules 1-9
4. `phase_distribution: Map<string, int>` — count per `lifecycle_phase` in {P1, P2, P3, P4, P19, P20}
5. `matchedStatus_distribution: Map<string, int>` — top-20 + `__other__`
6. `stalled_count: int`
7. `catalog_invalid_phase_count: int` — **NEW** — count of rows where `mapToUniversalStream` returned null due to non-standard catalog `.phase` (seq 35 poisoned-row class)

**E.1 → E.2 gap window** — eliminated under v4 Same-Sprint Mitigation Option 1 (same-commit ship); Option 2 contingency uses `classifyCoaPhaseLegacy` adapter.

**Expected coverage jump on E.2 ship**: 0.6% → ≥95% non-NULL on CoA `lifecycle_phase`. **~30,000+ CoAs reclassified**.

**First-E.2-run baseline mitigation** (v4 fold #18 — Observability v3 concern A clarification):
- Spec 48 Improvement C (`pipeline_baselines` pinned-baseline) is queued-not-authorized → **NOT available**.
- **Mandatory mitigation**: manual annotation of first E.2 run's observer report as `[expected first-classified-run batch — not a regression]` AND operator pre-ack in E.2 plan-lock.

### Transition Risk — REDUCED per v4 scope expansion

T1 (PRE_CONSTRUCTION_PHASES) and T2 (PHASE_ORDINAL) are **NOW IN E.2 SCOPE** per v4 fold #2. Only T3 remains as a transition risk:

**T3 — E.3 cohort-key `coa_type_class` dependency**: E.2 MUST JOIN `coa_applications.coa_type_class` + `project_type` when writing to `lifecycle_transitions`. Gate: confirm `coa_type_class IS NOT NULL` rate ≥ 95% before E.3 produces meaningful cohort segmentation. Phase D's `classify-coa-scope.js` already shipped the source data; this is a verification gate, not a blocker.

### Tests (`src/tests/lifecycle-phase.logic.test.ts` extension — ~170 cases)

1. **Bug 84-W12 regression matrix** — 22 statuses × 7 representative decisions = 154 cases.

2. **Decision-only matrix** — `status=null` × 7 decisions + 2 extras (`'closed'`, `'conditional consent'`) = 9 cases.

3. **Precedence tiebreaker tests** (7 cases):
   - `decision='Approved'` + `status='Hearing Scheduled'` → rule 5 → P3
   - `status='Final and Binding'` + `decision='Approved'` → rule 3 → P4
   - `status='Refused'` + `decision=NULL` → rule 2 → P19
   - `status='Closed'` + `decision='Approved'` → rule 1 → P20
   - `status='Appealed'` + `decision='Approved'` → rule 4 → P3
   - `status='Hearing Scheduled'` + `decision='Deferred'` → rule 6 → P2 + matchedStatus='Deferred'
   - **NEW v4**: `decision='deferred but approved'` → no rule (negative guard fires) → rule 9 catchall → P1 + unmappedDecision=true

4. **Normalization edge cases** (3 cases):
   - Whitespace status `'  Hearing Scheduled  '` → trimmed → rule 7 → P2
   - Empty status `''` → normalized to null → rule 9 → P1 + matchedStatus=null
   - Uppercase decision `'FINAL AND BINDING'` → normalized → rule 3 → P4

5. **Stall behavior** (5 cases):
   - Stall-in-catchall: `status='UNRECOGNIZED'` + daysSinceActivity=100 + stallThresholdDays=30 → P1 + stalled=true
   - Stall-forced-false: `status='Closed'` + daysSinceActivity=10000 → P20 + stalled=false
   - Stall-forced-false: `status='Approved'` + daysSinceActivity=10000 → P3 + stalled=false
   - Stall-forced-false: `status='Refused'` + daysSinceActivity=10000 → P19 + stalled=false
   - **NEW v4** (DeepSeek v3 MEDIUM null-safety): `daysSinceActivity=null` + `stallThresholdDays=30` → stalled=false (no crash)

6. **`mapToUniversalStream` lookup tests** (6 cases):
   - Direct hit returns frozen object
   - Miss returns null (no wildcard)
   - Null `matchedStatus` returns null
   - Frozen mutation throws
   - **NEW v4** (Observability v3 H1 + Independent v3 NEW-H3): poisoned catalog row — fixture catalog includes seq-35-equivalent with `phase='UNMAPPED→null'`; `mapToUniversalStream` returns null (treats as miss)
   - **NEW v4** (Observability v3 H1): multi-value catalog phase — fixture row with `phase='P7a/P7b/P7c'`; `mapToUniversalStream` returns null

7. **`NORMALIZED_DECISION_TO_STATUS_MAP` completeness test** (test #8 — convergent fold):
   - For every key in the union of `NORMALIZED_P19_DECISIONS ∪ NORMALIZED_P20_DECISIONS ∪ NORMALIZED_FINAL_AND_BINDING_DECISIONS ∪ NORMALIZED_APPROVED_DECISIONS ∪ NORMALIZED_DEFERRED_DECISIONS`, assert `NORMALIZED_DECISION_TO_STATUS_MAP.has(key)`.
   - For every value, assert it appears in the union of CoA-side status sets.
   - **NEW v4**: explicit test for typo variants (`'approved on condation'`, `'conitional approval'`) — each maps to a valid catalog status.

8. **JS↔TS parity** — fixture matrix runs identical through both.

9. **Two-flow regression** (3 cases — v4 expands per DeepSeek v3 MEDIUM):
   - `linked_permit_num='PERM12345'` + `status='Hearing Scheduled'` → P2 (NOT null)
   - `linked_permit_num=NULL` + `status='Hearing Scheduled'` → P2 (same)
   - **NEW v4**: `linked_permit_num='PERM12345'` + `status='Approved'` + `decision=null` → P3 (anti-Rule-0 regression; would have been null under buggy v1 code)

10. **Defensive input** (3 cases — v4 fold #16):
    - `input=null` → `{phase:null, matchedRule:0, ...}`
    - `input=undefined` → `{phase:null, matchedRule:0, ...}`
    - `input='garbage string'` → `{phase:null, matchedRule:0, ...}`

11. **Rule 6 hardcoded-fallback test** (NEW v4 — Observability v3 M1):
    - `decision='deferred aug 18, 2016 (orig mark kehler)'` + status=null → rule 6 → P2 + matchedStatus='Deferred' (hardcoded, even though the map has no entry for the full string)

**Total test surface:** ~170 cases.

## Standards Compliance

- **Try-Catch Boundary:** N/A — pure functions.
- **Unhappy Path Tests:** covered in Tests #4, #5, #6 (poisoned row), #10 (defensive input).
- **logError Mandate:** N/A.
- **UI Layout:** N/A.

## Spec 47 §R1-R12 Compliance

N/A for E.1 substrate; E.2 engages.

## Spec 84 §7 + Engineering Standards §7 Dual Code Path Safety

JS + TS twin parity; file headers reference `00_engineering_standards.md §7`. Parity test in tests #8.

## Pre-Review Self-Checklist (25 items — v4 expansion)

- (a) `classifyCoaPhase` reads BOTH normalized `input.status` AND `input.decision`
- (b) Rule 0 (linked_permit_num) REMOVED
- (c) 9-rule precedence top-down with reordering (rule 4 > rule 5; rule 6 > rule 7)
- (d) Status sets match §2.5.c 22 values
- (e) `NORMALIZED_FINAL_AND_BINDING_DECISIONS` is NEW set, NOT extracted
- (f) `NORMALIZED_DEFERRED_DECISIONS` + `isDeferredDecisionVariant` with extended negative guard (P19/P20/FaB/Approved sets all excluded)
- (g) Catchall rule 9 returns `matchedStatus: null` (NOT sentinel)
- (h) `mapToUniversalStream` signature `(catalogByStatusSource, matchedStatus, source)` matches Spec 42 §6.7 step 2 + §6.9 row
- (i) Catalog key `${source}:${matchedStatus}`; source literal matches migration 128 CHECK; no wildcard fallback
- (j) `mapToUniversalStream` null-return contract documented (3 cases); post-lookup phase validation prevents poisoned rows
- (k) TS twin EXTEND (673 lines, not CREATE)
- (l) `CoaClassifierResult` widened: 6 fields (added `matchedStatus`, `matchedRule`, `unmappedStatus`, `unmappedDecision`; widened `phase` to P1-P4/P19/P20/null)
- (m) `matchedStatus` in return (E.2 dual-ledger writes)
- (n) `NORMALIZED_P19_DECISIONS` vs `NORMALIZED_P20_DECISIONS` split (`'closed'` → P20)
- (o) `NORMALIZED_DECISION_TO_STATUS_MAP` **explicitly enumerates all 18 keys** (16 existing + 2 new); test #8 asserts completeness
- (p) `'conditional consent'` + `'consent with conditions'` added to `NORMALIZED_APPROVED_DECISIONS` + map
- (q) `normalizeCoaStatus` helper (trim + empty→null) at entry
- (r) Stall: `false` for non-P1/P2; computed for catchall P1; `computeStallFromActivity` defined inline with null-safe guards
- (s) `classifyCoaPhaseLegacy` adapter exported (preserves OLD SHAPE, not OLD BEHAVIOR); same-sprint mitigation Option 1 or Option 2 active
- (t) Tests cover ~170 cases incl. poisoned catalog row + Rule 6 hardcoded fallback + linked_permit+Approved two-flow + null-safety stall + defensive input
- (u) **14 spec amendments** complete (per Part 4)
- (v) Transition Risk: T1+T2 in E.2 scope (not Phase F); T3 only remaining
- (w) **NEW v4**: `unmappedStatus`/`unmappedDecision` separate booleans; both fire independently
- (x) **NEW v4**: `module.exports` list explicit (all sets + helpers + functions named)
- (y) **NEW v4**: `.cursor/queued_task_phase_e2_consumer_wiring.md` will be created at E.1 commit to lock expanded E.2 scope

## Execution Plan (per WF1 in `.claude/workflows.md`)

- [ ] **Contract Definition:** Update `CoaClassifierResult` type in TS twin first (typecheck blocker).
- [ ] **Spec & Registry Sync:** Apply the 14 spec amendments. Create `.cursor/queued_task_phase_e2_consumer_wiring.md`. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A in E.1 (migration ships in E.2 per amendment 13).
- [ ] **Test Scaffolding:** Extend `src/tests/lifecycle-phase.logic.test.ts` with the ~170-case surface. All new tests fail; existing tests asserting old P2-for-approved updated.
- [ ] **Red Light:** New tests fail; typecheck passes.
- [ ] **Implementation:**
  - Extend `scripts/lib/lifecycle-phase.js`: `normalizeCoaStatus`, `computeStallFromActivity`, new sets (P19/P20 split, decision-to-status map with 18 explicit entries, FaB, deferred), rewritten `classifyCoaPhase`, `classifyCoaPhaseLegacy`, `mapToUniversalStream` with post-lookup phase validation (~220 lines added).
  - EXTEND `src/lib/classification/lifecycle-phase.ts`: widen `CoaClassifierResult`, add `UniversalStreamSource` type, mirror sets, rewrite `classifyCoaPhase`, add adapter, add `mapToUniversalStream` + `UniversalStreamRow` (~240 lines changed).
  - **Same-sprint guarantee**: `scripts/classify-lifecycle-phase.js` consumer switched to `classifyCoaPhaseLegacy` (one-line change in E.1 commit) per Option 2 contingency UNLESS E.1+E.2 ship together (Option 1 target).
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist (25 items):** PASS/FAIL per item against diff.
- [ ] **Multi-Agent Review (4 reviewers parallel — diff stage):**
  - Gemini, DeepSeek, Independent worktree (Spec 84 §3 + §2.5.c verification + decision-to-status map completeness), Observability worktree (Spec 48 lens + audit_table contract verification + post-lookup phase validation).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npx tsc --noEmit -p tsconfig.json`.
- [ ] **WF6 commit:** Single commit. Message: `feat(84_lifecycle_phase_engine): WF1 Phase E.1 — bug 84-W12 fix + mapToUniversalStream + TS twin extension + 14 spec amendments + same-sprint legacy adapter`.
- [ ] **Followups append:** `docs/reports/review_followups.md`.

## Plan-Review Triage Log

### v1 → v2 (30 findings, 7 CRITICAL — all folded; see git history)
### v2 → v3 (28 findings, 7 new convergent CRITICAL — all folded; see git history)
### v3 → v4 (18 findings, 0 new CRITICAL, 3 convergent HIGH + 2 user-authorized E.2 scope CRITs)

See "v3 → v4 Revision Summary" table at top of this file for the consolidated fold table.

---

## Appendix A — Spec 84 §2.5.c CoA Status Table (22 values, DeepSeek v3 HIGH fold #9)

The 22 canonical CKAN CoA status values, expected phase and rule per the v4 precedence:

| Row | status | Expected phase | Expected rule | Catalog seq |
|-----|--------|---------------|---------------|-------------|
| 70 | Application Received | P1 | 8 | 1 |
| 71 | Accepted | P1 | 8 | 2 |
| 72 | Prepare Notice | P2 | 7 | 3 |
| 73 | Notice Prepared | P2 | 7 | 4 |
| 74 | Tentatively Scheduled | P2 | 7 | 5 |
| 75 | Hearing Scheduled | P2 | 7 | 6 |
| 76 | Hearing Rescheduled | P2 | 7 | 7 |
| 77 | Postponed | P2 | 7 | 8 |
| 78 | Deferred | P2 | 7 | 9 |
| 79 | Conditional Consent | P3 | 5 | 10 |
| 80 | Approved | P3 | 5 | 11 |
| 81 | Approved with Conditions | P3 | 5 | 12 |
| 82 | Refused | P19 | 2 | 13 |
| 83 | Final and Binding | P4 | 3 | 14 |
| 84 | Await Expiry Date | P3 | 4 | 15 |
| 85 | Appealed | P3 | 4 | 16 |
| 86 | TLAB Appeal | P3 | 4 | 17 |
| 87 | OMB Appeal | P3 | 4 | 18 |
| 88 | Application Withdrawn | P19 | 2 | 19 |
| 89 | Cancelled | P19 | 2 | 20 |
| 90 | Closed | P20 | 1 | 21 |
| 91 | Complete | P20 | 1 | 22 |

Regression-test assertion (DeepSeek v3 fold): for every row, `classifyCoaPhase({status: row.status, decision: null}).matchedRule !== 9`. The catchall must never fire for any of the 22 known statuses when decision is null.

---

> **PLAN LOCKED (v4)** — 4-reviewer plan-review v1 + v2 + v3 complete; 76 findings folded across 3 rounds; 3 strategic re-framings applied; 2 E.2 scope expansions user-authorized; 0 new CRITICAL plan-blockers in v3.
>
> Do you authorize this revised WF1 Phase E.1 plan? (y/n)
>
> §10 note: E.2 scope expanded per Gemini v3 CRITs (user-authorized) — `coa_applications` columns migration + downstream `lead_id` guards now in E.2 (NOT Phase F). T1+T2 transition risks resolved at E.2 ship.
>
> DO NOT generate code. DO NOT modify scripts. TERMINATE RESPONSE until authorization.
