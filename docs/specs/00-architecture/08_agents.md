# Spec 08 — Agent Architecture (Review & Assurance Roster)

**Status:** ACTIVE (v1, 2026-07-14)
**Owner doctrine:** `docs/reports/operating-manual-for-successor.md` (the decision framework every agent inhabits — see §4).
**Cross-references:** `CLAUDE.md` (§Review Agent Reference — the trigger table), `scripts/CLAUDE.md` (§Multi-Agent Review execution pattern), `docs/specs/00-architecture/05_knowledge_operating_model.md` (lesson routing), `.claude/workflows.md` (WF1/2/3/6 panel steps).

<requirements>
## 1. Goal & Context
Buildo's quality bar is enforced by a **panel of adversarial review agents**, not a single reviewer. Each agent is a *distinct lens* — a different model lineage, a different question, a different source of truth — because a single reviewer shares its own blind spots (manual §6.2). This spec is the **single source of truth for that roster**: what each agent is, the script/`subagent_type` that runs it, when it fires, and the rules for composing panels by domain and cost.

The governing principle (manual §6.2): *five identical skeptics find the same bug five times; four different lenses find four different bugs.* Every agent below exists because it asks a question no other agent asks.
</requirements>

---

<architecture>
## 2. The two agent substrates

Agents run on one of two substrates. Choosing correctly is a cost + capability decision (§7).

| Substrate | What it is | Tools / access | Cost | Use for |
|-----------|-----------|----------------|------|---------|
| **External-model CLI** | `scripts/gemini-review.js` (Gemini 2.5 Pro), `scripts/deepseek-review.js` (DeepSeek-R1) | **None** — reads the file(s) you pass, no repo/DB/tool access | Cheap (esp. DeepSeek); different model lineage → different blind spots | Broad adversarial coverage; single-file or spec/plan review where the answer is in the text |
| **Claude Task agent** (`subagent_type`) | A spawned Claude sub-agent (`feature-dev:code-reviewer`, `feature-dev:code-explorer`, `general-purpose`, `pipeline-reality-check`, …) | Full tools — Read/Grep/Glob/Bash, git, live DB, worktree isolation | Pricier | Roles that MUST touch the real tree, git history, or the live database |

**CLI invocation (both mirror the same interface):**
```
npm run review:gemini   -- review <file> --context <spec-path>
npm run review:deepseek -- review <file> --context <spec-path>
npm run review:gemini   -- spec <spec-path>        # spec gap/contradiction review
npm run review:deepseek -- plan                    # reviews .cursor/active_task.md
```
Env keys: `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` (in `.env`). The `spec`/`plan` commands are how agents review at **plan altitude** (§5.2).

## 3. The current roster (as-built)

Each agent: its **question**, its **substrate**, its **source of truth**, and its **fire trigger**. Isolation defaults to a worktree; the three that must see live state (Integration, Regression Guardian, Reality-Check) run in the **main tree**.

| # | Agent | The one question it asks | Substrate | Source of truth |
|---|-------|--------------------------|-----------|-----------------|
| A1 | **Gemini (adversarial)** | "What would a hostile expert of a different model lineage catch?" | CLI (Gemini 2.5 Pro) | the file + spec text |
| A2 | **DeepSeek (adversarial)** | Same, different lineage → different blind spots | CLI (DeepSeek-R1) | the file + spec text |
| A3 | **Code Reviewer** | "Is the code correct, typed, telemetered, free of dead code?" | `feature-dev:code-reviewer` | the diff + repo conventions |
| A4 | **Observability** | "Is every state change auditable? Do counters/verdicts/producer-consumer contracts hold?" | `feature-dev:code-reviewer` | the diff + Spec 47/48/79 |
| A5 | **Integration** | "Does this match the REAL codebase — SDK signatures, chain wiring, seams, migration mechanics — not the spec's idealized version?" | `general-purpose`, **main tree** | the live code + manifest |
| A6 | **Regression Guardian** | "For every deleted/altered line — WHY did it exist? Is that intent knowingly preserved?" (Chesterton's Fence) | `feature-dev:code-explorer`, **main tree** | `git blame`/`log -p` + `tasks/lessons.md` |
| A7 | **Reality-Check** | "Are the output VALUES physically/domain-plausible?" — the only role that reads output data, not code | `pipeline-reality-check`, **main tree + live DB** | the actual computed rows |

**Note on "Compliance":** it is NOT currently a distinct agent — spec-vs-implementation checking is spread across A1/A2 (which generate a checklist from the spec's Behavioral Contract) and A3. §5.1 formalizes it as its own role, because it answers a question the others only partially cover.
</architecture>

---

## 4. The doctrine layer — the Operating Manual (mandatory; summarized here)

`docs/reports/operating-manual-for-successor.md` is the **decision framework every agent and orchestrator inhabits** — *"not a rulebook to satisfy; a way of working to inhabit."* **Every Claude Task agent's FIRST action is to read it in full** (enforced in the spawn prompt, §11). This section is a self-contained **summary so this spec stands alone** — but the manual is authoritative; each of its procedures cites the real commit whose failure paid for it.

### 4.1 The eight procedures
1. **Read what the request is actually asking (§1).** Separate the literal instruction from the problem that produced it; the deliverable is *what would make the user stop needing to ask.* Answer an embedded question before acting on the instruction around it; state which reading you chose when ambiguous.
2. **Decompose along verification boundaries (§2).** Cut into pieces a reviewer can check independently — each with its **acceptance evidence written BEFORE implementation**, ordered so each is **inert until the next activates it** (column → writer-gated-OFF → consumer contract → flip-last). Name every piece's blast radius in rows/files/consumers.
3. **Put effort where a wrong value propagates silently (§3).** Four risk species, treated differently: (a) code correctness — cheap, tests catch it; (b) **VALUE correctness** — code perfect, numbers insane; only reading output data catches it; (c) **intent destruction** — deleting code whose reason you don't know; only git-blame + lessons catch it; (d) **integration fiction** — a plan right about the spec, wrong about the code; only reading the live tree catches it. Interfaces between independently-built sides are the highest-risk lines.
4. **Verify by re-deriving (§4).** Recompute a load-bearing number by an INDEPENDENT method (not by re-running the code that produced it). *File:line or query result, or it didn't happen.* Distinguish a proxy from the thing and measure the gap. **An unverified claim about system behavior is a defect.**
5. **Separate known from guessed (§5).** Tag every claim: verified-by-me / verified-by-agent / documented-but-unverified / inferred / assumed. Confidence is **stratified, not global**; label what the instrument cannot see; never let a decision silently rest on a guess.
6. **Attack your own conclusion before handing it over (§6).** Write the three strongest objections a hostile expert would raise; route the attack through **diverse lenses, not repeated ones**. **Triage adversarial output ruthlessly — ~⅓ of findings have false premises** — verify each premise before folding; record rejections *with reasons*. Your own past folds re-open the moment the evidence changes.
7. **Communicate answer → reasoning → risk (§7).** First sentence = the outcome. Then selective reasoning. Then the **risk paragraph unprompted** (what's unverified, provisional, deliberately not done). Numbers carry the argument — always attach the so-what. Report failures plainly; never launder a recovery into a success.

### 4.2 The mistakes that look like competence (§8) — each FEELS like doing the job well
**Green-dashboard trust** (gates green, product broken at the seams) · **the proxy that's almost the thing** (96%-right on 3M rows still mislabels 128K) · **the plausible spec** (planning against docs, not the tree) · **the eager fix** (fixing a finding before verifying its premise) · **replacement disguised as improvement** (rebuilding cleanly, silently dropping a load-bearing quirk) · **scope-creep-as-thoroughness** (five fixes in one diff) · **asking as delegation of judgment** (options with no recommendation) · **deference to your own past decisions** (a fold is settled only while its evidence holds) · **the heroic single context** (not externalizing state — crashes/limits are the weather) · **polish where honesty was needed** (rounding "n=1 stratum" into "validated"). **The 11th (this spec's own trap):** treating the manual as a checklist to satisfy rather than a commitment to inhabit — the commitment is *the user must be able to trust what you tell them more than they trust their own quick look.*

### 4.3 The five-question self-test (run on every hand-off)
1. Did I answer the actual question — in the first sentence? 2. Which claims did I verify, with evidence for each (unverified ones labeled)? 3. What's the strongest hostile objection, and where did I address it? 4. If this is wrong, how does the reader find out, and how bad is it (gate/test/flag/rollback)? 5. Did I state what I did NOT do?

Every agent finding must be expressible in these terms (a §3 risk class, a §8 mistake). A finding that can't be grounded in the doctrine is usually re-litigating a settled decision (§8.8).

---

## 5. Additional roles & clarifications (RATIFIED 2026-07-14)

These close gaps the current roster (§3) left. **All ratified 2026-07-14;** the rationale for each is a real, recent failure. Spawn-prompt templates for every role are in §10.

### 5.1 Compliance (spec → code) — PROMOTE to a first-class role
**Question:** *Given a spec and the implementation, does the code SATISFY every clause of the spec's Behavioral Contract + Auth Matrix?* Item-by-item, spec-clause → code-line, PASS/FAIL.
**Substrate:** DeepSeek CLI at plan altitude (`spec <path>`), or a `general-purpose` agent for the code diff.
**Distinct from A3/A5 because:** Code Reviewer asks "is the code good?"; Integration asks "does it match the *codebase*?"; Compliance asks "does it match the *spec*?" — a clause the spec mandates but the code omits (e.g. Spec 21 §6's phantom `stripe_cancel_failed` directory filter, which the spec promised and the code never built) is a Compliance finding no other role owns.
**HARD DEPENDENCY:** Compliance is only meaningful if the spec is TRUE. Run **Ground-truth (§5.2) FIRST**; a stale spec makes compliance-checking a check against fiction (manual §8.3).

### 5.2 Ground-truth (reality → spec) — NEW ROLE (recommended)
**Question:** *Is the SPEC still true?* For each load-bearing claim in the spec, verify it against the live code / DB / behavior; report every drift as "spec §X says A; reality is B."
**Substrate:** `general-purpose` (main tree + live DB) — it needs to read code AND query the schema/data.
**Absorbs "spec-freshness enforcement":** you do NOT need a separate up-to-dateness agent — spec drift IS this agent's primary output. Enforcement = (a) Ground-truth runs at the START of any WF that touches a spec-governed area, and (b) a **standing periodic Ground-truth sweep** (a scheduled routine — see §7) that diffs high-traffic specs against reality and files drift to `review_followups.md`. This directly serves CLAUDE.md Prime Directive #10 (spec-first, no assumptions).
**Why:** the manual's single most-cited failure (§8.3) is planning against a stale spec. Spec 20 described unbuilt routes; Spec 95/97 described a retired immediate-cancel design after the period-end ruling. Ground-truth is the antibody.

### 5.3 Round-2 adjudication — FORMALIZE the existing practice
Not a new agent — a **mandatory second pass**. After the panel returns findings, run **DeepSeek + Integration against the *proposed findings/changes*** (not the code): for each finding, is the premise true, is the ruling already settled, does the fix cost less than the risk? This operationalizes manual §6.3 (⅓ false premises). Rejected findings are written to the plan *with reasons* so they don't return every round (§8.8). Round-2 is cheap (DeepSeek) and catches the eager-fix (§8.4).

### 5.4 Schema-Fidelity — NEW ROLE (strongly recommended)
**Question:** *Does every DB field this change reads/writes actually exist in the live schema with the assumed type, nullability, and constraints?* Cross-checks column existence, type, `NOT NULL` (+ default), `UNIQUE`/PK, FK, and `ON CONFLICT` arbiters against `docs/specs/00-architecture/01_database_schema.md` + the live `information_schema` + the generated `src/lib/db/generated/schema.ts`.
**Substrate:** `general-purpose` (main tree + live DB).
**Why (validated THIS session):** the `DETAIL_COLUMNS` omission (a NOT-NULL-marker column never SELECTed → dead UI), the `lead_analytics` NOT-NULL `lead_id` crash (23502), and the LPAD `lead_key` collision (21000, an `ON CONFLICT`-arbiter that could be hit twice) were ALL schema-fidelity failures. This is the highest-ROI proposed agent for backend/admin.

### 5.5 User-Advocate (UX) — NEW ROLE (recommended for frontend/mobile)
**Question:** *Does this serve the human on the other end?* The consumer journey end-to-end; the empty/loading/error/denied states; accessibility (roles, labels, focus); honest copy (never a false "done"); the "what would make the user stop needing to ask" test (manual §1).
**Substrate:** `general-purpose`, or `frontend-design` skill context for design work.
**Why:** every other agent asks "is it correct?"; none asks "is it good *to use*?" The success-page-must-not-lie and the honest-boundary findings this session were UX-adjacent; a dedicated advocate owns them.

### 5.7 Security — NEW ROLE (recommended, DOMAIN-GATED)
**Question:** *How is this exploited?* — authz/IDOR (identity from session, never a client-supplied id), injection, secrets/PII exposure, forgery fences, rate-limiting, replay/idempotency of privileged actions.
**Substrate:** the existing **`/security-review` skill** run as a panel step, or a `general-purpose` agent with a security lens.
**Fires ONLY on:** money (Stripe), auth, PII, and admin surfaces — NOT every diff (that's what makes it affordable to keep sharp).
**Distinct because:** every other role asks "is it correct?"; Security asks "is it *safe against an adversary*?" Documented failures: the unauthenticated `GET /api/notifications` (IDOR — user_id as a query param), the webhook `metadata.user_id` forgery-fence question, the admin `test-send` abuse surface.

### 5.8 Operating-Model Compliance ("decision-truth") — NEW ROLE (recommended, EXIT-GATE ONLY, lean)
**Question:** *Did WE follow the doctrine?* — a meta-auditor of the WORK's decision trail, not the code. Reads `.cursor/active_task.md` (the folds + rejected-findings-with-reasons), the fix commits, and `review_followups.md`, and checks them against the operating manual: was each folded finding's premise verified (§6.3)? did Ground-truth gate Compliance (§5.1)? any eager fix (§8.4) or scope-creep (§8.6)? was the manual's five-question self-test actually applied?
**Substrate:** DeepSeek CLI (cheap; reads the plan + manual + diff), **one pass at WF6** (the exit gate) — NOT a per-review panel member.
**Distinct because:** it is the antibody to the manual's own 11th mistake — *treating the manual as a checklist to satisfy rather than a way of working to inhabit.* No code-reviewing role audits the orchestrator's process.
**KFM:** keep it LEAN and exit-gate-scoped — a meta-layer that runs per-review becomes bureaucratic, self-referential noise.

### 5.6 Candidates from `review_followups.md` (lower priority; consider as MODES, not new agents)
The followup log's recurring bug classes suggest these could be **checklists a schema/observability agent runs**, rather than standalone agents: **migration-safety** (UP/DOWN, NOT-NULL-without-default, `CONCURRENTLY` on large tables, idempotent DDL — partly covered by the husky migration hooks); **idempotency/dedup** (once-per-day keys, `ON CONFLICT`, cross-run memory — the notification double-send class); **lock-registry** (advisory-lock id collisions — covered by `pipeline-advisory-lock.infra.test.ts`). Recommendation: fold into Schema-Fidelity (migration/dedup) and Observability (idempotency-telemetry) rather than proliferate roles.

---

## 6. Organizing by domain

Each domain gets a **default roster**. Adversarial (A1/A2) + the doctrine read are universal.

| Domain | Core panel | Domain-specific | Rationale |
|--------|-----------|-----------------|-----------|
| **Backend / Pipeline** | Gemini + DeepSeek + Code Reviewer + Integration + Regression Guardian | **Reality-Check** (values), **Schema-Fidelity** (DB fields), **Observability** (audit/telemetry), **Ground-truth** (spec drift) | data correctness + spec drift are the dominant risks (manual §3.2) |
| **Admin (web)** | Gemini + DeepSeek + Code Reviewer + Integration + Regression Guardian | **Schema-Fidelity** (DB reads/writes), **Compliance** (the tool matches its spec) | the P24↔P26 seam class (manual §3.3) + phantom-spec-clause class |
| **Front-end / Mobile** | Gemini + DeepSeek + Code Reviewer + Integration | **User-Advocate (UX)**, **Compliance** | correctness matters, but usability + API-contract seams dominate; Reality-Check/Observability rarely apply |

**Cross-cutting (any domain):**
- **Security (§5.7)** adds to the panel **whenever the surface is money / auth / PII / admin** — regardless of domain.
- **Regression Guardian** fires whenever the diff **modifies/deletes** existing code (skip for pure net-new).
- **Reality-Check / Schema-Fidelity / Ground-truth** fire when **DB fields, derived values, or spec claims** are touched.
- **Operating-Model Compliance (§5.8)** runs ONCE at **WF6** (the exit gate) for every WF — it audits the process, not the domain.

## 7. Rules & economics

1. **Two altitudes, same roles.** *Plan review* points agents at `.cursor/active_task.md` (via CLI `plan`/`spec`, or an agent reading the plan) — hunts completeness/consistency BEFORE code exists. *Output review* points them at the diff. Plan-altitude review is the default for WF1/WF2 kickoff and is where the cheapest agents (DeepSeek `plan`) earn the most.
2. **Ground-truth gates Compliance** (§5.1/§5.2): validate the spec against reality before checking code against the spec.
3. **Round-2 always** for money/pipeline-critical work (§5.3): panel → DeepSeek+Integration adjudicate the findings → fold survivors, file rejections with reasons.
4. **Cost-tiering — "more agents" affordably.** DeepSeek is cheap and a distinct lineage: use it for **breadth** — run it multiple times with *different lens prompts* (e.g. one pass for security, one for idempotency, one for spec-compliance) rather than one generic pass. Reserve the pricier Claude Task agents for roles that **need tools** (Integration/Guardian/Reality-Check/Schema-Fidelity/Ground-truth — they read the tree, git, or the DB; a CLI can't). Never spend a tool-having Claude agent on a job a DeepSeek CLI can do from the file text alone.
5. **Panel sizing scales to stakes.** "quick check" → a couple of lenses, single-vote. "thoroughly audit / money code / pipeline data" → full domain roster + round-2 (manual: scale to what's asked).
6. **Findings triage** (WF6): BUG → WF3 before Green Light; DEFER → `review_followups.md` with reasons.
7. **The roster is a MENU, not a checklist.** Never run all ~12 roles on one change. Compose the **smallest DIVERSE panel that covers this change's actual risks** (typically 5–8 lenses) + round-2. Lens-diversity beats agent-count (manual §6.2): running the whole menu floods you with the ⅓-false-premise noise (§9) it takes longer to triage than the bugs are worth. Security fires only on money/auth/PII/admin; Op-Model Compliance only at WF6; Reality-Check/Schema-Fidelity/Ground-truth only when values/DB-fields/spec-claims are in play.
8. **Spend on reality-touching agents; economize on file-readers.** Empirically (§7b), the agents that verify against reality — Reality-Check (runs code / queries the live DB), Integration, Schema-Fidelity, Ground-truth — catch the subtlest, highest-severity bugs and carry the lowest false-premise rate, because they don't guess. The file-only CLIs (Gemini/DeepSeek) are cheap breadth, not ground truth (§9 CLI blind spots). Budget accordingly: a FEW reality-touching Claude agents + a couple of cheap DeepSeek lens-passes beats a large panel of file-readers.

## 7b. Effectiveness (empirical, 2026-07 P24/P25/P26 review cycles) — keep updated
Ranked by severity-per-finding and premise-accuracy on real review cycles (update as evidence accrues):
1. **Reality-Check** — most effective. The only role that verifies by EXECUTION (ran the actual SQL in a transaction to REPRODUCE the `21000` LPAD-collision crash live; traced the P26 delete→reactivate→resubscribe CRITICAL value-by-value; also correctly *refuted* false premises, e.g. zero-sub→expired-is-safe). Lowest false-premise rate.
2. **Integration** — best signal-to-noise on seams; cleanly CONFIRMS and REFUTES (caught the `DETAIL_COLUMNS` dead-UI seam; confirmed the rest correct).
3. **Code Reviewer** — highest-impact single catch (admin-delete-never-cancels-Stripe → bills-forever).
4. **Observability / Regression Guardian** — highest breadth of real bugs (the P25 gate-flip-blocker list; the `lead_analytics` crash).
5. **Gemini / DeepSeek (CLIs)** — valuable different-lineage breadth, but the highest false-premise rate (cannot see the tree/DB) — their wiring/schema/value claims MUST be adjudicated by a tool-having agent before folding.
**Takeaway:** reach for a reality-touching agent whenever the risk is a wrong VALUE, a broken SEAM, or a stale SPEC; reach for the cheap CLIs for breadth of correctness/adversarial lenses.

---

## 8. Operating Boundaries
**Target files:** `scripts/gemini-review.js`, `scripts/deepseek-review.js`, this spec, `CLAUDE.md` §Review Agent Reference, `scripts/CLAUDE.md` §Multi-Agent Review, `.claude/workflows.md` panel steps.
**Out of scope:** the workflow *sequencing* (owned by `.claude/workflows.md`); lesson-routing (Spec 05); the husky footgun/migration gates (deterministic, not agents).
**Cross-spec dependencies:** Spec 05 (knowledge operating model / lesson routing), Spec 47/48 (pipeline observability contracts the Observability agent checks), Spec 01 (DB schema the Schema-Fidelity agent checks against), Spec 00 (system map).

## 9. Known Failure Modes
- **Panel-of-clones.** Running five agents that share a lens finds one bug five times (manual §6.2). The roster is deliberately heterogeneous — enforce lens-diversity, not agent-count.
- **Compliance against fiction.** Checking code against a stale spec (§5.1 dependency). Mitigated by Ground-truth-first.
- **Adversarial false premises.** ~⅓ of findings are wrong about the code/premise (manual §6.3). Mitigated by round-2 + premise-verification before folding. **Never fix a finding without verifying its premise** (manual §8.4 — the eager fix).
- **Role proliferation.** Every new "agent" is context + cost. Prefer adding a *lens/checklist* to an existing tool-having agent over a new `subagent_type` (§5.6). The bar for a new first-class role: it asks a question NO existing role asks AND that question has a documented, recurring failure behind it.
- **CLI blind spots.** Gemini/DeepSeek see only the file(s) passed — they cannot verify against the real codebase/DB and WILL confidently hallucinate integration facts. Their findings on wiring/schema/values must be adjudicated by a tool-having agent (Integration/Schema-Fidelity/Reality-Check) before folding.

---

## 10. Appendix — spawn-prompt templates (copy-paste to compose a panel)

### 10.1 Universal preamble (prepend to EVERY Claude Task agent)
```
FIRST READ, in full: docs/reports/operating-manual-for-successor.md — the decision
framework you inhabit (not a checklist). Apply it, especially §4 verify-by-re-deriving,
§5 provenance, §6 attack-your-own-conclusion, §6.3 (~1/3 of findings have false premises —
verify each premise before reporting).

REVIEW TARGET: <the diff range `git diff A..B`, or the file(s), or `.cursor/active_task.md` for plan altitude>.
CONTEXT SPEC(S): <spec path(s)>.
SUMMARY OF THE CHANGE: <one paragraph — what it does + why>.

OUTPUT: a ranked list, most-severe first. For each finding: file:line · severity
(CRITICAL/HIGH/MED/LOW) · one-sentence defect · the concrete failure scenario
(inputs → wrong output/crash). Explicitly CONFIRM what you checked and found correct.
Verify every finding's premise against the ACTUAL code/DB before reporting. Your final
message is consumed by the orchestrator (not a human) — return structured findings, not prose.
```
CLI equivalent (no tools): `npm run review:{gemini,deepseek} -- review <file> --context <spec>` (or `spec <path>` / `plan` for plan altitude).

### 10.2 Per-role lens (append after the preamble; substrate + isolation noted)
| Role | Substrate · isolation | Lens to append |
|------|----------------------|----------------|
| **Code Reviewer** | `feature-dev:code-reviewer` · worktree | "Correctness, type-safety/no-`any`, missing telemetry/logging, naming/pattern consistency, dead code, error-path/envelope handling, mutation idempotency." |
| **Observability** | `feature-dev:code-reviewer` · worktree | "Audit-row completeness vs spec; verdict cascade row-derived not parallel-boolean; §11 counter scoping; producer/consumer records_meta contracts (Spec 47/48); no state mutation without an observable trail; no swallowed error." |
| **Integration** | `general-purpose` · MAIN tree | "Verify against the REAL codebase, not the spec's idealized version: SDK/export signatures, chain/manifest wiring, the seams between independently-built sides (the highest-risk lines, §3.3), real downstream consumers, migration mechanics. Refute spec-only claims that are wrong about the code; CONFIRM the seams that are correct." |
| **Regression Guardian** | `feature-dev:code-explorer` · MAIN tree | "Scope to the diff's MODIFICATIONS/DELETIONS (skip pure net-new). For each removed/changed line: git blame/log -p the introducing commit (a fix() with a Severity/Lesson-routing footer is a documented fence); state the fence ('existed because X; new code still covers X — or it knowingly doesn't'). Cross-ref tasks/lessons.md + review_followups.md. An undefended fence is a finding." |
| **Reality-Check** | `pipeline-reality-check` · MAIN tree + live DB | "Read the VALUES, not the code — are the outputs physically/domain-plausible? Run the actual query/SQL against the live DB to REPRODUCE or refute. For every field the change adds/derives: a plausibility bound + the named cross-field invariants + an audit-row count for any cap/drop/default. Never declare a value sane without having looked at it." |
| **Schema-Fidelity** | `general-purpose` · MAIN tree + live DB | "For every DB field this change reads/writes: does the column EXIST in the live schema with the assumed type, nullability (NOT NULL + default), UNIQUE/PK, FK, and ON CONFLICT arbiter? Cross-check 01_database_schema.md + information_schema + src/lib/db/generated/schema.ts. Flag NOT-NULL-without-value, omitted-column reads, arbiter double-hit, type/nullability mismatches." |
| **Compliance** | DeepSeek `spec <path>` OR `general-purpose` | "Given the spec and the implementation, does the code SATISFY every clause of the spec's Behavioral Contract + Auth Matrix? Item-by-item, spec-clause → code file:line, PASS/FAIL. A clause the spec mandates but the code omits is a finding. PREREQUISITE: assumes the spec is TRUE — run Ground-truth first." |
| **Ground-truth** | `general-purpose` · MAIN tree + live DB | "Is the SPEC still true? For each load-bearing claim in the spec, verify against the live code/DB/behavior and report every drift as 'spec §X says A; reality is B → update the spec.' File confirmed drift to review_followups.md." |
| **User-Advocate (UX)** | `general-purpose` (or `frontend-design` skill) | "Does this serve the human on the other end? Trace the consumer journey end-to-end; the empty/loading/error/denied states; accessibility (roles/labels/focus); honest copy (never a false 'done'); the 'what would make the user stop needing to ask' test (manual §1)." |
| **Security** | `/security-review` skill OR `general-purpose` | "How is this exploited? Authz/IDOR (identity from session, never a client id), injection, secrets/PII exposure, forgery fences, rate-limiting, replay/idempotency of privileged actions. Fires only on money/auth/PII/admin surfaces." |
| **Round-2 adjudication** | DeepSeek + `general-purpose` (Integration) | "You are adjudicating the panel's PROPOSED findings, not the code. For EACH finding: is the premise factually true (verify)? is the ruling already settled (cite where)? does the fix cost less than the risk? Return keep/reject per finding, rejections WITH reasons (manual §6.3, §8.4)." |
| **Operating-Model Compliance** | DeepSeek CLI · WF6 ONLY | "Meta-audit of the WORK's decision trail (.cursor/active_task.md folds + rejected-findings-with-reasons + the fix commits) against the operating manual: was each folded finding's premise verified (§6.3)? did Ground-truth gate Compliance? any eager fix (§8.4) or scope-creep (§8.6)? was the five-question self-test applied? Keep it lean — one pass." |

### 10.3 Composing a panel (the rule, §7.7)
Pick the domain roster (§6) → drop roles whose trigger the change doesn't hit (no DB fields → skip Schema-Fidelity/Reality-Check; not money/auth/PII → skip Security; pure net-new → skip Guardian) → spawn the survivors in parallel with the preamble + lens → collect → **Round-2** → triage (BUG → WF3; DEFER → review_followups). Op-Model Compliance runs once at WF6.
