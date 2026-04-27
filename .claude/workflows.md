# WF Execution Plans

Full execution plan bodies for all workflows. Referenced by CLAUDE.md Quick Triggers.
Loaded on demand when a WF is triggered — not auto-loaded every session.

---

## WF1: New Feature Genesis

### Pre-Flight
- Does `docs/specs/[feature].md` exist? (If no, Step 1 is "Create it.")
- Run `npm run task -- --wf=1 --name="Feature Name"`.

### Execution Plan
*Include every step verbatim. If a step does not apply, keep the name and write N/A with a reason.*

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
      response BEFORE running tests.
- [ ] **Multi-Agent Review:** In ONE message send three parallel tool calls.
      No checklist provided to any agent; each generates its own from the spec + diff.
      - **Tool call 1 — Bash:** `npm run review:gemini -- review <file> --context <spec>`
        Focus: spec-vs-code gaps, missing edge cases, failure modes, silent swallowed errors.
      - **Tool call 2 — Bash:** `npm run review:deepseek -- review <file> --context <spec>`
        Focus: logic errors, wrong assumptions, downstream consumers not handling new states.
      - **Tool call 3 — Agent** (`subagent_type: "feature-dev:code-reviewer"`, `isolation: "worktree"`):
        Provide: spec path + modified files list + one-sentence summary.
        Focus: error path coverage, type safety, naming/patterns.
      **Triage:** BUG (blocking) → file WF3 immediately. DEFER → `docs/reports/review_followups.md`.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste final test
      summary line and typecheck result. Both must show zero failures.
      List each prior step as DONE or N/A. → WF6.
```

---

## WF2: Feature Enhancement

*Absorbs former WF4 (Deletion), WF8 (Regression Lock), WF9 (Integration Wiring), WF13 (Schema Evolution).*

### Execution Plan
*Include every step verbatim. If a step does not apply, keep the name and write N/A with a reason.*

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
- [ ] **Pre-Review Self-Checklist:** Generate a 5-10 item self-skeptical checklist from
      the spec section governing the change. Walk each item against the ACTUAL diff.
      Output PASS/FAIL per item BEFORE running tests.
- [ ] **Multi-Agent Review:** In ONE message send three parallel tool calls.
      - **Tool call 1 — Bash:** `npm run review:gemini -- review <file> --context <spec>`
      - **Tool call 2 — Bash:** `npm run review:deepseek -- review <file> --context <spec>`
      - **Tool call 3 — Agent** (`subagent_type: "feature-dev:code-reviewer"`, `isolation: "worktree"`):
      **Triage:** BUG → file WF3 immediately. DEFER → `docs/reports/review_followups.md`.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste evidence. → WF6.
```

---

## WF3: Bug Fix

### Execution Plan
*Include every step verbatim. If a step does not apply, keep the name and write N/A with a reason.*

```
- [ ] **Rollback Anchor:** Record current Git commit hash in active task.
- [ ] **State Verification:** Document what data is available vs. assumed.
- [ ] **Spec Review:** Read `docs/specs/[feature].md` for intended behavior.
- [ ] **Reproduction:** Create failing test that isolates the bug.
- [ ] **Red Light:** Run test. MUST fail to confirm reproduction.
- [ ] **Fix:** Modify code to resolve.
- [ ] **Idempotency Check (Backend/Pipeline only):** If the fix touches a pipeline script,
      confirm it remains safe to re-run: upsert pattern used instead of bare INSERT,
      no unconditional state mutations that compound on re-run. If unclear, add a smoke
      test that runs the script twice against a test fixture and asserts no duplicates.
      N/A for Admin/Frontend fixes.
- [ ] **Pre-Review Self-Checklist:** List 3-5 sibling bugs that could share the same
      root cause. For each, verify either that the fix covers it OR that it doesn't
      apply. Catches the "fixed the symptom, missed the class" pattern.
- [ ] **Independent Review:** Spawn one code reviewer agent (`isolation: "worktree"`).
      Provide: (a) spec path, (b) modified files list, (c) one-sentence summary.
      Agent generates its own checklist — do NOT provide one.
      BUG items → fix before Green Light. DEFER → `docs/reports/review_followups.md`.
      (Adversarial agents — Gemini + DeepSeek — only run for WF3 when explicitly requested.)
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. Paste evidence. → WF6.
```

---

## WF5: Audit

### Core (always runs)
```
- [ ] **Spec Alignment:** Run `node scripts/audit_all_specs.mjs`. Review
      `docs/reports/full_spec_audit_report.md`. For each discrepancy, file WF3.
- [ ] **Test Suite:** Run `npm run test` — all tests must pass.
- [ ] **Type Check:** Run `npm run typecheck` — must be 0 errors.
- [ ] **Dead Code Scan:** Run `npm run dead-code` (knip).
- [ ] **Supply Chain Security:** Run `npm audit`. Zero High or Critical allowed.
- [ ] **Memory Review:** Scan `~/.claude/projects/.../memory/MEMORY.md` for entries that
      reference specific file paths, function names, or numeric metrics. For each claim,
      verify it against the live codebase (file exists, function name matches, count is
      current). Update or remove any entry that no longer matches reality.
- [ ] **Verdict:** Output "GO" (Green) or "NO-GO" (Red) with specific blockers.
```

### Subsection: `WF5 code`
```
- [ ] **Coverage Check:** Any untested critical paths (scoring, classification, sync)?
- [ ] **logError Enforcement:** Grep `src/app/api/` for bare `console.error` — zero allowed.
      Every catch block must use `logError` from `src/lib/logger.ts`.
- [ ] **UI Viewport Audit:** Verify 3 critical shared components test 375px + 44px touch targets.
- [ ] **Verdict:** List gaps. For each, file WF3.
```

### Subsection: `WF5 build`
```
- [ ] **Build:** Run `npm run build` (measure time).
- [ ] **Circular Deps:** Run `npx madge --circular --extensions ts,tsx src`.
- [ ] **Config Review:** Review `next.config.js` for misconfigurations.
- [ ] **Bundle Anatomy:** Run `ANALYZE=true npm run build`.
- [ ] **Score:** Rate each metric against the 7-Point Build Health Rubric.
- [ ] **Report:** Output `docs/reports/audit_[date].md`.
```

### Subsection: `WF5 prod [section]`
```
- [ ] **Scope:** Identify the feature/module/subsystem to audit.
- [ ] **Score:** Rate each of the 10 Production Readiness Vectors (0-3).
- [ ] **Threshold:** All vectors >= 1, average >= 1.5. Any 0 blocks release.
- [ ] **Report:** Output scored table with justification per vector.
```

### Subsection: `WF5 prod backend`
Load `docs/specs/00-architecture/07_backend_prod_eval.md` — fixed 46-check rubric.

### Subsection: `WF5 pipeline`
```
- [ ] **Execution:** Run each chain (permits, coa, sources) — all complete without crash.
- [ ] **Data Quality:** CQA gates pass (assert-schema + assert-data-bounds).
- [ ] **UI Accuracy:** Admin panel reflects actual pipeline state.
- [ ] **Failure Surfacing:** Trigger a pipeline failure → health banner turns yellow/red.
- [ ] **Recovery:** Re-run the failed pipeline → succeeds, banner returns to green.
- [ ] **Verdict:** X/5 checks passed. For each failure, file WF3.
```

### Subsection: `WF5 manual [feature]`
```
- [ ] **Read Spec:** Load `docs/specs/[feature].md`. Identify the Behavioral Contract.
- [ ] **Scenario Checklist:** One checkbox per spec requirement. Each must be atomic.
- [ ] **Execute Scenarios:** For each scenario: execute, record PASS/FAIL, file WF3 on any FAIL.
- [ ] **Edge Cases:** Concurrent triggers, empty states, error responses, mobile viewport (375px).
- [ ] **Verdict:** X/Y scenarios passed. List all WF3s filed.
```

### Build Health Rubric (7-Point)
| Metric | Healthy | Warning | Critical |
| :--- | :--- | :--- | :--- |
| **Build Time** | < 60s | 60s–180s | > 180s |
| **Memory Usage** | < 2GB | 2GB–4GB | > 4GB (OOM) |
| **Type Check** | < 20s | 20s–60s | > 60s |
| **Bundle Size** | < 500KB (Main) | 500KB–2MB | > 2MB |
| **Duplication** | 0 Conflicts | 1-2 Minor | Multiple Heavy |
| **Barrel Depth** | Direct Imports | Mixed | Nested Barrels |
| **Circular Deps** | 0 | 1-5 | > 5 |

### Production Readiness Rubric (10 Vectors)
| # | Vector | What It Evaluates |
| :--- | :--- | :--- |
| 1 | **Correctness** | Logic, edge cases, data integrity |
| 2 | **Reliability** | Fault tolerance, error handling, recovery |
| 3 | **Scalability** | Batch sizes, pagination, memory, N+1 queries |
| 4 | **Security** | Auth, injection, secrets, input validation |
| 5 | **Observability** | Logging, metrics, tracing, alerting |
| 6 | **Data Safety** | Transactions, idempotency, migrations, backups |
| 7 | **Maintainability** | DRY, modularity, documentation, complexity |
| 8 | **Testing** | Unit, integration, e2e coverage, CI gates |
| 9 | **Spec Compliance** | Adherence to engineering standards |
| 10 | **Operability** | Deployment, rollback, config, feature flags |

Scoring: 0 = Not Ready, 1 = Needs Work, 2 = Acceptable, 3 = Exemplary.
Threshold: all >= 1, average >= 1.5. Any 0 blocks release.

---

## WF6: Review

### Execution Plan
```
- [ ] **Scope:** Identify all files modified in the current session.
- [ ] **5-Point Hardening Sweep:** For each modified file:
  1. **Error paths** — Every function has try-catch or throws. No silent `.catch(() => {})`.
  2. **Edge cases** — Null, empty array, 0, undefined handled.
  3. **Type safety** — `npm run typecheck` passes. No `any` without `// SAFETY:`.
  4. **Consistency** — Patterns match adjacent files (naming, error shape, SDK).
  5. **Drift** — If shared logic touched, all consumers updated.
- [ ] **Collateral Check:** `npx vitest related [changed files] --run`.
- [ ] **Founder's Audit:** No laziness placeholders, all exports resolve, schema matches spec.
- [ ] **Auto-Fix:** Apply fixes. `npm run test && npm run lint -- --fix`.
- [ ] **Verdict (MUST be visible):** For each step, state what you found — not a bare checkbox.
      Name specific functions examined for error paths. Paste typecheck output line.
      Paste final test summary line. Final line: "CLEAN" or "N gaps remain: [list]".
- [ ] **Atomic Commit:** `git commit -m "[type](NN_spec): [description]"`.
      Conventional prefixes: feat/fix/refactor/test/docs/chore.
      Commit each component individually — do not batch.
```

---

## WF7: Maestro Flow

*No planning ceremony. No PLAN LOCKED gate. No independent review agent. Flows are YAML — iterate fast.*

### Pre-Flight
- Ensure a **development build** is installed. Expo Go does not work with Maestro.
- Flows live in `mobile/maestro/`. Use existing flows as reference patterns.
- Elements need `testID` props for stable selectors — verify before writing the flow.
- If screen-specific `testID` conventions or routing patterns are unclear, read
  `docs/specs/03-mobile/90_mobile_engineering_protocol.md` before writing.

### Execution Plan
```
- [ ] **Identify Journey:** Name the screen, user actions, and assertions. One flow = one journey.
- [ ] **Selector Audit:** Confirm each tapped element has a `testID` prop in component source.
      If missing, add `testID` to the component first and commit separately (WF2).
- [ ] **Write Flow:** Create or update `mobile/maestro/[feature].yaml`.
      Pattern: `launchApp` → `tapOn`/`inputText` → `assertVisible`/`assertNotVisible`.
- [ ] **Run Locally:** `maestro test mobile/maestro/[feature].yaml`. Iterate until 2 passes.
- [ ] **Flakiness Check:** Run 3 times total. If any run fails, add `waitUntilVisible` guards
      or `optional: true` on timing-sensitive assertions before declaring stable.
- [ ] **Commit:** `git commit -m "test(maestro): [description]"`. No WF6 required for flow-only changes.
```

CI note: Smoke flows run on every PR via Maestro Cloud + EAS Workflows; full suite runs nightly.
Do not modify `.eas/workflows/` config without a WF2.

---

## WF11: Safe Launch Protocol

### Execution Plan
```
- [ ] **Database Boot:** Check `pg_isready -h localhost -p 5432`.
      If not running (Scoop): `pg_ctl start -D "$HOME/scoop/apps/postgresql/current/data"`
      If not running (WSL 2): `sudo service postgresql start`
      First-time setup: `createdb -U postgres buildo && npm run migrate`
- [ ] **Safe Start:** Run `npm run safe-start` (kills node, purges .next cache, starts dev server).
- [ ] **Verify:** App loads at `http://localhost:3000`.
```
