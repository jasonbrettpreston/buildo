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
| **`WF11`** | Launch | "Safe start / recovery." |

---

## Prime Directive

1. **GOD MODE:** Passive Planning Engine until `.cursor/active_task.md` is "Implementation". No agency to write `src/` code before that.
2. **System Map Authority:** `docs/specs/00_system_map.md` is the Single Source of Truth. Regenerate with `npm run system-map`.
3. **Traceability:** Every test file MUST have a `SPEC LINK` header.
4. **Verification:** Never declare a task done until `npm run test` passes.
5. **Automated Gate:** Husky pre-commit runs `npm run typecheck && npm run lint && npm run test`. ESLint enforces `no-empty` and bans `process.exit()` in `src/`.
6. **Pre-Flight:** Run `node scripts/ai-env-check.mjs` before starting any task.
7. **Engineering Standards:** Adhere to `docs/specs/00_engineering_standards.md` for all API, UI, and DB code.
8. **Lessons:** Read `tasks/lessons.md` at session start — project-specific gotchas that have already bitten us.
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

**All agents:** Spawn with `isolation: "worktree"`. Inputs: spec path + modified files + one-sentence summary. No checklist provided — each agent generates its own from the spec and diff. Output: PASS/FAIL per item with line numbers.

**Adversarial agents (Gemini, DeepSeek):** Error paths that silently swallow failures · State mutations without IS DISTINCT FROM guards · Spec requirements with no corresponding code · Off-by-one errors · New states not handled by downstream consumers.

**Code Reviewer:** Missing telemetry/logging · Type safety and `any` usage · Naming and pattern consistency · Dead code introduced.

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
