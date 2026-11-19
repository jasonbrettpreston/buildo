# REPORT: BL-R18 (task-355, R18, Increment 1·B, record-only)

Status line (Spec 137 rule 3): BL-R18 lane, task-355, record-only, no code change, no push, no database. Review round r1 (r1-review.txt) triaged in TRIAGE.md; the round read pasted text only and opened no file, so no finding or recommendation below is "verified by the round"; every cite was opened by me in ~/Buildo-wt-r18 unless marked UNVERIFIED.

## Six plain lines for the operator
1. Today a person with no plan who taps a lot on the app search page sees one notice, "Your subscription doesn't include the parcel tool right now. This isn't a missing address — reactivate to search lots again." (content.json:13, parcelSearchMatch.ts:295-300); the web shows the same notice and a disabled box (maxbld-web.ts:32-35). There is no no-plan page or route anywhere (searched no-plan, no_plan, paywall, subscribe).
2. The designed page (small-pages-v8 no-plan.html, app only, three states) shows "Welcome back", "This account has no active plan yet.", "Your plan is managed on the web. It's the same MaxBLD account.", one button "I've set up my plan" that re-checks, and links Account and Log out. It has NO sign-up button or link: its own note says "no address, no link out, no Copy button, no price, no purchase nudge" (no-plan.html:292), from your 2026-11-11 ruling "a" and App Store 3.1.1.
3. A way to sign up cannot work today anywhere in the product: the plans page (MF-86) is not built and the checkout action has no page calling it (subscribe/actions.ts:7-9); it would refuse until you enter the Stripe price ids (parcel-checkout.ts:151; queue :348); inside the app a link needs a ruling that reverses 2026-11-11 "a", or in-app purchase (MF-70) which waits on the MaxBLD app (MF-49). The smallest honest version is the page as drawn with no link, task-357.
4. The search box wording changes in one content value (content.json:17) that the app and the web both read; about 29 files move, 5 by hand (the value, two tests, a spec note, a queue row) and 24 regenerated (the slice and 23 goldens, which change only their fingerprint line). It departs from v8 (search.html:265, :278, :318 draw "Enter lot address"); your 2026-11-19 words are the newer ruling. The outside-Toronto notice and the reports-left slot stay as built. Task-356.
5. Open points for you: (1) is "a way to sign up" met by the page as drawn, or do you want a tappable link in the app (and so a reversal of "a"); (2) the same wording for a lapsed plan and a never-had plan; (3) the person with no plan at all reaches no page in the current shared app (they sit on a spinner) until the MaxBLD app's own gate exists; (4) the page needs a mobile "small page" building block the standard does not yet have.
6. Unverified: the spinner for a person with no rows (read from code, not run on a device); whether Log out leaves the Buildo paywall behind; whether the longer placeholder clips on the narrowest phone; the surface id and any MF row id (none claimed); everything the review round did not test (it opened no file).

## Decision ids (entered through scripts/analysis/backlog-decision.mjs)
- decision-96 RR-0311 a. "a. show zero left" (MORNING-DECISIONS.md:1216): zero left is shown, as built, no change.
- decision-97 RR-0312 "b. with no plan - it needs to an error page that inludes a way to sign up" (:1216).
- decision-98 RR-0313 "c. can't we put in the search box. Enter a Toronto address" (:1216).
- decision-99 RR-0314 "yes." (:1223): the outside-Toronto notice stays.
- Each names task-352 and task-320 (dated notes by the tool). task-352 closed DONE with the three decisions as its final summary.

## New task ids with waits
- task-356 SRCH.A6 search box reads Enter a Toronto address (RR-0313, RR-0314): LATER, m-1, build. Waits on: nothing; ordering with task-351 (same 23 goldens, second lander rebases). Owner MF-35.
- task-357 SRCH.NOPLAN signed-in no-plan page in the app (small-pages-v8 no-plan.html), RR-0312: LATER, m-1, build. Waits on: (A) MF-49's own parcel_tool gate for the person with no plan at all; (B) the sign-up way: plans page MF-86 (WAITS on MF-47 push and MF47-322 dev run), the operator's Stripe price ids and portal id, and for a link or purchase inside the app a ruling or MF-70 (WAITS on MF-49). Owner MF-49 follow-up; no MF id claimed.
- Both: depends on task-320. Loose-end lines (4) appended to task-343 only by --append-notes: web no-plan wiring (owner MF-86 for the page, wiring NONE), v8 mock placeholder (NONE), context-pack generator defects (NONE), the two 403 codes the app cannot tell apart (NONE).

## Open points as drafts (for the orchestrator to relay; no OPERATOR task created)
1. Is "a way to sign up" met by the designed page (text "Your plan is managed on the web", a re-check button, no link), or do you want a tappable way in the app?
   Grounded: no-plan.html:264-265, :292 (no link out, no purchase nudge); open-questions.md:1056 (your "a", 2026-11-11); Spec 126:1081 and :1113 (no purchase in the app; in-app purchase allowed later, MF-70); subscribe/actions.ts:7-9, parcel-checkout.ts:151, MCFRONTEND-QUEUE.md:348, :630-631.
   Options: A the page as drawn, no link (App Store 3.1.1 as ruled). B a link to the web plans page in the app (reverses "a", risks 3.1.1, needs MF-86 and price ids first). C wait for in-app purchase (MF-70, MF-49).
   Recommendation: A for now, with the price ids entered so the web plans page (MF-86) can be built; honest that this does not let a person sign up from the app. UNVERIFIED by the review round (it opened no file); I opened the lines above.
2. Same wording for a lapsed plan as for a never-had plan ("This account has no active plan yet.")?
   Grounded: no-plan.html:264 draws one wording; a lapsed plan reads as a non-active status with null counts (src/lib/entitlements/index.ts:641). Options: A one wording as drawn; B a separate lapsed line (new copy, a new content key). Recommendation: A, the design draws none and a sentence not drawn would be invented. UNVERIFIED by the round.
3. The person with no plan at all (no parcel_tool row, no lead_gen row) has a null profile status and sits on the loading spinner in the shared app, so reaches neither the search page nor the page; only an expired-and-dismissed or mid-session-lapsed person reaches it today.
   Grounded: mobile/app/(app)/_layout.tsx:239-241, :263-265; entitlements/index.ts:88; PaywallScreen.tsx:206; route.ts:77-79. Options: A build the page now for the narrow case and give the full gate to MF-49 (as task-357 is written); B wait for MF-49 entirely. Recommendation: A (the page, its strings and goldens are reusable by MF-49). UNVERIFIED on a device; the round did not open the files.
4. A mobile small page needs an archetype: STATIC is web-only (Spec 126:249), no mobile static binding exists (bindings.json:15-23); the built precedent is the semi page (LIST family, bindings.json:31).
   Options: A reuse the LIST binding family (no new component); B add a mobile STATIC binding (a new component kind: needs a named reason and a ruling). Recommendation: A, and the lane stops and brings it back if the page does not fit. UNVERIFIED by the round.

## Review round, triage
- r1-review.txt (deepseek-reasoner, review mode, one round). TRIAGE.md: 24 entries; KEPT and folded 17 (in whole or part), REJECTED 7 with file:line. The two pack-generator defects are loose ends. The round opened no file; its findings were adjudicated by opening each cited line.

## UNVERIFIED items
- The spinner for a no-row person and the reach of the page (device).
- Whether authStore.signOut resets the profile status the gate reads.
- Whether the longer placeholder clips at the narrowest width.
- The surface id (S-nnn), the capture script name and the route name in task-357 are GUESSES; no id claimed.
- The semi-question and lot-map goldens' fingerprints (assumed to cover their own content files; not opened).
- Whether lanes edit backlog/docs/increments/doc-2 (A.2 lines :31, :100).
- The round's findings: all are unverified by it; none of my recommendations is "verified by the review round".

## Commits
See the final message of the lane (the REPORT cannot hold its own sha).
