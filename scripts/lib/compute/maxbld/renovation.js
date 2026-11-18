// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-206, M-211(2), M-158, 10.5.20.40(6); docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.6
// MB-27 increment 6: the six renovation rows (RA, RE, RI, RB, RF, UB), pure arithmetic over the owner entry, the stored envelope and the settings.
// Arm L (Spec 133): this file holds no word and no number besides 0, 1, 2; the words, the rounding and the ids come from the `renovation` block of
// building-types.json, the law from `settings` (Layer 2 cells and logic_variables). The semi seam (UB-7) is read here only, through envelopeTypeFor.
const seed = require('../../../seeds/bylaw/building-types.json');

const R = seed.renovation;
const W = R.words;
const P = R.params;
const isNum = (x) => typeof x === typeof 0 && Number.isFinite(x);
const r4 = (x) => (isNum(x) ? Math.round(x * P.scale_4dp) / P.scale_4dp : x);
const r9 = (x) => Math.round(x * P.scale_9dp) / P.scale_9dp;
const NE = (reason, extra) => ({ status: W.status.not_evaluated, reason, ...extra });
const NA = (reason) => ({ status: W.status.not_applicable, reason });

/** ST-4: no owner entry, no renovation row. A non-renovation type always applies. */
function renovationApplies(source, buildingType) {
  if (!R.ids.includes(buildingType)) return true;
  return Boolean(source) && source.owner_input !== null && source.owner_input !== undefined;
}

/** The ONE reader of the semi seam (building-types.json renovation.envelope_by_half_lot). */
function envelopeTypeFor(halfLot) {
  return R.envelope_by_half_lot[String(Boolean(halfLot))];
}

/** The missing owner fields, in the key's order. */
function missingFields(owner) {
  const o = owner || {};
  const out = [];
  if (!isNum(o.footprint_m2) || !(o.footprint_m2 > 0)) out.push(W.field.existing_footprint);
  if (o.storeys === null || o.storeys === undefined) out.push(W.field.existing_storeys);
  if (o.basement === null || o.basement === undefined) out.push(W.field.existing_basement);
  return out;
}

const allRows = (make) => Object.fromEntries(R.rows.map((k) => [k, make()]));

function refused(reason, flag, disclosures) {
  return { ...allRows(() => NE(reason, { value: null, flags: [flag] })), disclosures };
}

function renovationResults(input, settings) {
  const inp = input || {};
  const S = settings || {};
  const owner = inp.owner || {};
  const env = inp.envelope || {};
  const lot = inp.lot || {};
  const half = inp.half_lot === true;
  const D = [];
  if (half) D.push(W.disclosure.envelope_semi_detached_used);
  if (half && inp.lot_form && inp.lot_form.unsure === true) D.push(W.disclosure.unsure_half_assumed);
  if (!half && inp.sixplex_overlay === true) D.push(W.disclosure.ri_five_six_units_not_modelled);
  if (!half && (inp.sixplex_overlay === null || inp.sixplex_overlay === undefined)) D.push(W.disclosure.sixplex_overlay_not_evaluated);

  if (owner.empty_lot === true) return { ...allRows(() => NA(W.reason.vacant_lot)), disclosures: D };
  const missing = missingFields(owner);
  if (missing.length) return refused(W.reason.needs_user_input_prefix + missing.join(W.reason.list_separator), W.flag.needs_user_input, D);
  const fp = owner.footprint_m2;
  const st = owner.storeys;
  const bs = owner.basement;
  const stepOk = isNum(st) && st > 0 && Math.abs(st * 2 - Math.round(st * 2)) < P.epsilon;
  if (!stepOk) return refused(W.reason.invalid_owner_input_prefix + W.field.storeys, W.flag.needs_user_input, D);
  if (!Object.values(W.basement).includes(bs)) return refused(W.reason.invalid_owner_input_prefix + W.field.basement, W.flag.needs_user_input, D);
  if (env.status !== W.status.computed) return refused(W.reason.house_row_prefix + (env.reason || env.status), W.flag.envelope, D);

  const F = env.F_m2;
  const G = env.G_m2;
  const Smax = env.S_storeys;
  const cap = isNum(env.fsi_cap_m2) ? env.fsi_cap_m2 : Infinity;
  const fr = lot.frontage_m;
  const zc = lot.zone_class;
  const reqF = lot.required_frontage_m;
  const circ = S.houseplex_circulation_share;
  const unitMin = S.houseplex_unit_min_net_m2;
  const share = S.compute_maxbld_scenarios_reno_basement_livable_share;
  const suiteGfaShare = S.compute_maxbld_scenarios_suite_interior_gfa_share;
  const exG = r9(fp * st);

  const relief = isNum(fr) && isNum(S.compute_maxbld_scenarios_relief_frontage_max_m) && fr <= S.compute_maxbld_scenarios_relief_frontage_max_m && owner.lawfully_existing_status !== W.lawful.no;
  const plate = relief ? fp : Math.min(fp, F);
  const reliefApplied = relief && fp > F;
  if (reliefApplied) D.push(W.disclosure.relief_applied);
  if (reliefApplied && owner.lawfully_existing_status !== W.lawful.yes) D.push(W.disclosure.relief_71_1_precondition_taken_as_holding);

  const backFootprint = r4(Math.max(0, F - fp));
  const backStoreys = zc === W.zone.r ? Math.min(Smax, Math.ceil(st)) : Smax;
  const backGfa = r4(backFootprint * backStoreys);
  const upGfa = r4(plate * Math.max(0, Smax - st));
  const fsiRoom = Number.isFinite(cap) ? Math.max(0, cap - exG) : Infinity;
  const gRoom = Math.max(0, G - exG);
  const raw = upGfa + backGfa;
  const add = Math.min(raw, fsiRoom, gRoom);
  const fsiOpen = !Number.isFinite(fsiRoom);
  let binds = W.binds.fits;
  if (r4(add) < r4(raw)) binds = !fsiOpen && r4(fsiRoom) <= r4(gRoom) ? W.binds.fsi_room : W.binds.envelope_room;
  else if (r4(add) === r4(gRoom) && fsiOpen) binds = W.binds.envelope_room;
  const excess = fp > F || exG > G || (!fsiOpen && exG > cap);

  const win = S.extension_window || {};
  const inBand = (band, lowOnly) => Array.isArray(band) && reqF > band[0] && (lowOnly || band[1] <= band[0] || reqF <= band[1]);
  const extWin = isNum(reqF) && ((zc === W.zone.rd && inBand(win.rd, false)) || ((zc === W.zone.rs || zc === W.zone.rm) && inBand(win.rsrm, false)));
  if (extWin) D.push(W.disclosure.one_storey_extension);

  const RA = {
    status: W.status.computed,
    back_footprint: backFootprint,
    back_storeys: backStoreys,
    back_gfa: backGfa,
    up_plate: plate,
    relief_applied: reliefApplied,
    up_gfa: upGfa,
    fsi_room: fsiOpen ? W.text.no_fsi_cap : r4(fsiRoom),
    envelope_room: r4(gRoom),
    addition_gfa: r4(add),
    binds,
    total_after: r4(exG + add),
    lawfully_existing_caveat: excess,
    one_storey_extension: extWin ? W.text.extension_disclosed : W.text.extension_not_disclosed,
    trace: [{ footprint: fp, storeys: st, F, G, S: Smax, cap: fsiOpen ? null : cap, frontage: isNum(fr) ? fr : null }],
  };
  const RE = { status: W.status.computed, envelope_gfa: G, existing_gfa: exG, gain: r4(gRoom), lawfully_existing_caveat: excess, trace: [{ G, existing: exG }] };

  const umaxRaw = isNum(inp.units_max) ? inp.units_max : null;
  const umax = umaxRaw === null ? null : half ? Math.min(umaxRaw, P.half_units_cap) : umaxRaw;
  const per = (a) => Math.floor(r9(((1 - circ) * a) / unitMin));
  const whole = Math.floor(st);
  const frac = r9(st - whole);
  const above = whole * per(fp) + (frac > 0 ? per(frac * fp) : 0);
  const bsLevel = bs !== W.basement.none ? per(fp * share) : 0;
  const uRaw = above + bsLevel;
  const units = umax === null ? NE(W.reason.units_max_not_stored) : Math.max(1, Math.min(umax, uRaw));
  let suite;
  if (!isNum(S.suite_share_of_interior) || !isNum(suiteGfaShare)) suite = NE(W.reason.law_value_missing);
  else if (half && !(isNum(units) && units <= P.converted_semi_suite_units_floor)) suite = NA(W.reason.converted_semi_suite);
  else suite = r4(S.suite_share_of_interior * suiteGfaShare * exG);
  const RI = {
    status: W.status.computed,
    floors_above_grade_count: above,
    basement_level_count: bsLevel,
    units_raw: uRaw,
    units,
    attic: NE(W.reason.attic),
    suite_max_interior: suite,
    trace: [{ footprint: fp, storeys: st, circulation: circ, unit_min: unitMin, units_max: umaxRaw }],
  };
  if (isNum(units)) {
    RI.units_gain = units - 1;
    if (uRaw < 1) RI.note = W.text.ri_small_note;
  }

  const gain = r4(fp * share);
  const rbUnits = (g) => (umax === null ? NE(W.reason.units_max_not_stored) : Math.max(1, Math.min(umax, above + per(g))));
  const wbs = st === 1 ? W.text.whole_basement_yes : W.text.whole_basement_no;
  const trace = [{ footprint: fp, basement_share: share, area: gain }];
  const RB = bs === W.basement.none ? { status: W.status.computed, basement_livable_gain: gain, in_gfa: false, new_basement: true, units: rbUnits(gain), whole_basement_suite: wbs, trace } : NA(W.reason.basement_exists);
  const RF = bs === W.basement.unfinished ? { status: W.status.computed, basement_finish_livable_area: gain, in_gfa: false, units: rbUnits(gain), whole_basement_suite: wbs, note: W.text.rf_note, trace } : NA(W.reason.basement_not_unfinished);
  const UB = bs === W.basement.none ? NA(W.reason.no_basement) : { status: W.status.computed, basement_livable_area: gain, in_gfa: false, gfa_after: exG, fsi_room_change: 0, storeys_after: st, basement_stays_basement: W.text.ub_basement_stays, units: rbUnits(gain), whole_basement_suite: wbs, trace };
  if (bs === W.basement.finished && UB.status === W.status.computed) UB.finished_note = W.text.ub_finished_note;
  return { RA, RE, RI, RB, RF, UB, disclosures: D };
}

module.exports = { renovationResults, renovationApplies, envelopeTypeFor, missingFields };
