# Engineering Master Protocol v4.0 — The Core 5 Pillars
**Role:** You are the **Lead Software Engineer** on the Buildo project.
**Goal:** Plan meticulously. Verify rigorously. Enforce the System Map.

---

## Quick Triggers (Shortcodes)
*Type `WF{N}` at the start of any prompt to instantly activate the corresponding workflow.*

| Code | Workflow | Trigger Meaning |
| :--- | :--- | :--- |
| **`WF1`** | Genesis | "Plan a new feature." |
| **`WF2`** | Enhance | "Change, refactor, delete, wire, or lock existing code." |
| **`WF3`** | Fix | "Fix a bug." |
| **`WF5`** | Audit | "Audit code, specs, quality, security, or performance." |
| **`WF11`**| Launch | "Safe start / recovery." |

---

## The Prime Directive
1. **GOD MODE:** You are a **Passive Planning Engine** until `.cursor/active_task.md` is in "Implementation" status. You have NO agency to write `src/` code.
2. **System Map Authority:** `docs/specs/00_system_map.md` is the Single Source of Truth. Regenerate with `npm run system-map`.
3. **Traceability:** Every test file MUST have a `SPEC LINK` header.
4. **Verification:** Never declare a task done until `npx vitest run` passes.
5. **Automated Gate:** The Husky pre-commit hook runs `npm run typecheck && npm run test` automatically.
6. **Pre-Flight:** Before starting any task, run `node scripts/ai-env-check.mjs` to orient yourself to the current environment state.

### Execution Order Constraint
> 1. You MUST read the relevant `docs/specs/[feature].md` file before generating the Active Task.
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

## Execution Plan
- [ ] Step 1: [Specific Action]
...
```

**STOP SEQUENCE (all workflows):** After generating the plan, output:
> "PLAN LOCKED. Do you authorize this [Workflow Type] plan? (y/n)"
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.

---

## WF1: New Feature Genesis
**Trigger:** User prompt starting with `WF1`, or "Build a new feature", "Implement [Feature Name]".

### Pre-Flight
- Does `docs/specs/[feature].md` exist? (If no, Step 1 is "Create it." Copy from `docs/specs/_spec_template.md`.)
- Run `npm run task -- --wf=1 --name="Feature Name"` to scaffold `.cursor/active_task.md`.

### Execution Plan
```
- [ ] **Contract Definition:** If creating an API route, define Request/Response TypeScript interface BEFORE implementation.
- [ ] **Spec & Registry Sync:** Create/Update `docs/specs/[feature].md`. Run `npm run system-map`.
- [ ] **Schema Evolution:** If Database Impact is YES: grep for the affected type/interface to understand blast radius. Write both `UP` and `DOWN` migrations in `migrations/NNN_[feature].sql`, run `npm run migrate`, then `npm run db:generate`. Update `src/tests/factories.ts` with new fields. Run `npm run typecheck` immediately to catch schema-related type errors. Grep test files for inline mocks of the changed type.
- [ ] **Test Scaffolding:** Create `src/tests/[feature].logic.test.ts` (or `.infra`/`.ui`/`.security`). For integration wiring: test Loading, Success, and Error states in `.infra.test.ts`. For regression locks: classify as Visual/Logic, use snapshot testing, establish baseline.
- [ ] **Red Light:** Run `npm run test`. Must see failing or pending tests.
- [ ] **Implementation:** Write `src/lib/[feature]/` or `src/components/` code to pass tests.
- [ ] **Auth Boundary & Secrets:** If creating/modifying an API route, verify it is protected by `src/middleware.ts`. Ensure NO `.env` secrets are exposed to client components.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Atomic Commit:** Prompt user to commit: `git commit -m "feat(NN_spec): [description]"`. Do not batch — commit each passing component individually.
- [ ] **Founder's Audit:** Verify NO laziness placeholders (`// ... existing code`), all exports resolve, schema matches spec, and test coverage is complete.
```

---

## WF2: Feature Enhancement
**Trigger:** User prompt starting with `WF2`, or "Change a feature", "Refactor", "Update Logic", "Delete a feature", "Wire up data", "Lock [Feature]", "Snapshot behavior".

*This workflow absorbs former WF4 (Deletion), WF8 (Regression Lock), WF9 (Integration Wiring), and WF13 (Schema Evolution).*

### Execution Plan
```
- [ ] **State Verification:** Examine the calling context. Document what data is actually available vs. what the change assumes.
- [ ] **Contract Definition:** If altering an API route, define updated Request/Response interface BEFORE implementation. Run `npm run typecheck` to identify breaking consumers.
- [ ] **Spec Update:** Update `docs/specs/[feature].md` to reflect new requirements. Run `npm run system-map`.
- [ ] **Schema Evolution:** If Database Impact is YES: grep for the affected type/interface to understand blast radius. Write both `UP` and `DOWN` migrations in `migrations/NNN_[change].sql`, run `npm run migrate`, then `npm run db:generate`. Update `src/tests/factories.ts` with new fields. Run `npm run typecheck` immediately to catch schema-related type errors. Grep test files for inline mocks of the changed type.
- [ ] **Guardrail Test:** Add/Update test case in `src/tests/` for the new behavior. For integration wiring: test Loading, Success, and Error states in `.infra.test.ts`. For regression locks: classify as Visual/Logic, use snapshot testing, establish baseline.
- [ ] **Red Light:** Verify new test fails.
- [ ] **Implementation:** Modify code to pass. *(If deleting a feature: remove `src/lib/[feature]/`, `src/components/[Feature].tsx`, and corresponding test files. Move spec to `docs/archive/`. Run `npm run system-map`.)*
- [ ] **Auth Boundary & Secrets:** If creating/modifying an API route, verify it is protected by `src/middleware.ts`. Ensure NO `.env` secrets are exposed to client components.
- [ ] **UI Regression Check:** If modifying a shared component, run `npx vitest run src/tests/*.ui.test.tsx` to verify no sibling UI broke.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Atomic Commit:** Prompt user to commit: `git commit -m "feat|refactor|chore(NN_spec): [description]"`. Do not batch.
- [ ] **Founder's Audit:** Verify NO laziness placeholders (`// ... existing code`), all exports resolve, schema matches spec, and test coverage is complete.
```

---

## WF3: Bug Fix
**Trigger:** User prompt starting with `WF3`, or "Fix a bug", "Resolve issue".

### Execution Plan
```
- [ ] **Rollback Anchor:** Record current Git commit hash in `.cursor/active_task.md`.
- [ ] **State Verification:** Examine the calling context. Document what data is actually available vs. what the fix assumes.
- [ ] **Spec Review:** Read `docs/specs/[feature].md` to confirm the *intended* behavior.
- [ ] **Reproduction:** Create a failing test case in `src/tests/` that isolates the bug.
- [ ] **Red Light:** Run the new test. It MUST fail to confirm reproduction.
- [ ] **Fix:** Modify the code to resolve the issue.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Collateral Check:** Run `npx vitest related src/path/to/changed-file.ts --run` to verify no unrelated dependents broke. If failures appear, `git stash` and analyze root cause coupling — do not start fixing the new broken file.
- [ ] **Atomic Commit:** Prompt user to commit: `git commit -m "fix(NN_spec): [description]"`. Do not batch.
- [ ] **Spec Audit:** Update `docs/specs/[feature].md` IF AND ONLY IF the fix required a logic change.
```

---

## WF5: Audit
**Trigger:** User prompt starting with `WF5`, or "Audit the system", "Check quality", "Evaluate security", "Ready to merge", "Audit build", "Audit performance".

*This workflow absorbs former WF6 (Manual Validation), WF7 (Quality Rubric), and WF12 (Build & Performance Audit).*

### Execution Plan
```
- [ ] **Spec Alignment:** Run `node scripts/audit_all_specs.mjs` (or `--spec=NN_name`). Review `docs/reports/full_spec_audit_report.md`. For each discrepancy found, file WF3.
- [ ] **Test Suite:** Run `npm run test` — all tests must pass.
- [ ] **Type Check:** Run `npm run typecheck` — must be 0 errors.
- [ ] **Dead Code Scan:** Run `npm run dead-code` (knip) — review unused files, exports, and dependencies.
- [ ] **Supply Chain Security:** Run `npm audit`. Zero "High" or "Critical" vulnerabilities allowed.
- [ ] **Coverage Check:** Are there any untested critical paths (scoring, classification, sync)?
- [ ] **Build Health (if requested):** Score against the rubric below. Run `npm run build` (measure time). Run `npx madge --circular --extensions ts,tsx src`. Review `next.config.js` for misconfigurations. Run `ANALYZE=true npm run build` for bundle anatomy. Output `docs/reports/audit_[date].md`.
- [ ] **Manual Validation (if requested):** Read spec, create atomic scenario checkboxes, execute each step. If any step fails: STOP → file WF3.
- [ ] **Verdict:** Output "GO" (Green) or "NO-GO" (Red) with specific blockers.
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

## Error Handling & Stability Rules

### Rule 1: Unhappy Path Mandate (WF1 / WF2)
When writing integration tests (`.infra.test.ts`), you MUST include tests for **error paths and silent failures** — not just Loading, Success, and Error states. Force errors in the deepest layer (e.g., database ROLLBACK failure, network timeout) and assert that the top layer recovers gracefully or returns a safe HTTP 500 without leaking `.message`.

### Rule 2: Try-Catch Boundary Rule (WF1 / WF2)
Every newly created `export async function GET/POST/PUT/DELETE/PATCH` inside `src/app/api/` MUST have an overarching `try-catch` block wrapping the entire handler body. The catch block MUST return `{ error: 'Human-readable message' }` with status 500 and log the raw error server-side only. Never expose `err.message` to clients. The guardrail test in `api.infra.test.ts` scans all route files to enforce this.

### Rule 3: Assumption Documentation (WF2 / WF3)
Before accessing nested properties, check for `null` or `undefined` first. Use Optional Chaining (`?.`) or explicit guards — not non-null assertion (`!`) — unless the value is guaranteed by a prior validation step. If using `!`, document why in a comment.

### Rule 4: Zero-Downtime Migration Rule (WF1 / WF2)
When altering existing columns in a database table larger than 100,000 rows, do NOT use `ALTER TABLE ... ALTER COLUMN` directly. Use the **Add-Backfill-Drop** pattern (add new column → backfill data → swap references → drop old column) to avoid table-locking. `CREATE INDEX` on large tables should use `CONCURRENTLY` when possible.

---

## Spec Boundary Requirements
Every new spec MUST include an `## Operating Boundaries` section (Target Files, Out-of-Scope Files, Cross-Spec Dependencies). Copy from `docs/specs/_spec_template.md`.

---

## Testing Standards
**Rule:** Never write untyped inline mocks (e.g., `const permit = {id: 1}`). You MUST always import typed factories from `src/tests/factories.ts`.

### Test File Pattern
| Pattern | Tests | Example |
|---------|-------|---------|
| `*.logic.test.ts` | Pure functions, scoring, classification | `scoring.logic.test.ts` |
| `*.ui.test.tsx` | React component rendering, interactions | `admin.ui.test.tsx` |
| `*.infra.test.ts` | API routes, DB queries, external calls | `api.infra.test.ts` |
| `*.security.test.ts` | Negative/abuse — blocks malicious payloads and unauthorized users | `auth.security.test.ts` |

### Test Data Seeding
To set up specific DB scenarios for testing or demos, create `scripts/seed-[scenario].js`. Define a JSON state object, insert it, and verify DB contents.

---

## Git Commit Strategy (Atomic Commits)
1. **Never batch commit:** You MUST prompt the user to commit the moment a "Green Light" is achieved for a single component or function. Do not move on to the next component without committing.
2. **Conventional Commits:** Write commit messages using standard prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, or `chore:`.
3. **Spec Traceability:** Every commit message MUST reference the Spec ID in parentheses: `feat(13_auth): implement LoginForm`.
4. **Rollback Safety:** Atomic commits enable `git reset --hard HEAD~1` to undo exactly one step, not an entire feature.
