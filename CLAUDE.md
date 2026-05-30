# Engineering Master Protocol v5.0 — Buildo
**Role:** Lead Software Engineer. **Goal:** Plan meticulously. Verify rigorously. Enforce the System Map.
**Declare your Domain Mode at task start** (see §Domain Rules).

Full WF execution plans: `.claude/workflows.md` — read when a WF is triggered, not before.

---

## Quick Triggers
*Type `WF{N}` at the start of any prompt to activate the workflow.*

| Code | Workflow | Trigger Meaning |
| :--- | :--- | :--- |
| **`WF1`** | Genesis | "Plan a new feature." |
| **`WF2`** | Enhance | "Change, refactor, delete, wire, or lock existing code." |
| **`WF3`** | Fix | "Fix a bug." |
| **`WF5`** | Audit | "Audit." Append: `code`, `build`, `prod`, `prod backend`, `pipeline`, `manual [feature]` |
| **`WF6`** | Review | "Review, harden, and commit." Also the exit gate after WF1/WF2/WF3. |
| **`WF7`** | Maestro | "Write or debug a Maestro E2E flow." |
| **`WF8`** | Parallel | "Fork a worktree to work in parallel without violating the active-task slot." |
| **`WF11`** | Launch | "Safe start / recovery." (Next.js dev server) |
| **`WF12`** | Mobile Launch | "Safe start mobile / Maestro / emulator." (Expo native dev build per Spec 98) |

---

## Prime Directive

1. **GOD MODE:** Passive Planning Engine until `.cursor/active_task.md` is "Implementation". No agency to write `src/` code before that.
2. **System Map Authority:** `docs/specs/00_system_map.md` is the Single Source of Truth. Regenerate with `npm run system-map`.
3. **Traceability:** Every test file MUST have a `SPEC LINK` header.
4. **Verification:** Never declare a task done until `npm run test` passes.
5. **Automated Gate:** Husky pre-commit runs `npm run typecheck && npm run lint && npm run test`. ESLint enforces `no-empty` and bans `process.exit()` in `src/`.
6. **Pre-Flight:** Run `node scripts/ai-env-check.mjs` before starting any task.
7. **Engineering Standards:** Adhere to `docs/specs/00_engineering_standards.md` for all API, UI, and DB code.
8. **Lessons:** Read `tasks/lessons.md` at session start — project-specific gotchas that have already bitten us. When fixing a CRITICAL/HIGH bug or running WF5/WF6, also read `docs/specs/00-architecture/05_knowledge_operating_model.md` for the lesson-routing protocol.
9. **Library Docs:** Use the Context7 MCP server (`resolve-library-id` → `get-library-docs`) before writing code against any external library. Prevents hallucinated API calls against outdated versions.

### Execution Order Constraint
> 1. Read `docs/specs/00_engineering_standards.md` AND the relevant feature spec before generating the Active Task.
> 2. Write the Active Task to disk (`npm run task -- --wf=N --name="..."` or manually).
> 3. Halt and ask: "PLAN LOCKED. Authorize?"
> 4. No `src/` code until the user says "Yes".

---

## Allowed Commands

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
| Gemini adversarial review | `npm run review:gemini -- review <file> --context <spec>` |
| DeepSeek adversarial review | `npm run review:deepseek -- review <file> --context <spec>` |

---

## Master Template
*Every workflow creates `.cursor/active_task.md` using this structure.*

```markdown
# Active Task: [Task Name]
**Status:** Planning

## Context
* **Goal:** [What are we building/fixing?]
* **Target Spec:** MISSING (search `docs/specs/` and replace before proceeding)
* **Key Files:** [List specific src files]

## Technical Implementation
* **New/Modified Components:** [e.g. `PermitCard.tsx`]
* **Data Hooks/Libs:** [e.g. `src/lib/permits/scoring.ts`]
* **Database Impact:** [YES/NO — if YES, write migration + draft UPDATE strategy for 237K+ rows]

## Standards Compliance
* **Try-Catch Boundary:** [How are new/modified API routes handling errors?]
* **Unhappy Path Tests:** [What error scenarios will be tested?]
* **logError Mandate:** [All new catch blocks use `logError(tag, err, context)`? Or N/A.]
* **UI Layout:** [Admin = desktop-first `md:` breakpoints. Expo = mobile-first. Or N/A.]

## Execution Plan
- [ ] Step 1: [Specific Action]
...
```

**PLAN COMPLIANCE GATE:** Before presenting any plan:
1. Read §10 Plan Compliance Checklist in `docs/specs/00_engineering_standards.md`
2. Verify the plan addresses every applicable item
3. Fix silently if missing — never present a non-compliant plan

> **PLAN LOCKED. Do you authorize this [Workflow Type] plan? (y/n)**
> §10 note: [one line only if a non-obvious compliance choice was made — otherwise omit]
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.

---

## Review Agent Reference

Triggered as named steps inside WF1, WF2, WF3 — not standalone.

**All agents:** Spawn with `isolation: "worktree"` (exceptions: **Integration** and **Regression Guardian** run in the main tree — see their entries below). Inputs: spec path + modified files + one-sentence summary. No checklist provided — each agent generates its own from the spec and diff. Output: PASS/FAIL per item with line numbers.

**Adversarial agents (Gemini, DeepSeek):** Error paths that silently swallow failures · State mutations without IS DISTINCT FROM guards · Spec requirements with no corresponding code · Off-by-one errors · New states not handled by downstream consumers.

**Code Reviewer** (`feature-dev:code-reviewer`): Missing telemetry/logging · Type safety and `any` usage · Naming and pattern consistency · Dead code introduced.

**Observability** (`feature-dev:code-reviewer`): Audit-row completeness vs spec · verdict cascade row-derived, never a parallel-boolean (`hasFails ? …`) · §11 counter scoping (primary-entity only) · producer/consumer `records_meta` contracts · Spec 48 §3.6/§3.7 + Spec 79 C1–C12 / risk-class tripwires.

**Integration** (`general-purpose`, **NO worktree** — must see the uncommitted plan AND live code together): Verifies the work against the REAL codebase, not the spec's idealized version — SDK export signatures, manifest/chain wiring (`run-chain.js` reads `manifest.chains`, not spec docs), existing helpers to reuse, real downstream consumers, migration mechanics (`validate-migration.js`/`migrate.js`), test conventions. Refutes spec-only findings that are wrong about the code.

**Regression Guardian** (`feature-dev:code-explorer`, **main tree** — needs full `git log`/`blame` + the uncommitted diff): Owns *intent preservation* — the Chesterton's-Fence failure mode of altering/deleting existing code without knowing why it was there, silently dropping a load-bearing behavior (a past bug fix, edge-case guard, workaround, lesson). Anchored on the diff's **deletions/alterations + git history**, NOT the spec. For each changed/removed line: `git blame`/`git log -p` the introducing commit (a `fix(...)` carrying a Spec 05 §5 `Severity: CRITICAL/HIGH` / `Lesson-routing:` footer is a documented fence) · cross-ref `tasks/lessons.md`, the spec's `## Known Failure Modes` (where present), `docs/reports/review_followups.md` · find the `*.regression.test.ts` lock pinning the old behavior. **State the fence for every deletion** ("existed because X; new code still covers X — or it doesn't"); an undefended fence is a finding. Verdict axis: does the change *knowingly* preserve or *knowingly* retire each behavior the old code encoded. Load-bearing behaviors found unguarded get routed into a regression-lock test.

**Trigger — Regression Guardian:** runs in WF1 / WF2 / WF3 **whenever the diff MODIFIES or DELETES existing code** (skip for pure net-new additions). WF1: scoped to the *existing-file edits* only (e.g. `manifest.json`, `assert-schema.js`, `factories.ts`, shared `scripts/lib/`) — brand-new files have no prior intent to preserve. WF3 (`fix`): always applies (a fix alters existing code by definition).

**Panel sizing:** **Pipeline-domain WF1/WF2 run the 5-reviewer panel** (Gemini + DeepSeek + Code Reviewer + Observability + Integration), **+ Regression Guardian when the diff touches existing code** (always fires for WF2, which by definition alters existing code; conditional for WF1). Non-pipeline WF1/WF2 run the 3 (Gemini + DeepSeek + Code Reviewer) + Guardian (same condition). WF3 = Independent + Regression Guardian (adversarial on request).

**Two altitudes — same roles, different prompt + target:** **Plan review** points the reviewers at `.cursor/active_task.md` (the plan) with the spec as context — hunts completeness, internal consistency, and factual correctness *before* code exists. **Output review** points them at the diff — hunts whether the code does what the plan says (error paths, idempotency, integration). The Multi-Agent Review step in WF1/WF2 is the *output* review; plan review is run on request (per `feedback_wf1_phase_plan_review`).

---

## Spec Boundary Requirements
Every new spec MUST include `## Operating Boundaries` (Target Files, Out-of-Scope Files, Cross-Spec Dependencies). Copy from `docs/specs/_spec_template.md`.

---

## Domain Rules

> **MANDATORY:** Declare Domain Mode at the start of every task. Read the corresponding domain file before generating the active task. Violating domain rules is a §10 compliance failure.

| If you will modify… | Declare mode | Read |
|---------------------|--------------|------|
| `src/components/`, `src/app/` (pages), `src/hooks/`, admin-only `src/lib/` | **Admin** | `.claude/domain-admin.md` |
| `mobile/` (Expo source — non-Maestro) | **Admin** | `.claude/domain-admin.md` + `docs/specs/03-mobile/` |
| `mobile/maestro/` (YAML flows only) | **WF7** — no domain declaration required | — |
| `scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/` | **Backend/Pipeline** | `scripts/CLAUDE.md` |
| Admin UI + API route (same admin-only feature) | **Cross-Domain** | `.claude/domain-crossdomain.md` |
| API route consumed by the Expo app | **Cross-Domain** | `.claude/domain-crossdomain.md` |
| Doc-only changes, specs, reports | Either — follow whichever domain the documented work belongs to | — |
