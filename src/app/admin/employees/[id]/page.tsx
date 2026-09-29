/**
 * Admin Employee Detail page.
 *
 * Server-side fetch of employee data, then render the management UI.
 * The client component handles all the actions (edit, reset password,
 * set rate, activate/deactivate, force password change).
 */

import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/session'
import { db } from '@/lib/db'
import { EmployeeDetailClient } from '@/components/admin/employee-detail-client'

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await requireAdmin()
  const { id } = await params

  const u = await db.user.findUnique({
    where: { id },
    include: { role: true },
  })
  if (!u || u.role.name !== 'SURVEY_AGENT') notFound()
  // Cross-business isolation: admin can only see their own business's agents.
  if (u.businessId !== admin.businessId) notFound()

  const initial = {
    id: u.id,
    name: u.name,
    employeeId: u.employeeId ?? "",
    username: u.username,
    email: u.email,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    isProtected: u.isProtected,
    createdAt: u.createdAt.toISOString(),
  }

  return <EmployeeDetailClient employeeId={id} initial={initial} />
}

export const dynamic = 'force-dynamic'
