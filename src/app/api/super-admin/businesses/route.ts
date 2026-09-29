/**
 * /api/super-admin/businesses
 *
 * GET  - list all businesses with their owner admin (name, email) and agent count.
 * POST - create a new business. Body: { name: string }. Auto-generates slug.
 *
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

/**
 * Generate a URL-friendly slug from a business name.
 * Lowercase, hyphenated, alphanumeric-only. Suffixes a short random
 * string if the slug already exists, to keep the @unique constraint happy
 * without surprising the caller.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'business'
  const exists = await db.business.findUnique({ where: { slug } })
  if (!exists) return slug
  // Append a short random suffix until unique (bounded attempts).
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = ''
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
    slug = `${base}-${suffix}`.slice(0, 60)
    const clash = await db.business.findUnique({ where: { slug } })
    if (!clash) return slug
  }
  // Fallback: append a timestamp-based suffix.
  return `${base}-${Date.now().toString(36)}`.slice(0, 60)
}

const CreateBody = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters.').max(120),
})

export async function GET() {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin

  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })

  const businesses = await db.business.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      ownerAdmin: {
        select: { id: true, name: true, email: true, username: true, active: true },
      },
    },
  })

  // Batch agent counts per business in a single grouped query.
  const agentCounts = agentRole
    ? await db.user.groupBy({
        by: ['businessId'],
        where: { roleId: agentRole.id, businessId: { not: null } },
        _count: { _all: true },
      })
    : []
  const countByBusiness = new Map<string, number>()
  for (const row of agentCounts) {
    if (row.businessId) countByBusiness.set(row.businessId, row._count._all)
  }

  return NextResponse.json({
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      active: b.active,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      ownerAdmin: b.ownerAdmin
        ? {
            id: b.ownerAdmin.id,
            name: b.ownerAdmin.name,
            email: b.ownerAdmin.email,
            username: b.ownerAdmin.username,
            active: b.ownerAdmin.active,
          }
        : null,
      agentCount: countByBusiness.get(b.id) ?? 0,
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

  const slug = await uniqueSlug(slugify(parsed.name))

  const created = await db.business.create({
    data: {
      name: parsed.name,
      slug,
      active: true,
    },
    include: {
      ownerAdmin: {
        select: { id: true, name: true, email: true, username: true, active: true },
      },
    },
  })

  await writeAudit({
    actorId: admin.id,
    targetId: created.id,
    action: 'BUSINESS_CREATED',
    metadata: { name: created.name, slug: created.slug },
  })

  return NextResponse.json({
    ok: true,
    business: {
      id: created.id,
      name: created.name,
      slug: created.slug,
      active: created.active,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      ownerAdmin: created.ownerAdmin
        ? {
            id: created.ownerAdmin.id,
            name: created.ownerAdmin.name,
            email: created.ownerAdmin.email,
            username: created.ownerAdmin.username,
            active: created.ownerAdmin.active,
          }
        : null,
      agentCount: 0,
    },
  })
}
