// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7 amendment)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §13
//
// Lead Detail Inspector — admin diagnostic surface for one permit. Consumes
// /api/admin/leads/inspect/:id (LeadInspect shape, ~70 fields, 8 panels)
// per Spec 76 §3.5 Cycle 7 — supersedes the Cycle 3 thin-shape pass-through
// to /api/leads/detail/:id (which stays unchanged for the mobile contract).
//
// 8 panels mirror step 27 (assert-global-coverage.js) coverage matrix:
// Identity · Source · Scope · Trades · Entity · Spatial · Cost · Lifecycle ·
// Forecast · Engagement. Cost panel is the diagnostic centerpiece —
// surfaces every Surgical Triangle input (Spec 83 §3) plus the Liar's Gate
// decision tree.
//
// Three-state UI per Spec 76 §3.5: idle / loading / result-or-error.
// Schema drift surfaces as a parse_error UI state with the issue list
// rendered side-by-side (NOT ErrorBoundary escalation).

'use client';

import React, { useEffect, useState } from 'react';
import {
  useLeadInspect,
  LeadInspectError,
} from '@/features/admin-flight-center/api/useLeadInspect';
import { ZodError } from 'zod';
import type {
  LeadInspect,
  LeadInspectTradeRow,
  LeadInspectForecastRow,
} from '@/lib/admin/lead-schemas';

interface Props {
  /** Optional pre-filled id (URL deep-link from Test Feed Tool). */
  initialId?: string | null;
}

/** Treat empty/whitespace strings as null so we don't fire fetches against `/api/admin/leads/inspect/`. */
function normalizeId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function LeadDetailInspector({ initialId = null }: Props) {
  const [pendingId, setPendingId] = useState(initialId ?? '');
  const [activeId, setActiveId] = useState<string | null>(normalizeId(initialId));

  // Sync activeId when initialId changes (deep-link reactivity per Spec 76 §3.5).
  // useState only reads the initial value on first render; without this effect a
  // parent re-passing initialId would not retrigger a fetch.
  useEffect(() => {
    const next = normalizeId(initialId);
    setActiveId(next);
    setPendingId(initialId ?? '');
  }, [initialId]);

  const { data, isLoading, isError, error } = useLeadInspect(activeId);

  return (
    <div data-testid="lead-detail-inspector" className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = pendingId.trim();
          setActiveId(trimmed.length > 0 ? trimmed : null);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={pendingId}
          onChange={(e) => setPendingId(e.target.value)}
          placeholder="permit-num--revision (e.g. 20-101234--00) or COA-app-number"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Lead ID"
          data-testid="lead-detail-inspector-input"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          data-testid="lead-detail-inspector-submit"
        >
          Inspect
        </button>
      </form>

      {!activeId && (
        <p data-testid="lead-detail-inspector-idle" className="text-sm text-gray-500">
          Paste a lead id and press <strong>Inspect</strong> to see the full
          8-panel diagnostic shape (~70 fields mirroring step 27 coverage matrix).
        </p>
      )}

      {activeId && isLoading && (
        <p data-testid="lead-detail-inspector-loading" className="text-sm text-gray-500">
          Loading…
        </p>
      )}

      {activeId && isError && error instanceof LeadInspectError && (
        <ErrorPanel
          code={error.code}
          status={error.status}
          serverMessage={error.serverMessage}
        />
      )}

      {activeId && isError && error instanceof ZodError && (
        <ParseErrorPanel error={error} />
      )}

      {/* Generic-error fallback — TanStack Query may throw a plain Error
          (network timeout, type error, etc.) that's neither LeadInspectError
          nor ZodError. Without this branch the user sees a blank area between
          loading and result. DeepSeek WF2 #4 review HIGH finding. */}
      {activeId &&
        isError &&
        !(error instanceof LeadInspectError) &&
        !(error instanceof ZodError) && (
          <ErrorPanel code="NETWORK" status={null} serverMessage={(error as Error).message} />
        )}

      {activeId && data && (
        <div data-testid="lead-detail-inspector-result" className="space-y-4">
          <StructuredLeadInspect data={data} />
          <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-xs font-medium text-gray-600">
              Raw JSON
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs text-gray-800">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 8 panels — chain-step grouped
// ===========================================================================

function StructuredLeadInspect({ data }: { data: LeadInspect }) {
  return (
    <div className="space-y-4">
      <Section title="Identity" testid="panel-identity">
        <Field label="lead_id" value={data.lead_id} />
        <Field label="lead_type" value={data.lead_type} />
      </Section>

      <SourcePanel data={data} />
      <ScopePanel data={data} />
      <TradesPanel rows={data.trades} />
      <EntityPanel data={data} />
      <SpatialPanel data={data} />
      <CostPanel data={data} />
      <LifecyclePanel data={data} />
      <ForecastPanel rows={data.forecast} />
      <EngagementPanel data={data} />
    </div>
  );
}

function SourcePanel({ data }: { data: LeadInspect }) {
  const s = data.source;
  return (
    <Section title="Source (steps 2 + 4)" testid="panel-source">
      <Field label="permit_num" value={s.permit_num ?? '—'} />
      <Field label="revision_num" value={s.revision_num ?? '—'} />
      <Field label="permit_type" value={s.permit_type ?? '—'} highlight={!s.permit_type} />
      <Field label="structure_type" value={s.structure_type ?? '—'} />
      <Field label="status" value={s.status ?? '—'} />
      <Field label="enriched_status" value={s.enriched_status ?? '—'} />
      <Field label="address" value={s.address.full} />
      <Field
        label="location"
        value={s.location ? `${s.location.lat.toFixed(4)}, ${s.location.lng.toFixed(4)}` : '—'}
      />
      <Field label="application_date" value={s.application_date ?? '—'} />
      <Field label="issued_date" value={s.issued_date ?? '—'} />
      <Field label="completed_date" value={s.completed_date ?? '—'} />
      <Field label="builder_name" value={s.builder_name ?? '—'} />
      <Field label="owner" value={s.owner ?? '—'} />
      <Field
        label="est_const_cost (city-reported)"
        value={s.est_const_cost?.toLocaleString() ?? '—'}
      />
      <FullWidthField
        label="description"
        value={s.description ?? '—'}
        testid="panel-source-description"
      />
    </Section>
  );
}

function ScopePanel({ data }: { data: LeadInspect }) {
  const s = data.scope;
  return (
    <Section title="Scope (step 5)" testid="panel-scope">
      <Field label="project_type" value={s.project_type ?? '—'} />
      <Field label="scope_tags.count" value={String(s.scope_tags.length)} />
      <FullWidthField
        label="scope_tags"
        value={s.scope_tags.length > 0 ? s.scope_tags.join(', ') : '—'}
      />
    </Section>
  );
}

function TradesPanel({ rows }: { rows: LeadInspectTradeRow[] }) {
  return (
    <Section title="Trades (step 13)" testid="panel-trades">
      {rows.length === 0 ? (
        <p className="col-span-2 text-xs text-gray-500">no permit_trades rows</p>
      ) : (
        <div className="col-span-2">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-mono text-gray-500">trade_slug</th>
                <th className="px-2 py-1 text-left font-mono text-gray-500">confidence</th>
                <th className="px-2 py-1 text-left font-mono text-gray-500">flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((t) => (
                <tr
                  key={t.trade_id}
                  className={t.is_default_fallback ? 'bg-orange-50' : 'bg-white'}
                  data-testid={`panel-trades-row-${t.trade_slug}`}
                >
                  <td className="px-2 py-1 font-mono text-gray-900">{t.trade_slug}</td>
                  <td className="px-2 py-1 font-mono text-gray-700">{t.confidence.toFixed(2)}</td>
                  <td className="px-2 py-1 text-orange-700">
                    {t.is_default_fallback ? 'default-fallback (no permit-specific signal)' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function EntityPanel({ data }: { data: LeadInspect }) {
  return (
    <Section title="Entity / WSIB (steps 6 + 7)" testid="panel-entity">
      {data.entity ? (
        <>
          <Field label="matched" value={String(data.entity.matched)} />
          <Field label="legal_name" value={data.entity.legal_name ?? '—'} />
          <Field label="name_normalized" value={data.entity.name_normalized ?? '—'} />
          <Field
            label="wsib_registered"
            value={data.entity.wsib_registered == null ? '—' : String(data.entity.wsib_registered)}
          />
        </>
      ) : (
        <p className="col-span-2 text-xs text-gray-500">entity not matched</p>
      )}
    </Section>
  );
}

function SpatialPanel({ data }: { data: LeadInspect }) {
  return (
    <Section title="Spatial (steps 8-11)" testid="panel-spatial">
      <SubsectionHeading label="parcel" />
      <Field label="parcel.id" value={data.spatial.parcel?.id?.toString() ?? '—'} />
      <Field
        label="parcel.area_sqm (lot size)"
        value={data.spatial.parcel?.area_sqm?.toFixed(0) ?? '—'}
      />
      <SubsectionHeading label="massing" />
      <Field
        label="massing.area_sqm (footprint)"
        value={data.spatial.massing?.area_sqm?.toFixed(0) ?? '—'}
      />
      <Field
        label="massing.height_m"
        value={data.spatial.massing?.height_m?.toFixed(1) ?? '—'}
      />
      <Field
        label="massing.stories"
        value={data.spatial.massing?.stories?.toString() ?? '—'}
      />
      <SubsectionHeading label="neighbourhood" />
      <Field
        label="neighbourhood.id"
        value={data.spatial.neighbourhood?.id?.toString() ?? '—'}
      />
      <Field
        label="neighbourhood.name"
        value={data.spatial.neighbourhood?.name ?? '—'}
      />
      <Field
        label="neighbourhood.avg_household_income"
        value={data.spatial.neighbourhood?.avg_household_income?.toLocaleString() ?? '—'}
      />
      <Field
        label="neighbourhood.period_of_construction"
        value={data.spatial.neighbourhood?.period_of_construction ?? '—'}
      />
    </Section>
  );
}

function CostPanel({ data }: { data: LeadInspect }) {
  if (!data.cost) {
    return (
      <Section title="Cost (step 14)" testid="panel-cost">
        <p className="col-span-2 text-xs text-gray-500">
          no cost_estimates row (cost_source: none)
        </p>
      </Section>
    );
  }
  const c = data.cost;
  return (
    <Section title="Cost (step 14) — DIAGNOSTIC CENTERPIECE" testid="panel-cost">
      <Field label="cost_source" value={c.cost_source ?? '—'} />
      <Field
        label="is_geometric_override"
        value={c.is_geometric_override == null ? '—' : String(c.is_geometric_override)}
      />
      <Field
        label="estimated_cost_total (TOTAL — not per-trade)"
        value={c.estimated_cost_total?.toLocaleString() ?? '—'}
        highlightAmber
      />
      <Field
        label="modeled_gfa_sqm"
        value={c.modeled_gfa_sqm?.toFixed(0) ?? '—'}
      />
      <SubsectionHeading label="Surgical Triangle inputs (Spec 83 §3)" />
      <Field
        label="lot_size_sqm"
        value={c.inputs.lot_size_sqm?.toFixed(0) ?? '—'}
      />
      <Field
        label="footprint_area_sqm"
        value={c.inputs.footprint_area_sqm?.toFixed(0) ?? '—'}
      />
      <Field
        label="height_m"
        value={c.inputs.height_m?.toFixed(1) ?? '—'}
      />
      <Field
        label="stories"
        value={c.inputs.stories?.toString() ?? '—'}
      />
      <SubsectionHeading label="Liar's Gate decision (Spec 83 §3D)" />
      <Field
        label="modeled_total"
        value={c.liar_gate.modeled_total?.toLocaleString() ?? '—'}
      />
      <Field
        label="reported_total"
        value={c.liar_gate.reported_total?.toLocaleString() ?? '—'}
      />
      <Field
        label="ratio (reported/modeled)"
        value={c.liar_gate.ratio?.toFixed(3) ?? '—'}
      />
      <Field label="path" value={c.liar_gate.path ?? '—'} />
      <SubsectionHeading label="Per-trade slices (trade_contract_values)" />
      {c.trade_contract_values && Object.keys(c.trade_contract_values).length > 0 ? (
        <div className="col-span-2">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-mono text-gray-500">trade_slug</th>
                <th className="px-2 py-1 text-right font-mono text-gray-500">slice ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(c.trade_contract_values).map(([slug, value]) => (
                <tr key={slug} className="bg-white" data-testid={`panel-cost-slice-${slug}`}>
                  <td className="px-2 py-1 font-mono text-gray-900">{slug}</td>
                  <td className="px-2 py-1 text-right font-mono text-gray-700">
                    {value.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="col-span-2 text-xs text-gray-500">trade_contract_values empty or null</p>
      )}
    </Section>
  );
}

function LifecyclePanel({ data }: { data: LeadInspect }) {
  return (
    <Section title="Lifecycle (step 21)" testid="panel-lifecycle">
      <Field label="phase" value={data.lifecycle.phase ?? '—'} />
      <Field label="stalled" value={String(data.lifecycle.stalled)} />
      <Field label="classified_at" value={data.lifecycle.classified_at ?? '—'} />
      <Field label="phase_started_at" value={data.lifecycle.phase_started_at ?? '—'} />
    </Section>
  );
}

function ForecastPanel({ rows }: { rows: LeadInspectForecastRow[] }) {
  return (
    <Section title="Forecast (steps 23-24)" testid="panel-forecast">
      {rows.length === 0 ? (
        <p className="col-span-2 text-xs text-gray-500">no trade_forecasts rows</p>
      ) : (
        <div className="col-span-2">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-mono text-gray-500">trade</th>
                <th className="px-2 py-1 text-left font-mono text-gray-500">window</th>
                <th className="px-2 py-1 text-left font-mono text-gray-500">urgency</th>
                <th className="px-2 py-1 text-right font-mono text-gray-500">score</th>
                <th className="px-2 py-1 text-right font-mono text-gray-500">slice ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.trade_slug} className="bg-white" data-testid={`panel-forecast-row-${r.trade_slug}`}>
                  <td className="px-2 py-1 font-mono text-gray-900">{r.trade_slug}</td>
                  <td className="px-2 py-1 text-gray-700">{r.target_window ?? '—'}</td>
                  <td className="px-2 py-1 text-gray-700">{r.urgency ?? '—'}</td>
                  <td className="px-2 py-1 text-right font-mono text-gray-700">
                    {r.opportunity_score?.toString() ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-gray-700">
                    {r.trade_slice_dollar?.toLocaleString() ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function EngagementPanel({ data }: { data: LeadInspect }) {
  return (
    <Section title="Engagement" testid="panel-engagement">
      <Field label="competition_count" value={String(data.engagement.competition_count)} />
      <Field label="saved_by_admin" value={String(data.engagement.saved_by_admin)} />
      <Field label="updated_at" value={data.updated_at} />
    </Section>
  );
}

// ===========================================================================
// Layout primitives
// ===========================================================================

function Section({
  title,
  children,
  testid,
}: {
  title: string;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4" data-testid={testid}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h4>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm md:grid-cols-2">{children}</dl>
    </div>
  );
}

function SubsectionHeading({ label }: { label: string }) {
  return (
    <p className="col-span-1 mt-2 text-xs font-semibold text-gray-400 md:col-span-2">
      {label}
    </p>
  );
}

function Field({
  label,
  value,
  highlight = false,
  highlightAmber = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  highlightAmber?: boolean;
}) {
  const className = highlightAmber
    ? 'text-xs text-amber-700 font-semibold'
    : highlight
      ? 'text-xs text-orange-700 font-semibold'
      : 'text-xs text-gray-900';
  return (
    <>
      <dt className="font-mono text-xs text-gray-500">{label}</dt>
      <dd className={className}>{value}</dd>
    </>
  );
}

function FullWidthField({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid?: string;
}) {
  return (
    <div className="md:col-span-2" data-testid={testid}>
      <dt className="font-mono text-xs text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-900 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

function ErrorPanel({
  code,
  status,
  serverMessage,
}: {
  code: 'NOT_FOUND' | 'INVALID_ID' | 'UNAUTHORIZED' | 'NETWORK';
  status: number | null;
  serverMessage: string | null;
}) {
  const testid = `lead-detail-inspector-error-${code.toLowerCase()}`;
  if (code === 'NOT_FOUND') {
    return (
      <div
        data-testid={testid}
        className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        <p className="font-semibold">Permit not found</p>
        <p className="mt-1 text-xs">
          No permit row with that id. The inspector is admin-scoped — it can read
          ANY permit, not just saved ones — so a 404 means the permit is genuinely
          absent.
        </p>
      </div>
    );
  }
  if (code === 'UNAUTHORIZED') {
    return (
      <div
        data-testid={testid}
        className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        <p className="font-semibold">Admin auth required</p>
        <p className="mt-1 text-xs">
          Spec 33 §5 — the diagnostic inspector requires admin auth. Sign in as
          an admin and retry.
        </p>
      </div>
    );
  }
  if (code === 'INVALID_ID') {
    return (
      <div
        data-testid={testid}
        className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        <p className="font-semibold">Invalid lead id</p>
        {serverMessage && <p className="mt-1 text-xs font-mono">{serverMessage}</p>}
        <p className="mt-1 text-xs">
          Expected: <code>permit-num--revision</code> for permits or{' '}
          <code>COA-app-number</code> for committee-of-adjustment leads.
        </p>
      </div>
    );
  }
  return (
    <div
      data-testid={testid}
      className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="font-semibold">Network error</p>
      <p className="mt-1 text-xs">
        {status ? `HTTP ${status}` : 'fetch failed'} — try again or check the API.
      </p>
    </div>
  );
}

function ParseErrorPanel({ error }: { error: ZodError }) {
  return (
    <div
      data-testid="lead-detail-inspector-parse-error"
      className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="font-semibold">Schema drift</p>
      <p className="mt-1 text-xs">
        The endpoint returned a payload that doesn&apos;t match the LeadInspect
        contract. This is a server-side bug — see the issues below.
      </p>
      <pre className="mt-2 max-h-64 overflow-auto text-xs">
        {JSON.stringify(error.issues, null, 2)}
      </pre>
    </div>
  );
}
