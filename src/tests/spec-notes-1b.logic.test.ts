// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §14 (a behaviour-changing ruling updates ALL cited specs in the same commit);
//             docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b item 6 (a ruling lands with its row's next docs commit);
//             docs/specs/00-architecture/137_mcqueue.md rule 10 and Spec 69a M-246 (a dated note, the operator's words verbatim, prior text kept)
//
// FIX.SPECS (task-376, lane BL-FIXSPECS; defect D3 and its extension of docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and VERDICTS-SUMMARY-2.md):
// the specs and contract descriptors read as they did before the Increment 1·B rulings. Root test: reads committed files as text; no DB, no network.
// Each case pins one confirmed stale line to the dated note or the corrected count that now answers it,.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON
const ROOT = process.cwd();
const rt = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const rj = (p: string): Json => JSON.parse(rt(p));

const ENT = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json';
const LOOK = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json';
const CENSUS = 'scripts/surfaces/_schema/census/contracts.json';
const SPEC100 = 'docs/specs/03-mobile/100_mobile_parcel_cost_tool.md';
const SPEC126 = 'docs/specs/02-web-admin/126_maxbld_surface_standard.md';
const SPEC135 = 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md';
const MARK = 'Dated note 2026-11-20 (M-246, prior text kept; FIX.SPECS · task-376';
const METER_WORDS = "it shouldn't count the report unless the report is produced. I should only be charged a report if I find the address and lot I'm looking for and a report is produced";

/** The one note of this task inside `text` (from its marker to the end of its line); fails when it is missing. */
const noteIn = (text: string, label: string): string => {
  const at = text.indexOf(MARK);
  expect(at, `${label}: the ${MARK} note is missing`).toBeGreaterThan(-1);
  const end = text.indexOf('\n', at);
  return text.slice(at, end === -1 ? text.length : end);
};

describe('D3-a: the entitlement contract descriptor counts the fields the route sends', () => {
  const sent = [...rt('src/app/api/parcels/entitlement/types.ts').matchAll(/^\s{4}(\w+): z\./gm)].map((m) => m[1]);
  const d = rj(ENT);
  it('the route sends seven keys and the descriptor whitelist names the same seven (types.ts:12-18)', () => {
    expect(sent).toHaveLength(7);
    expect(d.inputs.field_whitelist).toEqual(sent);
  });
  it('the descriptor prose says seven, never six, in both places (under_126 and the field_whitelist_parity why)', () => {
    expect(d.docs.under_126).toContain('whitelist of seven fields');
    expect(JSON.stringify(d)).not.toMatch(/\bsix (fields|inputs)|exactly the six/);
    const parity = d.checks.find((c: Json) => c.id === 'contract_parcels_entitlement__field_whitelist_parity');
    expect(parity.why).toContain('exactly the seven inputs.field_whitelist names');
  });
});

describe('D3-ext: the lookup descriptor no longer says it changes no meter', () => {
  const story = rj(LOOK).docs.data_story as string;
  it('a dated correction answers the sentence, quotes the operator words and keeps the prior sentence as a quotation', () => {
    expect(story).toContain('Corrected 2026-11-20 (M-246, FIX.SPECS · task-376');
    expect(story).toContain(METER_WORDS);
    expect(story).toContain('RR-0278');
    expect(story).toContain('MORNING-DECISIONS.md:1082');
    expect(story).toContain('"It reads no table today and changes no meter."'); // the prior text, kept inside quotation marks
  });
  it('the sentence no longer stands unquoted', () => {
    expect(story.replace('"It reads no table today and changes no meter."', '')).not.toMatch(/It reads no table today and changes no meter\./);
  });
});

describe('D3-census: the hand-kept census mirror stays equal to both descriptors', () => {
  it.each([ENT, LOOK])('%s equals its census entry', (rel) => {
    const d = rj(rel);
    const entry = (Object.values(rj(CENSUS)) as Json[]).find((x) => x?.identity?.id === d.identity.id);
    expect(entry).toEqual(d);
  });
});

describe('D3-b: Spec 100 carries the dated note for the report-produced meter, the held page and the semi flag', () => {
  const spec = rt(SPEC100);
  const note = noteIn(spec, 'Spec 100');
  it('quotes the operator words verbatim with the register id, the decision id and the source line', () => {
    expect(note).toContain(METER_WORDS);
    expect(note).toContain('RR-0278');
    expect(note).toContain('decision-81');
    expect(note).toContain('MORNING-DECISIONS.md:1082');
  });
  it('names the three behaviours: counted only when `page` is produced, the held page of an unsure lot, the semi=answered flag', () => {
    expect(note).toContain('hasEvaluatedOption');
    expect(note).toContain('not_produced');
    expect(note).toContain('semi_pending');
    expect(note).toContain('task-360');
    expect(note).toContain('semi=answered');
    expect(note).toContain('shows the loading state');
  });
  it('writes the held page and the flag as task design, not as the operator ruling (RR-0278 does not rule the flag)', () => {
    expect(note).toContain('RR-0278 does not rule the semi flag');
    expect(note).toContain('not an operator ruling');
  });
});

describe('D3-ext: Spec 126 11a.7 names every cause of a null page, by dated note', () => {
  const s = rt(SPEC126);
  const note = noteIn(s, 'Spec 126 11a.7');
  it('the note names the causes with their tasks', () => {
    expect(note).toContain('MAXBLD_WEB_LIVE');
    expect(note).toContain('task-123');
    expect(note).toContain('task-266');
    expect(note).toContain('task-360');
    expect(note).toContain('Layer 2 stamp');
  });
  it('quotes the operator words with the register ids', () => {
    expect(note).toContain('"1. it has to happen now - read the objectives"');
    expect(note).toContain('RR-0178');
    expect(note).toContain('"2. y"');
    expect(note).toContain('RR-0271');
    expect(note).toContain(METER_WORDS);
    expect(note).toContain('RR-0278');
  });
});

describe('D3-ext: Spec 135 carries the footer ruling (MF-91, SRCH.FOOTER) on the FE-31 row', () => {
  const row = rt(SPEC135).split('\n').find((l) => l.startsWith('| FE-31 |')) ?? '';
  const note = noteIn(row, 'Spec 135 FE-31');
  it('quotes both footer rulings verbatim with their register ids and source lines', () => {
    expect(note).toContain('"1. once  -approved"');
    expect(note).toContain('RR-0270');
    expect(note).toContain('MORNING-DECISIONS.md:1061');
    expect(note).toContain('"this is a shared component"');
    expect(note).toContain('RR-0273');
    expect(note).toContain('MORNING-DECISIONS.md:1066');
  });
  it('names the row, the task and the shared component, and says the mobile report keeps its own binding', () => {
    expect(note).toContain('MF-91');
    expect(note).toContain('task-332');
    expect(note).toContain('footerNode');
    expect(note).toContain('mobile report keeps its own binding');
  });
  it('keeps the row: its lock path and the prior notes are still there', () => {
    expect(row).toContain('Lock: `src/tests/surfaces/surface-conformance.logic.test.ts`');
    expect(row).toContain('Dated note 2026-11-11 (M-246, prior text kept; rulings landing');
  });
});
