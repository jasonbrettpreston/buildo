# McFrontend queue (LEAN) — the ONLY McFrontend job list, landed 2026-11-04

This file is the ONE source of MF task ids. A task not listed here is not done. Next free id: **MF-34** (ids are never reused). Dated note 2026-11-06 (M-246, prior text kept; operator "yes. proceed", D-9 b): MF-34 is taken by the MF-24 split; next free id **MF-35**.

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

**MF-09 Q-MB44 (operator "Mb-44 a"): MB-44 delivers the report as stored data; it is displayed only through the McFrontend REPORT renderer (MF-14). The McBylaws queue note lands with the Phase 0 documents (lane R) — DONE 2026-11-04 (MF-09@7f04f5b6a)** (R)
  - Lane R. Status cell (kept): DONE 2026-11-04. Waits on: none. Done-condition: McBylaws queue dated note under MB-44.

## Phase 1: the report page (WAITS increment 2 closed AND freeze lifted by name, FE-01)

**MF-33 Measure first (Q-MF5 a): time the current report screen and the 25 golden lots on mobile and web; propose budget numbers for the operator to rule; ruled numbers go in a protected, tighten-only file — RUNNING (stage 1: plan and measure; dated note 2026-11-06)** (P)
  - Lane P. Status cell (kept): LATER. Dated note 2026-11-06 (M-246, prior text kept; Q-MFGO "a"): RUNNING (lane R/P, stage 1: plan and measure, no commits). Waits on: inc 2, freeze lift. Done-condition: measurements written; numbers proposed to the operator (MF-08).

**MF-10 Retire old lineage names from the report schema seed; every field has a `source` in the closed binding set; binding-sources protected file — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-05, inc 2. Done-condition: 0 lineage refs; Rule 20 check fails an invented field. Dated note 2026-11-06 (M-246, prior text kept; operator answers MF-10 D-1..D-7 "MF-10 all recommended provided they are complaint" and D-6+ "MF-10 D-6+ a", `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): RUNNING (lane E, stages 3-9). MF-10 also builds the FE-18 lock `src/tests/surfaces/report-binding.logic.test.ts` (D-2 a), the `parcels` source (D-5 b, FE-27) and the named check and test changes (RS-1, RS-2, RS-3, RS-5, RS-9 by D-6 a; RS-4, RS-6, RS-7, the sample reports and the Q-7 block first test by D-6+ a).

**MF-11 Red tests first for the generator (row with no field; field with no row; hand edit) — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-10. Done-condition: red evidence under `docs/reports/red-evidence/`.

**MF-12 Goldens: structured trees, one per state per target (mobile, web, admin, pdf), incl. user_entry, user_entry_outranked and ad slot states — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-11. Done-condition: states x 4 targets = files.

**MF-13 Catalogue-to-report generator (seed via `seed-report-v2.mjs`); emits `headline` flag and labels from `content` — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-11, MF-12. Done-condition: generator `--check` green.

**MF-14 One REPORT renderer (mobile, web, admin, pdf); reads the declaration; throws on unknown field/status; no maths — LATER** (E)
  - Lane E. Status cell (kept): LATER. Waits on: MF-13. Done-condition: all goldens green on all targets.
  - Dated note 2026-11-06 (M-246, prior text kept; MF-33 W-1; operator, verbatim: "W-1a"): web smoke check added to the done-condition. On the web target under `next dev` with DEV_MODE, the report renders for every golden-25 lot with no page error and no console error, and one screenshot per lot is captured (scratch script, no gate). Load time is recorded as DEV prose only (FE-04).

**MF-15 `surface-validate.mjs` (first gate, FE-13): S-gen, S-golden, S-parity, binding, closed-status, budget — LATER** (G)
  - Lane G. Status cell (kept): LATER. Waits on: MF-12. Done-condition: planted bad descriptor exits 1.

**MF-16 Locks: binding, no-maths, generated-only, honest, parity, budget, variants — LATER** (T)
  - Lane T. Status cell (kept): LATER. Waits on: MF-14, MF-15. Done-condition: each RED then GREEN. Dated note 2026-11-06 (M-246, prior text kept; operator answer MF-10 D-2 a, verbatim "MF-10 all recommended provided they are complaint"): the "binding" lock (`src/tests/surfaces/report-binding.logic.test.ts`, FE-18) is built by MF-10, so "binding" is removed from this row's locks; the other locks stay here.

**MF-17 Gate arm C wiring (Spec 128 §4.11 items 1-6): 135 landed earlier; ID_RE; trailer; prereg-name/PREREG_RE; policy globs held then layer23 — RUNNING (items 1-5 and the D-2 loop-scope item in the early gate batch; item 6, the policy flip, follows; dated note 2026-11-06)** (G)
  - Lane G. Status cell (kept): LATER. Dated note 2026-11-06 (M-246, prior text kept; "yes. proceed", D-1 b): items 1-5 and the D-2 loop-scope item run now as the early gate batch, before MF-10; item 6 (the policy flip) follows it. Waits on: MF-16, freeze lift. Done-condition: commit citing an OWED FE row refused; waits for the named freeze lift; McBylaws owner review.
  - Dated note 2026-11-06 (M-246, prior text kept; "yes. proceed", D-1 b, D-3 a): items 1-5 and the loop-scope item landed (407b9eaef, folds 96a481c2c); item 6, the policy flip, lands with the panel record `docs/reports/panels/MF-17.json`, whose McBylaws (MB-67 lane) owner sign-off is PENDING OPERATOR. MF-17 reads DONE only after that sign-off.

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
