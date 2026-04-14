# Triage — `scripts/classify-lifecycle-phase.js` (Spec 84)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-compliance · self
**Script:** 788 lines · Spec: `docs/specs/product/future/84_lifecycle_phase_engine.md`

**Rejected claim:** DeepSeek's "CRITICAL lock leak / double-release" at L154–168 is a **false positive** — confirmed independently by Claude-adv and Claude-spec. The early-return path correctly releases the client exactly once (L187) before `return`; the outer `try/finally` (L772–787) only runs when the outer `try` at L195 was entered (i.e., when the lock was acquired). No double-release, no unlock-of-unacquired.

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Consensus | Fix |
|---|---|---|---|---|---|
| 84-W1 | **Orphan phases `O1/O2/O3` missing from `PHASE_ORDINAL`** (`scripts/lib/lifecycle-phase.js` L474–481) — downstream `update-tracked-projects.js` L96–104 returns `undefined` ordinal for orphan permits → `isWindowClosed=false` forever → orphan permits never auto-archive; contract break between producer and consumer | lifecycle-phase.js 474–481 + update-tracked-projects.js 29, 96–104 | CRITICAL | Claude-adv, Claude-spec | Add O1/O2/O3 entries to `PHASE_ORDINAL`, OR add them to `TERMINAL_PHASES` in `update-tracked-projects.js`, OR explicit orphan-handling branch in `isWindowClosed` |
| 84-W2 | **O2↔O3 transition suppression is spec-incorrect** — spec §3.6 defines O3 as a distinct stall event (>180d no activity) that is meaningful for the calibration engine; `TIME_BUCKET_GROUPS` at L391–402 incorrectly treats it as time-bucketed noise; also code comment at L388 contradicts spec O2 definition ("Orphan Done" vs "Orphan Active") | 388–402 | HIGH | DeepSeek, Claude-spec | Remove O2/O3 from `TIME_BUCKET_GROUPS`; keep P7a/P7b/P7c suppression (that is correct); fix the misleading comment |
| 84-W3 | **Phase 2c initial-transition backfill is an unbounded INSERT outside a transaction** — can write up to 237K rows in one statement via `pool.query` (not `withTransaction`, no chunking); crash mid-insert leaves partial commit; §9.1 violation | 591–605 | HIGH | Claude-adv | Chunk into batches of 5000 inside `pipeline.withTransaction`; or use `INSERT … ON CONFLICT DO NOTHING` with explicit idempotency |
| 84-W4 | **`permit_phase_transitions.neighbourhood_id` is a DEAD WRITE** — the advertised consumer `compute-timing-calibration-v2.js` does NOT read `permit_phase_transitions` at all (reads `permit_inspections` directly); writing/indexing the column is waste until a consumer is added | 430 + migration 086 | HIGH | Claude-spec | Decide: wire calibration v2 to read transitions (intended design per spec), OR drop the column + index until needed |
| 84-W5 | **Stall threshold magic numbers not from `logic_variables`** — spec §4 implies single tunable `stall_threshold_days` (default 180); code hardcodes 730d (permit issued stall) AND 180d (inspection stall) in `scripts/lib/lifecycle-phase.js` L223, L228 | lifecycle-phase.js 223, 228 | HIGH | Claude-spec | Load from `logic_variables` (add `permit_issued_stall_days=730`, reuse existing `stall_threshold_days=180`) via `loadMarketplaceConfigs`; match `COA_STALL_THRESHOLD_DAYS` pattern already done here at L146–147 |
| 84-W6 | **Wrong SPEC LINK in 3 files** — `classify-lifecycle-phase.js` L19, `lifecycle-phase.js` L1, `compute-trade-forecasts.js` L10 all point to `docs/reports/lifecycle_phase_implementation.md` (a report, not the spec) | 19 + 3 files | HIGH | All reviewers | Update all three to `docs/specs/product/future/84_lifecycle_phase_engine.md` |
| 84-W7 | **`unclassified_count` threshold 100 is hardcoded** — scale-independent CQA gate that throws and blocks pipeline; spec §4 flags intent to move thresholds to config; at 10M permits, 100 unclassified = 0.001% (gate passes a real regression) | 687, 767, 769 | MEDIUM | Claude-adv, Claude-obs, Claude-spec | Add `unclassified_threshold` to `logic_variables` (seed 100); consume via `loadMarketplaceConfigs`; or use % of total |
| 84-W8 | **CoA `days_since_activity` uses `GREATEST(0, …)`** — masks negative values (future `last_seen_at` from timezone/data corruption) as 0, silently marking corrupt rows as "active not stalled" | 481–484 | MEDIUM | DeepSeek | Remove `GREATEST`; let negatives propagate; classifier handles NaN/null explicitly |
| 84-W9 | **Inline SQL `regexp_replace` duplicates `normalizeCoaDecision` lib logic** — §7.1 dual-code-path drift; if library normalization changes (strip new char), inline SQL silently misaligns → false positive/negative unclassified counts | 669–673 | MEDIUM | Gemini, DeepSeek, Claude-adv | Either (a) write a SQL `normalize_coa_decision(text)` immutable function consumed by both, or (b) document the sync requirement and add a test that asserts JS+SQL produce identical output on a fixture set |
| 84-W10 | **`O4` is a phantom phase** — listed in `VALID_PHASES` (lifecycle-phase.js L106) and defensively handled in `compute-trade-forecasts.js` L29 but no classifier rule produces it; spec 84 has no O4 | lifecycle-phase.js 106 | MEDIUM | Claude-adv | Remove O4 from VALID_PHASES; remove defensive handlers downstream |
| 84-W11 | **P3–P5 phase IDs have DUAL MEANING** — spec §3.1 uses P3/P4/P5 for the CoA block (Approved / Final / Zoning Review); code reuses the same IDs for BLD-led permit intake (INTAKE_P3_SET / REVIEW_P4_SET / HOLD_P5_SET); any dashboard label, export, or admin filter using the spec numbering will show wrong labels | spec §3.1 vs lifecycle-phase.js INTAKE_P3_SET | MEDIUM | Claude-spec | Either (a) renumber permit-intake phases to avoid collision (e.g., I3/I4/I5), or (b) spec-declare that the ID space is shared and `lifecycle_path` ('coa' vs 'permit') disambiguates |
| 84-W12 | **Redundant `classified_at` UPDATE per batch** — step (a) UPDATE already writes `lifecycle_classified_at = NOW()` on rows it changes; step (c) UPDATE (L446–455) re-writes it for the SAME rows; 484 batches × extra query × extra WAL | 446–455 | LOW | Gemini | Use `RETURNING` from step (a) to capture which permits updated; run step (c) only for the complement (phase-unchanged rows) |
| 84-W13 | **BLD/CMB map loads all permits unconditionally** — L244–247 selects every BLD/CMB permit even on incremental runs where only a small set of prefixes is needed | 244–263 | LOW | Gemini | Collect unique prefixes from `dirtyPermits` first; then `WHERE split_part(…) IN (…) AND prefix = ANY($1)` |

---

## List 2 — Defer (valuable but not blocking)

| # | Issue | Line(s) | Source |
|---|---|---|---|
| 84-D1 | Admin UI has ZERO exposure to `permit_phase_transitions` ledger — no API route, no dashboard tile; audit summary only shows scalar `phase_transitions_logged` count | migration 086 | Claude-obs |
| 84-D2 | Transition table has no retention policy, no partitioning, no archival — breaks around 2–5M rows | migration 086 | Claude-obs |
| 84-D3 | `PIPELINE_SUMMARY` missing per-pair transition breakdown (e.g., `P7a→P7b: 0, P11→P12: 42`) — hides classifier regressions behind a scalar count | 720 | Claude-obs |
| 84-D4 | `PIPELINE_SUMMARY` missing `stalled_by_phase` breakdown — sudden P11 stall spike (framing frozen) looks identical to P7c stall spike | 638–641 | Claude-obs |
| 84-D5 | `PIPELINE_SUMMARY` missing phase-distribution delta vs prior run — cannot detect "5K permits demoted P11 → P7c" silently | 617–636 | Claude-obs |
| 84-D6 | `permits_updated` naming is ambiguous (phase-or-stalled changed vs classified_at stamped) — consider `permits_phase_changed` | 720 | Claude-obs |
| 84-D7 | Phase 2b correlated subquery on `permit_inspections` per permit runs once on first-run backfill but no progress log | 547–572 | Claude-obs |
| 84-D8 | CoA path has no equivalent transition logging table — future CoA→permit timing calibration will lack historical data | 506–531 | Claude-obs |
| 84-D9 | Watermark race allows stale classification to persist for up to 24h and introduces timestamp drift in calibration data | 213–224 | Claude-adv, Claude-obs |
| 84-D10 | §3.2 unbounded SELECT on permits (L227), BLD/CMB map (L244), inspection rollup (L271) — intentional for in-memory Map-based orphan detection, but worth documenting as a compliance exemption | 227, 244, 271 | Gemini, DeepSeek |
| 84-D11 | Orphan-detection loop is verbose — simplify with `siblings.size === 1 && siblings.has(row.permit_num)` | 313–328 | Gemini |
| 84-D12 | `try-catch` around lock acquisition is defensive belt-and-suspenders — if `pg_try_advisory_lock` fails the connection is probably broken anyway | 162–193 | DeepSeek |
| 84-D13 | `records_total` counts dirty permits + dirty CoAs but not the Phase 2b/2c backfill rows — minor denominator question | 715 | self |

---

## List 3 — Spec 84 Updates Needed

| # | Spec change | Why |
|---|---|---|
| 84-S1 | Fix SPEC LINK across all 3 dependent files — canonical path is `docs/specs/product/future/84_lifecycle_phase_engine.md` | 84-W6 |
| 84-S2 | Document the `TIME_BUCKET_GROUPS` suppression policy — what transitions are intentionally NOT logged (P7a/b/c sub-phases) and why | 84-W2 partial rationale |
| 84-S3 | Clarify O2 vs O3 semantics — spec §3.6 says O2="Orphan Done"; code comment says O2="orphan active" → these conflict. Pick one intended meaning and align both spec + comment | 84-W2 |
| 84-S4 | Define CoA stall semantics including negative `days_since_activity` (future dates) handling | 84-W8 |
| 84-S5 | Document dual-path normalization rule — if SQL `regexp_replace` must mirror `normalizeCoaDecision`, state it as a §7 constraint | 84-W9 |
| 84-S6 | Remove `O4` from spec (it isn't there, but confirm in `VALID_PHASES`) and remove phantom references in downstream code | 84-W10 |
| 84-S7 | Resolve P3–P5 dual meaning — either renumber permit-intake phases or spec-declare that `lifecycle_path` disambiguates | 84-W11 |
| 84-S8 | Document Phase 2b backfill heuristics (P3-P6→application_date, P7*/P8/P18→issued_date, P9-P17→latest Passed inspection, P19/P20→last_seen_at, O1-O3→application_date) — this installs a permanent anchor history with no spec backing | 84-W / Claude-spec §B |
| 84-S9 | Document Phase 2c initial-transition backfill rule (gives calibration day-1 baseline) | 84-D / Claude-spec §B |
| 84-S10 | Specify `stall_threshold_days` tunability — one or two thresholds (permit-issued 730d vs inspection 180d) — sourced from `logic_variables` | 84-W5 |
| 84-S11 | Specify `unclassified_threshold` — absolute 100 vs percentage of total | 84-W7 |
| 84-S12 | Specify how orphan phases O1/O2/O3 are handled in the downstream `tracked_projects` archive policy (terminal? ordinal? custom branch?) — currently contract-broken | 84-W1 |
| 84-S13 | Specify intended consumer of `permit_phase_transitions.neighbourhood_id` — calibration v2 doesn't read this; either wire a consumer or drop the column | 84-W4 |
| 84-S14 | Declare that the unbounded SELECTs (L227, L244, L271) are an intentional compliance exemption for the in-memory orphan-detection algorithm, OR specify a streaming variant | 84-D10 |
| 84-S15 | Require CoA-side transition logging (symmetric with permit side) if CoA phases enter the calibration dataset | 84-D8 |

---

## Verdict

**Script is well-engineered** — advisory-lock safety is solid, per-batch transactions avoid lock-holding, SPEC LINK+config drift are the only structural hygiene issues. Main production risk is the **upstream/downstream contract break** on orphan phases (84-W1): producer writes O1/O2/O3 but consumer has no ordinal for them, silently stuck tracked leads. Also: 84-W2 suppression of real state-change event (O2→O3) corrupts calibration input; 84-W3 unchunked 237K-row backfill INSERT. 13 WF3, 13 defer, 15 spec updates. DeepSeek's "CRITICAL lock leak" is rejected as a false positive (independently verified twice).
