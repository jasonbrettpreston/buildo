// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (dated note 2026-11-12, MF-46 follow-up: the Help & Support link
//            and the fragment prefill); ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 8 (the prefill travels in the URL fragment).
//
// MF-46 follow-up · OUTPUT regression F1: the mobile help URL encodes its values into the fragment and openHelp leaves the app through Linking.
import { Linking } from 'react-native';
import { MAXBLD_HELP_URL, helpUrl, openHelp } from '@/lib/maxbldHelp';

describe('maxbldHelp', () => {
  it('the topic and the value are URI-encoded into the fragment (never a query string)', () => {
    expect(helpUrl('address_match', 'a b&c#d')).toBe('https://maxbld.ca/help#topic=address_match&q=a%20b%26c%23d');
    expect(MAXBLD_HELP_URL).toBe('https://maxbld.ca/help');
    expect(helpUrl('general', '')).not.toContain('?');
  });
  it('openHelp opens that URL through Linking (the mobile exit from the app)', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    openHelp('address_match', '1 Main St');
    expect(spy).toHaveBeenCalledWith('https://maxbld.ca/help#topic=address_match&q=1%20Main%20St');
    spy.mockRestore();
  });
});
