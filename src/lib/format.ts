/**
 * Hours formatting utilities.
 *
 * Hours are stored internally as decimal numbers (e.g., 7.5 = seven and a half
 * hours). For display, we format them as "Xh Ym" (e.g., "7h 30m") instead of
 * decimal ("7.50h") — this is what users expect on a timekeeping platform.
 */

/**
 * Formats a decimal-hours value as "Xh Ym".
 *
 * Examples:
 *   7.5       → "7h 30m"
 *   8.0       → "8h 0m"
 *   0.25      → "0h 15m"
 *   7.25      → "7h 15m"
 *   7.0833    → "7h 5m"
 *   0         → "0h 0m"
 *   undefined → "—"
 */
export function formatHours(hours: number | undefined | null): string {
  if (hours === undefined || hours === null || !isFinite(hours)) return '—'
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m}m`
}

/**
 * Formats a decimal-hours value as "Xh Ym", omitting the hours part when zero.
 * Useful for compact displays like chart tooltips.
 *
 * Examples:
 *   0.5  → "30m"
 *   1.5  → "1h 30m"
 *   0.25 → "15m"
 *   0    → "0m"
 */
export function formatHoursCompact(hours: number | undefined | null): string {
  if (hours === undefined || hours === null || !isFinite(hours)) return '—'
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
