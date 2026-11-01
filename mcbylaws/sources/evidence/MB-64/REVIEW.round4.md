# MB-64 review, round 4 (2026-10-31)

Seat: McProof reviewer re-check after round 3 (stages per MB-77/MCPROOF.md v4.1 Part A). Scope: 16 examples (PERM-5, PERM-6, PERM-7, FY-10, FY-14, FY-21, FOOT-16, ST-4, LV-5, LV-6, LV-7, HT-3, GFA-7, SB-3, FOOT-18, SB-5), diffed against worked-examples.pre-r3fix.md. Operator rulings applied: ~/Buildo-scratch/p2close/CARD-o19-o21.answered.md:6-8 (O-19 token adopted, O-20 flag shape_calibrated, O-21 fallback with "ring not used"; queue rows MCBYLAWS-QUEUE.md:581-583). Nothing in worked-examples.md, the queue or any repo was edited; nothing published. reviews.json merged (backup reviews.pre-r4.json); config_sha 66d1fda2f5d06727; example_sha per record (first 16 hex of SHA-256 over layer, question, chain, rulings, inputs, answer).

## Counts (16 examples)
| Verdict | Count | Examples |
|---|---|---|
| approved | 13 | PERM-6, PERM-7, FY-10, FY-21, FOOT-16, ST-4, LV-5, LV-6, LV-7, HT-3, GFA-7, SB-3, SB-5 |
| change | 2 | PERM-5, FY-14 |
| needs_you | 1 | FOOT-18 |
| parked | 0 | (none; see "Stage 5 parked" below for four non-mandatory stage 5 records) |

## Method as run
- Stage 0 (reality check) and stage 4 (grounded recommendation): Claude seat. Every quote and ruling citation re-read at file:line; every sum re-run with node; DB facts re-read with set default_transaction_read_only=on on 127.0.0.1:54322 (PERM-7 count 393,297 of 440,093; HT-3 parcel 119522 cell).
- Stage 3 (blind) and stage 5 (calculation): DeepSeek (deepseek-reasoner) through scripts/deepseek-review.js, four batches each (a: FY-10/14/21/FOOT-16; b: PERM-6/7; c: ST-4/HT-3/GFA-7; d: LV-5/6/7, SB-3, SB-5, FOOT-18). Prompts built from a whitelist (question, layer, zone, clauses, rulings, inputs); Why, Basis, hand result, OP-OK, Changed withheld. The PERM reading card was kept out of the PERM-6 context because it states the answer. All prompts under 120,000 characters (prompt plus context at most about 55,000). Raw prompts, contexts and every attempt are in ds/r4n3-* and ds/r4n5-* (attempts as .try1/.try2/.try3).
- Answer-table rule (MCPROOF A7): a reply counts only if it holds the asked table (id | answer | rule | recommendation for blind; id | steps | FINAL for calculation) with a row per id. First conforming attempt is the stage result; critique-only or wrong-format replies are kept as evidence, never as results. Max 3 attempts (1 + 2 retries).
- Layers: Source (PERM-5) blind n/a; Arithmetic (ST-4, FOOT-18) run on the full path because no sizing.json exists to prove low-risk; City stage is the generator's and was not touched; regression kept from earlier rounds after re-reading research/Q7-past-research-sweep.md (no new class (c) item).
- Gemini: not run (not part of this task; its credits were depleted in round 2). One case meets the trigger (FOOT-18, below).

## Per example

### PERM-5 (Source): CHANGE
- Stage 0: differs. Round-3 fix landed in the question, Why and Hand result ("as quoted from the pinned by-law file"). One residual over-claim: the Basis (worked-examples.md:10) still says "Check only that these are the right clauses and the current text". 10.20.20.10(1) and 10.10.20.10(1) are amended by 545-2019 [not_verified] (~/Buildo/docs/reference/bylaw-provisions.md:512, :412), so "current text" is the defect round 3 named.
- Stage 3 blind: n/a. Source layer: blind may be n/a (MCPROOF A7 table). No calculation.
- Stage 4: differs. Change: replace "and the current text" in the Basis by "and the text as quoted from the pinned file". Quotes verified exact: 10.20.20.10(1) ~/Buildo/docs/reference/bylaw-provisions.md:512 ("Dwelling Unit in a permitted residential building type in Clause 10.20.20.40"); 10.20.20.40(1) :514; 10.10.20.10(1) :412; 10.10.20.40(1) :414. Q7-02 (a) research/Q7-past-research-sweep.md:38 agrees.
- Stage 5: approved. Source layer: arithmetic = quotes exact at the cited line. Checked by reading lines 412, 414, 512, 514 of ~/Buildo/docs/reference/bylaw-provisions.md (grep -F on the clause id); all four quotes and the listed amending by-laws match.
- Fix to make: Basis, worked-examples.md:10: "Check only that these are the right clauses and the current text" -> "Check only that these are the right clauses and the text as quoted from the pinned file". Prose only; no re-run needed (A7).

### PERM-6 (Reading): APPROVED
- Stage 0: approved. Round-3 fix verified: "same structure (not the same text...)" with the R-list difference. ~/Buildo/docs/reference/bylaw-provisions.md:414 lists (C) Townhouse and (G) Apartment Building with no major-street condition; :514 has (E)/(F) "if the lot abuts a major street"; :515 is the Chapter 900 override for houseplex, townhouse, apartment only. PERM card ~/Buildo-scratch/p2close/CARD-perm-reading.answered.md:3 approves the reading.
- Stage 3 blind: approved. DeepSeek (card withheld): "Yes, with two qualifiers": 10.20.20.40(1)(A) Detached House has no lot condition; the major-street condition attaches to (E)/(F) only; 10.20.20.40(2) does not govern the detached house. Same as the key. [ds/r4n3-b.try*.out.md]
- Stage 4: approved. Approve. Wording now accurate. Evidence: ~/Buildo/docs/reference/bylaw-provisions.md:512,:514,:515,:412,:414; research/Q7-past-research-sweep.md:37-39,:43. City stage is the generator's (67 of 71 lines, below threshold) and is not set here; Reading needs a City result or an explicit no-evidence reason (A7): left to the generator/spot list (card approve 1-6, item 6a).
- Stage 5: n/a. Reading answer is a status; no number.

### PERM-7 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: Hand result "permitted (provisional, M-417)". M-417 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:554 ("permitted is provisional and stays out of the floors"). Real-lot claim re-run read-only: bylaw_resolution_lots with permitted[1]=0 and lot_gate null = 393,297 of 440,093 (matches Why).
- Stage 3 blind: approved. DeepSeek: "permitted", tagged provisional, no other flags (M-417, R4-01 ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:479). [ds/r4n3-b.try*.out.md]
- Stage 4: approved. Approve. M-417 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:554; R4-01 ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:479; stored code 0 = permitted (ctx fact); DB count above.
- Stage 5: n/a. No number; status re-derived at stage 3.

### FY-10 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: zone lots 3,9,5,8,7 -> sorted 3,5,7,8,9, median 7, +1.0 = 8; 8 is not the by-law default 6.0 so a typed 6.0 fails. Street n=2 < 3 (fya_placeholder_street_min_n), zone n=5 meets min 5, ring [] (< min 1), own null. ~/Buildo-scratch/p2close/CARD-approve-1-6-review.answered.md:6 (+1.0 on zone median); ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:559 (M-422; its text still says "else 6.0 m", amendment owed in MB-78 as the example states). Nit: abutters are not described (est_status estimate_negative presupposes neighbours); same pattern was accepted rounds 1-3.
- Stage 3 blind: approved. DeepSeek: 8.0 m (zone median 7.0 + 1.0), needs_survey flag. Same as the key. [ds/r4n3-a.try*.out.md]
- Stage 4: approved. Approve. Re-run: node median([3,9,5,8,7]) = 7; +1 = 8. ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:64 (R3-03); ~/Buildo/docs/reference/bylaw-provisions.md:323,:576.
- Stage 5: parked. Stage 5 call (4 FY/FOOT records) returned critique, not a table, on 3 attempts. Not mandatory for a Ruling example; stage 4 node re-run gives 8. [ds/r4n5-a.try*.out.md]

### FY-14 (Ruling): CHANGE
- Stage 0: differs. Answer 8 is right (street [9,6,7] median 7, +1.0 = 8; n=3 meets min 3; own null; ring []), and the contradiction of round 3 is gone. But the example no longer tests what it exists to show. Why-this-exists (worked-examples.md:34): "to show the street figure leaves out this lot's direct neighbours (abutters excluded)". After the 4.0 was removed the inputs hold no abutter figure at all, so an engine that wrongly included abutters still returns 8. The question also never gives the abutter's distance (bldg_m), yet 8 holds only if the abutter is within 15.0 m: beyond 15.0 m M-414 (~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:551) sends the answer to the stored default. The Basis says so in prose only. No other FY example excludes an abutter from the street list (FY-2, 4, 6, 15 do not), so the abutters-excluded branch is now uncovered (MCPROOF A1.6).
- Stage 3 blind: approved. DeepSeek: 8.0 m. It also noted bldg_m missing (cannot run the 15.0 m test). [ds/r4n3-a.try*.out.md]
- Stage 4: differs. Change. Keep 8. Give the abutter a stored but unusable figure that WOULD move the median if it were wrongly included, e.g. a negative estimate: "street_dropped_abutters":[-0.8] (made up; consistent with est_status estimate_negative; included, street = -0.8,6,7,9 gives median 6.5, +1 = 7.5, not 8), and add "bldg_m":[8] with "abutter 8 m away (within 15.0 m)" in the question. Cites: card FS-SB2 ~/Buildo-scratch/p2close/CARD-front-setback-placeholder.answered.md:14 ("abutters excluded"); ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:559; M-414 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:551.
- Stage 5: parked. Stage 5 call parked (see FY-10). Not mandatory for Ruling. Stage 4 node re-run: median([9,6,7]) = 7; +1 = 8. [ds/r4n5-a.try*.out.md]
- Fix to make: FY-14: add the dropped abutter as a negative estimate and its distance (or reword Why to say the example only shows the placeholder falls to the street median); then rerun stage 0 (inputs change).

### FY-21 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: street [9,9] (n=2 < 3); ignoring the gate would give 9+1 = 10, the zone path gives 6+1 = 7; both differ from 6.0; l2_fallback removed; the false sentence replaced. Zone [3,9,5,7,6] sorted 3,5,6,7,9 median 6 (n=5 meets min 5).
- Stage 3 blind: approved. DeepSeek: 7.0 m (street 2 < 3, zone median 6.0 + 1.0). Same as the key. [ds/r4n3-a.try*.out.md]
- Stage 4: approved. Approve. Re-run: node median([3,9,5,7,6]) = 6; +1 = 7; median([9,9])+1 = 10. ~/Buildo-scratch/p2close/CARD-approve-1-6-review.answered.md:6; ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:559. Nit: key "est":[] appears only here (harmless).
- Stage 5: parked. Stage 5 call parked (see FY-10). Not mandatory for Ruling. Stage 4 node re-run attached. [ds/r4n5-a.try*.out.md]

### FOOT-16 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: Flags now "shape_box_assumed; front_yard_needs_survey" (worked-examples.md:70), matching the Basis ("inherited", R3-02 ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:63). Undecided front yard makes the footprint not_evaluated with its reason (R3-01 ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:62; M-385 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:522). "no_candidate" is an existing reason (MB-31/adjudication.md:47: 1 time in vocab).
- Stage 3 blind: approved. DeepSeek: footprint = not_evaluated:no_candidate (front_setback_used_m has no candidate). Same as the key. (Its note that the footprint arithmetic is moot while the front yard is undecided agrees with R3-01. The stage 5 critique separately noted that the register text of M-422, ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:559, still ends "else 6.0 m", which R3-03 and CARD-fs-sb2a.answered.md:8 supersede; amendment already owed.) [ds/r4n3-a.try*.out.md]
- Stage 4: approved. Approve. Clauses: ~/Buildo/docs/reference/bylaw-provisions.md:577 (rear), :578 (side), :570, :566, :546.
- Stage 5: parked. Stage 5 call parked (see FY-10). Not mandatory for Ruling; the answer is a status, re-derived at stage 3. [ds/r4n5-a.try*.out.md]

### ST-4 (Arithmetic): APPROVED
- Stage 0: approved. Round-3 fix verified: "The height 9.8 m is made up for the example" now in the Basis (worked-examples.md:93). Phase 2 stores no cap: 10.20.40.10(3)(B) ~/Buildo/docs/reference/bylaw-provisions.md:559; M-419 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:556.
- Stage 3 blind: approved. DeepSeek: 3 storeys, flag storeys_from_minimum_ceiling (0.512 + 3 x 2.512 = 8.048 <= 9.8). [ds/r4n3-c.try*.out.md]
- Stage 4: approved. Approve. node: (9.8-0.512)/2.512 = 3.6975, floor 3; a = 0.212+0.3 = 0.512, f = 2.3+0.212 = 2.512 (M-404 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:541); flag M-425 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:562; parapet clause ~/Buildo/docs/reference/bylaw-provisions.md:561 (use as allowance is a disclosed extension per M-404). Full path used (no sizing.json exists yet to prove low-risk).
- Stage 5: approved. DeepSeek: 9.288 / 2.512 = 3.6975, floor 3; invariant 8.048 <= 9.8. [ds/r4n5-c.try*.out.md]

### LV-5 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: no gross-vs-net comparison; 13 < 25. Net-vs-gross reason is in research/Q9-minimum-livable-size.md:53 and :106. Outcome (no headline; "no livable option") = card approve 1-6 item 4 (~/Buildo-scratch/p2close/CARD-approve-1-6-review.answered.md:9).
- Stage 3 blind: approved. DeepSeek: not livable; 13.0 < 25; no headline; lot reads "no livable option". [ds/r4n3-d.try*.out.md]
- Stage 4: approved. Approve. Minimums: CARD-parcel-minsize-review.answered.md:4. Note: LV-5 and LV-6 now test the same branch (suite below 25); the OBC 13.5 comparison they once covered is retired, and obc_combined_space_min_m2 survives only as a settings-drift floor (Q9:81), which needs no example here.
- Stage 5: approved. DeepSeek: 13.0 < 25, short 12.0; result too small / no livable option. [ds/r4n5-d.try*.out.md]

### LV-6 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: carries the approved outcome (no headline; "no livable option"), 13.5 < 25 (worked-examples.md:139).
- Stage 3 blind: approved. DeepSeek: not livable; 11.5 m2 short; no headline; "no livable option". [ds/r4n3-d.try*.out.md]
- Stage 4: approved. Approve. card approve 1-6 item 4 (CARD-approve-1-6-review.answered.md:9); minsize card :4.
- Stage 5: approved. DeepSeek: 13.5 < 25, short 11.5. [ds/r4n5-d.try*.out.md]

### LV-7 (Ruling): APPROVED
- Stage 0: approved. Round-3 fix verified: the split is now explicit (main >= 60, suite >= 25); 60+25 = 85 > 80. A later-increment example kept by the operator (CARD-approve-1-6-review.answered.md:10, item 5) and tagged increment 5, so MCPROOF A1.7 refusal does not apply. Nit: say "80 m2 of gross floor area" (the minimums are GFA, minsize card :4); DeepSeek raised the GFA-vs-FSI doubt.
- Stage 3 blind: approved. DeepSeek: no livable split (5.0 m2 short); single-building options still shown. Caveat only about GFA vs FSI-counted area. [ds/r4n3-d.try*.out.md]
- Stage 4: approved. Approve with the wording nit (prose only).
- Stage 5: approved. DeepSeek: 60 + 25 = 85; 85 - 80 = 5. [ds/r4n5-d.try*.out.md]

### HT-3 (Ruling): APPROVED
- Stage 0: approved. Round-3 wording fix verified: "moved to the later options increment, card approve 1-6, item 3" (CARD-approve-1-6-review.answered.md:8; ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:78 lists the pitched/flat pair as not in increment 1); R3-01/M-385 (~/Buildo/.cursor/MCBYLAWS-QUEUE.md:62; ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:522). Real cell re-read read-only: parcel 119522 (A0166_26EYK, data/golden-parcel-map.json) detached_house principal height_m = not_evaluated, reason condition_unknown:flat_or_shallow_roof; height_storeys = unlimited.
- Stage 3 blind: approved. DeepSeek (valid-format attempt): not_evaluated:condition_unknown:flat_or_shallow_roof, both roof options disclosed not chosen. An earlier non-conforming attempt (3-column table) proposed two options; not used as the answer. [ds/r4n3-c.try*.out.md]
- Stage 4: approved. Approve. Answer unchanged; prose-only edit.
- Stage 5: n/a. No arithmetic (pass-through).

### GFA-7 (Ruling): APPROVED
- Stage 0: approved. Round-3 wording fix verified (R3-01, M-385; approve 1-6 item 3). Undecided height keeps GFA undecided; FSI arm 0.7 x 600 = 420 is not used on its own (node-checked; footprint x 2 would be 396, so even the arithmetic of the dropped arm is unambiguous).
- Stage 3 blind: approved. DeepSeek: not_evaluated:condition_unknown:flat_or_shallow_roof (FSI arm alone 420 noted, not used). [ds/r4n3-c.try*.out.md]
- Stage 4: approved. Approve. R3-01 ~/Buildo/.cursor/MCBYLAWS-QUEUE.md:62; M-385 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:522; M-420 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:557; clause ~/Buildo/docs/reference/bylaw-provisions.md:572.
- Stage 5: approved. DeepSeek: 0.7 x 600 = 420; footprint x storeys undecided; final not_evaluated. [ds/r4n5-c.try*.out.md]

### SB-3 (Ruling): APPROVED
- Stage 0: approved. O-19 verified: token not_evaluated:setting_out_of_bounds adopted (~/Buildo/.cursor/MCBYLAWS-QUEUE.md:581; ~/Buildo-scratch/p2close/CARD-o19-o21.answered.md:6). Bounds 1..4: CARD-l31-15-16-18.answered.md:5. Status form: M-64 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:124. Sheet text cites the card correctly.
- Stage 3 blind: approved. DeepSeek: rejected, 0 below 1..4, status not_evaluated:setting_out_of_bounds. [ds/r4n3-d.try*.out.md]
- Stage 4: approved. Approve. Nit for MB-78: the Why says "the calculation refuses" while the key is a row status; O-19 adopted only the token, so whether an out-of-bounds setting stops the run (as SB-4 does for an unseeded one, card approve 1-6 item 2, :7) is not ruled. One-line wording fix suggested: "the rows that read it are not_evaluated:setting_out_of_bounds".
- Stage 5: approved. DeepSeek: 0 not in [1,4]. [ds/r4n5-d.try*.out.md]

### FOOT-18 (Arithmetic): NEEDS_YOU
- Stage 0: open. O-20 verified: flag name shape_calibrated adopted (~/Buildo/.cursor/MCBYLAWS-QUEUE.md:582; CARD-o19-o21.answered.md:7; names listed at MB-31/adjudication.md:47). But the example states 178.2 from a factor with no provenance, while R3-10 (~/Buildo/.cursor/MCBYLAWS-QUEUE.md:69) says "Turning it on without a fit fails closed". MB-31/plan.v1.md:10 shows the engine run gives 178.2 only with hypothetical bounds [0.5,1.0] and a provenance; with the real pinned bounds the 0.9 is out of bounds. FOOT-17 already covers the fail-closed case (worked-examples.md, FOOT-17; MB-31/plan.v1.md:119). The example is labelled pending, so its answer is not final.
- Stage 3 blind: differs. DeepSeek: not_evaluated:shape_factor_not_fitted (fail closed; 0.9 has no provenance); it also showed the uncalibrated 198 and the would-be 178.2. Differs from the key 178.2. Gemini trigger (MCPROOF 3b) met; Gemini not run (not in this task; credits were depleted in round 2). The disagreement is the rule question below, not arithmetic. [ds/r4n3-d.try*.out.md]
- Stage 4: needs_you. Operator question (plain): "FOOT-18 multiplies the footprint by a made-up fitted factor 0.9 with no recorded provenance, although R3-10 says shape calibration without a fit refuses. Keep FOOT-18 as a pending example that stays out of the accuracy key until R3-10 has real bounds and a fitted factor (FOOT-17 already shows the refusal), or delete it?" Recommendation: keep as pending. Flag name is settled (O-20).
- Stage 5: approved. DeepSeek: rear 10, width 12, depth room 24, inner 17, box 204, coverage 198, min 198 x 0.9 = 178.2 (183.6 if the factor were applied to the box first). Matches node. Conditional on R3-10 being satisfied. [ds/r4n5-d.try*.out.md]

### SB-5 (Ruling): APPROVED
- Stage 0: approved. O-21 verified: no cross-bound; fallback to the street median with the flag "ring not used" (~/Buildo/.cursor/MCBYLAWS-QUEUE.md:583; CARD-o19-o21.answered.md:8). Value 3 is inside 1..4 (CARD-l31-15-16-18.answered.md:5). M-422 ~/Buildo-wt-mb-rul/docs/specs/01-pipeline/69a_mcbylaw_register.md:559: ring depth 2 counts the abutter as first lot, so at most one ring lot per abutter per direction; a typical lot has two abutters, so 3 is normally unreachable ("can never be met" assumes no more than two abutters on the frontage street; nit). Regression: Q7-59 (a) research/Q7-past-research-sweep.md:116 (a high value silently switches the ring off) is consistent with accepting the fallback and showing the flag.
- Stage 3 blind: approved. DeepSeek: accepted; 3 inside 1..4 but above depth 2; ring not used; street-median fallback; flag "ring not used". [ds/r4n3-d.try*.out.md]
- Stage 4: approved. Approve. Notes: (1) "ring not used" is quoted from the card in prose; no machine token name is ruled for it (propose ledger row: flag token for ring_not_used, MB-78). (2) The upper-bound branch (value above 4) now has no example; see REVIEW.round4.md coverage answer and proposed SB-6.
- Stage 5: approved. DeepSeek: 3 in [1,4]; 3 > depth 2; unsatisfiable ring; fallback to street median. [ds/r4n5-d.try*.out.md]

## Stage 5 parked
The FY/FOOT-16 calculation batch (r4n5-a) returned critique, not a table, on all 3 attempts, so stages 5 for FY-10, FY-14, FY-21 and FOOT-16 are parked. A Ruling-layer example does not need stage 5 (MCPROOF A7 table), and stage 4 re-ran the sums with node (FY-10 8, FY-14 8, FY-21 7), so the verdicts above stand on the mandatory stages. The PERM-6/7 calculation batch (r4n5-b) gave a table headed "derivation" instead of "steps" and was not used; those two examples have no number, so stage 5 is n/a. The critiques are kept in ds/r4n5-a.try1-3.out.md; they raised no arithmetic error. Their one substantive point (the register text of M-422 still ends "else 6.0 m", 69a_mcbylaw_register.md:559, against R3-03 queue:64) is the amendment already owed in MB-78.

## Coverage question: SB-5 moved its ring minimum from 5 to 3
Answer: no example now tests a ring minimum above the allowed range 1..4. The only other setting example, SB-3, tests 0 (below the minimum); SB-4 tests "not loaded". SB-5 itself says the upper limit is "not tested by an example now" (worked-examples.md:157) but gives no cited reason, so MCPROOF A1.6 (an example per branch, or a cited reason) is not met. The bounds check has two sides (below 1, above 4), same reason token (O-19). Also uncovered: the ring depth bounds 2..4 (M-422, 69a_mcbylaw_register.md:559) have no example at all; not part of this question, noted for the coverage plan.

Proposed example (not added; I did not edit the sheet). Columns as the SET table (Example | Checking | Real-world question | Why this example exists | Status | Basis | Chain | Rulings | Zone | O-10 | Setting | Value tried | Hand result | Why | OP-OK | Changed):

| SB-6 | Ruling | The ring minimum is set to 5 lots. Does the tool accept it? | To show the upper end of the allowed range is guarded: 5 is above the allowed maximum of 4, so it is refused in the same closed form as SB-3. | recorded: card L31-16 and card O-19 to O-21 (~/Buildo-scratch/p2close/CARD-o19-o21.answered.md, answered 2026-10-31), O-19 | Setting fya_placeholder_ring_min_n has the allowed range 1..4 (card L31-16, ~/Buildo-scratch/p2close/CARD-l31-15-16-18.answered.md:5). A value above 4 is out of bounds like a value below 1 (SB-3) and uses the same reason token. The value 5 is chosen because it is the first value above the range and is also above the ring depth of 2, so the range check, not the ring fallback of SB-5, decides. |  | M-422; L31-16; O-19 | any | boundary | fya_placeholder_ring_min_n | 5 | not_evaluated:setting_out_of_bounds | Above the maximum of 4 (the other end of SB-3). | [ ] | CHANGED: NEW (round-4 coverage finding: SB-5 moved from 5 to 3 and left the upper bound untested). |

Its stages would be the SB-3 stages (question, regression via Q7-59 research/Q7-past-research-sweep.md:116, blind, claude); the sizing rule may put it on the quick path (repeat of the SB-3 pattern, other branch, so a new branch: full review).

## Proposed ruling-ledger rows and open points
1. FOOT-18: operator to confirm "keep pending until R3-10 has bounds and a fitted factor" (recommended) or delete; FOOT-17 already covers fail-closed.
2. Machine token for the SB-5 flag "ring not used" (the card gives prose only): propose a ledger row in MB-78 naming it (for example ring_not_used) so it enters the closed flag list.
3. SB-3 wording: whether an out-of-bounds setting stops the run (as SB-4 does) or marks the rows is not ruled by O-19; suggested one-line wording fix in SB-3 (see its record).
4. M-422 register text still ends "else 6.0 m" (69a_mcbylaw_register.md:559); the approve 1-6 item 1 amendment (+1.0 on the zone median) and the R3-03 terminal are owed in the next decision batch (as the sheet already says).

## Effort log
DeepSeek: 8 batch calls (4 blind, 4 calculation), 20 attempts in all (blind a 2, b 3, c 3, d 1; calculation a 3, b 3, c 2, d 3); conforming results for 7 of 8 batches (calculation batch a parked; batch b calculation not needed). Claude: about 20 file:line checks, 6 database queries, 6 node recomputations; changed the outcome of 2 examples (PERM-5 residual wording; FY-14 purpose no longer tested) and held FOOT-18 for the operator.
