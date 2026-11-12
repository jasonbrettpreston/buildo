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
//
// Dated 2026-11-12 (EI-D1, operator "D all as recommended - please ensure this is addedd to the McFrontend decisions"; Spec 135
// FE-38; Spec 69a M-367 dated note 2026-11-12 (R-1), which covers this reversal; record
// ~/Buildo-scratch/mcfrontend/phase1/open-questions.md, "Engine inputs ... rulings 2026-11-12"; plan
// ~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md v2 §4e, F-3/F-5): case 2 is REVERSED. Before: "the other lot headlines still
// render", asserting getByText("As-of-right GFA"), getByText("Max build storeys"), getByText("CoA FSI") and getByText("0.61").
// After: those three legacy headlines and their values do not render either; only "Lot size" stays. Cases 3-4 add the
// cost section (the 13 legacy lines are not shown; the slot reads "Not yet evaluated", FE-06) and the O-7 label lock
// (no max_build card, no "maximum envelope" or "as-of-right" text, with opt_aor_gfa_sqm present and with it null).
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
    // A distinctive legacy menu: even if a server still sent one, no line may render (EI-D1).
    costMenu: {
      menu: { _schema_version: 1, max_build: { total: 2503805, per_sqm: 6539, area: 382.9 }, coa_build: { total: 3111111 }, kitchen: { per_sqm: 777 } },
      scalars: { cost_fb_total: 2503805 },
    },
    areas: {
      lot_size_sqm: 400,
      opt_aor_gfa_sqm: 250 as number | null, // formatSqft -> "2,691 sq ft"
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

describe('W-0 (a) + EI-D1: the mobile parcel page hides the legacy sizes and costs', () => {
  it('neither label nor value renders, with both values present', () => {
    render(<Screen />);
    expect(screen.queryByText('Max build FSI')).toBeNull();
    expect(screen.queryByText('Max buildable GFA')).toBeNull();
    expect(screen.queryByText('3.17')).toBeNull();
    expect(screen.queryByText('10,753 sq ft')).toBeNull();
  });
  it('EI-D1 (reversed): the legacy As-of-right GFA, Max build storeys and CoA FSI do not render; Lot size still does', () => {
    render(<Screen />);
    expect(screen.getByText('Lot size')).toBeTruthy();
    expect(screen.queryByText('As-of-right GFA')).toBeNull();
    expect(screen.queryByText('Max build storeys')).toBeNull();
    expect(screen.queryByText('CoA FSI')).toBeNull();
    expect(screen.queryByText('0.61')).toBeNull();
    expect(screen.queryByText('2,691 sq ft')).toBeNull();
  });
  it('EI-D1: no legacy cost line renders, even when a menu is present; the slot reads "Not yet evaluated"', () => {
    render(<Screen />);
    expect(screen.getByText('What it costs')).toBeTruthy();
    expect(screen.getByTestId('parcel-cost-none')).toHaveTextContent('Not yet evaluated');
    for (const label of ['New build (max)', 'New build (Committee of Adjustment)', 'Kitchen (per m²)']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText(/2,503,805|3,111,111|\$0/)).toBeNull();
    expect(screen.queryByTestId('parcel-cost-max_build')).toBeNull();
  });
  it.each([250, null])('O-7 label lock: no max_build card and no "maximum envelope" / "as-of-right" text (opt_aor_gfa_sqm %p)', (v) => {
    mockData.parcel.areas.opt_aor_gfa_sqm = v;
    render(<Screen />);
    expect(screen.queryByTestId('parcel-cost-max_build')).toBeNull();
    expect(screen.queryByText(/maximum envelope|as-of-right/i)).toBeNull();
    mockData.parcel.areas.opt_aor_gfa_sqm = 250;
  });
});
