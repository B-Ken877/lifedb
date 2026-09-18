/**
 * Reproduce the login flow against Supabase outside of Next.js.
 * Run with: bun run scripts/test-login.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient({ log: ['info', 'query', 'warn', 'error'] })

async function main() {
  const identifier = 'bkencompanyy@gmail.com'
  const password = 'wordpa$$123'

  console.log(`Looking up user: ${identifier}`)
  const user = await db.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }],
    },
    include: { role: true },
  })

  if (!user) {
    console.log('User not found')
    return
  }
  console.log(`Found: ${user.email} | role=${user.role.name} | active=${user.active} | isProtected=${user.isProtected}`)

  console.log('Comparing password...')
  const ok = await bcrypt.compare(password, user.passwordHash)
  console.log(`Password match: ${ok}`)

  if (!user.active) {
    console.log('User is inactive')
    return
  }
  if (!ok) {
    console.log('Password does not match')
    return
  }

  console.log('Login would succeed. User object:')
  console.log({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    username: user.username,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
  })
}

main()
  .catch((e) => {
    console.error('ERROR:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
