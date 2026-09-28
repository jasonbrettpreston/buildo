# Active Task: DeepSeek Execution Engine (SUB-ENG-1) — PART B, build
**Status:** Implementation (authorized 2026-09-22; building in ../buildo-engine on wf1/deepseek-engine)
**Workflow:** WF1 (Genesis — net-new engine) for Phases 1–2 · WF2 (Enhance — protocol edits) for Phase 3 · WF3-shaped supervised pilot for Phase 4
**Domain Mode:** **Backend/Pipeline** (`scripts/CLAUDE.md` read — the deliverable is a new `scripts/` executable with shell, filesystem and git access)
**Tracked item id:** **SUB-ENG-1** (referenced by `docs/specs/00-architecture/08_agents.md` §A STATUS; id resolution locked by `agent-roster.infra.test.ts` T3)
**Companion plan (PART A, docs):** `.cursor/wf1_spec08_deepseek_execution_active_task.md`
**Gating:** **PART A must land first.** Spec 08 §A/§B is the contract this engine is built against; building first would be the "plausible spec" failure (manual §8.3) in reverse.
**Revision:** v2 — plan panel folded (see **§7 Fold Log**, F7–F12). Size after folds: **14 commits across 3 WF units.**

---

## Context
* **Goal:** Build the thing Spec 08 §A marks `PLANNED` — a Node agentic loop that lets **DeepSeek drive code generation, file writing/editing, test runs and commits** at low cost, under the *same* guardrails the Claude Code harness gives Claude for free, with a **tamper-proof** audit trail and a kill switch; then prove it on one isolated step and flip the §A row to `live`.
* **Target Spec:** `docs/specs/00-architecture/08_agents.md` §A + §B (authored by PART A). **A new §C "Execution engine contract" is authored by this plan's Phase 1, in its FIRST commit** (F12 — the schema lands before the loop). §C is an agent-substrate concern, so Spec 08 §8 owns it; Spec 124 §6 explicitly disclaims it.
* **Key Files (all net-new unless marked):**
  * `scripts/deepseek-exec.js` — the engine CLI + function-calling loop
  * `scripts/lib/exec-tools.js` — tool schemas + handlers (`read_file`, **`grep_files`**, `write_file`, `run_bash_command`, `git_commit`)
  * `scripts/lib/exec-ledger.js` — the run-ledger writer
  * `scripts/lib/exec-policy.json` — bash allowlist, path confinement, **path denylist**
  * **the ledger location: OUTSIDE the repo** (`%LOCALAPPDATA%/buildo-exec-runs/<run-id>.jsonl`, append-only) — **F11**; consequently **`.gitignore` is NOT modified** (it was in v1)
  * `src/tests/deepseek-exec.infra.test.ts`, `src/tests/deepseek-exec-fences.infra.test.ts` — the locks
  * *(MODIFIED, Phase 3)* `CLAUDE.md`, `.claude/workflows.md` · *(MODIFIED)* `package.json` (one script entry) · `docs/specs/00-architecture/08_agents.md` §A/§C

## Technical Implementation
* **New/Modified Components:** none in `src/` app code. One new `scripts/` executable + three libs + two test files; three existing files modified.
* **Data Hooks/Libs:** `scripts/lib/exec-tools.js`, `scripts/lib/exec-ledger.js`, `scripts/lib/exec-policy.json`.
* **Database Impact:** **NO.** The engine never opens a DB connection of its own; any DB work is a pipeline script it invokes through `run_bash_command`, using that script's own connection.

## Standards Compliance
* **Try-Catch Boundary:** N/A (no API route). Engine-internal: every tool handler has an explicit catch returning a **structured tool-error to the model** (never a silent swallow — ESLint `no-empty`) and writing an `error` record to the ledger in the same catch.
* **Unhappy Path Tests:** every fence proven in **both directions** (the violation observed BLOCKED **and ledgered**, the legitimate action observed ALLOWED).
* **logError Mandate:** `scripts/` uses `pipeline.log.*`; the engine is not a `pipeline.run` script, so it uses its own ledger + stderr. **No `process.exit()`** — it throws, and a thin `bin` wrapper sets the exit code.
* **UI Layout:** N/A.

---

## 1. GROUNDING — what the harness gives Claude for FREE vs what must be BUILT

> **An execution model with shell access needs every guardrail the harness silently provides.**

### 1.1 Free from the Claude Code harness → **MUST BE BUILT**

| # | Harness capability Claude gets free | What SUB-ENG-1 must build | Phase |
|---|---|---|---|
| G1 | Permission prompts + per-command adjudication | **Bash allowlist**, deny-by-default. **v1 EXCLUDES every tree-mutating command** (F10) — see §1.4 | 2 |
| G2 | Working-directory confinement + sandbox | **Path confinement** — every path resolved and asserted under the repo root; symlink/junction escape rejected (the Windows junction hazard is a recorded repo gotcha) | 2 |
| G3 | **Read-before-Edit** invariant; exact-match edits that FAIL on ambiguity | `write_file` refuses to overwrite a file not read this run; an edit tool fails on a non-unique match rather than guessing | 1 |
| G4 | File-state tracking (stale overwrite rejected) | mtime + content hash captured at read, re-checked at write | 1 |
| G5 | Secret redaction on reads | `.env`/`*.key`/`*.pem` denied outright; values matching a key pattern redacted before entering the prompt **or the ledger** | 2 |
| G6 | Timeout / background management / output truncation | Per-command timeout, output cap, no background spawning in v1 | 1 |
| G7 | Full transcript + tool-call audit visible to the operator | **The run ledger** — one JSON object per tool call: args, result status, timing, the model's stated reason, **and for every bash call a pre/post `git status --porcelain` + worktree diff hash** (F10) | 1 |
| G8 | User interruption (Esc) halts mid-loop | **Kill switch** — a sentinel checked before EVERY tool call, plus max-iteration and max-token budgets | 2 |
| G9 | Commit policy + one-committer serialisation | **Single-committer advisory lock** + **explicit staging** enumerated from the ledger (`git add -A` refused) + **`--no-verify` REFUSED** (F12) | 2 |
| **G10** | *(the harness's implicit one: Claude cannot rewrite its own permission config or transcript)* | **Self-protection denylist (F11)** — the engine's own code, policy and ledger are unreachable by the model | 2 |

### 1.2 Free from the REPO to any committer (the differential gate the pilot runs under)

`.husky/pre-commit` (read, verbatim order): `step-churn-complexity --check` → `generate-template-freeze --check` → `spec-split-check --check` → `step-validate --staged --fast` → `lint-staged` → `validate-migrations.sh` → `check-migration-down-comments.sh` → `ast-grep-leads.sh` → `npm run typecheck` → `npm run lint` → scoped `vitest related` (1 fork). **Pre-push** runs the FULL suite (`VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=2`). Composition pinned by `src/tests/hooks-composition.infra.test.ts`. Plus `commit-msg` lesson-routing, ESLint `no-empty` + `process.exit()` ban, `golden-fingerprint.infra.test.ts`.
**Consequence:** the engine needs no re-implementation of correctness gating — **it needs to be unable to bypass it.** That is why G9's `--no-verify` refusal and G10's self-protection are the two highest-value fences in the build.

### 1.3 Residual risks no fence removes (stated, not hidden)

* **Function-calling reliability over long loops** — DeepSeek's tool-call adherence at 30+ turns is unmeasured here; the loop fails closed (abort + ledger) on a malformed call. *Measured in Phase 1's acceptance, not assumed.*
* **Cost inversion** — whole-file reads can cost more than the Claude seat replaced. `grep_files` is in v1 precisely to blunt this (F8); Phase 4 records measured tokens/USD vs the Claude baseline.
* **Windows / Git-Bash substrate** — "heredocs and `node -e` mangle `\r\n` regex literals on Windows" is a recorded repo gotcha and applies doubly to a model composing shell strings. v1 restricts `run_bash_command` to allowlisted **argv forms**, never free-form shell composition.
* **A model with commit rights can still commit something wrong that passes every gate.** The fence for that is not code — it is Phase 4's Claude grounder panel and §B's default-to-Claude fallback.

### 1.4 The v1 bash allowlist — **read-only by construction** (F10)

**Rule:** the *only* sanctioned paths by which the worktree changes are (a) the explicit `write_file`/edit tools and (b) the `git_commit` call. **Every tree-mutating command is EXCLUDED from the v1 allowlist**, specifically including `npm run lint -- --fix`, a bare `lint-staged`, `npx biome check --write`, `git checkout/restore/stash/reset/clean`, and any redirect (`>`, `>>`, `tee`) to a repo path.
**Allowlisted (read-only) v1 argv forms:** `npm run typecheck` · `npm run lint` *(no `--fix`)* · `npx vitest run <path>` / `npx vitest related <paths> --run` · `npm run test` · `git status --porcelain` · `git diff [--cached] [--stat]` · `git log`/`show`/`blame` · `node <script> --check`-class validators.
**The one sanctioned exception, named explicitly:** `git commit` invokes husky, and **`lint-staged` inside the hook DOES mutate staged files.** That mutation is legitimate and expected; it is attributed to the `git_commit` call's own pre/post window in the ledger and is the only tree delta not traceable to a `write_file` record. *(This is exactly the case that made v1's naive "1:1 ledger↔diff" criterion self-defeating — F10.)*

---

## 2. The four phases (sized — 14 commits)

### Phase 1 — Engine Core *(WF1; **5 commits**; schema/ledger FIRST — F12)*
**Commit order is load-bearing: the contract and the audit trail exist before anything can act.**
1. **Spec 08 §C + the schemas** — the tool-call contract (each tool's JSON schema: name, args, return shape, error shape), the **ledger record schema** (incl. the bash pre/post `git status --porcelain` + diff-hash fields, F10), and the denylist contract (F11). No executable code yet.
2. **`exec-ledger.js` + the loop skeleton** — append-only writer to the out-of-repo path; **the engine may not take a tool call it cannot log** (a ledger write failure aborts the run).
3. **`read_file` + `grep_files`** (**unconditional in v1** — F8) + G3/G4 read-before-write and staleness tracking.
4. **`write_file` + `run_bash_command`** — timeout/cap (G6), argv-form restriction, pre/post capture on every bash call.
5. **`deepseek-exec.infra.test.ts`** — Phase-1 arms.
*Locks:* loop terminates on max-iteration · a malformed tool call **aborts with a ledger `error` record** (RED: a stubbed malformed call must abort, not improvise) · `write_file` on an unread file REFUSED (both directions) · **every tool call appears in the ledger exactly once** · **every bash call carries a pre/post worktree hash pair**.

### Phase 2 — Safety Fences *(WF1; **5 commits**)*
6. **Allowlist + path confinement** (G1/G2) — deny-by-default; §1.4's read-only v1 set.
7. **Self-protection denylist (G10 — HIGH, F11)** — `scripts/deepseek-exec.js`, `scripts/lib/exec-tools.js`, `scripts/lib/exec-ledger.js`, `scripts/lib/exec-policy.json`, `.husky/**`, `.git/**`, and the ledger directory are **unwritable and un-`bash`-reachable**, enforced **in the tool layer** (not merely by policy data the model could edit). The ledger lives **outside the repo** and is opened **append-only (`O_APPEND`, no truncate path in the code)**.
8. **Secret fences** (G5) — `.env`-class read refusal + redaction before prompt *and* ledger.
9. **Kill switch + budgets** (G8) — sentinel checked before **every** tool call; iteration + token caps.
10. **Commit fences + `deepseek-exec-fences.infra.test.ts`** (G9) · **10b. Multi-worker isolation (F13, §C.6): write scope + reserved registries + active claims + per-worktree committer lock** — single-committer advisory lock; explicit staging from the ledger; **`--no-verify` REFUSED**.
*Locks — each proven BOTH directions, and every block must also produce a ledger `blocked` record:*
`git commit --no-verify` → **call REJECTED + ledgered** (F12: **never "stripped"** — silently rewriting the model's argv teaches nothing, hides intent, and would make the ledger a lie) / plain `git commit` allowed · `git add -A` blocked / enumerated `git add <path>` allowed · `rm -rf`, `git push`, `git reset --hard`, `npm run lint -- --fix` blocked / `npm run typecheck` allowed · write to `../outside` blocked / write inside the repo allowed · **`write_file('scripts/lib/exec-policy.json')` blocked · `write_file('scripts/deepseek-exec.js')` blocked · a bash redirect into the ledger dir blocked** (the F11 RED-first trio) · `read_file('.env')` blocked / `read_file('package.json')` allowed · kill sentinel present → loop halts before the next tool call.

### Phase 3 — Execution Toggle *(WF2; **2 commits**)*
`EXECUTION_PROVIDER=deepseek|claude` + `--provider=deepseek|claude` (**two values — `fable` is a Claude model name, not a provider; F1**), **Claude the default and the fallback for ALL execution steps** (Spec 08 §B).
**Grounded landing point:** there is **no programmatic WF orchestrator** — `scripts/run-chain.js` orchestrates *pipeline data steps*, `npm run task` (`scripts/task-init.mjs`) only scaffolds `.cursor/active_task.md`, and the WF orchestrator is **a Claude Code session following `CLAUDE.md`**. So the toggle lands in **(a)** the engine CLI's flag/env resolution and **(b)** the **brief protocol** — `CLAUDE.md` + `.claude/workflows.md` gain the rule that the orchestrator resolves the provider at task start, **states it in the brief and in the Green Light evidence**, and downgrades to Claude **with a logged reason** whenever the engine is unavailable, the step is a verification seat, or the step touches money/auth/PII/migrations. **`run-chain.js` is NOT modified.**
11. engine-side resolution + precedence lock (`--provider` > `EXECUTION_PROVIDER` > default `claude`; unknown value → `claude` + warn, never throw-and-halt).
12. `CLAUDE.md` / `.claude/workflows.md` brief-protocol edits + extend `agent-roster.infra.test.ts` T7 from contract-text to **runtime** assertion (the honest upgrade PART A's T7 docblock promises).

### Phase 4 — Supervised Pilot *(WF3-shaped; **2 commits**)*
**Branch: dedicated, not main (F9).** A bad engine commit is discarded by deleting the branch, never by reverting main; this also satisfies the standing "one committer at a time" ruling without contending with the Step Opt Programme's branch.
**Pilot step: `scripts/quality/assert-data-bounds.js`.** Reasons: (a) it is in `converted.json` (18 converted entries), so `step-validate.mjs`, the shape rule and `golden-fingerprint.infra.test.ts` supervise it **mechanically** — the differential gate exists before the engine touches it; (b) **Observer/quality archetype** — read-only, `records_total/new/updated = null`, so a bad run cannot corrupt enriched data; (c) it owns a dedicated lock, `src/tests/assert-data-bounds.infra.test.ts`; (d) **no open `.cursor/` plan in flight** (unlike `assert_engine_health`, `assert_parcel_sanity`, `enrich_ravines`, `enrich_heritage`, `compute_parcel_cost_estimates`), so the pilot cannot collide with batch 2. *Alternate if it goes in flight:* `scripts/quality/assert-global-coverage.js` (same archetype and properties).
The engine executes one small, real WF3 end-to-end — reproduce, red, fix, green, commit through the husky hooks — **with zero orchestrator hand-holding**. Then a **Claude grounder panel adjudicates:** A5 Integration (does the diff match the real codebase?), A6 Regression Guardian (**every deletion's fence stated — the engine has no memory of why a line existed**, the sharpest risk of a model with commit rights), A4 Observability if the step's records change, plus the §3 reconciliation.
13. the pilot's fix commit, authored by the engine · 14. the pilot record + the Spec 08 §A STATUS flip, **with its lock, in the same commit**.

---

## 3. Exit criteria — what flips Spec 08 §A from `PLANNED` to `live`

All must hold, each with evidence in the pilot record:
1. **Zero `--no-verify`, zero bypassed gate** — and the fence proven to **refuse and ledger** it, not merely proven unused.
2. **Per-call worktree reconciliation (F10 — replaces v1's self-defeating "1:1 ledger↔diff").** For **every** ledger record, the recorded pre/post `git status --porcelain` + diff hash must show: a `write_file` record ⇒ exactly the file it names changed; a **bash record ⇒ NO worktree delta** (guaranteed by §1.4's read-only allowlist — a delta here is a fence breach, not a bookkeeping quirk); the `git_commit` record ⇒ delta EXACTLY its `paths` (F-II5, 2026-09-22: this repo's lint-staged runs `biome check` without `--write`, so no formatting delta exists; if lint-staged is ever made to write, the allowance returns WITH a lock). **Any tree delta not attributable to one of those three is disqualifying.**
3. **All repo gates green unassisted** — pre-commit and pre-push pass on the engine's own commit with no orchestrator intervention.
4. **Claude grounder panel finds no undefended fence** (A6) and no integration fiction (A5).
5. **Kill switch proven to halt mid-loop** in a live run, not only in a unit fixture.
6. **Self-protection proven live (F11)** — an actual run in which the model is prompted toward its own policy/ledger/source and is **blocked and ledgered**, not merely a fixture.
7. **Every Phase-2 fence lock green in both directions**, and `hooks-composition.infra.test.ts` still green.
8. **Measured cost recorded** — tokens/USD for the pilot vs the Claude baseline. *(A cost inversion does not block the flip, but it is recorded and re-opens the §7 rule-9 economics claim.)*
9. The flip commit **carries its lock** (Spec 124 §4.4) — `agent-roster.infra.test.ts` T3/T7 pass with the row reading `live` and no orphaned `SUB-ENG-1` reference.

**Any criterion failing → the §A row stays `PLANNED`** and the shortfall is filed to `docs/reports/review_followups.md`. Because §B defaults to Claude, a failed flip costs nothing operationally.

---

## 4. Execution Plan (WF1 skeleton — every step verbatim; N/A carries its reason)

- [ ] **Step 1 — Contract Definition:** the **tool-call contract**, the **ledger record schema** (incl. bash pre/post fields) and the **denylist contract** are defined and land in Spec 08 §C **as commit 1, before the loop** (F12).
- [ ] **Step 2 — Spec & Registry Sync:** author Spec 08 §C; §A's STATUS **value stays `PLANNED`** until Phase 4's exit criteria (only its narrative notes the phase reached). `npm run system-map`.
- [ ] **Step 3 — Schema Evolution:** N/A — Database Impact = NO.
- [ ] **Step 4 — Test Scaffolding:** `deepseek-exec.infra.test.ts` (Phase 1) + `deepseek-exec-fences.infra.test.ts` (Phase 2), both `SPEC LINK: docs/specs/00-architecture/08_agents.md §C`.
- [ ] **Step 5 — Red Light:** every arm observed RED before the fence exists and GREEN after (§11.3 — both directions, at the designed assertion). **No arm may require a live DeepSeek API call** — the loop is driven by a recorded/stubbed tool-call transcript so the locks run in CI.
- [ ] **Step 6 — Implementation:** Phases 1 → 2 → 3 in order; Phase 4 only once 1–3 are green.
- [ ] **Step 7 — Auth Boundary & Secrets:** G5 both directions. `DEEPSEEK_API_KEY` is read from the environment and **never written to the ledger, stdout, or a prompt**; a dedicated arm asserts no ledger record contains a value matching the key pattern.
- [ ] **Step 8 — Pre-Review Self-Checklist:** 5–10 items from Spec 08 §C + §1.1's G-rows walked against the ACTUAL diff. Mandatory items: *is there any path by which the model reaches `git commit` without the allowlist?* · *can any tool call occur before the kill-switch check?* · ***can any tool call or bash argv reach the engine's own source, policy, or ledger?*** · *does any handler swallow an error without a ledger record?* · *does any allowlisted command mutate the tree?*
- [ ] **Step 9 — Multi-Agent Review (Backend/Pipeline, 5-reviewer panel + Guardian on Phase 3's existing-file edits):** DeepSeek CLI lens set — **security** and **idempotency** are the load-bearing lenses for a shell-capable executable — + `code-reviewer-grounded` + **A5 Integration** (main tree: does the engine's git/hook interaction match the REAL husky composition?) + **A6 Regression Guardian** on the Phase-3 edits to `CLAUDE.md`/`.claude/workflows.md`. **Reality-Check: N/A** — no enriched/derived field is added or changed (Spec 08 subject-matter trigger). Every CLI finding grounder-adjudicated. Triage: BUG → WF3 before Green Light; DEFER → `review_followups.md`.
- [ ] **Step 10 — Fold Validation (Spec 08 §11.2):** mandatory after every fold — one grounder re-executes every claim; one **Cross-read Adversary** checks the fences PAIRWISE (**the canonical collision here: a path-confinement rule and an allowlist entry each safe alone that compose into an escape** — e.g. an allowlisted `git` argv that accepts a `--git-dir`/`-C` path override). An **Idempotency Lens** pass is required at Phase 2 (`git_commit` is a re-runnable destructive write; the single-committer lock is exactly the replay/collision class that seat owns).
- [ ] **Step 11 — Green Light:** `npm run test && npm run lint -- --fix` per phase. Paste the final test summary line + typecheck result. List each prior step DONE or N/A. → **WF6**.

---

## 5. §11 Plan Compliance (docs/specs/00_engineering_standards.md §11)
DB Impact NO · no API route · no UI · no migration → N/A by condition. **Applicable:** *If Pipeline Script Created/Modified* — **the engine is NOT a pipeline script** (no `pipeline.run`, no advisory lock over a data table, no `PIPELINE_SUMMARY`); it is an operator tool in `scripts/`, so Spec 47 §R1–R12 does not apply and §9.4/§9.5 are **N/A by that reason, not by omission**. It still honours the `scripts/` absolute rules: no `process.exit()`, no empty catch, no raw SQL (it opens no DB connection). *Pre-Review Self-Checklist* (Step 8, five items incl. the self-protection probe) · *Cross-Layer Contracts* — the `EXECUTION_PROVIDER` vocabulary crosses Spec 08 §B ↔ engine CLI ↔ brief protocol and is pinned by the Phase-3 lock (not a numeric threshold, so not a `_contracts.json` row).

---

## 6. Asks — none survive in PART B

B1 (`grep_files`) and B2 (dedicated branch) were **ruled YES** by the operator and are folded (F8/F9). Sequencing is PART A's single remaining Ask (A2); **recommendation: authorise PART A now, hold PART B until batch 2 closes.**

---

## 7. Fold Log — plan panel round 1, folded 2026-09-22

### 7.1 Folds

| ID | Source | Change | Re-verified against |
|----|--------|--------|---------------------|
| **F1** | Operator ruling (A1) | Toggle enum collapsed to `deepseek\|claude`; `fable` removed as a provider value (Phase 3) | harness `Agent` model enum — Fable is a Claude model, not a provider |
| **F8** | Operator ruling (B1) | **`grep_files` is unconditional in v1**; all "add if cost shows" wording removed. It is now named in the Key Files tool list, Phase 1 commit 3, and §1.3's cost-inversion mitigation | v1 had it conditional in two places — both rewritten |
| **F9** | Operator ruling (B2) | **Pilot runs on a dedicated branch**; moved from Ask to Phase 4's opening line, with the rationale (discard by branch deletion; no contention with batch 2) | standing "one committer at a time" ruling |
| **F10** | Panel — **exit criterion #2 was self-defeating** | v1's "1:1 ledger↔diff" breaks the moment an allow-listed command writes files (`lint --fix`, `lint-staged`). **Two coupled changes:** (a) **every bash call records pre/post `git status --porcelain` + diff hash**, making reconciliation **per-call** (G7, Phase 1 commit 4); (b) **the v1 allowlist EXCLUDES every tree-mutating command** (§1.4), leaving `write_file`/edit and `git_commit` as the only sanctioned mutation paths. Exit criterion #2 rewritten accordingly | `.husky/pre-commit` — **`lint-staged` runs inside the commit hook and DOES mutate staged files**; that single exception is now named explicitly rather than left to collide with the criterion |
| **F11** | Panel — **HIGH: the engine could rewrite its own audit trail** | v1 put the ledger at `.exec-runs/` **inside the repo** and `exec-policy.json` under `scripts/lib/` — both reachable by `write_file`/bash, so a model could edit its own policy or erase its own trail. **Fixed:** a **self-protection denylist enforced in the TOOL LAYER** (not in policy data the model could edit) covering the engine's source, `exec-policy.json`, `.husky/**`, `.git/**` and the ledger dir; **the ledger moves OUTSIDE the repo** (`%LOCALAPPDATA%/buildo-exec-runs/`) and is **append-only (`O_APPEND`, no truncate path)**. New **G10** row; **RED-first trio** in Phase 2 commit 7; **new exit criterion #6** (proven live, not only in a fixture). **Consequence: `.gitignore` is no longer modified** — v1's `.gitignore` edit is removed from Key Files | `.gitignore:75-76` (the gitignore pattern v1 would have used is now unnecessary) |
| **F12** | Panel — three internal contradictions | (a) **Schema/ledger land BEFORE the loop** — Phase 1's commit order rewritten, §C is commit 1, the ledger writer commit 2, "the engine may not take a tool call it cannot log"; (b) **`grep_files` unconditional** (= F8); (c) **`--no-verify` is REFUSED — the call is rejected and ledgered — NEVER "stripped"**; v1's "refused at the policy layer AND stripped from any argv" is removed, with the reason recorded (silently rewriting the model's argv hides intent and makes the ledger a lie) | v1 Phase 2 text contradicted itself between "refused" and "stripped" |

| **F13** | Operator ruling 2026-09-22 ("yes fold and build with this in mind") — multi-worktree concurrency | **Spec 08 §C.6 authored (commit 5b):** (1) per-task **`write_scope`** declared in the brief's front matter, enforced on `write_file`/`edit_file`/`git_commit.paths` (`PATH_OUT_OF_SCOPE`; provider `deepseek` with no scope ⇒ `NO_WRITE_SCOPE`); (2) **`registry_reserved`** policy list (`scripts/manifest.json`, `converted.json`, `converted.json.pending`, census, `programme-items.json`, `template-freeze.json`, `schema-baseline.json`, system map) — engine writes ⇒ `PATH_RESERVED`; the ORCHESTRATOR performs registry edits at landing; (3) **active-claims registry** `<ledger_dir>/active-claims.json` — overlap on same worktree or same branch ⇒ `CLAIM_CONFLICT`, dead-pid reclaim; (4) **committer lock keyed per worktree root** (the global lock in §C.1.8 v1 would have serialised commits across worktrees). Lands as **Phase 2 commit 10b** (`exec-claims.js`, front-matter parser, minimal glob matcher — no new deps; locks in `deepseek-exec-fences.infra.test.ts`). Size 14 → **15 commits.** | `git worktree list` (16 live worktrees today); `scripts/steps/_schema/` registry inventory; no `minimatch`/`js-yaml` direct dep in `package.json` |

| **F14** | Operator ruling 2026-09-22 ("use this engine outside step optimization as well, multiple worktrees") | The engine is a GENERAL execution substrate, not a step-opt tool. Folded into Phase 3 commit 11: `claude_only_globs` policy data (`PATH_CLAUDE_ONLY` — the §B money/auth/PII/migrations downgrade enforced, not just briefed); `--repo <worktree>` flag so the orchestrator launches N engines from one shell; allowlist reviewed for general repo work (still read-only); `docs/runbook/engine-brief-template.md` with the multi-worktree launch recipe (`npm ci` per worktree, never a junction). Phase 4's pilot remains a step-opt task only because it is the first proof. | §C.6 keys (worktree root + branch) already task-agnostic; §C.2 tool list has no step-opt coupling |

### 7.2 Pairwise collision check (§11.2 — the folds read as a SET)

* **F10 × F11** — both add ledger obligations. **Checked:** F10 writes *more* per record while F11 moves the file out of reach; they compose (the richer record is exactly what criterion #2 reads, and it must be unforgeable for that to mean anything). **F11 is load-bearing FOR F10** — per-call reconciliation is worthless if the model can edit the ledger. Recorded as a dependency, not just a coincidence.
* **F10 × §1.2** — excluding `npm run lint -- --fix` from the allowlist while `.husky/pre-commit` runs `npm run lint` (no `--fix`) and `lint-staged` (which mutates). **No contradiction:** the engine may *invoke* `npm run lint` read-only; the mutation happens only inside the commit hook, which is criterion #2's named exception.
* **F12(a) × F10** — schema-first means the ledger's bash pre/post fields must be specified in commit 1, before the tool that emits them exists in commit 4. **Consistent, and deliberately so** — that is the point of schema-first.
* **F12(c) × G9 × criterion #1** — "refuse + ledger" must appear identically in the fence list, the lock list and the exit criterion. **Verified identical in all three.**
* **F8 × §1.4** — `grep_files` is a *tool*, not a bash command, so it is unaffected by the read-only allowlist. **No collision;** noted so a future reader does not "fix" it by allowlisting `grep`.
* **F9 × F11** — a dedicated branch plus an out-of-repo ledger means the audit trail **survives branch deletion**. Called out as a benefit, not a gap.

### 7.3 Staleness walk

Every line re-read against the folds: **Key Files** — `.gitignore` removed (F11), ledger path changed, `grep_files` added · **§1.1** — G10 row added; G1/G7 rewritten · **new §1.4** (allowlist) inserted and cross-referenced from G1, criterion #2 and Step 8 · **Phase 1** 4→**5** commits (schema split out) · **Phase 2** 4→**5** commits (denylist commit added) · **Phase 3/4** commit numbers renumbered 11–14 · **exit criteria** 8→**9** (self-protection added; #2 rewritten) · **Step 8** gained the self-protection and tree-mutation probes · **Step 10** gained the concrete collision example (`git -C`/`--git-dir` override) · **§6 Asks** emptied · header size 12→**14 commits**.

### 7.4 Not grounded — stated, not hidden

* **DeepSeek function-calling reliability** over long loops is **unmeasured** (§1.3). Phase 1's acceptance measures it; no claim is made in advance.
* **The ledger path** (`%LOCALAPPDATA%/buildo-exec-runs/`) is a **design choice, not a verified location** — no such directory exists today. It is stated as PLANNED, like everything else in SUB-ENG-1.
* **`assert-data-bounds.js`'s suitability** rests on its `converted.json` membership + Observer archetype + the absence of an in-flight `.cursor` plan (all verified) — but **its golden/differential behaviour under an engine-authored diff has never been exercised**. That is what the pilot measures; it is not assumed.

---

> **PLAN LOCKED. Do you authorize this WF1 (Genesis) plan? (y/n)**
> §11 note: Spec 47's script skeleton is recorded N/A *with its reason* (the engine is an operator tool, not a `pipeline.run` step) rather than silently omitted — the §11 "keep the name, write N/A with a reason" rule.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
