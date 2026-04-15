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
| **`WF11`**| Launch | "Safe start / recovery." |

---

## The Prime Directive
1. **GOD MODE:** You are a **Passive Planning Engine** until `.cursor/active_task.md` is in "Implementation" status. You have NO agency to write `src/` code.
2. **System Map Authority:** `docs/specs/00_system_map.md` is the Single Source of Truth. Regenerate with `npm run system-map`.
3. **Traceability:** Every test file MUST have a `SPEC LINK` header.
4. **Verification:** Never declare a task done until `npx vitest run` passes.
5. **Automated Gate:** The Husky pre-commit hook runs `npm run typecheck && npm run lint && npm run test` automatically. ESLint enforces `no-empty` (bans empty catch blocks) and `no-restricted-syntax` (bans `process.exit()` in src/).
6. **Pre-Flight:** Before starting any task, run `node scripts/ai-env-check.mjs` to orient yourself to the current environment state.
7. **Engineering Standards:** When writing API, frontend, or database code, you MUST adhere to the stability, testing, and mobile-first rules in `docs/specs/00_engineering_standards.md`.
8. **Mobile-First UI:** All Tailwind styling MUST be written mobile-first (base classes = mobile, `md:` / `lg:` = desktop). Every new spec must include a `## 5. Mobile & Responsive Behavior` section.

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
* **Mobile-First:** [How are layouts structured for mobile? Or N/A if backend-only.]

## Execution Plan
- [ ] Step 1: [Specific Action]
...
```

**PLAN COMPLIANCE GATE (all workflows):** Before presenting the plan:
1. Read §10 Plan Compliance Checklist in `docs/specs/00_engineering_standards.md`
2. Verify the plan addresses every applicable item
3. If any item is missing, fix the plan silently — do NOT present non-compliant plans

**STOP SEQUENCE:** After the plan passes compliance, output the compliance
summary followed by the lock prompt. The summary MUST be visible in the
response (not just in active_task.md):

> **§10 Compliance:** For each applicable category, list EVERY sub-item
> from §10 with its status. Do not summarize — show each checklist item.
> Mark inapplicable categories as ⬜ N/A.
>
> - ✅/⬜ DB: [each sub-item or N/A]
> - ✅/⬜ API: [each sub-item or N/A]
> - ✅/⬜ UI: [each sub-item or N/A]
> - ✅/⬜ Shared Logic: [each sub-item or N/A]
> - ✅/⬜ Pipeline: [each sub-item or N/A]
>
> **PLAN LOCKED. Do you authorize this [Workflow Type] plan? (y/n)**
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
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
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
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
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
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
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
- [ ] **Verdict (MUST be visible in response):** Output ALL 7 WF6 steps
      using ✅/⬜ format: Scope, each of the 5 sweep points, Collateral Check,
      Founder's Audit, Auto-Fix. Final line: "CLEAN" or "N gaps remain: [list]".
- [ ] **Atomic Commit:** `git commit -m "[type](NN_spec): [description]"`.
      Conventional prefixes: feat/fix/refactor/test/docs/chore.
      Commit each component individually — do not batch.
```

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

## Independent Review Agent
After implementing any WF1/WF2/WF3, spawn an independent review agent in an isolated worktree before committing. The agent acts as a second pair of eyes that doesn't share your implementation context.

### Agent Protocol
1. **Spawn** with `isolation: "worktree"` so it reads committed + staged state independently.
2. **Inputs:** Provide ONLY these — do NOT provide a pre-built checklist:
   - The target spec path (e.g., `docs/specs/38_inspection_scraping.md`)
   - The list of modified files
   - A 1-sentence summary of what changed and why
3. **Agent task:** The agent must:
   a. Read the spec's Behavioral Contract and Operating Boundaries
   b. Read each modified file in full
   c. **Generate its own evaluation checklist** based on what the spec requires and what the code does — not what the implementor claims it does
   d. Evaluate each checklist item as PASS/FAIL with line numbers
   e. Check for gaps the implementor may not have considered:
      - Error paths that silently swallow failures
      - State mutations without IS DISTINCT FROM guards
      - Missing telemetry/logging for new code paths
      - Spec requirements that exist in the spec but have no corresponding code
      - Off-by-one errors in thresholds or date math
      - New values/states that aren't handled by downstream consumers
4. **Output:** Return a structured report: checklist items, PASS/FAIL counts, and specific gaps with line numbers.
5. **Action:** Fix any FAIL items before committing.

### Why self-generated checklists
If the implementor writes the checklist, the agent only validates what was intended — not what was missed. Self-generated checklists catch the "unknown unknowns" that the implementor's bias filters out.

---

## Spec Boundary Requirements
Every new spec MUST include an `## Operating Boundaries` section (Target Files, Out-of-Scope Files, Cross-Spec Dependencies). Copy from `docs/specs/_spec_template.md`.

---

## Domain Rules

> **MANDATORY:** At the start of EVERY task, declare which Domain Mode you are operating in based on which directories you will modify. State the mode explicitly in your first response: "**Domain Mode: Frontend**" or "**Domain Mode: Backend/Pipeline**" or "**Domain Mode: Cross-Domain**" (rare — requires reading both rule sets).
>
> The Domain Mode determines which tools, libraries, and rules you must follow. Violating the rules of your declared domain is a §10 compliance failure that blocks the PLAN COMPLIANCE GATE.

### Mode Selection Rule

| If you will modify... | Declare mode |
|----------------------|--------------|
| `src/features/`, `src/components/`, `src/app/` (pages, NOT API routes), `src/hooks/`, frontend-only `src/lib/` modules | **Frontend Mode** |
| `scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/`, pipeline-related `src/lib/` modules | **Backend/Pipeline Mode** |
| Both (e.g., adding a new API route + UI consumer) | **Cross-Domain Mode** — read BOTH rule blocks below before proceeding |
| Doc-only changes, specs, reports | **Either** — follow whichever domain the documented work belongs to |

---

### 🎨 Frontend Mode

When operating in Frontend Mode, you MUST adhere to these rules. Required reading before generating an active task:
- `docs/specs/00_engineering_standards.md` §1 (Architecture & UI), §4.3 (Frontend Security), §10 (Boundary), §12 (Frontend Foundation Tooling), §13 (Observability Standards)
- `docs/specs/product/future/74_lead_feed_design.md` (industrial utilitarian design system, color tokens, spacing)
- `docs/specs/product/future/75_lead_feed_implementation_guide.md` (component-by-component blueprint, foundation tooling)

**Required tooling stack (no substitutions without prior approval):**

| Concern | Tool | Why |
|---------|------|-----|
| Linting | **Biome** (scoped to `src/features/leads/` initially, expanding) | Catches React logic failures: `useHookAtTopLevel`, `noFloatingPromises`, `useExhaustiveDependencies` |
| Server state / data fetching | **TanStack Query** | NEVER use `useEffect` for API calls. Always handle loading/error states. |
| Offline persistence | **TanStack Query Persist Client + IndexedDB (idb-keyval)** | 24h cache, key normalization on lat/lng to ~3 decimals |
| Global UI state | **Zustand** with `persist` middleware for filter state | NEVER use React Context for global state inside `src/features/leads/` (AST-grep enforced). Context allowed elsewhere for 3rd-party providers only. |
| Local form state | **React Hook Form + Zod resolver** | NEVER use `useState` for form fields |
| API input validation | **Zod** with differentiated 400 error responses (NOT generic 500) | Field-level error messages |
| UI primitives | **Shadcn UI** | Headless, accessible, mobile-touch-friendly. Run `npx shadcn@latest add [component]` for each. |
| Bottom sheets | **Shadcn `<Drawer>`** (powered by Vaul) | iOS cubic-bezier `[0.32, 0.72, 0, 1]`. NEVER use centered `<Dialog>` modals on mobile. |
| Animations / gestures | **Motion for React** (`motion` package, formerly Framer Motion) | Spring config: `stiffness: 400, damping: 20, mass: 1` for button interactions |
| Toast notifications | **Sonner** (via Shadcn) | NEVER build custom alert banners or use `alert()`/`confirm()` |
| Long lists | **TanStack Virtual** | Any list expected to exceed 50 items MUST be virtualized. NEVER `.map()` long arrays directly. |
| Telemetry | **PostHog** via `src/lib/observability/capture.ts` `captureEvent()` wrapper | Every user interaction (`onClick`, `onSubmit`) MUST call `captureEvent()` (AST-grep enforced in `src/features/leads/`) |
| Error tracking | **Sentry** wired into `app/[...]/error.tsx` route boundaries | Source maps uploaded on build |
| Auth | **Firebase Auth** with `verifyIdToken` in middleware | Already in production. NEVER swap for Clerk or other providers without architectural approval. |
| Score circles / dashboard primitives | **Tremor** (`@tremor/react`) | `<ProgressCircle>`, `<BarList>`, `<Tracker>` for data viz. Pairs with Shadcn — both copy-paste, both Apache 2.0. |
| Map (frontend) | **`@vis.gl/react-google-maps`** with `AdvancedMarker` | Official Google library. For richer marker visuals, escalate to OverlayView + createPortal pattern. |
| Infinite scroll + pull-to-refresh | **`react-infinite-scroll-component`** | Single library handles BOTH behaviors (4.15kB). Do NOT install separate scroll-trigger + pull-refresh libraries. |
| Design quality | **Impeccable** Claude Code plugin (`pbakaus/impeccable`) | 20 commands for layout, typography, motion, accessibility audits. Run `/critique` after building each component, `/polish` + `/audit` before final commit. |

**Rules to never violate:**

1. **No floating promises** — every async call inside a handler must be `await`-ed or chained with `.catch()`. Biome enforces.
2. **No `useEffect` for data fetching** — use TanStack Query. Period.
3. **No React Context inside `src/features/leads/`** — use Zustand. AST-grep blocks the commit.
4. **No `onClick` without `captureEvent()`** — telemetry is mandatory in `src/features/leads/`. AST-grep blocks the commit.
5. **No centered modals on mobile** — use Shadcn `<Drawer>`. Required for any popup/sheet/menu.
6. **No `.map()` over arrays expected to exceed 50 items** — wrap in TanStack Virtual.
7. **No secrets in `'use client'` components** — public Firebase config only. Admin keys, API tokens, anything else stays server-side.
8. **No `dangerouslySetInnerHTML` without DOMPurify** — XSS guard. JSX escaping handles 99% of cases.
9. **No `console.log` in committed code** — use `captureEvent()` for product events, `Sentry.captureException()` for errors.
10. **Mobile-first Tailwind** — base classes target mobile, `md:` and `lg:` add desktop. Touch targets ≥ 44px.

**Pre-commit gauntlet (frontend files):**
1. Biome check (logic correctness)
2. AST-grep scan (telemetry + Context ban, scoped to `src/features/leads/`)
3. TypeScript strict check
4. Vitest related tests
5. Lighthouse CI (on PRs only)

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

For tasks that span both domains (e.g., new API route + UI consumer):
1. **Read BOTH rule blocks above** before proceeding.
2. **Sequence the work:** backend first, frontend second. Never both at once.
3. **Write a handoff note** in the active task between phases — what API contract was established, what the frontend will consume.
4. **Two pre-commit gauntlets apply** — backend files run the backend gauntlet, frontend files run the frontend gauntlet.

