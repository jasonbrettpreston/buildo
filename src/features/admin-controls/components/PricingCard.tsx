'use client';
/**
 * PricingCard — the PRICING DATA admin surface (Spec 124 R-AU interim).
 *
 * Composes RatesGrid (12 archetype_cost_rates rows) and LinesGrid (13
 * parcel_cost_lines rows). Pricing joins the page's SINGLE apply flow: every
 * cell routes through the store's draft mutators, `hasUnsavedChanges` lights
 * the existing StickyActionBar, and ConfirmSyncModal → useUpdateConfigs PUTs
 * the computeDiff() sections. There is no second apply button, no separate
 * request, and no new store.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 4
 *            docs/specs/01-pipeline/88_parcel_cost_model.md §2.3
 *            docs/specs/01-pipeline/124_step_standard_policy.md (R-AU)
 */

import React from 'react';
import type { PricingRateRow, PricingLineRow } from '@/lib/admin/control-panel';
import { RatesGrid } from './RatesGrid';
import { LinesGrid } from './LinesGrid';

interface PricingCardProps {
  rates: PricingRateRow[];
  lines: PricingLineRow[];
}

export function PricingCard({ rates, lines }: PricingCardProps) {
  const rateArchetypes = rates.map((r) => r.archetype);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Cost rates ({rates.length})
        </h3>
        <RatesGrid rates={rates} />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Cost lines ({lines.length})
        </h3>
        <LinesGrid lines={lines} rateArchetypes={rateArchetypes} />
      </div>
    </div>
  );
}
