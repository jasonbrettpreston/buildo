// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-01 (dated notes 2026-11-06 and 2026-11-09: the lock asserts that the 126 status
//            line names Phase 1 and Phase 2 and points to Spec 126 §11b.3 for the Phase 2 surfaces, and that the McFrontend queue carries the opening note),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md status line and §11b.3, .cursor/MCFRONTEND-QUEUE.md (header, "## Phase 2", "## Not doing").
//
// MF-43 · McFrontend queue · lane T. The FE-01 lock. The 126 status block is the `> **Status:` line plus the blockquote lines that follow it (its dated
// notes, M-246: prior text is kept, so "Phase 1 only" stays in the original line and is NOT asserted absent). Not asserted here: "no Phase surface commit
// lands without a McFrontend-Task trailer" is arm C's (scripts/analysis/mcbylaws/gate.mjs, FAIL:C:no-mf-task), observable there, not duplicated.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SPEC126 = 'docs/specs/02-web-admin/126_maxbld_surface_standard.md';
const QUEUE = '.cursor/MCFRONTEND-QUEUE.md';
const STATUS_HEAD = '> **Status:';
const NOT_AUTHORIZED = 'Not authorized for implementation';
// The Phase 2 surfaces are listed in §11b.3 (FE-01 dated note 2026-11-09); the status block points there.
const PHASE2_POINTER = '§11b.3';
const PHASE2_HEADING_RE = /^### 11b\.3\b/m;
// The opening notes the queue carries (FE-01 dated notes 2026-11-06 and 2026-11-09).
const QUEUE_PHASE1_OPEN = 'Phase 1 is open';
const QUEUE_PHASE2_OPEN = 'McFrontend Phase 2 is open';
const QUEUE_NOT_DOING_PHASE2 = 'Not doing in Phase 2';

function statusBlock(spec126: string): string[] {
  const lines = spec126.split('\n');
  const i = lines.findIndex((l) => l.startsWith(STATUS_HEAD));
  if (i < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(i)) {
    if (!line.startsWith('>')) break;
    out.push(line);
  }
  return out;
}

/** The text of the `## ` section whose heading starts with `head` (up to the next `## `), or null. */
function section(md: string, head: string): string | null {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.startsWith(head));
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && l.startsWith('## '));
  return lines.slice(i, j < 0 ? undefined : j).join('\n');
}

function statusProblems(spec126: string, queue: string): string[] {
  const problems: string[] = [];
  const block = statusBlock(spec126);
  if (block.length === 0) {
    problems.push('Spec 126 has no `> **Status:` line');
  } else {
    if (!(block[0] ?? '').includes('Phase 1')) problems.push('the 126 status line does not name Phase 1');
    const phase2 = block.filter((l) => l.includes('Phase 2'));
    if (phase2.length === 0) problems.push('the 126 status block does not name Phase 2');
    else if (!phase2.some((l) => l.includes(PHASE2_POINTER))) problems.push(`the 126 status block names Phase 2 but does not point to ${PHASE2_POINTER} for its surfaces`);
    if (!block.some((l) => l.includes(NOT_AUTHORIZED))) problems.push(`the 126 status block no longer states "${NOT_AUTHORIZED}" for everything beyond`);
  }
  if (!PHASE2_HEADING_RE.test(spec126)) problems.push('Spec 126 has no "### 11b.3" section for the status pointer to resolve to');
  const header = queue.split('\n## ')[0] ?? '';
  if (!header.includes(QUEUE_PHASE1_OPEN)) problems.push(`the queue header does not carry the Phase 1 opening note ("${QUEUE_PHASE1_OPEN}")`);
  const p2 = section(queue, '## Phase 2');
  if (p2 === null) problems.push('the queue has no "## Phase 2" section');
  else if (!p2.includes(QUEUE_PHASE2_OPEN)) problems.push(`the queue "## Phase 2" section does not carry the opening note ("${QUEUE_PHASE2_OPEN}")`);
  const notDoing = section(queue, '## Not doing');
  if (notDoing === null || !notDoing.includes(QUEUE_NOT_DOING_PHASE2)) problems.push(`the queue "## Not doing" section does not carry Phase 2's list ("${QUEUE_NOT_DOING_PHASE2}")`);
  return problems;
}

const S126 = fs.readFileSync(path.join(ROOT, SPEC126), 'utf8');
const Q = fs.readFileSync(path.join(ROOT, QUEUE), 'utf8');

function mutate(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to);
  expect(out).not.toBe(text);
  return out;
}
/** Apply `fn` to the status block lines only. */
function mutateBlock(fn: (line: string) => string): string {
  const block = statusBlock(S126);
  let out = S126;
  for (const line of block) out = out.replace(line, fn(line));
  expect(out).not.toBe(S126);
  return out;
}

describe('FE-01: the 126 status line names Phase 1 and Phase 2 (pointing to §11b.3); the queue carries the opening notes', () => {
  it('the real Spec 126 and queue have no problem', () => {
    expect(statusProblems(S126, Q)).toEqual([]);
  });

  it('examined the status block (dead-man)', () => {
    const block = statusBlock(S126);
    expect(block.length).toBeGreaterThan(0);
    expect(block[0]?.startsWith(STATUS_HEAD)).toBe(true);
  });

  it('planted: Phase 2 replaced by Phase 9 in the status block', () => {
    const bad = mutateBlock((l) => l.replaceAll('Phase 2', 'Phase 9'));
    expect(statusProblems(bad, Q).join('\n')).toMatch(/does not name Phase 2/);
  });

  it('planted: the §11b.3 pointer removed', () => {
    const bad = mutateBlock((l) => l.replaceAll(PHASE2_POINTER, '§11b'));
    expect(statusProblems(bad, Q).join('\n')).toMatch(/does not point to §11b\.3/);
  });

  it('planted: Phase 1 removed from the status line', () => {
    const bad = mutateBlock((l) => (l.startsWith(STATUS_HEAD) ? l.replaceAll('Phase 1', 'Phase X') : l));
    expect(statusProblems(bad, Q).join('\n')).toMatch(/does not name Phase 1/);
  });

  it('planted: "Not authorized for implementation" dropped', () => {
    const bad = mutateBlock((l) => l.replaceAll(NOT_AUTHORIZED, 'authorized'));
    expect(statusProblems(bad, Q).join('\n')).toMatch(/no longer states "Not authorized for implementation"/);
  });

  it('planted: the §11b.3 heading renamed, and no status line at all', () => {
    expect(statusProblems(mutate(S126, PHASE2_HEADING_RE, '### 11b.9'), Q).join('\n')).toMatch(/no "### 11b\.3" section/);
    expect(statusProblems(mutate(S126, STATUS_HEAD, '> **State:'), Q).join('\n')).toMatch(/has no `> \*\*Status:` line/);
  });

  it('planted: the queue without its opening notes or its Phase 2 not-doing list', () => {
    expect(statusProblems(S126, mutate(Q, new RegExp(QUEUE_PHASE1_OPEN, 'g'), 'Phase 1 is shut')).join('\n')).toMatch(/Phase 1 opening note/);
    expect(statusProblems(S126, mutate(Q, new RegExp(QUEUE_PHASE2_OPEN, 'g'), 'McFrontend Phase 2 is shut')).join('\n')).toMatch(/"## Phase 2" section does not carry the opening note/);
    expect(statusProblems(S126, mutate(Q, /^## Phase 2/m, '## Stage 2')).join('\n')).toMatch(/no "## Phase 2" section/);
    expect(statusProblems(S126, mutate(Q, new RegExp(QUEUE_NOT_DOING_PHASE2, 'g'), 'Not doing later')).join('\n')).toMatch(/does not carry Phase 2's list/);
  });
});
