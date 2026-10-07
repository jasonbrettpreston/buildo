// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-TEXT (unit set == HTML clause-cell set +
//            declared inline splits, both directions; no number dropped); docs/specs/01-pipeline/69_mcbylaw_policy.md
//            M-57 (operator rulings R1–R4, 2026-10-07); docs/reports/mcbylaw-phase1-plan.md S4 (rework)
//
// Permanent INDEPENDENT cross-check of the slicer, ported from the 2026-10-07 completeness audit
// (.cursor/mcbylaw/completeness-audit/scripts/{html-inventory,diff-units,number-coverage}.mjs). It reads the
// adopted raw pages with a real HTML parser (parse5 DOM) and shares no code with slice.mjs / html.mjs:
//   1. every clause cell (`<TD ALIGN=RIGHT>(x)</TD>`) of a sliced article is a unit, or the parent of the
//      inline split / table cells under it; and every unit traces back to a clause cell, a table cell or an
//      inline split under one (both directions);
//   2. every number in a sliced page's content (DOM text) is present in the slice's rows + headings (multiset).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / parse5 DOM
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const require = createRequire(path.join(process.cwd(), 'package.json'));
const parse5: Json = require('parse5');
const SEEDS = path.join(process.cwd(), 'scripts/seeds/bylaw');
const ST = await load('scripts/analysis/bylaw/standardized.mjs');
const sliced: Json = ST.sliceSeeds ? ST.sliceSeeds(SEEDS) : { slice: { rows: [], units: [] }, snap: { pages: [] } };
const slice: Json = sliced.slice;
const pageSet: Json = JSON.parse(fs.readFileSync(path.join(SEEDS, 'page-set.json'), 'utf8'));
const carveOf: Record<string, string[]> = Object.fromEntries(pageSet.pages.filter((p: Json) => p.carve_in).map((p: Json) => [p.key, p.carve_in]));
const sectionPages: string[] = pageSet.pages.filter((p: Json) => p.role === 'section').map((p: Json) => p.key);

const attr = (n: Json, k: string) => (n.attrs || []).find((a: Json) => a.name.toLowerCase() === k)?.value;
const textOf = (n: Json): string => (n.nodeName === '#text' ? n.value : n.nodeName === 'br' ? '\n' : (n.childNodes || []).map(textOf).join(''));
const clean = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** The audit's raw-HTML clause inventory: {reg, path} per clause cell, depth from table nesting. */
function inventory(html: string) {
  const doc = parse5.parse(html);
  let content: Json | null = null;
  const findContent = (n: Json) => {
    if (!content && n.nodeName === 'td') {
      const has = (x: Json): boolean => x.nodeName === 'h1' || (x.childNodes || []).some(has);
      if (has(n) && (n.childNodes || []).some((c: Json) => c.nodeName === 'table' || c.nodeName === 'h1')) content = n;
    }
    for (const c of n.childNodes || []) findContent(c);
  };
  findContent(doc);
  const clauses: { reg: string; path: string }[] = [];
  let curReg: string | null = null;
  let stack: { depth: number; m: string }[] = [];
  const walk = (n: Json, depth: number) => {
    if (/^h[1-6]$/.test(n.nodeName)) {
      const t = clean(textOf(n));
      const a = (n.childNodes || []).find((c: Json) => c.nodeName === 'a');
      const num = (a && attr(a, 'name')) || t.split(/\s+/)[0];
      if (/^\d+(\.\d+)+$/.test(num)) {
        curReg = num;
        stack = [];
      }
      return;
    }
    if (n.nodeName === 'tr') {
      const first = (n.childNodes || []).find((c: Json) => c.nodeName === 'td');
      const ft = first ? clean(textOf(first)) : '';
      if (first && (attr(first, 'align') || '').toUpperCase() === 'RIGHT' && /^\([^)\s]{1,6}\)$/.test(ft)) {
        while (stack.length && (stack.at(-1)?.depth ?? -1) >= depth) stack.pop();
        stack.push({ depth, m: ft });
        if (curReg) clauses.push({ path: stack.map((s) => s.m).join(''), reg: curReg });
      }
    }
    for (const c of n.childNodes || []) walk(c, c.nodeName === 'table' ? depth + 1 : depth);
  };
  if (content) walk(content, 0);
  return { body: content ? textOf(content) : '', clauses };
}

const base = (p: string) => p.replace(/~[a-z_0-9]+/g, '');
const pages: Json[] = sliced.snap.pages.filter((p: Json) => sectionPages.includes(p.key));

describe('independent HTML cross-check (parse5; ported from the 2026-10-07 completeness audit)', () => {
  it('every clause cell of a sliced article is a unit or the parent of an inline split / table cells, and back', () => {
    const missing: string[] = [];
    const untraced: string[] = [];
    const nonLeaf = new Set<string>();
    const unitKeys = new Set<string>();
    for (const r of slice.rows) for (const c of r.clauses) if (!c.leaf) nonLeaf.add(`${r.article}#${base(c.path)}`);
    for (const u of slice.units) unitKeys.add(`${u.citation.replace(/\(.*$/, '')}#${base(u.clause_path)}`);
    let cells = 0;
    const htmlPaths = new Set<string>();
    for (const p of pages) {
      const inv = inventory(p.html);
      for (const c of inv.clauses) {
        const carve = carveOf[p.key];
        if (carve && !carve.includes(c.reg)) continue;
        cells++;
        // "(I)" directly under an upper-case clause is the City's typo for the Roman (i) (disclosed marker_typo).
        const k = `${c.reg}#${c.path.replace(/(\([A-Z]\))\(I\)/g, '$1(i)')}`;
        htmlPaths.add(k);
        if (!unitKeys.has(k) && !nonLeaf.has(k)) missing.push(`${p.key} ${k}`);
      }
    }
    for (const u of slice.units) {
      if (u.page.startsWith('enacting:')) continue;
      const art = u.citation.replace(/\(.*$/, '');
      const pth = base(u.clause_path).replace(/\[[^\]]*\].*$/, '');
      let ok = htmlPaths.has(`${art}#${pth}`) || (u.origin === 'table_cell' && pth === '');
      // An inline split: its nearest clause-cell ancestor is in the HTML set.
      for (let q = pth; !ok && q.includes('('); q = q.slice(0, q.lastIndexOf('('))) ok = htmlPaths.has(`${art}#${q}`);
      if (!ok) untraced.push(u.unit_id);
    }
    expect(cells).toBeGreaterThan(3000); // never vacuous
    expect(missing).toEqual([]);
    expect(untraced).toEqual([]);
  });

  it('every number in a sliced page body is in the slice rows + headings (multiset; carve-in pages excluded)', () => {
    const tokRe = /\d[\d,]*(?:\.\d+)?%?/g;
    const tokens = (s: string) => (s.match(tokRe) || []).map((t) => t.replace(/,(?=\d{3})/g, ''));
    const ms = (arr: string[]) => arr.reduce((m: Record<string, number>, t) => ((m[t] = (m[t] || 0) + 1), m), {});
    const short: string[] = [];
    let total = 0;
    for (const p of pages) {
      if (carveOf[p.key]) continue;
      const body = inventory(p.html).body.replace(/©City of Toronto 1998-\d{4}/, '');
      const want = ms(tokens(body));
      const heads = [...p.html.matchAll(/<H[1-6][^>]*>([\s\S]*?)<\/H[1-6]>/gi)].map((m: Json) => m[1].replace(/<[^>]+>/g, ' ')).join(' ');
      const got = ms(tokens(`${slice.rows.filter((r: Json) => r.page === p.key).map((r: Json) => r.verbatim).join(' ')} ${heads}`));
      for (const [t, n] of Object.entries(want)) {
        total += n;
        if ((got[t] || 0) < n) short.push(`${p.key} ${t}: html ${n} slice ${got[t] || 0}`);
      }
    }
    expect(total).toBeGreaterThan(10000); // never vacuous
    expect(short).toEqual([]);
  });
});
