// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (ParcelDetailScreen),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b items 3-4 (existing components; no new UI).
//
// Ruling W-0 (a), operator 2026-11-12, verbatim: "sounds good accepted..". Record:
// ~/Buildo-scratch/mcbylaws/inc5/WALKTHROUGH-20261112.md (W-0 page and the rulings section).
// The live mobile parcel page hides "Max build FSI" (parcels.max_build_fsi) and "Max buildable GFA"
// (parcels.max_buildable_gfa_sqm) until MB-38 (increment 10) puts the engine's values on the page: both are legacy
// Phase 1 fields, inflated on about 80% of lots (the coverage x storeys fallback when bylaw_max_fsi is NULL).
// Lock: the real screen, rendered with both values present and distinctive, shows neither label nor value; the
// neighbouring headlines still render (the hide is these two only). MB-38 removes this lock when it binds the
// engine's values.
require('react-native-css-interop/test');
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ parcelId: 'PIN-777' }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('lucide-react-native', () => ({ ChevronLeft: () => null }));
jest.mock('@/components/parcel/SponsorSlot', () => ({ SponsorSlot: () => null }));

const mockData = {
  match: { parcelId: 'PIN-777', matchType: 'exact', address: '26 Hurlingham Cres' },
  candidates: [],
  warnings: [],
  parcel: {
    costMenu: { menu: null, scalars: {} },
    areas: {
      lot_size_sqm: 400,
      opt_aor_gfa_sqm: 250,
      max_buildable_gfa_sqm: 999, // formatSqft -> "10,753 sq ft"
      max_build_stories: 3,
      max_build_fsi: 3.17, // formatFsi -> "3.17"
      coa_fsi: 0.61,
      envelope_constrained: false,
      envelope_constraint_reason: null,
    },
    neighbourhood: { summary: null, compStats: { compCount: null }, comparableBuilds: [], coaProjects: [] },
  },
};
jest.mock('@/hooks/useParcelLookup', () => ({
  useParcelLookup: () => ({ data: mockData, isLoading: false, isError: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/(app)/parcel-tool/[parcelId]').default as React.ComponentType;

describe('W-0 (a): the mobile parcel page hides the legacy Max build FSI and Max buildable GFA', () => {
  it('neither label nor value renders, with both values present', () => {
    render(<Screen />);
    expect(screen.queryByText('Max build FSI')).toBeNull();
    expect(screen.queryByText('Max buildable GFA')).toBeNull();
    expect(screen.queryByText('3.17')).toBeNull();
    expect(screen.queryByText('10,753 sq ft')).toBeNull();
  });
  it('the other lot headlines still render (only these two are hidden)', () => {
    render(<Screen />);
    expect(screen.getByText('Lot size')).toBeTruthy();
    expect(screen.getByText('As-of-right GFA')).toBeTruthy();
    expect(screen.getByText('Max build storeys')).toBeTruthy();
    expect(screen.getByText('CoA FSI')).toBeTruthy();
    expect(screen.getByText('0.61')).toBeTruthy();
  });
});
