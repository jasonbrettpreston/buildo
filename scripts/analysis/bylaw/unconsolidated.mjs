// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-UNIVERSE (the City's "enacted, not yet
//            consolidated" list read at every refresh), §6.4 rule 1; docs/specs/01-pipeline/69_mcbylaw_policy.md
//            M-36 (capture from the enacting text), M-57 (operator ruling R5, 2026-10-07);
//            docs/reports/mcbylaw-phase1-plan.md S4 (rework).
//
// The consolidation trails enactment. The City's Zoning By-law 569-2013 page lists the city-wide by-laws
// passed but "not yet shown in the current office consolidation". Every refresh records that list (url,
// sha256 of the page as fetched, fetch time from clock.mjs via the caller) and, for each listed by-law, the
// pinned regulations its enacting text cites. A listed by-law that cites a pinned regulation is a
// G-UNIVERSE item until its enacting text is captured under M-36 (enacting/manifest.json).
//   refreshUnconsolidated  network: fetch the list page and each listed PDF; writes unconsolidated.json
//   parseUnconsolidated    PURE: the by-laws a list page names (linked PDFs + "By-law NNN-YYYY" mentions)
//   citedPinned            PURE: the pinned, in-scope article ids an enacting text cites
//   checkUnconsolidated    offline G-UNIVERSE arm over the committed record
// Reason codes: unconsolidated_missing (no record) · unconsolidated_invalid (record misshapen) ·
// unconsolidated_uncaptured (a listed by-law cites a pinned regulation and has no M-36 capture).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeExtraction } from './enacting.mjs';
import { pinnedScopeOf } from './slice.mjs';
import { decodePage, normalize, sha256, stableStringify, writeAtomic } from './snapshot.mjs';

export const UNCONSOLIDATED_URL = 'https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/zoning-by-law-569-2013-2/';
export const RECORD_FILE = 'unconsolidated.json';

/** The by-laws a list page names: linked enacting PDFs, and "By-law NNN-YYYY" mentions in its text. PURE. */
export function parseUnconsolidated(html) {
  const out = new Map();
  for (const m of String(html).matchAll(/https?:\/\/www\.toronto\.ca\/legdocs\/bylaws\/(\d{4})\/law(\d{1,4})\.pdf|\/legdocs\/bylaws\/(\d{4})\/law(\d{1,4})\.pdf/g)) {
    const year = m[1] || m[3];
    const num = Number(m[2] || m[4]);
    const bylaw = `${num}-${year}`;
    out.set(bylaw, { bylaw, linked: true, url: `https://www.toronto.ca/legdocs/bylaws/${year}/law${String(num).padStart(4, '0')}.pdf` });
  }
  // 569-2013 is the by-law being amended, never an amendment.
  for (const m of normalize(html).matchAll(/\bBy-law (\d{1,4}-\d{4})\b/g)) if (m[1] !== '569-2013' && !out.has(m[1])) out.set(m[1], { bylaw: m[1], linked: false, url: null });
  return [...out.values()].sort((a, b) => (a.bylaw < b.bylaw ? -1 : a.bylaw > b.bylaw ? 1 : 0));
}

/** The pinned, in-scope sections and carve-in articles (one definition, in slice.mjs). */
export const pinnedScope = pinnedScopeOf;

/** Pinned in-scope article ids cited in an enacting text (dotted ids of 3–4 parts). PURE. */
export function citedPinned(text, scope) {
  const out = new Set();
  for (const m of String(text).matchAll(/(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?(?![\d])/g)) {
    const section = `${m[1]}.${m[2]}`;
    if (!scope.sections.has(section)) continue;
    const article = m[0];
    const c = scope.carve.get(section);
    if (c && ![...c].some((a) => article === a || article.startsWith(`${a}.`))) continue;
    out.add(article);
  }
  return [...out].sort();
}

/** Network refresh of the list and each listed PDF (polite, sequential). Writes unconsolidated.json atomically. */
export async function refreshUnconsolidated({ seeds, fetchImpl, nowIso, sleep, delayMs = 1000, bin = 'pdftotext' }) {
  const get = async (url) => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Buildo-McBylaw/1 (unconsolidated list)' }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
    if (res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  const page = await get(UNCONSOLIDATED_URL);
  const fetchedAt = nowIso();
  const pageSet = JSON.parse(fs.readFileSync(path.join(seeds, 'page-set.json'), 'utf8'));
  const scope = pinnedScope(pageSet);
  const captured = JSON.parse(fs.readFileSync(path.join(seeds, 'enacting', 'manifest.json'), 'utf8')).captures;
  const staging = path.join(seeds, '.staging', 'unconsolidated');
  fs.mkdirSync(staging, { recursive: true });
  const bylaws = [];
  for (const b of parseUnconsolidated(decodePage(page))) {
    const rec = { bylaw: b.bylaw, captured: Boolean(captured[b.bylaw]), linked: b.linked, url: b.url };
    let text = null;
    if (captured[b.bylaw]) text = fs.readFileSync(path.join(seeds, 'enacting', `${b.bylaw}.txt`), 'utf8');
    else if (b.url) {
      await sleep(delayMs);
      const pdf = await get(b.url);
      rec.pdf_sha256 = sha256(pdf);
      const f = path.join(staging, `${b.bylaw}.pdf`);
      fs.writeFileSync(f, pdf);
      const r = spawnSync(bin, ['-enc', 'UTF-8', '-eol', 'unix', f, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
      if (r.status !== 0) throw new Error(`${bin} failed on ${b.bylaw}: ${r.stderr}`);
      text = normalizeExtraction(r.stdout, b.bylaw);
    }
    rec.cites_pinned = text === null ? null : citedPinned(text, scope);
    bylaws.push(rec);
  }
  const record = { bylaws, fetched_at: fetchedAt, page_sha256: sha256(page), url: UNCONSOLIDATED_URL };
  writeAtomic(path.join(seeds, RECORD_FILE), stableStringify(record));
  return record;
}

/** G-UNIVERSE unconsolidated arm, offline. Returns {pass, violations, checked, items}. */
export function checkUnconsolidated({ seeds }) {
  const f = path.join(seeds, RECORD_FILE);
  if (!fs.existsSync(f)) return { checked: 0, items: [], pass: false, violations: [`unconsolidated_missing: ${RECORD_FILE}`] };
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  const violations = [];
  if (rec.url !== UNCONSOLIDATED_URL || !/^[0-9a-f]{64}$/.test(rec.page_sha256 || '') || !rec.fetched_at || !Array.isArray(rec.bylaws)) {
    return { checked: 0, items: [], pass: false, violations: [`unconsolidated_invalid: ${RECORD_FILE} lacks url / page_sha256 / fetched_at / bylaws[]`] };
  }
  const captured = JSON.parse(fs.readFileSync(path.join(seeds, 'enacting', 'manifest.json'), 'utf8')).captures;
  const items = [];
  for (const b of rec.bylaws) {
    if (b.cites_pinned === null && b.linked) violations.push(`unconsolidated_invalid: ${b.bylaw} has a PDF but no cites_pinned`);
    if (b.cites_pinned && b.cites_pinned.length && !captured[b.bylaw]) {
      items.push(b.bylaw);
      violations.push(`unconsolidated_uncaptured: ${b.bylaw} cites pinned ${b.cites_pinned.slice(0, 6).join(', ')}${b.cites_pinned.length > 6 ? ', …' : ''} and is not captured (Spec 69 M-36)`);
    }
  }
  return { checked: rec.bylaws.length, items, pass: violations.length === 0, violations };
}
