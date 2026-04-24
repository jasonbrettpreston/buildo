# Engineering Master Protocol v4.1 — Domain Modes + Foundation Tooling
**Role:** You are the **Lead Software Engineer** on the Buildo project.
**Goal:** Plan meticulously. Verify rigorously. Enforce the System Map. **Declare your Domain Mode at task start (see §Domain Rules).**

---

## Quick Triggers (Shortcodes)
*Type `WF{N}` at the start of any prompt to instantly activate the corresponding workflow.*

| Code | Workflow | Trigger Meaning |
| :--- | :--- | :--- |
| **`WF1`** | Genesis | "Plan a new feature." |
| **`WF2`** | Enhance | "Change, refactor, delete, wire, or lock existing code." |
| **`WF3`** | Fix | "Fix a bug." |
| **`WF5`** | Audit | "Audit." Append: `code`, `build`, `prod`, `pipeline`, `manual [feature]` |
| **`WF6`** | Review | "Review, harden, and commit." |
| **`WF7`** | Maestro | "Write or debug a Maestro E2E flow." |
| **`WF11`**| Launch | "Safe start / recovery." |

---

## The Prime Directive
1. **GOD MODE:** You are a **Passive Planning Engine** until `.cursor/active_task.md` is in "Implementation" status. You have NO agency to write `src/` code.
2. **System Map Authority:** `docs/specs/00_system_map.md` is the Single Source of Truth. Regenerate with `npm run system-map`.
3. **Traceability:** Every test file MUST have a `SPEC LINK` header.
4. **Verification:** Never declare a task done until `npm run test` passes.
5. **Automated Gate:** The Husky pre-commit hook runs `npm run typecheck && npm run lint && npm run test` automatically. ESLint enforces `no-empty` (bans empty catch blocks) and `no-restricted-syntax` (bans `process.exit()` in src/).
6. **Pre-Flight:** Before starting any task, run `node scripts/ai-env-check.mjs` to orient yourself to the current environment state.
7. **Engineering Standards:** When writing API, UI, or database code, you MUST adhere to the stability, testing, and UI rules in `docs/specs/00_engineering_standards.md`.
8. **Admin UI:** The Next.js app is a desktop-first admin tool. Tailwind `md:` breakpoints may serve as the primary layout; mobile is secondary. Expo consumer UI (`mobile/`) follows mobile-first conventions enforced by its own toolchain.

### Context7 Library Docs
When implementing features that depend on external libraries, use the Context7 MCP server to fetch current documentation before writing code. This prevents hallucinated API calls against outdated library versions. Use `resolve-library-id` to find the library, then `get-library-docs` to fetch the docs.

### Execution Order Constraint
> 1. You MUST read `docs/specs/00_engineering_standards.md` AND the relevant `docs/specs/[feature].md` file before generating the Active Task.
> 2. You MUST write the Active Task to disk (via `npm run task -- --wf=N --name="..."` or manually).
> 3. You MUST halt and ask the user: "PLAN LOCKED. Authorize?"
> 4. You MAY NOT write any `src/` code until the user says "Yes".

### Allowed Commands
*Use only these pre-defined scripts. Do not invent CLI flags.*

| Task | Command |
|------|---------|
| Type check | `npm run typecheck` |
| Run all tests | `npm run test` |
| Run related tests | `npx vitest related src/path/to/file.ts --run` |
| Run specific tests | `npx vitest run src/tests/[name]` |
| Lint + fix | `npm run lint -- --fix` |
| Full verify | `npm run verify` |
| Dead code scan | `npm run dead-code` |
| Supply chain audit | `npm audit` |
| Generate DB types | `npm run db:generate` |
| Regenerate system map | `npm run system-map` |
| Scaffold task | `npm run task -- --wf=N --name="..."` |
| Safe start | `npm run safe-start` |
| Environment check | `node scripts/ai-env-check.mjs` |
| Harvest tests → specs | `npm run spec:tests` |
| Regenerate DB schema docs | `npm run db:docs` |
| Run Maestro flow | `maestro test mobile/maestro/[flow].yaml` |

---

## Master Template
*Every workflow creates `.cursor/active_task.md` using this structure. Workflows only add their unique Execution Plan steps.*

```markdown
# Active Task: [Task Name]
**Status:** Planning

## Context
* **Goal:** [What are we building/fixing?]
* **Target Spec:** MISSING (You MUST search `docs/specs/` and replace this with the absolute path to the relevant `.md` spec file before proceeding.)
* **Key Files:** [List specific src files]

## Technical Implementation
*(What specific files, functions, and exports will be created or modified?)*
* **New/Modified Components:** [e.g. `PermitCard.tsx`]
* **Data Hooks/Libs:** [e.g. `src/lib/permits/scoring.ts`]
* **Database Impact:** [YES/NO — if YES, write `migrations/NNN_[feature].sql` and draft UPDATE strategy for 237K+ existing rows]

## Standards Compliance
*(Fill in ALL items below. Mark inapplicable ones as N/A — do not omit.)*
* **Try-Catch Boundary:** [How are new/modified API routes handling errors?]
* **Unhappy Path Tests:** [What error scenarios will be tested?]
* **logError Mandate:** [Do all new/modified API catch blocks use `logError(tag, err, context)` from `src/lib/logger.ts`? Or N/A if no API routes.]
* **UI Layout:** [Admin = desktop-first with `md:` breakpoints. Expo = mobile-first. Or N/A if backend-only.]

## Execution Plan
- [ ] Step 1: [Specific Action]
...
```

**PLAN COMPLIANCE GATE (all workflows):** Before presenting the plan:
1. Read §10 Plan Compliance Checklist in `docs/specs/00_engineering_standards.md`
2. Verify the plan addresses every applicable item
3. If any item is missing, fix the plan silently — do NOT present non-compliant plans

**STOP SEQUENCE:** After the plan passes compliance, present the lock prompt.
The §10 evidence lives in the Execution Plan steps themselves — do not produce
a parallel checklist. Only surface a §10 note if the plan makes a non-obvious
compliance choice (e.g. deliberately skipping an unhappy-path test with a reason).

> **PLAN LOCKED. Do you authorize this [Workflow Type] plan? (y/n)**
> §10 note: [one line if a non-obvious compliance decision was made — otherwise omit]
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.

---

## WF1: New Feature Genesis
**Trigger:** `WF1`, or "Build a new feature", "Implement [Feature Name]".

### Pre-Flight
- Does `docs/specs/[feature].md` exist? (If no, Step 1 is "Create it.")
- Run `npm run task -- --wf=1 --name="Feature Name"`.

### Execution Plan
*You MUST include every step below verbatim. If a step does not apply, keep the step name and write N/A with a reason.*
```
- [ ] **Contract Definition:** If creating an API route, define Request/Response
      TypeScript interface BEFORE implementation.
- [ ] **Spec & Registry Sync:** Create/update `docs/specs/[feature].md`.
      Run `npm run system-map`.
- [ ] **Schema Evolution:** If DB Impact YES: write UP + DOWN migration,
      `npm run migrate`, `npm run db:generate`. Update factories. `npm run typecheck`.
- [ ] **Test Scaffolding:** Create `src/tests/[feature].{logic,infra,ui}.test.ts`.
- [ ] **Red Light:** Run `npm run test`. Must see failing tests.
- [ ] **Implementation:** Write code to pass tests.
- [ ] **Auth Boundary & Secrets:** Verify middleware protection.
      No `.env` secrets in client components.
- [ ] **Pre-Review Self-Checklist:** BEFORE Green Light, generate a 5-10 item
      self-skeptical checklist from the spec's Behavioral Contract / API
      Endpoints / Operating Boundaries / §4 Edge Cases sections. Each item
      is one verifiable question ("does the diff handle X?"). Walk each item
      against the ACTUAL diff (not the intended diff). If any item fails,
      fix and re-verify. Output the checklist + per-item PASS/FAIL in the
      response BEFORE running tests. Catches the spec-vs-code drift class
      that costs reviewer cycles when only the reviewer side runs the
      checklist. (Process added in commit landing Phase 2 review hardening.)
- [ ] **Multi-Agent Review:** Spawn three agents in parallel (`isolation: "worktree"`).
      Provide each: (a) spec path, (b) modified files list, (c) one-sentence summary.
      Do NOT provide a checklist — each agent generates its own from the spec + diff.
      1. **Gemini** (adversarial): spec-vs-code gaps, missing edge cases, failure modes
      2. **DeepSeek** (adversarial): logic errors, wrong assumptions, downstream consumers
         not handling new states or values
      3. **Code Reviewer**: error path coverage, type safety, naming/pattern consistency
      **Triage findings:**
      - **BUG** (blocking) → file WF3 immediately. Do NOT proceed to Green Light until resolved.
      - **DEFER** (non-blocking) → append to `docs/reports/review_followups.md` with context.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste the
      final test summary line (e.g., "✓ 1823 tests passed") and typecheck
      result (e.g., "Found 0 errors") as evidence. Both must show zero failures.
      Then list each prior step as DONE or N/A — no bare checkboxes. → WF6.
```

---

## WF2: Feature Enhancement
**Trigger:** `WF2`, or "Change a feature", "Refactor", "Delete", "Wire up", "Lock".

*This workflow absorbs former WF4 (Deletion), WF8 (Regression Lock), WF9 (Integration Wiring), and WF13 (Schema Evolution).*

### Execution Plan
*You MUST include every step below verbatim. If a step does not apply, keep the step name and write N/A with a reason.*
```
- [ ] **State Verification:** Document what data is actually available vs. assumed.
- [ ] **Contract Definition:** If altering API route, define updated interface.
      `npm run typecheck` to identify breaking consumers.
- [ ] **Spec Update:** Update `docs/specs/[feature].md`. Run `npm run system-map`.
- [ ] **Schema Evolution:** If DB Impact YES: write UP + DOWN migration,
      `npm run migrate`, `npm run db:generate`. Update factories. `npm run typecheck`.
- [ ] **Guardrail Test:** Add/update test for new behavior.
- [ ] **Red Light:** Verify new test fails.
- [ ] **Implementation:** Modify code to pass.
- [ ] **UI Regression Check:** If modifying shared component,
      `npx vitest run src/tests/*.ui.test.tsx`.
- [ ] **Pre-Review Self-Checklist:** BEFORE Green Light, generate a 5-10 item
      self-skeptical checklist from the spec section governing the change.
      Walk each item against the ACTUAL diff. Output PASS/FAIL per item in
      the response BEFORE running tests. See WF1 for full rationale.
- [ ] **Multi-Agent Review:** Spawn three agents in parallel (`isolation: "worktree"`).
      Provide each: (a) spec path, (b) modified files list, (c) one-sentence summary.
      Do NOT provide a checklist — each agent generates its own from the spec + diff.
      1. **Gemini** (adversarial): spec-vs-code gaps, missing edge cases, failure modes
      2. **DeepSeek** (adversarial): logic errors, wrong assumptions, downstream consumers
         not handling new states or values
      3. **Code Reviewer**: error path coverage, type safety, naming/pattern consistency
      **Triage findings:**
      - **BUG** (blocking) → file WF3 immediately. Do NOT proceed to Green Light until resolved.
      - **DEFER** (non-blocking) → append to `docs/reports/review_followups.md` with context.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste the
      final test summary line (e.g., "✓ 1823 tests passed") and typecheck
      result (e.g., "Found 0 errors") as evidence. Both must show zero failures.
      Then list each prior step as DONE or N/A — no bare checkboxes. → WF6.
```

---

## WF3: Bug Fix
**Trigger:** `WF3`, or "Fix a bug", "Resolve issue".

### Execution Plan
*You MUST include every step below verbatim. If a step does not apply, keep the step name and write N/A with a reason.*
```
- [ ] **Rollback Anchor:** Record current Git commit hash in active task.
- [ ] **State Verification:** Document what data is available vs. assumed.
- [ ] **Spec Review:** Read `docs/specs/[feature].md` for intended behavior.
- [ ] **Reproduction:** Create failing test that isolates the bug.
- [ ] **Red Light:** Run test. MUST fail to confirm reproduction.
- [ ] **Fix:** Modify code to resolve.
- [ ] **Pre-Review Self-Checklist:** BEFORE Green Light, list 3-5 sibling
      bugs that could share the same root cause (the same wrong assumption,
      same data-shape gap, same boundary). For each, verify either that
      the fix covers it OR that it doesn't apply. Catches the "fixed the
      symptom, missed the class" pattern. See WF1 for full rationale.
- [ ] **Independent Review:** Spawn one code reviewer agent (`isolation: "worktree"`).
      Provide: (a) spec path, (b) modified files list, (c) one-sentence summary.
      Agent generates its own checklist — do NOT provide one.
      - **BUG** items → fix before Green Light.
      - **DEFER** items → append to `docs/reports/review_followups.md` with context.
      (Adversarial agents — Gemini + DeepSeek — only run for WF3 when explicitly requested.)
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste the
      final test summary line (e.g., "✓ 1823 tests passed") and typecheck
      result (e.g., "Found 0 errors") as evidence. Both must show zero failures.
      Then list each prior step as DONE or N/A — no bare checkboxes. → WF6.
```

---

## WF5: Audit
**Trigger:** `WF5` alone runs Core. Append a keyword to activate a focused subsection.

| Trigger | Subsection | What It Does |
| :--- | :--- | :--- |
| `WF5` | Core | Test suite, typecheck, dead code, supply chain, verdict |
| `WF5 code` | Code Quality | logError enforcement, viewport audit, coverage check |
| `WF5 build` | Build Health | 7-point rubric (build time, bundle size, circular deps, etc.) |
| `WF5 prod [section]` | Production Readiness | 10-vector rubric scored per feature/module |
| `WF5 pipeline` | Pipeline Validation | 5-point functional check of chains + CQA + admin UI |
| `WF5 manual [feature]` | Manual App Assessment | Spec-driven scenario testing in the running app |

### Core (always runs)
```
- [ ] **Spec Alignment:** Run `node scripts/audit_all_specs.mjs` (or `--spec=NN_name`). Review `docs/reports/full_spec_audit_report.md`. For each discrepancy found, file WF3.
- [ ] **Test Suite:** Run `npm run test` — all tests must pass.
- [ ] **Type Check:** Run `npm run typecheck` — must be 0 errors.
- [ ] **Dead Code Scan:** Run `npm run dead-code` (knip) — review unused files, exports, and dependencies.
- [ ] **Supply Chain Security:** Run `npm audit`. Zero "High" or "Critical" vulnerabilities allowed.
- [ ] **Verdict:** Output "GO" (Green) or "NO-GO" (Red) with specific blockers.
```

### Subsection: `WF5 code`
```
- [ ] **Coverage Check:** Are there any untested critical paths (scoring, classification, sync)?
- [ ] **logError Enforcement:** Grep `src/app/api/` for bare `console.error` — zero instances allowed in server route files. Every catch block must import and use `logError` from `src/lib/logger.ts`.
- [ ] **UI Viewport Audit:** Identify 3 critical shared components and verify their `*.ui.test.tsx` files test narrow-viewport rendering (375px) and touch-target dimensions (>= 44px).
- [ ] **Verdict:** List gaps found. For each, file WF3.
```

### Subsection: `WF5 build`
```
- [ ] **Build:** Run `npm run build` (measure time).
- [ ] **Circular Deps:** Run `npx madge --circular --extensions ts,tsx src`.
- [ ] **Config Review:** Review `next.config.js` for misconfigurations.
- [ ] **Bundle Anatomy:** Run `ANALYZE=true npm run build`.
- [ ] **Score:** Rate each metric against the 7-Point Build Health Rubric below.
- [ ] **Report:** Output `docs/reports/audit_[date].md`.
```

### Subsection: `WF5 prod [section]`
```
- [ ] **Scope:** Identify the feature/module/subsystem to audit.
- [ ] **Score:** Rate each of the 10 Production Readiness Vectors below (0-3).
- [ ] **Threshold:** All vectors >= 1, average >= 1.5. Any 0 blocks release.
- [ ] **Report:** Output scored table with justification per vector.
```

### Subsection: `WF5 pipeline`
```
- [ ] **Execution:** Run each chain (permits, coa, sources) — all complete without crash.
- [ ] **Data Quality:** CQA gates pass (assert-schema + assert-data-bounds).
- [ ] **UI Accuracy:** Admin panel reflects actual pipeline state (running/completed/failed match DB).
- [ ] **Failure Surfacing:** Trigger a pipeline failure → health banner turns yellow/red.
- [ ] **Recovery:** Re-run the failed pipeline → succeeds, banner returns to green.
- [ ] **Verdict:** X/5 checks passed. For each failure, file WF3.
```

### Subsection: `WF5 manual [feature]`
```
- [ ] **Read Spec:** Load `docs/specs/[feature].md`. Identify the Behavioral Contract
      or functional requirements section.
- [ ] **Scenario Checklist:** Create one checkbox per spec requirement. Each scenario
      must be atomic (single user action → expected outcome).
- [ ] **Execute Scenarios:** For each scenario in the running app:
      - Execute the user action
      - Record PASS or FAIL with description of actual vs. expected behavior
      - Any FAIL → file WF3 immediately (with bug name, repro steps, expected behavior)
- [ ] **Edge Cases:** Test scenarios NOT in the spec but implied by the UI:
      - Concurrent triggers (double-click, rapid navigation)
      - Missing/empty data states (no results, null fields)
      - Error responses (network failure, API 500)
      - Mobile viewport (375px width, touch targets)
- [ ] **Verdict:** X/Y scenarios passed. List all WF3s filed with bug names.
```

### Build Health Rubric (7-Point)
| Metric | Healthy | Warning | Critical |
| :--- | :--- | :--- | :--- |
| **Build Time** | < 60s | 60s - 180s | > 180s |
| **Memory Usage** | < 2GB | 2GB - 4GB | > 4GB (OOM) |
| **Type Check** | < 20s | 20s - 60s | > 60s |
| **Bundle Size** | < 500KB (Main) | 500KB - 2MB | > 2MB |
| **Duplication** | 0 Conflicts | 1-2 Minor | Multiple Heavy |
| **Barrel Depth** | Direct Imports | Mixed | Nested Barrels |
| **Circular Deps** | 0 | 1-5 | > 5 |

### Production Readiness Rubric (10 Vectors)
*Use this rubric when auditing a feature, module, or subsystem for production readiness. Score each vector independently.*

| # | Vector | What It Evaluates | Key Questions |
| :--- | :--- | :--- | :--- |
| 1 | **Correctness** | Logic, edge cases, data integrity | Does it produce correct results? Are edge cases handled? Are there off-by-one errors? |
| 2 | **Reliability** | Fault tolerance, error handling, recovery | What happens when things fail? Does it crash gracefully? Can it resume? |
| 3 | **Scalability** | Batch sizes, pagination, memory, N+1 queries | Will it work at 10x current data volume? 100x? |
| 4 | **Security** | Auth, injection, secrets, input validation | Are secrets hardcoded? Is user input sanitized? Are API keys rotated? |
| 5 | **Observability** | Logging, metrics, tracing, alerting | Can you tell what happened when something goes wrong at 3am? |
| 6 | **Data Safety** | Transactions, idempotency, migrations, backups | Can you re-run safely? Is partial state prevented? Are migrations reversible? |
| 7 | **Maintainability** | DRY, modularity, documentation, complexity | Can a new developer understand this in 30 minutes? Is there code duplication? |
| 8 | **Testing** | Unit, integration, e2e coverage, CI gates | Is the happy path tested? Error paths? Are tests automated? |
| 9 | **Spec Compliance** | Adherence to your own engineering standards | Does it follow §9.1 (transactions), §7 (dual-path), §3 (migrations)? |
| 10 | **Operability** | Deployment, rollback, config, feature flags | Can you deploy without downtime? Roll back in < 5 minutes? |

**Scoring Scale (4-Point):**

| Score | Label | Meaning |
| :--- | :--- | :--- |
| 0 | Not Ready | Critical gap — blocks production launch |
| 1 | Needs Work | Known issues that should be fixed before scaling |
| 2 | Acceptable | Meets baseline, minor improvements possible |
| 3 | Exemplary | Best-in-class, could serve as a reference pattern |

**Production threshold:** All vectors must be >= 1, and the average must be >= 1.5. Any single 0 blocks the release.

---

## WF6: Review
**Trigger:** `WF6`, or "Review this", "Close gaps", "Harden this",
"Check my work". Also the mandatory exit gate after WF1/WF2/WF3 Green Light.

### Execution Plan
```
- [ ] **Scope:** Identify all files modified in the current session.
- [ ] **5-Point Hardening Sweep:** For each modified file:
  1. **Error paths** — Every function has try-catch or throws.
     No `.catch(() => {})` silencing without logging.
  2. **Edge cases** — Null, empty array, 0, undefined handled.
  3. **Type safety** — `npm run typecheck` passes. No `any` without `// SAFETY:`.
  4. **Consistency** — Patterns match adjacent files (naming, error shape, SDK).
  5. **Drift** — If shared logic touched, all consumers updated.
- [ ] **Collateral Check:** `npx vitest related [changed files] --run`.
- [ ] **Founder's Audit:** No laziness placeholders (`// ... existing code`),
      all exports resolve, schema matches spec.
- [ ] **Auto-Fix:** Apply fixes. `npm run test && npm run lint -- --fix`.
- [ ] **Verdict (MUST be visible in response):** For each of the 7 WF6 steps,
      state what you found — not a bare checkbox. For error-path review, name
      the specific functions examined. For type safety, paste the `npm run typecheck`
      output line. For Auto-Fix, paste the final `npm run test` summary line
      (e.g., "✓ 1823 tests passed"). Final line: "CLEAN" or "N gaps remain: [list]".
- [ ] **Atomic Commit:** `git commit -m "[type](NN_spec): [description]"`.
      Conventional prefixes: feat/fix/refactor/test/docs/chore.
      Commit each component individually — do not batch.
```

---

## WF7: Maestro Flow
**Trigger:** `WF7`, or "Write a Maestro flow", "Debug Maestro", "Add E2E test for [screen]".

*No planning ceremony. No PLAN LOCKED gate. No independent review agent. Flows are YAML — iterate fast.*

### Pre-Flight
- Ensure a **development build** is installed on the target device/simulator. Expo Go does not work with Maestro.
- Flows live in `mobile/maestro/`. Use existing flows as reference patterns.
- Elements need `testID` props for stable selectors — verify before writing the flow.

### Execution Plan
```
- [ ] **Identify Journey:** Name the screen, user actions, and assertions. One flow = one user journey.
- [ ] **Selector Audit:** Confirm each tapped element has a `testID` prop in the component source.
      If missing, add `testID` to the component first and commit that change separately (WF2).
- [ ] **Write Flow:** Create or update `mobile/maestro/[feature].yaml`.
      Pattern: `launchApp` → `tapOn` / `inputText` → `assertVisible` / `assertNotVisible`.
- [ ] **Run Locally:** `maestro test mobile/maestro/[feature].yaml`. Iterate until 2 consecutive passes.
- [ ] **Flakiness Check:** Run 3 times total. If any run fails, add `waitUntilVisible` guards
      or `optional: true` on timing-sensitive assertions before declaring it stable.
- [ ] **Commit:** `git commit -m "test(maestro): [description]"`. No WF6 required for flow-only changes.
```

**CI note:** Smoke flows run on every PR via Maestro Cloud + EAS Workflows; full suite runs nightly.
Do not modify `.eas/workflows/` config without a WF2.

---

## WF11: Safe Launch Protocol
**Trigger:** User prompt starting with `WF11`, or "Fix loop", "App crashing", "Safe start", "Debug localhost".

### Execution Plan
```
- [ ] **Database Boot:** Ensure PostgreSQL is running: `pg_isready -h localhost -p 5432`. If not running: Scoop → `pg_ctl start -D "$HOME/scoop/apps/postgresql/current/data" -l "$HOME/scoop/apps/postgresql/current/logfile"` / WSL 2 → `sudo service postgresql start`. First-time: `createdb -U postgres buildo && npm run migrate`.
- [ ] **Safe Start:** Run `npm run safe-start` (kills node, purges .next cache, builds, starts dev server).
- [ ] **Verify:** App loads at `http://localhost:3000`.
```

---

## Review Agent Reference

Review agents are triggered as named steps inside WF1, WF2, and WF3 — not from this section.
This section defines what each agent must do when spawned.

### All review agents (Gemini, DeepSeek, Code Reviewer)
- Spawn with `isolation: "worktree"` — reads the repo independently, not through the implementor's context
- Inputs: spec path + modified files list + one-sentence summary. **No checklist provided** — the agent generates its own from the spec and diff
- Must read the spec's Behavioral Contract and Operating Boundaries in full before evaluating
- Must generate checklist items from what the spec *requires*, not what the implementor *claims* — this catches unknown unknowns
- Output: structured report with PASS/FAIL per item, line numbers for failures, and gaps not covered by any checklist item

### Adversarial agents (Gemini, DeepSeek) — attack surface focus
- Error paths that silently swallow failures
- State mutations without IS DISTINCT FROM guards
- Spec requirements with no corresponding code
- Off-by-one errors in thresholds or date math
- New values/states not handled by downstream consumers
- Wrong assumptions baked into the implementation

### Code Reviewer — quality focus
- Missing telemetry/logging for new code paths
- Type safety and `any` usage
- Naming and pattern consistency with adjacent files
- Exports that resolve correctly; no dead code introduced

---

## Spec Boundary Requirements
Every new spec MUST include an `## Operating Boundaries` section (Target Files, Out-of-Scope Files, Cross-Spec Dependencies). Copy from `docs/specs/_spec_template.md`.

---

## Domain Rules

> **MANDATORY:** At the start of EVERY task, declare which Domain Mode you are operating in based on which directories you will modify. State the mode explicitly in your first response: "**Domain Mode: Admin**" or "**Domain Mode: Backend/Pipeline**" or "**Domain Mode: Cross-Domain**" (rare — requires reading both rule sets).
>
> The Domain Mode determines which tools, libraries, and rules you must follow. Violating the rules of your declared domain is a §10 compliance failure that blocks the PLAN COMPLIANCE GATE.

### Mode Selection Rule

| If you will modify... | Declare mode |
|----------------------|--------------|
| `src/components/`, `src/app/` (pages, NOT API routes), `src/hooks/`, admin-only `src/lib/` modules | **Admin Mode** |
| `mobile/` (Expo source — non-Maestro changes) | **Admin Mode** — apply Expo conventions from `docs/specs/03-mobile/` |
| `mobile/maestro/` (flow YAML files only) | **WF7** — no mode declaration required |
| `scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/`, pipeline-related `src/lib/` modules | **Backend/Pipeline Mode** |
| Admin UI + API route for the same admin-only feature | **Cross-Domain Mode** — build backend first, then admin UI in one pass |
| API route consumed by the Expo app | **Cross-Domain Mode** — strict contract boundary; write API contract note |
| Doc-only changes, specs, reports | **Either** — follow whichever domain the documented work belongs to |

---

### 🖥️ Admin Mode

When operating in Admin Mode, you MUST adhere to these rules. Required reading before generating an active task:
- `docs/specs/00_engineering_standards.md` §1 (Architecture & UI), §4.3 (Frontend Security), §10 (Boundary), §13 (Observability Standards)

*Note: `src/features/leads/` consumer UI has moved to the Expo repo (`mobile/`). The only Next.js frontend is the admin panel — an internal desktop-first tool.*

**Required tooling stack (no substitutions without prior approval):**

| Concern | Tool | Why |
|---------|------|-----|
| Server state / data fetching | **TanStack Query** | NEVER use `useEffect` for API calls. Always handle loading/error states. |
| Global UI state | **Zustand** | Use for shared filter/selection state across admin views. |
| Local form state | **React Hook Form + Zod resolver** | NEVER use `useState` for form fields |
| API input validation | **Zod** with differentiated 400 error responses (NOT generic 500) | Field-level error messages |
| UI primitives | **Shadcn UI** | Headless, accessible. Run `npx shadcn@latest add [component]` for each. |
| Animations | **Motion for React** (`motion` package, formerly Framer Motion) | Spring config: `stiffness: 400, damping: 20, mass: 1` for button interactions |
| Toast notifications | **Sonner** (via Shadcn) | NEVER build custom alert banners or use `alert()`/`confirm()` |
| Error tracking | **Sentry** wired into `app/[...]/error.tsx` route boundaries | Source maps uploaded on build |
| Auth | **Firebase Auth** with `verifyIdToken` in middleware | Already in production. NEVER swap for Clerk or other providers without architectural approval. |
| Dashboard primitives | **Tremor** (`@tremor/react`) | `<ProgressCircle>`, `<BarList>`, `<Tracker>` for data viz. Pairs with Shadcn — both copy-paste, both Apache 2.0. |
| Design quality | **Impeccable** Claude Code plugin (`pbakaus/impeccable`) | 20 commands for layout, typography, motion, accessibility audits. Run `/critique` after building each component, `/polish` + `/audit` before final commit. |

**Rules to never violate:**

1. **No floating promises** — every async call inside a handler must be `await`-ed or chained with `.catch()`.
2. **No `useEffect` for data fetching** — use TanStack Query. Period.
3. **No secrets in `'use client'` components** — public Firebase config only. Admin keys, API tokens, anything else stays server-side.
4. **No `dangerouslySetInnerHTML` without DOMPurify** — XSS guard.
5. **No `console.log` in committed code** — use `Sentry.captureException()` for errors.
6. **API → Expo contract:** If an API route is consumed by the Expo app (not just the admin panel), treat it as a Cross-Domain task. Do not change the response shape without a contract note.

**Pre-commit gauntlet (admin UI files):**
1. TypeScript strict check (`npm run typecheck`)
2. ESLint (`npm run lint`)
3. Vitest related tests (`npx vitest related [changed files] --run`)

---

### 🛢️ Backend / Pipeline Mode

When operating in Backend/Pipeline Mode, you MUST adhere to these rules. Required reading before generating an active task:
- `docs/specs/00_engineering_standards.md` §2 (Error Handling), §3 (Database), §6 (Logging), §7 (Dual Code Path), §9 (Pipeline & Script Safety), §10 (Boundary)
- `docs/specs/pipeline/30_pipeline_architecture.md` (V2 architecture)
- `docs/specs/pipeline/40_pipeline_system.md` (pipeline_runs, manifest, telemetry contracts)
- `docs/specs/pipeline/47_pipeline_script_protocol.md` (NEW SCRIPT PROTOCOL — mandatory for any new pipeline step or WF3 on existing scripts)
- `docs/specs/01_database_schema.md` (current schema)

**Required tooling stack:**

| Concern | Tool | Why |
|---------|------|-----|
| Linting | **ESLint** (CommonJS scripts) — existing setup | Pipeline scripts use CommonJS, ESLint handles them well. Do NOT replace with Biome here. |
| SQL linting | **SQLFluff** for new migrations only | Boy Scout Rule: existing migrations grandfathered. New migrations must pass `sqlfluff lint --dialect postgres` |
| Migration safety | **`scripts/validate-migration.js`** pre-commit script | Catches `DROP TABLE`, `DROP COLUMN`, non-CONCURRENTLY indexes on big tables, missing DOWN block |
| Database access | **`src/lib/db/client.ts`** pool | NEVER instantiate `new Pool()` directly. Use the shared client. |
| Pipeline scripts | **Pipeline SDK** (`scripts/lib/pipeline.js`) | `pipeline.run`, `withTransaction`, `streamQuery`, `emitSummary`, `emitMeta`. NEVER hand-roll DB connection logic in scripts. |
| Logging | **`src/lib/logger.ts`** (`logError`, `logWarn`, `logInfo`) | NEVER use bare `console.error`. Every API catch block must use `logError(tag, err, context)`. |
| Type safety | **Drizzle ORM** generated types via `npm run db:generate` | Run after every migration |
| Validation | **Zod** for API input + structured pipeline configs | Same standard as frontend |

**Rules to never violate:**

1. **No empty catch blocks** — ESLint `no-empty` rule enforces. Always log via `logError`.
2. **No `process.exit()` in `src/`** — ESLint `no-restricted-syntax` enforces. Throw errors instead, let the framework handle them.
3. **No `Pool` instantiation outside `src/lib/db/client.ts`** — use the shared pool.
4. **No raw SQL string concatenation** — parameterized queries only (`$1, $2, ...`).
5. **No migration without DOWN block** — `validate-migration.js` enforces.
6. **No `CREATE INDEX` on tables >100K rows without `CONCURRENTLY`** — locks production.
7. **No `DROP COLUMN` or `DROP TABLE` without explicit user confirmation** — destructive operations require approval.
8. **Dual code path discipline** — when modifying classification/scoring/scope logic, update BOTH the TS module AND the JS pipeline script. §7 enforces.
9. **Streaming for large datasets** — use `pipeline.streamQuery()` for any query expected to return >10K rows. NEVER load full result sets into memory.
10. **Idempotent scripts** — every pipeline script must be re-runnable without producing duplicates or corrupted state.

**Pre-commit gauntlet (backend/pipeline files):**
1. ESLint (CommonJS + TypeScript)
2. SQLFluff (new migration files)
3. `validate-migration.js` (migration safety)
4. TypeScript strict check
5. Vitest related tests

---

### Cross-Domain Mode

Two scenarios require Cross-Domain Mode:

**A. Admin UI + API route (same admin-only feature):**
1. Read both rule blocks above before proceeding.
2. Build the API route first (Backend/Pipeline Mode rules), then the admin UI consumer (Admin Mode rules). These can happen in the same session.
3. Write a **handoff note** in the active task between phases — the JSON contract established.
4. Both gauntlets apply to their respective files.

**B. API route consumed by the Expo app (strict contract boundary):**
1. The Expo app is a separate client — breaking changes to response shape will silently break mobile users.
2. Before implementing: define the TypeScript interface in `src/app/api/[route]/types.ts`.
3. After implementing: document the change in the relevant spec. If `npm run openapi:generate` is wired, run it.
4. Write a **contract note** in the active task: endpoint path, method, request params, response shape diff.
5. Coordinate with the Expo mobile repo — it consumes these types.

