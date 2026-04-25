# Active Task: WF5 Audit Bug Batch B1–B5
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `9b5db3ddefc82d6402916c7340c263aa079353f6`

## Context
* **Goal:** Fix 5 bugs surfaced by the WF5 prod backend audit + update 2 stale spec check
  patterns. In priority order: B1 (advisory lock collision), B2 (M1 spec wrong file), B3
  (purge-lead-views missing withTransaction), B4 (29 routes missing withApiEnvelope), B5
  (observe-chain.js not in manifest + missing emitMeta). Plus C3/M1 spec exclusion fixes.
* **Target Spec:**
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (B1, B3, B5)
  - `docs/specs/00-architecture/07_backend_prod_eval.md` (B2 M1 fix, C3 exclusion fix)
  - `docs/specs/00-architecture/00_engineering_standards.md` §9 Pipeline Safety
* **Key Files:**
  - `scripts/observe-chain.js` (B1 — lock ID, B5 — manifest + emitMeta)
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5` (B1 — registry)
  - `src/tests/pipeline-advisory-lock.infra.test.ts` (B1 — LOCK_ID_REGISTRY)
  - `docs/specs/00-architecture/07_backend_prod_eval.md` (B2 M1 check, C3 pattern)
  - `scripts/purge-lead-views.js` (B3 — withTransaction wrap)
  - `src/app/api/**/*.ts` — 29 route files (B4 — withApiEnvelope sweep)
  - `scripts/manifest.json` (B5 — observe-chain entry)
  - `scripts/backfill-permits-location.js` (B5 — relocate to scripts/backfill/)

## Technical Implementation

### B1 — Advisory lock collision (CRITICAL)
`observe-chain.js:15` declares `ADVISORY_LOCK_ID = 112`, the same ID as `backup-db.js:21`.
When both scripts run concurrently, the second silently skips — the advisory lock is already
held. Three-file fix (must be done together):
1. `scripts/observe-chain.js:15` — change `112` → `113`
2. `docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5` — add registry row:
   `| **113** | scripts/observe-chain.js | 7 — Maintenance | NO — observer only |`
3. `src/tests/pipeline-advisory-lock.infra.test.ts LOCK_ID_REGISTRY` — add:
   `'scripts/observe-chain.js': 113`
The infra test currently does not scan observe-chain.js (absent from manifest). After B5
adds it to the manifest, the uniqueness and registry checks will fire — must PASS.

### B2 — M1 spec check targets wrong file (SPEC FIX)
The M1 check in `07_backend_prod_eval.md` compares `lifecycle-phase.ts` vs
`classify-lifecycle-phase.js` (the pipeline wrapper script, which has 1 match — a comment).
The actual mirror is `scripts/lib/lifecycle-phase.js` (5 matches). No real drift exists.
Fix: update M1 grep to target `scripts/lib/lifecycle-phase.js`. Both TS module and JS lib
have all 4 phase labels confirmed present.

### B3 — purge-lead-views.js batched DELETE without withTransaction
The `while(true)` DELETE loop calls `pool.query()` directly with no transaction wrapper.
Fix: wrap each loop iteration in `pipeline.withTransaction(pool, async (client) => {...})`.
Per-batch wrapping (not one transaction over the full loop) preserves the intentional
lock-releasing behaviour that prevents long BRIN index holds.

### B4 — 29 routes missing withApiEnvelope (SWEEP)
Mechanical 3-step per route:
1. Add `import { withApiEnvelope } from '@/lib/api/with-api-envelope';`
2. Change `export async function GET(req) {` →
   `export const GET = withApiEnvelope(async function GET(req) {`
3. Replace closing `}` with `});`
Dynamic-param routes ([id], [slug]) must cast context:
  `const { params } = context as { params: { id: string } }`.
Mobile-consumed routes done first: `leads/feed`, `leads/flight-board`, `leads/search`,
`permits/route.ts`, `permits/[id]/route.ts`. Admin routes follow.

### B5 — observe-chain.js not in manifest + missing emitMeta (O2)
- Add `observe_chain` entry to `scripts/manifest.json` under `m.scripts`:
  `{ "file": "scripts/observe-chain.js", "supports_full": false, "supports_dry_run": false, "telemetry_tables": ["pipeline_runs"] }`
- `backfill-permits-location.js` is one-time (header: "one-time backfill for 237K rows").
  Move to `scripts/backfill/backfill-permits-location.js` — excluded from M3 grep by
  convention. Update SPEC LINK path in file header.
- Add `pipeline.emitMeta({"pipeline_runs": ["id","verdict","started_at","completed_at"]}, {})`
  inside the `withAdvisoryLock` callback in observe-chain.js, after DB reads complete.

### C3 Spec fix — exclusion pattern too broad
Update `07_backend_prod_eval.md` C3 grep to add after existing exclusions:
`| grep -v "analysis/" | grep -v "backfill/" | grep -v "seeds/" | grep -v "migrate.js"`

## Standards Compliance
* **Try-Catch Boundary:** B3 withTransaction wraps each DELETE batch. B4 withApiEnvelope
  is the outer uncaught-exception catch. No new try/catch gaps introduced.
* **Unhappy Path Tests:** B1: infra test uniqueness check reproduces the collision. B3 and
  B5: existing pipeline-sdk and chain tests provide coverage. B4: withApiEnvelope already
  tested in the routes that use it (entities, notifications, permits/geo).
* **logError Mandate:** No new API catch blocks. withApiEnvelope delegates to logError
  internally.
* **UI Layout:** N/A — backend-only changes.
* **Database Impact:** NO

## Execution Plan

- [ ] **Rollback Anchor:** `9b5db3ddefc82d6402916c7340c263aa079353f6`

- [ ] **State Verification:**
  - observe-chain.js ADVISORY_LOCK_ID = 112 (same as backup-db.js:21) — confirmed
  - scripts/lib/lifecycle-phase.js has 5 phase matches; TS module has 3 — no actual drift;
    M1 spec targets the wrong file (wrapper vs lib)
  - purge-lead-views.js while-loop DELETE uses pool.query with no withTransaction — confirmed
  - 29 route files confirmed missing withApiEnvelope (5 mobile-consumed, 24 admin)
  - observe-chain.js absent from manifest.json; backfill-permits-location.js is a one-time script

- [ ] **Spec Review:** Read specs listed above. Done in pre-flight.

- [ ] **Reproduction (B1):** Add observe-chain.js to manifest temporarily, then run
  `npx vitest run src/tests/pipeline-advisory-lock.infra.test.ts`.
  Must FAIL with "ID 112 used by both backup-db.js and observe-chain.js".

- [ ] **Red Light:** Confirm the infra test fails with the duplicate ID error.

- [ ] **Fix B1:** Change observe-chain.js ID 112→113. Add §A.5 row in spec. Add to
  LOCK_ID_REGISTRY in infra test. Re-run infra test — must PASS.

- [ ] **Fix B2:** Update M1 check in 07_backend_prod_eval.md to target
  `scripts/lib/lifecycle-phase.js`. Verify grep shows labels present in both files.

- [ ] **Fix B3:** Wrap each batch DELETE iteration in `pipeline.withTransaction(pool, ...)`.
  Extract `rowCount` outside callback for loop termination. Run
  `npx vitest related scripts/purge-lead-views.js --run`.

- [ ] **Fix B4 — mobile routes first:** Apply withApiEnvelope to leads/feed, leads/flight-board,
  leads/search, permits/route.ts, permits/[id]/route.ts. Run
  `npx vitest related src/app/api/leads/feed/route.ts src/app/api/permits/\[id\]/route.ts --run`.
  Then sweep remaining 24 admin routes. Run `npm run typecheck` after full sweep.

- [ ] **Fix B5:** Add observe_chain entry to manifest.json. Add emitMeta call to
  observe-chain.js. Move backfill-permits-location.js → scripts/backfill/. Re-run
  `npx vitest run src/tests/pipeline-advisory-lock.infra.test.ts` — must PASS (observe-chain.js
  now visible to test, ID 113 registered).

- [ ] **Fix C3 spec:** Add exclusion patterns to C3 grep command in 07_backend_prod_eval.md.

- [ ] **Pre-Review Self-Checklist:** Before Green Light, verify these sibling bug classes:
  1. Any other scripts sharing a lock ID not yet in the infra test? Run the uniqueness test.
  2. Other pipeline scripts with batched write loops missing withTransaction?
  3. Dynamic-param routes — context casts correct for all [id] and [slug] routes?
  4. observe-chain.js emitMeta — reads dict reflects actual pipeline_runs columns queried?
  5. backfill-permits-location.js relocation — any manifest chain steps referencing old path?
  Walk each against the actual diff. Output PASS/FAIL per item before running tests.

- [ ] **Multi-Agent Review:** In ONE message, three parallel tool calls:
  - **Tool call 1 — Bash:** `npm run review:gemini -- review scripts/observe-chain.js --context docs/specs/01-pipeline/47_pipeline_script_protocol.md`
    Focus (adversarial): lock ID collision residue, emitMeta correctness, silent skip edge
    cases, any state the advisory lock guard doesn't cover.
  - **Tool call 2 — Bash:** `npm run review:deepseek -- review scripts/purge-lead-views.js --context docs/specs/01-pipeline/47_pipeline_script_protocol.md`
    Focus (adversarial): withTransaction scope — does per-batch wrapping leave any partial-write
    window? Are all 29 withApiEnvelope wraps type-safe for dynamic-param routes?
  - **Tool call 3 — Agent** (`subagent_type: "feature-dev:code-reviewer"`, `isolation: "worktree"`):
    Spec: `docs/specs/01-pipeline/47_pipeline_script_protocol.md`.
    Modified files: observe-chain.js, purge-lead-views.js, manifest.json,
    pipeline-advisory-lock.infra.test.ts, the 29 route files, 07_backend_prod_eval.md.
    Summary: "Five-bug fix batch from WF5 prod audit — lock ID collision, withTransaction
    gap, withApiEnvelope sweep, manifest registration, and stale spec patterns."
    Focus: lock registry consistency, withTransaction scope correctness, withApiEnvelope
    context-cast type safety in dynamic routes, emitMeta reads dict accuracy.
  **Triage findings:**
  - **BUG** (blocking) → file WF3 immediately. Do NOT proceed to Green Light.
  - **DEFER** (non-blocking) → append to `docs/reports/review_followups.md` with context.

- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste final test summary
  line (e.g. "✓ 4451 tests passed") and typecheck result (e.g. "Found 0 errors"). Both must
  show zero failures. Then list each prior step as DONE or N/A. → WF6.
