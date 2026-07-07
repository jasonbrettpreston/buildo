// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §2.2 tier 3
//
// Type-aware renderer for the tier-3 `Record<string, unknown>` group values — the tool displays
// ~120 heterogeneous DB fields (null / boolean / number / date / string / JSONB) and MUST NOT
// crash or mis-render any of them (plan-review fold: a deliberate renderer, not ad-hoc JSX).
// Values render as PLAIN TEXT (React-escaped) — no dangerouslySetInnerHTML anywhere.

'use client';

import { useState } from 'react';

const ISO_DATEISH = /^\d{4}-\d{2}-\d{2}([T ]|$)/;
const LONG_STRING = 120;

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Render any DB field value safely. Exported for direct unit-testing of each branch. */
export function renderScalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '✓ yes' : '✗ no';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') {
    // Numeric strings (pg numeric columns arrive as strings) render as numbers.
    if (value !== '' && !Number.isNaN(Number(value)) && !ISO_DATEISH.test(value)) return formatNumber(Number(value));
    if (ISO_DATEISH.test(value)) return value.slice(0, 10);
    return value === '' ? '—' : value;
  }
  return ''; // objects/arrays handled by the component below
}

export function GenericFieldRenderer({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);

  // JSONB objects/arrays: collapsed pretty-JSON with an expand toggle.
  if (value !== null && typeof value === 'object') {
    let json: string;
    try {
      json = JSON.stringify(value, null, 2);
    } catch {
      json = '[unrenderable object]';
    }
    const oneLine = JSON.stringify(value);
    const isLong = (oneLine ?? '').length > LONG_STRING;
    return (
      <span className="font-mono text-xs">
        {expanded || !isLong ? (
          <pre className="whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-gray-50 rounded p-2">{json}</pre>
        ) : (
          <span className="text-gray-600">{oneLine.slice(0, LONG_STRING)}…</span>
        )}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-2 text-blue-600 hover:underline min-h-[44px] align-middle"
          >
            {expanded ? 'collapse' : 'expand'}
          </button>
        )}
      </span>
    );
  }

  const text = renderScalar(value);
  if (typeof value === 'string' && text.length > LONG_STRING) {
    return (
      <span>
        {expanded ? text : `${text.slice(0, LONG_STRING)}…`}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-2 text-blue-600 hover:underline min-h-[44px] align-middle"
        >
          {expanded ? 'less' : 'more'}
        </button>
      </span>
    );
  }
  return <span className={value == null ? 'text-gray-400' : ''}>{text}</span>;
}
