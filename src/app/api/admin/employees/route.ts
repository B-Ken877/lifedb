/**
 * /api/admin/employees
 *
 * GET  - list all employees (admins excluded), with current state + rate.
 * POST - create a new agent account (admin only).
 *
 * Account creation:
 *  - Generates a temporary password (returned ONCE in the response).
 *  - Sets mustChangePassword = true.
 *  - Creates a CompensationRecord with the provided hourly rate (effective now).
 *  - Never stores plaintext passwords.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword, generateTemporaryPassword, validatePasswordStrength } from '@/lib/password'
import { writeAudit } from '@/lib/audit'
import { notifyRealtime } from '@/lib/realtime-server'
import { getCurrentHourlyRate } from '@/lib/attendance/engine'

const Body = z.object({
  name: z.string().min(2, 'Full name is required.'),
  employeeId: z.string().min(2, 'Employee ID is required.'),
  username: z.string().min(3, 'Username is required.').max(40),
  email: z.string().email('Valid email is required.'),
  hourlyRate: z.number().min(0, 'Hourly rate must be positive.'),
  active: z.boolean().default(true),
})

export async function GET() {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })
  if (!agentRole) return NextResponse.json({ employees: [] })

  const users = await db.user.findMany({
    where: { roleId: agentRole.id },
    orderBy: { name: 'asc' },
  })

  // Get current rate for each user.
  const employees = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      name: u.name,
      employeeId: u.employeeId,
      username: u.username,
      email: u.email,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      isProtected: u.isProtected,
      hourlyRate: await getCurrentHourlyRate(u.id),
      createdAt: u.createdAt.toISOString(),
    }))
  )

  return NextResponse.json({ employees })
}

export async function POST(req: Request) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.issues?.[0]?.message || 'Invalid request.' },
      { status: 400 }
    )
  }

  // Uniqueness checks.
  const dup = await db.user.findFirst({
    where: {
      OR: [
        { email: parsed.email.toLowerCase() },
        { username: parsed.username.toLowerCase() },
        { employeeId: parsed.employeeId },
      ],
    },
  })
  if (dup) {
    const what =
      dup.email === parsed.email.toLowerCase()
        ? 'email'
        : dup.username === parsed.username.toLowerCase()
          ? 'username'
          : 'employee ID'
    return NextResponse.json({ error: `An account with this ${what} already exists.` }, { status: 409 })
  }

  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })
  if (!agentRole) {
    return NextResponse.json({ error: 'Role not configured.' }, { status: 500 })
  }

  const tempPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(tempPassword)

  const created = await db.user.create({
    data: {
      name: parsed.name,
      employeeId: parsed.employeeId,
      username: parsed.username.toLowerCase(),
      email: parsed.email.toLowerCase(),
      passwordHash,
      mustChangePassword: true,
      active: parsed.active,
      // Admin-created accounts are never protected. Only the seed can create
      // protected accounts (the project owner's personal account).
      isProtected: false,
      roleId: agentRole.id,
    },
  })

  await db.compensationRecord.create({
    data: {
      userId: created.id,
      hourlyRate: parsed.hourlyRate,
      effectiveDate: new Date(),
      note: 'Initial rate on account creation',
      createdBy: admin.id,
    },
  })

  await writeAudit({
    actorId: admin.id,
    targetId: created.id,
    action: 'EMPLOYEE_CREATED',
    metadata: {
      name: created.name,
      employeeId: created.employeeId,
      username: created.username,
      hourlyRate: parsed.hourlyRate,
    },
  })

  try {
    await notifyRealtime({ type: 'employee_updated', userName: created.name })
  } catch {
    // ignore
  }

  // Return the temporary password ONCE. Never expose it again.
  return NextResponse.json({
    ok: true,
    employee: {
      id: created.id,
      name: created.name,
      employeeId: created.employeeId,
      username: created.username,
      email: created.email,
    },
    temporaryPassword: tempPassword,
  })
}
