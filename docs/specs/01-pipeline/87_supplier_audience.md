# Spec 87: Supplier & Sell-Side Audience Model

**Status:** PROPOSED (design-of-record, 2026-06-17). The sell-side mirror of Spec 80's install-side `trade_products`. Implemented in a later WF — **NOT** part of the Spec 80 taxonomy WF2 (Phase 1).

## 1. Goal & User Story
> As a **supplier / manufacturer / retailer** — a single-line window maker, *or* a big-box like Home Depot that competes across many categories — I want project leads for the **product categories I sell**, timed to when each category is **sourced** on the project, so I reach the buyer at the right moment.

This spec defines the **sell-side audience**: `suppliers` accounts + their `supplier_products` subscriptions. It is the mirror of Spec 80's install-side `trade_products`. **Products (Spec 80) are the hub** — `trades` *install* them; `suppliers` *sell* them.

## 2. Position in the model (relationship to Spec 80)

```
 suppliers ──< supplier_products >── PRODUCTS (Spec 80) ──< trade_products >── TRADES (Spec 80)
   (this spec — sell side)              (the hub)              (Spec 80 — install side)
```

- **Spec 80** owns the FIXED taxonomy: `trades`, `products`, `trade_products` (seeded vocabulary).
- **This spec (87)** owns the sell-side ACCOUNTS: `suppliers` + `supplier_products`.
- A supplier lead **inherits the product's installing-trade forecast stage** (Spec 85) — no separate supplier forecast; cost stays trade-keyed (Spec 83).

## 3. Database Schema

### `suppliers`
| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | real company (Home Depot, Acme Lighting) |
| `account_type` | text | `supplier_retailer` \| `manufacturer` \| `rental_co` \| `service_co` |
| `status`, `created_at`, … | | account lifecycle |

### `supplier_products`
| column | type | notes |
|---|---|---|
| `supplier_id` | FK → `suppliers.id` | |
| `product_id` | FK → `products.id` (Spec 80) | |
| | PK (`supplier_id`, `product_id`) | many-to-many |

> **⚠️ CAVEAT — accounts data, not a fixed taxonomy.** Unlike Spec 80's `trades`/`products` (a seeded vocabulary), `suppliers` are **real marketplace accounts onboarded over time** (like `users`/`entities`). They are **seeded from supplier onboarding, NOT a migration seed**. Spec 80's `products.id` is the fixed FK target; this spec never modifies the Spec 80 taxonomy tables.

## 4. Behavioral Contract
- A supplier's **footprint = its `supplier_products` set**. Breadth alone distinguishes a big-box (many links) from a single-line manufacturer (one) — same table, no special "matches-everything" persona.
- **Lead production:** for a LEAD with product `P` present (via `permit_products` / the trade's `trade_products`), every supplier in `supplier_products` for `P` is a candidate audience. **Lead timing = the installing trade's `trade_forecasts` row for `P`** (joined via Spec 80 `trade_products`). So a lighting maker fires when `electrical` sources; Home Depot fires across all 21 of its categories.
- **No new forecast or cost model** — timing inherited from the installing trade (Spec 85); cost is trade-keyed (Spec 83 + `trades.cost_basis`).

## 5. Examples
| supplier | account_type | `supplier_products` (Spec 80 product ids) | lead streams |
|---|---|---|---|
| Home Depot | `supplier_retailer` | 1–20, 23 *(all 20 materials + scaffolding/tool rental)* | 21 (one per category, each timed by its installing trade) |
| Acme Lighting | `manufacturer` | 10 *(lighting)* | 1 (timed by `electrical`) |

## 6. Testing Mandate
- **Logic:** breadth model (HD many vs single-line one) resolves to the correct candidate set; a supplier lead inherits the installing trade's predicted_start.
- **DB:** `supplier_products` FK integrity to `suppliers.id` + Spec-80 `products.id`; no orphan links; PK uniqueness.

## 7. Operating Boundaries
- **Target Files:** (future) the accounts/marketplace migration (`suppliers`, `supplier_products`) + the sell-side matching/read layer. NOT `scripts/lib/classification/*`.
- **Out-of-Scope Files:** Spec 80 taxonomy tables (`trades`, `products`, `trade_products`) — *referenced* (FK target), never modified here. The forecast (`compute-trade-forecasts.js`, Spec 85) and cost (Spec 83) engines — *consumed*, not changed.
- **Cross-Spec Dependencies:** **Spec 80** (products = FK target + the hub; `trade_products` = the install-side mirror), **Spec 85** (timing inheritance), **Spec 83** (`cost_basis`, trade-keyed cost).
