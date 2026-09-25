/**
 * Safe query-param parsing helpers.
 *
 * These guard against NaN poisoning. The old `parseInt(s || '100', 10)`
 * pattern returns NaN when the client sends `?limit=abc` (a non-empty
 * truthy string passes the `|| '100'` guard), and Prisma then throws
 * `PrismaClientValidationError` on `take: NaN`, surfacing as HTTP 500.
 */

import { businessDateKey } from '@/lib/timezone'

export function parseLimit(raw: string | null, opts: { default: number; max: number }): number {
  if (raw === null || raw === '') return opts.default
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return opts.default
  return Math.min(n, opts.max)
}

export function parseOffset(raw: string | null, opts: { default?: number; max?: number } = {}): number {
  if (raw === null || raw === '') return opts.default ?? 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return opts.default ?? 0
  if (opts.max !== undefined && n > opts.max) return opts.max
  return n
}

/**
 * Parses a YYYY-MM-DD string and returns a valid Date at 12:00 UTC, or null
 * if the input is malformed. Used by export routes to bound date ranges.
 */
export function parseBusinessDate(raw: string | null): Date | null {
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Validates a bounded date range. Returns { from, to, keys } on success or
 * { error, status } on failure.
 *
 * Caps the span at MAX_SPAN_DAYS (default 366) to prevent self-DoS via
 * enormous ranges like `?from=1900-01-01&to=2100-01-01`.
 *
 * The returned `keys` are business-tz (America/New_York) YYYY-MM-DD strings
 * — matching the format used by the AttendanceEvent.businessDate column.
 */
export function boundedDateRange(
  fromRaw: string | null,
  toRaw: string | null,
  opts: { maxSpanDays?: number; defaultDays?: number } = {}
): { from: Date; to: Date; keys: string[] } | { error: string; status: number } {
  const maxSpan = opts.maxSpanDays ?? 366
  const defaultDays = opts.defaultDays ?? 30

  // Default to last N days if either bound is missing.
  if (!fromRaw || !toRaw) {
    const to = new Date()
    const from = new Date(to)
    from.setUTCDate(from.getUTCDate() - defaultDays + 1)
    return { from, to, keys: buildBusinessKeys(from, to) }
  }

  const from = parseBusinessDate(fromRaw)
  const to = parseBusinessDate(toRaw)
  if (!from || !to) {
    return { error: 'Invalid date format. Use YYYY-MM-DD.', status: 400 }
  }
  if (from.getTime() > to.getTime()) {
    return { error: '"from" must be on or before "to".', status: 400 }
  }

  const keys = buildBusinessKeys(from, to)
  if (keys.length > maxSpan) {
    return { error: `Date range exceeds ${maxSpan} days.`, status: 400 }
  }

  return { from, to, keys }
}

/**
 * Walks UTC instants from→to one day at a time, formatting each as a
 * business-tz YYYY-MM-DD key. Uses 12:00 UTC as the reference instant so
 * the date can never accidentally roll back/forward at midnight during
 * DST transitions.
 */
function buildBusinessKeys(from: Date, to: Date): string[] {
  const keys: string[] = []
  const cursor = new Date(from)
  // Cap at 10× max span as a hard safety net (should be unreachable
  // because boundedDateRange already enforced maxSpan, but this keeps
  // buildBusinessKeys safe to call directly).
  let safety = 3660
  while (cursor <= to && safety-- > 0) {
    keys.push(businessDateKey(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys
}
