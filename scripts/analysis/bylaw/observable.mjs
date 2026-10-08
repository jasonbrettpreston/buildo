// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-PROV (page arm: "page ... shas match the
//            manifest; manifest complete"), §6.4 rule 10 (provenance explicit, never mtimes), §8 rule 8 (module shape)
//
// OBSERVABLE word module. S3 lands the G-PROV page arm; S10 the amendment + enacting arms (checkProvAll); S8 the
// ruling-citation arm (checkRulingCitations). The keyer provenance arm arrives with the first authored shard (S6/A1).
//
// Reason codes (closed set for the page arm):
//   manifest_missing            no manifest.json
//   page_set_mismatch           page-set.json and manifest.json pin different pages (either direction)
//   raw_sha_mismatch            pages/<key>.htm missing, or its sha256 differs from the manifest
//   normalized_sha_mismatch     pages/<key>.txt missing, or its sha256 differs from the manifest
//   normalized_not_reproducible normalize(raw) under the current normalizer differs from the pinned normalized sha
//   orphan_page_file            a file in pages/ that the manifest does not pin
//   adoption_mismatch           the latest adoptions.json entry is not the manifest's adoption, or its page shas differ

import fs from 'node:fs';
import path from 'node:path';
import { checkAmendments } from './amendments.mjs';
import { checkEnacting } from './enacting.mjs';
import { decodePage, loadPageSet, normalize, sha256 } from './snapshot.mjs';
import { parseRulings } from './universe.mjs';

/** G-PROV page arm over a seeds directory. Returns {pass, violations, checked}. */
export function checkProv({ seeds }) {
  const violations = [];
  let checked = 0;
  const manifestPath = path.join(seeds, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { pass: false, violations: ['manifest_missing: manifest.json'], checked };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pinned = new Map(manifest.pages.map((p) => [p.key, p]));

  const setKeys = loadPageSet(seeds).doc.pages.map((p) => p.key);
  for (const k of setKeys) if (!pinned.has(k)) violations.push(`page_set_mismatch: ${k} is in page-set.json but not in manifest.json`);
  for (const k of pinned.keys()) if (!setKeys.includes(k)) violations.push(`page_set_mismatch: ${k} is in manifest.json but not in page-set.json`);

  const pagesDir = path.join(seeds, 'pages');
  for (const p of manifest.pages) {
    checked++;
    const rawPath = path.join(pagesDir, `${p.key}.htm`);
    const txtPath = path.join(pagesDir, `${p.key}.txt`);
    const raw = fs.existsSync(rawPath) ? fs.readFileSync(rawPath) : null;
    if (!raw || sha256(raw) !== p.raw_sha256) violations.push(`raw_sha_mismatch: ${p.key}.htm ${raw ? 'sha differs from the manifest' : 'missing'}`);
    const txt = fs.existsSync(txtPath) ? fs.readFileSync(txtPath) : null;
    if (!txt || sha256(txt) !== p.normalized_sha256) violations.push(`normalized_sha_mismatch: ${p.key}.txt ${txt ? 'sha differs from the manifest' : 'missing'}`);
    if (raw && sha256(Buffer.from(normalize(decodePage(raw)), 'utf8')) !== p.normalized_sha256) {
      violations.push(`normalized_not_reproducible: normalize(${p.key}.htm) differs from the pinned normalized sha`);
    }
  }
  if (fs.existsSync(pagesDir)) {
    for (const f of fs.readdirSync(pagesDir).sort()) {
      const m = /^(.+)\.(htm|txt)$/.exec(f);
      if (!m || !pinned.has(m[1])) violations.push(`orphan_page_file: pages/${f}`);
    }
  }

  const adoptionsPath = path.join(seeds, 'adoptions.json');
  const adoptions = fs.existsSync(adoptionsPath) ? JSON.parse(fs.readFileSync(adoptionsPath, 'utf8')).adoptions : [];
  const latest = adoptions.at(-1);
  if (!latest || latest.adoption_id !== manifest.adoption_id) {
    violations.push(`adoption_mismatch: latest adoption ${latest ? latest.adoption_id : 'none'} != manifest ${manifest.adoption_id}`);
  } else {
    for (const p of manifest.pages) {
      const a = latest.pages[p.key];
      if (!a || a.raw_sha256 !== p.raw_sha256 || a.normalized_sha256 !== p.normalized_sha256) {
        violations.push(`adoption_mismatch: ${p.key} shas differ between ${latest.adoption_id} and the manifest`);
      }
    }
  }
  return { pass: violations.length === 0, violations, checked };
}

/** G-PROV over the page, amendment (amendments.mjs) and enacting (enacting.mjs) arms; reason codes stay per arm. */
export function checkProvAll({ seeds }) {
  const arms = [
    { name: 'page', ...checkProv({ seeds }) },
    { name: 'amendment', ...checkAmendments({ seeds }) },
    { name: 'enacting', ...checkEnacting({ seeds }) },
  ];
  const violations = arms.flatMap((a) => a.violations);
  return { pass: violations.length === 0, violations, checked: arms.reduce((n, a) => n + a.checked, 0), arms };
}

// ---------------------------------------------------------------- G-PROV ruling-citation arm (S8)
//
// Reason codes (closed set for the ruling-citation arm):
//   ruling_parse_empty            Spec 69 parses to 0 rulings (Spec 68 §9: a 0-ruling parse FAILS)
//   ruling_not_ratified           a ratchet-exceptions.json row cites a Spec 69 id that is not RATIFIED (or an
//                                 adjudication cites a ruling that is not RATIFIED)
//   ruling_anchor_missing         a ratchet-exceptions.json row's anchor is not the literal `**<id>**`, or Spec 69 does
//                                 not contain it (gates/ledger.mjs literal-anchor semantics, copied)
//   adjudicator_missing           an adjudications.json entry names no adjudicator
//   consolidation_ruling_missing  a consolidation_mismatch adjudication does not cite M-39
//   deferred_ruling_unknown       a `deferred_by_ruling:<id>` names an id Spec 69 does not carry (PROPOSED is allowed, counted)
export const RULING_REASON_CODES = Object.freeze([
  'ruling_parse_empty',
  'ruling_not_ratified',
  'ruling_anchor_missing',
  'adjudicator_missing',
  'consolidation_ruling_missing',
  'deferred_ruling_unknown',
]);

const RULING_ID_RE = /\b([MP]-\d+)\b/g;
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Ruling citations across the committed records. `ledger` = ratchet-exceptions.json (or null), `adjudications` =
 * adjudications.json (or null), `deferred` = Spec 69 ids cited by `deferred_by_ruling:<id>` page / scope rules. PURE.
 */
export function checkRulingCitations({ spec69Text, ledger, adjudications, deferred = [] }) {
  const violations = [];
  let checked = 0;
  const rulings = parseRulings(spec69Text || '');
  if (rulings.size === 0) violations.push('ruling_parse_empty: Spec 69 parsed to 0 rulings');
  for (const [i, row] of ((ledger && ledger.rows) || []).entries()) {
    checked++;
    const id = row && row.ruling;
    if (rulings.size && rulings.get(id) !== 'RATIFIED') violations.push(`ruling_not_ratified: ratchet-exceptions.json rows[${i}] cites ${id} (${rulings.get(id) || 'absent'})`);
    if (rulings.size && (!row || row.anchor !== `**${id}**` || !String(spec69Text || '').includes(`**${id}**`))) violations.push(`ruling_anchor_missing: ratchet-exceptions.json rows[${i}] anchor ${JSON.stringify(row && row.anchor)} is not the literal **${id}** in Spec 69`);
  }
  for (const a of (adjudications && adjudications.adjudications) || []) {
    checked++;
    const id = (a && a.id) || '?';
    if (!a || !isText(a.adjudicator)) violations.push(`adjudicator_missing: ${id}`);
    const cited = [...String((a && a.ruling) || '').matchAll(RULING_ID_RE)].map((m) => m[1]);
    if (a && a.kind === 'consolidation_mismatch' && !cited.includes('M-39')) violations.push(`consolidation_ruling_missing: ${id} cites ${JSON.stringify(a.ruling ?? null)}, not M-39`);
    for (const r of cited) if (rulings.size && rulings.get(r) !== 'RATIFIED') violations.push(`ruling_not_ratified: adjudication ${id} cites ${r} (${rulings.get(r) || 'absent'})`);
  }
  let deferredProposed = 0;
  for (const id of [...new Set(deferred)].sort()) {
    checked++;
    if (!rulings.size) continue;
    if (!rulings.has(id)) violations.push(`deferred_ruling_unknown: deferred_by_ruling:${id} is not a Spec 69 row`);
    else if (rulings.get(id) === 'PROPOSED') deferredProposed++;
  }
  return { pass: violations.length === 0, violations, checked, counts: { deferred_proposed: deferredProposed, rulings: rulings.size } };
}

/** Known-bad fixture per ruling-arm reason code + the good twin (in memory). Returns {pass, results}. */
export function selfTest() {
  const spec = ['| **M-39** | x | y | G-PROV | RATIFIED 2026-10-06 |', '| **M-56** | x | y | G-UNIVERSE | RATIFIED 2026-10-07 |', '| **M-90** | x | y | G-UNIVERSE | PROPOSED |'].join('\n');
  const good = () => ({
    spec69Text: spec,
    ledger: { rows: [{ kind: 'universe_pin', ruling: 'M-56', anchor: '**M-56**' }] },
    adjudications: { adjudications: [{ id: 'ADJ-1', kind: 'consolidation_mismatch', adjudicator: 'operator', ruling: 'M-39' }] },
    deferred: ['M-90'],
  });
  const cases = [
    [null, () => {}],
    ['ruling_parse_empty', (g) => { g.spec69Text = ''; }],
    ['ruling_not_ratified', (g) => { g.ledger.rows[0].ruling = 'M-90'; g.ledger.rows[0].anchor = '**M-90**'; }],
    ['ruling_anchor_missing', (g) => { g.ledger.rows[0].anchor = 'M-56'; }],
    ['adjudicator_missing', (g) => { g.adjudications.adjudications[0].adjudicator = ' '; }],
    ['consolidation_ruling_missing', (g) => { g.adjudications.adjudications[0].ruling = 'M-56'; }],
    ['deferred_ruling_unknown', (g) => { g.deferred = ['M-999']; }],
  ];
  const results = cases.map(([code, mutate]) => {
    const g = good();
    mutate(g);
    const r = checkRulingCitations(g);
    const got = [...new Set(r.violations.map((v) => v.split(':')[0]))];
    const pass = code === null ? r.pass : !r.pass && got.length === 1 && got[0] === code;
    return { name: code || 'ruling arm good twin', pass, got };
  });
  for (const c of RULING_REASON_CODES) if (!cases.some((x) => x[0] === c)) results.push({ name: `fixture for ${c}`, pass: false, got: [] });
  return { pass: results.every((r) => r.pass), results };
}
