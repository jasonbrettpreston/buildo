# McFrontend queue (LEAN) — the ONLY McFrontend job list, landed 2026-11-04

This file is the ONE source of MF task ids. A task not listed here is not done. Next free id: **MF-34** (ids are never reused). Dated note 2026-11-06 (M-246, prior text kept; operator "yes. proceed", D-9 b): MF-34 is taken by the MF-24 split; next free id **MF-35**. Dated note 2026-11-09 (prior text kept; operator, verbatim: "yes Shall I add the search-pair conversion as a queue row placed after MF-15"): MF-35 is taken by the search-pair conversion row; next free id **MF-36**.

Form copied from `.cursor/MCBYLAWS-QUEUE.md`: ten stages, status words DONE · RUNNING · WAITS · OPERATOR · HELD · LATER, lanes R rulings · G gates · E one-writer build · T tests · P product, reference practice `MF-nn (item) · McFrontend queue · lane X · stage N`. Arm Q today reads the McBylaws queue only (headings `**MB-nn ... - STATUS**` with `MB-nn@sha`); converting these tables to that form, and teaching arm Q a second queue, is MF-24. Dated note 2026-11-06 (M-246, prior text kept; operator "yes. proceed", D-9 b; MF-24a): the tables below are now in that form: one heading `**MF-nn <task> — <STATUS>** (lane)` per task, then one bullet that keeps every table cell (the status cell as it was, WAITS, Done-condition). A DONE heading cites `MF-nn@sha`: MF-01, MF-05 and MF-07 landed in the McFrontend Phase 0 documents commit a95246407, MF-09 in the McBylaws queue note 7f04f5b6a. Arm Q reads this file (prefix MF) at push and CI for a range that changes it or a surface path. Bullets never start with `- MF-` (that is the DONE-list form).

Authority: `~/Buildo-scratch/mcfrontend/CARD-Q-FE.answered.md`. Principles: Spec 126 §0a. Register: Spec 135 (`docs/specs/02-web-admin/135_mcfrontend_decisions_register.md`). Policy rules 16-20: Spec 128 §2.2a. Procedure: Spec 127 §3.2a.

Scope LEAN (card answer Q-MFS a): only the report page converts first; reuse gate.mjs, decision-log, preregs, panels, handbook generators, arm Q (parameterised); other screens convert on touch (operator "Q-Mf6 a": no fixed admin pilot).

**McBylaws stays the priority.** Operator verbatim: "The focus is still on completing Mcbylaws." Every Phase 1 task WAITS on McBylaws increment 2 closing (the McBylaws queue increments table, row 2) and the infra freeze lifted for McFrontend by name. Every gate-code change (MF-17, MF-24, MF-25) waits for that lift and McBylaws owner review. Seats per Spec 08 and the token-economy rule (DeepSeek exec and lenses, Sonnet seats, Opus sparingly).

- Dated note 2026-11-06 (M-246, prior text kept; operator answer Q-MFGO, verbatim "a", `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): Phase 1 is open (Spec 135 FE-01 dated note). McBylaws increment 2 is closed (McBylaws queue increments table row 2, e67fc9e8f) and the 2026-11-02 infra freeze is lifted by name for McFrontend Phase 1, the report page: surface paths move from held to layer23 (Spec 128 §4.11 item 6); build MF-10..MF-23; gate items MF-15, MF-17, MF-24 and MF-25 each with McBylaws owner review. McBylaws stays the priority. First task MF-33. The "WAITS inc 2, freeze lift" cells and the Not-doing line "No code before the increment 2 close and freeze lift" are met as of this note; their text is kept.

- Dated note 2026-11-06 (M-246, prior text kept; operator answer to the opening decision list D-1..D-9, verbatim "yes. proceed", `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`; map `~/Buildo-scratch/mcfrontend/phase1/opening-map.md`): the Phase 1 order is (D-1 b) this documents commit, then an early gate batch (MF-17 items 1-5 of Spec 128 §4.11, the loop-scope item of D-2 and MF-24a), then the policy flip, then MF-10. D-2 b: the surface paths go in a separate front-end policy list that arms H, C and P read and the McBylaws loop gate does not read. D-3 a: the gate batch is recorded in `docs/reports/panels/MF-17.json` with McBylaws (MB-67 lane) owner sign-off. D-4 a: the golden dir is `src/tests/fixtures/surfaces/**`, and this queue file joins the protected list. D-5 b and D-8 b: MF-33 baselines the Parcel Cost Tool now; the REPORT payload is re-timed and the numbers ruled after MF-13. D-6 a: web timing with Playwright, mobile by a manual operator run. D-9 b: MF-24 is split into MF-24a (in the early gate batch) and MF-34 (after MF-17 item 1). This pulls MF-17 items 1-5 and MF-24a ahead of MF-10 (check-increment-order rule), as ruled.
- Dated note 2026-11-06 (M-246, prior text kept; MF-33 W-1; operator, verbatim: "W-1a", `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): D-6 a is amended by the operator (W-1a): web render timing and a smoke test of the current page run on `next dev` with DEV_MODE (a non-production build; no gate weakened, no keys), every number labelled DEV. DEV baseline over the 25 golden lots, 3 runs, loaded host: full render p50 816 ms, p95 879 ms, max 1470 ms. A `next build/start` run is not possible (isDevMode requires NODE_ENV!=='production'); production-build load stays PROSE-ONLY (FE-04). Mobile remains a manual operator device run, UNVERIFIED. Prior D-6 a text kept (M-246). Evidence: `~/Buildo-scratch/mcfrontend/phase1/mf33-web/RESULTS.md`.

## Phase 0: specs ruled and recorded (documents only)

**MF-01 Spec numbers 135/136 and folder — DONE 2026-11-04 (Q-MF1 a) (MF-01@a95246407)** (R)
  - Lane R. Status cell (kept): DONE 2026-11-04 (Q-MF1 a). Waits on: none. Done-condition: FE-08, FE-16.

**MF-02 Record Q-FE, Q-MFP, doc-set, Q-MFS, Q-MF1..Q-MF6 and shared inputs as Spec 135 rows FE-01..FE-26 with Lock cells — RUNNING (stage 9: lands in the McFrontend Phase 0 documents commit)** (R)
  - Lane R. Status cell (kept): RUNNING (stage 9: lands in the McFrontend Phase 0 documents commit). Waits on: none. Done-condition: Spec 135 in the repo; one lock per row.

**MF-03 Land the 126/127/128 amendments (R-row move DEFERRED, MF-31) — RUNNING (stage 9: lands in the McFrontend Phase 0 documents commit)** (R)
  - Lane R. Status cell (kept): RUNNING (stage 9: lands in the McFrontend Phase 0 documents commit). Waits on: none. Done-condition: `spec-split-check --check` clean.

**MF-04 Spec 136 skeleton + `surface-rule-map.json` shape (the handbook stays in scratch until its generator, MF-18) — LATER** (R)
  - Lane R. Status cell (kept): LATER. Waits on: MF-03. Done-condition: documents only.

**MF-05 Binding rule (Q-MF3), `variants[]` (Q-MF2), shared inputs: rulings recorded in the card — DONE 2026-11-04 (MF-05@a95246407)** (R)
  - Lane R. Status cell (kept): DONE 2026-11-04. Waits on: none. Done-condition: rows written by MF-02.

**MF-06 Check decision-log accepts register 135; the Spec 128 §4.11 change list is written — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-02. Done-condition: list written; no code.

**MF-07 Operator rules Q-MF4 (external embeds, user-entry conflict rule, ad targeting consent) — DONE 2026-11-04 (operator "Q-MF4 a (this is great work)") (MF-07@a95246407)** (R)
  - Lane R. Status cell (kept): DONE 2026-11-04 (operator "Q-MF4 a (this is great work)"). Waits on: none. Done-condition: FE-20/21/22 ruled.

**MF-08 Operator rules the REPORT performance numbers — WAITS MF-33, OPERATOR** (R)
  - Lane R. Status cell (kept): WAITS MF-33, OPERATOR. Waits on: MF-33. Done-condition: FE-04 lock unblocked. Operator "QMf5 a": measure first, then set.
  - Dated note 2026-11-08 (M-246, prior text kept; MF-08 · McFrontend queue · lane R · stage 2; row owed from the status index): operator, verbatim, "Mf-33 b" (W-2, `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): the REPORT payload budget is the measured max plus 20% (max 5.9 KB gz per lot today), set after MF-13; API time, first content, full render and load stay PROSE-ONLY (FE-04). Status word unchanged.
  - Dated note 2026-11-09 (M-246, prior text kept; MF-08 · McFrontend queue · lane R; operator, verbatim: "option a"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-08 budgets, option A"): WAITS is renewed until a real 25-lot REPORT response can be measured (MF-14 and MB-44). The W-2 formula is confirmed: the REPORT payload gzip limit = measured max x 1.2, kept in the protected tighten-only file and enforced by the FE-04 lock `budget.infra.test.ts` and the surface-validate budget arm. Everything else stays PROSE-ONLY (FE-04). New expiry 2026-11-16. The heading word is not changed here.

**MF-09 Q-MB44 (operator "Mb-44 a"): MB-44 delivers the report as stored data; it is displayed only through the McFrontend REPORT renderer (MF-14). The McBylaws queue note lands with the Phase 0 documents (lane R) — DONE 2026-11-04 (MF-09@7f04f5b6a)** (R)
  - Lane R. Status cell (kept): DONE 2026-11-04. Waits on: none. Done-condition: McBylaws queue dated note under MB-44.

## Phase 1: the report page (WAITS increment 2 closed AND freeze lifted by name, FE-01)

**MF-33 Measure first (Q-MF5 a): time the current report screen and the 25 golden lots on mobile and web; propose budget numbers for the operator to rule; ruled numbers go in a protected, tighten-only file — RUNNING (stage 1: plan and measure; dated note 2026-11-06)** (P)
  - Lane P. Status cell (kept): LATER. Dated note 2026-11-06 (M-246, prior text kept; Q-MFGO "a"): RUNNING (lane R/P, stage 1: plan and measure, no commits). Waits on: inc 2, freeze lift. Done-condition: measurements written; numbers proposed to the operator (MF-08).
  - Dated note 2026-11-08 (M-246, prior text kept; MF-33 · McFrontend queue · lane P · stage 1; row owed from the status index): DONE for the dev measurements; the drafts landed with the MB-85 text and MF-33 documents (6e6a1699a: the D-6 a note above and the MF-14 smoke line). Record `~/Buildo-scratch/mcfrontend/phase1/mf33-web/RESULTS.md`. Operator, verbatim: "W-1a" (web timing and smoke on `next dev` with DEV_MODE, every number labelled DEV) and "Mf-33 b" (W-2: REPORT payload = max + 20% after MF-13; the rest PROSE-ONLY). DEV baseline over the 25 golden lots, 3 runs, loaded host: full render p50 816 ms, p95 879 ms, max 1470 ms; smoke 25/25 lots, 0 page errors, 0 console errors. The production-build run stays PROSE-ONLY (`next start` cannot reach the report without a real admin session; the DEV_MODE bypass is off in production by design). Mobile device run is a manual operator run, UNVERIFIED.

**MF-10 Retire old lineage names from the report schema seed; every field has a `source` in the closed binding set; binding-sources protected file — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-05, inc 2. Done-condition: 0 lineage refs; Rule 20 check fails an invented field. Dated note 2026-11-06 (M-246, prior text kept; operator answers MF-10 D-1..D-7 "MF-10 all recommended provided they are complaint" and D-6+ "MF-10 D-6+ a", `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): RUNNING (lane E, stages 3-9). MF-10 also builds the FE-18 lock `src/tests/surfaces/report-binding.logic.test.ts` (D-2 a), the `parcels` source (D-5 b, FE-27) and the named check and test changes (RS-1, RS-2, RS-3, RS-5, RS-9 by D-6 a; RS-4, RS-6, RS-7, the sample reports and the Q-7 block first test by D-6+ a).
  - Dated note 2026-11-08 (M-246, prior text kept; MF-10 · McFrontend queue · lane E · stage 9; row owed from the status index): LANDED. Seven commits re-cut as 324ad2b75..299ed51de (patch-ids equal to the originals, GATE OK), full suite 1039 files, 23,887 passed, 0 failed on 299ed51de; on origin in window 2, push 1 (origin 6e6a1699a). Rulings kept above: D-1..D-7, D-6+ "MF-10 D-6+ a", "2 yes, 3 yes" (the MB-67 owner sign-off for `binding-sources.json`, and the archive-then-delete of `docs/reference/report-v2-lineage-queue.json`), the F2 ratification "Fr- yes" (touch-up 9030f1306), all in `~/Buildo-scratch/mcfrontend/phase1/open-questions.md` and `~/Buildo-scratch/mcfrontend/MF-10/`. The headline has no catalogue row: carded to McBylaws (MB-31 row, 2026-11-08 note). The heading word is not changed here.

**MF-11 Red tests first for the generator (row with no field; field with no row; hand edit) — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-10. Done-condition: red evidence under `docs/reports/red-evidence/`.
  - Dated note 2026-11-08 (M-246, prior text kept; MF-11 · McFrontend queue · lane T · stage 2; row owed from the status index): red tests are being written (RUNNING, lane T, ~/Buildo-wt-mf11, opened 2026-11-08, expires 2026-11-15, E7 a); MF-10 has landed, which this row waited on. The heading word is not changed here.
  - Dated note 2026-11-09 (M-246, prior text kept; MF-11 · McFrontend queue · lane R; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): its held test file landed with MF-13 (d70cf3d81). The heading word is not changed here.

**MF-12 Goldens: structured trees, one per state per target (mobile, web, admin, pdf), incl. user_entry, user_entry_outranked and ad slot states — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-11. Done-condition: states x 4 targets = files.
  - Dated note 2026-11-08 (M-246, prior text kept; MF-12 · McFrontend queue · lane T · stage 2; operator "I approve all the recommendations on the condition you are highly confident in each", record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answer MF-12 D-1..D-4"): D-1 (a) tranche 1 = 10 states / 40 files now, 17 states owed with named blockers (user_entry needs McBylaws increment 6), MF-12 RUNNING until 108 files; D-2 (a) 27 states incl. pitched A/B split (FE-17); D-3 (a) parity = the four target files agree; D-4 (a) one file per state per target at `src/tests/fixtures/surfaces/report/<state>.<target>.json`, dated note on 127 §4.3 / 126 11a.7 (M-246). Rule: 126 11a.7, 127 §4.3, FE-17, DB-fields ruling. Compliant: yes. Confidence: high (panel folds F1-F7 measured). New rule: none. The heading word is not changed here.
  - Dated note 2026-11-08 night (M-246, prior text kept; MF-12 · McFrontend queue · lane R; operator, verbatim: "L-1C" and "G-1 a, G-2 a"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answer MF-12 L-1" and "Operator answer G-1, G-2"): (L-1C) the lifecycle message node keeps `status` with the closed value `none` ("no reading on this node"); the tree carries `lifecycle` (closed: loading | miss | error); 126 §11a.3 gains `none` via Spec 128 §4 escalation. Rule: 126:295 (Spec 122 §1.2), 128 §4, 126:743 precedent (MF-10 D-5 b / FE-27). Compliant: yes. (G-2 a) one node-contract home, `scripts/surfaces/_schema/report-tree.schema.json`; each node requires field, source, label, value, status, confidence, provenance, disclosures (status = 11a.3 list + none; confidence = 11a.4 set + none; provenance = 11a.4 sources + none; value string|null; disclosures closed codes, empty allowed); the tree has `lifecycle?` and `nodes[]`; the honest lock, MF-14 and MF-15 read it; it lands with MF-12. Rule: 126:552 (R-27 one home), 126:184-200, 126:295, L-1C. Compliant: yes. Owed in lane T's MF-12 commit (not written here): the M-246 dated notes on 126 §11a.3 / §11a.7, a Spec 135 FE row, the FE-06 report-honest lock red first. New rule: none. Status stays LATER.
  - Dated note 2026-11-09 (M-246, prior text kept; MF-12 · McFrontend queue · lane R; operator, verbatim: "agreed on your recommendations"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answer 2026-11-09"): tranche 1 LANDED on origin: register rows 909af8cb8, prereg 2 f4b7a5c49, code 9f8e5d534, panel cc1d8c0ef, panel-2 folds d49860170. 17 states / 68 files remain owed (panel items F-4, F-7, F-12 later), so MF-12 stays RUNNING until 108 files. The heading word is not changed here.

**MF-13 Catalogue-to-report generator (seed via `seed-report-v2.mjs`); emits `headline` flag and labels from `content` — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-11, MF-12. Done-condition: generator `--check` green.
  - Dated note 2026-11-09 (M-246, prior text kept; MF-13 · McFrontend queue · lane R; operator, verbatim: "agreed" (MF-13 D-3, D-5, C-1, C-2, C-4) and "1. I accept your reco" (follow-up 1); record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): DONE as MF-13@d70cf3d81 (code). Rows 9106f0b9e, prereg 2 c12bae461, panel ca4f15eed, panel touch-up 07005a4db. Follow-up 1, GEN-ROW-BAD-STATE, is f09f5f7a5 (push 4, local until pushed). Follow-ups 3 and 7 go to MF-14; 4 and 5 are deferred tidy-ups. Its FE rows FE-24 and FE-30 are still OWED in Spec 135; the OWED-FE refusal (MF-34) is not built, so arm Q accepts DONE (MF-24a: DONE needs `MF-nn@sha`). The heading word is not changed here.

**MF-14 One REPORT renderer (mobile, web, admin, pdf); reads the declaration; throws on unknown field/status; no maths — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-13. Done-condition: all goldens green on all targets.
  - Dated note 2026-11-06 (M-246, prior text kept; MF-33 W-1; operator, verbatim: "W-1a"): web smoke check added to the done-condition. On the web target under `next dev` with DEV_MODE, the report renders for every golden-25 lot with no page error and no console error, and one screenshot per lot is captured (scratch script, no gate). Load time is recorded as DEV prose only (FE-04).
  - Dated note 2026-11-08 night (M-246, prior text kept; MF-14 · McFrontend queue · lane R; operator, verbatim: "G-1 a, G-2 a"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answer G-1, G-2"): (G-1 a) MF-14 stays LATER in queue order and throws on any tree that fails `scripts/surfaces/_schema/report-tree.schema.json`. Rule: queue order (check-increment-order), 126:552 (R-27). Compliant: yes. New rule: none. Status stays LATER.

**MF-15 `surface-validate.mjs` (first gate, FE-13): S-gen, S-golden, S-parity, binding, closed-status, budget — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-12. Done-condition: planted bad descriptor exits 1.
  - Dated note 2026-11-08 night (M-246, prior text kept; MF-15 · McFrontend queue · lane R; operator, verbatim: "G-1 a, G-2 a"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answer G-1, G-2"): (G-1 a) MF-15 stays LATER in queue order; its closed-status and honest checks are AJV validation against `scripts/surfaces/_schema/report-tree.schema.json`. Rule: queue order (check-increment-order), 126:552 (R-27). Compliant: yes. New rule: none. Status stays LATER.
  - Dated note 2026-11-09 (M-246, prior text kept; MF-15 · McFrontend queue · lane R; operator, verbatim: "I agree with Mf-13 and Mf-15"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: MF-15 D-1..D-6"): D-1 a shared module `scripts/surfaces/report-checks.mjs` read by the gate and the landed honest and parity locks; D-2 a S-gen spawns the committed generators' `--check`; D-3 a no budget code, the gate prints `budget WAITS MF-08`; D-4 a output `SV-<ARM> <subject>: <problem>`, exit 0/1/2; D-5 TRIMMED: the only flag is `--check`; D-6 a dated note on FE-13, no new FE row. Done-condition unchanged: planted bad descriptor exits 1. Order and waits unchanged. Compliant: yes. New rule: none.
  - Dated note 2026-11-09 (M-246, prior text kept; MF-15 · McFrontend queue · lane R; operator, verbatim: "Mf-15 sign-off"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator sign-off 2026-11-09: MF-15 gate code"): DONE as MF-15@97462b5b8. Notes 3186b1dac, prereg 8d801854f; the owner sign-off is recorded in f07e128c9 (push 4, local until pushed). Its FE row, FE-13, is RULED, so the OWED-FE refusal (MF-34, not built) would not apply. The heading word is not changed here.

**MF-35 Convert the parcel search pair, `mobile_parcel_search` (SEARCH) and `mobile_parcel_disambiguation_map` (LIST, `render.projection: map`), from the inventoried descriptors to declared surfaces by the Spec 127 ladder: shared SEARCH and LIST archetype components, no hand-coded fields, surface-validate green (operator 2026-11-09) — LATER** (E)
  - Lane E. Waits on: MF-15 (the gate that validates the descriptors). Done-condition: the two screens render from their descriptors with the inventoried states (prompt_type_more, fetching, outside_toronto, rate_limited, entitlement_refused, and the rest recorded in the descriptors) as goldens; surface-validate --check exits 0; the planted bad descriptor exits 1.
  - Rules: 126:72 ("same surface, except for its projection"), 126:254 (map is a projection on LIST, not an archetype), 126:840 (P3/B2 parcel_search -> SEARCH), Spec 127 ladder, Spec 128 rules (Airtight principles mirrored at 128:21-42). Scope: these two screens only. Other screens stay convert-on-touch (MF-32).

**MF-16 Locks: binding, no-maths, generated-only, honest, parity, budget, variants — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-14, MF-15. Done-condition: each RED then GREEN. Dated note 2026-11-06 (M-246, prior text kept; operator answer MF-10 D-2 a, verbatim "MF-10 all recommended provided they are complaint"): the "binding" lock (`src/tests/surfaces/report-binding.logic.test.ts`, FE-18) is built by MF-10, so "binding" is removed from this row's locks; the other locks stay here.

**MF-17 Gate arm C wiring (Spec 128 §4.11 items 1-6): 135 landed earlier; ID_RE; trailer; prereg-name/PREREG_RE; policy globs held then layer23 — DONE 2026-11-06 (MF-17@aa61c5777; MB-67 sign-off "1a", Q-MB67)** (G)
  - Lane G. Status cell (kept): LATER. Dated note 2026-11-06 (M-246, prior text kept; "yes. proceed", D-1 b): items 1-5 and the D-2 loop-scope item run now as the early gate batch, before MF-10; item 6 (the policy flip) follows it. Waits on: MF-16, freeze lift. Done-condition: commit citing an OWED FE row refused; waits for the named freeze lift; McBylaws owner review.
  - Dated note 2026-11-06 (M-246, prior text kept; "yes. proceed", D-1 b, D-3 a): items 1-5 and the loop-scope item landed (407b9eaef, folds 96a481c2c); item 6, the policy flip, lands with the panel record `docs/reports/panels/MF-17.json`, whose McBylaws (MB-67 lane) owner sign-off is PENDING OPERATOR. MF-17 reads DONE only after that sign-off.
  - Heading before 2026-11-08 (kept, M-246): "RUNNING (items 1-5 and the D-2 loop-scope item in the early gate batch; item 6, the policy flip, follows; dated note 2026-11-06)".
  - Dated note 2026-11-08 (M-246, prior text kept; MF-17 · McFrontend queue · lane R · stage 9; row owed from the status index): DONE. The MB-67 owner sign-off the 2026-11-06 note waited on was given the same day: operator, verbatim, "1a" (Q-MB67, `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`). It is recorded as a dated note in `docs/reports/panels/MF-17.json` (prior PENDING text kept), commit aa61c5777 (McFrontend-Task: MF-17), full suite 1038 files, 23,817 passed, 0 failed, on origin. The heading above had still read PENDING OPERATOR in the lane's view; the 2026-11-08 decision list item 5 ("agreed if complaint", `~/Buildo-scratch/mcbylaws/inc3/open-questions.md`) asked again by mistake and is closed by this note.

**MF-18 Spec 136 generator + `--check` — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-17. Done-condition: second run changes nothing.

**MF-19 User-input flow: declare the form, bind the input contract, render shared results with provenance and confidence by source; verified outranks user, newest user entry shown, history kept (FE-20); goldens for entry states — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-14, McBylaws increment 6 re-evaluation capability for live results. Done-condition: goldens green; McBylaws does the re-evaluation.

**MF-20 Ad slots: contract, R-17 disclosure, R-34 outside cards and `variants[]`, declared-key targeting, never user-entered facts without consent (FE-22); goldens present/absent — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-14. Done-condition: ad-slot lock RED then GREEN.

**MF-21 In-product error count and budget breach shown on admin — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-14, MB-35, MB-38. Done-condition: `error-count.db.test.ts` green in a named CI step; on-screen part manual.

**MF-22 Product proof run: 25 lots vs answer key, all targets — LATER** (P)
  - Lane P. Status cell (kept): LATER. Waits on: MF-14, MB-38, MB-44. Done-condition: `answer-key-e2e.db.test.ts` green in CI. No circular wait: MB-44 delivers data only and does not wait on MF-14 (Q-MB44 a).

**MF-23 Executable canaries a-f (McFront proof) — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-16. Done-condition: each: planted defect in a temp copy exits non-zero, clean copy exits zero.

**MF-24 Arm Q second queue: parameterise path and prefix; DONE needs `MF-nn@sha`; DONE refused while its FE row is OWED — RUNNING (MF-24a in the early gate batch; the OWED-FE refusal is MF-34; dated note 2026-11-06)** (G)
  - Lane G. Status cell (kept): LATER. Dated note 2026-11-06 (M-246, prior text kept; "yes. proceed", D-9 b): split. MF-24a (parameterise path and prefix, convert this queue, DONE needs `MF-nn@sha`) runs in the early gate batch; the OWED-FE refusal is MF-34. Waits on: MF-17, freeze lift. Done-condition: waits for the named freeze lift; McBylaws owner review.

**MF-34 MF-24b (split from MF-24, D-9 b): arm Q refuses a DONE MF task whose FE row is still OWED — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-17 item 1, MF-24a. Done-condition: a DONE MF task with an OWED FE row fails arm Q; McBylaws owner review.

**MF-25 Pre-commit/CI lines: surface-validate, generator, handbook `--check`; CI step for `*.db.test.ts` — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-18, freeze lift. Done-condition: .husky is protected: panel arm P + APPROVED.

**MF-26 Extend spec-split-check citation arm to Spec 136 — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-18. Done-condition: citation to a missing line fails.

## Later: convert-on-touch

**MF-30 `/admin/surfaces` generated from the descriptor set (P2b): convert-on-touch, no fixed admin pilot (operator "Q-Mf6 a") — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: a product reason, MF-22. Done-condition: per-surface scorecard.

**MF-31 Move R-01..R-34 into 135; reconcile and generate counts (Spec 126 §2 dated note) — LATER** (R)
  - Lane R. Status cell (kept): LATER. Waits on: a product reason. Done-condition: line-set diff clean.

**MF-32 Convert any other screen when touched, by the Spec 127 ladder; market-metrics is DASHBOARD (FE-12) — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: a product reason. Done-condition: scorecard green.

Ids MF-27..MF-29 are unused.

## McFront proof: how we know it works

Operator verbatim: "Q-MFS a - how do it know it's actually working". Each canary is a vitest case: plant the defect in a temp copy, assert the checker exits non-zero; a clean copy exits zero (the pattern of `src/tests/surface-registry.infra.test.ts`). Evidence files are a by-product, not the proof.

| # | Planted defect | Check | Task |
|---|---|---|---|
| a | Drop "at least" or a disclosure from real per-target output | oracle = catalogue flags (not the golden) | MF-23 |
| b | Hand-edit generated output; invented field; numeric literal in a projection file | three checks: generator `--check`, binding lock, AST numeric-literal scan | MF-23 |
| c | Add a catalogue row in a temp dir, renderer sources hash-asserted unchanged | the new field IS present with the right value on mobile, web, admin, pdf; renderer throws on unknown | MF-23 |
| d | Change one value in ONE real target's output | parity (React Native text, DOM text, admin, extracted PDF text) fails naming field and target | MF-23 |
| e | Break a number in a temp copy of the generator/catalogue path | 25 lots differ from the answer key (db-type, named CI step) | MF-22 |
| f | Insert a render-error event through the real writer | `*.db.test.ts` reads it through the real admin reader: count == 1; budget breach row | MF-21 |

Phase 1 closes when a-f are green and `surface-validate.mjs` prints all rows.

## Waits on McBylaws

Increment 2 close · increment 6 (re-evaluation, MF-19) · MB-35 · MB-38 · MB-44 (data only, Q-MB44 a).

## Not doing

No second gate, queue checker, decision log or panel engine. No conversion of any screen but the report in Phase 1. No hand edit of the catalogue or generated decl. No code before the increment 2 close and freeze lift.
