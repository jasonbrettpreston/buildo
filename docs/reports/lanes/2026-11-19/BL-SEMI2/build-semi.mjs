// Lane BL-SEMI2 stage 2 copy of the BL-SEMI stage 1 generator; the one change is the heading width override (see the CSS note). Lane BL-SEMI stage 1 (task-319): writes semi-question.html the way the v8 small pages are made: the page frame, CSS, icon paths and helpers
// of ~/Buildo-scratch/mcfrontend/small-pages-v8 (read only; build.mjs itself needs shared/ and brand/ files, so it is not copied, its CSS block
// and PATHS are read from choose-lot.html and build.mjs at run time), and every string from the BUILT content file (read at run time, never retyped).
// Run: node build-semi.mjs   (writes semi-question.html next to this script)
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = dirname(fileURLToPath(import.meta.url));
const V8 = join(homedir(), 'Buildo-scratch/mcfrontend/small-pages-v8');
const CONTENT_FILE = join(homedir(), 'Buildo-wt-semi1b2/scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json');
const K = JSON.parse(readFileSync(CONTENT_FILE, 'utf8'));
const k = (key) => { if (!(key in K)) throw new Error('no built content key ' + key); return K[key]; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (key) => esc(k(key)); // verbatim built string
const cm = (key) => `<!-- content key: ${key} -->`;

// v8 CSS block and favicons, verbatim from the finished page choose-lot.html (the Daylight tokens, :root)
const src = readFileSync(join(V8, 'choose-lot.html'), 'utf8');
const CSS = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const FAV = src.split('\n').filter((l) => l.startsWith('<link rel="icon"')).join('\n');
// icon paths, verbatim from build.mjs PATHS
const build = readFileSync(join(V8, 'build.mjs'), 'utf8');
const P = (name) => { const m = build.match(new RegExp(`^  ${name}: '([^']+)'`, 'm')); if (!m) throw new Error('no v8 icon ' + name); return m[1]; };
const ic = (name, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${P(name)}"/></svg>`;
const B = (t, kind = 's', a = '') => `<button type="button" class="btn ${kind}"${a ? ' ' + a : ''}>${t}</button>`;
const fc = (t) => `<span class="fc">${t}</span>`;
const tabbar = `<nav class="tabbar" aria-label="Main">${[['lookup', 'Lookup', 'search'], ['tracked', 'Tracked Lots', 'bookmark'], ['account', 'Account', 'user']].map(([key, t, i]) => `<a href="#"${key === 'lookup' ? ' aria-current="page"' : ''}>${ic(i, 22)}<span>${t}</span></a>`).join('')}</nav>`;

// D.6 back: the v8 app bar back chevron (.top .back). Visible text: none (the built label is the accessible name only).
const topBar = `${cm('back.label (aria-label only)')}<header class="top"><a href="/lookup" class="back" aria-label="${T('back.label')}">${ic('back', 22)}</a></header>`;
const banner = (kind, key, inner) => `${cm(key)}<div class="banner${kind === 'info' ? ' info' : ''}" role="${kind === 'info' ? 'status' : 'alert'}">${ic(kind === 'info' ? 'info' : 'alert', 20)}<p>${inner}</p></div>`;

// D.4 three answers, in the built order (SEMI_ANSWERS yes, no, not_sure)
const ANSWERS = [['yes', 'answer.yes'], ['no', 'answer.no'], ['not_sure', 'answer.not_sure']];
const card = ([id, key], sel) => `${cm(key)}<button type="button" class="card" role="radio" aria-checked="${sel === id}" aria-label="${T(key)}"><span class="lead">${T(key)}</span></button>`;
// D.3 question, D.4 cards, D.5 Continue
const ask = (sel) => `<div class="section">${cm('question.title')}<h2>${T('question.title')}</h2></div>
<div class="section" role="radiogroup" aria-label="${T('question.title')}">
${ANSWERS.map((a) => card(a, sel)).join('\n')}
</div>
${sel
  ? `${cm('select.go (button text); select.label (aria-label)')}${B(T('select.go'), 'p', `aria-label="${T('select.label')}"`)}`
  : `${cm('select.none (button text, disabled); select.label (aria-label)')}${B(T('select.none'), 'p', `disabled aria-label="${T('select.label')}"`)}`}`;
const retry = `${cm('retry.text (button text); retry.label (aria-label)')}${B(T('retry.text'), 's', `aria-label="${T('retry.label')}"`)}`;
// D.7 states. The rate-limit second count is a field value (sample, dashed), as v8 draws every server value.
const rate = esc(k('state.ratelimit')).replace('{seconds}', fc('30'));
const STATES = [
  { label: 'Ask · none chosen (default)', note: 'Nothing is selected at open; Continue is disabled and reads the built "Choose an answer" (D.5, descriptor check parcelsemi_nothing_preselected).', body: ask(null) },
  { label: 'Ask · an answer chosen', note: 'One answer chosen (the same radio card as choose-lot, ink edge and filled dot); Continue becomes enabled and reads "Continue".', body: ask('yes') },
  { label: 'Searching (loading)', note: 'D.7. The built page shows a spinner with this word; v8 draws a quiet status line without a spinner (search.html "Searching").', body: `${cm('state.loading')}<p class="lead" role="status">${T('state.loading')}</p>` },
  { label: 'Error (500)', note: 'D.7. The v8 error banner (alert icon), then one Try again button.', body: `${banner('err', 'state.error', T('state.error'))}\n${retry}` },
  { label: 'Schema drift', note: 'D.7. The same banner, no retry (a deterministic failure; descriptor errors.classes).', body: banner('err', 'state.schema_drift', T('state.schema_drift')) },
  { label: 'Rate limited (429)', note: 'D.7. The v8 error banner; the second count is a field value (sample 30, from errors.429.retryAfterSeconds).', body: banner('err', 'state.ratelimit', rate) },
  { label: 'Entitlement (403)', note: 'D.7. The v8 neutral notice (info icon).', body: banner('info', 'state.entitlement', T('state.entitlement')) },
];
const sections = STATES.map((s, i) => `
<section class="state app" aria-label="${s.label}">
<div class="sl">${i + 1} · App · ${s.label}</div>
<p class="sn">${s.note}</p>
${topBar}<div class="screen">
${s.body}
</div>${tabbar}
</section>`).join('\n');

const html = `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Semi question: one question before the report · MaxBLD</title>
${FAV}
<style>${CSS}
/* BL-SEMI2 (operator 2026-11-19, MORNING-DECISIONS.md:1188): the v8 rule h2 { text-wrap: balance } wraps the question at a narrower measure than the cards beneath; the question spans the cards' width (same left and right edges). */
.section h2 { text-wrap: wrap; width: 100% }
</style>
</head>
<body>
<div class="wrap">
<div class="states">
${sections}
</div>
<p class="mocknote"><b>Design notes · Semi question</b> · SRCH.SEMI task-319 stage 1 · small-pages mock v8 (Daylight, light only), 390 px. Built from the v8 choose-lot frame (heading, radio cards, one button, banner states). Every string is read from the built content file mobile_parcel_semi_question.content.json (the key is in a comment beside it); no new copy, no new element. Shows the built elements D.3 to D.7; D.1 (shown only when the lot is unsure) and D.2 (lot form on the hit) have no visible part. Not drawn: D.8 owner answer stored, D.9 wall-distance input, D.10 override in the report (later homes task-213 and task-209; RR-0264). The page is reached only when a lot is a possible semi (lotForm.unsure). A dashed underline marks a value from a field or setting.</p>
</div>
</body>
</html>
`;
writeFileSync(join(OUT, 'semi-question.html'), html);
console.log('wrote semi-question.html', html.length, 'bytes');
