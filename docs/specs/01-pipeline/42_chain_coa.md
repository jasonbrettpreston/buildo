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
| 13 | `classify_permits` (trade matrix via `trade_mapping_rules`) | YES — NEW `classify-coa-trades.js` | **The previously-omitted "trade tags" step.** Uses `trade_mapping_rules` table (mig 005). The matrix has 3 tiers: Tier 1 keys on `permit_type` (DOES NOT APPLY to CoA — no permit_type), Tier 2 keys on `work` field (DOES NOT APPLY to CoA — no work field), Tier 3 keys on `description` ILIKE patterns (APPLIES — CoA has description). CoA classifier uses **tier-3 rules only** with the same `trade_mapping_rules` table — no separate matrix needed. Outputs to **unified `lead_trades` table** (lead_id = `'coa:' || application_number`) per §6.6.B Option C. Includes realtor-inclusion gate (`shouldAppendRealtor()` adapted to use `coa_type_class` + CoA description in place of `permit_type_class` + permit `work`). NEW SCRIPT. |
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
| 27 | `update_tracked_projects` (Spec 82) | YES — EXTEND | `tracked_projects` already has `lead_type` column. EXTEND alert logic to handle `lead_type='coa'` rows: stall thresholds different (CoA at "Hearing Scheduled" for 1–3 months is normal, not a stall); auto-archive on `decision IN ('Refused','Withdrawn','Closed')`; imminent-alert window keyed on `hearing_date` instead of `predicted_start`. |
| 28 | `assert_entity_tracing` | YES — EXTEND | 26-hour coverage matrix extended to CoA-side derivations (`lead_trades WHERE lead_id LIKE 'coa:%'`, `lead_parcels WHERE lead_id LIKE 'coa:%'`, `coa_applications.scope_tags`). |
| 29 | `assert_global_coverage` | YES — already exists in CoA chain step 12 + EXTEND | EXTEND with CoA-specific coverage thresholds (one row per new CoA column). |
| 30 | `backup_db` | NO | Daily backup is global. |

### 6.6 Schema Changes — Option C (`lead_id`-keyed Unified Tables) + Granular Universal Stream Columns

This WF picks **Option C** from the three dual-identity options previously considered (A: nullable dual-key, B: parallel tables, C: `lead_id`-keyed unified tables). Rationale: positions the schema cleanly for the granular Universal Stream lifecycle model (Spec 84 §2.5.h.2) being wired in this same WF, and removes the entity-type fork from every downstream consumer.

**6.6.A — Universal lead identity (`lead_id`):**

Every lead-bearing row in the system gets a `lead_id TEXT NOT NULL` column. Format is canonical:

- Permit lead: `'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')` — e.g., `'permit:1234567:00'`. `revision_num` is `VARCHAR(10)`; LPAD operates on the text directly without a cast. Over-width revisions (`'100'`) pass through unmodified — uniqueness preserved, lexicographic ordering not (acceptable, ordering is done on `revision_num` itself in queries).
- CoA lead: `'coa:' || application_number` — e.g., `'coa:A0123-24'`

This format matches the existing `lead_analytics.lead_key` convention (`scripts/lib/leads/lead-id.js` exists already as a shared derivation function). We standardize the rest of the stack on this same string.

**Migration strategy:** for `permits` and `coa_applications`, `lead_id` is added as a `GENERATED ALWAYS AS (...) STORED` column — populated automatically by Postgres at write time, no backfill needed. For the other hot-path tables (`cost_estimates`, `trade_forecasts`, `tracked_projects`, `lead_analytics`), `lead_id` is added as a nullable column populated by a Phase C backfill (`migrate-to-lead-id.js`), then promoted to `NOT NULL` + UNIQUE INDEX after the backfill completes. The legacy `permit_num`/`revision_num` columns stay denormalized alongside `lead_id` for the duration of the consumer migration (read by some queries, written by triggers). After all consumers query on `lead_id`, the legacy columns are dropped in Phase H cleanup.

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
| `tracked_projects` | `lead_id TEXT` | Same. Existing `lead_type` column already segregates 'permit' vs 'coa' rows; `lead_id` makes it queryable. |
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
| `latitude` | DECIMAL(10,7) | `load-coa.js` (geocode at ingest) | YES |
| `longitude` | DECIMAL(10,7) | `load-coa.js` (geocode at ingest) | YES |
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

### 6.7 Granular Lifecycle: Engine Migration + Universal Stream Wiring

The bundled approach (chosen because the system is pre-live) migrates the lifecycle engine to the granular Universal Stream model in the same WF as the lead_id refactor and CoA pipeline parity. The risk-reduction "schema prep without engine change" pattern is dropped — pre-live means we can iterate on band recalibration and classifier outputs freely on staging without operational blast radius.

**What this WF changes in the lifecycle engine:**

1. **`scripts/lib/lifecycle-phase.js` — `classifyCoaPhase()` fix (bug 84-W12).** Wire `coa_applications.status` into phase routing. New rules (precedence order):
   - dead decisions (`Refused`, `Withdrawn`, `Closed`) → NULL (terminal)
   - `decision = 'Final and Binding'` → P4 (CoA Final)
   - `decision IN ('Approved', 'Approved with Conditions', 'Conditional Consent')` → P3 (CoA Approved)
   - `status IN ('Internal Review', 'Public Hearing Scheduled')` → P2 (CoA Review)
   - `status IN ('Application Received', 'Accepted', 'Prepare Notice', …)` → P1 (CoA Intake)
   - **catchall (unrecognized status, no decision)** → P1 + emit `unmapped_status` row in audit_table with the raw status string. Prevents silent NULL drift when CKAN adds new statuses (e.g., a future `'Deferred'` / `'Appealed'` enum value would otherwise fall to NULL — catchall ensures it lands in P1 and surfaces in audit metrics for triage).
   
   The catchall is critical: it converts an unknown-status failure mode from "silent data quality regression" into "loud audit signal." Coverage gate in `assert-lifecycle-phase-distribution.js` adds `unmapped_status_count` metric with threshold ≤ 5 WARN, ≤ 1 PASS so the team is alerted when CKAN drifts.
   
   Expected outcome: CoA `lifecycle_phase IS NOT NULL` rate climbs from 0.6% to ≥ 95% on active CoAs.

2. **`scripts/lib/lifecycle-phase.js` — granular Universal Stream emission.** New pure function `mapToUniversalStream(phase, status, source)` returns `{seq, group, block, stage, bid_value}` by lookup against `universal_stream_catalog`. Called by `classifyPermitPhase()` and `classifyCoaPhase()` after the P-code is decided. Both legacy P-code AND granular row reference get written.

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
| `link-coa-to-parcels.js` (bundled with neighbourhood lookup) | 4201 | streamQuery `coa_applications` for rows with `latitude IS NOT NULL` | `withTransaction` → INSERT `lead_parcels` (lead_id = `'coa:' || application_number`) with `ON CONFLICT DO UPDATE` and IS DISTINCT FROM guards; final UPDATE `coa_applications.neighbourhood_id` via point-in-polygon on `parcels` ⋈ `neighbourhoods` | `coa_parcels_linked_pct`, `confidence_distribution`, `unmatched_coa_count` (threshold: ≤ 5% WARN, ≤ 1% PASS), `coa_neighbourhood_coverage_pct` |
| `classify-coa-scope.js` | 4202 | streamQuery `coa_applications` for rows with `description IS NOT NULL AND (scope_classified_at IS NULL OR scope_classified_at < load_at)` | `withTransaction` → UPDATE `coa_applications` `(coa_type_class, project_type, scope_tags, scope_classified_at, scope_source)` | `scope_classified_pct`, `unmapped_scope_count`, `project_type_distribution` |
| `classify-coa-trades.js` | 4203 | streamQuery `coa_applications` JOIN `trade_mapping_rules` (`tier=3 AND match_field='description'`) | `withTransaction` → INSERT `lead_trades` (lead_id = `'coa:' || application_number`) chunked (BATCH_SIZE = `floor(65535 / 8)`); ON CONFLICT DO UPDATE | `coa_trades_per_lead`, `default_fallback_pct` (≤ 20%), `unmapped_coa_count` (== 0 FAIL) |
| `compute-coa-cost-estimates.js` | 4204 | streamQuery `coa_applications` JOIN `lead_parcels` JOIN `parcel_buildings` JOIN `trade_sqft_rates` JOIN `scope_intensity_matrix` | `withTransaction` → UPDATE `coa_applications` cost columns AND INSERT `cost_estimates` row keyed on lead_id | `cost_estimate_coverage_pct`, `null_cost_reasons` (no_parcel/no_building/no_scope_tags/no_rate), `cost_distribution_p25_p50_p75` |
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
| `scripts/classify-permits.js` | REKEY writes from `permit_trades` to `lead_trades` (lead_id = `'permit:' || permit_num || ':' || LPAD(revision_num::text, 2, '0')`). Tier 1/2/3 logic unchanged. | None — write-target swap inside existing `withTransaction`. |
| `scripts/link-parcels.js` | REKEY writes from `permit_parcels` to `lead_parcels`. | Same. |
| `scripts/compute-cost-estimates.js` | REKEY writes on `lead_id`. Read source unchanged (`permits` JOIN trades). | Schema-level change only. |
| `scripts/compute-trade-forecasts.js` | (1) REKEY writes on `lead_id`. (2) Source-set read extended to UNION `permits` + `coa_applications` so CoA leads enter the loop (even though `WHERE lifecycle_phase IS NOT NULL` will continue to filter most of them out until 84-W12 is fixed). (3) Anchor-source priority list extended for CoA leads: `phase_started_at` → `decision_date` → `hearing_date` → application date. | Adds CoA branch in source SQL; output schema unchanged except for lead_id. |
| `scripts/compute-opportunity-scores.js` | REKEY on `lead_id`. JOINs unchanged. | None. |
| `scripts/update-tracked-projects.js` | REKEY on `lead_id`. Add CoA branch: stall thresholds (`coa_*_stall_days` new logic_variables), hearing-date imminent window, decision-keyed auto-archive (`Refused`/`Withdrawn`/`Closed`). | Add logic_variable keys to `logic_variables`. |
| `scripts/lib/leads/lead-id.js` (NEW shared lib) | Pure function `deriveLeadId(input)` — accepts `{permit_num, revision_num}` or `{application_number}` and returns canonical lead_id string. Used by every migration script and every classification script. Mirror at `src/lib/leads/lead-id.ts` per Spec 84 §7 dual-path. | Pure function — covered by `lead-id.logic.test.ts`. |
| `scripts/quality/assert-global-coverage.js` | Add ~10 new field-level coverage rows (CoA classification fields). Add coverage row for `lead_id IS NOT NULL` on each hot-path table. | Threshold keys added to `logic_variables`. |
| `scripts/quality/assert-entity-tracing.js` | Extend 26-hour denominator matrix to include `lead_trades` (CoA-side count), `lead_parcels` (CoA-side count), `coa_applications.scope_tags`. | Same. |
| `scripts/quality/assert-data-bounds.js` | Add CoA-side bounds: PRE-permit row count must be 0 post-retirement; lead_id format-validity check. | Same. |
| `scripts/classify-lifecycle-phase.js` | Extend UPDATE branches for `permits` and `coa_applications` to write `lifecycle_seq` / `lifecycle_group` / `lifecycle_block` / `lifecycle_stage` / `bid_value` alongside legacy `lifecycle_phase`. Write to `lifecycle_transitions` ledger (replaces `permit_phase_transitions`) with both legacy phase codes AND new `from_seq` / `to_seq`. | None — same `withTransaction` envelope, additional columns in UPDATE/INSERT. |
| `scripts/lib/lifecycle-phase.js` | (1) `classifyCoaPhase()` wired to `coa_applications.status` (bug 84-W12 fix). New rules emit P2/P3/P4 per §6.7. (2) New pure function `mapToUniversalStream(phase, status, source)` does the catalog lookup. (3) `PHASE_ORDINAL` and `TRADE_TARGET_PHASE_FALLBACK` constants reviewed but kept (legacy forecast routing still uses them). | Pure functions — covered by `lifecycle-phase.logic.test.ts` parity. |
| `scripts/compute-phase-calibration.js` | `GROUP BY` extended from `(permit_type, from_phase)` to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. JOINs to `permits` / `coa_applications` for the new dimensions. `min_sample_size` audit threshold revisited so low-cardinality cohorts don't WARN spuriously. | Audit_table thresholds may need new keys. |
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
| **Phase C — `lead_id` backfill + permit-side rekey** | One-shot `migrate-to-lead-id.js` populates `lead_id` on every existing row. After success, columns promoted to `NOT NULL` with UNIQUE INDEX. Then `classify-permits.js`, `link-parcels.js`, `compute-cost-estimates.js`, `compute-trade-forecasts.js`, `compute-opportunity-scores.js`, `update-tracked-projects.js` updated to write to `lead_id`-keyed tables. Permit-stage outputs continue to produce correct values (not byte-identical — this is pre-live — but functionally equivalent). | Zero rows have NULL `lead_id`; 3 consecutive daily staging runs produce sane permit-side `opportunity_score` distributions. |
| **Phase D — CoA classification scripts** | `load-coa.js` extended with geocoding. New scripts: `link-coa-to-parcels.js`, `link-coa-neighbourhoods.js`, `classify-coa-scope.js`, `classify-coa-trades.js`, `compute-coa-cost-estimates.js`. New shared libs in `scripts/lib/coa-classifier.js`, `scripts/lib/coa-cost-model.js`. CoA pipeline expands from 12 to ~22 steps. Existing `link-coa.js` extended to write `permits.linked_coa_application_number` back-ref. | CoA classification coverage targets in §6.3 met on staging snapshot; multi-agent review per `00_engineering_standards.md`. |
| **Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension** | (1) `scripts/lib/lifecycle-phase.js` `classifyCoaPhase()` wired to `coa_applications.status` per §6.7. (2) New `mapToUniversalStream()` pure function for granular column emission. (3) `scripts/classify-lifecycle-phase.js` UPDATE branches extended to write all granular columns and the `lifecycle_transitions` ledger. (4) `scripts/compute-phase-calibration.js` `GROUP BY` extended to the granular cohort key. (5) Phase distribution bands recalibrated in `scripts/seeds/logic_variables.json` via iterative band-tuning on staging. | `bug-84-w12-regression.infra.test.ts` green; `granular-lifecycle.infra.test.ts` green; `assert-lifecycle-phase-distribution.js` passes for 7 consecutive runs on staging; CoA `lifecycle_phase` non-NULL rate ≥ 95%. |
| **Phase F — Forecast / opportunity / CRM CoA extensions** | `compute-trade-forecasts.js` source SQL UNION-extended to consume `coa_applications`; CoA-stage anchor priority wired; bimodal-routing simplification for CoA-stage. `compute-opportunity-scores.js` consumes CoA-stage forecasts. `update-tracked-projects.js` CoA branch (stall thresholds, hearing-date imminent window, decision-keyed auto-archive). Front-end Lead Inspector CoA panel (Spec 76 §3.5 extension). `assert-*` extensions for new coverage rows. | End-to-end staging run produces actionable CoA lead in admin Lead Detail Inspector with non-NULL key fields; CoA-stage forecast coverage ≥ 80%. |
| **Phase G — PRE-permit retirement** | `create-pre-permits.js` becomes a one-shot DELETE-and-no-op shim. Remove step 5 from CoA chain and step 18 from permits chain. `assert-data-bounds.js` confirms `permits WHERE permit_type='Pre-Permit'` count = 0. Front-end queries switch to reading CoA leads directly via `lead_id LIKE 'coa:%'`. | Zero PRE-permit rows; no broken queries. |
| **Phase H — Legacy column drop** | DROP `permit_num`/`revision_num` from `cost_estimates`, `trade_forecasts`, `tracked_projects`. Drop `permit_phase_transitions`/`permit_trades`/`permit_parcels` table aliases (replaced by `lifecycle_transitions`/`lead_trades`/`lead_parcels`). Drop `scripts/create-pre-permits.js` script file. | All consumer queries reference `lead_id` only; legacy aliases unused. |

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

**Phase C — `lead_id` backfill + permit-side rekey**
- *Specs to read:* Spec 47 §R1–§R12 (full skeleton — every new and modified script); `41_chain_permits.md` §13 (classify-permits), §9 (link-parcels), §15 (compute-cost-estimates), §25 (compute-trade-forecasts), §26 (compute-opportunity-scores), §27 (update-tracked-projects); `80_permit_classification.md` §5 (classifier gating still in force); `81_opportunity_score_engine.md` + `83_Lead_cost_model.md` + `85_trade_forecast_engine.md` (schemas now lead_id-keyed)
- *Key files:* `scripts/migrate-to-lead-id.js` (NEW, one-shot, advisory lock 4205), `scripts/classify-permits.js` (REKEY), `scripts/link-parcels.js` (REKEY), `scripts/compute-cost-estimates.js` (REKEY), `scripts/compute-trade-forecasts.js` (REKEY), `scripts/compute-opportunity-scores.js` (REKEY), `scripts/update-tracked-projects.js` (REKEY), `scripts/lib/leads/lead-id.js` (NEW shared deriver), `src/lib/leads/lead-id.ts` (TS mirror per Spec 84 §7 dual-path), `src/lib/leads/lead-detail-query.ts` + `lead-inspect-query.ts` (read on lead_id)
- *Protocols:* Spec 47 §R1–§R12 (every script); Spec 84 §7 (TS↔JS dual-path parity for `lead-id.js`); `00_engineering_standards.md` §Multi-Agent Review (WF2 cadence)

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

**Phase H — Legacy column drop**
- *Specs to read:* `41_chain_permits.md` (consumer audit — which queries still reference `permit_num`/`revision_num` as PK); BI tools / analyst query inventory (external dependency audit — required gate)
- *Key files:* `migrations/NNN_drop_legacy_permit_keys.sql` (DROP `permit_num`/`revision_num` from `cost_estimates`, `trade_forecasts`, `tracked_projects`), `migrations/NNN_drop_legacy_alias_tables.sql` (drop `permit_phase_transitions` / `permit_trades` / `permit_parcels` views/aliases), `scripts/create-pre-permits.js` (DELETE file entirely)
- *Protocols:* Spec 47 §10 (migration UP/DOWN parity); `00_engineering_standards.md` §3 Database (consumer audit before destructive schema change — 30-day soak gate); zero non-archive query references `permit_num`/`revision_num`

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
