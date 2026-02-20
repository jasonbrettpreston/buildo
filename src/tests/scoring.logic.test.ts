// 🔗 SPEC LINK: docs/specs/10_lead_scoring.md
import { describe, it, expect } from 'vitest';
import { calculateLeadScore } from '@/lib/classification/scoring';
import { createMockPermit, createMockTradeMatch } from './factories';

describe('Lead Scoring', () => {
  it('returns a score between 0 and 100', () => {
    const permit = createMockPermit();
    const match = createMockTradeMatch();
    const score = calculateLeadScore(permit, match, 'structural');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('gives higher score to Issued permits than Under Review', () => {
    const issuedPermit = createMockPermit({ status: 'Issued' });
    const reviewPermit = createMockPermit({ status: 'Under Review' });
    const match = createMockTradeMatch();

    const issuedScore = calculateLeadScore(issuedPermit, match, 'structural');
    const reviewScore = calculateLeadScore(reviewPermit, match, 'structural');
    expect(issuedScore).toBeGreaterThan(reviewScore);
  });

  it('gives higher score to high-cost permits', () => {
    const lowCost = createMockPermit({ est_const_cost: 10000 });
    const highCost = createMockPermit({ est_const_cost: 5000000 });
    const match = createMockTradeMatch();

    const lowScore = calculateLeadScore(lowCost, match, 'structural');
    const highScore = calculateLeadScore(highCost, match, 'structural');
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('applies freshness boost for recently issued permits', () => {
    const recent = createMockPermit({
      issued_date: new Date(),
    });
    const old = createMockPermit({
      issued_date: new Date('2022-01-01'),
    });
    const match = createMockTradeMatch();

    const recentScore = calculateLeadScore(recent, match, 'structural');
    const oldScore = calculateLeadScore(old, match, 'structural');
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('applies staleness penalty for permits > 2 years old', () => {
    const stale = createMockPermit({
      issued_date: new Date('2020-01-01'),
    });
    const match = createMockTradeMatch();
    const score = calculateLeadScore(stale, match, 'structural');
    // Stale permits should get lower scores
    expect(score).toBeLessThan(80);
  });

  it('applies revocation penalty for cancelled permits', () => {
    const cancelled = createMockPermit({ status: 'Cancelled' });
    const issued = createMockPermit({ status: 'Issued' });
    const match = createMockTradeMatch();

    const cancelledScore = calculateLeadScore(
      cancelled,
      match,
      'structural'
    );
    const issuedScore = calculateLeadScore(issued, match, 'structural');
    expect(cancelledScore).toBeLessThan(issuedScore);
  });

  it('boosts score when trade matches current phase', () => {
    const permit = createMockPermit({ status: 'Issued', issued_date: new Date() });
    const plumbingMatch = createMockTradeMatch({
      trade_slug: 'plumbing',
      confidence: 0.95,
    });

    // Plumbing is structural phase (3-9 months)
    const matchingPhase = calculateLeadScore(
      permit,
      plumbingMatch,
      'structural'
    );
    const nonMatchingPhase = calculateLeadScore(
      permit,
      plumbingMatch,
      'landscaping'
    );
    expect(matchingPhase).toBeGreaterThan(nonMatchingPhase);
  });

  it('higher confidence gives higher score', () => {
    const permit = createMockPermit();
    const highConf = createMockTradeMatch({ confidence: 0.95 });
    const lowConf = createMockTradeMatch({ confidence: 0.50 });

    const highScore = calculateLeadScore(permit, highConf, 'structural');
    const lowScore = calculateLeadScore(permit, lowConf, 'structural');
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('clamps score to 0 minimum', () => {
    const terrible = createMockPermit({
      status: 'Cancelled',
      issued_date: new Date('2015-01-01'),
      est_const_cost: 0,
    });
    const match = createMockTradeMatch({ confidence: 0.3 });
    const score = calculateLeadScore(terrible, match, 'landscaping');
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('clamps score to 100 maximum', () => {
    const perfect = createMockPermit({
      status: 'Issued',
      issued_date: new Date(),
      est_const_cost: 10000000,
    });
    const match = createMockTradeMatch({ confidence: 0.99 });
    const score = calculateLeadScore(perfect, match, 'structural');
    expect(score).toBeLessThanOrEqual(100);
  });
});
