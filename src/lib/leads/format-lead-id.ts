// SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector deep-link)
//
// Inverse of parseLeadId: given a step-output row, produce the URL lead id the Lead Detail
// Inspector accepts (`${permit_num}--${revision_num}` / `COA-${application_number}`), or null
// when the row has no lead identity (geo/enrichment tables) → the deep-link cell is omitted.
//
// Handles the three row shapes the inspector encounters:
//   - permit-keyed rows (permit_trades, cost_estimates, permit_parcels): permit_num + revision_num
//   - lead_trades: only a colon lead_id (`permit:<num>:<rev>` w/ LPAD'd rev, or `coa:<app>`)
//   - coa_applications: application_number

export function formatLeadIdForUrl(row: Record<string, unknown>): string | null {
  const pnum = row.permit_num;
  const rev = row.revision_num;
  if (typeof pnum === 'string' && pnum.length > 0 && (typeof rev === 'string' || typeof rev === 'number')) {
    return `${pnum}--${String(rev)}`;
  }

  const lid = row.lead_id;
  if (typeof lid === 'string') {
    if (lid.startsWith('coa:')) {
      const app = lid.slice(4);
      return app.length > 0 ? `COA-${app}` : null;
    }
    if (lid.startsWith('permit:')) {
      // permit_num has no colon; the LAST ':' separates the (LPAD'd) revision. Keep the rev
      // verbatim — it matches the canonical 2-digit permits.revision_num the inspector queries.
      const rest = lid.slice('permit:'.length);
      const i = rest.lastIndexOf(':');
      if (i > 0) {
        const num = rest.slice(0, i);
        const r = rest.slice(i + 1);
        if (num.length > 0 && r.length > 0) return `${num}--${r}`;
      }
    }
  }

  const app = row.application_number;
  if (typeof app === 'string' && app.length > 0) return `COA-${app}`;

  return null;
}
