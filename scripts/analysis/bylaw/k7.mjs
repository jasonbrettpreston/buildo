// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 1 = the top 220 exceptions; membership counts
//            INHERITED lots; coverage shares use direct lots) + its dated note 2026-10-07 (operator Q-K7a: pin
//            ch900_2..6 and double-key the top 30 wave-1 exceptions before PLAN LOCKED); docs/specs/01-pipeline/
//            68_mcbylaw_standard.md §6 (Ch.900 rows `900.<k>.10(<n>)`, k = 2..6), §6 archetype INCLUDE, §10 (determinism)
//
// The K7 keying list (plan E-5): the top 30 wave-1 exceptions by INCLUDE-CLOSED residential lots (Spec 69 M-15: an
// exception's own direct lots + the direct lots of every exception that includes it, transitively, over the INCLUDE
// edges extracted from the slice; census.json backlog for the direct lots), each with the facts its keying shard needs
// - page, unit count, list-group units, INCLUDE edges, unconsolidated amendments, any City repeat-letter inside it.
// Wave 1 = the top 220 by the same count. Coverage shares use direct lots (M-15). Zones come from the slice (article
// title "Exceptions for RD Zone").
//
//   buildK7({census, slice, adoptionId, groups})  → the k7-exceptions.json document. PURE. Throws K7Error.
//   renderK7Markdown(doc)                         → the short markdown summary. PURE.
//   k7Files({root})                               → slices the committed seeds; returns {doc, json, md} (writes nothing).
//   node scripts/analysis/bylaw/k7.mjs [--write]  (--write writes both files; without it, exit 1 when either is stale)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stableStringify, writeAtomic } from './snapshot.mjs';

export const K7_VERSION = 'k7-v1';
export const WAVE1_SIZE = 220; // Spec 69 M-15: wave 1 = the top 220
export const TOP_N = 30; // operator Q-K7a 2026-10-07
export const K7_JSON_REL = 'scripts/seeds/bylaw/k7-exceptions.json';
export const K7_MD_REL = 'scripts/seeds/bylaw/k7-exceptions.md';
const EXCEPTION_ID = /^(900\.[2-6]\.10)\((\d+)\)$/; // Spec 68 §6: k = 2 R · 3 RD · 4 RS · 5 RT · 6 RM
const INCLUDE_PHRASE = /\bcomply with\b/i;

export class K7Error extends Error {}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (zone, n) => `${zone} ${n}`;
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const baseId = (id) => String(id).replace(/[~@].*$/, ''); // a status variant `~…` or an enacting amendment `@…`

/**
 * Exception rows of the slice: regulation_id → {zone, exception, page, units, groups, includes, repeats, amended_by}.
 * `groups` = the list-group keys (vocab slicer.clause_groups). Also counts every exception ref and how many are
 * INCLUDE edges (a ref from a clause saying "comply with"). PURE.
 */
export function exceptionIndex(slice, groups = []) {
  const zoneOfArticle = new Map();
  for (const r of slice.rows) {
    const m = EXCEPTION_ID.exec(baseId(r.regulation_id));
    const z = m ? /^Exceptions for (\S+) Zone$/.exec(String(r.article_title || '').trim()) : null;
    if (z) zoneOfArticle.set(m[1], z[1]);
  }
  const byId = new Map();
  const refCounts = { exception_refs: 0, include_edges: 0 };
  for (const r of slice.rows) {
    const id = baseId(r.regulation_id);
    const m = EXCEPTION_ID.exec(id);
    if (!m || !zoneOfArticle.has(m[1]) || String(r.page).startsWith('enacting:')) continue;
    const e = byId.get(id) || { amended_by: new Set(), exception: Number(m[2]), groups: {}, includes: new Set(), pages: new Set(), regulation_id: id, repeats: new Set(), rows: 0, units: 0, zone: zoneOfArticle.get(m[1]) };
    e.rows++;
    e.pages.add(r.page);
    for (const a of r.amended_by || []) e.amended_by.add(a.bylaw);
    for (const c of r.clauses) if (/~repeatd/.test(c.path)) e.repeats.add(c.path); // a City repeat-letter (Q-K7b)
    for (const ref of r.refs) {
      if (!EXCEPTION_ID.test(ref.citation) || ref.citation === id) continue;
      refCounts.exception_refs++;
      const clause = r.clauses.find((c) => c.path === ref.clause_path);
      if (clause && INCLUDE_PHRASE.test(clause.text)) {
        refCounts.include_edges++;
        e.includes.add(ref.citation);
      }
    }
    byId.set(id, e);
  }
  const groupRe = new RegExp(`\\[(${groups.map((g) => g.key).join('|') || '(?!)'})\\]`);
  for (const u of slice.units) {
    const e = byId.get(baseId(u.regulation_id));
    if (!e || String(u.page).startsWith('enacting:')) continue;
    e.units++;
    const g = groupRe.exec(u.clause_path);
    if (g) e.groups[g[1]] = (e.groups[g[1]] || 0) + 1;
  }
  return { byId, refCounts };
}

/** The k7-exceptions.json document. PURE. Throws K7Error on a census it cannot rank against. */
export function buildK7({ census, slice, adoptionId, groups = [] }) {
  if (!census || !Array.isArray(census.backlog) || !(Number(census.excepted?.lots) > 0)) throw new K7Error('census_invalid: census.json has no backlog[] or no positive excepted.lots');
  const { byId: index, refCounts } = exceptionIndex(slice, groups);
  const byZoneN = new Map([...index.values()].map((e) => [key(e.zone, e.exception), e]));
  const direct = new Map(census.backlog.map((b) => [key(b.zone, Number(b.exception_number)), Number(b.lots)]));
  const rankDirect = [...census.backlog].sort((a, b) => Number(b.lots) - Number(a.lots) || cmpStr(a.zone, b.zone) || Number(a.exception_number) - Number(b.exception_number));
  // INCLUDE-closed lots (M-15): own direct lots + the direct lots of every exception that includes it, transitively.
  const includedBy = new Map();
  for (const e of index.values()) for (const t of e.includes) includedBy.set(t, [...(includedBy.get(t) || []), e.regulation_id]);
  const lotsOf = (id) => {
    const x = index.get(id);
    return x ? direct.get(key(x.zone, x.exception)) || 0 : 0;
  };
  const closed = new Map();
  for (const e of index.values()) {
    const seen = new Set();
    const todo = [...(includedBy.get(e.regulation_id) || [])];
    while (todo.length) {
      const x = todo.pop();
      if (seen.has(x) || x === e.regulation_id) continue; // a cycle stops here
      seen.add(x);
      todo.push(...(includedBy.get(x) || []));
    }
    closed.set(e.regulation_id, lotsOf(e.regulation_id) + [...seen].reduce((s, id) => s + lotsOf(id), 0));
  }
  // Candidates (Spec 69 M-15: membership and rank by INCLUDE-closed lots): every sliced exception, plus every census
  // exception the pinned pages do not hold (no edges known: its closed lots are its direct lots). Ties: direct lots,
  // then zone, then number.
  const cands = [...index.values()].map((e) => ({ closed: closed.get(e.regulation_id), direct: lotsOf(e.regulation_id), e, exception: e.exception, zone: e.zone }));
  for (const b of census.backlog) if (!byZoneN.has(key(b.zone, Number(b.exception_number)))) cands.push({ closed: Number(b.lots), direct: Number(b.lots), e: null, exception: Number(b.exception_number), zone: b.zone });
  const ranked = cands.filter((c) => c.closed > 0).sort((a, b) => b.closed - a.closed || b.direct - a.direct || cmpStr(a.zone, b.zone) || a.exception - b.exception);
  const directRank = new Map(rankDirect.map((b, i) => [key(b.zone, Number(b.exception_number)), i + 1]));
  const wave1 = ranked.slice(0, WAVE1_SIZE);
  const top = wave1.slice(0, TOP_N);
  const missing = [];
  const exceptions = top.map((c, i) => {
    const e = c.e;
    const k = key(c.zone, c.exception);
    if (!e) {
      missing.push(k);
      return { closed_lots: c.closed, direct_lots: c.direct, direct_rank: directRank.get(k) ?? null, exception: c.exception, rank: i + 1, regulation_id: null, wave: 1, zone: c.zone };
    }
    return {
      amended_by: [...e.amended_by].sort(),
      closed_lots: c.closed,
      direct_lots: c.direct,
      direct_rank: directRank.get(k) ?? null,
      exception: e.exception,
      groups: e.groups,
      included_by_direct: (includedBy.get(e.regulation_id) || []).length,
      includes: [...e.includes].sort(),
      page: [...e.pages].sort().join(','),
      rank: i + 1,
      regulation_id: e.regulation_id,
      rows: e.rows,
      source_repeats: [...e.repeats].sort(),
      units: e.units,
      wave: 1,
      zone: c.zone,
    };
  });
  const inTop = new Set(exceptions.map((x) => x.regulation_id).filter(Boolean));
  const outside = [...new Set(exceptions.flatMap((x) => x.includes || []))].filter((id) => !inTop.has(id)).sort();
  // SC-13 "captured": an exception in the list whose INCLUDE closure (what it includes, transitively) is in the list too.
  const closureIn = (id) => {
    const seen = new Set();
    const todo = [...((index.get(id) || {}).includes || [])];
    while (todo.length) {
      const x = todo.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      todo.push(...((index.get(x) || {}).includes || []));
    }
    return [...seen].every((x) => inTop.has(x));
  };
  const sumDirect = (xs) => xs.reduce((s, c) => s + c.direct, 0);
  const share = (n) => Math.round((n / Number(census.excepted.lots)) * 1e6) / 1e6;
  const capturedLots = exceptions.filter((x) => x.regulation_id && closureIn(x.regulation_id)).reduce((s, x) => s + x.direct_lots, 0);
  const directTop = rankDirect.slice(0, TOP_N).map((b) => byZoneN.get(key(b.zone, Number(b.exception_number)))?.regulation_id ?? key(b.zone, b.exception_number));
  const censusKeys = new Set(direct.keys());
  return {
    $comment: `GENERATED by scripts/analysis/bylaw/k7.mjs --write from census.json (backlog, ${census.adoption_id}) and the live slice (${adoptionId}). Do not edit. Ranked by INCLUDE-closed residential lots (Spec 69 M-15: an exception's own direct lots + the direct lots of every exception that INCLUDEs it, transitively), ties by direct lots, zone, number; wave 1 = the top ${WAVE1_SIZE}. Coverage shares use direct lots (M-15). INCLUDE edges are extracted refs from a clause that says "comply with" (generated, not keyed).`,
    adoption_id: adoptionId,
    census: { adoption_id: census.adoption_id, current: census.adoption_id === adoptionId, excepted_lots: Number(census.excepted.lots), sql_blob_sha: census.sql?.blob_sha ?? null },
    closure_outside_top: outside.map((id) => ({ closed_lots: index.has(id) ? closed.get(id) : null, direct_lots: index.has(id) ? lotsOf(id) : null, regulation_id: id })),
    exceptions,
    join: {
      census_exceptions: censusKeys.size,
      census_not_in_slice: [...censusKeys].filter((k) => !byZoneN.has(k)).sort(),
      slice_exceptions: index.size,
      slice_not_in_census: [...byZoneN.keys()].filter((k) => !censusKeys.has(k)).length,
    },
    k7_version: K7_VERSION,
    missing_from_slice: missing,
    refs: refCounts,
    top_by_direct_lots_not_in_top: directTop.filter((id) => !inTop.has(id)),
    totals: {
      top_captured_direct_lots: capturedLots,
      top_captured_share_of_excepted: share(capturedLots),
      top_direct_lots: sumDirect(top),
      top_share_of_excepted: share(sumDirect(top)),
      top_units: exceptions.reduce((s, x) => s + (x.units || 0), 0),
      wave1_direct_lots: sumDirect(wave1),
      wave1_share_of_excepted: share(sumDirect(wave1)),
    },
    top_n: TOP_N,
    wave1_size: WAVE1_SIZE,
  };
}

/** The short markdown summary of the document. PURE. */
export function renderK7Markdown(doc) {
  const t = doc.totals;
  const pct = (x) => `${(x * 100).toFixed(2)} %`;
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const list = (xs) => (xs && xs.length ? cell(xs.join(', ')) : '—');
  const lots = (n) => (n === null || n === undefined ? '–' : thousands(n));
  const j = doc.join;
  const lines = [
    '# K7 keying list — top 30 wave-1 Ch.900 exceptions (generated)',
    '',
    `> GENERATED by \`node scripts/analysis/bylaw/k7.mjs --write\` (${doc.k7_version}) from \`census.json\` (${doc.census.adoption_id}${doc.census.current ? '' : ', STALE'}) and the slice of ${doc.adoption_id}. Do not edit. Data: \`k7-exceptions.json\`. Spec 69 M-15 (dated note 2026-10-07, operator Q-K7a).`,
    '',
    `Ranked by INCLUDE-closed residential lots (Spec 69 M-15). Top ${doc.top_n}: **${thousands(t.top_direct_lots)}** direct lots (${pct(t.top_share_of_excepted)} of ${thousands(doc.census.excepted_lots)} excepted); captured with their whole INCLUDE closure in the list: **${thousands(t.top_captured_direct_lots)}** (${pct(t.top_captured_share_of_excepted)}); **${t.top_units}** clause units. Wave 1 (top ${doc.wave1_size} by closed lots): ${thousands(t.wave1_direct_lots)} direct lots (${pct(t.wave1_share_of_excepted)}).`,
    '',
    '| # | Zone | Exception | Closed lots | Direct lots (rank) | Page | Units | SSP / PBS units | INCLUDEs | Included by | Amended by (unconsolidated) | Source repeats |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...doc.exceptions.map((e) =>
      `| ${e.rank} | ${cell(e.zone)} | ${e.regulation_id ? cell(e.regulation_id) : `${e.exception} (not in slice)`} | ${lots(e.closed_lots)} | ${lots(e.direct_lots)} (${e.direct_rank ?? '–'}) | ${e.page ? cell(e.page) : '–'} | ${e.units ?? '–'} | ${e.groups ? `${e.groups.SSP ?? 0} / ${e.groups.PBS ?? 0}` : '–'} | ${list(e.includes)} | ${e.included_by_direct ?? '–'} | ${list(e.amended_by)} | ${list(e.source_repeats)} |`,
    ),
    '',
    `SSP / PBS units = clause units under "Site Specific Provisions" / "Prevailing By-laws and Prevailing Sections" (a "(None Apply)" list is one unit). Included by = exceptions that INCLUDE it directly. INCLUDE targets outside the ${doc.top_n} (stay \`exception_not_authored\` until keyed): ${doc.closure_outside_top.length ? doc.closure_outside_top.map((x) => `${cell(x.regulation_id)} (direct ${lots(x.direct_lots)}, closed ${lots(x.closed_lots)})`).join('; ') : 'none'}.`,
    '',
    `In the top ${doc.top_n} by direct lots but not by INCLUDE-closed lots: ${list(doc.top_by_direct_lots_not_in_top)}.`,
    '',
    `Join: ${j.census_exceptions} census exceptions, ${j.slice_exceptions} sliced; not on the pinned pages: ${j.census_not_in_slice.length ? cell(j.census_not_in_slice.join(', ')) : 'none'}; sliced with no residential lot: ${j.slice_not_in_census}. Missing from the slice in the top ${doc.top_n}: ${list(doc.missing_from_slice)}. Exception refs ${doc.refs.exception_refs}, of which INCLUDE edges ${doc.refs.include_edges}.`,
    '',
  ];
  return lines.join('\n');
}

/** Slice the committed seeds and build both renders. Returns {doc, json, md}; writes nothing. */
export async function k7Files({ root }) {
  const seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  const { sliceSeeds } = await import(pathToFileURL(path.join(root, 'scripts', 'analysis', 'bylaw', 'standardized.mjs')).href);
  const { CLAUSE_GROUPS } = await import(pathToFileURL(path.join(root, 'scripts', 'analysis', 'bylaw', 'slice.mjs')).href);
  const { slice, snap } = sliceSeeds(seeds);
  const census = JSON.parse(fs.readFileSync(path.join(seeds, 'census.json'), 'utf8'));
  const doc = buildK7({ adoptionId: snap.adoption_id, census, groups: CLAUSE_GROUPS, slice });
  return { doc, json: stableStringify(doc), md: renderK7Markdown(doc) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  try {
    const { doc, json, md } = await k7Files({ root });
    if (process.argv.includes('--write')) {
      writeAtomic(path.join(root, K7_JSON_REL), json); // sync (write tmp + rename)
      writeAtomic(path.join(root, K7_MD_REL), md);
      console.log(`wrote ${K7_JSON_REL} + .md: top ${doc.top_n} = ${doc.totals.top_direct_lots} direct lots, ${doc.totals.top_units} units (${doc.adoption_id})`);
    } else {
      const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null);
      const stale = [[K7_JSON_REL, json], [K7_MD_REL, md]].filter(([rel, want]) => read(rel) !== want).map(([rel]) => rel);
      console.log(stale.length ? `STALE (rerun --write): ${stale.join(', ')}` : `${K7_JSON_REL} + .md: current`);
      process.exitCode = stale.length ? 1 : 0;
    }
  } catch (err) {
    if (!(err instanceof K7Error)) throw err;
    console.error(`refused — ${err.message}`);
    process.exitCode = 2;
  }
}
