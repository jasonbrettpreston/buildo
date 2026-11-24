# Fold check: task-452 plan (PLAN-452-v2 as folded, round 1, with FOLD-452, FOLD-MORE, FOLD-RISK5, FOLD-COPY, FOLD-LEDGER and FOLD-R2), round 2 state

Checked by: Cairn-Ground-P452b

On the board working tree (~/Buildo-wt-board, head 5c805ef28, branch wf2/board) I checked the task-452 card as it now stands, uncommitted, after the 14 pairs of FOLD-R2.json and the move BUILT to RUNNING with its dated note (assignee @lane-BL-SFX4 kept). I read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md and the lens and seat files in docs/reports/reviews/task-452/ from the working tree. Read-only. Every check ran in memory with node and the board own planHash, parseVerdicts, seatLines, findingsIn, ruledLine, lensKindOf, filesEntries and outcomeErrors (scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs). No file was written. This check is written for GROUNDER-PLAN.md after the 14 verdict-line replacements named in point (4).

(1) PASS. The FOLD-R2.json pairs landed as written (11 in the Implementation Plan, 1 in the Description, 2 in the Acceptance Criteria). They carry round 2 (RR-0385 item 3: CRITICAL and HIGH only, no third round) after the push station failed 10 web tests in 6 files on 09c7ac9d7:
- The six fixes, in new section 14: surface-goldens.ts and the admin-media lists gain mobile_parcel_wall; the auth-class-parity exception row; the limit screen's error state; the mcfront-proof canary (same cause as the increment fix); PageTableBinding.tsx keys without arithmetic; search-reports-left reads the hook line.
- RR-0467 (MD:2421-2425): wording A confirmed (the note comes off the card), and the station suite runs on the lane's fix commit before the output review (added to section 6).
- RR-0468 (MD:2426-2430): the limit screen's error notice reads "Something went wrong on our side. Please try again." for a ReportLimitError or SubscriptionRequiredError when the read failed; AC2 and AC3 and the searchWall bullet say so.
- RR-0469: WallBinding.tsx confirmed by the operator (decision-252); the dated note on the card names it.
AC2 and AC3 read "- [ ]" after the CLI edit: the true state, since both are re-proven in round 2.

(2) PASS. The Files line has 43 entries (the 39 of the last check plus surface-goldens.ts, admin-media.golden.test.ts, auth-class-parity-exceptions.json and search-reports-left.logic.test.ts). The resolve run on the 43-entry Files line gives the same nine lists, so no plan lens output needs re-making; the lens material stays context-r1.md.

(3) PASS. The round line reads "Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 6 pile", unchanged. The card holds 44 plan lines, none with a trailing space. Every folded quote of TRIAGE-PLAN.md is present in the card after whitespace squash. The Plan hash moved from aa79a1e43f44 (after the fold alone) to 7c9748df170f because the dated note is in the body; planHash covers the title plus the whole body and excludes the front matter (status, assignee), so the move is expected.

(4) PASS after 14 replacements. The round 1 build landed on the board after the last check, so the quotes of 14 verdict lines no longer sat on their cited lines: apiClient.ts moved to :71, surface-conformance :811 and :397, PageTableBinding :103 and :69, ReportPageHost :76 and :37, index.tsx :53, bindings.json :56, the gateStability mock is now :23, the S-page pin :94, page-arm :105, static-page T9 :120. With those 14 lines replaced (the lines are in the grounder hand-back):
- 98 of 98 ids have a verdict (79 lens, 19 seat): 66 CONFIRMED and 32 REJECTED, 0 CONFLICT.
- Every quote is on its cited line, is 20 or more characters, has a 20th character that is not a space, holds no asterisk, backtick, double quote or backslash, and is distinct.
- No cited line is used more than 3 times.
- The Ruled lines match the committed lens files. The Seat lines match the seat file bytes.
- outcomeErrors in plan mode, with the summary check on, returns 0 errors over the 66 CONFIRMED ids.

(5) PASS. The last line of GROUNDER-PLAN.md is the Plan line and equals the hash of the card as it now stands. No finding id was added by this fold. Round 2 owes: the lane's six fixes through the real hooks, the station run on the fix commit, the output review round 2 over the whole range, GROUNDER.md round 2, and the "Review round 2" line in the closing commit. Operator questions: none.

Verdict: PASS

Plan: task-452 sha256:7c9748df170f
