/**
 * CSV utilities.
 *
 * - Escapes values containing commas, quotes, or newlines per RFC 4180.
 * - Joins rows with \r\n (Excel-friendly).
 * - Helper to build a Response with proper headers for download.
 */

import { formatBusinessDate, formatBusinessTime } from '@/lib/timezone'

/** Escapes a value for CSV output. Wraps in quotes if it contains special chars. */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Builds a CSV string from an array of rows (each row = array of cells). */
export function buildCSV(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/**
 * Sanitize a filename for use in a Content-Disposition header. Strips
 * quotes, control chars, and path separators — defends against header
 * injection if a future caller interpolates user input.
 */
function sanitizeFilename(filename: string): string {
  // Strip anything that could break out of the quoted-string form.
  const cleaned = filename.replace(/["\r\n/\\]/g, '_')
  // Cap length to keep the header well under sane limits.
  return cleaned.slice(0, 200)
}

/**
 * Builds a Response that triggers a CSV download in the browser.
 * Pass a non-200 status for error CSVs (e.g. validation rejection).
 */
export function csvResponse(csv: string, filename: string, status: number = 200): Response {
  // Prepend BOM so Excel reads UTF-8 properly.
  const body = '\ufeff' + csv
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** Formats a Date (UTC) as a business-time "h:mm a" string for CSV cells. */
export function csvTime(utcDate: Date | null): string {
  if (!utcDate) return ''
  return formatBusinessTime(utcDate, 'hh:mm a')
}

/** Formats a Date (UTC) as a business-time "yyyy-MM-dd" string for CSV cells. */
export function csvDate(utcDate: Date | null): string {
  if (!utcDate) return ''
  return formatBusinessDate(utcDate, 'yyyy-MM-dd')
}
