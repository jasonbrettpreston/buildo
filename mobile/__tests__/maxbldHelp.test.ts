// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (dated note 2026-11-12, MF-46 follow-up: the Help & Support link
//            and the fragment prefill); ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 8 (the prefill travels in the URL fragment).
//
// MF-46 follow-up · OUTPUT regression F1: the mobile help URL encodes its values into the fragment.
// task-362 SRCH.LOTMAP-2 (AC1, AC5; small-pages-v8 search.html:235 "in-app browser sheet (B10): Help, Terms, Privacy open the web page with Done"):
// openHelp opens that URL in the in-app browser sheet through expo-web-browser (the same call as useSubscribeCheckout.ts:61), never through
// Linking; a rejecting openBrowserAsync is caught and logged (the topic only, never the typed address), not thrown. The two callers are
// the lot map page (app/(app)/parcel-tool/disambiguate.tsx:51) and the search page (app/(app)/parcel-tool/index.tsx:117); each reaches openHelp
// through the surface action open_help (lotMapPage.behaviour.test.tsx and parcelSearchScreen.behaviour.test.tsx pin the press).
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MAXBLD_HELP_URL, helpUrl, openHelp } from '@/lib/maxbldHelp';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
const open = WebBrowser.openBrowserAsync as jest.Mock;

beforeEach(() => { open.mockReset(); });
afterEach(() => { jest.restoreAllMocks(); }); // a failed expectation must not leave Linking or console.warn mocked for the next case

describe('maxbldHelp', () => {
  it('the topic and the value are URI-encoded into the fragment (never a query string)', () => {
    expect(helpUrl('address_match', 'a b&c#d')).toBe('https://maxbld.ca/help#topic=address_match&q=a%20b%26c%23d');
    expect(MAXBLD_HELP_URL).toBe('https://maxbld.ca/help');
    expect(helpUrl('general', '')).not.toContain('?');
  });
  it('openHelp opens that URL in the in-app browser sheet and does not leave the app through Linking', async () => {
    open.mockResolvedValue({ type: 'dismiss' });
    const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await openHelp('address_match', '1 Main St');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://maxbld.ca/help#topic=address_match&q=1%20Main%20St');
    expect(link).not.toHaveBeenCalled();
    link.mockRestore();
  });
  it('a rejecting openBrowserAsync is caught and logged with the topic only, not thrown', async () => {
    open.mockRejectedValue(new Error('no browser'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(openHelp('lot_match', '5 Elm St')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('lot_match');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('5 Elm St');
    warn.mockRestore();
  });
});
