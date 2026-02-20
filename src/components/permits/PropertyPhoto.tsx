'use client';

import { useState } from 'react';

/**
 * Build a Street View Static API URL, or return null if in dev mode or missing key.
 */
export function getStreetViewUrl(
  lat: number,
  lng: number,
  apiKey: string | undefined,
  isDev: boolean
): string | null {
  if (isDev) return null;
  if (!apiKey) return null;
  return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&key=${apiKey}`;
}

/**
 * Determine the display state for the PropertyPhoto component.
 */
export function getDisplayState(
  lat: number | null,
  lng: number | null,
  isDev: boolean
): 'placeholder' | 'unavailable' | 'image' {
  if (isDev) return 'placeholder';
  if (lat == null || lng == null) return 'unavailable';
  return 'image';
}

interface PropertyPhotoProps {
  lat: number | null;
  lng: number | null;
  address: string;
}

export default function PropertyPhoto({ lat, lng, address }: PropertyPhotoProps) {
  const [imgError, setImgError] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const displayState = getDisplayState(lat, lng, isDev);

  if (displayState === 'placeholder') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-100 flex flex-col items-center justify-center h-64 sm:h-80">
          <svg
            className="w-12 h-12 text-gray-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-500">Street View (Dev Mode)</p>
          <p className="text-xs text-gray-400 mt-1">{address}</p>
        </div>
      </div>
    );
  }

  if (displayState === 'unavailable') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 flex flex-col items-center justify-center h-40">
          <p className="text-sm text-gray-500">Photo unavailable — not yet geocoded</p>
          <p className="text-xs text-gray-400 mt-1">{address}</p>
        </div>
      </div>
    );
  }

  // Production mode with coordinates
  const url = getStreetViewUrl(lat!, lng!, apiKey, isDev);

  if (!url || imgError) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 flex flex-col items-center justify-center h-40">
          <p className="text-sm text-gray-500">
            {imgError ? 'Street View image unavailable' : 'Street View requires API key'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{address}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <img
        src={url}
        alt={`Street view of ${address}`}
        className="w-full h-64 sm:h-80 object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  );
}
