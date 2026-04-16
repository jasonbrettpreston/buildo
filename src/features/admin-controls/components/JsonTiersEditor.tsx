'use client';
/**
 * JsonTiersEditor — edits the income_premium_tiers JSONB field.
 * Shows raw JSON in a textarea; parses on blur and reports errors inline.
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 3
 */

import React, { useEffect, useState } from 'react';

interface JsonTiersEditorProps {
  /** Current JSON value — null means not yet set */
  value: Record<string, number> | null;
  onChange: (value: Record<string, number>) => void;
}

export function JsonTiersEditor({ value, onChange }: JsonTiersEditorProps) {
  const [raw, setRaw] = useState(() =>
    value ? JSON.stringify(value, null, 2) : '{}',
  );
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync textarea when the parent resets the value (e.g. after resetDrafts()).
  // Without this, the textarea shows stale draft JSON after discard.
  useEffect(() => {
    setRaw(value ? JSON.stringify(value, null, 2) : '{}');
    setParseError(null);
  }, [value]);

  function handleBlur() {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setParseError('Must be a JSON object (e.g. {"100000": 1.2, "150000": 1.5})');
        return;
      }

      const coerced = parsed as Record<string, unknown>;
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(coerced)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          setParseError(`Value for key "${k}" must be a finite number`);
          return;
        }
        result[k] = v;
      }

      setParseError(null);
      onChange(result);
    } catch {
      setParseError('Invalid JSON — check syntax');
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
        income_premium_tiers
      </label>
      <textarea
        rows={4}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={handleBlur}
        spellCheck={false}
        className={[
          'w-full rounded-md border px-3 py-2 font-mono text-xs',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          parseError
            ? 'border-red-400 bg-red-50 text-red-900'
            : 'border-gray-300 bg-white text-gray-900',
        ].join(' ')}
        aria-label="income_premium_tiers JSON editor"
      />
      {parseError && (
        <p className="text-xs text-red-600" role="alert">
          {parseError}
        </p>
      )}
      <p className="text-xs text-gray-400">
        Format: &#123;&quot;income_threshold&quot;: multiplier, …&#125; — edit then click away to apply
      </p>
    </div>
  );
}
