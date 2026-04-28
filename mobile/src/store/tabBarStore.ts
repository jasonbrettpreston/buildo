// Shared mutable value for the tab bar hide-on-scroll animation.
// makeMutable creates a Reanimated shared value outside of a React component —
// safe for module-level use. Screens call scrollY.value to drive the offset.
import { makeMutable } from 'react-native-reanimated';

// Current scroll offset — set by FlashList onScroll in each tab screen.
export const tabBarScrollY = makeMutable(0);
// Direction: 1 = visible (up or at top), -1 = hidden (scrolling down).
export const tabBarVisible = makeMutable(1);
