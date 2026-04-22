'use client';
/**
 * DeltaGuardInput — a number input that turns amber when the value deviates
 * more than 50% from the system default, warning the operator of a large change.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 3
 */

import React from 'react';
import { deltaExceeds50pct } from '@/lib/admin/control-panel';

interface DeltaGuardInputProps {
  varKey: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function DeltaGuardInput({
  varKey,
  value,
  onChange,
  min,
  max,
  step = 1,
  className = '',
}: DeltaGuardInputProps) {
  const isWarning = deltaExceeds50pct(varKey, value);

  return (
    <div
      data-testid="delta-guard-container"
      className={[
        'relative',
        isWarning ? 'ring-2 ring-amber-400 rounded-md' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className={[
          'w-full rounded-md border px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          'bg-white text-gray-900',
          isWarning
            ? 'border-amber-400 bg-amber-50 text-amber-900'
            : 'border-gray-300',
        ].join(' ')}
      />
      {isWarning && (
        <div className="absolute -top-5 left-0 text-xs text-amber-600 font-medium">
          ⚠ &gt;50% from default
        </div>
      )}
    </div>
  );
}
