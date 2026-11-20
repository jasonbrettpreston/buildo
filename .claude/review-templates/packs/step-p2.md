# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Step standard handbook (Spec 132 sections 2, 3, 4 and 6)
Source: docs/specs/01-pipeline/132_step_standard_handbook.md:122-463; docs/specs/01-pipeline/132_step_standard_handbook.md:503-591
Generator: scripts/generate-step-handbook.mjs --write, from scripts/steps/_schema/rule-map.json (444 mapped rule ids) and Spec 124/124a/122
Rules in the whole list: 65 (counted by pattern /^- \*\*[a-z0-9.\-]+\*\* /) · this is part 2 of 2

### Rulings protocol and the resolution ladder

What to do when the standard does not answer your question.

- **x-rulings.1** When no rung answers, use the protocol: one pass discovers and proposes (closed Intent Ledger vocabulary); a different party adjudicates, named and dated; the ruling gets a dated register row in Spec 124 §5 (or a 124a LIVE REGISTER section) that answers the seven admission questions and names a lock; the same commit adds the both-directions test and amends the spec; a pilot-local defect becomes a ruling only if it will recur in another archetype; a document move is tool-performed and verified by a line-set diff. Cited ids must resolve.
  *Why:* A rule without a lock is not a rule, and the person who found a problem does not get to rule on it.
  Rules: `R-I` `R-J` `R-AA` `R-AM` `R-DF` `P4-1` `P4-2` `P4-3` `P4-4` `P4-5` `P4-6` `P4-7` `R-KO`

- **x-rulings.2** Resolution ladder: ground the problem (query, grep, read; cite the owner spec from the system map); classify it CONTRACT / INCIDENTAL / DEFECT; resolve at the first fitting rung (descriptor, declared check, logic variable, library change, shape rule, new schema field); if none fits or two conflict, go to the protocol; add a both-directions test and re-run the golden capture; record a Defect Ledger id and a §R Reflection entry when it may recur. Route each learning to the most enforced artifact that can hold it.
  *Why:* The cheapest enforced answer wins, and lessons are kept where a machine reads them.
  Rules: `L7-0` `L7-1` `L7-2` `L7-3` `L7-4` `L7-5` · history: `M9` (SPEC121-M9) `M10` (SPEC121-M10)

- **x-rulings.3** Where the standard is written: Spec 122 is the standard (the live schema and behaviour) and the Spec 124 register is the policy; on policy the register governs, on the schema and behaviour Spec 122 does. Spec 123 is the standard for the conversion procedure and its G0–G9 gates. This handbook is Spec 132, generated from both through the rule map; cite a line as `Spec 132 §<line id> (R-xx)`. Every spec opens with one role banner (authority register, standard, design, historical, generated handbook); a historical spec adds no rule id, so a new rule goes to the register.
  *Why:* Each question has one home, and a reader knows from the first lines what a spec may decide.
  Rules: `R-GU` `R-GV` `R-GW` `R-GX` `R-HH` `R-HI` `R-HJ` `R-IY`

- **x-rulings.4** Operator decisions are transferred by generator, never by hand: each set of rulings (a review-page export or a chat ruling with its quote, and any later amendment with its quote) is committed verbatim as `docs/reports/decisions/<date>-<slug>.json`; `node scripts/analysis/decision-log.mjs --write` emits a register-row skeleton per approved decision, and every approved decision becomes a register row (Spec 124, Spec 69a or Spec 131 by subject) that cites `<log stem>#<decision id>`; `--check` at pre-commit fails on an uncovered decision or a citation of an unknown one. Each log is re-derived at `--check` from its raw record under `docs/reports/decisions/raw/`, so a hand-edited log fails. Rulings recorded this way for a step not yet built (resolve_bylaws, Spec 134) govern its plan; a report surface has one declaration (R-RS).
  *Why:* A ruling transferred by hand is a ruling that can be forgotten; the log is the operator's own words and the check proves each one landed.
  Rules: `R-GY` `R-HB` `R-HC` `R-HD` `R-HE` `R-HF` `R-HG` `R-HK` `R-HL` `R-HM` `R-IL` `R-IM` `R-IN` `R-IO` `R-IP` `R-IQ` `R-IR` `R-IS` `R-IT` `R-IU` `R-IV` `R-IW` `R-IX` `R-IZ` `R-JA` `R-JI` `R-JJ` `R-JN` `R-JO` `R-JR`

### Verification before integration and acceptance

What must be independently checked before work lands.

- **x-verify.1** Before an integrate-N branch is built, a fresh lane that did not write the work verifies every landing lane's claims read-only (cited ids and quotes, red-first tests red on the parent, counts and exit codes reproduced). The report lives at `docs/reports/verification/<branch>.md` and every integrate commit cites it (`.husky/commit-msg`).
  *Why:* Self-reported results are not evidence; an independent re-check is.
  Rules: `R-EZ` · history: `M14` (SPEC121-M14)

- **x-verify.2** Cloud acceptance runs are pinned to a commit sha, use partial `--only` / `--from` runs, and form one end-of-sources acceptance set; ceilings are never raised (resize instead); EP-PIN-D17 blocks every post-sources legacy slug. A chain is complete only when converted, with no ledger rows, LDG-10 complete, cloud accepted and tooling integrated.
  *Why:* Acceptance grades the code that will ship, once, with nothing waved through.
  Rules: `R-AB` `R-AL` `R-AQ` `R-AQ.1` `R-BC` `R-ED`

### Tooling, hooks and commit form

How the repo machinery runs.

- **x-tooling.1** Pre-commit is file-only, staged-scoped and inside a pinned time budget (#52), and runs every generator `--check`. The full suite runs at pre-push (8 forks; pre-commit 4; never above 10). Tests needing Postgres are `*.db.test.ts` and run only under `npm run test:db`. Lanes serialise DB writers, full suites and landings on the host (R-CQ, a process rule; nothing enforces it). `migrate.js --only` applies chosen migrations in order, failing closed on dependencies.
  *Why:* Commits stay fast and safe on the shared host; slow and DB work runs where it belongs.
  Rules: `R-GQ` `R-AG` `R-CQ` `R-DH` `R-DJ` `R-DS` `R-EC` `R-EU` `R-KI` `R-KL` `R-KP` `R-KY` `R-LB` `R-LF` `R-LG` `R-LH` `R-LI` `R-LJ` `R-LK` `R-LL` `R-LM` `R-LN` `R-LO` `R-LP` `R-LQ` · history: `R-BV`

- **x-tooling.2** Commit form: after two full-form conversions of an archetype, later ones may land compressed (three commits), and compressed is then the default; full form needs a stated reason in the assessment.
  *Why:* Ceremony is spent where an archetype is still new.
  Rules: `R-PACE-1` `R-AH`

- **x-tooling.3** Programme promises are declared data in `programme-items.json`, generated and gated; a programme-gate precondition is locked both directions, never a printed count. A proposal to add a box states its measured read/write cost at production scale. Stop and redesign if a per-step override is needed.
  *Why:* Promises that live only in prose get forgotten.
  Rules: `R-T` `R-Z` `P3` `K2` `R-KK` `R-KQ` `R-KU` `R-LR` `R-KW` `R-KZ` `R-LD`

- **x-tooling.4** This handbook's own success test: a new engineer can build, read and diagnose a step from it alone.
  *Why:* Spec 120's test, kept from Spec 121 M2.
  Rules: history: `M2` (SPEC121-M2)


<<< Spec 132 section 6 (the 80 in-force rules with no or partial machine check) (docs/specs/01-pipeline/132_step_standard_handbook.md:503-591) >>>
## 6. Rules with no or partial machine check (80 in force)

"A step-standard item that no machine checks is not part of the standard" (R-BA). These in-force rules are not fully machine-checked yet. The list only shrinks: `src/tests/handbook-rule-map.logic.test.ts` caps it, and `step-validate --all` prints the count. 50 have no check and 30 are partial; 20 more entries are retired ids kept so the seed count reconciles.

Enforcement across all 444 mapped ids: 296 lock, 1 lock-db, 37 check, 0 hook, 30 partial (any kind, listed below or retired), 80 none (see the glossary).

| Rule | Class | Line | Reason |
|---|---|---|---|
| R-H | partial | core.6 | partial: skip-row WARN locked (skipRecordsMeta); the INFO-vs-WARN choice itself is unchecked (GAP G-5, 124:137) |
| R-J | none | x-rulings.1 | no machine check: document governance |
| R-N | none | link.3 | no lock named (commit e01cad11) |
| R-O | none | matcher.1 | no machine check: assessment-report narrative only |
| R-AB | partial | x-verify.2 | partial: chain-sources-workflow.infra warns that an unpinned run is "NOT valid as an R-AB acceptance run"; acceptance-set completeness unchecked |
| R-BT | none | core.17 | no lock: "no lock yet — PLANNED with the step" (124a:237) |
| R-BY | partial | ingestor.3 | partial: ingest-prereq-pdf-acquire.logic (not named in row) |
| R-CJ | partial | enricher.2 | partial: purity-s3-exec-seam.logic (scope_retire_lock_held; not named in row) |
| R-CT | partial | core.12 | partial: per-step locks only (steps/coa/violations D3 and the classify_coa_* violations assert their targets declare rls_bypass_or_policy); write.js assertWritePrivileges checks declared tables at runtime; fleet gate owed (V3 lane C1) |
| R-CU | partial | core.12 | partial: generator-locked execution.batch (INGESTOR); library split owed (V3 lane C2) |
| R-DF | partial | x-rulings.1 | partial: spec124-register-locks.logic now reads every register row (widened 2026-10-20, observe-1), but 101 unlabelled and 15 lockless pre-R-CX rows sit on its shrink-only grandfather lists |
| R-EL | partial | x-captures.4 | partial: c6-rulings.infra; live-call FAIL owed (PIN C6-6-RECORDED) |
| R-EW | partial | core.10 | partial: src/tests/steps/coa/dispatch.logic.test.ts locks (i) for coa only; (ii) every other converted step's compute lock built through the real dispatch is not asserted (older hand-built locks on the closed list PIN R-EW-LOCKS) |
| R-EX | partial | ingestor.5 | partial: src/tests/capture-rerun-proof.logic.test.ts locks the seen_drift proof (rewritten == touched, row delta 0, projected hash) and the zero_writes FAIL; no static check that every seen-column target declares declared_drift (caught only when the POST proof runs) |
| Rule-11 | partial | ingestor.1 | partial: checkOrderGuaranteesCited (declared half only; GAP G-3 open) |
| Rule-10-addendum-R-H | none | core.6 | no machine check for INFO-vs-WARN (GAP G-5) |
| P4-1 | none | x-rulings.1 | no machine check: procedural |
| P4-2 | none | x-rulings.1 | no machine check except R-EZ commit-msg citation for integrate branches |
| P4-4 | partial | x-rulings.1 | partial: spec124-register-locks.logic names-a-lock arm covers every row, with 15 lockless pre-R-CX rows grandfathered (shrink-only) |
| P4-6 | none | x-rulings.1 | no machine check: G9 checks the Reflection section exists |
| L7-0 | none | x-rulings.2 | no machine check found (consolidate-1 inventory) |
| L7-3 | none | x-rulings.2 | no machine check found (consolidate-1 inventory) |
| K2 | none | x-tooling.3 | no machine check: programme stop criterion; UNCERTAIN who checks |
| GAP-G-3 | none | ingestor.1 | no machine check: completeness half open |
| GAP-G-5 | none | core.6 | no machine check: author judgment |
| R-FD | none | core.6 | no machine check: assert-coa-freshness.infra locks the two bounds' externalization, not the inclusive form or the retired fail>warn refusal (moved from W4A-R2, whose register row R-FD is) |
| Q-B1 | none | link.4 | no machine check: an open operator question; its interim constraint (averaging not_evaluated) is prose in the 124a R-CR row |
| Rule-1 | partial | core.1 | partial: step-conformance.infra — compute-shape rules fire on the known-bad fixture (the compute slice of Rule 1 only) |
| Rule-5 | partial | core.2 | partial: step-schema.logic — checks may never be "none" (checks:[] minItems not fixture-tested) |
| V6 | partial | core.3 | partial: s4-empty-source-guard-real-descriptors.logic — typed empty_source string and array forms halt end-to-end (illegal form rejection untested) |
| R-AW | partial | core.8 | partial: logic-var-parity.logic — seed/code literal parity for the founding instance only; no fleet check |
| R-FC | partial | core.8 | partial: r-de-vocabulary.logic — <slug>_<name> end-state naming; migration with values carried not asserted (moved from W4A-R1, whose register row R-FC is) |
| R-CF | partial | core.9 | partial: refresh-snapshot-query-consolidation.logic — one step declares execution.read_gucs and sets no GUC in compute; runner issuing the GUC not asserted |
| Rule-8 | partial | core.12 | partial: step-schema.logic — per-target guard_why if/then fires; step-level discipline refusal untested |
| R-FF | none | core.14 | no machine check: classify-coa-scope.infra asserts the legacy script contract, not the by:"pin" watermark form; only the reader side is locked (R-DO/R-ER) (moved from W4A-R4, whose register row R-FF is) |
| R-AY | partial | core.17 | partial: steps/compute_parcel_cost_estimates/violations — founding step's population bound only; not required fleet-wide |
| R-EV | partial | ingestor.6 | partial: steps/coa/compute.logic — TZ-independent data_hash; admission conditions (a)-(d) not asserted |
| R-CR | partial | link.3 | partial: migration-255-parcel-abutments.infra — trigger installed; guards.requires declaration not asserted |
| R-CI | partial | enricher.2 | partial: purity-s3-exec-seam.logic — undeclared writesRef refused; library-owned hygiene DELETEs not asserted |
| R-AI | partial | x-captures.1 | partial: step-conformance.infra — indirect: step-validate self-test (expectedCaptureChains fixtures) passes |
| R-CP | partial | x-captures.5 | partial: gate-score-floor.infra — notLookedReasons locked both ways; not that every live test calls it |
| Rule-13 | partial | x-validate.1 | partial: step-conformance.infra — scorecard block staleness only |
| Rule-13-addendum-R-T | partial | x-validate.1 | partial: step-library.logic — invariants/plausibility EVERY_RUN executor rows; DATA-vs-PROCESS split not asserted |
| P4-3 | partial | x-rulings.1 | partial: spec124-register-locks.logic — register rows parse with unique ids; statement/amends columns unchecked |
| L7-2 | none | x-rulings.2 | no machine check: rung ordering is a judgement call; no test (verify-12 N1 re-audit) |
| R-AQ | partial | x-verify.2 | partial: run-chain-selection.logic — --only/--from partial-run mechanism; "one acceptance set" not asserted |
| R-AH | partial | x-tooling.2 | partial: step-conformance.infra — indirect: step-validate self-test (checkCompressedFormDefault fixtures) passes |
| R-KF | none | core.9 | OWED MB-31: step-closure.logic.test.ts (recorded 2026-10-30-batch-aj, lock not yet built) |
| R-KI | none | x-tooling.1 | OWED MB-68: hook arms; hooks-composition.infra (MB-68) (recorded 2026-10-30-batch-aj, lock not yet built) |
| R-KJ | none | core.9 | OWED MB-31: the R4-09 input-allowlist test (step-closure.logic.test.ts) (recorded 2026-10-30-batch-aj, lock not yet built) |
| R-KK | none | x-tooling.3 | OWED MB-67: mcbylaws-queue-check.mjs (MB-67) (recorded 2026-10-30-batch-aj, lock not yet built) |
| R-KQ | none | x-tooling.3 | OWED MB-73: mcbylaws-promises.logic.test.ts (MB-73) (recorded 2026-10-30-batch-aj, lock not yet built) |
| R-KS | none | core.11 | OWED MB-31: trace test in catalogue lock (MB-31) (recorded 2026-10-30-batch-ak, lock not yet built) |
| R-KT | none | core.9 | OWED MB-31: step-closure.logic.test.ts input allowlist (MB-31) (recorded 2026-10-30-batch-ak, lock not yet built) |
| R-KU | none | x-tooling.3 | OWED MB-73: mcbylaws-promises.logic.test.ts red fixtures (MB-73) (recorded 2026-10-30-batch-ak, lock not yet built) |
| R-LR | none | x-tooling.3 | OWED MB-67: gate arm (MB-67) refuses any McBylaws script or night whose database target is not 127.0.0.1:54322, red fixture a remote target (recorded 2026-10-30-batch-al, lock not yet built) |
| R-KW | none | x-tooling.3 | OWED MB-67: mcbylaws-queue-check.mjs on temp repos Q1..Q5 (MB-67) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-KX | none | x-v3.2 | OWED MB-67: hold.mjs H1..H7 per-commit parent-tree check (MB-67) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LB | none | x-tooling.1 | OWED MB-67: precommit-budget.mjs --measure with a re-pinned evidence file (MB-67) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LG | none | x-tooling.1 | OWED MB-68: loop-gate record schema tests (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LH | none | x-tooling.1 | OWED MB-68: loop-gate regression-ratchet and oracle-first red fixtures (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LI | none | x-tooling.1 | OWED MB-68: loop-gate oracle-first red fixtures, split-commit and glob-miss cases (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LJ | none | x-tooling.1 | OWED MB-68: loop-gate one-increment fixtures (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LK | none | x-tooling.1 | OWED MB-68: loop-gate floor_fell fixture on an OWED line (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LL | none | x-tooling.1 | OWED MB-68: loop-gate --mode ci prints "external groups: not run in CI" (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LM | none | x-tooling.1 | OWED MB-68: loop-gate canary fixture (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LN | none | x-tooling.1 | OWED MB-68: hooks-composition.infra: the loop arm is wired by MB-67 only (MB-67, MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LO | none | x-tooling.1 | OWED MB-68: loop-gate verify --json prints rounds_since_thresholds (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LP | none | x-tooling.1 | OWED MB-68: loop-gate fast-set and full-set runs (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LQ | none | x-tooling.1 | OWED MB-68: loop-gate reason-length red fixtures (MB-68) (recorded 2026-10-30-batch-al, lock not yet built) |
| R-LS | none | x-v3.2 | OWED MB-67: the lock is named by the owning task (recorded 2026-10-31-batch-am, lock not yet built) |
| R-LT | none | x-v3.2 | OWED MB-67: the lock is named by the owning task (recorded 2026-10-31-batch-am, lock not yet built) |
| R-LU | none | x-v3.2 | OWED MB-67: the lock is named by the owning task (recorded 2026-10-31-batch-am, lock not yet built) |
| R-LV | none | x-v3.2 | OWED MB-68: the lock is named by the owning task (recorded 2026-10-31-batch-am, lock not yet built) |
| R-LW | none | x-v3.2 | OWED MB-68: the lock is named by the owning task (recorded 2026-10-31-batch-am, lock not yet built) |
| R-LX | none | x-v3.2 | OWED MB-67: the lock is named by the owning task (recorded 2026-10-31-batch-am, lock not yet built) |
| R-LY | none | x-v3.2 | OWED MB-67: the gate tests do not yet name R-LY (recorded 2026-10-31-batch-an) |
| R-LZ | none | x-v3.2 | OWED MB-79: no test names R-LZ yet (recorded 2026-10-31-batch-an) |
| R-MB | none | x-v3.2 | OWED MB-84: the lock is the gate exceptions test and the MB-84 push-gate run (recorded 2026-11-03-batch-av) |
| R-MC | none | x-v3.2 | OWED MB-79 (f): no test names R-MC yet (recorded 2026-11-03-batch-aw) |


