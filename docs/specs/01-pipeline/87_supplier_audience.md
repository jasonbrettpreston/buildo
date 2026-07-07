# Spec 87: Supplier & Sell-Side Audience Model

**Status:** PROPOSED — **v1 re-scoped 2026-07-07 to trade-level supplier linkage; the product-hub design is deferred to v2.** The original design-of-record (2026-06-17) modelled suppliers against Spec 80's `products` hub (`suppliers` + `supplier_products` + a `trade_products` hop). That shape is correct for multi-category aggregators but heavier than a v1 needs. v1 links suppliers directly to **trades** and rides the EXISTING trade-keyed serving layer — no new product hop, no new forecast, no new cost model. **Implemented in a later WF — NOT part of the Spec 80 taxonomy WF2 (Phase 1).**

> **SCHEMA-STATE CORRECTION (2026-07-07 validation [INT #7]).** `suppliers` **and** `supplier_products` **already exist in the DB** — both shipped in **migration 183** (`183_suppliers_schema.sql`, schema-only, empty). So the v1 FK target (`suppliers.id`) is already live, and the **only genuinely new table v1 adds is `supplier_trades`.** The v2 product hub (§v2) is therefore **SHIPPED-BUT-DORMANT schema, not future work** — the tables exist and wait for a consuming read layer. Do **not** re-`CREATE` them.
>
> **DISAMBIGUATION — three similarly-named things, only one is new:**
> | table | status | what it is |
> |---|---|---|
> | `supplier_trades` | **NEW (v1)** | marketplace-account → `trade_id` many-to-many; the v1 mapping store below |
> | `suppliers` / `supplier_products` | **shipped, mig 183, empty** | the v2 product hub (§v2) — dormant, awaiting a read layer |
> | `trade_suppliers` | **shipped, mig 113 — 127 live rows** | a **different thing**: an admin-curated, **slug-based** supplier list feeding mobile onboarding (Spec 94). NOT a marketplace-account table, NOT keyed by `trade_id`. v1 does not touch it. |

## 1. Goal & User Story
> As a **supplier / manufacturer / retailer** — a single-line window maker, *or* a big-box like Home Depot that competes across many categories — I want project leads for the **trades I supply**, timed to when each trade is **sourced** on the project, so I reach the buyer at the right moment.

This spec defines the **sell-side audience**. v1 (§v1) is the governing design: a supplier account maps to a set of **trades**, and its lead feed is the existing trade-keyed lead layer. v2 (§v2) preserves the richer product-hub design for when multi-category aggregators arrive.

---

## §v1 — Trade-Level Supplier Path (GOVERNING DESIGN)

The v1 realization deliberately avoids the `products` hub. A supplier is an audience over **trades**, and the platform already produces a fully-populated, indexed, trade-keyed lead layer. v1 is therefore a thin mapping store + a filtered read over live data.

### v1.1 — Mapping store: `supplier_trades`
| column | type | notes |
|---|---|---|
| `supplier_id` | FK → `suppliers.id` | the marketplace account — **`suppliers` already exists (mig 183); this FK target is live, not new** |
| `trade_id` | FK → `trades.id` (Spec 80) | one row per trade the supplier serves |
| | PK (`supplier_id`, `trade_id`) | many-to-many; a supplier's footprint = its `trade_id[]` set |

- A supplier's **breadth = its `supplier_trades` set.** A single-line manufacturer maps to one trade; a broad supplier maps to several. No special "matches-everything" persona — breadth alone distinguishes them.
- `trades.id` is the fixed Spec 80 FK target; v1 never modifies the Spec 80 taxonomy tables.
- **CAVEAT — accounts data, not a fixed taxonomy.** Like `users`/`entities`, `suppliers` and their `supplier_trades` rows are **onboarded over time**, seeded from supplier onboarding, NOT a migration seed.

### v1.2 — Consumption: the existing trade-keyed serving layer
v1 reuses what the pipeline already ships — no supplier-specific forecast or cost:

- **`lead_trades`** is the live, indexed lead↔trade join. It carries **both `permit:` and `coa:` `lead_id` prefixes**. A supplier feed for trade `T` is a single JOIN: `lead_trades lt JOIN trades t ON t.id = lt.trade_id WHERE t.slug = <T> AND lt.is_active = true`.

  > **⚠️ LOAD-BEARING PRECISION CORRECTION (2026-07-07 [GRD P9b-5]).** `is_active = true` is a **precision-honest filter ONLY on the CoA side** (post-P6.6 it means `!fromBundle` — bundle-recall trades persist inactive; `classify-coa-trades.js:302`). **On the PERMIT side, `is_active = true` is NOT a precision signal:** the permit archetype-bundle prior writes rows at **`is_active = true`, tier 2, confidence 0.55** (`classify-permits.js:614-623`), and permit scope-limiting (`applyScopeLimit`) **DROPS** rows rather than deactivating them — so an active permit row can still be a low-confidence bundle guess. Permit-side precision lives in **`lead_trades.tier` / `lead_trades.confidence`**, not `is_active`. **The v1 feed MUST additionally filter/rank permit rows by `tier`/`confidence`** — filtering on `is_active` alone serves the 0.55 bundle prior as if it were a confirmed lead. *(Follow-up alternative: extend the P6.6 `!fromBundle` semantics to the permit bundle prior so `is_active` becomes symmetric — then the feed could rely on it on both sides.)*

  > **INDEX NOTE (2026-07-07 [INT #8]).** There is **no composite `(trade_id, is_active)` index** today — `lead_trades` has two independent single-column indexes (`idx_lead_trades_trade` on `trade_id`, `idx_lead_trades_active` on `is_active`). The v1 migration should add a **partial index `lead_trades(trade_id) WHERE is_active`** so the per-trade active-lead JOIN is index-served.

  Live coverage is **35 trades on the permit side and 35 on the CoA side** — **but see §v1.4: these are PRE-P7 measurements.** Example (live, pre-P7 2026-07-07): trade `overhead-doors` resolves to **75,622 permit leads + 28,056 CoA leads** through that one JOIN.
- **`trade_forecasts`** supplies lead **timing** — join on `lead_id` to inherit the installing trade's `predicted_start` (Spec 85). No separate supplier forecast.
- **Cost stays trade-keyed** (Spec 83 + `trades.cost_basis`) — unchanged.

### v1.3 — Serving endpoint
A supplier-facing, trade-filtered lead feed endpoint, **mirroring the patterns in `get-lead-feed.ts`** (same auth envelope, pagination, active-lead filter, `records_meta` contract). It resolves the caller's `supplier_trades` set, then serves the `lead_trades`(`is_active=true`, **plus the §v1.2 permit-side tier/confidence filter**) ⋈ `trade_forecasts` join filtered to those trades, ordered by predicted timing with a DEFINED null fallback: `ORDER BY predicted_start ASC NULLS LAST, first_seen_at DESC` (adjust the tiebreak column to the feed's creation-recency field at implementation) — the §v1.4 gap rows must have stable, deterministic ordering, never undefined sort (2026-07-07 adversarial-review fold).

> **⚠️ TWO SECURITY/PRINCIPAL FENCES the endpoint must design consciously (2026-07-07 [GRD P9b-4]).** "Mirror `get-lead-feed.ts`" is not enough — the supplier principal breaks two invariants the existing feed relies on:
> 1. **CoA-exposure gate.** `lead_trades` carries `coa:` leads. Serving them to an EXTERNAL supplier account would **bypass the `LEAD_FEED_DISABLE_COA` killswitch** (`src/app/api/leads/feed/route.ts` — a deliberate exposure gate; default keeps CoA leads off the external feed until they are renderability-ready). v1 must define **its own CoA-exposure gate** for the supplier feed, not silently expose CoA leads through a new door.
> 2. **Multi-trade principal vs the single-trade 403 model.** A supplier is a **multi-trade** principal, but the existing feed enforces a **single-trade** authorization: `feed/route.ts:68-70` 403s on `params.trade_slug !== ctx.trade_slug`, and `getCurrentUserContext` resolves exactly one `trade_slug`. v1 must define the **supplier principal** (its `supplier_trades` set) and its authorization model before reusing the route shape.
>
> **SUBSTRATE HONESTY [INT #9].** `get-lead-feed.ts` is **single-trade + `permit_trades`-based**; this feed is **multi-trade + `lead_trades`-based**. It is not a thin wrapper. Effort is **M** if a supplier's full trade set is served in one response (**S** only if the endpoint is called single-trade-per-request).

> **CAVEAT — v1 correctness depends on the P6.6 fan-out fix (2026-07-07 adversarial-review fold).** The `is_active = true` filter is only meaningful because `classify-coa-trades.js` sets `is_active = !fromBundle` (commit `9883656`): bundle-recall trades persist inactive. If that logic is ever reverted or the P7 reset+re-run doesn't complete, CoA rows revert to median 33/35 active trades and this feed serves grossly inflated CoA data for every trade. The regression locks pinning `is_active === !fromBundle` are the guard — do not weaken them.

### v1.4 — Known v1 gap: CoA forecast-timing parity
Not every CoA lead has a forecast timing anchor. **Live (PRE-P7, 2026-07-07): CoA leads exist for 35 trades, but only 19 trades have a CoA `trade_forecasts` row with a non-null `predicted_start` — a ~16-trade gap** (the permit side is complete: 32/32 with `predicted_start`). Those CoA leads will surface in a supplier feed with **no `predicted_start`** and therefore no timing sort key.

> **MECHANISM — it's a DATA gap, not a phase-mapping gap (2026-07-07 [GRD P9b-6]).** The prior wording ("is it a phase-mapping gap?") is wrong. The CoA forecast branch (**Branch B**, Spec 85) **never keys on per-trade phase targets at all** — it uses a **uniform `targetWindow='bid'`** with cohort calibration. So the missing trades are **not** un-mapped phases; they are the trades that appear **only on CoA leads which fail the row-level forecast filters** (terminal / stalled / no anchor date / the CoA audit gate). The fix, if any, is upstream in those filters — not a phase table.

> **⚠️ RE-MEASURE EVERYTHING POST-P7 (2026-07-07 [INT #3]).** **Every live figure in §v1 is a PRE-P7 measurement** — the 35/35 permit-vs-CoA coverage, the `overhead-doors` 75,622/28,056 split, and this 35-vs-19 gap. The P7 **CoA reset + re-run** applies the P6.6 fan-out fix (`is_active = !fromBundle`), which **flips ~490K `lead_trades` rows active→inactive** and recomputes the forecast trade set. **Do NOT trust any of these numbers for v1 design until they are re-derived on the post-P7 corpus.** Treat resolving the timing gap as a v1 investigation item **gated on the post-P7 re-measure** — it may shrink, move, or partly resolve once the fan-out reset lands.

### v1.5 — Implementation
Queued as a **WF2 — see `.cursor/active_task.md` P9b.** Not built in this doc pass.

---

## §v2 — Product-Hub (big-box retailers) — DEFERRED

> The design below was the 2026-06-17 design-of-record. It is **the right shape for multi-category aggregation** — a Home-Depot-class retailer competes across ~21 product categories that each map to many installing trades, so a product hub lets one account subscribe by *category* and get per-lead dedup/ranking across overlapping trades without enumerating every trade by hand. It is **overkill for single-trade suppliers**, which §v1 serves directly. Retained here for when aggregator accounts arrive; **not** the v1 target.

> **SCHEMA IS ALREADY SHIPPED, DORMANT (2026-07-07 [INT #7]).** Both `suppliers` and `supplier_products` below exist in the DB (**migration 183**, empty). This section documents live-but-unconsumed schema — a read layer, not a migration, is what v2 still owes. The `CREATE TABLE` shapes below are descriptive of what shipped, not a spec to re-apply.

### v2 — Position in the model (relationship to Spec 80)

```
 suppliers ──< supplier_products >── PRODUCTS (Spec 80) ──< trade_products >── TRADES (Spec 80)
   (this spec — sell side)              (the hub)              (Spec 80 — install side)
```

- **Spec 80** owns the FIXED taxonomy: `trades`, `products`, `trade_products` (seeded vocabulary).
- **This spec (87), v2** owns the sell-side ACCOUNTS: `suppliers` + `supplier_products`.
- A supplier lead **inherits the product's installing-trade forecast stage** (Spec 85) — no separate supplier forecast; cost stays trade-keyed (Spec 83).

### v2 — Database Schema

#### `suppliers`
| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | real company (Home Depot, Acme Lighting) |
| `account_type` | text | `supplier_retailer` \| `manufacturer` \| `rental_co` \| `service_co` |
| `status`, `created_at`, … | | account lifecycle |

#### `supplier_products`
| column | type | notes |
|---|---|---|
| `supplier_id` | FK → `suppliers.id` | |
| `product_id` | FK → `products.id` (Spec 80) | |
| | PK (`supplier_id`, `product_id`) | many-to-many |

> **⚠️ CAVEAT — accounts data, not a fixed taxonomy.** Unlike Spec 80's `trades`/`products` (a seeded vocabulary), `suppliers` are **real marketplace accounts onboarded over time** (like `users`/`entities`). They are **seeded from supplier onboarding, NOT a migration seed**. Spec 80's `products.id` is the fixed FK target; this spec never modifies the Spec 80 taxonomy tables.

### v2 — Behavioral Contract
- A supplier's **footprint = its `supplier_products` set**. Breadth alone distinguishes a big-box (many links) from a single-line manufacturer (one) — same table, no special "matches-everything" persona.
- **Lead production:** for a LEAD with product `P` present (via `permit_products` / the trade's `trade_products`), every supplier in `supplier_products` for `P` is a candidate audience. **Lead timing = the installing trade's `trade_forecasts` row for `P`** (joined via Spec 80 `trade_products`). So a lighting maker fires when `electrical` sources; Home Depot fires across all 21 of its categories with per-lead dedup/ranking across overlapping trades.
- **No new forecast or cost model** — timing inherited from the installing trade (Spec 85); cost is trade-keyed (Spec 83 + `trades.cost_basis`).

### v2 — Examples
| supplier | account_type | `supplier_products` (Spec 80 product ids) | lead streams |
|---|---|---|---|
| Home Depot | `supplier_retailer` | 1–20, 23 *(all 20 materials + scaffolding/tool rental)* | 21 (one per category, each timed by its installing trade) |
| Acme Lighting | `manufacturer` | 10 *(lighting)* | 1 (timed by `electrical`) |

---

## §Out of scope — real-estate agents

Real-estate agents are **not** a sourced trade and are out of scope for this spec (both v1 and v2). They are a **persona**: `trades` row **id 33 (`realtor`, "Real Estate Agent")**, appended to leads on a **commission basis**, **permit-type + geography driven** via `shouldAppendRealtor(...)` (`scripts/classify-permits.js:483`, `scripts/classify-coa-trades.js:310`). A supplier account never onboards as trade 33 through `supplier_trades`; the realtor-append path is a separate concern handled entirely inside the classifiers. Treat any request to "supply" real-estate leads as a distinct issue, not a supplier-audience mapping.

---

## Testing Mandate
### v1
- **Logic:** a supplier's `supplier_trades` set resolves to the correct candidate lead set across both `permit:` and `coa:` prefixes; feed rows inherit the installing trade's `predicted_start`; CoA rows with no `trade_forecasts.predicted_start` (the §v1.4 gap) are handled without crashing the timing sort.
- **DB:** `supplier_trades` FK integrity to `suppliers.id` + Spec-80 `trades.id`; no orphan links; PK uniqueness.

### v2 (deferred)
- **Logic:** breadth model (HD many vs single-line one) resolves to the correct candidate set; a supplier lead inherits the installing trade's `predicted_start`.
- **DB:** `supplier_products` FK integrity to `suppliers.id` + Spec-80 `products.id`; no orphan links; PK uniqueness.

---

## Operating Boundaries
- **Target Files (v1):** (future) the accounts/marketplace migration (`suppliers`, `supplier_trades`) + the supplier-facing trade-filtered feed endpoint (mirroring `get-lead-feed.ts`). NOT `scripts/lib/classification/*`.
- **Target Files (v2, deferred):** the `supplier_products` product-hub migration + product-keyed matching/read layer.
- **Out-of-Scope Files:** Spec 80 taxonomy tables (`trades`, `products`, `trade_products`) — *referenced* (FK target), never modified here. The lead-serving layer (`lead_trades`), forecast (`compute-trade-forecasts.js`, Spec 85) and cost (Spec 83) engines — *consumed*, not changed. The realtor-append path (`shouldAppendRealtor` in the classifiers) — out of scope (see §Out of scope).
- **Cross-Spec Dependencies:** **Spec 80** (`trades` = FK target for v1; `products`/`trade_products` = the v2 hub + install-side mirror), **Spec 85** (timing inheritance via `trade_forecasts`), **Spec 83** (`cost_basis`, trade-keyed cost).
