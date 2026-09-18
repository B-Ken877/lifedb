/**
 * GET  /api/admin/settings — returns current settings.
 * POST /api/admin/settings — updates settings.
 *
 * Currently manages: default_hourly_rate.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

export async function GET() {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const setting = await db.setting.findUnique({ where: { key: 'default_hourly_rate' } })
  return NextResponse.json({ defaultHourlyRate: setting?.value ?? '5.00' })
}

const Body = z.object({
  defaultHourlyRate: z.number().min(0),
})

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

  const old = await db.setting.findUnique({ where: { key: 'default_hourly_rate' } })
  await db.setting.upsert({
    where: { key: 'default_hourly_rate' },
    update: { value: String(parsed.defaultHourlyRate) },
    create: { key: 'default_hourly_rate', value: String(parsed.defaultHourlyRate) },
  })

  await writeAudit({
    actorId: admin.id,
    action: 'SETTINGS_CHANGED',
    metadata: {
      setting: 'default_hourly_rate',
      oldValue: old?.value ?? null,
      newValue: String(parsed.defaultHourlyRate),
    },
  })

  return NextResponse.json({ ok: true })
}
