Grounder: BL-GROUND
Lane: BL-COMPLY
Task: task-368 (COMPLY.4) · Increment 1·B · pushed tip 3a36e8b26 · findings: docs/reports/lanes/2026-11-20/BL-COMPLY/FINDINGS.md (491; 3 CRIT, 98 HIGH)
Status line (Spec 137 rule 3): BL-GROUND lane · task-368 · verdicts only: no code fixed, no task created.

Method: every verdict opened the code on the pushed tip (a read-only `git archive` copy of 3a36e8b26 and `git show`/`git grep`; my worktree's src, mobile and scripts equal the tip: `git diff 3a36e8b26 HEAD -- src scripts mobile` is empty) and the rule in its source spec or ruling record. Rulings were resolved in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md and ~/Buildo-scratch/plan-gen/rulings-register.json (RR-0270, 0271, 0278, 0307, 0309 to 0314 read). doc-16 (McStorage policy v2) header says DRAFT: every storage verdict below carries "the operator has not confirmed doc-16 binds". Spec 135 full rows, McProof rows M-436..M-447, Spec 133 sections 3 and 4, Spec 126/128 text were not in the packs (inherited coverage limit).

## A. The stated question: which gates scan src/lib/parcels/report-compute.ts

By path (each glob re-read at the line shown on the tip; the BL-COMPLY table is CONFIRMED line for line):
- scripts/ast-grep-rules/compute-shape.yml:22-24 scripts/lib/compute/**/*.js and the compute fixtures: NO.
- scripts/hooks/check-step-shape.mjs:61 COMPUTE_DIR scripts/lib/compute: NO.
- scripts/analysis/gates/compute-literals.mjs:34, compute-closure.mjs:50 (and :53 runner entries), compute-purity.mjs scanPurity (:94-106: entries plus closure, .js/.cjs only), estate-literals.mjs:44 (scripts/analysis/gates, scripts/lib/step), ast-grep step-shape.yml:51 (scripts/**/*.js), bylaw-literal.yml:21-28: NO.
- scripts/hooks/ast-grep-leads.sh:47,59 (silent-catch-fallback over src/lib): YES, runs at .husky/pre-commit:52. It is a footgun rule, not a purity gate.
- scripts/analysis/src-sql-ledger.mjs:111 (names the file in CLOSED_INTERPOLATED_SET) and the generated ledger row scripts/steps/_schema/src-sql-ledger.json:2693: YES; the gate runs at .husky/pre-commit:23.
- src/tests/surfaces/report-no-maths.logic.test.ts:28 DIRS: NO (src/lib/parcels is not listed).
By reachability: report-compute.ts imports the engine scenario module by dynamic import (report-compute.ts:78 `await import('../../../scripts/lib/compute/<engine scenario module>.js')`, plus scripts/lib/step/config.js :79 and the descriptor JSON :80). That engine module is inside scripts/lib/compute, so it IS a scanned compute entry, and its own imports (scripts/lib/bylaw-materialize.js, bylaw-resolution.js, bylaw-lot-row.js, maxbld/*, seeds JSON, docs/reference/bylaw-layer2-input.json and two src/features/leads/lib files) are in the closure the gates scan. The edge points the wrong way for the gates: compute-closure.mjs walks require() edges outward from the compute directory (header :1-42), so a caller of compute (report-compute.ts, a .ts file) is never in the closure; compute-purity scans the closure's .js/.cjs only. Dynamic import() is not a require() edge, and the closure run shows `G0 PASS modules=58 dynamic=0` with no src/lib/parcels module. So the compute core the entry runs is gated; the entry that calls it (config read, two lookups, the batch statement, ctx build) is gated only by the ledger, the consumer registry and the silent-catch rule. No purity gate (G0 to G13) scans the entry, by path or by reachability.
Runs of each gate's own check, read-only, in ~/Buildo-wt-ground (outputs in ~/Buildo-scratch/lanes-20261119/inc1b/ground/gates/):
- node scripts/analysis/gates/compute-closure.mjs: `G0 PASS modules=58 dynamic=0`, exit 0 (closure.out).
- node scripts/analysis/gates/compute-literals.mjs --list: `[]`, exit 0 (literals.out; the gate has no --check).
- node scripts/analysis/gates/compute-purity.mjs --list: one G1 site (scripts/lib/compute/refresh-snapshot.js:261), exit 0, nothing in report-compute.ts (purity.out; no --check).
- node scripts/analysis/src-sql-ledger.mjs --check: `fresh, 94 file(s) (62 static, 30 interpolated, 2 not_postgres), closed set holds, every column is in the catalog`, exit 0 (ledger.out).
- node scripts/analysis/gates/consumer-registry.mjs --check: `consumer-registry.json is fresh`, exit 0 (consumer.out).
- node scripts/hooks/check-step-shape.mjs: `Step-shape gate clean (29 converted step file(s) ... 42 compute module(s) ... 1 compute-purity site(s), all ledger-allowed)`, exit 0 (stepshape.out).
- bash scripts/hooks/ast-grep-leads.sh: `Footgun gate clean`, exit 0 (astgrep.out).
- node scripts/analysis/gates/estate-literals.mjs --check: 0 findings in scope, tooling ratchet within marks, exit 0 (estate.out).
- npm run typecheck: clean, exit 0 (typecheck.out).
Answer: the entry is outside every compute-purity gate; it is in the SQL ledger (interpolated class, one statement from the core, closed set grew by one by dated note at src-sql-ledger.mjs:77-79). Whether that is acceptable is C1 below.

## B. The three orchestrator readings (readings, not rulings)

(a) Spec 132 core.10 / core.9 against the route-side entry, McStorage P1, engineering 10.1: CONFIRMED as to facts, ruled as CONFLICT C1 for rule-versus-ruling, REJECTED as a 10.1 conflict.
 - Facts opened: core.9 (132:158) "The runner owns every read set-up, write, transaction, session GUC ..., catalog probe ..., calendar date ... and the verdict"; core.10 (132:162) "Compute reads the ctx shape the runner's dispatch for its descriptor actually builds ... and its compute lock builds that ctx through the real dispatch ... Why: A hand-built ctx in a test can pass while the real run reads zeros". The entry (report-compute.ts:85-96) resolves config itself, reads the two lookup tables itself (:89-92, no unique_on duplicate check and no on_empty handling that the runner does at scripts/lib/step/index.js:3425-3441), runs the batch statement itself (:93) and passes ctx {config, lookups} (:96); the runner passes {config, run_at, descriptor, lookups} (index.js:3472). The core's own documented ctx is {config?, lookups?} (core materializeRows JSDoc :645-650), so no field is read as zero today. The handbook table 1b row 93 lists compute_maxbld_scenarios "pending: compute_ported" (core.9 not yet bound to this step; R-EW partial at 132:523).
 - Against McStorage P1 (doc-16:30, DRAFT) "the pure core ... runs once when a lot is first opened from the search page", and the rulings RR-0271 (MORNING-DECISIONS.md:1061 "2. y": LOAD.1 carries the compute half for the app search page now) and the Spec 100:123 dated note: the ruling requires a compute at the pick, which only a route-side caller can do. core.9's sentence names the runner as owner of reads and no clause names a second caller. That is a rule and a ruling pulling apart: C1, to the operator.
 - Engineering 10.1 (00_engineering_standards.md:220-221) "[Pipelines] -> [Database] -> [API Routes] -> [Frontend] ... Frontend components never write to pipeline tables. Pipelines never read frontend state. API routes are the only bridge": REJECTED as a conflict: the entry reads the database and writes nothing; 10.2 (:223-225) bars a frontend WF from modifying scripts/ and the entry only imports it (header :3 says so).
 - Residual gap, not a conflict: no lock proves the entry's ctx equals the runner's for this step (C2 parity in customer-report-compute.logic.test.ts compares the page with the stored projection, with the golden raw lookups). 
(b) Spec 132 core.8 against SEMI_CONTINUE_WAIT_MS = 60_000 (mobile/src/lib/semiQuestion.ts:16): REJECTED. core.8 (132:154) reads "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero"; a phone screen module is none of the four named things. Spec 136 fe.44 (136:163) "the conversion factor is content/settings, never code" is about units. Spec 90 has no timeout or constant rule (grep of 90 for hardcod, magic, settings, timeout: only guidance at :78 "wait for a 500ms pause" and :101 "gcTime: 86400000, staleTime: 300000" as literals). Mobile precedent is literals (flight-board.tsx:50 UNDO_TIMEOUT_MS = 3000, PaywallScreen.tsx:34 REVEAL_REFRESH_AFTER_MS = 60_000), with one surface-config precedent (SearchBinding.tsx:36 SEARCH_DEBOUNCE_MS = SEARCH_SLICE.config.debounce_ms). The comment itself says "a timeframe; operator item in the lane report" and the BL-SEMI3 report logs LX-E1 (docs/reports/lanes/2026-11-19/BL-SEMI3/REPORT.md:14); timeframes are the operator's expertise (RR scope, MORNING-DECISIONS.md:925). So: no rule binds the phone number; an open operator item on the 60 s remains (not a defect). UNVERIFIED: whether the operator has been asked LX-E1.
(c) Spec 90 section 5 "NO Web Libraries" against lucide: REJECTED. SurfaceRenderer.tsx:22 imports from 'lucide-react-native' (an AlertTriangle, ArrowRight, Ban, Check, ChevronLeft, Info, Lock, MapPin, RefreshCw, Search, User, X list); mobile/package.json:49 declares "lucide-react-native": "~1.8.0". Spec 90:56 bans `lucide-react` (the web package), not the native one.

## C. The two review-tool defects BL-COMPLY reported (listed, not fixed)
1. Placeholder substitution: CONFIRMED. scripts/lib/review-template.js:74-78 substitutePlaceholders chains `.replace(/\{\{PLAN\}\}/g, plan).replace(/\{\{SPECS\}\}/g, specs).replace(/\{\{DATA_CONTEXT\}\}/g, dataContext)` with the text as a replacement string: a `$&` or `$'` sequence in a diff or pack expands, and a placeholder token inside the plan text is substituted again by the later replaces. Called from scripts/deepseek-review.js:183.
2. Doubled {{PLAN}} in lens-compliance.md: CONFIRMED. .claude/review-templates/lens-compliance.md:32 mentions {{PLAN}} in prose and :34 holds the block, and the replace is global (/g), so the file under review is sent twice (git grep -c "{{PLAN}}" prints 2).

## D. Verdicts, CRIT and HIGH (101 findings, grouped by defect)

Verdict lines: `F-nnn [severity] verdict`. The reason sits once under each group line (every id in the group shares it).

### D1: Stored-record freshness check ignores the settings sha and evaluator version (CONFIRMED)
Reason (ids: F-470): rule: doc-16 P3 "every stored record carries Layer 2 table_version, evaluator_version and the settings sha" (doc-16:32, the ruling text at MORNING-DECISIONS.md:704; doc-16 is DRAFT); code: src/lib/report-projection/project.ts:179-184 compares only layer2_table_version, catalogue_sha, switchboard_sha; settings_sha is stored on the row (project.ts:38) and never compared; no current evaluator or settings sha is read. Dark today: no stored record exists until ST.P1 (RR-0271) lands.
- F-470 [CRIT] CONFIRMED

### D2: Square-feet factor 10.7639 hard-coded in the page formatter (CONFIRMED)
Reason (ids: F-234): rule: operator ruling MORNING-DECISIONS.md:241 "The conversion factor lives in content/settings, never in code" and Spec 136 fe.44 (136:163); code: src/lib/report-projection/format.ts:14 export const SQFT_PER_M2 = 10.7639 used at :35. Same literal also in mobile/src/lib/parcelCostFormat.ts:11 and src/lib/parcels/geometry.ts:3 (older). Home row MF-83 per MORNING-DECISIONS.md:241.
- F-234 [HIGH] CONFIRMED

### D3: Spec and descriptor text left stale by the 1·B rulings (CONFIRMED, docs)
Reason (ids: F-149 F-204 F-394): rule: Spec 00 section 14 "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit" (00_engineering_standards.md:463) and .claude/domain-admin.md:69 "Do not change the response shape without a contract note"; code: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:7 still says "a .strict() whitelist of six fields" while src/app/api/parcels/entitlement/types.ts:12-18 now has seven (resetsOnDisplay added).
Reason (ids: F-165 F-183): rule: Spec 00:463 as above; code: src/app/api/parcels/lookup/route.ts:18-20 states the prior behaviour changed (RR-0278 meter on production, SRCH.METER-2 hold) and cites Spec 100 section 3.2; docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:116 (the "1 b" meter rule) is unamended and git grep RR-0278 over docs/specs finds nothing (searched docs/specs; only backlog/decisions/decision-81 holds it).
Reason (ids: F-264 F-266 F-273 F-280 F-366): the code follows RR-0278 / SRCH.METER-2 (route.ts:146-183, [parcelId].tsx:35-38), but the clauses these findings quote (Spec 100:116 meter rule; Spec 100 section 4 "a settled lookup with no page shows the approved miss text") were never amended by a dated note; the defect is stale spec text, not the code. Same fix as the rows above.
- F-149 [HIGH] CONFIRMED
- F-165 [HIGH] CONFIRMED
- F-183 [HIGH] CONFIRMED
- F-204 [HIGH] CONFIRMED
- F-264 [HIGH] CONFIRMED
- F-266 [HIGH] CONFIRMED
- F-273 [HIGH] CONFIRMED
- F-280 [HIGH] CONFIRMED
- F-366 [HIGH] CONFIRMED
- F-394 [HIGH] CONFIRMED

### D4: New query key parcel-entitlement has no row in the Spec 99 registry (CONFIRMED, docs)
Reason (ids: F-331 F-337): rule: Spec 99 section 4 B1 "Adding a new server query requires a row here" (99:226); code: mobile/src/hooks/useParcelLookup.ts:134 queryKey ['parcel-entitlement']; the registry 99:230-235 stops at ['parcel-lookup', parcelId]; git diff 9f04d9074..3a36e8b26 on Spec 99 is empty.
- F-331 [HIGH] CONFIRMED
- F-337 [HIGH] CONFIRMED

### D5: Semi page Continue fetches outside TanStack Query (CONFIRMED)
Reason (ids: F-332): rule: Spec 99 section 4 B1 "Every server fetch MUST go through TanStack Query - never raw fetch() in components" (99:219); code: mobile/app/(app)/parcel-tool/semi-question.tsx:64 awaits fetchParcelLookup(...) imperatively and :74 writes the cache by hand (storeLookup). The fetch is the Zod-parsed shared function, so data is validated; the lifecycle is not Query-owned.
- F-332 [HIGH] CONFIRMED

### D6: Unit conversion in the formatter has no fast-check property test (CONFIRMED)
Reason (ids: F-188): rule: Spec 00 12.12 "Pure functions with arithmetic invariants - ... distance/unit conversions ... MUST have at least one fast-check property test" (00_engineering_standards.md:377); code: src/lib/report-projection/format.ts:35 m2 to sq ft rounding; git grep -l fast-check src/tests lists only src/tests/property/coa-notice-parse.property.test.ts and leads-invariants.property.test.ts; the formatter is tested only by example (admin-report-preview-live, report-honest-k2b). Code was moved in ace93fc92, not written new.
- F-188 [HIGH] CONFIRMED

### D7: Report footer links are plain anchors, not the platform Link (CONFIRMED, low)
Reason (ids: F-229): rule: Spec 136 fe.36 "a control that moves the user uses the platform router (web <Link> ...)" (136:139); code: src/components/report/ReportPage.tsx:251 case 'Button': return <a ... href=...> for the three footer links (:262); the static and search footers use next/link (StaticBinding.tsx:34, SearchBinding.tsx:23). Works; full page load.
- F-229 [HIGH] CONFIRMED

### D8: Report footer text links have no 44 px target (CONFIRMED, low; design may decide)
Reason (ids: F-130): rule: Spec 00 1.1 "All interactive elements (buttons, links ...) MUST have a minimum tappable area of 44px x 44px" (00_engineering_standards.md:14); code: src/components/report/ReportPage.tsx:240 link class has no min-h; the static footer link (StaticBinding.tsx:90) has none either. UNVERIFIED: whether the v8 mock draws these as small inline text (then it is a design call).
- F-130 [HIGH] CONFIRMED

### D9: Lot-size plausibility window 50 and 5000 are code literals (CONFIRMED, low)
Reason (ids: F-425): rule: Spec 132 core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero ... definitional windows are pinned (min = max)" (132:154); code: src/lib/report-projection/project.ts:76 LOT_SIZE_PLAUSIBLE_M2 = { min: 50, max: 5000 } drives lineage.lot_size_implausible (:262, admin lineage). The same bounds are the ONE-13 operator ruling for the customer page. git grep of logic_variables.json finds no lot-size window variable.
- F-425 [HIGH] CONFIRMED

### D10: proof-slice.mjs timeout and buffer are code literals (CONFIRMED, low)
Reason (ids: F-429): rule: Spec 132 core.8 "tool" numbers are pinned tooling_* variables (132:154); code: scripts/analysis/proof-slice.mjs:21 DEFAULT_TIMEOUT_MS = 120000 and :132 maxBuffer: 16 * 1024 * 1024, while scripts/seeds/logic_variables.json:9739 tooling_spawn_max_buffer_mb already exists. UNVERIFIED: whether the estate-literals tooling ratchet (PIN EXT-2, 128 findings over 6 files, --check passes) lists this file.
- F-429 [HIGH] CONFIRMED

### D11: Plan-altitude lens commands carry no --context (CONFIRMED, tooling)
Reason (ids: F-405): rule: Spec 08 section 7 rule 4 dated note (review run with --context <pasted context>); code: scripts/analysis/backlog-lane.mjs:145 plan lens commands are "review ${ctx} --template ..." with no --context, so scripts/deepseek-review.js:185 specs: context ?? '(no pasted context provided)' fills {{SPECS}} with the placeholder; built by task-358 (2b16b3810).
- F-405 [HIGH] CONFIRMED

### D12: Report screen render gate has no isFetching gate-stability test (CONFIRMED, low)
Reason (ids: F-349): rule: Spec 99 8.3 "Each render gate condition (per 6.5) MUST have a test asserting that toggling isFetching does NOT flip the gate" (99:702-704); code: mobile/app/(app)/parcel-tool/[parcelId].tsx:35 gate; grep isFetching in mobile/__tests__/reportScreen.mount.behaviour.test.tsx finds nothing. UNVERIFIED: that 6.5 names this screen's gate.
- F-349 [HIGH] CONFIRMED

### C1: Route-side compute entry vs Spec 132 core.9/core.10 vs McStorage P1 (CONFLICT)
Reason (ids: F-410 F-418): see VERDICTS-SUMMARY C1: core.9 (132:158) "The runner owns every read set-up ..." and core.10 (132:162) against src/lib/parcels/report-compute.ts:85-93 reading config, two lookups and the batch statement itself, and building ctx {config, lookups} (runner builds {config, run_at, descriptor, lookups}: scripts/lib/step/index.js:3472), versus P1 (doc-16:30) and the rulings RR-0271 (MORNING-DECISIONS.md:1061). Handbook table 1b line 93 lists compute_maxbld_scenarios "pending: compute_ported".
- F-410 [HIGH] CONFLICT
- F-418 [HIGH] CONFLICT

### C2: Compute failure: McStorage P4 (draft) vs Spec 100 dated note 2026-11-19 (CONFLICT)
Reason (ids: F-456 F-463): see VERDICTS-SUMMARY C2: doc-16 P4 (doc-16:33) vs src/lib/parcels/report-compute.ts:14-15 and src/app/api/parcels/lookup/route.ts:139-141; Spec 100:123 dated note says "a core or query error is the route's existing 500 with no page and no meter". The app draws lifecycle error on a 500 (ReportBinding.tsx:402), so "never blank, 0 or the old number" holds; the closed not_evaluated:<reason> does not.
- F-456 [HIGH] CONFLICT
- F-463 [CRIT] CONFLICT

### C3: Legal line position under the search box: MF-58 ruling vs the v8 mock and A.6 (CONFLICT)
Reason (ids: F-267): see VERDICTS-SUMMARY C3: Spec 100:144 (MF-58 operator words) vs mobile/src/components/surfaces/SearchBinding.tsx:234-235 (reportsLeft before legal), which matches small-pages-v8/search.html:267-269.
- F-267 [HIGH] CONFLICT

### C4: Help opens in the in-app sheet: Spec 126 note 2026-11-12 vs the v8 mock (CONFLICT)
Reason (ids: F-296 F-354): see VERDICTS-SUMMARY C4: Spec 126:990 (operator-accepted note, "the app leaves for MAXBLD_HELP_URL ... Linking.openURL") vs mobile/src/lib/maxbldHelp.ts:6-7,24 (WebBrowser.openBrowserAsync, task-362, from small-pages-v8 search.html:235). No operator words for the change; no dated note in Spec 126.
- F-296 [HIGH] CONFLICT
- F-354 [HIGH] CONFLICT

### R1: Hand-typed SQL in report-compute.ts: ledger, registry and lock already enforce it (REJECTED enforced)
Reason (ids: F-001 F-006 F-014 F-033 F-092 F-144 F-419): the two lookup statements are parsed and ledgered: scripts/steps/_schema/src-sql-ledger.json:2693 (generated row, reads bylaw_resolution_units/texts columns); src-sql-ledger.mjs --check run: "fresh, 94 file(s) ... closed set holds"; consumer-registry.mjs --check "is fresh"; the drift lock is a real assertion at src/tests/customer-report-compute.logic.test.ts:167-171 (statements equal the descriptor lookup reads), not a test name; the closed interpolated set is hand-listed by design (src-sql-ledger.mjs:76-111, 29 older entries) and cannot grow unnoticed.
- F-001 [HIGH] REJECTED:enforced
- F-006 [HIGH] REJECTED:enforced
- F-014 [HIGH] REJECTED:enforced
- F-033 [HIGH] REJECTED:enforced
- F-092 [HIGH] REJECTED:enforced
- F-144 [HIGH] REJECTED:enforced
- F-419 [HIGH] REJECTED:enforced

### R2: Authority cited only in a comment: the operator rulings exist and resolve (REJECTED ruling)
Reason (ids: F-010 F-017 F-028 F-029 F-125 F-131 F-189 F-198 F-205 F-215 F-216 F-230 F-235 F-242 F-246 F-285 F-295 F-297 F-298 F-321 F-322 F-353 F-355 F-364 F-365 F-388 F-389 F-395 F-446 F-447 F-487): the lens saw only a pasted pack and treated a comment cite as the only authority; opened: the cited words resolve verbatim at MORNING-DECISIONS.md:789 and :1160 (W, task 341), :1061 (RR-0271, RR-0270), :1066 (shared footer), :1082 (RR-0278), :1182 (RR-0307), :1199 (RR-0309), :1207 (RR-0310), :1216 (RR-0313), :82-83 (K2) and in rulings-register.json (RR-0270, 0271, 0278, 0307, 0310, 0313 read). Content keys named are in the content files (mobile_parcel_disambiguation_map.content.json:14,25; mobile_parcel_search.content.json:3,5); footer keys serve the web target of the same surface (mobile code renders no footer.* key: git grep). StaticBinding footerOf2 repeats the existing reportOf throw pattern (StaticBinding.tsx:384-392); the landing supplies the footer (maxbld-landing.ts:147). F-355: see reading (b), core.8 does not bind the phone.
- F-010 [HIGH] REJECTED:ruling
- F-017 [HIGH] REJECTED:ruling
- F-028 [HIGH] REJECTED:ruling
- F-029 [HIGH] REJECTED:ruling
- F-125 [HIGH] REJECTED:ruling
- F-131 [HIGH] REJECTED:ruling
- F-189 [HIGH] REJECTED:ruling
- F-198 [HIGH] REJECTED:ruling
- F-205 [HIGH] REJECTED:ruling
- F-215 [HIGH] REJECTED:ruling
- F-216 [HIGH] REJECTED:ruling
- F-230 [HIGH] REJECTED:ruling
- F-235 [HIGH] REJECTED:ruling
- F-242 [HIGH] REJECTED:ruling
- F-246 [HIGH] REJECTED:ruling
- F-285 [HIGH] REJECTED:ruling
- F-295 [HIGH] REJECTED:ruling
- F-297 [HIGH] REJECTED:ruling
- F-298 [HIGH] REJECTED:ruling
- F-321 [HIGH] REJECTED:ruling
- F-322 [HIGH] REJECTED:ruling
- F-353 [HIGH] REJECTED:ruling
- F-355 [HIGH] REJECTED:ruling
- F-364 [HIGH] REJECTED:ruling
- F-365 [HIGH] REJECTED:ruling
- F-388 [HIGH] REJECTED:ruling
- F-389 [HIGH] REJECTED:ruling
- F-395 [HIGH] REJECTED:ruling
- F-446 [HIGH] REJECTED:ruling
- F-447 [HIGH] REJECTED:ruling
- F-487 [HIGH] REJECTED:ruling

### R3: Tests not in the diff the lens saw: the tests exist at the tip (REJECTED enforced)
Reason (ids: F-110 F-115 F-116 F-122 F-132 F-138 F-145 F-158 F-433 F-448 F-449): the diff the lens saw excluded test files (FINDINGS.md method note); at the tip the tests exist: src/tests/surfaces/search-web-binding.ui.test.tsx, site-footer.ui.test.tsx, report-page.ui.test.tsx, search-reports-left.logic.test.ts, parcel-reset-label.logic.test.ts, proof-slice.logic.test.ts, customer-report-read.logic.test.ts, parcel-lookup-gate.infra.test.ts:310-415 (hold, meter, 400 branch), report-honest-k2b.logic.test.ts, admin-report-preview-live.logic.test.ts (hex parity); mobile: reportScreen.mount.behaviour.test.tsx, useParcelLookup.test.ts, semiQuestionPage.behaviour.test.tsx. Red-light order (Spec 00 5.3) is UNVERIFIED here: it is proven by the commit trail and the hooks, not by a diff. F-110 is a test helper (a miss fails loudly).
- F-110 [HIGH] REJECTED:enforced
- F-115 [HIGH] REJECTED:enforced
- F-116 [HIGH] REJECTED:enforced
- F-122 [HIGH] REJECTED:enforced
- F-132 [HIGH] REJECTED:enforced
- F-138 [HIGH] REJECTED:enforced
- F-145 [HIGH] REJECTED:enforced
- F-158 [HIGH] REJECTED:enforced
- F-433 [HIGH] REJECTED:enforced
- F-448 [HIGH] REJECTED:enforced
- F-449 [HIGH] REJECTED:enforced

### R4: Rule does not bind this surface, or the quoted claim is not true of the code (REJECTED notbound/notthere)
Reason (ids: F-018 F-066 F-080 F-093 F-097 F-098 F-157 F-179 F-255 F-259 F-289 F-378 F-441): F-018: semi is declared at src/app/api/parcels/lookup/types.ts:45 (.literal('answered').optional()) and refined at :51; F-066: only unknown or missing statuses go to not_evaluated, the report-presentation hidden states go to hidden (project.ts:202-206) and m.64 is a by-law step rule; F-080/098/097: m.386, m.467, m.481 are step and by-law rules (all RULED, enforcement OWED in 133) and the approved page has no element for flags or evidence (report-presentation.json has no "at least"/lower_bound; the page shows the weakest confidence word per K2); F-093: the population list is the descriptor's own declared setting (compute-max descriptor :360, logic_variables.json:10267) and the core still throws when a catalogue setting is unseeded (core :601); F-157: scripts/surfaces is the McFrontend data home (93 prior commits); F-179: Spec 00 13.3 is Backend structured logging; F-378: domain-admin.md:68 bans console.log, the code is console.warn (maxbldHelp.ts:26; same pattern in analytics.ts:115, mmkvPersister.ts:51); F-441: x-verify.1 binds the integrate-N process, not a code comment; F-289: the 200-with-null contract is untouched; F-255: the meter row is written server-side (route.ts:183-188), not client-optional; F-259: the lookup descriptor lists semi (contract_parcels_lookup.descriptor.json:175).
- F-018 [HIGH] REJECTED:notbound/notthere
- F-066 [HIGH] REJECTED:notbound/notthere
- F-080 [HIGH] REJECTED:notbound/notthere
- F-093 [HIGH] REJECTED:notbound/notthere
- F-097 [HIGH] REJECTED:notbound/notthere
- F-098 [HIGH] REJECTED:notbound/notthere
- F-157 [HIGH] REJECTED:notbound/notthere
- F-179 [HIGH] REJECTED:notbound/notthere
- F-255 [HIGH] REJECTED:notbound/notthere
- F-259 [HIGH] REJECTED:notbound/notthere
- F-289 [HIGH] REJECTED:notbound/notthere
- F-378 [HIGH] REJECTED:notbound/notthere
- F-441 [HIGH] REJECTED:notbound/notthere

### R5: Touch-target list: C-9m checks per node, 48 px passes (REJECTED enforced)
Reason (ids: F-199 F-241 F-299 F-387): C-9m is per node: src/tests/surfaces/surface-conformance.logic.test.ts:871-880 "carries exactly one min-h- token, and it is a listed one"; a list of two sizes both at or above 44 passes; the bindings.json note wording ("exactly one ... on the list") is loose but the check passes; the 48 px is in the mock the operator approved (RR-0309, MORNING-DECISIONS.md:1199) and the note labels itself an orchestrator decision (not an operator ruling).
- F-199 [HIGH] REJECTED:enforced
- F-241 [HIGH] REJECTED:enforced
- F-299 [HIGH] REJECTED:enforced
- F-387 [HIGH] REJECTED:enforced

### R6: Query key and semi param: registry says depends only on parcelId, code obeys (REJECTED notthere)
Reason (ids: F-265 F-338 F-344): Spec 99:235 registry row says the key "depends ONLY on parcelId"; code useParcelLookup.ts:95 obeys it and documents that semi changes the request, not the key (:88-90). The slot sharing is a design choice; a re-entry without the param re-asks (lotForm needsSemiQuestion). Not a rule break.
- F-265 [HIGH] REJECTED:notthere
- F-338 [HIGH] REJECTED:notthere
- F-344 [HIGH] REJECTED:notthere

### R7: Record write deferred and no-flag channel: rulings decide (REJECTED ruling)
Reason (ids: F-455 F-464): McStorage P1/P3 record write: RR-0271 "ST.P1 keeps the record write at push 12" (MORNING-DECISIONS.md:1061; Spec 100:123 "nothing is written (the record write is ST.P1, task-265)"); doc-16 is DRAFT. The compute running again per open is the ruled state until ST.P1.
- F-455 [HIGH] REJECTED:ruling
- F-464 [HIGH] REJECTED:ruling

### R8: Empty finding (REJECTED empty)
Reason (ids: F-459): the finding reads "Clause: NONE / Diff: NONE / Lens claim:" (the lens line was "BUG severity=CRIT - NONE - NONE", pass-storage-p1-load1-2.txt:4); a parse artifact, no clause and no code.
- F-459 [CRIT] REJECTED:empty

## E. Sample of the MED and lower findings (30 of 390; stride sample across the 12 handbooks)

- F-024 [airtight MED] REJECTED:notbound: A27 #13 binds tests that need Postgres; customer-report-compute.logic.test.ts uses a scripted fake pool (test :6), no Postgres.
- F-013 [airtight LOW] REJECTED:notbound: read-stored.ts comment says the ledger "witnesses" the statement; src-sql-ledger.mjs:19-21 itself calls the libpg-query resolver "the ONE witness resolver"; a word choice, no rule broken.
- F-027 [airtight LOW] REJECTED:ruling: required footer prop rests on RR-0270 / MORNING-DECISIONS.md:1061 and :1066 (resolves).
- F-044 [bylaw MED] REJECTED:notthere: the core JSON-texts only trace and switches at its write boundary (core materializeRows, scripts/lib/compute/ engine module :651-662); flags stay an array (maxbld/rows.js:130).
- F-065 [bylaw MED] REJECTED:ruling: m.0 asked for what the change replaces; the comments cite RR-0278, RR-0307, RR-0310, RR-0271 and they resolve in rulings-register.json.
- F-089 [bylaw MED] REJECTED:notthere: the expected.jsonl read existed (runtime-loader test :41 at 9f04d9074) and moved into the helper; test code, behaviour same.
- F-104 [eng MED] REJECTED:notbound: Spec 00 5.2 infra tests are for a new API route or DB mutation; the compute entry reads only and the route has parcel-lookup-gate.infra.test.ts.
- F-135 [eng MED] REJECTED:ruling: the flag only lets the caller count their own lot (route.ts:146 comment); RR-0278 (MORNING-DECISIONS.md:1082) resolves; contract tests at parcel-lookup-gate.infra.test.ts:412.
- F-166 [eng MED] REJECTED:ruling: Spec 00 13.5 names a PostHog flag; the operator-ruled gate is the existing web live switch ALONE (Spec 100:123 note, ONE-35 b, RR-0271); D-1 is an open OPERATOR task-348. The project uses a code constant by ruling; flagged for the operator only as context.
- F-190 [eng MED] REJECTED:ruling: same as F-166 (report-page.ts:58 is the same switch).
- F-247 [fe MED] CONFIRMED: joins D3: descriptor :7 says six fields, types.ts:12-18 has seven.
- F-220 [fe MED] REJECTED:notbound: schemas.ts cites the contract descriptor which exists (contract_parcels_entitlement.descriptor.json:84 lists resetsOnDisplay); the lens could not see it.
- F-228 [fe LOW] REJECTED:ruling: placeholder change is RR-0313 (MORNING-DECISIONS.md:1216), noted at Spec 100:148.
- F-240 [fe LOW] REJECTED:ruling: landing footer is the shared footer, RR-0270 / :1066; ReportPage now requires the prop.
- F-257 [mobile-100 MED] REJECTED:ruling: the entitlement route pre-exists (MF-45); A.6 line is RR-0307 (:1182); Spec 126:1045 row A2 already says the search page shows the reports left.
- F-275 [mobile-100 MED] REJECTED:notthere: same as F-265: key depends only on parcelId as the clause says.
- F-290 [mobile-100 MED] REJECTED:ruling: the semi answer reaching no consumer yet is task-323 (page, mock and link only; calculation at 7.25).
- F-315 [mobile-96 LOW] REJECTED:ruling: placeholder wording, RR-0313.
- F-336 [mobile-99 LOW] REJECTED:notbound: Spec 99 section 3 matrix is for store fields; entitlement is a server read (query key, D4).
- F-362 [mobile-99 LOW] REJECTED:ruling: Continue flow is task-319 / RR-0278 / mock approved RR-0309 (:1199).
- F-379 [mobile-core MED] REJECTED:notthere: expo-web-browser is already in mobile/package.json:46 and used at useSubscribeCheckout.ts:15; package.json unchanged in the range.
- F-393 [mobile-core LOW] REJECTED:empty: no finding: asks for a clause to be pasted.
- F-407 [spec08 MED] CONFIRMED: Spec 08:181 and :339 "Security fires only on money/auth/PII/admin"; backlog-lane.mjs:140 const sec = /entitlement|auth|stripe|metered/i has no admin or PII term (task-358, 2b16b3810); joins D11 as tooling.
- F-409 [spec08 NIT] REJECTED:notbound: a line number without a sha date in a prompt string; no gate or rule makes this a defect.
- F-420 [step MED] REJECTED:notthere: the population override is the descriptor-declared setting (descriptor :360), only its value is supplied.
- F-432 [step LOW] REJECTED:notbound: x-validate.1 grades a step; proof-slice is the ruled PROOF.TOOL runner (MORNING-DECISIONS.md:1178).
- F-445 [step MED] REJECTED:ruling: D-1 is an open OPERATOR task-348, stated in the code header; the entry is dark behind the existing switch.
- F-467 [storage MED] REJECTED:ruling: the hold is SRCH.METER-2 from RR-0278; doc-16 is DRAFT.
- F-483 [storage MED] REJECTED:ruling: the long wait sits behind the loading screen (RR-0271 LOAD.1; MORNING-DECISIONS.md:785); doc-16 section 7.2 is DRAFT.
- F-403 [queue LOW] REJECTED:notbound: Spec 137 rule 3 status line is the task file in the same commit, enforced by check-backlog-task.mjs (BL-HYG TRIAGE precedent).

## F. Counts
CRIT and HIGH: {"CONFIRMED":22,"CONFLICT":7,"REJECTED:enforced":22,"REJECTED:ruling":33,"REJECTED:notbound/notthere":13,"REJECTED:notthere":3,"REJECTED:empty":1}
Sample: {"REJECTED:notbound":8,"REJECTED:ruling":14,"REJECTED:notthere":5,"CONFIRMED":2,"REJECTED:empty":1}
