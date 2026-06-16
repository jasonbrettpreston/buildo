# Design Brief — Pipeline Transparency: Step-Output Inspector + Vocabulary Observability

**Status:** DRAFT for direction (pre-spec). The systemic fix behind "how was the 22/38 trade gap never caught."
**Governing specs:** 30 (pipeline observability — EXTEND), 76 (lead-feed tooling/inspector — GENERALIZE), 26 (admin dashboard — HOST), 35 (admin state architecture — COMPLY), 86 (control panel — tunable contracts), 34 (admin testing — COVER).

## 1. The problem (grounded)
The classifier emits **22 of 38 defined trades** (coa 19/38); the missing 16 produce zero leads, zero forecasts, zero cost-allocation — and **every observability layer reported green**:
- **Step audit** (`classify-permits`): `classification_coverage >= 95%` PASS — measures *% of permits that got ≥1 trade* (**entity axis**), blind to *which trades are emitted* (**vocabulary axis**).
- **`emitMeta` "fields written" table:** confirms `permit_trades.trade_id` is written — field-presence, not value-coverage.
- **`assert-global-coverage` (data-profile completeness):** profiles **field NULL-rates**; a never-emitted trade has no row to be null → structurally invisible.
- **Spec 30 §3 telemetry primitives** are `sys_`/`err_`/`dq_`(null-rate) only — **no primitive can express "value-distribution vs defined vocabulary."**
- **No per-step output contract** declares "must span the taxonomy," so nothing asserts it.
- **No table/step-axis data view** — you can't browse `permit_trades` to *see* "only 22 distinct trades."

**Root cause:** we observe **activity + field-presence + null-rates**, never **value/vocabulary-coverage**, and there's no window onto the actual rows a step produces. So a step can PASS every gate and silently emit a fraction of its intended output. (Same blindness hides `permit_products` = 0/16, and would hide the next gap.)

## 2. What already exists — do NOT rebuild
- **Spec 76 §3.5 Lead Detail Inspector** (`/admin/lead-feed/inspector`, `LeadDetailInspector.tsx`, `lead-inspect-query.ts`, `/api/admin/leads/inspect/:id`): surfaces ~70 fields in 8 panels **grouped by chain step** — every field every step produces, for ONE lead. Built precisely to "spot over-classification without dropping to psql." **This is the entity axis, already done.**
- **`telemetry_tables` in `manifest.json`:** 53/63 steps already declare their **main output table** — the per-step hook for the missing axis is already there.
- **Spec 30 §3 telemetry SDK** (`emitSummary` auto-metrics + opt-in `telemetry_context` + `telemetry_null_cols`): the place to ADD the new coverage primitive.
- **Admin surfaces:** `DataQualityDashboard`, `FreshnessTimeline`/`funnel`, `/admin/data-quality`, `/admin/app-health` — hosts to extend (Spec 26 §3.1 Pipeline Dashboard).
- **`test-feed-utils.ts`** (Spec 76 §2.2) + Spec 35 admin state architecture (B1 server→TanStack reads) — the plumbing pattern to reuse.

## 3. The fix — TWO complementary additions (one axis + one primitive)
### A. Step-Output Inspector — the table/step axis (the headline; "skip through the main table, see the actual")
A **generic** per-step view: pick a step → read its `telemetry_tables` (main output table) → **browse the actual rows**, every field shown + **labeled** ("know what we are looking at"), paginate/"skip through," with a **basic filter/query** to spot-check. Reuses the Spec 76 inspector field-rendering + `test-feed-utils` + Spec 35 B1 reads.
- **Generic across all steps** via `telemetry_tables` — no per-step bespoke UI. (Asserts/Observers with no main table simply show their audit rows.)
- **Lead with actual rows, not bands** (your point: "bands aren't that great — see the actual"). Distributions/contracts are secondary chips, not the main view.
- **Wire-in:** clicking a step in `FreshnessTimeline`/Pipeline Dashboard (Spec 26) → "Inspect output" → the row browser for that step's table.
- **Read-only, admin-only** (`verifyAdminAuth`, Spec 33 §5); parameterized/whitelisted columns (no arbitrary SQL) — a curated browse, not a SQL console.

### B. Vocabulary/Value-Coverage telemetry — the catch (a new Spec 30 §3 primitive)
Extend the telemetry SDK with a primitive **parallel to `dq_` null-rate**: for declared taxonomy/enum columns, report **distinct values present vs the defining vocabulary** — e.g. `cov_trade_vocab: 22/38 (58%)` → **WARN/FAIL** under a contract threshold. This is the single check that would have caught the gap on day one, and it **generalizes** (products 0/16, scope-tags, lifecycle phases, decisions). Surfaced in the audit + the admin, and visible in the Step-Output Inspector as a "values present vs defined" chip.

### C. Step output contracts ("steps are specs" — light)
Each step declares (manifest or a step-spec stub) its **main table + the columns whose values should span a known vocabulary + expected count/range bands**. The Inspector and the coverage primitive check **actual vs declared** and surface the delta ("expected the trade vocabulary; 16 trades never emitted"). This is the missing "what should this step achieve" layer.

## 4. Principle (your steer)
**Primary = see the actual rows** (Inspector). **Secondary = a coverage gate** that makes silent-drop *impossible to stay green*. Thresholds/bands are a backstop, never the main lens. The combination is what makes "what's supposed to happen, and is it?" answerable at a glance.

## 5. Why this is the foundational fix
It closes the whole *class* of bug, not the trade symptom: any step that silently under-produces (dormant products, a broken vocab mapping, a future taxonomy addition) becomes **visible (Inspector)** and **un-green-able (coverage gate)**. The trade-vocab WF1 becomes the **proof-of-concept**: implemented under a step contract + coverage primitive, so the 22/38 gap is provably surfaced.

## 6. Governing-spec impact
| Spec | Role | Change |
|---|---|---|
| 30 §3 | observability model | ADD the vocabulary/value-coverage primitive (parallel to `dq_`); document the manifest `telemetry_vocab_cols` (or similar) hook |
| 76 | lead-feed tooling | GENERALIZE the inspector field-rendering into a step/table-axis browser (new `/admin/...` route + read-only API) |
| 26 §3.1 | admin Pipeline Dashboard | HOST: per-step "Inspect output" entry from FreshnessTimeline/funnel |
| 35 | admin state architecture | COMPLY: B1 server→TanStack reads; selector hygiene; no new client SQL |
| 86 | control panel | the per-step coverage thresholds/contracts are operator-tunable config |
| 34 | admin testing | E2E + unit boundaries for the new views/endpoint |

## 7. Phasing
- **Phase 0 — this brief → a Transparency spec** (likely a new spec; or fold into 26/30/76). Settle the contract model + the coverage primitive shape.
- **Phase 1 — Coverage primitive** ✅ DONE (2026-06-16, WF1). `cov_*` SDK primitive in `emitSummary` (Spec 30 §3.2/§3.3.1, 48 §4.3/§4.4) + `pipeline.computeVocabCoverage` + shared `scripts/lib/vocab-coverage.js` + manifest `telemetry_vocab_cols` (Spec 40) wired into `classify_permits` + `classify_coa_trades`. Includes escalate-only verdict recompute so `cov_*`/`dq_`/`err_` FAILs are verdict-driving. The prior global-profiler check (`assert-global-coverage.js`, commit `596d309`) now delegates to the same lib.
- **Phase 2 — Step-Output Inspector** (generic `telemetry_tables`-driven row browser + read-only API + Pipeline-Dashboard wire-in).
- **Phase 3 — Step output contracts** rolled across all steps (expected-vs-actual everywhere); the trade-vocab fix lands under it.
