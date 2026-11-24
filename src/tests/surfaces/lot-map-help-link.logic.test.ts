// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (props goldens, content file one source; regenerated, never hand-edited),
//            §11b.7 (the support inbox is ONE setting; the Help page reads it), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31, FE-32 (every value a ref), docs/specs/00-architecture/137_mcqueue.md rule 10 (M-246 dated notes keep the prior text).
//
// SRCH.C12 (task-321, Increment 1·B; McFrontend follow-up row on MF-53) · the help link of the choose-your-lot page, as small-pages-v8 draws it:
//   C.12  "Not sure which lot? Get help with an address" under the cards of the multi-lot state (choose-lot.html:279);
//   B.7   "Get help with an address" under each of the three address-confusion notices (choose-lot-states.html:267, :278, :289):
//         intersection, no lot linked, many lots.
// Every link opens Help & Support through the existing action `open_help` (mobile/src/lib/maxbldHelp.ts) with the built Help topic (lot_match on the lot map, address_match under the notices; v8 names wrong-lot) and the typed query. Operator RR-0299 (MORNING-DECISIONS.md:1155): the support address is a placeholder until launch;
// this page reads no setting and writes none. Root test: reads committed files as text, no DB, no network, no mobile import.
// Dated 2026-11-24 (SEARCHFIX.3, task-451; doc-2 B.7 (doc-2:49) "to /help?topic=wrong-lot"; prior text above kept): every link of the page now opens the
// topic wrong-lot, which the Help page has since task-450 (web_help, "Wrong address or lot"); the old topics lot_match and address_match stay on the Help page.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const SURF = 'scripts/surfaces/parcel_product/F01/surfaces';
const MAP = 'mobile_parcel_disambiguation_map';
const GOLD = `src/tests/fixtures/surfaces/${MAP}`;
const content: Record<string, string> = rj(`${SURF}/${MAP}.content.json`);
const slice = rj(`mobile/src/generated/surfaces/${MAP}.json`).content as Record<string, string>;
const golden = (name: string): Json => rj(`${GOLD}/${name}.mobile.json`);

const PROMPT = 'Not sure which lot?';
const LINK = 'Get help with an address';
/** The closed classification of every committed golden: a new state fails until it is placed here. */
const WITH_ROW = ['multi_parcel_2', 'multi_parcel_3plus'];
const WITH_LINK: Record<string, string> = { intersection: 'parcel-lotmap-intersection', too_many_lots: 'parcel-lotmap-too-many', unlinked: 'parcel-lotmap-unlinked' };
const NONE = ['error', 'loading', 'rate_limited', 'redirect', 'schema_drift', 'unauthorized'];

/** Every node (depth first) whose props.testID equals `id`. */
const allByTestId = (n: Json, id: string): Json[] => [
  ...(n?.props?.testID === id ? [n] : []),
  ...((n?.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap((c) => allByTestId(c, id)),
];
/** The children of the page column of a golden. */
const column = (g: Json): Json[] => allByTestId(g.props, 'parcel-lotmap-column')[0]!.children as Json[];
const HELP = 'parcel-lotmap-help';
// The built Help topics are the binding (orchestrator reading under build-with-existing-bindings; v8 names wrong-lot, which the Help page lacks):
// the lot map link is lot_match ("Report incorrect lot match"), the address-notice links are address_match (web_help.content.json:7, :11).
// Dated 2026-11-24 (SEARCHFIX.3, task-451; prior reading above kept): the Help page has the topic wrong-lot since task-450, so every link takes it (doc-2:49).
const openHelp = (topic: string) => ({ action: 'open_help', topic, q: { derived: 'query' } });
const TOPIC = 'wrong-lot';

describe('SRCH.C12: the two v8 strings', () => {
  it('the content file and the generated slice carry the v8 text under help.lot.prompt and help.address.link', () => {
    expect([content['help.lot.prompt'], content['help.address.link']]).toEqual([PROMPT, LINK]);
    expect([slice['help.lot.prompt'], slice['help.address.link']]).toEqual([PROMPT, LINK]);
  });
});

describe('SRCH.C12 C.12: the multi-lot state ends with "Not sure which lot? Get help with an address"', () => {
  // Dated 2026-11-19 (task-362 SRCH.LOTMAP-2; small-pages-v8 choose-lot.html:278-279): the designed order is the Choose a lot button, then the hint
  // line "Pick a lot on the map or in the list." while nothing is picked, then the help row. Golden multi_parcel_2 is nothing picked: the tail is
  // [continue, pick-hint, help-row]. Golden multi_parcel_3plus has a lot picked: the tail is [continue, help-row] and there is no hint.
  const NOTHING_PICKED = ['multi_parcel_2'];
  const PICKED = ['multi_parcel_3plus'];
  it.each(NOTHING_PICKED)('%s: nothing picked: the tail is the button, the hint line, then the help row', (name) => {
    const col = column(golden(name));
    expect(col.slice(-3).map((c) => c.props.key)).toEqual(['continue', 'pick-hint', 'help-row']);
    expect(col.at(-2)!.props.testID).toBe('parcel-lotmap-pick-hint');
    expect(col.at(-2)!.children).toEqual([{ content: 'select.hint' }]);
    expect(content['select.hint']).toBe('Pick a lot on the map or in the list.');
  });
  it.each(PICKED)('%s: a lot picked: the tail is the button then the help row, no hint line', (name) => {
    const col = column(golden(name));
    expect(col.slice(-2).map((c) => c.props.key)).toEqual(['continue', 'help-row']);
    expect(allByTestId(golden(name).props, 'parcel-lotmap-pick-hint')).toEqual([]);
  });
  it('the two multi-lot goldens are exactly the nothing-picked and the picked case', () => {
    expect([...NOTHING_PICKED, ...PICKED].sort()).toEqual([...WITH_ROW].sort());
  });
  it.each(WITH_ROW)('%s: the help row follows the button (and its hint line when shown): the prompt text and the link button to Help with topic wrong-lot', (name) => {
    const col = column(golden(name));
    const at = col.findIndex((c) => c.props?.testID === 'parcel-lotmap-continue');
    expect(at).toBeGreaterThan(-1);
    const row = col[at + (NOTHING_PICKED.includes(name) ? 2 : 1)]!;
    expect(row.component).toBe('View');
    expect(row.props.testID).toBe('parcel-lotmap-help-row');
    const [prompt, link] = row.children as Json[];
    expect(prompt!.component).toBe('Text');
    expect(prompt!.children).toEqual([{ content: 'help.lot.prompt' }]);
    expect(link!.component).toBe('Button');
    expect(link!.props.testID).toBe(HELP);
    expect([link!.props.variant, link!.props.accessibilityRole]).toEqual(['link', 'link']);
    expect(link!.props.onPress).toEqual(openHelp(TOPIC));
    expect(link!.children[0].children).toEqual([{ content: 'help.address.link' }]);
    expect(allByTestId(golden(name).props, HELP)).toHaveLength(1);
  });
});

describe('SRCH.C12 B.7: the link under each address-confusion notice', () => {
  it.each(Object.entries(WITH_LINK))('%s: the link button follows the notice, and there is no prompt text (v8 draws the link alone)', (name, noticeId) => {
    const col = column(golden(name));
    const at = col.findIndex((c) => c.props?.testID === noticeId);
    expect(at).toBeGreaterThan(-1);
    const link = col[at + 1]!;
    expect(link.component).toBe('Button');
    expect(link.props.testID).toBe(HELP);
    expect([link.props.variant, link.props.accessibilityRole]).toEqual(['link', 'link']);
    expect(link.props.onPress).toEqual(openHelp(TOPIC));
    expect(link.children[0].children).toEqual([{ content: 'help.address.link' }]);
    expect(allByTestId(golden(name).props, HELP)).toHaveLength(1);
    expect(allByTestId(golden(name).props, 'parcel-lotmap-help-row')).toEqual([]);
  });
  it.each(NONE)('%s: no help link (v8 draws none on the loading and error states)', (name) => {
    expect(allByTestId(golden(name).props, HELP)).toEqual([]);
    expect(allByTestId(golden(name).props, 'parcel-lotmap-help-row')).toEqual([]);
  });
  it('every committed golden is classified above (a new state must be placed here)', () => {
    const files = fs.readdirSync(path.join(ROOT, GOLD)).filter((f) => f.endsWith('.mobile.json')).map((f) => f.replace('.mobile.json', '')).sort();
    expect(files).toEqual([...WITH_ROW, ...Object.keys(WITH_LINK), ...NONE].sort());
  });
});

describe('SEARCHFIX.3 B.7: the map topic is a Help page topic (task-451)', () => {
  it('wrong-lot is a mailto topic of web_help in the page table, so the link lands on a listed topic', () => {
    const table = rj('scripts/surfaces/_schema/static-page.json');
    const topics = (table.pages.web_help.static.sections as Json[]).flatMap((s) => (s.parts as Json[]).filter((p) => p.role === 'mailto').map((p) => p.topic));
    expect(topics).toContain(TOPIC);
  });
});

describe('SRCH.C12: the host passes the action, and the page reads and writes nothing new', () => {
  it('disambiguate.tsx hands open_help (the existing openHelp) to the renderer', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mobile/app/(app)/parcel-tool/disambiguate.tsx'), 'utf8');
    expect(src).toContain("import { openHelp } from '@/lib/maxbldHelp';");
    expect(src).toMatch(/open_help: openHelp/);
  });
  it('the binding names no setting and no mail link; the only data ref of the link is the existing derived query', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mobile/src/components/surfaces/LotMapBinding.tsx'), 'utf8');
    expect(src).not.toMatch(/maxbld_support_inbox|mailto:/);
    expect(JSON.stringify(golden('intersection').props)).not.toMatch(/maxbld_support_inbox|mailto/);
  });
});

describe('SRCH.C12: the dated note on the parent queue row (M-246, prior text kept)', () => {
  const queue = fs.readFileSync(path.join(ROOT, '.cursor/MCFRONTEND-QUEUE.md'), 'utf8');
  const start = queue.indexOf('\n**MF-53 ');
  const row = queue.slice(start, queue.indexOf('\n**MF-54 ', start));
  it('MF-53 carries a 2026-11-19 note quoting RR-0299 and keeps the earlier notes', () => {
    expect(row).toContain('Dated note 2026-11-19 (M-246, prior text kept; MF-53 · McFrontend queue · lane BL-C12, task-321 SRCH.C12');
    expect(row).toContain('C12 - is a fake email address until launch');
    expect(row).toContain('Dated note 2026-11-19 (M-246, prior text kept; MF-53 · McFrontend queue · lane BL-C12, task-321 follow-up: Help topics');
    expect(row).toContain('topic lot_match');
    expect(row).toContain('topic address_match');
    expect(row).toContain('Dated note 2026-11-19 (M-246, prior text kept; MF-53 · McFrontend queue · lane BL-LOTCARD');
  });
});
