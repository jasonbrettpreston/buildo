// 🔗 SPEC LINK: CRM Assistant (update-tracked-projects.js)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('scripts/update-tracked-projects.js — CRM assistant shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/update-tracked-projects.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]update-tracked-projects['"]/);
  });

  it('imports TRADE_TARGET_PHASE from shared lib', () => {
    expect(content).toMatch(/TRADE_TARGET_PHASE/);
  });

  it('queries active tracked projects via JOIN', () => {
    expect(content).toMatch(/tracked_projects tp/);
    expect(content).toMatch(/JOIN permits p/);
    expect(content).toMatch(/LEFT JOIN trade_forecasts tf/);
  });

  it('reads memory columns for state-change detection', () => {
    expect(content).toMatch(/last_notified_urgency/);
    expect(content).toMatch(/last_notified_stalled/);
  });

  // Path A: Saved
  it('auto-archives saved projects when window closed or expired', () => {
    expect(content).toMatch(/tracking_status === 'saved'/);
    expect(content).toMatch(/isWindowClosed/);
    expect(content).toMatch(/status: 'archived'/);
  });

  // Path B: Claimed
  it('generates STALL_WARNING on state change (stalled=true, not previously notified)', () => {
    expect(content).toMatch(/STALL_WARNING/);
    expect(content).toMatch(/lifecycle_stalled === true/);
    expect(content).toMatch(/last_notified_stalled !== true/);
  });

  it('generates STALL_CLEARED when stall resolves', () => {
    expect(content).toMatch(/STALL_CLEARED/);
    expect(content).toMatch(/lifecycle_stalled === false/);
    expect(content).toMatch(/last_notified_stalled === true/);
  });

  it('generates START_IMMINENT on urgency state change (skips if stalled)', () => {
    expect(content).toMatch(/START_IMMINENT/);
    expect(content).toMatch(/urgency === 'imminent'/);
    expect(content).toMatch(/last_notified_urgency !== 'imminent'/);
    // WF3: skip imminent if stalled (contradictory signal)
    expect(content).toMatch(/lifecycle_stalled !== true/);
  });

  it('merges updates by ID before executing (prevents duplicate writes)', () => {
    // WF3 fix #1: stall + imminent on same row → merged into 1 UPDATE
    expect(content).toMatch(/merged/);
    expect(content).toMatch(/new Map\(\)/);
    expect(content).toMatch(/Object\.assign/);
  });

  it('wraps updates in withTransaction (prevents partial state on crash)', () => {
    // WF3 fix #2
    expect(content).toMatch(/pipeline\.withTransaction/);
    expect(content).toMatch(/client\.query/);
  });

  it('imports PHASE_ORDINAL from shared lib (not duplicated)', () => {
    // WF3 fix #3: was duplicated across 3 files
    expect(content).toMatch(/PHASE_ORDINAL.*require/);
    expect(content).not.toMatch(/const PHASE_ORDINAL\s*=/);
  });

  it('bumps updated_at on every DB update', () => {
    expect(content).toMatch(/updated_at = NOW\(\)/);
  });

  it('syncs lead_analytics via SQL UPSERT after processing', () => {
    // WF2: aggregates tracked_projects into lead_analytics so the
    // competition discount stays in sync with actual user behavior.
    expect(content).toMatch(/INSERT INTO lead_analytics/);
    expect(content).toMatch(/ON CONFLICT \(lead_key\) DO UPDATE/);
    expect(content).toMatch(/tracking_count/);
    expect(content).toMatch(/saving_count/);
    // Uses LPAD with ::text cast to match canonical key format
    expect(content).toMatch(/LPAD\(tp\.revision_num::text, 2, '0'\)/);
  });

  it('zeros out lead_analytics for fully-archived permits', () => {
    expect(content).toMatch(/UPDATE lead_analytics/);
    expect(content).toMatch(/tracking_count = 0/);
    expect(content).toMatch(/NOT EXISTS/);
  });

  it('reports analytics sync counts in telemetry', () => {
    expect(content).toMatch(/analytics_synced/);
    expect(content).toMatch(/analytics_zeroed/);
  });

  it('declares lead_analytics in PIPELINE_META writes', () => {
    expect(content).toMatch(/lead_analytics.*lead_key.*tracking_count/);
  });

  it('emits alerts array in PIPELINE_SUMMARY for downstream dispatch', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/alerts/);
    expect(content).toMatch(/stall_alerts/);
    expect(content).toMatch(/imminent_alerts/);
  });
});
