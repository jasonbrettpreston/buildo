'use client';

interface NeighbourhoodData {
  name: string;
  neighbourhood_id: number;
  avg_household_income: number | null;
  median_household_income: number | null;
  avg_individual_income: number | null;
  low_income_pct: number | null;
  tenure_owner_pct: number | null;
  tenure_renter_pct: number | null;
  period_of_construction: string | null;
  couples_pct: number | null;
  lone_parent_pct: number | null;
  married_pct: number | null;
  university_degree_pct: number | null;
  immigrant_pct: number | null;
  visible_minority_pct: number | null;
  english_knowledge_pct: number | null;
  top_mother_tongue: string | null;
  census_year: number;
}

function classifyIncome(avg: number | null): string {
  if (avg == null) return 'unknown-income';
  if (avg >= 100000) return 'high-income';
  if (avg >= 60000) return 'middle-income';
  return 'lower-income';
}

function classifyTenure(ownerPct: number | null): string {
  if (ownerPct == null) return 'unknown-tenure';
  if (ownerPct >= 60) return 'owner-occupied';
  if (ownerPct <= 40) return 'renter-majority';
  return 'mixed-tenure';
}

function generateSummary(n: NeighbourhoodData): string {
  const parts: string[] = [];
  const income = classifyIncome(n.avg_household_income);
  if (income !== 'unknown-income') {
    parts.push(income.charAt(0).toUpperCase() + income.slice(1));
  }
  const tenure = classifyTenure(n.tenure_owner_pct);
  if (tenure !== 'unknown-tenure') {
    parts.push(tenure);
  }
  if (n.period_of_construction) {
    parts.push(`built ${n.period_of_construction}`);
  }
  return parts.join(', ');
}

function formatIncome(v: number | null): string {
  if (v == null) return 'N/A';
  return `$${v.toLocaleString()}`;
}

function formatPct(v: number | null): string {
  if (v == null) return 'N/A';
  return `${v}%`;
}

function formatPeriod(v: string | null): string {
  if (!v) return 'N/A';
  return `Built ${v}`;
}

export default function NeighbourhoodProfile({ neighbourhood }: { neighbourhood: NeighbourhoodData | null }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Neighbourhood Profile</h2>
      {neighbourhood ? (
        <NeighbourhoodContent neighbourhood={neighbourhood} />
      ) : (
        <p className="text-sm text-gray-400 italic">
          Neighbourhood data not yet linked to this permit.
        </p>
      )}
    </div>
  );
}

function NeighbourhoodContent({ neighbourhood }: { neighbourhood: NeighbourhoodData }) {
  const summary = generateSummary(neighbourhood);

  return (
    <>
      <p className="text-sm text-gray-600 mb-1">{neighbourhood.name}</p>
      {summary && (
        <p className="text-sm text-gray-500 italic mb-4">{summary}</p>
      )}

      <div className="space-y-4">
        {/* Income */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Income</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Avg Household" value={formatIncome(neighbourhood.avg_household_income)} />
            <Field label="Median Household" value={formatIncome(neighbourhood.median_household_income)} />
            <Field label="Avg Individual" value={formatIncome(neighbourhood.avg_individual_income)} />
            <Field label="Low Income" value={formatPct(neighbourhood.low_income_pct)} />
          </div>
        </div>

        {/* Housing */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Housing</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Owners" value={formatPct(neighbourhood.tenure_owner_pct)} />
            <Field label="Renters" value={formatPct(neighbourhood.tenure_renter_pct)} />
            <Field label="Construction Era" value={formatPeriod(neighbourhood.period_of_construction)} />
          </div>
        </div>

        {/* Family */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Family</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Couples" value={formatPct(neighbourhood.couples_pct)} />
            <Field label="Lone Parent" value={formatPct(neighbourhood.lone_parent_pct)} />
            <Field label="Married" value={formatPct(neighbourhood.married_pct)} />
          </div>
        </div>

        {/* Education */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Education</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="University Degree" value={formatPct(neighbourhood.university_degree_pct)} />
          </div>
        </div>

        {/* Demographics */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Demographics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Immigrants" value={formatPct(neighbourhood.immigrant_pct)} />
            <Field label="Visible Minority" value={formatPct(neighbourhood.visible_minority_pct)} />
            <Field label="English Knowledge" value={formatPct(neighbourhood.english_knowledge_pct)} />
            <Field label="Top Mother Tongue" value={neighbourhood.top_mother_tongue || 'N/A'} />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Source: Statistics Canada, Census {neighbourhood.census_year}
      </p>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value || 'N/A'}</p>
    </div>
  );
}
