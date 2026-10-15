# Active Task: ST overlay value to parcels / McBylaw lot vector (WF3)
**Status:** Implementation (lane ST-OVERLAY, 2026-10-14) — premise REFUTED; regression lock only

## Context
* **Goal:** answer "how is the numerical value following ST on the Height Overlay Map resolved?" and close any gap between `zoning_height_overlay.ht_stories` → `parcels.zoning_overlays.height_overlay` → the McBylaw lot vector `overlays.ST`.
* **Target Spec:** Spec 65 §3 (zoning_overlays shape) + DEC-1 + height-overlay weld fence; Spec 58 §9; Spec 68 §7.6 / Spec 69 M-41, M-48; Spec 124 R-BZ (compute purity).
* **Key Files:** `scripts/lib/compute/enrich-parcels.js` (height_agg CTE + heightJson), `scripts/lib/step/index.js` (staleOverlays filter), `scripts/analysis/bylaw/evaluate.mjs` (overlay / mapped), P2-0 `scripts/analysis/bylaw/p2-measure.mjs` (lotVector, other lane, uncommitted).
* **Execution Provider:** claude — Spec 08 §B downgrade, operator directive 2026-10-14 (lane rules).
* **Domain:** Backend/Pipeline. 68/69: read-only use of §7.6 semantics.

## Premise (measured, dev DB, SELECT only)
* `zoning_height_overlay`: 2,528 polygons; 717 with `ht_string ~ 'ST'`; `ht_stories` populated on exactly those 717 (0 mismatches either way).
* Spatial join (`&&` + `ST_Intersects` + `NOT ST_Touches`, the enrich path): 445,595 parcels on an HT polygon; 194,784 on at least one ST polygon; 2,909 straddle ST and no-ST polygons; 3,826 straddle differing ST values; 19,369 touch >1 HT polygon.
* `parcels`: 445,595 carry `zoning_overlays.height_overlay` (= the join); 193,996 carry `height_overlay.stories` (a number) = `bylaw_max_stories` non-null count.
* Orchestrator premise "ST NOT carried" is refuted: the key is `stories`, null-stripped by `jsonb_strip_nulls` when the chosen polygon has no ST, so a sampled no-ST parcel shows only `{applied, height_max_m}`.
* 788 parcels (194,784 − 193,996) touch an ST polygon but carry no `stories`: the DISTINCT ON picks the lowest-height polygon and pairs ITS storeys (Spec 65 weld fence, deliberate, db-locked in enrich-parcels.db.test.ts:230-256).

## Technical Implementation
* **New/Modified Components:** none in compute. Adding `storeys_max` would duplicate `stories` (Spec 65 §3) and rewrite every parcel's zoning_overlays for no new information — rejected (lane objective: simple, every change says what it replaces).
* **Data Hooks/Libs:** new `src/tests/enrich-parcels-height-overlay-st.regression.test.ts` (locks the carry + null-strip + never-stale facts).
* **Database Impact:** NO. Capture impact: NONE (no compute change).

## Standards Compliance
* **Try-Catch Boundary:** N/A. **Unhappy Path Tests:** no-ST polygon → key absent; stale-layer path cannot drop HT/LC. **logError Mandate:** N/A. **UI Layout:** N/A.

## Execution Plan
- [x] Step 1: measure premise (SELECTs above).
- [x] Step 2: locate producer (enrich-parcels.js:298-317) + lot vector (p2-measure.mjs lotVector, PARCEL_SQL reads `stories`).
- [x] Step 3: audit overlay codes / label letters (report).
- [x] Step 4: regression lock test, proven red by mutation then green.
- [x] Step 5: report.
