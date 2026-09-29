/**
 * Super-admin dashboard page.
 *
 * Server-rendered initial data + client-side refetch. Shows platform-wide
 * stats (total businesses / admins / agents / events today) plus a table
 * of every business with its agent count and active flag.
 */

import { requireSuperAdmin } from '@/lib/session'
import { db } from '@/lib/db'
import { businessDateKey } from '@/lib/timezone'
import { SuperAdminDashboardClient } from '@/components/super-admin/dashboard-client'

export default async function SuperAdminDashboardPage() {
  const admin = await requireSuperAdmin()
  void admin // admin presence already enforced by layout; keep for clarity

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

  const initial = {
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
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Cross-tenant overview of businesses, admins, agents, and activity.
        </p>
      </div>
      <SuperAdminDashboardClient initial={initial} />
    </div>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
