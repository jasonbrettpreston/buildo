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
- [ ] **Pattern Routing:** If the audit reveals a recurring class of failure (same bug
      shape seen 2+ times in the last quarter), do not just file individual WF3s — route
      the class to a stronger destination per `docs/specs/00-architecture/05_knowledge_operating_model.md` §2:
      a regression test, a lint rule, a `Known Failure Modes` section in the relevant spec,
      or `tasks/lessons.md`. One-off findings file as WF3s as usual.
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
- [ ] **Lesson Routing (CRITICAL/HIGH only):** For each CRITICAL or HIGH finding fixed
      in this session (from Multi-Agent Review, Pre-Review Self-Checklist, or the 5-Point
      Hardening Sweep), declare a destination per
      `docs/specs/00-architecture/05_knowledge_operating_model.md` §2: test / lint / spec /
      `tasks/lessons.md` / memory. Stronger destinations preferred. Make the destination
      change in this commit. "Commit log only" requires a one-line justification under
      `Lesson-routing:` in the commit body. For NEW classes of failure (not previously seen),
      also update the affected spec's `## Known Failure Modes` section. N/A if no
      CRITICAL/HIGH findings — state explicitly.
- [ ] **Atomic Commit:** `git commit -m "[type](NN_spec): [description]"`.
      Conventional prefixes: feat/fix/refactor/test/docs/chore.
      Commit each component individually — do not batch.
      For commits fixing CRITICAL/HIGH findings, include the footer schema from
      `docs/specs/00-architecture/05_knowledge_operating_model.md` §5
      (Spec / Severity / Reviewers / Tests / Deferred / Lesson-routing).
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

## WF8: Parallel Worktree Setup

*Meta-workflow. Sets up an isolated parallel work surface so two Claude sessions can run without violating the single-`active_task.md` rule. Itself produces no `src/` code — hands off to the parallel session, which runs its own WF1/WF2/WF3 plan-lock ceremony in the new tree.*

### When to use
- You're mid-flight on a task in this terminal AND a separate concern surfaces that needs immediate attention.
- You want to scope long-running work (e.g. multi-day refactor) off `main` without blocking smaller fixes.
- Multiple humans are working on the same repo and need isolated Claude sessions.

### When NOT to use
- For a one-line fix you can land in 2 minutes — just commit on the current branch.
- For Maestro flow edits — WF7 is YAML-only and won't conflict at the active_task level.
- For purely doc-only edits to a single spec file — overhead exceeds benefit.

### Pre-flight
- Current working tree is clean OR stashed (`git status` empty).
- The proposed sibling dir `../buildo-<slug>` does not exist.
- The proposed branch name `wf<N>/<slug>` is not in use (`git rev-parse --verify wf<N>/<slug>` fails).

### Execution Plan
```
- [ ] **Pick slug + parent workflow:** Choose a short kebab-case slug describing
      the work (e.g. `spec48-observer-loop`). Pick the parent workflow number
      (the one that will run in the new tree — usually WF1, WF2, or WF3).
- [ ] **Pick base branch:** Default `main`. Override only if the parallel work
      depends on another in-flight branch.
- [ ] **Run setup:** `npm run wf8 -- --slug=<slug> --wf=<N> [--from=<queued_file>]`
      Equivalent to:
        git worktree add ../buildo-<slug> -b wf<N>/<slug> <base>
        # if --from given:
        mv .cursor/<queued_file> ../buildo-<slug>/.cursor/active_task.md
        # always:
        echo "Next: cd ../buildo-<slug> && claude"
- [ ] **Handoff:** Open a new terminal. `cd ../buildo-<slug>`. Run `claude`.
      Tell it: "<parent_wf> continue from active_task.md". The new session
      enters the parent workflow's standard plan-lock ceremony from there.
- [ ] **Coordinate sharp edges (manual):** While the parallel session runs,
      do NOT concurrently use these single-instance resources from the other
      terminal: Gradle daemon (`assembleDebug`), the Android emulator install
      slot, local Postgres migrations, `~/.expo/` cache mutations, or
      `~/.gradle/` cache mutations. Read-only and per-tree operations
      (typecheck, test, lint, jest, gemini/deepseek review) ARE safe.
- [ ] **Track in commit footers:** Each commit on the worktree branch should
      include `Worktree: <slug>` in the Spec 05 §5 footer (additive — no
      schema change; harvest scripts pick it up if needed).
- [ ] **Teardown after merge:** Once `wf<N>/<slug>` merges to `main`:
        git -C <repo-root> worktree remove ../buildo-<slug>
        git branch -d wf<N>/<slug>  # local cleanup
      Verify with `git worktree list` — only `main` (plus any other
      intentional worktrees) should remain.
```

### Sharp edges (single-instance resources — coordinate manually)
| Resource | Why concurrent use breaks | Mitigation |
|---|---|---|
| Gradle daemon | Single JVM holds the lock | Sequential `expo run:android` |
| Single Android emulator | One app install slot per AVD | Two emulators, or sequential |
| Local Postgres | Migration advisory lock | Sequential `npm run migrate` |
| `~/.expo/` cache | Shared across worktrees | Sequential `expo prebuild --clean` |
| `MEMORY.md` (auto-memory) | Per-user, both sessions share | Append-only writes are usually safe; manually merge if both rewrite |
| `node_modules/` | Per-worktree (each has own) | None needed |
| `package-lock.json` | Per-worktree (each has own) | None needed |

### Conventions
- **Branch naming:** `wf<N>/<slug>` (e.g. `wf2/spec48-observer-loop`). Parent workflow visible in `git branch -a`; harvest scripts can grep by prefix.
- **Worktree location:** Sibling dir `../buildo-<slug>`. Avoids polluting `.gitignore`; Gradle/Expo treat it as an independent project root.
- **Active-task promotion:** Use `--from=<queued_file>` to promote a queued plan from `.cursor/queued_task_*.md`; otherwise the new tree inherits `main`'s current `active_task.md` and you hand-edit at session start.
- **Cleanup:** Teardown is mandatory after merge. Stale worktrees clutter `git worktree list` and confuse `git status` from the wrong directory.

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

---

## WF12: Mobile Safe Launch (Expo + Android Emulator)

*Native dev build sequence per Spec 98 §2.2. Required before Maestro E2E flows can run; Maestro cannot drive Expo Go because the app uses native modules (Firebase Auth, Reanimated worklets, Sentry). Use this when `expo run:android` is hanging, when you hit a `Failed to resolve plugin` error, or when adb says "no devices".*

### Pre-Flight (one-time setup, Windows)
- **Android Studio installed** with a Pixel 8 (API 34+) virtual device created.
- **`ANDROID_HOME` env var** points to the SDK (typically `C:\Users\<you>\AppData\Local\Android\Sdk`).
- **`%ANDROID_HOME%\platform-tools`** on the System PATH so `adb` is reachable.
- **`maestro` CLI** installed (`curl -Ls "https://get.maestro.mobile.dev" | bash` via WSL, or the Windows installer).
- These three points are the "Pointing Issues" (Spec 98 §6.1) — single most common boot failure on Windows.

### Execution Plan
```
- [ ] **Boot the emulator first.** Open Android Studio → Device Manager → Play
      on the Pixel 8 emulator. Wait until the home screen is visible. The
      ADB daemon initialises during emulator boot — running Expo before
      this step is the single most common cause of "no devices found".
- [ ] **Preflight:** From `mobile/`, run `npm run safe-start`.
      The script validates: Node version, node_modules present, Sentry
      plugin path (Sentry v7+ uses `@sentry/react-native` NOT
      `@sentry/react-native/app-plugin` — Spec 98 §6.3), ANDROID_HOME set,
      adb on PATH, at least one device online, `expo config --type prebuild`
      succeeds. Each check has an actionable error message; fix and re-run
      until all green.
- [ ] **Boot the app:** Either `npm run safe-start -- --boot` (preflight
      then auto-launches `expo run:android`) or run `npx expo run:android`
      manually after the preflight passes. Leave the Metro terminal open;
      press `r` to reload the JS bundle on red-screen crashes.
- [ ] **Verify:** App launches on the emulator, shows the sign-in screen
      (clean state) or the lead feed (cached state).
- [ ] **Maestro check:** From `mobile/`, run `maestro test maestro/auth.yaml`
      (or any other flow). The test runs against the launched app — Metro
      stays running in the other terminal.
```

### Common failure modes (Spec 98 §6 historical context)

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| `Failed to resolve plugin for module @sentry/react-native/app-plugin` | Sentry v7+ moved the plugin path | `app.json` plugin name → `@sentry/react-native` (top-level) |
| `error: device 'emulator-5554' offline` or `no devices/emulators found` | Expo run before emulator booted; ADB daemon never started | Boot emulator first, wait for home screen, then `expo run:android` |
| `adb: command not found` | `%ANDROID_HOME%\platform-tools` not on PATH | System Properties → Environment Variables → add to PATH; restart PowerShell |
| TurboModule / worklet compatibility errors | Trying to run on Expo Go (sandbox can't host custom native code) | Always use `expo run:android` (native dev build), never `expo start` for Maestro |
| Red-screen on app launch with `Cannot find module` | Stale Metro cache after dependency change | Stop Metro (Ctrl+C), `npx expo start --clear`, or `rm -rf node_modules .expo && npm install --legacy-peer-deps` |
| `Failed to verify image` / Gradle build fails on `.so` files | Cached prebuild diverged from `app.json` plugin list | `npx expo prebuild --clean` to regenerate `android/` from scratch (DESTRUCTIVE — re-applies plugin patches) |

### Database seed (optional, for realistic test data)

Tests like `scroll-feed.yaml` need production-volume data to validate scrolling, ranking, and empty states. Spec 98 §2.2 Step 3:
```powershell
# 1. Snapshot production
pg_dump "postgresql://<USER>:<PASS>@<HOST>:5432/<DB>" -F c -f buildo_prod.dump
# 2. Restore to local Postgres (NOT to prod)
pg_restore --clean --if-exists --no-owner `
  --host=localhost --port=5432 --username=postgres `
  --dbname=buildo buildo_prod.dump
```

### When to run this workflow

- After pulling new dependencies (`@sentry/react-native`, `expo-location`, etc. — anything that adds a config plugin).
- After upgrading Expo SDK (the prebuild config can drift silently).
- Before any Maestro E2E session where you want fast-fail on misconfiguration rather than spending 5 minutes waiting for a Gradle build that was doomed at preflight.
- After moving between machines or after a fresh Windows reinstall (the "Pointing Issues" recur every time PATH gets reset).
