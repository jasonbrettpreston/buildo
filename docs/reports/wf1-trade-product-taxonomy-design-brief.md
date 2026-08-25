# Design Brief — Unified Trade + Product + Service Taxonomy (Spec 80 v-next)

**Status:** DRAFT for product direction (pre-spec). Not a plan to implement yet — settles the model first.
**Home:** This belongs in **Spec 80 (`docs/specs/01-pipeline/80_taxonomies.md`)** — it *is* the taxonomies spec, and the product half is its unfinished business. This brief is the input to a Spec 80 major revision.

## 1. Why a taxonomy at all (the purpose)
A permit/CoA is a free-text **description + scope**. We classify it into structured **lead-matching keys** so each *audience* can find + follow the right projects:
- **Tradespeople** (plumber, framer) → match on **trades** (labor performed).
- **Manufacturers / suppliers** (window maker, lighting brand) → match on **products** (materials installed).
- **Realtors** → match on **lifecycle** (project nearing completion → listing signal).
- **Forecast/timing** (Spec 84/85) → predicts *when* each trade/product is relevant on a project.

The taxonomy is the spine connecting *project → audience → timing*.

## 2. Current state (grounded)
| Layer | State |
|---|---|
| **Trades** (`trades.ts`, `permit_trades`) | 32 construction trades + realtor(33). **Live** — classified onto permits via `TAG_TRADE_MATRIX` / `NARROW_SCOPE_CODES` / work-fallback. |
| **Products** (`products.ts`, `permit_products`, `tag-product-matrix.ts`) | 16 product groups + a tag→product matrix **designed — but DORMANT: `permit_products` = 0 rows.** Never wired into the classifier/chain. |
| **Trade ↔ Product link** | **Does not exist.** Trades + products are classified in parallel (both from tags), with no relationship between them. |
| **Ancillary services** | Only `temporary-fencing` (construction hoarding). **No** port-a-potty/sanitation, tree-removal/arborist, dumpster/bin, surveying, etc. |
| **Forecast** (Spec 84/85) | Uses a granular 38-trade Universal-Stream vocab (slug-FK), incl. the 5 split trades (windows/paving/decks/back-yard-fences/outdoor-patio) the classifier never emits. |

## 3. The vision (the "master table")
**One classification pass over the description assigns BOTH trades AND products** (+ confidence), and the model captures how they relate.

### 3a. The trade ↔ product consumption link (your key insight)
> "the trade person buys the product and installs — the lighting manufacturer is interested when the trade person buys the lights."

So **products are consumed by trades**, at a specific lifecycle moment (sourcing/install). Model a **`trade_products`** mapping: each trade → the products it installs, e.g.
- `electrical` → `lighting`, (plumbing-)`fixtures`
- `glazing`/window-installer → `windows`, `mirrors-glass`
- `framing` → `lumber-drywall`
- `kitchen`/millwork → `kitchen-cabinets`, `countertops`, `appliances`

This gives manufacturers two things: **which** projects (product on the permit) and **when** (the installing trade's forecast stage = the sourcing window). A lighting brand gets the lead when `electrical` enters its sourcing phase on a project that has `lighting`.

### 3b. Audiences map cleanly
| Audience | Matches on | Timed by |
|---|---|---|
| Tradesperson | trade | that trade's forecast stage |
| Manufacturer / supplier | product | the *installing trade's* sourcing stage (via `trade_products`) |
| Realtor | lifecycle (near-completion) | P-stage |

### 3c. Expanded service taxonomy (your examples)
The audience is broader than core construction labor. Add **ancillary services** as first-class trades (or a tagged "service" category within trades):
- `temporary-fencing` / construction hoarding (exists)
- **`temporary-sanitation`** (port-a-potty rental)
- **`tree-removal` / arborist** (when the lot has trees — a real, lucrative lead for tree services; gated on a tree/ravine/lot signal)
- candidates: dumpster/bin rental, site surveying, demolition-haulaway, scaffolding

These have real lead audiences (rental cos, arborists) and belong in the same classify-from-description pass.

## 4. Proposed master-table structure
- **`trades`** — labor + services performed. Each row: id, slug, **kind** (`construction` | `service` | `persona`[realtor]), phase, audience flag. (Absorbs the granular forecast trades + the new services.)
- **`products`** — materials/equipment (manufacturer/supplier targets). Wire the **dormant** classifier so `permit_products` actually populates.
- **`trade_products`** (NEW) — trade → products it installs (+ confidence). The consumption link; powers manufacturer matching + timing.
- **Classification** emits `permit_trades` + `permit_products` in one pass from the description; the forecast reads trades (and, via `trade_products`, times product leads).

## 5. Open product decisions (need your direction)
1. **Granularity / home of overlapping items.** `windows` is currently a *product* (id 6) AND a forecast *trade* (id 35). Is the install-labor a distinct trade (`window-installer`) or folded under `glazing`, with `windows` living as the *product*? Same question for `decks`/`back-yard-fences` (trade) vs `lumber` (product). **Rule of thumb to confirm:** *labor → trade; the thing bought → product; link them via `trade_products`.*
2. **Ancillary services scope.** Which to seed now (port-a-potty, tree-removal, fencing, dumpster, scaffolding, surveying…)? Each needs a description signal + a phase.
3. **Trade↔product link.** Explicit `trade_products` table (recommended — operator-tunable) vs derived from tags.
4. **Reclassification.** You're leaning **deprecate + reclassify** (data isn't used yet) — re-run classify over ~240K permits once the model is set; retire `decking-fences`→`decks`/`back-yard-fences`, split `windows` out of `glazing`. Confirm.
5. **Forecast reconciliation.** Fold the 38-trade Universal-Stream vocab into the unified `trades` (stable ids) so there's one list feeding both classification and forecast.

## 6. Suggested phasing (once the model is settled)
- **Phase 0 — this brief → Spec 80 v-next** (the unified model + the master tables + audience/consumption design). ← *we are here*
- **Phase 1 — schema:** master `trades` (kinds + services), `trade_products` link, seed; migration with stable ids.
- **Phase 2 — classifier:** one pass emits trades + products (+ wire the dormant product classifier); add ancillary-service signals.
- **Phase 3 — reclassify** ~240K permits + CoA; wire `permit_products` into chains 50/51; downstream `lead_trades`/forecast.
- **Phase 4 — audience/forecast integration:** manufacturer matching via `trade_products` + timing.

## 8. Forecast alignment (Spec 84 Universal Stream + Spec 85 engine)
Reviewed the §2.5.h.2 cross-reference table + Spec 85. Key findings:

- **The forecast infrastructure is ALREADY built for the granular 38-trade vocab.** Spec 84 §2.5.h.2 defines **4 signals × 38 trades = 152 columns** across the 110 lifecycle rows — including `windows`, `decks`, `back-yard-fences`, `paving`, `outdoor-patio`. The signals are: **Bid** (could start contacting the customer), **Work** (on-site now), **Fallback** (Active-Inspection catch-all), **Bid-Last-Minute** (imminent rescue bid).
- **But those granular signals are DEAD today.** Spec 85 forecasts only trades present in `lead_trades (is_active=true)` — i.e., whatever the **classifier emits** — and the classifier emits the legacy 32. So the 5 granular trades' signal columns can never fire (no `lead_trades` rows reference them). Spec 85's header still says *"all 32 trades."*
- **➜ The unification ACTIVATES the dormant forecast.** The moment the classifier emits `decks`/`windows`/etc. into `lead_trades`, Spec 84's already-defined signals light up and Spec 85 forecasts them. This is the strongest argument *for* the unification — the forecast half is built and waiting; only the classifier is behind.
- **Two phase models coexist — both must stay consistent:** (a) Spec 80 §3 **4-phase** (early_construction→structural→finishing→landscaping) used for lead-score `phase_match`; (b) Spec 84 **P1-P20 / 110-seq** granular stages used for forecast timing. The fine P-stages roll up into the 4 phases. Any new trade/service must be placed in **both**.
- **Products bridge to timing via `trade_products`.** The forecast is trade-keyed only; a product (manufacturer) lead inherits timing from its **installing trade's** Bid/Work stage. So `trade_products` is also the product↔forecast bridge — consistent, no separate product-forecast model needed.

**Per-new-trade/service wiring cost (so we scope §5.2 realistically):** each new trade/service needs (1) a `trades.ts` + Spec 80 §2 row, (2) a Spec 80 §3 4-phase home, (3) Spec 84 §2.5.h.2 signal columns (Bid/Work/Fallback/LM across the 110 rows — the v10-CSV regen), (4) a Spec 85 `TRADE_TARGET_PHASE` entry. Ancillary services map naturally: `tree-removal`→site-prep/early (Bid at intake, Work pre-excavation); `temporary-sanitation`/port-a-potty→spans construction (Bid at issuance, Work through inspections); `temporary-fencing` already mapped.
- **Cleanup:** Spec 85 "32 trades" → the unified count; `TRADE_TARGET_PHASE` extended to the full set (the current gap is why `compute-trade-forecasts.js` would log the granular trades "unmapped").

## 7. Recommendation
Settle §5 (esp. #1 the trade-vs-product rule, and #2 the service scope) first — those define the master list. Then I turn this brief into the Spec 80 v-next revision (WF1), review it, and we phase the implementation. The product classifier being dormant (`permit_products`=0) is the opportunity: we wire it correctly *with* the trade↔product model rather than bolting it on later.

---

## 9. Plan-review findings (2026-06-12) — the FULL emission surface (for the WF1 revision)
The first WF1 plan (collapse the two tag matrices) FAILED plan review — the change surface is bigger than "two matrices." Capture for the revised plan:

**Trade emission flows through FOUR paths, not two:**
1. `tag-trade-matrix.ts` (+ `classify-permits.js` JS mirror) — permits, tag→trade.
2. `coa-trade-classifier.ts` (+ `scripts/lib/coa-trade-classifier.js` twin) — CoA, tag→trade.
3. **`WORK_TRADE_FALLBACK`** (in classify-permits.js / classifier.ts) — work-field fallback (e.g. `Deck→[framing,concrete]`). This is what actually fires for many deck/porch permits.
4. **`trade_mapping_rules`** (DB, ~99 rows, Tier-3 description rules) — e.g. `%window%→glazing`, `%paving%→landscaping`, `%curtain wall%→glazing`. A migration must touch these, not just code.
Plus `NARROW_SCOPE_CODES` + `classifier.ts` Tier-1/Tier-2 named rules + `WORK_EXCLUSIONS` (8 lists reference `decking-fences`).

**The granular trades mostly have NO scope-tag signal:** live tag set has `deck` (~22K) + `fence` (107) cleanly, but `windows`/`paving`/`patio`/`driveway` tags = **0 occurrences**. So `windows`/`paving`/`outdoor-patio` can only be driven by the DB description rules (path 4), not a tag split. **Bug:** `scope.ts` emits tag `window` (singular) while matrices key `windows` (plural) → unreachable.

**Forecast + cost gates are DB-seeded and lack the 5:**
- `compute-trade-forecasts.js` reads `TRADE_TARGET_PHASE` from **`trade_configurations`** (DB) — the 5 granular slugs are absent → forecast stays dark until a seed migration adds them (NOT the `lifecycle-phase` fallback constant).
- `trade_sqft_rates` (cost model) lacks the 5 → `cost_source='none'` until seeded.

**Live consumers of `decking-fences` (if its emission is retired):** mobile onboarding `TRADE_SECTIONS` (a user registered as `decking-fences` would get 0 leads), `trade_suppliers` (4 vendor rows), `inspection_stage_map` lag rule. Decision needed: keep `decking-fences` as a never-deleted trade + migrate those accounts, or keep it as a low-confidence fallback emitter.

**Dual-path parity is currently subset-only** (`classify-sync.logic.test.ts`) — TS already has `deck→decking-fences@0.85` while the JS twin omits it, and the test passes. The revised plan needs a **behavior-driven** parity test (golden tag inputs → identical {trade,confidence} from both classifiers).

**Tests that WILL break (must be updated, not treated as bugs):** `classification.logic.test.ts` (`TRADES.toHaveLength(33)`, `isTradeActiveInPhase('decking-fences','landscaping')`, the new-slugs list), `trades-realtor.logic.test.ts` (33), `compute-timing-calibration-v2.infra.test.ts` (`TRADE_TARGET_PHASE` exact 33-count), `classify-sync` + `coa-trade-classifier` parity. Do NOT touch `migration-092`/`cost-estimates` "32 trades" (immutable migration-text assertions).

**Re-key to 34-38 is collision-free** (ids 34/36-43/45 are free gaps; the 5 have zero by-id children) — RG's "collision" CRITICAL was a false alarm.

**Baseline problem:** `permit_trades` currently holds only trade_ids 1-20,32,33 (classify-permits never completed cleanly since the rebuild). → run the chains clean FIRST to get the true classifier output before redesigning.
