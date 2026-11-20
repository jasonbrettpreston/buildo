// SPEC LINK: task-358 (REVIEW.LENSES); Spec 08 section 7 rule 4 (08_agents.md:334 "NEVER run one generic pass").
// Infra-level (spawns the real CLI, no network): `review <file> --template <lens> [--context <pasted context>] --dry-run` sends the lens
// template's own System persona as the system message and its User prompt (file in {{PLAN}}, context in {{SPECS}}) as the user message,
// so the strict one-line output format of the lens reaches the model instead of the generic adversarial prompt. Never reads .env.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = 'scripts/deepseek-review.js';
const TEMPLATES = '.claude/review-templates';
const LENSES = ['compliance', 'code-review', 'ux', 'error-paths', 'security'];
const tmpDirs: string[] = [];

function tmpFile(name: string, text: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task358-'));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function dryRun(args: string[]): { role: string; content: string }[] {
  const stdout = execFileSync('node', [CLI, 'review', ...args, '--dry-run'], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, DEEPSEEK_API_KEY: 'test-key-not-real' } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = stdout.split('\n').filter((l) => l.startsWith('DRY-RUN '));
  expect(lines.length).toBe(1);
  return (JSON.parse((lines[0] ?? '').slice('DRY-RUN '.length)) as { messages: { role: string; content: string }[] }).messages;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop();
    if (d !== undefined) fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('review --template: a lens template reaches the model as system persona + user prompt', () => {
  let diff = '';
  let ctx = '';
  beforeEach(() => {
    diff = tmpFile('d.diff', '+const MARK_DIFF_LINE = 1;\n');
    ctx = tmpFile('c.md', 'MARK_PASTED_CLAUSE: Spec 126:351 touch-target floor\n');
  });

  it('system message is the lens persona, not the generic adversarial prompt; file fills {{PLAN}}, context fills {{SPECS}}', () => {
    const m = dryRun([diff, '--template', `${TEMPLATES}/lens-ux.md`, '--context', ctx]);
    expect(m).toHaveLength(2);
    expect(m[0]!.role).toBe('system');
    expect(m[0]!.content).toContain('You are NOT responsible for');
    expect(m[0]!.content).not.toContain('ADVERSARIAL code review');
    expect(m[1]!.role).toBe('user');
    expect(m[1]!.content).toContain('MARK_DIFF_LINE');
    expect(m[1]!.content).toContain('MARK_PASTED_CLAUSE');
    expect(m[1]!.content).not.toContain('{{PLAN}}');
    expect(m[1]!.content).not.toContain('{{SPECS}}');
    expect(m[1]!.content).toContain('Output format (strict');
  });

  it('without --context the {{SPECS}} block says no pasted context', () => {
    const m = dryRun([diff, '--template', `${TEMPLATES}/lens-compliance.md`]);
    expect(m[1]!.content).toContain('(no pasted context provided)');
  });

  it('without --template the review keeps the generic adversarial system prompt (unchanged)', () => {
    const m = dryRun([diff, '--context', ctx]);
    expect(m[0]!.content).toContain('ADVERSARIAL code review');
  });
});

describe('the five lens templates (AC #1)', () => {
  for (const lens of LENSES) {
    it(`lens-${lens}.md: one question, names the other lenses it is not, quote rule, strict format, max findings`, () => {
      const t = fs.readFileSync(`${TEMPLATES}/lens-${lens}.md`, 'utf8');
      expect(t).toContain('## System persona');
      expect(t).toContain('## User prompt');
      expect(t).toContain('**The one question:**');
      expect(t).toContain('You are NOT responsible for');
      for (const other of LENSES.filter((l) => l !== lens)) expect(t, `names lens-${other}`).toContain(`lens-${other}`);
      expect(t).toContain('a finding with no quote is rejected');
      expect(t).toContain('Output format (strict');
      expect(t).toMatch(/At most \d+ findings/);
      expect(t).toContain('VERDICT:');
    });
  }
  it('README maps every lens to its Spec 08 seat and states the round-2 standard', () => {
    const r = fs.readFileSync(`${TEMPLATES}/README.md`, 'utf8');
    for (const lens of LENSES) expect(r).toContain(`lens-${lens}.md`);
    for (const seat of ['A10', 'A3', 'A11', 'A2 DeepSeek lens 4', 'A12']) expect(r).toContain(seat);
    expect(r).toContain('round 2');
    expect(r).toContain('verified');
  });
});

// task-366 (COMPLY.2): lens-compliance.md carried the plan placeholder twice (once in its own prose), so the material was sent twice and the 120000 bound applied to the doubled prompt.
describe('lens-compliance.md sends the material once (task-366)', () => {
  it('the file under review appears exactly once in the user prompt', () => {
    const file = tmpFile('m.txt', 'MARK_ONCE_MATERIAL\n');
    const m = dryRun([file, '--template', `${TEMPLATES}/lens-compliance.md`]);
    expect((m[1]!.content.match(/MARK_ONCE_MATERIAL/g) ?? []).length).toBe(1);
  });
});

// task-366 (COMPLY.2, the close check binds a lens output to its input): in lens mode the review tool writes, among the first lines of its output, a REVIEW header
// with the template name, the model id, a timestamp, the sha256 of the file under review and the sha256 of the prompt it sent.
describe('review --template writes a REVIEW header (task-366)', () => {
  it('REVIEW template=<name> model=<id> at=<iso> file_sha256=<hex> prompt_sha256=<hex> is in the first lines, and the hashes are of what was read and sent', () => {
    const text = 'MARK_HEADER_MATERIAL\n';
    const file = tmpFile('h.txt', text);
    const stdout = execFileSync('node', [CLI, 'review', file, '--template', `${TEMPLATES}/lens-compliance.md`, '--dry-run'], { cwd: process.cwd(), env: { PATH: process.env.PATH, DEEPSEEK_API_KEY: 'test-key-not-real' } as unknown as NodeJS.ProcessEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = stdout.split('\n');
    const i = lines.findIndex((l) => l.startsWith('REVIEW '));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(6);
    const m = /^REVIEW template=(\S+) model=(\S+) at=(\S+) file_sha256=([0-9a-f]{64}) prompt_sha256=([0-9a-f]{64})$/.exec(lines[i] ?? '');
    expect(m, lines[i]).not.toBeNull();
    expect(m![1]).toBe('lens-compliance.md');
    expect(Number.isNaN(Date.parse(m![3] as string))).toBe(false);
    expect(m![4]).toBe(createHash('sha256').update(text).digest('hex'));
    const msgs = (JSON.parse((lines.find((l) => l.startsWith('DRY-RUN ')) ?? '').slice('DRY-RUN '.length)) as { messages: { content: string }[] }).messages;
    expect(m![5]).toBe(createHash('sha256').update(JSON.stringify([msgs[0]!.content, msgs[1]!.content])).digest('hex'));
  });
});
