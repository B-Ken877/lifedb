/**
 * Multi-session tests — agent can clock in/out multiple times per day.
 *
 * Bug fixed: computeDaySummary used `find()` which returns only the FIRST
 * CLOCK_IN and FIRST CLOCK_OUT. A second CLOCK_IN/CLOCK_OUT pair in the
 * same day was silently ignored, so the agent's second shift wasn't tracked.
 *
 * Run with: bun test tests/multi-session.test.ts
 */

import { test, expect, describe } from 'bun:test'
import { computeDaySummary } from '../src/lib/attendance/engine'

const DATE = '2026-01-15'
// All times in UTC. 13:00 UTC = 08:00 ET.

describe('multi-session day (clock in, out, in, out)', () => {
  test('two complete sessions sum both shifts', () => {
    // Morning: 08:00 → 12:00 (4h)
    // Afternoon: 13:00 → 17:00 (4h)
    // Total: 8h
    const events = [
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T13:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T17:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T18:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T22:00:00Z'), businessDate: DATE },
    ]
    const s = computeDaySummary(events, DATE, 5.0)
    expect(s.status).toBe('COMPLETE')
    expect(s.grossHours).toBeCloseTo(8.0, 4)
    expect(s.netHours).toBeCloseTo(8.0, 4)
    expect(s.breakHours).toBe(0)
    expect(s.earningsCents).toBe(8 * 5 * 100) // $40.00
  })

  test('morning complete + afternoon in progress', () => {
    // Morning: 08:00 → 12:00 (4h, complete)
    // Afternoon: 13:00 → now (14:00) = 1h in progress
    // Total: 5h
    const now = new Date('2026-01-15T19:00:00Z') // 14:00 ET
    const events = [
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T13:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T17:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T18:00:00Z'), businessDate: DATE },
      // No clock-out for the afternoon session — in progress
    ]
    const s = computeDaySummary(events, DATE, 5.0, now)
    expect(s.status).toBe('IN_PROGRESS')
    expect(s.grossHours).toBeCloseTo(5.0, 4) // 4h + 1h
    expect(s.netHours).toBeCloseTo(5.0, 4)
    expect(s.earningsCents).toBe(5 * 5 * 100) // $25.00
    // clockInUtc = first session start, clockOutUtc = null (in progress)
    expect(s.clockInUtc?.toISOString()).toBe('2026-01-15T13:00:00.000Z')
    expect(s.clockOutUtc).toBeNull()
  })

  test('three sessions with a break in one of them', () => {
    // Session 1: 08:00 → 10:00 (2h)
    // Session 2: 10:30 → 14:00 (3.5h), with a 15min break at 12:00→12:15
    // Session 3: 15:00 → 17:00 (2h)
    // Gross: 7.5h, Break: 0.25h, Net: 7.25h
    const events = [
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T13:00:00Z'), businessDate: DATE }, // 08:00
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T15:00:00Z'), businessDate: DATE }, // 10:00
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T15:30:00Z'), businessDate: DATE }, // 10:30
      { eventType: 'BREAK_START', timestampUtc: new Date('2026-01-15T17:00:00Z'), businessDate: DATE }, // 12:00
      { eventType: 'BREAK_END', timestampUtc: new Date('2026-01-15T17:15:00Z'), businessDate: DATE }, // 12:15
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T19:00:00Z'), businessDate: DATE }, // 14:00
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T20:00:00Z'), businessDate: DATE }, // 15:00
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T22:00:00Z'), businessDate: DATE }, // 17:00
    ]
    const s = computeDaySummary(events, DATE, 5.0)
    expect(s.status).toBe('COMPLETE')
    expect(s.grossHours).toBeCloseTo(7.5, 4) // 2 + 3.5 + 2
    expect(s.breakHours).toBeCloseTo(0.25, 4) // 15 min
    expect(s.netHours).toBeCloseTo(7.25, 4)
    expect(s.earningsCents).toBe(7.25 * 5 * 100) // $36.25
  })

  test('single session still works (no regression)', () => {
    const events = [
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T13:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T21:00:00Z'), businessDate: DATE },
    ]
    const s = computeDaySummary(events, DATE, 5.0)
    expect(s.status).toBe('COMPLETE')
    expect(s.grossHours).toBeCloseTo(8.0, 4)
    expect(s.earningsCents).toBe(8 * 5 * 100)
  })

  test('no events still returns NO_EVENTS', () => {
    const s = computeDaySummary([], DATE, 5.0)
    expect(s.status).toBe('NO_EVENTS')
    expect(s.netHours).toBe(0)
  })

  test('orphaned CLOCK_OUT (no matching CLOCK_IN) is ignored', () => {
    // Edge case: a CLOCK_OUT with no CLOCK_IN before it. Should not
    // create a negative session or crash.
    const events = [
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T10:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_IN', timestampUtc: new Date('2026-01-15T13:00:00Z'), businessDate: DATE },
      { eventType: 'CLOCK_OUT', timestampUtc: new Date('2026-01-15T21:00:00Z'), businessDate: DATE },
    ]
    const s = computeDaySummary(events, DATE, 5.0)
    expect(s.status).toBe('COMPLETE')
    expect(s.grossHours).toBeCloseTo(8.0, 4) // only the 08:00→16:00 session
  })
})
