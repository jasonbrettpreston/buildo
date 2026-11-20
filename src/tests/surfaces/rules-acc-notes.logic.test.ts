// SPEC LINK: docs/specs/00-architecture/137_mcqueue.md rule 10 (:123, the operator's words are copied exactly with the date; prior text kept), section 3 (:21, :84, DROPPED carries a quoted ruling),
//            docs/specs/00_engineering_standards.md section 14 (a behaviour-changing ruling updates all cited specs in the same commit),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md (810, and the MF-46 follow-up note on the Help opener), docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (123),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-39, scripts/surfaces/_schema/bindings.json touch_targets.
//
// RULES.ACC (task-387, lane BL-RULESACC, Increment 1·B McFix). A text lock: the dated notes the operator's 2026-11-20 rulings called for exist, each carries his words
// verbatim with the line of the decisions log, the earlier wording is kept (M-246), (The retire list and the by-law count are an operator draft in the lane report, not locked here. The two status moves of task-370 and task-348 are checked by the queue check, Spec 137 section 6 item 7, not here: a status set by a code commit needs a lane assignee, check-lane-close.) It reads files only; no database, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NOTE = 'Dated note 2026-11-20 (M-246, prior text kept; RULES.ACC · task-387';
const MD = 'MORNING-DECISIONS.md';

const SPEC126 = read('docs/specs/02-web-admin/126_maxbld_surface_standard.md');
const SPEC100 = read('docs/specs/03-mobile/100_mobile_parcel_cost_tool.md');
const SPEC135 = read('docs/specs/02-web-admin/135_mcfrontend_decisions_register.md');
const BINDINGS: { $comment: string } = JSON.parse(read('scripts/surfaces/_schema/bindings.json'));
const noteOf = (text: string, anchor: string): string => {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error(`note anchor not found: ${anchor}`);
  const j = text.indexOf('Dated note ', i + anchor.length); // the window ends where the next dated note starts
  return j < 0 ? text.slice(i) : text.slice(i, j);
};

describe('RULES.ACC dated notes in the operator words (task-387)', () => {
  it('Spec 126 carries the C2 correction with his words "1 a" and the log line', () => {
    const n = noteOf(SPEC126, `${NOTE} · C2`);
    expect(n).toContain('operator, verbatim: "1 a"');
    expect(n).toContain(`${MD}:1399`);
    expect(n).toContain('Try again');
  });
  it('Spec 126 carries the C4 note on the Help sheet resting on his "1-12 yes", not on a description of the code', () => {
    const n = noteOf(SPEC126, `${NOTE} · C4`);
    expect(n).toContain('1-12 yes');
    expect(n).toContain('open-questions.md:1016');
  });
  it('Spec 100 carries C2 stands, C5, the meter location ("2. y") and C1 as verified, each marked as ruled or not', () => {
    const n = noteOf(SPEC100, `${NOTE} · C2, C5, C1, meter`);
    expect(n).toContain('operator, verbatim: "4 a"');
    expect(n).toContain('operator, verbatim: "2. y"');
    expect(n).toContain(`${MD}:1432`);
    expect(n).toMatch(/C1[\s\S]*NOT an operator ruling/);
  });
  it('Spec 135 FE-39 carries the C5 note with "4 a"', () => {
    const row = SPEC135.split('\n').find((l) => l.startsWith('| FE-39 |')) ?? '';
    expect(row).toContain(`${NOTE} · C5`);
    expect(row).toContain('operator, verbatim: "4 a"');
  });
  it('bindings.json adds the note that the 48 px is the operator\'s ruling "3 a"', () => {
    const n = noteOf(BINDINGS.$comment, `${NOTE} · D13`);
    expect(n).toContain('operator, verbatim: "3 a"');
    expect(n).toContain(`${MD}:1399`);
  });
});
