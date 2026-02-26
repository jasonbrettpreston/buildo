// 🔗 SPEC LINK: docs/specs/24_export.md
// CSV and PDF export formatting logic
import { describe, it, expect } from 'vitest';
import { formatCsvRow, CSV_COLUMNS } from '@/lib/export/csv';
import { generatePermitsPdf, type PdfOptions } from '@/lib/export/pdf';

describe('CSV_COLUMNS', () => {
  it('defines 16 columns', () => {
    expect(CSV_COLUMNS).toHaveLength(16);
  });

  it('starts with permit_num and revision_num', () => {
    expect(CSV_COLUMNS[0]).toBe('permit_num');
    expect(CSV_COLUMNS[1]).toBe('revision_num');
  });

  it('includes all essential permit fields', () => {
    const required = [
      'permit_num',
      'revision_num',
      'permit_type',
      'status',
      'work',
      'description',
      'street_num',
      'street_name',
      'ward',
      'builder_name',
      'est_const_cost',
      'issued_date',
    ];
    required.forEach((col) => {
      expect(CSV_COLUMNS).toContain(col);
    });
  });
});

describe('formatCsvRow', () => {
  it('formats a simple permit row', () => {
    const permit: Record<string, unknown> = {
      permit_num: '24 101234',
      revision_num: '01',
      permit_type: 'Building',
      status: 'Issued',
      work: 'Interior Alterations',
      description: 'Kitchen renovation',
      street_num: '123',
      street_name: 'QUEEN',
      ward: '10',
      builder_name: 'ACME',
      est_const_cost: 150000,
      application_date: '2024-01-15',
      issued_date: '2024-03-01',
      completed_date: null,
      dwelling_units_created: 0,
      storeys: 2,
    };

    const row = formatCsvRow(permit);
    const cells = row.split(',');

    expect(cells[0]).toBe('24 101234');
    expect(cells[1]).toBe('01');
    expect(cells[2]).toBe('Building');
    expect(cells[3]).toBe('Issued');
  });

  it('handles null values as empty strings', () => {
    const permit: Record<string, unknown> = {
      permit_num: '24 101234',
      revision_num: '01',
      completed_date: null,
    };

    const row = formatCsvRow(permit);
    // completed_date is the 14th column (index 13)
    const cells = row.split(',');
    // Null fields produce empty strings
    expect(cells[13]).toBe('');
  });

  it('quotes fields containing commas', () => {
    const permit: Record<string, unknown> = {
      description: 'Plumbing, electrical, and HVAC work',
    };

    const row = formatCsvRow(permit);
    expect(row).toContain('"Plumbing, electrical, and HVAC work"');
  });

  it('escapes double quotes by doubling them', () => {
    const permit: Record<string, unknown> = {
      description: 'Install "smart" thermostat',
    };

    const row = formatCsvRow(permit);
    expect(row).toContain('"Install ""smart"" thermostat"');
  });

  it('quotes fields containing newlines', () => {
    const permit: Record<string, unknown> = {
      description: 'Line one\nLine two',
    };

    const row = formatCsvRow(permit);
    expect(row).toContain('"Line one\nLine two"');
  });

  it('formats Date objects as ISO strings', () => {
    const date = new Date('2024-03-01T00:00:00.000Z');
    const permit: Record<string, unknown> = {
      issued_date: date,
    };

    const row = formatCsvRow(permit);
    expect(row).toContain('2024-03-01T00:00:00.000Z');
  });

  it('converts numbers to strings', () => {
    const permit: Record<string, unknown> = {
      est_const_cost: 150000,
      storeys: 3,
    };

    const row = formatCsvRow(permit);
    expect(row).toContain('150000');
    expect(row).toContain('3');
  });

  it('produces correct number of fields (matches CSV_COLUMNS length)', () => {
    const permit: Record<string, unknown> = {};
    const row = formatCsvRow(permit);
    // Empty permit still produces 16 comma-separated fields
    const cells = row.split(',');
    expect(cells).toHaveLength(CSV_COLUMNS.length);
  });
});

describe('generatePermitsPdf', () => {
  const defaultOptions: PdfOptions = {
    title: 'Test Report',
    filters: {},
    includeMap: false,
  };

  it('returns a Buffer', async () => {
    const result = await generatePermitsPdf([], defaultOptions);
    expect(result).toBeInstanceOf(Buffer);
  });

  it('produces valid HTML document', async () => {
    const result = await generatePermitsPdf([], defaultOptions);
    const html = result.toString('utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes the title in the HTML', async () => {
    const result = await generatePermitsPdf([], {
      ...defaultOptions,
      title: 'My Permit Report',
    });
    const html = result.toString('utf-8');
    expect(html).toContain('My Permit Report');
  });

  it('includes filter summary when filters provided', async () => {
    const result = await generatePermitsPdf([], {
      ...defaultOptions,
      filters: { ward: '10', status: 'Issued' },
    });
    const html = result.toString('utf-8');
    expect(html).toContain('ward');
    expect(html).toContain('10');
    expect(html).toContain('status');
    expect(html).toContain('Issued');
  });

  it('excludes empty/undefined filters', async () => {
    const result = await generatePermitsPdf([], {
      ...defaultOptions,
      filters: { ward: '10', status: undefined },
    });
    const html = result.toString('utf-8');
    expect(html).toContain('ward');
    expect(html).not.toContain('<strong>status:</strong>');
  });

  it('includes map placeholder when includeMap is true', async () => {
    const result = await generatePermitsPdf([], {
      ...defaultOptions,
      includeMap: true,
    });
    const html = result.toString('utf-8');
    expect(html).toContain('map-placeholder');
  });

  it('excludes map placeholder div when includeMap is false', async () => {
    const result = await generatePermitsPdf([], {
      ...defaultOptions,
      includeMap: false,
    });
    const html = result.toString('utf-8');
    // The CSS class definition is always present, but the actual div should not be
    expect(html).not.toContain('<div class="map-placeholder">');
  });

  it('renders permit data in table rows', async () => {
    const permits = [
      {
        permit_num: '24 101234',
        revision_num: '01',
        permit_type: 'Building',
        status: 'Issued',
        work: 'Interior Alterations',
        description: 'Test',
        street_num: '123',
        street_name: 'QUEEN',
        ward: '10',
        builder_name: 'ACME',
        est_const_cost: 150000,
        application_date: '2024-01-15',
        issued_date: '2024-03-01',
        completed_date: null,
        dwelling_units_created: 0,
        storeys: 2,
      },
    ];

    const result = await generatePermitsPdf(permits, defaultOptions);
    const html = result.toString('utf-8');
    expect(html).toContain('24 101234');
    expect(html).toContain('ACME');
    expect(html).toContain('150000');
  });

  it('escapes HTML in permit data to prevent XSS', async () => {
    const permits = [
      {
        description: '<script>alert("xss")</script>',
        builder_name: 'O\'Brien & Sons',
      },
    ];

    const result = await generatePermitsPdf(permits, defaultOptions);
    const html = result.toString('utf-8');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows permit count in metadata', async () => {
    const permits = [{}, {}, {}];
    const result = await generatePermitsPdf(permits, defaultOptions);
    const html = result.toString('utf-8');
    expect(html).toContain('3 permit(s)');
  });

  it('includes Buildo footer', async () => {
    const result = await generatePermitsPdf([], defaultOptions);
    const html = result.toString('utf-8');
    expect(html).toContain('Buildo');
    expect(html).toContain('Toronto Building Permit Intelligence');
  });
});
