// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 (Square Footage Projection);
//            docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.44 (the API serves the converted area; the phone only formats).
//
// FIX.AREA-FACTOR (task-411): the lead detail screen shows the Square Footage section from cost.modeled_gfa_sqft as served, shows no section when
// the field is null, and omits the section when the field is absent (an old or cached response). Runs only in Mobile CI (phone tests cannot run locally).
require('react-native-css-interop/test');
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({ id: '24-101234--01' }) }));
jest.mock('@/hooks/useSaveLead', () => ({ useSaveLead: () => ({ mutate: jest.fn() }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/components/feed/OpportunityRing', () => ({ OpportunityRing: () => null }));
jest.mock('@/components/shared/SaveButton', () => ({ SaveButton: () => null }));
let mockCost: Record<string, unknown> | null = null;
jest.mock('@/hooks/useLeadDetail', () => ({
  useLeadDetail: () => ({
    data: {
      lead_id: '24-101234--01',
      lead_type: 'permit',
      permit_num: '24-101234',
      revision_num: '01',
      address: '123 Main St',
      location: { lat: 43.65, lng: -79.38 },
      work_description: 'Two-storey rear addition',
      applicant: null,
      lifecycle_phase: 'P8',
      lifecycle_stalled: false,
      target_window: 'bid',
      opportunity_score: 78,
      competition_count: 4,
      predicted_start: '2026-06-01',
      p25_days: 28,
      p75_days: 65,
      cost: mockCost,
      neighbourhood: null,
      updated_at: '2026-04-29T10:00:00.000Z',
      is_saved: false,
    },
    isLoading: false,
    isError: false,
  }),
}));

import LeadDetailScreen from '../app/(app)/[lead]';

const COST = { estimated: 450000, tier: 'large', range_low: 380000, range_high: 520000, modeled_gfa_sqm: 142.5 };

describe('lead detail screen: Square Footage section (FIX.AREA-FACTOR, fe.44)', () => {
  it('shows the served square feet, formatted only', () => {
    mockCost = { ...COST, modeled_gfa_sqft: 1533.85575 };
    render(<LeadDetailScreen />);
    expect(screen.getByTestId('lead-detail-sqft')).toBeTruthy();
    expect(screen.getByText('1,534 sq ft')).toBeTruthy();
  });

  it('omits the section when the served square feet is null', () => {
    mockCost = { ...COST, modeled_gfa_sqft: null };
    render(<LeadDetailScreen />);
    expect(screen.queryByTestId('lead-detail-sqft')).toBeNull();
  });

  it('omits the section when the field is absent (old or cached response); the phone does not convert modeled_gfa_sqm', () => {
    mockCost = { ...COST };
    render(<LeadDetailScreen />);
    expect(screen.queryByTestId('lead-detail-sqft')).toBeNull();
  });
});
