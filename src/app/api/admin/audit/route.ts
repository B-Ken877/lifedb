/**
 * GET /api/admin/audit?limit=N&offset=K&action=...&actorId=...
 *
 * Returns audit log entries, paginated, newest first.
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { parseLimit, parseOffset } from '@/lib/http'

export async function GET(req: Request) {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  const limit = parseLimit(url.searchParams.get('limit'), { default: 100, max: 500 })
  const offset = parseOffset(url.searchParams.get('offset'), { max: 10_000 })
  const action = url.searchParams.get('action') || undefined
  const actorId = url.searchParams.get('actorId') || undefined
  const targetId = url.searchParams.get('targetId') || undefined

  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = action
  if (actorId) where.actorId = actorId
  if (targetId) where.targetId = targetId

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        actor: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      actorId: e.actorId,
      actorName: e.actor?.name ?? null,
      targetId: e.targetId,
      targetName: e.target?.name ?? null,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
    limit,
    offset,
  })
}
