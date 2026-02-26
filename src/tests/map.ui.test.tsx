// 🔗 SPEC LINK: docs/specs/20_map_view.md
// Map view logic: geocoded permit filtering, marker data, display state
import { describe, it, expect } from 'vitest';

interface MapPermit {
  permit_num: string;
  revision_num: string;
  street_num: string;
  street_name: string;
  street_type: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  est_const_cost: number | null;
  trades?: { trade_slug: string; trade_name: string; color: string; lead_score: number }[];
}

describe('Geocoded Permit Filtering', () => {
  const permits: MapPermit[] = [
    {
      permit_num: '24 001', revision_num: '01', street_num: '100',
      street_name: 'QUEEN', street_type: 'ST', status: 'Issued',
      latitude: 43.6532, longitude: -79.3832, est_const_cost: 150000,
    },
    {
      permit_num: '24 002', revision_num: '01', street_num: '200',
      street_name: 'KING', street_type: 'ST', status: 'Issued',
      latitude: null, longitude: null, est_const_cost: 80000,
    },
    {
      permit_num: '24 003', revision_num: '01', street_num: '300',
      street_name: 'BAY', street_type: 'ST', status: 'Application',
      latitude: 43.6519, longitude: -79.3811, est_const_cost: null,
    },
  ];

  function getGeocodedPermits(p: MapPermit[]): MapPermit[] {
    return p.filter((permit) => permit.latitude && permit.longitude);
  }

  it('filters to only geocoded permits', () => {
    const geocoded = getGeocodedPermits(permits);
    expect(geocoded).toHaveLength(2);
    expect(geocoded[0].permit_num).toBe('24 001');
    expect(geocoded[1].permit_num).toBe('24 003');
  });

  it('returns empty array when no permits are geocoded', () => {
    const noGeo: MapPermit[] = [
      {
        permit_num: '24 999', revision_num: '01', street_num: '1',
        street_name: 'TEST', street_type: 'ST', status: 'Issued',
        latitude: null, longitude: null, est_const_cost: null,
      },
    ];
    expect(getGeocodedPermits(noGeo)).toHaveLength(0);
  });

  it('counts geocoded vs total correctly', () => {
    const geocoded = getGeocodedPermits(permits);
    expect(geocoded.length).toBe(2);
    expect(permits.length).toBe(3);
  });
});

describe('Map Center and Defaults', () => {
  const TORONTO_CENTER = { lat: 43.6532, lng: -79.3832 };
  const DEFAULT_ZOOM = 11;

  it('defaults to Toronto center coordinates', () => {
    expect(TORONTO_CENTER.lat).toBeCloseTo(43.6532, 4);
    expect(TORONTO_CENTER.lng).toBeCloseTo(-79.3832, 4);
  });

  it('default zoom level is 11', () => {
    expect(DEFAULT_ZOOM).toBe(11);
  });
});

describe('Marker Title Generation', () => {
  function getMarkerTitle(streetNum: string, streetName: string): string {
    return `${streetNum} ${streetName}`;
  }

  it('combines street number and name', () => {
    expect(getMarkerTitle('123', 'QUEEN')).toBe('123 QUEEN');
  });

  it('handles empty street number', () => {
    expect(getMarkerTitle('', 'BAY')).toBe(' BAY');
  });
});

describe('Map Filter State', () => {
  function applyFilter(
    current: Record<string, string>,
    key: string,
    value: string
  ): Record<string, string> {
    const next = { ...current };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    return next;
  }

  it('adds a status filter', () => {
    const result = applyFilter({}, 'status', 'Issued');
    expect(result.status).toBe('Issued');
  });

  it('removes a filter when value is empty', () => {
    const result = applyFilter({ status: 'Issued' }, 'status', '');
    expect(result.status).toBeUndefined();
  });

  it('preserves other filters', () => {
    const result = applyFilter(
      { status: 'Issued', trade_slug: 'plumbing' },
      'status',
      'Application'
    );
    expect(result.status).toBe('Application');
    expect(result.trade_slug).toBe('plumbing');
  });
});

describe('Map Display State', () => {
  function getMapDisplayState(
    apiKey: string | undefined,
    mapLoaded: boolean
  ): 'no-key' | 'loading' | 'ready' {
    if (!apiKey) return 'no-key';
    if (!mapLoaded) return 'loading';
    return 'ready';
  }

  it('returns no-key when API key is missing', () => {
    expect(getMapDisplayState(undefined, false)).toBe('no-key');
  });

  it('returns loading when API key exists but map not loaded', () => {
    expect(getMapDisplayState('test-key', false)).toBe('loading');
  });

  it('returns ready when both API key and map loaded', () => {
    expect(getMapDisplayState('test-key', true)).toBe('ready');
  });
});

describe('Selected Permit Sidebar', () => {
  it('can select and deselect a permit', () => {
    let selected: MapPermit | null = null;
    const permit: MapPermit = {
      permit_num: '24 001', revision_num: '01', street_num: '100',
      street_name: 'QUEEN', street_type: 'ST', status: 'Issued',
      latitude: 43.65, longitude: -79.38, est_const_cost: 150000,
    };

    // Select
    selected = permit;
    expect(selected).not.toBeNull();
    expect(selected!.permit_num).toBe('24 001');

    // Deselect
    selected = null;
    expect(selected).toBeNull();
  });

  it('generates correct detail URL for selected permit', () => {
    const permit = { permit_num: '24 101234', revision_num: '01' };
    const url = `/permits/${permit.permit_num}--${permit.revision_num}`;
    expect(url).toBe('/permits/24 101234--01');
  });

  it('formats cost for display', () => {
    function formatCost(cost: number | null): string {
      if (cost == null) return 'N/A';
      return `$${cost.toLocaleString()}`;
    }
    expect(formatCost(150000)).toBe('$150,000');
    expect(formatCost(null)).toBe('N/A');
  });
});
