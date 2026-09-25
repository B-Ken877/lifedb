/**
 * GET  /api/admin/settings — returns current settings.
 * POST /api/admin/settings — updates settings.
 *
 * Currently manages: default_hourly_rate.
 */

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

export async function GET() {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const setting = await db.setting.findUnique({ where: { key: 'default_hourly_rate' } })
  return NextResponse.json({ defaultHourlyRate: setting?.value ?? '5.00' })
}

// Reject Infinity / NaN via .finite() and cap at a sane upper bound.
const Body = z.object({
  defaultHourlyRate: z.number().min(0).max(10_000).finite(),
})

export async function POST(req: Request) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof ZodError ? e.issues[0]?.message : 'Invalid request.' },
      { status: 400 }
    )
  }

  // Store as a fixed 2-decimal string to dodge any future float issues.
  const newValue = parsed.defaultHourlyRate.toFixed(2)

  const old = await db.setting.findUnique({ where: { key: 'default_hourly_rate' } })
  await db.setting.upsert({
    where: { key: 'default_hourly_rate' },
    update: { value: newValue },
    create: { key: 'default_hourly_rate', value: newValue },
  })

  await writeAudit({
    actorId: admin.id,
    action: 'SETTINGS_CHANGED',
    metadata: {
      setting: 'default_hourly_rate',
      oldValue: old?.value ?? null,
      newValue,
    },
  })

  return NextResponse.json({ ok: true })
}
