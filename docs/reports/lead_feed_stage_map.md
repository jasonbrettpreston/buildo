# Lead Feed — Stage Map & Predictive-Claim Model

**Status: DESIGN LOCKED — NOT YET IMPLEMENTED.** This document captures the agreed product model for how the lead feed should surface trade opportunities. It is the authoritative artifact to point at when drafting the WF3 active tasks that build WF3-A / WF3-B / WF3-C. Nothing in `src/` or `migrations/` has been changed yet.

**Date locked:** 2026-04-11
**Iterated through:** 6 rounds of revision against live DB data (`psql -U postgres -d buildo`)
**Supersedes:** any prior informal understanding of how trades map to permits or how the feed is supposed to behave

---

## Table of contents

1. [Section 1 — The Predictive-Claim Lead Model](#section-1--the-predictive-claim-lead-model)
2. [Section 2 — 20-Phase Lifecycle Stage Taxonomy](#section-2--20-phase-lifecycle-stage-taxonomy)
3. [Section 3 — Feed SQL Rewrite Scope](#section-3--feed-sql-rewrite-scope)
4. [Section 4 — Inspection Stage Map Expansion](#section-4--inspection-stage-map-expansion)
5. [Section 5 — Implementation Approach (migrations / scripts / pipeline)](#section-5--implementation-approach-migrations--scripts--pipeline)
6. [Section 6 — Delta vs current state](#section-6--delta-vs-current-state)
7. [Section 7 — Specs that must be updated](#section-7--specs-that-must-be-updated)
8. [Section 8 — Open items not yet decided](#section-8--open-items-not-yet-decided)

---

## Section 1 — The Predictive-Claim Lead Model

### 1.1 Lead granularity

**A lead = an application, not a permit.** An application number is the first nine characters of `permit_num` — the `YY NNNNNN` prefix that groups a parent permit and all its child trade permits.

All permits sharing an application number roll up into a single lead. The card shows the address + application number + linked permits list + current lifecycle phase. The map shows one marker per application.

### 1.2 Three application classes

Validated counts from live DB (2026-04-11):

| Class | Trigger | Count | Lifecycle model | Base score multiplier |
|---|---|---:|---|---:|
| **BLD-led** | Has BLD or CMB parent permit | **89,937** | Full 20-phase (P1-P20) | 1.00 |
| **Single-trade orphan** | Single permit, no BLD parent | **37,089** | Simplified 4-phase (Applied / Active / Stalled / Closed) | **0.30** |
| **Multi-trade no-BLD** | 2+ permits on app, no BLD parent | **2,287** | Use oldest permit as de facto parent | **0.50** |

### 1.3 Trade relevance — three categories

For any `(application, trade)` pair, the trade falls into one of three buckets. The bucket determines whether it's surfaced and how it's scored.

#### 1.3.1 Child-permit trades

These trades are carried on their own separate permit type under Toronto's regime:

| Trade | Child suffix(es) | Count |
|---|---|---:|
| plumbing | PLB, PSA, PLG, PS | ~51,320 |
| hvac | HVA, MSA, HVC, HTG | ~41,730 |
| drain-plumbing | DRN, STS | ~15,910 |
| fire-protection | FSU, FS | ~6,640 |
| demolition | DEM | ~2,800 |

For these trades, the **predictive-claim state** determines lead value:

- **🔥 HOT** — Scope_tags on the BLD parent infer this trade is needed AND no child permit with the relevant suffix exists on this application number yet AND the current phase is approaching the trade's active window. **This is the highest-value lead state** — no competitor has the job yet.
- **❄️ CLAIMED** — A child permit for this trade already exists on the application. The trade is taken by whoever filed that child permit. **Lead score drops by 0.1x multiplier** for that specific trade. Still surfaced as a signal (so the user knows the project exists) but deranked to the bottom.
- **— IRRELEVANT** — Scope_tags don't indicate the trade is needed (e.g., a roof-replacement project doesn't need plumbing). Filtered out of the feed for that trade.

#### 1.3.2 BLD-handled trades

These are the trades the general contractor handles under the main building permit — no separate child permit exists because the BLD itself covers the work:

excavation, shoring, concrete, framing, structural-steel, masonry, roofing, waterproofing, insulation, drywall, painting, flooring, trim-work, millwork-cabinetry, tiling, stone-countertops, glazing, landscaping, decking-fences, caulking, pool-installation, solar, security, temporary-fencing, eavestrough-siding

For these trades, there's **no claim check** (no child permit can exist). Relevance comes purely from scope_tag inference + phase-distance scoring. These trades are surfaced whenever the BLD's scope_tags infer them AND the current lifecycle phase is within scoring distance of the trade's active phase.

#### 1.3.3 Unserved-data trades

Trades whose regulatory pipeline lives entirely outside Toronto's permits CKAN feed:

- **electrical** (regulated by Electrical Safety Authority — ESA — not the City of Toronto)
- **elevator** (regulated by Technical Standards and Safety Authority — TSSA)

For these trades, **there is no child permit to check** (no ESA/TSSA data source). Relevance is inferred 100% from scope_tags (which `tag-trade-matrix.ts` already handles — `kitchen` → electrical 0.80, `basement` → electrical 0.75, etc.). Treated structurally the same as BLD-handled trades: inferred from scope, scored by phase-distance, no claim suppression possible.

### 1.4 Scoring implications

The 4-pillar lead score (spec 70 §4) stays at 0-100 but the semantics shift:

| Pillar | Range | What's new |
|---|---:|---|
| **Proximity** (0-30) | unchanged | Same haversine computation |
| **Timing** (0-30) | **new formula** | `30 × (1 − phase_distance / max_distance)` where phase_distance is the delta between current lifecycle phase and the trade's active phase. Trade-in-phase = 30. Trade 1 phase away = 22. Trade 2 phases away = 15. Trade 3+ phases away = 8. Past = 0. |
| **Value** (0-20) | unchanged | Same cost-tier ladder |
| **Opportunity** (0-20) | **new formula** | **Predictive-claim bonus:** HOT (no child permit + inference confidence ≥ 0.5) = 20. CLAIMED = 2. Orphan = 6. Plus the existing status-based points (Permit Issued = higher than Inspection = higher than Application). |

**Net effect:** a plumber looking at an early-stage New Houses BLD (phase = P7a "Freshly Issued", scope_tags infer plumbing need, no PLB child) scores: 30 proximity + 22 timing + 16 value + 20 opportunity = **88/100** — high in the feed. Once a PLB child appears, the opportunity drops to 2 and the score falls to 70 — still visible but deranked below competing HOT leads.

### 1.5 Orphan and multi-trade edge cases

- **Single-trade orphan** (37K): the filer is the plumber/HVAC/fire contractor. The work is already done or being done by them. Base score × 0.3 so they appear only when no HOT BLD-led alternative is available nearby.
- **Multi-trade no-BLD** (2.3K): unusual — multiple trade permits on an app without a parent BLD. Treat the oldest permit as the de facto parent and apply BLD-led scoring at 0.5 multiplier. Flag for Phase A data-quality review — these may be linker misses.
- **DEM orphan applications** (~2,800): demolition permits that don't share an application number with a BLD. Useful to excavation / shoring / temporary-fencing trades as an early signal that a new build is coming. Treat as a Class 1 specialty lead with its own phase ("Site Clearing"). Score at 0.7 multiplier.

---

## Section 2 — 20-Phase Lifecycle Stage Taxonomy

The phase axis applies to the BLD/CMB parent permit (lifecycle carrier) for Class 1. For Class 2 (orphans), apply a collapsed 4-phase model. For Class 3 (multi-trade no-BLD), treat the oldest permit as the lifecycle carrier.

### 2.1 BLD-led phase model (P1-P20)

Each phase has:
- **Trigger** — raw source from permits.status / enriched_status / permit_inspections / issued_date age
- **Product name** — what the user sees
- **Count** — validated against live DB 2026-04-11
- **Icon** — Heroicon (proposed, not final — TBD during WF3-B)

**Origination — CoA path** (predictive variance pipeline)

| # | Product name | Trigger | Count | Icon (proposed) |
|---|---|---|---:|---|
| **P1** | Variance Requested | `coa_applications.linked_permit_num IS NULL` + decision NULL or non-terminal | 35 | `DocumentTextIcon` |
| **P2** | Variance Granted | `coa_applications.linked_permit_num IS NULL` + decision ~= "Approved" (any casing) | 147 | `CheckBadgeIcon` |

**Origination — Direct permit path**

| # | Product name | Trigger (raw `permits.status`) | Count | Icon (proposed) |
|---|---|---|---:|---|
| **P3** | Intake | Application Received, Application Acceptable, Plan Review Complete, Open, Active, Request Received | 1,339 | `InboxArrowDownIcon` |

**Review phases — the valuable early window**

| # | Product name | Trigger | Count | Icon (proposed) |
|---|---|---|---:|---|
| **P4** | Under Review | Under Review, Examination, Examiner's Notice Sent, Consultation Completed | 2,821 | `MagnifyingGlassIcon` |
| **P5** | On Hold | Application On Hold (both casings), Deficiency Notice Issued, Response Received, Pending Parent Folder Review | 2,396 | `PauseCircleIcon` |
| **P6** | Ready to Issue | Ready for Issuance, Forwarded for Issuance, Issuance Pending, Approved, Agreement in Progress, Licence Issued | 3,152 | `ShieldCheckIcon` |

**Issued, Pre-Construction — peak influence window** (split into 4 time-bucketed sub-phases against live DB)

| # | Product name | Trigger | Count | Icon (proposed) |
|---|---|---|---:|---|
| **P7a** | Freshly Issued | `status='Permit Issued'` AND `issued_date > now() - 30d` AND no inspection rows | **1,883** | `BoltIcon` |
| **P7b** | Mobilizing | `status='Permit Issued'` AND 30-90d since issued AND no inspection rows | **3,285** | `TruckIcon` |
| **P7c** | Recently Issued | `status='Permit Issued'` AND 90-365d since issued AND no inspection rows | **7,496** | `ClockIcon` |
| **P7d** | Not Started | Work Not Started, Not Started, Not Started - Express, Extension Granted, Extension in Progress | ~1,200 | `ArrowPathIcon` |

**Note:** `status='Permit Issued'` with `issued_date > 2 years ago` AND no inspection rows (33,802 permits) triggers the **Stalled modifier**, not its own phase.

**Permit Updated**

| # | Product name | Trigger | Count | Icon (proposed) |
|---|---|---|---:|---|
| **P8** | Permit Revision Issued | Revision Issued, Revised | 20,798 | `PencilSquareIcon` |

**Active Construction — Inspection Sub-Stages** (scraper-driven, ~43% coverage at 60K target)

| # | Product name | Latest passed `stage_name` is... | Icon (proposed) |
|---|---|---|---|
| **P9** | Site Prep | Excavation/Shoring, Site Grading Inspection, Demolition | `Squares2X2Icon` |
| **P10** | Foundation | Footings/Foundations | `BuildingLibraryIcon` |
| **P11** | Framing | Structural Framing | `CubeIcon` |
| **P12** | Rough-In | HVAC/Extraction Rough-in, Plumbing Rough-in (inferred), Electrical Rough-in (inferred), Fire Protection Systems, Fire Access Routes, Water Service, Drain/Waste/Vents, Sewers/Drains/Sewage, Water Distribution, Fire Service | `WrenchScrewdriverIcon` |
| **P13** | Insulation | Insulation/Vapour Barrier | `SparklesIcon` |
| **P14** | Fire Separations | Fire Separations | `FireIcon` |
| **P15** | Interior Finishing | Interior Final Inspection, Plumbing Final, HVAC Final | `HomeModernIcon` |
| **P16** | Exterior Finishing | Exterior Final Inspection | `BuildingOffice2Icon` |
| **P17** | Final Walkthrough | Occupancy, Final Inspection | `ClipboardDocumentCheckIcon` |
| **P18** | Construction Active — Stage Unknown | `status='Inspection'` with zero `permit_inspections` rows (fallback for 94.5% today, ~57% post-60K-scraler) | `EllipsisHorizontalCircleIcon` |

**Wind-down / Terminal** (hidden from feed)

| # | Product name | Trigger | Count | In feed? |
|---|---|---|---:|---|
| **P19** | Wind-down | Pending Closed, Pending Cancellation, Revocation Pending, Revocation Notice Sent | 5,533 | ❌ |
| **P20** | Closed | Closed, File Closed, Permit Issued/Close File | 8,656 | ❌ |

### 2.2 Orthogonal modifiers (overlays)

Applied on top of the primary phase icon as a badge/ring:

| Modifier | Trigger | Visual |
|---|---|---|
| **Stalled** | `enriched_status='Stalled'` OR (status='Permit Issued' AND issued_date < now() - 2 years AND no inspection rows) OR (latest inspection > 180d old) | Orange triangle with `!` |
| **Not Passed** | Any recent `permit_inspections.status='Not Passed'` on this permit | Red dot on corner |
| **Revision** | Has a linked permit with suffix = same parent + revision suffix (REV / REV-01 / etc.) | Small `↻` overlay |

### 2.3 Single-trade orphan phase model (Class 2)

A simplified 4-phase lifecycle since orphans have no construction sub-stages:

| Phase | Trigger | Icon |
|---|---|---|
| **O1 — Applied** | status ∈ {Application Received, Application Acceptable, Under Review, Plan Review Complete, On Hold, Ready for Issuance} | `InboxArrowDownIcon` |
| **O2 — Active** | status ∈ {Permit Issued, Revision Issued, Inspection} AND issued_date > now() - 180d | `WrenchScrewdriverIcon` |
| **O3 — Stalled** | status='Permit Issued' AND issued_date < now() - 180d with no inspection activity | `PauseCircleIcon` |
| **O4 — Closed** | status ∈ {Closed, Pending Closed, File Closed} | — (hidden from feed) |

### 2.4 Trade-specific (not a phase)

Pool inspections (Pool Suction/Gravity Outlets, Pool Circulation System — 4,462 rows) surface only to the pool-installation trade as a filter within the normal phase model. Not a separate lifecycle phase.

---

## Section 3 — Feed SQL Rewrite Scope

The current `get-lead-feed.ts` SQL has four fundamental issues that the rewrite fixes:

### 3.1 Issue 1 — `pt.is_active = true` hard filter (the critical early-stage blindness bug)

**Current:** line 231 `AND pt.is_active = true`. This is a phase-time relevance flag from `classify-permits.js:403` (`isTradeActiveInPhase(trade.slug, phase)`). It enforces "trade IS CURRENTLY in phase" as a hard filter.

**Effect:** a plumber cannot see an early-stage New Houses BLD because:
- BLD is in phase `early_construction`
- Plumbing's active phase is `structural` (from `PHASE_TRADE_MAP`)
- Therefore `is_active=false` on the plumbing row
- Feed query excludes it

The plumber's most valuable lead (an early-stage new house where nobody has claimed plumbing yet) is structurally invisible.

**Fix:** drop the `is_active = true` filter entirely. Replace with a **phase-distance scoring signal** in the Timing pillar — trade-in-current-phase scores 30, trade-1-phase-away scores 22, and so on down to 0 (past). The trade stays visible throughout the scoring gradient.

### 3.2 Issue 2 — No application-level aggregation

**Current:** one row per `(permit_num, revision_num, trade_slug)` in the feed output. A parcel with a BLD + HVA + DEM permit produces three separate leads for the same logical project.

**Fix:** add an `application_number` column to `permits` (generated column on `split_part(permit_num, ' ', 1) || ' ' || split_part(permit_num, ' ', 2)`). Rewrite the feed query to:
1. Group by application_number in a `app_candidates` CTE
2. Aggregate linked permits into a `linked_permits` array (jsonb) with permit_num + permit_type + status per entry
3. Pick the BLD/CMB permit as the lifecycle carrier (LATERAL SELECT, prefer BLD > CMB > oldest non-child)
4. Return one row per application with the carrier's address/lat/lng/scope_tags

### 3.3 Issue 3 — No predictive-claim suppression

**Current:** if both a parent BLD and a child PLB exist on an app, the feed returns both as separate leads for plumbing trade. Users see two plumbing leads for the same project (one from the classifier scoring plumbing on BLD, one from the raw PLB row).

**Fix:** add a LEFT ANTI JOIN pattern in the feed CTE:

```sql
-- Is there a child permit for the plumbing trade on this application?
LEFT JOIN LATERAL (
  SELECT 1 FROM permits child
  WHERE child.application_number = parent.application_number
    AND split_part(child.permit_num, ' ', 3) = ANY (
      -- child suffixes for the user's trade, e.g. ARRAY['PLB','PSA','PLG','PS'] for plumbing
      $child_suffixes_for_trade::text[]
    )
  LIMIT 1
) has_child_claim ON true
-- Then in the scoring CASE:
-- WHEN has_child_claim.1 IS NOT NULL THEN claim_penalty_score
-- ELSE hot_bonus_score
```

The `$child_suffixes_for_trade` array is looked up from a new TypeScript constant `CHILD_SUFFIX_TRADE_MAP` that lives in both `src/lib/leads/child-suffix-trade-map.ts` and `scripts/lib/child-suffix-trade-map.js` (dual code path per CLAUDE.md §7).

### 3.4 Issue 4 — No lifecycle_phase column

**Current:** the feed computes phase on-the-fly from `CASE WHEN pt.phase IN ('structural', ...) THEN 'high' ELSE 'medium' END`. This is a binary high/medium, not the 20-phase taxonomy.

**Fix:** add a `lifecycle_phase` column to `permits`, populated by a new pipeline step `classify-lifecycle-phase.js`. The feed reads it directly instead of computing inline. Indexable, queryable, caches correctly.

### 3.5 Rewrite sketch

Structure of the new `get-lead-feed.ts` SQL:

```sql
WITH
  -- Step 1: find parent permits (BLD/CMB) inside the radius for this trade
  parent_candidates AS (
    SELECT p.application_number, p.lifecycle_phase, p.scope_tags, ...
    FROM permits p
    WHERE split_part(p.permit_num, ' ', 3) IN ('BLD','CMB')
      AND p.lifecycle_phase NOT IN ('P19','P20')
      AND ST_DWithin(p.location::geography, ...)
  ),
  -- Step 2: attach trade relevance from scope_tags → tag-trade-matrix
  --         (the TS classifier already writes this to permit_trades)
  trade_matched AS (
    SELECT pc.*, pt.trade_slug, pt.confidence, pt.phase
    FROM parent_candidates pc
    JOIN permit_trades pt USING (permit_num, revision_num)
    WHERE pt.trade_slug = $1
      -- NOTE: no is_active filter here; phase-distance is a scoring signal
      AND pt.confidence >= 0.5
  ),
  -- Step 3: predictive claim check — is there a child permit for the trade?
  with_claim AS (
    SELECT tm.*,
      EXISTS (
        SELECT 1 FROM permits child
        WHERE child.application_number = tm.application_number
          AND split_part(child.permit_num, ' ', 3) = ANY ($child_suffixes)
      ) AS is_claimed
    FROM trade_matched tm
  ),
  -- Step 4: linked permits array for the card
  with_linked_permits AS (
    SELECT wc.*, (
      SELECT jsonb_agg(jsonb_build_object('permit_num', p2.permit_num,
                                          'permit_type', p2.permit_type,
                                          'status', p2.status,
                                          'suffix', split_part(p2.permit_num,' ',3)))
      FROM permits p2 WHERE p2.application_number = wc.application_number
    ) AS linked_permits
    FROM with_claim wc
  ),
  -- Step 5: orphan candidates (separate union branch)
  orphan_candidates AS (
    SELECT ... FROM permits p
    WHERE split_part(p.permit_num, ' ', 3) NOT IN ('BLD','CMB')
      AND NOT EXISTS (SELECT 1 FROM permits p2
                      WHERE p2.application_number = p.application_number
                        AND split_part(p2.permit_num,' ',3) IN ('BLD','CMB'))
      AND matches_trade_suffix_for($1)
  ),
  -- Step 6: score both branches and union
  unified AS (
    SELECT ..., 1.00 AS class_multiplier FROM with_linked_permits
    UNION ALL
    SELECT ..., 0.30 AS class_multiplier FROM orphan_candidates
  ),
  ranked AS (
    SELECT *,
      (proximity_score
        + timing_score    -- phase-distance based
        + value_score
        + opportunity_score  -- HOT vs CLAIMED bonus inside
      ) * class_multiplier AS relevance_score
    FROM unified
  )
SELECT * FROM ranked
WHERE ($cursor_score IS NULL OR (relevance_score, ...) < ($cursor_score, ...))
ORDER BY relevance_score DESC, ...
LIMIT $limit;
```

Approximate query length: ~250 lines of SQL vs ~150 today. Adds 1 new CTE, 1 new LEFT/EXISTS, 1 new JSONB aggregation.

---

## Section 4 — Inspection Stage Map Expansion

The current `inspection_stage_map` has 21 rows covering 7 sequences and 16 trades. Spec 71 §Edge Case #8 already flags: "If a stage is unmapped, the engine logs `logWarn` and falls back to Tier 2." Users of the 28 unmapped stages (HVAC Rough-in, Plumbing Final, Exterior Final, etc.) lose Tier 1 precision.

### 4.1 Proposed new rows (~19)

Inserted via `migrations/086_inspection_stage_map_expansion.sql` (or a sequential number at the time). Every row is idempotent — `INSERT ... ON CONFLICT (stage_name, trade_slug, precedence) DO NOTHING`.

| stage_name | seq | trade_slug | relationship | min lag | max lag | precedence |
|---|:---:|---|---|---:|---:|---:|
| Demolition | 5 | excavation | follows | 0 | 14 | 100 |
| Demolition | 5 | shoring | concurrent | 0 | 7 | 100 |
| Demolition | 5 | temporary-fencing | concurrent | 0 | 7 | 100 |
| Site Grading Inspection | 15 | landscaping | follows | 14 | 45 | 100 |
| Site Grading Inspection | 15 | decking-fences | follows | 14 | 45 | 100 |
| Fire Protection Systems | 32 | drywall | follows | 7 | 14 | 100 |
| Fire Protection Systems | 32 | electrical | concurrent | 0 | 14 | 100 |
| HVAC/Extraction Rough-in | 35 | insulation | follows | 5 | 14 | 100 |
| HVAC/Extraction Rough-in | 35 | drywall | follows | 10 | 21 | 100 |
| Fire Access Routes | 62 | eavestrough-siding | follows | 0 | 14 | 100 |
| Fire Access Routes | 62 | landscaping | follows | 7 | 21 | 110 |
| Plumbing Final | 55 | tiling | follows | 0 | 7 | 100 |
| Plumbing Final | 55 | stone-countertops | follows | 7 | 14 | 100 |
| HVAC Final | 65 | painting | follows | 0 | 7 | 30 |
| Exterior Final Inspection | 66 | eavestrough-siding | follows | 0 | 14 | 100 |
| Exterior Final Inspection | 66 | painting | follows | 0 | 14 | 30 |
| Exterior Final Inspection | 66 | landscaping | follows | 0 | 21 | 110 |
| Final Inspection | 68 | caulking | follows | 0 | 7 | 100 |
| Final Inspection | 68 | solar | follows | 0 | 14 | 100 |
| Final Inspection | 68 | security | follows | 0 | 14 | 100 |

### 4.2 Precedence updates (existing rows to re-weight)

Two existing rows need their precedence updated to reflect the fuller map:

| stage_name | trade_slug | old precedence | new precedence | reason |
|---|---|---:|---:|---|
| Fire Separations | painting | 10 | 40 | Exterior Final gets precedence 30 now, Fire Separations still fires first for interior paint but cedes to HVAC Final (30) for punch-list timing |
| Interior Final Inspection | landscaping | 100 | 120 | Site Grading (precedence 100) is a better enabling stage for landscaping than Interior Final |

### 4.3 Open items for the inspection map

These need domain input before the migration is written:

- **Security Device** (1,005 inspection rows) — which trade does this enable? Options: security (electronic), electrical (low-voltage), or a new trade slug for "alarm/monitor install"?
- **Change of Use** (1,016 inspection rows) — a paperwork inspection, probably doesn't enable any trade. Flag as "not trade-enabling"?
- **Tent/Portable Classroom** (1,004 inspection rows) — specialty, only enables temporary-fencing? Low value.
- **Pool Suction/Gravity Outlets** + **Pool Circulation System** (4,462 rows total) — user said these are trade-specific to pool-installation and NOT a general phase. Decision: don't add to stage map, handle as a pool-installation specific filter in the feed.

---

## Section 5 — Implementation Approach (migrations / scripts / pipeline)

This is the "how" for each section. Breaks each change into **schema**, **code**, **scripts**, **pipeline steps**, and **tests**.

### 5.1 Section 1 deliverables (predictive-claim model)

**Schema changes:** none directly — the model is query-time logic plus two new columns (see §5.2).

**New constants (dual code path per CLAUDE.md §7):**
- `src/lib/leads/child-suffix-trade-map.ts` — TypeScript constant mapping child suffixes to trade slugs. Consumed by the feed SQL query builder.
- `scripts/lib/child-suffix-trade-map.js` — mirror for pipeline scripts (classifier).

```typescript
// src/lib/leads/child-suffix-trade-map.ts
export const CHILD_SUFFIX_TRADE_MAP = {
  plumbing:       ['PLB', 'PSA', 'PLG', 'PS'],
  hvac:           ['HVA', 'MSA', 'HVC', 'HTG'],
  'drain-plumbing': ['DRN', 'STS'],
  'fire-protection': ['FSU', 'FS'],
  demolition:     ['DEM'],
} as const;
```

**Code changes:**
- `src/features/leads/lib/get-lead-feed.ts` — rewrite the SQL (see §3.5). ~100 line net delta.
- `src/features/leads/lib/scoring.ts` (new file) — extract the HOT/CLAIMED/Phase-distance scoring helpers. Pure functions, unit-testable.
- `src/features/leads/lib/get-lead-feed.ts` — adjust the `mapRow` boundary to narrow the new `linked_permits` JSONB array into typed `LinkedPermit[]`.

**No new scripts. No new pipeline steps. No new migrations.**

**Tests:**
- `src/tests/predictive-claim.logic.test.ts` — new file. HOT / CLAIMED / orphan state classification, phase-distance scoring formula, child-suffix matching.
- `src/tests/get-lead-feed.logic.test.ts` — update existing to cover the new SQL shape, application aggregation, predictive claim suppression.

### 5.2 Section 2 deliverables (20-phase taxonomy)

**Schema changes — two new columns on `permits`:**

```sql
-- migrations/085_application_number_and_lifecycle_phase.sql

-- 1. application_number (generated column, indexable)
ALTER TABLE permits
  ADD COLUMN application_number VARCHAR(12)
    GENERATED ALWAYS AS (
      split_part(permit_num, ' ', 1) || ' ' || split_part(permit_num, ' ', 2)
    ) STORED;

CREATE INDEX idx_permits_application_number
  ON permits (application_number);

-- 2. lifecycle_phase (populated by new pipeline step)
ALTER TABLE permits
  ADD COLUMN lifecycle_phase VARCHAR(10) DEFAULT NULL;

CREATE INDEX idx_permits_lifecycle_phase
  ON permits (lifecycle_phase)
  WHERE lifecycle_phase IS NOT NULL;

COMMENT ON COLUMN permits.lifecycle_phase IS
  '20-phase taxonomy. P1-P20 for BLD-led applications, O1-O4 for orphans. Computed by scripts/classify-lifecycle-phase.js';

-- DOWN
-- DROP INDEX IF EXISTS idx_permits_lifecycle_phase;
-- DROP INDEX IF EXISTS idx_permits_application_number;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_phase;
-- ALTER TABLE permits DROP COLUMN IF EXISTS application_number;
```

**Backfill strategy:** the `application_number` is auto-populated via the generated column. The `lifecycle_phase` backfill is the pipeline script below, which should run once manually for all 237K existing permits (~30 seconds).

**New script:** `scripts/classify-lifecycle-phase.js`

```
Pipeline SDK script that:
1. SELECT permit_num, revision_num, status, enriched_status, issued_date,
          permit_type, application_number FROM permits WHERE lifecycle_phase IS NULL
   OR last_seen_at > classified_at
2. For each permit, compute the phase per the taxonomy in §2.1 or §2.3:
   - Check if it's an orphan → O1/O2/O3/O4 decision
   - Else walk the BLD phase tree → P1/P2/.../P20
3. Apply Stalled modifier check (issued + age + activity)
4. UPDATE permits SET lifecycle_phase = computed WHERE IS DISTINCT FROM
5. emitSummary with classification counts
```

This script follows the existing pattern of `scripts/classify-permit-phase.js` and `scripts/classify-inspection-status.js`. Idempotent. Uses `pipeline.withTransaction`.

**New pipeline step in the permits chain:**

The permits chain (spec 41) currently has 14 steps:
```
fetch → diff → load → classify_scope → classify_trade → compute_cost_estimates →
compute_timing_calibration → ... → assert_schema → assert_data_bounds
```

Insert after `classify_inspection_status` (which sets `enriched_status`) and before `assert_data_bounds`:

```
... → classify_inspection_status → classify_lifecycle_phase (NEW) → assert_data_bounds
```

This ensures `lifecycle_phase` sees the freshest `enriched_status` values.

**Scheduling:** runs daily as part of the permits chain. Incremental — only re-classifies permits where `last_seen_at > classified_at` (needs a new `lifecycle_classified_at` timestamp column, or reuse `permit_trades.classified_at` if semantics align).

**Tests:**
- `src/tests/lifecycle-phase.logic.test.ts` — new file. Pure-function phase determination for every (status, enriched_status, issued_date age) combination.
- `src/tests/migration-085.infra.test.ts` — file-shape test for the migration.
- `src/tests/classify-lifecycle-phase.infra.test.ts` — script dry-run against a synthetic `permits` table.

### 5.3 Section 3 deliverables (feed SQL rewrite)

**No new schema** — consumes the columns added in §5.2.

**No new scripts.** Pure application-layer change in `src/features/leads/lib/get-lead-feed.ts`.

**Code changes:**
- Rewrite the feed SQL per §3.5
- Update `src/features/leads/types.ts` to add `LinkedPermit[]` to `PermitLeadFeedItem` (or new `ApplicationLeadFeedItem` type)
- Update `src/features/leads/components/PermitLeadCard.tsx` to render the linked_permits list + lifecycle_phase chip
- Update `src/features/leads/components/LeadMapMarker.tsx` to render a phase-based Heroicon instead of the cost-tier `$$$$` (this is WF3-B's scope)

**Tests:**
- `src/tests/get-lead-feed.logic.test.ts` — rewrite for the new SQL shape
- `src/tests/get-lead-feed.infra.test.ts` — cover the predictive-claim LEFT ANTI JOIN
- `src/tests/api-leads-feed.infra.test.ts` — update to assert the new response shape

### 5.4 Section 4 deliverables (inspection stage map expansion)

**Migration: `migrations/086_inspection_stage_map_expansion.sql`**

```sql
-- UP
-- 19 new rows via INSERT ... ON CONFLICT DO NOTHING (idempotent)
INSERT INTO inspection_stage_map
  (stage_name, stage_sequence, trade_slug, relationship, min_lag_days, max_lag_days, precedence)
VALUES
  ('Demolition', 5, 'excavation', 'follows', 0, 14, 100),
  ('Demolition', 5, 'shoring', 'concurrent', 0, 7, 100),
  -- ... 17 more rows ...
ON CONFLICT (stage_name, trade_slug, precedence) DO NOTHING;

-- Precedence updates
UPDATE inspection_stage_map
  SET precedence = 40
  WHERE stage_name = 'Fire Separations' AND trade_slug = 'painting' AND precedence = 10;

UPDATE inspection_stage_map
  SET precedence = 120
  WHERE stage_name = 'Interior Final Inspection' AND trade_slug = 'landscaping' AND precedence = 100;

-- DOWN
-- (commented, forward-only per repo convention)
```

**No new scripts. No new pipeline steps.** The existing `compute-timing-calibration.js` already reads `inspection_stage_map`. New rows are picked up automatically on the next feed query.

**Code changes:**
- `src/features/leads/lib/timing.ts` — no changes needed (the `findEnablingStage` query already uses `ORDER BY precedence ASC`)
- `src/lib/classification/classifier.ts` — no changes needed

**Tests:**
- `src/tests/migration-086.infra.test.ts` — file-shape test (19 new rows present, precedence updates correct)
- `src/tests/timing.logic.test.ts` — expand Tier 1 test cases to cover the new stages (Demolition → excavation enablement, HVAC Final → painting timing, etc.)

### 5.5 Summary of what gets built

| Deliverable | Type | New/Modified | Count |
|---|---|---|---:|
| Migration | new SQL file | NEW | 2 (085, 086) |
| Pipeline script | new JS file | NEW | 1 (classify-lifecycle-phase.js) |
| Pipeline chain step | edit to orchestrator | MODIFIED | 1 (permits chain — spec 41) |
| Feed SQL rewrite | code | MODIFIED | 1 (get-lead-feed.ts) |
| Scoring helpers | new TS file | NEW | 1 (scoring.ts / predictive-claim.ts) |
| Child-suffix constant | new TS + JS pair | NEW | 2 (dual code path) |
| Type updates | TS | MODIFIED | ~3 files |
| UI — card | TSX | MODIFIED | 1 (PermitLeadCard.tsx) |
| UI — map marker | TSX | MODIFIED | 1 (LeadMapMarker.tsx) |
| Tests | various | NEW + MODIFIED | ~6 files |

**No new tables.** Two new columns on `permits`. One new pipeline step. No destructive migrations.

---

## Section 6 — Delta vs current state

This table is the "what's actually changing" executive view. Each row is a discrete behavior change.

| # | Aspect | Current state | Proposed state | Impact |
|---|---|---|---|---|
| 1 | **Lead granularity** | One lead per `(permit_num, revision_num)` row. A parcel with BLD + HVA + DEM surfaces as 3 leads. | One lead per application_number. Linked permits aggregated into `linked_permits[]` array. | Feed response count drops ~40%. Cards show 2-5 linked permits per project. |
| 2 | **Trade relevance filter** | `pt.is_active = true` hard filter (phase-time relevance). Early-stage BLDs invisible to trades whose active phase hasn't arrived. | No hard filter. Phase-distance is a timing pillar scoring signal. All relevant trades surface with graduated score. | **Plumbers/HVAC/etc. gain visibility on ~55K early-stage BLDs they can't see today.** |
| 3 | **Predictive-claim suppression** | No claim check. A BLD with a PLB child shows up as a HOT plumbing lead AND as an orphan plumbing lead (double-representation). | LEFT ANTI JOIN check on child permit suffixes. CLAIMED trades drop to 0.1x score; orphans to 0.3x. | ~22K orphan trade leads deranked. ~45K BLD-child-linked applications deduped. |
| 4 | **Lifecycle phase** | Implicit — computed inline from status (3 buckets) + issued_date. No granular taxonomy. | Explicit `permits.lifecycle_phase` column with P1-P20 (or O1-O4 for orphans). Populated by pipeline step. | 20-icon map with phase-specific signal. Card primary info shifts from cost to phase name. |
| 5 | **Application linkage** | Implicit (through `permit_parcels.parcel_id`) — captures unrelated projects on the same land. Spec 71 §Parent/child uses this. | Explicit — `permits.application_number` generated column. True sibling permits only. | Spec 71 linkage logic must be rewritten. |
| 6 | **Map marker icon** | `$` / `$$` / `$$$` / `$$$$` based on cost tier (value pillar). | Phase-based Heroicon (P1-P20 mapped to 20 icons). Stalled modifier overlays. | Map reads as a lifecycle state view, not a cost heatmap. |
| 7 | **Inspection stage map** | 21 rows, 7 sequences (10-70), 16 trades. 28 stage names unmapped → fall back to Tier 2. | 40 rows, expanded sequences (5-68), 24+ trades. Demolition + HVAC Rough-in + Plumbing Final + HVAC Final + Exterior Final + Final Inspection all mapped. | Timing engine Tier 1 precision improves for ~30K permits with currently-unmapped stages. |
| 8 | **Orphan handling** | Treated identically to BLD-led permits. Filer is often the contractor already — low true value. | Explicit orphan class with 4-phase simplified lifecycle and 0.3x score multiplier. | ~18K active orphan permits deranked. Feed output quality rises. |
| 9 | **Card primary info** | Cost tier pill + distance + address. Phase is not shown. | **Phase name pill** (e.g., "Framing" / "Freshly Issued — 12d ago") + distance + address + linked permits count. Cost tier moves to secondary chip. | Users can tell project stage at a glance. Lead-decision time drops. |
| 10 | **Child-permit → trade mapping** | Exists in `classify-permits.js` as `NARROW_SCOPE_CODES` but only 5 suffixes (PLB/PSA/HVA/MSA/DRN/STS/FSU/DEM). Phase-gated by `is_active`. | Expanded to 11 suffixes (adds PS/PLG/HVC/HTG/FS) + ungated (no phase filter). Shared TS/JS constant. | Correctly surfaces hvac/plumbing leads even from legacy/alt-coded permits. |

### 6.1 What does NOT change

To be explicit about the scope boundary:

- **`permit_trades` schema** — unchanged. The is_active column stays (used by admin tooling, analytics, scoring).
- **`classify-permits.js` core logic** — unchanged. The under-fill isn't a bug — it's phase-time filtering behaving as designed.
- **Tag-trade-matrix** — unchanged. Already does the right inference.
- **`tag-product-matrix`, `classification/rules.ts`** — unchanged.
- **`cost_estimates` cost-model** — unchanged. The $126M absurd-value bug is Phase A, separate WF3.
- **Opportunity classifier** (`opportunity_type` always 'unknown') — Phase A, separate WF3.
- **Neighbourhood spatial reassignment** — Phase A, separate WF3.
- **Scraper target types** — unchanged for now. Spec 53 still targets 3 types. Expansion to New Building + Non-Res is deferred (see §8).

---

## Section 7 — Specs that must be updated

Each entry below lists the spec file, the sections that need revision, and a short what-changes note. None of these are rewritten in this design document — they'll be updated alongside the corresponding WF3 active task.

### 7.1 Major revisions

| Spec | Sections to revise | What changes |
|---|---|---|
| **`docs/specs/product/future/70_lead_feed.md`** | §2 Technical Architecture (SQL body) · §4 Behavioral Contract (all 4 scoring pillars) · §4 Edge Cases | Feed SQL rewritten per §3.5. Timing pillar becomes phase-distance. Opportunity pillar gains HOT/CLAIMED bonus. New edge cases for orphan and multi-trade-no-BLD. Add `linked_permits[]` to response shape. |
| **`docs/specs/product/future/71_lead_timing_engine.md`** | §2 Parent/child permit linkage · §2 Tier 1 stage-based logic · §2 `inspection_stage_map` seed data table | Change parent/child linkage from parcel-based to application-number-based. Update seed table with 19 new rows + 2 precedence updates. Note Tier 1 now has broader stage coverage. |

### 7.2 Moderate revisions

| Spec | Sections to revise | What changes |
|---|---|---|
| **`docs/specs/pipeline/41_chain_permits.md`** | §3 Pipeline steps | Add step `classify_lifecycle_phase` after `classify_inspection_status`, before `assert_data_bounds`. Document step inputs, outputs, and meta fields. |
| **`docs/specs/01_database_schema.md`** | §permits table schema | Add `application_number` (generated) + `lifecycle_phase` columns. Document the 20-phase enum values. |
| **`docs/specs/00_system_map.md`** | entire file | Regenerate with `npm run system-map`. |

### 7.3 New specs to create

| New spec | Scope |
|---|---|
| **`docs/specs/product/future/77_lead_feed_stage_model.md`** | Canonical spec for the 20-phase taxonomy, orphan class, predictive-claim model. This design doc (`docs/reports/lead_feed_stage_map.md`) becomes the seed for that spec — promote from `reports/` to `specs/` once the first WF3 lands. |

### 7.4 Minor revisions (optional but recommended)

| Spec | Sections to revise | What changes |
|---|---|---|
| **`docs/specs/pipeline/53_source_aic_inspections.md`** | §3 Target types | Flag New Building + Non-Residential Building Permit as candidates for future expansion (separate WF3, not this one). |
| **`docs/specs/product/future/72_lead_cost_model.md`** | (no revision required for WF3 scope) | Note: temporary-structures / demolition / signage cost-model fix is Phase A, separate WF3. |
| **`docs/specs/product/future/74_lead_feed_design.md`** | §Map markers · §Card layout | Visual specs for the 20 phase icons and the new card layout with phase chip as primary info. Update once WF3-B lands. |

---

## Section 8 — Open items not yet decided

These are questions the design deliberately leaves for the WF3 planning phase (or further product input). Capturing them here so nothing gets lost.

### 8.1 Phase icon selection

The Heroicon choices in §2.1 are proposals, not final. The actual icon set for WF3-B needs to be mocked up and reviewed against these criteria:
- Readable at zoom level 13 in the map
- Visually distinct from adjacent phases (P4 vs P5 vs P6 especially — all "pre-issuance")
- Mobile-legible at the default marker size (28×28)
- Color-blind safe (the Heroicon itself, not relying on color alone)

### 8.2 Scraper expansion to New Building + Non-Residential Building

Spec 53 §3 targets only Small Residential / Building Additions / New Houses. New Building (2,848) + Non-Residential Building Permit (900) would add ~3,700 BLD-led applications with no AIC coverage. Decision needed on:
- Expand scraper targets (new WF3, updates spec 53 §3)
- Or accept that these apps always show P18 "stage unknown" even after scraper rollout

Recommendation: **expand**, as a separate WF3 tied to the scraper's next scaling phase.

### 8.3 Security Device inspection stage

1,005 inspection rows exist for `stage_name = 'Security Device'`. Which trade does this enable?
- Option A: `security` (electronic access control install)
- Option B: `electrical` (low-voltage wiring)
- Option C: both
- Option D: a new trade slug for "alarm/monitoring"

Defer to domain input. Not blocking WF3-A/B.

### 8.4 Change of Use inspection

1,016 rows for `stage_name = 'Change of Use'`. Paperwork inspection — probably doesn't enable a trade. Flag as "not trade-enabling" and exclude from the stage map? Or does it imply structural/partition work (framing/drywall)?

Defer to domain input. Not blocking WF3-A/B.

### 8.5 Lifecycle_phase re-classification trigger

The `classify-lifecycle-phase.js` script needs a way to detect stale rows. Options:
- Timestamp column `lifecycle_classified_at` + re-run when `last_seen_at > lifecycle_classified_at`
- Reuse `permit_trades.classified_at` (but classifier scope is different)
- Recompute all rows nightly (simple, ~30s runtime)

Recommendation: **timestamp column** for incremental re-classification. Cleaner pipeline semantics.

### 8.6 Application number for non-standard permit_num formats

The `application_number` generated column assumes the format `YY NNNNNN TYPE`. Some edge-case rows exist:
- Empty `permit_num` (2 rows in live DB)
- Historical formats from `Building Historical data - Converted` (10 rows)
- `Toronto Building Standard Attachments` (1 row)

These will get garbage values in `application_number`. Decision needed: validate and NULL the generated column for non-conforming rows? Or accept the garbage as a small data-quality debt?

Recommendation: **accept for V1**, surface in Phase A data-quality report as a known issue.

### 8.7 Phase P1/P2 (CoA origination) data source

P1 Variance Requested (35) and P2 Variance Granted (147) come from `coa_applications` not `permits`. The 20-phase taxonomy is currently described as a `permits.lifecycle_phase` column. Two options:
- A: Add P1/P2 rows to `permits` at ingest (synthetic permit rows for unlinked CoAs)
- B: UNION the CoA table in the feed SQL with a `lifecycle_phase='P1'/'P2'` synthetic value

Recommendation: **Option B**. Don't pollute the permits table with synthetic rows. Add a `coa_candidates` CTE to the feed SQL that produces P1/P2 leads.

### 8.8 Multi-trade no-BLD leads (2,287 apps)

These apps have 2+ trade permits but no BLD parent. Current proposal: treat the oldest as de facto parent. Alternative: flag these specifically as "linker miss — manual review" and hide until Phase A data-quality fixes them.

Decision deferred until Phase A data-quality review.

---

## Appendix — reproducibility

Every count in this document is re-derivable from `psql -U postgres -d buildo` using the queries in `docs/reports/lead_feed_status_inventory.md` (the companion inventory doc). Snapshot date: **2026-04-11**.

Companion documents:
- `docs/reports/lead_feed_status_inventory.md` — raw inventory (54 permit statuses, 22 CoA statuses, 35 inspection stages, all with counts)
- `docs/reports/lead_feed_stage_map.md` — this doc (design model)
- `.cursor/active_task.md` — (not yet written; will be drafted for WF3-A once this design is approved)
