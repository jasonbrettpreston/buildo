// SPEC LINK: operator ruling 2026-09-16 (c), recorded at mobile/app/(app)/parcel-tool/_layout.tsx ("WHY THE FIVE-TAB BAR IS HIDDEN RATHER THAN ESCAPED":
//            moving the parcel-tool group out of `(app)` was REJECTED as "a security regression"); the spec review's second unverified lock and R-3
//            (~/Buildo-scratch/mcfrontend/PROGRAMME/SPEC-REVIEW-mobile-web.md); .cursor/MCFRONTEND-QUEUE.md MF-43, MF-49 (per-product gate).
//
// MF-43 · McFrontend queue · lane T. Spec-review lock 2, no FE row (plan D-5). STRUCTURAL, not behavioural (D-6): the gate cannot be rendered under node
// (mobile/__tests__/subscriptionGate.test.ts says the same, and that suite runs in mobile jest, not in the root suite); this lock runs in the root suite.
// It is the pre-MF-49 form: the ruling forbids moving the group out WITHOUT a per-product gate, and MF-45/MF-49 will legitimately change the gate, so the
// failure names the MF-49 exit. Reads `(app)/_layout.tsx` with `//` and `/* */` comments stripped (newlines kept): its header comments mention `<Tabs`
// and the guard, so a raw-text order check would be false. The `(app)` root is one constant; extending it per app is MF-49's.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_ROOT = 'mobile/app/(app)/';
const GROUP = 'parcel-tool';
const LAYOUT = `${APP_ROOT}_layout.tsx`;
const GROUP_LAYOUT = `${APP_ROOT}${GROUP}/_layout.tsx`;
const MUST_HAVE = [`${APP_ROOT}${GROUP}/_layout.tsx`, `${APP_ROOT}${GROUP}/index.tsx`];
const GATE_RETURNS = ['return <SubscriptionLoadingGuard', 'return <PaywallMount'];
const TABS_RE = /^\s*<Tabs\b/m;
const SCREEN = `name="${GROUP}"`;
const RULING_WORDS = 'security regression';
const EXIT = 'parcel-tool must stay behind the (app) subscription gate (ruling 2026-09-16 (c)); a move out needs a per-product gate first (MF-49, spec review R-3)';

/** Strip `//` and block comments, keeping newlines and string literals (', ", `); a ' or " literal ends at a newline, so an apostrophe in JSX text cannot hide a later comment. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === quote || (c === '\n' && quote !== '`')) quote = null; // ' and " never span a line (JSX text such as Don't)
      i += 1;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
    } else {
      if (c === '"' || c === "'" || c === '`') quote = c;
      out += c;
      i += 1;
    }
  }
  return out;
}

function fenceProblems(files: readonly string[], layout: string, groupLayout: string): string[] {
  const problems: string[] = [];
  const group = files.filter((f) => f.split('/').includes(GROUP));
  if (group.length === 0) problems.push(`no tracked ${GROUP} route file found (dead-man)`);
  for (const f of MUST_HAVE) if (!group.includes(f)) problems.push(`${f} missing (dead-man)`);
  for (const f of group) if (!f.startsWith(APP_ROOT)) problems.push(`${f} is outside ${APP_ROOT}: ${EXIT}`);
  const code = stripComments(layout);
  const tabs = code.search(TABS_RE);
  const screen = code.indexOf(SCREEN);
  if (tabs < 0) problems.push(`${LAYOUT}: no line-start <Tabs outside comments (dead-man)`);
  if (screen < 0) problems.push(`${LAYOUT}: no ${SCREEN} screen outside comments: ${EXIT}`);
  for (const g of GATE_RETURNS) {
    const at = code.lastIndexOf(g);
    if (at < 0) problems.push(`${LAYOUT}: "${g}" missing outside comments (dead-man): ${EXIT}`);
    else if (tabs >= 0 && at > tabs) problems.push(`${LAYOUT}: "${g}" comes after <Tabs: ${EXIT}`);
  }
  if (tabs >= 0 && screen >= 0 && screen < tabs) problems.push(`${LAYOUT}: ${SCREEN} comes before <Tabs: ${EXIT}`);
  if (!groupLayout.includes(RULING_WORDS)) problems.push(`${GROUP_LAYOUT}: the recorded ruling ("${RULING_WORDS}") is gone`);
  return problems;
}

function trackedMobileApp(): string[] {
  const r = spawnSync('git', ['ls-files', 'mobile/app'], { cwd: ROOT, encoding: 'utf8' });
  expect(r.status).toBe(0);
  return r.stdout.split('\n').filter(Boolean);
}

const FILES = trackedMobileApp();
/** A missing file reads as empty, so a moved group is reported as a fence problem, not a crash at load. */
function readIfExists(rel: string): string {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
const L = readIfExists(LAYOUT);
const GL = readIfExists(GROUP_LAYOUT);

function mutate(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to);
  expect(out).not.toBe(text);
  return out;
}

describe('spec-review lock 2: every parcel-tool route stays inside the (app) gate', () => {
  it('the real tree has no problem', () => {
    expect(fenceProblems(FILES, L, GL)).toEqual([]);
  });

  it('examined the route files and the stripped layout (dead-man)', () => {
    expect(FILES.filter((f) => f.split('/').includes(GROUP)).length).toBeGreaterThanOrEqual(MUST_HAVE.length);
    const code = stripComments(L);
    expect(code.split('\n').length).toBe(L.split('\n').length);
    for (const t of [...GATE_RETURNS, SCREEN]) expect(code).toContain(t);
    expect(code.search(TABS_RE)).toBeGreaterThan(0);
    // The raw text has <Tabs in a header comment, so a raw check would be false; the stripped text does not.
    expect(L.search(/<Tabs/)).toBeLessThan(L.indexOf('return <SubscriptionLoadingGuard'));
  });

  it('planted: a parcel-tool route outside (app)', () => {
    expect(fenceProblems([...FILES, 'mobile/app/parcel-tool/x.tsx'], L, GL).join('\n')).toMatch(/mobile\/app\/parcel-tool\/x\.tsx is outside mobile\/app\/\(app\)\/: .*MF-49/);
  });

  it('planted: the gate return moved after <Tabs', () => {
    const bad = `${mutate(L, /return <PaywallMount/g, 'void <PaywallMount')}\nfunction late() {\n  return <PaywallMount leadViewsCount={0} />;\n}\n`;
    expect(fenceProblems(FILES, bad, GL).join('\n')).toMatch(/"return <PaywallMount" comes after <Tabs/);
  });

  it('planted: the correct order exists only in comments', () => {
    const bad = `// return <SubscriptionLoadingGuard />;\n${mutate(L, /return <SubscriptionLoadingGuard/g, 'void <SubscriptionLoadingGuard')}`;
    expect(fenceProblems(FILES, bad, GL).join('\n')).toMatch(/"return <SubscriptionLoadingGuard" missing outside comments/);
  });

  it('planted: the parcel-tool screen removed, or placed before <Tabs', () => {
    expect(fenceProblems(FILES, mutate(L, /^.*name="parcel-tool".*\n/m, ''), GL).join('\n')).toMatch(/no name="parcel-tool" screen/);
    const early = mutate(L, 'export default', 'const early = <Tabs.Screen name="parcel-tool" />;\nexport default');
    expect(fenceProblems(FILES, early, GL).join('\n')).toMatch(/name="parcel-tool" comes before <Tabs/);
  });

  it('planted: an empty file list, and the ruling comment removed', () => {
    expect(fenceProblems([], L, GL).join('\n')).toMatch(/no tracked parcel-tool route file found/);
    expect(fenceProblems(FILES, L, mutate(GL, new RegExp(RULING_WORDS, 'g'), 'risk')).join('\n')).toMatch(/the recorded ruling/);
  });

  it('fold: the whole group moved out of (app) names the exit instead of crashing on the missing group layout', () => {
    const moved = FILES.map((f) => f.replace('mobile/app/(app)/parcel-tool/', 'mobile/app/parcel-tool/'));
    const out = fenceProblems(moved, L, readIfExists('mobile/app/(app)/parcel-tool/_layout.missing.tsx')).join('\n');
    expect(out).toMatch(/mobile\/app\/parcel-tool\/index\.tsx is outside mobile\/app\/\(app\)\/: .*MF-49/);
    expect(out).toMatch(/mobile\/app\/\(app\)\/parcel-tool\/_layout\.tsx missing/);
    expect(out).toMatch(/the recorded ruling/);
  });

  it('fold: index.tsx missing, and a layout with no line-start <Tabs', () => {
    const noIndex = FILES.filter((f) => f !== 'mobile/app/(app)/parcel-tool/index.tsx');
    expect(fenceProblems(noIndex, L, GL).join('\n')).toMatch(/parcel-tool\/index\.tsx missing \(dead-man\)/);
    expect(fenceProblems(FILES, mutate(L, /^(\s*)<Tabs\b/gm, '$1<Tabz'), GL).join('\n')).toMatch(/no line-start <Tabs outside comments/);
  });

  it('fold: an apostrophe in JSX text does not hide a later comment from the stripper', () => {
    const src = "const a = <Text>Don't pay</Text>;\n// return <PaywallMount gone\nconst b = 'x';\n";
    const out = stripComments(src);
    expect(out).not.toContain('return <PaywallMount');
    expect(out.split('\n').length).toBe(src.split('\n').length);
  });
});
