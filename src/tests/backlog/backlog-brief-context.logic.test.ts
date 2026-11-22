// SPEC LINK: RR-0235 (MORNING-DECISIONS.md:931) "We need them linked with all the relevant data - beyond just the data references"; Spec 08 section 7 rule 10 (a) (08_agents.md:341, the review context lives in docs/reports/reviews/<task>/); Spec 08 TKT-1 (08_agents.md:504).
// Task task-309 (R8d): backlog-brief.mjs writes the McLane context pack after its G1 sections: milestone, document sections, decisions naming the task, prior reviews and lane reports, dependencies. Synthetic project, no loader.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { backlog, makeProject, mk, script } from './helpers';

const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}`).join('\n') + '\n';
const put = (d: string, rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };

function fixture(extraDocs: string[] = []) {
  const d = makeProject();
  put(d, 'backlog/milestones/m-7 - increment-seven.md', '---\nid: m-7\ntitle: "Increment Seven"\n---\n\n## Description\n\nMILESTONE-DESC-TEXT\n\n## Objectives\n- MILESTONE-OBJECTIVE\n\n## Deliverable\n- MILESTONE-DELIVERABLE\n\n## Specs\n- MILESTONE-SPEC\n\n## Register rulings of this group (operator words)\n- RR-0777 MILESTONE-RULING\n\n## Documents\n- [milestone doc](docs/mdoc.md#L2-3)\n');
  put(d, 'docs/spec.md', lines(100, 'spec'));
  put(d, 'docs/big.md', lines(2000, 'bigfile-padding-padding'));
  put(d, 'docs/sec.md', '# Title\n\n## Alpha rules\nALPHA-BODY-1\nALPHA-BODY-2\n\n## Beta rules\nBETA-BODY\n');
  put(d, 'docs/mdoc.md', 'mdoc one\nmdoc two\nmdoc three\nmdoc four\n');
  const dep = mk(d, 'Dependency item', ['-l', 'plan:DEP.1']);
  backlog(d, ['task', 'edit', dep, '--final-summary', 'DEP-FINAL-SUMMARY-TEXT', '-s', 'BUILT']);
  const doc = ['--doc', 'docs/spec.md#L10-12', '--doc', 'docs/sec.md#Alpha rules', '--doc', 'docs/big.md', ...extraDocs];
  const task = mk(d, 'Context pack subject', ['-l', 'plan:SUBJ.1,F', '-m', 'm-7', '--dep', dep, '--ac', 'one', '--ref', 'ROW:MB-55', ...doc]);
  return { d, task, dep };
}
const brief = (d: string, task: string, extra: string[] = []) => script('scripts/analysis/backlog-brief.mjs', ['--task', task, '--lane', 'BL-R1', '--stage', '2', '--root', d, '--date', '2026-11-19', ...extra]);
const ctxOf = (d: string, task: string) => fs.readFileSync(path.join(d, `docs/reports/reviews/${task}/context-r1.md`), 'utf8');
const section = (ctx: string, name: string) => new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## (?:Milestone|Document sections|Decisions naming this task|Prior reviews and lane reports|Dependencies)\\n|$)`).exec(ctx)?.[1] ?? '';

describe('G1 context pack (task-309, RR-0235)', () => {
  it('writes the new sections after the existing ones, in order', () => {
    const { d, task } = fixture();
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    const ctx = ctxOf(d, task);
    const at = ['## Decisions in force', '## Milestone\n', '## Document sections\n', '## Decisions naming this task\n', '## Prior reviews and lane reports\n', '## Dependencies\n'].map((h) => ctx.indexOf(h));
    expect(at.every((i) => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('the printed brief gains one line naming the new sections and still carries the context sha', () => {
    const { d, task } = fixture();
    const r = brief(d, task);
    expect(r.stdout).toMatch(/^Context pack sections:.*Milestone.*Document sections.*Decisions naming this task.*Prior reviews and lane reports.*Dependencies/m);
    expect(r.stdout).not.toContain('plan-review-deepseek.md'); // task-423 D2: the brief orders no plan review (RR-0374)
    expect(r.stdout).not.toContain('deepseek-review.js plan');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(d, `docs/reports/reviews/${task}/context-r1.md`))).digest('hex');
    expect(r.stdout).toContain(sha.slice(0, 12));
  });

  it('## Milestone carries the milestone body: description, objectives, deliverable, specs, register rulings, Documents', () => {
    const { d, task } = fixture();
    brief(d, task);
    const m = section(ctxOf(d, task), 'Milestone');
    for (const s of ['MILESTONE-DESC-TEXT', 'MILESTONE-OBJECTIVE', 'MILESTONE-DELIVERABLE', 'MILESTONE-SPEC', 'RR-0777 MILESTONE-RULING', 'Documents']) expect(m, s).toContain(s);
  });

  it('a task with no milestone file gets one stated line, not a crash', () => {
    const { d, task } = fixture();
    fs.rmSync(path.join(d, 'backlog/milestones/m-7 - increment-seven.md'));
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    expect(section(ctxOf(d, task), 'Milestone')).toMatch(/no milestone file/i);
  });

  it('## Document sections: a #L range gives exactly those lines, headed with path and line range and ended with the read-the-rest line', () => {
    const { d, task } = fixture();
    brief(d, task);
    const s = section(ctxOf(d, task), 'Document sections');
    expect(s).toContain('docs/spec.md lines 10-12 of 100');
    expect(s).toContain('spec line 10\nspec line 11\nspec line 12\n');
    expect(s).not.toContain('spec line 13');
    expect(s).toContain('(read the rest at docs/spec.md)');
  });

  it('a section title in the link gives that section only; the milestone Documents links are read too', () => {
    const { d, task } = fixture();
    brief(d, task);
    const s = section(ctxOf(d, task), 'Document sections');
    expect(s).toContain('ALPHA-BODY-1');
    expect(s).toContain('ALPHA-BODY-2');
    expect(s).not.toContain('BETA-BODY');
    expect(s).toContain('(read the rest at docs/sec.md)');
    expect(s).toContain('mdoc two\nmdoc three');
    expect(s).not.toContain('mdoc four');
  });

  it('with no section named: the first 12 KB, line range stated, read-the-rest line; and the 120 KB cap is stated and holds', () => {
    const many = Array.from({ length: 12 }, (_, i) => ['--doc', `docs/extra${i}.md`]).flat();
    const { d, task } = fixture(many);
    for (let i = 0; i < 12; i++) put(d, `docs/extra${i}.md`, lines(2000, `extra${i}-padding-padding`));
    brief(d, task);
    const s = section(ctxOf(d, task), 'Document sections');
    expect(s).toMatch(/docs\/big\.md lines 1-\d+ of 2000/);
    expect(s).not.toContain('bigfile-padding-padding line 2000');
    expect(s).toContain('(read the rest at docs/big.md)');
    expect(s).toMatch(/Cap: 120 KB in total, 12 KB per block/);
    expect(Buffer.byteLength(s)).toBeLessThanOrEqual(120 * 1024 + 4096);
    expect(s).toMatch(/omitted: total cap/i);
  });

  it('a linked file that does not exist is one stated line, not a crash', () => {
    const { d, task } = fixture(['--doc', 'docs/missing.md']);
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    expect(section(ctxOf(d, task), 'Document sections')).toMatch(/docs\/missing\.md.*not readable|not found/i);
  });

  it('an empty linked file and a range that runs past the end are stated, not hidden', () => {
    const { d, task } = fixture(['--doc', 'docs/empty.md', '--doc', 'docs/spec.md#L90-200']);
    put(d, 'docs/empty.md', '');
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    const s = section(ctxOf(d, task), 'Document sections');
    expect(s).toContain('docs/empty.md (empty file)');
    expect(s).toMatch(/docs\/spec\.md lines 90-100 of 100 \(range L90-200 runs past the end/);
  });

  it('## Decisions naming this task: a decision naming the plan id or the task id gets its operator quote and cite; one naming neither is absent', () => {
    const { d, task } = fixture();
    put(d, 'backlog/decisions/decision-1 - RR-0501-x.md', '---\nid: decision-1\ntitle: "RR-0501 2026-11-19 · a ruling on the subject"\ndate: 2026-11-19\nstatus: accepted\n---\n## Context\n\nAbout plan SUBJ.1 only.\n\n## Decision\n\nOperator, verbatim, 2026-11-19: "PLAN-QUOTE-WORDS here"\n\nCite: ~/x/MORNING.md:12\n');
    put(d, 'backlog/decisions/decision-2 - RR-0502-y.md', '---\nid: decision-2\ntitle: "RR-0502 2026-11-19 · an unrelated ruling"\ndate: 2026-11-19\nstatus: accepted\n---\n## Context\n\nAbout SUBJ.10 and MB-5 and something else.\n\n## Decision\n\nOperator, verbatim, 2026-11-19: "UNRELATED-QUOTE"\n\nCite: ~/x/MORNING.md:99\n');
    put(d, 'backlog/decisions/decision-3 - RR-0503-z.md', `---\nid: decision-3\ntitle: "RR-0503 by id"\ndate: 2026-11-19\nstatus: accepted\n---\n## Context\n\nNames ${task} and row MB-55.\n\n## Decision\n\nOperator, verbatim, 2026-11-19: "TASKID-QUOTE"\n\nCite: ~/x/MORNING.md:7\n`);
    brief(d, task);
    const s = section(ctxOf(d, task), 'Decisions naming this task');
    expect(s).toContain('RR-0501');
    expect(s).toContain('"PLAN-QUOTE-WORDS here"');
    expect(s).toContain('~/x/MORNING.md:12');
    expect(s).toContain('"TASKID-QUOTE"');
    expect(s).not.toContain('UNRELATED-QUOTE');
  });

  it('## Prior reviews and lane reports lists the other review files and the lane reports naming the task, for the task and its dependency', () => {
    const { d, task, dep } = fixture();
    put(d, `docs/reports/reviews/${task}/r1-plan.md`, 'a review\n');
    put(d, `docs/reports/reviews/${dep}/r1-plan.md`, 'a dependency review\n');
    put(d, 'docs/reports/lanes/20261119/BL-R9/REPORT.md', `Lane BL-R9 built ${task}.\n`);
    put(d, 'docs/reports/lanes/20261119/BL-R0/REPORT.md', 'Lane BL-R0 built something else, task-99999.\n');
    put(d, `docs/reports/reviews/${task}/context-2026-11-18.md`, 'an older generated context file\n');
    brief(d, task);
    const s = section(ctxOf(d, task), 'Prior reviews and lane reports');
    expect(s).toContain(`docs/reports/reviews/${task}/r1-plan.md`);
    expect(s).toContain(`docs/reports/reviews/${dep}/r1-plan.md`);
    expect(s).toContain('docs/reports/lanes/20261119/BL-R9/REPORT.md');
    expect(s).not.toContain('BL-R0');
    expect(s).not.toContain('context-r1.md');
    expect(s).not.toContain('context-2026-11-18.md');
  });

  it('## Dependencies carries each dependency id, title, status and its Final Summary', () => {
    const { d, task, dep } = fixture();
    brief(d, task);
    const s = section(ctxOf(d, task), 'Dependencies');
    expect(s).toContain(dep);
    expect(s).toContain('Dependency item');
    expect(s).toMatch(/status: BUILT/);
    expect(s).toContain('DEP-FINAL-SUMMARY-TEXT');
  });

  it('the context sha in the brief changes when a linked document changes', () => {
    const { d, task } = fixture();
    const a = brief(d, task).stdout;
    put(d, 'docs/spec.md', lines(100, 'changed'));
    const b = brief(d, task).stdout;
    const sha = (o: string) => /sha256=([0-9a-f]{12})/.exec(o)?.[1];
    expect(sha(a)).toBeDefined();
    expect(sha(a)).not.toBe(sha(b));
  });
});

describe('task-375 A1/A5: the review context holds the plan and the notes; one file per round', () => {
  it('writes "## Implementation Plan" and "## Implementation Notes" from the task, and a plan heading inside the text cannot end the section', async () => {
    const { d, task } = fixture();
    backlog(d, ['task', 'edit', task, '--plan', 'PLAN-LINE-ONE\n# Inner heading\nPLAN-LINE-TWO', '--append-notes', 'NOTE-LINE-ONE']);
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    const ctx = ctxOf(d, task);
    expect(ctx).toMatch(/^## Implementation Plan\n[\s\S]*PLAN-LINE-ONE[\s\S]*PLAN-LINE-TWO/m);
    expect(ctx).toMatch(/^## Implementation Notes\n[\s\S]*NOTE-LINE-ONE/m);
    expect(ctx.indexOf('## Implementation Plan')).toBeGreaterThan(ctx.indexOf('## Acceptance criteria'));
    const rt = await import('../../../scripts/lib/review-template.js');
    expect(rt.extractSections(ctx, ['Implementation Plan'])).toContain('PLAN-LINE-TWO');
  });
  it('control: a task with no plan and no notes still has both headings, reading (none)', () => {
    const { d, task } = fixture();
    brief(d, task);
    const ctx = ctxOf(d, task);
    expect(ctx).toMatch(/^## Implementation Plan\n\(none\)/m);
    expect(ctx).toMatch(/^## Implementation Notes\n\(none\)/m);
  });
  it('a later brief writes context-r2.md and leaves context-r1.md as it was (never overwritten)', () => {
    const { d, task } = fixture();
    brief(d, task);
    const r1 = path.join(d, `docs/reports/reviews/${task}/context-r1.md`);
    const before = fs.readFileSync(r1, 'utf8');
    backlog(d, ['task', 'edit', task, '--append-notes', 'LATER-NOTE']);
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(r1, 'utf8')).toBe(before);
    expect(fs.readFileSync(path.join(d, `docs/reports/reviews/${task}/context-r2.md`), 'utf8')).toContain('LATER-NOTE');
    expect(r.stdout).toContain(`${task}/context-r2.md`);
  });
});

// task-432 (INPUTS.4, RR-0378 step 5): --board reads the decisions from the board checkout, so a re-run in a lane worktree sees the rulings made after the lane was cut.
describe('backlog-brief --board (task-432)', () => {
  const dec = (n: number, rr: string, task: string, quote: string) => `---\nid: decision-${n}\ntitle: "${rr} 2026-11-22 · a ruling"\ndate: 2026-11-22\nstatus: accepted\n---\n## Context\n\nNames ${task}.\n\n## Decision\n\nOperator, verbatim, 2026-11-22: "${quote}"\n\nCite: ~/x/MORNING.md:${n}\n`;
  const setup = () => {
    const { d, task } = fixture();
    put(d, 'backlog/decisions/decision-1 - RR-0501-x.md', dec(1, 'RR-0501', task, 'LANE-COPY-QUOTE'));
    const b = path.join(d, '..', `board-${path.basename(d)}`);
    put(b, 'backlog/decisions/decision-9 - RR-0900-x.md', dec(9, 'RR-0900', task, 'BOARD-ONLY-QUOTE'));
    return { d, task, b };
  };
  const names = (d: string, task: string) => section(ctxOf(d, task), 'Decisions naming this task');
  const inForce = (d: string, task: string) => /## Decisions in force[^\n]*\n([\s\S]*?)\n## /.exec(ctxOf(d, task))?.[1] ?? '';
  it('T1 plant: with --board the decisions come from the board checkout (RR-0900 in both sections)', () => {
    const { d, task, b } = setup();
    const r = brief(d, task, ['--board', b]); expect(r.status, r.stderr).toBe(0);
    expect(names(d, task)).toContain('RR-0900');
    expect(names(d, task)).toContain('"BOARD-ONLY-QUOTE"');
    expect(inForce(d, task)).toContain('RR-0900');
  });
  it('T1 control (a): without --board the root decisions are read, as before (RR-0501 present, RR-0900 absent)', () => {
    const { d, task } = setup();
    const r = brief(d, task); expect(r.status, r.stderr).toBe(0);
    expect(names(d, task)).toContain('RR-0501');
    expect(names(d, task)).not.toContain('RR-0900');
  });
  it('T1 control (b): with --board a decision only in the root is absent (the board is the source)', () => {
    const { d, task, b } = setup();
    brief(d, task, ['--board', b]);
    expect(names(d, task)).not.toContain('RR-0501');
    expect(inForce(d, task)).not.toContain('RR-0501');
  });
  it('T2 plant: a board with no backlog/decisions exits 1 naming it and writes no context file', () => {
    const { d, task } = setup();
    const empty = path.join(d, '..', `noboard-${path.basename(d)}`); fs.mkdirSync(empty, { recursive: true });
    const r = brief(d, task, ['--board', empty]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(empty);
    expect(fs.existsSync(path.join(d, `docs/reports/reviews/${task}`))).toBe(false);
  });
  it('T2 plant: a bare --board with no value exits 1 and writes no context file', () => {
    const { d, task } = setup();
    const r = script('scripts/analysis/backlog-brief.mjs', ['--task', task, '--lane', 'BL-R1', '--stage', '2', '--root', d, '--date', '2026-11-19', '--board']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--board/);
    expect(fs.existsSync(path.join(d, `docs/reports/reviews/${task}`))).toBe(false);
  });
  it('T2 control: a good board exits 0 and writes context-r1.md', () => {
    const { d, task, b } = setup();
    expect(brief(d, task, ['--board', b]).status).toBe(0);
    expect(fs.existsSync(path.join(d, `docs/reports/reviews/${task}/context-r1.md`))).toBe(true);
  });
});
