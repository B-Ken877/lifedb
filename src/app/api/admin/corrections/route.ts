/**
 * GET /api/admin/corrections
 *
 * Returns all correction requests across all agents (admin view).
 * Optional ?status=PENDING|APPROVED|REJECTED to filter.
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || undefined
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200)

  const requests = await db.correctionRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, name: true, employeeId: true, username: true } },
    },
  })

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      targetDate: r.targetDate,
      requestedChange: r.requestedChange,
      requestedTime: r.requestedTime,
      reason: r.reason,
      note: r.note,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      user: r.user,
    })),
  })
}
