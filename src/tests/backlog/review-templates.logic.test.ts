// SPEC LINK: task-406 (V2.LIST round 2); Spec 08 section 5.1 (08_agents.md): the lens templates. lens-compliance.md:32 was fixed so the material of a review is sent once; the other lens templates carried the plan placeholder in their prose
// (line 32) and so held the material twice (a 181,810 character prompt for an 85,642 character diff). Each lens template has exactly one plan placeholder.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { ROOT } from './helpers';

const DIR = path.join(ROOT, '.claude/review-templates');
describe('review lens templates: the plan placeholder appears once, so the material is sent once', () => {
  for (const lens of ['compliance', 'code-review', 'error-paths', 'ux', 'security', 'engineering']) {
    it(`lens-${lens}.md has exactly one plan placeholder`, () => {
      expect(fs.existsSync(path.join(DIR, `lens-${lens}.md`)), `lens-${lens}.md exists`).toBe(true);
      const text = fs.readFileSync(path.join(DIR, `lens-${lens}.md`), 'utf8');
      expect(text.split('{{PLAN}}').length - 1, `lens-${lens}.md`).toBe(1);
    });
  }
});

// task-433 (INPUTS.5, RR-0378 step 6): the compliance template closes with the Rules met line after Clauses checked; no other lens template carries it.
describe('task-433: the compliance lens ends with a Rules met line', () => {
  const read = (lens: string) => fs.readFileSync(path.join(DIR, `lens-${lens}.md`), 'utf8');
  it('lens-compliance.md holds a Rules met line after the Clauses checked line, in the closing block', () => {
    const t = read('compliance');
    const a = t.indexOf('Clauses checked: <n>   Unmet: <n>');
    const b = t.indexOf('Rules met: <rule ids, comma separated>');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(t).toContain('Rules met: none');
  });
  for (const lens of ['code-review', 'error-paths', 'ux', 'security']) {
    it(`control: lens-${lens}.md does not carry it`, () => {
      expect(read(lens)).not.toContain('Rules met:');
    });
  }
});

// task-438 T1 (FINAL.3, RR-0385 item 2, decision-170): the engineering seat has its own template, separate from compliance. It carries the structural strings every lens template carries
// (review-lens-template.infra.test.ts:80-92, which is left alone: its LENSES would force lens-compliance.md to name lens-engineering) and the Clauses checked line, and no Rules met line
// (the engineering standards file has no name.N rule ids).
describe('task-438 T1: lens-engineering.md is a lens template of its own', () => {
  const read = (lens: string) => fs.readFileSync(path.join(DIR, `lens-${lens}.md`), 'utf8');
  it('lens-engineering.md holds the structural strings of a lens template, names the other lenses, ends with Clauses checked and has no Rules met line', () => {
    expect(fs.existsSync(path.join(DIR, 'lens-engineering.md')), 'lens-engineering.md exists').toBe(true);
    const t = read('engineering');
    for (const s of ['## System persona', '## User prompt', '**The one question:**', 'You are NOT responsible for', 'a finding with no quote is rejected', 'Output format (strict', 'VERDICT:', 'Clauses checked: <n>   Unmet: <n>']) expect(t, s).toContain(s);
    expect(t).toMatch(/At most \d+ findings/);
    for (const other of ['compliance', 'code-review', 'ux', 'error-paths', 'security']) expect(t, `names lens-${other}`).toContain(`lens-${other}`);
    expect(t).toContain('engineering');
    expect(t).not.toContain('Rules met:');
  });
  it('control: lens-compliance.md still holds the Rules met line (it is not edited)', () => {
    expect(read('compliance')).toContain('Rules met: <rule ids, comma separated>');
  });
});

// task-453 T7 (GROUNDER-D D2, AC #6): the next review round is the highest context-rN number plus one, so a gap never names an existing file again
describe('task-453 T7: contextRound', () => {
  const { contextRound } = createRequire(import.meta.url)(path.join(ROOT, 'scripts/lib/review-template.js')) as { contextRound: (d: string) => number };
  const dirWith = (names: string[]) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxr-')); for (const n of names) fs.writeFileSync(path.join(d, n), 'x\n'); return d; };
  it('context-r2 only gives round 3; no context file gives round 1; context-r1 and context-r3 give round 4; a missing folder gives round 1', () => {
    expect(contextRound(dirWith(['context-r2.md']))).toBe(3);
    expect(contextRound(dirWith(['GROUNDER.md']))).toBe(1);
    expect(contextRound(dirWith(['context-r1.md', 'context-r3.md']))).toBe(4);
    expect(contextRound(path.join(os.tmpdir(), 'no-such-dir-task-453'))).toBe(1);
  });
});
