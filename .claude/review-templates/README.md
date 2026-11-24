# Plan Review Templates

Reusable plan-review prompts for the R0 (pre-implementation) review step in WF1/WF2/WF3.

## Why these exist

Generic adversarial reviews produce 20-30% noise (hallucinations, conflicts with project invariants, prose summaries that hide non-actionable items). These templates fix that by:

1. **Specializing each reviewer by axis, not by spec.** Gemini owns spec/test/contract compliance. DeepSeek owns failure modes / data reality / edges. No axis overlap → no duplicate findings.
2. **Forcing strict triaged output** (BUG / DEFER / REJECT, one line each). Free prose is rejected by the template's contract.
3. **Calling out anti-patterns explicitly** (e.g., don't hallucinate files, don't repeat the plan's own claims).

## The two templates

| Template | Reviewer | Axes |
|---|---|---|
| `plan-review-gemini.md` | Gemini | Spec Compliance · Test Coverage · Contract / Boundary |
| `plan-review-deepseek.md` | DeepSeek | Failure Modes & Rollback · Data Reality Verification · Sibling Bugs & Edge Cases |

The axes are deliberately disjoint. Run both in parallel at R0; their findings combine without overlap.

## When to use

| Workflow | R0 review recommended? | Notes |
|---|---|---|
| **WF1 (Genesis)** | YES — high leverage | Plan-level architectural mistakes are 10× more expensive at R8 than at R0. |
| **WF2 (Enhancement)** | YES if touching contracts, schema, or UI | Plan review is mandatory per WF (Spec 08 section 7 rule 1, section 6.4); a lane build or fix launch is refused without plan evidence (check-lane-close.mjs). |
| **WF3 (Bug fix)** | YES — the lean plan roster | Spec 08 section 6.4: WF3 has a lean plan roster (2-3 premise verifiers); a lane fix launch needs plan evidence like a build. |
| **WF5 (Audit)** | N/A | No plan to review. |
| **WF6 (Review)** | N/A | This IS the review step. |

## Usage

Both `scripts/gemini-review.js` and `scripts/deepseek-review.js` support a `--template <path>` flag on the `plan` subcommand. The script reads the template, splits it at `## User prompt` (so `## System persona` becomes the systemInstruction), and substitutes:

- `{{PLAN}}` → contents of `.cursor/active_task.md`
- `{{SPECS}}` → concatenated contents of files passed via `--specs <comma-separated>` (formatted with `### <path>` headers)
- `{{DATA_CONTEXT}}` (DeepSeek only) → contents of file passed via `--data-context <path>`

### Gemini — spec / test / contract compliance

```bash
npm run review:gemini -- plan \
  --template .claude/review-templates/plan-review-gemini.md \
  --specs docs/specs/02-web-admin/76_lead_feed_health_dashboard.md,docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
```

### DeepSeek — failure modes / data reality / edges

```bash
npm run review:deepseek -- plan \
  --template .claude/review-templates/plan-review-deepseek.md \
  --specs docs/specs/02-web-admin/76_lead_feed_health_dashboard.md \
  --data-context .review-data-context.md
```

If `--data-context` is omitted, the template's `{{DATA_CONTEXT}}` substitutes to a default "no live-DB context provided — flag every data assumption as UNVERIFIED PREMISE" string, so DeepSeek's data-reality axis still runs (just with maximum suspicion).

### Backward compatibility

`npm run review:gemini -- plan` (no flags) and `npm run review:deepseek -- plan` (no flags) still work and use the original hardcoded prompts. No existing caller breaks.

## Recommended R0 cadence

```
R0a — Gemini plan review     (parallel)
R0b — DeepSeek plan review   (parallel)
R0 triage — merge findings, apply BUGs to plan, defer DEFERs to `docs/reports/review_followups.md`
R0 re-lock — present revised plan to user with "applied N findings" summary; ask for authorization
```

This adds ~5-10 minutes to plan-lock for a high-leverage WF — and saves a typical 30-60 minutes of R8 rework loops.

## How these templates were derived

Observations from the four reviews in WF1 #B / WF3 #realtor-backfill / WF1 #C (this codebase, May 2026):

- **R0 (pre-implementation) had highest signal-to-noise** of any review type. WF1 #C's R0 caught 7 plan-level issues in 37 seconds; 5 folded in, 0 false positives.
- **Worktree code-reviewer (isolated-checkout agent) had lowest false-positive rate.** But it can only review code, not plans.
- **Generic adversarial reviews produced ~25% noise.** Gemini hallucinated tables (`permit_products`); DeepSeek contradicted project invariants (`h-11 w-11 too large` violated Spec 33 §9 touch targets). Worktree reviewer also produced one false positive when comparing against `main` while new files existed in the working tree.
- **Specialized axes produced more focused, non-overlapping findings.** When each reviewer had a tight 3-axis brief, ~80% of findings were unique per reviewer.

The templates encode these lessons as guardrails (the "Anti-patterns" sections) + axis specialization (the explicit "you are NOT responsible for X" carve-outs).

## Future improvements

- **Add a "data-reality" pre-flight** that runs canned queries (row counts, NULL distribution, FK coverage) against the live DB and feeds the result into the DeepSeek `{{DATA_CONTEXT}}` slot automatically.
- **Add a third template for the worktree code-reviewer** at R8 with the same triage format. The worktree reviewer's free-prose output is the highest-quality but slowest-to-triage of the three reviewers.

## The lens set (Task: task-358, REVIEW.LENSES)

Spec 08 section 7 rule 4: "NEVER run one generic pass; run the LENS SET in parallel, each a narrow prompt." Rule 7: the smallest diverse panel, typically 5 to 8 lenses. Rule 9: DeepSeek does static reviews; tool-bearing Claude only where the live tree, DB or git is strictly required. Operator, verbatim, 2026-11-19 (`~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, "Operator: the review protocol"): "I believe deepseek does the compliance seat" and "Deepseek is respoonsible for many of these seats - too many tokens to run all claude ones".

Each lens asks one question, names what it is not responsible for, rejects any finding with no quote, and ends with a strict one-line-per-finding format (at most 8 findings).

| Lens template | The one question | Spec 08 seat | When it fires | Altitude |
|---|---|---|---|---|
| `plan-review-deepseek.md` | Failure modes and rollback, data reality, sibling bugs | A2 DeepSeek (adversarial) | every task | plan, and output on money or pipeline work |
| `lens-compliance.md` | Does it satisfy every pasted spec clause and operator ruling? | A10 Compliance (section 5.1) | every task, including record-only tasks (the only lens for those) | plan and output (not at the output of a build or fix task: output_off, task-460) |
| `lens-engineering.md` | Is it built to every pasted engineering rule? | Engineering (RR-0385, decision-170) | every task whose rule lists include one on the engineering standards file (`docs/specs/00_engineering_standards.md`, today `eng-all`, `eng-front`, `eng-back` and `eng-shared`) | plan and output (not at the output of a build or fix task: output_off, task-460) |
| `lens-code-review.md` | Correct, typed, errors handled and logged, no dead code? | A3 Code Reviewer | any task that writes code | output (plan: only if the plan names code) |
| `lens-ux.md` | Does it serve the person on the other end, in every state, in the approved design text? | A11 User-Advocate | a build on a surface (app or web page) | plan (task-460: not at output) |
| `lens-error-paths.md` | Error, empty, retry, time-out, double-submit, degrade-safety, idempotency and dedup | A2 DeepSeek lens 4 (section 7 rule 4) | any task that writes code or a counted event | plan (task-460: not at output, RR-0459) |
| `lens-security.md` | How is this exploited? | A12 Security | only when the change touches money, auth, entitlements, PII or admin (Files line: entitlements, auth, stripe, a metered route), or a Files entry is under src/app/api/ or src/lib/ (task-445) | plan (task-460: not at output, RR-0464) |

### The standard

1. The lenses that fire run in parallel, one DeepSeek call each, one narrow prompt each; outputs `out-<lens>.txt` (plan stage: `plan-<lens>.txt`), the only names the close check and `rule-lists.mjs findings` read.
2. Then ONE tool-bearing Claude grounder adjudicates every finding against the files (the grounder pass, Spec 08 section 5.3; not the second review round of section 7 rule 6, "every DeepSeek finding is adjudicated by a tool-having grounder"): CONFIRMED, REJECTED or CONFLICT with the opened `file:line`, in `GROUNDER.md`; the lane's `TRIAGE.md` holds one outcome line per CONFIRMED or CONFLICT finding (forms: `fixed`, `task`, `ruling`, `wontfix`, `pile`; `node scripts/hooks/check-lane-close.mjs --outcomes <lane dir>` checks them). The grounder also does the Integration check (A5) itself.
3. Reality-Check (A7, Claude) is a seat, not a lens: required at every build or fix launch (the task-375 note in Spec 08), with integration, and regression when the Files line names a tracked path.
4. Wording rule: a claim is "verified" only with the name of what verified it (which lens, which round, or which grounder check). "Verified" alone is not accepted.

### How to run a lens

Output review (the file under review is the diff; the pasted spec clauses, rulings and design text go in a separate `--context` file; the lens is passed with `--template`, which sends the lens's own system persona and strict format; measured 2026-11-19: the older `--context <lens>` form wraps the lens under the generic adversarial prompt and returned zero strict-format lines in five runs):

```bash
git show <sha> -- <paths> > review-input.diff
DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config \
  scripts/deepseek-review.js review review-input.diff \
  --template .claude/review-templates/lens-<lens>.md --context docs/reports/reviews/<task>/context-rN.md --section "Task" --section "Description" --section "Acceptance criteria" --section "Decisions naming this task" --section "Implementation Notes" > out-<lens>.txt
```

The context file of a lane review is the task, sized (task-375): `docs/reports/reviews/<task>/context-rN.md`, one per review round and never overwritten, written by `scripts/analysis/backlog-brief.mjs` with the task's Implementation Plan and Implementation Notes; the five `--section` flags (the one list CONTEXT_SECTIONS in `scripts/lib/review-template.js`) send only the task, its description, acceptance criteria, decisions and notes. The compliance lens inputs are written by `node scripts/analysis/rule-lists.mjs lens-input --list <id> --context <context-rN.md> --material <diff file>` (the plan phase: `--material-from <context-rN.md>`, which cuts Description, Acceptance criteria and Implementation Plan); `lens-input` refuses without `--context`, and the close check recomputes each output's prompt hash with the committed context. Each review round (the first output round and every fix round) re-runs the brief in the lane worktree, `node scripts/analysis/backlog-brief.mjs --task <task> --lane <lane> --stage <N> --root <worktree> --board <board checkout> > /dev/null`, so the new context-rN.md holds the task file and the board's decisions as they are then (`--board` reads `<board>/backlog/decisions`; a bare `--board` or a board without that directory is refused), and the round uses the highest-numbered file in every `--context` (task-432, RR-0378 step 5).

Plan review of a lane task: the same `review --template` command on the plan context (`rule-lists.mjs plan-prep review` runs it), output `plan-<lens>.txt`. The legacy `plan --template` route prints no REVIEW header, so its output fails the close check and the launch gate; it is not used for a lane. `review --template` is the one runner change of task-358 (a lens cannot reach the model in strict form through `--context`). Add `--dry-run` to print the two messages without a call.

## Handbook clause packs

Packs are verbatim copies of the rule lists the handbooks hold, in `.claude/review-templates/packs/`. Nothing is trimmed or paraphrased: each file starts with a header naming its source file and line range, its generator (or "hand-written"), the number of rules in the whole list and its part number, then the copied lines. A list over about 33000 characters is split by heading into parts (`-p1`, `-p2`, ...). The packs: `fe` (Spec 136, generated from Spec 135), `step` (Spec 132 sections 2-4 and 6, generated), `bylaw` (Spec 133 section 2, generated), `storage` (backlog doc-16), `queue` (Spec 137), `spec08` (Spec 08 sections 7 and 11), `airtight` (McDonald's Airtight V1/V2/V3: Spec 124a R-BA, R-BF, R-BZ, R-CA, R-DT, R-EY, Spec 122 sections 5.5 and 6.6.1, Spec 122a A26 and A27), `mobile-core`, `mobile-99`, `mobile-100`, `mobile-96` (the mobile specs and `.claude/domain-admin.md`), `eng` (`docs/specs/00_engineering_standards.md`). A pack is a copy: when its source line range moves, cut it again; the header says where it came from.

The body of the front-end standard (COMPLY.5, task-369) is packed WHOLE, not as rule lists: `fe-126-p1` to `fe-126-p11` (Spec 126, the surface contract, `docs/specs/02-web-admin/126_maxbld_surface_standard.md`, lines 1-1238), `fe-127-p1` and `fe-127-p2` (Spec 127, the conversion procedure, lines 1-364), `fe-128-p1` to `fe-128-p4` (Spec 128, the policy with its rules, budget rules B1 to B6, ruling protocol and the section 5 register of rulings, lines 1-310) and `fe-135-p1` to `fe-135-p4` (Spec 135, the full register rows with their dated notes, lines 1-88). Each part is one contiguous range of its source copied by script (`docs/reports/lanes/2026-11-20/BL-COMPLY3/tools/build-packs.mjs`, checked line by line by `verify-packs.mjs`), split only at the source's own headings; the one exception is the Spec 135 register table, one 72720-character heading section, which is split at row boundaries (the table header is repeated, labelled, after the range marker). No section was left out. The header gives the source, the blob sha, the repo head at build and the count of rule-bearing lines by pattern. The pass over the pushed 1·B change is `docs/reports/lanes/2026-11-20/BL-COMPLY3/FINDINGS-2.md`.

The compliance lens (`lens-compliance.md`) judges "against the pasted clauses only", so it needs a pack to judge a handbook: with no pack it can only judge what its own caller pasted. Put the pack in `--context` and the diff part in the file:

```bash
DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config \
  scripts/deepseek-review.js review <diff part> --context .claude/review-templates/packs/<pack>.md \
  --template .claude/review-templates/lens-compliance.md   # a lane review passes its committed context-rN.md and the five --section flags instead (above)
```

Size and tool limits found by the COMPLY.1 pass (task-365; findings in `docs/reports/lanes/2026-11-20/BL-COMPLY/FINDINGS.md`), as fixed since: each lens template carries `{{PLAN}}` once (V2.LIST round 2), so the material is sent once and the 120000 bound is on that prompt; `scripts/lib/review-template.js` `substitutePlaceholders` substitutes in one pass with function replacers (task-375), so a `$` sequence or a placeholder token in a pack or diff is sent as written. The lens returns at most 8 findings per run, so cut a diff into parts rather than sending one large one.

## Rule lists (Task: task-366, COMPLY.2)

Task-453 (RR-0440, RR-0450, RR-0452): `every_task` is the plan protocol only (five-words is off at both stages); the table key `output_off` takes plan-protocol off the output review of a build or fix task; the lane-tools row attaches the two Spec 08 lists and eng-all. Task-460 (PROC.OUTSHAPE; RR-0457, RR-0458, RR-0459): `output_off` names every list, so the output review of a build or fix task is the code review on the diff, the commit hook's checks and one validating grounder (security is off at output and the grounder reads the changed sensitive files for exploit paths, RR-0464 "C: grounder reads instead"); the plan stage is unchanged; a check or doc task keeps every list; emptying `output_off` puts every list back. The strict-format lens templates are closed by their `VERDICT:` line and carry no TKT-1 Ticket header or TKT-2 STATUS line (exempt: the close check reads the VERDICT line, GROUNDER-A D5).

Operator, verbatim, 2026-11-20 (`~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, the 2026-11-20 entries): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." The compliance lens "judges against the pasted clauses only" (`lens-compliance.md`), so what it is given decides what it checks. Since COMPLY.2 the lists it is given are decided by data.

1. **The table.** `scripts/analysis/rule-lists.json` maps path globs to rule lists (`rows`: globs or `globs_from` an existing path map, optional `imports_from`, `lists`, `why`). A list is a rule file used whole, or whole sections of it where the file itself separates rules from history. Never a hand-picked clause. `node scripts/analysis/rule-lists.mjs validate` checks that every file exists, every section selector names exactly one heading and every glob matches a tracked path; `resolve --files "<Files line>" --type <type> --letter <group>` prints what a Files line attaches.
2. **At launch** `scripts/analysis/backlog-lane.mjs` resolves the task's `Files:` line through the table. No Files line (a record-only task gets the every-task and milestone lists only, task-448) or a path no row matches: refused with the path named. The brief names each list ("Rule lists that govern this task": READ each whole before planning).
3. **The lens line: one compliance run per list (the default).** The joined form (task-423) is accepted and is not the default (RR-0374, measured: 10 of 15 findings joined against 14 of 15 per list): `node scripts/analysis/rule-lists.mjs lens-input --list rules --lists <ids> --context <context-rN.md> --material <plan or diff file> --out <dir>/in-<phase>-compliance-rules` joins the resolved lists whole, in table order, packed by size, and the close accepts `out-compliance-rules[-pN].txt` (a stage holding both forms is refused). For each list L: `node scripts/analysis/rule-lists.mjs lens-input --list L --context <context-rN.md> --material <plan or diff file> --out <dir>/in-<phase>-compliance-L` writes the lens input (the list first, whole, then the material; when list plus material would pass the review tool's 120000 character bound the list is split by its own headings into `-p1..-pN`, the bound measured on the exact prompt, never trimmed; it refuses, naming the section, when one section cannot fit), then `scripts/deepseek-review.js review <input file> --template .claude/review-templates/lens-compliance.md --context <context-rN.md>` with the five `--section` flags `> <phase>-compliance-L.txt` (phase `plan` or `out`; `-pN` for each part). Task-438 (RR-0385 item 2): a list on the engineering standards file is run by the engineering seat instead, the same commands with `--out <dir>/in-<phase>-engineering-L --template .claude/review-templates/lens-engineering.md` on lens-input and the review tool, filed `<phase>-engineering-L.txt` (joined: `<phase>-engineering-rules`); every other list stays with compliance (`seatOf` in `scripts/analysis/rule-lists.mjs`).
4. **A separate grounder rules on every finding.** The lane lists its findings and leaves the task RUNNING ("grounder owed"). A finding is a `BUG` or `DEFER` line of an `out-*.txt` lens output (plan findings are ruled once, at the plan, by the plan grounder; a `plan-*.txt` is read at close only when GROUNDER-PLAN.md at the launch commit is absent, empty or has no Plan line); its id is `<file stem>#<ordinal among those lines>` (`rule-lists.mjs findings --dir <dir>`). The grounder, an agent that is not the lane and not any assignee of the task, writes `GROUNDER.md` beside the outputs: header lines `Grounder: <name>` and `Lane: <lane>`; one line `Ruled: <output file> sha256:<12 hex> findings:<n>` for EVERY `out-*.txt` (and every `plan-*.txt` when the plan evidence is not on the board) (`rule-lists.mjs findings --dir <dir>` prints them; the hash and count are recomputed at close, so an output edited after grounding is refused); then one line per finding `<finding id> CONFIRMED|REJECTED|CONFLICT <repo path>:<line> "<quote>" [reason]` (reason needed for REJECTED and CONFLICT; the quote, 6+ characters, must be on that line of a repo file, and a lane report may not be cited). Task-433 (INPUTS.5, RR-0378 step 6): the compliance lens output ends with a line `Rules met: <rule ids>`, the ids of the pasted list it judged met (a rule id is a bullet line whose bold id is name.N (as in Specs 132, 133 and 136); ids of another shape are not read; `Rules met: none` when the list has none). `node scripts/analysis/rule-lists.mjs unmentioned --out <output file> [--in <its input file>]` prints the rule ids of the sent list part that appear nowhere in the output (a finding, a MET or REJECT line, the Rules met line, or any other text): a report for the grounder, not a gate (it exits 0 whenever it ran and nothing in the close reads it). It reads one output file at a time: each -pN file is one list part with one material chunk; when the material is cut into chunks every chunk repeats every list part, so the files with the same 'part i of n' carry the same text and an id of that part is unmentioned only if the reports of all those files list it; the counts are per file, the union is by hand. Task-460 (RR-0457, RR-0459): for a build or fix task the grounder also validates, in a Validation section of GROUNDER.md (one line per duty, naming what it read or none): the diff against the plan as folded and each acceptance line; the code-review findings; each changed descriptor against the code it describes (each prose field TRUE or FALSE with a file:line quote; numbers and lists equal to the code); the milestone objectives of the task against the diff; each changed file on a path that fires the security lens at the plan stage, read for exploit paths (RR-0464); red then green. A finding raised there is fixed in the lane's round or reported, never filed as a seat report.
5. **At close** `scripts/hooks/check-lane-close.mjs` (commit-msg) refuses the commit that sets a lane's task BUILT or DONE unless `docs/reports/lanes/<date>/<lane>/` holds one compliance lens output per attached list that output_off leaves on (`out-compliance-<list id>.txt`), or the accepted joined set (`out-compliance-rules.txt`, or parts `-p1..-pK`; a stage holding both forms is refused; each holds a `VERDICT:` line) the lens set the task type calls for (a build or fix task also needs `out-code-review.txt` (task-460: no error-paths, ux or security output), and at least one `plan-*.txt` unless GROUNDER-PLAN.md at the launch commit is non-empty with a Plan line) and `GROUNDER.md` in that form (always for a build or fix task, even with no finding; for other types only when a lens returned a finding). A close that changes code needs an `@lane-*` assignee (no exemption for code). Presence, form and the quote check only: the check cannot prove that the grounder did the work well. Task-438: the engineering seat's files are `out-engineering-<list id>.txt` (or the joined `out-engineering-rules[-pN].txt`) on `lens-engineering.md`, required for a list on the engineering standards file when the range base holds `lens-engineering.md`; the launch gate always requires `plan-engineering-<list id>.txt` for such a list, and a compliance file never stands for it.

The close check also reads the review tool's REVIEW header (`scripts/deepseek-review.js` writes `REVIEW template=<name> model=<id> at=<iso> file_sha256=<hex> prompt_sha256=<hex>` among the first lines of a lens-mode output): a required lens output without it, with another template's name, or (compliance) whose `file_sha256` is not that of the committed input `in-<output name>` is refused; the input's first line `LIST <id> sha256:<hex> material sha256:<hex> part i of n` is recomputed, and the parts of a list together must carry the whole list as it is now. The lane report dir is scoped to one task by a file `TASK` holding the task id. Every staged task file that moves to a finished status (`finished_statuses` in the table: BUILT, DONE, MERGED) is checked, whatever the commit message says, including the board's auto-commit; a build, fix or check task needs an `@lane-*` assignee in the closing commit; paths changed since the lane branch point (merge-base with `base_ref`) must be covered by the task's Files line; a commit that changes a `protected_paths` file (the check, the table, the helper, the review tool, `.husky/*`) may not also close a task. A grounder name that contains or is contained in the lane or an assignee (case, punctuation and digits removed) is refused; quotes are 20+ characters, distinct per finding, not on a line that occurs more than 3 times in the cited file; REJECTED and CONFLICT reasons are 30+ characters; a loose reading of the finding lines must count the same as the strict one.

Known tool limits: positional finding ids shift when a lens is re-run, so a re-run needs fresh verdicts.
