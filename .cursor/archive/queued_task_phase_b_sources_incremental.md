# QUEUED — Phase B: Sources Incremental Architecture (WF2)
**Status:** QUEUED, NOT STARTED, NOT AUTHORIZED. Requires its own WF plan ceremony before any code.
**Provenance:** extracted VERBATIM 2026-08-05 from `.cursor/active_task.md` when that file was
re-used for the post-Phase-A residuals WF3. Nothing here has been edited, folded, or superseded.
Phase A (deep-scrapes drain finalization + cron re-enable) is COMPLETE and shipped
(`d6eb9f31`, `2fa3b2e7`); the full Phase A record is at
`.cursor/wf3_deep_scrapes_drain_finalization_record.md`.

**Before starting Phase B:** the seven panel verdicts below were delivered against the combined
A+B plan on 2026-08-04 and are STILL UNFOLDED for the B items — they must be folded into a v2 of
this plan before its plan-lock. Verdict entries marked IMPL / STEP-5 / STEP-6 relate to Phase A
and are historical only.

**Operator rulings carried in (2026-08-04 / 2026-08-05):** full architecture only, no interim
quick-wins patch; no sources rerun before this lands; parcel enrichment may stay out-of-sync
meanwhile; the sources cron is now `disabled_manually` in GitHub (2026-08-05) — B6 must re-enable
it THERE as well as in the cron text, or the restored schedule never fires.

---

# Phase B: Sources Incremental Architecture (WF2) — the actual fix, no interim band-aid
**Design authority:** `docs/reports/2026-08-04-sources-incremental-architecture.md` (2026-08-04 exploration). **Operator rulings:** full architecture only (no quick-wins-only patch); sources cron → BI-WEEKLY; full safety pass → QUARTERLY; no sources rerun before this lands; enrichment may stay out-of-sync meanwhile.
**Target Spec:** Spec 43 (sources chain) + Spec 115 §2.2 (workflow) + per-source specs (54/55/56/58/59/61/62). Spec text updates ride each step.

## Design (from the report; panel verifies against it + live code)
* **Tier-1 skip:** CKAN `package_show` metadata poll per source at chain start; unchanged `last_modified` → loader + its downstream enrichment steps skip (recorded as skip rows, observable). WSIB outside the poll (manual/annual ruling).
* **Tier-2 gating:** loaders remain IS-DISTINCT-FROM upserts; each records a content watermark (existing `records_meta` pattern — `decideCentrelineMode` 3-way gate is the template; NO new source_versions table unless panel forces one).
* **enrich-parcels:** drop the manifest `--full` pin (`scripts.enrich_parcels.chain_args.sources`); add the missing massing watermark (template: `scripts/lib/massing-full-gate.js`) so passes 2–3 stop being blind; all 5 passes then run their EXISTING incremental predicates (dirty-set only).
* **Known defects folded in:** enrich-heritage writes-but-never-reads its watermark (port the read); 14,510 centreline-stale parcels never converge (dirty-set leak — root-cause + fix); load-massing hardcoded CKAN resource UUID → runtime `package_show` resolution (404 class, already bit twice).
* **Cadence:** cron `0 14 * * 0` → bi-weekly equivalent (GH cron can't express fortnights — in-job week-parity check, DST-safe, same pattern as the coa DST guard); QUARTERLY `--full` safety pass = separate workflow_dispatch-or-scheduled job with the big window (needs 360-min ceiling or 2-job split — panel rules which).
* **Compute target:** steady-state bi-weekly run ≈ 20–45 min; quarterly pass ~3h.

## Phase B Protocol (fail-first, per `.claude/workflows.md` WF3 discipline applied to each step)
- [ ] Rollback Anchor: recorded at B1 implementation start.
- [ ] State Verification: per-step — live watermark/dirty-set counts queried BEFORE each change (B2: current dirty-set size; B4: the 14,510 set membership).
- [ ] Reproduction + Red Light: EVERY step writes its failing test first and shows it red — B1: poll-skip decision table (changed/unchanged/CKAN-unreachable→fail-safe-load); B2: gate-decision tests (massing changed→full bite, unchanged→incremental) + manifest pin absence lock; B3: heritage watermark READ path red against current write-only code; B4: convergence test (stale set must shrink); B5: resolver picks newest matching resource, 404 on old id handled; B6: week-parity fires correct weeks (DST boundary cases), infra locks on both workflow shapes.
- [ ] Idempotency: all gates/polls are read-only decisions; loaders unchanged upserts; reclaim/watermark writes guarded.
- [ ] Pre-Review Self-Checklist: sibling sweep — other write-only watermarks; other hardcoded CKAN resource ids; other never-converging dirty sets; other GH-cron cadence expressions needing parity guards.
- [ ] Independent Review + Regression Guardian + panel per B7; Green Light per step commit (hooks) + full gate before push.

## Execution Plan (one commit per step; Red Light before Fix in every step)
- [ ] B1: CKAN metadata-poll module + per-source tier-1 skip wiring (loaders + downstream skip cascade, observable skip rows).
- [ ] B2: enrich-parcels — massing watermark + drop manifest `--full` pin; verify all 5 passes' incremental predicates against live data.
- [ ] B3: heritage watermark read-port + remaining step gates (link_parcel_addresses, compute_parcel_cost_estimates, link_wsib attempted-watermark).
- [ ] B4: dirty-set leak fix (14,510 centreline-stale parcels — diagnose why they never converge, fix, prove set shrinks to 0).
- [ ] B5: load-massing runtime resource resolution (kills the 404 rotation class).
- [ ] B6: cadence — bi-weekly cron with week-parity guard + quarterly full-pass job (ceiling ruling from panel); Spec 43/115 + runbook text.
- [ ] B7: Multi-agent OUTPUT panel (pipeline WF2 roster incl. Reality-Check — enriched parcel fields affected) + proving run: one bi-weekly-shape run green end-to-end incl. steps 21–27 on cloud (first time ever), one quarterly-shape run green in its window.
- [ ] B8: Close-out — lessons (metadata-gated loads; watermarks must be read not just written), memory, watchdog window update (204h → bi-weekly + slack).

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §11 note: F1's draft predates this plan-lock (process breach, operator-flagged); step 1 explicitly re-validates its red-first evidence and step 5's panel reviews it as an ordinary diff — it gets no credit for existing.

## Panel folds pending (verdicts 2026-08-04, fold at next working turn)
* SF: ①②③⑥ PASS (queue schema ok; watermark pattern generalizes, orphan-close fail-safes to full; no table needed). AMEND: A1 CKAN-poll storage key shape + last_modified-instability fallback (plan silent); A2 skip-row watermark CARRY-FORWARD invariant + red test per source (emitReducedSummary precedent); A3 B2 must also adjudicate link_massing's identical manifest --full pin (manifest.json:30 defeats its gate every chain run).
* Compliance: CONDITIONAL PASS. AMEND: C1 contracts waiver line (like rehab plan's) + pin F2 TTL to concrete value; C2 add named "Spec Review" step verbatim both phases; C3 enumerate B3 remaining gate reds + B4 red is untestable-until-diagnosed (state diagnose-first); C4 declare B1 shape (scripts/lib library = R8-exempt vs standalone script = full Spec 47 skeleton + lock id) + its skip-row observability; record that THIS panel satisfies §6.4 plan-roster for A (and B's roster rides B's own ceremony).
* Integration (already folded above): F2 exists (re-scoped), run_http_mode name, DST-guard = observability-only.
* Still inbound: Ground-truth, Reality-Check, Observability, Regression Guardian.
* RG: F1 composes safely (budget = 3rd top-of-outer-loop exit, orthogonal to queue-empty/cap; early_abort only breaks inner loop — pre-existing, untouched). F2 duplicate-confirmed (corroborates Integration); REAL race = a 2nd overlapping orchestrator invocation reclaiming a 1st's live claims (30-min TTL holds vs ~2.5-min batch durations; F1 doesn't change per-batch hold). B2 pin characterization CONFIRMED (no hidden 2nd reason). B3 heritage = UNFINISHED port (not deliberate). AMEND-RG1: B1 consolidates 4 DIVERGENT skipCheckDecision copies (ravines/heritage contentHash, centreline, zoning 730-day force-reload) — red-light table must assert each source's divergent branch SURVIVES consolidation. RG2: watchdog chain_sources=204h must move with bi-weekly (B8 covers; backup fallback safe post-P5). RG3: informational — early_abort never halts future claiming even at 90% wipeout (pre-existing; candidate follow-up).
* GT: evidence VERIFIED (run ids, rulings; bi-weekly = operator OVERRIDE of report's weekly — legitimate). FACTUAL FIX: sources cron is `0 13 * * 0` not `0 14`; "509+2,700" should cite run 30829832464 too. REPORT-FIDELITY AMENDS: GT1 pass-4 comps predicate is `comp_count IS NULL` — never refreshes stale comps (daily permits/coa upstream; report item 8/Q3 dropped — B2 must address scoped comp refresh or explicitly defer); GT2 CKAN last_modified noisy for daily-regenerated address-points/parcels — 2-week observation or content-hash fallback required in B1 (report Q2); GT3 HARD CONSTRAINT: every skip path must emit a COMPLETED run row with re-stamped versions (emitReducedSummary) or enrich-permits HALTs — B1 invariant (matches SF-A2); GT4 report item 11 shared scripts/lib/source-version.js dropped — adopt or rule out. DOC-MISSING: Spec 44:14 + time-budget section; Spec 115:350/:953 (A) + :45/:393/:773/:780/:1051 (B); admin `validCadences` route :39 + DataQualityDashboard :115 + funnel.ts :158 slaHours (bi-weekly touches ADMIN SURFACE → Domain Mode check for B6); Phase-A runbook. Spec 112 verified N/A.
* Obs: OBS1 CRITICAL LIVE DEFECT in working tree — the in-flight F2 edit made populate_queue return 3 values (:191) but call site :523 unpacks 2 → ValueError crashes EVERY orchestrator run; fix unpack + add `stale_claims_reclaimed` INFO row (log.INFO alone fails Spec 79 C4). OBS2 `time_budget_stop` row must emit EVERY run (true/false), not only-when-fired (§3.6 zero-row preservation / §4.9 self-announcing; silent-unwired indistinguishability). OBS3 B1/B3 cascaded skips must ALWAYS emit a completed row per skipped step (enrich-centreline §3.7 precedent; the "watchdog can't tell never-ran" lesson). OBS3b port load-zoning's skip_check_error catch+row (:591-593) with the skip decision. OBS4 B4 needs a bounded convergence row (WARN if count ≥ last run), not bare INFO. OBS5 bi-weekly consumers incomplete: validCadences route :39 + seed cadence='Weekly' (corroborates GT). Pre-existing minor: drained-queue early-return emits rows:[] (C4 gap) — follow-up.
* RC — ADJUDICATED (jury): findings ①②④ are artifacts of the WRONG DATABASE — RC's numbers carry the LEGACY 5432 signature exactly (all queue rows created_at=2026-08-01T01:45:59 = the C7 wrong-DB incident's seeding moment, completed=2 = its 2 attempted permits, chain run at 01:45 = exported evidence rows 1603/1604; the cloud queue verified via SUPABASE_DATABASE_URL yesterday read 10,920→9,481 with 1,670 completed). RC's own script evidently fell into the hardcoded legacy PG_* fallback — the THIRD bite of the filed WF3 candidate (review_followups 2026-07-31), now trapping reviewer agents; ESCALATE that WF3's priority. ACCEPTED from RC: ③ budget-stop expectation = 1,120 items (140min×60/7.5s), fix the ~1,250 figure; ⑤ wording — the 14,5xx centreline-stale set is STUCK (no forward progress ≥4 wks), not "small churn"; ⑥ daily-regenerating sources vs bi-weekly cadence is an OPEN PREMISE (2-week observation or content-hash per GT2/report Q2), not settled. Re-verify RC's ①②④ against SUPABASE_DATABASE_URL at next working turn before any re-baseline.
* IMPL: F1+F2 COMMITTED d6eb9f31 (unpushed; red-first 8+1+3 cases; test:py 264, vitest 10/10, typecheck/lint clean; every-run time_budget_stop row + stale_claims_reclaimed row; both loops; shell BUDGET; F3 untouched). Step-5 panel dispatched. Obs "crash" = transient mid-edit, self-corrected pre-commit.
* STEP-5 RG: all 5 fences PRESERVED (budget = additive 3rd top-of-loop exit before cap/empty; wipeout/miss-rate locks byte-intact; reclaim SQL/TTL untouched, lock green-on-arrival declared; both new rows append-only INFO, cascade row-derived; queue-empty path vacuously safe). No BUG.
* STEP-5 INTEGRATION: CONFIRMED all 5 (yml valid incl. schedule-path resolution; export chain verified end-to-end; budget check FIRST statement of both loops; propagation complete; test:py 264 + infra 10/10 + smoke 3/3 re-run independently green; branch clean). No BUG. DEFER→F3: default-input dispatch (12min) now yields a live 2-min budget, not disabled — fold into F3 constants.
* STEP-5 INDEPENDENT: PASS, no findings ≥80 (boundary semantics correct incl. exact-at-budget >=; finish-in-flight semantics right; OR-merges safe-defaulted; OBS1 fix confirmed in-commit). Low-conf DEFER: no test at exact elapsed==budget boundary.
* STEP 6 GREEN LIGHT: panel 3/3 PASS zero BUGs → pushing d6eb9f31. NEXT = step 7 proving slice (business hours ET, max_permits=0 chain_timeout_minutes=150, expect budget-stop ~140min ≈1,120 items, green verdict, zero orphans, time_budget_stop=1 row) then F3.
