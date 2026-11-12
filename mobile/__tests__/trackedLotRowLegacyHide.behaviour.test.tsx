// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-12), §4 (screens)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.3 (closed status list; FE-06 honest display)
//
// EI-D1, operator 2026-11-12, verbatim: "D all as recommended - please ensure this is addedd to the McFrontend decisions"
// (Spec 135 FE-38; Spec 69a M-367 dated note 2026-11-12, R-1; plan ~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md v2 §4e,
// regression F-6). The tracked-lots row shows neither legacy figure: "Max Build" (parcels.max_buildable_gfa_sqm) and
// "MAX COA BUILD" (parcels.max_newbuild_coa_gfa_sqm) keep their slot and read "Not yet evaluated", never a number, 0 or "—".
// Lock: the real row, rendered with both values present and distinctive. Retired when MB-43 deletes the legacy columns.
require('react-native-css-interop/test');
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TrackedLotRow } from '@/components/parcel/TrackedLotRow';

jest.mock('lucide-react-native', () => ({ Gavel: () => null, Trash2: () => null, ChevronRight: () => null }));

const lot = {
  parcelId: 'PIN-1',
  address: '26 Hurlingham Cres',
  maxBuildGfaSqm: 4123, // formatGfa -> "4,123 m² GFA"
  maxCoaBuildGfaSqm: 6317, // formatGfa -> "6,317 m² GFA"
  newNearbyCoaRuling: null,
  jurisdiction: 'TORONTO, ON',
  trackedAt: '2026-09-14T15:04:00.000Z',
};

describe('EI-D1: the tracked-lots row hides the legacy Max Build and MAX COA BUILD', () => {
  it('both slots read "Not yet evaluated" and neither legacy value renders', () => {
    render(<TrackedLotRow lot={lot} manageMode={false} onOpen={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText('Max Build: Not yet evaluated')).toBeTruthy();
    expect(screen.getByText('MAX COA BUILD: Not yet evaluated')).toBeTruthy();
    expect(screen.queryByText(/4,123|6,317|m² GFA/)).toBeNull();
  });
});
