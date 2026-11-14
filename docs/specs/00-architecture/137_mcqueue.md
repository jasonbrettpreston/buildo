# SPEC 137 — McQueue

> **Status: DRAFT** — number claimed in the id ledger (`~/Buildo-scratch/ids/spec-137`). Hand-written, not generated. Form: Spec 135 (header and register style), Spec 08 (§11.8 and §11.9 numbered rules), Specs 132/133/136 (citation form). Operator review comes before the docs commit.

> **Role: standard.** The queue policy page. McQueue is the one page that says where every task lives and how its status is kept. It does not hold tasks. It points to them. Sources of every rule: the operator rulings of 2026-11-14 (`~/Buildo-scratch/mcqueue/DECISIONS.md`) and the existing dated notes cited in §4.

> **Citation form.** `Spec 137 §<n>` for a section, `Spec 137 §4 rule <n>` for a rule. A rule is quoted with its source; the source is never paraphrased in its place.

## 1. Purpose

1. Tasks stay in their homes (§2). McQueue does not move them, copy them or keep an index of them.
2. This page points to each home: the file, the section, and the form of the row id. A reader finds any task from here.
3. This page gathers the queue rules with their sources (§4) and gives the weekly check (§5).
4. No rule here is new except where §3 and §4 say the operator ruled it on 2026-11-14.

Operator, 2026-11-14, verbatim: "a - let's do it but it needs to properly point to the tasks - it was too much work to bring them into a central location".

## 2. The homes

Paths marked LOCAL are scratch files on the operator machine, not in the repo. Every other path is in the repo.

| Queue | Exact path | Section | Row id form | What lives there |
|---|---|---|---|---|
| McBylaws | `.cursor/MCBYLAWS-QUEUE.md` | "THE PHASE 3 EXIT PATH", "FOLLOW-ON", "Close-out"; lane board "Lane board" | heading `**MB-nn <task> — STATUS**` | The by-law tasks MB-nn, each with its stage, lane and rules. Rows in tables or lists carry their status line in the section "Status lines for rows kept in tables and lists". |
| McIncrements | `.cursor/MCBYLAWS-QUEUE.md` | "Increments: start small, expand through the loop" | table row `#` 1..10; id `INC-n` in the status section; jobs `INC5-NIGHT`, `INC5-M14` | The increments table: what each increment adds and its entry and done conditions. The six-step recipe is Spec 08 §11.8. |
| McFrontend | `.cursor/MCFRONTEND-QUEUE.md` | "Phase 0", "Phase 1", "Phase 2", "Later: convert-on-touch" | heading `**MF-nn <task> — STATUS**` | The front-end tasks MF-nn. Register: Spec 135. Handbook: Spec 136. |
| McTest | `.cursor/MCFRONTEND-QUEUE.md` (rows MF-78 to MF-82); LOCAL `~/Buildo-scratch/mctest/` | Phase 2 | `MF-78`..`MF-82`; cards `MCTEST-CARD-*`, `MCTEST-FIRST-RUNS` | The test standard, harness, sweep, stress and phone runs. Plan, scenarios, runs and cards are in the LOCAL folder. |
| McStorage | LOCAL `~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md` | one section per ruling | `ST-1`..`ST-8`; owed notes `ST-OWED-<letter>` (the letters are listed in the file) | The storage rulings and the notes still owed to the registers. |
| Airtight V3 | `.cursor/QUEUE.md` | "Status lines for the Airtight V3 rows" (top of file); history below it | `AV3-<name>` | The V3 step-conversion programme: the DB lane, the V3-CoA pieces, follow-on lanes, the not-pushed list. Permit work here is frozen (§4 rule 11). |
| Cards | LOCAL `~/Buildo-scratch/mcbylaws/CARD-*.md`, `~/Buildo-scratch/mcfrontend/CARD-*.md`, and the other card folders (find a card by `~/Buildo-scratch/**/CARD-<name>.md`) | one file per card | `CARD-<name>` | Questions to the operator and their answers. |
| ID ledger | LOCAL `~/Buildo-scratch/ids/` | one folder per claimed number | `<kind>-<n>`, for example `MB-107`, `MF-86`, `spec-137` | Which numbers are taken, and by which lane. Checked by `ids/check.mjs` before a push command (Spec 08 §11.8 MCINC-8). |

Notes on the table.
- The ids `INC-n`, `AV3-*`, `ST-*` and `CARD-*` name rows whose status line sits in the home shown. The queue files themselves keep their own row text.
- The "next free id" line in the head of `.cursor/MCBYLAWS-QUEUE.md` (MB-nn) and of `.cursor/MCFRONTEND-QUEUE.md` (MF-nn) is the one tools read. `INC-n`, `AV3-*`, `ST-*` and `CARD-*` have no counter line; the ID ledger is their only claim record.
- Line numbers in this page are dated by the commit they were read at (`827ea5acc`) and are a hint; the section or note name is the pointer.
- Spec 08 §11.8 (MCINC-7 and MCINC-8) and §11.9 (TKT) govern how lanes work on these rows. This page does not restate them.

## 3. The status line

Operator, 2026-11-14, verbatim: "y" (on the low-infrastructure proposal; rule 1 of `~/Buildo-scratch/mcqueue/DECISIONS.md`).

**Rule 1.** Every row has ONE status line, REPLACED when the status changes, never appended. The row prose stays as it was ("prior text kept", M-246).

Form:

`Status: <WORD> · since <date> · expires <date or "when <event>"> · next: <step> · ruling: "<verbatim>"`

- `since` is the date of the last real change to the row (`YYYY-MM-DD`).
- `expires` is the date the row comes back to the operator (rule 7 of §4), or `when <event>` for a row that waits on a named event (rule 12 of §4). `none` for DONE, FROZEN, DROPPED and MERGED.
- `next` is one step, in plain words. `none` when nothing is owed.
- `ruling` appears on FROZEN and DROPPED rows and quotes the operator's words. It is optional on other rows.
- A WAITS row names what it waits on inside `next`. An OPERATOR row names its O-id or its card inside `next` (the source: "OPERATOR (named O-id)").
- `opened` is not a field of the line. It is `expires` minus 7 days, unless the operator set the expiry (rule 7).
- A row not yet verified against what landed reads `<WORD> (unverified <date>)`.

Word list (closed; nine words):

| Word | Meaning |
|---|---|
| DONE | The work landed and the evidence exists (the `MB-nn@sha` or `MF-nn@sha` stamp, where the queue requires it). No expiry. |
| BUILT | Built and committed locally; not yet pushed or not yet landed. |
| RUNNING | A lane is working on it now. |
| WAITS | Waiting on a named task, lane or event. |
| OPERATOR | Waiting on an operator answer or action. |
| LATER | Accepted, not started, no lane yet. |
| FROZEN | Held by an operator ruling. The ruling is quoted. No expiry. |
| DROPPED | Closed by an operator ruling. The ruling is quoted. No expiry. |
| MERGED | The row is the same task as another row. The line reads `MERGED into <id>` and points to it; the work is tracked there. No expiry. Source: operator, 2026-11-14, "1-11 y", decision 8 (the 26 merges, one batch) in `~/Buildo-scratch/queues-20261114/triage/RULINGS.md`. |

Source of the word list: the status-word form line in `.cursor/MCFRONTEND-QUEUE.md` (the "Form copied from" paragraph, :5 at 827ea5acc: DONE, RUNNING, WAITS, OPERATOR, HELD, LATER) and the McBylaws queue "Status words" line (section "Lanes"). The 2026-11-14 ruling adds BUILT, FROZEN and DROPPED. HELD is replaced by FROZEN; an older HELD in a row's prose is prior text.

Reading older text. A heading that still carries an older status word (for example a WAITS heading above a DONE status line) is prior text kept under M-246. The `Status:` line is the current word.

Where the line sits. A row with a bold heading carries the line directly under the heading. A row in a table or list carries it in the queue's status section (§2). A card carries it as the first line of the card file. Spec pages carry their own status in the page header (`Status: DRAFT`); the status line is for queue rows, cards and claimed ids that are tasks.

## 4. The rules, with sources

**Rule 2. One task, one row, in one home.** Every task is registered. A card, or a claimed id, gets a status line too. A task with no row does not exist.
Source: operator, 2026-11-14, verbatim: "y" (DECISIONS.md rule 2). Builds on the McFrontend queue head: "A task not listed here is not done." (`.cursor/MCFRONTEND-QUEUE.md`, first paragraph) and the McBylaws queue head (`.cursor/MCBYLAWS-QUEUE.md`, "Next free id" paragraph), and on the ID ledger (Spec 08 §11.8 MCINC-8: "Every MF, FE, MB, migration, prereg round, D and M number is claimed in `~/Buildo-scratch/ids` before it is used anywhere").

**Rule 3. The status line changes in the same commit as the work.** When work lands for a row, the commit that lands it edits that row's status line. This goes into every lane brief and the commit checklist. There is no tool. A lane and the orchestrator can edit the same line; the later commit replaces the earlier one, and the weekly snapshot (§5) reports any row where the line and what landed disagree.
Source: operator, 2026-11-14, verbatim: "y" (DECISIONS.md rule 3).

**Rule 4. The orchestrator writes each ruling into the row's status line the same day.** The scratch decision logs are logs only. A ruling is kept as a verbatim dated note on its row, in the M-246 form: `Dated note <date> (M-246, prior text kept; <row> · <queue> · lane X; operator, verbatim: "<words>")`.
Source: operator, 2026-11-14, verbatim: "y" (DECISIONS.md rule 4). The note form is existing practice: Spec 08 §11.8 dated notes; `.cursor/MCBYLAWS-QUEUE.md` lines 124-126.

**Rule 5. The Airtight V3 queue is tracked.** `.cursor/QUEUE.md` is committed (by the clean-up commits of the McQueue branch), so that all homes that are repo files are on origin. Until that commit is pushed the file is local only.
Source: operator, 2026-11-14, verbatim: "y" (DECISIONS.md rule 5). Reason found 2026-11-14: the file was untracked, not ignored; the 2026-11-03 note in the file says "This file is untracked (no branch holds it)".

**Rule 6. A weekly snapshot, by procedure.** §5.
Source: operator, 2026-11-14, verbatim: "y" (DECISIONS.md rule 6).

The rules below already exist. They are gathered here with their sources. They are not changed.

**Rule 7. Open rows expire in 7 days, unless the operator sets another date.** Each open row carries an opened date and an expiry 7 days later. At expiry the row is resurfaced in the next decision list. It is never closed automatically.
Source: MB-85 E7. Operator, 2026-11-06, verbatim: "E2a, E4 as long as this isnt a big infa creation E7 E7 7 days." and "In a ticket system - arent incompleted or cards not respondend to - wait on the list with a date for expiry" (`.cursor/MCBYLAWS-QUEUE.md`, the dated notes "MB-85 E4 and E7" and "MB-85 E5 and E7" in the Lanes section, 2026-11-06; :124-126 at 827ea5acc).
Operator-set exceptions are written on the row. Example: MB-107 expires 2027-01-14. Operator, 2026-11-14, verbatim: "add teh task but put a lengthy expiry - 2Months" (card `~/Buildo-scratch/mcbylaws/CARD-MB-107-existing-house-suite.md`).
DONE, FROZEN and DROPPED rows have no expiry.

**Rule 8. Open work has one list, one waiting word, one card.** Each open row carries one waiting word (OPERATOR, WAITS or a status above), names its card, and carries its opened and expiry dates. The one-time sweep (E5) lists the unanswered card files against their queue rows: answered elsewhere, open with a row, or open with no row. Nothing is deleted.
Source: MB-85 E4 and E5, the same dated notes.

**Rule 9. The DB lane runs one job at a time, beside the other lanes.** The DB writer is ONE lane, runs on an operator go, and holds the DB lock. Every DB job is rehearsed on the local test stack first (MCINC-7: the real commit hooks run on the rehearsal), then runs under the operator's go. The other lanes keep running: the active increment keeps its build lanes; only an approval-gated commit waits.
Sources: `.cursor/MCBYLAWS-QUEUE.md`, section "Lanes" (D DB writer, ONE; operator go; `~/Buildo-scratch/dblock/HELD`); Spec 08 §11.8 MCINC-7; `.cursor/QUEUE.md` "DB lane, in order (one at a time)"; operator, 2026-11-13, verbatim: "night y" (overnight test-stack runs, one at a time under `dblock-teststack`); operator, 2026-11-04, verbatim: "increment 2 should always be running - this is the focus to get this done today".

**Rule 10. A ruling enters a row as a verbatim dated note.** The operator's words are copied exactly, with the date, the row id and the queue, and the prior row text is kept.
Source: M-246 (prior text kept), as used in `.cursor/MCBYLAWS-QUEUE.md` and Spec 08 notes.

**Rule 11. Permit step conversion stays frozen.** The queue rows for it read FROZEN with the ruling quoted.
Source: operator, 2026-10-29, verbatim: "the work with the permits was so disorganized and error prone that we froze that work" (`.cursor/QUEUE.md`, CURRENT STATUS 2026-10-27, DB lane item 6).

**Rule 12. A row that waits on a named event takes that event as its expiry.** The `expires` field reads `when <event>`, not a date 7 days out. The row is resurfaced when the event happens, or at the operator's next decision list after it. This is an operator-set exception to rule 7, written on the row.
Source: operator, 2026-11-14, verbatim: "Just a question about G1 - we still need to McTest and ensure the McStorage is aligned. Mctesting needs to be part of the soultion.  I like the focus for G2 and G1. Thoughts. 1-11 y", decision 10 of the triage list: "Expiry: a row that waits on a named event takes that event as its expiry, not 7 days." (`~/Buildo-scratch/queues-20261114/triage/RULINGS.md`). The 7-day default of rule 7 stands for every other open row.

## 5. The weekly snapshot

A procedure. No tool and no code.

1. A Sonnet lane is named for the check (Spec 08 seats). It is read-only: no commits, no checkout in shared worktrees, no DB. It reads `~/Buildo-scratch` read-only, and it never opens an env file (the test stack env values are never printed). If a home is missing or unreadable, it reports "home not read: <path>" and does not pass it.
2. It reads every home in §2: both queue files, `.cursor/QUEUE.md`, the McTest folder, `McSTORAGE-RULINGS.md`, the card folders and the id ledger.
3. It lists every row. A claimed id with no row, and a card with no row, are listed as "no row" (rule 2).
4. For each row it checks the `Status:` line against what landed. Evidence: the commit on the origin tip (`git show`, `git merge-base --is-ancestor`), the dated notes, the card answers.
5. It marks DRIFT where the line and the evidence disagree. It marks UNVERIFIED where it cannot tell, and does not guess.
6. It lists rows whose `expires` date is on or before the check date. A row with no `expires` that is not DONE, FROZEN, DROPPED or MERGED is listed as "no expiry". A `when <event>` row is listed when its event has happened.
7. It checks that every FROZEN or DROPPED row has a quoted ruling, and that each "next free id" number is greater than every claimed id of its kind in the ID ledger.
8. It returns one list to the operator: expired (keep with a new date, drop, or answer), drift (the row to correct), no-row items, no-expiry items, and the UNVERIFIED rows it could not judge. It changes nothing.
9. The orchestrator makes the corrections in the next docs commit (rule 3, rule 4).

Worked example: the 2026-11-14 audit (LOCAL `~/Buildo-scratch/queues-20261114/`: `mcbylaws-rows.json`, `mcfrontend-rows.json` and the two summary files).

## 6. Deferred

A commit check that refuses a missing status line, a missing expiry, or DROPPED without a quoted ruling. It is infrastructure work. It is carded for the infra-freeze lift and is not built now.
Source: operator, 2026-11-14, verbatim: "y" (DECISIONS.md, "Deferred to the infra-freeze lift"). Also deferred by the same ruling: a generated index across all queues ("a generated index across all queues is infra work: carded for the freeze lift, not built now", DECISIONS.md, first ruling).
