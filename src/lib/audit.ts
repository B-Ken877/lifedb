/**
 * Audit log writer.
 *
 * Every meaningful mutation is recorded with: actor, target, action, and
 * a JSON metadata blob (old/new values, reason, etc.).
 *
 * Records are append-only. Never overwrite or delete audit entries.
 */

import { db } from '@/lib/db'

export type AuditAction =
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_UPDATED'
  | 'EMPLOYEE_DEACTIVATED'
  | 'EMPLOYEE_REACTIVATED'
  | 'PASSWORD_RESET'
  | 'FORCE_PASSWORD_CHANGE'
  | 'PASSWORD_CHANGED'
  | 'RATE_CHANGED'
  | 'ATTENDANCE_CORRECTION_SUBMITTED'
  | 'ATTENDANCE_CORRECTION_APPROVED'
  | 'ATTENDANCE_CORRECTION_REJECTED'
  | 'ATTENDANCE_RECORD_CORRECTED'
  | 'SETTINGS_CHANGED'
  | 'CLOCK_IN'
  | 'CLOCK_OUT'
  | 'BREAK_START'
  | 'BREAK_END'

export interface AuditEntry {
  actorId?: string
  targetId?: string
  action: AuditAction
  metadata?: Record<string, unknown>
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        targetId: entry.targetId ?? null,
        action: entry.action,
        metadata: JSON.stringify(entry.metadata ?? {}),
      },
    })
  } catch (err) {
    // Audit failures should not crash the primary operation, but should be logged.
    console.error('[audit] Failed to write audit log:', err)
  }
}
