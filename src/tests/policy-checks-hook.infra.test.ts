// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-AG (hook composition is locked by a test); MORNING-DECISIONS.md:725 and :744 (the eight checks, built under the repo's hooks).
//
// Pins the .husky/commit-msg line that runs scripts/analysis/policy-checks.mjs: present exactly once, after the McBylaws gate, with the message file, and with no flag, word or environment
// variable that turns it off. Its own file (not hooks-composition.infra.test.ts) so it never collides with the loop arm owed to MB-68 in that file. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMMIT_MSG = fs.readFileSync(path.join(ROOT, '.husky/commit-msg'), 'utf8');
const DRIVER = 'scripts/analysis/policy-checks.mjs';
const LINE = `${DRIVER} --commit-msg "$1"`;
const code = (t: string): string => t.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const count = (t: string, needle: string): number => code(t).split(needle).length - 1;

describe('commit-msg runs the policy checks', () => {
  it('GREEN: the driver line is present exactly once, after the McBylaws gate and chained with &&', () => {
    expect(count(COMMIT_MSG, LINE)).toBe(1);
    const c = code(COMMIT_MSG);
    expect(c.indexOf(LINE)).toBeGreaterThan(c.indexOf('scripts/analysis/mcbylaws/gate.mjs --commit-msg "$1"'));
    expect(c).toMatch(/&& \\\nnode scripts\/analysis\/policy-checks\.mjs --commit-msg "\$1"/);
  });
  it('RED: a tampered commit-msg with the line stripped is caught', () => {
    const tampered = COMMIT_MSG.replace(/ && \\\nnode scripts\/analysis\/policy-checks\.mjs --commit-msg "\$1"/, '');
    expect(count(tampered, LINE)).toBe(0);
  });
  it('no environment switch, flag or skip word sits on the driver line, and the driver reads no environment variable', () => {
    const lines = code(COMMIT_MSG).split('\n').filter((l) => l.includes(DRIVER));
    for (const l of lines) expect(l).not.toMatch(/\b[A-Z_]+=|skip|--no-|\|\| true|\|\| exit 0/i);
    const src = fs.readFileSync(path.join(ROOT, DRIVER), 'utf8');
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/--skip|--off|--no-check/);
  });
});
