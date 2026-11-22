# Review context for task-435 (no plan id) written 2026-11-22 by backlog-brief.mjs (round 3)

## Task
task-435 INPUTS.7 Dated note in the engineering standards: the UI library lines are superseded by Spec 126 for the front end
status: RUNNING · milestone: m-1 · assignee: @lane-BL-NOTE435 · labels: McFix, McFix V2

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0382 (MORNING-DECISIONS.md:1889, verbatim: "yes add"; earlier the same day: "I think teh spec 126 is more recent and is just an update of the engineering standards"). Why: docs/specs/00_engineering_standards.md (lines of 2026-06-16) names Shadcn UI, React Hook Form and Sonner; Spec 126 (dated note 2026-11-09, operator "D-0-D-4 approved", 126_maxbld_surface_standard.md:467) says "Shadcn/Tailwind above is superseded ... the web and admin archetype set is Mantine" with @rjsf/mantine and mantine-datatable (section 11b.4); a reviewer sent the engineering standards reads the old standard. THIS TASK: one dated note in the engineering standards beside the library lines (prior text kept, nothing deleted), saying they are superseded for front-end work by Spec 126 section 11b.4, citing the Spec 126 note; the note states as a fact, and rules nothing on it, that Spec 126 does not name a toast library and Sonner is installed and in use. No other edit (the generated rule-lists page is regenerated with it).

Files: docs/specs/00_engineering_standards.md, docs/reports/generated/rule-lists-by-kind.md

## Acceptance criteria

## Implementation Plan
#### PLAN-435-v1: task-435 INPUTS.7, one dated note in the engineering standards

Planner: read-only. Nothing run that writes. No DeepSeek call, no `.env`. All paths are under ~/Buildo-wt-board unless they start with ~.

#### BASIS

- Ruling RR-0382 (backlog/decisions decision-167; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, last entries, "Operator ORDERS the superseded note added to the engineering standards"). Put to him: "A dated note in the engineering standards, section 12, saying the library lines are superseded by Spec 126 for the front end. Nothing is deleted". Operator, verbatim: "yes add". Sonner "NOT answered": the note states the fact and rules nothing.
- His view, same day, stated as "I think", not a ruling (MORNING-DECISIONS.md, entry "Operator's view on the library conflict"): "I think teh spec 126 is more recent and is just an update of the engineering standards but good question."
- Rule for the form: the M-246 "prior text kept" dated note. Spec 137 rule 1: "The row prose stays as it was ("prior text kept", M-246)." (docs/specs/00-architecture/137_mcqueue.md:59); Spec 137:96 for rule 2 ("Source: operator, 2026-11-14, verbatim"). DoD #5 on the card: "A ruling enters a row as a verbatim dated note." (137_mcqueue.md:109). 124a_step_standard_policy_appendix.md:992 (R-IZ; the card DoD #8 quotes it as :988, a drifted number): "no change adds a tool, field or rule its card or ruling did not name". I did not find an M-246 definition sentence of its own; the form is taken from the examples, so that part is by example, not by quoted rule.
- Form to copy: `> Dated note 2026-11-09 (M-246, prior text kept; spec review R-6 (ii); operator, verbatim: "D-0-D-4 approved", D-2): "Shadcn/Tailwind" above is superseded. shadcn/ui is not installed (Spec 33:44); the web and admin archetype set is Mantine 9 + `@rjsf/mantine` + `mantine-datatable` (§11b.4).` (docs/specs/02-web-admin/126_maxbld_surface_standard.md:467). The 08_agents.md notes use the unquoted-blockquote line form: `Dated note 2026-11-06 (MB-85 ..., M-246, prior text kept; operator, ...): ...` (docs/specs/00-architecture/08_agents.md:150, :229). Note the path: 08_agents.md is in 00-architecture/, not docs/specs/.
- Principles served: simple; no over-engineering; no scope creep; "do not change the plan"; spec text never rewritten or deleted.

#### FACTS

1. The file: docs/specs/00_engineering_standards.md, 467 lines, 46,352 bytes (46,076 characters per docs/reports/generated/rule-lists-by-kind.md:18). It has no dated note of its own today (grep "Dated note": no hit). Last git change 2026-10-17; git blame gives 2026-06-16 (commit 4416d843e) for the Status line (:306) and the library lines, which is the card's "lines of 2026-06-16" (the Status line itself says adopted 2026-04-07).
2. Library lines, each with Spec 126's words:

| Line | Text | Superseded by Spec 126? |
|---|---|---|
| :12 | "All Tailwind CSS styling MUST be written mobile-first." | No. Tailwind 4 stays beside Mantine (126:1005 "Mantine CSS in `@layer mantine` beside Tailwind 4"). package.json:157 tailwindcss. |
| :18 | shared UI components in `src/components/ui/` stay pure | No. That is a directory convention, not a library. The directory holds Badge.tsx and ScoreBadge.tsx only (measured by ls). |
| :24 | haptics for "error toasts" | No. Mobile haptics, not Sonner. |
| :28, :292 | Zod | No. Zod ^4.3.6 at package.json:125; Spec 126 does not touch it. |
| :280 (section 11, Frontend Foundation Check) | "No `useState` for form fields — React Hook Form + Zod (§12.3)" | Partly. 126:1005: "`@rjsf/mantine` (forms from JSON Schema + uiSchema, AJV 8)". Zod stays. |
| :283 (section 11) | "Centered modals replaced with Shadcn `<Drawer>` on mobile (§12.5)" | Yes for the library name. Web/admin: Mantine (126:1005); mobile: "React Native Reusables per Spec 90 §6" (126:1006). |
| :285 (section 11) | "Toast notifications via Sonner — no custom alert banners (§12.7)" | No. Not named by Spec 126. See 3 below. |
| :320-323 (12.3) | React Hook Form + `@hookform/resolvers/zod` | Same as :280. |
| :331-334 (12.5) | Shadcn UI, `npx shadcn@latest add`, Shadcn `<Drawer>` (Vaul) | Yes, as :283. 126:467: "shadcn/ui is not installed (Spec 33:44)". |
| :340-343 (12.7) | "Use Shadcn's Sonner integration ... `toast.success()`" | Not by Spec 126. Wording "Shadcn's" is stale (shadcn absent) but Spec 126 does not rule it. |
| :336 (12.6) | TanStack Virtual | Not a UI library of the table; untouched. |

   Sections 1 and 11 are the only other places. No other library line found (no Radix, tremor, Vaul import).
3. Installed, measured: package.json:78-80 `@mantine/core`, `dates`, `hooks` all "8.3.18"; :82 `@rjsf/mantine` 6.11.1; :107 `mantine-datatable` 8.3.13; :122 `sonner` ^2.0.7. No `react-hook-form`, no `@hookform/resolvers`, no `vaul`, no `@mantine/notifications`, no shadcn package; no `components.json` (ls). The only `react-hook-form` string in src is a comment: src/components/admin/ParcelCostTool.tsx:27 ("react-hook-form is NOT in the dependency tree"). Spec 126's table says "Mantine 9" (126:1005, and :467), but the same cell records the amendment: "the web library is Mantine 8.3 (`@mantine/core`, `hooks`, `dates` 8.3.18 ...), amending D-2's "Mantine 9"" (126:1005). Spec 33:44: "shadcn/ui is **NOT initialized in this repo** — there is no `components.json`, and `src/components/ui/*` holds only `Badge.tsx` + `ScoreBadge.tsx`". Verified true.
4. Sonner: 19 files import it (grep `from 'sonner'`), 2 of them tests (src/tests/admin-watchlist-hooks.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts); 17 are code, e.g. src/app/(maxbld)/admin/layout.tsx, src/app/admin/control-panel/page.tsx, src/lib/media/useUploadMedia.ts. 5 of them are under src/features/ (admin-controls, admin-flight-center). Mantine is imported in 10 files, none under src/features.
5. Toast in Spec 126/135/136: grep of "sonner", "toast", "@mantine/notifications" over 126_maxbld_surface_standard.md, 135*.md and 136*.md returns no line. So the card's "Spec 126 does not name a toast library" is true. BUT Spec 33 does: 33:45 "**Toasts:** **`sonner`** (already a dependency...)" and the dated note 33:47 (2026-11-09, MF-42; operator, verbatim: "P42 decisions approved" and "approved smaller version"): "toasts are unchanged: `sonner`, for the MaxBLD web pages too (no `@mantine/notifications`)." That is an existing operator-approved statement, outside Spec 126. It makes Sonner's state a record, not a gap. See Q1 RULED.
6. Scope. Spec 126 section 2.0 (126:129-147): "Every descriptor declares `programme.scope` from a closed set of four"; scopes A `parcel_product` (:135), B `parcel_admin`, C `platform_shared` (:137) are "Governed by this spec? Yes"; D `estate_other` (:138), "The OTHER product: lead generation, the flight center, the lead feed, permit and job detail, builders and entities", is "**No — inventory and seam only.**" and "Scope D is fenced ... Those surfaces convert under this same standard in a later programme." The engineering standards' section 12 status line says it was "Adopted as of 2026-04-07 for the lead feed feature build (`src/features/leads/`)" (:306), which is scope D. The section 11 checklist block at :277-285 is headed "new code in `src/features/`", also scope D. Spec 126 fences scope D off as its own fact, but the record says the old lines are not followed there either (Spec 33:44; no code imports react-hook-form, vaul or shadcn), so the note carries no scope D sentence (Q4 RULED).
7. Locks and readers (grep src/tests, scripts, .husky):
   - Tests mention the file only as `SPEC LINK:` comments (e.g. src/tests/setup.ts:1, src/tests/contracts.infra.test.ts:1) and one commit-message string (diff-narrator test:19). None pins a line number, section size or the 46,076 figure (grep "46,076|46076" in src/tests/backlog/rule-lists.logic.test.ts: no hit).
   - scripts/analysis/rule-lists.json:31 defines `eng-all` as `{"file": "docs/specs/00_engineering_standards.md", "whole": true}`; it is attached to rows at :85, :97, :103, :109 and the surface row :141.
   - docs/reports/generated/rule-lists-by-kind.md shows eng-all 46,076 at lines 18, 31, 64, 77, 101, 117 (six kinds) plus each kind's total row. After the note the count changes, so the page goes stale. `.husky/pre-commit:44` runs `node scripts/analysis/rule-lists.mjs page --check`; scripts/analysis/gates/generated-docs.mjs:53 lists the page as a generated doc with a check. So the commit is refused unless the page is regenerated (`rule-lists.mjs page --write`; usage line printed by the tool confirms the `page` verb).
   - DRIVEN (rule-lists.mjs resolve --files with the card's two paths --type build --letter S): the Files line resolves TEN lists: eng-all, agents-s7-s11, queue-137, policy-124-s2-s5, agents-s5-1to3, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S; exempt and unmatched are empty. The spec path alone gives seven; the three extra (policy-124-s2-s5, agents-s5-1to3, orchestrator-doc17) come from the generated page on the Files line, which the pre-commit page check requires.
   - spec-split-check.mjs does not name the file (grep: no hit).
8. Plan evidence that goes stale: eng-all is pasted whole into each plan-phase compliance input. docs/reports/reviews/task-432/in-plan-compliance-eng-all.txt exists; task-432/context-r2.md and context-r3.md and FINDINGS-PLAN.md name eng-all. task-433's directory holds in-plan-compliance-eng-all.txt too (DRIVEN, ls). DRIVEN at the board head 6c3f450c9: tasks 432 and 433 are BUILT and folded, and their review folders hold eng-all inputs as history, not a gate; task-431 is LATER with no review folder. Nothing committed goes stale (see ORDER 4: 435 lands before task-431).

#### WHAT

One edit: add one blockquote dated note directly under the Status blockquote at the head of section 12 (after :306, before "### 12.1"). Nothing else in the file changes. No second note in section 11 (Q2 RULED). Regenerate the one generated page.

Why one note at the head of 12 and not beside each line: the operator approved "A dated note in the engineering standards, section 12"; the card says "one dated note ... beside the library lines". Head of section 12 puts it before 12.3, 12.5 and 12.7; section 11's lines at :280-285 sit above it and are NOT in section 12, so a reader of those meets the note only if they read on. The note names them by section reference so it covers them in words.

#### EXACT NOTE TEXT

(one line, as the other blockquote notes are; inserted after the blank line :307 that follows the Status blockquote, then one blank line, then the heading of 12.1: the note becomes :308 and the heading :310)

> Dated note 2026-11-22 (M-246, prior text kept; RR-0382 · task-435 · Backlog; operator, verbatim: "yes add"): §12.3 (React Hook Form) and §12.5 (Shadcn UI, Shadcn `<Drawer>`), and the same library names in the Frontend Foundation Check of §11, are superseded for the front end by Spec 126 §11b.4 "The libraries" (`docs/specs/02-web-admin/126_maxbld_surface_standard.md`; see also its dated note 2026-11-09, §5.4). This note rules nothing on §12.7 (Sonner): Spec 126 does not name a toast library, and `sonner` is installed and in use.

Verified clauses (DRIVEN or READ by the plan grounder): §12.3 and §12.5 are at 00_engineering_standards.md:320 and :331, the same names at :280 and :283 under the heading at :277; Spec 126 §11b.4 "The libraries" is at 126:999; Spec 126:467 sits under 5.4 (heading at :463), and its dated note is cited as see also, not as the authority (it supersedes Spec 126's own "Shadcn/Tailwind" wording at :465 and says nothing of React Hook Form); Spec 126 has no line with sonner or toast (grep); sonner is at package.json:122 and is imported in 19 files of src, 17 of them code. The note holds no file path, version or count, so nothing in it goes stale; the note names §12.3 and §12.5 only; it carries only the ruling verbatim (yes add), not his same-day view (MORNING-DECISIONS.md:1884-1885, "I think", a view and not a ruling); no scope D sentence; no Spec 33 clause.

Length: 81 words in one paragraph (126:467 is 41 words, 08_agents.md:150 is 64, :229 is longer); the Spec 33 clause, the scope D sentence, the measurements and the file list of v1 are cut.

#### TESTS

- Q3 RULED: no new test, because the note adds no lock, field or rule (124a_step_standard_policy_appendix.md:992). The test of record is the existing pre-commit check `node scripts/analysis/rule-lists.mjs page --check` (.husky/pre-commit:44), proven both ways: it exits 0 today (DRIVEN: "is current"); after the note is inserted and before `page --write` it exits 1 ("out of date", rule-lists.mjs:850), which is the red; after `page --write` it exits 0, which is the green. The rule is "Every lock is proven in BOTH directions" at docs/specs/00-architecture/08_agents.md:485; the card's DoD #2 cites :462, a drifted number.
- Must stay green: the pre-commit `node scripts/analysis/rule-lists.mjs page --check` (.husky/pre-commit:44); the generated-docs gate for rule-lists-by-kind.md (scripts/analysis/gates/generated-docs.mjs:53); src/tests/backlog/rule-lists.logic.test.ts; check-task-files (the Files line covers the one path); the commit-msg hooks including check-lane-close.mjs for a lane close. Run the named tests through the project's own scripts; I name no runner.
- Regenerated: docs/reports/generated/rule-lists-by-kind.md (eng-all count at lines 18, 31, 64, 77, 101, 117 and the six totals). It is generated, so it must ride in the same commit; Files line: see below.

#### ORDER

1. Insert the note after the Status blockquote of section 12 (no other line touched).
2. Regenerate the rule-lists page (`page --write`), check the diff is only the eng-all character counts and totals.
3. Run `page --check` and the rule-lists logic test.
4. The task file (status BUILT with its evidence) and its status line move in the separate closing commit that carries only the lane records (137_mcqueue.md:100, the Rule 3 note of 2026-11-20, for a lane build task); the work commit holds the note and the page only. 435 lands before task-431; the second lander regenerates the page (`rule-lists.mjs page --write` after the rebase), it is not hand-merged.

#### LANDING

Lane build, commit through the real hooks, none bypassed (DoD #3). Rule 3 two-commit close (Spec 137:100 note): work first, then a closing commit carrying only the lane records. Plan-phase compliance outputs for each list the Files line resolves to, and a separate grounder, as COMPLY.2 requires (08_agents.md:229). Decision record: the ruling is already in decision-167; the note quotes it verbatim.

#### ACCEPTANCE

- One new blockquote, directly under the section 12 Status line; `git diff` shows only added lines in the engineering standards (no deletion, no edit of an existing line).
- The note quotes "yes add" verbatim, names Spec 126 §11b.4 and cites its dated note 2026-11-09 (§5.4), states the Sonner fact and rules nothing on it; it holds no path, version or count, no scope D sentence and no Spec 33 clause.
- `grep -c "Dated note 2026-11-22 (M-246" docs/specs/00_engineering_standards.md` is 0 before the insert and 1 after; the lines around it read: the Status line, one blank line, the note, one blank line, "### 12.1 Biome (React Logic Linting)".
- rule-lists page regenerated and `--check` clean.
- No change to 12.3, 12.5, 12.7, the checklist, or any other file besides the generated page and, in the closing commit, the task file.

#### NOT IN SCOPE

- The handbook line on the library standard: task-430. The engineering sections split: task-431.
- No ruling on Sonner, no statement that 12.7 or section 12.6 is right or wrong, no edit of the stale "Shadcn's Sonner integration" wording.
- No change to Spec 33, Spec 126, package.json, or any code.
- No second pointer note in section 11 (Q2 RULED).

#### QUESTIONS RULED by the plan grounder (docs/reports/reviews/task-435/QUESTIONS-RULED.md; none left for the operator)

Ruled: add the note (RR-0382). Not ruled: Sonner.

Q1 RULED (b), by the rules (decision-167: Sonner "is not ruled: the note states the fact only"; 124a_step_standard_policy_appendix.md:992 R-IZ, no scope its ruling did not name): the note does not cite Spec 33:47. It states the card's two facts and rules nothing on §12.7; Spec 33:47 stays where it is, a record the note neither repeats nor contradicts.

Q2 RULED: no second note. The operator put one note in section 12 (MORNING-DECISIONS.md:1888) and the engineering standards go to a reviewer whole (scripts/analysis/rule-lists.json:31, whole:true), so the section 12 note is met; the note names the Frontend Foundation Check of section 11 in words. A pointer note under :277 is an edit no ruling named (124a R-IZ).

Q3 RULED: no new test; see TESTS (the page check both ways; the rule is at 08_agents.md:485).

Q4 RULED: no scope D sentence. His words are "for the front end" (decision-167: "for front-end work"); Spec 126 states its own scope fence (126:138, :140) and the note points to Spec 126; "stand as written" would assert a standard the record says is not followed (Spec 33:44; no code imports react-hook-form, vaul or shadcn), a ruling no one gave.

#### UNVERIFIED

- None of the v1 items remains: resolve (ten lists), the status of 432 and 433, the 2026-06-16 date (git blame), the red-first line (:485) and the §5.4 line were each run or read by the plan grounder.
- Not driven: the page after the real insert (ORDER 2 runs it and stops if more than the eng-all counts and totals change).

#### GUESS (estimate)

About 30 to 45 minutes of lane time: 5 minutes for the edit, 5 for the page regeneration and check, the rest for the plan-phase compliance outputs (ten lists), grounder, and the two-commit close. Risk is in the review round on the note wording, not the edit.

#### FILES

Files: docs/specs/00_engineering_standards.md, docs/reports/generated/rule-lists-by-kind.md
(The generated page is part of the Files line because the pre-commit `page --check` refuses the commit while it is stale. Resolved lists: see FACTS 7.)

Plan review round 1: 72 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/task-435/GROUNDER-PLAN.md; triage docs/reports/reviews/task-435/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#2 MED folded Q4 RULED: no scope D
plan-compliance-agents-s5-1to3#4 MED folded the Files line resol
plan-compliance-agents-s7-s11#1 MED folded The note holds no fi
plan-compliance-agents-s7-s11#2 MED folded the Files line resol
plan-compliance-agents-s7-s11#5 MED folded Q4 RULED: no scope D
plan-compliance-agents-s7-s11#7 MED folded Q1 RULED (b), by the
plan-compliance-eng-all#2 MED folded Q1 RULED (b), by the
plan-compliance-eng-all#3 MED folded Q4 RULED: no scope D
plan-compliance-eng-all#4 MED folded The note holds no fi
plan-compliance-eng-all#5 MED folded the note names §12.3
plan-compliance-five-words#3 MED folded Q1 RULED (b), by the
plan-compliance-five-words#4 MED folded Q4 RULED: no scope D
plan-compliance-five-words#5 MED folded The note holds no fi
plan-compliance-inc-S#1 MED folded This note rules noth
plan-compliance-inc-S#2 MED folded Q1 RULED (b), by the
plan-compliance-inc-S#3 MED folded Q4 RULED: no scope D
plan-compliance-inc-S#5 MED folded The note holds no fi
plan-compliance-ms-S#1 MED folded Q1 RULED (b), by the
plan-compliance-ms-S#2 MED folded The note holds no fi
plan-compliance-ms-S#4 MED folded Q4 RULED: no scope D
plan-compliance-orchestrator-doc17#2 MED folded This note rules noth
plan-compliance-orchestrator-doc17#3 MED folded Q1 RULED (b), by the
plan-compliance-orchestrator-doc17#4 MED folded Q4 RULED: no scope D
plan-compliance-orchestrator-doc17#6 MED folded The note holds no fi
plan-compliance-plan-protocol#2 MED folded The note holds no fi
plan-compliance-plan-protocol#3 MED folded Q4 RULED: no scope D
plan-compliance-plan-protocol#4 MED folded none left for the op
plan-compliance-plan-protocol#5 MED folded the Files line resol
plan-compliance-policy-124-s2-s5#2 MED folded The note holds no fi
plan-compliance-policy-124-s2-s5#3 MED folded Q1 RULED (b), by the
plan-compliance-policy-124-s2-s5#4 MED folded Q4 RULED: no scope D
plan-compliance-policy-124-s2-s5#6 MED folded the Files line resol
plan-compliance-queue-137#1 MED folded move in the separate
plan-compliance-queue-137#3 MED folded The note holds no fi
plan-compliance-queue-137#4 MED folded Q4 RULED: no scope D
plan-compliance-queue-137#5 MED folded This note rules noth
plan-compliance-queue-137#6 MED folded the Files line resol
plan-error-paths#2 MED folded The note holds no fi
plan-plan-review-deepseek#1 MED folded The note holds no fi
plan-plan-review-deepseek#2 MED folded Q1 RULED (b), by the
plan-plan-review-deepseek#4 MED folded The note holds no fi
ig#1 MED folded the Files line resol
ig#6 MED folded 435 lands before tas
rc#1 MED folded its dated note is ci
rc#2 MED folded The note holds no fi
rc#5 MED folded the note names §12.3
rc#7 MED folded Q4 RULED: no scope D
rg#1 MED folded Length: 81 words in 
rg#2 MED folded Q4 RULED: no scope D

## Implementation Notes
Dated note 2026-11-22 (M-246, prior text kept; RR-0382 · task-435 · Backlog; operator, verbatim: "yes add")

2026-11-22 taken on the board at lane launch (lane BL-NOTE435, worktree /Users/brettpreston_macmini/Buildo-wt-note435, branch wf1/inc1b-note435), RR-0240

Build 2026-11-22 (lane BL-NOTE435): note inserted under the section 12 Status line. Acceptance pre-insert: grep -c "Dated note 2026-11-22 (M-246" = 0; page --check exit 0 (is current). After insert, before page --write: grep -c = 1; page --check exit 1 "out of date: regenerate with node scripts/analysis/rule-lists.mjs page --write" (the red). git diff of the spec: 2 insertions, 0 deletions.

After page --write: page --check exit 0 ("is current", the green). Page diff: 12 insertions 12 deletions, only the eng-all count 46,076 -> 46,613 in six kinds and the six total rows (e.g. 197,241 -> 197,778). Spec diff: 2 insertions (the note and one blank line), 0 deletions; lines around it: Status line, blank, note, blank, "### 12.1 Biome (React Logic Linting)".

## References
- docs/reports/reviews/task-435/GROUNDER-PLAN.md
- docs/reports/reviews/task-435/TRIAGE-PLAN.md
- docs/reports/reviews/task-435/seat-integration-1.md
- docs/reports/reviews/task-435/seat-reality-check-1.md
- docs/reports/reviews/task-435/seat-regression-1.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:policy-124-s2-s5 docs/specs/01-pipeline/124_step_standard_policy.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end — "yes add" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1889)
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0141 Operator: Q-LT-1
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end (names task-435, RR-0382) — "yes add" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1889)

## Prior reviews and lane reports
### task-435 (this task)
- docs/reports/reviews/task-435/FINDINGS-PLAN.md
- docs/reports/reviews/task-435/FOLD-CHECK.md
- docs/reports/reviews/task-435/GROUNDER-PLAN.md
- docs/reports/reviews/task-435/QUESTIONS-RULED.md
- docs/reports/reviews/task-435/TRIAGE-PLAN.md
- docs/reports/reviews/task-435/seat-integration-1.md
- docs/reports/reviews/task-435/seat-reality-check-1.md
- docs/reports/reviews/task-435/seat-regression-1.md

## Dependencies
- (none)
