---
write_scope:
- scripts/lib/compute/maxbld/renovation.js
allow_commit: false
---
# increment 6: write scripts/lib/compute/maxbld/renovation.js (GREEN) - STOP BEFORE COMMIT
**Provider:** deepseek. Create ONE file. NEVER git add / commit / stash / reset / checkout. No Python. Never read any .env.
Tests (already written, read them first, do NOT edit them): `src/tests/steps/compute_maxbld_scenarios/increment6-renovation-examples.logic.test.ts`, `increment6-owner-input.logic.test.ts`, `increment6-settings.logic.test.ts`, `increment6-renovation-seeds.logic.test.ts` (last block). Fixture `src/tests/fixtures/layer3/increment-6/examples.json`. Run: `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/steps/compute_maxbld_scenarios/increment6-renovation-examples.logic.test.ts src/tests/steps/compute_maxbld_scenarios/increment6-owner-input.logic.test.ts src/tests/steps/compute_maxbld_scenarios/increment6-settings.logic.test.ts` (some seed/settings/step tests fail for reasons outside this file: the settings seed, the step hook; ignore those, make the module cases green).
**Oracle (arithmetic, the approved McProof key):** `~/Buildo-scratch/mcbylaws/inc6/mcproof/handcalc-reno-v3.landed.mjs`, function `compute(job)` (lines ~60-110). Read it with `read_file` is NOT possible outside the repo: its core is copied below. The module is that function made pure over `input` (fixture shape) and `settings`.

## ABSOLUTE RULE (Spec 133 arm L): NO string literal and NO numeric literal other than 0, 1, 2, 100 anywhere in the file (including `'use strict'`, require paths aside, template strings, comments are fine). Every word, reason, status, key text comes from the data block `renovation` in `scripts/seeds/bylaw/building-types.json` (read it: keys `words`, `params`, `ids`, `rows`, `envelope_by_half_lot`). Load it ONCE with exactly one `require` of that file (path `../../../seeds/bylaw/building-types.json`, the only string in the file). Access properties by dot (`W.status.computed`), never by a quoted key. Output object property names are plain identifiers (`RA`, `back_footprint`, ...). The numeric constants come from `params` (scale_4dp = rounding for r4, scale_9dp for r9, epsilon, half_units_cap) and from `settings`. The tests also forbid in code: the numbers 0.85, 0.5, 30, 12.2, 0.45; the text `renovation-shared`; the names `existing_confidence_min`, `unit_min_interior_sqm` and a bare `basement_livable_share` (use the full setting names below). Read each setting by dot access on the `settings` argument so its name appears in the source: `settings.houseplex_circulation_share`, `settings.houseplex_unit_min_net_m2`, `settings.compute_maxbld_scenarios_reno_basement_livable_share`, `settings.compute_maxbld_scenarios_suite_interior_gfa_share`; plus `settings.relief_frontage_max_m` (number), `settings.suite_share_of_interior` (number), `settings.extension_window` = `{ rd: [lo, hi], rsrm: [lo, hi] }`.

## Exports (CommonJS, module.exports = {...})
- `renovationResults(input, settings)` -> `{ RA, RE, RI, RB, RF, UB, disclosures }`. Pure, no I/O, never throws on bad owner input (returns refusal rows).
- `renovationApplies(source, buildingType)`: true when `buildingType` is not one of `ids` (also true for null/undefined); for an id in `ids` true only when `source && source.owner_input != null`. (ST-4: no owner input, no renovation row.)
- `envelopeTypeFor(halfLot)`: returns `envelope_by_half_lot[String(Boolean(halfLot))]` - the ONE reader of the semi seam. The module never names a building class otherwise.
- `missingFields(owner)`: array of `W.field.existing_footprint|existing_storeys|existing_basement` in that order for the owner entry's missing/bad footprint (not a finite number > 0), storeys null/undefined, basement null/undefined.

## Input (fixture shape) `input` = { owner:{footprint_m2,storeys,basement,empty_lot}, envelope:{F_m2,G_m2,S_storeys,fsi_cap_m2,status,reason?}, lot:{frontage_m,depth_m,corner,zone_class,required_frontage_m}, units_max, half_lot, lot_form:{detected,unsure,assumed}, sixplex_overlay (true|false|null), lawful_71_1 (absent = taken as holding; false = precondition fails) }

## Behaviour, in this order
1. disclosures list `D` (strings from W.disclosure), built first and returned on every path: if half_lot===true push envelope_semi_detached_used, and if lot_form && lot_form.unsure===true push unsure_half_assumed; if half_lot is not true: sixplex_overlay===true push ri_five_six_units_not_modelled, sixplex_overlay==null push sixplex_overlay_not_evaluated. (Later: relief_applied then relief_71_1_precondition_taken_as_holding when relief_applied; one_storey_extension when the window is met.)
2. empty_lot===true -> all six rows `{status: not_applicable, reason: vacant_lot}`; return (this is read BEFORE anything else, even with footprint 0).
3. missing = missingFields(owner) non-empty -> all six rows `{status: not_evaluated, reason: needs_user_input_prefix + missing.join(list_separator), value: null, flags: [W.flag.needs_user_input]}`; return.
4. invalid owner input (not missing): storeys not a number, or <= 0, or not a multiple of one half (test `Math.abs(storeys * 2 - Math.round(storeys * 2)) < params.epsilon`), -> all six rows `{status: not_evaluated, reason: invalid_owner_input_prefix + W.field.storeys, value: null, flags: [W.flag.needs_user_input]}`; basement not one of W.basement.* -> same with W.field.basement. (A half storey and a storey count above the envelope cap ARE valid and compute.)
5. envelope.status !== W.status.computed -> all six rows `{status: not_evaluated, reason: house_row_prefix + (envelope.reason || envelope.status), value: null, flags: [W.flag.envelope]}`; return.
6. Otherwise compute exactly as the oracle `compute` does below (fp=owner.footprint_m2, st=owner.storeys, bs=owner.basement, F=envelope.F_m2, G=envelope.G_m2, S=envelope.S_storeys, cap = envelope.fsi_cap_m2 if a number else Infinity, fr = lot.frontage_m, zc = lot.zone_class, reqF = lot.required_frontage_m, A... not needed). r4(x)=Math.round(x*scale_4dp)/scale_4dp for finite numbers; r9 likewise with scale_9dp. Replace oracle constants: SET.circulation -> settings.houseplex_circulation_share, SET.unit_min -> settings.houseplex_unit_min_net_m2, SHARE (SET.reno_basement_livable_share) -> settings.compute_maxbld_scenarios_reno_basement_livable_share, SET.suite_interior_gfa_share -> settings.compute_maxbld_scenarios_suite_interior_gfa_share, LAW.relief_frontage_max -> settings.relief_frontage_max_m, LAW.suite_share -> settings.suite_share_of_interior; extension window: RD zone (W.zone.rd): reqF > rd[0] && reqF <= rd[1]; RS or RM: reqF > rsrm[0], and also reqF <= rsrm[1] ONLY when rsrm[1] > rsrm[0] (equal bounds mean no upper bound). If a law setting is not a finite number: relief treated as not applicable; extension not disclosed; suite_max_interior = `{status: not_evaluated, reason: law_value_missing}` (NE shape).
   - relief = fr != null && typeof fr === number && fr <= relief_frontage_max_m && lawful_71_1 !== false. relief_applied = relief && fp > F. When relief_applied: push relief_applied then relief_71_1_precondition_taken_as_holding onto D.
   - half = input.half_lot === true. RI.suite_max_interior = half ? `{status: not_applicable, reason: converted_semi_suite}` : r4(settings.suite_share_of_interior * settings.compute_maxbld_scenarios_suite_interior_gfa_share * exG). umax: input.units_max null -> null; else half ? Math.min(units_max, params.half_units_cap) : units_max.
   - Every COMPUTED row (RA, RE, RI, RB, RF, UB) also carries `trace`: a non-empty array of plain objects holding the operand numbers used (no strings), e.g. `[{ footprint: fp, storeys: st, F, G, S }]`; the half flag must NOT appear in the RI trace.
   - Return value of the oracle's row objects must be reproduced FIELD FOR FIELD (names and rounding) because the tests compare with toEqual: RA {status, back_footprint, back_storeys, back_gfa, up_plate, relief_applied, up_gfa, fsi_room, envelope_room, addition_gfa, binds, total_after, lawfully_existing_caveat, one_storey_extension} (fsi_room is the text no_fsi_cap when cap is infinite), RE {status, envelope_gfa, existing_gfa, gain, lawfully_existing_caveat}, RI {status, floors_above_grade_count, basement_level_count, units_raw, units, attic, suite_max_interior, units_gain, note?}, RB, RF, UB as in the oracle. `attic` = `{status: not_evaluated, reason: attic}`. Do not add `undefined`-valued keys except where the oracle has finished_note (omit when not finished).

## Oracle core (copy of handcalc-reno-v3.landed.mjs compute(), arithmetic only)
```
const p=lot, env=envelope; A=area (unused); fr=lot.frontage_m; zc=lot.zone_class; reqF=lot.required_frontage_m
const fp=owner.fp, st=owner.st, bs=owner.bs; exG=r9(fp*st)
RA.back_footprint = r4(max(0, F - fp)); nb = zc==='R' ? min(S, ceil(st)) : S; RA.back_storeys=nb; RA.back_gfa=r4(RA.back_footprint*nb)
relief as above; plate = relief ? fp : min(fp, F); RA.up_plate=plate; RA.relief_applied = relief && fp>F
RA.up_gfa = r4(plate * max(0, S - st))
fsiRoom = isFinite(cap) ? max(0, cap - exG) : Infinity; gRoom = max(0, G - exG)
RA.fsi_room = isFinite(fsiRoom) ? r4(fsiRoom) : <text no_fsi_cap>; RA.envelope_room = r4(gRoom)
raw = RA.up_gfa + RA.back_gfa; add = min(raw, fsiRoom, gRoom)
RA.addition_gfa = r4(add)
RA.binds = r4(add) < r4(raw) ? (isFinite(fsiRoom) && r4(fsiRoom) <= r4(gRoom) ? fsi_room : envelope_room) : (r4(add) === r4(gRoom) && !isFinite(fsiRoom) ? envelope_room : fits)
RA.total_after = r4(exG + add)
lawful_excess = fp > F || exG > G || (isFinite(cap) && exG > cap); RA.lawfully_existing_caveat = lawful_excess
extWin per above; RA.one_storey_extension = extWin ? text.extension_disclosed : text.extension_not_disclosed; if extWin push D one_storey_extension
RE = { status: computed, envelope_gfa: G, existing_gfa: exG, gain: r4(gRoom), lawfully_existing_caveat: lawful_excess }
per(a) = floor(r9((1 - circ) * a / unit_min))
w = floor(st); fr2 = r9(st - w); above = w*per(fp) + (fr2 > 0 ? per(fr2*fp) : 0)
bsLevel = bs !== none ? per(fp*SHARE) : 0; uRaw = above + bsLevel
RI = { status: computed, floors_above_grade_count: above, basement_level_count: bsLevel, units_raw: uRaw, units: umax==null ? NE(units_max_not_stored) : max(1, min(umax, uRaw)), attic, suite_max_interior }
if units is a number: RI.units_gain = RI.units - 1; if (uRaw < 1) RI.note = text.ri_small_note
gain = r4(fp*SHARE)
rbUnits(g) = umax==null ? NE(units_max_not_stored) : max(1, min(umax, above + per(g)))
wbs = st === 1 ? text.whole_basement_yes : text.whole_basement_no
RB = bs===none ? { status: computed, basement_livable_gain: gain, in_gfa: false, new_basement: true, units: rbUnits(gain), whole_basement_suite: wbs } : NA(basement_exists)
RF = bs===unfinished ? { status: computed, basement_finish_livable_area: gain, in_gfa: false, units: rbUnits(gain), whole_basement_suite: wbs, note: text.rf_note } : NA(basement_not_unfinished)
UB = bs===none ? NA(no_basement) : { status: computed, basement_livable_area: gain, in_gfa: false, gfa_after: exG, fsi_room_change: 0, storeys_after: st, basement_stays_basement: text.ub_basement_stays, units: rbUnits(gain), whole_basement_suite: wbs, finished_note: bs===finished ? text.ub_finished_note : undefined }
NE(reason) = {status: not_evaluated, reason}; NA(reason) = {status: not_applicable, reason}
```
Note the 0.5 test: `st === 1` uses sentinel 1; the fraction uses `st - Math.floor(st)`. Do not write 0.5 anywhere. Keep the file short, commented with SPEC LINK first line (docs/specs/01-pipeline/69a_mcbylaw_register.md M-206, M-211(2); 78_optimal_lot_configuration.md P5.6) and no personal names.
