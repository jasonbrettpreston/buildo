# Active Task: Spec 08 — Substrate Reality Mapping + Substrate Toggle Contract (PART A, docs)
**Status:** Implementation
**Workflow:** WF1 (Genesis — new spec sections + new infra lock)
**Domain Mode:** **Backend/Pipeline** (`scripts/CLAUDE.md` read; the deliverable is a governance spec over pipeline WF panels + a new `src/tests/*.infra.test.ts` lock; the Domain Rules row "Doc-only changes, specs, reports → follow whichever domain the documented work belongs to" resolves here.)
**Companion plan (PART B, build):** `.cursor/wf1_deepseek_execution_engine_active_task.md` — tracked item **SUB-ENG-1**.
**Revision:** v2 — plan panel folded (see **§6 Fold Log**, F1–F9). Size after folds: **3 commits.**

---

## 0. GROUNDING — what exists vs what does not (PD #10; nothing hidden)

> This section is the plan's own §11.1 compliance: every claim below was executed or read at the
> cited anchor, not remembered. A spec may not describe a capability that does not exist as if it did.

### 0.1 EXISTS — verified (evidence inline)

| # | Capability | Evidence (executed / read this session) |
|---|---|---|
| E1 | **DeepSeek static-review CLI** `scripts/deepseek-review.js` | Read in full. `require('openai')`, `BASE_URL = 'https://api.deepseek.com'` (`:31`); `const MODEL = process.env.DEEPSEEK_MODEL \|\| 'deepseek-reasoner'` (`:30`) — **R1 by default, V3 (`deepseek-chat`) via `DEEPSEEK_MODEL`** (documented `:246-248`). Modes: `test`, `review <file> [--context <f>]`, `spec <spec-path>`, `plan [--template/--specs/--data-context]` (dispatch `:263-296`). Hard-exits without `DEEPSEEK_API_KEY` (`:33-39`). |
| E2 | **Both review CLIs are READ-ONLY** | `grep -nE "writeFile\|appendFile\|child_process\|spawn\|exec\(\|execSync\|unlink\|mkdir"` over `scripts/deepseek-review.js` → **NONE**; over `scripts/gemini-review.js` → **NONE**. `fs` is used only for `existsSync`/`readFileSync` (`:73-80`). **Neither CLI can write a file, run a command, or commit.** |
| E3 | **Gemini static-review CLI** `scripts/gemini-review.js` | `const MODEL = 'gemini-2.5-pro'` — **hardcoded, no env override** (`:33`); `GEMINI_API_KEY` (`:35-42`); same four modes (`cmdTest/cmdReviewFile/cmdReviewSpec/cmdReviewPlan` `:80,:93,:126,:151`). |
| E4 | **npm entry points** | `package.json`: `review:gemini = node scripts/gemini-review.js`, `review:deepseek = node scripts/deepseek-review.js`. **No other review/agent/provider script exists.** |
| E5 | **Tool-bearing Claude seats** | `.claude/agents/` holds exactly four: `code-reviewer-grounded.md`, `observability-reviewer.md`, `pipeline-reality-check.md`, `regression-guardian.md`. **Each frontmatter declares `tools: Bash, Read, Grep, Glob` AND `model: sonnet`** (read directly). This is the machine-readable roster file the lock (T4) binds to. |
| E6 | **How the orchestrator actually spawns work** | The harness `Agent` tool's `model` parameter is a **closed enum: `sonnet \| opus \| haiku \| fable`** — Anthropic models only (harness tool schema, this session; *provenance: harness surface, not a repo file*). **DeepSeek cannot be a sub-agent.** The only DeepSeek path is the CLI (E1) invoked via Bash. **"Fable" here is the Claude model the orchestrator session runs on — nothing more** (F1). |
| E7 | **Standing 2026-09-21 operator ruling (LIVE, already practised)** | Memory `feedback_deepseek_review_seats.md:11-15`: "replace Anthropic REVIEW seats with the DeepSeek CLI wherever possible… except where the seat is impossible for a no-tool CLI"; DeepSeek takes adversarial/spec/security/idempotency/error-path lenses, Compliance, Round-2, whole-file code-quality reads, text-answerable plan reviews; **Integration, Reality-Check, Regression Guardian, Observability, Schema-Fidelity, fold-validation grounders and execution stay Anthropic**; every CLI finding is grounder-adjudicated. Spec 08 §9 (CLI blind spots) + §11.5 already carry the doctrine — **the roster table has never been stamped with it.** |
| E8 | **Repo gates any committer inherits for free** | `.husky/pre-commit` (read): `step-churn-complexity --check` → `generate-template-freeze --check` → `spec-split-check --check` → `step-validate --staged --fast` → `lint-staged` → `validate-migrations.sh` → `check-migration-down-comments.sh` → `ast-grep-leads.sh` → `npm run typecheck` → `npm run lint` → scoped `vitest related` (1 fork). Pre-push runs the full suite. Composition pinned by `src/tests/hooks-composition.infra.test.ts`. |

### 0.2 DOES NOT EXIST — verified by repo-wide search (ZERO matches)

`Grep` over `C:\Users\User\Buildo` for `EXECUTION_PROVIDER|FABLE_API_KEY|deepseek-exec|--provider=` → **No matches found.**

| # | Claimed capability | Truth |
|---|---|---|
| N1 | A **DeepSeek execution engine** that edits files, runs tests, or commits | **Does not exist.** E2 proves both CLIs are read-only. There is no `scripts/deepseek-exec.js`, no function-calling loop, no tool schema, no run ledger. PART B builds it (SUB-ENG-1). |
| N2 | `EXECUTION_PROVIDER` env var | **Does not exist** (0 matches). |
| N3 | `--provider=` CLI flag | **Does not exist** (0 matches). |
| N4 | `FABLE_API_KEY` | **Does not exist, and is a CATEGORY ERROR.** "Fable" is a **Claude model id** in the harness `Agent` tool's `model` enum (E6) — the model this orchestrator session runs on, not a provider. **`FABLE_API_KEY` is never added to Spec 08 §2, and `fable` is never a provider value** (F1 / D1). |
| N5 | A programmatic "task orchestrator" that could host a runtime provider switch | **Does not exist in the WF sense.** `scripts/run-chain.js` orchestrates **pipeline data steps**, not WF tasks. `npm run task = node scripts/task-init.mjs` only *scaffolds* `.cursor/active_task.md`. **The WF orchestrator is a Claude Code session reading `CLAUDE.md`** — so the toggle's only honest landing point is the **brief protocol** (`CLAUDE.md` + `.claude/workflows.md`) plus the engine CLI's own flag, **NOT a runtime switch inside `run-chain.js`.** (Locked as D4.) |

### 0.3 Premise corrections (resolved against the standing record; D1/B-rulings now operator-ratified)

| # | Premise | Ruling |
|---|---|---|
| D1 | Env includes `FABLE_API_KEY`; toggle enum is `fable\|deepseek\|claude` | **REFUTED, and the enum COLLAPSES to `deepseek\|claude`** (operator ruling, folded as **F1**). Fable is a Claude model name, not a provider — carrying it as a provider value reproduces inside the enum the exact category error this plan identified. §2 env keys: `DEEPSEEK_API_KEY` + `GEMINI_API_KEY` (live), `EXECUTION_PROVIDER` (PLANNED). No Fable key, no `fable` value. |
| D2 | A3 Code Reviewer = Claude | **AMENDED** per E7 + Spec 08 §9 + §11.5: **A3 = DeepSeek CLI static whole-file pass + Claude `code-reviewer-grounded` adjudicating every executable claim.** The CLI does the breadth read; the grounder executes. Encoded as the closed vocabulary value `DeepSeek CLI + Claude grounder` (F4). |
| D3 | A10 Compliance = DeepSeek | **ALREADY TRUE** — Spec 08 §5.1 ("DeepSeek CLI at plan altitude (`spec <path>`)") and §10 both say so. Round-2 (§5.3) is likewise already DeepSeek+Integration. **A10 takes the SAME compound value as A3** (F4) — §9 already requires every CLI finding to be grounder-adjudicated, so A10's real substrate *is* "CLI pass + Claude adjudication". No fifth vocabulary value is minted. |
| D4 | Toggle wired into "the step runner / task orchestrator" | **RELANDED** per N5: the toggle lands in the **brief protocol** + the engine CLI. `run-chain.js` is out of scope and stays untouched. |
| D5 | Spec 05 needs a substrate edit | **NOT NEEDED.** `grep -n "agent\|DeepSeek\|Gemini\|subagent\|substrate" docs/specs/00-architecture/05_knowledge_operating_model.md` → only `:27` ("next time agent reads it") and `:120` ("scheduled agent"). **Neither cites an agent substrate. Spec 05 is NOT touched.** |
| D6 | Spec 124 may need a policy amendment | **NOT NEEDED.** Spec 124 §6 scopes itself to the pipeline **step** standard and explicitly disclaims programme mechanics; the agent roster is Spec 08's own §8 Operating Boundaries. **No §5 register row, no §4 ruling.** Imported from Spec 124 §4.7 (R-I) (a document move is verified by a *line-set diff before commit*) → the verbatim locks T5; **§4.4** ("a rule without a lock is not yet a rule") → every new Spec 08 rule ships with its test in the SAME commit; **§4.2** (discoverer ≠ adjudicator) → this plan's review roster. |
| D7 | `.claude/agents/*.md` frontmatter needs a `model:` edit | **NO EDIT.** All four already carry `model: sonnet` (E5) and are the Claude seats. They become the **binding target** of lock T4 instead. |

### 0.4 Real drift found while grounding — VERIFIED SCOPE (F6)

Spec 08 **§9's own entry** — *"Tool-less substrate silently downgrades a seat to static reasoning (found 2026-08-16, B3 output panel)"* — is at **`08_agents.md:251`** (read; the claim in v1 is confirmed, not dropped). It records that `feature-dev:*` agent types **declare no Bash tool** and were replaced by `code-reviewer-grounded` / `observability-reviewer` / `regression-guardian`, and §10.2's SUBSTRATE RULE generalises it.

**Yet the stale types are still live in four protocol surfaces** (`Grep` for `feature-dev:(code-reviewer|code-explorer|code-architect)`, full hit list read):

| Surface | Hits | Disposition |
|---|---|---|
| `.claude/workflows.md` | `:42, :47, :52, :88, :91, :96, :128, :129` | **FIX** (Edit 6) |
| `scripts/CLAUDE.md` | `:130` | **FIX** (Edit 6) |
| **`docs/specs/00-architecture/08_agents.md` ITSELF** | `:24` (§2 matrix), `:43` (A3), `:44` (A4), `:46` (A6) | **FIX** — the spec contradicts its own §9/§10.2 (Edits 1 + 3) |
| **`docs/specs/00_claude_code_operating_model.md`** | `:284` | **FIX — newly found this fold; added to Key Files** |
| `.cursor/archive/**`, `docs/reports/review_followups.md`, `.cursor/wf1_*` plans | many | **DO NOT TOUCH — these are HISTORY.** Rewriting a closed task record or a dated review-provenance row falsifies the record (the standing "no transcription from prior artifacts" / record-integrity principle). T8's scope excludes them explicitly. |

`.claude/worktrees/` is gitignored (`.gitignore:75-76`) and is likewise excluded from T8.

---

## Context
* **Goal:** Make the substrate architecture the operator wants the written standard in Spec 08 — DeepSeek as the low-cost driver for execution + static review, tool-bearing Claude reserved for verification seats that need live tree/DB/git — **without the spec claiming a capability that does not exist.** Every substrate row carries an explicit `STATUS` (`live` / `PLANNED — SUB-ENG-1`), and a machine lock keeps the text true.
* **Target Spec:** `docs/specs/00-architecture/08_agents.md` (Spec 08) — the target IS the spec.
* **Key Files:**
  * `docs/specs/00-architecture/08_agents.md` — §2, new §A/§B, §3, §5.3, §7, §8, §9
  * `CLAUDE.md` — §Review Agent Reference (substrate line per seat)
  * `.claude/workflows.md` — WF1/WF2/WF3 panel roster lines (§0.4 drift)
  * `scripts/CLAUDE.md` — §Multi-Agent Review execution pattern (§0.4 drift)
  * **`docs/specs/00_claude_code_operating_model.md` — `:284` (§0.4 drift, added this fold)**
  * `src/tests/agent-roster.infra.test.ts` — **NEW** lock
  * *(read-only, binding targets)* `.claude/agents/*.md`, `scripts/deepseek-review.js`, `scripts/gemini-review.js`

## Technical Implementation
* **New/Modified Components:** none (`src/` app code untouched). One new test file.
* **Data Hooks/Libs:** none.
* **Database Impact:** **NO.** No migration, no schema change, no backfill.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API route created or modified.
* **Unhappy Path Tests:** the lock is proven RED in **both directions** for each of its eight arms against isolated tmp fixtures (never in-process only) — see T1–T8 and §11.3 red-first mechanics.
* **logError Mandate:** N/A — no new catch blocks.
* **UI Layout:** N/A — no UI.
* **SPEC LINK header:** `src/tests/agent-roster.infra.test.ts` carries `SPEC LINK: docs/specs/00-architecture/08_agents.md §A, §B, §3` (Traceability mandate #3 — spec **and section**).

---

## 1. PART A — the Spec 08 edit list (exact)

### Edit 1 — §2 substrate matrix rewritten + **new §A "Substrate Reality Mapping"** (inserted after §2)
Replaces the current `:21-24` table **including its stale `feature-dev:code-reviewer, feature-dev:code-explorer` example list at `:24`** (§0.4). Three rows, each with an explicit **STATUS**:

| Substrate | What it is | Tools / access | Cost | Use for | **STATUS** |
|---|---|---|---|---|---|
| **External-model CLIs** | `scripts/deepseek-review.js` (DeepSeek-R1 default, `deepseek-chat`/V3 via `DEEPSEEK_MODEL`) · `scripts/gemini-review.js` (Gemini 2.5 Pro, hardcoded) | **None** — reads only the files passed; **no repo, DB, git, shell, and NO WRITE PATH** (locked by T6) | Cheap | Static review: adversarial lenses, `spec`/`plan` altitude, Compliance, Round-2, whole-file code-quality reads | **`live`** |
| **Claude Task agents** (tool-bearing) | the four project-defined seats in `.claude/agents/` + the harness seats (`general-purpose`, `frontend-design`, `/security-review`), spawned on `sonnet \| opus \| haiku \| fable` — the harness's closed model enum. **DeepSeek cannot be a sub-agent.** | Full: Read/Grep/Glob/**Bash**, git, live DB, worktree isolation | Pricier | The verification seats that MUST touch reality: **A4, A5, A6, A7, A8, A9, A13** | **`live`** |
| **DeepSeek Execution Engine** | `scripts/deepseek-exec.js` — a Node agentic function-calling loop with `read_file`/**`grep_files`**/`write_file`/`run_bash_command`/`git_commit` | Shell + filesystem + git, under built fences | Cheapest per token; **highest blast radius** | Code generation, file writing/editing, committing — the execution seat | **`PLANNED` — not built; tracked as SUB-ENG-1** (`.cursor/wf1_deepseek_execution_engine_active_task.md`) |

Env-key line, corrected: **live** `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` (in `.env`); **PLANNED** `EXECUTION_PROVIDER` (SUB-ENG-1). Standing note: **`FABLE_API_KEY` is deliberately absent — "Fable" is the Claude model the orchestrator session runs on, not a provider** (D1/N4/F1).

### Edit 2 — **new §B "Substrate Toggle Contract"** (inserted after §A)
* **Vocabulary (F1):** `EXECUTION_PROVIDER=deepseek|claude`, CLI equivalent `--provider=deepseek|claude`. **Two values only.** Fable is named nowhere in the enum; it appears in Spec 08 solely as one of the Claude model ids the orchestrator session may run on.
* **Default & fallback (the load-bearing clause, locked verbatim by T7):** the default is **`claude`**, and **pure Claude is the operational fallback for ALL execution steps.** An unset, unrecognised, or engine-unavailable provider **resolves to `claude` and logs the downgrade with its reason** — never a throw-and-halt, never a half-executed run.
* **Honest landing point (D4/N5):** honoured by the **brief protocol** (`CLAUDE.md` + `.claude/workflows.md`: the orchestrator resolves the provider at task start, states it in the brief and in the Green Light evidence) **and by the engine CLI's own flag**. **NOT** a runtime switch inside `run-chain.js` — that script orchestrates pipeline data steps, not WF tasks.
* **STATUS:** `deepseek` is **inert until SUB-ENG-1 ships**; nothing in the tree reads `EXECUTION_PROVIDER` today (N2). Flips to `live` only via PART B Phase 4's exit criteria.
* **Invariant (locked by T2):** **no role marked tool-required may ever be routed to a tool-less substrate, under any provider value.** The toggle governs *execution*, never *verification*.

### Edit 3 — §3 roster: add **Substrate** + **Tools required?** columns, A1–A14 (F3, F4)
Replaces the current `Substrate` column at `:39-54`, **including the stale `feature-dev:code-reviewer` at `:43`/`:44` and `feature-dev:code-explorer` at `:46`** (§0.4).

**Closed Substrate vocabulary — exactly four values:** `Gemini CLI` · `DeepSeek CLI` · `DeepSeek CLI + Claude grounder` · `Claude`.
Footnote defining the compound: *"the CLI produces the pass; a tool-bearing Claude grounder adjudicates every executable claim before any finding is folded (§9 CLI blind spots, §11.5)."*
**`Tools required?`** is a closed marker column: `no` · `yes (tree)` · `yes (tree+DB)` · `yes (tree+git)`. **T2 keys on this column, never on row numbers** (F3) — a future A15 inherits the invariant automatically.

| # | Agent | Substrate | Tools required? | Seat id |
|---|---|---|---|---|
| A1 | Gemini (adversarial) | `Gemini CLI` | no | — |
| A2 | DeepSeek (adversarial) | `DeepSeek CLI` | no | — |
| A3 | Code Reviewer | `DeepSeek CLI + Claude grounder` (D2) | no | `code-reviewer-grounded` (the grounder half) |
| A4 | Observability | `Claude` | yes (tree+DB) | `observability-reviewer` |
| A5 | Integration | `Claude` | yes (tree) | `general-purpose` |
| A6 | Regression Guardian | `Claude` | yes (tree+git) | `regression-guardian` |
| A7 | Reality-Check | `Claude` | yes (tree+DB) | `pipeline-reality-check` |
| A8 | Schema-Fidelity | `Claude` | yes (tree+DB) | `general-purpose` |
| A9 | Ground-truth | `Claude` | yes (tree+DB) | `general-purpose` |
| A10 | Compliance | `DeepSeek CLI + Claude grounder` (D3/F4) | no | `general-purpose` (the grounder half) |
| A11 | User-Advocate (UX) | `Claude` | no | `general-purpose` / `frontend-design` |
| A12 | Security | `Claude` | no | `/security-review` / `general-purpose` |
| A13 | Op-Model Compliance | `Claude` | yes (tree+git) | `general-purpose` |
| A14 | Roster Manager | `Claude` | yes (tree+git) | `general-purpose` |

Footnote records E7 as provenance and points at §9 for the grounder-adjudication requirement.

### Edit 4 — §5.3 + §7: the economics rule
* §5.3 (Round-2) gains one sentence stamping DeepSeek as its substrate and Integration as its grounder (already practised).
* §7 gains **rule 9**: *"**Substrate economics.** DeepSeek handles execution and static reviews at low cost; spend tool-bearing Claude only when live tree / DB / git tools are strictly required. The execution half is `PLANNED` (SUB-ENG-1) — until it ships, execution is Claude. Rule 8 ('spend on reality-touching agents') is unchanged and takes precedence: cheap breadth never substitutes for a grounder."*
* **§7b is NOT touched** (machine-owned by A14; a hand-edit is drift — §9). Locked verbatim by T5.

### Edit 5 — §8 Operating Boundaries + §9 Known Failure Modes — **against the REAL current text** (F5)
**§8 today reads (verbatim, `:240-242`):** Target files = `scripts/gemini-review.js`, `scripts/deepseek-review.js`, this spec, `CLAUDE.md` §Review Agent Reference, `scripts/CLAUDE.md` §Multi-Agent Review, `.claude/workflows.md` panel steps · Out of scope = workflow *sequencing*, lesson-routing (Spec 05), the husky footgun/migration gates · Cross-spec dependencies = Spec 05, Spec 47/48, Spec 01, Spec 00.
**Edit:** Target files **gain** `.claude/agents/*.md`, `docs/specs/00_claude_code_operating_model.md` (§0.4), `src/tests/agent-roster.infra.test.ts`, and `scripts/deepseek-exec.js` *(PLANNED)*. Out-of-scope **gains** `scripts/run-chain.js` (D4 — explicitly not a toggle host). Cross-spec dependencies **gain** Spec 122/124 as *consumers* of the panel roster. **Nothing in §8 is removed.**

**§9 today has seven bullets** (`:245-251`): Panel-of-clones · Compliance against fiction · Adversarial false premises · Role proliferation · Meta-governance overhead · CLI blind spots · **Tool-less substrate silently downgrades a seat** (`:251`, the 2026-08-16 B3 entry — verified, F5). **Edit: append an eighth, remove none:**
> **Substrate aspiration recorded as capability.** A spec that names an engine, env var or flag that does not exist reads as a *capability* to the next operator and to every agent that cites it. This spec ran that risk the moment it was asked to document an execution engine that had not been built. Mitigation: the §A STATUS column + `agent-roster.infra.test.ts`, which fails if any `PLANNED` row lacks a tracked item id, if a tool-required role is routed to a tool-less substrate, or if §B's fallback clause is weakened.

### Edit 6 — the cross-docs that name Anthropic agents (the §0.4 drift, scope verified)
* `CLAUDE.md` §Review Agent Reference: one substrate clause per seat; the A3/A10 compound spelled out; pointer to Spec 08 §A/§B; the §B brief-protocol obligation (D4).
* `.claude/workflows.md` `:42, :47, :52, :88, :91, :96, :128, :129` — `feature-dev:code-reviewer` → `code-reviewer-grounded` (tool call 3) / `observability-reviewer` (tool call 4); `feature-dev:code-explorer` → `regression-guardian`; add the DeepSeek-first line per E7.
* `scripts/CLAUDE.md` `:130` — same substitution.
* **`docs/specs/00_claude_code_operating_model.md` `:284`** — same substitution (found this fold).
* **NOT touched:** `.cursor/archive/**`, `docs/reports/review_followups.md`, prior `.cursor/wf*` records — **history, not protocol** (§0.4).
* **`.claude/agents/*.md`: NO EDIT** (D7). **Spec 05: NOT touched** (D5). **Spec 124: NOT amended** (D6).

---

## 2. Tests IN the plan (§11.4 — written here, reviewed at PLAN altitude)

**New file:** `src/tests/agent-roster.infra.test.ts` (`SPEC LINK: docs/specs/00-architecture/08_agents.md §A, §B, §3`).
Fixture pattern follows `src/tests/spec-split.infra.test.ts` (read this session): the real parser runs against an **isolated tmp fixture tree**, never only the in-process exports, so each RED is a genuine red.

| # | Arm | GREEN (today, after the edit) | RED proof (both directions, §11.3) |
|---|---|---|---|
| **T1** | Roster vocabulary (F4) | Every row A1–A14 parses; its **Substrate** cell is one of the **four** closed values `{Gemini CLI, DeepSeek CLI, DeepSeek CLI + Claude grounder, Claude}`; its **Tools required?** cell is one of `{no, yes (tree), yes (tree+DB), yes (tree+git)}`. **A3 and A10 both resolve to the compound value** — no fifth value, no free-text cell | Fixture with A11's cell blanked → FAIL; A10 set to free text `DeepSeek, or Claude sometimes` → FAIL; a fifth value `Llama CLI` → FAIL |
| **T2** | **Tool-bearing invariant, keyed on the marker column (F3)** | **Every row whose `Tools required?` starts with `yes` has a Substrate that is NOT tool-less** (not `Gemini CLI`, not `DeepSeek CLI`). No row numbers are hardcoded — a future A15 is covered automatically | Fixture flipping **A5 → `DeepSeek CLI`** → FAIL; **A9 → `Gemini CLI`** → FAIL; a net-new `A15 / yes (tree) / DeepSeek CLI` row → FAIL |
| **T3** | STATUS honesty | Every §A row has STATUS ∈ `{live, PLANNED}`; **every `PLANNED` row carries a tracked id matching `/^SUB-ENG-\d+$/`** that resolves in `.cursor/wf1_deepseek_execution_engine_active_task.md` | `PLANNED` with no id → FAIL; id present but absent from the Part-B plan → FAIL |
| **T4** | **Seat-id partition (F2 — precise definition)** | Every backticked **seat id** in the `Seat id` column belongs to **exactly one** of: **(a) `PROJECT_SEATS`** — derived by globbing `.claude/agents/*.md`, and each such seat's frontmatter MUST declare a `model:` field and a `tools:` list **containing `Bash`**; **(b) `HARNESS_SEATS`** — the closed literal list `{general-purpose, frontend-design, /security-review, Workflow}`, which have no repo file by design and are exempt from the frontmatter check. **An id in NEITHER set fails.** `—` (no seat) is permitted only where `Tools required? = no` | `code-reviewer-ungrounded` (in neither set) → FAIL; a `.claude/agents/*.md` whose `tools:` drops `Bash` → FAIL (the §9 `:251` hazard, mechanised); `general-purpose` → PASS with no file lookup |
| **T5** | **Verbatim preservation** (Spec 124 §4.7 (R-I) line-set diff) | SHA-256 of the **§4 Operating Manual block**, the **§7b scoreboard block**, and the **§5.2 Ground-truth block** match pinned digests — byte-identical after the edit | Mutate one byte in a fixture copy of each of the three → FAIL (three independent reds) |
| **T6** | CLIs stay read-only | `scripts/deepseek-review.js` and `scripts/gemini-review.js` contain **no** `fs.write*`/`appendFile`/`child_process`/`spawn`/`exec(`/`execSync`/`unlink`/`mkdir` | Fixture copy with one `fs.writeFileSync(` → FAIL |
| **T7** | **§B fallback doctrine — CONTRACT TEXT, not runtime (F7)** | §B contains the literal fallback contract: default `claude`; an unset/unrecognised/unavailable provider **resolves to `claude` and logs the downgrade**; the enum is exactly `{deepseek, claude}`; the `deepseek` value is marked inert and carries `SUB-ENG-1` | Fixture deleting the fallback sentence → FAIL; enum widened to include `fable` → FAIL; `deepseek` marked live without the id → FAIL |
| **T8** | **Stale tool-less agent types, scoped (F6)** | **Zero occurrences** of `feature-dev:(code-reviewer\|code-explorer\|code-architect)` across the LIVE protocol surfaces: `CLAUDE.md`, `scripts/CLAUDE.md`, `.claude/workflows.md`, `docs/specs/**` | Fixture reintroducing `feature-dev:code-reviewer` into `.claude/workflows.md` → FAIL |

**Scope exclusions for T8, asserted explicitly in the test so the intent cannot rot:** `.cursor/**` (plans + archived task records), `docs/reports/review_followups.md` (dated review provenance), `.claude/worktrees/**` (gitignored, `.gitignore:75-76`), `node_modules/**`. **These are history; rewriting them would falsify the record** (§0.4).

**Honest limitations, stated in the test docblock:** T6 is a **static source guard**, not a runtime sandbox. **T7 locks the documented CONTRACT TEXT only** — the engine does not exist, nothing reads `EXECUTION_PROVIDER` (N2), and no runtime downgrade can be asserted today; runtime enforcement is PART B Phase 3's own lock.

---

## 3. Execution Plan (WF1, `.claude/workflows.md` — every step verbatim; N/A carries its reason)

- [ ] **Step 1 — Contract Definition:** N/A — no API route. *(The closed substrate vocabulary + the `Tools required?` marker vocabulary in §A/§B ARE the contract; both are locked by T1.)*
- [ ] **Step 2 — Spec & Registry Sync:** apply Edits 1–5 to `docs/specs/00-architecture/08_agents.md`; **line-set-diff verify** (Spec 124 §4.7 (R-I)) that §4, §5.2 and §7b are byte-identical before commit. `npm run system-map`.
- [ ] **Step 3 — Schema Evolution:** N/A — Database Impact = NO.
- [ ] **Step 4 — Test Scaffolding:** create `src/tests/agent-roster.infra.test.ts` with arms T1–T8 + their tmp fixtures.
- [ ] **Step 5 — Red Light:** `npx vitest run src/tests/agent-roster.infra.test.ts`. **Each of T1–T8 observed RED against its fixture and GREEN against the real tree** — a lock never proven red against the defect it names is not a lock (§11.3). Paste both directions.
- [ ] **Step 6 — Implementation:** apply Edit 6 across all four live protocol surfaces (§0.4). Re-run the lock green (T8 flips green only here).
- [ ] **Step 7 — Auth Boundary & Secrets:** N/A — no auth surface. **Secrets check performed:** the edit names `DEEPSEEK_API_KEY`/`GEMINI_API_KEY` as *names only*; no key value is read into or written by this plan, and `.env` is not read.
- [ ] **Step 8 — Pre-Review Self-Checklist:** 5–10 items from Spec 08 §8 + §9, walked against the **ACTUAL** diff (mandatory: *does every substrate claim have a §0.1 evidence row?* · *does any sentence describe SUB-ENG-1 in the present tense?* · *did §4/§7b/§5.2 move by one byte?* · *does the word `fable` appear anywhere as a provider?* · *was any `.cursor/archive` or `review_followups` line rewritten?*). PASS/FAIL before tests.
- [ ] **Step 9 — Multi-Agent Review (docs-only, non-pipeline roster; Spec 124 §4.2 discoverer≠adjudicator):** in ONE message — (1) **Bash** `npm run review:deepseek -- spec docs/specs/00-architecture/08_agents.md`; (2) **Bash** `npm run review:deepseek -- plan`; (3) **Agent** (`general-purpose`, **haiku**, main tree) **grounder** — re-executes every executable claim in the DeepSeek output and in §0.1/§0.2/§0.4 (re-run the greps, re-read the anchors); (4) **Agent** (`general-purpose`, main tree) **A9 Ground-truth** — is the amended Spec 08 TRUE against the live tree? **Execution is the mandatory seat.** Triage: BUG → WF3 before Green Light; DEFER → `review_followups.md`.
- [ ] **Step 10 — Fold Validation (Spec 08 §11.2):** after folding ANY round and BEFORE the next edit — one grounder re-executes every claim + one **Cross-read Adversary** checks the folded decisions PAIRWISE and walks every checklist line for staleness. §6's F1–F9 are the current fold set (already cross-read once — see §6.2).
- [ ] **Step 11 — Green Light:** `npm run test && npm run lint -- --fix`. Paste the final test summary line + typecheck result, both zero failures. List every prior step DONE or N/A. → **WF6**.

**Commit shape after folds: 3.** (1) Spec 08 Edits 1–5 + `agent-roster.infra.test.ts` T1–T7 *(Spec 124 §4.4 — the rule and its lock in the same commit)* · (2) Edit 6 cross-docs + T8 flipped green · (3) `npm run system-map` regeneration if it produces a diff *(else folded into 1)*.

---

## 4. §11 Plan Compliance (docs/specs/00_engineering_standards.md §11)
DB Impact NO · no API route · no UI · no shared dual-path logic · no pipeline script · no migration → N/A by condition. **Applicable:** *Pre-Review Self-Checklist* (Step 8, with five substrate-specific items) · *Cross-Layer Contracts* — **no numeric threshold crosses spec↔SQL↔Zod↔migration**, so `_contracts.json` is not touched; the closed **substrate + tools-required + provider vocabularies** are the analogous cross-file constants and are pinned by T1/T7 · *Frontend Boundary* — **no modification to `scripts/`, `migrations/` or `scripts/lib/`** except `scripts/CLAUDE.md` (a domain doc, not code).

---

## 5. Ask — ONE survives (A1/B1/B2 ruled by the operator; see §6)

* **A2 — authorisation split + the active-task slot.** PART A is this plan (**3 commits**). PART B is **~14 commits across 3 WF units** and, per Prime Directive #1, competes for the active-task slot with the Step Opt Programme (batch 2 is the standing active task). **Recommendation: authorise PART A now and hold PART B until batch 2 closes.** PART A is self-contained and strictly truth-increasing — it makes the standard explicit and machine-locked, and the §B default-to-Claude fallback means nothing operational changes until SUB-ENG-1 ships. PART B is a shell-capable executable; it deserves an uncontended slot rather than competing with an in-flight conversion programme.

---

## 6. Fold Log — plan panel round 1 (DeepSeek `spec` + Haiku grounder + Ground-truth), folded 2026-09-22

### 6.1 Folds

| ID | Source | Change | Re-verified against |
|----|--------|--------|---------------------|
| **F1** | Operator ruling on Ask A1 | **Enum collapses to `deepseek\|claude`.** `fable` removed as a provider value everywhere (§B, Edit 1, D1, N4); Fable now named only as the Claude model the orchestrator session runs on (E6) | Harness `Agent` tool `model` enum (E6) — the category error the plan itself identified |
| **F2** | Panel — T4 was vacuous | **"Project-defined seat" defined precisely**: two-set partition, `PROJECT_SEATS` (glob `.claude/agents/*.md`, must declare `model:` + `tools:` incl. `Bash`) vs `HARNESS_SEATS` (closed literal `{general-purpose, frontend-design, /security-review, Workflow}`). An id in neither FAILS — so `general-purpose`/`frontend-design`/`/security-review` no longer fail, while a typo still does | `.claude/agents/` = exactly 4 files (E5); Spec 08 `:51,:52,:54` name the harness seats |
| **F3** | Panel — T2 keyed on row numbers | **New `Tools required?` marker column** in §3 (closed vocabulary); **T2 keys on the marker, not on A5/A7/A8/A9/A13 literals** — a future A15 inherits the invariant | Spec 08 §3 `:39-54` structure; §10.2 SUBSTRATE RULE |
| **F4** | Panel — T1 vs A10's conditional seat | **A10 takes the SAME compound value as A3** (`DeepSeek CLI + Claude grounder`), defined once in a footnote. Vocabulary stays at **four** values; no free-text cells | Spec 08 §5.1 `:90` ("DeepSeek CLI at plan altitude… or a `general-purpose` agent"), §9 CLI-blind-spots, §11.5 |
| **F5** | Panel — §8/§9 edits must quote real text; verify the 2026-08-16 claim | **§8's real `:240-242` text quoted; edits stated as pure additions, nothing removed.** §9's **seven** existing bullets enumerated; the eighth is appended. **The "2026-08-16 B3 output panel" entry is VERIFIED at `08_agents.md:251`** — claim stands, not dropped | `08_agents.md:240-242`, `:245-251` read directly |
| **F6** | Panel — Edit 6 needs a zero-occurrence lock | **T8 added**, with a verified hit list and an **explicit scope exclusion**: the stale refs also live in `.cursor/archive/**`, `review_followups.md` and prior plans, which are **history and must not be rewritten**. **Two NEW live hits found: `docs/specs/00-architecture/08_agents.md:24,:43,:44,:46` (the spec contradicts its own §9) and `docs/specs/00_claude_code_operating_model.md:284`** — both added to the edit list and Key Files | `Grep feature-dev:(code-reviewer\|code-explorer\|code-architect)` full hit list; `.gitignore:75-76` |
| **F7** | Panel — T7 must be honest while PLANNED | **T7 locks §B's CONTRACT TEXT + the tracked id, never runtime behaviour**, with the limitation stated in the docblock: nothing reads `EXECUTION_PROVIDER` today (N2) | N2 (0 matches repo-wide) |
| **F8** | Operator ruling on B1 | `grep_files` is **unconditional in v1**; every "conditional / if cost shows" wording removed from Edit 1's engine row and from PART B | PART B §2 Phase 1 (re-authored) |
| **F9** | Operator ruling on B2 | Pilot runs on a **dedicated branch** — moved from Ask to decided; PART B §6 B2 removed | PART B §2 Phase 4 (re-authored) |

### 6.2 Pairwise collision check (§11.2 — the folds read as a SET)

* **F1 × F7** — collapsing the enum changes what T7 must assert. **Resolved:** T7's RED now includes *"enum widened to include `fable`"*, so F1 is enforced by F7's lock rather than only by prose.
* **F3 × F2 × F4** — three columns now co-vary (`Substrate`, `Tools required?`, `Seat id`). **Collision checked:** A3/A10 carry the compound with `Tools required? = no`, so T2 does **not** fire on them — correct, they are CLI seats whose grounder is *adjudication*, not the seat's substrate. A11/A12 are `Claude` with `Tools required? = no` and harness seat ids — T2 skips them, T4 passes them via `HARNESS_SEATS`. **No row is simultaneously tool-required and tool-less; no row has a seat id in neither set.**
* **F5 × F6** — F5 forbids removing §9 bullets; F6 rewrites text *inside* Spec 08 (`:24,:43,:44,:46`). **No collision:** those lines are in §2/§3, not §9; and none of `:24/:43/:44/:46` falls inside T5's three protected blocks (§4, §5.2, §7b).
* **F6 × T5** — T8's "zero occurrences in `docs/specs/**`" could in principle demand editing a protected block. **Verified it does not:** §4, §5.2 and §7b contain no `feature-dev:*` reference (the four hits are `:24,:43,:44,:46`; the protected blocks start at `:61`, `:94`, `:214`).
* **F8 × Edit 1** — the engine row's tool list now names five tools; PART B Phase 1's commit list must match. **Cross-checked against PART B §2 Phase 1 — identical five.**

### 6.3 Staleness walk

Every checklist line in §3 re-read against the folds: **Step 4/5 updated T1–T6 → T1–T8** · **Step 6** now names "all four live protocol surfaces" (was three) · **Step 8** gained two mandatory self-check items (`fable`-as-provider; archive-rewrite) · **Step 2** unchanged (§4.7 (R-I) verification still the same three blocks) · **§Standards Compliance** updated "six arms" → "eight arms" · **Key Files** gained `docs/specs/00_claude_code_operating_model.md` · **§5 Asks** reduced from two to one · commit shape stated (3).

### 6.4 Not grounded — stated, not hidden

* **E6** (the harness `Agent` model enum) is **harness-surface evidence, not a repo file** — it cannot be re-executed by a grounder reading the tree. Labelled at its evidence row and carried unchanged.
* **T5's pinned digests do not exist yet** — they are computed at Step 2 from the post-edit file. The arm is specified; its constants are produced by implementation, which is the only honest order.

---

> **PLAN LOCKED. Do you authorize this WF1 (Genesis) plan? (y/n)**
> §11 note: Cross-Layer Contracts is satisfied by pinning three closed vocabularies in `agent-roster.infra.test.ts` rather than `_contracts.json` — no numeric threshold crosses a layer boundary in this change.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
