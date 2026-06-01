# Enrich: Permit + CoA Zoning (Spec 58 WF3) — **v1.0**

**Version:** 1.0 — authored 2026-05-31 via WF1/Genesis. Third & final WF of Spec 58's epic (WF1 ingest ✅ `58914fa` → WF2 parcel enrich ✅ `1da014c` → **WF3 permit/CoA enrich (this spec)**). Folds two adversarial plan-review rounds (5-panel + 4-panel) and a live data-profiling spike (`docs/runbook/66_enrich_permits_spike.md`).

## Cumulative design decisions

- **DEC-1 — Multi-parcel resolution (Spec 58 §8d "dominant by area; full list as jsonb").** A lead's scalar zoning fields come from its **dominant linked parcel** = `ROW_NUMBER() OVER (PARTITION BY lead ORDER BY parcels.lot_size_sqm DESC NULLS LAST, link.confidence DESC NULLS LAST, parcels.id ASC)` rn=1. Provenance recorded: `zoning_dominant_parcel_id`, `zoning_dominant_parcel_method='max_area'`, `zoning_parcel_count`. The full per-parcel list → `applicable_bylaws` jsonb. **Spike finding: multi-parcel is ≈ 0** (`permit_parcels` is exactly 1:1; 1 live CoA is multi-parcel) — so this machinery is correct but **forward-looking / defensive**; `applicable_bylaws` is a single-element array today.
- **DEC-2 — One script, two chain modes.** ONE `scripts/enrich-permits.js` (advisory lock **66** = spec number) with a **required, whitelist-validated** `ENRICH_TARGET ∈ {permits, coa}` (startup guard throws on unset/invalid — §R5; never interpolated into SQL). TWO manifest entries: `enrich_permits` (permits chain, after `link_parcels`) + `enrich_coa_zoning` (coa chain, after `link_coa_to_parcels`), each carrying `env.ENRICH_TARGET`. `pipeline.run('enrich-permits', …)` literal slug; `pipeline_runs.pipeline` = `run-chain.js` `${chainId}:${slug}` (auto-distinct: `permits:enrich_permits`, `coa:enrich_coa_zoning`). Single lock is correct — the chains run 1 h apart (`local-cron.js`) + are chain-locked (shared-lock serialisation refuted by Integration).
- **DEC-3 — Always-full relational join (no incremental).** Unlike WF2's 8-min spatial join, WF3 is a cheap indexed relational join — the full 248K-permit dominant-parcel scan ran in **4.7 s** (spike). Every run recomputes ALL leads; `IS DISTINCT FROM` write-guards keep writes minimal. This is strictly MORE correct than a timestamp incremental — a from-scratch recompute auto-catches un-links, re-links, and parcel re-enrichment, and avoids the `NULL`-target skip bug. No `--full` flag.
- **DEC-4 — CoA joins on the stored key.** `lead_parcels lp ON lp.lead_id = c.lead_id` (the stored, trigger-synced `coa_applications.lead_id`; 100% populated per spike), NOT a re-derived `'coa:'||application_number` — matches `link-coa-to-parcels.js` "never re-derive" contract.
- **DEC-5 — Honest F-H12 gates (spike-calibrated, still FAIL-enforced).** §8d's 99%/95% are unachievable: live coverage is **84.2% (construction permits) / 84.4% (CoA)** — ceiling ≈ 5.5% no-link + ~10% gap-parcel. Gates FAIL below **80%** (PASS ≥83, WARN 80–83) — a regression catch, not an aspirational target. Thresholds in `docs/specs/_contracts.json`; the gate stays a machine FAIL, never demoted to INFO.

---

<requirements>
## 1. Goal & User Story

Decorate every `permits` row and `coa_applications` row with its applicable zoning by-law context, by JOINing the WF2-enriched `parcels` through `permit_parcels` (permits) and `lead_parcels` (CoA). This is the **final arrow** of Spec 58 §8e: zoning on leads → the Spec 76 lead dashboard + the Phase-3 cost model (which reads `permits.bylaw_max_coverage_pct` / `.bylaw_max_fsi`). Emits the **F-H12 end-objective machine gates**.

**Scope:** the `parcels → permits/coa` copy. No new ingestion, no spatial ops (purely relational — WF2 did the spatial work). Out of scope: `lot_configuration` (corner/interior lot — Spec 62); heritage/TRCA/etc (their own source specs); the UI consumer (separate WF).

**Success criterion (calibrated):** `permits_zoning_class_coverage_pct` (construction) ≥ 80% and `coa_zoning_class_coverage_pct` ≥ 80% — machine-enforced FAIL gates (DEC-5). The true end-state is ~84% (not §8e's aspirational ~99%); the gap is structural (no-link + gap-parcels).
</requirements>

---

<architecture>
## 2. Technical Architecture

### Upstream dependency (consumes WF2)
Reads `parcels` zoning columns (migration 165). **Precondition:** HALT if `COUNT(*) FROM parcels WHERE zoning_enriched_at IS NOT NULL = 0` (WF2 never ran) — distinct from "WF2 ran, some gaps" (proceeds; gap parcels yield NULL zoning, counted not failed). No PostGIS required.

### Database Schema — `migrations/166_permits_coa_zoning_columns.sql`
`ALTER TABLE … ADD COLUMN` (all nullable/no-default → metadata-only; DOWN comments-only; **no in-migration index** — Rule 2; indexes out-of-band). Mirrors mig 165 conventions.

**`permits`** (PK `(permit_num, revision_num)`, ~248K rows):
`zoning_class TEXT`, `bylaw_max_coverage_pct NUMERIC(5,2)`, `bylaw_max_fsi NUMERIC(6,3)`, `bylaw_max_height_m NUMERIC(8,2)`, `exception_number INTEGER`, `applicable_bylaws JSONB`, `overlay_summary JSONB`, `zoning_parcel_count INTEGER`, `zoning_dominant_parcel_id INTEGER`, `zoning_dominant_parcel_method TEXT CHECK (zoning_dominant_parcel_method IN ('max_area'))`, `zoning_enriched_at TIMESTAMPTZ`.

**`coa_applications`** (PK `id`, ~33K rows):
`zoning_class TEXT`, `bylaw_max_coverage_pct NUMERIC(5,2)`, `bylaw_max_fsi NUMERIC(6,3)`, `bylaw_max_height_m NUMERIC(8,2)`, `exception_number INTEGER`, `variance_context JSONB`, `zoning_parcel_count INTEGER`, `zoning_dominant_parcel_id INTEGER`, `zoning_dominant_parcel_method TEXT CHECK (… IN ('max_area'))`, `zoning_enriched_at TIMESTAMPTZ`. (**No `base_zoning_class`** — redundant copy of `zoning_class`; the base snapshot lives in `variance_context`.)

### Frozen jsonb shapes (consumers: Spec 76 UI + cost model)
- **`applicable_bylaws`** (permits) — ordered array, dominant first (single-element today per DEC-1):
  `[{ "parcel_id": int, "zoning_class": text|null, "bylaw_max_fsi": num|null, "bylaw_max_coverage_pct": num|null, "bylaw_max_height_m": num|null, "exception_number": int|null, "area_share": num }]`
- **`overlay_summary`** (permits) — inherits WF2's already-resolved overlays (NO spatial re-derivation, NO blanket numeric MIN): the dominant parcel's `parcels.zoning_overlays` jsonb, plus the 7 membership booleans `bool_or`'d across linked parcels: `{ "<overlay_key>": bool, …, "detail": <dominant parcels.zoning_overlays> }`.
- **`variance_context`** (CoA) — the zoning the variance is measured against: `{ "base": { "zoning_class", "bylaw_max_fsi", "bylaw_max_coverage_pct", "bylaw_max_height_m", "exception_number" }, "parcels": [ <applicable_bylaws element shape> ] }`.

### Implementation — `scripts/enrich-permits.js` (Spec 47 §R1–R12)
- Lock `66`; `require.main === module` guard; `ENRICH_TARGET` startup guard (whitelist).
- Per mode, ONE set-based pass: a CTE ranks each lead's linked parcels (DEC-1), `jsonb_agg(... ORDER BY area_share DESC, parcel_id)` (**explicit ORDER BY — idempotency**, per the WF2 float/jsonb lesson) for the jsonb cols, rn=1 scalars; stages a `TEMP TABLE` → trivial `UPDATE … FROM` with `IS DISTINCT FROM` on every written col **except `zoning_enriched_at`** (idempotent — scalars copied verbatim from already-`NUMERIC` parcel cols, no float-trap).
  - Permits: `permits p → permit_parcels pp ON (pp.permit_num,pp.revision_num)=(p.permit_num,p.revision_num) → parcels par ON par.id = pp.parcel_id`. Tie-break uses `pp.confidence`.
  - CoA: `coa_applications c → lead_parcels lp ON lp.lead_id = c.lead_id → parcels par ON par.id = lp.parcel_id` (DEC-4). Tie-break `lp.confidence`.
- Construction-permit gate denominator **JOINs the canonical `permit_type_classifications` table** (`ptc.class='construction'`), not a hand-rolled literal permit-type list.
- After the main `UPDATE`, a guarded `UPDATE … SET <cols>=NULL WHERE zoning_enriched_at IS NOT NULL AND NOT EXISTS(<link>)` **clears un-linked leads** — a lead that had enrichment but lost ALL parcel links (absent from the temp table) would otherwise keep stale zoning (`<prefix>_unlink_cleared_count` INFO row). Idempotent (re-run matches 0).
- **`scripts/one-time/backfill-permits-coa-zoning-index.js`** — `CREATE INDEX CONCURRENTLY … WHERE zoning_class IS NOT NULL` (partial) on both tables + GIN on the jsonb columns. Out-of-band (mig-116 precedent); no advisory lock.
</architecture>

---

<behavior>
## 3. Behavioral Contract
- **Inputs:** chain step `enrich_permits` (permits chain, after `link_parcels`) or `enrich_coa_zoning` (coa chain, after `link_coa_to_parcels`); `ENRICH_TARGET` env selects the mode.
- **Core Logic:** precondition HALT (§2) → full-scan dominant-parcel CTE → temp-table stage → idempotent `UPDATE` → emit summary/meta.
- **Outputs:** mutates the target table's zoning columns; `PIPELINE_SUMMARY` (`records_updated` = rows changed for that mode; `records_total`/`_new` = null — Enrich archetype) + `PIPELINE_META`.
- **Edge Cases:** WF2-never-ran HALT · lead with no linked parcel (zoning NULL, counted not failed) · linked parcel is itself a zoning gap (NULL zoning) · multi-parcel (dominant + jsonb list — ~0 today) · idempotent re-run (0 writes) · CoA with NULL `lead_id` (none live; degrades to no-link) · 0 construction permits (gate NULLIF-guarded → INFO, not FAIL).

## 3a. Observability (Spec 47 §8.2 row-derived cascade; gates spike-calibrated — DEC-5)

**permits mode:**
| metric | threshold | status |
|---|---|---|
| `permits_zoning_class_coverage_pct` (construction; `NULLIF`-guarded) | PASS ≥83 / WARN 80–83 / **FAIL <80** (`_contracts.json` `permits_zoning_class_coverage_fail`) | **hard gate** (live 84.2%) |
| `permits_construction_count_zero` | n/a | INFO (only if denominator 0 → gate value NULL, no FAIL) |
| `permits_no_parcel_link_count` | n/a | INFO (live 13,759) |
| `permits_unlink_cleared_count` | n/a | INFO (leads reset because they lost all parcel links; live 0) |
| `permits_enriched_count` (= `records_updated`) | n/a | INFO |
| `permits_multi_parcel_count` / `permits_heterogeneous_assembly_count` | n/a | INFO (live 0/0) |
| `bylaw_max_{fsi,coverage_pct,height_m}_null_pct` | n/a | INFO (sparse-by-design) |
| `enrich_permits_duration_ms` | n/a; WARN if > 2× prior | INFO |

**coa mode:** `coa_zoning_class_coverage_pct` (all CoA; FAIL <80, live 84.4%) + the analogously-named INFO rows: `coa_no_parcel_link_count`, `coa_unlink_cleared_count`, `coa_enriched_count`, `coa_multi_parcel_count`, `coa_heterogeneous_assembly_count`, `coa_bylaw_max_{fsi,coverage_pct,height_m}_null_pct`, `enrich_coa_zoning_duration_ms`. (Zero-denominator guard: `coa_row_count_zero`, not a "construction" variant.)

**Verdict cascade (Spec 47 §8.2):** `rows.some(r=>r.status==='FAIL')?'FAIL':rows.some(r=>r.status==='WARN')?'WARN':'PASS'` — row-derived, never a parallel boolean. **Counters (§11):** `records_total/_new = null`; `records_updated` = the mode's primary entity (permits OR coa).

## 3b. emitMeta (per mode)
Permits mode reads `{permits:[permit_num,revision_num,permit_type], permit_parcels:[permit_num,revision_num,parcel_id,confidence], parcels:[id,zoning_class,bylaw_max_coverage_pct,bylaw_max_fsi,bylaw_max_height_m,exception_number,zoning_overlays,lot_size_sqm,zoning_enriched_at], permit_type_classifications:[permit_type,class]}` writes `{permits:[<all 11 cols>]}`. CoA mode reads `{coa_applications:[id,lead_id], lead_parcels:[lead_id,parcel_id,confidence], parcels:[…]}` writes `{coa_applications:[<all 10 cols>]}`.

## 3c. §10 Cross-WF tracing (terminal step)
Spec 58 §10's triage path step 4 inspects this WF. **Both slugs** are documented: `permits:enrich_permits` (permits gate) and `coa:enrich_coa_zoning` (coa gate). This is the **terminal** step of the epic — no §9 producer contract (nothing downstream in the pipeline consumes its `records_meta`; the UI reads the columns directly).
</behavior>

---

<failure_modes>
## 3d. Known Failure Modes
*(Seeded from plan review; populated as guards land.)*
- **F-H12 over-gating** — a 99/95 gate is impossible (~84% ceiling). Guard: DEC-5 spike-calibrated 80% thresholds in `_contracts.json` + `contracts.infra.test.ts`.
- **Incremental staleness** (avoided) — a timestamp incremental misses un-links + skips NULL-target rows. Guard: DEC-3 always-full recompute.
- **jsonb non-determinism** — `jsonb_agg` without `ORDER BY` → guard sees "changed" jsonb every run (WF2 lesson). Guard: explicit `ORDER BY area_share DESC, parcel_id`.
- **CoA key re-derivation** — re-deriving `'coa:'||application_number` diverges from the producer. Guard: DEC-4 join on stored `c.lead_id`.
- **Gate div-by-zero** — 0 construction permits → NULL/crash. Guard: `NULLIF` + `permits_construction_count_zero` INFO.
</failure_modes>

---

<testing>
## 4. Testing Mandate
- **Logic** (`src/tests/zoning-permits.logic.test.ts`): dominant-parcel ranking order; `applicable_bylaws`/`overlay_summary`/`variance_context` jsonb builders + stable order; `ENRICH_TARGET` whitelist guard.
- **Infra** (`src/tests/permits-coa-zoning-columns.regression.test.ts`): migration 166 columns + types + `method` CHECK + no in-migration index; dual-chain cascade lock (both manifest entries, lock 66, chain counts permits 30 / coa 16).
- **DB integration** (`src/tests/db/enrich-permits.db.test.ts`, gated): permits + CoA JOIN happy path; multi-parcel dominant + applicable_bylaws array; **heterogeneous assembly** fixture; gap lead (no link → NULL); **WF2-enriched-0-parcels** precondition HALT; idempotent re-run (0 writes); F-H12 gate math incl. construction filter + `NULLIF` 0-denominator.
SPEC LINK header on each.
</testing>

---

<constraints>
## 5. Operating Boundaries
### Target Files
`scripts/enrich-permits.js`, `scripts/one-time/backfill-permits-coa-zoning-index.js`, `migrations/166_permits_coa_zoning_columns.sql`, `scripts/manifest.json` (2 entries + 2 chain inserts), `src/components/FreshnessTimeline.tsx` (registry ×2 + permits/coa chains), `src/lib/admin/funnel.ts`, `src/tests/pipeline-advisory-lock.infra.test.ts` (lock 66), `src/tests/chain.logic.test.ts` (permits 30 / coa 16), `src/tests/quality.logic.test.ts` (registry 56 / link 19 / permits 30 / coa 16), `src/tests/contracts.infra.test.ts` (F-H12 consumer rules), `docs/specs/_contracts.json`, `docs/specs/01-pipeline/41_chain_permits.md` + `42_chain_coa.md` (step docs), `src/tests/factories.ts`, 3 test files.

### Out-of-Scope Files
- `parcels` / zoning tables — owned by Specs 65 / 58 (WF3 only reads them).
- `permit_parcels` / `lead_parcels` — owned by Specs 41/42/55 (read only).
- `lot_configuration` / heritage / TRCA / corner-lot parcel columns — Specs 62/61/59.
- UI / cost-model — downstream consumers.

### Cross-Spec Dependencies
- **Relies on:** Spec 65 (`parcels` zoning columns + `zoning_enriched_at`), Spec 58 (§8d/§8e/F-H7/F-H12), Spec 47 (§R1–R12, §6.4, §8, §11), Spec 48 (§3.6), Spec 41 (`chain_permits`), Spec 42 (`chain_coa` + `lead_parcels` / `lead_id`), Spec 30 (Enrich archetype), `permit_type_classifications` (Spec — construction gate).
- **Consumed by:** Spec 76 lead dashboard, Phase-3 cost model (terminal — no pipeline §9 contract).
</constraints>
