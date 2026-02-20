// ---------------------------------------------------------------------------
// PDF export stub for permits
// ---------------------------------------------------------------------------
//
// TODO: Replace the HTML string generation with a proper PDF library such as
// puppeteer (for headless Chrome rendering), pdfmake, or jsPDF once the
// project is ready for production PDF output. The current implementation
// returns a simple HTML document rendered as a Buffer, which can be served
// as an HTML download or piped through a headless browser for conversion.
// ---------------------------------------------------------------------------

import { CSV_COLUMNS } from '@/lib/export/csv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdfOptions {
  /** Title shown at the top of the PDF document. */
  title: string;

  /** Active filters applied to the permit set, displayed as metadata. */
  filters: Record<string, string | number | undefined>;

  /** Whether to include a map placeholder section. */
  includeMap: boolean;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  const str = value == null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a simple HTML-based permit report that can be served as a
 * downloadable file or converted to a real PDF via an external tool.
 *
 * @param permits  Array of permit row objects.
 * @param options  Rendering options (title, filters, map toggle).
 * @returns A Buffer containing the UTF-8 encoded HTML document.
 */
export async function generatePermitsPdf(
  permits: unknown[],
  options: PdfOptions
): Promise<Buffer> {
  const { title, filters, includeMap } = options;

  // Build active filter summary
  const activeFilters = Object.entries(filters)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
    .join('\n');

  // Build table rows
  const headerCells = CSV_COLUMNS.map(
    (col) => `<th>${escapeHtml(col)}</th>`
  ).join('');

  const bodyRows = permits
    .map((permit) => {
      const row = permit as Record<string, unknown>;
      const cells = CSV_COLUMNS.map((col) => {
        const val = row[col];
        const display = val instanceof Date ? val.toISOString().slice(0, 10) : escapeHtml(val);
        return `<td>${display}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  const mapSection = includeMap
    ? `<div class="map-placeholder">
        <p>[Map visualization placeholder &mdash; integrate with Leaflet or Google Maps]</p>
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
    .filters { font-size: 0.85rem; margin-bottom: 1.5rem; }
    .filters ul { padding-left: 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .map-placeholder {
      border: 2px dashed #ccc; padding: 2rem; text-align: center;
      color: #999; margin-bottom: 1.5rem; border-radius: 4px;
    }
    .footer { margin-top: 2rem; font-size: 0.75rem; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated ${new Date().toISOString().slice(0, 16)} &mdash; ${permits.length} permit(s)</p>

  ${activeFilters ? `<div class="filters"><strong>Filters:</strong><ul>${activeFilters}</ul></div>` : ''}

  ${mapSection}

  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>

  <p class="footer">Buildo &mdash; Toronto Building Permit Intelligence</p>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}
