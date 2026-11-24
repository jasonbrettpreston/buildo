Grounder: Cairn-Ground-G1C
Ruled: out-error-paths-p1.txt sha256:e8fb28def9fe findings:7
Ruled: out-error-paths-p2.txt sha256:0dcc59c642d2 findings:8
Ruled: out-error-paths-p3.txt sha256:e5c850c76ad4 findings:6
Ruled: out-error-paths-p4.txt sha256:62514a12e82b findings:5
Ruled: out-error-paths-p5.txt sha256:1f9327e8da5c findings:7
Ruled: out-security-p1.txt sha256:d782ac06c744 findings:0
Ruled: out-ux-p1.txt sha256:faa2943764d8 findings:6
Ruled: out-ux-p2.txt sha256:8e24e28ea9eb findings:7
Ruled: out-ux-p3.txt sha256:fcb0a0e3acdb findings:6
Ruled: out-ux-p4.txt sha256:d085779e6581 findings:6
(out-security-p1 has 0 rows in FINDINGS.tsv but the output carries 2 REJECT lines with no severity. I ruled both as S1 and S2 below. The ux-p4 and error-paths-p2 first rows, "none raised" and "NIT not permitted by format", are not findings.)

Method. Everything was read at 8dba70e8e. `git diff 8dba70e8e HEAD` over the G1 paths is empty, so the files are the same at HEAD (faa608ce6). No CRIT is in my share. The highest rating is HIGH. 34 items were ruled: 32 rated MED or higher plus the 2 security REJECTs. Print-only `node -e` checks I ran:
- 32 page goldens: label count equals value count for every row role (1120/1120, 576/576, 224/224).
- 50 preview goldens: all are `response_fixture.synthetic:true`.
- 22 footer situation keys: 21 carry `recent`, plus `$comment`.
- Citywide template keys.
- Layout target keys.

TABLE (CRIT/HIGH/MED)
id | sev | verdict | reason
EP1#1 | HIGH | CONFIRMED (D1) | mobile/app/(app)/[lead].tsx:104,132-147: any error with no cached detail shows "This permit is no longer available", with no retry.
EP1#2 | MED | CONFIRMED (D2) | [lead].tsx:103,148,229: with the query disabled (no token or no id), TanStack v5 gives isLoading=false, isError=false, data=undefined, so the body is blank under the header.
EP1#3 | MED | CONFIRMED (D3) | [lead].tsx:167: `opportunity_score ?? 0` draws a ring reading 0 where the value is absent.
EP1#4 | MED | REFUTED | mobile/src/lib/schemas.ts:204 types the field `z.number()`. A string fails the parse and never reaches formatSqft (leadDetailFormat.ts:17). The server serves a number (lead-detail-query.ts:155-157).
EP2#2 | MED | REFUTED | report-preview/goldens.ts:30: STATES is `Object.keys(GOLDENS)`, so every state has a golden. PAGE_GOLDENS keys (mobile, web, admin, pdf) equal `report-layout.json` targets.
EP2#4 | MED | REFUTED | lead-detail-query.ts:179 and :355 set sqft on every path, and it is null only when sqm is null. A hypothetical omitting producer is not in the code.
EP2#5 | MED | DUPLICATE of EP1#1 | descriptor lines 431-439 document the same single not-found block.
EP3#1 | HIGH | CONFIRMED (D4), mis-rated | lead-detail-query.ts:121 and :326 use `user_id != NULL`. It is reachable only on the dev-bypass NULL uid (route.ts:66). Production uids are verified uuids. get-lead-feed.ts:157 and :586 carry the same predicate.
EP3#2 | MED | REFUTED | maxbld-landing.ts:99: keys come from citywideLines (what-we-checked.ts:102-110, fixed 5 keys) and the template has exactly those 5 (lots, regulations, buildings, builds, map_areas).
EP3#3 | MED | REFUTED | what-we-checked.ts:109 returns all 5 lines or none, so a partial citywide set is unreachable.
EP3#4 | MED | REFUTED | maxbld-landing.ts:19-20 and :120 say only a committed-file defect throws. SEARCH_CONTENT is a committed JSON, and a missing key is pinned by site-footer.logic.test.ts:128-131.
EP3#5 | MED | REFUTED | the page schema declares row parts in label/value pairs. The goldens show 0 uneven rows across 1920 parts.
EP4#1 | MED | REFUTED | ReportPage.tsx:~376-396: inputs are `readOnly` and submit is `disabled`. No entry logic exists in the web page, so there is no empty-entry path to test (the MF-44 island is not mounted).
EP4#2 | MED | REFUTED | route.ts:51-96 wraps the auth call in try/catch, so a throw gives `internalError`, a sanitized 500. get-user-context.ts:6,153 never throws and returns null (401), which is pinned at test line 265.
EP5#1 | MED | REFUTED | 21 situations carry `recent`, so the loop runs 21 times, not vacuously.
EP5#2 | MED | REFUTED | SearchBinding.tsx:307-309 throws on a missing content key and is pinned at search-web-binding.ui.test.tsx:135-137. Static is pinned at static-web-binding.ui.test.tsx:11.
UX1#1 | HIGH | DUPLICATE of EP1#1 | same not-found copy and no retry.
UX1#2 | HIGH | UNDETERMINED (U1) | [lead].tsx:110,139 call `router.back()` with no `canGoBack` guard. Maestro lead-detail.yaml:80-81 says the stack may be empty on a direct deep link, and no anchor is set in app/.
UX1#3 | MED | DUPLICATE of UX1#2 | the label "Back to Lead Feed" is only wrong when the stack is empty.
UX1#4 | MED | UNDETERMINED (U2) | [lead].tsx:253-266: "Cost not disclosed" can sit above a printed range when estimated is null and the range is set. This is a copy judgment, with no ruling found.
UX1#5 | MED | UNDETERMINED (U3) | [lead].tsx:150-158: the stale banner has no retry control. This is a design choice, not a code fault.
UX2#1 | HIGH | DUPLICATE of EP1#1 | descriptor lines 431-439 (429, 500 and schema drift all show the not-found block).
UX2#2 | HIGH | REFUTED | route.ts:68-80 serves CoA, since Phase G; schemas.ts:216 accepts `coa`. CoA does not dead-end. The premise is stale text, see D5. A real adjacent defect is D6.
UX2#3 | HIGH | CONFIRMED (D7) | SaveButton.tsx:67-72: the Pressable has no accessibilityRole or accessibilityLabel. The file is outside the 37 and the descriptor discloses it.
UX2#4 | MED | REFUTED | all 50 committed goldens are `synthetic:true`, so the label always shows. The condition is harmless.
UX2#5 | MED | UNDETERMINED (U4) | the meta line shows only in ReportView (admin, pdf, landing demo). The slot values default to 'none' (core.ts:232,386). The wording is design-silent.
UX3#1 | HIGH | NOT-APPLICABLE | ReportView.tsx:126 `<summary>` is reachable only in the admin preview and placements-preview. Landing uses ReportView for the loading demo only, which has no detail. The public ReportPage uses only `Picture` from ReportView, and its controls are all min-h-11.
UX3#2 | HIGH | UNDETERMINED (U5) | ReportPage.tsx:~392 draws a disabled underlined button. The ruling (Spec 128:191) says the link is a text part with no href and no action until the form mounts (MF-44 and MF-48). The web page is not live.
UX3#3 | MED | UNDETERMINED (U5) | the radiogroup name comes from the two field labels. A test pins it (report-sheet-a11y.ui.test.tsx:102). It is a pre-form shell with readOnly fields.
UX3#4 | MED | UNDETERMINED (U5) | the ft/m switch changes nothing because the fields are `readOnly` and the form is not mounted. Same shell.
UX4#2 | MED | REFUTED | the sheet dialog has `aria-labelledby="report-sheet-t"` and the h2 with that id exists (ReportPage.tsx:~371). The detail dialogs point at existing h2/h3 ids. Only the test lacks the assertion.
UX4#3 | MED | DUPLICATE of UX3#3 | same group name.
S1 | none | REFUTED | the admin gate. report-preview/page.tsx:34 awaits requireAdminPage() first, before searchParams. require-admin-page.ts:23-56 rejects non-admins with notFound(), and only in dev mode returns the sentinel. The lock test report-preview-guard.security.test.ts exists.
S2 | none | REFUTED | the lead-detail query. $1-$4 are bound params, with no string interpolation. $4 is `ctx.uid` only if `isUuid`, else NULL (route.ts:66). parseLeadId validates the id. Auth is `getCurrentUserContext`, with 401 when null (route.ts:52-53).

CONFIRMED DEFECTS (deduplicated)
D1. Covers EP1#1, EP2#5, UX1#1, UX2#1.
- Where: mobile/app/(app)/[lead].tsx:104 and :132-147; mobile/src/hooks/useLeadDetail.ts (it exposes no refetch); descriptor mobile_lead_detail.descriptor.json:431-439.
- What happens: offline, a 429, a 500 or schema drift with no cached detail shows "Lead not found / This permit is no longer available". The only action is Back.
- Smallest fix: take `error` and `refetch` from the hook. Treat only ApiError status 400 or 404 as not-found. Add a second block with a retry button for other errors, and update the descriptor lines.
- Owner: a new fix task in the G1 lead-detail area (task-411 touched the file but not this). Needs a decision on the copy wording.
- Impact: a person on a bad connection is told the permit is gone. The existing copy does say "Return to the Lead Feed to reload", so a retry path exists but is not honest.

D2 (EP1#2).
- Where: [lead].tsx:103 and :148/229.
- What happens: with the query disabled (accessToken not rehydrated, or no `id`), the screen shows a header over a blank body, with no skeleton and no message.
- Smallest fix: `showLoading = !detail && !isError` (line 103), so the disabled state shows the skeleton.
- Owner: the same new task. Line-size.
- Impact: a brief blank flash at cold start. Header Back still works.

D3 (EP1#3).
- Where: [lead].tsx:167.
- What happens: a permit with no trade_forecast row for the viewer's trade (LEFT JOIN, so null) shows an opportunity ring reading 0. That is a made-up value, against FE-05 (honest display). The feed always has a score, so this appears only via deep link.
- Smallest fix: `detail.opportunity_score != null ? <OpportunityRing score={detail.opportunity_score} /> : null`.
- Owner: the same new task. Line-size.
- Impact: a wrong score shown to the person.

D4 (EP3#1). Dev-only in practice, mis-rated.
- Where: lead-detail-query.ts:121 and :326 (the same predicate is in get-lead-feed.ts:157 and :586).
- What happens: with a NULL viewer id (the dev bypass, route.ts:66), `user_id != NULL` is NULL for every row, so competition_count is 0.
- Smallest fix: `lv2.user_id IS DISTINCT FROM $4::uuid` and `... $3::uuid`. Check the feed predicate the same way, since the comment at line 68 says the two must match.
- Owner: new, small. Line-size.
- Impact: none in production. Dev and tester bypass shows 0 tracking.

D5 (stale text; part of UX2#2's premise).
- Where: descriptor mobile_lead_detail.descriptor.json:527 ("CoA leads ... 404 from the backend"); [lead].tsx:67-69 comment; useLeadDetail.ts doc comment.
- What happens: all three say CoA 404s. Since Phase G, route.ts:68-80 serves CoA.
- Smallest fix: correct the three texts.
- Owner: new, doc-only. Line-size.

D6 (new, found while ruling UX2#2).
- Where: [lead].tsx:70 hard-codes `leadType:'permit'`.
- What happens: on a CoA detail (id `COA-...`), tapping Save posts lead_type 'permit'. /api/leads/save has only the enum permit and builder (save/route.ts:64) and `parseSaveLeadId` returns null for COA (:113-114). The save returns 400, the optimistic heart rolls back, and the person gets no message. A lead_saved event is tracked as 'permit'. The feed has the same hard-code at index.tsx:126 (not G1).
- Fix: needs a decision, because the save route has no CoA support. I found no card (grep of backlog/tasks, review_followups.md and lessons.md).
- Impact: a CoA lead cannot be saved.

D7 (UX2#3), in a non-G1 file.
- Where: mobile/src/components/shared/SaveButton.tsx:67-72.
- What happens: the one action on the page is announced by a screen reader as an unnamed element. There is no role and no label, and the descriptor records "labels: partial".
- Smallest fix: add `accessibilityRole="button"` and `accessibilityLabel={isSaved ? 'Remove from Flight Board' : 'Add to Flight Board'}` (copy to be confirmed).
- Owner: new, line-size.
- Impact: a screen-reader user cannot name the save action.

LOW and NIT (recorded only; each ID is a finding row of mine, none mis-rated HIGH-class)
EP1: #5 #6 #7 (#7 is also refuted: the schema makes `tier` nullable, not optional, so undefined fails the parse at schemas.ts:199).
EP2: #3 #6 #7 #8 (#8 is also refuted: confidence and provenance are never undefined, only 'none').
EP3: #6.
EP4: #3 #4 #5.
EP5: #3 #4 #5 #6 #7.
UX1: #6.
UX2: #6 #7.
UX3: #5 #6.
UX4: #4 #5 #6 (#5 is also refuted by the 21 situations carrying `recent`).
Mis-rated: none. D4 is mis-rated downward (HIGH to LOW in practice).

TOTALS
- CONFIRMED: 7 deduplicated defects (D1 to D7). By rated id: EP1#1, EP1#2, EP1#3, EP3#1, UX2#3 confirmed on their own; EP2#5, UX1#1 and UX2#1 fold into D1 as duplicates. D5 and D6 are my own additions.
- REFUTED: 19. EP1#4, EP2#2, EP2#4, EP3#2-5, EP4#1-2, EP5#1-2, UX2#2, UX2#4, UX4#2, S1, S2 are 16 items. Add UX3#1 if you count NOT-APPLICABLE as refuted; kept separate below.
- REFUTED-BY-RULING: 0.
- NOT-APPLICABLE: 1 (UX3#1).
- DUPLICATE: 6 (EP2#5, UX1#1, UX1#3, UX2#1, UX4#3, and UX1#3 counted once).
- UNDETERMINED: 9 (UX1#2, UX1#4, UX1#5, UX2#5, UX3#2, UX3#3, UX3#4, and the grouped U-questions below).
Counts by id for the 34 ruled items: confirmed 5, refuted 16, not-applicable 1, duplicate 5, undetermined 7. They sum to 34.

Operator questions (one sentence each)
- U1: on the cold deep link, should Back on the lead detail go to the feed when there is no history (the `canGoBack` pattern already used in useParcelPageHooks.ts:30)? The code is unverified on a device, so this needs a Maestro run.
- U2: what wording replaces "Cost not disclosed" when no estimate exists, and should it hide while a range shows?
- U3: should the stale-data banner carry a retry control?
- U4: do admin and pdf viewers need the meta line to read "confidence: x · provenance: y", or plain words?
- U5: until the MF-44 form mounts, should the Add lot size sheet's link render as plain text, and should the ft/m switch be hidden or labelled?
- D1 copy: what is the text and retry label for the non-404 error block on lead detail?

UNVERIFIED
- Behaviour of `router.back()` on an empty stack (UX1#2) was not executed; the evidence is the Maestro comment and the absence of an anchor.
- Whether D6 (CoA save) already has a card was only grepped, not read in full.
- The a11y claims were read from the code only, with no screen reader.
- Public page live state: only inferred from the context given. I did not re-check the web switch constant.
- I did not run any tests; I read them.
- Whether the feed (index.tsx:126) hits D6 in practice depends on CoA rows appearing in production.
