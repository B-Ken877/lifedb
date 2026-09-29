/**
 * /api/super-admin/admins/[id]
 *
 * GET   - fetch an admin user.
 * PATCH - update name / email / username. Never updates password here
 *         (use the reset-password endpoint).
 *
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

const PatchBody = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(40).optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })

  const u = await db.user.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true, slug: true, active: true } },
    },
  })
  if (!u) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Only ADMIN users are manageable through this endpoint.
  if (!adminRole || u.roleId !== adminRole.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  return NextResponse.json({
    admin: {
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
    },
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  let parsed: z.infer<typeof PatchBody>
  try {
    parsed = PatchBody.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.issues?.[0]?.message || 'Invalid request.' },
      { status: 400 }
    )
  }

  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })

  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  // Only ADMIN users are editable through this endpoint.
  if (!adminRole || existing.roleId !== adminRole.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // Uniqueness check (only for fields being changed).
  if (parsed.email || parsed.username) {
    const clash = await db.user.findFirst({
      where: {
        id: { not: id },
        OR: [
          parsed.email ? { email: parsed.email.toLowerCase() } : {},
          parsed.username ? { username: parsed.username.toLowerCase() } : {},
        ].filter((x) => Object.keys(x).length > 0) as any,
      },
    })
    if (clash) {
      const what =
        clash.email === parsed.email?.toLowerCase()
          ? 'email'
          : 'username'
      return NextResponse.json({ error: `${what} already in use.` }, { status: 409 })
    }
  }

  const data: { name?: string; email?: string; username?: string } = {}
  if (parsed.name) data.name = parsed.name
  if (parsed.email) data.email = parsed.email.toLowerCase()
  if (parsed.username) data.username = parsed.username.toLowerCase()

  const updated = await db.user.update({ where: { id }, data })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'ADMIN_UPDATED',
    metadata: {
      before: { name: existing.name, email: existing.email, username: existing.username },
      after: data,
    },
  })

  return NextResponse.json({ ok: true, admin: { id: updated.id, name: updated.name } })
}
