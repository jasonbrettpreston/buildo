'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ScoreBadge } from '@/components/ui/ScoreBadge';

interface MapPermit {
  permit_num: string;
  revision_num: string;
  street_num: string;
  street_name: string;
  street_type: string;
  city: string;
  status: string;
  permit_type: string;
  description: string;
  est_const_cost: number | null;
  latitude: number | null;
  longitude: number | null;
  trades?: {
    trade_slug: string;
    trade_name: string;
    color: string;
    lead_score: number;
  }[];
}

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [permits, setPermits] = useState<MapPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPermit, setSelectedPermit] = useState<MapPermit | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [mapLoaded, setMapLoaded] = useState(false);

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '200',
        ...filters,
      });
      const res = await fetch(`/api/permits?${params}`);
      const data = await res.json();
      setPermits(data.data || []);
    } catch (err) {
      console.error('Failed to fetch map permits:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPermits();
  }, [fetchPermits]);

  // Initialize Google Maps
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || mapLoaded) return;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
    script.async = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [mapLoaded]);

  // Render map markers when data and map API are ready
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    if (!google?.maps) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 43.6532, lng: -79.3832 }, // Toronto center
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
    });

    const geocodedPermits = permits.filter((p) => p.latitude && p.longitude);

    geocodedPermits.forEach((permit) => {
      const marker = new google.maps.Marker({
        position: { lat: permit.latitude!, lng: permit.longitude! },
        map,
        title: `${permit.street_num} ${permit.street_name}`,
      });

      marker.addListener('click', () => {
        setSelectedPermit(permit);
      });
    });
  }, [mapLoaded, permits]);

  const geocodedCount = permits.filter((p) => p.latitude && p.longitude).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Map View</h1>
              <p className="text-sm text-gray-500">
                {loading
                  ? 'Loading permits...'
                  : `${geocodedCount} geocoded permits of ${permits.length} total`}
              </p>
            </div>
            <nav className="flex items-center gap-4">
              <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
                Dashboard
              </a>
              <a href="/search" className="text-sm text-gray-600 hover:text-gray-900">
                Search
              </a>
            </nav>
          </div>

          {/* Quick filters */}
          <div className="flex items-center gap-3 mt-3">
            <select
              value={filters.status || ''}
              onChange={(e) =>
                setFilters((f) => {
                  const next = { ...f };
                  if (e.target.value) next.status = e.target.value;
                  else delete next.status;
                  return next;
                })
              }
              className="px-2 py-1.5 text-sm border border-gray-300 rounded"
            >
              <option value="">All statuses</option>
              <option value="Issued">Issued</option>
              <option value="Under Inspection">Under Inspection</option>
              <option value="Under Review">Under Review</option>
            </select>
            <select
              value={filters.trade_slug || ''}
              onChange={(e) =>
                setFilters((f) => {
                  const next = { ...f };
                  if (e.target.value) next.trade_slug = e.target.value;
                  else delete next.trade_slug;
                  return next;
                })
              }
              className="px-2 py-1.5 text-sm border border-gray-300 rounded"
            >
              <option value="">All trades</option>
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="hvac">HVAC</option>
              <option value="roofing">Roofing</option>
              <option value="painting">Painting</option>
              <option value="demolition">Demolition</option>
              <option value="concrete">Concrete</option>
              <option value="framing">Framing</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {/* Map container */}
        <div className="flex-1 relative">
          {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <p className="text-gray-500 text-lg mb-2">Map View</p>
                <p className="text-gray-400 text-sm">
                  Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map
                </p>
                <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4 max-w-md">
                  <p className="text-xs text-gray-500 mb-2">
                    Permits with coordinates: {geocodedCount} / {permits.length}
                  </p>
                  {permits.slice(0, 10).map((p) => (
                    <div
                      key={`${p.permit_num}--${p.revision_num}`}
                      className="text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0"
                    >
                      {p.street_num} {p.street_name} {p.street_type} - {p.status}
                      {p.latitude ? ' (geocoded)' : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div ref={mapRef} className="absolute inset-0" />
          )}
        </div>

        {/* Selected permit sidebar */}
        {selectedPermit && (
          <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">Permit Details</h3>
              <button
                onClick={() => setSelectedPermit(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                &times;
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="font-medium text-gray-900">
                  {selectedPermit.street_num} {selectedPermit.street_name}{' '}
                  {selectedPermit.street_type}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 font-mono">
                    {selectedPermit.permit_num}
                  </span>
                  <Badge label={selectedPermit.status} color="#2563EB" />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Type</p>
                <p className="text-sm text-gray-900">{selectedPermit.permit_type}</p>
              </div>

              {selectedPermit.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Description</p>
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {selectedPermit.description}
                  </p>
                </div>
              )}

              {selectedPermit.est_const_cost != null && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Est. Cost</p>
                  <p className="text-sm text-gray-900">
                    ${selectedPermit.est_const_cost.toLocaleString()}
                  </p>
                </div>
              )}

              {selectedPermit.trades && selectedPermit.trades.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Trades</p>
                  <div className="space-y-1">
                    {selectedPermit.trades.map((t) => (
                      <div key={t.trade_slug} className="flex items-center gap-2">
                        <ScoreBadge score={t.lead_score} size="sm" />
                        <span className="text-sm" style={{ color: t.color }}>
                          {t.trade_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <a
                href={`/permits/${selectedPermit.permit_num}--${selectedPermit.revision_num}`}
                className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 mt-4"
              >
                View Full Details
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
