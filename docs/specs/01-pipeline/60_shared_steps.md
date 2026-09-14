# Shared Pipeline Steps

<requirements>
## 1. Goal & User Story
These 8 transformation steps run in multiple chains — they can't live inside a single chain spec. Each links, enriches, or validates permit data using shared reference tables.
</requirements>

---

<architecture>
## 2. Step Registry

| Slug | Script | Chains | Reads | Writes |
|------|--------|--------|-------|--------|
| `geocode_permits` | `geocode-permits.js` | permits, sources | permits, address_points | permits (lat/lng) |
| `link_parcels` | `link-parcels.js` | permits, sources | permits, parcels | permit_parcels |
| `link_neighbourhoods` | `link-neighbourhoods.js` | permits, sources | permits, neighbourhoods | permits (neighbourhood_id) |
| `link_massing` | `link-massing.js` | permits, sources | parcels, building_footprints | parcel_buildings |
| `link_wsib` | `link-wsib.js` | permits, sources | entities, wsib_registry | entities, wsib_registry |
| `link_coa` | `link-coa.js` | permits, coa | coa_applications, permits | coa_applications, permits (back-ref + last_seen_at) |
| `create_pre_permits` | `create-pre-permits.js` | permits, coa | coa_applications | permits (synthesized `PRE-` rows) |
| `refresh_snapshot` | `refresh-snapshot.js` | all chains | 9 tables (sequential, one pinned connection — WF3 F1, `8cc99c78`) | data_quality_snapshots |
</architecture>

---

<behavior>
## 3. Step Details

### Geocode Permits (`geocode-permits.js`)
**Modes:** Incremental (default: only NULL coords) / Full (`--full`: all permits)

1. Query permits where `latitude IS NULL`
2. Match against `address_points` table by street number + name
3. If no match: fall back to Google Maps Geocoding API
4. Update `permits.latitude`, `permits.longitude`

**Edge Cases:** Google API quota exhausted → permits left with NULL coords, skipped by downstream spatial linking. No address_points loaded → all falls to Google (expensive).

**Testing:** `geocoding.logic.test.ts`

---

### Link Parcels (`link-parcels.js`)
**Modes:** Incremental / Full (`--full` in sources chain)
**Method:** Nearest-neighbour bbox (0.001°) + polygon containment upgrade

1. For each geocoded permit: find nearest parcels within bounding box
2. Check `booleanPointInPolygon` for precision upgrade
3. Record match type: `spatial_polygon` or `spatial_centroid`
4. Batch upsert to `permit_parcels`

**Edge Cases:** Permit outside all polygons → centroid-only match. No parcels in bbox → no link.

**Testing:** `parcels.logic.test.ts`

---

### Link Neighbourhoods (`link-neighbourhoods.js`)
**Method:** Turf.js `booleanPointInPolygon` for 158 neighbourhood boundaries

1. Load all 158 neighbourhood polygons as Turf features
2. For each permit with coordinates: test against each polygon
3. Update `permits.neighbourhood_id` (sentinel `-1` for unmatched)

**Edge Cases:** No coordinates → skipped. N+1 query pattern (individual UPDATE per permit — known perf issue).

**Testing:** `neighbourhood.logic.test.ts`

---

### Link Massing (`link-massing.js`)
**Modes:** Incremental / Full (`--full` in sources chain)
**Method:** Nearest-neighbour spatial match within bbox
**Safeguard:** Parameter flush at 30,000 params (§9.2)

1. Process parcels in batches of 500 (keyset pagination)
2. For each parcel: find building footprints within spatial bbox
3. Associate via `parcel_buildings` junction table
4. Flush INSERT when approaching 30K parameter limit

**Edge Cases:** Dense urban areas → parameter flush prevents PG limit breach.

**Testing:** `massing.logic.test.ts`

---

### Link WSIB (`link-wsib.js`)
**Method:** `pg_trgm` trigram similarity, a 3-tier cascade (corrected 2026-08-28, C1 pilot 4 — this section previously and incorrectly described Levenshtein distance; the real method has never been Levenshtein)

1. Tier 1 — exact trade-name match (`wsib_registry.trade_name_normalized = entities.name_normalized`) → 0.95 confidence
2. Tier 2 — exact legal-name match (`wsib_registry.legal_name_normalized = entities.name_normalized`) → 0.90 confidence
3. Tier 3 — `pg_trgm` fuzzy match via `similarity()` over GIN trigram indexes, article-stripped first-letter blocking (`d704a447`) **AND** a token-overlap requirement (LW-D14, 2026-08-28, widened LW-D18, 2026-08-29: the WSIB name and the matched entity name must share at least one non-generic token — both names have `-`/`.`/`'`/`&`/`+` stripped (so "T.T.S." tokenizes identically to "TTS"), are tokenized on whitespace, generic stopwords stripped (31 words: CONSTRUCTION/CONTRACTING/BUILDERS/HOMES/GROUP/INC/LTD/LIMITED/CO/COMPANY/CORP/ENTERPRISES/DEVELOPMENTS/SERVICES/ONTARIO/CANADA/GENERAL/RENOVATION/RENOVATIONS/MANAGEMENT/DESIGN/BUILD/CUSTOM/HOME/IMPROVEMENT/IMPROVEMENTS/BUILDING/ASSOCIATES/TOP/ALL/QUALITY) along with purely-numeric tokens, and the two token sets must overlap — `similarity() > threshold` blocking alone let two differently-named companies match on a shared generic word) → 0.60 confidence, capped at 1,000 matches per invocation
4. Each tier writes `wsib_registry.linked_entity_id`/`match_confidence`/`matched_at`, then `entities.is_wsib_registered` (once), then fills empty `entities` contact columns (`primary_phone`/`primary_email`/`website`) from the matched `wsib_registry` row — never overwriting an existing value

**Edge Cases:** Generic names → may match wrong WSIB entry — this was the fan-in / magnet-entity concentration named in `docs/specs/01-pipeline/122_pipeline_step_optimization.md` C1 pilot 4; LW-D14's token-overlap requirement (above) is the fix, measured live pre-fix at only 10.49% (840/8,009) of Tier-3 links sharing a genuine non-generic token. A declared check `tier3_token_overlap` (FAIL below `link_wsib_tier3_token_overlap_fail_pct`, default 50) makes any regression visible post-write. LW-D18 (2026-08-29): a 60-row precision sample of the LW-D14-fixed population still measured only 15–25% genuine matches — 80% of the confirmed failures shared one of 15 more industry-generic words (now stopworded, above) or a punctuation-only naming variant (now normalized, above). A fresh 60-row post-fix sample measured 31.7%–46.7% (assessment §8d) — real, but still not complete: several MORE generic industry words (RESTORATION, PROPERTIES, STRUCTURES, MECHANICAL, ENGINEERING, DRYWALL, CARPENTRY, FIRE, PROTECTION, CONSTRUCTORS), the filler word "AND", a singular/plural stopword gap (DEVELOPMENT vs DEVELOPMENTS), and single-letter-initial token collisions from the punctuation strip (`D & D` → a bare "D" token) remain as named, filed residuals (`docs/reports/review_followups.md`) — a token-overlap requirement narrows the false-match surface, it does not eliminate it; same-first-name/different-surname pairs (e.g. two different "Michael"s) are a structural floor no token rule can resolve without a second signal (phone/address/permit co-occurrence). `link_rate_warn` (T2) is entity-scoped (`entities.is_wsib_registered = true` count / total entities), not row-scoped — a single magnet entity's many contaminated rows no longer inflate the ratio. WSIB refresh (`load_wsib`, annual cadence) → newly-unlinked rows are matched on the next incremental run; an already-linked row is never re-evaluated except by the operator-invoked tier-3 repair (A-7).

**Testing:** `wsib.logic.test.ts`, `src/tests/steps/link_wsib/violations.test.ts`

---

### Link CoA (`link-coa.js`)
> **Status (verified 2026-07-07 against `scripts/link-coa.js`):** current contract below supersedes the
> pre-2026-07 "3-tier / 0.95-0.60-0.30" summary. The authoritative source for the enrichment/back-ref
> passes is `42_chain_coa.md` §6.6.D / §6.6.X / §6.11 Phase D R5.1+R5.6; this section is the shared-step
> summary. `link_coa` runs in BOTH chains: **permits chain step 20/32** (`link_coa` at index 19) and
> **coa chain step 9/16** (index 8) — verified in `scripts/manifest.json`.

**Method:** Multi-tier cascade address matching (exact → street-name → description FTS). Ward is a
confidence *booster*, not a gatekeeper (~80% of permits have NULL ward, so requiring it would blind the
linker). `Pre-Permit` synthetic permits are excluded from every tier.

**Confidence matrix** (with live distribution over `coa_applications.linked_confidence`, 2026-07-07):

| Tier | Match basis | Confidence | Live count |
|------|-------------|-----------:|-----------:|
| 1a | street_num + street_name_normalized + ward match | 0.95 | 14,393 |
| 1b | street_num + street_name_normalized, permit ward NULL | 0.85 | 858 |
| 1c | street_num + street_name_normalized, ward **conflict** (flagged for review) | 0.10 | (in 0.10 bucket) |
| 2a | street_name_normalized + ward match (no street_num) | 0.60 | 3,272 |
| 2b | street_name_normalized, permit ward NULL | 0.50 | 3,946 |
| 3  | description FTS (`plainto_tsquery`, batched via unnest + CROSS JOIN LATERAL) | 0.26–0.50 | ~10,600 (largest bucket 0.35 = 4,610) |
| —  | ward-conflict (1c) + FTS fallback | 0.10 | 1,683 |
| —  | unmatched (no linkable street/description) | NULL | 221 |

Tier order is a waterfall: each tier's UPDATE only touches rows still `linked_permit_num IS NULL`, so a
row settles at its highest-confidence tier. Multiple permits at one address → most recent
(`COALESCE(issued_date, application_date) DESC`, then highest `permit_num`) wins via `DISTINCT ON (ca.id)`.

**Consumer contract — the identity floor (`>= 0.85`, WF2 P12-B1):** the field is dual-purpose and `linked_permit_num` is written at **every** tier (0.95/0.85 identity, 0.60/0.50 geo, 0.10 flagged). Reads split by intent:
- **Identity reads** — "surface THIS property's permit" or "this CoA is already permitted" (`src/lib/coa/repository.ts` `getCoaByPermit`, `/api/coa`, `/api/permits/[id]` CoA detail, the Spec 76 lead-inspector cross-stream panel, and the pre-permit existence checks in `src/lib/coa/pre-permits.ts` + `/api/admin/stats`) — require **`linked_confidence >= 0.85`** (`COA_IDENTITY_LINK_MIN_CONFIDENCE`, `src/lib/coa/link-confidence.ts`). A sub-0.85 link is a same-street/wrong-house (Tier 2) or cross-ward (Tier 1c) association; surfacing it as the identity permit shows the WRONG property, and letting it suppress a genuine pre-permit is the same wrong-property error.
- **Geo-inheritance reads** — lat/long/ward enrichment (below) — keep the **`>= 0.60`** floor. The 0.10 Tier-1c bucket is a deliberate geo-only fence, never treated as identity. The field is **never cleared** by the floor; it is a read-time filter only.

**Cross-ward unlink pre-pass:** before linking, the script UNLINKs any CoA whose retained ward disagrees
with its linked permit's ward (`LTRIM(ward,'0')` compare, excluding the intentional 0.10 Tier-1c
matches). It also NULLs the corresponding `permits.linked_coa_application_number` back-ref when no other
CoA still references that permit (`stale_back_refs_cleared_count` audit row). This clears drift left by
prior runs before the tiers re-link.

**Back-ref pass — confidence floor (WF2 2026-07, `permits.linked_coa_application_number`):** the back-ref
is now **floored at `>= coa_inherit_from_permit_min_confidence` (default 0.60 = `inheritConfMin`)**, matching
the five geo-inheritance passes below (previously it had NO floor and would write a parent-context signal
off a link as weak as a Tier-3 FTS guess). It runs **clear-then-set** in one transaction:
1. **CLEAR** the back-ref on any permit that no longer has *any* CoA link `>= 0.60`.
2. **SET** the authoritative back-ref from the floored subquery, tie-broken APPROVED-decision-first →
   `decision_date DESC` → `application_number`, with an `IS DISTINCT FROM` guard (no WAL bloat on re-run).

Audit row `permits_back_ref_cleared_below_floor` records the CLEAR count. **WHY it matters (orphan-delta
contract):** `computeIsOrphan` (`scripts/lib/orphan-detection.js`) treats *any* non-null back-ref as CoA
parent context and suppresses orphan status — so sub-floor FTS guesses were silently masking genuinely
standalone permits. Flooring the back-ref lets those permits surface as orphan candidates. **Measured
orphan-delta on the corpus: 339 permits (2026-07-07).** This is the ACCEPTED consequence of the floor,
not a regression.

**Geo-inheritance passes (Phase D R5.6, all share the 0.60 floor):** for CoAs linked `>= inheritConfMin`,
inherit the best permit-revision's authoritative `latitude`/`longitude` (atomic pair — never half a
coordinate) and FILL NULL `ward` (`COALESCE(ca.ward, permit.ward)` — CoA ward stays authoritative when
present). Guarded by `IS DISTINCT FROM` for idempotency. Observability rows: `enrichment_eligible_count`,
`coa_inherited_from_permit_count`, `coa_lat_lng_upgraded_from_permit_count`, `coa_ward_filled_from_permit_count`,
`coa_ward_mismatch_with_permit_count`, `coa_below_confidence_floor_count`, `inherited_confidence_floor`.

Newly-linked permits also get `last_seen_at` bumped (SKIP_PHASES-excluded) so the downstream lifecycle
classifier re-processes them. Verdict is driven by `effective_match_rate_pct` (exact-address links vs
achievable matches; `>= 50%` PASS) — a steady-state residual pool with no achievable matches is PASS, not FAIL.

**Edge Cases:** ward conflict → retained at 0.10 and flagged, not dropped. Concurrent `geocode-permits`
lat/long write between enrichment and the post-check → `lead_identity_lat_lng_mismatch_count` WARN (not
FAIL); repaired on the next chain run via the `IS DISTINCT FROM` guard.

**Testing:** `coa.logic.test.ts`

---

### Create Pre-Permits (`create-pre-permits.js`)
**Mutating step** — INSERTs synthesized `PRE-${application_number}` placeholder rows into the `permits` table for approved-but-unlinked CoAs, then DELETEs aging Pre-Permits past the 18-month threshold. Correction landed 2026-05-11 (WF2 #coa-spec-amendments) — prior spec text incorrectly described this as "read-only reporting."

1. Query approved CoA applications where `linked_permit_num IS NULL`.
2. **Step 1 — INSERT placeholders:** for each eligible CoA, `INSERT INTO permits (permit_num, revision_num, permit_type, status, …)` with `permit_num = 'PRE-' || application_number` and `revision_num = '00'`. Uses `ON CONFLICT (permit_num, revision_num) DO NOTHING` for idempotency — safe to re-run; existing PRE- rows pass through unchanged.
3. **Step 2 — Expire aging Pre-Permits:** DELETEs `permits` rows where `permit_num LIKE 'PRE-%' AND created_at < NOW() - INTERVAL '<pre_permit_expiry_months> months'`. The expiry months are read from `logic_variables` (default 18). Also DELETEs the dependent `permit_trades` and `permit_parcels` rows in the same transaction to preserve FK integrity.
4. Emit `records_meta` with `pre_permits_generated` + `aging_leads_expired` counts.

**Application gets linked to a real permit later** → the synthesized PRE- row remains in the `permits` table until the 18-month expiry; the corresponding CoA's `linked_permit_num` is updated to the REAL permit by `link-coa.js` on the next chain run.

**Idempotency:** confirmed via `ON CONFLICT DO NOTHING` (line 95 of script) — re-running produces 0 new rows after the first invocation has covered all eligible CoAs.

**Test coverage status (snapshot 2026-05-11):** the script's actual INSERT-into-permits mutation is currently **NOT covered** by any test. `coa.logic.test.ts` exercises the TS mapping helper `src/lib/coa/pre-permits.ts mapCoaToPermitDto()` — the pure function that translates a CoA row into a permit-DTO shape — but does not run the script's SQL. `pre-permit-aging.infra.test.ts` covers the script's `logic_variables.pre_permit_expiry_months` wiring and the "no hardcoded INTERVAL" regression but not the INSERT. Pre-existing gap; future WF should add an infra test that runs the script against a seeded fixture DB and asserts the PRE- row count + idempotency on re-run.

**Edge Cases:** Application gets linked later → see paragraph above. >18 months → flagged by `assert_pre_permit_aging` AND removed by Step 2.

**Testing:** `coa.logic.test.ts` (TS mapper only) + `pre-permit-aging.infra.test.ts` (logicVars wiring only); INSERT-mutation test pending.

---

### Refresh Snapshot (`refresh-snapshot.js`)
**Runs in ALL chains** — final infrastructure step.

> **Corrected 2026-08-31 (Pilot 8 PH-0, Finding 2):** this section previously described a "9+
> parallel counting queries" battery and a "Data Effectiveness Score (0-100)" weighted average.
> Neither is current. The parallel-query shape was replaced 2026-08-15 (WF3 F1, `8cc99c78`,
> Spec 118 §1/§7.1) after it caused a 3min→64min pathology; the script has run its stats queries
> **sequentially on one pinned REPEATABLE READ connection** ever since. No weighted-average score
> of any kind exists anywhere in the live file (`grep -in "score\|weighted"` returns nothing that
> computes one) — either removed at some undocumented point in the script's 34-revision history,
> or never actually implemented. Both corrections are prose-only; the live behaviour they now
> describe has been true since 2026-08-15 (query shape) / is true today (no score).

1. Run the counting queries against live DB — 8 sequential SELECTs on one pinned
   `REPEATABLE READ READ ONLY` connection (WF3 F1, `8cc99c78`; replaced the pre-2026-08-15
   9-parallel-query shape that caused a 3min→64min I/O pathology, Spec 118 §1/§7.1), plus one
   prior-snapshot read and several independently-caught optional reads (massing, schema column
   counts, SLA, inspections, cost estimates, CoA cost/servable funnel)
2. Compute coverage rates per table/relationship (trades, builders, parcels, neighbourhoods,
   geocoding, CoA, scope tags, inspections, cost estimates) — no aggregate weighted score
3. Upsert to `data_quality_snapshots` via `ON CONFLICT (snapshot_date) DO UPDATE`
4. Include inspection coverage metrics

**Sequential-run coherence (WF2 P8, verified 2026-07-07):** the step is
**chain-agnostic** — it recomputes EVERY metric (permit *and* CoA) from the live
tables on every invocation. In the serialized coa→permits daily job it runs twice
back-to-back (coa chain, then permits chain). The second (permits) run UPSERTs the
**same daily row** keyed on `snapshot_date` (additive — one row per day, never a
duplicate) and **recomputes the `coa_*` columns fresh from `coa_applications`**,
which the coa chain already committed earlier in the job. The permits-chain run
therefore writes coa metrics that are **as-fresh-or-fresher, never stale/clobbered**
— there is no coa-side value stored by the coa run that the permits run overwrites
with a stale value. Verified on the P7 rows: `coa:refresh_snapshot` (20:00) then
`permits:refresh_snapshot` (20:39) left one 2026-07-07 row with fully-populated
`coa_*` columns (`created_at` = the permits-run time).

**Edge Cases:** `active_permits = 0` → division by zero guarded. Massing query fails → caught,
**carries forward the previous snapshot's value** via `getPrevSnapshot()` (falling back to 0 only
if no prior snapshot row exists at all) — corrected 2026-08-31 (Pilot 8 PH-0, Finding 2); the
prior "defaults to 0" line collapsed this two-tier fallback into one. The file's own design
comment (`:320-322`) states the intent explicitly: carry-forward, not a zero default, because a
zero default would destroy dashboard trend lines. Four of six optional query blocks (massing,
schema column counts, SLA, inspections) follow this; the two most recently added
(`cost_estimates`, CoA cost/servable funnel) do not (Pilot 8 Finding 5 / `RS-D2`).

**Testing:** `refresh-snapshot.infra.test.ts`, `refresh-snapshot-query-consolidation.logic.test.ts`,
`db/refresh-snapshot-consolidation.db.test.ts`, `quality.logic.test.ts` (its own
`describe('refresh-snapshot.js cost/timing observability'` block),
`coa-cost-model.regression.test.ts` (`refresh-snapshot.js still counts geometric in the
from_model bucket`) — corrected 2026-08-31 (Pilot 8 PH-0, Finding 2); the prior line named 2
files, one of which (`quality.infra.test.ts`) has zero hits on this script at all, while 4 real
dedicated test files went unnamed.
</behavior>

---

<constraints>
## 4. Operating Boundaries

### Target Files
- `scripts/geocode-permits.js`, `scripts/link-parcels.js`, `scripts/link-neighbourhoods.js`
- `scripts/link-massing.js`, `scripts/link-wsib.js`, `scripts/link-coa.js`
- `scripts/create-pre-permits.js`, `scripts/refresh-snapshot.js`

### Cross-Spec Dependencies
- **Consumed by:** `chain_permits.md`, `chain_coa.md`, `chain_sources.md`
- **Relies on:** `pipeline_system.md` (SDK), source specs (reference data tables)
- **Operator-facing audit surface (WF2 #4 2026-05-08):** the admin Lead Detail Inspector (Spec 76 §3.5 Cycle 7) renders every output of these shared steps in its Spatial panel — parcel id + `area_sqm` (lot size), parcel_buildings `area_sqm` (footprint) + `height_m` + `stories`, neighbourhood id + name + `avg_household_income` + `period_of_construction`. Operators can audit per-permit which spatial joins succeeded without dropping to psql.
- `load-permits.js` — referenced only as the `permits` table's other writer (`create-pre-permits.js`'s PRE- row INSERT shares the table, not the script); not governed here.
- `load-address-points.js` — sources-chain step whose `address_points` table `geocode-permits.js` reads; referenced as context, not governed here.
- `load-wsib.js` — sources-chain step named as `link-wsib.js`'s annual-cadence upstream refresh trigger; referenced as context, not governed here.
</constraints>
