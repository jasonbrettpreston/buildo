◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
REVIEW template=lens-compliance.md model=deepseek-reasoner at=2026-11-20T15:23:26.831Z file_sha256=477294694a2a56fa79d70b766bd18100e4ec346ea99f1fca87b0ef6ceef32e2f prompt_sha256=af9f5564f090576a0220b7fbd8238f566c58b486965c17f9b5c485dacb837c9b
🔍 Lens review of /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/fixspecs/lens/surface-126-p1.txt (model: deepseek-reasoner)

[deepseek-review] deepseek-reasoner working… reasoning 11315 chars, answer 0 chars, 15s
[deepseek-review] deepseek-reasoner working… reasoning 23075 chars, answer 0 chars, 30s
[deepseek-review] deepseek-reasoner working… reasoning 34791 chars, answer 0 chars, 45s
[deepseek-review] deepseek-reasoner working… reasoning 46128 chars, answer 0 chars, 60s
BUG severity=HIGH — 126 §0b item 9 "No rule, no decision on the side. Where no rule governs, the nearest related rules are cited and the question goes to the operator as a ruling" — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "when the server's own read of `lotForm` says `unsure` and the request does not carry `semi=answered`, `page` is sent null and neither the stored read nor the compute runs; the meter is logged `semi_pending` and counts nothing ... this item is task design and not an operator ruling" — a metering-affecting behaviour with no governing ruling is landed as settled in the governing spec, so the spec now binds a behaviour no ruling names and the question was never put to the operator — file the semi flag and the `semi=answered` key as one operator decision and mark items (2) and (3) pending until RULED, or land them as a §4 category 12 `deviations {from, why, adjudicated_by, date}` entry

BUG severity=MED — 126 §4 category 2 "`contract_ref[]` (ids into the CONTRACT registry, **never an inline schema**) · params · `query_key` · `version_pin` · `field_whitelist`" with "**Omission is a build failure**" — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "the `semi=answered` request key (task-319 stage 2, `types.ts` Query schema; valid only beside `parcelId`)" — the only change to the lookup descriptor in this commit is the `docs.data_story` sentence, so a request parameter that decides whether a report is counted is declared in prose only and not as a contract input field — declare `semi` (enum, valid only beside `parcelId`, default) in `contract_parcels_lookup.descriptor.json` `inputs.params` in this commit

BUG severity=MED — 126 §3.1 "**QUERY** | 46 | `/api/admin/stats` (reads **18 tables**) | `response.projection` (explicit pick-by-name whitelist) · `response.tiers[]` + per-tier degradation · `database.reads[]`" — scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:86 "\"tables\": [" and :189 "\"projection\": \"none\"" — the contract's table reads are carried as `inputs.tables[]` and no `response` block appears anywhere in the changed range, so two QUERY-mandatory answers (`database.reads[]`, `response.projection`) are not given — add `database.reads[]` and `response.projection` naming the seven fields, or record why the contract schema homes them elsewhere as a `deviations` entry

DEFER severity=MED — 126 §0b item 6 "landed as a Spec 135 FE row with one lock (Spec 135 rules 2, 3 and 5) or as a dated note with the prior text kept (M-246, `69a_mcbylaw_register.md:141`)" — contract_parcels_entitlement.descriptor.json:7 "whitelist of seven fields (corrected 2026-11-20, M-246, FIX.SPECS · task-376: this line counted six until the seventh" with src/tests/spec-notes-1b.logic.test.ts "expect(JSON.stringify(d)).not.toMatch(/\bsix (fields|inputs)|exactly the six/);" — the note cites M-246 while the prior wording is deleted and a test forbids its return, whereas the lookup descriptor in the same commit keeps its prior sentence in quotation marks — keep the old "six fields" wording in quotes as the lookup descriptor does and scope the assertion to the unquoted text

DEFER severity=MED — 126 §2 "(source of record `scripts/surfaces/_schema/surface-census.json`, drift-locked by `src/tests/surface-registry.infra.test.ts`)" — src/tests/spec-notes-1b.logic.test.ts "const CENSUS = 'scripts/surfaces/_schema/census/contracts.json';" — the commit makes a second file the equality target for the same two descriptors, so one fact is now drift-locked against two sources and the pasted single source of record is not the one asserted — point the test at `surface-census.json` or correct §2's path in this commit

DEFER severity=MED — 126 §0b item 6 "landed as a Spec 135 FE row with one lock" — docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:53 "This is a component of this row's standard ... not a new FE row and not a new lock" while the same commit adds "src/tests/spec-notes-1b.logic.test.ts" that fails when the note text changes — the footer ruling is in fact locked by a third file the register disclaims, so the register misstates what holds it and the row's declared lock path is not the one enforcing it — name the new test as the FE-31 lock addition, or drop its text-pinning cases

DEFER severity=MED — 126 §0b item 10 "The cases are rows of one catalogue, `tests/e2e/scenarios.json`; each names its owning task and a status" — 100_mobile_parcel_cost_tool.md:125 "A hit with no `page` is served and logged `meter: not_produced` ... the meter is logged `semi_pending` and counts nothing" — three new observable states land with no catalogue row added anywhere in the diff, so the e2e catalogue cannot run them and the new test only reads text — add scenario rows for `not_produced` and `semi_pending` naming task-334 and task-360

MET — 126 §0b item 6 "the operator's own words with the date and the record path" — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 — quotes the metering words verbatim with the date 2026-11-19, RR-0278, decision-81 and `MORNING-DECISIONS.md:1082`

MET — 126 §0b item 6 "A ruling does not stay only in a scratch file: it lands with its row's next docs commit" — all four changed files — the RR-0278 words land in Spec 100, Spec 126 and the lookup descriptor in this one commit, prior text kept in the latter two

MET — 126 §4 category 7 "**never `\"none\"`**" — contract_parcels_entitlement.descriptor.json:193-216 — `checks[]` carries three entries, none of them `"none"`

REJECT — 126 §0b item 1 "No McFrontend work starts without its row in `.cursor/MCFRONTEND-QUEUE.md`" — the change is accused of doing MaxBLD surface work with no queue row — task-376 is a FIX.SPECS lane task answering the grounder verdicts, and its one rule-touching item cites the existing footer row MF-91 (task-332), so item 1 is not engaged

VERDICT: FAIL on compliance with the pasted clauses
Clauses checked: 14   Unmet: 6

---
⏱  74764ms (74.8s)
📊 Tokens — total: 48553, input: 32576, output: 15977, reasoning: 14320
