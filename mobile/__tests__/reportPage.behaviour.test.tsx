// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-33 (one render smoke per archetype per platform: the mobile REPORT case),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2, §11b.4 dated notes 2026-11-11 (MF-48: the host and the existing bottom
//            sheet), docs/specs/03-mobile/98_mobile_testing_protocol.md 98:79 dated note 2026-11-10 (H9: a render smoke is not a snapshot);
//            approved mock v21 behaviour (oq "mock v13 details panels": one panel open per option, "Hide details" while open; H0 the sheet).
//
// MF-48 · the mobile REPORT render smoke and behaviour (Stage A: the host mounted in the test, nowhere in the app). The page goldens render through
// ReportPageHost and the shared SurfaceRenderer without a throw; the panels, How?, the sheet and the read-only sheet controls behave as on the web
// (ReportPageToggles); the lifecycle states show their approved texts. @gorhom/bottom-sheet is its published jest mock (children always rendered),
// so the sheet's open state is read from its `index` prop (0 open, -1 closed).
require('react-native-css-interop/test');
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { BackHandler } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ReportPageHost, REPORT_UI } from '@/components/surfaces/ReportPageHost';
import { SurfaceRenderer, type ReportActions, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { LIFECYCLE_CONTENT_KEYS, REPORT_SLICE, REPORT_UI_CLOSED, SCREEN_CONTENT_KEYS, type LifecycleState, type PageView } from '@/components/surfaces/ReportBinding';

// The published mock has no __esModule flag, so its `default` is spread under one for the default import.
jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...jest.requireActual('@gorhom/bottom-sheet/mock') }));

type Json = Record<string, unknown>;
const REPO = path.resolve(__dirname, '..', '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'));
const view = (state: string): PageView => rj(`src/tests/fixtures/report-page/props/${state}.mobile.json`).view as PageView;
const lifecycle = ((rj('scripts/surfaces/_schema/report-presentation.json').states as Json).lifecycle) as Record<string, string>;
const CONTENT: Record<string, string> = {
  ...Object.fromEntries(LIFECYCLE_CONTENT_KEYS.map((k) => [k, lifecycle[k.split('.')[2] as string] as string])),
  // MF-48 Stage B: the screen's own content file (Retry, Back), the source the generated slice copies.
  ...(rj('scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json') as Record<string, string>),
};
const NOOP = (): void => undefined;
// 2026-11-11 MF-62 follow-up: the legal line is the operator-ruled short disclaimer (open-questions.md; pre-approved decision D-45), read from the
// report presentation page texts the captured page views carry (`page["legal.line"]`), instead of the old by-law sentence.
const LEGAL_LINE = ((rj('scripts/surfaces/_schema/report-presentation.json').page as Json)['legal.line']) as string;
const show = (state: string) => render(<ReportPageHost view={view(state)} lifecycle="loading" content={CONTENT} onRetry={NOOP} onBack={NOOP} />);
const sheetIndex = (): unknown => screen.UNSAFE_getByType(BottomSheet).props.index;
const label = (id: string): string => within(screen.getByTestId(id)).getAllByText(/.+/).map((t) => String(t.props.children)).join('|');

describe('MF-48 mobile REPORT render smoke (FE-33 mobile REPORT case)', () => {
  it.each(['page_v21', 'page_option_hidden', 'page_not_evaluated', 'page_no_ad', 'page_all_null'])('%s renders through the host with the legal line and the lot-size box', (s) => {
    show(s);
    expect(screen.getByTestId('report-page')).toBeTruthy();
    expect(screen.getByText(LEGAL_LINE)).toBeTruthy();
    expect(screen.getByTestId('report-lot-size-open')).toBeTruthy();
    expect(screen.getByTestId('report-sheet')).toBeTruthy();
  });
  it('page_v21: three option cards, the Sponsored ad beside o2 with its disclosure as the label, the server-formatted value as sent', () => {
    show('page_v21');
    for (const id of ['o1', 'o2', 'o3']) expect(screen.getByTestId(`report-${id}`)).toBeTruthy();
    const ad = screen.getByTestId('report-ad_o2');
    expect(ad.props.accessibilityLabel).toBe('Sponsored');
    expect(within(ad).getByText('Get your lot surveyed')).toBeTruthy();
    expect(within(screen.getByTestId('report-o1-size-tile')).getByText('2,670')).toBeTruthy(); // MF-57 D-J: number and unit are two parts
    expect(within(screen.getByTestId('report-o1-size-tile')).getByText('sq ft')).toBeTruthy();
  });
  it('variants: a hidden option is absent; a not_evaluated option has no scenario ad; no ad value, no ad box; every null value is the dash', () => {
    show('page_option_hidden');
    expect(screen.queryByTestId('report-o1')).toBeNull();
    screen.unmount();
    show('page_not_evaluated');
    expect(screen.getByTestId('report-o2')).toBeTruthy();
    expect(screen.queryByTestId('report-ad_o2')).toBeNull();
    screen.unmount();
    show('page_no_ad');
    expect(screen.queryByTestId('report-ad_o2')).toBeNull();
    screen.unmount();
    show('page_all_null');
    expect(within(screen.getByTestId('report-o1-size-tile')).getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('MF-48 behaviour (parity with the web ReportPageToggles)', () => {
  it('See details opens its panel, the other panel of the option closes, the label flips, Hide details closes; o2 is not affected', () => {
    show('page_v21');
    expect(screen.queryByTestId('report-o1-size-panel')).toBeNull();
    expect(label('report-o1-size-open')).toBe('See details');
    fireEvent.press(screen.getByTestId('report-o1-size-open'));
    expect(screen.getByTestId('report-o1-size-panel')).toBeTruthy();
    expect(label('report-o1-size-open')).toBe('Hide details');
    expect(screen.getByTestId('report-o1-size-open').props.accessibilityState).toMatchObject({ expanded: true });
    fireEvent.press(screen.getByTestId('report-o1-cost-open'));
    expect(screen.queryByTestId('report-o1-size-panel')).toBeNull();
    expect(screen.getByTestId('report-o1-cost-panel')).toBeTruthy();
    expect(screen.queryByTestId('report-o2-size-panel')).toBeNull();
    expect(screen.queryByTestId('report-o2-cost-panel')).toBeNull();
    fireEvent.press(screen.getByTestId('report-o1-cost-hide'));
    expect(screen.queryByTestId('report-o1-cost-panel')).toBeNull();
    expect(label('report-o1-cost-open')).toBe('See details');
    fireEvent.press(screen.getByTestId('report-o1-size-open'));
    fireEvent.press(screen.getByTestId('report-o1-size-open'));
    expect(screen.queryByTestId('report-o1-size-panel')).toBeNull();
  });
  it('How? toggles its steps in its own option only', () => {
    show('page_v21');
    expect(screen.queryByTestId('report-o1-how-steps')).toBeNull();
    fireEvent.press(screen.getByTestId('report-o1-how'));
    expect(screen.getByTestId('report-o1-how-steps')).toBeTruthy();
    expect(screen.queryByTestId('report-o2-how-steps')).toBeNull();
    fireEvent.press(screen.getByTestId('report-o1-how'));
    expect(screen.queryByTestId('report-o1-how-steps')).toBeNull();
  });
  it('Add lot size opens the sheet (index 0); Cancel closes it (index -1); the input is read-only and Recalculate and the unit radios are disabled', () => {
    show('page_v21');
    expect(sheetIndex()).toBe(-1);
    fireEvent.press(screen.getByTestId('report-lot-size-open'));
    expect(sheetIndex()).toBe(0);
    const sheet = screen.UNSAFE_getByType(BottomSheet).props;
    expect([sheet.enablePanDownToClose, typeof sheet.onClose, typeof sheet.backdropComponent]).toEqual([true, 'function', 'function']);
    expect(screen.getByTestId('report-sheet-input').props.editable).toBe(false);
    expect(screen.getByTestId('report-sheet-submit').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('report-sheet-sqft').props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    fireEvent.press(screen.getByTestId('report-sheet-cancel'));
    expect(sheetIndex()).toBe(-1);
    fireEvent.press(screen.getByTestId('report-lot-size-open'));
    React.act(() => { (screen.UNSAFE_getByType(BottomSheet).props.onClose as () => void)(); }); // a swipe down or a backdrop tap
    expect(sheetIndex()).toBe(-1);
  });
  it('nav-audit #62: while the sheet is open, Android Back closes it and is consumed; closed, Back is not intercepted (the listener is removed)', () => {
    const handlers: (() => boolean)[] = [];
    const remove = jest.fn();
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => { handlers.push(h as () => boolean); return { remove }; });
    show('page_v21');
    expect(handlers).toHaveLength(0);
    fireEvent.press(screen.getByTestId('report-lot-size-open'));
    expect(sheetIndex()).toBe(0);
    expect(handlers).toHaveLength(1);
    let consumed = false;
    React.act(() => { consumed = handlers[0]!(); });
    expect([consumed, sheetIndex()]).toEqual([true, -1]);
    expect(remove).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  it('the pure UI changes: one panel per option, the same opener closes, How? flips', () => {
    let u = REPORT_UI.togglePanel(REPORT_UI_CLOSED, 'o1', 'size');
    u = REPORT_UI.togglePanel(u, 'o2', 'cost');
    expect(u.panel).toEqual({ o1: 'size', o2: 'cost' });
    expect(REPORT_UI.togglePanel(u, 'o1', 'cost').panel).toEqual({ o1: 'cost', o2: 'cost' });
    expect(REPORT_UI.togglePanel(u, 'o1', 'size').panel).toEqual({ o1: null, o2: 'cost' });
    expect(REPORT_UI.toggleHow(REPORT_UI.toggleHow(REPORT_UI_CLOSED, 'o3'), 'o3').how).toEqual({ o3: false });
  });
});

describe('MF-48 lifecycle states and the action table', () => {
  it.each(['loading', 'miss', 'error'])('%s shows its approved text (never a blank or the dash)', (s) => {
    render(<ReportPageHost view={null} lifecycle={s as LifecycleState} content={CONTENT} onRetry={NOOP} onBack={NOOP} />);
    expect(screen.getByText(lifecycle[s] as string)).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByTestId('report-spinner') !== null).toBe(s === 'loading');
  });
  it('MF-48 Stage B: the generated slice holds exactly the lifecycle and screen content keys the host renders (REPORT_SLICE)', () => {
    expect(Object.keys(REPORT_SLICE.content).sort()).toEqual([...LIFECYCLE_CONTENT_KEYS, ...SCREEN_CONTENT_KEYS].sort());
    for (const k of Object.keys(CONTENT)) expect([k, (REPORT_SLICE.content as Record<string, string>)[k]]).toEqual([k, CONTENT[k]]);
  });
  it('T-B7 (MF-48 Stage B, B-4 b): only the error state has Retry, its text the approved "Try again", and a press calls onRetry once; Back is drawn in every state and calls onBack', () => {
    for (const s of ['loading', 'miss', 'error'] as LifecycleState[]) {
      const onRetry = jest.fn();
      const onBack = jest.fn();
      render(<ReportPageHost view={null} lifecycle={s} content={CONTENT} onRetry={onRetry} onBack={onBack} />);
      expect([s, screen.queryByTestId('report-retry') !== null]).toEqual([s, s === 'error']);
      if (s === 'error') {
        expect(label('report-retry')).toBe('Try again');
        fireEvent.press(screen.getByTestId('report-retry'));
        expect(onRetry).toHaveBeenCalledTimes(1);
      }
      expect(label('report-back')).toBe('Back');
      fireEvent.press(screen.getByTestId('report-back'));
      expect([onBack.mock.calls.length, onRetry.mock.calls.length]).toEqual([1, s === 'error' ? 1 : 0]);
      screen.unmount();
    }
  });
  it('each REPORT action calls its callback with exactly its arguments; an unknown panel and an unknown action throw', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const a: jest.Mocked<ReportActions> = { toggle_panel: jest.fn(), toggle_how: jest.fn(), open_sheet: jest.fn(), close_sheet: jest.fn(), retry: jest.fn(), back: jest.fn() };
    const data = { contract: {}, derived: {} };
    const btn = (onPress: Json, id: string): SurfaceTree => ({ component: 'Button', props: { key: id, testID: id, onPress }, children: [] });
    const tree: SurfaceTree = { component: 'View', props: {}, children: [
      btn({ action: 'toggle_panel', option: 'o2', panel: 'cost' }, 'a'), btn({ action: 'toggle_how', option: 'o3' }, 'b'), btn({ action: 'open_sheet' }, 'c'), btn({ action: 'close_sheet' }, 'd'), btn({ action: 'retry' }, 'e'), btn({ action: 'back' }, 'f'),
    ] };
    render(<SurfaceRenderer tree={tree} content={{}} data={data} actions={a} />);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) fireEvent.press(screen.getByTestId(id));
    expect([a.toggle_panel.mock.calls, a.toggle_how.mock.calls, a.open_sheet.mock.calls, a.close_sheet.mock.calls, a.retry.mock.calls, a.back.mock.calls]).toEqual([[['o2', 'cost']], [['o3']], [[]], [[]], [[]], [[]]]);
    screen.unmount();
    const r = (t: SurfaceTree) => () => render(<SurfaceRenderer tree={t} content={{}} data={data} actions={a} />);
    expect(r(btn({ action: 'toggle_panel', option: 'o1', panel: 'notes' }, 'x'))).toThrow('unknown panel "notes"');
    expect(r(btn({ action: 'select', parcelId: 'P' }, 'y'))).toThrow('unknown action "select"'); // MF-48 Stage B: retry and back are REPORT actions now
  });
});
