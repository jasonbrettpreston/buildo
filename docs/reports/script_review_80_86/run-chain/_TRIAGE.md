# Triage — `scripts/run-chain.js` (Orchestrator, evaluated relative to 80-86)

**Reviewers:** Gemini · DeepSeek R1 · Claude-adversarial · Claude-observability · Claude-spec-compliance · self
**Script:** 532 lines · Specs: `docs/specs/pipeline/40_pipeline_system.md` + `41_chain_permits.md`

**Rejected CLI claims:**
- **DeepSeek UTF-8 corruption HIGH**: `StringDecoder.write()` normalizes multi-byte boundaries before returning a string; subsequent `.split('\n')` operates on valid JS string. Confirmed false positive.
- **DeepSeek `"0" === 0` type-coercion HIGH**: 80-86 scripts emit `records_new` as numeric literal, survive JSON round-trip as numbers. Confirmed false positive.

---

## List 1 — WF3 (Fix now; blocks production)

| # | Issue | Line(s) | Severity | Consensus | Fix |
|---|---|---|---|---|---|
| RC-W1 | **`pipeline_schedules` disable is chain-agnostic** — `SELECT pipeline FROM pipeline_schedules WHERE enabled=false` has no chain filter; `classify_lifecycle_phase` is in BOTH `permits` (step 21) AND `coa` (step 10); disabling it in one chain silently disables it in the other | 84–92 | CRITICAL | DeepSeek, Claude-adv, Claude-obs | Add `chain_id TEXT` column to `pipeline_schedules`; filter `WHERE enabled=false AND (chain_id IS NULL OR chain_id = $1)` |
| RC-W2 | **`compute_opportunity_scores` telemetry diff is always ~0** — manifest lists `telemetry_tables=["trade_forecasts"]` but the script only UPDATEs existing rows (no INSERT); pre/post row-count deltas are always zero; step is invisible in telemetry even on partial-failure | manifest L31 | CRITICAL | Claude-obs | Add `telemetry_null_cols.trade_forecasts=["opportunity_score"]` so null-fill rate surfaces the work; add `cost_estimates` + `lead_analytics` as read-side visibility |
| RC-W3 | **`stepVerdicts` silently drops steps without `audit_table`** — 81/82/85/86 all lack structured audit_table (SDK auto-injects `{verdict:'PASS'}` for missing); `Object.values(stepVerdicts)` sees at most 2 of 6 tail-step verdicts; chain reports `completed` when silent data-quality failures happened | 358–360, 475–484 | CRITICAL | Claude-obs | Per sibling triages, ship audit_table additions in 81/82/85/86 (WF3 items there) OR enforce in run-chain by warning when a step emits no audit_table |
| RC-W4 | **`permit_phase_transitions` missing from ALL manifest `telemetry_tables`** — written by `classify_lifecycle_phase`; appears in no manifest entry; pre-flight bloat gate never checks it; with no retention policy (84-D2) table growth is invisible | manifest + 128–131 | CRITICAL | Claude-obs, Claude-spec | Add `"permit_phase_transitions"` to `classify_lifecycle_phase.telemetry_tables` |
| RC-W5 | **`compute_cost_estimates.telemetry_null_cols` incomplete** — lists only `["estimated_cost"]`; spec 83 adds critical columns `trade_contract_values` (JSONB consumed by 81), `is_geometric_override`, `modeled_gfa_sqm`, `cost_source`; null-rate regressions invisible | manifest L27 | HIGH | Claude-spec | Add all 4 missing columns to `telemetry_null_cols.cost_estimates` |
| RC-W6 | **stderr of failed 80-86 child process is NOT captured** — `stdio: ['inherit','pipe','inherit']`; stderr goes to parent console but not saved; `pipeline_runs.error_message` only stores the generic spawn error string ("Command failed: node X"); operator has no postmortem detail | 299, 418–419, 462–464 | HIGH | Claude-adv | Change stdio to `['inherit','pipe','pipe']`; buffer stderr; prepend last 2KB of stderr to `error_message` on failure |
| RC-W7 | **No advisory lock at orchestrator level** — two simultaneous `run-chain.js permits` both create chain rows + spawn children; 4 of 6 tail scripts (81/82/85/86) have no per-script lock either; net zero concurrency protection | 25–55 | HIGH | Claude-adv, Claude-obs | Add `pg_try_advisory_lock(hashtext('chain_' + chainId))` at chain entry; exit cleanly if held |
| RC-W8 | **Final-line PIPELINE_SUMMARY without trailing newline is lost for Python scripts** — `lineBuffer` retains the final partial line; on close, it's flushed ONLY if it contains `PIPELINE_SUMMARY:` or `PIPELINE_META:` — ok for current implementation, BUT if a Python script (`aic-orchestrator.py`) uses `print(..., end='')` the regex check on L327 is still OK. Actually verify the close-handler path handles the no-newline case for final line correctly | 304–332 | HIGH | Claude-obs | Verify L327 check covers edge; add unit test for Python script emitting final line without newline |
| RC-W9 | **`records_updated` structurally wrong for 3 of 6 scripts** — 81-W5, 82-W6, 85-W6 all flag this; run-chain stores whatever child emits at L392–396 with no validation; `pipeline_runs.records_updated` for these steps systematically misleads dashboards | 392–396 | HIGH | Claude-obs + cross-script | Fix at producer side (sibling triages cover this); optionally add orchestrator-level sanity gate that warns if `records_updated > records_total` |
| RC-W10 | **Step cancellation is between-step only** — running 80-86 script cannot be interrupted mid-execution; `classify_lifecycle_phase` holds advisory lock ~130s; cancel requests ignored for that full window | 173–186 | HIGH | Claude-adv | After `spawn()`, poll cancellation in parallel with child; on cancel, `child.kill('SIGTERM')` |
| RC-W11 | **`pipeline_runs.records_meta` has no retention policy** — ~5-15KB per step × 24 steps × 365 days = ~130MB/year JSONB growth in `pipeline_runs`; no DELETE/archival/partitioning | migrations 033, 041 | HIGH | Claude-obs | Add daily "truncate pipeline_runs older than 90 days" step OR add partitioning by started_at |
| RC-W12 | **Skip status conflates two distinct reasons** — `status='skipped'` used for both "disabled via pipeline_schedules" (L194) and "gate-skip due to 0 new records" (L223); downstream observability can't distinguish | 189–202, 219–232 | MEDIUM | Claude-spec | Add `skipped_reason` column or encode in `records_meta` (e.g., `{reason: 'disabled'}` vs `{reason: 'gate_skip'}`) |
| RC-W13 | **Gate-skip error message pollutes `error_message`** — on clean gate-skip, `chainError = '0 new records — downstream steps skipped'` stored in `error_message`; alerting queries filtering `WHERE error_message IS NOT NULL` false-positive on no-ingest days | 486–490 | MEDIUM | Claude-spec | Use a separate `skipped_reason` column OR set `error_message = NULL` and encode skip reason in status |
| RC-W14 | **Pre-flight bloat thresholds hardcoded** — `BLOAT_WARN=0.30`, `BLOAT_ABORT=0.50` not in `logic_variables`; spec 86 Control Panel pattern says thresholds should be tunable | 121–122 | MEDIUM | Claude-spec, Gemini | Promote to `logic_variables.bloat_warn_threshold` / `bloat_abort_threshold` |
| RC-W15 | **Dead manifest entry: `compute_timing_calibration` (v1)** — v1 still registered in manifest but in no chain; dead-code scanner noise, operator confusion | manifest | MEDIUM | Claude-obs | Remove v1 entry from manifest |
| RC-W16 | **Duplicate PIPELINE_SUMMARY/META parsing code** — success path L343–383 and failure path L420–456 are near-identical | 343–383 + 420–456 | MEDIUM | Gemini | Extract `parseOutput(summaryLines, preTelemetry)` helper returning `{recordsTotal, recordsNew, recordsUpdated, recordsMeta}`; call from both branches |
| RC-W17 | **Structured per-step metric enforcement absent** — orchestrator has no mechanism to assert required metrics are present; a script silently omitting audit_table produces PIPELINE_SUMMARY indistinguishable from healthy | 343–360 | MEDIUM | Claude-obs | Add required-metric map per slug in manifest; orchestrator warns if required metric absent |
| RC-W18 | **Pre-flight bloat pct stored as formatted string** — `(ratio*100).toFixed(1) + '%'`; downstream dashboards must re-parse | 142–146 | LOW | Gemini | Store raw `ratio` as float + separate `unit: '%'`; let UI format |
| RC-W19 | **`pipeline_runs.status` has no CHECK constraint** — run-chain writes 7 values (running/completed/failed/cancelled/skipped/completed_with_errors/completed_with_warnings); typo in a new path would insert invalid status silently | migrations/033 | LOW | Claude-obs | Add CHECK constraint in new migration |
| RC-W20 | **`--force` is orchestrator-only, not propagated to children** — operator expectation might be "force everything"; 83/84 have advisory locks and will fail with "lock held" on force-rerun if prior run is still live; confusing during recovery | 60, 293 | LOW | Claude-adv | Document `--force` semantics clearly in spec 40; optionally propagate when `scriptEntry.supports_force` is set |

---

## List 2 — Defer (valuable but not blocking)

| # | Issue | Line(s) | Source |
|---|---|---|---|
| RC-D1 | `compute_trade_forecasts.telemetry_null_cols` missing — null-fill rate for `predicted_start`, `urgency`, `target_window` not captured | manifest L30 | Claude-spec |
| RC-D2 | `update_tracked_projects.telemetry_null_cols` missing — null-fill rate on `lifecycle_stalled` transitions invisible | manifest L32 | self |
| RC-D3 | classify_lifecycle_phase.telemetry_tables missing `permit_phase_transitions` (covered by RC-W4) | manifest L48 | Claude-spec |
| RC-D4 | Synchronous `fs.readFileSync` of manifest — startup delay on large manifests | 31–33 | DeepSeek |
| RC-D5 | `prevChainFailed` race when two chains run concurrently — RC-W7 resolves this | 101–115 | DeepSeek |
| RC-D6 | `fs.existsSync` race on `scriptPath` before spawn | 248 | DeepSeek |
| RC-D7 | `setTimeout(() => process.exit(1), 500)` hardcoded grace period | 531 | DeepSeek |
| RC-D8 | PIPELINE_SUMMARY/META regex matches substring anywhere on line (not anchored) — `line.includes('PIPELINE_SUMMARY:')` | 317, 327 | DeepSeek |
| RC-D9 | External `chainRunId` not validated (could update wrong row) | 66–68 | DeepSeek |
| RC-D10 | Chain-level records_meta uses PG `||` shallow merge — safe today; worth noting | 502 | Gemini |
| RC-D11 | `classify_lifecycle_phase` runs on no-ingest days (full 237K scan) with no incremental watermark — expensive | 213–218 | Claude-obs |
| RC-D12 | No retry semantics spec'd — chain halts on failure; operator must re-run from scratch; 80-86 are idempotent so safe | 468–469 | Claude-spec |
| RC-D13 | Pre-flight bloat gate as warn-only may miss catastrophic cases — monitor or escalate | 161–166 | self |

---

## List 3 — Spec Updates Needed

| # | Spec change | Spec | Why |
|---|---|---|---|
| RC-S1 | Define `pipeline_runs.status` enum with all 7 values: `running`, `completed`, `failed`, `cancelled`, `skipped`, `completed_with_errors`, `completed_with_warnings` | 40 | RC-W19; current spec only names 5 |
| RC-S2 | Specify `pipeline_schedules` global-vs-per-chain disable semantics (currently global-by-default with no spec) | 40 | RC-W1; add `chain_id` design |
| RC-S3 | Specify retry/resume policy — is chain restartable from failed step or always from step 1? | 40/41 | RC-D12 |
| RC-S4 | Declare `audit_table` emission policy — spec 40 §5 says "quality scripts only", but 80-86 compute scripts also benefit; spec should state whether compute/classify scripts are REQUIRED or OPTIONAL to emit | 40 / 80-86 | RC-W3; 81/82/85/86 currently inconsistent |
| RC-S5 | Specify orchestrator-level advisory lock policy — are concurrent chain runs permitted? | 40/41 | RC-W7 |
| RC-S6 | Document `--force` semantics (orchestrator-only, no child propagation) | 40 | RC-W20 |
| RC-S7 | Define `pipeline_runs` retention policy (age-out / archive / partition strategy) | 40 | RC-W11 |
| RC-S8 | Require per-script `telemetry_null_cols` for all output columns that downstream consumers depend on — define the contract | 40 | RC-W2, RC-W5 |
| RC-S9 | Specify skip-status disambiguation: `disabled` vs `gate_skipped` as distinct `status` values OR via `skipped_reason` field | 40 | RC-W12 |
| RC-S10 | Declare `gate-skip` vs `error` in chain rollup — gate-skipped chains should not populate `error_message` | 40 | RC-W13 |
| RC-S11 | Promote Pre-Flight bloat thresholds (30%/50%) to `logic_variables` via spec 86 Control Panel | 86 | RC-W14 |
| RC-S12 | Reconcile bloat thresholds: assert-engine-health uses `dead_tuple_ratio > 10%` (FAIL); pre-flight uses 30%/50% (warn-only). Two thresholds may confuse operators; spec should declare which is authoritative where | 41 | Claude-spec §H |
| RC-S13 | Require structured stderr capture for failed pipeline children; spec the `error_message` content format | 40 | RC-W6 |
| RC-S14 | Require cancellation-signal propagation to running children (SIGTERM) and document scripts' expected SIGTERM handling | 40/41 | RC-W10 |
| RC-S15 | Spec 41: declare that `compute_timing_calibration_v2` must read from `permit_phase_transitions` (per spec 84 intent) OR declare that `permit_phase_transitions` is OBSERVABILITY-ONLY and has no calibration consumer | 41 + 84 + 86 | Cross-cutting; see 86-W6 / 84-W4 |

---

## Verdict

**Orchestrator is structurally sound** for 80-86 but has four CRITICAL observability bugs that let real failures go undetected: (1) `pipeline_schedules` global-disable can silently skip a step in the wrong chain (RC-W1); (2) `compute_opportunity_scores` telemetry delta is always zero — no data-quality signal (RC-W2); (3) 4 of 6 tail-step verdicts never aggregate into chain health (RC-W3); (4) `permit_phase_transitions` bloat is invisible (RC-W4). Plus 3 HIGHs around stderr capture, orchestrator-level advisory locking, and records_meta retention. 20 WF3 items, 13 defer items, 15 spec updates. DeepSeek's UTF-8 + type-coercion CRITICALs rejected as false positives.
