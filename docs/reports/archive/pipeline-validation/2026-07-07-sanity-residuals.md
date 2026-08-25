# Parcel-Sanity Watch Residuals — Root-Cause (2026-07-07)

**Context:** Phase 6.7-A6 of the lead-serving WF2. The `assert_parcel_sanity` step carries two
non-zero WARN watches on the live dev DB:

| watch | breaches | check predicate |
|-------|----------|-----------------|
| `max_build_fsi_gt_5` | 5 | `max_build_fsi > 5` (all residential) |
| `lowrise_maxbuild_height_gt_15m` | 12 | `(RD/RS/RT) AND max_build_height_m > 15` |

The plan (Fence-4) hypothesised these 17 rows were the **heritage/massing-mislink family** (the
filed `1944170` HIGH follow-up). **Live inspection REFUTES that hypothesis** — none of the 17 rows
carry a heritage designation, and all use `max_buildable_gfa_basis = 'coverage_box'` (not
`heritage_existing`). They are two DISTINCT, unrelated mechanisms, neither of which is a single clean
upstream fix. Per A6's DOCUMENT branch, they are recorded here and the watches stay WARN.

---

## Family 1 — `max_build_fsi_gt_5` (5 rows): legitimate RA high-density, check false-positive

All 5 breaches are `RA` (apartment / high-density residential) zone:

| parcel_id | zone | lot m² | footprint m² | GFA m² | max_build_fsi | height m | stories | basis |
|-----------|------|--------|--------------|--------|---------------|----------|---------|-------|
| 197628 | RA | 626.91 | 371.73 | 3717.30 | 5.930 | 39.00 | 10 | coverage_box |
| 174354 | RA | 626.93 | 371.73 | 3717.30 | 5.929 | 39.00 | 10 | coverage_box |
| 197643 | RA | 557.26 | 310.31 | 3103.10 | 5.568 | 39.00 | 10 | coverage_box |
| 159160 | RA | 557.27 | 310.31 | 3103.10 | 5.568 | 39.00 | 10 | coverage_box |
| 11921  | RA | 557.27 | 310.31 | 3103.10 | 5.568 | 39.00 | 10 | coverage_box |

**Mechanism:** these are coherent high-density envelopes — ~55-60% footprint coverage × 10 storeys ×
39 m all agree, and FSI ≈ 5.6-5.9 is *physically normal* for an RA apartment zone. The
`max_build_fsi_gt_5` check bound (`> 5`) was seeded from a lowrise garbage-GFA bug ("FSI 1042") and is
applied corpus-wide. On RA/RM it is a **false positive**, exactly analogous to the
`lowrise_coverage_gt_50pct` check that was already scoped LOWRISE-only ("RA/RM apartment zones
legitimately reach 80% coverage"). These 5 rows are **NOT bugs** — the data is correct.

**Verdict: no data fix.** The honest remediation would be to make `max_build_fsi_gt_5` zone-aware
(lowrise `> 2.5`, RA/RM `> 6-8`), a *check-calibration* refinement of `parcel-sanity-audit.js` — not
an upstream enrich/cost fix. Deferred to the sanity-check-calibration follow-up (below) to avoid
scope creep into P6.7; the watch stays WARN in the interim (an honest "5 RA parcels near the corpus
FSI bound", not a green-washed bug).

## Family 2 — `lowrise_maxbuild_height_gt_15m` (12 rows): bylaw height-overlay contamination

| parcel_id | zone | lot m² | max_build_height_m | stories | stories_basis | bylaw_max_height_m |
|-----------|------|--------|--------------------|---------|---------------|--------------------|
| 67789 | RT | 244.74 | 54.00 | 2 | pocket | 54.00 |
| 40568 | RT | 607.69 | 54.00 | 2 | pocket | 54.00 |
| 368447 | RT | 219.49 | 54.00 | 2 | pocket | 54.00 |
| 136912 | RT | 260.53 | 54.00 | 2 | pocket | 54.00 |
| 21210 | RT | 246.01 | 54.00 | 2 | pocket | 54.00 |
| 345295 | RD | 335.19 | 54.00 | 4 | pocket | 54.00 |
| 276396 | RT | 254.97 | 54.00 | 2 | pocket | 54.00 |
| 372861 | RD | 1416.98 | 16.00 | 2 | pocket | 16.00 |
| 485797 | RS | 928.38 | 16.00 | 3 | pocket | 16.00 |
| 485795 | RS | 167.25 | 16.00 | 3 | pocket | 16.00 |
| 485794 | RS | 167.27 | 16.00 | 3 | pocket | 16.00 |
| 485796 | RS | 171.49 | 16.00 | 3 | pocket | 16.00 |

**Mechanism:** `max_build_height_m` is inheriting `bylaw_max_height_m` verbatim (the two columns match
exactly on all 12 rows). For the 7 RT/RD rows the bylaw height is **54 m** — a mid/high-rise
height-overlay value welded onto a lowrise parcel (an RT townhouse / RD detached lot cannot be 54 m).
This is a **zoning height-overlay assignment error** — a too-tall `zoning_height_overlay` polygon
covering a lowrise parcel — *upstream of* `enrich_parcels`, in `load_zoning` / the height-overlay
spatial join. The storey caps stay conservative (2-4, `basis='pocket'`), so the *envelope GFA* is not
corrupted, but the height field is. The 5 RS/RD `16 m` rows are marginal (16 m at 2-3 storeys is a
generous-but-not-impossible 5.3 m/storey) and sit just over the 15 m watch bound.

**Verdict: no single-commit fix; documented + follow-up.** Unlike a mislink guard, this requires
tracing the height-overlay spatial-join assignment (which overlay polygon is matching these lowrise
parcels, and whether a coverage/containment predicate is too permissive) — a genuine investigation of
`load-zoning.js` / the height-overlay enrich path, not a bounds clamp. Forcing a clamp (`min(bylaw,
lowrise_cap)`) would mask an upstream data-quality signal. Deferred; watch stays WARN.

---

## Disposition

- **NOT the heritage/massing-mislink family** the plan hypothesised — the `1944170` follow-up is
  unrelated. Filed follow-up updated to note that P6.7-A6 investigated the 17 sanity residuals and
  found two new, distinct mechanisms.
- **No forced fix** (per A6 guidance — data-poison / check-calibration, not a one-line guard).
- Both watches **stay WARN** (the honest label) until: (1) `max_build_fsi_gt_5` is made zone-aware,
  and (2) the RT/RD 54 m height-overlay assignment is traced and corrected.

## Follow-ups filed (see `docs/reports/review_followups.md`)

1. **Sanity-check calibration — `max_build_fsi_gt_5` zone-aware:** scope the FSI bound by zone
   (lowrise vs RA/RM) mirroring `lowrise_coverage_gt_50pct`; the 5 current RA breaches are legitimate.
2. **Bylaw height-overlay contamination on lowrise (RT/RD @ 54 m):** trace the
   `zoning_height_overlay` spatial-join assignment that welds a 54 m overlay onto RT/RD parcels
   (67789, 40568, 368447, 136912, 21210, 345295, 276396); tighten the containment/coverage predicate
   in the height-overlay enrich path. Distinct from the `1944170` heritage-mislink follow-up.
