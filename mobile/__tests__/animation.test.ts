/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3 Behavioral Contract
//            docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Main Flight Board View
//
// Set 3 threading assertions:
// 1. index.tsx — useAnimatedScrollHandler worklet (not JS-thread useCallback)
// 2. flight-board.tsx — same
// 3. _layout.tsx — animatedTabBarStyle naming (no collision with TABS_SCREEN_OPTIONS.tabBarStyle)

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// 1. index.tsx scroll threading
// ---------------------------------------------------------------------------

describe('index.tsx scroll threading', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/(app)/index.tsx'), 'utf8');

  it('uses useAnimatedScrollHandler (UI-thread worklet)', () => {
    expect(src).toMatch(/useAnimatedScrollHandler/);
  });

  it('uses AnimatedFlashList in JSX as the scroll container', () => {
    // Checks actual JSX usage, not just the module-level const declaration.
    expect(src).toMatch(/<AnimatedFlashList/);
  });

  it('does not read event.nativeEvent in the scroll handler (worklet event shape is flat)', () => {
    // Old pattern: event.nativeEvent.contentOffset.y — writes shared value via bridge.
    // Fixed pattern: event.contentOffset.y — runs entirely on the UI thread.
    expect(src).not.toMatch(/nativeEvent/);
  });
});

// ---------------------------------------------------------------------------
// 2. flight-board.tsx scroll threading (sibling bug)
// ---------------------------------------------------------------------------

describe('flight-board.tsx scroll threading', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/(app)/flight-board.tsx'), 'utf8');

  it('uses useAnimatedScrollHandler (UI-thread worklet)', () => {
    expect(src).toMatch(/useAnimatedScrollHandler/);
  });

  it('uses AnimatedFlashList in JSX as the scroll container', () => {
    expect(src).toMatch(/<AnimatedFlashList/);
  });

  it('does not read event.nativeEvent in the scroll handler (worklet event shape is flat)', () => {
    expect(src).not.toMatch(/nativeEvent/);
  });
});

// ---------------------------------------------------------------------------
// 3. _layout.tsx tab bar naming
// ---------------------------------------------------------------------------

describe('_layout.tsx tab bar naming', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/(app)/_layout.tsx'), 'utf8');

  it('AnimatedTabBar uses animatedTabBarStyle (resolves naming collision)', () => {
    expect(src).toMatch(/animatedTabBarStyle/);
  });

  it('TABS_SCREEN_OPTIONS.tabBarStyle has a comment clarifying it is visual-only', () => {
    // Without the comment, a reader cannot tell which mechanism drives hide/show —
    // the tabBarStyle key (old approach) or AnimatedTabBar (current approach).
    expect(src).toMatch(/visual appearance only|hide\/show is handled by AnimatedTabBar/i);
  });
});
