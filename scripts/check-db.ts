import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { id: true, email: true, username: true, role: { select: { name: true } }, project: true } })
  console.log('Users in DB:')
  for (const u of users) {
    console.log(`  ${u.email} | ${u.username} | ${u.role.name} | project: ${u.project ?? '(null)'}`)
  }
}
main().catch(e => console.error('ERROR:', e.message)).finally(() => db.$disconnect())
