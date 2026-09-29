/**
 * GET /api/super-admin/dashboard
 *
 * Returns platform-wide stats for the super-admin dashboard:
 *  - total businesses (active + total)
 *  - total admins
 *  - total agents
 *  - total attendance events emitted today (UTC day-of, across all businesses)
 *  - list of all businesses with their agent counts + active flag
 *
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { businessDateKey } from '@/lib/timezone'

export async function GET() {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin

  const todayKey = businessDateKey(new Date())

  // Fetch role ids first — the user counts below depend on them.
  const [adminRole, agentRole] = await Promise.all([
    db.role.findUnique({ where: { name: 'ADMIN' } }),
    db.role.findUnique({ where: { name: 'SURVEY_AGENT' } }),
  ])

  const [totalBusinesses, activeBusinesses, totalAdmins, totalAgents, eventsToday, businesses] =
    await Promise.all([
      db.business.count(),
      db.business.count({ where: { active: true } }),
      adminRole ? db.user.count({ where: { roleId: adminRole.id } }) : Promise.resolve(0),
      agentRole ? db.user.count({ where: { roleId: agentRole.id } }) : Promise.resolve(0),
      db.attendanceEvent.count({ where: { businessDate: todayKey } }),
      db.business.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          ownerAdmin: {
            select: { id: true, name: true, email: true, username: true, active: true },
          },
        },
      }),
    ])

  // Batch agent counts per business in one grouped query.
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
    stats: {
      totalBusinesses,
      activeBusinesses,
      inactiveBusinesses: totalBusinesses - activeBusinesses,
      totalAdmins,
      totalAgents,
      eventsToday,
    },
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
    fetchedAt: new Date().toISOString(),
  })
}
