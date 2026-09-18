/**
 * Business timezone utilities.
 *
 * CRITICAL: All timestamps are stored as UTC in the database.
 * They are converted to America/New_York for display, calculations
 * that depend on date boundaries (weekly/monthly totals), and CSV exports.
 *
 * We use the IANA zone name "America/New_York" so DST (EST↔EDT) is
 * handled automatically by the runtime — never hardcode UTC-5.
 */

import { format, toZonedTime, fromZonedTime } from 'date-fns-tz'

export const BUSINESS_TIMEZONE = 'America/New_York'

/**
 * Convert a UTC Date to the business timezone, returning a Date whose
 * components reflect local wall-clock time in America/New_York.
 */
export function toBusinessTime(utcDate: Date): Date {
  return toZonedTime(utcDate, BUSINESS_TIMEZONE)
}

/**
 * Convert a business-time Date (wall-clock in America/New_York) back to UTC.
 */
export function fromBusinessTime(businessDate: Date): Date {
  return fromZonedTime(businessDate, BUSINESS_TIMEZONE)
}

/**
 * Returns the business date (YYYY-MM-DD) for a given UTC instant.
 * Used to bucket attendance events by day in the business timezone.
 */
export function businessDateKey(utcDate: Date): string {
  return format(toZonedTime(utcDate, BUSINESS_TIMEZONE), 'yyyy-MM-dd')
}

/**
 * Returns today's business date key in America/New_York.
 */
export function todayBusinessDateKey(): string {
  return businessDateKey(new Date())
}

/**
 * Format a UTC instant as a human-readable time in the business timezone.
 */
export function formatBusinessTime(utcDate: Date, fmt = 'hh:mm a'): string {
  return format(toZonedTime(utcDate, BUSINESS_TIMEZONE), fmt)
}

/**
 * Format a UTC instant as a human-readable date in the business timezone.
 */
export function formatBusinessDate(utcDate: Date, fmt = 'MMM d, yyyy'): string {
  return format(toZonedTime(utcDate, BUSINESS_TIMEZONE), fmt)
}

/**
 * Format a UTC instant as date+time in the business timezone.
 */
export function formatBusinessDateTime(utcDate: Date): string {
  return format(toZonedTime(utcDate, BUSINESS_TIMEZONE), 'MMM d, yyyy hh:mm a')
}

/**
 * Returns the start and end of a business day (America/New_York) as UTC instants.
 * Useful for "today" queries.
 */
export function businessDayRange(dateKey: string): { startUtc: Date; endUtc: Date } {
  // Parse the YYYY-MM-DD as a wall-clock time in America/New_York.
  const [year, month, day] = dateKey.split('-').map(Number)
  const startBusiness = new Date(year, month - 1, day, 0, 0, 0, 0)
  const endBusiness = new Date(year, month - 1, day, 23, 59, 59, 999)
  return {
    startUtc: fromZonedTime(startBusiness, BUSINESS_TIMEZONE),
    endUtc: fromZonedTime(endBusiness, BUSINESS_TIMEZONE),
  }
}

/**
 * Returns an array of business-date keys for the last N days ending today
 * (inclusive). Most recent first.
 */
export function lastNDays(n: number): string[] {
  const keys: string[] = []
  const now = toZonedTime(new Date(), BUSINESS_TIMEZONE)
  for (let i = 0; i < n; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    keys.push(format(d, 'yyyy-MM-dd'))
  }
  return keys
}

/**
 * Returns business-date keys for the current week (Mon-Sun) containing today.
 */
export function currentWeekRange(): { startKey: string; endKey: string; keys: string[] } {
  const now = toZonedTime(new Date(), BUSINESS_TIMEZONE)
  // Week starts Monday: getDay() returns 0=Sun..6=Sat
  const day = now.getDay()
  const offsetToMonday = (day + 6) % 7 // Mon=0, Tue=1, ..., Sun=6
  const monday = new Date(now)
  monday.setDate(monday.getDate() - offsetToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    keys.push(format(d, 'yyyy-MM-dd'))
  }
  return {
    startKey: format(monday, 'yyyy-MM-dd'),
    endKey: format(sunday, 'yyyy-MM-dd'),
    keys,
  }
}

/**
 * Returns business-date keys for the current month containing today.
 */
export function currentMonthRange(): { startKey: string; endKey: string; keys: string[] } {
  const now = toZonedTime(new Date(), BUSINESS_TIMEZONE)
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const keys: string[] = []
  const cursor = new Date(first)
  while (cursor <= last) {
    keys.push(format(cursor, 'yyyy-MM-dd'))
    cursor.setDate(cursor.getDate() + 1)
  }
  return {
    startKey: format(first, 'yyyy-MM-dd'),
    endKey: format(last, 'yyyy-MM-dd'),
    keys,
  }
}

/**
 * Convert a business-time "wall clock" string (e.g. "08:30") on a given
 * business date to a UTC instant. Used when an admin corrects attendance.
 */
export function businessTimeOnDate(dateKey: string, timeStr: string): Date {
  // timeStr can be "HH:mm" or "HH:mm:ss" or "HH:mm:ss.SSS"
  const [h, m, s] = timeStr.split(':').map((p) => parseInt(p, 10) || 0)
  const [year, month, day] = dateKey.split('-').map(Number)
  const business = new Date(year, month - 1, day, h, m, s || 0, 0)
  return fromZonedTime(business, BUSINESS_TIMEZONE)
}

/**
 * Returns the start of the current pay period (we use calendar month).
 */
export function currentPayPeriodStart(): Date {
  const now = toZonedTime(new Date(), BUSINESS_TIMEZONE)
  const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  return fromZonedTime(first, BUSINESS_TIMEZONE)
}
