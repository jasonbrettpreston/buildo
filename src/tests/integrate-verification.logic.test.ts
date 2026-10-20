// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EZ
//
// Spec 124 R-EZ (McDonald's Airtight V3, operator y 2026-10-20: "y on 2 and 4"): before an integrate-N branch is
// built, a fresh lane that did not write the work verifies every landing lane's claims; the report is saved under
// docs/reports/verification/<branch>.md and the integrate commit cites it. The commit-msg hook observes the cite.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { integrateVerificationDecision, verificationPathFor } from '../../scripts/hooks/check-integrate-verification.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');
const has = (set: string[]) => (rel: string) => set.includes(rel);

describe('R-EZ — an integrate-N commit cites its verification report', () => {
  it('a non-integrate branch, or a detached HEAD, is not triggered', () => {
    expect(integrateVerificationDecision('wf2/v3-label-strict', 'feat: x', has([])).ok).toBe(true);
    expect(integrateVerificationDecision(null, 'feat: x', has([])).ok).toBe(true);
    expect(integrateVerificationDecision('wf2/p4-integrate', 'feat: x', has([])).ok).toBe(true);
  });

  it('RED: an integrate-N commit with no citation, or citing a report that is not in the index', () => {
    const b = 'wf2/p4-integrate-11';
    expect(verificationPathFor(b)).toBe('docs/reports/verification/wf2/p4-integrate-11.md');
    expect(integrateVerificationDecision(b, 'merge: lanes', has([])).ok).toBe(false);
    expect(integrateVerificationDecision(b, 'merge\n\n# docs/reports/verification/wf2/p4-integrate-11.md', has([verificationPathFor(b)])).ok).toBe(false);
    expect(integrateVerificationDecision(b, 'merge\n\nVerified: docs/reports/verification/wf2/p4-integrate-11.md', has([])).ok).toBe(false);
  });

  it('GREEN: cited and present', () => {
    const b = 'wf2/p4-integrate-11';
    expect(integrateVerificationDecision(b, 'merge\n\nVerified: docs/reports/verification/wf2/p4-integrate-11.md', has([verificationPathFor(b)])).ok).toBe(true);
  });

  it('the commit-msg hook runs the check with the message file', () => {
    expect(fs.readFileSync(path.join(REPO_ROOT, '.husky/commit-msg'), 'utf8')).toMatch(/node scripts\/hooks\/check-integrate-verification\.mjs "\$1"/);
  });
});
