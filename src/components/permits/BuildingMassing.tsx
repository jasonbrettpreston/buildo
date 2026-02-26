'use client';

import type { BuildingMassingInfo, StructureType } from '@/lib/massing/types';
import { formatHeight, formatArea, formatStories, formatCoverage } from '@/lib/massing/geometry';

interface BuildingMassingProps {
  massing: BuildingMassingInfo | null;
}

function getStructureLabel(type: StructureType): string {
  switch (type) {
    case 'garage': return 'Garage';
    case 'shed': return 'Shed';
    default: return 'Accessory';
  }
}

function getStructureBadgeColor(type: StructureType): string {
  switch (type) {
    case 'garage': return 'bg-blue-100 text-blue-800';
    case 'shed': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function BuildingMassing({ massing }: BuildingMassingProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Building Massing</h2>
      {massing && massing.primary ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Footprint Area</p>
              <p className="text-sm text-gray-900 mt-0.5">{formatArea(massing.primary.footprint_area_sqft)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Est. Stories</p>
              <p className="text-sm text-gray-900 mt-0.5">{formatStories(massing.primary.estimated_stories)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Est. Height</p>
              <p className="text-sm text-gray-900 mt-0.5">{formatHeight(massing.primary.max_height_m)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Building Coverage</p>
              <p className="text-sm text-gray-900 mt-0.5">{formatCoverage(massing.building_coverage_pct)}</p>
            </div>
          </div>
          {massing.accessory.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Accessory Structures</p>
              <div className="flex flex-wrap gap-2">
                {massing.accessory.map((a, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getStructureBadgeColor(a.structure_type)}`}
                  >
                    {getStructureLabel(a.structure_type)}
                    {a.footprint_area_sqft != null && (
                      <span className="text-xs opacity-75">
                        {Math.round(a.footprint_area_sqft).toLocaleString()} sq ft
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">City of Toronto 3D Massing, 2025</p>
        </>
      ) : (
        <p className="text-sm text-gray-400 italic">
          Building footprint data not available for this property.
        </p>
      )}
    </div>
  );
}
