'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DataQualitySnapshot, DataQualityResponse } from '@/lib/quality/types';
import { calculateEffectivenessScore } from '@/lib/quality/types';
import { CoverageCard } from '@/components/CoverageCard';
import { ConfidenceHistogram } from '@/components/ConfidenceHistogram';
import { FreshnessTimeline } from '@/components/FreshnessTimeline';

function ScoreGauge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 rounded-full border-8 border-gray-200 flex items-center justify-center">
          <span className="text-2xl font-bold text-gray-400">N/A</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">No data yet</p>
      </div>
    );
  }

  const color =
    score >= 80 ? 'border-green-500 text-green-700' :
    score >= 60 ? 'border-yellow-500 text-yellow-700' :
    score >= 40 ? 'border-orange-500 text-orange-700' :
    'border-red-500 text-red-700';

  const bgColor =
    score >= 80 ? 'bg-green-50' :
    score >= 60 ? 'bg-yellow-50' :
    score >= 40 ? 'bg-orange-50' :
    'bg-red-50';

  const label =
    score >= 80 ? 'Excellent' :
    score >= 60 ? 'Good' :
    score >= 40 ? 'Fair' :
    'Needs Work';

  return (
    <div className="flex flex-col items-center">
      <div className={`w-32 h-32 rounded-full border-8 ${color} ${bgColor} flex items-center justify-center`}>
        <span className={`text-3xl font-bold ${color.split(' ')[1]}`}>
          {score.toFixed(1)}
        </span>
      </div>
      <p className={`text-sm font-medium mt-2 ${color.split(' ')[1]}`}>
        {label}
      </p>
    </div>
  );
}

function ScoreSparkline({ trends }: { trends: DataQualitySnapshot[] }) {
  const scores = trends
    .map((t) => calculateEffectivenessScore(t))
    .filter((s): s is number => s !== null)
    .reverse();

  if (scores.length < 2) return null;

  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min || 1;
  const w = 200;
  const h = 40;
  const step = w / (scores.length - 1);
  const points = scores
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(' ');

  return (
    <svg width={w} height={h} className="mt-2">
      <polyline
        points={points}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DataQualityDashboard() {
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(() => {
    fetch('/api/quality')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/quality/refresh', { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading data quality metrics...
      </div>
    );
  }

  const current = data?.current;
  const trends = data?.trends || [];
  const score = current ? calculateEffectivenessScore(current) : null;

  // Build trend arrays for sparklines (reversed so oldest first)
  const trendFor = (key: keyof DataQualitySnapshot, denomKey?: keyof DataQualitySnapshot) => {
    return trends.map((t) => {
      const val = t[key] as number;
      const denom = denomKey ? (t[denomKey] as number) : 0;
      return denomKey && denom > 0 ? (val / denom) * 100 : val;
    }).reverse();
  };

  // Confidence histogram buckets (placeholder — real data would come from a separate query)
  const tradeConfBuckets = [
    { label: '0.5-0.6', count: current ? Math.round(current.trade_tier3_count * 0.3) : 0 },
    { label: '0.6-0.7', count: current ? Math.round(current.trade_tier3_count * 0.5) : 0 },
    { label: '0.7-0.8', count: current ? Math.round(current.trade_tier2_count * 0.4) : 0 },
    { label: '0.8-0.9', count: current ? Math.round(current.trade_tier2_count * 0.6 + current.trade_tier1_count * 0.3) : 0 },
    { label: '0.9-1.0', count: current ? Math.round(current.trade_tier1_count * 0.7) : 0 },
  ];

  const coaConfBuckets = [
    { label: '0.3-0.5', count: current?.coa_low_confidence || 0 },
    { label: '0.5-0.6', count: current ? Math.round((current.coa_linked - current.coa_high_confidence - current.coa_low_confidence) * 0.3) : 0 },
    { label: '0.6-0.7', count: current ? Math.round((current.coa_linked - current.coa_high_confidence - current.coa_low_confidence) * 0.4) : 0 },
    { label: '0.7-0.8', count: current ? Math.round((current.coa_linked - current.coa_high_confidence - current.coa_low_confidence) * 0.3) : 0 },
    { label: '0.8-1.0', count: current?.coa_high_confidence || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Section A — Overall Health Score */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Data Effectiveness Score
          </h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreGauge score={score} />
          <div className="flex-1">
            <ScoreSparkline trends={trends} />
            {data?.lastUpdated && (
              <p className="text-xs text-gray-400 mt-2">
                Last updated: {new Date(data.lastUpdated).toLocaleString()}
              </p>
            )}
            {current && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <span>Total permits: {current.total_permits.toLocaleString()}</span>
                <span>Active permits: {current.active_permits.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section B — Coverage Matrix (3x2 grid) */}
      {current && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Trade Classification */}
          <CoverageCard
            title="Trade Classification"
            matched={current.permits_with_trades}
            total={current.active_permits}
            percentage={current.active_permits > 0 ? (current.permits_with_trades / current.active_permits) * 100 : 0}
            avgConfidence={current.trade_avg_confidence}
            trend={trendFor('permits_with_trades', 'active_permits')}
            details={[
              { label: 'Tier 1', value: `${current.trade_tier1_count.toLocaleString()} matches` },
              { label: 'Tier 2', value: `${current.trade_tier2_count.toLocaleString()} matches` },
              { label: 'Tier 3', value: `${current.trade_tier3_count.toLocaleString()} matches` },
              { label: 'Total matches', value: current.trade_matches_total.toLocaleString() },
            ]}
          />

          {/* Builder Enrichment */}
          <CoverageCard
            title="Builder Enrichment"
            matched={current.builders_enriched}
            total={current.builders_total}
            percentage={current.builders_total > 0 ? (current.builders_enriched / current.builders_total) * 100 : 0}
            trend={trendFor('builders_enriched', 'builders_total')}
            details={[
              { label: 'Permits w/ builder', value: current.permits_with_builder.toLocaleString() },
            ]}
            subBars={[
              { label: 'Phone', value: current.builders_with_phone, total: current.builders_total },
              { label: 'Email', value: current.builders_with_email, total: current.builders_total },
              { label: 'Website', value: current.builders_with_website, total: current.builders_total },
              { label: 'Google', value: current.builders_with_google, total: current.builders_total },
              { label: 'WSIB', value: current.builders_with_wsib, total: current.builders_total },
            ]}
          />

          {/* Parcel Linking */}
          <CoverageCard
            title="Parcel Linking"
            matched={current.permits_with_parcel}
            total={current.active_permits}
            percentage={current.active_permits > 0 ? (current.permits_with_parcel / current.active_permits) * 100 : 0}
            avgConfidence={current.parcel_avg_confidence}
            trend={trendFor('permits_with_parcel', 'active_permits')}
            details={[
              { label: 'Exact address', value: current.parcel_exact_matches.toLocaleString() },
              { label: 'Name only', value: current.parcel_name_matches.toLocaleString() },
            ]}
          />

          {/* Neighbourhood */}
          <CoverageCard
            title="Neighbourhood"
            matched={current.permits_with_neighbourhood}
            total={current.active_permits}
            percentage={current.active_permits > 0 ? (current.permits_with_neighbourhood / current.active_permits) * 100 : 0}
            trend={trendFor('permits_with_neighbourhood', 'active_permits')}
          />

          {/* Geocoding */}
          <CoverageCard
            title="Geocoding"
            matched={current.permits_geocoded}
            total={current.active_permits}
            percentage={current.active_permits > 0 ? (current.permits_geocoded / current.active_permits) * 100 : 0}
            trend={trendFor('permits_geocoded', 'active_permits')}
          />

          {/* CoA Linking */}
          <CoverageCard
            title="CoA Linking"
            matched={current.coa_linked}
            total={current.coa_total}
            percentage={current.coa_total > 0 ? (current.coa_linked / current.coa_total) * 100 : 0}
            avgConfidence={current.coa_avg_confidence}
            trend={trendFor('coa_linked', 'coa_total')}
            details={[
              { label: 'High conf (>=0.80)', value: current.coa_high_confidence.toLocaleString() },
              { label: 'Low conf (<0.50)', value: current.coa_low_confidence.toLocaleString() },
            ]}
          />
        </div>
      )}

      {/* Section C — Confidence Distribution Charts */}
      {current && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ConfidenceHistogram
            title="Trade Confidence Distribution"
            buckets={tradeConfBuckets}
          />
          <ConfidenceHistogram
            title="CoA Confidence Distribution"
            buckets={coaConfBuckets}
          />
        </div>
      )}

      {/* Section D — Freshness Timeline */}
      {current && <FreshnessTimeline snapshot={current} />}

      {/* Empty state */}
      {!current && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            No quality snapshots found. Click &quot;Refresh Metrics&quot; to capture the first snapshot.
          </p>
        </div>
      )}
    </div>
  );
}
