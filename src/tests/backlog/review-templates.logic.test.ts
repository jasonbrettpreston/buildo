// SPEC LINK: task-406 (V2.LIST round 2); Spec 08 section 5.1 (08_agents.md): the lens templates. lens-compliance.md:32 was fixed so the material of a review is sent once; the other lens templates carried the plan placeholder in their prose
// (line 32) and so held the material twice (a 181,810 character prompt for an 85,642 character diff). Each lens template has exactly one plan placeholder.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT } from './helpers';

const DIR = path.join(ROOT, '.claude/review-templates');
describe('review lens templates: the plan placeholder appears once, so the material is sent once', () => {
  for (const lens of ['compliance', 'code-review', 'error-paths', 'ux', 'security']) {
    it(`lens-${lens}.md has exactly one plan placeholder`, () => {
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
