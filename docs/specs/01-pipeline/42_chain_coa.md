# Chain: Committee of Adjustment (CoA)

<requirements>
## 1. Goal & User Story
As a lead generator, I want Committee of Adjustment variance hearings imported, linked to permits, and analyzed for pre-construction leads — so I can uncover project opportunities months before building permits are issued.
</requirements>

---

<architecture>
## 2. Chain Definition

> **Note (2026-05-13):** §2–§5 below describe the **current state** of the CoA chain (12 steps, PRE-permit placeholder, no scope/trade/cost classification on CoAs). The **target state** is defined in §6 Implementation Plan and ships in the WF2 #coa-pipeline-parity work — a ~22-step chain mirroring the permits pipeline with `lead_id`-keyed unified tables and granular Universal Stream lifecycle emission. Until that WF ships, the chain runs as documented in §2–§5.

**Trigger:** `node scripts/run-chain.js coa` or `POST /api/admin/pipelines/chain_coa`
**Schedule:** Daily
**Steps:** 12 (current state — sequential, stop-on-failure). Target after §6: ~22 steps.
**Gate:** `coa` — if `records_new = 0`, downstream enrichment steps are skipped

```
assert_schema → coa → assert_coa_freshness → link_coa →
create_pre_permits → assert_pre_permit_aging → refresh_snapshot →
assert_data_bounds → assert_engine_health → classify_lifecycle_phase →
assert_lifecycle_phase_distribution → assert_global_coverage
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `assert_schema` | `quality/assert-schema.js` | Validate CKAN metadata for CoA resources | pipeline_runs |
| 2 | `coa` | `load-coa.js` | Ingest CoA applications from CKAN (active + closed resources) | coa_applications |
| 3 | `assert_coa_freshness` | `quality/assert-coa-freshness.js` | Verify last CoA record is within 45-day threshold | — |
| 4 | `link_coa` | `link-coa.js` | Address matching via `street_name_normalized` columns + confidence matrix (ward as booster) | coa_applications |
| 5 | `create_pre_permits` | `create-pre-permits.js` | Generate pre-permit leads from approved unlinked CoA applications | — |
| 6 | `assert_pre_permit_aging` | `quality/assert-pre-permit-aging.js` | Warn on expired pre-permits (approved+unlinked >18 months) | — |
| 7 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics snapshot | data_quality_snapshots |
| 8 | `assert_data_bounds` | `quality/assert-data-bounds.js` | CoA-scoped: row counts, null rates, linkage integrity | pipeline_runs |
| 9 | `assert_engine_health` | `quality/assert-engine-health.js` | CoA table engine health | engine_health_snapshots |
| 10 | `classify_lifecycle_phase` | `classify-lifecycle-phase.js` | Runs the lifecycle classifier synchronously to pick up any permits whose `last_seen_at` was bumped by `link_coa` in step 4. Same advisory-locked single-threaded script the permits chain uses. | permits, coa_applications |
| 11 | `assert_lifecycle_phase_distribution` | `quality/assert-lifecycle-phase-distribution.js` | Tier 3 CQA: validates phase distribution bands after the classifier runs. Uses advisory lock 109 — skips gracefully if classifier from a concurrent permits chain is still writing. Throws on failure (halting). | pipeline_runs |
| 12 | `assert_global_coverage` | `quality/assert-global-coverage.js` | Tier 3 CQA: field-level coverage profile scoped to CoA tables and linked data. Thresholds from logic_variables. Non-halting (observational). Uses advisory lock 111. | pipeline_runs |

**Trailing lifecycle classifier (step 10)** is the only path that routes
CoA linking results into the classifier, because `link-coa.js` bumps
`permits.last_seen_at` on newly-linked permits and the classifier reads
`last_seen_at > lifecycle_classified_at` to find dirty rows. Without this
step, a CoA that becomes linked would never update its host permit's
`lifecycle_phase` until the next full permits-chain run. If the permits
chain fires immediately before or after the CoA chain, the classifier's
advisory lock (ID 84) single-threads the two invocations — the second
one exits cleanly with `skipped:true`. The phase distribution gate (step 11) uses its own
advisory lock (ID 109), so concurrent chain runs cannot produce duplicate assert checks. See
`docs/reports/lifecycle_phase_implementation.md` for the full rationale.

**SKIP_PHASES exclusion in bump:** `link-coa.js` does NOT bump `last_seen_at` for permits
in SKIP_PHASES (`P19`/`P20` terminal, `O1`–`O3` orphan, `P1`/`P2` CoA pre-permit).
These phases are phase-stable and won't be processed by `compute-trade-forecasts.js` regardless.
Bumping them conflates `last_seen_at`'s "last seen in Open Data feed" semantic with
"CoA linkage changed," causing false positives in `assert-entity-tracing`'s 26h window.
Permits with `lifecycle_phase IS NULL` (unclassified) are still bumped. SKIP_PHASES permits
with new CoA linkage are reclassified on the next daily permits chain run (≤24h delay).
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- CKAN API: `ckan0.cf.opendata.inter.prod-toronto.ca`
  - Active resource: `51fd09cd...` (open applications)
  - Closed resource: `9c97254e...` (closed since 2017)
- Incremental mode (default): last 90 days via CKAN SQL endpoint
- Full mode (`--full`): all records from both resources

### Core Logic
1. **Schema validation** — checks CKAN metadata for expected CoA columns
2. **CoA ingestion** — fetches applications, maps CKAN fields:
   - `REFERENCE_FILE#` → `application_number`
   - `C_OF_A_DESCISION` → `decision` (typo is in CKAN source)
   - `WARD_NUMBER` (closed) / `WARD` (active) → `ward`
   - Address composed from: `STREET_NUM + STREET_NAME + STREET_TYPE + STREET_DIRECTION`
3. **Freshness check** — if last CoA record is >45 days old, WARN (source may be stale)
4. **Address linking** — uses pre-computed `street_name_normalized` columns (populated at ingestion by `scripts/lib/address.js`). Ward is a confidence **booster**, not a gatekeeper (80% of permits lack ward data):
   - Pre-pass: unlinks cross-ward mismatches from prior runs
   - Tier 1a: `street_num + street_name_normalized` + ward match → 0.95
   - Tier 1b: `street_num + street_name_normalized` + permit ward NULL → 0.85
   - Tier 1c: `street_num + street_name_normalized` + ward conflict → 0.10 (flagged)
   - Tier 2a: `street_name_normalized` only + ward match → 0.60
   - Tier 2b: `street_name_normalized` only + permit ward NULL → 0.50
   - Tier 3: Description full-text search → 0.10-0.50 (ward as tiebreaker)
   - Audit: `effective_match_rate_pct` measures `high_confidence_linked / (high_confidence_linked + potential_matches)` where `high_confidence_linked` = Tiers 1a/1b/2a/2b only (0.50-0.95 confidence range), and `potential_matches` = unlinked CoAs with a real (non-Pre-Permit) permit at their exact address. Tier 1c (ward conflict, 0.10) and Tier 3 (description FTS, 0.10-0.50) are EXCLUDED from the numerator for consistency — both contain low-confidence matches. Tier 3 successes are tracked separately as INFO. Thresholds: `< 50%` = FAIL, `< 80%` = WARN, else PASS. When `potential_matches = 0` the verdict is PASS (steady state — nothing to link). The legacy `match_rate_pct` is preserved as INFO only.
5. **Pre-permit generation** — approved CoA applications without linked permits become speculative leads. **(Retired in §6 — see Phase G.)**
6. **Aging check** — approved+unlinked applications older than 18 months flagged as expired (WARN)
7. **Quality assertions** — CoA-scoped data bounds and engine health

### Outputs
- `coa_applications` table: 32,625+ records with `linked_permit_num`, `linked_confidence`
- Pre-permit pool: ~408 upcoming leads (approved, unlinked, within 18 months)
- Dashboard snapshot updated

### Edge Cases
- CKAN `WARD_NUMBER` vs `WARD` column mismatch between active/closed resources → handled by field mapper
- CoA `C_OF_A_DESCISION` typo in source → mapped as-is, not corrected
- "ST CLAIR" false stripping: `normalizeStreetName('ST CLAIR AVE')` → `'CLAIR'` (strips "ST" as street type). Both CoA and permit sides produce same result, so matching works despite semantic loss
- 0 new CoA records → gate-skip enrichment steps, quality steps still run
- Freshness >45 days → WARN but does not halt chain
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `coa.logic.test.ts` (linker tiers, confidence thresholds, address normalization)
- **Logic:** `chain.logic.test.ts` (coa chain definition, step count, assert_lifecycle_phase_distribution wired as step 11)
- **Infra:** `quality.infra.test.ts` (assert-coa-freshness exists, assert-pre-permit-aging exists)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/manifest.json` (coa chain array)
- `scripts/lib/address.js` (shared street name normalizer)
- `scripts/load-coa.js`, `scripts/link-coa.js`, `scripts/create-pre-permits.js`
- `migrations/061_street_name_normalized.sql`
- `scripts/quality/assert-coa-freshness.js`, `scripts/quality/assert-pre-permit-aging.js`

### Out-of-Scope Files
- `src/lib/coa/linker.ts` — TypeScript API path (governed by CoA linking step spec)
- `src/app/coa/page.tsx` — UI rendering

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Relies on:** `chain_permits.md` (permits must be loaded first for linking)
- **Shared steps (current state):** `link_coa`, `create_pre_permits`, `refresh_snapshot` also appear in `chain_permits.md`. `create_pre_permits` is retired in §6 Phase G; the other two remain shared after the WF.
</constraints>

---

<implementation>

## 6. Implementation Plan — CoA Pipeline Parity with Permits

### 6.1 Objectives

1. **Make CoA-stage leads first-class.** Eliminate the `PRE-permit` placeholder hack. CoA leads are identified by `application_number` and own their classification state on `coa_applications` (not on a synthetic row in `permits`). All hot-path tables rekey on `lead_id` (Option C — `'permit:<num>:<rev>'` or `'coa:<application_number>'`) so a single query path serves both entity types.
2. **Bring CoA classification to parity with permits**, within the constraint that CoA filings carry less structured data than permit applications (free-text `description` only, no `work` field, no applicant-declared cost, no `permit_type`). Pipeline mirrors permits-chain step-for-step: parcels → buildings → scope → trades → cost, all writing to unified `lead_*` tables.
3. **Ship the granular Universal Stream lifecycle model end-to-end.** The lifecycle classifier emits the new granular columns (`lifecycle_seq` 1–110, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value` 0–1) on every classified `permits` and `coa_applications` row, alongside the legacy P-code. A new `universal_stream_catalog` reference table is seeded from Spec 84 §2.5.h.2 as the canonical source of group/block/stage labels, colors, icons, and per-row Bid Value. A new `universal_stream_trade_signals` join table encodes the 152 per-trade × per-row signal columns from §2.5.h.2 (Bid / Work / Fallback / Bid:Last Minute) so the forecast engine can query row-level routing instead of using hardcoded P-code ordinals. The `lifecycle_transitions` ledger replaces `permit_phase_transitions` with universal `lead_id` keying and adds `from_seq` / `to_seq` columns populated on every detected transition.
4. **Resolve the prediction-engine cohort blind spot** documented in `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §8.7. Cohort key on `phase_stay_calibration` extends from `(permit_type, from_phase)` to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. Phase distribution bands in `logic_variables` recalibrated against the post-fix data.
5. **Close bug 84-W12** (99.4% of `coa_applications.lifecycle_phase` is NULL). `classifyCoaPhase()` is wired to read `coa_applications.status` and emit P2/P3/P4 per the rules in §6.7. Distribution gate green post-recalibration.
6. **Make the lifecycle catalog renderable end-to-end.** Group/Block/Stage colors and icons (from Spec 84 §2.5.h.2's Color & Icon Strategy) live in `universal_stream_catalog` as the schema source of truth, so the admin Lead Inspector, mobile FlightCard, and any future timeline UI query through `lifecycle_seq` to render correctly without hard-coded maps.
7. **Preserve the CoA→Permit handoff without data loss.** When a permit links to a prior CoA, both rows persist; no destroy-and-rebuild like the current PRE-permit ghost-reconciliation flow. Permit takes priority for downstream consumers (cost, forecast, score) once linked; CoA classification stays as historical record on `coa_applications`.

### 6.2 Background — How Things Work Now and the Problem We Are Solving

**Today's CoA chain (12 steps) classifies almost nothing.** `load-coa.js` ingests, `link-coa.js` back-links to existing permits, `create-pre-permits.js` inserts synthetic placeholder rows into the `permits` table for approved-but-unlinked CoAs, and `classify-lifecycle-phase.js` assigns a phase code that is NULL for 99.4% of rows (bug 84-W12). Nothing tags scope, classifies trades, or estimates cost on the CoA side.

**The PRE-permit placeholder is the only path by which CoA-stage leads reach the downstream pipeline.** `scripts/create-pre-permits.js:79-95` INSERTs a row into `permits` with `permit_num='PRE-' || application_number`, `permit_type='Pre-Permit'` (a literal string, not a real CKAN type), `status='Forecasted'` (also fictional), and copies `description`, `ward`, `street_num`, `street_name`, `application_date` (= CoA `decision_date`) from `coa_applications`. The downstream classifiers (`classify-permits.js`, `classify-scope.js`, `compute-cost-estimates.js`) do NOT filter out these rows — they run on PRE-permits with degraded inputs because the trade matrix (`trade_mapping_rules`) keys on `permit_type` and `work` fields that PRE-permits don't really have, and `cost_estimates` joins on `permit_type_classifications` which has no row for `'Pre-Permit'`.

**Worse, all of this work is thrown away at handoff.** `scripts/create-pre-permits.js:119-143` ("Ghost Reconciliation" step) detects when a CoA gets a real permit linked (`linked_permit_num IS NOT NULL`) and runs `DELETE FROM permits WHERE permit_type='Pre-Permit' AND ...` along with cascading deletes on `permit_trades` and `permit_parcels`. Whatever classification, trade tagging, cost estimate, or lifecycle history was attached to the PRE- row is **hard-deleted**. The real permit then re-classifies from scratch.

**Consequences for the prediction engine:** `scripts/compute-trade-forecasts.js` uses `phase_stay_calibration` keyed on `(permit_type, from_phase)`. For CoA-stage rows the `permit_type` is either NULL (CoA itself) or `'Pre-Permit'` (the placeholder). Either way the cohort lookup falls through to `__ALL__` defaults. The median 1,078-day CoA-decision-to-permit-filing lag is invisible to the engine, so every CoA-stage forecast either over-predicts (using post-issuance medians) or expires immediately. Realtor leads — the only trade for which CoA-stage signal is most relevant — are essentially blind during their highest-value window.

**Front-end consequences:** `src/lib/leads/lead-detail-query.ts:74` reads `p.description AS work_description` from the `permits` table exclusively. For the duration of the PRE-permit's existence, the front-end shows the CoA description. The moment the real permit lands and the PRE- row is deleted, the description silently switches to whatever wording the applicant put on the permit form — which is often substantively different. The operator loses the CoA context that justified the original lead.

**The problem in one sentence.** CoA-stage leads carry valuable, time-advantaged signal (months to years before any permit is filed), but they currently flow through a placeholder-rewriting mechanism that destroys data at handoff and bypasses every classifier in the pipeline. This work makes CoA a first-class lead identity with its own classification chain that mirrors the permits chain, retires the placeholder mechanism, and produces durable classification state that survives the eventual link to a real permit.

### 6.3 Success Criteria (Measurable)

After this work ships, these gates must hold on a steady-state daily run:

| Metric | Today | Target | Verification |
|---|---|---|---|
| `coa_applications.lifecycle_phase IS NOT NULL` | 0.6% | ≥ 95% of active CoAs (decision not `withdrawn`/`closed`) | `assert-lifecycle-phase-distribution.js` extension |
| `coa_applications.scope_tags IS NOT NULL` | 0% | ≥ 80% of active CoAs | `assert-global-coverage.js` extension |
| `coa_applications.coa_type_class IS NOT NULL` | 0% | ≥ 95% | same |
| `coa_applications.project_type IS NOT NULL` | 0% | ≥ 90% | same |
| `coa_applications.structure_type IS NOT NULL` | 0% | ≥ 80% (limited by parcel-match success) | same |
| `coa_applications.estimated_cost IS NOT NULL` | 0% | ≥ 80% of active CoAs | same |
| `lead_parcels` rows for CoA leads / active CoAs | 0% | ≥ 75% (parcel-match confidence ≥ 0.50) | new metric in parcel-linker audit_table |
| `lead_trades` rows for CoA leads / active CoAs | 0% | ≥ 90% (≥ 1 trade tagged per CoA, may include default fallback) | new metric, filtered to `lead_id LIKE 'coa:%'` |
| `trade_forecasts` rows for CoA-stage leads (`lead_id LIKE 'coa:%'`) | 0 | ≥ 80% of active CoAs × active trade | extension to `compute-trade-forecasts.js` audit_table |
| `tracked_projects WHERE lead_id LIKE 'coa:%'` writable & alertable | partial | full CRM coverage | extension to `update-tracked-projects.js` |
| `coa_applications.lifecycle_seq IS NOT NULL` (granular alignment) | 0% | ≥ 95% of active CoAs — classifier writes Universal Stream row references | `assert-lifecycle-phase-distribution.js` extension |
| `permits.lifecycle_seq IS NOT NULL` (granular alignment) | 0% | ≥ 95% of active permits | same |
| `coa_applications.lifecycle_phase IS NOT NULL` (bug 84-W12 fix) | 0.6% | ≥ 95% of active CoAs | same |
| Phase distribution bands match production-shape data | unchanged | recalibrated post-fix; gate green | `assert-lifecycle-phase-distribution.js` |
| All hot-path tables carry `lead_id` column | NO | YES (cost_estimates, trade_forecasts, lead_trades, lead_parcels, tracked_projects, lifecycle_transitions) | schema-parity test |
| `permits WHERE permit_type='Pre-Permit'` count | ~408 | 0 | `assert-data-bounds.js` post-retirement gate |
| Permit linked to prior CoA preserves both records | NO (PRE- deleted) | YES (no row deletion at link time) | regression test |
| Bug 84-W12 NULL rate on CoA lifecycle_phase | 99.4% | < 5% | `assert-lifecycle-phase-distribution.js` |

### 6.4 Test Strategy

Three layers, each with its own SPEC LINK header per Spec 47 §R12:

**Logic tests (`*.logic.test.ts`):**
- `classify-coa.logic.test.ts` — description-keyword classifier produces correct `(coa_type_class, project_type, scope_tags)` for canonical inputs (residential addition / commercial alteration / severance / etc.)
- `classify-coa-trades.logic.test.ts` — `trade_mapping_rules` tier-3 filter produces correct `lead_trades` rows (lead_id = `'coa:' || application_number`) for known descriptions; default fallback fires when no rule matches; realtor inclusion gate (`shouldAppendRealtor` adapted for CoA features) fires for residential CoAs only
- `link-coa-to-parcels.logic.test.ts` — address-normalization cascade matches the permit-side tiers (1a/1b/2a/2b/3); confidence floors and ward-booster logic identical
- `compute-coa-cost-estimates.logic.test.ts` — geometric path produces non-null cost when `modeled_gfa_sqm` is non-null and `scope_tags` has at least one rateable tag; falls through to NULL otherwise (no Liar's-Gate equivalent)

**Integration tests (`*.infra.test.ts`):**
- `chain-coa.infra.test.ts` — full chain runs end-to-end with seeded CoA + matching permit; CoA classification persists in unified `lead_trades` + `lead_parcels` + `coa_applications` columns; PRE-permit table row count = 0; CoA lifecycle_phase + lifecycle_seq populated by classifier; CoA-stage trade_forecasts rows produced
- `coa-handoff.infra.test.ts` — simulate CoA linkage to a permit mid-pipeline; assert both `coa_applications` row and the new `permits` row retain their own classification fields; `permits.linked_coa_application_number` populated; both rows reachable via their respective `lead_id` (`'coa:<application_number>'` vs `'permit:<num>:<rev>'`); no row deletions
- `lead-id-migration.infra.test.ts` — seed permits with existing `permit_num`/`revision_num`; run migration; assert every row in `cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics`, `lifecycle_transitions` has a non-null `lead_id` matching the derivation rule
- `granular-lifecycle.infra.test.ts` — assert classifier writes `lifecycle_seq` / `lifecycle_group` / `lifecycle_block` / `lifecycle_stage` / `bid_value` on `permits` and `coa_applications` derived from `universal_stream_catalog`; assert `lifecycle_transitions.from_seq` / `to_seq` populated on every new transition
- `universal-stream-catalog.infra.test.ts` — regression-lock for §2.5.h.2 BUG fixes (per R2.v2 Gemini BUG-HIGH). After Phase B seeds the catalog from the locked v10 CSV, assert: row count = 110; seq 1-110 contiguous (no gaps); column count of source CSV = 174; seq 14 `bid_value = 0.8` AND `Bid: <trade>` columns all populated (Final & Binding row contradiction resolved); seq 50 (row #31 Active Inspection) has `Work: excavation = NULL`, `Bid: Last Minute: excavation = ✓`, same for `temporary-fencing` (column-alignment fix); block B9.C row exists with assigned block_label (not gap). Sample-checks the 38 trades × 4 signals = 152 columns are populated correctly
- `bug-84-w12-regression.infra.test.ts` — load 1,000 CoA fixtures across all 22 `status` values; assert lifecycle classifier emits non-NULL phase for ≥ 95% of `decision IS NOT NULL` rows; assert P2/P3/P4 emit per `classifyCoaPhase()` rules

**Schema parity & lead_id derivation tests (`*.logic.test.ts`):**
- `lead-id-derivation.logic.test.ts` — for any `(permit_num, revision_num)` pair, derive `'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')` exactly. **`revision_num` is `VARCHAR(10)` in the live `permits` schema** (migrations 001 + 002 + 006 + 012, all declare `revision_num VARCHAR(10) NOT NULL`) — no `::text` cast is required because the column is already text. LPAD on a VARCHAR pads in place; values longer than 2 chars (e.g., `'100'`) pass through unmodified — uniqueness is preserved, lexicographic sortability is not (acceptable trade-off; the canonical sort path is `revision_num` itself, not `lead_id`). For any `application_number`, derive `'coa:' || application_number` exactly. Format is canonical and stable. Include fixtures: `revision_num='5'` asserting `'permit:XXXXX:05'` (zero-pad regression lock); `revision_num='10'` asserting `'permit:XXXXX:10'` (no-pad-needed lock); `revision_num='100'` asserting `'permit:XXXXX:100'` (over-width pass-through lock). **Preflight DB audit:** the `lead-id-schema-parity.infra.test.ts` companion test asserts `(SELECT MAX(LENGTH(revision_num)) FROM permits) <= 2` against the live schema before Phase B's `lead_id` generated column is added. If a non-numeric or >2-char revision exists, the test surfaces it for review — see §6.6.A "B.13 Integrity Constraint Design" and Phase B preflight in active task §R0.7.
- `lead-trades-schema-parity.logic.test.ts` — confirms unified `lead_trades` columns match the union of `permit_trades` + CoA needs. Same for `lead_parcels`.

**Downstream behavior tests (per R2 Gemini BUG-HIGH — coverage gap closed):**
- `coa-crm-alerts.logic.test.ts` — exercises `update-tracked-projects.js` CoA branch. Asserts: stall threshold for `status='Hearing Scheduled' AND days_since_status > coa_stall_threshold_p2_days` (default 90); imminent-alert window keyed on `hearing_date - NOW() < coa_imminent_window_days`; decision-keyed auto-archive on `decision IN ('Refused','Withdrawn','Closed')`; permit-branch byte-equivalent to pre-WF behavior (regression-lock).
- `coa-feed-filter.infra.test.ts` — exercises mobile lead feed API filter + sort. Asserts: `?lead_type=coa` returns only `lead_id LIKE 'coa:%'` rows; `?lead_type=permit` returns only `lead_id LIKE 'permit:%'` rows; `?lead_type=all` (default) returns both; `?sort=lifecycle_seq` orders rows by `lifecycle_seq ASC` with NULL last.
- `coa-inspector-query.infra.test.ts` — exercises `lead-inspect-query.ts` CoA panel data assembly. Asserts: CoA panel populates `coa_type_class`, `project_type`, `scope_tags`, `structure_type`, `estimated_cost`, `lead_trades` rows, and `lifecycle_seq` + group/block/stage + colors/icons (joined through `universal_stream_catalog`); panel renders when `lead_type='coa'` OR when permit row has `linked_coa_application_number IS NOT NULL` (linked-permit case shows historical CoA panel + current permit panel).
- `coa-handoff.infra.test.ts` _(already listed in integration tests above)_ — extended to assert that when a CoA gets linked to a permit, both rows persist with their own classification state, `permits.linked_coa_application_number` is populated, and the inspector renders cross-stream timeline via the JOIN through `lifecycle_status_history` (CoA-side rows + permit-side rows ordered by `transitioned_at`).
- `coa-lifecycle-history.infra.test.ts` — exercises `lifecycle_status_history` ledger. Asserts: every CoA status change writes a row (including same-phase same-seq transitions like `Tentatively Scheduled` → `Hearing Scheduled` within P2); every decision change writes a snapshot of the new decision + decision_date; permit status changes write rows too; full traversal of a CoA → permit lifecycle (e.g., 10+ rows for a complex path) reconstructs correctly via `SELECT * FROM lifecycle_status_history WHERE lead_id IN (...) ORDER BY transitioned_at`.

**CQA assertions extended (run inside the chain itself, not as separate test files):**
- `assert-global-coverage.js` — add CoA classification coverage as new field-level rows; add `lifecycle_status_history` row-count coverage (target: ≥ 1 row per active CoA per 30-day window).
- `assert-entity-tracing.js` — extend 26-hour coverage matrix to CoA-side derivations.
- `assert-lifecycle-phase-distribution.js` — pivots to validate `lifecycle_block` distribution against new `lifecycle_band_block_<block>_min/max` keys (per §6.7 step 4). Legacy P-code band validation runs as secondary cross-check during Phase C–G transition.

### 6.5 Step-by-Step: Permit-Pipeline Comparison

For each of the 30 steps in `chain_permits.md`, the disposition for the CoA pipeline. This is the methodical inventory — every step gets an explicit answer to "does the CoA pipeline need this and why."

| # | Permit step | CoA needs? | Disposition |
|---|---|---|---|
| 1 | `assert_schema` | YES — already exists | CoA chain step 1 already validates CoA CKAN metadata. No change. |
| 2 | `permits` (load-permits.js) | YES — already exists | CoA chain step 2 (`load-coa.js`) is the equivalent ingest. No change. |
| 3 | `close_stale_permits` | NO | CoAs don't "go stale" the same way — they have a clear hearing/decision lifecycle. The CoA-side equivalent is the existing `assert-coa-freshness` (step 3) which monitors source freshness, not row-level staleness. Decision: SKIP. |
| 4 | `classify_permit_phase` (early/structural/finishing/landscaping) | NO | This is the construction-phase classifier; CoA stage is entirely pre-construction. The lifecycle classifier (step 22) handles CoA P1/P2/P3/P4 phase assignment directly. Decision: SKIP — phase logic covered by step 22's CoA branch. |
| 5 | `classify_scope` (`classify-scope.js`) | YES — NEW `classify-coa-scope.js` | Description-keyword classifier produces `coa_type_class`, `project_type`, `scope_tags`. Cannot reuse the permit-side script because permit `classify-scope.js` reads `permit_type`, `structure_type`, `work`, `current_use`, `proposed_use`, `storeys`, `housing_units` (`scripts/classify-scope.js:631`) — most of which CoA doesn't have. NEW SCRIPT. |
| 6 | `builders` (extract-builders.js) | SKIP v1 | CoA applicants are typically homeowners or designers, not builders. Builder identity only becomes meaningful at permit-application time. Decision: SKIP for v1; revisit if CoA applicant data proves useful. |
| 7 | `link_wsib` | NO | Builders-only. CoA has no builder entity to link. |
| 8 | `geocode_permits` | YES — NEW `geocode-coa.js` (or extension) | CoA address-linking (step 4) currently uses string normalization only. For parcel-spatial-linking we need lat/lng on CoAs. Either NEW SCRIPT or extend `load-coa.js` to geocode at ingest. |
| 9 | `link_parcels` | YES — NEW `link-coa-to-parcels.js` | Spatial linkage to `parcels` polygons. Mirror of `link-parcels.js`. Writes to **unified `lead_parcels` table** (lead_id = `'coa:' || application_number`) per §6.6.B Option C. Also writes `coa_applications.neighbourhood_id` as a final UPDATE step (bundled — no separate `link-coa-neighbourhoods.js` script). NEW SCRIPT. |
| 10 | `link_neighbourhoods` | YES — NEW `link-coa-neighbourhoods.js` (or part of link-coa-to-parcels.js) | Point-in-polygon for `neighbourhoods`. Writes `coa_applications.neighbourhood_id`. Can be bundled into the parcels step. |
| 11 | `link_massing` | YES — NO NEW SCRIPT | `parcel_buildings` is shared. CoA → parcel → buildings is a 2-hop JOIN through `lead_parcels` (filtered to `lead_id LIKE 'coa:%'`). No CoA-specific script needed; downstream scripts (cost, scope) JOIN through `lead_parcels` directly. |
| 12 | `link_similar` | **DEFER to v2 (per §6.12)** | The permit-side step propagates `scope_tags` from BLD permits to companion HVA/PLB/etc. at the same address. For CoA the analog would propagate tags between sibling CoAs at the same address, OR between a CoA and its eventually-linked permit. Deferred: initial CoA classification fires on description alone for this WF; revisit if scope-tag coverage in audit_table reveals a meaningful gap. (Note: this is distinct from CoA→Permit linkage, which is delivered via existing `link-coa.js`.) |
| 13 | `classify_permits` (trade matrix) | YES — NEW `classify-coa-trades.js` | **The previously-omitted "trade tags" step.** **R2.v4 PIVOT (2026-05-13):** `trade_mapping_rules` has 0 Tier-3 description rules in production (R0.8 audit). The actual production trade classifier is the inline `TAG_PATTERNS` scope-tag→trade matrix in `classify-permits.js` (the `lookupTradesForTags` function). CoA classifier twin-extracts this matrix verbatim, sourced from `coa_applications.scope_tags` (written by `classify-coa-scope.js` in the prior chain step). NO JOIN against `trade_mapping_rules`. Outputs to **unified `lead_trades` table** (lead_id = `coa_applications.lead_id`, populated by migration 133 trigger) per §6.6.B Option C. Includes realtor-inclusion gate (`shouldAppendRealtor()` adapted to use `coa_type_class='residential'` predicate). NEW SCRIPT. |
| 14 | `backfill_realtor_permit_trades` | YES — bundled into `classify-coa-trades.js` | Realtor fan-out for CoA leads. Same logic as permit-side: insert one realtor row per residential CoA via `NOT EXISTS` guard + `ON CONFLICT DO NOTHING`. Decision: BUNDLE into the CoA trade classifier — no separate backfill script needed because we're not retrofitting historical rows. |
| 15 | `compute_cost_estimates` (Spec 83) | YES — NEW `compute-coa-cost-estimates.js` | Geometric-only path (no applicant cost to anchor against). Reads `lead_parcels` (filtered to CoA leads) → `parcel_buildings.modeled_gfa_sqm`, `coa_applications.scope_tags`, `coa_applications.project_type`, `trade_sqft_rates`, `scope_intensity_matrix` (Spec 83 Surgical Triangle). Writes `coa_applications.estimated_cost`, `.modeled_gfa_sqm`, `.cost_source='geometric'`. Decision: NEW SCRIPT (not extension of `compute-cost-estimates.js`) because the cost-source decision tree is simpler (no Liar's-Gate, no declared-cost anchor). NEW SCRIPT. |
| 16 | `compute_timing_calibration_v2` | NO | Single calibration shared across all leads. CoA P1→P2→P3→P4 transitions feed the same `phase_calibration` table. No new script. |
| 17 | `link_coa` | YES — already exists in CoA chain step 4 + EXTEND | Existing `link-coa.js` writes `coa_applications.linked_permit_num` + `linked_confidence`. EXTEND to also write `permits.linked_coa_application_number` (NEW column on permits). |
| 18 | `create_pre_permits` | RETIRE | Eliminated as part of this work. Front-end reads CoA leads from `coa_applications` directly via `lead_type='coa'` lead identity. Existing PRE- rows in `permits` table cleared in a one-time migration. |
| 19 | `refresh_snapshot` | YES — already exists + EXTEND | Existing `refresh-snapshot.js` aggregates dashboard metrics. EXTEND to add CoA classification coverage counts. |
| 20 | `assert_data_bounds` | YES — already exists + EXTEND | EXTEND to add CoA-side bounds (e.g., `coa_applications.scope_tags` null rate, `lead_trades WHERE lead_id LIKE 'coa:%'` row count). |
| 21 | `assert_engine_health` | YES — already exists | CoA chain step 9 runs this. No change. |
| 22 | `classify_lifecycle_phase` | YES — FIX bug 84-W12 + migrate to granular Universal Stream emission | (1) Wire `coa_applications.status` into `classifyCoaPhase()` — emit P2 on `status IN ('Internal Review', 'Public Hearing Scheduled')`, P3 on `decision IN ('Approved', 'Approved with Conditions', 'Conditional Consent')`, P4 on `decision = 'Final and Binding'`. (2) Extend classifier to also write granular Universal Stream columns (`lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value`) by JOIN against `universal_stream_catalog`. (3) Write transitions to `lifecycle_transitions` ledger with both legacy phase codes AND new `from_seq` / `to_seq`. |
| 23 | `assert_lifecycle_phase_distribution` | YES — RECALIBRATE | Distribution bands in `logic_variables.lifecycle_band_*_min/max` recalibrated against post-84-W12 production-shape data (CoA P1/P2/P3/P4 counts jump ~100×). New bands set on staging via iterative band-tuning passes. |
| 24 | `compute_phase_calibration` | YES — EXTEND cohort key | Cohort key extends from `(permit_type, from_phase)` to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. Requires JOIN to `permits`/`coa_applications` for the new dimensions. Output rows multiply ~4–5×. |
| 25 | `compute_trade_forecasts` (Spec 85) | YES — REKEY ON `lead_id` | Single unified script reads from both `permits` and `coa_applications` (UNION source SQL), writes rows keyed on `lead_id`. CoA-stage forecasts populate end-to-end (lifecycle classifier now emits non-NULL phase for CoAs). Bimodal routing for CoA-stage simplified: target always `bid_phase` (no construction yet — work phase doesn't apply); anchor priority `phase_started_at` → `decision_date` → `hearing_date` → application date. |
| 26 | `compute_opportunity_scores` (Spec 81) | YES — REKEY ON `lead_id` | Same. CoA-stage opportunity scores now produce real values (was 0% under split plan). |
| 27 | `update_tracked_projects` (Spec 82) | YES — EXTEND | EXTEND alert logic to handle CoA-side rows (distinguished by `lead_id LIKE 'coa:%'` — the R5.3 trigger-based dual-write pivot retired the unimplemented `lead_type` discriminator; lead_id prefix encoding is canonical). Stall thresholds different (CoA at "Hearing Scheduled" for 1–3 months is normal, not a stall); auto-archive on `decision IN ('Refused','Withdrawn','Closed')`; imminent-alert window keyed on `hearing_date` instead of `predicted_start`. |
| 28 | `assert_entity_tracing` | YES — EXTEND | 26-hour coverage matrix extended to CoA-side derivations (`lead_trades WHERE lead_id LIKE 'coa:%'`, `lead_parcels WHERE lead_id LIKE 'coa:%'`, `coa_applications.scope_tags`). |
| 29 | `assert_global_coverage` | YES — already exists in CoA chain step 12 + EXTEND | EXTEND with CoA-specific coverage thresholds (one row per new CoA column). |
| 30 | `backup_db` | NO | Daily backup is global. |

### 6.6 Schema Changes — Option C (`lead_id`-keyed Unified Tables) + Granular Universal Stream Columns

This WF picks **Option C** from the three dual-identity options previously considered (A: nullable dual-key, B: parallel tables, C: `lead_id`-keyed unified tables). Rationale: positions the schema cleanly for the granular Universal Stream lifecycle model (Spec 84 §2.5.h.2) being wired in this same WF, and removes the entity-type fork from every downstream consumer.

**6.6.A — Universal lead identity (`lead_id`):**

Every lead-bearing row in the system gets a `lead_id TEXT NOT NULL` column. Format is canonical:

- Permit lead: `'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')` — e.g., `'permit:1234567:00'`. `revision_num` is `VARCHAR(10)`; LPAD operates on the text directly without a cast. **WF3 2026-05-14 correction:** PostgreSQL `LPAD(s, 2, '0')` (and the deriveLeadId JS/TS twin) TRUNCATES over-width input to its leftmost 2 chars — `'100'` → `'10'`, `'001'` → `'00'`. Uniqueness across over-width values is therefore NOT preserved; the canonical-form invariant is "every revision_num is at most 2 chars". The migrate-to-lead-id.js preflight enforces this on the source data; production ingestion is expected to produce at most 2-char revision_num values. **Administrative-class permits** (per `permit_type_classifications.class='administrative'` — e.g., `'DCs DeferredFees'`) are excluded from the lead_id ecosystem (`lead_id := NULL` on the Phase B trigger, no rows in `cost_estimates` / `trade_forecasts` / `lead_trades` / `lead_parcels`) — they are administrative sub-records, not construction leads. See mig 138_a + WF3 #lpad-revision-num-collision.
- CoA lead: `'coa:' || application_number` — e.g., `'coa:A0123-24'`

This format matches the existing `lead_analytics.lead_key` convention (`scripts/lib/leads/lead-id.js` exists already as a shared derivation function). We standardize the rest of the stack on this same string.

**Migration strategy:** for `permits` and `coa_applications`, `lead_id` is added as a `GENERATED ALWAYS AS (...) STORED` column — populated automatically by Postgres at write time, no backfill needed. For the other hot-path tables (`cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics`), `lead_id` is added as a nullable column populated by a Phase C backfill (`migrate-to-lead-id.js`), then promoted to `NOT NULL` + UNIQUE INDEX after the backfill completes. The legacy `permit_num`/`revision_num` columns stay denormalized alongside `lead_id` for the duration of the consumer migration (read by some queries, written by triggers). After all consumers query on `lead_id`, the legacy columns are dropped in Phase H cleanup.

**Phase I.1 substrate addendum (mig 155):** Migration 155 (Phase I.1, commit `d579bc0`) mirrors `matched_status`/`matched_rule`/`unmapped_status` columns onto `permits` (minus `unmapped_decision` — CoA-only because permit applications have no formal decision artifact). The columns close the substrate gap that prevented Phase I.1's classifier from writing permit-side `lifecycle_status_history` rows — mig 127's CHECK constraint anticipated symmetric writers but mig 146 only added `matched_status` to `coa_applications`. **Phase I.1.1b (commit `73b257b`)** populates these columns: `classifyLifecyclePhase()` extended to return `{phase, stalled, matchedStatus, matchedRule, unmappedStatus}` per Spec 84 §3.7 18-rule precedence; dirty SELECT predicate updated with `OR matched_rule IS NULL` for first-deploy backfill; permit-side classifier ledger writer activated.

**6.6.A.1 — B.13 Integrity Constraint Design** _(committed during R2.v3 review 2026-05-13)_

Because `lead_id` references rows on **two** parent tables (`permits` and `coa_applications`), a conventional FK constraint cannot enforce referential integrity — Postgres requires a single FK target. The accepted resolution:

1. **CHECK constraint on every table carrying `lead_id`** to enforce format validity:
   ```sql
   ALTER TABLE <table_with_lead_id>
     ADD CONSTRAINT chk_<table>_lead_id_format
     CHECK (lead_id ~ '^(permit|coa):.+$');
   ```
   The regex uses `.+` not `.*` — disallows bare `'permit:'` or `'coa:'` with empty key suffix. Applies to: `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`, `cost_estimates`, `trade_forecasts`, `tracked_projects`, `permits`, `coa_applications` (the latter two enforce their own derived format, but the CHECK is added defensively in case a future migration drops the GENERATED clause).

2. **No cross-table FK on `lead_id`.** This is an **accepted limitation**. A `lead_id` value pointing to a non-existent `permits` row or `coa_applications` row is detectable only at query time. Compensating mitigations:
   - Application-layer guarantee: every writer derives `lead_id` via the shared `scripts/lib/leads/lead-id.js` / `src/lib/leads/lead-id.ts` (Spec 84 §7 dual-path) — there is no other write path.
   - Audit test: `lead-id-orphan-audit.infra.test.ts` runs in CI and asserts no row in any `lead_id`-bearing table references a non-existent parent (`LEFT JOIN permits/coa_applications ON ... WHERE parent.id IS NULL` returns zero rows).
   - CQA gate: `assert-data-bounds.js` extension surfaces orphan counts as a daily metric with FAIL on >0 (post Phase C).

3. **Generated `lead_id` on `permits` and `coa_applications`** uses Postgres trigger-based generation rather than `GENERATED ALWAYS AS (...) STORED`. Both forms produce the same result, but trigger-based is preferred because the existing `permits` table is 247K rows — adding a STORED generated column rewrites every row, requiring an `ACCESS EXCLUSIVE` lock for the rewrite duration. A `BEFORE INSERT OR UPDATE` trigger that sets `NEW.lead_id := derive(...)` plus a one-time `UPDATE permits SET lead_id = NULL` (which fires the trigger and populates lead_id without a table rewrite) achieves the same outcome with row-level locking. Phase B chooses trigger-based for both tables for consistency. **Phase B migration B.7/B.8** describes the exact DDL.

**6.6.B — New unified tables (replace `permit_trades`, `permit_parcels`, `permit_phase_transitions`):**

```sql
-- Replaces permit_trades. Holds trade tagging for both permits and CoAs.
CREATE TABLE lead_trades (
    id                  SERIAL          PRIMARY KEY,
    lead_id             TEXT            NOT NULL,
    trade_id            INTEGER         NOT NULL REFERENCES trades(id),
    tier                INTEGER,        -- 1/2/3 for permits; always 3 for CoAs (description-only)
    confidence          DECIMAL(3,2),
    is_active           BOOLEAN         NOT NULL DEFAULT true,
    phase               VARCHAR(20),    -- P-code at classification time (legacy column, stays for backward compat)
    lead_score          INTEGER         NOT NULL DEFAULT 0,
    classified_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, trade_id)
);
CREATE INDEX idx_lead_trades_trade ON lead_trades (trade_id);
CREATE INDEX idx_lead_trades_active ON lead_trades (is_active);
CREATE INDEX idx_lead_trades_lead ON lead_trades (lead_id);

-- Replaces permit_parcels. Holds spatial linkage for both permits and CoAs.
CREATE TABLE lead_parcels (
    lead_id             TEXT           NOT NULL,
    parcel_id           INTEGER        NOT NULL REFERENCES parcels(id),
    match_type          VARCHAR(20)    NOT NULL,
    confidence          DECIMAL(3,2)   NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    matched_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lead_id, parcel_id)
);
CREATE INDEX idx_lead_parcels_parcel ON lead_parcels (parcel_id);
CREATE INDEX idx_lead_parcels_lead ON lead_parcels (lead_id);

-- Replaces permit_phase_transitions. Universal lifecycle ledger.
-- Both from_phase/to_phase (legacy P-codes) AND from_seq/to_seq (granular
-- Universal Stream row references) populated by classify-lifecycle-phase.js
-- as part of this WF — see §6.7. from_phase/to_phase remain populated for
-- legacy-consumer compatibility during the Phase C-F consumer migration.
CREATE TABLE lifecycle_transitions (
    id                  SERIAL          PRIMARY KEY,
    lead_id             TEXT            NOT NULL,
    from_phase          VARCHAR(20),    -- legacy P-code (current authoritative)
    to_phase            VARCHAR(20)     NOT NULL,
    from_seq            INTEGER,        -- granular Universal Stream row reference; populated in Phase E
    to_seq              INTEGER,        -- granular Universal Stream row reference; populated in Phase E
    transitioned_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    permit_type         VARCHAR(50),
    project_type        VARCHAR(50),    -- new dimension for cohort key
    coa_type_class      VARCHAR(30),    -- new dimension for cohort key
    neighbourhood_id    BIGINT
);
CREATE INDEX idx_lifecycle_transitions_lead ON lifecycle_transitions (lead_id);
CREATE INDEX idx_lifecycle_transitions_phase ON lifecycle_transitions (from_phase, to_phase);
CREATE INDEX idx_lifecycle_transitions_seq ON lifecycle_transitions (from_seq, to_seq) WHERE from_seq IS NOT NULL;

-- NEW lifecycle status history ledger — captures EVERY status change, not just
-- phase changes. Critical for accurate forecasting:
--   - lifecycle_transitions captures phase-level transitions (P2→P3, etc.)
--   - lifecycle_status_history captures status-level transitions
--     (Tentatively Scheduled → Hearing Scheduled → Postponed, all within P2)
-- The status-level granularity preserves the FULL traversal path through the
-- 110-row Universal Stream, enabling cohort calibration on (from_seq, to_seq)
-- with full fidelity. Also captures the CoA decision field at every status
-- change — currently the decision is overwritten in place on coa_applications,
-- so we lose the history of how a decision evolved (e.g., Postponed →
-- Approved with Conditions → Final and Binding).
CREATE TABLE lifecycle_status_history (
    id                  BIGSERIAL       PRIMARY KEY,
    lead_id             TEXT            NOT NULL,
    from_status         VARCHAR(60),                 -- previous source status (NULL on first observation)
    to_status           VARCHAR(60)     NOT NULL,    -- new source status (permits.status / coa_applications.status / inspection stage_name)
    from_seq            INTEGER,                     -- previous Universal Stream row (granular)
    to_seq              INTEGER,                     -- new Universal Stream row (granular)
    from_phase          VARCHAR(20),                 -- previous P-code (legacy, kept for backward compat)
    to_phase            VARCHAR(20),                 -- new P-code (legacy)
    decision            VARCHAR(60),                 -- CoA decision snapshot at time of status change (NULL for permits / unmapped CoAs)
    decision_date       DATE,                        -- CoA decision_date snapshot (NULL for permits)
    transitioned_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    detected_by         VARCHAR(60)     NOT NULL,    -- script that detected the change. Three writers: 'load-permits.js' (permit-side CKAN status changes at ingest), 'load-coa.js' (CoA-side CKAN status+decision changes at ingest), 'classify-lifecycle-phase.js' (derived phase transitions on dirty rows)
    permit_type         VARCHAR(50),                 -- denormalized for cohort queries
    project_type        VARCHAR(50),
    coa_type_class      VARCHAR(30),
    neighbourhood_id    BIGINT
);
CREATE INDEX idx_lifecycle_status_history_lead ON lifecycle_status_history (lead_id);
CREATE INDEX idx_lifecycle_status_history_seq ON lifecycle_status_history (from_seq, to_seq) WHERE from_seq IS NOT NULL;
CREATE INDEX idx_lifecycle_status_history_decision ON lifecycle_status_history (decision) WHERE decision IS NOT NULL;
CREATE INDEX idx_lifecycle_status_history_transitioned ON lifecycle_status_history (transitioned_at);

-- Idempotency guard against re-runs (per R8 Gemini review 2026-05-13).
-- Both load-permits.js and load-coa.js write at CKAN ingest; without a unique
-- key, re-running the same load over the same time window would INSERT
-- duplicate transition rows. The natural key is (lead_id, to_status, transitioned_at)
-- truncated to the second — two genuinely-distinct status changes for the
-- same lead at the same second are not expected. ON CONFLICT DO NOTHING in
-- ingest scripts prevents accidental duplication; classifier writes also
-- respect this constraint since the classifier only fires once per chain run.
CREATE UNIQUE INDEX uniq_lifecycle_status_history_natural_key
    ON lifecycle_status_history (lead_id, to_status, date_trunc('second', transitioned_at));
```

##### How lifecycle history works across CoA + Permit (unified)

`lifecycle_status_history` is a **single table** that captures the full traversal of *both* CoA applications and permits. The discriminator is the `lead_id` prefix:

- CoA-side rows: `lead_id = 'coa:' || application_number` (e.g., `'coa:A0123-24'`)
- Permit-side rows: `lead_id = 'permit:' || permit_num || ':' || LPAD(revision_num::text, 2, '0')` (e.g., `'permit:1234567:00'`)

**A project that starts as a CoA and ends as a permit produces TWO sequences of rows in this table**, one per `lead_id`. They are NOT collapsed into a single conceptual lead — each lead keeps its own identity, its own traversal, and its own decision/status history. The link between them is established by `coa_applications.linked_permit_num` (and the back-reference `permits.linked_coa_application_number` added in Phase D), joined at query time.

```sql
-- Example 1: Reconstruct a single CoA's full status traversal
SELECT to_status, decision, transitioned_at
FROM lifecycle_status_history
WHERE lead_id = 'coa:A0123-24'
ORDER BY transitioned_at;

-- Result for a typical Path A CoA:
-- 'Application Received'    | NULL                       | 2024-01-15
-- 'Accepted'                | NULL                       | 2024-01-22
-- 'Prepare Notice'          | NULL                       | 2024-02-01
-- 'Notice Prepared'         | NULL                       | 2024-02-14
-- 'Tentatively Scheduled'   | NULL                       | 2024-02-20
-- 'Hearing Scheduled'       | NULL                       | 2024-03-05
-- 'Postponed'               | NULL                       | 2024-03-21  ← detour
-- 'Hearing Scheduled'       | NULL                       | 2024-04-12  ← rescheduled
-- 'Approved with Conditions'| 'Approved with Conditions' | 2024-04-18  ← decision lands here
-- 'Final and Binding'       | 'Final and Binding'        | 2024-05-08  ← appeal window cleared
-- 'Closed'                  | 'Final and Binding'        | 2024-05-15

-- Example 2: Cross-stream timeline for a CoA→Permit project
SELECT *
FROM lifecycle_status_history
WHERE lead_id IN ('coa:A0123-24', 'permit:1234567:00')
ORDER BY transitioned_at;
-- Returns interleaved CoA + permit rows. The CoA may finish in 2024;
-- the permit may not be filed until 2026 (median 1,078-day lag);
-- the permit then runs through Permit Intake → Inspection → Closed.
-- The full project journey is a single chronological query.

-- Example 3: Forecast-cohort segmentation by traversal pattern
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM lifecycle_status_history h2
    WHERE h2.lead_id = h.lead_id AND h2.to_status = 'Postponed'
  ) THEN 'had_postponement' ELSE 'straight_through' END AS pattern,
  AVG(decided_at - opened_at) AS avg_days_to_decision
FROM (
  SELECT lead_id,
         MIN(CASE WHEN to_status = 'Application Received' THEN transitioned_at END) AS opened_at,
         MIN(CASE WHEN decision IS NOT NULL THEN transitioned_at END) AS decided_at
  FROM lifecycle_status_history
  WHERE lead_id LIKE 'coa:%'
  GROUP BY lead_id
) h
WHERE opened_at IS NOT NULL AND decided_at IS NOT NULL
GROUP BY 1;
-- Cohort A (had_postponement): 312 days avg
-- Cohort B (straight_through): 187 days avg
-- → Forecast engine can now condition predicted_start on traversal pattern.
```

**The "unified" design choice**: a separate `coa_status_history` table would have forced every cross-stream query to UNION across two tables. Single table + `lead_id` prefix is the same Option C trade-off applied to the ledger — one query path, one schema parity test, one place to add new lead types in the future (e.g., builder leads). The `(lead_id)` index makes the prefix filter cheap.

**Decision field capture**: today `coa_applications.decision` is overwritten in place on every CoA status change. `lifecycle_status_history.decision` snapshots the decision at each transition, so an appeal-reversal (`Approved` → `Refused`) or amendment (`Conditional Consent` → `Approved with Conditions`) is preserved as ordered history rather than lost to overwrite. The forecast engine and CRM alerts can both consume this to learn from decision-evolution patterns.

```sql
-- NEW reference table: read-only catalog of the 110 rows from Spec 84 §2.5.h.2.
-- Populated once via seed migration sourcing from the finalized §2.5.h.2 table.
-- The lifecycle classifier JOINs against this table to derive the granular
-- columns (seq, group, block, stage, bid_value) it writes onto permits and
-- coa_applications. The front-end JOINs through lifecycle_seq for rendering
-- group/block/stage labels + colors + icons.
CREATE TABLE universal_stream_catalog (
    seq                 INTEGER         PRIMARY KEY,
    source_row_num      INTEGER         NOT NULL,    -- the '#' column from §2.5.h.2
    lifecycle_group     VARCHAR(10)     NOT NULL,    -- C1-C4 / BP1-BP7 / I1-I4
    group_label         VARCHAR(60)     NOT NULL,
    lifecycle_block     VARCHAR(10)     NOT NULL,    -- B1.A through B15.H
    block_label         VARCHAR(60)     NOT NULL,
    lifecycle_stage     VARCHAR(5)      NOT NULL,    -- 'a', 'b', 'c', ...
    stage_label         VARCHAR(120)    NOT NULL,
    source              VARCHAR(30)     NOT NULL,    -- 'coa.status' | 'permits.status' | 'insp.stage'
    status              VARCHAR(60)     NOT NULL,
    phase               VARCHAR(40),                 -- legacy P-code (e.g., 'P3', 'P7a/P7b/P7c')
    bid_value           DECIMAL(3,2),                -- 0-1 importance score (NULL for inspection/closure)
    loop_marker         VARCHAR(60),                 -- e.g., '↩ #75' or '(terminal)' or '—'
    -- Color & Icon Strategy (Spec 84 §2.5.h Color & Icon Strategy) — 6 hierarchy columns.
    -- Front-end renders phase badges/timeline by JOIN through lifecycle_seq.
    group_color         VARCHAR(7),                  -- hex e.g. '#CFFAFE' (Group base palette)
    group_icon          VARCHAR(8),                  -- emoji e.g. '📨' (Group icon)
    block_color         VARCHAR(7),                  -- hex (Block override or same as group)
    block_icon          VARCHAR(8),                  -- emoji (Block icon)
    stage_color         VARCHAR(7),                  -- hex (Stage override for outliers like Postponed, Refused)
    stage_icon          VARCHAR(8),                  -- emoji (Stage icon e.g. '⏸️', '❌')
    rows_count          INTEGER                      -- snapshot count from §2.5.h.2 (informational)
);
CREATE INDEX idx_universal_stream_catalog_group ON universal_stream_catalog (lifecycle_group);
CREATE INDEX idx_universal_stream_catalog_block ON universal_stream_catalog (lifecycle_block);

-- NEW join table: decomposes the 152 per-trade × per-row signal columns from
-- §2.5.h.2 (Bid / Work / Fallback / Bid:Last Minute × 38 trades) into a
-- queryable relational form. ~1,500 rows total (sum of all ✓ marks in the
-- v9 CSV: 1,710 bid + 51 work + 38 fallback + 38 last-minute = 1,837 — a few
-- compressed by the relational form since rows where the same seq+trade+signal
-- repeats don't apply here; each row is unique).
-- The forecast engine queries this for granular bimodal routing per
-- (current_seq, trade), replacing the legacy PHASE_ORDINAL comparison against
-- trade_configurations.bid_phase_cutoff / work_phase_target.
CREATE TABLE universal_stream_trade_signals (
    seq          INTEGER     NOT NULL REFERENCES universal_stream_catalog(seq),
    trade_slug   VARCHAR(50) NOT NULL REFERENCES trades(slug),
    signal_type  VARCHAR(20) NOT NULL CHECK (signal_type IN ('bid','work','fallback','last_minute')),
    PRIMARY KEY (seq, trade_slug, signal_type)
);
CREATE INDEX idx_universal_stream_trade_signals_trade
    ON universal_stream_trade_signals (trade_slug, signal_type);
CREATE INDEX idx_universal_stream_trade_signals_seq_signal
    ON universal_stream_trade_signals (seq, signal_type);
```

The catalog and signals tables are seeded from a single source: the finalized §2.5.h.2 Universal Stream table in Spec 84, exported as CSV and loaded via a one-shot seed migration. The v10 CSV (`docs/reports/spec_84_universal_stream_v10.csv`) is the locked canonical seed source after Phase A R0.6 validation (110 rows × 174 columns; all 3 BUGS resolved + all 6 QUESTIONABLE items reviewed-and-decided).

**Seed migration contract (Phase B):**
- Table creation (`B.5a`, `B.6a`) and data INSERT (`B.5b`, `B.6b`) are **split into separate migration files** so that a failed seed does not roll back the table create — re-running the seed only is then safe.
- Every seed INSERT uses `ON CONFLICT DO NOTHING` on the PK so re-runs are idempotent.
- Every seed migration includes a corresponding DOWN: `DELETE FROM universal_stream_catalog;` / `DELETE FROM universal_stream_trade_signals;` / per-row `DELETE FROM logic_variables WHERE variable_key IN (...);` for B.11.
- Empty CSV cells map to SQL `NULL` (not empty string) for nullable columns (`bid_value`, `loop_marker`, `phase`, all six color/icon columns, `rows_count`). The seed-generator utility (`_tmp_phase_b_seed_catalog.mjs`) is responsible for the empty-cell → NULL transformation before emitting the INSERT batch.
- Preflight validation: the seed generator MUST assert `csv.rows.length === 110` AND `csv.headers.length === 174` AND throw before emitting any INSERT if either check fails. Corrupt-CSV failure mode becomes loud, not silent.

**6.6.C — Lead-id columns added to existing tables (Phase A migration):**

| Table | New column | Notes |
|---|---|---|
| `cost_estimates` | `lead_id TEXT` | Backfilled from `permit_num`/`revision_num` during migration. UNIQUE INDEX added after backfill. Legacy keys retained during Phase A–D, dropped in Phase E. |
| `trade_forecasts` | `lead_id TEXT` | Same. PK becomes `(lead_id, trade_slug)` after backfill. |
| `tracked_projects` | `lead_id TEXT` | Same. `lead_id` prefix (`permit:` / `coa:`) is the canonical distinction between permit-side and CoA-side rows — the R5.3 trigger-based dual-write pivot (commit `872ec73`) retired the unimplemented `lead_type` discriminator design. `permit_num`/`revision_num` remain NOT NULL through Phase E and are dropped in Phase F (deferred so the partial UNIQUE on `lead_id` can accommodate the Phase D pre-classification NULL window). |
| `lead_analytics` | (already has `lead_key` TEXT) | **Decision (R2.v3 2026-05-13):** add `lead_id TEXT` as a new column populated by Phase C backfill from `lead_key` (format already matches — pure column copy). `lead_key` is retained as an alias through Phase G; Phase H drops it. The rename approach was rejected because external BI tools and dashboards may still reference `lead_key`. Assigned to Phase B migration B.9. |
| `permit_phase_transitions` | (replaced by `lifecycle_transitions` in Phase H) | **No Phase B view conversion.** The table remains a live, separately-written table through Phases B–G. `scripts/classify-lifecycle-phase.js` continues writing to it through Phase D. In Phase E the classifier rewrites to write `lifecycle_transitions` instead; existing rows are migrated by a one-shot migration. Phase H drops the table (or converts to a `SELECT`-only view aliasing `lifecycle_transitions WHERE lead_id LIKE 'permit:%'` if any external BI consumer still references it). **Rationale:** scripts `classify-lifecycle-phase.js`, `classify-permits.js`, `link-parcels.js`, `backfill-realtor-permit-trades.js`, `create-pre-permits.js`, `reclassify-all.js`, `seed-parcels.js` all execute INSERT/DELETE against `permit_phase_transitions`/`permit_trades`/`permit_parcels` by name — a Phase B view conversion would break every one of those writers immediately. The same constraint applies to `permit_trades` and `permit_parcels`: no Phase B view conversion. |

**6.6.D — New columns on `coa_applications`:**

| Column | Type | Source | Populated by this WF? |
|---|---|---|---|
| `lead_id` | TEXT (generated `'coa:' || application_number`) | trigger | YES |
| `coa_type_class` | VARCHAR(30) | `classify-coa-scope.js` | YES (residential / commercial / institutional / mixed) |
| `project_type` | VARCHAR(50) | `classify-coa-scope.js` | YES (Addition / NewConstruction / Alteration / Demolition / Severance / Mixed) |
| `scope_tags` | TEXT[] | `classify-coa-scope.js` | YES (reduced tag set) |
| `scope_classified_at` | TIMESTAMPTZ | `classify-coa-scope.js` | YES |
| `scope_source` | VARCHAR(30) | `classify-coa-scope.js` | `'description'` always |
| `structure_type` | VARCHAR(30) | denormalized from `parcel_buildings` via `lead_parcels` JOIN | YES |
| `neighbourhood_id` | BIGINT | `link-coa-neighbourhoods.js` | YES |
| `latitude` | DECIMAL(10,7) | **primary:** `link-coa-to-parcels.js` (parcel centroid via address-text match, R5.2). **secondary upgrade:** `link-coa.js` (inherits from linked permit when fuzzy-match confidence ≥ `coa_inherit_from_permit_min_confidence`, R5.6 Part A). See §6.X for the lead-identity continuity rationale. | YES |
| `longitude` | DECIMAL(10,7) | (same writers as `latitude`) | YES |
| `modeled_gfa_sqm` | NUMERIC | `compute-coa-cost-estimates.js` | YES |
| `estimated_cost` | NUMERIC | `compute-coa-cost-estimates.js` | YES |
| `cost_source` | VARCHAR(20) | `compute-coa-cost-estimates.js` | `'geometric'` always |
| `cost_classified_at` | TIMESTAMPTZ | `compute-coa-cost-estimates.js` | YES |
| `lifecycle_seq` | INTEGER | `classify-lifecycle-phase.js` JOIN `universal_stream_catalog` | YES |
| `lifecycle_group` | VARCHAR(10) | same | YES |
| `lifecycle_block` | VARCHAR(10) | same | YES |
| `lifecycle_stage` | VARCHAR(5) | same | YES |
| `bid_value` | DECIMAL(3,2) | same | YES |

**6.6.E — New columns on `permits`:**

| Column | Type | Source | Populated by this WF? |
|---|---|---|---|
| `lead_id` | TEXT (generated from `permit_num`+`revision_num`) | trigger | YES |
| `linked_coa_application_number` | VARCHAR(50) | `link-coa.js` (existing script extended) | YES |
| `lifecycle_seq` | INTEGER | `classify-lifecycle-phase.js` JOIN `universal_stream_catalog` | YES |
| `lifecycle_group` | VARCHAR(10) | same | YES |
| `lifecycle_block` | VARCHAR(10) | same | YES |
| `lifecycle_stage` | VARCHAR(5) | same | YES |
| `bid_value` | DECIMAL(3,2) | same | YES |

**6.6.F — New columns on `phase_stay_calibration`:**

| Column | Type | Populated by this WF? |
|---|---|---|
| `from_seq` | INTEGER | YES — written by extended `compute-phase-calibration.js` |
| `to_seq` | INTEGER | YES |
| `project_type` | VARCHAR(50) | YES |
| `coa_type_class` | VARCHAR(30) | YES |

`compute-phase-calibration.js` extends `GROUP BY` from `(permit_type, from_phase)` to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. Output cohorts multiply ~4–5× but each carries more signal.

**6.6.G — Reused tables (no schema change):**

- `trade_mapping_rules` (mig 005) — REUSED. CoA trade classifier filters to `tier = 3 AND match_field = 'description'` and runs the same ILIKE matching. Tier-3 rule edits affect both permit and CoA classification.
- `parcels`, `parcel_buildings`, `neighbourhoods`, `address_points` — shared spatial reference.
- `trades`, `trade_configurations`, `trade_sqft_rates`, `scope_intensity_matrix` — shared trade/cost reference.

### 6.6.X Lead-Identity Continuity for Permit-CoA Matched Records

A real-world property can enter the pipeline via either side. Toronto's CKAN datasets treat both flows identically — there is no source field that distinguishes them — so the pipeline must reconcile them downstream.

**Flow A — CoA-first** (most CoAs): applicant files variance hearing → if approved, *later* files building permit. The permit may not exist at the time of CoA ingest.

**Flow B — Permit-first via Examiner's Notice**: applicant files building permit → examiner identifies need for variance → applicant files CoA in response to Examiner's Notice. The permit exists *before* the CoA at time of ingest.

**Why this matters**: a user who already saw the lead via the permit feed may later see the linked CoA. Without continuity, both records hold independently-derived data (CoA gets parcel-centroid lat/long ≈ 10-50m; permit got `address_points` lat/long ≈ 5-10m), and the user sees the same physical property as two visually-different leads.

**Resolution strategy** (implemented in R5.6 Part A):

1. **Linkage detection** — `link-coa.js` runs at end of CoA chain. Tier 1a (address + ward, conf 0.95), Tier 1b (address + permit-ward-NULL, conf 0.85), Tier 2a (name-only + ward, conf 0.60) reach the inheritance floor.
2. **Data inheritance** — when linkage confidence ≥ `coa_inherit_from_permit_min_confidence` (logic_variable, default 0.60), inherit `latitude`/`longitude`/`ward` from permit into CoA. Inheritance uses a `DISTINCT ON (permit_num)` subquery to disambiguate revision_num (since `coa_applications.linked_permit_num` stores only `permit_num`, not the composite key). Same ordering convention as Tier 1a: `COALESCE(issued_date, application_date) DESC NULLS LAST, revision_num DESC`. Inheritance is one-directional (permit → CoA); CoA's classification fields (scope_tags, project_type, decision, hearing_date, applicant) are NEVER overwritten.
3. **Atomic guards** — UPDATE WHERE clause requires `p.latitude IS NOT NULL AND p.longitude IS NOT NULL` (never write half a coordinate pair) plus `IS DISTINCT FROM` guards on each target column (idempotent + dead-tuple bloat prevention).
4. **Ward COALESCE direction** — CoA's own ward is authoritative when non-null (CoA data is reliably populated for ward; permits are ~80% NULL). Permit ward fills NULL CoA ward only; never overwrites.
5. **Two-lead-id model is intentional** — `coa_applications.lead_id = 'coa:...'` and `permits.lead_id = 'permit:...'` remain distinct after matching. Cross-property queries use `coa.linked_permit_num` and `permits.linked_coa_application_number` for the join. This is by design per §6.6.B; UI display unification is Phase F work.
6. **Stale back-ref cleanup** — when the cross-ward pre-pass unlinks a CoA from its permit, `permits.linked_coa_application_number` is also cleared (only when no other CoA still references the permit). Preserves lead-identity continuity for downstream consumers.

**Audit observability** (consumed by Spec 48 pipeline observer):
- `coa_inherited_from_permit_count` — CoAs that received ≥1 column upgrade this run
- `coa_lat_lng_upgraded_from_permit_count` — subset where lat/long specifically changed
- `coa_ward_filled_from_permit_count` — subset where ward changed NULL→non-NULL
- `coa_ward_mismatch_with_permit_count` — CoAs where both ca.ward and p.ward are non-null but differ (data-quality signal)
- `coa_below_confidence_floor_count` — gate-misconfig detector
- `lead_identity_lat_lng_mismatch_count` — post-inheritance consistency check (threshold `== 0` FAIL)
- `stale_back_refs_cleared_count` — pre-pass cleanup volume
- `inherited_confidence_floor` — the logic_var value used (operator visibility)

**What this does NOT do** (deferred):
- Unified `lead_id` across permit + CoA records — Phase F-level work.
- Pre-emptive `permits.coa_anticipated` flag for Examiner's Notice permits — **deferred to Spec 48 implementation as a new final phase** ("Cross-Pipeline Anticipation Tracking"). The flag was originally scoped for R5.6 Part B but 4-reviewer plan-review (2026-05-14) identified design tensions (semantic conflict between flag name and "stays TRUE forever" behavior, redundancy with PRE-permit retirement in Phase G, no operational wiring into link-coa.js's tiebreaker, regex placeholder needing R0 audit gate) that warrant its own dedicated WF1.
- Bidirectional propagation — changes to the permit's lat/long DO refresh the linked CoA's inherited fields on the next chain run (because the enrichment UPDATE is idempotent via IS DISTINCT FROM guard), but this requires the CoA chain to run after the permit chain. Cross-chain triggering is Phase H work.

### 6.7 Granular Lifecycle: Engine Migration + Universal Stream Wiring

The bundled approach (chosen because the system is pre-live) migrates the lifecycle engine to the granular Universal Stream model in the same WF as the lead_id refactor and CoA pipeline parity. The risk-reduction "schema prep without engine change" pattern is dropped — pre-live means we can iterate on band recalibration and classifier outputs freely on staging without operational blast radius.

**What this WF changes in the lifecycle engine:**

1. **`scripts/lib/lifecycle-phase.js` — `classifyCoaPhase()` rewrite (bug 84-W12 fix, Phase E.1 delivered 2026-05-14).** Pre-E.1 logic ignored `coa_applications.status` entirely AND short-circuited on `linked_permit_num` (Spec 84 §2.5.f names this Rule 0 as "THE 84-W12 root cause"). Combined effect: 99.4% of CoAs received `lifecycle_phase = NULL`. The fix removes Rule 0 and wires `status` reading via a 9-rule precedence (top-down, first match wins):

   | # | Match | Phase | Catalog seq |
   |---|---|---|---|
   | 1 | `status IN COA_TERMINAL_P20_STATUSES` (Closed/Complete) OR `decision IN NORMALIZED_P20_DECISIONS` (closed variants) | `P20` | 21, 22 |
   | 2 | `status IN COA_TERMINAL_P19_STATUSES` (Refused/Withdrawn/Cancelled) OR `decision IN NORMALIZED_P19_DECISIONS` (refused/withdrawn variants) | `P19` | 13, 19, 20 |
   | 3 | `status IN COA_FINAL_AND_BINDING_STATUSES` OR `decision IN NORMALIZED_FINAL_AND_BINDING_DECISIONS` | `P4` | 14 |
   | 4 | `status IN COA_POST_DECISION_STATUSES` (Await Expiry Date / Appealed / TLAB Appeal / OMB Appeal) — **reordered above R5** because post-decision states are MORE RECENT than the approval that preceded them | `P3` | 15-18 |
   | 5 | `status IN COA_APPROVED_STATUSES` (Approved / Approved with Conditions / Conditional Consent) OR `decision IN NORMALIZED_APPROVED_DECISIONS` (18 variants incl. typos) | `P3` | 10-12 |
   | 6 | `isDeferredDecisionVariant(decision)` (505 free-text variants via prefix match + outlier helper, negative-guarded against P19/P20/FaB/Approved sets) — **reordered above R7** because decision is more authoritative than scheduling status | `P2` | 9 |
   | 7 | `status IN COA_REVIEW_STATUSES` (Prepare Notice / Notice Prepared / Tentatively Scheduled / Hearing Scheduled / Hearing Rescheduled / Postponed / Deferred) | `P2` | 3-9 |
   | 8 | `status IN COA_INTAKE_STATUSES` (Application Received / Accepted) | `P1` | 1, 2 |
   | 9 | **catchall** — unrecognized status + no rule-matching decision → emit `P1` with `unmappedStatus: true` / `unmappedDecision: true` flags + `matchedStatus: null` (NOT a sentinel — drives `mapToUniversalStream` to return null → E.2 writes `lifecycle_seq = NULL` correctly). | `P1` | n/a |

   **Decision → canonical-status mapping:** when a decision-driven rule fires (R1/R2/R3/R5/R6), `matchedStatus` is derived from `NORMALIZED_DECISION_TO_STATUS_MAP` (18 explicit entries — every key in the union of decision sets) so E.2's catalog lookup always resolves to a single canonical status string.

   **Return shape** (additive — existing `{phase, stalled}` destructure preserved): `{phase, stalled, matchedStatus, matchedRule, unmappedStatus, unmappedDecision}`. `matchedRule = 0` is a documented sentinel for null/non-object input.

   **Stall detection:** forced `false` for non-{P1, P2} phases (terminal / post-decision / final-and-binding cannot stall). Rule 9 catchall → P1 DOES compute stall (an in-flight CoA with unrecognized status may still be stuck).

   **Same-Sprint Mitigation:** `classifyCoaPhaseLegacy(input)` adapter exported alongside the new function. The adapter preserves the v1 return shape `{phase: 'P1'|'P2'|null, stalled}` by narrowing P3/P4/P19/P20 → null. `scripts/classify-lifecycle-phase.js` consumes the adapter until E.2 wires the full new shape. The adapter preserves OLD RETURN SHAPE, NOT OLD BUGGY BEHAVIOR.

   **Expected outcome:** on E.2 ship, CoA `lifecycle_phase IS NOT NULL` rate climbs from 0.6% → ≥ 95%. First-run reclassification footprint: **~30,000+ CoAs** transition from NULL to their correct phase in a single chain run (dominated by ~29,000 `'Closed'`→P20 + ~4,500 terminal-P19 + ~1,000 approved/post-decision P3/P4 transitions). This is an expected first-classified-run batch — Spec 48 observer should be pre-acknowledged via manual annotation OR pinned-baseline (if Spec 48 Improvement C ships before E.2; currently queued-not-authorized).

   The catchall is critical: it converts unknown-status drift from "silent NULL regression" into "loud audit signal" surfaced via `unmapped_status_count` / `unmapped_decision_count` / `catalog_status_missing_count` / `catalog_invalid_phase_count` metrics. **Operational thresholds (set in Phase E.2 commit `[E.2-COMMIT]`):** `unmapped_status_count ≤ 3 WARN, ≤ 1 PASS`; `unmapped_decision_count ≤ 5 WARN, ≤ 3 PASS` (baseline = 2 from §2.5.b rows 52-53 outliers — row 54 routes via rule 6 `.includes('decision not made')` → P2, NOT catchall); `catalog_status_missing_count ≤ 3 WARN, ≤ 1 PASS`; `catalog_invalid_phase_count = 0 PASS, > 0 FAIL` (steady-state zero; non-zero indicates universal_stream_catalog seed corruption).

2. **`scripts/lib/lifecycle-phase.js` — granular Universal Stream emission.** New pure function `mapToUniversalStream(catalogByStatusSource, matchedStatus, source)` returns `{seq, group, block, stage, phase, bid_value}` by lookup against `universal_stream_catalog`. **3-arg signature with catalog pre-built as a Map** (caller builds once at script startup; the function is pure and side-effect-free).

   - **Key format:** `${source}:${matchedStatus}` (caller-built; matches migration 129 unique-per-source seed structure).
   - **`source` literal:** `'coa.status' | 'permits.status' | 'insp.stage'` — matches migration 128 CHECK constraint EXACTLY.
   - **Callsite invariant:** `classifyCoaPhase` always emits CoA-side `matchedStatus` → CoA callers pass `'coa.status'`.
   - **No wildcard fallback** — verified against migration 129 seed: every CoA status in §2.5.c has exactly one catalog row.
   - **Returns null when:**
     1. `matchedStatus` is null/undefined (catchall rule 9 case → E.2 writes `lifecycle_seq = NULL`)
     2. `matchedStatus` is a string but no catalog row exists (data drift)
     3. **Post-lookup phase validation:** catalog row's `.phase` is non-standard (e.g., seq 35 `'UNMAPPED→null'`, multi-value `'P7a/P7b/P7c'`) — returned null + drives E.2's `catalog_invalid_phase_count` audit metric (7th metric).
   - **JSDoc warning:** the returned `.phase` field is the catalog's DESCRIPTIVE label and may contain multi-value strings or sentinels. It is **NOT** the canonical `lifecycle_phase` write target — that comes from `classifyCoaPhase().phase` / `classifyLifecyclePhase().phase`. Catalog `.phase` is for cross-reference / audit only.

3. **`scripts/classify-lifecycle-phase.js` — extended writes.** UPDATE branches for `permits` and `coa_applications` extended to write `lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value` alongside the legacy `lifecycle_phase`. **Writes to TWO ledgers per detected change:** (a) `lifecycle_transitions` — phase-level changes (`from_phase`/`to_phase`/`from_seq`/`to_seq`) for cohort calibration consumers; (b) `lifecycle_status_history` — every status-level change (`from_status`/`to_status` including same-phase same-seq transitions like `Tentatively Scheduled` → `Hearing Scheduled`) plus snapshot of `decision` + `decision_date` for CoAs. The status-level ledger preserves the full traversal path through the 110-row Universal Stream — a CoA that goes `P2 [Tentatively Scheduled]` → `P2 [Postponed]` → `P2 [Hearing Scheduled]` → `P3 [Approved]` writes 3 rows to `lifecycle_status_history` (one per status change) and 1 row to `lifecycle_transitions` (the P2→P3 phase change). This dual-ledger design unlocks forecast cohort segmentation by *traversal pattern*, not just by phase position: "median days for CoAs that went Tentatively Scheduled → Approved directly" vs "median days for CoAs that hit Postponed first" — these are different cohorts with different lag distributions.

4. **Distribution gate pivots to seq-level Universal Stream validation.** `scripts/quality/assert-lifecycle-phase-distribution.js` extended to validate **per-seq** row-count distributions (110 bands, one per Universal Stream row) against `logic_variables.lifecycle_band_seq_<seq>_min/max` keys. Granular-first: the legacy P-code distribution check becomes a secondary cross-check during the Phase C–F transition; new authoritative validation is per-seq. **Seq-level, not block-level**, because block-level conflates outcome-diverse rows under one label — concrete example: B2.C "Refused / Binding" contains both seq 13 (#82 Refused, DENIED) and seq 14 (#83 Final and Binding, APPROVED + appeal cleared); aggregating these to one block-level band would hide refusal-rate spikes and approval-lock-in slowdowns. Same problem in post-decision blocks (Appeal Window vs TLAB Appeal). Forecast cohort key already uses `(from_seq, to_seq)` for the same reason. **Sample-size-aware tuning** addresses the previously-flagged "noisy low-count seq" concern: high-volume seqs (≥1k rows) get tight bands (±10-20%), mid-volume (100–999) ±30%, low-volume (10–99) loose floor+ceiling, single-row outliers (12 seqs in v10 with `Rows=1`) flagged INFO-only with no FAIL/WARN. Legacy `lifecycle_band_p{N}_min/max` keys retained during transition for `compute-trade-forecasts.js` P-code routing, deprecated and removed in Phase H. See active task §A.1.7 for full implementation contract.

5. **Phase distribution bands recalibrated.** `logic_variables.lifecycle_band_*_min/max` (36 keys) re-set against post-84-W12 production-shape data. Procedure:
   - Run new classifier against staging copy of full CKAN dataset.
   - Measure actual phase distribution (count per phase code).
   - Set each band's min/max to median ± 30%.
   - Iterate 2–3 times until `assert-lifecycle-phase-distribution.js` passes green for 7 consecutive runs.

6. **`scripts/compute-phase-calibration.js` — cohort key extended.** `GROUP BY` changes from `(permit_type, from_phase)` to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. Output rows multiply ~4–5×. `min_sample_size` thresholds revisited so low-cardinality cohorts don't WARN spuriously.

7. **`scripts/compute-trade-forecasts.js` — CoA source UNION.** Source SQL extended to UNION `permits` (existing) with `coa_applications` (new — filtered to non-NULL `lifecycle_phase`, `decision NOT IN ('Refused', 'Withdrawn', 'Closed')`). Anchor priority for CoA leads: `phase_started_at` → `decision_date` → `hearing_date` → application date. Bimodal routing simplified for CoA-stage: target always `bid_phase` (no work phase pre-construction).

**Universal Stream prerequisites (must complete before classifier wiring):**

Spec 84 §8.5 documented three internal-consistency BUGS in §2.5.h.2 (Universal Stream) and six QUESTIONABLE construction-sequencing assignments. These must be resolved BEFORE the classifier locks into the catalog:

- **BUGS** (block this WF — must be fixed first, as part of Phase A spec amendments):
  - seq 14 "Final & Binding" — Bid Value=0 contradicts all-Bid-✓ row
  - seq 50 "Active Inspection" — Work:excavation ✓ where it should be blank; Last Minute:excavation blank where it should be ✓ (column-alignment shift)
  - Block B9 sub-letter sequence A→B→D (missing B9.C)
  
- **QUESTIONABLE** (review and accept-or-fix during Phase A, with notes documenting any accepted compromises):
  - Roofing / Windows / Glazing fire at #121 Exterior Final (industry expects #105 area)
  - Landscaping / Paving fire at #122 Occupancy (Toronto residential often requires pre-occupancy)
  - Realtor Work=#39 Permit Closed (closure lags occupancy 30–180d; #122 is more useful)
  - Interior finish cluster (painting/flooring/tiling/trim/millwork/stone/security) all share Work=#118
  - Drywall LM=#116 (1-row data-quality variant; should be #114, 8,775 rows)
  - Electrical Work=#106 HVAC proxy (no dedicated AIC stage)

**Why pre-live changes the math:**
- No incident risk on band recalibration. Iterate freely until it fits.
- No regression-lock on permit-side `opportunity_score` byte-identity. We just need it correct.
- No "shipped but not functional" CoA-stage forecasts. Pipeline runs end-to-end on day 1.
- No double-migration of the same scripts. Touch each one once.

**Acceptance tests:**
- `bug-84-w12-regression.infra.test.ts` — 95%+ CoA `lifecycle_phase` non-NULL on synthetic fixtures.
- `granular-lifecycle.infra.test.ts` — classifier emits granular columns matching `universal_stream_catalog` lookup for every classified lead.
- `phase-distribution-band.infra.test.ts` — `assert-lifecycle-phase-distribution.js` passes on staging with recalibrated bands.
- `coa-forecast-coverage.infra.test.ts` — CoA-stage forecast coverage ≥ 80% post-pipeline-run.

### 6.8 New Scripts — Spec 47 Compliance Template

All new scripts adhere to Spec 47 §R1–§R12. Each writes to the unified `lead_id`-keyed schema.

| Script | Advisory Lock | §R7 Read | §R9 Write (atomic) | §R10 audit_table key metrics |
|---|---|---|---|---|
| `link-coa-to-parcels.js` (bundled with neighbourhood lookup + lat/lng back-fill — R2.v4) | 4201 | streamQuery `coa_applications` for rows with `parcel_linked_at IS NULL AND street_name IS NOT NULL` (R2.v4 fix — was `latitude IS NOT NULL`, which 0-rows on first run since `load-coa.js` doesn't populate lat/lng; CoA lat/lng is back-filled by this very script from parcel centroid as final pass) | All writes inside ONE `withTransaction`: (1) INSERT `lead_parcels` (lead_id = `ca.lead_id`) with `ON CONFLICT DO UPDATE` and IS DISTINCT FROM guards; (2) UPDATE `coa_applications.neighbourhood_id` via point-in-polygon on `parcels` ⋈ `neighbourhoods`; (3) UPDATE `coa_applications.latitude`/`longitude`/`parcel_linked_at` from `parcels.centroid_lat`/`centroid_lng` for newly-linked rows. Atomic — all-or-nothing per row | `coa_parcels_linked_pct`, `confidence_distribution`, `unmatched_coa_count` (threshold: ≤ 5% WARN, ≤ 1% PASS), `coa_neighbourhood_coverage_pct`, `coa_geocoded_pct` |
| `classify-coa-scope.js` | 4202 | streamQuery `coa_applications` for rows with `description IS NOT NULL AND (scope_classified_at IS NULL OR scope_classified_at < load_at)` | `withTransaction` → UPDATE `coa_applications` `(coa_type_class, project_type, scope_tags, scope_classified_at, scope_source)` | `scope_classified_pct`, `unmapped_scope_count`, `project_type_distribution` |
| `classify-coa-trades.js` | 4203 | streamQuery `coa_applications` for rows with `scope_tags IS NOT NULL AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)` (R2.v4 fix — was JOIN against `trade_mapping_rules` tier=3, but R0.8 confirms that table has 0 Tier-3 rules; in-process classifier instead) | `withTransaction` → INSERT `lead_trades` (lead_id = `ca.lead_id`) chunked (BATCH_SIZE = `floor(65535 / 8)`); ON CONFLICT DO UPDATE. Uses inline TAG_PATTERNS matrix from `scripts/lib/coa-trade-classifier.js` (twin of `classify-permits.js`'s `lookupTradesForTags`). Realtor inclusion gated on `coa_type_class='residential'` | `coa_trades_per_lead`, `default_fallback_pct` (≤ 20%), `unmapped_coa_count` (== 0 FAIL), `realtor_inclusion_pct` |
| `compute-coa-cost-estimates.js` | 4204 | streamQuery 6-table LEFT JOIN: `coa_applications ca → lead_parcels lp ON lp.lead_id = ca.lead_id → parcels p → parcel_buildings pb → building_footprints bf → neighbourhoods n → lead_trades lt LATERAL filtered ON lt.lead_id = ca.lead_id`. All JOINs use `ca.lead_id` directly (not re-derived per row — R2.v4 perf fix) | `withTransaction` → UPDATE `coa_applications` cost columns AND INSERT `cost_estimates` row keyed on `lead_id` (PK after migration 145). `cost_source='geometric'` permitted by migration 145 CHECK extension. `permit_num=NULL`/`revision_num=NULL` permitted by migration 145 DROP NOT NULL + PK swap | `cost_estimate_coverage_pct`, `null_cost_reasons` (no_parcel/no_building/no_scope_tags/no_rate), `cost_distribution_p25_p50_p75` |
| (one-shot) `migrate-to-lead-id.js` | 4205 | reads every legacy permit-keyed table | `withTransaction` per table → backfill `lead_id` column from `permit_num`+`revision_num`; promote NOT NULL after success | `rows_migrated_per_table`, `lead_id_uniqueness_violation_count` (must == 0) |

All scripts:
- §R3.5 — `RUN_AT = await pipeline.getDbTimestamp(pool)` at start
- §R4 — Zod-validate logic_variables consumed
- §R6 — `pipeline.withAdvisoryLock(pool, ID, async () => {...})`
- §R8 — Pure functions extracted to `scripts/lib/coa-classifier.js`, `scripts/lib/coa-cost-model.js`, `scripts/lib/lead-id.js` (shared derivation function; mirror in `src/lib/leads/lead-id.ts` per Spec 84 §7 dual-path)
- §R10 — `audit_table` with `phase: 42`, `name: 'CoA <step>'`, `verdict: PASS/WARN/FAIL`
- §R11 — `emitMeta` listing every read/write table.column

Advisory-lock IDs 4201–4205 use the Spec 42 + suffix convention per Spec 47 §R2.

### 6.9 Modified Existing Scripts

| Script | Change | Spec 47 impact |
|---|---|---|
| `scripts/link-coa.js` | (1) Write `permits.linked_coa_application_number` back-ref alongside existing `coa_applications.linked_permit_num`. (2) Both writes in the same `withTransaction`. | None — additional SQL in existing transaction. |
| `scripts/create-pre-permits.js` | **RETIRE.** Replace body with a one-time DELETE of any existing `permit_type='Pre-Permit'` rows; thereafter no-op. Remove from chain definitions after Phase D confirms zero PRE- rows in production. | Script becomes a no-op shim during transition. |
| `scripts/classify-permits.js` | **Phase D: NO CHANGE.** Phase C migration 143 installed mirror trigger `trg_mirror_permit_trades_to_lead_trades` (AFTER INSERT/UPDATE/DELETE on `permit_trades`) which auto-mirrors every write to `lead_trades` using the canonical lead_id derivation — zero application changes required. Phase H REKEY is deferred until the trigger is no longer load-bearing (i.e., after Phase D→G→H lifecycle work makes `lead_trades` authoritative). | None — trigger-based dual-write installed in Phase C R5.3. |
| `scripts/link-parcels.js` | REKEY writes from `permit_parcels` to `lead_parcels`. | Same. |
| `scripts/compute-cost-estimates.js` | REKEY writes on `lead_id`. Read source unchanged (`permits` JOIN trades). | Schema-level change only. |
| `scripts/compute-trade-forecasts.js` | (1) **Phase E.2 (v4 scope expansion):** add `lead_id LIKE 'coa:%'` guard BEFORE `PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)` lookup (line 45-50). CoA-P3/P4 rows must skip the ISSUED calibration path (semantically wrong — CoA-P3 is post-approval, typically 1,000+ days before permit filing; permit-P3 is pre-issuance). (2) **Phase F:** REKEY writes on `lead_id`. (3) Source-set read extended to UNION `permits` + `coa_applications` so CoA leads enter the loop. (4) Anchor-source priority list extended for CoA leads: `phase_started_at` → `decision_date` → `hearing_date` → application date. | Adds CoA branch in source SQL; output schema unchanged except for lead_id. |
| `scripts/compute-opportunity-scores.js` | REKEY on `lead_id`. JOINs unchanged. | None. |
| `scripts/update-tracked-projects.js` | (1) **Phase E.2 (v4 scope expansion):** add `lead_id LIKE 'coa:%'` guard BEFORE `PHASE_ORDINAL[lifecycle_phase]` lookup (line 189). CoA rows must route through a separate ordinal map keyed on decision status — `PHASE_ORDINAL['P3'] = -6` is permit-side pre-issuance semantic, semantically wrong for CoA-P3 (post-approval). (2) **Phase F:** REKEY on `lead_id`. Add CoA branch: stall thresholds (`coa_*_stall_days` new logic_variables), hearing-date imminent window, decision-keyed auto-archive (`Refused`/`Withdrawn`/`Closed`). | Add logic_variable keys to `logic_variables`. |
| `scripts/lib/leads/lead-id.js` (NEW shared lib) | Pure function `deriveLeadId(input)` — accepts `{permit_num, revision_num}` or `{application_number}` and returns canonical lead_id string. Used by every migration script and every classification script. Mirror at `src/lib/leads/lead-id.ts` per Spec 84 §7 dual-path. | Pure function — covered by `lead-id.logic.test.ts`. |
| `scripts/quality/assert-global-coverage.js` | Add ~10 new field-level coverage rows (CoA classification fields). Add coverage row for `lead_id IS NOT NULL` on each hot-path table. | Threshold keys added to `logic_variables`. |
| `scripts/quality/assert-entity-tracing.js` | Extend 26-hour denominator matrix to include `lead_trades` (CoA-side count), `lead_parcels` (CoA-side count), `coa_applications.scope_tags`. | Same. |
| `scripts/quality/assert-data-bounds.js` | Add CoA-side bounds: PRE-permit row count must be 0 post-retirement; lead_id format-validity check. | Same. |
| `scripts/classify-lifecycle-phase.js` | **Phase E.1 (delivered 2026-05-14):** consumer switched to `classifyCoaPhaseLegacy` (1-line `require` rename) — Same-Sprint Mitigation Option 2. Preserves 0.6% non-NULL coverage in the E.1↔E.2 gap window. **Phase E.2 (v4 scope expansion):** (1) switch back to full `classifyCoaPhase` (new return shape). (2) Extend UPDATE branches for `permits` and `coa_applications` to write `lifecycle_seq` / `lifecycle_group` / `lifecycle_block` / `lifecycle_stage` / `bid_value` + new persisted columns `matched_status` / `matched_rule` / `unmapped_status` / `unmapped_decision` alongside legacy `lifecycle_phase`. (3) Write to `lifecycle_transitions` ledger (replaces `permit_phase_transitions`) with both legacy phase codes AND new `from_seq` / `to_seq`. (4) Emit 7-metric audit_table: `unmapped_status_count`, `unmapped_decision_count`, `rule_distribution`, `phase_distribution`, `matchedStatus_distribution` (top-20 + `__other__`), `stalled_count`, `catalog_invalid_phase_count`. | E.2 requires migration adding `matched_status TEXT`, `matched_rule SMALLINT`, `unmapped_status BOOLEAN NOT NULL DEFAULT false`, `unmapped_decision BOOLEAN NOT NULL DEFAULT false` columns to `coa_applications`. Backfill via row-by-row classifier execution during E.2 first production run. |
| `scripts/lib/lifecycle-phase.js` | **Phase E.1 (delivered 2026-05-14):** (1) `classifyCoaPhase()` rewritten per §6.7 9-rule precedence (bug 84-W12 fix). New return shape: `{phase, stalled, matchedStatus, matchedRule, unmappedStatus, unmappedDecision}`. Phase domain widened to `{P1, P2, P3, P4, P19, P20, null}`. (2) `classifyCoaPhaseLegacy(input)` adapter — preserves v1 return shape `{phase: 'P1'|'P2'|null, stalled}` via P3/P4/P19/P20 → null narrowing. Used by `classify-lifecycle-phase.js` consumer until E.2. (3) New pure function `mapToUniversalStream(catalogByStatusSource, matchedStatus, source)` — 3-arg signature with catalog passed as pre-built `Map<string, UniversalStreamRow>` (key=`${source}:${matchedStatus}`). Post-lookup phase validation returns null for catalog rows with non-standard `.phase` values (drives `catalog_invalid_phase_count` audit metric). (4) New CoA-side status sets matching §2.5.c 22 values (`COA_REVIEW_STATUSES`, `COA_INTAKE_STATUSES`, `COA_TERMINAL_P19_STATUSES`, `COA_TERMINAL_P20_STATUSES`, `COA_APPROVED_STATUSES`, `COA_FINAL_AND_BINDING_STATUSES`, `COA_POST_DECISION_STATUSES`) + split decision sets (`NORMALIZED_P19_DECISIONS`, `NORMALIZED_P20_DECISIONS`, `NORMALIZED_FINAL_AND_BINDING_DECISIONS`, `NORMALIZED_DEFERRED_DECISIONS`) + `NORMALIZED_DECISION_TO_STATUS_MAP` (18 explicit entries) + `STANDARD_LIFECYCLE_PHASES` set. (5) New helpers: `normalizeCoaStatus`, `computeStallFromActivity` (hoisted from inline `classifyCoaPhase` logic), `isDeferredDecisionVariant` (negative-guarded against P19/P20/FaB/Approved sets). (6) `PHASE_ORDINAL` and `TRADE_TARGET_PHASE_FALLBACK` constants reviewed and kept. | Pure functions — covered by `lifecycle-phase.logic.test.ts` (200+ cases incl. 22-status matrix, decision-only, precedence tiebreakers, normalization edges, stall behavior, poisoned-catalog-row tests, `NORMALIZED_DECISION_TO_STATUS_MAP` completeness, two-flow regression, defensive input). |
| `scripts/compute-phase-calibration.js` | **Phase E.3 (DELIVERED 2026-05-15 commit `[E.3-COMMIT]`):** scope reframed (v2 Independent C-1 fold) — permit-side calibration UNCHANGED (legacy 2-tuple `(permit_type, from_phase)` cohorts preserved verbatim, with `, id` tiebreaker added to LAG for determinism); CoA-side granular 5-tuple cohorts `(NULL permit_type, project_type, coa_type_class, from_seq, to_seq)` added via SECOND aggregate reading `lifecycle_transitions` (no JOIN needed — E.2 writer populates the granular dimensions inline). Permit-side granular seq derivation deferred to Phase H when `permit_phase_transitions` is consolidated into `lifecycle_transitions`. Atomic temp-table swap (CREATE TEMP TABLE + TRUNCATE + INSERT FROM staging) replaces DELETE+INSERT to eliminate the transient empty-table window for downstream consumers. `audit_table.verdict` derived from row statuses per Spec 47 §R10 (fixes pre-existing hardcoded-counter bug). 15-row audit_table / 6 thresholded gates including new `coa_cohort_count` / `coa_transition_count` / `coa_type_class_null_transition_count` / `unknown_cohort_count` / `coa_project_type_coverage_pct` observability metrics. | E.3 ships migration 147 (drop legacy PK + partial unique indexes); chain manifest add (`compute_phase_calibration` now runs in BOTH `permits` and `coa` chains — observer writes audit_table to both followup files). |
| `logic_variables` (band recalibration) | All 36 `lifecycle_band_*_min/max` keys re-set against post-84-W12 production-shape staging data via iterative band-tuning (2–3 passes until distribution gate green). The 3 lifecycle cross-check thresholds (`lifecycle_cross_*_threshold`) and the staleness/freshness keys re-visited. | Spec 86 (Control Panel) seed file `scripts/seeds/logic_variables.json` updated. |

### 6.10 Cross-Spec Changes

| Spec | Change |
|---|---|
| `13_classify_permits.md` (trade classification) | Add section: "Lead-ID Output". Documents that `classify-permits.js` now writes to `lead_trades` keyed on `lead_id`, not `permit_trades`. Tier 1/2/3 logic unchanged. Tier-3 rules in `trade_mapping_rules` reused by CoA classifier (same table, filtered to `tier=3 AND match_field='description'`). |
| `41_chain_permits.md` | Remove step 18 `create_pre_permits` from chain. Update step 13 `classify_permits` description: writes `lead_trades` not `permit_trades`. Update step 9 `link_parcels` description: writes `lead_parcels`. Update step 17 `link_coa` description: also writes `permits.linked_coa_application_number`. Update steps 15/25/26/27 description: rekey on `lead_id`. Step 22 unchanged. |
| `42_chain_coa.md` (THIS SPEC) | Step Breakdown (§2) expanded from 12 to ~22 steps. Behavioral Contract (§3) extended for new outputs. Operating Boundaries (§5) extended target-files list. |
| `47_pipeline_script_protocol.md` | No change — new scripts adhere; spec is the contract. |
| `80_permit_classification.md` (permit_type_class taxonomy) | Add CoA taxonomy section — defines `coa_type_class` value set (residential/commercial/institutional/mixed) and the description-keyword decision tree. |
| `81_opportunity_score_engine.md` | Schema section: `trade_forecasts.opportunity_score` now keyed on `lead_id` (not `(permit_num, revision_num)`). Behavior unchanged. |
| `82_crm_assistant_alerts.md` | Add section: "CoA Lead Handling". Documents CoA stall thresholds, hearing-date imminent window, decision-keyed auto-archive. `tracked_projects` keyed on `lead_id`. |
| `83_Lead_cost_model.md` | Add section: "Geometric-Only Path (CoA)". Documents CoA cost estimates always `cost_source='geometric'`, Surgical Triangle without applicant-cost anchor, no Liar's-Gate equivalent. `cost_estimates` keyed on `lead_id`. |
| `84_lifecycle_phase_engine.md` | (1) Fix the 3 BUGS in §2.5.h.2 Universal Stream (per §8.5: seq 14, seq 50 column-alignment, B9.C gap). (2) Review and accept-or-fix the 6 QUESTIONABLE construction-sequencing assignments per §8.5. (3) Update §3 Behavioral Contract to document the CoA P2/P3/P4 emission rules wired by this WF and the granular-column emission (`lifecycle_seq`/`group`/`block`/`stage`/`bid_value`). (4) Move the §8 Implementation Plan content to an archive section noting that Step 1 was delivered by this WF (Spec 42); subsequent items become follow-up WFs. (5) Update §8.7 cohort-key blind spot description to reflect resolution. (6) **Resolve 84-W11 (P3/P4 namespace collision)** — CoA P3/P4 and Permit P3/P4 share string-identical phase codes. Document that downstream consumers must disambiguate via either `lifecycle_seq` (granular — preferred), `lifecycle_group` (C2/C3 vs BP5), or co-tabling with `lead_type`. Update `SKIP_PHASES` references in `link-coa.js` and any other consumer that filters by phase code. |
| `85_trade_forecast_engine.md` | Schema + inputs section: `trade_forecasts` keyed on `lead_id`. Documents CoA-stage source UNION extension, CoA-stage bimodal routing (target always `bid_phase`), and the anchor-priority extension for CoA leads (`phase_started_at` → `decision_date` → `hearing_date` → application date). |
| `76_lead_feed_health_dashboard.md` | §3.5 Lead Inspector: add CoA classification panel showing `coa_type_class`, `project_type`, `scope_tags`, `structure_type`, `estimated_cost`, CoA-side `lead_trades` rows. Inspector reads on `lead_id`. |
| `91_mobile_lead_feed.md` | §3 Backend contract: `LeadFeedItem` schema gets a `lead_id` field. CoA-side fields surface when `lead_type='coa'`. **Add lead-type filter** (`?lead_type=coa` / `?lead_type=permit` / `?lead_type=all`) so trades can view CoA-only leads (early-bid stream). **Add sort by `lifecycle_seq` ASC** for chronological CoA browsing (e.g., "show me CoAs ordered by how far through approval they are"). Mobile UI: add a "Path A (CoA-stage)" filter chip alongside existing filters. Existing `lead_type='realtor'` filter pattern is the precedent. |
| `00-architecture/01_database_schema.md` | Schema source-of-truth document. Add full CREATE TABLE statements + indexes for: `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`, `universal_stream_catalog`, `universal_stream_trade_signals`. Add new columns to existing tables: `permits` (`lead_id`, `linked_coa_application_number`, granular lifecycle columns), `coa_applications` (classification + cost + geo + granular lifecycle columns), `cost_estimates` (`lead_id`), `trade_forecasts` (`lead_id`), `tracked_projects` (`lead_id`), `phase_stay_calibration` (granular cohort key columns). Reference Spec 42 §6.6 for the canonical schema definitions; this doc is the global index. (Added per R2.v2 Worktree BUG-3.) |
| `49_global_data_completeness.md` | Coverage matrix extended: the `lifecycle_phase IS NOT NULL ≥ 95%` audit gate now applies to BOTH permits and CoAs. Add coverage rows for new `coa_applications` classification columns (scope_tags, project_type, coa_type_class, estimated_cost). |
| `00_engineering_standards.md` | No change. |
| `00_system_map.md` | Regenerate after migration (`npm run system-map`). |

### 6.11 Phased Rollout

Pre-live system — bundled approach. Spec amendments land **first** (the source of truth for the implementation that follows). Each subsequent phase encodes a coherent migration step that can be reviewed and verified in isolation.

| Phase | Includes | Gate to next phase |
|---|---|---|
| **Phase A — Spec amendments (FIRST, before any code)** | Update all affected specs per §6.10 Cross-Spec Changes: 13, 41, 42 (this spec finalizes), 47 (none, just adherence noted), 80, 81, 82, 83, 84 (3 BUGS + 6 QUESTIONABLE in §2.5.h.2 resolved; §3 Behavioral Contract updated; §8 archived), 85, 76, 91. System map regenerated (`npm run system-map`). | All spec amendments reviewed and merged. Universal Stream §2.5.h.2 is internally consistent and accepted as the catalog source for the classifier. |
| **Phase B — Schema migrations** | New tables created **additively** (`lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`, `universal_stream_catalog`, `universal_stream_trade_signals`). New columns on `coa_applications`, `permits`, `cost_estimates`, `trade_forecasts`, `tracked_projects`, `phase_stay_calibration`, `lead_analytics`. `lead_id` triggers on `permits` + `coa_applications`. Universal Stream catalog seed (110 rows) + trade-signal seed (~1,500 rows) — **table creation and seed INSERT are split into separate migration files** so seed failure cannot roll back the table. Every UP has a tested DOWN. **No backward-compat views, no table renames, no aliases — the existing `permit_trades`, `permit_parcels`, `permit_phase_transitions` tables remain live writers through Phases C–G.** Phase H handles their retirement after every consumer has been rewritten in Phase C. CHECK constraints on every `lead_id`-bearing column enforce `'^(permit|coa):.+$'`. Preflight test asserts `MAX(LENGTH(revision_num)) <= 2` on live `permits` data. | Migration applies cleanly to staging; type-checking + lint pass; `lead-id-derivation.logic.test.ts` and `lead-trades-schema-parity.logic.test.ts` and `lead-id-orphan-audit.infra.test.ts` green; re-running migrations is a no-op (idempotency); DOWNs reverse cleanly on staging copy. |
| **Phase C — `lead_id` backfill + permit-side dual-write** _(DELIVERED 2026-05-13 in 3 commits — design pivot from app-layer to trigger-based; details in §6.11.1)_ | One-shot `scripts/migrate-to-lead-id.js` (advisory lock 4205) populates `lead_id` on every existing row across `cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics`. Migrations 138-141 promote `NOT NULL` + UNIQUE on the 4 consumer tables (`tracked_projects` partial UNIQUE — NOT NULL deferred to Phase F per dual-key consideration). Migration 142 extends `lead_id_orphan_audit` view to cover the Phase C consumer tables. Migrations 143-144 install AFTER INSERT/UPDATE/DELETE triggers on `permit_trades` + `permit_parcels` that auto-mirror writes to `lead_trades` + `lead_parcels` — zero application scripts modified. Read-source rekey on the 3 compute scripts + 2 admin queries deferred to a Phase H prep WF (legacy tables remain populated via mirror trigger). | Zero rows have NULL `lead_id` (gate satisfied 2026-05-13 — R6 verifier 64/64 PASS on fresh staging); 3 consecutive daily staging runs produce sane permit-side `opportunity_score` distributions (operational gate — verified on the operator's next 3 cron runs). |
| **Phase D — CoA classification scripts** _(DELIVERED 2026-05-14 — see delivery note below)_ | `load-coa.js` extended with geocoding (DEFERRED — see §6.6.X; CKAN's CoA dataset provides no GEO_ID FK; lat/long ownership shifted to `link-coa-to-parcels.js` + `link-coa.js`). New scripts: `link-coa-to-parcels.js`, `classify-coa-scope.js`, `classify-coa-trades.js`, `compute-coa-cost-estimates.js`. New shared libs `scripts/lib/coa-scope-classifier.js`, `scripts/lib/coa-trade-classifier.js`, `scripts/lib/coa-cost-model.js`. CoA pipeline expanded from 12 to 16 steps (link-coa-neighbourhoods bundled into link-coa-to-parcels). Existing `link-coa.js` extended to write `permits.linked_coa_application_number` back-ref AND inherit permit's lat/long/ward into linked CoAs (R5.6 Part A — lead-identity continuity per §6.6.X). | DELIVERED. §6.3 coverage gates measurable post-staging-run; multi-agent reviewers per `00_engineering_standards.md`. |
| **Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension** | **E.1 (substrate — DELIVERED 2026-05-14 commit `7003683`):** `scripts/lib/lifecycle-phase.js` rewritten — `classifyCoaPhase()` per §6.7 9-rule precedence (Rule 0 removed); new `mapToUniversalStream()` pure function with post-lookup phase validation; `classifyCoaPhaseLegacy` adapter exported; 14 spec amendments + ~200 logic tests. `scripts/classify-lifecycle-phase.js` consumer switched to Legacy adapter (Same-Sprint Mitigation Option 2). Bug 84-W12 closed at substrate level. **E.2 (consumer wiring — DELIVERED 2026-05-14 commit `[E.2-COMMIT]`):** mig 146 (4 audit columns + UNIQUE INDEX on lifecycle_transitions for ON CONFLICT idempotency); classify-lifecycle-phase.js switched back to full classifyCoaPhase + writes 11 columns per row via unnest UPDATE + lifecycle_transitions INSERT in same withTransaction; defensive lead_id guards in compute-trade-forecasts.js + update-tracked-projects.js; 7-metric audit_table (5 thresholded scalars + 3 records_meta distributions). **E.2 (consumer wiring + persisted columns + downstream guards — v4 scope expansion per Gemini v3 CRITs):** (1) `coa_applications` migration adds `matched_status` / `matched_rule` / `unmapped_status` / `unmapped_decision` columns (improves diagnosability — direct queries instead of audit-log archaeology). (2) `scripts/classify-lifecycle-phase.js` UPDATE branches extended to write all granular columns, new persisted columns, and the `lifecycle_transitions` ledger; switches back to full `classifyCoaPhase` shape. 7-metric audit_table per §6.9. (3) **`lead_id LIKE 'coa:%'` guards** added to `scripts/compute-trade-forecasts.js` `PRE_CONSTRUCTION_PHASES` lookup AND `scripts/update-tracked-projects.js` `PHASE_ORDINAL` lookup — prevents CoA-P3/P4 misrouting through permit-side calibration / ordinal paths. **E.3 (DELIVERED 2026-05-15 commit `[E.3-COMMIT]`):** migration 147 drops legacy `phase_stay_calibration_pkey` PRIMARY KEY (permit_type, phase) and makes both columns nullable, with a partial unique index `phase_stay_calibration_permit_legacy_unique` on `(permit_type, phase) WHERE permit_type IS NOT NULL` restoring 2-tuple uniqueness for permit-side rows while permitting CoA-side coexistence under mig 135's 5-tuple UNIQUE INDEX. Migration 147 also adds partial composite index `lifecycle_transitions_coa_lag_idx` on `(lead_id, transitioned_at, id) WHERE lead_id LIKE 'coa:%'` to support the CoA aggregate's LAG window at scale. `scripts/compute-phase-calibration.js` rewritten — permit-side aggregate preserved (with `, id` tiebreaker added to LAG for determinism); CoA-side granular 5-tuple cohort aggregate added (reads `lifecycle_transitions`); atomic temp-table swap replaces DELETE+INSERT; bucket-count safety cap at 5000; 15-row audit_table / 6 thresholded gates with `audit_table.verdict` DERIVED from row statuses per Spec 47 §R10 (fixes pre-existing hardcoded-counter bug). `compute_phase_calibration` added to CoA chain in `scripts/manifest.json` (and `src/components/FreshnessTimeline.tsx`); now runs in BOTH chains. Plan trajectory: 5 plan-review rounds (v1=18 → v2=14 → v3=15 → v4=13 → v5 folded all 13 + PLAN LOCK); diff-stage 4-reviewer round surfaced 5 real findings folded inline (v6), 2 verified false positives, 6 deferrals filed at `docs/reports/review_followups.md` items #119-#131. **E.4 (DELIVERED 2026-05-16 commit `[E.4-COMMIT]`):** per-seq distribution bands extension to `scripts/quality/assert-lifecycle-phase-distribution.js` — 19 phase-keyed bands preserved + 110 per-seq bands (Universal Stream catalog seq 1-110) added via 220 new `lifecycle_seq_band_<N>_min/_max` keys in `logic_variables` (mig 148 INSERT...SELECT derives bounds from `universal_stream_catalog.rows_count` snapshot baseline using continuous 2-branch formula `[FLOOR(rc*0.7), CEIL(rc*1.3)+20]` for `rows_count >= 1`; NULL upper-bound for `rows_count IS NULL OR 0` is INFO-only). Migration 149 adds partial `CREATE INDEX CONCURRENTLY` on `permits.lifecycle_seq` + `coa_applications.lifecycle_seq` (filtered `WHERE lifecycle_seq IS NOT NULL`) to support the per-seq aggregate UNION ALL query. 6 new audit_table.rows aggregate counters (`seq_bands_total`, `seq_bands_passing`, `seq_bands_null_catalog_count` decomposition signal, `seq_bands_warn`, `seq_bands_failing` reserved as E.5 promotion hook (always 0 in v1), `seq_unclassified_count`); 110-key `seq_distribution` map + capped-at-50 structured `seq_violations` array + `seq_violations_truncated_count` scalar in `records_meta` (Spec 48 §3.2). Dynamic catalog query at startup (no hardcoded seq count); orphan band-key detection throws at startup with explicit DELETE recovery path; bidirectional symmetric-difference detection (`no_band_configured` for unexpected seqs in data; `expected_data_missing` for absent data on bands with min > 0). WARN-only posture on first deploy (`[E.4 WARN-ONLY POSTURE]` / `[E.4 STARTUP STATE]` prefix discipline for operator-followup triage); E.5 tightens to FAIL after 7 consecutive PASS runs on staging by routing `seqBandsWarn++` increments to `seqBandsFailing++`. Plan trajectory: 4 plan-review rounds (v1=14 → v2=8 → v3=9 → v4 PLAN LOCK per user authorization); diff-stage 4-reviewer round surfaced 2 real findings folded inline (Direction 2 catalogNullCountSeqs consistency + linked_permit_num inline comment), 2 false positives (Independent worktree procedural artifact + Gemini RUN_AT for read-only script), 10 deferrals filed at `docs/reports/review_followups.md`. **E.5 (DELIVERED 2026-05-16 commit `0d90571`):** band recalibration operational gate via **3 per-kind posture logic_variables** (mig 150) that allow operators to independently promote each violation kind from WARN routing (E.4 default) to FAIL routing: `lifecycle_seq_band_promote_to_fail_band_violation` (canonical regression-detection gate — promote first), `_no_band_configured` (operator config-gap signal — usually kept at WARN), `_expected_data_missing` (data deletion / classifier-skip signal — promote after structural-absence audit). Each flag is integer 0/1; Zod validates `.int().min(0).max(1)` at script startup (no DB CHECK constraint per Spec 47 §R4 — Zod is the source of truth; per-row CHECKs scoped by `variable_key` are not natively supported in PostgreSQL). `assert-lifecycle-phase-distribution.js` reads the 3 flags + per-kind branch routing at each violation push site + `renderPrefix(kind)` per-violation helper for mixed-posture state operator triage clarity. 3 new posture audit_table.rows entries (32 rows total) transition INFO→WARN per the kind's own flag, surfacing armed posture in `extractIssues()` DeepSeek narrative for operator visibility on every post-promotion run. Verdict cascade DERIVES from `failures[]`/`warnings[]` arrays per Spec 47 §R10 — WARN-status posture rows do NOT cascade to verdict WARN; PASS verdict remains achievable on clean runs with armed posture. `seq_violations` shape gains `posture: 'warn'|'fail'` field at write time for Phase F forward-compat (Phase F consumers self-route on this field). `emitSummary` called BEFORE `throw` (load-bearing ordering — audit_table persists to `pipeline_runs` even on FAIL runs). Pre-promotion checklist in Spec 84 §3.4 includes **3 explicit copy-pastable SQL queries** (Step 1 uses `records_meta->'audit_table'->>'verdict' = 'PASS'` — NOT `pipeline_runs.status = 'completed'` which was v2 bug; Step 2 uses `jsonb_path_query_first(...)::int` cast; Step 3 uses `jsonb_array_elements(records_meta->'seq_violations')` for `expected_data_missing` absence audit) + dual-gate cascade note + recommended per-kind promotion order + immediate + safest rollback paths. Plan trajectory: 4 plan-review rounds (v1=12 → v2=14 → v3=10 → v4 PLAN LOCK per user authorization). Phase E (E.1+E.2+E.3+E.4+E.5) COMPLETE. | E.1: `bug-84-w12-regression.logic.test.ts` green (~200 cases); typecheck + lint green. E.2: `granular-lifecycle.infra.test.ts` green; first production run reclassifies ~30,000+ CoAs; manual operator pre-ack of expected first-classified-run anomaly OR pinned baseline (Spec 48 Improvement C — queued, not yet authorized). E.3-E.5: `assert-lifecycle-phase-distribution.js` passes for 7 consecutive runs on staging; CoA `lifecycle_phase` non-NULL rate ≥ 95%. |
| **Phase F — Forecast / opportunity / CRM CoA extensions (COMPLETE)** | **F.4 (DELIVERED 2026-05-17 commit `9fec4df`):** Admin Lead Detail Inspector CoA Classification panel per Spec 76 §3.5 Cycle 8. NEW `src/components/admin/lead-inspector/CoaClassificationPanel.tsx` renders 12 sub-sections (coa_type_class chip, project_type, scope_tags, structure_type, decision timeline, dates, geometric cost, 110-position lifecycle scrubber, bid_value 0-1 bar, linked permit, cross-stream timeline, lead_trades). Cross-stream timeline 3-arm UNION ALL on `lifecycle_status_history` (active lead + ALL permit revisions via `LIKE 'permit:NUM:%'` + linked CoA `coa:APP-NUM`) with `(transitioned_at ASC, id ASC)` tiebreak per mig 127:28 BIGSERIAL. Bundled `src/lib/admin/universal-stream-catalog.json` (110 rows from `universal_stream_catalog`, generated by `scripts/generate-stream-catalog-json.js` with Zod validation + column-drift check). Cost from `coa_applications.{estimated_cost, cost_source, modeled_gfa_sqm}` direct columns (mig 133; geometric-only per Spec 83 §3.A — NO `cost_estimates` JOIN). `universal_stream_catalog` PK is `seq` (mig 128); cohort columns `lifecycle_group`/`lifecycle_block`/`lifecycle_stage`; icon columns `*_icon` VARCHAR(8). `LeadInspectCoaSchema` appended inline to existing `LeadInspectSchema`; `LeadInspectSourceSchema` extended with `linked_coa_application_number` (mig 132). Backend returns 200+`coa: null`+source-stub on missing CoA (consistent contract). UI states: `<CoaClassificationPanel>` (panel ordering: second-after-Identity when lead_type='coa', last when permit+linked_coa) / `<ClassifierPendingBanner>` (primary CoA + null; useEffect emits admin_action level=info Sentry breadcrumb) / `<OrphanLinkedCoaBanner>` (permit + missing linked CoA; data_quality level=warning breadcrumb fires at data layer). `handleNavigate(leadId)` order: addBreadcrumb → setActiveId → router.replace with URLSearchParams merge + idempotency guard. NO PostHog `admin_action_performed` emits per Spec 33 §11 read-only carve-out; NO `hashAdminUid` helper. NO migrations — substrate verified clean at v4 (mig 127/128/132/133/134 + Phase R5.6). Plan trajectory: 4 plan-review rounds (v1=28 → v2=30 → v3=~30 → v4=~28) + v4.1 micro-patch + PLAN LOCK direct per Observability+Independent convergence + 3 user-authorized design choices: full 110-position scrubber, JSON-file catalog (eliminates endpoint+cache-directive surface), 200+coa:null contract, drop hashAdminUid. **Phase F COMPLETE.** **F.3 (DELIVERED 2026-05-17 commit `632e57d`):** `scripts/compute-opportunity-scores.js` re-keyed on `lead_id` per Spec 81 §2.1 — SOURCE_SQL JOINs `cost_estimates` + `lead_analytics` on `lead_id` (mig 145 + F.2 UNION respectively, with mig 132 trigger guaranteeing format alignment); UPDATE writes via `(lead_id, trade_slug)` 2-col PK (mig 151). Per-branch counter split (`totalRowsPermit/_coa/_other`, `updatedPermit/_coa`, `orphanedPermit/Coa`, etc.) + 10 new audit rows + 19 records_meta entries; `coaFirstDeployGrace` (7-day) + `inQuietPeriod` (30-day) gates inherit F.1/F.2 baseline-quiet-period pattern. `ce.lead_id` orphan discriminant (mig 145 NOT-NULL PK) eliminates F.2-style false-positive class. Dual-emit legacy `permits_in_scope_legacy_distinct_count` audit row for back-compat (one cycle); new `forecasts_in_scope_permit/_coa` rows have operationally-correct `COUNT(*)` semantic. NO new migrations — F.1's mig 151 + Phase D's mig 145 + F.2 lead_analytics UNION already provide substrate. Asymptotic decay math + realtor carve-out + 9 Spec 81 §7 Bug Fixes ALL preserved. Plan trajectory: 4 plan-review rounds (v1=30 → v2=31 → v3=33 → v4 PLAN LOCK direct per user authorization — same plateau pattern as F.2 v3). **F.2 (DELIVERED 2026-05-16 commit `66884af`):** `scripts/update-tracked-projects.js` gains CoA branch per Spec 82 §4 — 3-tier per-status stall (`coa_stall_threshold_p2_days=90` for Hearing Scheduled, `coa_stall_threshold_postponed_days=60` for Postponed/Deferred, generic `coa_stall_threshold=30`); hearing_date-based imminent window via `coa_imminent_window_days=7`; decision-keyed + status-keyed auto-archive (terminal decisions ∪ status IN ('Complete','Closed') per v4 CRIT-DD covering 87.6% of CoAs); 3 new notification subtypes (`COA_STALLED`, `COA_HEARING_IMMINENT`, `COA_DECISION_RENDERED`) using existing notifications schema with `permit_num` polymorphism (CoA notifications store application_number; mobile app discriminates via `type LIKE 'COA_%'`). Mig 153 relaxes `tracked_projects` schema: drops FK fk_tracked_projects_permits, nullable permit_num+revision_num, partial UNIQUE `(user_id, lead_id, trade_slug) WHERE lead_id LIKE 'coa:%'`, NEW `notified_decision_rendered BOOLEAN` column (dedicated dedup flag — replaces v1 overload of last_notified_urgency). Mig 154 seeds `coa_stall_threshold_postponed_days=60` (operator-tunable per Spec 86 Control Panel). SOURCE_SQL UNION ALL with Branch A (permits, with `p.lead_id AS lead_id` resolving #118 naming standardization) + Branch B (CoA via LEFT JOIN coa_applications for single-pass orphan detection). 7 new audit rows + 5 new records_meta distributions; `coaFirstDeployGrace` + `inQuietPeriod` flags drive baseline-quiet-period operator pre-ack per F.1 runbook (extended with `## Phase F.2 additions` section). Plan trajectory: 4 plan-review rounds (v1=25 → v2=22 → v3=28 → v4 PLAN LOCK direct per user authorization after trajectory plateaued).

**F.1 (DELIVERED 2026-05-16 commit `4d58444`):** `scripts/compute-trade-forecasts.js` SOURCE_SQL UNION-extended to consume `coa_applications` via `lead_trades` JOIN; `trade_forecasts` PK swap from (permit_num,revision_num,trade_slug) → (lead_id,trade_slug) via mig 151 (drops FK fk_forecasts_permit, makes permit_num+revision_num nullable, promotes uniq_trade_forecasts_lead_id_trade UNIQUE INDEX from mig 139 to PRIMARY KEY USING INDEX — metadata-only); CoA anchor priority (`lifecycle_transitions.MAX(transitioned_at)` → decision_date → hearing_date → first_seen_at) with per-anchor finalCalMethod labeling; CoA bimodal simplified to target_window='bid' ALWAYS; 5-tuple cohort lookup against `phase_stay_calibration WHERE permit_type IS NULL` keyed on `from_seq` matching `lifecycle_seq` (5-level fallback chain); audit-verdict gate against most-recent `compute_phase_calibration` permits-chain run (within `coa_gate_calibration_window_days` default 7) — fails closed on every non-PASS state including failed runs; E.2 defensive coa:% skip guard REMOVED; records_total per Spec 47 §11.1 sums permit + CoA forecast subjects; 11 new audit_table.rows entries + 4 new records_meta distributions (`anchor_sources_coa`, `skipped_distribution_by_lifecycle_group` for §11.4 cohort traceability, `forecasts_computed_permit`/`_coa`, `total_rows_permit`/`_coa`); CoA stale-purge in dual-CTE form (`live_coa_anchors` + `live_coa_forecasts`) — eliminates correlated subqueries inside DELETE; permit stale-purge gains `tf.lead_id LIKE 'permit:%'` guard to avoid NULL=NULL silent drops post-mig 151; lead_id pre-validation regex for both coa:/permit: surfaces format drift via `failed_sample`. Migration 152 seeds 2 logic_variables (`coa_lifecycle_transition_stale_days=180` snowplow staleness gate + `coa_gate_calibration_window_days=7` gate freshness). 30-day quiet-period status classification + `coaFirstDeployGrace` first-deploy detection for `coa_audit_gate_status` / `coa_anchor_fallback_pct` / `coa_anchor_stale_lifecycle_transition_count` audit rows; operator runbook `docs/runbook/F1_baseline_quiet_period.md` codifies the 7-day + 30-day baseline-quiet-period annotation protocol. Plan trajectory: 4 plan-review rounds (v1=16 → v2=18 → v3=14 → v4 PLAN LOCK per user authorization). **F.2** (update-tracked-projects.js CoA branch — stall thresholds, hearing-date imminent window, decision-keyed auto-archive), **F.3** (compute-opportunity-scores.js CoA consumer), **F.4** (Lead Inspector CoA panel — Spec 76 §3.5 UI) follow next. | End-to-end staging run produces actionable CoA lead in admin Lead Detail Inspector with non-NULL key fields; CoA-stage forecast coverage ≥ 80%. |
| **Phase G — PRE-permit retirement (COMPLETE)** | **G.1 (DELIVERED 2026-05-17 commit `3944f88`):** `scripts/create-pre-permits.js` converted to idempotent DELETE-only shim covering 10 tables (9 children + parent `permits`) — `lead_trades` / `lead_parcels` / `tracked_projects` / `permit_history` / `permit_products` / `permit_phase_transitions` / `lifecycle_transitions` / `permit_trades` / `permit_parcels` / `permits`. Single transaction with FK-safe ordering (children first; RESTRICT FKs respected; CASCADE FKs DELETEd explicitly for audit observability per v2-Q1 "no reliance on CASCADE"). emitSummary `records_total = preDeleteCount` (Spec 47 §11.1 — scope evaluated, not deleted_count); per-table `result.rowCount`s in `audit_table.rows` (10 entries). Verdict: `'PASS'` when N>0 deletions; `'SKIP'` when no-op — distinguishes "cleanup ran" from "already complete" in `pipeline_runs.audit_table`. emitMeta read = `permits.{permit_num, permit_type}`; writes = all 10 tables with their respective key columns (`tracked_projects` keyed on `lead_id` post-Phase C rekey). `scripts/quality/assert-pre-permit-aging.js` converted to no-op shim emitting `verdict='SKIP'` (vs PASS — distinguishes retired step from successful assertion in observe-chain 7-day baseline). `scripts/quality/assert-data-bounds.js` gains `permits_pre_permit_count == 0` FAIL gate INSIDE BOTH `if (runPermitChecks)` AND `if (runCoaChecks)` blocks (duplicated query — disjoint chain-scoped guards preclude shared variable; defense-in-depth per v2-Q2). `scripts/quality/assert-global-coverage.js` strips 3 vestigial CoverageRow entries (Permits Step 17 + CoA Step 5 `create_pre_permits` + CoA Step 6 `assert_pre_permit_aging`). `src/lib/leads/lead-detail-query.ts` gains CoA branch (`COA_LEAD_DETAIL_SQL` + `toCoaLeadDetail`): reads `coa_applications` directly LEFT JOINed with `neighbourhoods` + `trade_forecasts WHERE lead_id LIKE 'coa:%'` + 2 LATERAL subqueries for `is_saved` (AS `saved` alias matching permit-side convention) + `competition_count`. Partial CoA cost map (v2-Q3): `{ estimated, modeled_gfa_sqm }` populated from `coa_applications.{estimated_cost, modeled_gfa_sqm}`; `{ tier, range_low, range_high }` returned as null. Route `/api/leads/detail/[id]` dispatches CoA-prefix leads to the CoA branch (was 404 pre-Phase G). Spec amendments: Spec 41 step list drop · Spec 49 §2 step counts (permits 26, CoA 10) + §4 leading sentence (vestigial filter note) + 3 row deletions · Spec 91 §4.3.1 line 170 (drop "currently unimplemented" caveat). Tests: 3 new infra tests + 3 updates + 1 deletion. **G.2 (DELIVERED commit `0de4cab`):** manifest-only diff — `create_pre_permits` removed from `chains.permits` (index 17) AND `chains.coa` (index 4); `assert_pre_permit_aging` removed from `chains.coa` (index 5). Both shim scripts `git rm`'d. `quality.infra.test.ts` file-existence assertions removed. **Plan trajectory:** 2 plan-review rounds + 4 user design decisions (v1-Q1=bundle, v1-Q2=amend, v1-Q3=two-commit, v2-Q1=all-5-children, v2-Q2=both-audits, v2-Q3=partial-cost-map, v2-Q4=defer-hidden-consumers). 7 hidden consumers (FilterPanel, FreshnessTimeline, /api/permits routes, dashboard stat, admin pipelines registry, control-panel resync, src/lib/coa/pre-permits.ts) deferred to Phase G.1 follow-up WF2 per v2-Q4. **Phase G COMPLETE.** | Zero PRE-permit rows; `assert-data-bounds` `permits_pre_permit_count` row = PASS on both chains; no broken queries; CoA lead-detail returns 200 + valid envelope. |
| **Phase I — E.2 follow-up + observability hardening** _(NEW 2026-05-14; captures deferrals surfaced by E.2 diff-stage 4-reviewer round — see docs/reports/review_followups.md #110-#118; **I.1 DELIVERED 2026-05-18 commit `d579bc0`** — lifecycle_status_history writers in 3 scripts + mig 155 + verdict cascade fix; **I.1.1a DELIVERED 2026-05-18 commit `2d5dd43`** — `.db.test.ts` semantic verification + Spec 42/47/48 amendments + operator runbook for first-deploy spike. **Phase I.1.1b DELIVERED commit `73b257b`** — Spec 84 §3.7 NEW (matchedStatus contract + 18-rule precedence); `classifyLifecyclePhase()` extended; `buildPermitUpdateSQL` refactored to unnest array form (mirror CoA pattern, phase_started_at CASE preserved); dirty SELECT predicate adds `OR matched_rule IS NULL` for first-deploy backfill; permit-side classifier ledger writer activated; 3 NEW audit rows (`permit_unmapped_status_count` absolute-threshold via `computeWarnableAuditStatus`, `permit_code_drift_count` INFO, `permit_first_deploy_grace`); 2 NEW records_meta distributions (`permit_rule_distribution`, `permit_matched_status_top20`); `permitFirstDeployGrace` startup query mirrors F.1 pattern; runbook updated DORMANT → ACTIVE with WAL capacity ceiling correction)_ | (1) **`lifecycle_status_history` writes** (Gemini E.2 diff CRIT 1; spec deviation from §6.7): extend `classify-lifecycle-phase.js` to write status-level transitions to `lifecycle_status_history` for BOTH permit-side (CKAN status changes via load-permits.js) AND CoA-side (via load-coa.js + classify-lifecycle-phase.js for derived transitions). Schema already exists per §6.6.B. Three writers per detected_by column. (2) **`records_total` observability discrepancy** (Observability E.2 diff F2): `classify-lifecycle-phase.js` emits `records_total = dirtyPermitsCount` (permits-only); CoA processing volume (~33K on first E.2 run) is invisible to Spec 48 observer's `avg_records_total` baseline, producing false-positive velocity anomalies. Either change `records_total = dirtyPermitsCount + dirtyCoAsCount` (preferred — matches actual workload) OR document explicitly in operator pre-ack runbook. (3) **`lead_id` vs `permit_lead_id` guard-anchor naming inconsistency** (Observability E.2 diff Phase F readiness): `compute-trade-forecasts.js` defensive guard checks `row.lead_id`; `update-tracked-projects.js` checks `row.permit_lead_id`. Phase F UNION source SQL must standardize the column name before activating both guards — pick one anchor and update the other script. (4) **`matched_rule IS NULL` defensive hardening** (DeepSeek E.2 diff MED 1): backfill predicate `OR ca.matched_rule IS NULL` relies on substrate always setting `matched_rule` to 0-9; add runtime assertion `if (result.matchedRule == null) throw` in `classify-lifecycle-phase.js` to fail fast if a future substrate bug introduces null. (5) **`computeWarnableAuditStatus` helper consolidation**: extract to `scripts/lib/audit-status.js` if reused across other scripts (currently only `classify-lifecycle-phase.js`). (6) **Operator pre-ack runbook**: codify the first-classified-run annotation procedure in `docs/runbook/` so future operators don't need to re-derive expected distribution numbers from spec text. | All 6 deferral items addressed; updated pre-commit hook validation for status-level history coverage; observer false-positive rate on classify-lifecycle-phase step ≤ 1 per 7-day window. |
| **Phase H — Legacy column drop + consumer read-source rekey (Phase C deferrals)** | **Phase H prerequisite work (carried over from Phase C R5.4-R5.6 deferral, 2026-05-13):** rekey the 3 compute scripts (`scripts/compute-cost-estimates.js`, `scripts/compute-trade-forecasts.js`, `scripts/compute-opportunity-scores.js`) + `scripts/update-tracked-projects.js` to read `lead_trades`/`lead_parcels`/lead_id-keyed `cost_estimates` instead of legacy tables; rekey `src/lib/leads/lead-detail-query.ts` + `lead-inspect-query.ts` JOINs from `(permit_num, revision_num)` to `lead_id`; rekey the 10+ src/ readers of `permit_trades`/`permit_parcels` enumerated in active task §C.7 (timing.ts, get-lead-feed.ts, sync/process.ts, quality/metrics.ts, admin/stats/route.ts, permits/route.ts, permits/geo/route.ts, permits/[id]/route.ts, analytics/queries.ts, market-metrics/queries.ts). **Then:** DROP `permit_num`/`revision_num` from `cost_estimates`, `trade_forecasts`, `tracked_projects`. Drop `permit_phase_transitions`/`permit_trades`/`permit_parcels` table aliases (mirror triggers from Phase C migrations 143-144 also dropped). Drop `scripts/create-pre-permits.js` script file. | All consumer queries reference `lead_id` only; legacy aliases unused; mirror triggers retired (no longer needed once consumers stop reading legacy tables). |

#### 6.11.1 Per-Phase Execution References

Each phase below lists the specs to read first (design context), the key files that will be touched (implementation surface), and the protocol specs that govern the work (Spec 47 compliance, engineering standards, dual-path mirroring, etc.). A developer starting any phase should read the spec column top-to-bottom before opening any file in the file column.

**Phase A — Spec amendments (FIRST)**
- *Specs to read/amend:* `13_classify_permits.md`, `41_chain_permits.md`, `42_chain_coa.md` (this), `49_global_data_completeness.md`, `76_lead_feed_health_dashboard.md`, `80_permit_classification.md`, `81_opportunity_score_engine.md`, `82_crm_assistant_alerts.md`, `83_Lead_cost_model.md`, `84_lifecycle_phase_engine.md` (§2.5.h.2 BUGS + §3 Behavioral Contract + 84-W11 namespace + §8 archive), `85_trade_forecast_engine.md`, `91_mobile_lead_feed.md`, `00_engineering_standards.md` (no change — reference only), `00_system_map.md` (regenerate)
- *Key files:* `docs/specs/01-pipeline/*.md`, `docs/specs/02-web-admin/*.md`, `docs/specs/03-mobile/*.md`, `docs/reports/spec_84_universal_stream_v9.csv` (becomes seed source for `universal_stream_catalog`)
- *Protocols:* `00_engineering_standards.md` §Multi-Agent Review cadence (Gemini + DeepSeek + worktree per spec amendment); `47_pipeline_script_protocol.md` (no script changes — adherence noted in subsequent phases)

**Phase B — Schema migrations**
- *Specs to read:* `47_pipeline_script_protocol.md` §10 (migration protocol); `41_chain_permits.md` + `42_chain_coa.md` (table ownership); `83_Lead_cost_model.md` (cost_estimates schema); `85_trade_forecast_engine.md` (trade_forecasts schema); `84_lifecycle_phase_engine.md` (universal_stream_catalog seed source); `80_permit_classification.md` (permit_type_class column)
- *Key files:* `migrations/NNN_add_lead_id_columns.sql`, `migrations/NNN_create_lead_trades.sql`, `migrations/NNN_create_lead_parcels.sql`, `migrations/NNN_create_lifecycle_transitions.sql`, `migrations/NNN_create_universal_stream_catalog.sql`, `migrations/NNN_create_universal_stream_trade_signals.sql`, `migrations/NNN_extend_coa_applications.sql`, `migrations/NNN_extend_permits.sql`, `migrations/NNN_extend_phase_stay_calibration.sql`, `migrations/NNN_seed_universal_stream_catalog.sql`, DOWN migrations for each
- *Protocols:* Spec 47 §10 (migration UP/DOWN parity), `00_engineering_standards.md` §3 Database (DECIMAL not float, IS DISTINCT FROM guards, CHECK constraints documented)

**Phase C — `lead_id` backfill + permit-side dual-write** (DELIVERED 2026-05-13; design pivot from app-layer to trigger-based — see note at end)
- *Specs to read:* Spec 47 §R1–§R12 (full skeleton — every new and modified script); `81_opportunity_score_engine.md` + `83_Lead_cost_model.md` + `85_trade_forecast_engine.md` (schemas now lead_id-keyed)
- *Key files (as delivered):*
  - `scripts/lib/leads/lead-id.js` (NEW shared `deriveLeadId` — JS side)
  - `src/lib/leads/lead-id.ts` (NEW TS mirror per Spec 84 §7 dual-path)
  - `scripts/migrate-to-lead-id.js` (NEW one-shot, advisory lock 4205) — backfills lead_id on `cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics`
  - `migrations/138-141` (NOT NULL + UNIQUE promotion on the 4 consumer tables; `tracked_projects` UNIQUE is partial — NOT NULL on `lead_id` deferred to Phase F because Phase D may insert CoA-side rows whose `lead_id` remains NULL until classification completes. WF3 2026-05-14 note: the `lead_type`-column discriminator referenced in earlier R2 design rationale was never added by any migration; the R5.3 trigger-based dual-write pivot (commit `872ec73`) made the column unnecessary — `lead_id` prefix encoding is the canonical permit/CoA distinction.)
  - `migrations/142` (extend `lead_id_orphan_audit` view to cover Phase C consumer tables)
  - `migrations/143-144` (mirror triggers — `permit_trades` → `lead_trades`, `permit_parcels` → `lead_parcels` — the DELIVERED dual-write mechanism; zero application scripts modified)
- *Deploy order:* `scripts/migrate-to-lead-id.js` must run successfully BEFORE migrations 138-141 are applied (their pre-checks enforce this with `RAISE EXCEPTION` on NULL lead_id rows; the script + migrations chained together form the Phase C deploy contract).
- *Protocols:* Spec 47 §R1–§R12 (`migrate-to-lead-id.js` only — no other new scripts); Spec 84 §7 (TS↔JS dual-path parity for `lead-id.js`); `00_engineering_standards.md` §Multi-Agent Review (3-reviewer per R5.X group)
- *Design pivot note (2026-05-13):* the original plan called for app-layer dual-write across 6 writer scripts (`classify-permits.js`, `link-parcels.js`, `backfill-realtor-permit-trades.js`, `reclassify-all.js`, `seed-parcels.js`, `create-pre-permits.js`) plus read-source swap in 3 compute scripts + 2 admin queries. R5.3 design review (worktree-driven) identified that the simpler design was AFTER INSERT/UPDATE/DELETE triggers on `permit_trades` + `permit_parcels` that auto-mirror to `lead_trades` + `lead_parcels` — zero application code changed, all writers covered, "missed writer" risk eliminated. The 5 compute/UI read-source rekeys deferred to a dedicated Phase H prep WF (legacy tables remain populated via mirror trigger; consumer rekey becomes "preparation for Phase H drops", not a Phase C gate).

**Phase D — CoA classification scripts**
- *Specs to read:* `42_chain_coa.md` (this — §3 Behavioral Contract, §6.6 schema, §6.8 script catalog); `13_classify_permits.md` (Tier-3 description-only mode); `80_permit_classification.md` (CoA taxonomy section added in Phase A); `83_Lead_cost_model.md` (geometric-only path for CoA); Spec 47 §R1–§R12
- *Key files:* `scripts/load-coa.js` (EXTEND with geocoding), `scripts/link-coa-to-parcels.js` (NEW, advisory lock 4201, bundled with neighbourhood lookup), `scripts/classify-coa-scope.js` (NEW, advisory lock 4202), `scripts/classify-coa-trades.js` (NEW, advisory lock 4203), `scripts/compute-coa-cost-estimates.js` (NEW, advisory lock 4204), `scripts/lib/coa-classifier.js` (NEW shared lib), `scripts/lib/coa-cost-model.js` (NEW shared lib), `scripts/link-coa.js` (EXTEND with `permits.linked_coa_application_number` back-ref write), `scripts/manifest.json` (register new chain steps)
- *Protocols:* Spec 47 §R1–§R12 per new script; Spec 84 §7 (TS↔JS dual-path for any shared classification logic); `00_engineering_standards.md` §Multi-Agent Review (R0 plan review + R8 final review)

**Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension**
- *Specs to read:* `84_lifecycle_phase_engine.md` (§3 Behavioral Contract — newly amended in Phase A; §2.5.h Universal Stream — BUGS resolved; §6 bug entries 84-W11 + 84-W12); `86_master_configuration_list.md` (`logic_variables` band keys); `80_permit_classification.md` (P3/P4 namespace per Phase A 84-W11 resolution); `47_pipeline_script_protocol.md` §R1–§R12
- *Key files:* `scripts/lib/lifecycle-phase.js` (`classifyCoaPhase()` fix; new `mapToUniversalStream()` function; PHASE_ORDINAL preserved), `src/lib/classification/lifecycle-phase.ts` (TS mirror per Spec 84 §7), `scripts/classify-lifecycle-phase.js` (extended writes to granular columns + `lifecycle_transitions` ledger), `scripts/compute-phase-calibration.js` (GROUP BY cohort key extended), `scripts/seeds/logic_variables.json` (recalibrated bands), `scripts/quality/assert-lifecycle-phase-distribution.js` (validates against new bands)
- *Protocols:* Spec 47 §R1–§R12; Spec 84 §7 (TS↔JS dual-path is critical — classifier is the highest-impact dual-path script); band recalibration via 7-consecutive-green-runs gate (Phase E exit criterion)

**Phase F — Forecast / opportunity / CRM CoA extensions + UI**
- *Specs to read:* `85_trade_forecast_engine.md` (CoA-stage routing simplification + UNION source SQL); `81_opportunity_score_engine.md` (CoA-stage scoring); `82_crm_assistant_alerts.md` (CoA stall thresholds + hearing-date imminent window); `76_lead_feed_health_dashboard.md` §3.5 (Lead Inspector CoA panel); `91_mobile_lead_feed.md` (lead_type filter + lifecycle_seq sort + Path A chip)
- *Key files:* `scripts/compute-trade-forecasts.js` (UNION source extension), `scripts/compute-opportunity-scores.js`, `scripts/update-tracked-projects.js` (CoA branch), `src/components/admin/lead-inspector/CoaClassificationPanel.tsx` (NEW UI), `src/lib/leads/lead-inspect-query.ts` (CoA panel data layer), `src/lib/admin/lead-schemas.ts` (CoA schema fields), `mobile/src/components/feed/FlightCard.tsx` (CoA path-A chip), `mobile/src/lib/schemas.ts` (CoA mirror), `src/app/api/leads/feed/route.ts` + `mobile/src/api/*` (lead_type filter + lifecycle_seq sort), `scripts/quality/assert-global-coverage.js` + `assert-entity-tracing.js` (new coverage rows)
- *Protocols:* Spec 47 §R1–§R12 (pipeline scripts); `00_engineering_standards.md` §UI Layout (admin desktop-first md: breakpoints; mobile mobile-first); Spec 84 §7 (TS↔JS schema parity for `lead-schemas.ts` ↔ `mobile/src/lib/schemas.ts`)

**Phase G — PRE-permit retirement**
- *Specs to read:* `42_chain_coa.md` §6.2 Background (PRE-permit mechanism description); `41_chain_permits.md` step 18 removal; current `scripts/create-pre-permits.js` source for the retirement logic
- *Key files:* `scripts/create-pre-permits.js` (RETIRE — convert to one-shot DELETE shim), `scripts/manifest.json` (remove step from both chains), `scripts/quality/assert-data-bounds.js` (add `permit_type='Pre-Permit'` count = 0 gate), `src/lib/leads/lead-detail-query.ts` (switch to read CoA leads from `coa_applications` directly via `lead_id LIKE 'coa:%'`)
- *Protocols:* Spec 47 §10 (one-shot migration safety — advisory lock during DELETE pass; runs after `link-coa.js` quiesces); operational runbook: verify zero in-flight CoA→Permit linkages during cutover window

**Phase H — Legacy column drop + Phase C R5.4-R5.6 deferrals**
- *Specs to read:* `41_chain_permits.md` (consumer audit — which queries still reference `permit_num`/`revision_num` as PK); BI tools / analyst query inventory (external dependency audit — required gate); Spec 47 §R1-R12 for the pipeline-script rekeys carried over from Phase C
- *Key files (Phase C R5.4-R5.6 carry-over — read-source rekeys, do these FIRST):*
  - `scripts/compute-cost-estimates.js` (REKEY reads to `lead_trades` + `lead_parcels`; writes `cost_estimates` keyed on `lead_id`)
  - `scripts/compute-trade-forecasts.js` (REKEY)
  - `scripts/compute-opportunity-scores.js` (REKEY)
  - `scripts/update-tracked-projects.js` (REKEY permit-side; CoA branch landed in Phase F)
  - `src/lib/leads/lead-detail-query.ts` (REKEY JOINs from `(permit_num, revision_num)` to `lead_id`)
  - `src/lib/leads/lead-inspect-query.ts` (REKEY)
  - 10+ `src/` readers (timing.ts, get-lead-feed.ts, sync/process.ts, quality/metrics.ts, admin/stats/route.ts, permits/route.ts, permits/geo/route.ts, permits/[id]/route.ts, analytics/queries.ts, market-metrics/queries.ts) — REKEY individually with per-file verification
- *Key files (column + table drops, do these LAST after all rekeys verified):*
  - `migrations/NNN_drop_legacy_permit_keys.sql` (DROP `permit_num`/`revision_num` from `cost_estimates`, `trade_forecasts`, `tracked_projects`)
  - `migrations/NNN_drop_legacy_alias_tables.sql` (drop `permit_phase_transitions` / `permit_trades` / `permit_parcels` tables; auto-drops the mirror triggers from Phase C migrations 143/144)
  - `scripts/create-pre-permits.js` (DELETE file entirely)
- *Protocols:* Spec 47 §10 (migration UP/DOWN parity); `00_engineering_standards.md` §3 Database (consumer audit before destructive schema change — 30-day soak gate); zero non-archive query references `permit_num`/`revision_num` post-rekey

#### 6.11.2 Template Extraction Pattern for Phase D/E Scripts

The new scripts in Phase D (CoA classifier, parcel linker, cost estimator) and Phase E (lifecycle engine extension) have natural twins in the existing codebase. **The right approach is template extraction + parametrization, not greenfield re-writing.** Every twin has already absorbed the lessons of Spec 47 §R1–§R12 (advisory locks, getDbTimestamp, withTransaction envelopes, Zod validation, streamQuery, batched UPSERT with IS DISTINCT FROM guards, audit_table observability, emitMeta declarations). Copy and parametrize — do not re-derive.

**Concrete pairings:**

| New Phase D/E script | Existing twin (copy as skeleton) | What's reusable | What changes |
|---|---|---|---|
| `link-coa-to-parcels.js` | `scripts/link-parcels.js` | Spec 47 §R1–R12 skeleton, advisory-lock pattern, `withAdvisoryLock` + `withTransaction` envelope, `streamQuery` for source-set, batched UPSERT with IS DISTINCT FROM, audit_table rows, `emitMeta` declarations, parcel-spatial-match cascade (exact → fuzzy → buffer) | Source table swap (`coa_applications` not `permits`), key swap (`application_number` → `'coa:' \|\| application_number` lead_id), output table swap (`lead_parcels` not `permit_parcels`) |
| `classify-coa-scope.js` | `scripts/classify-scope.js` | Description-keyword pattern matching, Zod logicVars schema, the TAG_PATTERNS regex matrix structure, propagation pass for same-address rows, audit_table coverage breakdown | New keyword sets per `coa_type_class` (residential/commercial/institutional/mixed), fewer input fields (no `permit_type`/`work`), output columns differ |
| `classify-coa-trades.js` | `scripts/classify-permits.js` | The 3-tier rule cascade against `trade_mapping_rules`, `shouldAppendRealtor()` gating, dual-path mirror pattern (Spec 84 §7), audit per-class breakdown | Filter rules to `tier=3 AND match_field='description'` only (no Tier 1 `permit_type` or Tier 2 `work` field for CoAs), realtor gate uses `coa_type_class` instead of `permit_type_class` |
| `compute-coa-cost-estimates.js` | `scripts/compute-cost-estimates.js` | Surgical Triangle math, `trade_sqft_rates` lookup, `scope_intensity_matrix` allocation, JSONB `trade_contract_values` writer, audit_table cost-distribution metrics | Skip Liar's Gate (no applicant cost on CoA), always set `cost_source='geometric'`, source from `coa_applications` JOIN `lead_parcels` JOIN `parcel_buildings` |
| `compute-trade-forecasts.js` (extension) | itself — extend in place | All current logic preserved byte-for-byte for permit-side | UNION source SQL to add CoA leads, bimodal-routing simplification for CoA-stage (target always `bid_phase`), anchor priority extended |
| `migrate-to-lead-id.js` | `scripts/seed-coa.js` (one-shot pattern) OR `scripts/backfill-realtor-permit-trades.js` (idempotent backfill pattern) | One-shot script structure, advisory-lock during destructive ops, audit_table for row-count verification, NOT-NULL promotion via `ALTER TABLE` after backfill | Touches multiple tables sequentially; specific to one-time data migration |

**The mechanics — for each new Phase D/E script:**

1. **Copy the most-similar existing script** as a skeleton (e.g., `cp scripts/link-parcels.js scripts/link-coa-to-parcels.js`).
2. **Rename the slug**, change the advisory lock ID to the Spec 42 §6.8 allocated ID (4201–4205), update the `SPEC LINK` header.
3. **Swap the source SQL** — change `permits` → `coa_applications`, add the `lead_id` derivation.
4. **Swap the output table** — change `permit_parcels` → `lead_parcels`, `permit_trades` → `lead_trades`, etc.
5. **Adapt the Zod schema** — usually the same `logic_variables` keys carry over; sometimes new ones (per Spec 42 §6.6 + §6.11.1 Phase D `Key files`).
6. **Inherit observability for free** — `audit_table`, `emitSummary`, `emitMeta`, IS DISTINCT FROM guards, batched UPSERT all carry over unchanged.
7. **Add the CoA-specific branch** — e.g., for `classify-coa-trades.js`, restrict to Tier 3 + use `coa_type_class` in `shouldAppendRealtor()`; for `compute-coa-cost-estimates.js`, branch out of Liar's Gate.
8. **Inherit tests** — copy the twin's logic-test file (e.g., `link-parcels.logic.test.ts → link-coa-to-parcels.logic.test.ts`), adapt fixtures to CoA inputs and `lead_id`-keyed outputs.

**Why this works:** The codebase already encodes this pattern. `scripts/compute-phase-calibration.js` (~150 lines) is mostly Spec 47 boilerplate + ~20 lines of unique GROUP-BY logic. The CoA twins will be similar — roughly 150 lines of borrowed Spec 47 scaffolding + 30 lines of CoA-specific logic. Every learning baked into the existing scripts (observability, atomicity, lock discipline, idempotency, dual-path mirroring) flows through for free. The risk of greenfield re-derivation is that Spec 47 violations (forgetting the advisory lock, swallowing errors, using `new Date()` for DB timestamps, missing IS DISTINCT FROM) creep back in via inattention.

### 6.12 Out of Scope (Explicitly Deferred to Follow-up Work)

The bundled approach pulls most of the original out-of-scope list back in. What remains genuinely out of scope:

1. **`link-coa-similar.js`** — propagation of `scope_tags` between sibling CoAs at the same address (analog of permit-side `link-similar.js` step 12). Deferred to a v2 spike if the CoA scope-tag coverage in audit_table reveals a meaningful gap. **Note: this is DISTINCT from CoA→Permit linkage** — that linkage is delivered in this WF via the existing `link-coa.js` script (CoA chain step 4) which is extended to also write the `permits.linked_coa_application_number` back-reference.
2. **`classify-coa-builders.js`** — extraction of builder/applicant entities from CoA applicant data. CoA applicants are typically homeowners or designers (not builders), so signal value is low. Deferred.
3. **§8.5 QUESTIONABLE construction-sequencing assignments** — the 6 items where the Universal Stream's trade Work-row assignments are defensible-but-suboptimal (roofing/windows fire at #121, landscaping at #122, etc.). Reviewed and accepted-with-notes during Phase A; revisiting requires construction-industry input and a separate spec amendment.
4. **Predictive permit-type / approval-odds classifiers.** Predicting which permit_type will follow a given CoA, or the probability a CoA will be approved/refused, are both separate ML/heuristic builds. Outside this WF.

### 6.13 Open Decisions (Block WF Plan-Lock)

1. **Classifier method** for `classify-coa-scope.js` — keyword/regex heuristics, LLM-per-row, or hybrid. Recommendation: heuristic v1 with audit_table tracking ambiguous-classification rate; LLM as v2 if heuristic accuracy < 80%.
2. **Geocoding** — bundle into `load-coa.js` at ingest, or run as a separate step. Recommendation: bundle into `load-coa.js` (existing script already handles row enrichment).
3. **`lead_analytics.lead_key` rename to `lead_id`** — for naming consistency across hot-path tables, or leave as-is to avoid breaking external SQL queries. Recommendation: leave as-is with an alias view (`lead_analytics_v2` exposing `lead_id`).
4. **Band recalibration depth** — how many tuning passes before declaring the distribution stable (3 vs 7 consecutive green runs). Recommendation: 7 to absorb day-of-week ingest variance.

**Resolved decisions (no longer open):**
- Dual-identity (was Q1): **Option C — `lead_id` unified tables.**
- Lifecycle engine migration timing: **bundled into this WF** (pre-live, no operational risk to separating).
- Bug 84-W12 timing: **bundled** (Phase E).
- Legacy column cleanup (was Q6): **drop now** (Phase H, not deferred).
- `link-coa-similar.js` (was Q4): **deferred** to v2 — CoA→Permit linkage is delivered separately via existing `link-coa.js` (Phase D).
- `classify-coa-builders.js` (was Q5): **deferred**.

</implementation>
