# verify-12c: wf2/v3-backfill-9 @ a906623f

Lane: verify-12c (R-EZ independent verification, operator y 2026-10-20). Read-only. Author lane: backfill-9.
Branch: `wf2/v3-backfill-9` @ `a906623f` (worktree `~/Buildo-wt-bf9`), parent `1d16f155` (= `wf2/rulings-8`).
Commits: `a5dd74f1` (W4A trace copy), `69700ef0` (23 hidden sources copied), `941923b5` (R-FC…R-GO → 124a §B20 via M34; §B21), `a906623f` (applied citations, scorecards, E1 ratchet).

## Verdict: BLOCK (narrow; one entry plus one row text)

All 39 rows cite real operator approvals at the cited tracked lines. Every quote was found at its line. The markdown emphasis is dropped in the quotes, but the words are verbatim. One applied citation is wrong: link_parcels' grandfathered entry (g1-21) is cited to R-FL, the pilot-3 operator authorization. That entry was ruled by the orchestrator in pilot 7 and self-adjudicated for LP-D10. Pilot 7 never got operator authorization: its status is "Planning", and §B21 itself says pilot-7 entries were demoted to (c). So this applied citation gives an operator stamp to a non-operator decision. R-FL's rule text is overstated in the same way. Fix both before integrate-12; nothing else blocks.

## Checks

| Check | Result |
|---|---|
| Byte-compare 24 copies vs `~/Buildo/.cursor/` | 23/24 `cmp`-identical. `2026-10-20-operator-queue-snapshot.md` = the first 1,639 lines of the live `QUEUE.md`, which grew by 4 lines at 11:07, after the 11:04 commit (`diff`: appended lines only, 0 removed/changed). Identical at commit time. |
| Secret scan (24 files) | CLEAN. No `sk-…`, API keys, tokens, JWTs, `postgres://user:pass@`, AWS/GH keys, private keys, Supabase project refs, or `DEEPSEEK_API_KEY=` values. Keyword hits are prose only: password rotation todo (queue :66/:96/:179), a note that a Supabase password was committed in OTHER files (queue :159, no value), `.env` mentions, and a pooler region hostname (queue :1037; not a credential). |
| 39 register rows: quotes at the cited lines | 39/39 found at the cited line. |
| Totals | JSON 199 entries plus 19 R-BH staleness entries = 218. a = 16+19 = 35; b = 147 (91 bundled + 56 now); c = 36. now = 58+19 = 77; bundled-night = 105. All match the claims. |
| (b) sample (34 entries) | 27 governed; 6 governed weakly (precedent or partial); 1 wrong (g1-21). See Findings. |
| (a) sample (16 JSON + 4 R-BH) | 20/20 governed (g1-6 R-EP covers only the per-feature half of a two-part deviation; g1-7 R-I is right but R-FK is the exact row). |
| (c) sample (10) | 9 had an adequate search (the notes are conservative and honest). Possible miss: g4-35 (load_heritage intentional `inputs.reads` omissions). R-GG's own cited text (:413) says "an intentional omission is an explicit deviation". |
| Bundled-night descriptor citations | All 105 checked mechanically (not just 10): the file exists, `deviations[deviation_index].from` equals `key` (0 mismatches), and none is pre-applied. |
| V3 label | `--all --fast --v3-json` at a906623f: V3 = {geocode_permits, link_parcel_abutments}, which equals `v3-label-high-water-mark.json` v3[]. At parent 1d16f155, geocode_permits = V2, failing only on "9 spec_version:not_executed no rule id"; at a906623f, 17/17 with standard=V3 and no R-EY (9) line. |
| R-EY (9) lines | 37 at 1d16f155 → 30 at a906623f (measured both). |
| Suite | 17,843 pass, 0 fail, 28 skip, plus `admin-lead-schemas.contract` 24/24 rerun after linking `mobile/node_modules` (env-only failure in my worktree) = **17,867 pass / 0 fail**. Reproduced. |
| `step-validate --all --fast` | exit 0 (run twice). |
| `spec-split-check --check` | clean: 39 moves, 7,127 citations, 0 dangling, budgets held. |
| Worktrees | `scratchpad/verify-12/wt-bf9` and `wt-parent`, both clean, both removed. |

## Per-row table (39)

| Row | Source (tracked) | Operator evidence at the cited line | Class |
|---|---|---|---|
| R-FC W4A-R1 | queue :1190, :1159; trace :26, :36 | "4. y: wave-4 rulings … W4A-R1..R6" (2026-10-18 20:30 OPERATOR ANSWERS); draft R1 :1159; recorded under consolidation decision 3 (queue :1632 "Operator '1-4 y' … W4A trace file tracked + register rows") | SOUND |
| R-FD W4A-R2 | queue :1190, :1160; trace :37 | same | SOUND |
| R-FE W4A-R3 | queue :1190, :1161; trace :35 | same | SOUND |
| R-FF W4A-R4 | queue :1190, :1188; trace :32 | same, plus item 2 (fold W4A-R4 into #37). NOTE: the 10-18 draft (:1157) was a "by:seen invalidator + written:seen". The row's "never a new by:seen" is the trace's later disposition, made under item 3 ("show following a ruling") and ratified by consolidation decision 3. | SOUND (note) |
| R-FG W4A-R5 | queue :1190; trace :33 | same | SOUND |
| R-FH W4A-R6 | queue :1190, :1164; trace :34 | same (the #38–#39 widening comes from the trace) | SOUND |
| R-FI | 122a :669, :674 | "Reviewed and accepted by the operator 2026-08-23" | SOUND |
| R-FJ | `.cursor/pilot2…` :2, :174 | authorized 2026-08-25 "proceed. Looks good!"; D-8 PIN | SOUND |
| R-FK | `.cursor/pilot2…` :186 | "LR-D9, operator ruling §7.1 2026-08-26" | SOUND |
| R-FL | `.cursor/pilot3…` :2, :278 | authorized 2026-08-27 (operator condition). The E1 clear (Fold B item 2) and A-8 are operator-authorized. **The "batch-scoped keyed DELETE" and "link_parcels' grandfathered keyed DELETE" are not in pilot 3:** link_massing writes[2] is O4 row 5 (operator, 2026-10-03), and link_parcels writes[1]/[2] are "Fold A B-1 + orchestrator ruling … LP-D10 self-adjudicated" (pilot 7, status Planning). | **OVERSTATED** |
| R-FM | 2026-08-28-plan-pilot4 :2 | operator "…Proceed" | SOUND |
| R-FN | …pilot5 :2, :85 | operator pre-authorization | SOUND |
| R-FO | …pilot6 :3, :31 | operator "yes on a-c" | SOUND |
| R-FP | `.cursor/pilot9…` :2, :29 | "AUTHORIZED 2026-09-04" follows the plan's "Do you authorize? (y/n)". The line does not name the operator; the row says "plan authorized", which is honest. | SOUND (note) |
| R-FQ | …i4-link-neighbourhoods :3, :370 | AUTHORIZED with six Asks at defaults | SOUND |
| R-FR | parcel-sanity assessment :50, :52 | "Operator Rulings … recorded verbatim"; "A1 y" | SOUND |
| R-FS | …enrich-heritage :3, :617 | operator pre-authorized; H-A1 ruled (:110 "ADOPTED (operator, 2026-09-20)") | SOUND |
| R-FT | …address-points :2, :35 | "authorized y/y/O1=strip, operator" | SOUND |
| R-FU | address-points assessment :272 | "operator ruled the spec wrong" | SOUND |
| R-FV | …load-centreline :2, :47 | AUTHORIZED by operator (quote) | SOUND |
| R-FW | …class-c-retract-all-guard :2, :35 | operator "option A…" | SOUND |
| R-FX | …massing :2, :81-107 | AUTHORIZED by operator, conditional | SOUND |
| R-FY | …neighbourhoods :2, :91 | operator authorized, conditional. NOTE: the plan uses NB-D ids; descriptor/ledger use N-D. | SOUND (note) |
| R-FZ | …load-wsib :2, :104 | :2 is word-for-word wf2_hygiene's status line (copied). The row says "Operator confirmed 2026-10-20", which is true (queue :1639), so it does not rest on the 09-27 source alone. NOTE: the header still dates the decision 09-27, and the confirmation has no cite; add queue :1639. | SOUND (confirmed) |
| R-GA | …skip-rate-never-fails :2, :58 | same copied line; confirmed 10-20 (queue :1639) | SOUND (confirmed) |
| R-GB | …load-heritage :2, :88 | same; confirmed 10-20 | SOUND (confirmed) |
| R-GC | …load-zoning :2, :95 | same; confirmed 10-20 | SOUND (confirmed) |
| R-GD | …parcels-geom-guard :2, :114 | operator "y"; D2 A+W | SOUND |
| R-GE | …enrich-centreline :2, :84 | "Authorized 2026-09-29 (operator; … D1–D5 ruled)" | SOUND |
| R-GF | …ingest-prereq-0x :2, :173 | The operator's own "y" on 09-29 was the D1(a)/O-1 scope cut (:364, :403). The LH-D8 standalone-status behaviour rides "batch2_load_heritage authorization", which is the copied 09-27 line (confirmed only via R-GB on 10-20). The descriptor says "orchestrator ① decision 4". | **OVERSTATED** (note) |
| R-GG | enrich-centreline assessment :411, :413 | "Rule (operator, 2026-09-30, new conversions)". Agent-written attribution with no second source found (queue/git/.cursor searched). | SOUND (note) |
| R-GH | …lot-size-wipe :2, :62 | operator "proceed" | SOUND |
| R-GI | …ingest-prereq-0y :2, :502 | "Authorized 2026-10-02"; :546 "Operator D2/D3 (authorization 2026-10-02)". Cite :546 too. | SOUND (note) |
| R-GJ | registry-truth :787, :791 | "Operator accepted the RECOMMENDED options … 2026-10-05" | SOUND |
| R-GK | …defer-observability :205, :206 | "Operator: approved (2026-10-06)" | SOUND |
| R-GL | bylaw-map-areas assessment :42 | secondary record "operator 2026-10-08"; confirmed 10-20 (queue :1639) | SOUND (confirmed) |
| R-GM | queue :1050; coa assessment :216 | "2026-10-17 OPERATOR y … CoA: …" | SOUND |
| R-GN | queue :1119; wave4 :429, :431 | "Wave 4 = 6 coa steps, all 15 recommendations APPROVED" (15 confirmed; Q10/Q12 among them) | SOUND |
| R-GO | queue :1190; trace :38-43; cost assessment :202-203 | operator item 4 y (Q-C2..C4, Q-CE1..CE3, lane B 1–9) | SOUND |

Counts: SOUND 37 (5 are operator-confirmed 2026-10-20 and 9 carry notes), OVERSTATED 2 (R-FL, R-GF), NOT-AN-OPERATOR-DECISION 0 at row level, WRONG-CITE 0.
On the 5 confirmed rows (R-FZ/GA/GB/GC/GL): each says "Operator confirmed 2026-10-20", and §B21 says so explicitly. Their headers still read "operator 2026-09-27/10-08" with no cite for the confirmation.

## Findings

**BLOCKING**

- **B1. g1-21: link_parcels' grandfathered.json entry is cited to R-FL.** The entry's own `adjudicated_by` reads "Fold A B-1 (2026-08-30) + orchestrator ruling (commit 7 dispatch); LP-D10 widening self-adjudicated". The pilot 7 plan (`~/Buildo/.cursor/pilot7_link_parcels_active_task.md`:3) says "**Status:** Planning", with no operator authorization. §B21 itself demotes "pilot 7 and pilot 8 plan entries" to (c). Fix:
  - Remove `[register: Spec 124 R-FL …]` from that entry.
  - Reclassify g1-21 as (c) and add it to the rulings page.
  - Trim R-FL's rule text to what pilot 3 decided: the E1 clear-then-reassign UPDATE plus the gate-read/ternary retirements. Drop "a batch-scoped keyed DELETE" and "link_parcels' grandfathered keyed DELETE". If link_massing writes[2] needs a cite, it is O4 row 5 (operator 2026-10-03, registry-truth folds 14+15), not pilot 3.

  No V3 label moves today (link_parcels stays V2), so no measured number changes.

**NOTE**

- N1. R-GF's authority is weaker than stated: see the table. Ask the operator to confirm it, as for the five weak rows, or cite R-GB as the authority chain.
- N2. R-FZ/R-GA/R-GB/R-GC/R-GL: add the confirmation cite `docs/reports/2026-10-20-operator-queue-snapshot.md`:1639 in each row, and consider dating the authority to 2026-10-20.
- N3. Weak (b) applications, each defensible but resting on precedent or covering only part of the entry:
  - g3-8 parcels txn_scope: the descriptor says "orchestrator-ruled", but R-FT is a general rule.
  - g4-28 load_heritage LH-D8: "orchestrator ① decision 4".
  - g2-21 enrich_heritage EH-D2: adjudicated by Spec 124 §7 rung (b); arguably (a).
  - g1-1 assert_schema: adjudicated by §1.10.
  - g3-4/g3-10: R-FJ covers the blocking:false half only.
- N4. Possible (c) miss: g4-35. R-GG's quoted text covers intentional `inputs.reads` omissions.
- N5. The citations JSON evidence still points at 7 untracked, uncopied `~/Buildo/.cursor` files: pilot7, pilot8, batch2_p1_1, batch2_p2_4, batch2_p3_7, wf1_load_coa_notices, wf1_mcbylaw_phase2_inputs. They are used in R-FR (g2-14..16), R-FT (g3-8), a/g2-23 and several (c) entries. The register rows themselves cite only tracked files.
- N6. The live `QUEUE.md` has grown since the snapshot. The tracked copy is a dated snapshot, so this is fine, but any future copy must be re-taken.
- N7. R-FY: the plan's NB-D ids vs the descriptor/ledger N-D ids. Say so in the row.
- N8. None of the lock files the new rows name (`v3-label-enforcement.logic`, `r-de-vocabulary.logic`, `assert-coa-freshness.infra`, `classify-coa-scope.infra`, `step-ctx-keys.logic`, `step-validate-stage-captures.logic`) mentions any R-FC…R-GO id. That passes the R-DF row lock, which only checks that the files exist. It matters for handbook-1 (below).

## Integration collisions and proposed renumbering

- **124a §B20 collision.**
  - `wf2/p4-integrate-11` (466d6bdd) contains rulings-8 + v3-label + rulings-7, and renumbered rulings-7's §B17 to **§B20** ("Conflict checks and V3 admission tables for R-EW, R-EX"). Its verification reports already cite §B20.
  - backfill-9 also creates §B20 (R-FC…R-GO, M34) and §B21.
  - **Proposal:** at integrate-12, keep integrate-11's §B20 and renumber backfill-9's §B20 → **§B21** and §B21 → **§B22**. Re-anchor:
    - M34 `to_anchor` in `122_split_manifest.json`;
    - Spec 124 :268 and :270 (M34 pointer lines);
    - the §B21→§B22 body text "Rows R-FC…R-GO are in §B20 (move M34)";
    - the citations JSON `$comment` ("124a §B20/§B21").
  - Then run `spec-split-check --refresh` / `--check` and regenerate the handbook.
- **M ids.** integrate-11 tops out at M33 (rulings-7's and rulings-8's M33 already reconciled to R-DF…R-DT). backfill-9's M34 does not collide.
- **R ids.** R-FC…R-GO do not collide with R-EW/R-EX (rulings-7) or R-FA/R-FB.
  - The Spec 124 allocation line: integrate-11 says "next free R-FC"; take R-GP.
  - Spec 124 lines: 372 → integrate-11 374, backfill-9 376; the merge is about 378 against the 380 budget. That is tight, so re-measure.
- **wf2/handbook-1 (316c8f38) `rule-map.json`.** It maps 263 ids, ending at R-FB.
  - On merge with backfill-9, arm (a) ("covers every register id") goes RED for 39 ids. Add R-FC…R-GO entries, and point `meta.register_rows_owed` W4A-R1…R6 at R-FC…R-FH (`by` + `status_reason`) per `docs/handbook/INTEGRATION.md`.
  - `meta.pending_integration` (R-EW, R-EX, COA-D13/D14) empties when rulings-7 lands, as integrate-11 already does.
  - Arm (e) refuses a `kind:"lock"` mapping whose test never names the rule, and the unenforced list is shrink-only (ceiling 67, operator-confirmed). The integrator must either add the ids to the named lock tests (e.g. a condition-9 fixture in `v3-label-enforcement.logic` naming R-FI…R-GO, and the W4A locks naming R-FC…R-FH) or get an operator ruling to raise the ceiling.
  - The R-DF row lock (`spec124-register-locks.logic`) passes: the rows are V3-labelled and name existing files.

## Reproduction

- `node scripts/analysis/spec-split-check.mjs --check` → clean.
- `node scripts/analysis/step-validate.mjs --all --fast [--v3-json=…]` at a906623f → exit 0, 30 R-EY (9) lines; at 1d16f155 → exit 0, 37 lines.
- `VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test` → 17,843 pass, 28 skip, plus 24/24 on the env-dependent contract file = 17,867 pass / 0 fail.

## Re-verification of b0ce5ba4 (verify-12f, 2026-10-20)

Branch `wf2/v3-backfill-9` @ `b0ce5ba4`. Full detail: `scratchpad/verify-12/wf2-v3-backfill-9-fix.md`.

- B1 fixed. g1-21 is uncited in grandfathered.json (the only diff in that file) and moved to (c) with what was searched. R-FL is trimmed to pilot 3 (E1 UPDATE + gate-read/ternary retirements); its three remaining users (g1-8, g1-11, g1-12) fall inside it. link_massing's keyed DELETE points at O4 row 5 (:720, checked).
- N1 fixed: R-GF is limited to the 2026-09-29 O-1 y (:364/:403 checked) and is cited by no entry. g4-28 → c; g4-31 → R-GB (:86 checked).
- N2 fixed: the five confirmed rows date their source record and cite queue snapshot :1639 (checked).
- N4: g4-35 → b via R-GG (:413 checked) is right. R-GI cites :546 (checked). M-D11 → R-FX (:91) and N-D8 → R-FY (:51) are correct. The weak (b) demotions (g3-4, g3-10, g3-8) are sound.
- M34 is byte-identical. The block hash matches the manifest, and the stub and bridging lines equal `buildStub` / refresh output. Only the 12 corrected rows changed.
- Counts: a 35 / b 143 / c 40, 102 bundled-night, 57 + 19 now (all 57 present in files). V3 = {geocode_permits, link_parcel_abutments}, unchanged.
- Suite 17,867 / 0. `step-validate --all --fast` exit 0. `spec-split-check --check` clean.

**Branch verdict: PASS-WITH-NOTES.** Minor notes: g4-35 has an empty `evidence[]`; the re-cited entries keep the 09-23 decision_date; R-GF is uncited. The integration notes above (§B20/§B21 renumber, R-GP, handbook-1 rule-map) still apply.
