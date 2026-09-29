/**
 * DIRECT DATABASE VERIFICATION — bypasses Next.js entirely.
 * Connects to Supabase Postgres, lists all users, and verifies
 * the known passwords against the stored bcrypt hashes.
 *
 * If this script shows the users + passwords match, the DATABASE IS FINE.
 * Any login issue is then a Next.js / NextAuth problem, not a data problem.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

// Force-load .env (same as src/lib/db.ts does)
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}
loadEnvFile(path.resolve(process.cwd(), '.env'))

const db = new PrismaClient({ log: ['warn', 'error'] })

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  DIRECT DATABASE VERIFICATION (bypasses Next.js)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    console.log('❌ DATABASE_URL is not set')
    process.exit(1)
  }
  const masked = DATABASE_URL.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/, '$1***@')
  console.log(`🔌 Connecting to: ${masked}\n`)

  // 1. List ALL users with their roles
  const users = await db.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`📋 Found ${users.length} user(s) in the database:\n`)
  console.log('─'.repeat(80))
  for (const u of users) {
    console.log(`  id:                 ${u.id}`)
    console.log(`  email:              ${u.email}`)
    console.log(`  username:           ${u.username}`)
    console.log(`  name:               ${u.name}`)
    console.log(`  role:               ${u.role.name}`)
    console.log(`  active:             ${u.active}`)
    console.log(`  mustChangePassword: ${u.mustChangePassword}`)
    console.log(`  isProtected:        ${u.isProtected}`)
    console.log(`  passwordHash:       ${u.passwordHash.slice(0, 30)}...`)
    console.log('─'.repeat(80))
  }

  if (users.length === 0) {
    console.log('\n❌ NO USERS IN DATABASE. The database is empty.')
    console.log('   Run: bun run db:seed')
    process.exit(1)
  }

  // 2. Test the known passwords
  console.log('\n🔐 Testing known passwords against every user:\n')
  const testPasswords = [
    'wordpa$$123',
    'ChangeMe!2025',
  ]
  let anyMatched = false
  for (const u of users) {
    for (const pw of testPasswords) {
      const ok = await bcrypt.compare(pw, u.passwordHash)
      if (ok) {
        console.log(`  ✅ ${u.email.padEnd(40)} ← password is: ${JSON.stringify(pw)}  (role: ${u.role.name})`)
        anyMatched = true
      }
    }
  }
  if (!anyMatched) {
    console.log('  ❌ No user matched any known password.')
    console.log('   The database needs to be re-seeded.')
    process.exit(1)
  }

  // 3. Summary
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  DATABASE VERIFICATION: ✅ PASS')
  console.log('  The data IS inside the database. Logins will work')
  console.log('  once Next.js is running and can reach this DB.')
  console.log('═══════════════════════════════════════════════════════════════')
}

main()
  .catch((e) => {
    console.error('❌ DATABASE CONNECTION FAILED:', e.message)
    process.exit(2)
  })
  .finally(async () => {
    await db.$disconnect()
  })
