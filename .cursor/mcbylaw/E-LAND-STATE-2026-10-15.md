# E-LAND state, 2026-10-15 (machine migration)

> **Superseded 2026-10-16 (landing).** This lane landed on branch wf1/mcbylaw-eland-land, which is based on main 31ab81f8 and re-applied from bd332ec8. The W1 drafts (249 files) and the M-175 lock land with it. M-175…M-179 are written. `--check` exits 0 with gates 9/9 (G-EVAL V12 withdrawn per ADJ-3). The next free 69a id is M-180. The state below is the 2026-10-15 snapshot.

**Where things stand.**
- Worktree `C:/Users/User/Buildo-wt-mcbylaw-p2`, branch wf1/mcbylaw-p2-core.
- Everything since the bd332ec8 landing is STAGED and UNCOMMITTED (the orchestrator commits).
- **Last `--check`** (exit 0, measured): `STANDARDIZED: PASS (complete 1316 / in_scope 4123; pending 2807 (phase1 0 / phase2 2807); failed 0; gates pass 9/9)`, `PHASE 1: NOT_DONE` (G-AUDIT / M-29 owed; M-104).
- **Checks:** targeted bylaw tests pass at one fork, `spec-split-check` is clean, `system-map` is regenerated.

**What is staged.**
- `scripts/seeds/bylaw/adjudications.json`: every operator answer and M-75 correction through W1 round 4 (4a + 4b + low), plus:
  - the Phase 1 correction pass, the M-106 card, the twin sweep and RECS-3 / V11;
  - Q-M 150.48 uses, P5u (`non_residential_building`, 9 units);
  - the 1351(B) `ref_target_absent` disclosure.
- `scripts/seeds/bylaw/vocab.json`:
  - licence patterns M-132 / M-134 / M-157 / M-161 / M-162 / M-166;
  - reasons `lot_condition_arm_not_modelled` / `limit_arm_not_modelled`;
  - targets / tokens: `aggregate_side_setback_m`, `side_yard_abuts_street`, `storey_count_band`, `platform_height_band`;
  - `coa_mismatch`;
  - the M-158 `lawfully_existing` join and caveat block (templates, phrases, constants);
  - the M-159 blocks (`zone_category_chapter`, `accessory_structure_use`, `specific_use`, `non_accessory_use`; uses `school`, `portable_classroom`);
  - the M-160 `scenario_class_units`.
- `scripts/analysis/bylaw/shape.mjs` and `authored-fixtures.mjs`: the LIMIT-only locks for M-107 / M-130.
- `scripts/analysis/bylaw/keying.mjs`: brief rules 27–30. The file is shared with W1-TOOL, whose own edits are staged there too.
- Tests: `bylaw-rulings` and `bylaw-s6g` logic tests (M-107…M-159 locks).
- Docs:
  - `docs/specs/01-pipeline/69a_mcbylaw_register.md`: M-103…M-167 and the dated notes.
  - Spec 68: pointers only; it is at about 102.6 KB of its ~103.2 KB budget.
  - Spec 129 §7 / §8 / §16: oracle C notes.
  - `docs/reference/bylaw-provisions.{json,md}` and `bylaw-code-findings.md`: regenerated.
  - `docs/specs/00-architecture/00_system_map.md`
  - `.cursor/mcbylaw/compliance-2026-10-14.md`: the matrix, sections A–G.

**Pending / owed.** H-lane (Mac): the 600.60 overlay map seed load (M-173).

- **Re-key corrections**, each already ruled:
  - 900.3.10(10)(F) and (13)(D) → LIMIT `side_setback_street_m` (M-161);
  - 509(D) and 180(B) → LIMIT `rear_setback_m` (M-162);
  - 18(E)(i) → LIMIT `gfa_m2` (M-166).
- **Follow-up WF3s, recorded and not built:**
  - the slicer list-unit propagation (M-164; 473(A) stays interim UNUSUAL);
  - the `namedTypes` street-suffix fix (M-163);
  - the R2-2 (b) `extractRefs` skip for [PBS] former-by-law citations (M-135).
- **P2-0 seat:**
  - M-158 caveat rendering via `template[phrase.template ?? bound]` and reading the vocab constants;
  - the M-159 loader and `applies()` scopes;
  - attaching the generated `displaces[]`;
  - registering `existing_footprint_sqm` in `vocab.user_input` and `eval-vocab.json`.
- **Other:**
  - `recs3-held.json` (8 P13 leaves), once those units agree;
  - the M-106 re-type card units beyond 10.5.40.60 (if any remain);
  - the inferred `max_lot_units: 3` vs M-63's 2–4 (M-160 open item);
  - the Phase 2 space-kind vocab (M-146);
  - the `ambiguous_zone` source fix (M-109 note);
  - Phase 1 DONE: G-AUDIT / M-29.

**Next ids.**
- Spec 69a: M-175 is the next free id (M-174 = RM review batch; held: zone-label labelled() fix pending a V25 re-adjudication; M-173 = houseplex 5–6 class, townhouse driveway default, main-wall pairs; M-172 = site facts vs design choices; M-168 = Q-N `permitted()` height input; M-169 = undetermined-condition default + disclosure; M-170 = triangular-lot token + DEFINE disclosure sentences; M-171 = GFA-deduction disclosures); E-LAND is the single writer of §1a.
- Spec 124: unchanged by this lane; the next free id is R-CO, reserved by the orchestrator.
- Backups of `adjudications.json` before each batch are in the session scratchpad `e-land/`. They are lost with the machine; the staged file is the source of truth.
