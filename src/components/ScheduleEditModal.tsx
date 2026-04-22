'use client';

import { useState } from 'react';

interface ScheduleEditModalProps {
  pipeline: string;
  pipelineName: string;
  currentCadence: string;
  onSave: (pipeline: string, cadence: string) => Promise<void>;
  onClose: () => void;
}

const CADENCE_OPTIONS = ['Daily', 'Quarterly', 'Annual'];

export function ScheduleEditModal({ pipeline, pipelineName, currentCadence, onSave, onClose }: ScheduleEditModalProps) {
  const [cadence, setCadence] = useState(currentCadence);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(pipeline, cadence);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-80 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Edit Schedule</h3>
        <p className="text-xs text-gray-500 mb-4">{pipelineName}</p>

        <label className="block text-xs font-medium text-gray-600 mb-1">Cadence</label>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        >
          {CADENCE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 text-sm py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || cadence === currentCadence}
            className={`flex-1 text-sm py-2 rounded-lg font-medium ${
              saving || cadence === currentCadence
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
