/**
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 * Tests: HTML table parser, status normalization, date parsing
 */
import { describe, it, expect } from 'vitest';
import {
  parseInspectionTable,
  normalizeStatus,
  parseInspectionDate,
} from '@/lib/inspections/parser';
import { createMockInspection } from './factories';

describe('Inspection Parser', () => {
  describe('parseInspectionTable', () => {
    it('extracts stages from a typical AIC HTML table', () => {
      const html = `
        <table>
          <tr><th>Inspection Stage</th><th>Status</th><th>Date</th></tr>
          <tr><td>Excavation/Shoring</td><td>Pass</td><td>01/15/2024</td></tr>
          <tr><td>Structural Framing</td><td>Outstanding</td><td>-</td></tr>
          <tr><td>Final Inspection</td><td>Fail</td><td>03/20/2024</td></tr>
        </table>
      `;
      const result = parseInspectionTable(html, '24 101234');

      expect(result).toHaveLength(3);
      expect(result[0].stage_name).toBe('Excavation/Shoring');
      expect(result[0].status).toBe('Pass');
      expect(result[0].inspection_date).toBe('2024-01-15');
      expect(result[0].permit_num).toBe('24 101234');

      expect(result[1].stage_name).toBe('Structural Framing');
      expect(result[1].status).toBe('Outstanding');
      expect(result[1].inspection_date).toBeNull();

      expect(result[2].stage_name).toBe('Final Inspection');
      expect(result[2].status).toBe('Fail');
      expect(result[2].inspection_date).toBe('2024-03-20');
    });

    it('skips header rows', () => {
      const html = `
        <table>
          <tr><td>Inspection Stage</td><td>Status</td><td>Date</td></tr>
          <tr><td>Rough-in Plumbing</td><td>Pass</td><td>02/10/2024</td></tr>
        </table>
      `;
      const result = parseInspectionTable(html, 'PLB-001');
      expect(result).toHaveLength(1);
      expect(result[0].stage_name).toBe('Rough-in Plumbing');
    });

    it('handles rows with only 2 columns (no date)', () => {
      const html = `
        <tr><td>Underground Plumbing</td><td>Outstanding</td></tr>
      `;
      const result = parseInspectionTable(html, 'PLB-001');
      expect(result).toHaveLength(1);
      expect(result[0].inspection_date).toBeNull();
    });

    it('returns empty array for empty table', () => {
      const result = parseInspectionTable('<table></table>', '24 101234');
      expect(result).toEqual([]);
    });

    it('strips inner HTML tags from cell content', () => {
      const html = `
        <tr><td><b>Insulation</b></td><td><span>Partial</span></td><td>05/01/2024</td></tr>
      `;
      const result = parseInspectionTable(html, '24 101234');
      expect(result[0].stage_name).toBe('Insulation');
      expect(result[0].status).toBe('Partial');
    });

    it('handles Partial status', () => {
      const html = `
        <tr><td>Vapour Barrier</td><td>Partially Completed</td><td>04/12/2024</td></tr>
      `;
      const result = parseInspectionTable(html, '24 101234');
      expect(result[0].status).toBe('Partial');
    });
  });

  describe('normalizeStatus', () => {
    it('maps standard values', () => {
      expect(normalizeStatus('Outstanding')).toBe('Outstanding');
      expect(normalizeStatus('Pass')).toBe('Pass');
      expect(normalizeStatus('Fail')).toBe('Fail');
      expect(normalizeStatus('Partial')).toBe('Partial');
    });

    it('handles case-insensitive variants', () => {
      expect(normalizeStatus('PASS')).toBe('Pass');
      expect(normalizeStatus('failed')).toBe('Fail');
      expect(normalizeStatus('Passed')).toBe('Pass');
      expect(normalizeStatus('partially completed')).toBe('Partial');
    });

    it('returns null for unknown status', () => {
      expect(normalizeStatus('Cancelled')).toBeNull();
      expect(normalizeStatus('')).toBeNull();
    });
  });

  describe('parseInspectionDate', () => {
    it('parses MM/DD/YYYY format', () => {
      expect(parseInspectionDate('01/15/2024')).toBe('2024-01-15');
      expect(parseInspectionDate('12/05/2023')).toBe('2023-12-05');
    });

    it('parses ISO format', () => {
      expect(parseInspectionDate('2024-01-15')).toBe('2024-01-15');
      expect(parseInspectionDate('2024-01-15T10:00:00Z')).toBe('2024-01-15');
    });

    it('returns null for empty/placeholder values', () => {
      expect(parseInspectionDate('')).toBeNull();
      expect(parseInspectionDate('-')).toBeNull();
      expect(parseInspectionDate('N/A')).toBeNull();
    });
  });

  describe('factory', () => {
    it('creates a valid mock inspection', () => {
      const insp = createMockInspection();
      expect(insp.permit_num).toBe('24 101234');
      expect(insp.stage_name).toBe('Structural Framing');
      expect(insp.status).toBe('Pass');
    });

    it('accepts overrides', () => {
      const insp = createMockInspection({ status: 'Outstanding', inspection_date: null });
      expect(insp.status).toBe('Outstanding');
      expect(insp.inspection_date).toBeNull();
    });
  });
});
