/**
 * Verify Supabase schema: list all tables in the public schema.
 * Run with: bun run scripts/verify-db.ts
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const tables = await db.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `
  console.log('Tables in Supabase public schema:')
  for (const t of tables as any[]) {
    console.log(' -', t.tablename)
  }

  const roleCount = await db.role.count()
  const userCount = await db.user.count()
  const settingCount = await db.setting.count()

  console.log('\nRow counts:')
  console.log(`  Roles:    ${roleCount}`)
  console.log(`  Users:    ${userCount}`)
  console.log(`  Settings: ${settingCount}`)

  if (userCount > 0) {
    const users = await db.user.findMany({ include: { role: true } })
    console.log('\nUsers:')
    for (const u of users) {
      console.log(
        `  - ${u.email} | name="${u.name}" | username="${u.username}" | role=${u.role.name} | isProtected=${u.isProtected} | active=${u.active}`
      )
    }
  }
}

main()
  .catch((e) => {
    console.error('ERROR:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
