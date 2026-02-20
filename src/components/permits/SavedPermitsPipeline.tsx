'use client';

import { useState } from 'react';
import type { SavedPermit } from '@/lib/auth/types';

interface SavedPermitsPipelineProps {
  savedPermits: SavedPermit[];
  onStatusChange?: (permitNum: string, revisionNum: string, status: SavedPermit['status']) => void;
  onRemove?: (permitNum: string, revisionNum: string) => void;
}

const PIPELINE_STAGES: { key: SavedPermit['status']; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { key: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'quoted', label: 'Quoted', color: 'bg-purple-100 text-purple-800' },
  { key: 'won', label: 'Won', color: 'bg-green-100 text-green-800' },
  { key: 'lost', label: 'Lost', color: 'bg-red-100 text-red-800' },
];

export function SavedPermitsPipeline({
  savedPermits,
  onStatusChange,
  onRemove,
}: SavedPermitsPipelineProps) {
  const [activeStage, setActiveStage] = useState<SavedPermit['status'] | 'all'>('all');

  const counts = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage.key] = savedPermits.filter((p) => p.status === stage.key).length;
      return acc;
    },
    {} as Record<string, number>
  );

  const filteredPermits =
    activeStage === 'all'
      ? savedPermits
      : savedPermits.filter((p) => p.status === activeStage);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Saved Leads Pipeline</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {savedPermits.length} total saved permits
        </p>
      </div>

      {/* Stage tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveStage('all')}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            activeStage === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All ({savedPermits.length})
        </button>
        {PIPELINE_STAGES.map((stage) => (
          <button
            key={stage.key}
            onClick={() => setActiveStage(stage.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeStage === stage.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {stage.label} ({counts[stage.key] || 0})
          </button>
        ))}
      </div>

      {/* Permits list */}
      <div className="divide-y divide-gray-100">
        {filteredPermits.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">
            No permits in this stage
          </div>
        ) : (
          filteredPermits.map((permit) => {
            const stage = PIPELINE_STAGES.find((s) => s.key === permit.status);
            return (
              <div
                key={`${permit.permit_num}--${permit.revision_num}`}
                className="px-5 py-3 flex items-center justify-between"
              >
                <div>
                  <a
                    href={`/permits/${permit.permit_num}--${permit.revision_num}`}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600"
                  >
                    {permit.permit_num}
                  </a>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stage?.color}`}
                    >
                      {stage?.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      Saved {new Date(permit.saved_at).toLocaleDateString()}
                    </span>
                  </div>
                  {permit.notes && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                      {permit.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {onStatusChange && (
                    <select
                      value={permit.status}
                      onChange={(e) =>
                        onStatusChange(
                          permit.permit_num,
                          permit.revision_num,
                          e.target.value as SavedPermit['status']
                        )
                      }
                      className="text-xs border border-gray-300 rounded px-1.5 py-1"
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {onRemove && (
                    <button
                      onClick={() => onRemove(permit.permit_num, permit.revision_num)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
