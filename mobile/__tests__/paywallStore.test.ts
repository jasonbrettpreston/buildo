/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 paywallStore State Machine

import { usePaywallStore } from '@/store/paywallStore';

describe('paywallStore', () => {
  beforeEach(() => {
    // Reset to the default state between tests so prior test transitions don't bleed.
    usePaywallStore.setState({ visible: false, dismissed: false });
  });

  it('starts in the default state', () => {
    const { visible, dismissed } = usePaywallStore.getState();
    expect(visible).toBe(false);
    expect(dismissed).toBe(false);
  });

  it('show() sets visible: true, dismissed: false', () => {
    usePaywallStore.getState().show();
    const { visible, dismissed } = usePaywallStore.getState();
    expect(visible).toBe(true);
    expect(dismissed).toBe(false);
  });

  it('show() un-dismisses if previously dismissed', () => {
    usePaywallStore.getState().dismiss();
    expect(usePaywallStore.getState().dismissed).toBe(true);
    usePaywallStore.getState().show();
    expect(usePaywallStore.getState().dismissed).toBe(false);
    expect(usePaywallStore.getState().visible).toBe(true);
  });

  it('dismiss() sets visible: false, dismissed: true', () => {
    usePaywallStore.getState().show();
    usePaywallStore.getState().dismiss();
    const { visible, dismissed } = usePaywallStore.getState();
    expect(visible).toBe(false);
    expect(dismissed).toBe(true);
  });

  it('clear() resets both flags from the dismissed state', () => {
    usePaywallStore.getState().dismiss();
    usePaywallStore.getState().clear();
    const { visible, dismissed } = usePaywallStore.getState();
    expect(visible).toBe(false);
    expect(dismissed).toBe(false);
  });

  it('clear() resets both flags from the visible state', () => {
    usePaywallStore.getState().show();
    usePaywallStore.getState().clear();
    const { visible, dismissed } = usePaywallStore.getState();
    expect(visible).toBe(false);
    expect(dismissed).toBe(false);
  });

  it('the store module does not register a persist middleware (spec §9 explicit)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/store/paywallStore.ts'),
      'utf8',
    );
    // The contract: paywallStore must NOT use zustand persist middleware,
    // because a returning subscriber whose status flipped to 'active' must
    // never be stuck in inline-blur from a previous session.
    expect(src).not.toMatch(/from\s+['"]zustand\/middleware['"]/);
    expect(src).not.toMatch(/persist\s*\(/);
  });
});
