# Backend Production Readiness Evaluation
**Spec:** `docs/specs/00-architecture/07_backend_prod_eval.md`
**Version:** 1.0 — 2026-04-25
**Scope:** `scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/`, pipeline `src/lib/` modules

---

## Purpose

Fixed, runnable checklist for evaluating backend and database production readiness.
Each check produces binary PASS/FAIL from a specific command or grep — no AI judgment
in the scoring path. Results are reproducible across runs of the same codebase state.

**Replaces** the generative `WF5 prod` narrative for backend scope.
**Trigger:** `WF5 prod backend` — load this file and walk every check in order.

---

## How to Run

1. Execute the command for each check
2. Paste the raw output in the Evidence field
3. Mark PASS or FAIL per the stated Pass Criteria
4. Compute vector score: `floor(PASS_count / total_checks × 3)`, max 3
5. Fill in the Scoring Summary table at the bottom

**Production threshold:** All vectors ≥ 1 AND average ≥ 1.5. Any vector at 0 blocks release.

---

## V1 — Correctness

### C1: Zero TypeScript errors
```
npm run typecheck 2>&1 | tail -3
```
- **Pass:** Output contains `Found 0 errors`
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### C2: Full test suite passes
```
npm run test 2>&1 | tail -5
```
- **Pass:** Output contains `X passed` with 0 failed, 0 todo
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### C3: No rogue Pool instantiation
```
grep -rn "new Pool(" src/ scripts/ --include="*.ts" --include="*.js" \
  | grep -v "src/lib/db/client.ts" | grep -v "scripts/lib/" \
  | grep -v ".test." | grep -v node_modules \
  | grep -v "scripts/analysis/" | grep -v "scripts/backfill/" \
  | grep -v "scripts/seeds/" | grep -v "scripts/seed-" \
  | grep -v "scripts/migrate.js"
```
- **Pass:** 0 matches (exclusions cover seed utilities, backfill tools, analysis queries,
  and scripts/lib/pipeline.js which is the legitimate Pool factory — none are mainline
  pipeline scripts)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### C4: No raw SQL string concatenation
```
grep -rn '\${\|`.*WHERE\|`.*SET\|`.*VALUES' src/app/api/ src/lib/db/ \
  --include="*.ts" | grep -v ".test."
```
- **Pass:** 0 matches (all SQL uses `$1`/`$2` parameterization)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### C5: CQA assert-schema — last run passed
```
psql $DATABASE_URL -c \
  "SELECT verdict, run_at FROM pipeline_runs \
   WHERE step_name = 'assert_schema' ORDER BY run_at DESC LIMIT 1;"
```
- **Pass:** `verdict = completed`, `run_at` within last 48h
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### C6: CQA assert-data-bounds — last run passed
```
psql $DATABASE_URL -c \
  "SELECT verdict, run_at FROM pipeline_runs \
   WHERE step_name = 'assert_data_bounds' ORDER BY run_at DESC LIMIT 1;"
```
- **Pass:** `verdict = completed`, `run_at` within last 48h
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V1 Score:** ___ / 3

---

## V2 — Reliability

### R1: All operational scripts use `pipeline.run()` wrapper
```
grep -rL "pipeline\.run" scripts/*.js \
  | grep -v "lib/" | grep -v "run-chain" | grep -v "manifest" \
  | grep -v "validate-migration" | grep -v "assert-" | grep -v "seed" \
  | grep -v "spike" | grep -v "ai-env"
```
- **Pass:** 0 files listed
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### R2: Write scripts use `withTransaction`
```
grep -rl "INSERT\|UPDATE\|DELETE" scripts/*.js \
  | grep -v "lib/" | grep -v "validate" | grep -v "assert-" \
  | xargs grep -L "withTransaction"
```
- **Pass:** 0 files (every write script wraps mutations in a transaction)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### R3: Deadlock retry (40P01) present in SDK
```
grep -n "40P01" scripts/lib/pipeline.js
```
- **Pass:** At least 1 match
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### R4: Advisory lock used in all write scripts
```
grep -rl "INSERT\|UPDATE" scripts/*.js \
  | grep -v "lib/" | grep -v "validate" | grep -v "assert-" \
  | xargs grep -L "withAdvisoryLock"
```
- **Pass:** 0 files (every write script holds an advisory lock)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### R5: No empty catch blocks in API routes or shared lib
```
grep -rn "catch\s*(.*)\s*{\s*}" src/app/api/ src/lib/ \
  --include="*.ts" | grep -v ".test."
```
- **Pass:** 0 matches
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V2 Score:** ___ / 3

---

## V3 — Scalability

### S1: Large result sets use `streamQuery`
```
grep -rn "pool\.query\|client\.query" scripts/*.js | grep -v "lib/"
```
- **Pass:** Manual review — any query against `permits`, `permit_trades`, `permit_parcels`,
  `wsib_registry`, or `entities` that could return >10K rows uses `pipeline.streamQuery()` instead
- **Evidence:** _(paste + manual verdict)_  **Status:** PASS / FAIL

### S2: Sub-batch insert pattern present in classification scripts
```
grep -n "MAX_ROWS_PER_INSERT\|subBatch\|chunk" \
  scripts/classify-permits.js scripts/classify-scope.js 2>/dev/null
```
- **Pass:** Pattern present (protects against PostgreSQL 65535-parameter limit)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### S3: No `process.exit()` in `src/`
```
grep -rn "process\.exit" src/ --include="*.ts" | grep -v ".test."
```
- **Pass:** 0 matches (ESLint `no-restricted-syntax` enforces; this is the belt-and-suspenders check)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### S4: Indexes exist on hot query columns
```
psql $DATABASE_URL -c \
  "SELECT tablename, indexname FROM pg_indexes \
   WHERE tablename IN ('permits','permit_trades','permit_parcels') \
   ORDER BY tablename, indexname;"
```
- **Pass:** Indexes cover `permit_num`, `issued_date`, `trade_slug`, `lifecycle_phase`,
  `opportunity_score` (review list against known query patterns in `src/app/api/`)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V3 Score:** ___ / 3

---

## V4 — Security

### SEC1: No hardcoded credentials or API keys
```
grep -rn "password\s*=\s*['\"].\|apiKey\s*=\s*['\"].\|secret\s*=\s*['\"]." \
  src/ scripts/ --include="*.ts" --include="*.js" \
  | grep -v ".test." | grep -v node_modules | grep -v "\.env\."
```
- **Pass:** 0 matches
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### SEC2: Admin API routes protected by middleware
```
grep -n "X-Admin-Key\|verifyIdToken\|route-guard\|isAdmin" \
  src/middleware.ts src/lib/auth/route-guard.ts
```
- **Pass:** Auth middleware present; admin routes require `__session` cookie or `X-Admin-Key`
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### SEC3: Supply chain audit clean
```
npm audit --audit-level=high 2>&1 | tail -5
```
- **Pass:** 0 high or critical vulnerabilities
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### SEC4: No `dangerouslySetInnerHTML` without DOMPurify
```
grep -rn "dangerouslySetInnerHTML" src/ --include="*.tsx" --include="*.ts" \
  | grep -v ".test."
```
- **Pass:** 0 matches, OR every match is in a file that also imports DOMPurify
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V4 Score:** ___ / 3

---

## V5 — Observability

### O1: All operational scripts emit `PIPELINE_SUMMARY`
```
grep -rL "emitSummary" scripts/*.js \
  | grep -v "lib/" | grep -v "run-chain" | grep -v "manifest" \
  | grep -v "validate-migration" | grep -v "seed" | grep -v "spike" \
  | grep -v "ai-env" | grep -v "assert-"
```
- **Pass:** 0 files
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### O2: All operational scripts emit `PIPELINE_META`
```
grep -rL "emitMeta" scripts/*.js \
  | grep -v "lib/" | grep -v "run-chain" | grep -v "manifest" \
  | grep -v "validate-migration" | grep -v "seed" | grep -v "spike" \
  | grep -v "ai-env" | grep -v "assert-"
```
- **Pass:** 0 files
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### O3: No bare `console.error` in API routes
```
grep -rn "console\.error" src/app/api/ --include="*.ts" | grep -v ".test."
```
- **Pass:** 0 matches (all errors use `logError` from `src/lib/logger.ts`)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### O4: `logError` used in all API catch blocks
```
grep -n "catch" src/app/api/admin/pipelines/\[slug\]/route.ts \
  src/app/api/leads/route.ts 2>/dev/null | grep -v "logError"
```
- **Pass:** 0 catch blocks without `logError`; spot-check 3 additional routes manually
- **Evidence:** _(paste + manual verdict)_  **Status:** PASS / FAIL

### O5: Recent pipeline runs tracked in DB
```
psql $DATABASE_URL -c \
  "SELECT step_name, verdict, run_at FROM pipeline_runs \
   ORDER BY run_at DESC LIMIT 15;"
```
- **Pass:** Active chains show runs within expected schedule window
  (daily steps ≤ 25h ago; quarterly steps ≤ 95 days ago)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V5 Score:** ___ / 3

---

## V6 — Data Safety

### D1: All migrations pass `validate-migration.js`
```
node scripts/validate-migration.js migrations/*.sql 2>&1 | grep "^ERROR:"
```
- **Pass:** 0 ERROR lines
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### D2: All migrations have UP + DOWN blocks
```
node scripts/validate-migration.js migrations/*.sql 2>&1 | grep "missing"
```
- **Pass:** 0 matches
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### D3: FK orphan audit passes
```
npx vitest run src/tests/audit-fk-orphans.logic.test.ts 2>&1 | tail -5
```
- **Pass:** All tests pass
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### D4: Backup script is spec-47 compliant
```
grep -n "withAdvisoryLock\|emitSummary\|emitMeta\|BACKUP_GCS_BUCKET\|pipeline\.run" \
  scripts/backup-db.js 2>/dev/null
```
- **Pass:** All 5 patterns present; script exists
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### D5: Migration validator tests pass
```
npx vitest run src/tests/migration-validator.logic.test.ts 2>&1 | tail -5
```
- **Pass:** All tests pass (40/40)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V6 Score:** ___ / 3

---

## V7 — Maintainability

### M1: Dual code path in sync — lifecycle phase
```
grep -c "early_construction\|structural\|finishing\|landscaping" \
  src/lib/classification/lifecycle-phase.ts scripts/lib/lifecycle-phase.js
```
- **Pass:** Phase labels present in both files (scripts/classify-lifecycle-phase.js is the
  pipeline wrapper that delegates to scripts/lib/lifecycle-phase.js — the correct mirror is
  the lib, not the wrapper)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### M2: All advisory lock IDs registered in spec 47 §A.5
```
grep -roh "withAdvisoryLock(pool, [0-9]*" scripts/*.js \
  | grep -oP "\d+$" | sort -u
```
- **Pass:** Every ID in the output appears in `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5
- **Evidence:** _(paste IDs + confirm each is in §A.5)_  **Status:** PASS / FAIL

### M3: No dead pipeline scripts (every script in manifest)
```
node -e "const m=require('./scripts/manifest.json'); \
  Object.values(m).flat().forEach(s=>console.log(s.script))" 2>/dev/null \
  | sort > /tmp/manifest_scripts.txt; \
  ls scripts/*.js | grep -v lib/ | grep -v run-chain | grep -v validate \
  | grep -v seed | grep -v ai-env | grep -v spike | grep -v assert \
  | xargs -I{} basename {} | sort > /tmp/actual_scripts.txt; \
  diff /tmp/manifest_scripts.txt /tmp/actual_scripts.txt
```
- **Pass:** No diff (every operational script is registered in the manifest)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### M4: Dead code scan within threshold
```
npm run dead-code 2>&1 | grep -cE "^[[:space:]]+(unused|Unused)" || echo 0
```
- **Pass:** Count ≤ 15 (zero is ideal; small count acceptable for in-progress features)
- **Evidence:** _(paste count)_  **Status:** PASS / FAIL

**V7 Score:** ___ / 3

---

## V8 — Testing

### T1: Global coverage assertion passes
```
npx vitest run src/tests/assert-global-coverage.infra.test.ts 2>&1 | tail -5
```
- **Pass:** All tests pass
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### T2: Pipeline SDK tests pass
```
npx vitest run src/tests/pipeline-sdk.logic.test.ts 2>&1 | tail -5
```
- **Pass:** All tests pass
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### T3: Chain logic tests pass
```
npx vitest run src/tests/chain.logic.test.ts 2>&1 | tail -5
```
- **Pass:** All tests pass
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### T4: No skipped tests outside `src/tests/db/`
```
npm run test 2>&1 | grep "skipped" | grep -v "src/tests/db/"
```
- **Pass:** 0 lines (db/ skips when DB unreachable — acceptable; all other skips are failures)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### T5: Every operational pipeline script has a guardrail test
```
grep -rL "scripts/" src/tests/*.infra.test.ts src/tests/*.logic.test.ts \
  2>/dev/null | head -5
```
- **Pass:** Manual cross-reference — every script in `scripts/*.js` (excluding lib/, assert-, validate-, seed, spike) has a corresponding test file
- **Evidence:** _(paste script list + test file list)_  **Status:** PASS / FAIL

**V8 Score:** ___ / 3

---

## V9 — Spec Compliance

### SC1: Every test file has a SPEC LINK header
```
grep -rL "SPEC LINK\|spec link" src/tests/ --include="*.ts" --include="*.tsx"
```
- **Pass:** 0 files
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### SC2: No `process.exit()` in pipeline scripts
```
grep -rn "process\.exit" scripts/*.js | grep -v "lib/"
```
- **Pass:** 0 matches (scripts throw errors; framework handles exit)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### SC3: All API routes use `withApiEnvelope`
```
find src/app/api -name "route.ts" \
  | xargs grep -L "withApiEnvelope" 2>/dev/null | grep -v node_modules
```
- **Pass:** 0 files
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### SC4: Lock ID equals spec number for each script
```
grep -rn "ADVISORY_LOCK_ID\s*=" scripts/*.js | grep -v "lib/"
```
- **Pass:** Manual check — each lock ID matches the numeric portion of the owning spec filename
  (e.g. script for spec `84_lifecycle_phase_engine.md` → `ADVISORY_LOCK_ID = 84`)
- **Evidence:** _(paste + manual verdict)_  **Status:** PASS / FAIL

**V9 Score:** ___ / 3

---

## V10 — Operability

### OP1: Chain step counts match expected
```
node -e "
  const m = require('./scripts/manifest.json');
  ['permits','coa','sources'].forEach(c => {
    const chain = m[c] || m.chains?.[c] || [];
    console.log(c, Array.isArray(chain) ? chain.length : '?', 'steps');
  });
" 2>/dev/null || node -e "console.log(require('./scripts/manifest.json'))" | head -20
```
- **Pass:** permits = 27 steps, coa = 12 steps, sources = 15 steps (also: entities=2, wsib=1, deep_scrapes=7)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### OP2: Backup script registered and scheduled
```
grep -i "backup" scripts/manifest.json
```
- **Pass:** `backup-db` entry present in manifest
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

### OP3: All env vars consumed by scripts/API are documented
```
grep -roh "process\.env\.[A-Z_]*" scripts/*.js src/app/api/ src/lib/db/ \
  --include="*.ts" --include="*.js" \
  | grep -oP "(?<=process\.env\.)[A-Z_]+" | sort -u
```
- **Pass:** Every var in the output is documented in the relevant spec or `01_database_schema.md §Env`
- **Evidence:** _(paste list + confirm each is documented)_  **Status:** PASS / FAIL

### OP4: DB backup has run successfully
```
psql $DATABASE_URL -c \
  "SELECT verdict, run_at FROM pipeline_runs \
   WHERE step_name = 'backup_db' ORDER BY run_at DESC LIMIT 1;"
```
- **Pass:** `verdict = completed`, `run_at` within last 25h (daily schedule)
- **Evidence:** _(paste)_  **Status:** PASS / FAIL

**V10 Score:** ___ / 3

---

## Scoring Summary

| Vector | Total Checks | PASS | Score (0–3) |
|--------|-------------|------|-------------|
| V1 Correctness | 6 | ___ | ___ |
| V2 Reliability | 5 | ___ | ___ |
| V3 Scalability | 4 | ___ | ___ |
| V4 Security | 4 | ___ | ___ |
| V5 Observability | 5 | ___ | ___ |
| V6 Data Safety | 5 | ___ | ___ |
| V7 Maintainability | 4 | ___ | ___ |
| V8 Testing | 5 | ___ | ___ |
| V9 Spec Compliance | 4 | ___ | ___ |
| V10 Operability | 4 | ___ | ___ |
| **Total** | **46** | ___ | ___ |

**Vector score formula:** `floor(PASS / total × 3)`

**Overall score:** ___ / 3.0 (sum of vector scores ÷ 10)

**Result:** GO ✓ / NO-GO ✗

> GO requires: all vectors ≥ 1 AND overall average ≥ 1.5
> Any single vector at 0 is an automatic NO-GO regardless of average.

---

## Comparison Across Runs

| Date | V1 | V2 | V3 | V4 | V5 | V6 | V7 | V8 | V9 | V10 | Avg | Result |
|------|----|----|----|----|----|----|----|----|----|----|-----|--------|
| 2026-04-24 | 1 | 1 | 2 | 3 | 1 | 3 | **0** | 1 | **0** | 1 | 1.3 | NO-GO |

*Record each run here. Score changes reflect actual codebase changes, not AI judgment drift.*

---

## Operating Boundaries

**Target files:** `scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/`, pipeline `src/lib/` modules

**Out of scope:** `mobile/`, `src/components/`, `src/app/` (non-API pages) — admin UI eval is a future spec

**Cross-spec dependencies:**
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 — advisory lock ID registry
- `docs/specs/00-architecture/01_database_schema.md` — schema and env var documentation
- `docs/specs/00-architecture/112_backup_recovery.md` — backup script spec
- `docs/reports/review_followups.md` — open deferred items that may affect scores
