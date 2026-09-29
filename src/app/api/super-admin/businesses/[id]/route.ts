/**
 * /api/super-admin/businesses/[id]
 *
 * GET    - fetch a single business with its owner admin + agent count.
 * PATCH  - update business name (regenerate slug if name changes).
 * DELETE - deactivate the business (set active=false; does NOT delete —
 *          preserves the audit trail). Refuses if the business still has
 *          active agents (they must be deactivated first).
 *
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base || 'business'
  const existing = await db.business.findFirst({ where: { slug, id: { not: excludeId } } })
  if (!existing) return slug
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = ''
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
    slug = `${base}-${suffix}`.slice(0, 60)
    const clash = await db.business.findFirst({ where: { slug, id: { not: excludeId } } })
    if (!clash) return slug
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 60)
}

const PatchBody = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters.').max(120).optional(),
})

async function fetchBusinessWithExtras(id: string) {
  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })
  const business = await db.business.findUnique({
    where: { id },
    include: {
      ownerAdmin: {
        select: { id: true, name: true, email: true, username: true, active: true },
      },
    },
  })
  if (!business) return null
  const agentCount = agentRole
    ? await db.user.count({ where: { roleId: agentRole.id, businessId: business.id } })
    : 0
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    active: business.active,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
    ownerAdmin: business.ownerAdmin
      ? {
          id: business.ownerAdmin.id,
          name: business.ownerAdmin.name,
          email: business.ownerAdmin.email,
          username: business.ownerAdmin.username,
          active: business.ownerAdmin.active,
        }
      : null,
    agentCount,
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const business = await fetchBusinessWithExtras(id)
  if (!business) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json({ business })
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

  const existing = await db.business.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const data: { name?: string; slug?: string } = {}
  if (parsed.name && parsed.name !== existing.name) {
    data.name = parsed.name
    data.slug = await uniqueSlug(slugify(parsed.name), id)
  }
  // If no field changed, skip the write but still return the up-to-date record.
  if (Object.keys(data).length > 0) {
    await db.business.update({ where: { id }, data })
  }

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'BUSINESS_UPDATED',
    metadata: {
      before: { name: existing.name, slug: existing.slug },
      after: { name: data.name ?? existing.name, slug: data.slug ?? existing.slug },
    },
  })

  const business = await fetchBusinessWithExtras(id)
  return NextResponse.json({ ok: true, business })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const existing = await db.business.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  if (!existing.active) {
    return NextResponse.json({ error: 'Business is already deactivated.' }, { status: 409 })
  }

  // Refuse if the business still has any ACTIVE agents. They must be
  // deactivated (or reassigned) first — silently turning off active
  // agents could mask a missing offboarding step in the audit trail.
  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })
  if (agentRole) {
    const activeAgents = await db.user.count({
      where: { roleId: agentRole.id, businessId: id, active: true },
    })
    if (activeAgents > 0) {
      return NextResponse.json(
        {
          error: `Cannot deactivate: ${activeAgents} active agent(s) still belong to this business. Deactivate or reassign them first.`,
        },
        { status: 409 }
      )
    }
  }

  await db.business.update({ where: { id }, data: { active: false } })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'BUSINESS_DEACTIVATED',
    metadata: { name: existing.name, slug: existing.slug },
  })

  const business = await fetchBusinessWithExtras(id)
  return NextResponse.json({ ok: true, business })
}
