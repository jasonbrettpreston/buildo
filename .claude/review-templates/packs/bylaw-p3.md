# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): By-law handbook (Spec 133 section 2, rules by provision family)
Source: docs/specs/01-pipeline/133_bylaw_handbook.md:28-1826
Generator: scripts/generate-bylaw-handbook.mjs --write, from scripts/analysis/bylaw/_schema/bylaw-rule-map.json (Spec 69a M-rows, Spec 131 LC-rows)
Rules in the whole list: 543 (counted by pattern /^- \*\*(m|lc)\.\d+\*\*/) · this is part 3 of 4


- **m.122** Exception or former-density context is not comparable.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness, from round 3

- **m.123** An end-of-regulation tag is regulation-level for law-at-date.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness D8; census line

- **m.124** Oracle C not_comparable reasons, in evaluation order, first wins.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness reason set + oracle_c_version

- **m.125** coa_mismatch names the wrong side.
  Status: RATIFIED 2026-10-14 · Enforced by: vocab adjudication_kind (bylaw-rulings M-125 test); record shape declared until the first record lands

- **m.126** Oracle C plus an operator law-text sample is the table-accuracy evidence while D is unavailable.
  Status: RATIFIED 2026-10-14 · Enforced by: Round report lines; Phase 3 entry (4)

- **m.127** D7 link and lot inputs for oracle C.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness link_status

- **m.129** A Ch.900 unit need not account for its own exception's header id.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE; exception_header_ids count

- **m.130** A LIMIT may be partly modelled when an inexpressible arm is an additional requirement on the same subject; new target aggregate_side_setback_m.
  Status: RATIFIED 2026-10-14 · Enforced by: vocab literal_not_expressed_reason, dsl_target; G-SHAPE (bylaw-s6g M-130 fixtures); G-CLAUSE

- **m.131** A lead-in limit shared by several leaves is keyed on each LIMIT leaf of the same target.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE; G-SHAPE

- **m.132** Phrasing-variant licence patterns, W1 batch.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE variable_unlicensed, vocab_synonym (bylaw-rulings M-132 test)

- **m.137** W1 lead-in groups are fixed once a shard is drafted.
  Status: RATIFIED 2026-10-14 · Enforced by: keying-cli plan --batch W1 refusal w1_drafted_shard_moved

- **m.138** Derived named-address fields. Beside the raw applies_to.refs[] and instrument.citation, a pure deterministic parse produces addresses[] (number, suffix, street key, range, parity with parity_basis) and citations[].
  Status: RATIFIED 2026-10-14 · Enforced by: scripts/analysis/bylaw/named-addresses.mjs tests; M-117 lock

- **m.139** Named-address match_status, roll-up and precision bar.
  Status: RATIFIED 2026-10-14 · Enforced by: named-address runner; precision sample record

- **m.140** An applicability oracle replaces the M-29 expert sample for condition, applies_to and application.
  Status: RATIFIED 2026-10-14 · Enforced by: Applicability oracle round record

- **m.141** Applicability conventions. P6: a use is listed in application.uses only when the clause regulates that use itself.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE (evidence); applicability oracle cards

- **m.143** In an UNUSUAL unit, a real rate or dimension literal is limit_not_modelled.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; G-CLAUSE

- **m.144** CR Development Standard Set scope.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; M-149

- **m.146** Space-kind targets are planned for Phase 2.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; vocab (Phase 2)

- **m.148** A permission conditioned on a measure is a PERMIT.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE

- **m.149** Scope before value. A unit whose applicability turns on a fact that no token or input tests (driveway location, drive-aisle width, standard set, stacked spaces, extension, a disjunctive scope such as "a lane or a flanking street") is not a Layer 2 candidate.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; triage sweeps

- **m.150** One sweep per relabel rule. A ruling that relabels literals (M-102 now, as M-89 before it) is applied by one mechanical M-75 sweep over every agreed unit, e.g. measured literals under count_or_ordinal_not_a_limit / cross_reference_value on LIMIT / UNUSUAL units.
  Status: RATIFIED 2026-10-14 · Enforced by: M-75 corrections; sweep record

- **m.151** Twins key alike: a report-only G-STANDARD listing.
  Status: RATIFIED 2026-10-14 · Enforced by: G-STANDARD report (report-only)

- **m.152** An arm binds to its area. A statement whose arm names a map area applies only where that area holds.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; M-149 · +2 dated notes

- **m.153** K7-R scenario grain. Under a pinned class catalogue, one K7-R item is signature × lot gate × target × permitted class, lot-weighted by the signature's lots.
  Status: RATIFIED 2026-10-14 · Enforced by: prereg-1 grain declaration; round record

- **m.154** no_candidate where a rule carries the target but none applies is an answer.
  Status: RATIFIED 2026-10-14 · Enforced by: prereg-1 k7r_class_map; round record · +1 dated note

- **m.155** "Existed on the day of the enactment" is a value form, never a lot condition: a standing applicability-oracle dismissal.
  Status: RATIFIED 2026-10-14 · Enforced by: Applicability-oracle harness (auto-tag + count)

- **m.156** The pre-1953 rear-addition family carries its lead-in condition on every leaf.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE; G-SHAPE; applicability oracle

- **m.160** Dwelling-unit counts of the Layer 2 v1 P classes.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab scenario_class_units

- **m.165** A permission of a non-residential use takes subject non_residential_building.
  Status: RATIFIED 2026-10-15 · Enforced by: G-SHAPE PERMIT subject; G-CLAUSE evidence

- **m.167** A named-road arm under a licensed street-setback lead-in is a LIMIT.
  Status: RATIFIED 2026-10-15 · Enforced by: G-CLAUSE; G-SHAPE

- **m.168** permitted() reads proposed_height_m per P class as the lot's own permitted maximum height.
  Status: RATIFIED 2026-10-15 · Enforced by: evaluator permitted() (P2-0 seat, owed) · +1 dated note

- **m.172** Site facts versus design choices: MaxBLD is theoretical, so a permissive design-choice condition is taken as met and disclosed as how the answer is achieved.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab undetermined_condition_disclosure, design_choice_disclosure (bylaw-rulings M-169 / M-172 tests);… · +1 dated note

- **m.188** McBylaws Airtight is the McBylaw standard.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 68 §5a (mechanisms per part); the admission lock (OWED, keying lane)

- **m.195** A house with a secondary suite reports 2 units; whether the suite counts toward 'u' is disclosed until M-177(4) rules.
  Status: RATIFIED 2026-10-18 · Enforced by: P2-10 (OWED)

- **m.213** Heritage, ravine, holding and Chapter 900 gate or disclose.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①)

- **m.220** Evaluator defect: no 'u' label gives not_evaluated:label_value_absent:u instead of no cap (reality check §5.2).
  Status: APPLIED 2026-10-18 · OWED · Enforced by: INV-19 (M-220 label arm): bylaw-evaluator-fixes.logic.test.ts › "INV-19 — …" › "M-220: …" (green); the…

- **m.223** Layer 3 vocabulary gaps the reviews found (reality check §5.1 items 3, 4, 9, 10).
  Status: APPLIED 2026-10-20 · Enforced by: vocab + bylaw-rulings tests (OWED, by-law keying/evaluator lane) · +2 dated notes

- **m.226** Priority Retail Streets: a minimum along-frontage length before on_priority_retail is set.
  Status: RULED 2026-10-19 · Enforced by: Spec 65 enrich_parcels (deferred: PIN PR-2, residential focus)

- **m.231** An unauthored exception gates the whole lot, written per target.
  Status: RULED 2026-10-20 · Enforced by: spec134-resolve-bylaws.logic; Spec 134 I4 / I6 at ① (OWED, step lane)

- **m.232** Two closed status sets joined by one declared total map.
  Status: RULED 2026-10-20 · Enforced by: spec134-resolve-bylaws.logic; the layer2-map lock at ① (OWED, step lane)

- **m.233** Layer 2 v1 resolves principal + garden suite + laneway suite; storage is measured against the §6.8 kill line.
  Status: RULED 2026-10-20 · Enforced by: P2-0 round record; Spec 134 storage check at ② (OWED, step lane); spec134-resolve-bylaws.logic

- **m.234** Layer 2 v1 is narrowed to what the scenario step needs.
  Status: RULED 2026-10-20 · Enforced by: spec134-resolve-bylaws.logic; the step's I1 check at ① (OWED, step lane) · +1 dated note

- **m.238** M-223(1) not_buildable scenario status
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-2.logic.test.ts › "CHAT-10 / M-223(1) — …"

- **m.246** A dated note may be appended inside a row's status cell.
  Status: RULED 2026-10-20 · Enforced by: decision-log.logic (the record)

- **m.295** effective() returns a structured losers[] beside the free-text trace.
  Status: RULED 2026-10-21 · Enforced by: bylaw-losers.logic.test.ts (red first: docs/reports/red-evidence/bylaw/l2-losers-red.json, 11 red)

- **m.296** exceptionClosure(lot, candidates) is the one pure export that lists a lot's exception closure.
  Status: RULED 2026-10-21 · Enforced by: bylaw-exception-closure.logic.test.ts (red first: docs/reports/red-evidence/bylaw/l2-closure-red.json, 7 red)

- **m.298** The scenario class vectors: five Spec 78 P5.1 classes, one new.
  Status: RULED 2026-10-21 · Enforced by: bylaw-layer2-vocab.logic.test.ts › "L2-CLASSES", "PIN L2-KEY-READPATHS"

- **m.265** An INCLUDE to a Ch.900 exception links that exception to the lot, so a site-specific numeric limit reaches the evaluator and outranks the base-zone "no limit".
  Status: RULED 2026-10-21 · OWED · Enforced by: bylaw-fix-4d-a.logic.test.ts › "F-4D-2 / F-4D-18 / F-4D-SC-1462 …" (red first:…

- **m.268** Exceptions authored through the double-keying harness: 1389, 528, 245, 256 complete; 1437, 1436, 1434, 117, 258, 287, 199 keyed with units pending adjudication; 317 held.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4d-a.logic.test.ts › "F-4D-10 / F-4D-16 …" (red first: docs/…

- **m.305** The CoA notice reader and scorecard tools live in scripts/analysis/bylaw-validation/coa-*; data are passed by path.
  Status: RULED 2026-10-21 · Enforced by: src/tests/coa-scorecard.logic.test.ts · +1 dated note

- **m.307** A non-569 zone or an unmatched address is NOT SCORABLE, not a miss.
  Status: RULED 2026-10-21 · OWED · Enforced by: src/tests/coa-scorecard.logic.test.ts › "F-4D-20 …"

- **m.308** Survey dimensions are preferred when held, and a parcel row that disagrees with the survey by more than 5 percent is flagged: an explained data flag, no by-law change.
  Status: RULED 2026-10-21 · Enforced by: src/tests/coa-scorecard.logic.test.ts › "F-4D-9 …", "F-4D-8/9/14 …"

- **m.309** 39 Kirknewton Rd is file A0428/26TEY; A0974/16EYK is an earlier file for the same lot.
  Status: RULED 2026-10-21 · Enforced by: none (data)

- **m.310** A basement without underpinning is not CoA-testable.
  Status: RULED 2026-10-21 · Enforced by: none (data)

- **m.311** 202 Lippincott St (A0375/26TEY) stays semi-detached, as the City notice words it.
  Status: RULED 2026-10-21 · Enforced by: src/tests/coa-scorecard.logic.test.ts › "CHAT-45 …"

- **m.312** OWED: the calculator takes an optional survey override; drafted, not built.
  Status: OWED 2026-10-21 · Enforced by: none · +1 dated note

- **m.317** Building-history conditions are keyed on the existing-building route (keying rule 31), and five numeric adjudications land.
  Status: RULED 2026-10-22 · OWED · Enforced by: bylaw-exc-w2-apply.logic.test.ts (red first: docs/reports/red-evidence/bylaw/bylaw-exc-w2-apply-red.txt) · +3 dated notes

- **m.318** One values-only answer key (oracle C) holds every CoA source.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED with the key)

- **m.319** Values-only oracle C fixtures are committed to the repo; this amends M-305 clause (2).
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED: the fixtures-vs-lock test)

- **m.320** Each City figure is scored against the by-law in force on its decision date.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.321** Each CoA fix round pre-registers the rows it expects to move.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.323** CoA files join the answer key through one fixed intake routine.
  Status: RULED 2026-10-22 · OWED · Enforced by: none (a routine)

- **m.324** CoA findings pages go family first.
  Status: RULED 2026-10-22 · OWED · Enforced by: none (a page rule)

- **m.325** Phase 3 validates against oracle C with two separate sets of floors.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.326** Each CoA document type has one job and an order of authority; this settles M-312.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet

- **m.327** Phase 3 golden cases are keyed on one generated form.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.328** Every by-law rule and decision passes the five words, adds no scope, and shows its handbook ruling.
  Status: RULED 2026-10-22 · Enforced by: spec-split-check.mjs --check arm (iii-b); decision-log.logic

- **m.329** The CoA-to-parcel link gate prints beside every oracle C round and blocks only the Phase 3 switch.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED with Round 0)

- **m.330** Calculation floors are set at Phase 3 Round 0 and then only rise.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.331** "McBylaw P2 closed" and "McBylaw P3 closed" have fixed meanings.
  Status: RULED 2026-10-22 · Enforced by: none (a definition)

- **m.332** The coa_notices chain ingests the new values-only CoA notice batches as soon as possible.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED with the Spec 129 amendment)

- **m.333** Plan facts are ingested as values into a new table coa_plan_facts.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED with the Spec 129 amendment)

- **m.334** Four G-CLAUSE licence patterns are added (pattern growth by ruling, M-132).
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.335** A building-type word followed by a street suffix is not a named type.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.337** 63 Johnston Ave is a scoped DATA flag until the parcel row is fixed.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.338** A garage or ancillary setback is keyed to the yard the clause names.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.339** Every NOT_EVALUATED code the evaluator can emit has a test fixture that produces it.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.340** The R-DET ban list also covers scripts/lib/bylaw-resolution.js.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.341** Layer 3 not-applicable reasons are a closed list.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.342** A Layer 2 target flat_roof_main_wall_height_m (RD 7.2 m) is keyed and pinned.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.343** A register row whose status starts RULED is authority for --accept --ruling.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.344** The houseplex lifted cap is a Layer 2 target keyed from 600.60.40(1)(A).
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.345** Six non-law constants of the Phase 3 modules are registered as model_heuristic.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.346** An absence ruling is not blocked by a unit whose lot condition is known false.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.348** Two Phase 3 gates are fixed: the shadow gate blocks on Layer 2 defects, the hidden-number check blocks at Phase 3 close.
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.349** Seven G-CLAUSE licence-pattern wordings are added (pattern growth by ruling, M-132; extends M-334).
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.351** Rounds 9 to 13 stand as applied.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.352** The Phase 3 shadow classifier reads only a drafted closed fact list.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.353** A statement cites its clause by the full unit path.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.354** A two-arm storey condition may be written as a conditional expression.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.355** Corrected rule bases from the citation review.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.356** Phase 3 validation also checks against the plan facts, alongside the golden cases.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED: the P4 round)

- **m.358** Phase 3 formulas are proven on calculator-checkable worked examples before golden-case keying is scored.
  Status: RULED 2026-10-24 · OWED · Enforced by: none yet (OWED: the worked-example suite and its operator-checked spreadsheet) · +1 dated note

- **m.359** Phase 2 closes on six items (amends the P2 meaning in M-331).
  Status: RULED 2026-10-29 · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)" · +1 dated note

- **m.361** Maximum build edge cases: no cap only where the zone has no article, a past-date lot is today's lot, no storey limit leaves height alone.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.362** Phase 3 closes on the max build achieved for the case's own building type, plus fixed thresholds set before the results.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.363** P3-HOLD-1 ends: the engine and its 40-test lock return together at MB-14.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.364** The blind harness scores by six rules, fixed before any run.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.367** Old hard-coded zoning values are not shown until each field group is switched.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.368** The night restore disables triggers on the tables it restores, inside the restore transaction.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.370** The notice requirement figure is the number tied to the limit word.
  Status: RULED 2026-10-29 · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.371** Every product zoning number comes from a keyed by-law clause.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.375** P-2 scope check notes: Spec 58 §13 consumers, user inputs, in_force_basis.
  Status: RULED 2026-10-29 · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.378** One switchboard turns clauses, formulas, scenarios, building types and readings on or off.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: switchboard.logic.test.ts (MB-31); record: chat-rulings-register.logic.test.ts ›…

- **m.379** The house with a secondary suite differs from the detached house only through LC-33 gain reasons; INV-3 is about the rear suite.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: invariant row in the loop set (MB-64); record: chat-rulings-register.logic.test.ts ›…

- **m.380** Expected answers are the authority and are protected.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: protected-path pre-push summary; loop record (MB-64, MB-68); record:…

- **m.381** Before a ruling is recommended, the register is searched for conflicting rows.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-67: decision-log --check arm (MB-67); record: chat-rulings-register.logic.test.ts › "CHAT-211/212…

- **m.382** Definition of done and the held-patch limit.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-67: mcbylaws-queue-check.mjs, once N is ruled; record: chat-rulings-register.logic.test.ts ›…

- **m.383** The five objectives bind every McBylaws phase.
  Status: RULED 2026-10-30 · Enforced by: spec133-bylaw-handbook.logic.test.ts renders the row (text present); record:…

- **m.384** Phase 3 is tables, not code (CARD P3-DATA-MODEL and the narrowed CARD-L3-REBUILD).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: layer3-catalogue.logic.test.ts; record: chat-rulings-register.logic.test.ts › "CHAT-211/212…

- **m.377** The formula catalogue is M-61's formula registry (dated note on M-61 and M-72, as a row because they sit in the frozen M19 block).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: layer3-catalogue.logic.test.ts; loop-record.logic.test.ts; bylaw-p3-dsl.logic.test.ts…

- **m.385** Undecided never means zero (R3-01).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: red fixture: A0067 building_depth_m not_evaluated gives footprint not_evaluated (MB-31);…

- **m.386** Flags propagate (R3-02). Operator approved 2026-10-30 (chat, "0-1 approve, 0-17 approve,0-18 approve s-1 approval to find a citable one.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: shape test: no headline without its inputs' flags (MB-31); record:…

- **m.388** Calibration is tested on held-out data (R3-04).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: disjointness test: the held-out half shares no lot with the fit set; record:…

- **m.389** Options: a dropped option is recorded with its reason (R3-05).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: options fixture: all dropped gives not_permitted/not_evaluated (MB-31); record:…

- **m.390** Ideal split breakpoints are generated (R3-06).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: dense-grid test-lane check never beats the breakpoint answer (MB-31/MB-64); record:…

- **m.392** Shape switch fails closed without a fit (R3-10).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: switch test, once the bounds are ruled; record: chat-rulings-register.logic.test.ts ›…

- **m.393** Unresolved classes answer not_modelled (R3-11).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: fixture: houseplex 5-6 returns not_modelled (MB-31); record:…

- **m.400** Phase 2 stores one result per design option (P2-OPT, O-17).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-18: resolve_bylaws option-key test (MB-18); record: chat-rulings-register.logic.test.ts ›…

- **m.402** Show every feasible option, the largest as the headline.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: options fixtures (MB-31); record: chat-rulings-register.logic.test.ts › "CHAT-211/212…

- **m.403** The rear suite and main house are split at the best breakpoint.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: worked examples + oracle for two lots (MB-31/MB-64); record:…

- **m.396** Precedent is classified before it is shown (R4-03).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-27.L2: precedent classification test (first sixplex increment); record:…

- **m.397** Options and headline (R4-04). Operator approved 2026-10-30 (chat, "approve all recommendations"; card ~/Buildo-scratch/p2close/CARD-wave0-approval.answered.md; the amendments and queue set approved at O-1, CARD-plan-1030-approval.answered.md; 2026-10-30-batch-ak#CHAT-212.R4-04).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: options/headline fixtures (MB-31); record: chat-rulings-register.logic.test.ts ›…

- **m.399** S-1 direction (R4-06). Operator approved 2026-10-30 (chat, "approve all recommendations"; card ~/Buildo-scratch/p2close/CARD-wave0-approval.answered.md; the amendments and queue set approved at O-1, CARD-plan-1030-approval.answered.md; 2026-10-30-batch-ak#CHAT-212.R4-06).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: blocked on the S-1 card (no value is ruled); record: chat-rulings-register.logic.test.ts ›…

- **m.406** Phase 2 stays strict (I10); "the lot is unchanged since 2013" is a disclosed site-fact assumption resolved per option.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-18: resolve_bylaws I10 lock: the assumption is recorded and disclosed per option (MB-18); record:…

- **m.407** LC-68 clarified: 4 stored points is a triangle with no rear lot line; "flagged" is a listed count (dated pointer on LC-68).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-18: lot-flag golden-lot default test: 4 stored points is a triangle with no rear lot line (MB-18,…

- **m.408** A "rule-choice branch" (Spec 68 SC-14) is a zone-symbol or building-type literal in a Layer 2 closure file.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-18: bylaw-gexclit.logic.test.ts: report-only detector of rule-choice branches, baseline 0…

- **m.409** RB-D10 is closed by dropping only value.ratio of the storage_within_budget audit row from the compared golden.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-18: capture-step-golden.logic.test.ts: only value.ratio of the storage_within_budget audit row is…

- **m.410** The MB-18 claim edits the one lineage line for the fallback target.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-18: the layer2 lineage lock (both ways) stays green with the one added line (MB-18); record:…

- **m.411** Where the increment-1 loop data and pending tests live.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: protected-paths.json lists the three globs; pending/ rule R-KI (MB-67, MB-68); record:…

- **m.412** Increment 1 computes the whole front-yard chain and the corner street-side term.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: increment-1 worked examples FY-1.. and the corner cases A0166, A0375, A0578 (MB-64); record:…

- **m.413** Increment 1 reads building_length_m on the depth axis as G-1 is printed.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: increment-1 footprint examples with building_length_m on the depth axis (MB-64); record:…

- **m.415** The runRow seam and the rounding contract.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: examples-run test through the seam (MB-31 exposes runRow, MB-64 consumes it); record:…

- **m.416** Which applicant notices the comparison fields score.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: compare-25 generator: type_comparable cases (MB-64); record:…

- **m.417** Increment 1 reads the permission word only; permitted is provisional.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: increment-1 inputs file: permitted cells tagged provisional (MB-64); record:…

- **m.418** Settings seeds for increment 1 are corrected.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: settings-block drift test: every increment-1 variable is seeded with its source (MB-31);…

- **m.419** An unlimited storey cap means S-1 applies; unlimited is never a GFA storeys term.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: worked example GFA-9 and the 14 unlimited-storey cases (MB-64); record:…

- **m.420** An absent principal gfa_m2 target drops out of the GFA minimum.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: increment-1 GFA examples with no principal gfa_m2 term (MB-64); record:…

- **m.421** The corner flag the scorer reads is the parcel's, shown beside the keyed golden flag.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: o13-input-findings: corner cases A0179, A0553, A0562 scored on the parcel and shown on both…

- **m.422** FS-SB2a: the front-yard placeholder's street term is the mean of the ring lots beyond the abutters (amends FS-SB2).
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the catalogue row front_setback_used_m and the two variables…

- **m.424** L31-13: the street a lot is on is its frontage street (primary_frontage_street_name).
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the neighbour-facts reader filters on primary_frontage_street_name; record:…

- **m.425** L31-14: S-1 storey counts are a disclosed theoretical maximum; both options stay shown.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the flag storeys_from_minimum_ceiling and the invariant a + storeys x f <= height_m in the…

- **m.426** Compliance condition for FS-SB2a: no code in Phase 3.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31 and MB-67: a lock that the evaluator has no front-yard branch and the reader chooses nothing;…

- **m.427** Note for MB-57: the stored street_name_normalized conflicts with the frontage street on 3,336 lots and is absent on 27,680.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-57: the street-name defect; record: src/tests/chat-rulings-register.logic.test.ts › "CHAT-214…

- **m.428** O-19: the reason token not_evaluated:setting_out_of_bounds joins the closed reason list.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the reason word in vocab.json and the out-of-bounds setting test; record:…

- **m.429** O-20: the R3-10 shape switch states are shape_calibrated, setting_not_fitted and switched_off.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the switch states in the switchboard and the R3-10 switch test; record:…

- **m.430** O-21: no cross-bound; a ring minimum above the ring depth falls back to the street median, flagged "ring not used".
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the fallback branch of the front-yard catalogue row and its worked example; record:…

- **m.432** L31-15: the ring walk of FS-SB2a.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the declared ring read in the step descriptor and the ring-walk oracle…

- **m.433** L31-16: fya_placeholder_ring_min_n has bounds 1..4.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the seed bounds, the explicit UPDATE of the four descriptions and the settings drift test;…

- **m.434** L31-18: FS-SB2a is labelled "calibration provisional"; the pinned audit is a split-sample check, the fresh re-fit waits for newly measured lots.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-68: the split-sample audit pinned in the loop; MB-68 names the fresh measured source before the…

- **m.436** McProof (MCPROOF-1): define the questions.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.437** McProof (MCPROOF-2): evidence sweep.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.438** McProof (MCPROOF-3): independence. Text home: Spec 08 §11.7.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.439** McProof (MCPROOF-4): regression sweep.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.440** McProof (MCPROOF-5): six-stage review.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.441** McProof (MCPROOF-6): build validation.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.442** McProof (MCPROOF-7): what stays with the operator.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.443** McProof (MCPROOF-8): after all calculations work.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…

- **m.444** McProof (MCPROOF-10): sizing by risk.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-77: sub-items (a) sizing.mjs, (b) the McProof builder changes, (c) the prompt builder (lane T,…
