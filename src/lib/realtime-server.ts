/**
 * Realtime server-side bridge.
 *
 * The admin dashboard needs live updates when agents clock in/out/break.
 * The architecture:
 *   - Next.js API routes (serverless) write attendance events.
 *   - They POST a notification to a small socket.io mini-service (port 3003).
 *   - The mini-service broadcasts to admin clients via socket.io.
 *
 * On Vercel, the mini-service would run as a separate long-lived process
 * (e.g., on Railway / Render / Fly.io) since Vercel itself is serverless.
 * In this dev environment it runs locally as a bun mini-service.
 *
 * The notification is best-effort: the database remains the source of truth.
 * Admin clients reconcile by polling /api/admin/dashboard every N seconds
 * as a fallback, and on every socket message they receive.
 */

export interface RealtimeNotification {
  type: 'attendance_event' | 'employee_updated' | 'correction_request'
  userId?: string
  userName?: string
  eventType?: string
  timestampUtc?: string
  payload?: unknown
}

const REALTIME_URL = process.env.REALTIME_SERVICE_URL || 'http://localhost:3003'

/**
 * Best-effort push to the realtime mini-service. Failures are swallowed
 * because they are not blocking for the user action.
 */
export async function notifyRealtime(note: RealtimeNotification): Promise<void> {
  try {
    await fetch(`${REALTIME_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
      // Don't hang the user-facing request if the mini-service is slow.
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // ignore
  }
}
