export interface Neighbourhood {
  id: number;
  neighbourhood_id: number;
  name: string;
  geometry: Record<string, unknown> | null;
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
  created_at: Date;
}

export interface NeighbourhoodProfile {
  name: string;
  neighbourhood_id: number;
  summary: string;
  income: {
    avg_household: string;
    median_household: string;
    avg_individual: string;
    low_income_pct: string;
  };
  housing: {
    owner_pct: string;
    renter_pct: string;
    construction_era: string;
  };
  family: {
    couples_pct: string;
    lone_parent_pct: string;
    married_pct: string;
  };
  education: {
    university_degree_pct: string;
  };
  demographics: {
    immigrant_pct: string;
    visible_minority_pct: string;
    english_knowledge_pct: string;
    top_mother_tongue: string;
  };
  census_year: number;
}
