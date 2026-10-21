// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 4 ("A rule kept in compute rather than declared
//            data must still be written down — as a check's `why`, not a comment."); 124a §B19 item 3 (3) and (5);
//            REFREEZE-BUNDLE-1 items (3) and (5) (124a:457), split by R-II; defects N-D21 and N-D22.
//
// The publisher-vocabulary rules the census pivot keeps in compute are written in `read_this_way[0]` of
// scripts/load-neighbourhoods.notes.json: N-D21, the U+2019 -> U+0027 apostrophe normalisation of the characteristic
// label; N-D22, the five `startsWith('Total - …')` section-anchor prefixes. Locked both directions against the compute:
// the notes list exactly the prefixes the compute matches, and the normalisation the compute runs is named.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const NOTES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/load-neighbourhoods.notes.json'), 'utf8')) as {
  read_this_way: Array<{ what: string; measured: { value: Record<string, unknown>; query: string } }>;
};
const COMPUTE = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/compute/load-neighbourhoods.js'), 'utf8');
const entry = NOTES.read_this_way[0]!;

describe('N-D21 / N-D22 — the label normalisation and the section anchors are written in read_this_way[0]', () => {
  it('N-D22: measured.value.section_anchor_prefixes equals the compute\'s five startsWith prefixes, in order', () => {
    const inCompute = [...COMPUTE.matchAll(/characteristic\.startsWith\('(Total - [^']+)'\)/g)].map((m) => m[1]);
    expect(inCompute).toHaveLength(5);
    expect(entry.measured.value.section_anchor_prefixes).toEqual(inCompute);
    for (const p of inCompute) expect(entry.what, p).toContain(p);
  });

  it('N-D21: the U+2019 -> U+0027 normalisation the compute runs is named, with the label it serves', () => {
    expect(COMPUTE).toContain(`characteristic.replace(/’/g, "'") === "Bachelor's degree or higher"`);
    expect(entry.what).toContain('U+2019');
    expect(entry.measured.value.apostrophe_normalisation).toEqual({ from: '’', to: "'", label: "Bachelor's degree or higher" });
  });
});
