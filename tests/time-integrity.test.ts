/**
 * Time-tracking integrity tests.
 *
 * These tests verify that the time-tracking pipeline NEVER depends on
 * client-supplied timestamps. The server's clock is the only source of
 * truth for when an attendance event occurred.
 *
 * Run with: bun test tests/time-integrity.test.ts
 */

import { test, expect, describe } from 'bun:test'
import {
  computeDaySummary,
  validateTransition,
  type EventType,
} from '../src/lib/attendance/engine'

// =====================================================
// recordEvent signature check — no `at` parameter
// =====================================================

describe('recordEvent time-source integrity', () => {
  test('recordEvent does NOT accept an `at` parameter (server clock only)', () => {
    // Read the source of recordEvent and verify it doesn't destructure `at`.
    // This is a static check — it prevents a future developer from
    // accidentally re-adding the `at` override.
    const fs = require('fs')
    const path = require('path')
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/attendance/engine.ts'),
      'utf8'
    )

    // The recordEvent function signature must NOT include `at?: Date`.
    // We use a non-flag regex (remove the `s` flag) and match across
    // newlines manually via [\s\S].
    const recordEventSignature = engineSource.match(
      /export async function recordEvent\([\s\S]*?\)/
    )
    expect(recordEventSignature).not.toBeNull()
    expect(recordEventSignature![0]).not.toContain('at?:')
    expect(recordEventSignature![0]).not.toContain('at:')

    // The function body must use `new Date()` for the timestamp.
    expect(engineSource).toContain('const now = new Date()')
    expect(engineSource).toContain('Server timestamp — NEVER trust a client-supplied timestamp')
  })
})

// =====================================================
// computeDaySummary uses server `now`, not client time
// =====================================================

describe('computeDaySummary time source', () => {
  const DATE = '2026-01-15'

  test('in-progress day uses the server-provided `now`, not Date.now()', () => {
    // Simulate a clock-in at 08:00 ET (13:00 UTC).
    const clockIn = new Date('2026-01-15T13:00:00Z')
    const events = [
      { eventType: 'CLOCK_IN', timestampUtc: clockIn, businessDate: DATE },
    ]

    // The server passes `now` explicitly — it's the server's clock, not
    // the client's. We pass 11:00 ET (16:00 UTC) as the server time.
    const serverNow = new Date('2026-01-15T16:00:00Z')
    const summary = computeDaySummary(events, DATE, 5.0, serverNow)

    // 3 hours elapsed (08:00 → 11:00 ET)
    expect(summary.status).toBe('IN_PROGRESS')
    expect(summary.grossHours).toBeCloseTo(3.0, 4)
    expect(summary.netHours).toBeCloseTo(3.0, 4)
  })

  test('completed day does NOT depend on `now` — uses clockOut timestamp', () => {
    const clockIn = new Date('2026-01-15T13:00:00Z')   // 08:00 ET
    const clockOut = new Date('2026-01-15T21:00:00Z')  // 16:00 ET
    const events = [
      { eventType: 'CLOCK_IN', timestampUtc: clockIn, businessDate: DATE },
      { eventType: 'CLOCK_OUT', timestampUtc: clockOut, businessDate: DATE },
    ]

    // Pass a `now` that's wildly different — the summary should NOT use it.
    const farFuture = new Date('2027-01-01T00:00:00Z')
    const summary = computeDaySummary(events, DATE, 5.0, farFuture)

    // Still 8 hours, not 1 year.
    expect(summary.status).toBe('COMPLETE')
    expect(summary.grossHours).toBeCloseTo(8.0, 4)
    expect(summary.netHours).toBeCloseTo(8.0, 4)
    expect(summary.earningsCents).toBe(8 * 5 * 100) // $40.00
  })
})

// =====================================================
// State machine is time-independent
// =====================================================

describe('state machine is time-independent', () => {
  test('valid transitions don\'t depend on timestamps', () => {
    // The state machine only looks at the event TYPE, not the time.
    // This means a clock-in from yesterday and a clock-in from today
    // are treated the same way by validateTransition.
    expect(validateTransition('OFFLINE', 'CLOCK_IN')).toBeNull()
    expect(validateTransition('WORKING', 'CLOCK_OUT')).toBeNull()
    expect(validateTransition('WORKING', 'BREAK_START')).toBeNull()
    expect(validateTransition('ON_BREAK', 'BREAK_END')).toBeNull()
  })
})
