# Queued Task: Spec 48 Observability Loop Closure (A–F)
**Status:** Planning — queued behind active Google Auth WF3 Verification
**Workflow:** WF2 — Feature Enhancement
**Domain Mode:** Backend/Pipeline (`scripts/`, `migrations/`, plus docs/specs/) — read `scripts/CLAUDE.md` ✓ + `docs/specs/00_engineering_standards.md` (§2, §3, §6, §9, §10) ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (§R1–R12) ✓ + `docs/specs/01-pipeline/30_pipeline_architecture.md` ✓ + `docs/specs/01-pipeline/48_pipeline_observability.md` ✓ + `docs/specs/00-architecture/05_knowledge_operating_model.md` ✓.

---

## Context

* **Goal:** Close the Spec 48 observer's feedback loop. Today `observe-chain.js` is a high-quality automated sensor that emits findings to per-chain markdown logs but has no routing, deduplication, recurrence detection, or human-loop escalation — a textbook "lesson dies in audit report" anti-pattern per Spec 05 §7. Improvements A–F apply six concrete fixes, each ranked by leverage, that turn the observer into a proper sensor → router → durable-destination pipeline.

* **Target Specs:**
  - `docs/specs/00-architecture/05_knowledge_operating_model.md` — add observer to §3 artifact map + §6 cadences + amend §7 anti-pattern.
  - `docs/specs/01-pipeline/48_pipeline_observability.md` — extensive amendment (new §3.6/§3.7/§3.8 + §3.9 sidecar + new §7 weekly digest + §5 testing additions + §6 boundaries).
  - `docs/specs/00-architecture/01_database_schema.md` — register two new tables.
  - System-map regenerate after spec edits.

* **Key Files:**
  - `scripts/observe-chain.js` — extended for hashing, persistence, severity-tiered routing, sidecar JSONL, pinned-baseline support.
  - `scripts/observe-week.js` — NEW. Weekly digest reading `pipeline_observer_findings`.
  - `scripts/local-cron.js` (or equivalent) — schedule the weekly script to fire ~14:00 UTC Friday (4–6h before the existing deferred-queue triage at 20:00 UTC Friday so its findings can flow into `review_followups.md` before triage runs).
  - `migrations/117_pipeline_observer_findings.sql` (UP + DOWN) — `pipeline_observer_findings` + `pipeline_baselines` tables.
  - `scripts/lib/observer-findings.js` — NEW shared library (dedup hash, upsert, occurrence increment) — must be pure functions where possible per Spec 47 §R8.
  - `mobile/__tests__/` — N/A (this is backend; tests live in `src/tests/`).
  - `src/tests/pipeline-observer.findings.logic.test.ts` — NEW (hash determinism, occurrence increment).
  - `src/tests/pipeline-observer.routing.infra.test.ts` — NEW (CRITICAL → `.cursor/deferred_task_observer_<slug>.md` + `review_followups.md` append + Sentry emission stub).
  - `src/tests/observe-week.logic.test.ts` — NEW (weekly aggregation: chronic vs acute, pinned baseline override, fix-vs-killed ratio).
  - `docs/reports/pipeline-observability/<chain>-followup.md` — markdown format gains an "occurrence_count" column + "first_seen" column.
  - `docs/reports/pipeline-observability/<chain>-findings.jsonl` — NEW sidecar (one JSON line per finding emission).
  - `docs/reports/pipeline-observability/weekly-digest.md` — NEW append-only weekly summary.

---

## Technical Implementation

### Improvement A — Auto-promote CRITICAL findings to durable destinations
- Each CRITICAL finding produced by `observe-chain.js` writes:
  1. A planning-note file `.cursor/deferred_task_observer_<chain>_<step>_<hash8>.md` in the same shape as the WF3 filer routine I built earlier (Bug / Reproduction Test / Fix Sketch / WF3 Execution Checklist / Cross-references).
  2. A new row appended to `docs/reports/review_followups.md` under a heading `## Pipeline Observer Findings (auto-routed)` with structured frontmatter (severity, finding_hash, chain_id, step_name, first_seen_run_id, occurrence_count, source_finding_file).
- HIGH findings: only the `review_followups.md` append (no planning note — they're not WF3-tier).
- INFO findings: only the per-chain markdown + sidecar (no escalation).

### Improvement B — Recurrence detection (finding hashing)
- `scripts/lib/observer-findings.js` exports `computeFindingHash({ chain_id, step_name, severity, signature })` — SHA-256 truncated to 16 hex chars.
- Per emission: upsert `pipeline_observer_findings` ON CONFLICT (finding_hash) DO UPDATE SET last_seen_run_id, last_seen_at, occurrence_count = occurrence_count + 1.
- `signature` is a normalized form of the finding text — strips run-specific values (run_id, timestamps, exact metric numbers within ±5%) so the same anomaly across runs hashes identically. Implementation: replace digit runs longer than 4 with `<N>`, replace ISO timestamps with `<TS>`, lowercase, trim.
- Markdown output annotates: `(first seen run #NNN, occurrence_count: K)` — operators see at a glance whether a finding is new (acute) or chronic (count ≥ 5).
- A finding becomes CHRONIC at occurrence_count ≥ 5; chronic-CRITICAL escalates differently (separate Sentry tag `chronic: true`).

### Improvement C — Anchor baseline alongside rolling 7-day
- New table `pipeline_baselines(id PK, chain_id, step_name, metric_name, baseline_value NUMERIC, baseline_kind TEXT CHECK in ('pinned','median_30d'), set_at, set_by TEXT, expires_at TIMESTAMPTZ NULL, notes TEXT)` — UNIQUE (chain_id, step_name, metric_name).
- `observe-chain.js` queries baselines per (chain, step, metric); if a pinned baseline exists and `expires_at IS NULL OR expires_at > NOW()`, use it instead of the rolling 7-day. Otherwise fall back to current behavior.
- Pinning is manual (no UI in this WF2): operators run `node scripts/observer-pin-baseline.js --chain=permits --step=load_permits --metric=duration_ms --value=4500 --notes="post-114 normal"`. New helper script with its own §R1–R12 skeleton.
- Slow-drift detection: if rolling 7-day diverges from pinned by >25% for 3 consecutive runs, emit an INFO finding "baseline drift detected" so an operator can decide to re-pin or investigate.

### Improvement D — Weekly digest (`observe-week.js`)
- New Observer-archetype script with advisory lock `11399` (reserved high in Spec 48's 113-base range).
- Cron: `0 14 * * 5` UTC (Fri 14:00 UTC = 10:00 EDT) — runs ~6h before the existing deferred-queue triage.
- Reads `pipeline_observer_findings` for `last_seen_at >= NOW() - INTERVAL '7 days'` AND `status = 'active'`.
- Single DeepSeek call (model `deepseek-chat`, timeout 30s) consolidating: per-chain trend (acute/chronic counts, severity histogram, top 5 chronic findings, pinned-baseline drifts, fix-vs-killed ratio over the window).
- Output: appends a section to `docs/reports/pipeline-observability/weekly-digest.md`.
- Also touches `review_followups.md` with one summary entry under the same auto-routed heading: "Weekly digest YYYY-MM-DD — N CRITICAL active, M HIGH active, K chronic."
- Spec 47 §R10 PIPELINE_SUMMARY: Observer archetype (records_total/new/updated all `null`); audit_table.rows reflect counts.

### Improvement E — Severity-tiered routing
- Implemented inside Improvement A's emission step. Concrete decision table:

  | Severity | Per-chain markdown | Sidecar JSONL | Findings table | Planning note | review_followups.md | Sentry |
  |---|:-:|:-:|:-:|:-:|:-:|:-:|
  | CRITICAL | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
  | HIGH     | ✓ | ✓ | ✓ |   | ✓ |   |
  | INFO     | ✓ | ✓ | ✓ |   |   |   |

- Sentry emission: use `logError(tag='observer', err, { finding_hash, chain_id, severity })` per Engineering Standards §6.1 (logError mandate). Even though `scripts/` traditionally uses `pipeline.log`, CRITICAL observer findings are exactly the case for cross-system observability — pipeline.log writes locally; logError → Sentry escalates.
- Every CRITICAL emission MUST be deduplicated by finding_hash within the same run — no double-firing if the same anomaly trips two metrics.

### Improvement F — Structured sidecar (`*-findings.jsonl`)
- One JSON line per emission, regardless of severity, in `docs/reports/pipeline-observability/<chain>-findings.jsonl`:
  ```json
  {"timestamp":"<ISO>","run_id":NNN,"chain_id":"permits","step_name":"load_permits","severity":"HIGH","finding_hash":"abc1234567890abc","occurrence_count":3,"signature":"<normalized text>","raw_text":"<original DeepSeek output>","baseline_kind":"rolling_7d","baseline_value":4123.5,"observed_value":5104.2}
  ```
- File grows append-only. Future `harvest-commits.mjs` (Spec 05 §5 referenced as deferred until proven) parses these inline rather than the markdown.
- No rotation in this WF2 (acceptable pre-cadence-proven); add a follow-up to `review_followups.md` for log rotation once the file exceeds N MB.

### Database Impact: YES
- New migration `migrations/117_pipeline_observer_findings.sql` (UP + DOWN). Both tables empty at creation — no backfill.
- Indices:
  - `pipeline_observer_findings(finding_hash)` UNIQUE
  - `pipeline_observer_findings(chain_id, status)` (active-finding queries)
  - `pipeline_observer_findings(last_seen_at DESC)` (weekly digest window)
  - `pipeline_baselines(chain_id, step_name, metric_name)` UNIQUE
- Per Engineering Standards §3.1 zero-downtime: tables are NEW (no `ALTER`), so Add-Backfill-Drop pattern is N/A.
- `npm run db:generate` after migration to refresh Drizzle types.

---

## Standards Compliance

* **Try-Catch Boundary (§2.2):** Observer scripts write to local FS only (no API routes added). Existing top-level try-catch in `observe-chain.js` preserved; new `observe-week.js` follows the same pattern. Each new helper function returns Promises that bubble — caller handles via the script-level catch. No new API routes; if the user later adds a route to surface findings in the admin panel, that's a separate Cross-Domain WF.
* **Unhappy Path Tests (§2.1):** New tests assert: (a) `computeFindingHash` is deterministic for equivalent signatures and distinct for different ones; (b) `upsert` increments occurrence_count on duplicate hash; (c) CRITICAL finding emission writes the planning note + appends to `review_followups.md` AND tolerates a writeable-FS failure (logs, doesn't throw); (d) Sentry escalation is best-effort (mocked in tests); (e) weekly digest with zero findings produces a "CLEAN" section, not crash.
* **logError Mandate (§6.1):** `scripts/` traditionally uses `pipeline.log.warn/error` (per scripts/CLAUDE.md absolute rules). CRITICAL observer escalation is the documented exception — uses `logError` from `src/lib/logger.ts` so Sentry receives the alert. This is a standards-evolution point that the Spec 48 amendment must call out.
* **Pipeline Safety §9.1 Transaction Boundaries:** Findings table writes are single-row upserts; no multi-row transaction needed. Baseline reads are SELECT-only. Tests confirm. **§9.2 Param limit:** N/A — no batch inserts in this WF2.
* **§9.3 Idempotency:** Re-running `observe-chain.js` for the same run_id MUST be safe. UPSERT ON CONFLICT (finding_hash) handles dedup; planning-note write checks `if file already exists, append a new "Re-observed" line, do NOT overwrite`; `review_followups.md` append checks for existing line with same finding_hash and skips if present.
* **§7 Dual Code Path:** N/A — observer logic exists only in `observe-chain.js` + the new shared lib.
* **UI Layout:** N/A.
* **Spec 48 advisory lock allocation:** `observe-week.js` claims `11399` (Spec 48's 113-base range high slot). Documented in §A.5 of Spec 47 via the spec amendment.
* **Spec 47 §R10 Observer archetype:** Both scripts emit `PIPELINE_SUMMARY` with `records_total/new/updated = null` per archetype.
* **Spec 47 §R5 startup guard:** Both scripts validate `DEEPSEEK_API_KEY` early; gracefully degrade if absent (write placeholder; do not throw — observer must never block the pipeline).

---

## Execution Plan (WF2 verbatim)

- [ ] **State Verification:** Confirm current `observe-chain.js` shape (lock 113, chain-scoped 113×100+offset, DeepSeek + pg_stat_statements + 7-day baseline). Confirm `local-cron.js` exists and is the right scheduling host (alternative: register weekly script with the existing remote-routine pattern). Confirm next migration number is 117.
- [ ] **Contract Definition:** Define the JSONL sidecar schema (frozen — future-proof against rotation). Define the `review_followups.md` auto-routed entry frontmatter. Define the planning-note filename convention `deferred_task_observer_<chain>_<step>_<hash8>.md` (8-char hash suffix for collision resistance).
- [ ] **Spec Update:**
  1. Spec 05 §3 artifact map + §6 cadences + §7 anti-pattern amendment (the diff already proposed earlier in this session).
  2. Spec 48 substantial amendment:
     - §2.1 component topology — diagram update showing findings table + sidecar + planning notes + review_followups.md edge.
     - §2.4 trigger — add `observe-week.js` with cron schedule.
     - New §3.6 Findings persistence (table schema + dedup hash + upsert).
     - New §3.7 Severity-tiered routing (the decision table above).
     - New §3.8 Pinned baseline (table schema + drift detection).
     - New §3.9 Sidecar JSONL contract.
     - §3.3 Output format — markdown gets occurrence_count column.
     - New §7 Weekly digest (`observe-week.js`).
     - §5 Testing — add the 3 new test files.
     - §6 Operating Boundaries — extend Target Files.
  3. Spec 47 §A.5 — register lock 11399 to `observe-week.js`.
  4. `docs/specs/00-architecture/01_database_schema.md` — register the 2 new tables.
  5. `npm run system-map` to regenerate.
- [ ] **Schema Evolution:** Write `migrations/117_pipeline_observer_findings.sql` (UP creating both tables + indices; DOWN reversing; per Spec 47 conventions). Run `npm run migrate` locally. Run `npm run db:generate` for Drizzle types. Run `npm run typecheck` — must remain 0 errors.
- [ ] **Guardrail Test:** Create the 3 new test files. Each starts with the failing test that pins the contract.
- [ ] **Red Light:** `npx vitest run src/tests/pipeline-observer.findings.logic.test.ts src/tests/pipeline-observer.routing.infra.test.ts src/tests/observe-week.logic.test.ts` — must all fail.
- [ ] **Implementation:**
  1. `scripts/lib/observer-findings.js` — pure helpers (`computeFindingHash`, `normalizeSignature`, `severityRouting`).
  2. `scripts/observe-chain.js` extension — wire in upsert, sidecar emission, severity-tiered routing, pinned-baseline lookup.
  3. `scripts/observer-pin-baseline.js` — new helper script (per §R1–R12) for manual baseline pinning.
  4. `scripts/observe-week.js` — new weekly digest script (per §R1–R12, Observer archetype, lock 11399).
  5. `scripts/local-cron.js` (or equivalent registration) — add the weekly entry `0 14 * * 5`.
- [ ] **UI Regression Check:** N/A — no UI changes.
- [ ] **Pre-Review Self-Checklist:** 8 self-skeptical items (sample):
  1. Does dedup hash survive metric-value drift in the same anomaly? (Test with two runs differing only in numeric metrics.)
  2. Does the planning-note write tolerate a missing `.cursor/` directory? (Create on demand.)
  3. Does `review_followups.md` append handle a missing target heading? (Create on demand.)
  4. Does the pinned baseline expiration honor `NULL` (means "never")?
  5. Does drift detection avoid re-firing every run? (3-consecutive-run guard.)
  6. Is the JSONL sidecar valid newline-delimited JSON (each line a complete object, no trailing comma)?
  7. Does CRITICAL Sentry emission survive `SENTRY_DSN` absent in dev?
  8. Does `observe-week.js` produce CLEAN output for an empty findings window?
- [ ] **Multi-Agent Review:** ONE message, three parallel calls (per scripts/CLAUDE.md):
  - `npm run review:gemini -- review scripts/observe-chain.js --context docs/specs/01-pipeline/48_pipeline_observability.md`
  - `npm run review:deepseek -- review scripts/observe-chain.js --context docs/specs/01-pipeline/48_pipeline_observability.md`
  - Agent (`feature-dev:code-reviewer`, `isolation: "worktree"`): provide spec path + modified files list + summary.
  - Triage: BUG → fix before Green Light. DEFER → `review_followups.md`.
- [ ] **Green Light:** `npm run test && npm run typecheck && npm run lint -- --fix && npm run dead-code`. All must be clean. Run `node scripts/observe-chain.js permits <recent_run_id>` against the dev DB to confirm end-to-end. Run `node scripts/observe-week.js` to confirm digest writes correctly. Paste evidence. → WF6.

---

## Lesson-Routing per Spec 05 §4

This WF2's findings (when filed) route as follows:
- The Spec 48 architectural changes themselves → **spec:48_pipeline_observability + spec:05_knowledge_operating_model + lessons** (any non-obvious decisions about hash normalization or routing thresholds land in `tasks/lessons.md`).
- Future observer findings emitted by the upgraded code → routing destination per Improvement E table above; the loop is now closed.

---

## Pre-requisite User Decisions (small)

1. **Scheduling host for `observe-week.js`:** local cron (`scripts/local-cron.js`) vs Anthropic-Cloud remote routine. Recommend local cron since the script makes its own DeepSeek call (no Claude needed) and runs against the dev DB locally — cheaper and no claude.ai token cost. The user can override.
2. **Pinned baseline ownership:** Pinning a baseline is a manual decision ("this is the new normal"). Operator-only or also developer-owned? Recommend operator-only via the helper script + git-committed change to `pipeline_baselines` for auditability. Could later add an admin UI; out of scope for this WF2.

Both decisions can be made at PLAN LOCK time.

---

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> Notes:
> - Promote this file to `.cursor/active_task.md` once the in-flight Google Auth WF3 closes Verification.
> - Two pre-requisite micro-decisions above; both have recommended defaults.
> - DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
