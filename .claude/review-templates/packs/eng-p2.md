# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Engineering standards (docs/specs/00_engineering_standards.md, whole; section 11 is the plan compliance checklist)
Source: docs/specs/00_engineering_standards.md:1-468
Generator: hand-written
Rules in the whole list: 14 (counted by pattern /^## \S+ \d+\./) · this is part 2 of 2

### 12.10 Real-DB Integration Tests (testcontainers + CI service)
- **Status:** Adopted 2026-04-08 after the Phase 0+1+2 holistic review. Mocked-pool tests cannot catch SQL syntax errors, constraint violations, FK cascades, geography casts, or column-width truncation — that bug class accounted for ~40% of recent holistic-review findings.
- **Rule:** Every NEW migration that adds a CHECK constraint, FK with cascade, or PostGIS expression MUST land with a `*.db.test.ts` file under `src/tests/db/` that exercises the constraint against a real Postgres.
- **Local opt-in:** `BUILDO_TEST_DB=1 npm run test:db` spawns a container of the target engine image, `docs/specs/_contracts.json` `db_target.test_image` (`public.ecr.aws/supabase/postgres:17.6.1.167`: PG 17 / PostGIS 3.3, the image the local Supabase stack runs), via testcontainers, connects as the non-superuser `postgres` role, applies migrations 001..NNN via `scripts/migrate.js`, runs the suite, tears down. Requires Docker. The CI service container runs the same image. The pin is locked by T-PIN-1 (`src/tests/db-test-harness-target.infra.test.ts`) and T-PIN-2 (`src/tests/db/db-target-version.db.test.ts`) (WF3 PostGIS pin, 2026-10-03).
- **CI:** `.github/workflows/db-tests.yml` provides a Postgres service container; runs on every PR that touches migrations, db client, or db tests.
- **Skip semantics:** When neither `DATABASE_URL` nor `BUILDO_TEST_DB=1` is set, every `*.db.test.ts` self-skips via `describe.skipIf(!dbAvailable())`. The standard `npm run test` is unaffected.
- **Target guard (WF3 2026-10-03):** the globalSetup picks its target with the pure `decideTestDbTarget(env)` in `src/tests/db/setup-testcontainer.ts`. An exported `DATABASE_URL` is migrated only when it is a disposable test DB: a loopback host with `CI=true` (the CI service container) or `BUILDO_TEST_DB_EXTERNAL=1`, or a non-loopback host with `BUILDO_TEST_DB_EXTERNAL=1`. The local Supabase dev stack (loopback port 54322) is never migrated, whatever flags are set. A qualifying URL wins over `BUILDO_TEST_DB=1` (CI runs `npm run test:db`, which always sets it). A URL that does not qualify is replaced by a testcontainer when `BUILDO_TEST_DB=1` is set; otherwise the suite aborts with a `REFUSING` error that names the target with the password redacted. Locked by `src/tests/test-db-setup-guard.logic.test.ts`.
- **Why:** A real DB catches the bugs that locked our team into "reading SQL by eye" for 3+ phases. The migration 030 self-heal that this section's WF shipped removes the 1a blocker that was forcing the mock-only fallback.

### 12.11 Footgun Lint Gate (AST-grep + grep)
- **Status:** Adopted 2026-04-08. Five pattern bans wired into pre-commit + manual `npm run ast-grep:leads`. Initially scoped to `src/features/leads/` and (rule-by-rule) `src/lib/`. Expand per the §12 conservative model.
- **Rules enforced** (each maps to a bug class the holistic reviews keep flagging):
  1. **silent-catch-fallback** — bans `try/catch { return [] / null / emptyResult() }`. Caught Phase 2 holistic CRIT (`getLeadFeed` swallowing DB errors as 200 empty feeds, commit 0a3e680).
  2. **env-default-in-lib** — bans `process.env.X || 'default'` inside `src/features/leads/`. A typo silently uses the default instead of failing loud. Suppressable per-line with justification.
  3. **comment-rot** — grep heuristic: any file with `// never throws` / `// always returns` AND a `throw` statement is flagged. Caught Phase 0+1+2 holistic HIGH (stale "never throws" comment in feed/route.ts, commit 449fb2a).
  4. **silent-row-drop** — grep heuristic: any file with `.filter((x): x is _ => x !== null)` AND no `logWarn` call is flagged. Caught Phase 0+1+2 holistic MED (`mapRow` silent null filter).
  5. **pool-boundary** — bans `new Pool(` instantiation outside `src/lib/db/`, `src/tests/`, `scripts/`. Per CLAUDE.md Backend Mode rule 3.
- **Suppression:** `// ast-grep-disable-next-line <rule-id>` with a one-line justification. Audited in code review.
- **Files:** rule definitions live in `scripts/ast-grep-rules/*.yml`; the grep-based heuristics + runner live in `scripts/hooks/ast-grep-leads.sh`.

### 12.12 Property-Based Tests (`fast-check`)
- **Status:** Adopted 2026-04-08 after Phase 0+1+2 holistic review caught arithmetic-invariant violations (fit_score=23, buildLeadKey '0'/'00' drift) that example-based tests missed.
- **Rule:** Pure functions with arithmetic invariants — scoring formulas, key normalizers, distance/unit conversions, cursor comparators — MUST have at least one `fast-check` property test asserting the invariant. Example-based tests are still required for happy paths and explicit edge cases.
- **What counts as an invariant:** a property that holds for ALL inputs of the type. Examples: `forAll(input => relevance_score(input) <= 100)`, `forAll(input => buildLeadKey(input) === buildLeadKey(normalize(input)))`, `forAll(a < b => format(a) <= format(b))`.
- **Files:** `src/tests/property/*.property.test.ts`. Run via `npm run test:property` or as part of the standard `npm run test`.
- **Why:** A counterexample-finding test does the work that human review can't — it tries 100+ inputs and shrinks failures to a minimal reproduction. The Phase 0+1+2 buildLeadKey fix would have shipped 4 phases earlier with this in place.

### 12.13 Mutation Testing (Stryker)
- **Status:** Adopted 2026-04-08. **Automated** via `.github/workflows/mutation.yml` — runs weekly (Monday 12:00 UTC) AND on every PR that touches a mutation target file. **Not** manual: relying on humans to remember a weekly task is how the value gets lost.
- **Rule:** The 4 high-stakes pure modules (`cost-model.ts`, `distance.ts`, `record-lead-view.ts`, `builder-query.ts`) and their `.test.ts` siblings are the mutation surface. Mutation score must stay ≥ 50% (script breaks below; CI job fails).
- **What it catches:** "snapshot-style change-detector tests" where `expect(result).toBe(20)` locks the value but doesn't exercise it in any meaningful behavior assertion. Stryker injects mutations (flip `>=` to `>`, swap constants, remove conditionals, etc.) and watches for surviving mutants — every survivor is a test gap.
- **Local usage:** `npm run test:mutation:dry` (verifies the runner setup, ~1 min) and `npm run test:mutation` (full run, ~3-5 min on 4 files / 439 mutants).
- **CI usage:** Triggered by:
  1. Weekly cron — Mondays 12:00 UTC, surfaces drift in test quality even when no PR is open
  2. Per-PR — only when a target file or its test changed (path filter in the workflow)
  3. Manual `workflow_dispatch` — one-off audits from the Actions tab
- **Triage:** For each surviving mutant, EITHER add a focused test that kills it (preferred) OR add a `// stryker disable next-line <mutator>` with justification. Stryker HTML reports are uploaded as a build artifact for 30 days.
- **Why not pre-commit:** Full runs take minutes. Pre-commit gates must be sub-second to avoid friction. CI absorbs the cost without blocking dev iteration.

### 12.14 Semantic-Diff Narrator (Pre-Commit, Opt-In)
- **Status:** Adopted 2026-04-08. Opt-in via `BUILDO_DIFF_NARRATOR=1`. Default OFF.
- **Rule:** When enabled, every `git commit` runs the staged diff through Gemini and appends a 3-5 bullet summary to the commit message footer. Catches stale comments, contract drift, side effects in pure functions, and unexpected files in the diff BEFORE the commit lands.
- **Critical:** **Fails open** on any error (missing key, network timeout, parse failure, empty diff). Never blocks a commit on its own. Test coverage in `src/tests/diff-narrator.logic.test.ts` locks the fail-open contract.
- **Cost:** ~$0.0001 per commit, ~2-5s latency. Negligible for the value when enabled.
- **Enable:** `echo 'export BUILDO_DIFF_NARRATOR=1' >> ~/.bashrc` (or your shell rc).
- **Files:** `scripts/diff-narrator.js` (the Node script), `scripts/hooks/diff-narrator.sh` (the wrapper), `.husky/prepare-commit-msg` (the git hook).

### 12.9 Animation & Gestures (Motion for React)
- **Rule:** Use `motion` package (formerly Framer Motion) for swipe-to-delete, layout transitions, drag interactions, and button press animations.
- **Spring config standard:** `{ type: 'spring', stiffness: 400, damping: 20, mass: 1 }` for button interactions. The Motion default (stiffness 1, damping 10) is intentionally weak and feels sluggish.
- **Never:** Write custom CSS keyframes for complex interactions. Never animate layout properties (use `transform` / `opacity`).
- **Why:** Hardware-accelerated, gesture-tracking, declarative.

---

## 📊 13. Observability Standards

> **Status:** Adopted as of 2026-04-07. Building observability in from day one of the frontend rebuild — lessons learned from the painful retrofit on the backend pipeline.

### 13.1 Product Telemetry (PostHog)
- **Tool:** PostHog (self-hosted free tier covers 1M events/month)
- **Wrapper:** All event capture goes through `src/lib/observability/capture.ts` exporting `captureEvent(name, properties)`. The wrapper handles SSR safety, type-safe event names, and provider abstraction.
- **Type-safe event names:** Define a `EventName` union type. New events require adding to the union (catches typos at compile time).
- **Mandatory coverage:** Every interactive handler in `src/features/leads/` (`onClick`, `onSubmit`, `onChange` for filters) MUST call `captureEvent()`. AST-grep enforces inside the leads feature.
- **PII handling:** Never include user names, emails, addresses in event properties. Use Firebase UID (pseudonymous) for user identification.

### 13.2 Error Tracking (Sentry)
- **Tool:** Sentry (free tier covers 5K events/month)
- **Wiring:** All `app/[...]/error.tsx` route boundaries call `Sentry.captureException(error, { extra: { digest: error.digest } })` in their `useEffect`.
- **Source maps:** Uploaded to Sentry on every production build via `@sentry/nextjs` plugin.
- **Local dev:** Errors logged to console only (Sentry disabled in dev to preserve free tier).

### 13.3 Backend Structured Logging (`logInfo` / `logWarn` / `logError`)
- **Tool:** `src/lib/logger.ts` exports `logError`, `logWarn`, `logInfo`. Each emits a structured JSON line: `{ level, tag, event, timestamp, ...context }`.
- **Rule:** API routes MUST emit at least one `logInfo` per successful request with `{user_id, duration_ms, ...key_params}` for observability.
- **Rule:** All catch blocks use `logError(tag, err, context)`. NEVER bare `console.error`. ESLint enforces.
- **Rule:** Pipeline scripts use `pipeline.log.info/warn/error` from the SDK, which routes to the same underlying logger.

### 13.4 Performance Monitoring (Lighthouse CI)
- **Tool:** Lighthouse CI in GitHub Actions, runs on every PR.
- **Hard budgets (CI fails below these):**
  - Performance: ≥90 mobile (Moto G4 emulation)
  - Accessibility: ≥95
  - Best Practices: ≥90
  - LCP: <2.5s
  - CLS: <0.1
  - TBT: <200ms
- **Why:** Catches performance regressions before merge. Enforces the "right foundation" goal.

### 13.5 Feature Flags (PostHog Flags)
- **Tool:** PostHog feature flags (included in free tier, integrated with telemetry)
- **Rule:** Any new user-facing feature MUST be wrapped in a feature flag check at the route level. The lead feed launches behind `feature_lead_feed_v1`.
- **Rollout pattern:** 0% → 10% (internal testing) → 25% → 50% → 100%. Each step gated on no-error-rate-spike in Sentry.
- **Why:** Decouples deploy from release. Enables instant rollback without redeploy.

---

## 🛡️ 14. The Prevention Loop (findings → protocols → gates)

Detection is not enough. **Every CRITICAL/HIGH review finding (Spec 08 roster) is triaged with a second question beyond "fix it": *"what standing rule would have prevented this whole CLASS, and where does it live?"*** The rule is placed here (or in the domain doc), and where deterministic, **promoted to a machine-read GATE** (husky footgun / ESLint / migration hook) — the strongest form: *a NO-GO the machine reads cannot be shipped past; a guideline eventually will* (operating-manual §2.4). This is the rule-oriented mirror of Spec 05's lesson-routing; the Roster Manager (Spec 08 §5.9) recommends new entries.

**Registry (extracted from real findings — domain-tagged; promote guideline → gate as effort allows):**

| Rule | Class it prevents | Domain | Form |
|------|-------------------|--------|------|
| Every `INSERT` provides all **NOT-NULL** columns; every `SELECT` feeding a typed client includes **every field the client type declares** | `lead_analytics` NOT-NULL crash; `DETAIL_COLUMNS` omission → dead UI | backend + admin | Schema-Fidelity agent → *candidate footgun* |
| An `ON CONFLICT` INSERT **`GROUP BY`s the arbiter expression**, never the raw inputs it's derived from | the `21000` LPAD `lead_key` double-hit | backend | Schema-Fidelity → *candidate lint* |
| Every **privileged mutation + its audit row** commit in ONE `withTransaction` (extends §R9 from `scripts/` to API routes) | reconcile/retry-cancel unaudited-mutation hole | admin + backend | guideline → *extend footgun* |
| A **behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit** | period-end drift (Spec 95/97 stale vs code) | cross-cutting | Ground-truth/Compliance |
| Every source/test file's `SPEC LINK` points at the spec **AND the section (§N)**; new couplings update **Cross-Spec Dependencies both directions** | traceability rot; stale cross-refs | cross-cutting | *candidate gate* (Spec 08 §5.10) |
| A webhook/event that can arrive from a **superseded object** must match the CURRENT owning id before mutating state | the P26 stale-subscription downgrade | backend | guideline |

**Domain protocol specs own their domain-tagged rows and point back here** (this §14 is the cross-cutting canonical registry): **Spec 47** (`docs/specs/01-pipeline/47_pipeline_script_protocol.md`, backend/pipeline), **Spec 34** (`docs/specs/02-web-admin/34_web_admin_testing_protocol.md`, admin), **Spec 90** (`docs/specs/03-mobile/90_mobile_engineering_protocol.md`, frontend/mobile).


