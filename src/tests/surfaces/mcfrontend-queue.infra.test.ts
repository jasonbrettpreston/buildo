// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-11 (product first; admin converts on touch; dated note 2026-11-09: admin tasks
//            only as listed for Phase 2, MF-30, MF-37, MF-40) and FE-14 (LEAN; dated note 2026-11-09: no MF task outside Phase 0-2 or convert-on-touch);
//            .cursor/MCFRONTEND-QUEUE.md (the one source of MF task ids; headings `**MF-nn <task> — <STATUS>** (lane)`).
//
// MF-43 · McFrontend queue · lane T. One lock file for two rows (FE-11, FE-14), as the register names it. Only LINE-START headings are tasks: an id
// mentioned in a note or in the "unused" line is not. An admin task is a heading whose title names `admin` OUTSIDE parentheses (a parenthetical, such as
// "(mobile, web, admin, pdf)", lists targets, it does not make the task an admin conversion; so a title must name an admin task outside parentheses, e.g.
// "Admin roles console", never "Roles console (admin)"). Not checked here: next-free-id and id uniqueness are queue
// hygiene, owned by the queue (plan section 10).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const QUEUE = '.cursor/MCFRONTEND-QUEUE.md';
const HEADING_RE = /^\*\*(MF-\d+)\b/;
// FE-14: the sections a task may sit under.
const ALLOWED_SECTIONS: readonly RegExp[] = [/^## Phase 0\b/, /^## Phase 1\b/, /^## Phase 2\b/, /convert[- ]on[- ]touch/i];
const PHASE2_RE = /^## Phase 2\b/;
// FE-11 dated note 2026-11-09 (MF-41, D-1): the admin tasks listed for Phase 2. Closed (D-8).
const ADMIN_LISTED: readonly string[] = ['MF-30', 'MF-37', 'MF-40'];
// FE-11: the first Phase 1 report task (the report binding row); no admin task may precede it.
const REPORT_ANCHOR = 'MF-10';

type Heading = { id: string; section: string | null; line: string; index: number };

function headings(text: string): Heading[] {
  const out: Heading[] = [];
  let section: string | null = null;
  text.split('\n').forEach((line, index) => {
    if (line.startsWith('## ')) section = line;
    const m = HEADING_RE.exec(line);
    if (m?.[1]) out.push({ id: m[1], section, line, index });
  });
  return out;
}

function isAdminTask(line: string): boolean {
  let t = line;
  for (let prev = ''; prev !== t; ) { prev = t; t = t.replace(/\([^()]*\)/g, ''); }
  return /\badmin\b/i.test(t);
}

function queueProblems(text: string): string[] {
  const problems: string[] = [];
  const hs = headings(text);
  if (hs.length === 0) return ['no MF task heading found (dead-man: an empty read never passes)'];
  const anchor = hs.find((h) => h.id === REPORT_ANCHOR);
  if (!anchor) problems.push(`anchor ${REPORT_ANCHOR} (the first Phase 1 report task) not found`);
  for (const h of hs) {
    if (h.section === null || !ALLOWED_SECTIONS.some((re) => re.test(h.section!))) {
      problems.push(`${h.id} sits under "${h.section ?? '(no section)'}": no MF task outside Phase 0-2 or convert-on-touch (FE-14)`);
    }
    if (!isAdminTask(h.line)) continue;
    if (h.section !== null && PHASE2_RE.test(h.section) && !ADMIN_LISTED.includes(h.id)) {
      problems.push(`${h.id} is an admin task under Phase 2 but not listed (${ADMIN_LISTED.join(', ')}) (FE-11)`);
    }
    if (anchor && h.index < anchor.index) problems.push(`${h.id} is an admin task before the first report task ${REPORT_ANCHOR} (FE-11)`);
  }
  return problems;
}

const REAL = fs.readFileSync(path.join(ROOT, QUEUE), 'utf8');

function mutate(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to);
  expect(out).not.toBe(text);
  return out;
}
const lineOf = (id: string) => REAL.split('\n').find((l) => l.startsWith(`**${id} `))!;

describe('FE-11 and FE-14: the McFrontend queue holds no task outside Phase 0-2 or convert-on-touch, and admin tasks only as listed', () => {
  it('the real queue has no problem', () => {
    expect(queueProblems(REAL)).toEqual([]);
  });

  it('examined every line-start heading (dead-man), and the real admin mentions are read as intended', () => {
    const hs = headings(REAL);
    expect(hs.length).toBeGreaterThan(30);
    expect(hs.length).toBe(REAL.split('\n').filter((l) => HEADING_RE.test(l)).length);
    // Real-tree passes: MF-21 is an admin task in Phase 1 after the anchor; MF-32 sits under convert-on-touch.
    expect(isAdminTask(lineOf('MF-21'))).toBe(true);
    expect(hs.find((h) => h.id === 'MF-32')?.section).toMatch(/convert-on-touch/);
    expect(['MF-37', 'MF-40'].every((id) => isAdminTask(lineOf(id)))).toBe(true);
    expect(isAdminTask(lineOf('MF-14'))).toBe(false);
  });

  it('planted: a task under "## Not doing"', () => {
    const bad = `${REAL.trimEnd()}\n\n**MF-98 Something else — LATER** (E)\n`;
    expect(queueProblems(bad).join('\n')).toMatch(/MF-98 sits under "## Not doing"/);
  });

  it('planted: a task under "## Phase 3"', () => {
    const bad = mutate(REAL, '## Later: convert-on-touch', '## Phase 3: more\n\n**MF-97 A third phase task — LATER** (E)\n\n## Later: convert-on-touch');
    expect(queueProblems(bad).join('\n')).toMatch(/MF-97 sits under "## Phase 3: more"/);
  });

  it('planted: a task before any section', () => {
    const bad = mutate(REAL, '## Phase 0', '**MF-96 Loose task — LATER** (E)\n\n## Phase 0');
    expect(queueProblems(bad).join('\n')).toMatch(/MF-96 sits under/);
  });

  it('planted: an unlisted admin task under Phase 2', () => {
    const bad = mutate(REAL, lineOf('MF-41'), `**MF-98 Admin roles console — LATER** (E)\n\n${lineOf('MF-41')}`);
    expect(queueProblems(bad).join('\n')).toMatch(/MF-98 is an admin task under Phase 2 but not listed/);
  });

  it('planted: an admin task moved above the first report task', () => {
    const bad = mutate(REAL, lineOf('MF-33'), `**MF-95 Admin users page — LATER** (E)\n\n${lineOf('MF-33')}`);
    expect(queueProblems(bad).join('\n')).toMatch(/MF-95 is an admin task before the first report task MF-10/);
  });

  it('planted: the anchor removed, and an empty queue', () => {
    expect(queueProblems(mutate(REAL, `**${REPORT_ANCHOR} `, '**MF-X10 ')).join('\n')).toMatch(/anchor MF-10/);
    expect(queueProblems('').join('\n')).toMatch(/no MF task heading found/);
  });
});
