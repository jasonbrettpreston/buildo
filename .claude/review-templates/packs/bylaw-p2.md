# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): By-law handbook (Spec 133 section 2, rules by provision family)
Source: docs/specs/01-pipeline/133_bylaw_handbook.md:28-1826
Generator: scripts/generate-bylaw-handbook.mjs --write, from scripts/analysis/bylaw/_schema/bylaw-rule-map.json (Spec 69a M-rows, Spec 131 LC-rows)
Rules in the whole list: 543 (counted by pattern /^- \*\*(m|lc)\.\d+\*\*/) · this is part 2 of 4

### Chapter 150

First clause cited: 150.15, 150.7, 150.50, 150.48, 150.10, 150.8.

- **m.47** Page set, second application. In: the 23 residential TOC entries S0.5 found unmapped — 1.20, 1.40, 150.15, 150.20, 150.22, 150.25, 150.30, 150.45, 150.48, 150.50, 200.10, 200.15, 200.20, 200.25, Ch.220, Ch.230, 970.30, Ch.990 (the zone map, by a map rule: labels come from the zoning dataset,…
  Status: RATIFIED 2026-10-07 · Enforced by: G-UNIVERSE · +2 dated notes

- **m.63** A closed scenario catalogue; every scenario is computed for every parcel; no user choice.
  Status: RATIFIED 2026-10-07 · Enforced by: G-DRIFT (catalogue pinned; entry condition); G-UNIVERSE scenario-totality arm; step checks: one status per…

- **m.66** Parking is a scenario axis K = {none, integral garage, detached garage}, applying only the rules that change buildable size.
  Status: RATIFIED 2026-10-07 · Enforced by: catalogue pin (M-63); collapse equalities (fixtures + per-parcel check); G-EVAL vectors per K value incl. a…

- **m.96** driveway_width_m licence pattern "the driveway is no more than".
  Status: RATIFIED 2026-10-13 · Enforced by: G-CLAUSE variable_unlicensed, vocab_synonym

- **m.106** An encroachment maximum paired with a clearance minimum is UNUSUAL — M-102 "mixed bound directions" reaches the M-73 pair.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE shape_must_be_none, G-CLAUSE; the re-type card

- **m.159** A unit governs only its own subject.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab zone_category_chapter, accessory_structure_use, specific_use, non_accessory_use, uses (bylaw-rulings… · +1 dated note

- **m.177** Ancillary and secondary suites: priority and max-build assumptions.
  Status: RATIFIED 2026-10-16 · Enforced by: scenario-classes.json pin (A axis, P suite variants) in P2-10 (phase2-plan-v2 §P2-10); structure dimension… · +2 dated notes

- **m.178** The 24 July 2025 suite transition is a lawfully-existing cut-off; its permit-history arms are a site fact.
  Status: RATIFIED 2026-10-16 · Enforced by: vocab lawfully_existing_caveat.cutoff.suite_transition, lot_condition.suite_transition_permit,…

- **m.179** Two suite keying rulings the review surfaced.
  Status: RATIFIED 2026-10-16 · Enforced by: vocab dsl_target.ancillary_coverage_pct; M-75 corrections (150.7.60.70(1)(A)/(B), (2)(A), 150.8.60.70(1)(B),…

- **m.193** The Coxwell-area 5.0 m separation is digitized as a map area; until then 7.5 m applies, disclosed.
  Status: RATIFIED 2026-10-18 · Enforced by: map seed + migration (OWED, Spec 58 lane); re-key (OWED, keying lane)

- **m.197** Suite setbacks: the openings choice defaults to none, so the smallest lawful setback leads.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.13 setback vectors (OWED, step commit ①) · +1 dated note

- **m.198** Suite setbacks where a lot fact is not held.
  Status: RATIFIED 2026-10-18 · Enforced by: lot-line classification (OWED, Spec 130 lane); P5.13 (OWED, ①) · +5 dated notes

- **m.199** A secondary suite may be up to 45 % of the interior floor area of the WHOLE house it sits in; the stricter reading is disclosed.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.10 suite_interior_sqm, INV-13 (OWED, step commit ①) · +2 dated notes

- **m.208** Suite soft landscaping is disclosed, not binding.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①)

- **m.209** Laneway eligibility uses all three arms of 150.8.30.20(1), measured from the centreline.
  Status: RATIFIED 2026-10-18 · Enforced by: lane_abutting_length_m derivation (OWED, Spec 130 / enrich_centreline WF3); INV-15 (OWED, ①)

- **m.216** Suite parking and bicycle rules are disclosures.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.12 code (OWED, ①)

- **m.222** Evaluator defect: the Coxwell map area makes the garden-suite separation not_evaluated:map_area_not_held on every lot (reality check §5.2).
  Status: APPLIED 2026-10-18 · Enforced by: bylaw-evaluator-fixes.logic.test.ts › "M-222 / M-224 — the Coxwell area unit takes the literal reading …"…

- **m.224** Coxwell area: the generous (purposive) reading of 150.7.60.30(1)(C).
  Status: RATIFIED 2026-10-18 · Enforced by: the polygon (OWED, Spec 58 lane); one written City question, which would also settle exception 900.2.10(736)…

- **m.235** 150.7.60.20(6)(A) mis-citation
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-2.logic.test.ts › "CHAT-6 — …" (red first: docs/reports/red-… · +1 dated note

- **m.236** M-219 remainder: laneway suite step-back above 4.0 m
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-2.logic.test.ts › "CHAT-7 / M-198(4) / M-219 — …"; bylaw-eval-perf re-pin

- **m.253** Garden-suite lots carry the 20 % ancillary cap; the 45 % all-buildings path is disclosed.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-9 / M-253 — …" (passes at base: no change needed)

- **m.284** The garden suite one-storey 60 m2 arm is chosen by a design token, suite_one_storey, taken as false.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-5 / M-284"; golden 150.7.60.50(4)(A)/(B);…

- **m.286** Suite separation and height use the distance to the max-build envelope (new build) or the isolated suite; a laneway suite with an EXISTING house carries a disclosure; no user-input field for distance.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-11 / M-286"

- **m.288** Further clauses: the laneway platform floor level is keyed; the rest are held with a reason.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-15 / M-288"

- **m.360** Floor discipline: a test never asserts a red floor, the --accept door counts RULED rows, a pool re-base for one cause, accept moves only named lines, merge order.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **lc.22** The rear suite is jointly optimized with the main building:
  Status: RULED · OWED · Enforced by: P5.11 suite_lt_main, coverage_consistent

- **lc.33** With vs without. The house_with_secondary_suite row (and the houseplex rows) carry their gain over the same parcel's detached_house row on the same roof-form basis: GFA, footprint, storeys, and closed gain_reasons (fsi_not_applicable, coverage_45, storeys_not_applicable, height_houseplex,…
  Status: RULED · OWED · Enforced by: Spec 78 P5.2 item 11, P5.10; P5.13 vectors

- **lc.35** Suite openings default: none. The smallest lawful setback leads: garden side 150.7.60.20(5)(B); no (2)(C) rear increase; laneway rear 150.8.60.20(2)(A) and side (3)(A) at 0.0 m where the line abuts no street or lane.
  Status: RULED · OWED · Enforced by: Spec 78 P5.5, P5.10; P5.13 vectors

- **lc.36** Suite setbacks read lot facts from data; an unknown fact takes the larger setback, disclosed.
  Status: RULED 2026-10-18 · OWED · Enforced by: Spec 78 P5.5 lot-fact table; INV-9

### Chapter 800

First clause cited: 800.50.

- **m.166** lot_area_m2 is licensed by "floor space index".
  Status: RATIFIED 2026-10-15 · Enforced by: G-CLAUSE variable_unlicensed

- **m.194** Houseplex cap: 4 units, 6 only inside a confirmed 600.60 area; disputed membership is not evaluated.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.13 vectors (OWED, step commit ①)

- **m.202** Houseplex unit cap, corrected.
  Status: RATIFIED 2026-10-18 · Enforced by: INV-11; P5.13 vectors (OWED, ①)

- **m.313** A survey frontage measured along a CURVED front lot line is not preferred by the CoA scorer; the calculated frontage stays.
  Status: RULED 2026-10-21 · Enforced by: coa-scorecard.logic.test.ts › "CHAT-46", "A0385", "F-4D-SC-245", "the regression lock is live",…

- **m.458** On a corner lot whose zone has no street-side clause, the street-side yard is the ordinary side yard.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the buildable_width_m edit and STS-n examples (only A0375 moves; through McProof first),…

### Chapter 900

First clause cited: 900.1, 900.2, 900.3, 900.5, 900.6, 900.4.

- **m.29** Expert sample audit. Exactly 50 stratified rows — ≥ 20 whose verbatim contains a numeric literal, ≥ 1 per archetype present, every external row, the 900.1.10 precedence rows (the expert explicitly confirms the implicit-override reading of 900.1.10(3)), adjudicated rows eligible — by a City of…
  Status: RATIFIED 2026-10-06 · Enforced by: G-AUDIT · +1 dated note

- **m.101** A prevailing former by-law with no fetchable official page is a counted source_defect instrument_not_published_online.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE (PREVAILING), vocab disclosure_reason.source_defect, adjudication_kind, bylaw-rulings.logic

- **m.133** A [PBS] item that states its own number and names no instrument is UNUSUAL, for now.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; G-CLAUSE

- **m.134** Phrasing-variant licence patterns, W1 round 2.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE variable_unlicensed, vocab_synonym (bylaw-rulings M-134 test)

- **m.135** A former-by-law section cited inside a [PBS] PREVAILING item is not a 569-2013 reference.
  Status: RATIFIED 2026-10-14 · Enforced by: G-XREF; counts.refs_target_absent (interim); extractRefs (owed, unbuilt) · +3 dated notes

- **m.136** A setback from "the lot line that abuts \<named road\>", with no centreline measure, is UNUSUAL.
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE; G-SHAPE · +1 dated note

- **m.142** lot_condition threshold tokens storey_count_band and platform_height_band.
  Status: RATIFIED 2026-10-14 · Enforced by: vocab lot_condition (bylaw-rulings M-142 test)

- **m.157** building_type.detached_house licence pattern "detached dwelling".
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE evidence_pattern_mismatch (bylaw-rulings M-157 test) · +1 dated note

- **m.158** A lawfully existing building defaults to "new build"; an answer comes with a caveat, and the existing size is an optional input.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab lot_condition.lawfully_existing.user_input and lawfully_existing_caveat phrase map (built 2026-10-15;…

- **m.161** Street-side licence patterns, W1 round 4a.
  Status: RATIFIED 2026-10-15 · Enforced by: G-CLAUSE variable_unlicensed, vocab_synonym

- **m.162** rear_setback_m licence pattern "from a rear lot line".
  Status: RATIFIED 2026-10-15 · Enforced by: G-CLAUSE

- **m.163** A street name that spells a building type ("575-583 Duplex Ave.").
  Status: RATIFIED 2026-10-15 · Enforced by: G-CLAUSE any_with_named_type

- **m.164** The slicer's list-unit propagation is a follow-up WF3; 900.6.10(473) keeps both forms.
  Status: RATIFIED 2026-10-15 · Enforced by: G-CLAUSE; follow-up WF3 (not built)

- **m.247** Exceptions that have no units, or whose units leave the lot unauthored, are keyed.
  Status: RULED 2026-10-21 · OWED · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-1 / M-247 (2) — …" (red first: docs/…

- **m.250** Exception RD 42's GFA takes its own FSI cap.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-6 / M-250 — …" (red first: docs/repo…

- **m.251** Exception RD 70's side yard binds the residential building and keeps its storey increment.
  Status: RULED 2026-10-21 · OWED · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-7 / M-251 — …" (red first: docs/repo…

- **m.297** vocab.exception_chapter maps a zone to its Chapter 900 article.
  Status: RULED 2026-10-21 · Enforced by: bylaw-layer2-vocab.logic.test.ts › "L2-CHAPTERS" (red first: docs/repo…

- **m.266** A "Despite" that restates the displaced regulation as still applying keeps its limit: RD 18 (D), 21 (B), 37 (B) keep the 19 m building depth.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4d-a.logic.test.ts › "F-4D-6 …"

- **m.267** Exception RD 155 (D) and RD 340 (B) side yard 0.9 m bind the residential building, not a garden or laneway suite.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4d-a.logic.test.ts › "F-4D-SC-155 / F-4D-SC-340 …"

- **m.285** abuts_named_street is joined from the parcel's primary frontage street name to the street the unit names.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-7 / M-285"; docs/reports/red-evidence/bylaw/bylaw-fix-6-4d-b-red.json

- **m.306** The scorer does not read a definition distance as the City limit: "within 0.3 m of the (rear) main wall" is dropped like "within 0.3 m of a building".
  Status: RULED 2026-10-21 · Enforced by: src/tests/coa-scorecard.logic.test.ts › "F-4D-13 …" (red first: docs/r…

- **m.314** The type-less side-yard units of the newly keyed exceptions bind the principal building, not a garden or laneway suite.
  Status: RULED 2026-10-21 · Enforced by: bylaw-chat49-suite-side-yard.logic.test.ts (red first: docs/reports/re…

- **m.315** The lane-A M-75 corrections: the six on exception 528 are ratified, the seven gate fixes are re-recorded as lane mechanical work.
  Status: RULED 2026-10-21 · Enforced by: agree.mjs correction_supersedes_unknown / correction_supersede_duplicate

- **m.316** OWED: exception 1397's 0.69 pre-1953 arm waits for an existing-building input.
  Status: OWED · Enforced by: none yet (OWED)

- **m.322** Accuracy floors only go up. Operator approved 2026-10-22 (chat, "y C-1...C-10 - on the ocndition that it meets the overall goal standardized approach, observable, accurate, scalable and understandable ie simple and doesnt expand scope as best as possible." evidence-rulings card C-5;…
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED: the floors file and its pin)

- **m.336** Two scope decisions stay with named uses.
  Status: RULED 2026-10-22 · OWED · Enforced by: none (a scope rule)

- **m.347** 900.5.10(324)(J)(i) is keyed UNUSUAL as a whole, with a disclosure (option B).
  Status: RULED 2026-10-22 · OWED · Enforced by: none yet (OWED)

- **m.350** The 26 pending exception units are settled by 11 family readings.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED)

- **m.357** Each new CoA notice batch is scored blind first, then folded into one cumulative headline set.
  Status: RULED 2026-10-23 · OWED · Enforced by: none yet (OWED: the cumulative set and the blind-round door, built when the next batch arrives)

- **m.374** OWED to Phase 3: cumulative pooled articles answered.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.478** Where a roof row's stored height is below its main-wall limit, the wall limit is not binding and the walls are bounded by the height; disclosed main_wall_limit_above_height.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2: the reading and the disclosure word in the Phase 2 build, locked red-first by a test lane…

- **m.485** 900.3.10(971)(B)'s "if 3 storeys is permitted" condition is keyed with its 1:4 token in the 1:4 re-key (F-1).
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2 (1:4) (lane E): the lock src/tests/bylaw-mb27l2-1in4.logic.test.ts, every moving lot in its…

- **m.486** 900.3.10(70)(C) is keyed as a 9.5 m height limit in the 69(C) form, with its 1:4 token, in the 1:4 re-key (F-2).
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2 (1:4) (lane E): the lock src/tests/bylaw-mb27l2-1in4.logic.test.ts, every moving lot in its…

- **m.497** A rule for the portion of a building with a parking space is portion-scoped: applies_to.part gains portion; a portion rule is set aside for the whole-building setback and disclosed in the M-169 form; 900.3.10(812) (D)(ii) is split into a whole-building unit (4.5 m) and a portion unit (6.0 m).
  Status: RULED 2026-11-04 · OWED · Enforced by: OWED -> MB-27.L2 (the increment-3 night): the red-first lock src/tests…

### General / cross-cutting

Rows that cite no by-law clause: process, method and cross-cutting rulings.

- **m.0** Simplicity. Every field, gate, file and mode names the mistake it prevents or the reader it serves; edge cases are not chased; each change says what it replaces.
  Status: RATIFIED 2026-10-06 · Enforced by: Process rule — no mechanical gate (declared). Applied at every plan panel; the plan's fold record is the…

- **m.1** The single source of truth is the committed generated JSON
  Status: RATIFIED 2026-10-06 · Enforced by: G-DRIFT

- **m.2** One row per slicer regulation_id; clauses are a generated clauses[] sub-array,
  Status: RATIFIED 2026-10-06 · Enforced by: G-TEXT

- **m.11** Code linkage reports until Phase 3, rather than blocking.
  Status: RATIFIED 2026-10-06 · Enforced by: G-CODE (ii)

- **m.14** Amendment status is tracked and shown, defaulting to not_verified,
  Status: RATIFIED 2026-10-06 · Enforced by: G-PROV, G-CHANGE

- **m.15** Ch.900 exception scope: every exception binding ≥ 100 residential lots, counting INHERITED lots, built in two waves
  Status: RATIFIED 2026-10-06 · Enforced by: Census render (Phase 1); G-UNIVERSE membership arm (Phase 2) · +1 dated note

- **m.17** Double-keying with operator adjudication,
  Status: RATIFIED 2026-10-06 · Enforced by: G-AGREE, G-PROV · +4 dated notes

- **m.20** Ownership across specs. Spec 68/69 own the table; Spec 58 owns ingestion; Spec 65 owns computation; Spec 67 owns methodology — its App.
  Status: RATIFIED 2026-10-06 · Enforced by: S13 locks · +1 dated note

- **m.21** Seed from the page, never from prose.
  Status: RATIFIED 2026-10-06 · Enforced by: One-time S12/S13 migration (legacy-id scan = 0, red-first) · +1 dated note

- **m.22** A code ≠ by-law disagreement is a Phase 3 input, never a table edit.
  Status: RATIFIED 2026-10-06 · Enforced by: G-CODE (ii)

- **m.25** Phase boundaries and the output HOLD.
  Status: RATIFIED 2026-10-06 · Enforced by: G-CODE (ii) report-only; Spec 68 §15 Out-of-Scope · +1 dated note

- **m.26** Input fidelity is recorded rather than assumed: each Ch.800 measurement definition a DSL input maps to records matches · approximates · differs · unknown with why, our field and evidence_ref; differs/unknown forbids modelled.
  Status: RATIFIED 2026-10-06 · Enforced by: G-READ

- **m.27** Who governs the lot. Parcels with no 569-2013 zone polygon (17,829 *[measured]*) are disclosed "not evaluated" rather than evaluated under 569-2013; max-build's envelopes on them are F-5.
  Status: RATIFIED 2026-10-06 · Enforced by: G-READ, G-UNIVERSE

- **m.28** Risk-reference rows, kept to a handful: tree protection (Ch.813), the Ontario Building Code (spatial separation), TRCA regulated areas; heritage and ravine point to Specs 61 / 59.
  Status: RATIFIED 2026-10-06 · Enforced by: G-READ

- **m.30** The faceted archetype model (Spec 68 §7), rather than one overloaded label: ⧉ archetype ∈ {LIMIT, PERMIT, PROHIBIT, REQUIRE, DEFINE, DISAPPLY, INCLUDE, PREVAILING, PROCEDURAL, UNUSUAL}; generated value_form; qualifiers displaces[], condition, applies_to.part, layer; a fixed shape per archetype;…
  Status: RATIFIED 2026-10-06 · Enforced by: G-SHAPE; G-EXC-LIT (Phase 2); handler-registry equality (Phase 3) · +1 dated note

- **m.31** Informational rows are in scope, except ~40 pure-administration rows
  Status: RATIFIED 2026-10-06 · Enforced by: G-UNIVERSE

- **m.32** Pre-commit runs generate-bylaw-provisions.mjs --check,
  Status: RATIFIED 2026-10-06 · Enforced by: .husky/pre-commit + hooks-composition.infra.test.ts (positional lock) · +1 dated note

- **m.33** Sequencing: Phase 1 runs in the L lane, one committer at a time.
  Status: RATIFIED 2026-10-06 · Enforced by: Process rule — no mechanical gate (declared). · +1 dated note

- **m.34** Override binding is keyed on the DSL target, not on a cited regulation id.
  Status: RATIFIED 2026-10-06 · Enforced by: precedence fixtures + G-EVAL (c); G-SHAPE on target · +1 dated note

- **m.35** Prevailing former by-laws are disclosure only,
  Status: RATIFIED 2026-10-06 · Enforced by: G-SHAPE (PREVAILING shape)

- **m.36** Enacted by-laws missing from our pages are captured from the enacting text,
  Status: RATIFIED 2026-10-06 · Enforced by: G-PROV (status legal + shown; source_sha256) · +2 dated notes

- **m.37** The page set is checked against the consolidation's own table of contents.
  Status: RATIFIED 2026-10-06 · Enforced by: G-UNIVERSE · +2 dated notes

- **m.38** Explicit displacement beats layer order.
  Status: RATIFIED 2026-10-06 · Enforced by: precedence fixture via permitted() + G-EVAL (c)

- **m.39** Consolidation ≠ enacting text: the enacting text governs, the unit is flagged and adjudicated — recorded per instance, no generic comparator.
  Status: RATIFIED 2026-10-06 · Enforced by: G-CLAUSE (cited-clause rule); G-PROV (extraction sha)

- **m.40** The regex classifier is a dev-tool pre-sorter only,
  Status: RATIFIED 2026-10-06 · Enforced by: reporting only

- **m.41** New Phase 2 data dependencies are named, not assumed:
  Status: RATIFIED 2026-10-06 · Enforced by: G-SHAPE (applies_to.part, value_form ⇒ ≠ modelled)

- **m.42** R-ZV — zone-assignment trust. McBylaw reads a parcel's parameters from its dominant 569-2013 label + exception key, never from the precedence-aggregated parcels.bylaw_* columns; a residential label's d is the zone FSI.
  Status: RATIFIED 2026-10-06 · Enforced by: Spec 68 §7.6 lot vector (Phase 1); ZV-1..ZV-4 step checks (Specs 58/65)

- **m.43** Executed, not declared: the DSL evaluator and effective() ship in Phase 1
  Status: RATIFIED 2026-10-06 · Enforced by: G-EVAL; the ACCURATE line's code_linkage: declared-only

- **m.44** S0.5 spike before any gate is built, with kill criteria declared up front
  Status: RATIFIED 2026-10-06 · Enforced by: The spike report (docs/reports/mcbylaw-s05-spike.md) recording each measured value against its criterion · +1 dated note

- **m.45** Absent and stale rows are pending, never failed.
  Status: RATIFIED 2026-10-06 · Enforced by: G-SHAPE; fixtures both directions

- **m.46** Model heuristics are a closed row kind,
  Status: RATIFIED 2026-10-06 · Enforced by: G-CODE (iv); G-READ

- **m.48** DSL grammar amendment — Spec 68 §7.4: unlimited; presence tests mapped / labelled / not; absent map arguments dropped in max/min; other in by_type; multi-token conditions; argument-level displacement; enacted(<by-law>).
  Status: RATIFIED 2026-10-07 · Enforced by: DSL parser fixtures (S6); G-EVAL

- **m.49** Rule 3 tie-break: a unit that displaces a precedence rule ranks just above the highest layer that rule ranks — it wins, it does not tie into rule 4a (Spec 68 §7.5).
  Status: RATIFIED 2026-10-07 · Enforced by: precedence fixture, G-EVAL (c)

- **m.50** Building type unknown: evaluate every residential building type; return a value only if all agree, else not_evaluated (needs_user_input:building_type) with the per-type values (Spec 68 §7.5).
  Status: RATIFIED 2026-10-07 · Enforced by: G-EVAL (c), V12 fixture

- **m.51** Spec 67 V1–V4 and V25 (side) are corrected at or before S6b
  Status: RATIFIED 2026-10-07 · Enforced by: G-EVAL (b)

- **m.52** feeds — which MaxBLD output a unit affects
  Status: RATIFIED 2026-10-07 · Enforced by: G-SHAPE, G-CODE (report), render

- **m.53** Three layers, applied in order
  Status: RATIFIED 2026-10-07 · Enforced by: Spec 68 §11; Phase 2 trial · +1 dated note

- **m.55** Provincial additional residential units prevail now (closes R-9)
  Status: RATIFIED 2026-10-07 · Enforced by: G-READ (external arm: precedence active only on a verified_primary provincial row with units); G-EVAL… · +4 dated notes

- **m.56** S5 scope rulings, operator 2026-10-07 — all S5 recommendations accepted as listed
  Status: RATIFIED 2026-10-07 · Enforced by: G-UNIVERSE (scope + TOC arms, ruling_not_ratified); the --accept door

- **m.57** The slice comes from the City page's structure; nothing is merged, nothing is missed silently
  Status: RATIFIED 2026-10-07 · Enforced by: G-TEXT (cell_set_mismatch, inline_split_undeclared, numbering_gap_unproven, unstatused_variant); G-UNIVERSE…

- **m.60** Evaluator hardening rules. (a) Absence (rule 7a) returns unregulated only when no unit of any by-law layer carries the target (keyed or pending) and the lot's exception and every exception in its INCLUDE closure is authored for the target (authored / partial listing the target, every unit…
  Status: PROPOSED · Enforced by: bylaw-harden.logic / .infra, G-EVAL · +1 dated note

- **m.61** Layer 3 report fields are declared formulas, run by the one evaluator.
  Status: RATIFIED 2026-10-07 · Enforced by: Spec 68 §11.1 arms (G-SHAPE, G-EVAL, G-UNIVERSE); the entry-condition gates once built; the step's…

- **m.62** Formula rows are keyed like law rows:
  Status: RATIFIED 2026-10-07 · Enforced by: G-AGREE; G-PROV (keyer provenance); G-EVAL formula arm (red test: a branch with no vector fails)

- **m.64** Only permitted scenarios are shown; every other scenario is recorded, counted and never displayed.
  Status: RATIFIED 2026-10-07 · Enforced by: G-SHAPE status arm (red test: an undeclared reason fails); step checks: status totality, lineage complete…

- **m.65** One CoA method: CoA(s) = AOR(s) × u_form(s), a citywide pure CoA uplift per building form, fitted against the AOR of the same form
  Status: RATIFIED 2026-10-07 · Enforced by: formula rows + G-EVAL vectors; G-DRIFT (u ⇄ pinned audit, AOR(s) version); step checks: fit_basis match, u ∈…

- **m.67** Builder cost is out of Phase 3.
  Status: RATIFIED 2026-10-07 · Enforced by: Spec 78 §2 Out-of-Scope; the owner-spec diff (no Spec 88 file in a Phase 3 diff); G-UNIVERSE: a cost_ref…

- **m.68** Every non-law number a formula uses is an admin logic variable; nothing is hidden.
  Status: RATIFIED 2026-10-07 · Enforced by: G-SHAPE formula-literal arm; G-CODE (iv) blocking over the Phase 3 modules + an inline-literal arm (JS…

- **m.69** Report-field totality: output ⇄ registry ⇄ rendered.
  Status: RATIFIED 2026-10-07 · Enforced by: G-UNIVERSE report-field arm; G-DRIFT (entry condition)

- **m.70** A measured Phase 3 trial precedes the Phase 3 plan lock
  Status: RATIFIED 2026-10-07 · Enforced by: process rule; the trial's committed pre-registration (V-4 ancestry)

- **m.71** No live report column moves before its shadow passes.
  Status: RATIFIED 2026-10-07 · Enforced by: the per-parcel classifier (red test: the g8-probe generic-why case FAILs); the round record (Phase 2 runner,…

- **m.72** The Layer 3 grammar extension (Spec 68 §7.4 block, operator approved in principle 2026-10-07): unit algebra (m2 × storeys, storeys × m; null unit → expression_error); pct a typed quantity (÷ 100 and pct × pct caught statically; *_pct variables declare scale); lv(<id>) and l2(<target>) names and…
  Status: RATIFIED 2026-10-07 · Enforced by: the planned bylaw-p3-dsl.logic.test.ts (red on today's grammar: the 8 probes + R1–R11); G-EVAL

- **m.73** An encroachment with a stated extent is a LIMIT; one without is a PERMIT
  Status: RATIFIED 2026-10-08 · Enforced by: G-SHAPE (§7.3 LIMIT shape), G-CLAUSE (every literal accounted for), G-AGREE (archetype ⧉); keying brief P1…

- **m.74** A count scales a quantity in Layer 1
  Status: RATIFIED 2026-10-08 · Enforced by: dsl.mjs combineUnits (+ red-first probe: 6.0 m × dwelling_units → m, 6.0 m × 2.0 m2 still mismatch),…

- **m.75** A sealed draft is corrected by an adjudication, never by editing it.
  Status: RATIFIED 2026-10-08 · Enforced by: G-AGREE (applies + orphan check), G-PROV (drafts unchanged), G-SHAPE (record schema); Spec 68 §6.5…

- **m.76** Five rule decisions from the agreed-but-flagged findings.
  Status: RATIFIED 2026-10-08 · Enforced by: G-CLAUSE (A1, B4/B5), G-XREF (A2), G-SHAPE (A10), vocab + G-CLAUSE licensing (B8)

- **m.77** The A1 keying conventions are ratified.
  Status: RATIFIED 2026-10-08 · Enforced by: keying brief block (bylaw-keying tests), G-AGREE

- **m.79** A reference to another municipal instrument is a ref with reason other_instrument.
  Status: RATIFIED 2026-10-08 · Enforced by: G-READ (external arm, bylaw-rulings.logic reason-set lock), G-XREF (ref_unresolved)

- **m.80** A sealed, B-keyed shard is re-keyed by a superseding generation, never by editing or deleting it.
  Status: RATIFIED 2026-10-08 · Enforced by: G-PROV (keyer arm, supersedes_mismatch), G-AGREE, G-SHAPE; keying-cli rekey (bylaw-keying tests)

- **m.78** Ch.900 exception rows (pages ch900_2..6, in scope since adoption-4 by SR-IN-K7A) are Phase 2 work (Spec 68 §11; K7 + waves); PHASE 1: DONE is computed over the non-Ch.900 in-scope rows; the validator prints both.
  Status: RATIFIED 2026-10-08 · Enforced by: --validate five lines + PHASE 1 (bylaw-s7-render)

- **m.82** T3 vocabulary and the correction supersede rule.
  Status: RATIFIED 2026-10-08 · Enforced by: G-CLAUSE, G-SHAPE, G-AGREE; vocab.json · +1 dated note

- **m.83** Table label cells and min+max rate cells.
  Status: RATIFIED 2026-10-09 · Enforced by: G-AGREE (adjudications.json), G-SHAPE

- **m.84** Keyer B's out-of-boundary fields are ignored and counted in every batch.
  Status: RATIFIED 2026-10-10 · Enforced by: G-SHAPE, bylaw-s6g.logic M-84

- **m.85** Per-area rate cells and "None" quantity cells.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE, G-CLAUSE (literals stay accounted)

- **m.86** Reference reason out_of_scope_section.
  Status: RATIFIED 2026-10-13 · Enforced by: G-XREF, G-READ external arm; bylaw-rulings.logic reason-set case

- **m.89** Reason rate_base for a per-area rate cell's stated base.
  Status: RATIFIED 2026-10-13 · Enforced by: G-CLAUSE (literal accounted), G-SHAPE shape_must_be_none (reason set closed)

- **m.93** Displacement trigger phrases "apply to prevent" and "is not subject to the regulations of".
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE displaces[], G-XREF

- **m.97** dsl_target bicycle_space_wall_clearance_m.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE vocab membership, G-CLAUSE

- **m.100** A use-list PERMIT takes subject non_residential_building.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE PERMIT subject, G-CLAUSE evidence

- **m.103** Ch.900 [SSP] / [PBS] blocks are keyed at leaf-clause grain.
  Status: RATIFIED 2026-10-14 · Enforced by: Keying planner unit grain (keying.mjs, built separately), G-SHAPE statement_target_mismatch, G-AGREE, G-PROV… · +2 dated notes

- **m.104** Phase 3 entry reads the Phase 1 rows, not the PHASE 1: DONE line.
  Status: RATIFIED 2026-10-14 · Enforced by: None new: the validator's existing PHASE 1 line and pending / failed fields

- **m.105** The wave-1 shard plan is generated.
  Status: RATIFIED 2026-10-14 · Enforced by: --check staleness of w1-shards.json; keying planner

- **m.108** parking_rate licence pattern "rate for calculating effective parking spaces".
  Status: RATIFIED 2026-10-14 · Enforced by: G-CLAUSE variable_unlicensed, vocab_synonym (bylaw-rulings M-87 test)

- **m.109** K7-R class map. Prereg-0 k7r_class_map has the closed classes i · ii · i_if_planned · not_unavailable.
  Status: RATIFIED 2026-10-14 · Enforced by: Prereg-0 k7r_class_map; its totality test

- **m.110** Planned keying = the W1 shard plan.
  Status: RATIFIED 2026-10-14 · Enforced by: k7r_split pin check

- **m.111** needs_user_input is K7-R class (ii) until Q12.
  Status: RATIFIED 2026-10-14 · Enforced by: Prereg-0 k7r_class_map

- **m.112** K3 limits. k3_a: Layer 2 storage ≤ 10 % of the DB.
  Status: RATIFIED 2026-10-14 · Enforced by: Prereg-0 K3 rows

- **m.113** Held-out draw. The salt comes only from env MCBYLAW_HELDOUT_SALT (≥ 32 chars, never written).
  Status: RATIFIED 2026-10-14 · Enforced by: The draw's status field

- **m.114** Oracle D is not_run. D stays not_run:oracle_unavailable on every round, disclosed.
  Status: RATIFIED 2026-10-14 · Enforced by: Round verdict cascade

- **m.115** Oracle C slot. The round runner accepts an oracle-c-round-v1 record.
  Status: RATIFIED 2026-10-14 · Enforced by: Round runner sha check

- **m.116** table_version. table_version = <adoption_id>:<sha256 of the LF bylaw-provisions.json>, the same sha oracle C records.
  Status: RATIFIED 2026-10-14 · Enforced by: Round records; M-115 check

- **m.117** R-DET: the determinism lock is recursive.
  Status: RATIFIED 2026-10-14 · Enforced by: src/tests/bylaw-provisions.infra.test.ts determinism lock

- **m.118** Oracle C comparison scope. Oracle C compares only the REQUIRED (by-law) value of an active coa_notice_variances row with cited_bylaw = 569-2013, citation_kind = chapter_regulation and parse_status = pair.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness (pre-registered round record + sha)

- **m.119** The keyword target is not a tiebreak inside one unit.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness, from round 3

- **m.120** Dating a change without a verified status.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness d8_basis

- **m.121** A citation presumes its unit's condition, with three exceptions.
  Status: RATIFIED 2026-10-14 · Enforced by: Oracle C harness
