// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 Cycle 8 amendment
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h (Color & Icon Strategy)
//             docs/specs/01-pipeline/42_chain_coa.md §6.6.B (cross-stream timeline JOIN)
//
// F.4 CoA Classification panel — 12 sub-sections rendering CoA-stage classifier output
// alongside the existing 8-panel admin inspector per Spec 76 §3.5 Cycle 8.
//
// v4.1 folds applied:
//   - CRIT-Ind-1: lifecycle_group/_block/_stage (NOT lifecycle_phase — mig 133)
//   - CRIT-Ind-2: universal_stream_catalog *_icon columns + cohort cols lifecycle_group/_block/_stage
//   - CRIT-Ind-5: dedicated LifecycleSeqWidgetProps interface (no Props collision)
//   - CRIT-v1-E: cost_source: string().nullable() — UI conditional badge for non-'geometric'
//   - HIGH-v2-D: WCAG accessibility — role="img"/role="progressbar"/aria-current="step"/<title>
//   - HIGH-v3-C: yellow warning badge when cost_source !== 'geometric'
//   - MED-v2-F + MED-DS-v4-D: COA_TYPE_CLASS_COLORS fallback with || (not ??) for empty-string
//   - MED-v2-U: NO dark: Tailwind variants (Spec 33 §2 single-theme)
//   - NIT-v1-Z: COA_TYPE_CLASS_COLORS extracted to constant map

'use client';

import { z } from 'zod';
import type {
  LeadInspectCoa,
  LeadInspectCoaCrossStreamEntry,
  LeadInspectCoaDecisionEntry,
  LeadInspectCoaLinkedPermit,
  LeadInspectCoaTrade,
  UniversalStreamCatalogRow,
} from '@/lib/admin/lead-schemas';
import { UniversalStreamCatalogRowSchema } from '@/lib/admin/lead-schemas';
import rawCatalog from '@/lib/admin/universal-stream-catalog.json';

// v4.1 (MED-Gem-v4-D + IMP-Obs-v4-1): runtime Zod validation of the bundled JSON catalog.
// Turns silent shape-drift bugs into a loud module-load failure if the generator script
// ever emits malformed JSON. ~9KB × 110 rows = negligible parse cost; once per process.
const TYPED_CATALOG: UniversalStreamCatalogRow[] = z
  .array(UniversalStreamCatalogRowSchema)
  .parse(rawCatalog);

// NIT-v1-Z: extracted Tailwind token map. Light-only (no dark: variants — Spec 33 §2).
const COA_TYPE_CLASS_COLORS: Record<string, string> = {
  residential: 'bg-green-100 text-green-800',
  commercial: 'bg-blue-100 text-blue-800',
  institutional: 'bg-purple-100 text-purple-800',
  mixed: 'bg-orange-100 text-orange-800',
  unclassified: 'bg-gray-100 text-gray-700',
};

interface CoaPanelProps {
  data: LeadInspectCoa;
  parentLeadType: 'permit' | 'coa';
  onNavigate: (leadId: string) => void;
}

export function CoaClassificationPanel({ data, parentLeadType, onNavigate }: CoaPanelProps) {
  // v4.1 HIGH-v3-C: warning badge for non-'geometric' cost_source.
  const costSourceWarn = data.cost_source != null && data.cost_source !== 'geometric';

  return (
    <section
      data-testid="coa-classification-panel"
      className="rounded-lg border border-gray-200 bg-white px-4 py-3 my-3"
      aria-label={`CoA Classification — ${parentLeadType === 'permit' ? 'Linked CoA (cross-stream)' : 'Primary'}`}
    >
      <header className="mb-2 flex items-baseline justify-between border-b border-gray-100 pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
          CoA Classification
        </h3>
        <span className="text-xs text-gray-500">
          {parentLeadType === 'permit' ? 'Linked CoA (cross-stream)' : 'Primary'}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-y-2 text-sm">
        <div data-testid="coa-panel-section-type-class">
          <CoaTypeClassChip value={data.coa_type_class} />
        </div>

        <div data-testid="coa-panel-section-project-type">
          <Field label="Project type" value={data.project_type} />
        </div>

        <div data-testid="coa-panel-section-scope-tags">
          <ScopeTagPills tags={data.scope_tags} />
        </div>

        <div data-testid="coa-panel-section-structure">
          <Field label="Structure type" value={data.structure_type} />
        </div>

        <div data-testid="coa-panel-section-decision">
          <DecisionTimeline current={data.decision_current} history={data.decision_history} />
        </div>

        <div data-testid="coa-panel-section-dates">
          <Field label="Decision date" value={data.decision_date} />
          <Field label="Hearing date" value={data.hearing_date} />
        </div>

        <div data-testid="coa-panel-section-cost">
          <GeometricCostPanel
            estimated_cost={data.estimated_cost}
            cost_source={data.cost_source}
            modeled_gfa_sqm={data.modeled_gfa_sqm}
          />
          {costSourceWarn && (
            <div className="mt-1 rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
              ⚠ Unexpected cost_source: <code>{data.cost_source}</code> — investigate Phase D classifier output
            </div>
          )}
        </div>

        <div data-testid="coa-panel-section-lifecycle">
          <LifecycleSeqWidget
            seq={data.lifecycle_seq}
            group_label={data.group_label}
            block_label={data.block_label}
            stage_label={data.stage_label}
            group_color={data.group_color}
            block_color={data.block_color}
            stage_color={data.stage_color}
            group_icon={data.group_icon}
            block_icon={data.block_icon}
            stage_icon={data.stage_icon}
            bidValue={data.bid_value}
          />
        </div>

        {data.linked_permit && (
          <div data-testid="coa-panel-section-linked-permit">
            <LinkedPermitChip permit={data.linked_permit} onNavigate={onNavigate} />
          </div>
        )}

        {data.cross_stream_timeline.length > 0 && (
          <div data-testid="coa-panel-section-cross-stream">
            <CrossStreamTimeline rows={data.cross_stream_timeline} />
          </div>
        )}

        <div data-testid="coa-panel-section-trades">
          <CoaTradesTable rows={data.lead_trades} />
        </div>
      </div>
    </section>
  );
}

function CoaTypeClassChip({ value }: { value: string | null }) {
  // v4.1 MED-v2-F + MED-DS-v4-D: use || for empty-string fallback (?? only handles null/undefined).
  const key = value || 'unclassified';
  const colorClasses = COA_TYPE_CLASS_COLORS[key] || COA_TYPE_CLASS_COLORS['unclassified'];
  const label = value || 'Unclassified';
  return (
    <span data-testid="coa-type-class-chip" className={`inline-block rounded px-2 py-1 text-xs ${colorClasses}`}>
      {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="font-mono text-sm text-gray-900">{value ?? '—'}</span>
    </div>
  );
}

function ScopeTagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <Field label="Scope tags" value={null} />;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-1">
      <span className="text-xs uppercase tracking-wide text-gray-500">Scope tags</span>
      {tags.map((t) => (
        <span key={t} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {t}
        </span>
      ))}
    </div>
  );
}

function DecisionTimeline({
  current,
  history,
}: {
  current: string | null;
  history: LeadInspectCoaDecisionEntry[];
}) {
  return (
    <div>
      <Field label="Decision (current)" value={current} />
      {history.length > 0 && (
        <ol className="ml-4 mt-1 list-disc text-xs text-gray-600">
          {history.map((h) => (
            <li key={`${h.transitioned_at}-${h.decision}`}>
              <code>{h.decision}</code> on {new Date(h.transitioned_at).toISOString().slice(0, 10)}
              {h.from_status && h.to_status && ` (${h.from_status} → ${h.to_status})`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function GeometricCostPanel({
  estimated_cost,
  cost_source,
  modeled_gfa_sqm,
}: {
  estimated_cost: number | null;
  cost_source: string | null;
  modeled_gfa_sqm: number | null;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-500">Estimated cost</span>
        <span className="font-mono text-sm text-gray-900">
          {estimated_cost != null ? `$${estimated_cost.toLocaleString()}` : '—'}
        </span>
        {cost_source === 'geometric' && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-blue-800">
            geometric
          </span>
        )}
      </div>
      <Field
        label="Modeled GFA"
        value={
          modeled_gfa_sqm != null
            ? `${modeled_gfa_sqm.toLocaleString()} m² (${Math.round(modeled_gfa_sqm * 10.764).toLocaleString()} sqft)`
            : null
        }
      />
    </div>
  );
}

interface LifecycleSeqWidgetProps {
  seq: number | null;
  group_label: string | null;
  block_label: string | null;
  stage_label: string | null;
  group_color: string | null;
  block_color: string | null;
  stage_color: string | null;
  group_icon: string | null;
  block_icon: string | null;
  stage_icon: string | null;
  bidValue: number | null;
}

// Spec 76 §3.5 Cycle 8 + Spec 84 §2.5.h Color & Icon Strategy:
// current-position label renders Group / Block / Stage chips each colored with their
// respective hex and prefixed by their emoji icon (mig 128 VARCHAR(8) codepoints).
function LifecyclePositionChip({
  label,
  color,
  icon,
  fallback,
}: {
  label: string | null;
  color: string | null;
  icon: string | null;
  fallback: string;
}) {
  const text = label ?? fallback;
  return (
    <span
      data-testid={`lifecycle-chip-${fallback}`}
      data-color={color ?? ''}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
      style={color ? { backgroundColor: `${color}22`, color: color, borderLeft: `3px solid ${color}` } : undefined}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{text}</span>
    </span>
  );
}

function LifecycleSeqWidget({
  seq,
  group_label,
  block_label,
  stage_label,
  group_color,
  block_color,
  stage_color,
  group_icon,
  block_icon,
  stage_icon,
  bidValue,
}: LifecycleSeqWidgetProps) {
  if (seq == null) {
    return <Field label="Lifecycle position" value="Not classified yet (Phase D scheduler pending)" />;
  }
  const ariaLabel = `Project lifecycle progression — 110 stages, current position: seq ${seq} (${group_label ?? '?'} / ${block_label ?? '?'} / ${stage_label ?? '?'})`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-sm font-medium">
        <span className="text-xs uppercase tracking-wide text-gray-500">Lifecycle seq {seq}</span>
        <LifecyclePositionChip label={group_label} color={group_color} icon={group_icon} fallback="group" />
        <span aria-hidden="true" className="text-gray-400">›</span>
        <LifecyclePositionChip label={block_label} color={block_color} icon={block_icon} fallback="block" />
        <span aria-hidden="true" className="text-gray-400">›</span>
        <LifecyclePositionChip label={stage_label} color={stage_color} icon={stage_icon} fallback="stage" />
      </div>
      <svg
        viewBox="0 0 1100 40"
        className="w-full"
        role="img"
        aria-label={ariaLabel}
        data-testid="lifecycle-scrubber-svg"
      >
        {TYPED_CATALOG.map((row) => (
          <rect
            key={row.seq}
            x={row.seq * 10}
            y={10}
            width={9}
            height={20}
            fill={row.group_color ?? '#cccccc'}
            stroke={row.seq === seq ? '#000' : 'transparent'}
            strokeWidth={row.seq === seq ? 2 : 0}
            aria-current={row.seq === seq ? 'step' : undefined}
            data-testid={`scrubber-position-${row.seq}`}
            data-current={row.seq === seq ? 'true' : 'false'}
          >
            <title>{`Seq ${row.seq}: ${row.group_label ?? '?'} / ${row.block_label ?? '?'} / ${row.stage_label ?? '?'}`}</title>
          </rect>
        ))}
      </svg>
      {bidValue != null && (
        <div
          className="mt-2"
          role="progressbar"
          aria-valuenow={bidValue}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuetext={`${(bidValue * 100).toFixed(0)}%`}
          aria-label="Bid value strength"
        >
          <div className="text-xs text-gray-600">bid_value</div>
          <div className="h-2 overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${bidValue * 100}%` }}
              data-testid="bid-value-bar"
              data-bid-value={bidValue}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LinkedPermitChip({
  permit,
  onNavigate,
}: {
  permit: LeadInspectCoaLinkedPermit;
  onNavigate: (leadId: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid="linked-permit-chip"
      className="inline-flex min-h-[44px] items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
      onClick={() => onNavigate(permit.lead_id)}
    >
      <span className="text-xs uppercase tracking-wide text-gray-500">Linked permit</span>
      <span className="font-mono">{permit.permit_num}:{permit.revision_num}</span>
      {permit.status && <span className="text-xs text-gray-600">({permit.status})</span>}
      <span className="text-xs text-blue-700">→ Jump to Permit Inspector</span>
    </button>
  );
}

function CrossStreamTimeline({ rows }: { rows: LeadInspectCoaCrossStreamEntry[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">Cross-stream timeline</div>
      <ol className="ml-4 mt-1 list-disc text-xs text-gray-700">
        {rows.map((r) => (
          <li key={`${r.lead_id}-${r.id}`}>
            <span
              className={`mr-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                r.lead_type === 'coa' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}
            >
              {r.lead_type}
            </span>
            {new Date(r.transitioned_at).toISOString().slice(0, 10)}:{' '}
            <code>
              {r.from_status ?? '—'} → {r.to_status ?? '—'}
            </code>{' '}
            <span className="text-gray-500">({r.lead_id})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CoaTradesTable({ rows }: { rows: LeadInspectCoaTrade[] }) {
  if (rows.length === 0) {
    return <Field label="CoA trades" value={null} />;
  }
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">CoA trades</div>
      <ul className="ml-4 mt-1 list-disc text-xs">
        {rows.map((r) => (
          <li key={r.trade_slug}>
            <span className="font-mono">{r.display_name ?? r.trade_slug}</span>
            {r.confidence != null && (
              <span className="ml-2 text-gray-500">conf {r.confidence.toFixed(2)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════
// F.4 v4.1 — Sibling banner components (HIGH-Ind-C + HIGH-v2-E + MED-v3-Ind-IMP-3)
// ════════════════════════════════════════════════════════════════════════════════════════

interface ClassifierPendingBannerProps {
  application_number: string;
}

// Spec 33 §11 read-only carve-out: this banner is rendered when the data layer already
// emitted a `data_quality_coa_substrate_missing` warning breadcrumb. The UI mount itself
// is a passive observation, not an admin action — no breadcrumb here (would duplicate).
export function ClassifierPendingBanner({ application_number }: ClassifierPendingBannerProps) {
  return (
    <section
      data-testid="classifier-pending-banner"
      role="status"
      aria-live="polite"
      className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 my-3"
    >
      <h3 className="text-sm font-semibold text-yellow-900">CoA not yet classified</h3>
      <p className="mt-1 text-xs text-yellow-800">
        Application <code className="font-mono">{application_number}</code> exists in CKAN ingest but Phase D classifier (
        <code>classify-coa-scope.js</code>) hasn&apos;t processed it yet. Classifier output will populate once the Phase D
        scheduler runs.
      </p>
    </section>
  );
}

interface OrphanLinkedCoaBannerProps {
  linked_coa_application_number: string;
}

export function OrphanLinkedCoaBanner({ linked_coa_application_number }: OrphanLinkedCoaBannerProps) {
  // v4.1 NIT-Obs3-9: NO own emit — data-layer breadcrumb fired earlier (fetchCoaPanel data_quality breadcrumb).
  return (
    <section
      data-testid="orphan-linked-coa-banner"
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 my-3"
    >
      <h3 className="text-sm font-semibold text-red-900">Linked CoA reference invalid</h3>
      <p className="mt-1 text-xs text-red-800">
        This permit references CoA application <code className="font-mono">{linked_coa_application_number}</code> but no
        matching <code>coa_applications</code> row exists. Possible data integrity issue — Sentry breadcrumb emitted at
        the data layer for triage.
      </p>
    </section>
  );
}
