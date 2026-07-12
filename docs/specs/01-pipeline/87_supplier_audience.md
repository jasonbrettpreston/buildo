# Spec 87: Supplier & Sell-Side Audience Model

**Status:** **v1 IMPLEMENTED (P9b, 2026-07-07)** — trade-level supplier linkage; the product-hub design is deferred to v2. Shipped: migration 213 (`supplier_trades` + the partial index `idx_lead_trades_trade_active`) + the admin-guarded serving endpoint `GET /api/admin/suppliers/leads` (`src/app/api/admin/suppliers/leads/route.ts` → `src/lib/admin/supplier-leads.ts`). The original design-of-record (2026-06-17) modelled suppliers against Spec 80's `products` hub (`suppliers` + `supplier_products` + a `trade_products` hop). That shape is correct for multi-category aggregators but heavier than a v1 needs. v1 links suppliers directly to **trades** and rides the EXISTING trade-keyed serving layer — no new product hop, no new forecast, no new cost model.

> **SCHEMA-STATE CORRECTION (2026-07-07 validation [INT #7]).** `suppliers` **and** `supplier_products` **already exist in the DB** — both shipped in **migration 183** (`183_suppliers_schema.sql`, schema-only, empty). So the v1 FK target (`suppliers.id`) is already live, and the **only genuinely new table v1 adds is `supplier_trades`.** The v2 product hub (§v2) is therefore **SHIPPED-BUT-DORMANT schema, not future work** — the tables exist and wait for a consuming read layer. Do **not** re-`CREATE` them.
>
> **DISAMBIGUATION — three similarly-named things, only one is new:**
> | table | status | what it is |
> |---|---|---|
> | `supplier_trades` | **NEW (v1)** | marketplace-account → `trade_id` many-to-many; the v1 mapping store below |
> | `suppliers` / `supplier_products` | **shipped, mig 183, empty** | the v2 product hub (§v2) — dormant, awaiting a read layer |
> | `trade_suppliers` | **shipped, mig 113 — 127 live rows** | a **different thing**: an admin-curated, **slug-based** supplier list feeding mobile onboarding (Spec 94). NOT a marketplace-account table, NOT keyed by `trade_id`. v1 does not touch it. |

> **P24 alignment (2026-07-11).** The consumer-side supplier persona is now first-class in the account model: `account_preset='supplier'` (migration 217) sits on a normal mobile account and is **architecturally identical to a tradesperson** — a single product trade, the standard trade-keyed feed (Spec 95 §2.5.1). A big-box multi-category supplier holds a **trade SET** via `trade_slugs_override` and rides the SELECTED-TRADE model (Spec 95 §2.5.2), operating one selected trade at a time via the mobile trade switcher. Suppliers may sign up **self-serve** (they onboard as a normal account; the `supplier` preset itself is **EXPLICIT-ONLY** — applied by admin provisioning or the audited Spec 21 join-editor re-label, never derived from the trade; Spec 21 §4 v2) OR be **admin-provisioned** end-to-end through the Spec 21 User Management tool (the JOIN editor edits the trade set; every edit is reason-fielded + audit-logged). This admin-guarded `supplier_trades` serving endpoint remains the marketplace/back-office read layer and is unchanged by P24.

## 1. Goal & User Story
> As a **supplier / manufacturer / retailer** — a single-line window maker, *or* a big-box like Home Depot that competes across many categories — I want project leads for the **trades I supply**, timed to when each trade is **sourced** on the project, so I reach the buyer at the right moment.

This spec defines the **sell-side audience**. v1 (§v1) is the governing design: a supplier account maps to a set of **trades**, and its lead feed is the existing trade-keyed lead layer. v2 (§v2) preserves the richer product-hub design for when multi-category aggregators arrive.

---

## §v1 — Trade-Level Supplier Path (GOVERNING DESIGN)

The v1 realization deliberately avoids the `products` hub. A supplier is an audience over **trades**, and the platform already produces a fully-populated, indexed, trade-keyed lead layer. v1 is therefore a thin mapping store + a filtered read over live data.

### v1.1 — Mapping store: `supplier_trades` (SHIPPED, mig 213)
| column | type | notes |
|---|---|---|
| `supplier_id` | FK → `suppliers.id` `ON DELETE CASCADE` | the marketplace account — **`suppliers` already exists (mig 183); this FK target is live, not new** |
| `trade_id` | FK → `trades.id` (Spec 80) `ON DELETE CASCADE` | one row per trade the supplier serves |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | onboarding timestamp |
| | PK (`supplier_id`, `trade_id`) | many-to-many; a supplier's footprint = its `trade_id[]` set (the PK doubles as the UNIQUE + the supplier_id-leading btree) |

- A supplier's **breadth = its `supplier_trades` set.** A single-line manufacturer maps to one trade; a broad supplier maps to several. No special "matches-everything" persona — breadth alone distinguishes them.
- `trades.id` is the fixed Spec 80 FK target; v1 never modifies the Spec 80 taxonomy tables.
- **CAVEAT — accounts data, not a fixed taxonomy.** Like `users`/`entities`, `suppliers` and their `supplier_trades` rows are **onboarded over time**, seeded from supplier onboarding, NOT a migration seed.

### v1.2 — Consumption: the existing trade-keyed serving layer
v1 reuses what the pipeline already ships — no supplier-specific forecast or cost:

- **`lead_trades`** is the live, indexed lead↔trade join. It carries **both `permit:` and `coa:` `lead_id` prefixes**. A supplier feed for trade `T` is a single JOIN: `lead_trades lt JOIN trades t ON t.id = lt.trade_id WHERE t.slug = <T> AND lt.is_active = true`.

  > **⚠️ LOAD-BEARING PRECISION CORRECTION (2026-07-07 [GRD P9b-5]).** `is_active = true` is a **precision-honest filter ONLY on the CoA side** (post-P6.6 it means `!fromBundle` — bundle-recall trades persist inactive; `classify-coa-trades.js:302`). **On the PERMIT side, `is_active = true` is NOT a precision signal:** the permit archetype-bundle prior writes rows at **`is_active = true`, tier 2, confidence 0.55** (`classify-permits.js:614-623`), and permit scope-limiting (`applyScopeLimit`) **DROPS** rows rather than deactivating them — so an active permit row can still be a low-confidence bundle guess. Permit-side precision lives in **`lead_trades.tier` / `lead_trades.confidence`**, not `is_active`. **The v1 feed MUST additionally filter/rank permit rows by `tier`/`confidence`** — filtering on `is_active` alone serves the 0.55 bundle prior as if it were a confirmed lead. *(Follow-up alternative: extend the P6.6 `!fromBundle` semantics to the permit bundle prior so `is_active` becomes symmetric — then the feed could rely on it on both sides.)*

  > **INDEX NOTE (2026-07-07 [INT #8]) — SHIPPED.** `lead_trades` had two independent single-column indexes (`idx_lead_trades_trade` on `trade_id`, `idx_lead_trades_active` on `is_active`); neither served the per-trade active-lead JOIN. Migration 213 added the partial index **`idx_lead_trades_trade_active ON lead_trades (trade_id) WHERE is_active`**.

  Live coverage (POST-P7, 2026-07-07): **35 trades on the permit side, 34 on the CoA side** carry `is_active=true` leads (see §v1.4). Note the permit `is_active` figure spans direct + bundle-prior rows; the feed's precision guard narrows the permit set further (§v1.3).
- **`trade_forecasts`** supplies lead **timing** — join on `lead_id` to inherit the installing trade's `predicted_start` (Spec 85). No separate supplier forecast.
- **Cost stays trade-keyed** (Spec 83 + `trades.cost_basis`) — unchanged.

### v1.3 — Serving endpoint (SHIPPED)
`GET /api/admin/suppliers/leads?supplier_id=<id>&limit=&offset=` (`src/app/api/admin/suppliers/leads/route.ts`; query lib `src/lib/admin/supplier-leads.ts`). It resolves the caller's `supplier_trades` set (unknown `supplier_id` → **404**), then serves the `lead_trades`(`is_active=true`, **plus the §v1.2 permit-side tier/confidence filter**) ⋈ `trade_forecasts` join filtered to those trades in ONE response (M-scope — the supplier's full trade set). Ordering is `ORDER BY tf.predicted_start ASC NULLS LAST, lt.classified_at DESC, lt.lead_id ASC` — a defined null fallback + a fully deterministic recency/id tiebreak so the §v1.4 gap rows never sort undefined.

> **TWO SECURITY/PRINCIPAL FENCES — resolved as implemented (2026-07-07 [GRD P9b-4]).**
> 1. **Principal — v1 is ADMIN-facing, not an external supplier account.** The route requires `verifyAdminAuth` (Spec 33 §5) + an **explicit `supplier_id` param**. This sidesteps the single-trade 403 model of `feed/route.ts:68-70` entirely: there is no supplier principal in `getCurrentUserContext` yet — **external supplier-account auth is deferred to v2.** The endpoint is a supplier *view* for the admin, not a supplier's own feed.
> 2. **CoA-exposure gate — killswitch parity.** `coa:` leads are included ONLY behind the **same `LEAD_FEED_DISABLE_COA` env read** the main feed uses (`process.env.LEAD_FEED_DISABLE_COA !== '0'`). Default keeps coa rows off (permit leads only); the admin deployment sets `=0` to surface them. `records_meta.coa_included` reports which arm served.
>
> **Permit-side precision guard (as implemented).** Per §v1.2, permit rows carry `AND (lt.tier <= 1 OR lt.confidence > 0.55)` so the tier-2/confidence-0.55 bundle prior is excluded; CoA rows pass on `is_active` alone (post-P6.6 `!fromBundle`). Live confirmation: `overhead-doors` has 75,898 active permit leads but **0** pass the guard (all tier-2/0.55 bundle) — correctly excluded; `plumbing` has 129,316 that pass (direct tier-1).
>
> **SUBSTRATE HONESTY [INT #9].** This feed is **multi-trade + `lead_trades`-based** (not the single-trade + `permit_trades`-based `get-lead-feed.ts`). It is not a thin wrapper — hence the standalone lib + route rather than a param on the existing feed.

> **CAVEAT — v1 correctness depends on the P6.6 fan-out fix (2026-07-07 adversarial-review fold).** The `is_active = true` filter is only meaningful because `classify-coa-trades.js` sets `is_active = !fromBundle` (commit `9883656`): bundle-recall trades persist inactive. If that logic is ever reverted or the P7 reset+re-run doesn't complete, CoA rows revert to median 33/35 active trades and this feed serves grossly inflated CoA data for every trade. The regression locks pinning `is_active === !fromBundle` are the guard — do not weaken them.

### v1.4 — Known v1 gap: CoA forecast-timing parity (RE-MEASURED POST-P7 — the gap collapsed)
Not every CoA lead has a forecast timing anchor. **Live (POST-P7 re-measure, 2026-07-07): CoA `is_active=true` leads span 34 trades, and 33 of them have a CoA `trade_forecasts` row with a non-null `predicted_start` — a 1-trade gap.** The single gap trade is **`site-maintenance`**, which is **excluded from forecasting BY DESIGN** (P1's `logic_variables.forecast_excluded_trade_slugs` — no phase-anchored install window). The permit side is symmetric: 35 active trades, 34 with `predicted_start` (same one excluded trade). So the CoA timing gap is effectively **resolved** — every forecastable CoA trade carries a timing anchor. The pre-P7 "35-vs-19 (~16-trade) gap" was an artifact of the pre-fan-out-fix corpus (median 33/35 active trades per CoA); the P6.6 `is_active = !fromBundle` reset flipped ~490K `lead_trades` rows inactive and the forecast trade set recomputed cleanly.

> **MECHANISM — it's a DATA gap, not a phase-mapping gap (2026-07-07 [GRD P9b-6]).** The CoA forecast branch (**Branch B**, Spec 85) **never keys on per-trade phase targets at all** — it uses a **uniform `targetWindow='bid'`** with cohort calibration. The lone residual (`site-maintenance`) is not an un-mapped phase; it is a **row-level exclusion** (the non-forecastable slug). No phase-table fix is warranted. Those rows still surface in the supplier feed with `predicted_start = NULL` and are ordered last (NULLS LAST) — deterministic, never crashing the sort.

### v1.5 — Implementation (SHIPPED, P9b)
- Migration `213_supplier_trades.sql` — `supplier_trades` (PK `(supplier_id, trade_id)`, FKs CASCADE) + partial index `idx_lead_trades_trade_active`.
- Endpoint `GET /api/admin/suppliers/leads` (`src/app/api/admin/suppliers/leads/route.ts` + `types.ts`) → `src/lib/admin/supplier-leads.ts` (`SUPPLIER_LEADS_SQL`, `getSupplierLeads`, `getSupplierTrades`).
- Tests: `src/tests/supplier-leads.logic.test.ts` (SQL/fence/schema locks) + `src/tests/db/supplier-leads.db.test.ts` (migration round-trip + trade filtering + precision guard + CoA killswitch + NULLS-LAST ordering + 404).

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
- **Target Files (v1, SHIPPED):** `migrations/213_supplier_trades.sql`; `src/app/api/admin/suppliers/leads/{route,types}.ts`; `src/lib/admin/supplier-leads.ts`. NOT `scripts/lib/classification/*`.
- **Target Files (v2, deferred):** the `supplier_products` product-hub migration + product-keyed matching/read layer.
- **Out-of-Scope Files:** Spec 80 taxonomy tables (`trades`, `products`, `trade_products`) — *referenced* (FK target), never modified here. The lead-serving layer (`lead_trades`), forecast (`compute-trade-forecasts.js`, Spec 85) and cost (Spec 83) engines — *consumed*, not changed. The realtor-append path (`shouldAppendRealtor` in the classifiers) — out of scope (see §Out of scope).
- **Cross-Spec Dependencies:** **Spec 80** (`trades` = FK target for v1; `products`/`trade_products` = the v2 hub + install-side mirror), **Spec 85** (timing inheritance via `trade_forecasts`), **Spec 83** (`cost_basis`, trade-keyed cost).
