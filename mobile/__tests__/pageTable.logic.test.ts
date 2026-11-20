/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/98_mobile_testing_protocol.md (pure logic of a mobile module is a jest-node test under mobile/__tests__, lines 76-77),
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (line 164), docs/specs/02-web-admin/126_maxbld_surface_standard.md §0a principle 1 and §11b.2,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-18, FE-31.
//
// PAGE.TABLE (task-390, Increment 1·B) · moved from src/tests/surfaces/page-table.logic.test.ts (task conflict (a), grounder 2026-11-20): red and green for these cases come from Mobile CI,
// not the commit hook. The phone rows-to-props-tree builder (mobile/src/components/surfaces/PageTableBinding.tsx, import-free, read by
// relative path as the other pure mobile helpers are). Cases, on a small planted screen with a plain style table:
//   B1 a section shows only under its one positive flag; an unknown flag name throws (fail closed, never a blank page);
//   B2 a section whose platforms omit mobile is not drawn; no platforms means both;
//   B3 a button with a target value is disabled, idle-labelled and has no action while the value is null; it carries the value once set;
//   B4 busy adds the busy class and the busy accessibility state; choices check only the selected answer; the bar draws before the scroll;
//   B6 an unknown button target, choices select or screen target throws by name; the choices payload key is a row field;
//   B5 a part inside a notice shows under its own flag; the redirect value joins the root only when set.
import { pageProps, type PageScreen, type PageStyles } from '@/components/surfaces/PageTableBinding';

const S: PageStyles = {
  screen: 's', scroll: 'sc', column: 'col', bottomPadding: 7, maxWidth: 9, bar: 'bar', back: 'back', backIconSize: 3, iconColor: '#000',
  status: 'status', heading: 'head',
  notice: { error: { box: 'eb', icon: 'ei', text: 'et' }, neutral: { box: 'nb', icon: 'ni', text: 'nt' } },
  card: { idle: 'c', checked: 'cc', row: 'cr', dotIdle: 'd', dotChecked: 'dc', text: 'ct' },
  button: { default: { className: 'b', busyClassName: 'b busy', text: 'bt' }, outline: { className: 'o', busyClassName: 'o busy', text: 'ot' } },
};
const SCREEN: PageScreen = {
  prefix: 'p', contract: 'c1', binding: 'mobile/src/components/surfaces/X.tsx', platforms: ['mobile'],
  sections: [
    { kind: 'bar', id: 'header', parts: [{ role: 'back', icon: 'ChevronLeft', content: 'back.label', action: 'back' }] },
    { kind: 'status', id: 'loading', when: 'loading', content: 'state.loading' },
    { kind: 'text', id: 'question', when: 'ask', role: 'header', content: 'question.title' },
    { kind: 'text', id: 'webonly', platforms: ['web'], role: 'header', content: 'web.only' },
    { kind: 'text', id: 'both', platforms: ['web', 'mobile'], role: 'header', content: 'both.title' },
    { kind: 'choices', id: 'answer', when: 'ask', list: 'answers', select: 'selected', content: 'answer', action: 'select', arg: 'parcelId' },
    { kind: 'button', id: 'continue', when: 'ask', variant: 'default', label: 'select.label', content: 'select.go', idle: 'select.none', action: 'push', target: 'route', busy: 'busy' },
    { kind: 'notice', id: 'error', when: 'unexpected', tone: 'error', icon: 'AlertTriangle', parts: [
      { role: 'text', content: 'state.error', when: 'plain' },
      { role: 'text', content: 'state.drift', when: 'drift' },
      { role: 'button', id: 'retry', variant: 'outline', label: 'retry.label', content: 'retry.text', action: 'retry', when: 'plain' },
    ] },
  ],
};
const FLAGS = { loading: false, ask: false, unexpected: false, plain: false, drift: false, busy: false };
const VALUES = { answers: [] as string[], selected: null as string | null, route: null as string | null, navigate: null as string | null };
type N = { component: string; props: Record<string, unknown>; children: unknown[] };
const column = (t: unknown): N[] => (((t as N).children[1] as N).children[0] as N).children as N[];
const keys = (t: unknown): unknown[] => column(t).map((n) => n.props.key);

describe('B1 a section shows only under its one positive flag', () => {
  it('flags off: only the sections with no when; flag on: that section, in row order', () => {
    expect(keys(pageProps(SCREEN, FLAGS, VALUES, S))).toEqual(['both']);
    expect(keys(pageProps(SCREEN, { ...FLAGS, loading: true }, VALUES, S))).toEqual(['loading-text', 'both']);
  });
  it('RED: a when naming no flag throws', () => {
    expect(() => pageProps({ ...SCREEN, sections: [{ kind: 'status', id: 'x', when: 'nope', content: 'a.b' }] }, FLAGS, VALUES, S)).toThrow(/nope/);
  });
});

describe('B2 platforms', () => {
  it('a web-only section is not drawn on the phone; no platforms and web+mobile are drawn', () => {
    expect(keys(pageProps(SCREEN, FLAGS, VALUES, S))).not.toContain('webonly');
    expect(keys(pageProps(SCREEN, FLAGS, VALUES, S))).toContain('both');
    expect(keys(pageProps(SCREEN, { ...FLAGS, loading: true }, VALUES, S))).toContain('loading-text');
  });
});

describe('B3 and B4 buttons, busy, choices, bar', () => {
  const ask = { ...FLAGS, ask: true };
  const vals = { ...VALUES, answers: ['yes', 'no'], selected: 'no', route: '/r' };
  const cont = (t: unknown): N => column(t).find((n) => n.props.key === 'continue')!;
  it('a null target: disabled, idle label, no action', () => {
    const c = cont(pageProps(SCREEN, ask, { ...vals, route: null }, S));
    expect([c.props.disabled, c.props.onPress, c.props.accessibilityState]).toEqual([true, null, { disabled: true }]);
    expect(c.children).toEqual([{ component: 'Text', props: { key: 'continue-text', className: 'bt' }, children: [{ content: 'select.none' }] }]);
  });
  it('a set target: enabled, the value in the action; busy adds the class and the state', () => {
    const idle = cont(pageProps(SCREEN, ask, vals, S));
    expect([idle.props.disabled, idle.props.onPress, idle.props.className, idle.props.accessibilityState]).toEqual([false, { action: 'push', route: '/r' }, 'b', { disabled: false }]);
    const busy = cont(pageProps(SCREEN, { ...ask, busy: true }, vals, S));
    expect([busy.props.className, busy.props.accessibilityState]).toEqual(['b busy', { disabled: false, busy: true }]);
  });
  it('choices: one card per answer, only the selected one checked, a derived ref per index; the bar is before the scroll', () => {
    const t = pageProps(SCREEN, ask, vals, S) as N;
    const cards = column(t).filter((n) => String(n.props.key).startsWith('answer-'));
    expect(cards.map((n) => [n.props.key, (n.props.accessibilityState as { checked: boolean }).checked, n.props.onPress])).toEqual([
      ['answer-yes', false, { action: 'select', parcelId: { derived: 'answer.0' } }],
      ['answer-no', true, { action: 'select', parcelId: { derived: 'answer.1' } }],
    ]);
    expect((t.children[0] as N).props.key).toBe('header');
    expect((t.children[1] as N).props.key).toBe('scroll');
  });
});

describe('B6 names the builder is given that no value supplies', () => {
  it('RED: an unknown button target, an unknown choices select and a screen not drawn on the phone each throw by name', () => {
    const ask = { ...FLAGS, ask: true };
    expect(() => pageProps(SCREEN, ask, { answers: [], navigate: null } as never, S)).toThrow(/selected/);
    expect(() => pageProps(SCREEN, ask, { answers: [], selected: null, navigate: null } as never, S)).toThrow(/route/);
    expect(() => pageProps({ ...SCREEN, platforms: ['web'] }, FLAGS, VALUES, S)).toThrow(/mobile/);
  });
  it('a null value is the legal disabled state, not an unknown name', () => {
    expect(() => pageProps(SCREEN, { ...FLAGS, ask: true }, { ...VALUES, answers: [] }, S)).not.toThrow();
  });
  it('the choices payload key is the row field arg', () => {
    const c = column(pageProps({ ...SCREEN, sections: [{ kind: 'bar', id: 'header', parts: [] as never }, { kind: 'choices', id: 'answer', list: 'answers', select: 'selected', content: 'answer', action: 'select', arg: 'lotId' }] }, FLAGS, { ...VALUES, answers: ['yes'] }, S))[0]!;
    expect(c.props.onPress).toEqual({ action: 'select', lotId: { derived: 'answer.0' } });
  });
});

describe('B5 notice parts and the redirect value', () => {
  it('a part shows under its own flag', () => {
    const n = column(pageProps(SCREEN, { ...FLAGS, unexpected: true, drift: true }, VALUES, S)).find((x) => x.props.key === 'error')!;
    expect(n.children.map((c) => (c as N).props.key)).toEqual(['error-text']);
    const m = column(pageProps(SCREEN, { ...FLAGS, unexpected: true, plain: true }, VALUES, S)).find((x) => x.props.key === 'error')!;
    expect(m.children.map((c) => (c as N).props.key)).toEqual(['error-text', 'retry']);
  });
  it('navigate joins the root props only when set', () => {
    expect('navigate' in (pageProps(SCREEN, FLAGS, VALUES, S) as N).props).toBe(false);
    expect('navigate' in (pageProps(SCREEN, FLAGS, { ...VALUES, navigate: '' }, S) as N).props).toBe(false); // the old binding's truthy test
    expect((pageProps(SCREEN, FLAGS, { ...VALUES, navigate: '/x' }, S) as N).props.navigate).toBe('/x');
  });
});
