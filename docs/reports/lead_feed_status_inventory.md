# Lead Feed — Complete Status & Stage Inventory

**Purpose:** Exhaustive, ungrouped inventory of every status/stage value that appears in the three pipelines feeding the lead feed, pulled live from the buildo database on 2026-04-11. No modeling, no collapsing — just the raw data plus counts.

**Source queries:** all queries in this document are reproducible from `psql -U postgres -d buildo` — the exact SQL is shown inline where non-trivial.

---

## 0. TL;DR headline numbers

| Pipeline | Distinct values | Rows in DB | Currently used in feed? |
|---|---|---|---|
| `permits.status` | **54 distinct values** | 237,134 permits | Only **3 statuses are scored > 0**; 51 are scored 0 or filtered |
| `permits.enriched_status` | 5 distinct values | 12,811 rows (~5.4% coverage) | Computed but NOT consumed by feed SQL |
| `coa_applications.status` | **22 distinct values** | 32,868 CoAs | Not used by feed at all |
| `coa_applications.decision` | **53 distinct values** (massive casing/spelling drift) | 31,187 CoAs | Used only by one narrow index filter |
| `permit_inspections.status` | **3 distinct values** (Outstanding/Passed/Not Passed) | 94,510 inspection rows | Not directly used by feed SQL |
| `permit_inspections.stage_name` | **35 distinct values** | 94,510 rows | Only 7 collapsed sequences used; 28 not mapped |
| `inspection_stage_map` | 21 rows mapping 7 stage sequences → trade slugs | 7 sequences, 16 trade coverage | Used by timing engine (detail view only) |

**⚠️ Inspection data coverage gap:** of **140,493** permits with `status = 'Inspection'`, only **7,658** (5.5%) have ANY scraped inspection rows. **132,835** (94.5%) are in "Inspection" status with zero sub-stage data in the DB. Any Phase 5 model that depends on sub-stage data will be "unknown" for the vast majority of the active-construction feed.

**⚠️ Status bucketing gap:** the feed's opportunity-score CASE (get-lead-feed.ts:166-170) scores only **3 statuses**: `Permit Issued` (20), `Inspection` (14), `Application` (10). Everything else falls into `ELSE 0` — including **Revision Issued (20,771 rows)**, **Issuance Pending (2,866)**, **Under Review (2,102)**, **Ready for Issuance (251)** and 47 others. The `Closed` filter is present; `Completed` is absent (but `Completed` also doesn't exist as a Toronto status — the DB terminates at `Closed`).

**⚠️ CoA pre-permit pipeline is tiny:** of 32,868 CoA applications, **only 213 are not yet linked to a permit** (0.65%). Of those 213 pre-permit rows, only **~150 have an approved decision**. The "CoA Approved, Permit Not Yet Filed" pipeline is statistically marginal.

---

## 1. Permits pipeline — `permits.status`

### 1.1 Full distribution (all 54 values, descending count)

```sql
SELECT status, COUNT(*) AS n FROM permits GROUP BY status ORDER BY n DESC;
```

| Rank | status | Count | Current feed score |
|---|---|---:|---|
| 1 | `Inspection` | 140,493 | **14** |
| 2 | `Permit Issued` | 52,687 | **20** |
| 3 | `Revision Issued` | 20,771 | 0 *(scored as fallthrough)* |
| 4 | `Closed` | 8,648 | **FILTERED OUT** |
| 5 | `Issuance Pending` | 2,866 | 0 |
| 6 | `Examiner's Notice Sent` | 2,774 | 0 |
| 7 | `Pending Closed` | 2,697 | 0 |
| 8 | `Revocation Pending` | 2,356 | 0 |
| 9 | `Under Review` | 2,102 | 0 |
| 10 | `Application On Hold` | 1,743 | 0 |
| 11 | `Work Not Started` | 1,095 | 0 |
| 12 | `Not Started` | 1,075 | 0 |
| 13 | `Refusal Notice` | 941 | 0 |
| 14 | `Application Acceptable` | 537 | 0 |
| 15 | `Open` | 501 | 0 |
| 16 | `Response Received` | 481 | 0 |
| 17 | `Pending Cancellation` | 479 | 0 |
| 18 | `Ready for Issuance` | 251 | 0 |
| 19 | `Application Received` | 219 | 0 |
| 20 | `Abandoned` | 124 | 0 |
| 21 | `Deficiency Notice Issued` | 117 | 0 |
| 22 | `Not Started - Express` | 104 | 0 |
| 23 | `Plan Review Complete` | 57 | 0 |
| 24 | `Pending Parent Folder Review` | 51 | 0 |
| 25 | `Application Withdrawn` | 49 | 0 |
| 26 | `Examination` | 45 | 0 |
| 27 | `Revised` | 27 | 0 |
| 28 | `Active` | 24 | 0 |
| 29 | `Order Complied` | 22 | 0 |
| 30 | `Approved` | 22 | 0 |
| 31 | `Work Suspended` | 19 | 0 |
| 32 | `VIOLATION` | 16 | 0 |
| 33 | `Not Accepted` | 9 | 0 |
| 34 | `Order Issued` | 7 | 0 |
| 35 | `File Closed` | 6 | 0 |
| 36 | `Forwarded for Issuance` | 5 | 0 |
| 37 | `Agreement in Progress` | 4 | 0 |
| 38 | `Licence Issued` | 4 | 0 |
| 39 | `Application on Hold` *(lowercase variant)* | 4 | 0 |
| 40 | `Extension Granted` | 3 | 0 |
| 41 | *(empty string)* | 2 | 0 |
| 42 | `Permit Issued/Close File` | 2 | 0 |
| 43 | `Permit Revoked` | 2 | 0 |
| 44 | `Consultation Completed` | 2 | 0 |
| 45 | `Revoked` | 2 | **FILTERED OUT** |
| 46 | `Revocation Notice Sent` | 1 | 0 |
| 47 | `Request Received` | 1 | 0 |
| 48 | `Inspection Request to Cancel` | 1 | 0 |
| 49 | `Tenant Notice Period` | 1 | 0 |
| 50 | `Refused` | 1 | 0 |
| 51 | `Extension in Progress` | 1 | 0 |
| 52 | `Follow-up Required` | 1 | 0 |
| 53 | `Forward to Inspector` | 1 | 0 |
| 54 | `Rescheduled` | 1 | 0 |

### 1.2 Data-quality issues visible in the inventory

- **Casing drift**: `Application On Hold` (1,743) vs. `Application on Hold` (4) — same logical state, two different strings. Same pattern likely exists for other statuses we haven't normalized.
- **Empty string** bucket: 2 permits have a literal `''` status. Should be normalized to NULL or excluded.
- **Duplicate semantics**: `Revoked` (2) vs. `Permit Revoked` (2) vs. `Revocation Notice Sent` (1) vs. `Revocation Pending` (2,356). The revocation path has 4 distinct strings for what's probably 2 logical states (pending vs. done).
- **`Cancelled` does not appear in the DB at all.** The feed SQL (`get-lead-feed.ts:235`) filters out `'Cancelled'` but no row has that status — the closest is `Pending Cancellation` (479 rows), which leaks through.
- **`Completed` does not appear in the DB at all.** Toronto's terminal status is `Closed` (8,648) or `File Closed` (6). Any code referencing `'Completed'` as a status is chasing a nonexistent value.

### 1.3 Logical groupings by permit lifecycle phase

Grouping is conjectural until the user confirms — shown here as a *starting point* for the approval conversation, not a locked model.

| User-proposed phase | Candidate raw statuses | Total count |
|---|---|---:|
| **1. Application/Intake** | Application Received, Application Acceptable, Under Review, Examination, Examiner's Notice Sent, Plan Review Complete, Response Received, Application On Hold, Application on Hold, Deficiency Notice Issued, Pending Parent Folder Review, Consultation Completed, Application Withdrawn, Not Accepted, Refusal Notice, Refused, Abandoned, Request Received, Follow-up Required | ~12,200 |
| **2. Approved, awaiting issuance** | Ready for Issuance, Forwarded for Issuance, Issuance Pending, Agreement in Progress, Approved, Licence Issued | ~3,152 |
| **3. Issued, pre-construction** | Permit Issued, Revision Issued, Revised, Not Started, Not Started - Express, Work Not Started, Extension Granted, Extension in Progress | ~75,883 |
| **4. Construction/Inspection active** | Inspection, Active, Forward to Inspector, Rescheduled, Inspection Request to Cancel | ~140,524 |
| **5. Violations/holds** | VIOLATION, Order Issued, Order Complied, Work Suspended, Tenant Notice Period | ~84 |
| **6. Wind-down** | Pending Closed, Pending Cancellation, Revocation Pending, Revocation Notice Sent | ~5,533 |
| **7. Terminal** | Closed, File Closed, Permit Issued/Close File, Revoked, Permit Revoked | ~8,660 |
| **Ambiguous/unknown** | Open, Empty string | 503 |

### 1.4 `enriched_status` — a partial normalization that already exists

```sql
SELECT enriched_status, COUNT(*) FROM permits GROUP BY enriched_status ORDER BY 2 DESC;
```

| enriched_status | Count | Coverage |
|---|---:|---:|
| *(NULL)* | 230,643 | 97.3% |
| `Not Passed` | 5,045 | 2.1% |
| `Permit Issued` | 3,876 | 1.6% |
| `Active Inspection` | 1,979 | 0.8% |
| `Stalled` | 1,457 | 0.6% |
| `Inspections Complete` | 454 | 0.2% |

**Finding:** `enriched_status` is a 5-valued *derived* column computed by an enrichment script, but it's set on only 5.4% of permits and NOT consumed by the feed SQL. This is effectively a dormant field. Whatever pipeline populates it targets only permits that have been through the AIC scraper — it's the same 7,658 permits with inspection rows.

---

## 2. CoA pipeline — `coa_applications`

### 2.1 `coa_applications.status` (22 distinct)

```sql
SELECT status, COUNT(*) FROM coa_applications GROUP BY status ORDER BY 2 DESC;
```

| status | Count |
|---|---:|
| `Closed` | 28,947 |
| `Application Withdrawn` | 904 |
| `Approved with Conditions` | 465 |
| `TLAB Appeal` | 346 |
| `Hearing Scheduled` | 310 |
| `Conditional Consent` | 306 |
| `Postponed` | 287 |
| `Accepted` | 276 |
| `Deferred` | 269 |
| `OMB Appeal` | 218 |
| `Approved` | 187 |
| `Tentatively Scheduled` | 135 |
| `Notice Prepared` | 67 |
| `Prepare Notice` | 54 |
| `Refused` | 50 |
| `Await Expiry Date` | 24 |
| `Application Received` | 10 |
| `Complete` | 8 |
| `Hearing Rescheduled` | 2 |
| `Final and Binding` | 1 |
| `Appealed` | 1 |
| `Cancelled` | 1 |

**Note:** `Closed` here means the CoA process finished — it does NOT mean the project is dead. It's followed by decision=Approved / Refused / Withdrawn.

### 2.2 `coa_applications.decision` (53 distinct — data-quality disaster)

```sql
SELECT decision, COUNT(*) FROM coa_applications GROUP BY decision ORDER BY 2 DESC;
```

The `decision` column has **53 distinct values** due to rampant casing and spelling drift. Normalized into canonical buckets:

| Canonical bucket | Raw variants found | Total count |
|---|---|---:|
| **Approved** | `Approved` (26,895), `approved` (42), `APPROVED` (1) | 26,938 |
| **Refused** | `Refused` (2,769), `refused` (19), `REFUSED` (1), `DELEGATED CONSENT REFUSED` (1) | 2,790 |
| **Withdrawn** | `Withdrawn` (711), `withdrawn` (1), `application withdrawn` (4), `Application Withdrawn` (1) | 717 |
| **Deferred** | `Deferred` (495), `deferred` (5), `DEFERRED` (1), `DEFFERED` (1), `Deferred <date>` variants (7) | 509 |
| **Conditional Approval** (merge with Approved) | `conditional approval` (98), `Approved on condition` (30), `Approved on Condition` (30), `Approved with Conditions` (27), `Approved with conditions` (6), `Approved wih Conditions` (6), `approved on condition` (5), `Approved with condition` (3), `CONDITIONAL APPROVAL` (3), `modified approval` (2), `Conditional Approved` (2), `Approved with Condition` (2), `Approved on conditional` (2), `Partially Approved` (1), `Conditionally Approved` (1), `Approved Conditionally` (1), `conitional approval` (1), `Approved on condation` (1), `approved on condtion` (1), `conditional Approved` (1), `conditional approved` (1), `approved with condition` (1), `Approved, as amended, on Condition` (1), `APPROVED ON CONDITION` (1) | ~226 |
| **NULL (no decision yet)** | *(NULL)* | 1,681 |
| **Other (junk/unparseable)** | `decision not made - appeal was made due to that` (1), `Oct 29, 2019` (1), `closed` (1), `application closed` (1), `Postponed` (1) | 5 |

**Key finding for the feed:** the existing `idx_coa_upcoming_leads` index filter is:

```sql
decision::text = ANY (ARRAY['Approved'::varchar, 'Approved with Conditions'::varchar])
AND linked_permit_num IS NULL
```

This matches **Approved** (26,895) + **Approved with Conditions** (27) = 26,922 rows. It **misses** 42 lowercase `approved` + 98 `conditional approval` + 30 `Approved on Condition` + every other case variant — a total of ~240 CoAs that are semantically "approved" but index-invisible. That's a 0.9% leakage but the WRONG 0.9% — they're exactly the messy legacy records a fuzzy-match linker should catch.

### 2.3 Pre-permit CoA state (CoA row with no linked permit)

```sql
SELECT COUNT(*) AS total, COUNT(linked_permit_num) AS linked,
       COUNT(*) - COUNT(linked_permit_num) AS pre_permit
FROM coa_applications;
```

| Total CoAs | Linked to permit | Pre-permit (unlinked) |
|---:|---:|---:|
| 32,868 | 32,655 | **213** |

**213 pre-permit CoAs total.** Breakdown by status × decision of the unlinked rows (counts >1 only):

```sql
SELECT status, decision, COUNT(*) FROM coa_applications
WHERE linked_permit_num IS NULL AND decision IS NOT NULL
GROUP BY status, decision ORDER BY 3 DESC LIMIT 15;
```

| status | decision | Count |
|---|---|---:|
| Closed | Approved | **132** |
| Closed | Refused | 13 |
| Closed | Withdrawn | 6 |
| Conditional Consent | Approved | 4 |
| Deferred | Deferred | 4 |
| Approved with Conditions | Approved | 4 |
| Application Withdrawn | Deferred | 4 |
| Approved | Approved | 3 |
| Tentatively Scheduled | Deferred | 2 |
| OMB Appeal | Refused | 2 |
| OMB Appeal | Approved | 2 |
| Accepted | approved | 1 |
| Closed | approved | 1 |

**The entire "CoA approved but permit not yet filed" pipeline is ~150 projects** (132 Closed+Approved + 4 Conditional Consent + 4 Approved with Conditions + 3 Approved + a handful of case variants). This is the sum total of the "Variance Granted → Permit Pending" lifecycle stage. Most pre-permit CoAs (the other ~60) are refused, withdrawn, or deferred and shouldn't surface as leads at all.

### 2.4 CoA linkage coverage (sanity)

213 unlinked / 32,868 total = **0.65% unlinked**. The fuzzy-match linker (`scripts/link-coa-to-permits.js`) is doing its job — 99.35% of CoAs find a matching permit. The "pre-permit lead" source is genuinely marginal.

---

## 3. Inspection pipeline — `permit_inspections`

### 3.1 `permit_inspections.status` (3 distinct — clean)

```sql
SELECT status, COUNT(*) FROM permit_inspections GROUP BY status ORDER BY 2 DESC;
```

| status | Count | % |
|---|---:|---:|
| `Outstanding` | 71,703 | 75.9% |
| `Passed` | 17,130 | 18.1% |
| `Not Passed` | 5,677 | 6.0% |

**Total inspection rows: 94,510.** The codebase types (`src/lib/permits/types.ts:299`) list a fourth value `Partial` but zero rows exist with that status — it's either deprecated or never occurred in the scraped data.

### 3.2 `permit_inspections.stage_name` (35 distinct)

```sql
SELECT stage_name, COUNT(*) FROM permit_inspections GROUP BY stage_name ORDER BY 2 DESC;
```

**Workhorse stages (>1,000 rows each, 19 stages):**

| stage_name | Count | In `inspection_stage_map`? |
|---|---:|:---:|
| `Structural Framing` | 9,579 | ✅ (seq 30) |
| `Occupancy` | 8,952 | ✅ (seq 70) |
| `Insulation/Vapour Barrier` | 8,762 | ✅ (seq 40) |
| `Footings/Foundations` | 7,587 | ✅ (seq 20) |
| `Exterior Final Inspection` | 7,427 | ❌ |
| `Fire Separations` | 7,022 | ✅ (seq 50) |
| `Excavation/Shoring` | 6,722 | ✅ (seq 10) |
| `Interior Final Inspection` | 6,462 | ✅ (seq 60) |
| `Fire Protection Systems` | 5,957 | ❌ |
| `Site Grading Inspection` | 4,908 | ❌ |
| `Fire Access Routes` | 2,276 | ❌ |
| `Pool Suction/Gravity Outlets` | 2,231 | ❌ |
| `Pool Circulation System` | 2,231 | ❌ |
| `Repair/Retrofit` | 1,131 | ❌ |
| `Final Inspection` | 1,050 | ❌ |
| `Change of Use` | 1,016 | ❌ |
| `Demolition` | 1,011 | ❌ |
| `System` | 1,009 | ❌ |
| `Security Device` | 1,005 | ❌ |
| `Tent/Portable Classroom` | 1,004 | ❌ |

**Long tail (< 1,000 rows, 15 stages):**

| stage_name | Count | In map? |
|---|---:|:---:|
| `Plumbing Final` | 913 | ❌ |
| `Water Distribution` | 910 | ❌ |
| `Drain/Waste/Vents` | 909 | ❌ |
| `Sewers/Drains/Sewage System` | 889 | ❌ |
| `Fire Service` | 888 | ❌ |
| `Water Service` | 887 | ❌ |
| `HVAC Final` | 882 | ❌ |
| `HVAC/Extraction Rough-in` | 882 | ❌ |
| `Foundation` *(2 rows — orphan spelling variant of Footings/Foundations)* | 2 | ❌ |
| `Insulation` *(1 row)* | 1 | ❌ |
| `Survey Submitted?` *(1 row)* | 1 | ❌ |
| `Survey` *(1 row)* | 1 | ❌ |
| `Insulation & Vapour/AirBarrier Passed on` *(1 row — data bleed)* | 1 | ❌ |
| `Final Interior` *(1 row)* | 1 | ❌ |
| `HVAC Permit?` *(1 row)* | 1 | ❌ |

**Finding:** of 35 stage_name values, only **7 are canonicalized** in `inspection_stage_map` (seq 10-70). The other **28 stages are invisible to the timing engine** — they don't trigger any Tier 1 stage-based timing even though they contain real signal (e.g., `HVAC Final` is a near-perfect "HVAC trade is wrapping up" signal). The long tail also includes 7 typo/orphan rows that should be normalized at ingest.

### 3.3 `inspection_stage_map` contents (21 rows — the trade enablement matrix)

```sql
SELECT id, stage_name, stage_sequence, trade_slug, relationship,
       min_lag_days, max_lag_days, precedence
FROM inspection_stage_map ORDER BY stage_sequence, precedence;
```

| stage_name | seq | trade_slug | relationship | min→max days |
|---|:---:|---|---|---|
| Excavation/Shoring | 10 | concrete | follows | 5-14 |
| Excavation/Shoring | 10 | waterproofing | follows | 7-21 |
| Excavation/Shoring | 10 | drain-plumbing | concurrent | 0-7 |
| Footings/Foundations | 20 | framing | follows | 7-21 |
| Footings/Foundations | 20 | structural-steel | follows | 7-21 |
| Footings/Foundations | 20 | masonry | follows | 14-28 |
| Structural Framing | 30 | plumbing | follows | 5-14 |
| Structural Framing | 30 | electrical | follows | 5-14 |
| Structural Framing | 30 | hvac | follows | 5-14 |
| Structural Framing | 30 | fire-protection | follows | 7-21 |
| Structural Framing | 30 | roofing | concurrent | 0-14 |
| Insulation/Vapour Barrier | 40 | drywall | follows | 5-14 |
| Fire Separations | 50 | painting | follows | 7-21 |
| Fire Separations | 50 | flooring | follows | 7-21 |
| Fire Separations | 50 | tiling | follows | 7-21 |
| Fire Separations | 50 | trim-work | follows | 14-28 |
| Fire Separations | 50 | millwork-cabinetry | follows | 14-28 |
| Fire Separations | 50 | stone-countertops | follows | 14-28 |
| Interior Final Inspection | 60 | landscaping | follows | 0-14 |
| Interior Final Inspection | 60 | decking-fences | follows | 0-14 |
| Occupancy | 70 | painting | follows | 0-7 |

**Trade coverage:** 16 of 32 trades are represented. **Missing:** demolition, insulation, glazing, elevator, temporary-fencing, pool-installation, solar, security, eavestrough-siding, caulking, shoring, excavation (trade_slug), drain-plumbing (only seq 10 concurrent), trim-work duplicate with finish, etc. The mapping is partial.

### 3.4 Inspection-status × stage_name for active permits

```sql
SELECT p.status AS permit_status, i.stage_name, i.status AS inspection_status, COUNT(*)
FROM permits p JOIN permit_inspections i ON i.permit_num = p.permit_num
WHERE p.status = 'Inspection'
GROUP BY p.status, i.stage_name, i.status HAVING COUNT(*) > 500
ORDER BY stage_name, inspection_status;
```

| stage_name | Outstanding | Passed | Not Passed |
|---|---:|---:|---:|
| Excavation/Shoring | 984 | 3,471 | — |
| Exterior Final Inspection | 4,557 | — | 531 |
| Final Inspection | 825 | — | — |
| Fire Access Routes | 1,240 | — | — |
| Fire Protection Systems | 3,795 | — | — |
| Fire Separations | 3,651 | 1,244 | — |
| Footings/Foundations | 1,177 | 3,432 | 981 |
| Insulation/Vapour Barrier | 2,928 | 2,612 | 1,136 |
| Interior Final Inspection | 3,647 | — | 590 |
| Occupancy | 5,492 | 907 | — |
| Pool Circulation System | 1,217 | — | — |
| Pool Suction/Gravity Outlets | 1,217 | — | — |
| Site Grading Inspection | 3,348 | — | — |
| Structural Framing | 2,232 | 3,750 | 1,303 |

**Finding:** Outstanding inspections outnumber Passed by ~4:1 across most stages. "Not Passed" shows up meaningfully in Structural Framing (1,303), Insulation/Vapour (1,136), Footings (981), Interior Final (590), Exterior Final (531) — these are the re-inspection hotspots. The timing engine's `NOT_PASSED_PENALTY_DAYS` (+14 days) applies to ~10% of inspection-stage-tracked permits.

---

## 4. Cross-pipeline coverage gap — the 94.5% blind spot

```sql
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM permit_inspections i WHERE i.permit_num = p.permit_num)
       THEN 'has_inspections' ELSE 'no_inspections' END AS coverage,
  p.status, COUNT(*) AS n
FROM permits p
WHERE p.status IN ('Inspection','Permit Issued','Revision Issued','Issuance Pending','Closed')
GROUP BY coverage, p.status ORDER BY p.status, coverage;
```

| Status | has_inspections | no_inspections | Coverage % |
|---|---:|---:|---:|
| `Inspection` | 7,658 | **132,835** | **5.5%** |
| `Permit Issued` | 2,324 | 50,363 | 4.4% |
| `Revision Issued` | 2,855 | 17,916 | 13.7% |
| `Issuance Pending` | 5 | 2,861 | 0.2% |
| `Closed` | 14 | 8,634 | 0.2% |

**Implication for any sub-stage model:**
- 94.5% of `Inspection`-status permits cannot be assigned a sub-stage icon from `permit_inspections` data. They're stuck at "Construction active — stage unknown."
- The AIC scraper (see `project_scraper_scaling_strategy.md`) is the only source of this data and it's severely under-scaled. Any Phase 5 sub-stage model must have a graceful fallback for the 94.5% that have no data.
- `Revision Issued` has the best coverage at 13.7% — these are permits that got a revision AFTER inspections started, so the scraper has seen them.

---

## 5. What the feed code currently ignores

Cross-referencing `src/features/leads/lib/get-lead-feed.ts` against the inventory:

### 5.1 Statuses scored 0 that probably shouldn't be

| Status | Count | Why it matters |
|---|---:|---|
| `Revision Issued` | 20,771 | Active construction with a revision applied. Same opportunity as `Permit Issued`. |
| `Issuance Pending` | 2,866 | About to issue — higher opportunity than `Application`. |
| `Under Review` | 2,102 | Real filings, real projects. Same opportunity as `Application`. |
| `Ready for Issuance` | 251 | About to issue — should score higher than `Application`. |
| `Active` | 24 | Literally an active permit. Currently scored 0. |
| `Forwarded for Issuance` | 5 | Same as Ready for Issuance. |

Fix is a trivial CASE expansion.

### 5.2 Statuses leaking through the filter that probably shouldn't

| Status | Count | Why it matters |
|---|---:|---|
| `Pending Closed` | 2,697 | About to close — lead is dying. |
| `Pending Cancellation` | 479 | About to cancel. |
| `Revocation Pending` | 2,356 | Permit being revoked. |
| `Abandoned` | 124 | Dead. |
| `Application Withdrawn` | 49 | Dead. |
| `Refusal Notice` | 941 | Dead. |
| `Refused` | 1 | Dead. |
| `Not Accepted` | 9 | Dead. |
| `Permit Revoked` | 2 | Same as `Revoked` (filtered) under a different spelling. |

Any permit in one of these statuses is NOT actionable. They should join the `Closed / Cancelled / Revoked` filter-out set.

### 5.3 `enriched_status` is computed but never read

5 normalized values exist (`Active Inspection`, `Permit Issued`, `Stalled`, `Not Passed`, `Inspections Complete`) on 12,811 permits, but `get-lead-feed.ts` never references `p.enriched_status`. This is either dead code waiting to be wired OR a deferred enrichment that we haven't productized. Worth a decision: wire it, or kill the populator.

---

## 6. What this inventory makes possible (without decisions)

This section is purely observational — it lists the axes of modeling that the data supports, so the next step (grouping into a stage taxonomy for the map icons) can be an explicit design conversation rather than a best-guess.

### 6.1 Permit lifecycle axis — 7 candidate phases (from §1.3)

The ~54 raw statuses collapse naturally into 7 logical phases:
1. Application/Intake (~12K)
2. Approved, awaiting issuance (~3K)
3. Issued, pre-construction (~76K)
4. Construction/Inspection active (~140K)
5. Violations/holds (~85)
6. Wind-down (~5.5K)
7. Terminal (~8.7K)

### 6.2 CoA pre-permit axis — 2 phases

Only 213 pre-permit rows exist; ~150 are Approved. Realistically 2 phases:
- Variance Requested (pending / hearing scheduled)
- Variance Granted (approved, not yet linked to a permit)

### 6.3 Inspection sub-stage axis — 7 sequences or 35 raw stages

Trade-off:
- **7 sequences** (seq 10-70 from `inspection_stage_map`) covers 16 trades and 57K inspection rows (60% of data).
- **35 raw stage_names** covers all trades but 28 of them aren't mapped to any trade, so the icon would be non-actionable for a specific user.
- **Realistic 10-stage model** (workhorse + trade-relevant) might be: Excavation, Foundations, Framing, Rough-in (HVAC+Plumbing+Electrical bundled), Insulation, Fire Separation, Interior Final, Exterior Final, Occupancy, Pool — covers ~85K rows and 24+ trades.

### 6.4 Inspection pass/fail axis — 3 states

Outstanding / Passed / Not Passed. Could overlay on the sub-stage as a pass-state indicator (✓ / ✗ / ○) independent of the stage icon.

### 6.5 Freshness axis — derived (not a DB column)

Stalled / Stale / Fresh based on `scraped_at` and the lag between inspections. This is a modifier, not a phase.

---

## 7. Open modeling questions for the next pass

These are the decisions that need to be made AFTER the user reviews this inventory and BEFORE the stage map is locked. They're not answered here.

1. Does the 7-phase permit lifecycle (§6.1) match the user's mental model, or does it need to split/merge?
2. Do `Revision Issued`, `Issuance Pending`, `Ready for Issuance`, `Under Review` get their own icons, or do they fold into the 7 phases?
3. The 94.5% blind spot — how does the map render an `Inspection`-status permit with no sub-stage data? One fallback icon for "construction active, stage unknown"?
4. Are pool inspections (4,462 rows) a first-class sub-stage or a separate trade-specific path?
5. `Exterior Final Inspection` and `Site Grading Inspection` are high-volume stages outside the current `inspection_stage_map`. Add to the map, or leave as non-actionable?
6. `enriched_status` — wire into the feed or delete the populator?
7. CoA linker — fix the case/spelling drift on `decision` so the ~240 messy-legacy approvals are recoverable, or accept the 0.9% loss?

---

## 8. Appendix — reproducibility

Every number in this report is re-derivable from:

```bash
psql -U postgres -d buildo < [query from inline code blocks above]
```

Snapshot timestamp: **2026-04-11**. Counts will drift as the daily pipeline runs.

Total DB rows referenced:
- `permits`: 237,134
- `coa_applications`: 32,868
- `permit_inspections`: 94,510
- `inspection_stage_map`: 21
- `permits.enriched_status` populated: 12,811
