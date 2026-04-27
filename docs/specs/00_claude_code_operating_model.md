# Buildo AI Operating Model

This document explains how we structure Claude Code on this project — what loads, what runs
automatically, how we review, and how we remember. It is the reference for anyone asking
"why is the tooling set up this way?"

The framing draws on six principles from [Claude Code as a Build System](https://github.com/vscarpenter/claude-code-build-system),
but our implementation diverges where Buildo's scale and domain complexity warrant it. The
principles are embedded in the narrative below rather than listed mechanically.

---

## 1. What Loads at Session Start — and What Doesn't

We treat CLAUDE.md the way we treat an index file: it names things and points to where the
detail lives, but it does not contain the detail itself. The file is capped at ~220 lines so
the entire project context fits cleanly in the model's working memory without crowding out
code and spec content.

**What always loads:**
- `CLAUDE.md` — workflow triggers, prime directive, allowed commands, master template, domain routing table
- `tasks/lessons.md` — project-specific gotchas that have already cost us time (read explicitly at session start)
- `~/.claude/projects/.../memory/MEMORY.md` — persistent facts about the user, project decisions, and feedback

**What loads on demand (not auto-imported):**
- `.claude/workflows.md` — full WF execution plans, read when a WF is triggered
- `.claude/domain-admin.md` — Admin Mode tooling stack and rules, read when Admin Mode is declared
- `.claude/domain-crossdomain.md` — Cross-Domain mode rules, read when relevant
- `scripts/CLAUDE.md` — Backend/Pipeline rules and required spec list, read when Backend Mode is declared
- Feature specs in `docs/specs/` — read at the start of every task that touches the feature

This layering is the "write standards once, reference everywhere" principle applied correctly:
the standards exist and are authoritative, but they only consume context when the session
actually needs them. A WF7 Maestro session has no business loading 700 lines of pipeline
architecture docs.

Domain modes enforce this. At the start of every task, Claude declares which domain it is
operating in (Admin, Backend/Pipeline, or Cross-Domain) and reads the corresponding domain
file. Wrong domain = wrong tooling stack = preventable bugs.

---

## 2. Automated Enforcement — What Runs Without Prompting

The pre-commit hook is the oldest layer: every commit runs `typecheck + lint + test`
automatically via Husky. Nothing reaches the repo without passing all three.

The Stop hook is newer and closes a gap the pre-commit left open: it fires after every
Claude response, running `npm run typecheck` in under 60 seconds. Type errors get caught
before they compound across three more edits rather than after you try to commit. Small
feedback loops compound.

The permissions denylist in `.claude/settings.json` is safety equipment, not friction.
It blocks `rm -rf`, force-pushes to any branch, and reads or writes to `.env` files.
These are categories we never want executed without explicit human confirmation. The
PreToolUse hook on Edit/Write further enforces that an active task must exist before
any file is modified — preventing ad-hoc edits that bypass the planning gate.

The global audit hook (see `~/.claude/hooks/audit-command.ps1`) logs every bash and
PowerShell tool call with timestamp and session ID to a daily file. High-risk patterns
(destructive flags, secret file access) are routed to a separate flagged log for weekly
review. The log is not a blocker — it is an audit trail for when something breaks and
you need to retrace what happened.

The principle here is simple: anything you have to remember to do, you will eventually
forget. Anything enforced by a hook, a denylist, or a pre-commit gate keeps working
when your attention drifts.

---

## 3. Workflow Rituals — How We Plan and Execute

The WF system (WF1–WF11) encodes the recurring rituals of software development as
named, reproducible workflows. Each WF has a trigger shortcode, a pre-flight checklist,
and a full execution plan. The plan is not a suggestion — it is the minimum required
path for that class of work.

The key forcing functions in every workflow:
- **PLAN LOCKED gate** — Claude writes the plan, halts, and asks for authorization.
  No code is written until the user says yes. This single constraint prevents the most
  common AI failure mode: jumping to implementation before the approach is agreed.
- **Red Light step** — tests must fail before implementation begins. If you can't write
  a failing test, you don't understand the problem well enough to fix it.
- **Pre-Review Self-Checklist** — before asking agents to review, Claude walks the spec's
  behavioral contract against the actual diff and produces a PASS/FAIL per item. This
  catches spec-vs-code drift before reviewers see it.
- **Green Light evidence** — the final test summary line and typecheck result are pasted
  verbatim. No paraphrasing. No "tests pass" without the output to prove it.

WF6 (Review & Commit) is the exit gate for every feature, enhancement, and bug fix.
It runs as a skill (`/wf6-review`) and cannot be skipped. The 5-point hardening sweep
and atomic commit discipline keep the history clean and regressions rare.

WF7 (Maestro) deliberately breaks the ceremony model. Flows are YAML, iteration is
fast, and adding a planning gate would slow down the one workflow that needs to move
quickest. The tradeoff is explicit.

---

## 4. Specialist Review — How We Catch What We Miss

We run a three-agent review system for every WF1 (new feature) and WF2 (enhancement),
and a single-agent review for WF3 (bug fix):

- **Gemini** (adversarial): spec-vs-code gaps, silent error swallowing, off-by-one errors,
  new states not handled by downstream consumers
- **DeepSeek** (adversarial): logic errors, wrong assumptions, broken contracts
- **Code Reviewer** (quality, worktree isolation): error path coverage, type safety,
  naming consistency, dead code

Each agent generates its own checklist from the spec — no checklist is provided to them.
This is deliberate. A checklist provided by the implementor reflects what the implementor
already checked. An independently generated checklist catches what the implementor's mental
model excluded.

The worktree isolation means each agent reads the repo fresh, without contamination from
the implementor's context window. Findings are triaged: BUG items block the Green Light
and file a WF3 immediately; DEFER items go to `docs/reports/review_followups.md` with
context for future sessions.

This is the "specialists beat generalists" principle, applied at review time rather than
build time. We don't have domain-specific subagents that fire automatically on file type
(as the reference build system does) because our test suite and advisory lock compliance
tests already cover those domains. The three-agent review covers what the test suite can't:
spec intent, architectural coherence, and silent failure modes.

---

## 5. Memory and Continuity — What Persists Across Sessions

Three layers, each answering a different question:

**`tasks/lessons.md`** answers: *what has already bitten us in this codebase?*
One-line gotchas, reviewed at session start. When something costs more than an hour to
debug, it goes here. The file is short by design — if it grows past 50 lines, prune the
entries that no longer apply.

**`~/.claude/projects/.../memory/`** answers: *what facts about this project, this user,
and our agreements should survive session boundaries?*
Typed memory files (user / feedback / project / reference) indexed by MEMORY.md.
Written deliberately, not auto-extracted. Each file has a name, description, type, and
body. Feedback memories are the most valuable: they record corrections and confirmed
approaches so Claude doesn't repeat the same mistake or second-guess a validated choice.

**`.cursor/active_task.md`** answers: *what was I in the middle of?*
In-flight work, never left out of sync with reality at session end. The "Resuming From Here"
section lets a fresh session pick up without re-explaining context.

We deliberately skip automatic session transcript extraction (the `persist-memory.sh` pattern
from the reference build system). Auto-extracted learnings are low-signal — they capture
what happened, not what mattered. Deliberate writes are higher signal because the act of
writing forces the judgment "is this worth remembering?" The cost is that you have to
remember to write. The benefit is that what gets written is actually useful.

---

## 6. What We Deliberately Skip

**`persist-memory.sh` auto-extraction** — adds per-session API cost and produces noisy,
low-signal learnings. Our manual memory system is stricter and more durable.

**`capture-decision.sh`** — git history covers this. `git log --oneline` with conventional
commit prefixes is the decision log. We don't need a second one.

**Domain-specific auto-triggered subagents** (a11y-reviewer, pg-migration-reviewer) —
our test suite and advisory lock compliance tests cover those domains. Adding subagents
that fire on file type would add latency and overlap with existing guardrails.

**Quarterly settings.local.json pruning** — noted as a good practice but not yet scheduled.
The denylist is new; prune when it accumulates stale entries.

---

## 7. Anti-Pattern Coverage — What Gets Flagged and How

Organized by domain. Effectiveness ratings: **Guaranteed** (fires every time, no judgment), **High** (reliable when pattern occurs), **Medium** (catches it often, some gaps or false positives), **Low** (best-effort, significant blind spots).

---

### All Domains

| Anti-Pattern | Tool | How It's Caught | Effectiveness |
|-------------|------|----------------|---------------|
| Type mismatch, broken import, missing null check | TypeScript / tsc (`npm run typecheck`) | Compiler rejects the code outright | **Guaranteed** |
| Empty catch block: `catch (err) {}` | ESLint `no-empty` | Lint error on empty block body | **Guaranteed** |
| Unused files, exports, or dependencies | knip (`npm run dead-code`) | Static import graph analysis | **High** — false positives on dynamic imports |
| Known CVE in a dependency | npm audit | Cross-references npm advisory database | **High** — zero-day blind spot |
| Circular import chain | madge (`npx madge --circular`) | Traverses the module graph | **Guaranteed** once scan runs |
| Type error introduced mid-session (before commit) | Stop hook — typecheck after every response | Fires automatically, no prompting | **High** — 3–10s latency, catches drift early |
| Edit without an active task on disk | PreToolUse hook — check-active-task.mjs | Blocks Edit/Write tool calls | **Guaranteed** — cannot be bypassed |
| `rm -rf`, force-push, `.env` read/write | Permissions denylist | Claude Code layer rejects the tool call | **Guaranteed** for listed patterns |
| Bash command matching high-risk pattern | Audit hook — audit-command.ps1 | Logged to flagged log, not blocked | **High** audit trail — not a blocker |
| Spec-vs-code drift (intent vs implementation) | Pre-review self-checklist (WF1/WF2) | Claude walks spec behavioral contract against actual diff, PASS/FAIL per item | **Medium** — catches obvious gaps; adversarial review catches subtler ones |
| Unknown unknowns in the implementation | Gemini + DeepSeek adversarial review | Agents generate their own checklist from spec — no implementor bias | **Medium** — strong on structural patterns, weaker on domain business logic |
| Error path coverage, naming inconsistency, dead code introduced | Code Reviewer agent (worktree isolation) | Fresh repo read, independent checklist | **Medium** — good signal-to-noise, occasional false positives |
| Tests pass but commit would fail | Husky pre-commit (typecheck + lint + test) | Runs full gauntlet before commit is allowed | **Guaranteed** — slowest layer, ~60s |

---

### Admin / Frontend

| Anti-Pattern | Tool | How It's Caught | Effectiveness |
|-------------|------|----------------|---------------|
| `useEffect` used for data fetching | Domain rules (`.claude/domain-admin.md`) + code review | Flagged in plan review; ESLint rule could be added | **Medium** — currently process-enforced, not automated |
| `useState` used for form fields | Domain rules + code review | Flagged during WF6 hardening sweep | **Medium** — process-enforced |
| Floating promise (async call not awaited or `.catch`-ed) | TypeScript strict + code review | tsc catches some; reviewers catch the rest | **High** with tsc, **Medium** for edge cases |
| Secret exposed in `'use client'` component | Domain rules + code review | Reviewers check for env var access in client components | **Medium** — automated scan could improve this |
| `dangerouslySetInnerHTML` without DOMPurify | Code review (WF6 hardening sweep) | Reviewed in error paths + consistency check | **Medium** — caught if reviewer checks for it |
| Custom alert banner / `alert()` / `confirm()` used | Domain rules + code review | Flagged during hardening sweep | **Medium** — process-enforced |
| `console.log` left in committed code | ESLint `no-console` (`eslint.config.mjs`) + WF6 sweep | Lint error on any `console.log/debug/info` in `src/` (non-test). `console.warn` is allowed. | **Guaranteed** for `src/` — test files excluded |
| Touch target < 44px, mobile layout broken at 375px | WF5 code UI viewport audit | Manual test check in `*.ui.test.tsx` | **Medium** — requires tests to exist |
| Maestro selector fails (missing `testID`) | WF7 selector audit step | Claude checks component source before writing flow | **High** — caught pre-authoring |
| Navigation before container mounts (Expo Router race) | `useRootNavigationState` guard + regression tests in `schemas.test.ts` | Static source assertions verify guard exists and is ordered correctly | **High** — regression-locked |

---

### Backend / Pipeline

| Anti-Pattern | Tool | How It's Caught | Effectiveness |
|-------------|------|----------------|---------------|
| `process.exit()` in `src/` | ESLint `no-restricted-syntax` | Lint error | **Guaranteed** |
| `new Pool()` instantiated outside `src/lib/db/client.ts` | ESLint `no-restricted-syntax` (scripts) | Lint error in `scripts/**` | **Guaranteed** in scripts; **Medium** in src (process-enforced) |
| Raw SQL string concatenation (injection vector) | Code review + domain rules | Flagged in security check during WF6 | **Medium** — process-enforced, no automated SQL AST check |
| `CREATE INDEX` on large table without `CONCURRENTLY` | validate-migration.js (pre-commit) | Script scans migration SQL for the pattern | **Guaranteed** for new migrations |
| `DROP TABLE` or `DROP COLUMN` without approval | validate-migration.js (pre-commit) | Blocks the commit and prompts for explicit confirmation | **Guaranteed** for new migrations |
| Missing DOWN migration block | validate-migration.js (pre-commit) | Checks for absence of rollback SQL | **Guaranteed** for new migrations |
| SQL style violations in new migrations | SQLFluff | Lint pass on migration files | **High** — grandfathered files excluded |
| Bare `console.error` in API route catch block | ESLint + WF5 code audit (`grep src/app/api/`) | WF5 code runs grep for bare console.error; ESLint could enforce | **High** via WF5, **Medium** otherwise |
| Empty catch block in pipeline script | ESLint `no-empty` | Lint error | **Guaranteed** |
| Pipeline script runs without advisory lock | `pipeline-advisory-lock.infra.test.ts` | Test asserts every manifest JS script has `ADVISORY_LOCK_ID` + `withAdvisoryLock` | **Guaranteed** — test fails if pattern is missing |
| Advisory lock acquired via `pool.query` (wrong — session-bound) | Domain rules + code review | Caught in review; pattern documented in `tasks/lessons.md` | **Medium** — process-enforced |
| Large result set loaded into memory (OOM risk) | Code review + domain rules | Reviewers check for `pool.query` on queries expected >10K rows | **Medium** — no automated row-count estimation |
| `new Date()` used for timestamp written to DB (should be DB clock) | Domain rules + code review | Flagged during WF6 consistency check | **Medium** — process-enforced |
| Dual code path out of sync (classifier.ts vs classify-permits.js) | Classification test suite (`classification.logic.test.ts`) | Both paths are tested against the same inputs — divergence fails tests | **High** — catches output divergence; **Medium** at catching missed updates |
| OFFSET pagination on large table (silent row skipping) | Code review + domain rules | Reviewers check SQL for `OFFSET` on `permits` / `coa_applications` | **Medium** — process-enforced; test suite could scan for it |
| Non-idempotent pipeline script (fails on re-run) | Code review + test suite | Reviewers check for upsert vs bare insert | **Medium** — hard to guarantee without a re-run integration test |

---

### Coverage Gaps — What We Don't Catch Automatically

These are real risks with no automated enforcement today. Process or manual review is the only line of defense.

| Gap | Domain | Mitigation Today | Status |
|-----|--------|-----------------|--------|
| `useEffect` for fetching — not an ESLint rule | Admin | Domain rules + WF5 `useEffect` scan (Code Quality step) | **Open** — process + grep; no static rule |
| Secrets in client components — no automated scan | Admin | Domain rules + WF5 `process.env` grep (Code Quality step) | **Open** — grep scan added to WF5 code |
| OFFSET pagination in `src/` queries | Backend | WF5 OFFSET grep (Code Quality step) | **Open** — grep scan added to WF5 code |
| Non-idempotent scripts — no re-run test | Backend | WF3 Idempotency Check step (Backend/Pipeline only) | **Open** — checklist step added to WF3 |
| Accessibility violations (WCAG AA) | Admin + Expo | Next.js `core-web-vitals` includes `eslint-plugin-jsx-a11y` rules; manual WF5 audit for WCAG AA | **Open** — basic a11y via ESLint; deep WCAG requires axe-core in Vitest |
| Stale MEMORY.md entries (wrong facts from past sessions) | All | WF5 Core Memory Review step | **Open** — review step added to WF5 core |

---

## 8. Full Toolset Reference

Every tool we use, what it does, which domain it governs, and its time cost per invocation.
Time costs are approximate and measured on this machine; they inform which tools belong in
automated hooks vs. manual steps.

### Pre-Flight Checks

These run at the start of a session or before generating an active task — not in response to tool calls. They orient the model to current reality before any plan is written.

| Check | What It Does | When | Domain | Time Cost |
|-------|-------------|------|--------|-----------|
| **`node scripts/ai-env-check.mjs`** | Reads live environment state: DB connectivity, migration status, pipeline run recency, env var presence. Surfaces mismatches between what the code assumes and what is actually running. | Start of every task (Prime Directive §6) | All | 2–5s |
| **`pg_isready -h localhost -p 5432`** | Confirms PostgreSQL is accepting connections before any DB-dependent work begins. WF11 gate — if not ready, boot sequence runs before proceeding. | WF11 / Backend tasks | Backend/Pipeline | <1s |
| **Domain file read** (`.claude/domain-admin.md`, `scripts/CLAUDE.md`, or `.claude/domain-crossdomain.md`) | Loads the tooling stack and never-violate rules for the declared domain. Prevents wrong library choices (e.g. `useEffect` for fetching in Admin, bare `new Pool()` in Backend). | After domain declaration, before active task | Depends on mode | 1–3s |
| **Engineering standards read** (`docs/specs/00_engineering_standards.md`) | Loads error handling, DB, logging, dual-path, pipeline safety, and plan compliance rules. Required reading for all Admin and Backend tasks before the plan is written. | Before every active task | All | 2–5s |
| **Feature spec read** (`docs/specs/[feature].md`) | Loads the behavioral contract, operating boundaries, and edge cases for the specific feature being built or changed. The plan compliance gate cannot pass without this. | Before every active task | All | 2–5s |
| **`tasks/lessons.md` review** | Scans project-specific gotchas — TypeScript quirks, DB column aliases, Expo pitfalls — that have already cost time. Prevents known bugs from recurring. | Session start (Prime Directive §8) | All | <1s |
| **Context7 library docs** (`resolve-library-id` → `get-library-docs`) | Fetches current documentation for any external library before writing code against it. Prevents hallucinated API calls against outdated or changed library versions. | Before implementing against any external dependency | All | 5–15s |
| **`npm run task -- --wf=N --name="..."`** | Scaffolds `.cursor/active_task.md` with the correct WF template. Enforced by the PreToolUse hook — no Edit/Write calls are allowed until this file exists. | Before any implementation step | All | <1s |

---

### AI & Review Tools

| Tool | What It Does | Domain | Time Cost |
|------|-------------|--------|-----------|
| **Gemini adversarial review** (`npm run review:gemini`) | Independent spec-vs-code audit. Finds silent error swallowing, off-by-one errors, unhandled states. Generates its own checklist from the spec — no prompt injection from implementor. | All | 30–90s |
| **DeepSeek adversarial review** (`npm run review:deepseek`) | Second adversarial pass with different failure-mode intuitions. Logic errors, wrong assumptions, broken downstream contracts. | All | 30–90s |
| **Code Reviewer agent** (`subagent_type: feature-dev:code-reviewer`, `isolation: worktree`) | Quality-focused review in a clean worktree. Error path coverage, type safety, naming consistency, dead code. Reads repo fresh — no context contamination. | All | 60–120s |
| **Context7 MCP** (`resolve-library-id` → `get-library-docs`) | Fetches current library documentation before writing code against any external dependency. Prevents hallucinated API calls against outdated versions. | All | 5–15s |

### Automation & Hooks

| Tool | What It Does | Domain | Time Cost |
|------|-------------|--------|-----------|
| **Stop hook** (`.claude/settings.json`) | Runs `npm run typecheck` after every Claude response. Catches type errors before they compound across multiple edits. | All | 3–10s |
| **PreToolUse hook — active task check** (`.claude/settings.json`) | Blocks Edit/Write tool calls unless `.cursor/active_task.md` exists. Prevents ad-hoc edits that bypass the planning gate. | All | <1s |
| **PreToolUse hook — audit log** (`~/.claude/hooks/audit-command.ps1`) | Logs every Bash/PowerShell tool call to `~/.claude/audit/YYYY-MM-DD.log`. Flags high-risk patterns (rm -rf, force-push, .env access) to a separate file for weekly review. | All (global) | <1s |
| **Husky pre-commit** | Runs `npm run typecheck && npm run lint && npm run test` on every commit. Nothing reaches the repo without passing all three. | All | 30–90s |
| **Permissions denylist** (`.claude/settings.json`) | Blocks `rm -rf`, git force-push, and `.env` reads/writes at the Claude Code permission layer. Requires explicit user approval to override. | All | 0s (passive) |

### Skills (Slash Commands)

| Tool | What It Does | Domain | Time Cost |
|------|-------------|--------|-----------|
| **`/wf6-review`** (`.claude/skills/wf6-review.md`) | 5-point hardening sweep (error paths, edge cases, type safety, consistency, drift) + collateral test run + atomic commit. The mandatory exit gate after every feature, enhancement, or bug fix. | All | 2–5 min |
| **`/wf5-audit`** (`.claude/skills/wf5-audit.md`) | Full codebase audit: spec alignment, test suite, typecheck, dead code, supply chain. Subsections for code quality, build health, production readiness, pipeline validation, and manual app assessment. | All | 5–20 min |

### Quality & Static Analysis

| Tool | What It Does | Domain | Time Cost |
|------|-------------|--------|-----------|
| **TypeScript / tsc** (`npm run typecheck`) | Strict mode type checking across the full codebase. Catches contract violations, missing nullchecks, and broken imports before runtime. | All | 3–10s |
| **ESLint** (`npm run lint`) | Enforces `no-empty` (bans empty catch blocks) and `no-restricted-syntax` (bans `process.exit()` in `src/`). Flat config in `eslint.config.mjs`. | All | 5–15s |
| **Vitest** (`npm run test`) | 4,400+ tests across logic / infra / UI / security triads. Path alias `@/` wired. Factory pattern — no inline mocks. | All | 20–60s |
| **knip** (`npm run dead-code`) | Unused files, exports, and dependencies scan. Keeps the codebase from accumulating dead weight. | All | 5–10s |
| **npm audit** | Supply chain vulnerability check. Zero High or Critical allowed. | All | 5–10s |
| **madge** (`npx madge --circular`) | Circular dependency detection across `src/`. Caught early, circular deps are cheap to fix; caught late, they cause mysterious build failures. | All | 5–10s |
| **SQLFluff** (`sqlfluff lint --dialect postgres`) | SQL style and correctness linting for new migration files. Existing migrations are grandfathered. | Backend/Pipeline | 2–5s |
| **validate-migration.js** (pre-commit) | Catches `DROP TABLE`, `DROP COLUMN`, non-CONCURRENTLY indexes on large tables, and missing DOWN blocks before the migration reaches the repo. | Backend/Pipeline | <1s |

### Admin / Frontend Stack

| Tool | What It Does | Domain | Why |
|------|-------------|--------|-----|
| **TanStack Query** | Server state, data fetching, infinite scroll, cache invalidation. | Admin + Expo | `useEffect` for fetching is banned — this is the only approved path. |
| **Zustand** | Global UI state (filters, selections) shared across admin views and Expo screens. | Admin + Expo | Lightweight, no boilerplate, persists via MMKV on Expo. |
| **React Hook Form + Zod** | Form state and validation. | Admin | `useState` for form fields is banned. |
| **Shadcn UI** | Headless, accessible UI primitives. Copy-paste, Apache 2.0. | Admin | Run `npx shadcn@latest add [component]` per component. |
| **Motion for React** | Animations. Spring config: `stiffness: 400, damping: 20, mass: 1`. | Admin | Formerly Framer Motion — same API, lighter package. |
| **Sonner** | Toast notifications. | Admin | Custom alert banners and `alert()`/`confirm()` are banned. |
| **Tremor** | Dashboard data viz (`<ProgressCircle>`, `<BarList>`, `<Tracker>`). | Admin | Pairs with Shadcn — both Apache 2.0, both copy-paste. |
| **Sentry** | Error tracking wired into `app/[...]/error.tsx` route boundaries. | Admin | `console.log` in committed code is banned — use `Sentry.captureException()`. |
| **Firebase Auth** | Authentication with `verifyIdToken` in middleware. | Admin + Expo | Production auth. Never swap for Clerk or other providers without architectural approval. |
| **Maestro** (`maestro test`) | E2E flow testing on real device/emulator builds. Smoke flows run on every PR via Maestro Cloud + EAS Workflows; full suite runs nightly. | Expo | Expo Go does not work — must use a development build. |

### Backend / Pipeline Stack

| Tool | What It Does | Domain | Why |
|------|-------------|--------|-----|
| **Pipeline SDK** (`scripts/lib/pipeline.js`) | `pipeline.run`, `withTransaction`, `streamQuery`, `emitSummary`, `emitMeta`, `withAdvisoryLock`. The only approved way to connect to the DB and emit telemetry from pipeline scripts. | Backend/Pipeline | Hand-rolled DB logic in scripts is banned. |
| **Drizzle ORM** (`npm run db:generate`) | TypeScript types generated from the live schema. Run after every migration. | Backend/Pipeline | Keeps TS interfaces in sync with DB reality. |
| **logError / logWarn / logInfo** (`src/lib/logger.ts`) | Structured server-side logging. Routes to Sentry in production. | Backend/Pipeline | Bare `console.error` in API routes is banned. |
| **Zod** | API input validation (400 with field-level errors, not generic 500) and pipeline config validation. | All | Same standard on both sides of the stack. |
| **pg-query-stream** (via `pipeline.streamQuery`) | Streaming cursor for queries expected to return >10K rows. Prevents V8 OOM on large result sets. | Backend/Pipeline | `pool.query` for large sets is banned. |
| **PostGIS** | Spatial queries — `ST_Contains`, `ST_DWithin`, `ST_Centroid` with GiST indexes. Falls back to Turf.js / haversine in local dev without the extension. | Backend/Pipeline | Required for radius-based lead feed and parcel/neighbourhood linking. |

---

## Reference

- Reference build system post: [Claude Code as a Build System](https://github.com/vscarpenter/claude-code-build-system)
- CLAUDE.md: project entry point, workflow triggers, domain routing
- `.claude/workflows.md`: full WF execution plans
- `.claude/domain-admin.md`: Admin Mode tooling stack and rules
- `.claude/domain-crossdomain.md`: Cross-Domain mode rules
- `scripts/CLAUDE.md`: Backend/Pipeline mode rules and required reading list
- `tasks/lessons.md`: project-specific gotchas
- `docs/specs/00_engineering_standards.md`: engineering standards (error handling, DB, security, testing)
