/**
 * Attendance engine — the core domain layer.
 *
 * Design:
 *  - Source of truth: AttendanceEvent ledger (append-mostly).
 *  - Worked hours / breaks / earnings are DERIVED from events, never stored
 *    as a manually editable field.
 *  - State machine: OFFLINE → WORKING → (BREAK → WORKING)* → OFFLINE.
 *  - Backend validates every transition. The frontend only sends an intent
 *    ("CLOCK_IN" / "BREAK_START" etc.); the engine decides if it's allowed.
 *  - Money is computed in CENTS (integers) to avoid floating-point error.
 *    Dollars are only produced for display.
 *  - All timezone math goes through src/lib/timezone.ts (America/New_York).
 *
 * Anti-tampering:
 *  - User cannot pass their own userId, hourlyRate, hours, or earnings.
 *  - The server resolves userId from the session and the rate from the
 *    CompensationRecord effective-dated history.
 */

import { db } from '@/lib/db'
import { businessDateKey } from '@/lib/timezone'

// =====================================================
// Event types & state machine
// =====================================================

export type EventType = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END'
export type AgentState = 'OFFLINE' | 'WORKING' | 'ON_BREAK'

export const EVENT_TYPES: EventType[] = ['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']

/**
 * Legal transitions given current state and requested action.
 *   OFFLINE    + CLOCK_IN     → WORKING
 *   WORKING    + BREAK_START  → ON_BREAK
 *   WORKING    + CLOCK_OUT    → OFFLINE
 *   ON_BREAK   + BREAK_END    → WORKING
 * Anything else is invalid.
 */
export function nextState(current: AgentState, action: EventType): AgentState | null {
  switch (current) {
    case 'OFFLINE':
      return action === 'CLOCK_IN' ? 'WORKING' : null
    case 'WORKING':
      if (action === 'BREAK_START') return 'ON_BREAK'
      if (action === 'CLOCK_OUT') return 'OFFLINE'
      return null
    case 'ON_BREAK':
      return action === 'BREAK_END' ? 'WORKING' : null
  }
}

export interface EventValidationError {
  code:
    | 'ALREADY_WORKING'
    | 'NOT_WORKING'
    | 'ALREADY_ON_BREAK'
    | 'NOT_ON_BREAK'
    | 'INVALID_ACTION'
  message: string
}

/**
 * Validates a proposed event against the current state of the user.
 * Returns null if valid, or an error object.
 */
export function validateTransition(current: AgentState, action: EventType): EventValidationError | null {
  const next = nextState(current, action)
  if (next !== null) return null

  switch (action) {
    case 'CLOCK_IN':
      return { code: 'ALREADY_WORKING', message: 'You are already clocked in.' }
    case 'BREAK_START':
      if (current === 'ON_BREAK') return { code: 'ALREADY_ON_BREAK', message: 'You are already on break.' }
      return { code: 'NOT_WORKING', message: 'You must be clocked in to start a break.' }
    case 'BREAK_END':
      if (current === 'OFFLINE') return { code: 'NOT_WORKING', message: 'You are not clocked in.' }
      return { code: 'NOT_ON_BREAK', message: 'You are not on break.' }
    case 'CLOCK_OUT':
      if (current === 'ON_BREAK') return { code: 'NOT_WORKING', message: 'Please end your break before clocking out.' }
      return { code: 'NOT_WORKING', message: 'You are not clocked in.' }
  }
}

// =====================================================
// Querying current state from the event ledger
// =====================================================

/**
 * Returns the agent's current state by replaying the most recent events.
 *
 * Strategy: get the most recent event. If it's CLOCK_OUT → OFFLINE.
 * If CLOCK_IN or BREAK_END → WORKING. If BREAK_START → ON_BREAK.
 * If no events → OFFLINE.
 *
 * NOTE: We deliberately do NOT filter `correctedById: null`. Corrected
 * events (added via admin correction approval) ARE the source of truth —
 * if an admin approves a CLOCK_IN correction, the user's live state must
 * become WORKING. The old filter caused the live state to disagree with
 * the day summary (which already included corrected events), surfacing
 * as "Today shows 8h worked but my status is OFFLINE" UX bugs.
 */
export async function getAgentState(userId: string): Promise<{ state: AgentState; lastEvent?: any }> {
  const last = await db.attendanceEvent.findFirst({
    where: { userId },
    orderBy: { timestampUtc: 'desc' },
  })
  if (!last) return { state: 'OFFLINE' }
  switch (last.eventType as EventType) {
    case 'CLOCK_OUT':
      return { state: 'OFFLINE', lastEvent: last }
    case 'CLOCK_IN':
    case 'BREAK_END':
      return { state: 'WORKING', lastEvent: last }
    case 'BREAK_START':
      return { state: 'ON_BREAK', lastEvent: last }
    default:
      return { state: 'OFFLINE', lastEvent: last }
  }
}

// =====================================================
// Event recording
// =====================================================

export interface RecordEventResult {
  ok: boolean
  error?: EventValidationError
  event?: any
  state?: AgentState
}

/**
 * Records an attendance event for a user, validating the transition first.
 * Throws on unexpected DB errors. Returns { ok: false, error } on invalid.
 *
 * CONCURRENCY: The whole check-then-insert sequence runs inside a single
 * Postgres transaction that locks the User row (`SELECT ... FOR UPDATE`).
 * Two concurrent CLOCK_IN requests for the same user therefore serialize
 * — the second one waits for the first to commit, re-reads the ledger, and
 * correctly sees WORKING → returns ALREADY_WORKING instead of creating a
 * duplicate event.
 */
export async function recordEvent(
  userId: string,
  action: EventType,
  opts?: { source?: string; note?: string; at?: Date }
): Promise<RecordEventResult> {
  return db.$transaction(async (tx) => {
    // Lock the user row so concurrent recordEvent calls for the same user
    // serialize. Other users are unaffected.
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`

    // Re-read state INSIDE the transaction so we see any committed changes
    // from a concurrent call.
    const last = await tx.attendanceEvent.findFirst({
      where: { userId },
      orderBy: { timestampUtc: 'desc' },
    })
    const current = deriveStateFromEvent(last)
    const err = validateTransition(current, action)
    if (err) return { ok: false, error: err }

    const now = opts?.at ?? new Date()
    const event = await tx.attendanceEvent.create({
      data: {
        userId,
        eventType: action,
        timestampUtc: now,
        businessDate: businessDateKey(now),
        source: opts?.source ?? 'web',
        note: opts?.note ?? null,
      },
    })

    const nextState = deriveStateFromEvent(event)
    return { ok: true, event, state: nextState }
  })
}

/** Pure derivation of state from the latest event. Used internally. */
function deriveStateFromEvent(
  last: { eventType: string } | null
): AgentState {
  if (!last) return 'OFFLINE'
  switch (last.eventType as EventType) {
    case 'CLOCK_OUT':
      return 'OFFLINE'
    case 'CLOCK_IN':
    case 'BREAK_END':
      return 'WORKING'
    case 'BREAK_START':
      return 'ON_BREAK'
    default:
      return 'OFFLINE'
  }
}

// =====================================================
// Money helpers (decimal-safe via integer cents)
// =====================================================

export const CENTS_PER_DOLLAR = 100

/** Converts dollars (number) to cents (integer). */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * CENTS_PER_DOLLAR)
}

/** Converts cents (integer) to dollars (number with 2 decimal places). */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / CENTS_PER_DOLLAR
}

/** Formats cents as a USD string: 3750 → "$37.50" */
export function formatCentsAsUSD(cents: number): string {
  const dollars = centsToDollars(cents)
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// =====================================================
// Hours calculations (decimal hours, but money stays in cents)
// =====================================================

/**
 * Compute hours (decimal) between two UTC instants, in seconds.
 * Returns hours as a number with 4 decimal places precision.
 */
export function hoursBetween(startUtc: Date, endUtc: Date): number {
  const ms = endUtc.getTime() - startUtc.getTime()
  if (ms <= 0) return 0
  return Math.round((ms / 3_600_000) * 10_000) / 10_000
}

export interface DaySummary {
  businessDate: string // YYYY-MM-DD
  clockInUtc: Date | null
  clockOutUtc: Date | null
  breakDurationMs: number
  breakHours: number
  grossHours: number
  netHours: number
  hourlyRate: number
  earningsCents: number
  status: 'COMPLETE' | 'IN_PROGRESS' | 'NO_EVENTS' | 'INCOMPLETE'
}

/**
 * Given a user's events for a single business date, computes the day summary.
 *
 * Status:
 *  - NO_EVENTS: no CLOCK_IN found.
 *  - IN_PROGRESS: clocked in, not yet clocked out (uses "now" as end).
 *  - INCOMPLETE: missing CLOCK_OUT (and not currently clocked in for today).
 *  - COMPLETE: CLOCK_IN + CLOCK_OUT present, all breaks balanced.
 *
 * Hours:
 *  - gross: CLOCK_OUT - CLOCK_IN (or now if in progress)
 *  - breaks: sum of (BREAK_END - BREAK_START) within the day
 *  - net: gross - breaks
 *
 * Earnings: netHours * hourlyRate, in CENTS (no float error).
 */
export function computeDaySummary(
  events: { eventType: string; timestampUtc: Date; businessDate: string }[],
  businessDate: string,
  hourlyRate: number,
  now: Date = new Date()
): DaySummary {
  // Sort by timestamp ascending.
  const sorted = [...events].sort(
    (a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime()
  )

  const clockIn = sorted.find((e) => e.eventType === 'CLOCK_IN')
  const clockOut = sorted.find((e) => e.eventType === 'CLOCK_OUT')
  const breakStarts = sorted.filter((e) => e.eventType === 'BREAK_START')
  const breakEnds = sorted.filter((e) => e.eventType === 'BREAK_END')

  if (!clockIn) {
    return {
      businessDate,
      clockInUtc: null,
      clockOutUtc: null,
      breakDurationMs: 0,
      breakHours: 0,
      grossHours: 0,
      netHours: 0,
      hourlyRate,
      earningsCents: 0,
      status: 'NO_EVENTS',
    }
  }

  let endUtc: Date
  let status: DaySummary['status']
  if (clockOut) {
    endUtc = clockOut.timestampUtc
    status = 'COMPLETE'
  } else {
    endUtc = now
    status = 'IN_PROGRESS'
  }

  const grossHours = hoursBetween(clockIn.timestampUtc, endUtc)

  // Breaks: pair BREAK_START with the next BREAK_END (within the day).
  let breakDurationMs = 0
  const breakPairs = Math.min(breakStarts.length, breakEnds.length)
  for (let i = 0; i < breakPairs; i++) {
    const s = breakStarts[i].timestampUtc
    const e = breakEnds[i].timestampUtc
    if (e.getTime() > s.getTime()) breakDurationMs += e.getTime() - s.getTime()
  }
  // Handle an open break (BREAK_START with no matching BREAK_END) when in-progress.
  if (breakStarts.length > breakEnds.length && status === 'IN_PROGRESS') {
    const openStart = breakStarts[breakEnds.length].timestampUtc
    if (endUtc.getTime() > openStart.getTime()) {
      breakDurationMs += endUtc.getTime() - openStart.getTime()
    }
  }

  const breakHours = Math.round((breakDurationMs / 3_600_000) * 10_000) / 10_000
  const netHours = Math.max(0, Math.round((grossHours - breakHours) * 10_000) / 10_000)

  const earningsCents = Math.round(netHours * hourlyRate * CENTS_PER_DOLLAR)

  if (!clockOut && status !== 'IN_PROGRESS') status = 'INCOMPLETE'

  return {
    businessDate,
    clockInUtc: clockIn.timestampUtc,
    clockOutUtc: clockOut?.timestampUtc ?? null,
    breakDurationMs,
    breakHours,
    grossHours,
    netHours,
    hourlyRate,
    earningsCents,
    status,
  }
}

// =====================================================
// Compensation lookup (effective-dated)
// =====================================================

/**
 * Returns the hourly rate applicable to a given UTC instant for a user.
 * Picks the CompensationRecord with effectiveDate <= instant, the most recent one.
 * Falls back to the DEFAULT_HOURLY_RATE setting if no record exists.
 */
export async function getHourlyRateAt(userId: string, at: Date = new Date()): Promise<number> {
  const rec = await db.compensationRecord.findFirst({
    where: { userId, effectiveDate: { lte: at } },
    orderBy: { effectiveDate: 'desc' },
  })
  if (rec) return rec.hourlyRate
  const setting = await db.setting.findUnique({ where: { key: 'default_hourly_rate' } })
  return setting ? parseFloat(setting.value) : 5.0
}

/**
 * Returns the user's current hourly rate (latest effective record, or default).
 */
export async function getCurrentHourlyRate(userId: string): Promise<number> {
  return getHourlyRateAt(userId, new Date())
}
