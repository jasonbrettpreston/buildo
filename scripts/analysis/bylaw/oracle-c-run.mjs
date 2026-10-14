#!/usr/bin/env node
// McBylaw oracle C round runner — READ-ONLY. Reads the Phase 1 table (bylaw-provisions.json + authored shards +
// adjudications.json + amendments.json + vocab.json) and the active coa_notice_variances rows, plus (round 2) the
// Spec 129 D7 parcel link and the linked parcel's existing lot columns — all inside one READ ONLY transaction — runs the
// pure comparison (oracle-c.mjs) and writes the round record + a rendered summary.
// Report-only (plan R-H): no DB write, no pipeline step. Plan: .cursor/mcbylaw/oracle-c-harness-plan.md.
//
// Usage (local dev DB, explicit target; never reads .env):
//   PG_HOST=127.0.0.1 PG_PORT=54322 PG_DATABASE=postgres node scripts/analysis/bylaw/oracle-c-run.mjs [--round 2] [--out .cursor/mcbylaw/oracle-c]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  ORACLE_C_VERSION, REASONS, PROPOSED_REASONS, REASONS_NOT_RUN, ADJ_KINDS, TOLERANCE, BAND_MARGIN, LOT_INPUTS_UNAVAILABLE,
  buildTable, compareItem, summarize, endTagCensus,
} from './oracle-c.mjs';

const require = createRequire(import.meta.url);
const { createResolvedPool } = require('../../lib/resolve-db.js');
const { parseZoningDesignation, classifyZoneLink } = require('../../lib/coa-zoning-designation.js');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ROUND = arg('--round', '2');
const OUT = arg('--out', '.cursor/mcbylaw/oracle-c');
// pre-registration per round: sha256 of the LF-normalized file, recorded in the plan before the round first ran
const PREREG = { 2: { path: '.cursor/mcbylaw/oracle-c/prereg-round-2.txt', sha256: '9901a493b3237dc01115580e2abf604f3fe761bc6a10f7a91bf4aa4c7695ba1c' } };
const LAW_TEXT_SALT = 'oracle-c-law-text-sample-r2';
const lf = (b) => Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const readJson = (rel) => { const b = fs.readFileSync(path.join(ROOT, rel)); return { json: JSON.parse(b.toString('utf8')), sha256: sha(lf(b)) }; };
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function loadShards() {
  const base = path.join(ROOT, 'scripts/seeds/bylaw/authored');
  const shards = new Map();
  const h = crypto.createHash('sha256');
  for (const page of fs.readdirSync(base).sort(cmpStr)) {
    const dir = path.join(base, page);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).sort(cmpStr)) {
      const m = /^(.+)\.(a|b)\.json$/.exec(f);
      if (!m) continue;
      const key = `${page}/${m[1]}`;
      if (!shards.has(key)) shards.set(key, { key, a: null, b: null });
      const bytes = lf(fs.readFileSync(path.join(dir, f)));
      h.update(`${page}/${f}\n`).update(bytes);
      shards.get(key)[m[2]] = JSON.parse(bytes.toString('utf8'));
    }
  }
  return { shards: [...shards.values()], sha256: h.digest('hex') };
}

const SQL = `SELECT variance_key, application_number, item_ordinal, hearing_date::text AS hearing_date, decision, cited_bylaw,
  citation_kind, regulation_id_as_cited, exception_ref, zoning_as_stated, target, target_status, bound,
  required_value::float8 AS required_value, required_unit, parse_status, parse_confidence, qualified,
  extractor_version, vocab_version
FROM coa_notice_variances WHERE retired_at IS NULL ORDER BY variance_key`;
const SQL_LINK = `SELECT c.application_number, count(lp.parcel_id)::int AS n, min(lp.parcel_id) AS parcel_id
FROM coa_applications c LEFT JOIN lead_parcels lp ON lp.lead_id = c.lead_id
WHERE c.application_number = ANY($1) GROUP BY c.application_number ORDER BY c.application_number`;
const SQL_PARCEL = `SELECT id, frontage_m::float8 AS frontage_m, depth_m::float8 AS depth_m, lot_size_sqm::float8 AS lot_size_sqm,
  is_corner_lot, zoning_zn_string FROM parcels WHERE id = ANY($1) ORDER BY id`;

async function readDb() {
  const pool = createResolvedPool({ label: 'oracle-c' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const db = (await client.query('SELECT current_database() AS db')).rows[0].db;
    const rows = (await client.query(SQL)).rows;
    const apps = [...new Set(rows.map((r) => r.application_number))].sort(cmpStr);
    const links = (await client.query(SQL_LINK, [apps])).rows;
    const ids = links.filter((l) => l.n === 1).map((l) => l.parcel_id);
    const parcels = (await client.query(SQL_PARCEL, [ids])).rows;
    await client.query('COMMIT');
    return { db, rows, links, parcels };
  } finally {
    client.release();
    await pool.end();
  }
}

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)} %`);

/** Chapter family of a regulation id (law-text sample strata). */
function family(id) {
  const m = String(id).split(/[.(#@~]/);
  return m[0] === '10' ? `10.${m[1]}` : m[0];
}

/**
 * Law-text sample PLAN (C-9 (c)): complete in-scope rows with a numeric statement that oracle C did not reach, stratified
 * by chapter family × whether any notice cites them. n = min(N, max(5, ceil(0.1 N)), 30) per stratum; deterministic
 * selection by sha256(salt|regulation_id). The operator reads the rows; this only lists them.
 */
function lawTextSamplePlan(table, results) {
  const reached = new Set(results.filter((r) => r.answer !== 'not_comparable').map((r) => r.regulation_id));
  const cited = new Set(results.filter((r) => r.regulation_id).map((r) => r.regulation_id));
  const strata = new Map();
  for (const row of [...table.rows.values()].sort((p, q) => cmpStr(p.regulation_id, q.regulation_id))) {
    if (row.scope !== 'in_scope' || row.row_status !== 'complete' || reached.has(row.regulation_id)) continue;
    if (!row.units.some((u) => u.statements.length)) continue;
    const key = `${family(row.regulation_id)}|${cited.has(row.regulation_id) ? 'cited_not_comparable' : 'never_cited'}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(row.regulation_id);
  }
  const out = [];
  for (const [key, ids] of [...strata.entries()].sort((p, q) => cmpStr(p[0], q[0]))) {
    const N = ids.length;
    const n = Math.min(N, Math.max(5, Math.ceil(0.1 * N)), 30);
    const pick = ids.map((id) => [sha(Buffer.from(`${LAW_TEXT_SALT}|${id}`)), id]).sort((p, q) => cmpStr(p[0], q[0])).slice(0, n).map((x) => x[1]).sort(cmpStr);
    const [fam, cite] = key.split('|');
    out.push({ stratum: key, family: fam, cited: cite, N, n, rows: pick });
  }
  return {
    salt: LAW_TEXT_SALT, rule: 'n = min(N, max(5, ceil(0.1 N)), 30) per stratum; first n by sha256(salt|regulation_id)',
    universe: 'complete in-scope rows with >= 1 numeric statement and no comparable oracle C item', strata: out,
    total_rows: out.reduce((t, x) => t + x.N, 0), total_sample: out.reduce((t, x) => t + x.n, 0),
  };
}

function render(rec) {
  const s = rec.summary;
  const w = s.comparable.wilson95;
  const cv = s.coverage;
  const L = [];
  L.push(`# Oracle C — round ${rec.round} (generated by \`scripts/analysis/bylaw/oracle-c-run.mjs\`; do not edit, re-run)`, '');
  L.push(`Inputs: table \`${rec.inputs.provisions.validated_against.adoption_id}\` (provisions sha ${rec.inputs.provisions.sha256.slice(0, 12)}, complete ${rec.inputs.provisions.row_states.complete}), authored sha ${rec.inputs.authored.sha256.slice(0, 12)} (${rec.inputs.authored.shards} shards), adjudications sha ${rec.inputs.adjudications.sha256.slice(0, 12)}, amendments sha ${rec.inputs.amendments.sha256.slice(0, 12)}; DB \`${rec.inputs.db.name}\`, ${rec.inputs.db.active_rows} active notice items, hearings ${rec.inputs.db.hearing_min}..${rec.inputs.db.hearing_max}, extractor ${rec.inputs.db.extractor_versions.join(',')}; ${rec.oracle_c_version}.`, '');
  if (rec.prereg) L.push(`Pre-registration: \`${rec.prereg.path}\` sha256 ${rec.prereg.sha256} (verified at run).`, '');
  L.push(`**Headline (measured, items):** comparable n = ${s.comparable.n} of ${s.n}; match ${s.comparable.match}, mismatch ${s.comparable.mismatch}; match rate ${pct(w && w.rate)} (Wilson 95 % ${pct(w && w.lo)} – ${pct(w && w.hi)}; items are clustered, see coverage).`, '');
  L.push(`**Coverage (always printed beside the rate):** rows reached ${cv.rows_reached} of ${cv.complete_rows} complete rows (${pct(cv.rows_share)}); unit sets ${cv.unit_sets}; the top 10 unit sets hold ${pct(cv.top10_unit_set_share)} of comparable items; rows with ≥ 1 mismatch ${cv.rows_with_mismatch}; label-derived matches ${cv.label_derived_matches}; lot-selected matches ${cv.lot_selected_matches}. Clustered zero-error bound (rule of three): < ${pct(cv.rule_of_three_rows_if_zero_table_errors)} per row, < ${pct(cv.rule_of_three_unit_sets_if_zero_table_errors)} per unit set — valid only once every mismatch is adjudicated not-table.`, '');
  L.push(`**D7 link (R2-3):** applications ${JSON.stringify(rec.link.applications)}; items ${JSON.stringify(s.link.by_status)}; zone-class proxy on uniquely linked items ${JSON.stringify(s.link.proxy)} (class agree ${pct(rec.link.proxy_agree_share)} of proxy-comparable).`, '');
  L.push(`**C-6 census (R2-2):** complete rows relying on an end-of-regulation tag ${rec.census.rows_relying} (of ${rec.census.complete_multi_leaf_rows_with_tags} complete multi-leaf rows carrying any tag); items whose D8 outcome the rule decides ${s.d8_end_tag_items}.`, '');
  L.push('Declared-only labels: ' + rec.declared.join(' · '), '');
  L.push('## Answers', '', '| answer / reason | n | proposed vocab |', '|---|---:|---|');
  L.push(`| match | ${s.by_answer.match} | |`, `| mismatch | ${s.by_answer.mismatch} | |`);
  for (const r of REASONS) {
    L.push(`| not_comparable:${r} | ${s.by_reason[r]} | ${PROPOSED_REASONS.includes(r) ? 'PROPOSED' : ''} |`);
    if (r === 'lot_input_unavailable') for (const k of LOT_INPUTS_UNAVAILABLE) if (s.by_unavailable_input[k]) L.push(`| &nbsp;&nbsp;lot_input_unavailable:${k} | ${s.by_unavailable_input[k]} | PROPOSED |`);
  }
  for (const r of REASONS_NOT_RUN) L.push(`| not_comparable:${r} | not_run | (the Layer 2 lot gate is not this harness's) |`);
  L.push('', '## Funnel (569-2013 → comparable)', '', '| stage | remaining |', '|---|---:|');
  for (const f of rec.funnel) L.push(`| ${f.stage} | ${f.remaining} |`);
  const table = (title, o) => {
    L.push('', `## ${title}`, '', '| key | match | mismatch | not_comparable | match rate (comparable) |', '|---|---:|---:|---:|---:|');
    for (const [k, v] of Object.entries(o)) { const n = v.match + v.mismatch; L.push(`| ${k} | ${v.match} | ${v.mismatch} | ${v.not_comparable} | ${n ? pct(v.match / n) : 'n/a'} |`); }
  };
  table('By target (table target when joined, else keyword target)', s.by_target);
  table('By zone class (parsed `zoning_as_stated`)', s.by_zone_class);
  table('By `qualified`', s.by_qualified);
  table('By exception_ref present', s.by_exception_ref);
  L.push('', `Keyword-target cross-check on comparable items (Spec 129 §16): ${JSON.stringify(s.keyword_target_cross_check)}.`);
  L.push(`branch_unresolved split (diagnostic, outside the headline): notice value in a table branch ${s.branch_unresolved_in_set.true}, in none ${s.branch_unresolved_in_set.false}.`);
  L.push(`Mismatch items by PROPOSED adjudication_kind: ${JSON.stringify(s.mismatch_by_proposed_kind)}.`);
  { const d = s.d8_row_level_sensitivity; L.push(`D8 sensitivity (every row tag applies, diagnostic): comparable ${d.n}, match ${d.match}, mismatch ${d.mismatch}, rate ${pct(d.wilson95 && d.wilson95.rate)} (Wilson ${pct(d.wilson95 && d.wilson95.lo)} – ${pct(d.wilson95 && d.wilson95.hi)}).`); }
  L.push('', '## Per-row clusters (every row with ≥ 1 mismatch, then the 15 largest)', '', '| row | n | match | mismatch | label matches | Wilson 95 % |', '|---|---:|---:|---:|---:|---|');
  const shown = new Set();
  const largest = [...s.clusters_by_row].sort((p, q) => q.n - p.n || cmpStr(p.regulation_id, q.regulation_id)).slice(0, 15);
  for (const c of [...s.clusters_by_row.filter((x) => x.mismatch > 0), ...largest]) {
    if (shown.has(c.regulation_id)) continue;
    shown.add(c.regulation_id);
    L.push(`| ${c.regulation_id} | ${c.n} | ${c.match} | ${c.mismatch} | ${c.label_matches} | ${pct(c.wilson95 && c.wilson95.lo)} – ${pct(c.wilson95 && c.wilson95.hi)} |`);
  }
  L.push('', '## Top mismatch clusters (unit × table value × notice value)', '', '| # | units | target | table | notice | n | apps | proposed kind | samples |', '|---:|---|---|---|---|---:|---:|---|---|');
  s.clusters.slice(0, 25).forEach((c, i) => L.push(`| ${i + 1} | ${c.unit_ids.join(', ')} | ${c.target} | ${c.table_value} | ${c.notice_value} | ${c.n} | ${c.applications} | ${c.adjudication_kind} | ${c.samples.join('<br>')} |`));
  L.push('', '## Branch gaps (branch_unresolved, notice value in no branch; candidate table gaps)', '', '| units | table branches | notice | n | samples |', '|---|---|---|---:|---|');
  s.branch_gaps.slice(0, 15).forEach((g) => L.push(`| ${g.unit_ids.join(', ')} | ${g.table_values.join(' / ')} | ${g.notice_value} | ${g.n} | ${g.samples.join('<br>')} |`));
  L.push('', `## C-6 census rows (${rec.census.rows_relying})`, '', rec.census.rows.map((r) => `${r.regulation_id} [${r.tags.join(', ')}]`).join(' · ') || '(none)');
  const p = rec.law_text_sample_plan;
  L.push('', `## Law-text sample plan (C-9 (c); the operator reads ${p.total_sample} of ${p.total_rows} unreached numeric rows)`, '', `Universe: ${p.universe}. Rule: ${p.rule}; salt \`${p.salt}\`. Row lists: \`law_text_sample_plan\` in the JSON record.`, '', '| stratum | N | n |', '|---|---:|---:|');
  for (const x of p.strata) L.push(`| ${x.stratum} | ${x.N} | ${x.n} |`);
  return `${L.join('\n')}\n`;
}

async function main() {
  let prereg = null;
  if (PREREG[ROUND]) {
    const got = sha(lf(fs.readFileSync(path.join(ROOT, PREREG[ROUND].path))));
    if (got !== PREREG[ROUND].sha256) throw new Error(`pre-registration ${PREREG[ROUND].path} sha256 ${got} != registered ${PREREG[ROUND].sha256}`);
    prereg = { path: PREREG[ROUND].path, sha256: got };
  }
  const prov = readJson('docs/reference/bylaw-provisions.json');
  const adj = readJson('scripts/seeds/bylaw/adjudications.json');
  const amd = readJson('scripts/seeds/bylaw/amendments.json');
  const voc = readJson('scripts/seeds/bylaw/vocab.json');
  const authored = loadShards();
  const table = buildTable({ provisions: prov.json, shards: authored.shards, adjudications: adj.json.adjudications, targets: voc.json.dsl_target });
  const { db, rows, links, parcels } = await readDb();
  const linkBy = new Map(links.map((l) => [l.application_number, l]));
  const parcelBy = new Map(parcels.map((p) => [p.id, p]));
  const statusOf = (l) => (!l || l.n === 0 ? 'unlinked' : l.n === 1 ? 'linked_unique' : 'ambiguous');
  const applications = { ambiguous: 0, linked_unique: 0, unlinked: 0 };
  for (const a of new Set(rows.map((r) => r.application_number))) applications[statusOf(linkBy.get(a))] += 1;
  const withLot = rows.map((r) => {
    const l = linkBy.get(r.application_number);
    const status = statusOf(l);
    if (status !== 'linked_unique') return { ...r, lot: { link_status: status }, link_proxy: null };
    const p = parcelBy.get(l.parcel_id) || {};
    return {
      ...r, link_proxy: classifyZoneLink(r.zoning_as_stated, p.zoning_zn_string),
      lot: { link_status: status, lot_frontage_m: p.frontage_m ?? null, lot_depth_m: p.depth_m ?? null, lot_area_m2: p.lot_size_sqm ?? null, corner_lot: p.is_corner_lot ?? null },
    };
  });
  const ctx = { table, statuses: amd.json.statuses, targets: voc.json.dsl_target, parseZone: parseZoningDesignation };
  const results = withLot.map((r) => compareItem(r, ctx));
  const summary = summarize(results, { complete_rows: prov.json.counts.row_states.complete });
  const pr = summary.link.proxy;
  const proxyComparable = pr.class_match + pr.class_mismatch + pr.component_mismatch_dated;
  const link = { applications, proxy_agree_share: proxyComparable ? Math.round(((pr.class_match + pr.component_mismatch_dated) / proxyComparable) * 1e6) / 1e6 : null };
  const n569 = rows.filter((r) => r.cited_bylaw === '569-2013' && r.citation_kind !== 'former_bylaw_section').length;
  // REASONS is the evaluation order, so the funnel is exact: each stage removes the items that reason claimed
  const funnel = [{ stage: 'all active items', remaining: rows.length }, { stage: 'cite 569-2013 (not a former-section form)', remaining: n569 }];
  let left = n569;
  for (const r of REASONS.slice(2)) { left -= summary.by_reason[r]; funnel.push({ stage: `minus ${r}`, remaining: left }); }
  const hearings = rows.map((r) => r.hearing_date).sort(cmpStr);
  const rec = {
    schema: 'oracle-c-round-v2', round: ROUND, oracle_c_version: ORACLE_C_VERSION, tolerance: TOLERANCE, band_margin: BAND_MARGIN, prereg,
    closed_sets: { answers: ['match', 'mismatch', 'not_comparable'], reasons: REASONS, lot_inputs_unavailable: LOT_INPUTS_UNAVAILABLE, proposed_reasons: PROPOSED_REASONS, reasons_not_run: REASONS_NOT_RUN, adjudication_kind_proposals: ADJ_KINDS },
    inputs: {
      provisions: { sha256: prov.sha256, validated_against: prov.json.validated_against, row_states: prov.json.counts.row_states },
      authored: { sha256: authored.sha256, shards: authored.shards.length },
      adjudications: { sha256: adj.sha256, n: adj.json.adjudications.length },
      amendments: { sha256: amd.sha256 }, vocab: { sha256: voc.sha256, version: voc.json.version || null },
      db: { name: db, active_rows: rows.length, hearing_min: hearings[0] || null, hearing_max: hearings[hearings.length - 1] || null,
        extractor_versions: [...new Set(rows.map((r) => r.extractor_version))].sort(cmpStr), vocab_versions: [...new Set(rows.map((r) => r.vocab_version))].sort(cmpStr),
        linked_parcels: parcels.length },
    },
    declared: [
      'untagged clauses are presumed unchanged since the 2017 hearing (Spec 129 §8) — falsified twice (cards R2-1, R2-2)',
      'the D7 link is the current lead_parcels row (lead_parcels has no retired_at column); its precision here is the zone-class proxy only (Spec 129 §12 step 5 read 47/50)',
      'lot inputs are today\'s parcel measurements, used only to select branches (R2-4), never compared',
      'a citation that pins one unit presumes that unit\'s condition, except the R2-1 cases',
      'adjudication_kind values are PROPOSALS for operator adjudication',
    ],
    link, census: endTagCensus(table), funnel, summary, law_text_sample_plan: lawTextSamplePlan(table, results),
    items: results.map((r) => Object.fromEntries(Object.keys(r).sort(cmpStr).map((k) => [k, r[k]]))),
  };
  const outDir = path.join(ROOT, OUT);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `round-${ROUND}.json`), `${JSON.stringify(rec, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, `ROUND-${ROUND}.generated.md`), render(rec));
  const w = summary.comparable.wilson95;
  console.log(`oracle C round ${ROUND}: n=${summary.n} comparable=${summary.comparable.n} match=${summary.comparable.match} mismatch=${summary.comparable.mismatch} rate=${w ? w.rate : 'n/a'} [${w ? w.lo : ''}, ${w ? w.hi : ''}] rows=${summary.coverage.rows_reached}/${summary.coverage.complete_rows}`);
}

main().catch((err) => {
  console.error(`oracle-c: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
});
