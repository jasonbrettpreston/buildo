# Spec 79 Pass-2.5 WF3 Queue — Lead Detail Inspector spot-check (2026-05-20)

Source: §7a per-lead Inspector spot-check on permit `25 237692 PLB--00` + 12-permit broader sample. All findings tabulated with frequency, severity, scope.

Each item below proceeds through the standard WF3 ceremony with **adversarial agent review on both the plan AND the implementation** per user direction 2026-05-20.

## Priority ordering

| # | Item | Frequency | Severity | Status | Notes |
|---|---|---|---|---|---|
| **A** | Cross-stream timeline duplicate permit row (Arm 1/Arm 2 overlap when active lead IS the permit) | 4/4 CoA-linked permits (100%) | HIGH | **✅ CLOSED — pending commit** | Fix shipped — Arm 2 + Arm 3 now have `lead_id <> $1` exclusion + `$2::text <> ''` empty-string guard. Live verified: cross_stream_timeline now returns 2 entries (was 3) on permit 25 237692 PLB. Plan-review + IMPL-review both PASS. |
| L | Spec 79 §7a — codify the per-lead Inspector spot-check protocol (sample selection, anomaly indicators, DB↔API cross-validation, tabulation, WF3 triage) | — | MED | queued | Doc-only spec amendment. |
| C | transitioned_at = RUN_AT (classifier exec time), not real event date; Inspector renders raw so cross-stream timeline looks chronologically impossible | Universal across all leads | HIGH | queued | Two options: relabel UI to "detected at" (small) OR fix writers to use real event date (large blast radius — touches Phase I.1 contract) |
| B | Orphan path (O1/O2/O3) fires on CoA-linked permits and many others when not appropriate | 4/4 CoA-linked + 7/8 others = 11/12 | HIGH | queued | classify-lifecycle-phase.js orphan-routing rule doesn't check `linked_coa_application_number`. Needs spec consultation on intended routing. |
| D | modeled_gfa_sqm uses BUILDING GFA, not permit scope → plumbing permit on 119m office → 46K sqm → cost balloons to $14M | 5/5 GFA-populated non-BLD cases | HIGH | queued | compute-cost-estimates SOURCE_SQL design defect. Should weight GFA by permit_type/scope. Spec 83 amendment + code change. |
| E | cost_source=None + modeled_gfa populated → inconsistent partial-write state | 5/12 | MED | queued | Either both populated or neither. Add atomicity guard in compute-cost-estimates. |
| F | Forecast score=0 + past predicted_start, lead still surfaces in feed | Plumbing permits' forecast coverage 8.2% | MED | queued | Either compute forecasts for plumbing (current gap) OR feed surfacing logic should gate on score>0 + future-date |
| I | CoA classification panel lacks `description` field — operator cannot substantiate auto-classification | All CoA leads (29 keys, none are description) | MED | queued | Single SELECT addition in COA panel query. |
| J | trade_forecasts has 0 CoA-side rows (620K total, all `permit:*`) | All CoA leads | **CRIT** | queued | Phase F.1 compute_trade_forecasts CoA UNION not writing `coa:%` rows. Investigate compute-trade-forecasts.js + emit shape. |
| K | Lead feed query (get-lead-feed.ts) has no CoA UNION arm → CoA leads invisible | All CoA leads | **CRIT** | queued | Compounds J. Even if J is fixed, the feed doesn't surface CoAs. Should be done together. |
| G | Lifecycle timeline truncation for ALT/000 permits (1-2 entries instead of full path) | 5/12 in sample | LOW | queued | Possibly by-design for non-construction permit types; needs spec confirmation before any code change. |
| H | CoA bid_value = 0.8 unclear semantics (dollars? probability? percentage?) | All CoA leads | LOW | queued | API doc + spec annotation. |

## Process for each WF3
1. Write active task with concrete plan in `.cursor/active_task.md`
2. **Adversarial PLAN review** (DeepSeek + Independent code-reviewer) — does the plan match the actual root cause? Are there hidden dependencies?
3. User authorization gate ("PLAN LOCKED. Authorize?")
4. Red Light test (failing assertions against current code)
5. Implementation
6. **Adversarial IMPLEMENTATION review** (DeepSeek + Independent) — does the diff close the finding without regressing other paths?
7. Green Light (tests + typecheck pass)
8. Commit + push, monitor CI
9. Close out finding in this queue
