# VERDICTS: BL-TRIAGE, task-359 PANEL.TRIAGE-1 (round 2 of the Increment 1·B output panel findings)

Status line (Spec 137 rule 3): BL-TRIAGE lane · task-359 · record-only, no code change. Head: wf2/inc1b-triage at f65b64674 (newer than the seats' scope: BL-SUITEFIX2, BL-RESET and BL-R18 landed since). Every row below was opened on this head. T1..task-364 are the new fix tasks (ids filled in after creation).
Round-2 grounder per Spec 08 5.3. This was the single generic repo review round (scripts/deepseek-review.js review, one template); the lens set is being built by task-358.

Legend: TRUE / FALSE / PARTLY = the claim against the line on this head (TRUE-THEN = true at the seats' head, cite since moved or work since landed). v8 (small-pages-v8) is binding unless a later operator ruling differs (CURRENT-SEARCH.md rule, memory: newest ruling wins). "Opened" = read by me on this head; nothing was executed (no runner call). KNOWN = already on a record (cite) / NEW. Kind = DEFECT (built 1·B work does not do what its task, spec or approved design says), NOT-BUILT (owned by a later task), DESIGN (operator draft), NOISE (rejected, reason).

## Reality check
| id | verdict | line opened (quoted) | known / new | kind | owner |
|---|---|---|---|---|---|
| RC-1 | TRUE | route.ts:163 `if (access === 'parcel_tool' && body.parcel && parcelRef !== null && !hasEvaluatedOption(body.parcel)) meter = 'not_evaluated';` first branch; consumer-lookup.ts:66 `Object.values(parcel.costMenu.menu ?? {})`, :161 `costMenu: { menu: null, scalars: null }`, :62-63 "no lookup counts; the engine's scenario lines ... count once they are sent (MB-94)" | KNOWN in part: ruled "1 b 2 a" (MCBYLAWS-QUEUE.md:709, Spec 100 §3.2 :116); BL-METER REPORT.md OPERATOR item 1; test pin parcels-lookup-page.logic.test.ts:165-182 (T-B3 (7)) names "owner MB-94 c / MB-44"; task-343 line 15 names only the null page. NEW: no task carries the flip (see RC-1 note) | NOT-BUILT, owner none | NONE: task-343 loose-end line added (ownerless); blocks billing and A.6 movement |
| RC-2 | TRUE | route.ts:134-147 page built and sent; :164 `body.lotForm?.unsure === true && semi !== 'answered') meter = 'semi_pending'` only labels | KNOWN as a partial: BL-METER REPORT OPERATOR item 2 ("an unsure lot's report is free once pages exist"), task-343 line 16. The free-page hole itself is NEW | DEFECT | task-360 |
| RC-3 | TRUE | project.ts (src/lib/report-projection/project.ts):179-184 compares layer2, catalogue_sha, switchboard_sha only; seed-shas.ts:23 `interface SeedShas { catalogue_sha; switchboard_sha }`; evaluator_version is selected (read-stored.ts:30) and only copied into the lineage (project.ts:253), never compared | KNOWN as owned: task-272 ST.P2 text "compares its stamp (Layer 2 table_version, evaluator_version, settings sha)"; doc-16 P3/P4 (:32-33), :99, :102 | NOT-BUILT | task-272 (dated note added: also evaluator_version; no CURRENT settings sha source exists in seed-shas.ts) |
| RC-4 | TRUE | entitlement/route.ts:6 `Read by the search page line "N of 20 reports left"` | NEW | DEFECT (stale comment, LOW) | task-364 |
| RC sound | not re-opened | claims of soundness (left cannot be negative, dedup key, etc.) carry no defect to check | n/a | accepted, UNVERIFIED second check | none |
| RC unverified | not re-opened | needs database | n/a | UNVERIFIED | none (no DB) |

RC-1 note (special care). (a) Is "counting waits for MB-94" ruled? YES for the rule: operator 2026-11-12 "1 b 2 a" (MCBYLAWS-QUEUE.md:709; Spec 100 §3.2 dated note :116 "(1 b) The meter. A lookup counts ... only when at least one option has an evaluated value ... (hasEvaluatedOption ...)"). BL-METER recorded it as OPERATOR item 1 (REPORT.md "Billing is effectively off until MB-44 produces pages"). (b) Which task connects the served page to the meter? NONE. The pin test says "MB-94 part (c) / MB-44 change must make a hit whose page carries an evaluated option count ... and flip this pin" (parcels-lookup-page.logic.test.ts:165-168). Checked each named owner: task-121 (MB-94 c recut) description has no meter, evaluated or count text (grep of the task file: 0 hits; it recuts not_in_engine_population only, MCBYLAWS-QUEUE.md:693 note); task-123 (W) and task-285 (L.7): grep for meter|evaluated|openReport|charged|report-opens finds none in their descriptions; task-123 stage 2 lane note says only W returns null/miss (BL-W2 REPORT.md:5-6). task-343 line 15 says "tied up by: task-285, task-123" for the null page only; the second gate (evaluated option read from the legacy null menu, route.ts:163 + consumer-lookup.ts:161) is on no line. (c) So: a ruled, known state for the null page; an ORPHAN for the evaluated-option gate: even when W serves a page, hit stays not_evaluated and counted/limit_reached stay unreachable, the reports-left line stays at its start value, and the limit wall can never fire. Not an oversight in the code (it follows the ruling), an oversight in the plan. Blocks: G.6 "a hit counts one report" (doc-2:94 marks it BUILT; true only for a producer that sends costMenu lines, which is none) and the live flip (task-287). It does not block the page appearing. (d) LOAD.1 (task-266) assumed nothing about the meter: its notes (task-266 :117) speak only of the gate; its compute "no write, no read-first" (MORNING-DECISIONS.md:1057). W (task-123) assumed a miss for no current record (task-123 :58, :67, BL-W2 REPORT.md:5) and the meter "counts nothing" while page is null (task-348 :32 "the meter counts nothing (route.ts:45)" is a stale line number; the null-page case is at route.ts:165). Neither assumed the evaluated-option gate would change.

RC-3 note: stamp comparison is owned by ST.P2 (task-272, LATER, push 12) and ST.P1 (task-265) writes the stamp; McStorage doc-16 P3 (:32) and P4 (:33) require the compare "every read". Today W (task-123 stage 2) calls the freshness verdict with only the three sha parts, so a settings change cannot make a record out_of_date until ST.P2.

## Integration
| id | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|
| IN-1 | TRUE | report-page.ts:54 `if (!MAXBLD_WEB_LIVE) return null;` (MAXBLD_WEB_LIVE = false, maxbld-web.ts:19); route.ts:165 not_produced | KNOWN: task-348 D1 (OPERATOR, open); task-343 line 15; task-343 R16 note (4) | NOT-BUILT / DESIGN already on operator | task-348 (stays open) |
| IN-2 | TRUE | `grep OVERRIDE_PARAM\|lotFormOverride\|lotFormEffective` over mobile/app, src, components: no reader outside lotForm.ts; lotForm.ts:9 "the report ... applies it through `lotFormEffective`" | KNOWN as scope: semi calculation stays in 7.25 (MORNING-DECISIONS.md:796; task-319 description item (4)); the stale comment NEW | NOT-BUILT (the effect) + DEFECT (stale comment) | task-209 (7.25) dated note; comment fix in task-364 |
| IN-3 | TRUE | no src or mobile file other than the route and tests names /api/parcels/entitlement on the web | KNOWN: task-343 R17 line "web twin of the reports-left line is built ... inert" and line 9; tied to task-287 | NOT-BUILT | task-287 / task-340 |
| IN-4 | TRUE | report-page.ts:44-45 `case 'not_stored': // D2 return null;` | KNOWN: D2 is ruled (task-123 :130 "ALREADY RULED, no task"; report-page.ts:40-44 comment). MD:704 rules storage, not the screen; the screen state is the same miss as IN-1 | NOISE (same user-visible state as IN-1) | task-348 |
| IN-5 | PARTLY | route.ts:166-169 openReport runs for a q hit with a page; index.tsx:12 "`unique` opens the lot" (the app navigates at once); semi.tsx header: leaving mid-Continue spends a report | KNOWN: ruling RR-0278 "charged ... if I find the address and lot ... and a report is produced" (MORNING-DECISIONS.md:1082); one row per lot per month (task-334 AC1) so reopening the lot costs nothing | NOISE (as ruled; harmless by the per-lot-per-month row) | none |
| IN sound | not re-opened | | | accepted | none |
| IN unverified | UNVERIFIED | server vs mobile schema field by field; admin host footer links | | UNVERIFIED | none (task-268 PROOF.S) |

## User experience
| id | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|
| UX-1 | TRUE | error-mapping.ts:37 `err('REPORT_LIMIT_REACHED', ... 403`; parcelSearchMatch.ts:297 `error.status === 403` -> entitlement notice; report-presentation.json:89 "Could not load this report. Try again."; ReportBinding.tsx:373-377 Retry on `state === 'error'` | KNOWN: task-343 R17 line (limit wall NOT built, tied up by NONE) and R18 line (the app cannot tell the two 403s apart); design report-limit.html:286-310 | NOT-BUILT, owner none | NONE: task-343 line added (still ownerless; cannot fire today because RC-1 means nothing counts) |
| UX-2 | PARTLY | [parcelId].tsx:34 + ReportBinding.tsx:400-401 miss text; (a) no address/reason: not-built load-failure page task-317; (b) unsure lot asks then same line: result of null page (IN-1); (c) flash: redirect is in a useEffect (:28-33) after the first settled render that already shows `miss` | (a)(b) KNOWN: task-348 (miss page for every lot until launch), task-317; (c) NEW | (a)(b) NOT-BUILT; (c) DEFECT | (a) task-317 dated note; (b) task-348; (c) task-360 |
| UX-3 | PARTLY | SemiQuestionBinding.tsx:50-65 retry only in `s.errors.unexpected`; semiQuestion.ts:46-50 `if (error != null) state = 'error'` so answers = []; BUT the approved mock draws 429 and 403 as banner-only states (semi-question.html:314-330 "no retry" for schema drift only; 429/403 draw no button) | the page-level states are approved (RR-0308/0309); a FAILED CONTINUE is not drawn: NEW | DESIGN | draft D-1 below |
| UX-4 | TRUE | `grep busy` in SemiQuestionBinding.tsx and semiQuestion.ts: 0 hits; approved mock semi-question.html:130 `.btn.p[aria-busy="true"]` | NEW | DEFECT | task-361 |
| UX-5 | PARTLY | semi-question.tsx: "Left the page while the fetch ran ... do not open the report behind the user's back." (counts, no storeLookup) | as IN-5: the lot is already counted for the month, so the person reopens it and sees it free (dedup) | NOISE | none |
| UX-6 | TRUE | maxbldHelp.ts:19 `void Linking.openURL(helpUrl(topic, q))`; v8 search.html:235 "in-app browser sheet (B10): Help, Terms, Privacy open the web page with Done"; expo-web-browser ~15.0.11 is already a dependency and used (useSubscribeCheckout.ts:61) | topics lot_match/address_match vs v8 wrong-lot KNOWN (task-343 line 7, GR-5 orchestrator reading); the sheet vs browser NEW (BL-C12 TRIAGE.md:20 rejected "resume-after-help" as existing openHelp behaviour) | DEFECT vs approved design | task-362 |
| UX-7 | PARTLY | (a) FALSE: v8 draws the bare link in intersection, unlinked and many-lots states (choose-lot-states.html:267, :278, :289); LotMapBinding.tsx:225-231 matches. (b) TRUE: `grep "Pick a lot on the map"` over mobile/src, mobile/app, scripts/surfaces: 0 hits; v8 choose-lot.html:278 draws it; doc-2:63 marks C.11 BUILT | (a) n/a; (b) NEW | (a) NOISE; (b) DEFECT | task-362 |
| UX-8 | PARTLY | SearchBinding.tsx:231-238 order header, pill, reportsLeft, legal, chips, notices; v8 search.html:305-306 notice then line (ruled: keep the line's fixed slot, RR-0314 / task-352 Q3 A); v8 :320-323 recents then legal | the line/notice order KNOWN and RULED (RR-0314 "yes." answers task-352 Q3, line vs notice only); legal above recents and notice below legal: NEW, unratified | DESIGN | draft D-2 below |

## Compliance
| id | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|
| CO-1 | TRUE-THEN | task-351 BUILT; docs/reports/lanes/2026-11-19/BL-RESET/ | KNOWN: task-351; task-343 R17 line; task-343 note on 351 (3 unproven parts) | NOT-BUILT (in build) | task-351 |
| CO-2 | TRUE | task-357 exists (LATER), MORNING-DECISIONS.md:1247 open conflict (App Store 3.1.1) | KNOWN | NOT-BUILT | task-357 |
| CO-3 | TRUE | task-356 exists (LATER); task-343 R18 line | KNOWN | NOT-BUILT | task-356 |
| CO-S1 | FALSE as a gap | BL-FOOTER REPORT.md:14 "The FE-07 parity lock now names the two ruled differences as exact diff sets"; ruled RR-0273, MORNING-DECISIONS.md:1066 (mobile keeps its own binding); footer keys in the shared content file are a by-product | KNOWN, RULED | NOISE | none |
| CO-S2 | TRUE | no web lot-map binding (W5 deferred ONE-35 b) | KNOWN: task-343 line 17 (task-14, task-287) | NOT-BUILT | task-14 / task-287 |
| CO-S3 | PARTLY | proof-slices.json: row design-fit `"notbuilt": { "blockedBy": ["task-345", "task-67"] }` is correct (RR-0306 = the proof tool does not WAIT; it prints the row not built, and the check itself is still unbuilt); report-opens `blockedBy: ["task-123"]`: task-123 is BUILT (stage 1/2 W) but W returns null until the live switch, so the real blocker is task-287 / task-348 | design-fit half KNOWN (RR-0306); report-opens label NEW | design-fit half NOISE; blocker label DEFECT (record) | task-363 |
| CO unverified | RESOLVED PARTLY | client-asserted flag as meter gate: RR-0278 (MORNING-DECISIONS.md:1082) rules only "charged when produced", not the flag; the flag is the semi stage-2 design (route.ts:155-157 cites RR-0278). With task-360 the flag can only make a lot count | | | task-360 |

## Grounding and context (the orchestrator's readings)
| id | verdict | line opened | action |
|---|---|---|---|
| GR-1 | TRUE | Spec 126:351 "touch-target floor (44×44)"; MORNING-DECISIONS.md:1227-1233 orchestrator decision, Option B open | KNOWN; stays open for the operator; no new draft |
| GR-2 | PARTLY confirmed | MF-85 row note .cursor/MCFRONTEND-QUEUE.md:622 says "Filed under this row by the orchestrator's reading ... not by an operator ruling (flagged for the operator)"; task-121 :102 says "Filed under MF-85 by orchestrator reading (not an operator ruling)". MF-48 note :371 says "This row is used as the owner of those paths because its Stage B owns the lookup page" and quotes operator words RR-0178 and RR-0301 but does NOT say it is an orchestrator reading | one line on task-343 (MF-48 note lacks the label; queue files are not edited by this lane) |
| GR-3 | TRUE | .cursor/MCBYLAWS-QUEUE.md:785-786 ruling does not say which switch gates W | task-348 stays OPERATOR (status checked: OPERATOR) ; dated note on task-348 not needed (text already states it, :34) |
| GR-4 | accepted | no proof-tool location rule found (grep MCBYLAWS-QUEUE and MORNING-DECISIONS "proof tool": none) | none |
| GR-5 | TRUE | task-343 line 7 | KNOWN |
| GR-6 | TRUE | task-266 :117 cites ":704-705, :1057, :1061" for "a miss in W"; :704 is the ruling (never served and recomputed; no record for lots nobody opened); the word "miss" for W is in task-123 :58/:67 and BL-W2 REPORT.md:5 | dated note on task-266 with the right cites |

## Security
| id | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|
| SE-1 | TRUE | as RC-2; plus the report screen's own lookup sends only parcelId (useParcelLookup.ts:86 queryKey and queryFn: fetchParcelLookup({ parcelId })) so any refetch of an unsure lot after answering gets page + semi_pending, uncounted | NEW (hole larger than the seat said; staleTime 60_000 at useParcelLookup.ts:89: it also hits a normal user via `?semi=answered` or a 60 s stale refetch) | DEFECT | task-360 |
| SE-2 | TRUE | lotForm.ts:28 `semiParam !== SEMI_ANSWERED`; [parcelId].tsx:21 reads route param | NEW; same fix as SE-1 (forward the param so a deep link counts instead of skipping) | DEFECT | task-360 |
| SE sound / SE unverified | not re-opened | | | accepted / UNVERIFIED | none |

## Code reviewer
| id | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|
| CR-1 | TRUE (code); impact UNVERIFIED | semi-question.tsx:32-33 `const mountedRef = useRef(true); useEffect(() => () => { mountedRef.current = false; }, []);` (never set true in the body); `grep StrictMode` over mobile/app, mobile/src, app.json: 0 hits, so production is not hit; Fast Refresh and dev StrictMode would be | NEW | DEFECT (dev-time) | task-361 |
| CR-2 | PARTLY | semi-question.tsx catch sets submitError only; schema errors are captured in fetchParcelLookup (useParcelLookup.ts:45 Sentry.captureException); user-recoverable classes are not captured by house pattern (usePortalSession.ts:66-67) | | NOISE | none |
| CR-3 | TRUE | schemas.ts:446 `status: z.string().nullable()`; reportsUsed, reportsLimitReached unread | NEW, display-only, no failure path | NOISE (record only) | task-343 line |
| CR-4 | FALSE | index.tsx:57-60 `refetchEntitlement({ cancelRefetch: false })` does not start a second fetch while one is in flight | | NOISE | none |
| CR-5 | TRUE | web SearchBinding.tsx:144 `... as WebNode` | NEW, LOW | NOISE (record only) | task-343 line |
| CR-6 | PARTLY | read-stored.ts:48-53 four sequential `db.query` on the pool, no transaction; header says "Moved here unchanged from stored-page.ts (MB-93)"; a torn read can only produce out_of_date (the verdict compares rows to the stamp) = a miss, fail closed | | NOISE (record only) | task-343 line |
| CR-7 | TRUE | proof-slice.mjs: `r?.suite !== undefined && !(Array.isArray(r.suite.suite_files) ...)` with `suite: null` reads `null.suite_files` (TypeError); `timeoutMs` is in KEYS (:24) and never type-checked; `io.mkdir(outDir)` (main) unguarded. Not run (rule: no runner call): the TypeError is read, not executed | NEW | DEFECT | task-363 |

## Regression guardian
| id | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|
| RG-1 | FALSE (covered) | report-page.ui.test.tsx:42 skips role copyright (RR-0273), but site-footer.ui.test.tsx:72-73 `describe('(c) web report'` mounts ReportPage with the footer and its header (:8) says "the copyright (G4) once" | KNOWN (dated reason) | NOISE (round-1 review r1 HIGH, KEPT as a correction) | none (dropped from task-364) |
| RG-2 | PARTLY | as CO unverified: the hold became a client flag by the lane's design citing RR-0278 (not ruled as a flag); after task-360 it can only make a lot count | NEW wording | DEFECT closed by task-360 | task-360 |
| RG-3 | TRUE | register-locks-resolve.infra.test.ts:30 `FLIP_PENDING = ['FE-39']` dated, shrink-only list | KNOWN (dated) | NOISE | none |
| RG-4 | TRUE | surface-conformance.logic.test.ts C-9m (list entry 48 px) | KNOWN: MORNING-DECISIONS.md:1227 orchestrator decision | NOISE (the open choice is GR-1) | none |
| RG sound | not re-opened | | | accepted | none |

## Counts
Finding ids with their own number: RC 4, IN 5, UX 8, CO 3 + CO-S1..S3 (3) , GR 6, SE 2, CR 7, RG 4 = 42; plus the six "sound/unverified" group lines (not defects) = 48 lines. TRUE or PARTLY-true: see REPORT.md table.

## Stale cites found on the way (records, not code)
task-343 line 15, task-348 :32 and the BL-METER report cite report-page.ts:23-26 and route.ts:45/:161 for the null page and the meter; on this head the switch line is report-page.ts:54 and the meter branch is route.ts:163-171. Not a defect; listed so the next reader opens the right line.

## Lens findings (BL-LENSES run on commit 9fea46277, outputs ~/Buildo-scratch/lanes-20261119/inc1b/lenses/lens-run/*.txt; opened on head f65b64674; NOT in repo review round r1, which started before they arrived)
| id | seat finding | verdict | line opened | known / new | kind | owner |
|---|---|---|---|---|---|---|
| LX-C1 | Try again after a failed Continue only clears the error | TRUE | semi-question.tsx retry: `if (submitError != null) setSubmitError(null); else void refetch();`; mock state 4 draws "one Try again button" without saying it resends | = UX-3 | DESIGN | draft D-1 (extended) |
| LX-C2 | the generic push runs the counted lookup | FALSE (premise) | SemiQuestionBinding.tsx:99 is the only `action: 'push'` (back is :39 `action: 'back'`); route is s.route, set only after an answer | | NOISE | none |
| LX-C3 | heading width not in the diff | NOISE | cannot-see finding on a one-file paste | | NOISE | none |
| LX-C4 | 48 px and 44 floor not checkable | NOISE | cannot-see; the choice is GR-1 (open, MORNING-DECISIONS.md:1227) | KNOWN | NOISE | none |
| LX-C5 | header "makes no extra request" stale | TRUE | semi-question.tsx:9 | NEW | DEFECT (NIT) | task-364 |
| LX-R1 / LX-E3 | push gate | = LX-C2 FALSE | | | NOISE | none |
| LX-R2 / LX-E4 | unguarded id | TRUE | continueToReport passes `parcelId: id`, id may be ''; hook is guarded `id \|\| undefined` | NEW | DEFECT | task-361 |
| LX-R3 | `submitError ?? error` type may not compile | FALSE (premise) | commit landed through the typecheck hook; not re-run here: UNVERIFIED | | NOISE | none |
| LX-R4 / LX-E5 | failure not logged | PARTLY | schema failures captured (useParcelLookup.ts:45); user-recoverable classes not captured by house pattern (usePortalSession.ts:66-67) | = CR-2 | NOISE | none |
| LX-U1 | no busy state on Continue | TRUE | = UX-4; the mock's quiet "Searching" line (semi-question.html:289-293) is the initial-load state; Continue's drawn state is `.btn.p[aria-busy]` (:130) | KNOWN as UX-4 | DEFECT | task-361 |
| LX-U2 / LX-E2 | Back then a late fetch lands on the report; no unmount guard | FALSE on head | semi-question.tsx `if (!mountedRef.current) return;` before storeLookup and replace; the guard itself breaks in dev (CR-1) | guard exists; CR-1 NEW | DEFECT only via CR-1 | task-361 |
| LX-U3 | Try again resends nothing | = LX-C1 | | | DESIGN | D-1 |
| LX-E1 | no timeout, latch can stick | TRUE (code); fetchWithAuth bound UNVERIFIED | no AbortController or signal in the semi page; grep timeout in mobile/src/lib found nothing relevant | NEW | DEFECT | task-361 |
| LX-E6 | finally re-arms the latch on success | PARTLY | screen is replaced after success; count is one row per lot per month | | NOISE | none |
| LX-S1 | semi=answered is client-set and gates the count | PARTLY | the flag can only make a lot count against the caller's own allowance; once task-360 lands, skipping the question gains nothing; a stored server answer is GAP.12 (task-213, task-343 line 16) | known (RG-2, SE-1) | NOISE after task-360 | task-360 |
| LX-S2 | per-lot-month idempotency should be stated and tested | TRUE as a wish | BL-METER REPORT: one insert keyed on the lot; test "a second report ... counts nothing more" | KNOWN | NOISE | none |
