// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens)
//            docs/specs/00-architecture/116_multi_product_architecture.md (OD5 — MaxBLD is its own
//            product; nothing in the parcel product may reference lead-gen concepts)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 (tokens, 44px targets)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SHELL archetype)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §5.1 (gate authority)
//
// Surface S-004 `shell_parcel_tool_stack` — THE MaxBLD PRODUCT SHELL.
//
// It owns two things: the nested Stack (Lookup -> lot report / map disambiguation / Tracked Lots /
// Account, each screen drawing its own header because `headerShown` is false), and the persistent
// three-tab shelf that is the ONLY navigation a MaxBLD user sees — Lookup · Tracked Lots · Account.
// The shelf itself is `mobile/src/components/parcel/ParcelShelf.tsx`, declared in this surface's
// `identity.owns.components` (R-13: it is rendered here and nowhere else).
//
// WHY THE FIVE-TAB BAR IS HIDDEN RATHER THAN ESCAPED (operator ruling 2026-09-16 (c)).
// The five-tab bar (Lead Feed · Flight Board · Map · Parcels · Settings) is S-046 `shell_app_tabs`
// at mobile/app/(app)/_layout.tsx, and it belongs to the lead-gen app. MaxBLD must not show it.
// There were two ways to achieve that:
//   (1) move the parcel-tool group OUT of `(app)` — REJECTED. `(app)/_layout.tsx:236-265` is where
//       the SUBSCRIPTION GATE lives: it returns SubscriptionLoadingGuard / PaywallScreen / a
//       forced sign-out BEFORE it ever renders <Tabs>. Leaving the group would take the parcel
//       product out from behind that gate — a security regression — and would additionally rewrite
//       every `/(app)/parcel-tool/...` href, the descriptors and the Maestro flows.
//   (2) hide the S-046 bar while a parcel-tool route is focused — TAKEN. S-046 already renders its
//       bar through a custom `tabBar` wrapper we control, so the hide is one route-derived
//       decision (`shouldHideAppTabBar`, mobile/src/lib/appShell.ts), with the gate untouched.
// Recorded in S-004's descriptor `notes` and in the WF1 plan.
//
// Routing stays inside the Stack — no router.replace effects here; AuthGate and AppLayout own the
// gate boundaries (Spec 99 §5.1).
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { ParcelShelf } from '@/components/parcel/ParcelShelf';
import { activeParcelTab, PARCEL_TAB_ROUTE, type ParcelTab } from '@/lib/parcelSearchMatch';
import { PARCEL_SHELF_HEX } from '@/constants/parcelSearch';

export default function ParcelToolLayout() {
  const router = useRouter();
  const pathname = usePathname();
  // Derived from the ROUTE, never from local state — so a deep link lights the right tab.
  const active = activeParcelTab(pathname);

  const onSelect = useCallback(
    (tab: ParcelTab) => {
      if (tab === active) return;
      router.push(PARCEL_TAB_ROUTE[tab]);
    },
    [router, active],
  );

  return (
    <View style={{ flex: 1, backgroundColor: PARCEL_SHELF_HEX.screen }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[parcelId]" />
        <Stack.Screen name="disambiguate" />
        <Stack.Screen name="tracked" />
        <Stack.Screen name="account" />
      </Stack>
      <ParcelShelf active={active} onSelect={onSelect} />
    </View>
  );
}
