// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HM (drafted as R-RS; operator CHAT-4, 2026-10-20 —
//            "A product report surface has one field declaration; every field names exactly one source; a generator
//            --check gates names, types, presentation and pending states; its outputs are generated, never hand-edited";
//            docs/reports/decisions/2026-10-20-chat-batch-a.json, `2026-10-20-chat-batch-a#CHAT-4`), docs/specs/02-web-admin/128_surface_standard_policy.md R-21 (one descriptor set, three renderers).
//
// SEED of the MaxBLD lot report v2 declaration. Transfers, mechanically and reproducibly from the repo:
//   report-v2-seed/schema-v2-proposal.json            the reviewed field list (report-schema review, 2026-10-20)
//   report-v2-seed/entries.json                       the Report Schema Rulings page questions (Q-1..Q-11)
//   report-v2-seed/answers/report_decisions/*.json    the page's decision export
//   report-v2-seed/decisions-chat.json                decisions given in chat after the export (flagged overlay)
//   docs/reports/decisions/2026-10-20-chat-batch-b.json   CHAT-11, the Q-7 scope confirmation (decision log, R-HK)
// into report-v2.decl.json, report-presentation.json and report-v2.rulings.json (beside this file). The review is
// encoded below as rules, so nothing is hand-copied into the JSON; edit the rules or the inputs, then --write.
//
//   node scripts/surfaces/_schema/seed-report-v2.mjs --write   regenerate the three files
//   node scripts/surfaces/_schema/seed-report-v2.mjs --check   exit 1 when a committed file differs; 2 = usage
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SEED_DIR = path.join(HERE, 'report-v2-seed');
const flags = process.argv.slice(2);
if (flags.length !== 1 || !['--write', '--check'].includes(flags[0])) {
  console.error('usage: node scripts/surfaces/_schema/seed-report-v2.mjs --write | --check');
  process.exitCode = 2;
} else main(flags[0].slice(2));

function main(mode) {
const proposalPath = path.join(SEED_DIR, 'schema-v2-proposal.json');
const entriesPath = path.join(SEED_DIR, 'entries.json');
const linPath = path.join(ROOT, 'docs/reference/maxbld-field-lineage.json');
const outFiles = {};
const proposalText = fs.readFileSync(proposalPath, 'utf8');
const entriesText = fs.readFileSync(entriesPath, 'utf8');
const P = JSON.parse(proposalText);
const E = JSON.parse(entriesText);
const LIN = JSON.parse(fs.readFileSync(linPath, 'utf8'));
const LINF = new Map(LIN.fields.map((f) => [f.field, f]));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);

// ---- type normalisation of proposal unit strings
const T = {
  text: ['text'], m: ['number', 'm'], 'm²': ['number', 'm²'], boolean: ['boolean'], integer: ['integer'], deg: ['number', 'deg'],
  GeoJSON: ['geojson'], 'text[]': ['text[]'], $: ['number', '$'], '$/m²': ['number', '$/m²'], url: ['url'], 'YYYY-MM': ['month'],
  number: ['number'], 'object[]': ['object[]'], jsonb: ['jsonb'], timestamp: ['timestamp'], integers: ['integer'], state: ['boolean'],
};
const linType = (name) => {
  const t = LINF.get(name).type;
  if (/^integer/.test(t)) return ['integer'];
  if (/^numeric m²/.test(t)) return ['number', 'm²'];
  if (/^numeric m\b/.test(t)) return ['number', 'm'];
  if (/^numeric \[0, 1\]/.test(t)) return ['number', 'fraction'];
  if (/^numeric ratio/.test(t)) return ['number', 'ratio'];
  if (/^numeric/.test(t)) return ['number'];
  if (/^text\[\]/.test(t)) return ['text[]'];
  if (/^text/.test(t)) return ['text'];
  if (/^boolean/.test(t)) return ['boolean'];
  if (/^jsonb/.test(t)) return / m$/.test(t) ? ['jsonb', 'm'] : ['jsonb'];
  if (/^timestamptz/.test(t)) return ['timestamp'];
  throw new Error(`lineage type ${t}`);
};

const BASE = {
  identity: '', headline: '', lot: '', card: 'scenarios.cards[].', suite: 'scenarios.cards[].suite.', coa: 'scenarios.cards[].coa.',
  disclosures: 'scenarios.cards[].', existing: 'scenarios.existing.', reno: 'scenarios.renovations[].', street_view: 'parcel.',
  images: 'scenarios.cards[].', market: '', cost: '', ads: '', states: 'ui.',
};
const pend = {
  q: (id) => `pending:operator_ruling:${id}`,
  lq: (f) => `pending:lineage_queue:${f}`,
  owed: (s) => `pending:spec_owed:${s}`,
};
const PAYLOAD_ONLY = new Set(['gfa_flat_sqm', 'gfa_pitched_sqm', 'storeys_flat', 'storeys_pitched', 'coa_factor', 'main_depth_chosen_m', 'field_trust']);
const ADMIN = new Set(['trust_checks']);

const out = [];
const log = [];
const seen = new Set();
const add = (sec, row, e) => {
  const p = e.path;
  if (seen.has(p)) { log.push(`dedupe: ${sec} ${p} (already declared)`); return; }
  seen.add(p);
  const name = e.name || p.split('.').pop().replace(/\[\]$/, '');
  const [type, unit] = e.type || [];
  const leafName = name;
  const entry = { path: p, name: leafName, label: e.label || row[0], type, ...(unit ? { unit } : {}), status: e.status || row[3], source: e.source };
  if (e.target) entry.target = e.target;
  if (e.enum) entry.enum = e.enum;
  const render = e.render || (ADMIN.has(leafName) ? 'admin' : PAYLOAD_ONLY.has(leafName) ? 'payload_only' : 'rendered');
  entry.render = render;
  const note = e.note !== undefined ? e.note : row[4];
  if (note) entry.note = note;
  if (e.disclosures) entry.disclosures = e.disclosures;
  out.find((s) => s.id === sec).fields.push(entry);
};
// default mapping of one proposal row → one field
const auto = (sec, row, over = {}) => {
  const field = over.name || row[1];
  const p = over.path || `${BASE[sec]}${field}`;
  let source = over.source;
  let type = over.type;
  if (!source && LINF.has(field)) { source = `lineage:${field}`; type = type || linType(field); }
  if (!type) { type = T[row[2]]; if (!type) throw new Error(`type ${row[2]} for ${row[1]}`); }
  if (!source) throw new Error(`no source for ${sec} ${row[1]}`);
  add(sec, row, { ...over, path: p, type, source });
};
const lin = (sec, row, names, labels, extra = {}) => names.forEach((n, i) => auto(sec, row, { name: n, label: labels ? labels[i] : undefined, note: i === 0 ? row[4] : '', ...extra }));

const H = {
  // identity
  'identity|match.address': (s, r) => auto(s, r, { path: 'match.address', source: 'consumer:match.address' }),
  'identity|parcel.parcelId': (s, r) => auto(s, r, { path: 'parcel.parcelId', source: 'consumer:parcel.parcelId' }),
  'identity|parcel.lot.zone_label': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:zoning_zn_string' }),
  'identity|parcel.lot.zone_class_label': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'presentation:zone_class_label' }),
  'identity|parcel.lot.exception_number': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:exception_number' }),
  'identity|parcel.lot.frontage_m': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:frontage_m' }),
  'identity|parcel.lot.depth_m': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:depth_m' }),
  'identity|parcel.lot.is_irregular': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:is_irregular' }),
  'identity|parcel.lot.is_corner_lot · is_through_lot': (s, r) => {
    auto(s, r, { path: 'parcel.lot.is_corner_lot', label: 'Corner lot', source: pend.q('Q-7'), target: 'parcels:is_corner_lot' });
    auto(s, r, { path: 'parcel.lot.is_through_lot', label: 'Through lot', source: pend.q('Q-7'), target: 'parcels:is_through_lot', note: '' });
  },
  'identity|parcel.lot.abuts_laneway': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:abuts_laneway' }),
  'identity|parcel.lot.centroid_lat · centroid_lng': (s, r) => {
    auto(s, r, { path: 'parcel.lot.centroid_lat', label: 'Map pin latitude', source: pend.q('Q-7'), target: 'parcels:centroid_lat' });
    auto(s, r, { path: 'parcel.lot.centroid_lng', label: 'Map pin longitude', source: pend.q('Q-7'), target: 'parcels:centroid_lng', note: '' });
  },
  'identity|parcel.lot.outline_geojson': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), target: 'parcels:geom' }),
  'identity|parcel.lot.overlays[]': (s, r) => auto(s, r, { path: 'parcel.lot.overlays', name: 'overlays', source: pend.q('Q-7'), note: `${r[4]}. Assembled from several parcels columns (in_sixplex_area, zoning_holding, zoning_overlays, heritage/ravine joins), so no single target.` }),
  'identity|parcel.lot.semi_half': (s, r) => {
    log.push('identity semi_half → scenarios.lot_form.* (operator Q-1/Q-2, 2026-10-20)');
    auto(s, r, { path: 'scenarios.lot_form.lot_form_detected', label: 'Lot form detected', type: ['text'], enum: ['semi_half', 'detached'], status: 'new', source: pend.lq('lot_form_detected'), note: 'Q-1/Q-2 (decided 2026-10-20): semi_half per Spec 78 O-4 (derived on read; fidelity differs, ML-4), else detached. Drives the semi-lot display rule (presentation lot_form_rules).' });
    auto(s, r, { path: 'scenarios.lot_form.lot_form_basis', label: 'How the lot form was detected', type: ['text'], status: 'new', source: pend.lq('lot_form_basis'), note: 'Q-2: the O-4 detection basis (primary footprint linked to exactly two parcels that abut), shown with the correction link' });
    auto(s, r, { path: 'scenarios.lot_form.lot_form_user_override', label: "Correction: this isn't a semi — it's detached", type: ['text'], enum: ['detached'], status: 'new', source: pend.owed('APP-RENO'), note: 'Q-2: user input. O-12: the pipeline never reads it; applied in the app through the shared pure function (P5.7). Set → the lot switches to the full report (all new-build cards).' });
    auto(s, r, { path: 'scenarios.lot_form.lot_form_effective', label: 'Lot form used for this report', type: ['text'], enum: ['semi_half', 'detached'], status: 'new', source: pend.owed('APP-RENO'), note: 'Q-2: lot_form_user_override ?? lot_form_detected, computed in the app (P5.7 shared pure function), never stored by the pipeline (O-12)' });
  },
  'identity|parcel.lot.neighbourhood_name': (s, r) => auto(s, r, { path: r[1], source: pend.q('Q-7'), note: `${r[4]} (a join, not a parcels column)` }),
  // headline
  'headline|scenarios.headline.scenario': (s, r) => auto(s, r, { path: r[1], name: 'scenario', source: 'lineage:scenario', type: linType('scenario'), note: 'the scenario of the is_headline row (lineage is_headline); null when nothing permitted' }),
  'headline|scenarios.headline.closed_reason': (s, r) => auto(s, r, { path: r[1], source: pend.owed('N11') }),
  'headline|scenarios.counts {permitted, not_permitted, not_buildable, not_evaluated, collapsed}': (s, r) => ['permitted', 'not_permitted', 'not_buildable', 'not_evaluated', 'collapsed'].forEach((k, i) => auto(s, r, { path: `scenarios.counts.${k}`, label: `Count: ${k.replace('_', ' ')}`, source: pend.owed('N11'), type: ['integer'], render: 'payload_only', note: i ? '' : r[4] })),
  'headline|scenarios.headline.source': (s, r) => auto(s, r, { path: r[1], source: pend.owed('N11'), enum: ['legacy_areas', 'scenarios'] }),
  'headline|scenarios.computed_at': (s, r) => auto(s, r, { path: r[1], name: 'computed_at', source: 'lineage:computed_at', type: linType('computed_at') }),
  // lot (legacy)
  'lot|parcel.areas.max_build_stories · max_build_fsi · coa_fsi': (s, r) => [['max_build_stories', "Today's max storeys"], ['max_build_fsi', "Today's max FSI"], ['coa_fsi', "Today's CoA FSI"]].forEach(([n, l], i) => auto(s, r, { path: `parcel.areas.${n}`, label: l, source: `consumer:parcel.areas.${n}`, type: ['number'], note: i ? '' : r[4] })),
  'lot|gate_flags': (s, r) => auto(s, r, { path: 'scenarios.cards[].gate_flags' }),
  // card
  'card|display_label': (s, r) => auto(s, r, { source: 'presentation:display_label' }),
  'card|fsi_status · coverage_status · storeys_status · height_status': (s, r) => lin(s, r, ['fsi_status', 'coverage_status', 'storeys_status', 'height_status'], ['FSI status', 'Coverage status', 'Storeys status', 'Height status']),
  'card|same_as_scenario': (s, r) => auto(s, r, { source: pend.lq('same_as_scenario') }),
  'card|status_text': (s, r) => auto(s, r, { source: 'presentation:status_text' }),
  'card|avg_unit_gfa_sqm': (s, r) => auto(s, r, { source: pend.lq('avg_unit_gfa_sqm') }),
  'card|main_gfa_with_suite_sqm · main_gfa_without_suite_sqm': (s, r) => lin(s, r, ['main_gfa_with_suite_sqm', 'main_gfa_without_suite_sqm'], ['Main GFA with suite', 'Main GFA without suite']),
  'card|gain_vs_detached_footprint_sqm · gain_vs_detached_storeys': (s, r) => lin(s, r, ['gain_vs_detached_footprint_sqm', 'gain_vs_detached_storeys'], ['Gain vs detached (footprint)', 'Gain vs detached (storeys)']),
  'card|host_interior_sqm · suite_interior_sqm': (s, r) => lin(s, r, ['host_interior_sqm', 'suite_interior_sqm'], ['Host unit interior', 'Suite interior']),
  'card|gfa_flat_sqm · gfa_pitched_sqm · storeys_flat · storeys_pitched': (s, r) => lin(s, r, ['gfa_flat_sqm', 'gfa_pitched_sqm', 'storeys_flat', 'storeys_pitched'], ['GFA (flat roof)', 'GFA (pitched roof)', 'Storeys (flat roof)', 'Storeys (pitched roof)']),
  'card|main_wall_limit_m · main_wall_pair · main_wall_status': (s, r) => lin(s, r, ['main_wall_limit_m', 'main_wall_pair', 'main_wall_status'], ['Main-wall height limit', 'Main walls it applies to', 'Main-wall status']),
  'card|main_depth_cap_m · main_length_cap_m': (s, r) => lin(s, r, ['main_depth_cap_m', 'main_length_cap_m'], ['Depth cap', 'Length cap']),
  'card|field_citations {field: [clause]}': (s, r) => auto(s, r, { name: 'field_citations', path: 'scenarios.cards[].field_citations', source: pend.lq('field_citations') }),
  'card|field_status {field: computed|unregulated|unlimited|not_applicable}': (s, r) => auto(s, r, { name: 'field_status', path: 'scenarios.cards[].field_status', source: pend.lq('field_status') }),
  'card|field_trust {field: tier}': (s, r) => auto(s, r, { name: 'field_trust', path: 'scenarios.cards[].field_trust', source: 'presentation:field_trust' }),
  'card|trust_label': (s, r) => auto(s, r, { source: 'presentation:trust_label' }),
  'card|requires_attached_half_removed': () => log.push('card requires_attached_half_removed DROPPED: Q-1 (decided 2026-10-20) hides every new-build card on a semi_half lot, so no flag or attached_half_removal disclosure is needed'),
  'card|cost_estimate {total, per_sqm, area_priced_sqm, basis}': (s, r) => [['total', 'Cost of this scenario', ['number', '$']], ['per_sqm', 'Cost per m²', ['number', '$/m²']], ['area_priced_sqm', 'Area priced', ['number', 'm²']], ['basis', 'Cost basis', ['text']]].forEach(([n, l, t], i) => auto(s, r, { path: `scenarios.cards[].cost_estimate.${n}`, label: l, type: t, source: pend.q('Q-11'), note: i ? '' : r[4] })),
  'card|illustrations[] {asset_id, kind, caption, alt}': () => log.push('card illustrations[] object row → declared member by member in the images section'),
  // coa
  'coa|suite_coa_gfa_sqm': (s, r) => auto(s, r, { source: pend.lq('suite_coa_gfa_sqm'), note: 'Q-4 (decided 2026-10-20): KEEP the rear-suite CoA (amends Spec 131 LC-49 / P5.10a); shown as not_evaluated:coa_factor_unfitted:suite until a suite cohort is calibrated (S78 §6.4 rule 2: never borrowed). In the lineage (Spec 78 P5.10a, bylaw-fix-1 report v2 lineage queue).' }),
  'coa|suite_coa_increment_sqm': (s, r) => auto(s, r, { source: pend.lq('suite_coa_increment_sqm'), note: 'Q-4 (decided 2026-10-20): KEEP the rear-suite CoA (amends Spec 131 LC-49 / P5.10a); shown as not_evaluated:coa_factor_unfitted:suite until a suite cohort is calibrated (S78 §6.4 rule 2: never borrowed). In the lineage (Spec 78 P5.10a, bylaw-fix-1 report v2 lineage queue).' }),
  'coa|suite_coa_status': (s, r) => auto(s, r, { source: pend.lq('suite_coa_status'), note: 'Q-4 (decided 2026-10-20): KEEP the rear-suite CoA (amends Spec 131 LC-49 / P5.10a); shown as not_evaluated:coa_factor_unfitted:suite until a suite cohort is calibrated (S78 §6.4 rule 2: never borrowed). In the lineage (Spec 78 P5.10a, bylaw-fix-1 report v2 lineage queue).' }),
  // disclosures
  'disclosures|disclosure_texts[] {code, text, importance, mandatory}': (s, r) => [['code', 'Disclosure code', ['text']], ['text', 'Disclosure text', ['text']], ['importance', 'Importance', ['text']], ['mandatory', 'Mandatory', ['boolean']]].forEach(([n, l, t], i) => auto(s, r, { path: `scenarios.cards[].disclosure_texts[].${n}`, label: l, type: t, source: 'presentation:disclosure_texts', note: i ? '' : r[4] })),
  'disclosures|disclosure_params {code: {X, A, Hw, …}}': (s, r) => auto(s, r, { name: 'disclosure_params', path: 'scenarios.cards[].disclosure_params', source: pend.lq('disclosure_params') }),
  'disclosures|scenarios.lot_disclosures[]': (s, r) => auto(s, r, { name: 'lot_disclosures', path: 'scenarios.lot_disclosures', source: pend.owed('N11') }),
  // lot-level texts: the codes above, rendered once (same registry as the per-card texts)
  'disclosures|__lot_texts': (s, r) => ['code', 'text', 'importance', 'mandatory'].forEach((n) => auto(s, r, { path: `scenarios.lot_disclosure_texts[].${n}`, label: `Lot-level disclosure ${n}`, type: n === 'mandatory' ? ['boolean'] : ['text'], status: 'proposed', source: 'presentation:disclosure_texts', note: '' })),
  // existing
  'existing|existing_confidence · existing_low_confidence': (s, r) => lin(s, r, ['existing_confidence', 'existing_low_confidence'], ['Confidence in estimate', 'Low confidence']),
  'existing|owner_input.width_m · depth_m': (s, r) => [['width_m', 'Owner input: width'], ['depth_m', 'Owner input: depth']].forEach(([n, l], i) => auto(s, r, { path: `scenarios.existing.owner_input.${n}`, label: l, type: ['number', 'm'], source: pend.owed('APP-RENO'), note: i ? '' : r[4] })),
  'existing|owner_input.storeys': (s, r) => auto(s, r, { path: 'scenarios.existing.owner_input.storeys', source: pend.owed('APP-RENO') }),
  'existing|owner_input.basement_present · basement_height_m': (s, r) => {
    auto(s, r, { path: 'scenarios.existing.owner_input.basement_present', label: 'Owner input: basement present', type: ['boolean'], source: pend.owed('APP-RENO') });
    auto(s, r, { path: 'scenarios.existing.owner_input.basement_height_m', label: 'Owner input: basement height', type: ['number', 'm'], source: pend.owed('APP-RENO'), note: '' });
  },
  'existing|owner_input.consent_version': (s, r) => auto(s, r, { path: 'scenarios.existing.owner_input.consent_version', source: pend.owed('APP-RENO') }),
  'existing|existing_footprint_shared': () => log.push('existing existing_footprint_shared DROPPED: Q-2 (decided 2026-10-20) shows no estimated existing-house or renovation numbers on a semi_half lot; owner input first'),
  // reno
  'reno|renovation_addition': () => log.push('reno scenario row RA → cards[]'),
  'reno|renovation_envelope_expansion': () => log.push('reno scenario row RE → cards[] (pending Q-6)'),
  'reno|renovation_basement': () => log.push('reno scenario row RB → cards[]'),
  'reno|renovation_basement_finish': (s, r) => {
    log.push('reno scenario row RF → cards[] + field basement_finish_livable_sqm');
    auto(s, r, { name: 'basement_finish_livable_sqm', label: 'Basement finish livable area', type: ['number', 'm²'], status: 'new', source: pend.lq('basement_finish_livable_sqm'), note: 'gap 4 (approved 2026-10-20); needs existing_basement = true and owner basement_height_m' });
  },
  'reno|renovation_interior': () => log.push('reno scenario row RI → cards[]'),
  'reno|renovation_envelope_gfa_sqm · renovation_envelope_footprint_sqm': (s, r) => lin(s, r, ['renovation_envelope_gfa_sqm', 'renovation_envelope_footprint_sqm'], ['Renovation envelope GFA', 'Renovation envelope footprint']),
  'reno|addition_up_gfa_sqm · addition_back_footprint_sqm · addition_back_gfa_sqm': (s, r) => lin(s, r, ['addition_up_gfa_sqm', 'addition_back_footprint_sqm', 'addition_back_gfa_sqm'], ['Addition up (GFA)', 'Addition back (footprint)', 'Addition back (GFA)']),
  'reno|interior_attic_gfa_sqm · interior_units_gain': (s, r) => lin(s, r, ['interior_attic_gfa_sqm', 'interior_units_gain'], ['Attic conversion', 'Unit gain']),
  'reno|cost_estimate': (s, r) => auto(s, r, { path: 'scenarios.renovations[].cost_estimate.total', type: ['number', '$'], source: pend.q('Q-11') }),
  // street view
  'street_view|street_view.status': (s, r) => auto(s, r, { path: 'parcel.street_view.status', source: pend.q('Q-9'), target: 'presentation:street_view', enum: ['available', 'no_imagery', 'disabled', 'quota'] }),
  'street_view|street_view.heading · pitch · fov': (s, r) => [['heading_deg', 'Camera heading'], ['pitch_deg', 'Camera pitch'], ['fov_deg', 'Camera field of view']].forEach(([n, l], i) => auto(s, r, { path: `parcel.street_view.${n}`, label: l, type: ['number', 'deg'], source: pend.q('Q-9'), target: 'presentation:street_view', note: i ? '' : r[4] })),
  // images
  'images|illustrations[].kind': (s, r) => auto(s, r, { path: 'scenarios.cards[].illustrations[].kind', source: pend.q('Q-10'), target: 'presentation:illustrations', enum: ['illustration', 'massing_diagram', 'street_view'] }),
  'images|illustrations[].caption · alt': (s, r) => [['caption', 'Caption'], ['alt', 'Alt text']].forEach(([n, l], i) => auto(s, r, { path: `scenarios.cards[].illustrations[].${n}`, label: l, type: ['text'], source: pend.q('Q-10'), target: 'presentation:illustrations', note: i ? '' : r[4] })),
  // market
  'market|parcel.neighbourhood.comparableBuilds[] {address, permit_fsi, structure_family, work_type, permit_gfa_sqm, coa_decision}': (s, r) => auto(s, r, { path: 'parcel.neighbourhood.comparableBuilds', name: 'comparableBuilds', source: 'consumer:parcel.neighbourhood.comparableBuilds' }),
  'market|parcel.neighbourhood.coaProjects[] {applicationNumber, address, status, decision, decisionDate, hearingDate, description, projectType}': (s, r) => auto(s, r, { path: 'parcel.neighbourhood.coaProjects', name: 'coaProjects', source: 'consumer:parcel.neighbourhood.coaProjects' }),
  'market|comp_count_same_form · comp_fsi_p50_same_form · comparable_builds_same_form[]': (s, r) => [['comp_count_same_form', 'Comparable builds, this build type', ['integer']], ['comp_fsi_p50_same_form', 'Typical FSI p50, this build type', ['number']], ['comparable_builds_same_form', 'Comparable list, this build type', ['object[]']]].forEach(([n, l, t], i) => auto(s, r, { path: `scenarios.cards[].market.${n}`, label: l, type: t, source: pend.q('Q-5'), note: i ? '' : r[4] })),
  'market|comp_fsi_p50_same_form · comparable_builds_same_form[]': () => log.push('market duplicate same-form row → merged into the first'),
  'market|nearby_coa_builds_gfa_sqm': (s, r) => auto(s, r, { path: 'scenarios.cards[].market.nearby_coa_builds_gfa_sqm' }),
  'market|nbhd_coa_approval_rate': (s, r) => auto(s, r, { path: 'scenarios.cards[].market.nbhd_coa_approval_rate' }),
  'market|nbhd_coa_approved · nbhd_coa_refused · nbhd_coa_total': (s, r) => [['nbhd_coa_approved', 'Neighbourhood CoA approved'], ['nbhd_coa_refused', 'Neighbourhood CoA refused'], ['nbhd_coa_total', 'Neighbourhood CoA total']].forEach(([n, l], i) => auto(s, r, { path: `scenarios.cards[].market.${n}`, label: l, type: ['integer'], source: pend.lq(n), note: i ? '' : r[4] })),
  'market|nearby_coa_builds_count': (s, r) => auto(s, r, { path: 'scenarios.cards[].market.nearby_coa_builds_count', source: pend.lq('nearby_coa_builds_count') }),
  'market|new_nearby_coa_ruling': (s, r) => auto(s, r, { path: 'parcel.neighbourhood.new_nearby_coa_ruling', type: ['boolean'], source: pend.owed('S-072-derivation') }),
  // cost
  'cost|…garage.total · solar_max.total · solar_coa.total · kitchen.per_sqm · bath.per_sqm': (s, r) => [['garage.total', 'Garage', '$'], ['solar_max.total', 'Solar (max build)', '$'], ['solar_coa.total', 'Solar (CoA build)', '$'], ['kitchen.per_sqm', 'Kitchen (per m²)', '$/m²'], ['bath.per_sqm', 'Bath (per m²)', '$/m²']].forEach(([n, l, u], i) => auto(s, r, { path: `parcel.costMenu.menu.${n}`, label: l, type: ['number', u], source: 'consumer:parcel.costMenu.menu', note: i ? '' : r[4] })),
  'cost|menu.<line>.fits · absent': (s, r) => auto(s, r, { path: 'parcel.costMenu.menu.<line>.fits', name: 'fits', type: ['boolean'], source: 'consumer:parcel.costMenu.menu' }),
  'cost|menu.<line>.area': (s, r) => auto(s, r, { path: 'parcel.costMenu.menu.<line>.area', name: 'area', source: 'consumer:parcel.costMenu.menu' }),
  'cost|maxBuildBasisLabel(areas)': (s, r) => auto(s, r, { path: 'ui.cost.basis_label', name: 'basis_label', source: 'presentation:cost_basis_label' }),
  // ads
  'ads|offers[].placement_key': (s, r) => auto(s, r, { path: 'offers[].placement_key', source: pend.q('Q-8'), target: 'presentation:ad_placements' }),
  'ads|offers[].disclosure_label': (s, r) => auto(s, r, { path: 'offers[].disclosure_label', source: 'presentation:sponsored_label', note: `${r[4]}; the offers[] list itself rides on Q-7` }),
  'ads|offers[].advertiser_name': (s, r) => auto(s, r, { path: 'offers[].advertiser_name', source: pend.q('Q-7') }),
  'ads|offers[].title · body · image_url · cta_label · cta_url': (s, r) => [['title', 'Offer title', ['text']], ['body', 'Offer body', ['text']], ['image_url', 'Offer image', ['url']], ['cta_label', 'Call to action', ['text']], ['cta_url', 'Call-to-action link', ['url']]].forEach(([n, l, t], i) => auto(s, r, { path: `offers[].${n}`, label: l, type: t, source: pend.q('Q-7'), note: i ? '' : r[4] })),
  'ads|offers[].targeting_context {scenario, building_class, zone_class, has_suite, renovation}': (s, r) => auto(s, r, { path: 'offers[].targeting_context', name: 'targeting_context', type: ['jsonb'], source: pend.q('Q-7'), render: 'payload_only' }),
  'ads|offers[].offer_id': (s, r) => {
    auto(s, r, { path: 'offers[].offer_id', source: pend.q('Q-7'), render: 'payload_only' });
    auto(s, r, { path: 'offers[].slot_index', label: 'Slot index', type: ['integer'], status: 'proposed', source: pend.q('Q-8'), render: 'payload_only', note: 'REVIEW §2.2 payload item; position within the placement' });
  },
  // states
  'states|format.area_unit': (s, r) => auto(s, r, { path: 'ui.format.area_unit', name: 'area_unit', type: ['text'], source: 'presentation:formats.area_unit', enum: ['m²', 'ft²'] }),
  'states|format.{area, length, fsi, currency, percent}': (s, r) => ['area', 'length', 'fsi', 'currency', 'percent'].forEach((n, i) => auto(s, r, { path: `ui.format.${n}`, label: `Formatter: ${n}`, type: ['text'], source: `presentation:formats.${n}`, note: i ? '' : r[4] })),
  'states|not_permitted · not_applicable · not_buildable': (s, r) => auto(s, r, { path: 'ui.states.hidden', name: 'hidden', type: ['text[]'], source: 'presentation:states.hidden' }),
  'states|not_evaluated:<reason> on headline; needs_user_input on renovations': (s, r) => auto(s, r, { path: 'ui.states.shown', name: 'shown', type: ['text[]'], source: 'presentation:states.shown' }),
  'states|"—"': (s, r) => {
    auto(s, r, { path: 'ui.states.null_value', name: 'null_value', type: ['text'], source: 'presentation:states.null_value' });
    auto(s, r, { path: 'ui.states.semi_needs_input', name: 'semi_needs_input', label: 'Semi lot: needs your input', type: ['text'], status: 'new', source: 'presentation:states.semi_needs_input', note: 'Q-1/Q-2/Q-3 (decided 2026-10-20): on a semi_half lot only renovation cards, each asking for the owner input first; no estimate shown' });
    auto(s, r, { path: 'ui.states.semi_correction', name: 'semi_correction', label: "Semi lot: \"it's detached\" correction", type: ['text'], status: 'new', source: 'presentation:states.semi_correction', note: 'Q-2: the correction prompt; sets lot_form_user_override' });
    auto(s, r, { path: 'ui.lot_form_rules', name: 'lot_form_rules', label: 'Lot-form display rules', type: ['jsonb'], status: 'new', source: 'presentation:lot_form_rules', note: 'Q-1/Q-2/Q-3: what a semi_half lot shows' });
  },
};

// section-level defaults for rows without a handler
const sectionDefault = {
  identity: null, headline: null,
  lot: (s, r) => auto(s, r, { path: r[1], source: `consumer:${r[1]}` }),
  card: (s, r) => auto(s, r), suite: (s, r) => auto(s, r), coa: (s, r) => auto(s, r), existing: (s, r) => auto(s, r),
  disclosures: (s, r) => auto(s, r, { path: `scenarios.cards[].${r[1]}` }),
  reno: (s, r) => auto(s, r),
  street_view: (s, r) => auto(s, r, { path: `parcel.${r[1]}`, source: pend.q('Q-9'), target: 'presentation:street_view' }),
  images: (s, r) => auto(s, r, { path: `scenarios.cards[].${r[1]}`, source: pend.q('Q-10'), target: 'presentation:illustrations' }),
  market: (s, r) => auto(s, r, { path: r[1], source: `consumer:${r[1]}` }),
  cost: (s, r) => auto(s, r, { path: r[1], source: 'consumer:parcel.costMenu.menu' }),
  ads: null, states: null,
};

for (const sec of P.sections) {
  out.push({ id: sec.id, title: sec.title, proposal_path: sec.path, fields: [] });
  for (const r of sec.rows) {
    const h = H[`${sec.id}|${r[1]}`] || sectionDefault[sec.id];
    if (!h) throw new Error(`no handler: ${sec.id}|${r[1]}`);
    h(sec.id, r);
    if (sec.id === 'disclosures' && r[1] === 'scenarios.lot_disclosures[]') H['disclosures|__lot_texts'](sec.id, r);
  }
}
// renovation rows need their own scenario / status / total / disclosure fields (keyed per card)
const reno = out.find((s) => s.id === 'reno');
const renoExtra = [
  { path: 'scenarios.renovations[].scenario', label: 'Renovation scenario code', source: 'lineage:scenario', type: linType('scenario'), status: 'planned', note: 'P5.1 closed set (RA, RI, RB; RE/RF pending)' },
  { path: 'scenarios.renovations[].total_gfa_sqm', label: 'Total floor area after renovation', source: 'lineage:total_gfa_sqm', type: linType('total_gfa_sqm'), status: 'planned' },
  { path: 'scenarios.renovations[].disclosures', label: 'Renovation disclosures', source: 'lineage:disclosures', type: linType('disclosures'), status: 'planned' },
  { path: 'scenarios.renovations[].row_trust_level', label: 'Renovation trust level', source: 'lineage:row_trust_level', type: linType('row_trust_level'), status: 'planned' },
  ...['code', 'text', 'importance', 'mandatory'].map((n) => ({ path: `scenarios.renovations[].disclosure_texts[].${n}`, label: `Renovation disclosure ${n}`, source: 'presentation:disclosure_texts', type: n === 'mandatory' ? ['boolean'] : ['text'], status: 'proposed' })),
  { path: 'scenarios.renovations[].display_label', label: 'Renovation card title', source: 'presentation:display_label', type: ['text'], status: 'proposed' },
];
for (const e of renoExtra) add('reno', ['', '', '', e.status, ''], { ...e, note: e.note || '' });
log.push(`reno: +${renoExtra.length} per-card fields (scenario, total, disclosures, texts, title) the proposal implies but does not list`);
// images: asset_id
// cards
const RULING_CARD = { RE: pend.q('Q-6'), RF: pend.lq('scenario:RF') };
const cards = P.cards.map((c) => ({
  code: c.code, scenario: c.scenario, kind: c.code.startsWith('R') ? 'renovation' : 'new_build', title: c.title, status: c.status,
  source: RULING_CARD[c.code] || 'lineage:scenario',
  ...(c.code === 'S' ? { disclosures: ['semi_party_wall'], note: 'Q-1/Q-3 (decided 2026-10-20): S exists only where semi_half holds, and a semi_half lot shows only renovation cards, so this card is never rendered; kept declared because the lineage row exists' } : {}),
  ...(c.note && c.code !== 'S' ? { note: c.code === 'D' ? 'Q-1 (decided 2026-10-20): hidden on a semi_half lot (only renovation cards there)' : c.note } : {}),
}));

// ---- decided rulings (2026-10-20 export + chat overlay) applied to the seeded rows
for (const sec of out) for (const f of sec.fields) if (f.path === 'scenarios.cards[].is_headline') f.note = 'largest total_gfa_sqm among permitted AND buildable new-build rows; tie → catalogue order (lineage :421). Shown as the headline only after the shadow passes (R-11); before that, a labelled "largest option" badge. Q-1 (decided): on a semi_half lot there are no new-build cards and so no headline (lot_form_rules.semi_half).';
const AMEND = 'pending:spec100_amendment:Q-7';
// Q-7 as approved names: zone label, lot frontage/depth, map outline, street_view, offers. Any other identity row
// rides on an operator confirmation of the scope (coordinator, verify-13 N2).
const Q7_IN = new Set(['parcel.lot.zone_label', 'parcel.lot.frontage_m', 'parcel.lot.depth_m', 'parcel.lot.outline_geojson']);
const CONFIRM = 'pending:operator_confirm:Q-7-scope';
// The scope confirmation (operator chat 2026-10-20, CHAT-11, "y to all") is read from its committed decision log, never
// copied: an approved CHAT-11 confirms every field its recommendation lists after its last colon ("parcel.lot.zone_class_label,
// exception_number, …"; a bare name is a parcel.lot field), and every listed name must be a declared row (Spec 124 R-HK).
const Q7_LOG_REL = 'docs/reports/decisions/2026-10-20-chat-batch-b.json';
const Q7_LOG_TEXT = fs.readFileSync(path.join(ROOT, Q7_LOG_REL), 'utf8');
const Q7_LOG = JSON.parse(Q7_LOG_TEXT);
const Q7_SCOPE = Q7_LOG.decisions.find((d) => d.id === 'CHAT-11');
if (!Q7_SCOPE) throw new Error(`${Q7_LOG_REL} has no CHAT-11`);
const Q7_CONFIRMED = (Q7_LOG.decision_vocab || {})[Q7_SCOPE.decision] === 'approve' ? new Set(Q7_SCOPE.recommendation.split(':').pop().split(',').map((t) => t.trim().replace(/\.$/, '')).map((t) => (t.startsWith('parcel.lot.') ? t : `parcel.lot.${t}`))) : new Set();
const Q7_CITE = '2026-10-20-chat-batch-b#CHAT-11';
const q7Confirmed = [];
for (const sec of out) for (const f of sec.fields) {
  const was = f.source;
  if (f.path.startsWith('parcel.lot.')) {
    const inScope = Q7_IN.has(f.path);
    const confirmed = !inScope && Q7_CONFIRMED.has(f.path);
    if (confirmed) q7Confirmed.push(f.path);
    f.source = inScope || confirmed ? AMEND : CONFIRM; const o = f.target; delete f.target;
    f.target = `consumer:${f.path}`;
    if (o && o.startsWith('parcels:')) f.origin = o;
    if (f.name === 'zone_class_label') { f.origin = 'parcels:zoning_class'; f.via = 'presentation:zone_class_label'; }
    f.note = (inScope ? `Q-7 (decided): Spec 100 §3.2 whitelist amendment. ${f.note || ''}` : confirmed ? `Q-7 scope (decided 2026-10-20, operator chat, ${Q7_CITE}): Spec 100 §3.2 whitelist amendment. ${f.note || ''}` : `Q-7 scope: not in the approved list (zone label, frontage/depth, map outline, street_view, offers); the operator confirms whether the Spec 100 amendment covers it. ${f.note || ''}`).trim();
  } else if (f.path.startsWith('parcel.street_view.')) {
    f.source = AMEND; f.target = 'consumer:parcel.street_view';
    f.note = `Q-9 (decided): server fetch (panorama lookup, heading toward the lot, signed URL), cache pano_id only, attribution always, usage cap + kill switch, never used as data; re-check Google's current pricing and terms (owed). Q-7: whitelisted key street_view. ${f.note || ''}`.trim();
  } else if (f.path.startsWith('offers[].') && f.name !== 'disclosure_label') {
    f.source = AMEND; f.target = 'consumer:offers';
    f.note = `Q-7 (decided): first-party targeted ads in a separate top-level offers[] list; Q-8 (decided): two slots, detail_footer and renovation_section. ${f.note || ''}`.trim();
  } else if (f.path.startsWith('offers[].disclosure_label')) {
    f.note = 'Q-7/Q-8 (decided): always labelled "Sponsored" (Spec 128 R-17 FAIL)';
  } else if (was === 'pending:operator_ruling:Q-10') {
    f.source = 'presentation:illustrations'; delete f.target;
    f.note = `Q-10 (decided, operator: "Each scenario shown will have a few different photos with it"): a small carousel of several static illustrations per card. ${f.note || ''}`.trim();
  } else if (was === 'pending:operator_ruling:Q-11') {
    f.source = 'pending:spec_owed:spec88';
    f.note = `Q-11 (decided): owned by the Spec 88 cost lane — each card prices its own floor area with the existing rates, after the scenario step exists. ${f.note || ''}`.trim();
  } else if (was === 'pending:operator_ruling:Q-5') {
    f.source = 'consumer:parcel.neighbourhood.comparableBuilds'; f.via = 'presentation:comparable_family_by_scenario';
    f.note = 'Q-5 (decided): a read-time filter of the existing comparable_builds list by structure_family; no new stored field, so LC-51 holds';
  }
  if (was !== f.source) log.push(`ruling: ${f.path} ${was} → ${f.source}${f.target ? ` (target ${f.target})` : ''}`);
  if (f.source.startsWith('pending:operator_ruling:')) throw new Error(`still pending on a ruling: ${f.path} ${f.source}`);
}
for (const p of Q7_CONFIRMED) if (!q7Confirmed.includes(p) && !Q7_IN.has(p)) throw new Error(`${Q7_CITE} names ${p}, which is not a declared parcel.lot row`);
const ui = out.find((x) => x.id === 'states');
ui.fields.push(
  { path: 'ui.street_view', name: 'street_view', label: 'Street View photo block (display rules)', type: 'jsonb', status: 'new', source: 'presentation:street_view', render: 'rendered', note: 'Q-9 (decided): caption, attribution template, placement' },
  { path: 'ui.ad_placements', name: 'ad_placements', label: 'Sponsored placements', type: 'jsonb', status: 'new', source: 'presentation:ad_placements', render: 'rendered', note: 'Q-7/Q-8 (decided): first-party ads, two slots, never inside a card, always "Sponsored"' },
);
// ---- lineage queue → lineage (R-HM; RS-5: "lineage now has X — switch the source to lineage:"). A row queued for the
// lineage takes `lineage:<field>` (and the lineage's own type / unit) once docs/reference/maxbld-field-lineage.json has
// the field; a queued card takes `lineage:scenario` once the lineage has its scenario code. Applied after the rulings so
// the switch is one rule, not a per-row edit; the lineage is written only by the by-law fix lane.
const LIN_CODES = LIN.scenario_codes || {};
const landed = (f) => {
  const m = /^pending:lineage_queue:(.+)$/.exec(f.source || '');
  if (!m || !LINF.has(m[1])) return;
  if (f.name !== m[1]) throw new Error(`lineage queue ${f.path}: payload key ${f.name} ≠ lineage field ${m[1]}`);
  const [type, unit] = linType(m[1]);
  const was = f.source; f.source = `lineage:${m[1]}`; f.type = type;
  if (unit) f.unit = unit; else delete f.unit;
  log.push(`lineage landed: ${f.path} ${was} → ${f.source}`);
};
for (const sec of out) for (const f of sec.fields) landed(f);
const cardLanded = (c) => {
  const m = /^pending:lineage_queue:scenario:(.+)$/.exec(c.source || '');
  if (!m || !(m[1] in LIN_CODES)) return;
  if (LIN_CODES[m[1]] !== c.scenario) throw new Error(`card ${c.code}: lineage scenario ${LIN_CODES[m[1]]} ≠ ${c.scenario}`);
  log.push(`lineage landed: card ${c.code} ${c.source} → lineage:scenario`); c.source = 'lineage:scenario';
};
for (const c of cards) if (c.code === 'RE') { c.source = 'pending:lineage_queue:scenario:RE'; c.status = 'new'; c.note = 'Q-6 (decided): keep the house and build out to the full renovation envelope (renovation_envelope_gfa_sqm − existing GFA); a separate card from RA (a targeted addition up or back sized by the owner). In P5.1 and the lineage (bylaw-fix-1 report v2 lineage queue).'; }
  else if (c.code === 'RA') c.note = 'Q-6 (decided): a targeted addition up or back, sized by the owner';
  else if (c.code === 'RF') c.note = 'gap 4 (approved 2026-10-20): needs existing_basement = true and the owner basement_height_m; in P5.1 and the lineage (bylaw-fix-1 report v2 lineage queue)';
for (const c of cards) cardLanded(c);

// not_in_report: lineage fields not declared anywhere
const declared = new Set();
for (const s of out) for (const f of s.fields) for (const src of [f.source, f.target]) if (src && src.startsWith('lineage:')) declared.add(src.slice(8));
const NIR_REASON = {
  parcel_id: 'row key; the report addresses the lot by parcel.parcelId (consumer)',
  building_class: 'declared on renovations; new-build cards imply it from the scenario',
  suite_setback_basis: 'jsonb provenance of the suite setbacks; admin view only (REVIEW §1.1 lists suite fields, not this one)',
  first_floor_elevation_m: 'payload-only per REVIEW §1.1; feeds the height check, not shown',
  roof_pitch: 'payload-only per REVIEW §1.1',
  comparable_builds_ref: 'by-reference pointer; the report renders parcel.neighbourhood.comparableBuilds (consumer)',
  layer2_table_version: 'version field, admin-only (REVIEW §1.1)',
  evaluator_version: 'version field, admin-only (REVIEW §1.1)',
  code_version: 'version field, admin-only (REVIEW §1.1)',
};
const not_in_report = LIN.fields.filter((f) => !declared.has(f.field)).map((f) => ({ field: f.field, reason: NIR_REASON[f.field] || 'UNREVIEWED' }));

const ANS_DIR = path.join(path.dirname(entriesPath), 'answers', 'report_decisions');
const ansFiles = fs.readdirSync(ANS_DIR).filter((f) => f.endsWith('.json')).sort();
const ansText = ansFiles.map((f) => fs.readFileSync(path.join(ANS_DIR, f), 'utf8')).join('\n');
const DEC = Object.fromEntries(ansFiles.map((f) => { const a = JSON.parse(fs.readFileSync(path.join(ANS_DIR, f), 'utf8')); return [a.ref, { decision: a.decision, note: a.note || null, recorded_by: a.recorded_by || 'operator (Rulings page)', updated_at: a.updated_at, via: 'page export' }]; }));
const CHAT = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'decisions-chat.json'), 'utf8')).decisions;
for (const [k, v] of Object.entries(CHAT)) DEC[k] = { ...v, via: 'chat relay (supersedes page export)', page_export: DEC[k] || null };
// The checkable consequence of each decided ruling: presentation-registry values RS-11 pins (report-schema.mjs).
const PINS = {
  'Q-1': { 'lot_form_rules.semi_half.show_card_kinds': ['renovation'], 'lot_form_rules.semi_half.headline': null },
  'Q-2': { 'lot_form_rules.semi_half.existing_estimates': 'hidden', 'lot_form_rules.semi_half.renovation_cards': 'require_owner_input', 'lot_form_rules.semi_half.correction.value': 'detached' },
  'Q-3': { 'lot_form_rules.semi_half.suite_add_on': false },
};
const statusOf = (d) => (!d ? 'open' : d.decision === 'discuss' ? 'open' : 'decided');
const rulings = {
  $comment: 'Operator rulings the v2 report schema waits on. Seeded mechanically from the Report Schema Rulings page export (questions: entries.json; decisions: answers/report_decisions/*.json; chat decisions after the export: a flagged overlay); `status` flips to "decided" only by transferring the operator decision, never by hand-editing a row source. RS-5 FAILs every row still pending on a decided ruling.',
  source: { page: 'Report Schema Rulings (artifact)', questions: { export: 'scripts/surfaces/_schema/report-v2-seed/entries.json', sha256_16: sha(entriesText) }, decisions: { export: 'scripts/surfaces/_schema/report-v2-seed/answers/report_decisions/*.json', files: ansFiles.length, sha256_16: sha(ansText) }, chat_overlay: Object.keys(CHAT), q7_scope: { decision: Q7_CITE, log: Q7_LOG_REL, sha256_16: sha(JSON.stringify(Q7_SCOPE)), confirmed: q7Confirmed }, exported: '2026-10-20', decision_vocabulary: { keep: 'decided: the recommendation stands', drop: 'decided: the recommendation is replaced by the note', discuss: 'open' } },
  rulings: E.map((e) => ({ ref: e.ref, topic: e.step, key: e.key, gap: e.evidence.map((x) => x.quote).join(' '), recommendation: e.note, status: statusOf(DEC[e.ref]), decision: DEC[e.ref] || null, ...(PINS[e.ref] ? { pins: PINS[e.ref] } : {}) })),
};

const LOT = {
  'match.address': '159 Angus Dr', 'parcel.areas.lot_size_sqm': 329, 'parcel.areas.max_buildable_gfa_sqm': 197.5,
  'parcel.lot.zone_label': 'RM (f18.0; a665; u4)', 'parcel.lot.zone_class_label': 'Residential Multiple Dwelling', 'parcel.lot.frontage_m': 9.48,
  'parcel.lot.exception_number': null, 'parcel.lot.abuts_laneway': false,
  'scenarios.lot_form.lot_form_detected': 'semi_half', 'scenarios.lot_form.lot_form_basis': 'O-4: the primary building footprint is shared with 157 Angus Dr, which abuts this lot',
};
const SAMPLES = [
  {
    id: 'semi_as_detected',
    title: '159 Angus Dr as detected: half of a semi (Q-1/Q-2/Q-3 apply)',
    basis: 'Lot facts measured read-only (REVIEW §5.3 A, parcels.id 5059565). Cards and statuses INFERRED from the decided rulings Q-1/Q-2/Q-3; nothing is computed yet.',
    values: { ...LOT, 'scenarios.lot_form.lot_form_user_override': null, 'scenarios.lot_form.lot_form_effective': 'semi_half', 'scenarios.headline.scenario': null, 'scenarios.headline.closed_reason': 'not_evaluated:needs_user_input:semi_lot', 'scenarios.headline.source': 'scenarios', 'scenarios.counts.permitted': 4, 'scenarios.counts.not_permitted': 0, 'scenarios.counts.not_buildable': 0, 'scenarios.counts.not_evaluated': 3, 'scenarios.counts.collapsed': 0, 'scenarios.lot_disclosures': ['semi_detached_house_not_modelled', 'forms_deferred'] },
    cards: [],
    renovations: ['RA', 'RI', 'RB'].map((code) => ({ code, values: { scenario_status: 'not_evaluated:needs_user_input:semi_lot', building_class: 'semi_detached_house' }, disclosures: ['existing_storeys_needed'] })),
    offers: [],
  },
  {
    id: 'semi_corrected_to_detached',
    title: "159 Angus Dr after the owner's correction \"it's detached\" (full report)",
    basis: 'Same lot; lot_form_user_override = detached (Q-2). Every number below is ILLUSTRATIVE (INFERRED) so the prototype shows real shapes and real P5.12 disclosure text; the scenario step does not exist yet.',
    values: { ...LOT, 'scenarios.lot_form.lot_form_user_override': 'detached', 'scenarios.lot_form.lot_form_effective': 'detached', 'scenarios.headline.scenario': 'detached_houseplex', 'scenarios.headline.closed_reason': null, 'scenarios.headline.source': 'legacy_areas', 'scenarios.counts.permitted': 3, 'scenarios.counts.not_permitted': 0, 'scenarios.counts.not_buildable': 0, 'scenarios.counts.not_evaluated': 3, 'scenarios.counts.collapsed': 0, 'scenarios.lot_disclosures': ['forms_deferred'], 'scenarios.existing.existing_width_m': 14.79, 'scenarios.existing.existing_depth_m': 16.29, 'scenarios.existing.existing_footprint_sqm': 196, 'scenarios.existing.existing_source': 'estimated', 'scenarios.existing.existing_confidence': 0.5, 'scenarios.existing.existing_low_confidence': true },
    cards: [
      { code: 'D', values: { scenario_status: 'permitted', is_headline: false, total_gfa_sqm: 205, main_gfa_sqm: 205, main_storeys: 2, dwelling_units: 1, roof_form_headline: 'pitched_attic', binding_constraint: 'fsi', row_trust_level: 'disclosed', 'suite.suite_type': 'none' }, disclosures: ['front_yard_averaging', 'basement_excluded', 'decks_platforms_not_modelled'], params: { front_yard_averaging: { X: '4.6' }, basement_excluded: { A: '78' } } },
      { code: '2', values: { scenario_status: 'permitted', is_headline: false, total_gfa_sqm: 265, main_gfa_sqm: 205, dwelling_units: 2, roof_form_headline: 'pitched_attic', binding_constraint: 'fsi', row_trust_level: 'disclosed', 'suite.suite_type': 'garden', 'suite.suite_gfa_sqm': 60, 'coa.coa_status': 'applies', 'coa.suite_coa_status': 'not_evaluated:coa_factor_unfitted:suite' }, disclosures: ['front_yard_averaging', 'suite_separation_arm', 'suite_soft_landscaping', 'coa_calibrated_not_law'], params: { front_yard_averaging: { X: '4.6' }, suite_soft_landscaping: { X: '25', 'behind the house / between the house and the suite': 'between the house and the suite' } } },
      { code: 'H', values: { scenario_status: 'permitted', is_headline: true, total_gfa_sqm: 340, main_gfa_sqm: 340, main_storeys: 3, dwelling_units: 4, max_bedrooms: 8, roof_form_headline: 'flat_setback', binding_constraint: 'rear_setback', row_trust_level: 'disclosed', gain_vs_detached_gfa_sqm: 135, gain_reasons: ['fsi_not_applicable'], 'suite.suite_type': 'none' }, disclosures: ['front_yard_averaging', 'flat_roof_setback', 'bedroom_cap', 'basement_excluded'], params: { front_yard_averaging: { X: '4.6' }, flat_roof_setback: { s: '1.5' }, bedroom_cap: { n: '8', u: '4' }, basement_excluded: { A: '78' } } },
    ],
    renovations: ['RA', 'RI', 'RB'].map((code) => ({ code, values: { scenario_status: 'not_evaluated:needs_user_input:existing_storeys', building_class: 'detached_house' }, disclosures: ['existing_storeys_needed', 'existing_low_confidence'] })),
    offers: [{ offer_id: 'sample-offer-1', placement_key: 'detail_footer', slot_index: 0, disclosure_label: 'Sponsored', advertiser_name: 'Example Design Studio (sample)', title: 'Plan your houseplex', body: 'Sample creative for the prototype.', image_url: null, cta_label: 'Learn more', cta_url: null, targeting_context: { scenario: 'detached_houseplex', building_class: 'detached_house', zone_class: 'RM', has_suite: false, renovation: false } }],
  },
];
const decl = {
  $schema: './report-v2.decl.schema.json',
  $comment: 'THE single declaration of the MaxBLD lot report v2 (sections → fields, each with exactly one source). Input of scripts/analysis/report-schema.mjs (--check validates gates RS-0..RS-11 and output drift; --write renders docs/reference/maxbld-report-v2-*). GENERATED by scripts/surfaces/_schema/seed-report-v2.mjs --write from report-v2-seed/ (the reviewed proposal + the operator ruling export); change the seed rules or inputs, never this file by hand, and never the generated outputs. SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HM (drafted as R-RS; operator CHAT-4, 2026-10-20: one field declaration per report surface, one source per field, a --check generator, generated outputs; docs/reports/decisions/2026-10-20-chat-batch-a.json, 2026-10-20-chat-batch-a#CHAT-4), docs/specs/02-web-admin/128_surface_standard_policy.md R-21 (one descriptor set, three renderers), R-27 (one home, generated tables), R-17 (SLOT disclosure); docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (closed disclosure codes).',
  version: 1,
  provenance: { seed: 'scripts/surfaces/_schema/seed-report-v2.mjs', proposal: { path: 'scripts/surfaces/_schema/report-v2-seed/schema-v2-proposal.json', version: P.version, sha256_16: sha(proposalText) }, review: 'scratchpad/report-review/REVIEW.md §6', seeded: '2026-10-20' },
  inputs: {
    lineage: 'docs/reference/maxbld-field-lineage.json',
    spec78: 'docs/specs/01-pipeline/78_optimal_lot_configuration.md',
    consumer_descriptor: 'scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json',
    consumer_lookup: 'src/lib/parcels/consumer-lookup.ts',
    presentation: 'scripts/surfaces/_schema/report-presentation.json',
    rulings: 'scripts/surfaces/_schema/report-v2.rulings.json',
  },
  outputs: {
    markdown: 'docs/reference/maxbld-report-v2-schema.md',
    json_schema: 'docs/reference/maxbld-report-v2.schema.json',
    types: 'docs/reference/maxbld-report-v2.types.ts',
    sample: 'docs/reference/maxbld-report-v2.sample.json',
    lineage_queue: 'docs/reference/report-v2-lineage-queue.json',
  },
  spec_owed: {
    N11: 'PLAN §5 N11 consumer API payload (R-10 Spec 100 amendment: the scenarios block assembled server-side)',
    'APP-RENO': 'companion spec APP-RENO (REVIEW §7.1): owner input, storage, consent, recompute',
    'S-072-derivation': 'a deriving spec for "new CoA ruling nearby" (window, radius); RF-2 / RF-6 today',
    spec88: 'Spec 88 cost lane (Q-11): per-scenario cost — each card prices its own floor area with the existing rates, after the scenario step exists',
  },
  proposed_disclosures: [],
  cards,
  sections: out,
  not_in_report,
  samples: SAMPLES,
};
outFiles['report-v2.decl.json'] = `${JSON.stringify(decl, null, 2)}\n`;
outFiles['report-v2.rulings.json'] = `${JSON.stringify(rulings, null, 2)}\n`;

// ---------------------------------------------------------------- presentation registry
const titleOf = (c) => c.title.replace(/ \(only where[^)]*\)/, '').replace(/ — 4 units \/ 6 units \(label by eligibility\)/, ' — {dwelling_units} units');
const NB = ['D', '2', 'H'];
const RENO = P.cards.filter((c) => c.code.startsWith('R')).map((c) => c.code);
const assets = [];
const VIEWS = [['street', 'from the street'], ['rear', 'from the rear yard'], ['section', 'cut-away']];
for (const sc of NB) for (const roof of ['flat_setback', 'pitched_attic']) for (const suite of ['none', 'garden', 'laneway']) {
  const key = `${sc}|${roof}|${suite}|detached`;
  for (const [view, vt] of VIEWS) assets.push({ key, view, asset_id: `illus_${sc === '2' ? 'suite2' : sc.toLowerCase()}_${roof}_${suite}_${view}`, file: null, alt: `${titleOf(P.cards.find((c) => c.code === sc))}, ${roof === 'flat_setback' ? 'flat roof with a set-back top storey' : 'pitched roof with an attic'}${suite === 'none' ? '' : `, with a ${suite} suite`}, ${vt}`, caption: 'Illustrative — not this lot' });
}
for (const sc of RENO) for (const form of ['detached', 'semi_half']) {
  for (const [view, vt] of VIEWS) assets.push({ key: `${sc}|any|none|${form}`, view, asset_id: `illus_${sc.toLowerCase()}_${form}_${view}`, file: null, alt: `${titleOf(P.cards.find((c) => c.code === sc))}${form === 'semi_half' ? ' on half of a semi-detached house' : ''}, ${vt}`, caption: 'Illustrative — not this lot' });
}
const pres = {
  $comment: 'Presentation registry of the MaxBLD lot report v2: everything a field with source `presentation:<key>` reads (labels, plain-words maps, formats, states, illustrations, Street View block, ad placements). Not lot data. Checked both ways by scripts/analysis/report-schema.mjs RS-4 (every key referenced by report-v2.decl.json, every reference resolves). Rulings cited by Q-id from scripts/surfaces/_schema/report-v2.rulings.json.',
  version: 1,
  display_label: {
    note: 'card titles by scenario code; {dwelling_units} filled from the card (H is 4 or 6, gap 1)',
    by_code: Object.fromEntries(P.cards.map((c) => [c.code, titleOf(c)])),
  },
  zone_class_label: { R: 'Residential', RD: 'Residential Detached', RS: 'Residential Semi-Detached', RT: 'Residential Townhouse', RM: 'Residential Multiple Dwelling' },
  trust_label: { high: 'By-law derived', disclosed: 'By-law derived, see notes', low: 'Estimate', not_evaluated: 'Not evaluated', precedent_estimate: 'Precedent estimate (Committee of Adjustment), not law' },
  status_text: {
    permitted: 'Allowed as of right.',
    not_permitted: 'Not allowed in this zone ({clause}).',
    not_buildable: 'Allowed, but nothing fits on this lot as of right.',
    not_applicable: 'Does not apply to this lot.',
    'not_evaluated:exception_not_authored': 'A site-specific exception applies; not yet evaluated.',
    'not_evaluated:no_existing_house': 'There is no existing house on this lot to renovate.',
    'not_evaluated:needs_user_input:existing_storeys': 'Enter the number of storeys of your house to see this result.',
    'not_evaluated:needs_user_input:semi_lot': 'This lot looks like half of a semi-detached house. Enter your house details to see renovation options.',
    'not_evaluated:coa_factor_unfitted': 'Not enough past Committee of Adjustment builds of this form to estimate.',
    'not_evaluated:coa_factor_unfitted:suite': 'Not enough past Committee of Adjustment rear-suite builds to estimate (Q-4: calibrating).',
  },
  field_trust: { generated_from: 'lineage.trust_tier', note: 'emitted per lineage field by the generator into the JSON Schema; never hand-listed' },
  disclosure_texts: { generated_from: 'spec78.P5.12', note: 'code → {template, slots, importance, mandatory} parsed from Spec 78 P5.12 by the generator; filled server-side from disclosure_params', importance_default: 'normal' },
  formats: {
    area_unit: { default: 'm²', options: ['m²', 'ft²'], note: 'today the screen mixes formatSqm (lot) and formatSqft (GFA), [parcelId].tsx:128-130' },
    area: { formatter: 'formatSqm', alt_formatter: 'formatSqft', file: 'mobile/src/lib/parcelCostFormat.ts' },
    length: { formatter: null, pattern: '{v} m', note: 'no formatter yet' },
    fsi: { formatter: 'formatFsi', file: 'mobile/src/lib/parcelCostFormat.ts' },
    currency: { formatter: 'formatCurrency', file: 'mobile/src/lib/parcelCostFormat.ts' },
    percent: { formatter: null, pattern: '{v} %', note: 'no formatter yet' },
  },
  cost_basis_label: { helper: 'maxBuildBasisLabel', file: 'mobile/src/lib/parcelCostFormat.ts', note: 'Spec 100 §2.4 "maximum envelope" fallback' },
  states: {
    hidden: ['not_permitted', 'not_applicable', 'not_buildable'],
    shown: ['permitted', 'not_evaluated'],
    null_value: '—',
    semi_needs_input: 'This lot looks like half of a semi-detached house. Tell us about your house to see what you can add.',
    semi_correction: "This isn't a semi — it's detached",
    note: 'Spec 78 §6.6 rules 1, 5, 8: hidden states are counted, never shown as cards; null renders "—", never 0 or "no"',
  },
  lot_form_rules: {
    rulings: ['Q-1', 'Q-2', 'Q-3'],
    semi_half: {
      show_card_kinds: ['renovation'],
      headline: null,
      headline_closed_reason: 'not_evaluated:needs_user_input:semi_lot',
      suite_add_on: false,
      existing_estimates: 'hidden',
      renovation_cards: 'require_owner_input',
      prompt: 'semi_needs_input',
      correction: { prompt: 'semi_correction', field: 'scenarios.lot_form.lot_form_user_override', value: 'detached', effect: 'lot_form_effective = detached → the full report' },
    },
    detached: { show_card_kinds: ['new_build', 'renovation'], headline: 'the is_headline row', suite_add_on: true, existing_estimates: 'shown' },
    note: 'O-12: the pipeline never reads the override; the app applies it through the P5.7 shared pure function',
  },
  sponsored_label: 'Sponsored',
  comparable_family_by_scenario: {
    ruling: 'Q-5',
    note: 'Q-5 (decided): same-form comparables are a read-time filter of parcel.neighbourhood.comparableBuilds by structure_family (values from scripts/lib/build-norms.js:72-80: detached · townhouse · multiplex; semis group as detached). No new stored field (LC-51 holds).',
    map: { D: 'detached', 2: 'detached', H: 'multiplex', S: 'multiplex' },
  },
  ad_placements: {
    rulings: ['Q-7', 'Q-8'],
    container: 'offers',
    top_level: true,
    first_party: true,
    never_inside_card: true,
    targeting_from: ['scenario', 'building_class', 'zone_class', 'has_suite', 'renovation'],
    targeting_excludes: 'user identity (targeting runs server-side on the lot / scenario context only)',
    note: 'Q-7 (decided; operator: "This will be targeted ads from us"): first-party targeted ads, a separate top-level offers[] list, never inside parcel.* (Spec 100 §2.1). Q-8 (decided): two slots — after the scenario cards (detail_footer) and in the renovation section; never inside a card; always labelled Sponsored. Placement home is the placements table (Spec 128 R-34 (i)); this list is what projects into it. Disclosure: Spec 128 R-17 (FAIL) + R-34 (ii) blocking.',
    placements: [
      { key: 'detail_footer', position: 'after the scenario cards', declared_on: 'scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json offers', max_slots: 1, targeting: ['scenario', 'building_class', 'zone_class', 'has_suite'], disclosure: { label: 'Sponsored', check_id: 'parceldetail_offers_disclosure', severity: 'FAIL', blocking: true } },
      { key: 'renovation_section', position: 'in the renovation section', declared_on: null, max_slots: 1, targeting: ['building_class', 'renovation'], disclosure: { label: 'Sponsored', check_id: 'report_renovation_offers_disclosure', severity: 'FAIL', blocking: true } },
    ],
  },
  street_view: {
    ruling: 'Q-9',
    owed: "re-check Google Maps Platform current pricing and terms before a spec cites them (the only analysis is archived Spec 74:164-176)",
    status: ['available', 'no_imagery', 'disabled', 'quota'],
    fields: ['status', 'pano_id', 'heading_deg', 'pitch_deg', 'fov_deg', 'image_url', 'captured_at', 'attribution'],
    attribution_template: 'Photo: Google, {captured_at}',
    caption: 'Street View photo — illustrative only',
    rules: ['fetched server-side: panorama metadata lookup nearest the centroid, heading = bearing pano → lot, signed URL', 'never store image bytes (cache pano_id only)', 'always show attribution and imagery date; never crop the in-image logo', 'never used as a data input (storeys are owner input only, O-13)', 'kill switch + per-user cap (usage_events)'],
    placement: 'renovation section first, identity header',
  },
  illustrations: {
    ruling: 'Q-10',
    key_order: ['scenario', 'roof_form_headline', 'suite_type', 'lot_form'],
    caption_default: 'Illustrative — not this lot',
    per_card: 'all assets with the card key, in view order (a small carousel)',
    views: VIEWS.map(([v]) => v),
    note: 'Q-10 (decided; operator: "Each scenario shown will have a few different photos with it"): several static illustrations per card. No new-build or suite variant on a semi_half lot (Q-1/Q-3 decided): those cards are never shown there; renovation diagrams keep a semi variant. file: null = not drawn yet',
    assets,
  },
};
outFiles['report-presentation.json'] = `${JSON.stringify(pres, null, 2)}\n`;
const drift = [];
for (const [name, text] of Object.entries(outFiles)) {
  const abs = path.join(HERE, name);
  if (mode === 'write') fs.writeFileSync(abs, text);
  else if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf8') !== text) drift.push(name);
}
if (mode === 'write') { for (const l of log) console.log(`  ${l}`); console.log(`seed-report-v2 wrote ${Object.keys(outFiles).length} files; presentation: ${Object.keys(pres).length - 2} keys, ${assets.length} illustration assets`); }
else if (drift.length) { console.error(`seed-report-v2 DRIFT: ${drift.join(', ')} — rerun with --write`); process.exitCode = 1; }
else console.log('seed-report-v2 current (decl, presentation, rulings reproduce from report-v2-seed/)');
}
