/**
 * /api/super-admin/admins
 *
 * GET  - list all ADMIN users with their business name.
 * POST - create a new ADMIN user for a business.
 *
 * On create:
 *  - Generates a temporary password (returned ONCE in the response).
 *  - Sets mustChangePassword = true.
 *  - Creates the admin with roleId = ADMIN role's id, businessId = provided.
 *  - Sets isProtected = false (only the seed can create protected accounts).
 *  - Links the new admin as the business's ownerAdminId IF the business
 *    has no owner yet (so the dashboard's "owner" column is populated).
 *
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword, generateTemporaryPassword, validatePasswordStrength } from '@/lib/password'
import { writeAudit } from '@/lib/audit'

const CreateBody = z.object({
  name: z.string().min(2, 'Full name is required.'),
  email: z.string().email('Valid email is required.'),
  username: z.string().min(3, 'Username is required.').max(40),
  businessId: z.string().min(1, 'Business is required.'),
  password: z.string().optional().superRefine((pw, ctx) => {
    if (!pw) return // optional — auto-generated when absent
    const err = validatePasswordStrength(pw)
    if (err) ctx.addIssue({ code: 'custom', message: err, path: [] })
  }),
})

export async function GET() {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin

  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })
  if (!adminRole) return NextResponse.json({ admins: [] })

  const users = await db.user.findMany({
    where: { roleId: adminRole.id },
    orderBy: { createdAt: 'desc' },
    include: {
      business: { select: { id: true, name: true, slug: true, active: true } },
    },
  })

  return NextResponse.json({
    admins: users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      isProtected: u.isProtected,
      createdAt: u.createdAt.toISOString(),
      business: u.business
        ? { id: u.business.id, name: u.business.name, slug: u.business.slug, active: u.business.active }
        : null,
    })),
  })
}

export async function POST(req: Request) {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin

  let parsed: z.infer<typeof CreateBody>
  try {
    parsed = CreateBody.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.issues?.[0]?.message || 'Invalid request.' },
      { status: 400 }
    )
  }

  // Verify the business exists and is active.
  const business = await db.business.findUnique({ where: { id: parsed.businessId } })
  if (!business) {
    return NextResponse.json({ error: 'Business not found.' }, { status: 404 })
  }
  if (!business.active) {
    return NextResponse.json({ error: 'Business is deactivated. Activate it first.' }, { status: 409 })
  }

  // Uniqueness checks (email + username are globally unique in the schema).
  const dup = await db.user.findFirst({
    where: {
      OR: [
        { email: parsed.email.toLowerCase() },
        { username: parsed.username.toLowerCase() },
      ],
    },
  })
  if (dup) {
    const what = dup.email === parsed.email.toLowerCase() ? 'email' : 'username'
    return NextResponse.json({ error: `An account with this ${what} already exists.` }, { status: 409 })
  }

  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })
  if (!adminRole) {
    return NextResponse.json({ error: 'ADMIN role not configured.' }, { status: 500 })
  }

  // Decide password: caller-provided OR auto-generated temp password.
  const tempPassword = parsed.password ?? generateTemporaryPassword()
  const passwordHash = await hashPassword(tempPassword)

  // Create the user and (if needed) link them as the business's ownerAdmin.
  // Use a transaction so the user + ownerAdmin link stay consistent.
  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.name,
        username: parsed.username.toLowerCase(),
        email: parsed.email.toLowerCase(),
        passwordHash,
        mustChangePassword: true,
        active: true,
        isProtected: false,
        roleId: adminRole.id,
        businessId: business.id,
      },
    })

    // Link as business owner if no owner is set yet.
    if (!business.ownerAdminId) {
      await tx.business.update({
        where: { id: business.id },
        data: { ownerAdminId: user.id },
      })
    }

    return user
  })

  await writeAudit({
    actorId: admin.id,
    targetId: created.id,
    action: 'ADMIN_CREATED',
    metadata: {
      name: created.name,
      username: created.username,
      email: created.email,
      businessId: business.id,
      businessName: business.name,
      passwordProvided: Boolean(parsed.password),
    },
  })

  return NextResponse.json({
    ok: true,
    admin: {
      id: created.id,
      name: created.name,
      username: created.username,
      email: created.email,
      businessId: business.id,
      businessName: business.name,
    },
    temporaryPassword: tempPassword,
  })
}
