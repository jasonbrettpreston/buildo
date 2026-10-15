#!/usr/bin/env node
// McBylaw named addresses → address_points → parcel — READ-ONLY resolution runner (phase2-plan-v2 P2-8.0(a)).
// Plan: .cursor/mcbylaw/named-addr-plan.md. Reads every keyer-A shard unit with `applies_to.part = named_addresses`
// (this tree's committed shards + any --extra tree's drafts, e.g. the W1 keying worktree), parses refs and citations
// with the PURE named-addresses.mjs, then resolves the parsed addresses inside ONE `BEGIN READ ONLY` transaction
// (SELECT on address_points, parcel_address_points, parcels). Analysis tool: no pipeline step, no DB write, no draft
// or adjudications.json change. Writes resolution-<label>.json, summary-<label>.md and precision-sample-<label>.json.
// The precision sample is drawn here and NOT read by its author (Spec 129 §7 rule: a seat other than the author).
//
// Usage (local dev DB, explicit target; never reads .env):
//   PG_HOST=127.0.0.1 PG_PORT=54322 PG_DATABASE=postgres node scripts/analysis/bylaw/named-addresses-run.mjs \
//     --extra C:/Users/User/Buildo-wt-mcbylaw-p2 --label W1 [--out .cursor/mcbylaw/named-addr]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  NAMED_ADDR_VERSION, MATCH_STATUS, MATCH_REASONS, parseNamedRef, splitCitations, historicalQualifier, cityStreet,
  classifyItem, worst, drawSample,
} from './named-addresses.mjs';

const require = createRequire(import.meta.url);
const { createResolvedPool } = require('../../lib/resolve-db.js');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const extras = args.flatMap((a, i) => (a === '--extra' ? [args[i + 1]] : []));
const LABEL = arg('--label', 'W1');
const OUT = arg('--out', '.cursor/mcbylaw/named-addr');
// pre-registered in the plan before the draw (named-addr-plan.md "Precision bound")
const SEED = 'named-addr-W1|p2-8.0a|2026-10-14';
const SAMPLE_N = 50;
const PRECISION_BOUND = 0.95;
const ZONE_BY_K = { 2: 'R', 3: 'RD', 4: 'RS', 5: 'RT', 6: 'RM' }; // Spec 68 §6: 900.<k>.10, k = 2..6

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lf = (b) => Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function loadUnits() {
  const seen = new Map(); // rel path → abs (this tree wins over --extra)
  for (const root of [ROOT, ...extras]) {
    const base = path.join(root, 'scripts/seeds/bylaw/authored');
    for (const d of fs.readdirSync(base).sort(cmpStr)) {
      const dir = path.join(base, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir).sort(cmpStr)) {
        if (!f.endsWith('.a.json')) continue; // keyer A: the authored side (keyer B drafts often omit refs)
        const rel = `${d}/${f}`;
        if (!seen.has(rel)) seen.set(rel, { abs: path.join(dir, f), origin: root === ROOT ? 'committed' : 'extra' });
      }
    }
  }
  const h = crypto.createHash('sha256');
  const units = [];
  for (const rel of [...seen.keys()].sort(cmpStr)) {
    const { abs, origin } = seen.get(rel);
    const bytes = lf(fs.readFileSync(abs));
    h.update(`${rel}\n`).update(bytes);
    for (const u of JSON.parse(bytes.toString('utf8')).units ?? []) {
      if (u.applies_to?.part !== 'named_addresses') continue;
      units.push({ shard: rel, origin, unit: u });
    }
  }
  return { units, shards: seen.size, sha256: h.digest('hex'), extras_shards: [...seen.values()].filter((v) => v.origin === 'extra').length };
}

const SQL_STREETS = `SELECT DISTINCT linear_name_full, linear_name_normalized FROM address_points
WHERE retired_at IS NULL AND linear_name_full IS NOT NULL ORDER BY linear_name_full`;
const SQL_POINTS = `SELECT ap.address_point_id, ap.linear_name_full, ap.addr_num_normalized, ap.address_class_desc, pap.parcel_id
FROM address_points ap LEFT JOIN parcel_address_points pap ON pap.address_point_id = ap.address_point_id
WHERE ap.retired_at IS NULL AND ap.linear_name_full = ANY($1) ORDER BY ap.address_point_id, pap.parcel_id`;
const SQL_PARCELS = `SELECT id, exception_number, zoning_class, address_number, linear_name_full,
  centroid_lat::float8 AS centroid_lat, centroid_lng::float8 AS centroid_lng FROM parcels WHERE id = ANY($1) ORDER BY id`;
const SQL_PARCEL_ADDR = `SELECT pap.parcel_id, ap.address_full FROM parcel_address_points pap
JOIN address_points ap ON ap.address_point_id = pap.address_point_id
WHERE pap.parcel_id = ANY($1) AND ap.retired_at IS NULL ORDER BY pap.parcel_id, ap.address_full`;

async function withReadOnly(fn) {
  const pool = createResolvedPool({ label: 'named-addr' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

function candidateStreets(addr, byFull, byKey) {
  const t1 = byFull.get(addr.city_full);
  if (t1) return { tier: 'full_name', names: [t1] };
  const keyed = addr.street_key ? byKey.get(addr.street_key) ?? [] : [];
  if (keyed.length === 0) return { tier: 'none', names: [] };
  const sameType = addr.street_type ? keyed.filter((n) => cityStreet(n)?.street_type === addr.street_type) : [];
  return { tier: 'shared_key', names: sameType.length ? sameType : keyed };
}

function exceptionOf(unitId) {
  const ex = String(unitId).split('#')[0];
  const m = /^900\.([2-6])\.10\((\d+)\)(?:@.+)?$/.exec(ex); // "@<by-law>" = an enacting-by-law shard
  return { exception_id: ex, exception_number: m ? Number(m[2]) : null, zone: m ? ZONE_BY_K[m[1]] : null };
}

async function main() {
  const { units, shards, sha256, extras_shards } = loadUnits();
  // parse (pure)
  const recs = units.map(({ shard, origin, unit }) => {
    const refs = Array.isArray(unit.applies_to.refs) ? unit.applies_to.refs : [];
    const hq = historicalQualifier(unit.calculation_handling?.description ?? '');
    const cit = unit.instrument && typeof unit.instrument === 'object' && unit.instrument.citation ? splitCitations(unit.instrument.citation) : null;
    return {
      shard, origin, unit_id: unit.unit_id, archetype: unit.archetype, ...exceptionOf(unit.unit_id),
      refs: refs.map((r) => ({ ...parseNamedRef(r), ...(hq && !parseNamedRef(r).historical_qualifier ? { historical_qualifier: hq } : {}) })),
      citations: cit,
    };
  });
  // One keying per exception: where an --extra (W1) shard keys an exception, its units are the view and the
  // committed units of that exception are kept in the output flagged `superseded_by_extra` and left out of counts.
  const keyedInExtra = new Set(recs.filter((r) => r.origin === 'extra').map((r) => r.exception_id));
  for (const r of recs) r.superseded_by_extra = r.origin === 'committed' && keyedInExtra.has(r.exception_id);
  const allAddrs = recs.flatMap((r) => r.refs.flatMap((p) => p.addresses));

  const db = await withReadOnly(async (client) => {
    const name = (await client.query('SELECT current_database() AS db')).rows[0].db;
    const streets = (await client.query(SQL_STREETS)).rows;
    const byFull = new Map();
    const byKey = new Map();
    for (const s of streets) {
      byFull.set(s.linear_name_full.toUpperCase(), s.linear_name_full);
      if (s.linear_name_normalized) {
        if (!byKey.has(s.linear_name_normalized)) byKey.set(s.linear_name_normalized, []);
        byKey.get(s.linear_name_normalized).push(s.linear_name_full);
      }
    }
    const cand = new Map();
    for (const a of allAddrs) if (!cand.has(a.city_full + '|' + a.street_key)) cand.set(a.city_full + '|' + a.street_key, candidateStreets(a, byFull, byKey));
    const names = [...new Set([...cand.values()].flatMap((c) => c.names))].sort(cmpStr);
    const points = (await client.query(SQL_POINTS, [names])).rows;
    return { name, street_count: streets.length, cand, points };
  });

  // classify (pure, over the fetched points)
  const pointsByStreet = new Map();
  for (const p of db.points) {
    if (!pointsByStreet.has(p.linear_name_full)) pointsByStreet.set(p.linear_name_full, []);
    pointsByStreet.get(p.linear_name_full).push(p);
  }
  for (const r of recs) {
    for (const p of r.refs) {
      p.items = p.addresses.map((a) => {
        const c = db.cand.get(a.city_full + '|' + a.street_key);
        if (c.names.length === 0) return { match_status: 'not_found', reasons: ['no_street'], street_tier: 'none', parcels: [], streets: [], members_found: 0 };
        const pts = c.names.flatMap((n) => pointsByStreet.get(n) ?? []);
        const res = { ...classifyItem(a, pts), street_tier: c.tier };
        // diagnostic only (never changes the status): the same house number with another suffix exists ("99" vs 99A/99B)
        if (res.match_status === 'not_found' && a.key) {
          const near = [...new Set(pts.filter((q) => q.addr_num_normalized !== a.key && Number.parseInt(q.addr_num_normalized, 10) === a.number).map((q) => q.addr_num_normalized))].sort(cmpStr);
          if (near.length) res.near_keys = near;
        }
        return res;
      });
    }
    const statuses = r.refs.flatMap((p) => (p.status === 'unparsed' ? ['not_found'] : p.items.map((i) => i.match_status)));
    r.match_status = r.refs.length === 0 ? 'not_found' : worst(statuses);
    r.match_reasons = r.refs.length === 0 ? ['no_refs'] : [...new Set(r.refs.flatMap((p) => (p.status === 'unparsed' ? ['unparsed_ref'] : p.items.flatMap((i) => i.reasons))))].sort(cmpStr);
    r.parcels = [...new Set(r.refs.flatMap((p) => (p.items ?? []).filter((i) => i.match_status === 'exact' || i.match_status === 'range_partial').flatMap((i) => i.parcels)))].sort((a, b) => a - b);
  }

  // parcels touched + proxy (exception_number equality; reported, never decides)
  const view = recs.filter((r) => !r.superseded_by_extra);
  const parcelIds = [...new Set(view.flatMap((r) => r.parcels))].sort((a, b) => a - b);
  const sampleSeedItems = [];
  for (const r of view) for (const p of r.refs) for (let k = 0; k < (p.items ?? []).length; k += 1) {
    const i = p.items[k];
    if (i.match_status !== 'exact') continue;
    const a = p.addresses[k];
    for (const pid of i.parcels) sampleSeedItems.push({ sample_id: `${r.exception_id}|${a.city_full}|${a.key ?? `${a.range.from_key}-${a.range.to_key}`}|${pid}`, exception_id: r.exception_id, unit_id: r.unit_id, raw: p.raw, address: a.key ? `${a.key} ${a.city_full}` : `${a.range.from_key}-${a.range.to_key} (${a.range.parity}) ${a.city_full}`, parcel_id: pid });
  }
  const dedup = new Map();
  for (const s of sampleSeedItems) {
    if (!dedup.has(s.sample_id)) dedup.set(s.sample_id, { ...s, unit_ids: [s.unit_id] });
    else dedup.get(s.sample_id).unit_ids.push(s.unit_id);
  }
  const population = [...dedup.values()].sort((a, b) => cmpStr(a.sample_id, b.sample_id));
  const sample = drawSample(population, SEED, SAMPLE_N, sha);

  const extra = await withReadOnly(async (client) => {
    const allIds = [...new Set([...parcelIds, ...population.map((s) => s.parcel_id)])].sort((a, b) => a - b);
    const parcels = (await client.query(SQL_PARCELS, [allIds])).rows;
    const addrs = (await client.query(SQL_PARCEL_ADDR, [sample.map((s) => s.parcel_id)])).rows;
    return { parcels, addrs };
  });
  const parcelById = new Map(extra.parcels.map((p) => [p.id, p]));

  // per exception
  const exMap = new Map();
  for (const r of view) {
    if (!exMap.has(r.exception_id)) exMap.set(r.exception_id, { exception_id: r.exception_id, zone: r.zone, exception_number: r.exception_number, units: 0, by_status: Object.fromEntries(MATCH_STATUS.map((s) => [s, 0])), parcels: new Set() });
    const e = exMap.get(r.exception_id);
    e.units += 1;
    e.by_status[r.match_status] += 1;
    for (const p of r.parcels) e.parcels.add(p);
  }
  const exceptions = [...exMap.values()].sort((a, b) => cmpStr(a.exception_id, b.exception_id)).map((e) => {
    const ps = [...e.parcels].sort((a, b) => a - b);
    const sameEx = ps.filter((id) => parcelById.get(id)?.exception_number === e.exception_number).length;
    return { ...e, parcels: ps, parcel_count: ps.length, proxy_parcels_with_same_exception_number: sameEx };
  });

  // counts
  const items = view.flatMap((r) => r.refs.flatMap((p) => p.items ?? []));
  const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const refsAll = view.flatMap((r) => r.refs);
  const proxyItems = items.filter((i) => i.match_status === 'exact');
  const summary = {
    units: view.length,
    units_superseded_by_extra: recs.length - view.length,
    units_by_origin: count(view, (r) => r.origin),
    units_without_refs: view.filter((r) => r.refs.length === 0).length,
    refs: refsAll.length,
    refs_by_parse_status: count(refsAll, (p) => p.status),
    addresses: items.length,
    items_by_match_status: { ...Object.fromEntries(MATCH_STATUS.map((s) => [s, 0])), ...count(items, (i) => i.match_status) },
    items_by_reason: count(items.flatMap((i) => (i.reasons.length ? i.reasons : ['none'])), (x) => x),
    items_by_street_tier: count(items, (i) => i.street_tier),
    units_by_match_status: { ...Object.fromEntries(MATCH_STATUS.map((s) => [s, 0])), ...count(view, (r) => r.match_status) },
    units_by_reason: count(view.flatMap((r) => (r.match_reasons.length ? r.match_reasons : ['none'])), (x) => x),
    exceptions: exceptions.length,
    distinct_parcels: parcelIds.length,
    citations: { units_with_citation: view.filter((r) => r.citations).length, by_status: count(view.filter((r) => r.citations), (r) => r.citations.status), split_count: view.reduce((t, r) => t + (r.citations?.citations.length ?? 0), 0) },
    sample_population: population.length,
    exact_items: proxyItems.length,
  };

  const resolution = {
    version: NAMED_ADDR_VERSION, label: LABEL, match_status_set: MATCH_STATUS, match_reasons_set: MATCH_REASONS,
    inputs: { authored: { shards_keyer_a: shards, from_extra_trees: extras_shards, extras: extras.map((e) => path.basename(e)), sha256 }, db: { name: db.name, distinct_streets: db.street_count, points_fetched: db.points.length } },
    declared: [
      'street key = parseLinearName (Spec 54 shared normalizer) over the City spelling; tier 1 = City full name, tier 2 = shared key',
      'unstated range parity: same-parity endpoints ⇒ that side (inferred); mixed ⇒ all',
      'range member ⇔ (number, suffix) between the endpoints, "" < "A"',
      'historical_qualifier taken from the unit description text when the ref has none (keyer prose, not the by-law page)',
      'one keying per exception: an exception keyed in an --extra tree uses only those units (committed units flagged superseded_by_extra)',
      'proxy = matched parcel exception_number equals the exception number; reported, never decides',
    ],
    summary, exceptions,
    units: recs.map((r) => ({ unit_id: r.unit_id, shard: r.shard, origin: r.origin, superseded_by_extra: r.superseded_by_extra, archetype: r.archetype, exception_id: r.exception_id, match_status: r.match_status, match_reasons: r.match_reasons, parcels: r.parcels, refs: r.refs, citations: r.citations })),
  };
  const addrByParcel = new Map();
  for (const a of extra.addrs) { if (!addrByParcel.has(a.parcel_id)) addrByParcel.set(a.parcel_id, []); addrByParcel.get(a.parcel_id).push(a.address_full); }
  const samplingDoc = {
    version: NAMED_ADDR_VERSION, label: LABEL, seed: SEED, n: sample.length, population: population.length,
    population_rule: 'distinct (exception, City street, address or range, parcel) over exact items; first n by sha256(seed|sample_id)',
    bound: `precision >= ${PRECISION_BOUND} (point), Wilson 95 % lower bound reported (scorePrecision); ambiguous counts as incorrect`,
    seat_rule: 'a seat other than the plan author reads each item (raw ref + the parcel\'s own addresses + centroid) and sets verdict ∈ {correct, incorrect, ambiguous}; the author has not read this file',
    text_included: false,
    items: sample.map((s) => {
      const p = parcelById.get(s.parcel_id) ?? {};
      return { sample_id: s.sample_id, exception_id: s.exception_id, unit_ids: s.unit_ids, raw_ref: s.raw, parsed_address: s.address, parcel_id: s.parcel_id, parcel_addresses: addrByParcel.get(s.parcel_id) ?? [], parcel_stated_address: [p.address_number, p.linear_name_full].filter(Boolean).join(' ') || null, centroid: [p.centroid_lat ?? null, p.centroid_lng ?? null], verdict: null };
    }),
  };
  const proxyRate = exceptions.reduce((t, e) => t + e.proxy_parcels_with_same_exception_number, 0);
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT, `resolution-${LABEL}.json`), JSON.stringify(resolution, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, OUT, `precision-sample-${LABEL}.json`), JSON.stringify(samplingDoc, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, OUT, `summary-${LABEL}.md`), render(resolution, proxyRate));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

function render(res, proxySame) {
  const s = res.summary;
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : 'n/a');
  const L = [];
  L.push(`# Named addresses → parcels — ${res.label} (generated by \`scripts/analysis/bylaw/named-addresses-run.mjs\`; do not edit, re-run)`, '');
  L.push(`Inputs: ${res.inputs.authored.shards_keyer_a} keyer-A shards (${res.inputs.authored.from_extra_trees} from ${res.inputs.authored.extras.join(', ') || 'no extra tree'}), sha ${res.inputs.authored.sha256.slice(0, 12)}; DB \`${res.inputs.db.name}\` (${res.inputs.db.distinct_streets} City streets, ${res.inputs.db.points_fetched} points fetched); ${res.version}. Analysis only: READ ONLY transaction, no write.`, '');
  L.push('## Parse (measured)', '');
  L.push(`Units with \`part: named_addresses\` (keyer A, one keying per exception): ${s.units} ${JSON.stringify(s.units_by_origin)}; ${s.units_superseded_by_extra} committed units are superseded by the extra tree's keying of the same exception (kept in the JSON, flagged, not counted); ${s.units_without_refs} carry no \`refs\`. Refs: ${s.refs}; by parse status ${JSON.stringify(s.refs_by_parse_status)} → parsed ${pct(s.refs_by_parse_status.parsed ?? 0, s.refs)}. Addresses (items): ${s.addresses}.`, '');
  L.push(`Citations: ${s.citations.units_with_citation} units carry one; ${JSON.stringify(s.citations.by_status)}; split into ${s.citations.split_count} citations.`, '');
  L.push('## Match (measured)', '');
  L.push('| match_status | items | share | units |', '|---|---:|---:|---:|');
  for (const k of res.match_status_set) L.push(`| ${k} | ${s.items_by_match_status[k]} | ${pct(s.items_by_match_status[k], s.addresses)} | ${s.units_by_match_status[k]} |`);
  L.push('', `Item reasons: ${JSON.stringify(s.items_by_reason)}. Unit reasons: ${JSON.stringify(s.units_by_reason)}. Street tier: ${JSON.stringify(s.items_by_street_tier)}.`, '');
  L.push(`**Distinct parcels covered** (exact + range_partial): ${s.distinct_parcels} over ${s.exceptions} exceptions. Proxy (declared, never decides): ${proxySame} of the per-exception parcel links carry the same \`exception_number\` as their exception.`, '');
  L.push('## Per exception', '', '| exception | zone | units | exact | range_partial | ambiguous | not_found | parcels | proxy same-exception |', '|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const e of res.exceptions) L.push(`| ${e.exception_id} | ${e.zone ?? ''} | ${e.units} | ${e.by_status.exact} | ${e.by_status.range_partial} | ${e.by_status.ambiguous} | ${e.by_status.not_found} | ${e.parcel_count} | ${e.proxy_parcels_with_same_exception_number} |`);
  L.push('', '## Not parsed / not found (each with its reason)', '');
  for (const u of res.units.filter((x) => !x.superseded_by_extra)) {
    for (const [k, p] of u.refs.entries()) {
      if (p.status !== 'parsed') L.push(`- \`${u.unit_id}\` ref ${k}: ${p.status} (${p.reasons.join(', ')}) — ${JSON.stringify(p.raw)}`);
      for (const [j, it] of (p.items ?? []).entries()) {
        if (it.match_status === 'not_found' || it.match_status === 'ambiguous') {
          const a = p.addresses[j];
          L.push(`- \`${u.unit_id}\`: ${it.match_status} (${it.reasons.join(', ')}) — ${a.key ?? `${a.range.from_key}-${a.range.to_key}/${a.range.parity}`} ${a.city_full}${it.streets.length ? ` [streets: ${it.streets.join(' · ')}]` : ''}${it.match_status === 'ambiguous' ? ` parcels ${it.parcels.length}` : ''}${it.near_keys ? ` (same number, other suffix: ${it.near_keys.join(', ')})` : ''}`);
        }
      }
    }
    if (u.refs.length === 0) L.push(`- \`${u.unit_id}\`: not_found (no_refs)`);
  }
  L.push('', `Declared-only: ${res.declared.join(' · ')}.`, '');
  L.push(`Precision sample: \`precision-sample-${res.label}.json\` (n = ${Math.min(SAMPLE_N, s.sample_population)} of ${s.sample_population}, seed \`${SEED}\`), bound precision ≥ ${PRECISION_BOUND} + Wilson 95 % lower bound; NOT read by the author.`, '');
  return L.join('\n');
}

await main();
