// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-33 (one render smoke per archetype per platform; the mobile case runs in
//            mobile jest and stays prose-only in the FE-33 note until MF-25), FE-31; docs/specs/03-mobile/98_mobile_testing_protocol.md 98:79 dated
//            note 2026-11-10 (H9: a render smoke is not a snapshot); docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2.
//
// MF-35 · the mobile render smoke (plan v3 §9). Every golden situation renders through SurfaceRenderer without throwing, finds its test ids and
// labels, keeps the legacy host props (rows 1-4: keyboardShouldPersistTaps, the safe-area top edge, the 448 column, the shelf padding), renders
// "0s" for RateLimitError(0) (RG-12), keeps Retry inside the error notice (RG-16) and calls each action with exactly its arguments (RG-8).
// Notices are found by testID: the RNR Alert is a plain View with role="alert" that RNTL does not find by role (spike log §6).
require('react-native-css-interop/test');
import * as React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { resolveValue, SurfaceRenderer, type SurfaceActions, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { SEARCH_SLICE, searchData, searchProps } from '@/components/surfaces/SearchBinding';
import { SEARCH_MAX_WIDTH, SEARCH_BOTTOM_PADDING } from '@/constants/parcelSearch';
import type { SearchSituation } from '@/lib/parcelSearchMatch';
import situations from './fixtures/parcelSearch.situations.json';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const S = situations as unknown as Record<string, SearchSituation>;
const actions = (): jest.Mocked<SurfaceActions> => ({
  change_input: jest.fn(), set_input: jest.fn(), retry: jest.fn(), select: jest.fn(), push: jest.fn(), open_account: jest.fn(), back: jest.fn(),
  // MF-46 follow-up (dated 2026-11-12): the search host passes open_help ("Report incorrect address match" on the address list).
  open_help: jest.fn(),
});
const show = (k: string, a = actions()) => {
  const s = S[k] as SearchSituation;
  render(<SurfaceRenderer tree={searchProps(s) as SurfaceTree} content={SEARCH_SLICE.content} data={searchData(s)} actions={a} />);
  return a;
};
const GOLDEN_SITUATIONS = ['static', 'loading', 'redirect', 'ambiguous', 'miss', 'empty', 'schema_drift', 'rate_limited', 'unauthorized', 'error'];

describe('MF-46 follow-up: "Report incorrect address match" (OUTPUT regression F1)', () => {
  it('the address list carries the report link; a press calls open_help with the topic and the typed address', () => {
    const a = show('ambiguous');
    fireEvent.press(screen.getByTestId('parcel-search-report'));
    expect(a.open_help).toHaveBeenCalledWith('address_match', (S.ambiguous as SearchSituation).input);
  });
  it('RED: a host that does not pass open_help cannot render the address list (the unknown-action fence)', () => {
    const { open_help: _unused, ...rest } = actions();
    expect(() => show('ambiguous', rest as jest.Mocked<SurfaceActions>)).toThrow('SurfaceRenderer: unknown action "open_help"');
  });
});

describe('mobile render smoke (FE-33 mobile case)', () => {
  it.each(GOLDEN_SITUATIONS)('%s renders non-empty with the header, the field and the account button', (k) => {
    show(k);
    expect(screen.getByTestId('parcel-search-input')).toBeTruthy();
    expect(screen.getByText('BLD')).toBeTruthy();
    expect(screen.getByText('Lot & Zoning Intelligence')).toBeTruthy();
    expect(screen.getByLabelText('Account')).toBeTruthy();
  });
  it('host props: keyboardShouldPersistTaps, the shelf padding, the top safe-area edge, the 448 column (rows 1-4)', () => {
    show('static');
    const root = screen.getByTestId('parcel-search-screen');
    expect(root.props.edges).toEqual({ top: 'additive' });
    expect(screen.UNSAFE_getByProps({ keyboardShouldPersistTaps: 'handled' }).props.contentContainerStyle).toEqual({ paddingBottom: SEARCH_BOTTOM_PADDING, alignItems: 'center' });
    expect(SEARCH_BOTTOM_PADDING).toBe(106);
    expect(StyleSheet.flatten(screen.getByTestId('parcel-search-column').props.style)).toMatchObject({ maxWidth: SEARCH_MAX_WIDTH });
    const input = screen.getByTestId('parcel-search-input');
    expect([input.props.returnKeyType, input.props.autoCapitalize, input.props.autoCorrect]).toEqual(['search', 'none', false]);
    expect(input.props.accessibilityLabel).toBe('Search a Toronto address');
    expect(screen.getByTestId('parcel-search-prompt')).toBeTruthy();
  });
  it('the chips carry the legacy role, label and testID and set the input', () => {
    const a = show('static');
    fireEvent.press(screen.getByTestId('parcel-search-suggestion-26 Hurlingham Cres'));
    expect(a.set_input).toHaveBeenCalledWith('26 Hurlingham Cres');
    expect(screen.getByLabelText('Search Bathurst St')).toBeTruthy();
  });
  it('RateLimitError(0): "0s" and the error notice with Retry, both (RG-12, MF35-DF1); Retry is inside the error notice and called with no argument', () => {
    const a = show('rate_limited_zero');
    expect(within(screen.getByTestId('parcel-search-ratelimit')).getByText('Too many searches. Try again in 0s.')).toBeTruthy();
    const retry = within(screen.getByTestId('parcel-search-error')).getByLabelText('Retry the search');
    fireEvent.press(retry);
    expect(a.retry).toHaveBeenCalledWith();
  });
  it('schema drift: its own text and no Retry; 403: the entitlement text, never the miss copy', () => {
    show('schema_drift');
    expect(within(screen.getByTestId('parcel-search-error')).queryByLabelText('Retry the search')).toBeNull();
    expect(screen.queryByTestId('parcel-search-empty')).toBeNull();
    screen.unmount();
    show('unauthorized');
    expect(screen.getByTestId('parcel-search-entitlement')).toBeTruthy();
    expect(screen.queryByTestId('parcel-search-empty')).toBeNull();
  });
  it('the address list: radio cards, the checked card, the amber word, the label fallback; a tap selects, SELECT pushes', () => {
    const a = show('ambiguous');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(10);
    expect(screen.getByTestId('parcel-candidate-100102').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText('100114')).toBeTruthy();
    expect(screen.getByText('candidates', { exact: false }).props.children).toContain('10 candidates');
    fireEvent.press(screen.getByTestId('parcel-candidate-100100'));
    expect(a.select).toHaveBeenCalledWith('100100');
    expect(a.push).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('parcel-search-select'));
    expect(a.push).toHaveBeenCalledWith('/(app)/parcel-tool/100102');
    expect(screen.getByTestId('parcel-search-refine')).toBeTruthy();
  });
  it('the account button opens the account page; typing calls change_input with the text', () => {
    const a = show('static');
    fireEvent.press(screen.getByTestId('parcel-search-account'));
    expect(a.open_account).toHaveBeenCalledWith();
    fireEvent.changeText(screen.getByTestId('parcel-search-input'), '26 Hu');
    expect(a.change_input).toHaveBeenCalledWith('26 Hu');
  });
  it('OUTPUT fold LOW: an unresolved contract or derived ref throws (nothing is skipped silently); null is allowed; template vars are own keys only', () => {
    const ctx = { content: { 'x.t': 'a {toString} b {n}' }, data: { contract: { c: { v: null } }, derived: { n: 0 } }, actions: actions() };
    expect(() => resolveValue({ contract: 'c.gone' }, ctx)).toThrow('unresolved ref {"contract":"c.gone"}');
    expect(() => resolveValue({ derived: 'recent.7' }, ctx)).toThrow('unresolved ref {"derived":"recent.7"}');
    expect(resolveValue({ contract: 'c.v' }, ctx)).toBeNull();
    expect(resolveValue({ text: { content: 'x.t' }, vars: { n: { derived: 'n' } } }, ctx)).toBe('a {toString} b 0');
  });
  it('RED: an unmapped component, an unknown icon, an unknown content key, an unknown action all throw', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const data = searchData(S.static as SearchSituation);
    const r = (tree: SurfaceTree) => () => render(<SurfaceRenderer tree={tree} content={SEARCH_SLICE.content} data={data} actions={actions()} />);
    expect(r({ component: 'Card', props: {}, children: [] })).toThrow('unmapped component "Card"');
    expect(r({ component: 'Icon', props: { icon: 'Map' }, children: [] })).toThrow('unknown icon "Map"');
    expect(r({ component: 'Text', props: {}, children: [{ content: 'search.gone' }] })).toThrow('unknown content key "search.gone"');
    expect(r({ component: 'Button', props: { onPress: { action: 'track' } }, children: [] })).toThrow('unknown action "track"');
  });
});
