# REPORT BL-SEMI (task-319 SRCH.SEMI, Increment 1·B), STAGE 1 OF 2: design mock for operator approval

Status line (Spec 137 rule 3): BL-SEMI lane · task-319 WAITS · stage 1 docs commit only (mock, delta list, records); no code change, no push, no DB.

## Deliverables
- Mock: ~/Buildo-scratch/lanes-20261119/inc1b/semi/semi-question.html (sha256 889e9d8a47157743c6fff46fd419a8f82bc17de4a998bdd1727ad20dd18b19d2), repo copy docs/reports/lanes/2026-11-19/BL-SEMI/semi-question.html. Seven phone-width frames: default (none chosen, Continue disabled "Choose an answer"), an answer chosen (Continue "Continue"), loading, error, schema drift, rate limit, entitlement. Self-contained (the only URLs are the SVG namespace); light Daylight tokens read from the v8 choose-lot.html.
- Made the same way as the v8 pages: lane-dir generator build-semi.mjs reads the v8 CSS block, favicons and icon paths from small-pages-v8 (read only) and every string from the built content file. v8 build.mjs and render.mjs were NOT copied (build.mjs imports ../shared and ../brand files); nothing under small-pages-v8 was written.
- Delta list: ~/Buildo-scratch/lanes-20261119/inc1b/semi/DELTA.md (files, constants, 8 goldens plus the emit slice, MF row, meter call site with file:line, four questions).
- Review: r1-plan.txt (30 findings) and TRIAGE.md (KEPT: not-drawn rows D.8-D.11 added, line cites corrected, mock sha recorded, device-run debt; the rest rejected with a line cite, mostly generated-context-pack defects).

## Element table (D.1 to D.7; the key is in a comment beside each string in the mock)
| Element | Content key | v8 component | Token |
|---|---|---|---|
| D.1 shown only when unsure | none | not drawn | none |
| D.2 lot form | none | not drawn | none |
| D.3 question | question.title | .section h2 | --ink |
| D.4 answers | answer.yes, answer.no, answer.not_sure | button.card[role=radio] | --card, --s-outer-b, --ink, --field-b |
| D.5 Continue | select.none, select.go, select.label | .btn.p | --amber, --amber-ink |
| D.6 Back | back.label (aria only) | .top .back chevron | --ink |
| D.7 states | state.loading, state.error, state.schema_drift, state.ratelimit, state.entitlement, retry.text, retry.label | .banner, .banner.info, .btn.s, .lead status | --err, --btn-b, --t2 |

## Finding worth the operator's eye
The built page is already in Daylight colours (MF-92 fdb6cd266: lotMap.ts:5-9 header; daylightSearchPages.golden.test.ts:5 covers it), so the "old look" in the brief is out of date for colour. What remains is structure: radio dot on cards, heading size, button height, app-bar back, banner icons. The meter call after the answer (DELTA.md section 5) needs a lookup flag and a Continue-time fetch, because the route cannot see the answer and the report reads a cached entry.

## Questions for the operator (all in DELTA.md section 6)
Q1 Back: v8 chevron or built X. Q2 Entitlement icon: v8 info or built Lock (Q1 and Q2 each add one icon to SurfaceRenderer.tsx:31). Q3 Curly apostrophes in answer.yes, answer.no, state.entitlement (copy change). Q4 Try again and loading in the v8 form (secondary button, status line) or as built (amber button, spinner). The mock draws the v8 form for all four.

## UNVERIFIED
- No render of the mock (headless Chrome failed to start: "Failed to get the path for 1001"); structure checked by reading the generated file only.
- The built page has never been device-checked (doc-2 F-SEARCH-MOBILE); approval is of the design.
- The meter proposal (flag on the lookup, fetch at Continue) is design only; BL-METER commit 7577c4e8b is not in this worktree head, read with git show.
- Built disabled-button look (the Button component default) not read; DELTA item 3 compares class strings only.
- Mobile jest suites not run (rule 18; no code changed).
- The generated context pack carries defects (r1-plan.txt lines 14-18: "undefined" quote tokens, ENOENT Documents, local home path in references); relayed, not fixed here.
