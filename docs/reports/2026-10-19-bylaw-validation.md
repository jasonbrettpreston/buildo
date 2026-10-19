# By-law validation on real lots: 2026-10-19

**Tree validated:** `wf2/p4-integrate-5@604149d2`. That is the programme tip 221f3e37 plus the C6 rulings and every by-law fix from 2026-10-19, including the Spec 68 "percent of the requirements cited in" link. A first pass ran on `62269c66` and is superseded; where the result moved, both are given.

**Database:** read-only. Every query ran inside `BEGIN READ ONLY … ROLLBACK`, and nothing was written. Tooling is in `scripts/analysis/bylaw/validation/`, and the machine-readable results are in `docs/reports/2026-10-19-bylaw-validation.json`.

## Counts first

| Check | Size | Result |
|---|---|---|
| 1. Invariants on real lots | 279 parcels, stratified by zone × frontage band × corner / lane / exception / plain; 3 building types × 2 roof forms × 16 targets | All 10 runnable invariant and ruling checks pass, except two: **INV-10a fails 2 of 1,002** (defect D1), and **INV-19 fails 1,164 of 1,164** (known, OWED under M-220) |
| 2. Hand-check, two rounds | 31 lots (29 real plus 2 major-street what-ifs), 531 values | **Evaluator agrees with both readers on 467 / 531 (87.9 %)** and with at least one reader on 509 / 531 (95.9 %). The 22 remaining values trace to 4 evaluator defects and 1 harness input. |
| 3a. Oracle: as-of-right permits | 218 new detached houses with no CoA | Inconclusive: the permit's "residential" area is not FSI gross floor area (see §3a) |
| 3b. Oracle: approved CoA variances | 600 items (all 2017 hearings) | **The approved figure is beyond our as-of-right limit on 91.3 % of 462 comparable items.** The City's cited requirement equals ours on 75.5 %; most of the gap is by-law amendments made after 2017. |
| Determinism | two runs | Byte-identical output (`sha 3d6ae21b57bd`) |
| INV-24 / INV-25 generator checks | — | Both exit 0. The tracker reads 473 incorporated / 38 unfixed on this tip. |

**What 2026-10-19 changed, checked on real lots: all pass.**

| Change | Checked | Violations |
|---|---|---|
| Flat-roof 1.4 m step-back, top storey only (Q-M218) | 1,386 | 0 |
| f / a label definitions, so a lot's label value is used (Q-label-defs) | 243 | 0 |
| Semi-detached houseplex lot area at 50 % of a (M-181(2)) | 69 | 0 |
| Semi-detached houseplex frontage at 50 % of f, RS / RM (M-181(3)); this was 0 / 9 on 62269c66 and is fixed on int5 | 71 | 0 |
| RT houseplex frontage 6.0 m | 20 | 0 |
| No place-of-worship or other non-residential unit on a house (INV-18 / M-159) | 15,490 applied units | 0 |
| Unlabelled lots take the zone default | R 6 / 180, RS 15 / 450, RM 12 / 360, RT 6 / 180 | All match the clause text |

## 1. Invariants on real lots (Spec 78 P5.15)

These checks run the committed evaluator, assembled exactly as G-EVAL assembles it:
- agreed units plus adjudications;
- generated fields;
- `displacesOf` links;
- `makeContext` with enactment dates and the exception-authoring map.

Lot vectors come from `parcels`. No Layer 2 lot-vector builder exists yet, so `pull-lots.cjs` documents its mapping:

| Lot-vector field | Source |
|---|---|
| Label letters | `zoning_zn_string` |
| HT / ST / LC | the height and coverage overlays |
| `major_street` | `on_policy_road` |
| `abuts_lane` | `abuts_laneway` |
| `lawfully_existing` | always `false`, because the scenario is a new build |
| `dwelling_units` | 1 / 1 / 2 / 3 / 4, by scenario type |

| Invariant | Checked | Violations | Note |
|---|---|---|---|
| INV-10a main wall ≤ height | 1,002 | 2 | Both on 11 St George's Rd (RD x28); see D1 |
| INV-16 applied unit exists in provisions | 15,490 | 0 | |
| INV-18 no non-residential unit (M-159) | 15,490 | 0 | |
| INV-19 no `no_candidate` where the article is absent | 1,164 | 1,164 | **Known, OWED (M-220).** R coverage 366, R length 366, RT length 144, RT depth 144, RT main walls 144: answers `no_candidate` instead of `unregulated`. The value is right (no limit); only the status is wrong. |
| INV-11a unit cap | 318 | 0 | |
| Sanity: fsi, height, setback ranges | 4,248 | 0 | |

**Not runnable yet:** INV-1…9, 12…15, 17 and 20…23 read P5.13 scenario fields, and that step is not built (Spec 78 §Phase-5, PLANNED).

**Coverage on the sample** (detached house, pitched roof):
- **Exception lots:** 28 / 279 (10 %) sit in exceptions that are not fully authored, so they answer nothing under ruling (d).
- **Front setback:** answered on only 2 / 279 lots:
  - 185 are `condition_unknown:front_averaging_not_applicable`, because the 10.5.40.70(1) averaging needs the neighbours' setbacks;
  - 61 are `map_area_not_held:Eglinton…`.
- Both are Layer 2 input gaps, not wrong answers.

## 2. Hand-check, two rounds (Spec 08)

**Round 1** had two independent readings. Neither reader saw the evaluator's output.
- **DeepSeek seat** (`ds-round1.mjs`, deepseek-chat, temperature 0): read only the verbatim zone text, the exception text and the lot facts.
- **Claude seat** (`claude-reading.mjs`): a hand reading of the base-zone text. Exception lots get the base-zone reading, marked as such.

**Round 2** (`compare-round2.mjs`) compared the three, and each disagreement got a verdict.

| Class | n | Verdict |
|---|---|---|
| All three agree | 467 | Pass |
| Evaluator = Claude ≠ DeepSeek | 34 | **DeepSeek wrong** in every case: it wrote the main wall as a flat 7.0 instead of max(7.0, HT − 2.5); it used RT 'au' (lot area per townhouse unit) for a detached house; and it applied x28's 16.5 m depth to a lot with frontage ≥ 18 m |
| Evaluator = DeepSeek ≠ Claude | 8 | **Claude reading wrong**: 6 on an exception lot, where my reading was base-zone only and exception 256 governs; 2 on the RM semi-detached houseplex without an f value, where the base is (B)(ii) 15 m, so 7.5 m, not 6 m |
| Readers agree ≠ evaluator, or all differ | 22 | **Evaluator wrong** on 19 (D1, D2), genuinely unknown on 1 (x256 needs the frontage as existing at enactment), harness input on 2 (townhouse flags; re-run gives D4) |

## 3. Real-world oracle (signals, not proof)

### 3a. As-of-right new detached houses

The sample is 218 permits: New Houses / SFD - Detached / New Building, issued since 2014-05-09, with no CoA linked to the permit or the parcel, on a non-exception R* parcel.
- 148 have an FSI cap; the other 70 have no 'd' value in RD / RS.
- **66 % exceed FSI × lot area; the median ratio is 1.11** (p25 0.98, p75 1.38).
- The legacy `max_buildable_gfa_sqm` is exceeded by 38.7 %.

**This is not evidence of a defect.** The permit's `residential_sqm` is total construction area:
- **Basements:** finished basements are common. With a basement mentioned the median ratio is 1.14, without it 1.11.
- **Garages:** the area includes integral garages.
- **Severed lots:** several permits are on severed part-lots (e.g. "PART 1 - West Lot", a 277 m² part of an a510 lot), so the parcel area is not the built lot.

A real test needs above-grade GFA, for example from imagery massing.

### 3b. Approved CoA variances

- **The sample:** 600 approved items on built-form targets, on non-exception parcels. **Every one is a 2017 hearing**; the loaded notice set covers 2017 only.
- **Approved figure versus our limit:** beyond our as-of-right limit on **91.3 %** of the 462 comparable items:

| Target | Beyond our limit |
|---|---|
| FSI | 162 / 163 |
| Coverage | 87 / 89 |
| Depth | 16 / 17 |
| Main wall | 39 / 44 |
| Side | 52 / 60 |
| Length | 24 / 30 |
| Rear | 14 / 17 |
| Height | 28 / 42 |

- **City's cited requirement versus ours:** equal on **75.5 %**:

| Target | Matches |
|---|---|
| FSI | 141 / 163 |
| Coverage | 85 / 89 |
| Depth | 16 / 17 |

- **Where they differ, the cause is mostly amendments after 2017:**
  - **Main wall:** 7.5 m in 2017 against our 8.5 m (474-2023 changed the main-wall rule); 16 cases.
  - **Length:** 16.75 m against 17 m; 11 cases.
  - **Height:** 10 against 11 and 8.8 against 10, from changes to the height overlay values.
  - **FSI:** 0.69 against 0.6 is the 10.10.40.40(2) rear-addition FSI, which is not a new build.
- **One pattern confirms a defect:** the City cites a 2.4 m side yard where we answer 7.5 m, on RD lots with frontage over 18 m; 5 cases. This is D3.

## Defects, ranked by impact

| # | Defect | Parcels affected (no exception) | Evidence | Fix route |
|---|---|---|---|---|
| **D2** | **A "Despite" clause that only *permits* an optional variation, and has no value of its own, displaces the base limit, so the limit disappears (`no_candidate`).** (a) 10.20.40.70(4), the ±0.3 m side-yard shift, displaces all of 10.20.40.70(3), so RD lots with required frontage 12 to under 18 m have **no side-yard setback**. (b) x.40.20(2), the one-storey 2.0 m extension, displaces x.40.20(1), so **no 17.0 m building length** in RD (required frontage over 12 and up to 18), RS and RM (over 12). | Side: **47,505 RD**. Length: **37,145 RD + 16,707 RM + 2,440 RS** | Hand-check: 5 side and 13 length values where both readers give 1.2 m / 17 m and the evaluator gives none. `sweep-displacers.mjs` lists every valueless displacer that drops a numeric unit (`out/displacer-sweep-int5.json`): in the residential base chapters these plus 10.5.60.20(7)/(11)(B) (ancillary setbacks) and 10.5.20.40(7) (parking). The x.40.10(2)(C)-type DISAPPLYs are intended. | Operator ruling (Q1) |
| **D3** | **RD 10.20.40.70(5), the 7.5 m side yard beyond 17 / 19 m depth on frontage over 18 m, is applied to the whole side yard.** It displaces (3), so the front portion gets 7.5 m instead of the (3) band (1.8 / 2.4 / 3.0 m), which narrows a 21 m lot's buildable width by about 11 m. | **1,486 RD** | 3 probe lots (f21, f21, f24) all give 7.5 from `10.20.40.70(5)#(5)(A)`. 2017 CoA: City-required 2.4 m against ours 7.5 m, 5 items. | Operator question (Q2): how to carry a depth-dependent side yard |
| **D1** | **The "detached house with a flat roof" height caps in four RD exceptions are keyed with no roof condition, so they bind pitched roofs too.** These are 900.3.10(18)(C) 6.0 m, (21)(A), (28)(A) and (37)(A) 6.5 m. The units' own evidence says "with a flat roof"; condition `none`. | **5,700 RD** (x18 352, x21 2,735, x28 1,258, x37 1,355) | 11 St George's Rd (x28, HT 9.5): pitched-roof height 6.5 against 9.5 from both readers. INV-10a: main wall 7.0 / 7.2 above height 6.5. `sweep-flatroof.mjs` finds exactly these 4. | Keying correction under existing rules (the M-218 roof condition; the clause literal); no new ruling needed |
| **D4** | **Townhouse on a major street where units have their own driveways: frontage falls back to label f (18 m) instead of 6.0 m × units (24 m for 4 units).** Only the no-driveway arm of x.30.20(1)(D) is keyed (`6.0 × n − 1.0 × n`, condition `no_individual_private_driveway`), so the driveway case has no unit and (A) wins. The no-driveway case correctly gives 20 m, which is the M-187 F06 figure. | Only fires on major-street lots; see D5 | What-if on 2 real lots (RM 5046461, RS 5131054): driveways gives 18; no driveways gives 20. Both readers give 24 with driveways. | Keying correction (the clause's own arm (a)) plus an operator confirmation (Q3) |
| **D5 (data)** | **`major_street` is set on only 21 of about 440 k residential parcels** (`on_policy_road`: R 12, RD 3, RM 5, RS 1, RT 0), all of them in exceptions. Every major-street rule therefore effectively never fires: townhouse frontage, height and storeys; FSI release; 50 % coverage; setbacks. | All R* lots fronting major streets | DB count, read-only | Layer 2 input check; PIN, outside this lane |
| D6 | With a flat roof under x28, the main-wall cap of 7.2 m exceeds the 6.5 m building height (INV-10a). After D1 is fixed this stays on flat roofs. The P5.13 step must take min(main wall, height). | x18/21/28/37 lots | INV-10a | P5.13 step check (already INV-10) |

**Known and already owed, not new:**
- **INV-19 / M-220:** the status `no_candidate` should be `unregulated`. 1,164 cases on the sample.
- **Exceptions not fully authored:** ruling (d); 10 % of the sample.
- **Front-yard averaging input:** 10.5.40.70(1) needs the neighbours' setbacks.

## Questions for the operator

1. **Q1 (D2).** Should a "Despite" clause that only *permits* an optional variation keep the base limit in force? Examples are a one-storey extension beyond the length, or shifting 0.3 m of side yard between sides. Such a clause has no value of its own. Under a yes, the variation is a disclosure instead of displacing the limit. **Recommend y.** This is the same reading as M-172 / M-173: restrictive and optional design choices are disclosed, not bound. Without it, 47.5 k RD parcels have no side-yard limit and 56.3 k RD / RM / RS parcels have no length limit (the RD sets overlap).
2. **Q2 (D3).** RD lots with frontage over 18 m need two side-yard values: the (3) band for the front 17 / 19 m, and 7.5 m beyond. Should the evaluator answer the (3) band as the side setback and carry the 7.5 m deep-portion rule as a disclosure until the P5.13 envelope models depth-dependent setbacks? **Recommend y.**
3. **Q3 (D4).** M-187 F06 states 20 m for a 4-unit townhouse on a major street. That is the clause's value when **no** unit has its own driveway. With individual driveways the text gives 6.0 m × 4 = 24 m. Should the driveway arm be keyed, so the answer is 24 m with driveways and 20 m without? **Recommend y.**
4. **Q4 (D5, PIN).** `major_street` (from `on_policy_road`) is true on only 21 residential parcels. Should a Layer 2 check of the Policy Areas Overlay major-streets join be opened before any major-street result is trusted? **Recommend y**, as its own lane; it is outside the by-law lane.

## Reproduce

```
cd scripts/analysis/bylaw/validation
DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config pull-lots.cjs out/lots.json 4
node eval-lots.mjs <tree> out/lots.json out/eval.json && node check-invariants.mjs <tree> out/eval.json out/inv.json
node claude-reading.mjs out/hc-lots.json out/claude-round1.json
DEEPSEEK_API_KEY=… node ds-round1.mjs <tree> out/hc-lots.json out/zone-text.json out/ds-round1.json
node compare-round2.mjs out/hc-eval.json out/ds-round1.json out/claude-round1.json out/round2.json
DOTENV_CONFIG_PATH=… node -r dotenv/config pull-oracle.cjs out/oracleA-lots.json out/oracleB-lots.json 300 600
node oracle-compare.mjs out/oracleA-lots.json out/oracleA-eval.json out/oracleB-lots.json out/oracleB-eval.json out/oracle.json
node sweep-displacers.mjs <tree> out/displacer-sweep.json; node sweep-flatroof.mjs <tree>
```

The `out/` folder is a working directory and is not committed. The report JSON carries the summary, the defect list and the evidence rows.
