// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 W9 and dated note 2026-11-11 item 3 (support inbox = ONE admin setting,
//            never typed into a page, content file or spec; Terms and Privacy drafted and validated, lawyer before launch), §11b.2, §0b items 5 and 11,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-18, FE-34 (closed kinds and roles; a number throws),
//            docs/specs/02-web-admin/128_surface_standard_policy.md R-03 (no scope-D link from a MaxBLD page).
//
// MF-46 stage C · the static page contract and the MaxBLD plain pages (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md v3 §3.2, §12 folds 16, 18, 19,
// 22; v1 §3.2 and folds 4, 8; operator round 2026-11-11 "1 y 2 y 3 ? 4y 5 y 6 y 7 y ... 8. y"). Cases:
//   T1 the page table validates against static-page.schema.json (AJV 2020, strict); RED: a number as content, an unknown kind, a role outside its
//      kind, a link with no href, an off-origin href and an href on a paragraph are each refused;
//   T2 totality both ways: the table's surfaces are exactly the converted STATIC surfaces, and each one's table states are its declared states;
//   T3 the footer is one footer: every page's footer section is the same, the four content files hold the same footer texts, and the legal line is
//      the ruled short line verbatim (L-R3) and equals the search page's search.legal; RED: one changed character fails;
//   T4 every link is a public host-table row whose internal page exists (a real route, never scope D);
//   T5 the mounts are public: no plain page imports the parcel-tool gate; RED: a planted import is caught;
//   T6 legal text parity (fold 22) and the inbox ruling: Terms name the free trial and the Basic, Pro and Enterprise plans and the trial continues on
//      Basic; no "One plan"; no analytics claim; no unfilled placeholder; no email address anywhere in the content (the inbox is a setting).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { matchMaxbldRoute } from '@/lib/auth/host-policy';
import { STATIC_CONTENT } from '@/lib/surfaces/maxbld-static';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON documents
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const SCHEMA = rj('scripts/surfaces/_schema/static-page.schema.json');
const TABLE = rj('scripts/surfaces/_schema/static-page.json');
const MANIFEST = rj('scripts/surfaces/_schema/converted-surfaces.json');
const DIR = 'scripts/surfaces/parcel_product/F06/surfaces';
const SEARCH = rj('scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json');
const MOUNTS = 'src/app/(maxbld)/parcel-tool/(static)';
// Ruling L-R3 (landing v9 rulings R2, 2026-11-11), verbatim: the short line on the landing and every small page.
const LEGAL = 'This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City.';
const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as new (o: Json) => { compile: (s: Json) => ((d: unknown) => boolean) & { errors?: unknown[] } };
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(SCHEMA);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const descriptor = (id: string): Json => rj(`${DIR}/${id}.descriptor.json`);
const footerOf = (page: Json): Json => page.sections.find((s: Json) => s.kind === 'footer');
const pagesOf = (): Array<[string, string, Json]> => Object.entries(TABLE.pages as Json).flatMap(([id, states]) => Object.entries(states as Json).map(([st, p]) => [id, st, p] as [string, string, Json]));

describe('T1 the page table against the contract', () => {
  it('validates (examined pages printed)', () => {
    expect([validate(TABLE), validate.errors ?? null]).toEqual([true, null]);
    // MF-76 (dated 2026-11-11): + web_landing static and degraded (5 -> 7).
    expect(pagesOf().length).toBe(7);
  });
  it('RED: each planted defect is refused', () => {
    const plants: Array<[string, (t: Json) => void]> = [
      ['a number as content', (t) => { t.pages.web_help.static.sections[0].parts[1].content = 9.99; }],
      // MF-76 (dated 2026-11-11): hero is a landing kind now, so the planted unknown kind is one no row has added.
      ['an unknown kind', (t) => { t.pages.web_help.static.sections[0].kind = 'banner'; }],
      ['a role outside its kind', (t) => { t.pages.web_help.static.sections[1].parts[3].role = 'paragraph'; }],
      ['a link with no href', (t) => { delete t.pages.web_help.static.sections[1].parts[0].href; }],
      ['an off-origin href', (t) => { t.pages.web_help.static.sections[1].parts[0].href = '//evil.com'; }],
      ['an href on a paragraph', (t) => { t.pages.web_help.static.sections[0].parts[1].href = '/help'; }],
      ['a value typed into a part', (t) => { t.pages.web_help.static.sections[0].parts[1].text = 'Hello'; }],
    ];
    for (const [why, f] of plants) { const t = clone(TABLE); f(t); expect([why, validate(t)]).toEqual([why, false]); }
  });
});

describe('T2 totality: the table and the converted STATIC surfaces, both ways', () => {
  it('the table names exactly the converted STATIC surfaces, each with exactly its declared states; each has its content file', () => {
    const converted = (MANIFEST.converted as string[]).filter((id) => fs.existsSync(path.join(ROOT, DIR, `${id}.descriptor.json`)) && descriptor(id).identity.archetype === 'STATIC');
    expect(Object.keys(TABLE.pages).sort()).toEqual(converted.sort());
    expect(Object.keys(STATIC_CONTENT).sort()).toEqual(converted.sort());
    for (const id of converted) expect([id, Object.keys(TABLE.pages[id]).sort()]).toEqual([id, descriptor(id).states.map((s: Json) => s.name).sort()]);
  });
});

describe('T3 one footer, one legal line', () => {
  const footerTexts = (c: Record<string, string>): Json => Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith('footer.')));
  const problems = (contents: Record<string, Record<string, string>>): string[] => {
    const out: string[] = [];
    const first = footerTexts(contents.web_help as Record<string, string>);
    for (const [id, c] of Object.entries(contents)) if (JSON.stringify(footerTexts(c)) !== JSON.stringify(first)) out.push(`${id}: footer texts differ`);
    if (first['footer.legal'] !== LEGAL) out.push('footer.legal is not the ruled short line');
    if (first['footer.legal'] !== SEARCH['search.legal']) out.push('footer.legal differs from search.legal');
    return out;
  };
  it('every page carries the same footer section; the texts are equal across the content files and equal the ruled short line', () => {
    const footers = pagesOf().map(([, , p]) => JSON.stringify(footerOf(p)));
    expect(new Set(footers).size).toBe(1);
    expect(footerOf(TABLE.pages.web_help.static).parts.map((p: Json) => p.role)).toEqual(['link', 'link', 'link', 'legal']);
    expect(problems(STATIC_CONTENT as Record<string, Record<string, string>>)).toEqual([]);
  });
  it('RED: one changed character of the legal line in one file fails', () => {
    const c = clone(STATIC_CONTENT) as Record<string, Record<string, string>>;
    (c.web_terms as Record<string, string>)['footer.legal'] = LEGAL.replace('City.', 'City!');
    expect(problems(c)).toEqual(['web_terms: footer texts differ']);
  });
});

describe('T4 every link is a public host-table route with a page behind it', () => {
  it('each href is a public maxbld.ca row rewritten to an existing internal page; none is scope D', () => {
    // MF-76 (dated 2026-11-11): the plain pages only; the landing's links (in-page anchors, /login, /signup with a plan, the help topic) are pinned
    // by src/tests/surfaces/web-landing.logic.test.ts T5 against the same host table.
    const hrefs = [...new Set(pagesOf().filter(([id]) => id !== 'web_landing').flatMap(([, , p]) => p.sections.flatMap((s: Json) => s.parts.filter((x: Json) => x.href).map((x: Json) => x.href as string))))];
    expect(hrefs.sort()).toEqual(['/help', '/privacy', '/terms']);
    for (const h of hrefs) {
      const row = matchMaxbldRoute(h);
      expect([h, row?.routeClass, row?.internal]).toEqual([h, 'public', `/parcel-tool${h}`]);
      expect([h, fs.existsSync(path.join(ROOT, `${MOUNTS}${h}/page.tsx`))]).toEqual([h, true]);
    }
  });
});

describe('T5 the plain pages are public (no gate)', () => {
  const gateImports = (text: string): string[] => text.split('\n').filter((l) => /^\s*import\b/.test(l) && /require-parcel-tool-page|requireParcelToolPage/.test(l));
  it('no mount under (static) imports the parcel-tool page gate', () => {
    const files = fs.readdirSync(path.join(ROOT, MOUNTS), { recursive: true }).map(String).filter((f) => f.endsWith('.tsx'));
    // Dated 2026-11-11 (MF-46, plan v1 fold 4): + refused/page.tsx, the internal target of a refused maxbld.ca page path (it only calls notFound()).
    // MF-76 (dated 2026-11-11): + the landing mount home/page.tsx (public, no gate; its errors reach error.tsx).
    expect(files.sort()).toEqual(['error.tsx', 'help/page.tsx', 'home/page.tsx', 'not-found.tsx', 'privacy/page.tsx', 'refused/page.tsx', 'terms/page.tsx']);
    for (const f of files) expect([f, gateImports(fs.readFileSync(path.join(ROOT, MOUNTS, f), 'utf8'))]).toEqual([f, []]);
  });
  it('RED: a planted gate import is caught', () => {
    expect(gateImports("import { requireParcelToolPage } from '@/lib/auth/require-parcel-tool-page';\n// requireParcelToolPage in a comment")).toHaveLength(1);
  });
});

describe('T6 legal text parity (plan v3 §12 fold 22) and the support inbox ruling', () => {
  const textProblems = (contents: Record<string, Record<string, string>>): string[] => {
    const out: string[] = [];
    const all = Object.entries(contents).flatMap(([id, c]) => Object.entries(c).map(([k, v]) => [id, k, v] as [string, string, string]));
    for (const [id, k, v] of all) {
      if (/\[TO CONFIRM|\{date\}|\[[A-Z ]+\]/.test(v)) out.push(`${id} ${k}: an unfilled placeholder`);
      if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|mailto:/i.test(v)) out.push(`${id} ${k}: an email address (the inbox is one admin setting)`);
      if (/analytics/i.test(v)) out.push(`${id} ${k}: an analytics claim`);
      if (/\bone (monthly )?plan\b/i.test(v)) out.push(`${id} ${k}: "one plan" (four plans are ruled, L-R4)`);
    }
    const terms = Object.values(contents.web_terms ?? {}).join('\n');
    for (const w of ['free trial', 'Basic', 'Pro', 'Enterprise', 'continues on the Basic plan', 'plus HST']) if (!terms.includes(w)) out.push(`web_terms: does not say "${w}"`);
    return out;
  };
  it('the real content: no finding', () => {
    expect(textProblems(STATIC_CONTENT as Record<string, Record<string, string>>)).toEqual([]);
  });
  it('RED: an unfilled placeholder, an email address, an analytics line and "One plan" are each caught; a dropped plan name is caught', () => {
    const c = clone(STATIC_CONTENT) as Record<string, Record<string, string>>;
    const t = c.web_terms as Record<string, string>;
    const p = c.web_privacy as Record<string, string>;
    t['terms.intro'] = 'Run by [TO CONFIRM: legal name].';
    p['privacy.intro'] = 'Write to help@example.ca.';
    p['privacy.s1.why'] = 'We use an analytics provider.';
    t['terms.s3.plans'] = 'One plan. MaxBLD has one monthly plan.';
    expect(textProblems(c)).toEqual([
      'web_terms terms.intro: an unfilled placeholder',
      'web_terms terms.s3.plans: "one plan" (four plans are ruled, L-R4)',
      'web_privacy privacy.intro: an email address (the inbox is one admin setting)',
      'web_privacy privacy.s1.why: an analytics claim',
      'web_terms: does not say "Pro"',
      'web_terms: does not say "Enterprise"',
      'web_terms: does not say "plus HST"',
    ]);
  });
});
