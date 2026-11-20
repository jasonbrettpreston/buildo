Grounder: BL-GROUND
Lane: BL-COMPLY3
Task: task-368 (COMPLY.4, second job) · pushed tip 3a36e8b26 · findings: docs/reports/lanes/2026-11-20/BL-COMPLY3/FINDINGS-2.md (585, F-492 to F-1076; my count of the file is 1 CRIT and 153 HIGH = 154 ids, where the coordinator brief says 152 HIGH; Specs 126, 127, 128 and the full Spec 135 rows)
Status line (Spec 137 rule 3): BL-GROUND lane · task-368 · verdicts only: no code fixed, no task created.

Method: as GROUNDER.md (the first job). Rebased on wf2/board first (8a6ba098c), `backlog task view task-368` reads (RUNNING). Every verdict opened the pushed tip (read-only `git archive` copy under the lane dir, `git show`, `git grep`; my worktree src, mobile and scripts equal the tip). Rules were quoted from their source spec: Spec 126 (docs/specs/02-web-admin/126_maxbld_surface_standard.md), 127 (127_surface_conversion_procedure.md), 128 (128_surface_standard_policy.md), 135 (135_mcfrontend_decisions_register.md), and the rulings from ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md and plan-gen/rulings-register.json. Read-only gate runs added to gates/: node scripts/surfaces/surface-validate.mjs --check (exit 0: S-gen, S-golden, S-parity, binding, closed-status, S-desc, S-screen 17 surfaces and 100 goldens, S-sbind 426 strings all ok), emit-mobile-surfaces --check (ok), generate-surface-handbook --check (up to date), and the first job's gates unchanged.

## A. Struck mechanically: ids that match a first-job verdict (step 1)
- = D3 (stale spec and descriptor text, CONFIRMED): F-497 F-533 F-743 F-798 F-879 F-910 F-958 F-963 F-980 F-1056 (the "six fields" family; 10 ids). New members added to D3 below: F-504 F-593 F-657 F-668 F-908.
- = R5 (C-9m is per node, REJECTED enforced; the 48 px): F-493 F-525 F-603 F-679 F-712 F-907 F-957 F-602 F-678 F-801 F-1028 (11 ids).
- = C4 (Help sheet against Linking.openURL, CONFLICT): F-733 F-738 (F-769 in the sample).
- = R2 (the cited ruling exists, REJECTED ruling): F-584 F-623 F-624 F-635 F-661 F-662 F-686 F-707 F-742 F-827 F-1002 F-1010 F-1022 F-719 F-731 F-732 F-885 (17 ids).
- = R3 (the test or golden exists at the tip, REJECTED enforced): 40 ids, listed under S7 below.
- The 'reads 9 tables' family (12 ids) and the 'no producer for the seventh key' family (10 ids) are new groups R9 and R10 (not in the first job): both rejected on opened code.

## B. The missing-ruling findings (step 2)
Every "no pasted clause or ruling authorises" finding was resolved against the record. Opened and found: RR-0278 (report meter on production, MORNING-DECISIONS.md:1082; backlog/decisions/decision-81), RR-0307 (A.6, :1182), RR-0309 (semi mock approved, :1199), RR-0310 (reset date served in Toronto time, :1207), RR-0313 and RR-0314 (placeholder and notice, :1216, :1223), RR-0270 (footer once, shared component, :1061, :1066), RR-0271 (LOAD.1 compute half now, :1061), C.12 as its own task (:796) with a placeholder address (:1155), task-323 (semi page, mock and link only, :1041), K2 (:82-83). The task texts exist in backlog/tasks (task-319, 320, 351, 352, 360, 361, 362). Result: all resolve; the one place a ruling is NOT landed is in the specs (D3), and the one place the ruling text and the code differ is C5.

## C. The three you named
- F-904 (CRIT, Spec 128 section 4 step 2 "A different party adjudicates - never the pass that discovered it", 128:125): REJECTED. The 48 px was found by lane BL-SUITEFIX2 (task-353) as a red C-9m case and adjudicated by the orchestrator at MORNING-DECISIONS.md:1227-1232 ("Decision (orchestrator, NOT an operator ruling; overturn in the morning if wrong): Option A"), a different party; the operator approved the 48 px drawing itself (RR-0309). The real gap is the log form (D13: no D-nn id, not in DECISIONS-PREAPPROVED-20261108.md, which ends at D-84), and that the operator has not confirmed it. The both-directions lock exists (surface-conformance.logic.test.ts:905-925).
- F-556 (the entitlement whitelist and the seventh key): REJECTED as a missing-producer claim (R10); what is true is D3 prose drift. The strict schema has seven keys (src/app/api/parcels/entitlement/types.ts:11-19); the producer is src/lib/entitlements/index.ts:667 (via route.ts:39-40); the descriptor field_whitelist lists it (descriptor :83-84); the descriptor prose says six (:7).
- Spec 127 procedure gates (a conversion step skipped): none found. Findings F-799 F-806 F-835 F-836 F-842 F-848 F-849 F-850 F-852 F-856 F-857 F-858 F-863 F-864 F-865 F-1030 F-1046 claim a missing golden pair, registry row, owns.components entry or cutover step; surface-validate --check (above) passes S-golden, S-desc and S-screen, the golden stems exist (reports_left.mobile.json and reports_left.web.json), and the surfaces touched were converted before 1·B (S-desc "converted 17"). UNVERIFIED: that Spec 127 section 4 "Unowned components" counts a .ts module such as footerNode.ts (the generated registry's own unowned list, docs/reports/generated/127-surface-registry.md:9906, is a pre-existing 14 files and does not name it).

## D. Verdicts, CRIT and HIGH (154 ids, grouped)

Line form: `F-nnn [severity] verdict`; the reason is stated once per group.

### D13: The 48 px Button decision was logged without a D-nn id in the pre-approval log (CONFIRMED, docs/operator)
Reason (ids F-492 F-906 F-995): rule: Spec 126 0b item 7 (126:78) "The orchestrator takes such a decision only when all six hold, each with its evidence, and logs it with a D-nn id in the dated pre-approval log (`~/Buildo-scratch/DECISIONS-PREAPPROVED-20261108.md`)"; FE-02 note "pre-approved decisions logged and confirmed" (135:24); code: scripts/surfaces/_schema/bindings.json:2 note "orchestrator decision under the pre-approved criteria, MORNING-DECISIONS.md:1227 (not an operator ruling)"; the decision is logged at MORNING-DECISIONS.md:1227-1232 (six criteria, grounded) but with no D-nn id, and DECISIONS-PREAPPROVED-20261108.md ends at D-84 (2026-11-14). MORNING-DECISIONS.md:1225 says decisions made while the operator is away are logged there for the morning, so the substance is observable; the form is not the rule's. The option B (44 px semi buttons) is left open to the operator at :1232. Built by task-353 (SUITE.FIX-2).
- F-492 [HIGH] CONFIRMED
- F-906 [HIGH] CONFIRMED
- F-995 [HIGH] CONFIRMED

### D14: Phone tunables typed in code: the 60 s Continue wait and the entitlement stale time (CONFIRMED)
Reason (ids F-548 F-832 F-896 F-897 F-926): rule: Spec 126 P4 (126:189) "All tunables are data; zero thresholds in `src/`" and Spec 128 Rule 3 (128:30) "every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an `on_invalid` posture"; code: mobile/src/lib/semiQuestion.ts:16-17 `SEMI_CONTINUE_WAIT_MS = 60_000` (comment "a timeframe; operator item in the lane report", so the value is also unadjudicated: Spec 128 4.2 (128:125) "A different party adjudicates - never the pass that discovered it") and mobile/src/hooks/useParcelLookup.ts:137 `staleTime: 0` (:74 and :98 `staleTime: 60_000` are older). The pattern the rule asks for exists: mobile/src/components/surfaces/SearchBinding.tsx:36 `SEARCH_DEBOUNCE_MS = SEARCH_SLICE.config.debounce_ms`. CORRECTS first report reading (b): core.8 does not bind the phone, but Spec 126 P4 and Spec 128 Rule 3 do, by name (stale time, timeout); Spec 126 and 128 were not in the first pass packs. Built by task-361 (wait) and task-320 (stale time).
- F-548 [HIGH] CONFIRMED
- F-832 [HIGH] CONFIRMED
- F-896 [HIGH] CONFIRMED
- F-897 [HIGH] CONFIRMED
- F-926 [HIGH] CONFIRMED

### C5: Engine numbers served by the lookup compute: FE-39 and the RR-0271 text vs the code (CONFLICT)
Reason (ids F-1061): see VERDICTS-SUMMARY-2 C5: Spec 135 FE-39 (135:61) "Engine values show before MB-38 only in the admin preview and in a tester-only preview: golden 25 + the MB-35 cohort, a \"Preview\" banner, no charge (EI-D2)" and RR-0271 text "(tester gate until MB-38 shadow passes)" vs src/lib/parcels/report-compute.ts:11-13 "THE GATE is the existing web live switch ALONE ... decision D-1 ... is not ruled, so this adds no session gate, no admin condition and no new switch" (src/app/api/parcels/lookup/route.ts:151).
- F-1061 [HIGH] CONFLICT

### S3: Strike: matches D3 (stale spec and descriptor text), first pass CONFIRMED
Reason (ids F-1056 F-497 F-533 F-743 F-798 F-879 F-910 F-958 F-963 F-980): = D3: descriptor docs.under_126 says "whitelist of six fields" (contract_parcels_entitlement.descriptor.json:7, census/contracts.json:22894) against seven keys at src/app/api/parcels/entitlement/types.ts:12-18 (the seven are also listed in the descriptor field_whitelist, :83-84; only the prose is stale). Rule: Spec 00:463 (same-commit rule) and .claude/domain-admin.md:69.
Reason (ids F-504 F-657 F-668 F-908): extends D3 with new members: (a) F-504: the MF-91 footer ruling (RR-0270, MORNING-DECISIONS.md:1061,:1066) is landed in no spec: git grep "MF-91|SRCH.FOOTER" over docs/specs finds nothing; rule Spec 126 section 0b item 6 (126:77 "A ruling does not stay only in a scratch file: it lands with its row's next docs commit"); (b) F-657/F-668/F-593: Spec 126 11a.7 dated note 2026-11-12 names one cause of a null page (no producer) and the approved miss text; the code holds an unsure lot's page (route.ts:146) and shows loading while the question is owed ([parcelId].tsx:35-38); no dated note; (c) F-908: the lookup descriptor still reads "It reads no table today and changes no meter" (contract_parcels_lookup.descriptor.json:6, prior text kept) while the meter now counts only on a produced page (route.ts:182-188).
- F-1056 [HIGH] CONFIRMED
- F-497 [HIGH] CONFIRMED
- F-504 [HIGH] CONFIRMED
- F-533 [HIGH] CONFIRMED
- F-657 [HIGH] CONFIRMED
- F-668 [HIGH] CONFIRMED
- F-743 [HIGH] CONFIRMED
- F-798 [HIGH] CONFIRMED
- F-879 [HIGH] CONFIRMED
- F-908 [HIGH] CONFIRMED
- F-910 [HIGH] CONFIRMED
- F-958 [HIGH] CONFIRMED
- F-963 [HIGH] CONFIRMED
- F-980 [HIGH] CONFIRMED

### S5: Strike: matches R5 (C-9m is per node), first pass REJECTED enforced
Reason (ids F-1028 F-493 F-525 F-602 F-603 F-678 F-679 F-712 F-801 F-907 F-957): = R5: C-9m counts one min-h token per NODE from the listed set (src/tests/surfaces/surface-conformance.logic.test.ts:871-880), with planted both-directions cases (:905-925: 48 on Button accepted; 48 on Input, 46, 40 refused); surface-validate --check run today: "S-screen ok (17 surfaces, 100 goldens)"; the 48 px is the mock the operator approved (RR-0309, MORNING-DECISIONS.md:1199). The "not an operator ruling" label is the orchestrator decision whose log form is D13.
- F-1028 [HIGH] REJECTED:enforced
- F-493 [HIGH] REJECTED:enforced
- F-525 [HIGH] REJECTED:enforced
- F-602 [HIGH] REJECTED:enforced
- F-603 [HIGH] REJECTED:enforced
- F-678 [HIGH] REJECTED:enforced
- F-679 [HIGH] REJECTED:enforced
- F-712 [HIGH] REJECTED:enforced
- F-801 [HIGH] REJECTED:enforced
- F-907 [HIGH] REJECTED:enforced
- F-957 [HIGH] REJECTED:enforced

### S6: Strike: matches C4 (Help sheet vs Linking), first pass CONFLICT
Reason (ids F-733 F-738): = C4 (Spec 126:990 Linking.openURL vs the in-app sheet, maxbldHelp.ts:6-7,24).
- F-733 [HIGH] CONFLICT
- F-738 [HIGH] CONFLICT

### S2: Strike: matches R2 (the ruling exists and resolves), first pass REJECTED ruling
Reason (ids F-1002 F-1010 F-1022 F-584 F-623 F-624 F-635 F-661 F-662 F-686 F-707 F-719 F-731 F-732 F-742 F-827 F-885): = R2: the cited rulings exist: RR-0278 (MORNING-DECISIONS.md:1082, decision-81), RR-0307 (:1182), RR-0309 (:1199), RR-0310 (:1207), RR-0313 (:1216), RR-0270/0271 (:1061, :1066), C.12 help link as its own task (:796) with the placeholder address (:1155), task-323 (:1041, semi page, mock and link only). Specific: F-635 the sample report's footer section pre-exists (ReportPage.tsx at 9f04d9074 :319-323); F-661/F-1010 RR-0270 "the duplicate under the input goes on the web page"; F-686 RR-0271 names the compute entry; F-827 the flag only lifts the hold for the caller's own lot (route.ts:144-146); F-1022 the answer store is a later increment (task-323); F-719/731/732 Spec 126:990 says "not added here" for that task only, C.12 is later and ruled.
- F-1002 [HIGH] REJECTED:ruling
- F-1010 [HIGH] REJECTED:ruling
- F-1022 [HIGH] REJECTED:ruling
- F-584 [HIGH] REJECTED:ruling
- F-623 [HIGH] REJECTED:ruling
- F-624 [HIGH] REJECTED:ruling
- F-635 [HIGH] REJECTED:ruling
- F-661 [HIGH] REJECTED:ruling
- F-662 [HIGH] REJECTED:ruling
- F-686 [HIGH] REJECTED:ruling
- F-707 [HIGH] REJECTED:ruling
- F-719 [HIGH] REJECTED:ruling
- F-731 [HIGH] REJECTED:ruling
- F-732 [HIGH] REJECTED:ruling
- F-742 [HIGH] REJECTED:ruling
- F-827 [HIGH] REJECTED:ruling
- F-885 [HIGH] REJECTED:ruling

### S7: Strike: matches R3 (tests and goldens exist at the tip), first pass REJECTED enforced
Reason (ids F-1012 F-1030 F-1046 F-505 F-687 F-691 F-727 F-782 F-799 F-800 F-806 F-807 F-812 F-813 F-819 F-821 F-822 F-829 F-830 F-831 F-835 F-836 F-842 F-848 F-849 F-850 F-852 F-856 F-857 F-858 F-863 F-864 F-865 F-877 F-880 F-884 F-889 F-912 F-916 F-927): = R3, with new evidence: the lens saw no fixtures but they are in the tree: src/tests/fixtures/surfaces/mobile_parcel_search/reports_left.mobile.json and reports_left.web.json exist (the descriptor state `hit` names golden `reports_left`, a file stem), 22 files under that folder changed in the range; node scripts/surfaces/surface-validate.mjs --check run today exit 0: "S-gen ok · S-golden ok (18 states x 4; owed 13 states / 52 files) · S-parity ok · binding ok · closed-status ok · S-desc ok · S-screen ok (17 surfaces, 100 goldens) · S-sbind ok (17 surfaces, 426 strings)"; emit-mobile-surfaces --check "surfaces ok (4 surfaces, 30 goldens)"; generate-surface-handbook --check "up to date (44 rules)". Fingerprints (F-800, F-807, F-881) are fresh because S-golden passes. F-813 and the legal move: site-footer.logic.test.ts T2/T3 and its planted-RED cases. Locks for the held page, meter and flag: parcel-lookup-gate.infra.test.ts:310-415. F-848/849/850: footerNode.ts is a .ts module; docs/reports/generated/127-surface-registry.md section 5 (line 9906) lists the 14 component files with no owner and footerNode is not among them (UNVERIFIED that the rule counts .ts modules); F-852: no pending entry is involved (UNVERIFIED).
- F-1012 [HIGH] REJECTED:enforced
- F-1030 [HIGH] REJECTED:enforced
- F-1046 [HIGH] REJECTED:enforced
- F-505 [HIGH] REJECTED:enforced
- F-687 [HIGH] REJECTED:enforced
- F-691 [HIGH] REJECTED:enforced
- F-727 [HIGH] REJECTED:enforced
- F-782 [HIGH] REJECTED:enforced
- F-799 [HIGH] REJECTED:enforced
- F-800 [HIGH] REJECTED:enforced
- F-806 [HIGH] REJECTED:enforced
- F-807 [HIGH] REJECTED:enforced
- F-812 [HIGH] REJECTED:enforced
- F-813 [HIGH] REJECTED:enforced
- F-819 [HIGH] REJECTED:enforced
- F-821 [HIGH] REJECTED:enforced
- F-822 [HIGH] REJECTED:enforced
- F-829 [HIGH] REJECTED:enforced
- F-830 [HIGH] REJECTED:enforced
- F-831 [HIGH] REJECTED:enforced
- F-835 [HIGH] REJECTED:enforced
- F-836 [HIGH] REJECTED:enforced
- F-842 [HIGH] REJECTED:enforced
- F-848 [HIGH] REJECTED:enforced
- F-849 [HIGH] REJECTED:enforced
- F-850 [HIGH] REJECTED:enforced
- F-852 [HIGH] REJECTED:enforced
- F-856 [HIGH] REJECTED:enforced
- F-857 [HIGH] REJECTED:enforced
- F-858 [HIGH] REJECTED:enforced
- F-863 [HIGH] REJECTED:enforced
- F-864 [HIGH] REJECTED:enforced
- F-865 [HIGH] REJECTED:enforced
- F-877 [HIGH] REJECTED:enforced
- F-880 [HIGH] REJECTED:enforced
- F-884 [HIGH] REJECTED:enforced
- F-889 [HIGH] REJECTED:enforced
- F-912 [HIGH] REJECTED:enforced
- F-916 [HIGH] REJECTED:enforced
- F-927 [HIGH] REJECTED:enforced

### R9: Lookup descriptor prose "reads 9 tables": prior text kept by M-246, no database.reads block to update (REJECTED notbound)
Reason (ids F-498 F-532 F-551 F-576 F-582 F-649 F-656 F-805 F-871 F-878 F-935 F-981): the lookup descriptor is x-draft: it has no database.reads[] block (keys: kind, status, docs, evidence, identity, inputs, outputs, ...; `evidence.tables` lists file:line cites), and `under_126` is the standard's target wording ("Becomes a CONTRACT descriptor ... It declares its database.reads[]"), not a claim about today. The data_story "It reads 9 tables" is prior text kept by M-246; the 2026-11-19 dated note in the same field names the six more tables the compute reads (bylaw_resolution_results, bylaw_resolution_option_results, bylaw_resolution_units, bylaw_resolution_texts, parcel_abutments, parcel_maxbld_population). Only the stale sentence "changes no meter" is a defect, counted in D3 (F-908).
- F-498 [HIGH] REJECTED:notbound
- F-532 [HIGH] REJECTED:notbound
- F-551 [HIGH] REJECTED:notbound
- F-576 [HIGH] REJECTED:notbound
- F-582 [HIGH] REJECTED:notbound
- F-649 [HIGH] REJECTED:notbound
- F-656 [HIGH] REJECTED:notbound
- F-805 [HIGH] REJECTED:notbound
- F-871 [HIGH] REJECTED:notbound
- F-878 [HIGH] REJECTED:notbound
- F-935 [HIGH] REJECTED:notbound
- F-981 [HIGH] REJECTED:notbound

### R10: Seventh entitlement key has a producer: lib/entitlements/index.ts:667 via the route (REJECTED notthere)
Reason (ids F-534 F-556 F-655 F-685 F-748 F-843): F-556 and the others claim nothing produces resetsOnDisplay because route.ts changed only in a comment: the producer is src/lib/entitlements/index.ts:629-632 resetLabel and :667 `resetsOnDisplay: resetLabel(u.resetsOn)`, called by the route at src/app/api/parcels/entitlement/route.ts:39-40 `ParcelToolEntitlementResponseSchema.parse(usage)`; u.resetsOn is end.toISOString() (index.ts:571), never null on that path. The strict whitelist (types.ts:11-19) has seven keys; the descriptor field_whitelist lists the seventh (descriptor :83-84); only the under_126 prose still says six (D3). F-941 below.
Reason (ids F-538 F-765 F-814 F-941): F-941: resetLabel(u.resetsOn) takes a non-null string (index.ts:571); the label is null only for an invalid date and then every field is set together or all null (index.ts:641-668), so F-765's case cannot arise; F-814: the label is served, goldens use a fixed fixture, parcel-reset-label.logic.test.ts pins it; F-538: ParcelToolUsage (index.ts:617) has one constructor and one consumer, the parcel_tool route; no lead_gen path reads it.
- F-534 [HIGH] REJECTED:notthere
- F-538 [HIGH] REJECTED:notthere
- F-556 [HIGH] REJECTED:notthere
- F-655 [HIGH] REJECTED:notthere
- F-685 [HIGH] REJECTED:notthere
- F-748 [HIGH] REJECTED:notthere
- F-765 [HIGH] REJECTED:notthere
- F-814 [HIGH] REJECTED:notthere
- F-843 [HIGH] REJECTED:notthere
- F-941 [HIGH] REJECTED:notthere

### R11: Who adjudicated the 48 px, and its lock: the orchestrator, not the raising lane; the both-directions lock exists (REJECTED)
Reason (ids F-1029 F-1055 F-870 F-904 F-905 F-913 F-956): F-904 (CRIT): Spec 128 4 step 2 (128:125) binds the party that adjudicates: the 48 px was discovered by lane BL-SUITEFIX2 (task-353, red C-9m case) and adjudicated by the orchestrator (MORNING-DECISIONS.md:1227 "Decision (orchestrator, NOT an operator ruling; overturn in the morning")), a different party; the operator's own approval of the 48 px drawing is RR-0309. The procedural gap is the missing D-nn id (D13), not a self-adjudication. F-905: the both-directions lock exists (surface-conformance.logic.test.ts:905-925). F-913: descriptor :472 explains RR-0310, nothing discovered and ruled by one pass. F-956: not an Ask. F-870: B2 is about declarations; the list is existing data and the web list already holds two sizes per component (bindings.json:69-70). F-1029/F-1055: RR-0309 approves the 48 px drawing, existing list reused.
- F-1029 [HIGH] REJECTED:notthere
- F-1055 [HIGH] REJECTED:notthere
- F-870 [HIGH] REJECTED:notthere
- F-904 [CRIT] REJECTED:notthere
- F-905 [HIGH] REJECTED:notthere
- F-913 [HIGH] REJECTED:notthere
- F-956 [HIGH] REJECTED:notthere

### R12: Declared in the descriptor, or the rule does not bind this file (REJECTED notthere/notbound)
Reason (ids F-1011 F-1041 F-512 F-543 F-610 F-699 F-700 F-706 F-775 F-781 F-783 F-790 F-820 F-891): F-512/543/781: the search descriptor adds `/api/parcels/entitlement` to its contracts list and the state `hit`/golden `reports_left` (git diff of mobile_parcel_search.descriptor.json); F-1011/1041/610/1039: FE-32 makes a contract field a binding kind (136:fe.32) and the descriptor field_whitelist lists resetsOnDisplay; the binding path is SearchBinding.tsx `entitlement(field) = {contract: ...}`; F-699: the `{text, vars}` template pre-exists (mobile SearchBinding at 9f04d9074 :15,:99); F-700: `topic` is in bindings.json non_display_keys and `q` carries a ref, S-sbind ok; F-706: expo-web-browser is a framework package already used (useSubscribeCheckout.ts:15), bindings libraries are the UI packages only; F-775: Spec 126 section 14 (126:1225-1227) fences step descriptors for the app_outputs step, not surface descriptors; F-783: 12.1 is the conversion batch plan; F-790: the entitlement line is "a display, never a gate" (entitlement/route.ts:7) and a failed read leaves it out; the screen is not blanked; F-820: PH-0 names call idioms, not a defect.
- F-1011 [HIGH] REJECTED:notthere
- F-1041 [HIGH] REJECTED:notthere
- F-512 [HIGH] REJECTED:notthere
- F-543 [HIGH] REJECTED:notthere
- F-610 [HIGH] REJECTED:notthere
- F-699 [HIGH] REJECTED:notthere
- F-700 [HIGH] REJECTED:notthere
- F-706 [HIGH] REJECTED:notthere
- F-775 [HIGH] REJECTED:notthere
- F-781 [HIGH] REJECTED:notthere
- F-783 [HIGH] REJECTED:notthere
- F-790 [HIGH] REJECTED:notthere
- F-820 [HIGH] REJECTED:notthere
- F-891 [HIGH] REJECTED:notthere

### R13: Footer family: goldens and locks fresh, rulings RR-0270 and C.12 decide (REJECTED)
Reason (ids F-692 F-718 F-720 F-726 F-815 F-851 F-917 F-918): footer family: the static page goldens did not change in the range (git diff --stat over src/tests/fixtures/surfaces/web_landing, web_terms, web_help, web_privacy, web_maxbld_error is empty) and S-golden is ok, so the shared builder reproduces the old output (C7); list.report already exists (mobile_parcel_search.content.json:9; unchanged); footer.* keys serve the web target of a ["mobile","web"] surface (descriptor identity.platforms) and no mobile code renders a footer.* key; F-917: site-footer.logic.test.ts plants an unknown-role RED; F-918: pickFooterText reads static build-time content, not a stored read (MF-76 note concerns stored reads).
- F-692 [HIGH] REJECTED:enforced
- F-718 [HIGH] REJECTED:enforced
- F-720 [HIGH] REJECTED:enforced
- F-726 [HIGH] REJECTED:enforced
- F-815 [HIGH] REJECTED:enforced
- F-851 [HIGH] REJECTED:enforced
- F-917 [HIGH] REJECTED:enforced
- F-918 [HIGH] REJECTED:enforced

### R14: Hand-written client mirror, presence gate, shared cache key, meter replay (REJECTED notbound/notthere)
Reason (ids F-566 F-583 F-591 F-592 F-597 F-598 F-828 F-890 F-898): F-583/591/592/597/598: Spec 126 5.0/5.2 describe the one-source generator as the programme target; no Zod-mirror generator exists in scripts/surfaces (git ls-files finds none), every existing mobile mirror is hand-written, and the entitlement contract is declared additive_only (descriptor :58) which the client schema comment states; the line's presence test (parcelSearchCore.ts:76-78) adds no maths, and Spec 128 2.1 lists what Rule 2 forbids computing (UNVERIFIED which phase schedules the generator); F-566: the meter is idempotent per lot and month (entitlements/index.ts:571 `already`), so a re-issued Continue cannot count twice; F-828: Continue fetches explicitly (semi-question.tsx:64) and then writes the cache, it never reads the cache first; F-1007/F-1024: the semi answer store is later (task-323) and the map and semi pages are mobile-only (descriptors identity.platforms ["mobile"]); F-508: counts are server-computed integers filled into a template slot, no arithmetic.
- F-566 [HIGH] REJECTED:notbound
- F-583 [HIGH] REJECTED:notbound
- F-591 [HIGH] REJECTED:notbound
- F-592 [HIGH] REJECTED:notbound
- F-597 [HIGH] REJECTED:notbound
- F-598 [HIGH] REJECTED:notbound
- F-828 [HIGH] REJECTED:notbound
- F-890 [HIGH] REJECTED:notbound
- F-898 [HIGH] REJECTED:notbound

### R15: Empty finding (REJECTED empty)
Reason (ids F-931): Clause, Diff and Lens claim are empty in the finding.
- F-931 [HIGH] REJECTED:empty

## E. Sample of the MED and lower findings (20 of 431; stride per source)

- F-508 [fe-126 MED] REJECTED:notbound: counts are server-computed integers filled into a template slot; no arithmetic on the client (R14).
- F-550 [fe-126 MED] REJECTED:ruling: rulings RR-0278, RR-0307, RR-0310 and tasks 319/360/361/362 resolve (S2).
- F-593 [fe-126 MED] CONFIRMED: joins D3: Spec 126 5.3 / 11a.7 text names the served page; the code swaps in loading while a question is owed ([parcelId].tsx:35-38) and no dated note records it.
- F-634 [fe-126 MED] REJECTED:ruling: semi flag RR-0278, compute RR-0271, reset date RR-0310 (S2).
- F-676 [fe-126 MED] CONFIRMED: joins D14: semiQuestion.ts:16-17 60_000 literal; Spec 126 P4 126:189.
- F-725 [fe-126 NIT] REJECTED:ruling: placeholder wording RR-0313 (MORNING-DECISIONS.md:1216), Spec 100:148.
- F-769 [fe-126 LOW] CONFLICT: joins C4: Support page leaves via Linking (Spec 126:990) vs in-app sheet (maxbldHelp.ts:24).
- F-810 [fe-127 MED] REJECTED:ruling: footer keys RR-0270 (:1061, :1066), select.hint from the v8 mock choose-lot.html:278 and task-362; placeholder RR-0313.
- F-846 [fe-127 MED] CONFIRMED: D15: "semi" sits in the lookup contract field_whitelist (descriptor :175) but is a request parameter.
- F-881 [fe-128 MED] REJECTED:enforced: the fingerprint is fresh: surface-validate S-golden ok; report-presentation.json changed by one line and the sample was restamped.
- F-915 [fe-128 LOW] CONFIRMED: joins D3: descriptor under_126 says six fields (entitlement descriptor :7), types.ts has seven.
- F-940 [fe-128 LOW] CONFIRMED: joins D15: entitlement descriptor :326-331 cites useParcelLookup.ts:96 (the parcel-lookup query); the entitlement hook is :134.
- F-962 [fe-128 LOW] REJECTED:notthere: Spec 126 11a.3 note exists and the seed (seed-report-v2.mjs:600) equals report-presentation.json:26, as the lens itself says.
- F-979 [fe-135 LOW] REJECTED:notthere: same literal as F-962.
- F-993 [fe-135 LOW] REJECTED:enforced: the lock is in the tests named in the tree (maxbldHelp.test.ts, semiQuestionPage.behaviour.test.tsx); Spec 135 rule 2 binds register rows, not code comments.
- F-1007 [fe-135 MED] REJECTED:ruling: FE-19 entered-fact store is a later increment: task-323 "page, mock and link only" (MORNING-DECISIONS.md:1041).
- F-1024 [fe-135 MED] REJECTED:notbound: the map and semi pages are mobile-only (descriptor identity.platforms ["mobile"]); FE-07 parity does not apply.
- F-1039 [fe-135 LOW] REJECTED:notthere: the binding path exists: SearchBinding.tsx `entitlement(field) = {contract: ...}` and descriptor field_whitelist :83-84.
- F-1053 [fe-135 MED] REJECTED:enforced: semi goldens exist and S-screen is ok: mobile_parcel_semi_question goldens in src/tests/fixtures/surfaces and mobile/__tests__/fixtures.
- F-1068 [fe-135 LOW] REJECTED:notthere: usage rows are written only when the meter counts (route.ts:179-188; not_evaluated writes nothing), so reportsUsed excludes no-option hits by construction.

(Also opened while checking the sample and the groups, not counted in the 20: F-964 CONFIRMED into D15; F-1040 and F-1066 into R9/D3; F-855, F-818, F-988, F-522, F-581, F-705, F-769 rejected or in C4.)

## F. Counts
CRIT and HIGH: {"CONFIRMED":22,"REJECTED:enforced":59,"REJECTED:notbound":21,"REJECTED:notthere":31,"REJECTED:ruling":17,"CONFLICT":3,"REJECTED:empty":1}
Sample: {"REJECTED:notbound":2,"REJECTED:ruling":5,"CONFIRMED":5,"CONFLICT":1,"REJECTED:enforced":3,"REJECTED:notthere":4}
Sample by source: {"fe-126":{"n":7,"c":2},"fe-127":{"n":2,"c":1},"fe-128":{"n":4,"c":2},"fe-135":{"n":7,"c":0}}
