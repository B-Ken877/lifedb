/**
 * Diagnostic: verify the credential data is actually in the database.
 *
 * Run with:
 *   DATABASE_URL="postgres://..." bun run scripts/diagnose-credentials.ts
 *
 * Or, to test a specific credential pair:
 *   DATABASE_URL="postgres://..." \
 *   LIFEDB_TEST_EMAIL="bkencompanyy@gmail.com" \
 *   LIFEDB_TEST_PASSWORD="wordpa\$\$123" \
 *   bun run scripts/diagnose-credentials.ts
 *
 * This script DOES NOT modify the database. It only:
 *   1. Connects to the configured DATABASE_URL.
 *   2. Lists all ADMIN users (email + username + active + mustChangePassword).
 *   3. Tests whether the password from LIFEDB_TEST_PASSWORD (or the .env
 *      SEED_ADMIN_PASSWORD) verifies against each stored hash.
 *   4. Reports any user whose hash matches, and any user whose hash does
 *      NOT match (suggesting the seed ran with a corrupted password).
 *
 * Exit codes:
 *   0 — at least one user matched the test password
 *   1 — no users found, OR no user matched the test password
 *   2 — could not connect to the database
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

// ---------- Manual .env loader (same as seed.ts — preserves $$ literally) ----------
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    // ALWAYS override — bun's built-in .env parser expands $VAR references,
    // which corrupts passwords containing $. Our manual parser preserves
    // the literal value from the file.
    process.env[key] = val
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'))

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Set it in .env or in the environment.')
  process.exit(2)
}

// Mask the password portion of the URL for logging.
const maskedUrl = DATABASE_URL.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/, '$1***@')
console.log(`🔌 Connecting to: ${maskedUrl}`)

const db = new PrismaClient({ log: ['warn', 'error'] })

async function main() {
  // 1. Find the ADMIN role.
  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })
  if (!adminRole) {
    console.error('❌ ADMIN role not found in the database.')
    console.error('   The seed has never been run against this database.')
    console.error('   Run: bun run db:migrate:deploy && bun run db:seed')
    process.exit(1)
  }

  // 2. List all admin users.
  const admins = await db.user.findMany({
    where: { roleId: adminRole.id },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      active: true,
      mustChangePassword: true,
      isProtected: true,
      passwordHash: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\n📋 Found ${admins.length} admin user(s) in the database:`)
  console.log('─'.repeat(80))
  for (const a of admins) {
    console.log(`  email:                ${a.email}`)
    console.log(`  username:             ${a.username}`)
    console.log(`  name:                 ${a.name}`)
    console.log(`  active:               ${a.active}`)
    console.log(`  mustChangePassword:   ${a.mustChangePassword}`)
    console.log(`  isProtected:          ${a.isProtected}`)
    console.log(`  createdAt:            ${a.createdAt.toISOString()}`)
    console.log(`  passwordHash prefix:  ${a.passwordHash.slice(0, 25)}...`)
    console.log('─'.repeat(80))
  }

  if (admins.length === 0) {
    console.error('❌ No admin users found. The seed has not been run.')
    process.exit(1)
  }

  // 3. Determine the test password.
  const testEmail = (process.env.LIFEDB_TEST_EMAIL ?? '').trim().toLowerCase()
  const testPassword =
    process.env.LIFEDB_TEST_PASSWORD ??
    process.env.SEED_ADMIN_PASSWORD ??
    ''

  if (!testPassword) {
    console.log('\n⚠️  No test password provided.')
    console.log('   Set LIFEDB_TEST_PASSWORD or SEED_ADMIN_PASSWORD to test')
    console.log('   whether a stored hash matches.')
    console.log('   Skipping password verification.')
    process.exit(0)
  }

  console.log(`\n🔐 Testing password: ${JSON.stringify(testPassword)}`)
  console.log(`   (length: ${testPassword.length} chars)`)
  if (testEmail) {
    console.log(`   Against user:    ${testEmail}`)
  } else {
    console.log(`   Against user:    (all admins)`)
  }
  console.log('─'.repeat(80))

  // 4. Verify the password against each admin (or just the matching one).
  const candidates = testEmail
    ? admins.filter((a) => a.email.toLowerCase() === testEmail || a.username.toLowerCase() === testEmail)
    : admins

  if (candidates.length === 0) {
    console.log(`❌ No admin user matches "${testEmail}".`)
    console.log('   Check the email/username list above.')
    process.exit(1)
  }

  let anyMatched = false
  for (const c of candidates) {
    const ok = await bcrypt.compare(testPassword, c.passwordHash)
    console.log(`  ${ok ? '✅ MATCH' : '❌ NO MATCH'} — ${c.email}`)
    if (ok) anyMatched = true

    if (!ok) {
      // Helpful diagnostic: was the password likely corrupted by $$ expansion?
      // The PID expansion would replace $$ with a number. Try a few common
      // corruption patterns to see if any match.
      const pidPatterns = [
        testPassword.replace(/\$\$/g, String(process.pid)),
        testPassword.replace(/\$\$/g, ''),
        testPassword.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, ''),
      ]
      for (const variant of pidPatterns) {
        if (variant === testPassword) continue
        const altOk = await bcrypt.compare(variant, c.passwordHash)
        if (altOk) {
          console.log(`     ⚠️  But the hash matches a CORRUPTED variant:`)
          console.log(`        ${JSON.stringify(variant)}`)
          console.log(`     This means the seed ran with bun's built-in .env`)
          console.log(`     parser (which expands $$) instead of the manual`)
          console.log(`     parser in seed.ts. Re-seed with:`)
          console.log(`        bun run db:seed`)
          console.log(`     after confirming prisma/seed.ts uses loadEnvFile().`)
        }
      }
    }
  }

  console.log('─'.repeat(80))
  if (anyMatched) {
    console.log('\n✅ At least one admin matched. Login should work.')
    console.log('   If login still fails in the browser, check:')
    console.log('   - AUTH_SECRET is set (NextAuth needs it to sign the JWT)')
    console.log('   - The user is active=true (inactive users cannot log in)')
    console.log('   - The runtime DATABASE_URL points to THIS database')
    console.log('   - The runtime is using the same Prisma client version')
    process.exit(0)
  } else {
    console.log('\n❌ No admin matched the test password.')
    console.log('   The hash in the database does not match the password')
    console.log('   you are trying to use. Re-seed the database:')
    console.log('      bun run db:seed')
    console.log('   Or, for an existing admin, use the reset-password flow:')
    console.log('      POST /api/admin/employees/[id]/reset-password')
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error('❌ Database connection or query failed:')
    console.error(`   ${e.message}`)
    console.error('')
    console.error('   Possible causes:')
    console.error('   - DATABASE_URL points to a DB that does not exist')
    console.error('   - The 0001_init migration has not been applied')
    console.error('   - Network/firewall blocking the Postgres port')
    console.error('   - SSL/TLS misconfiguration (try ?sslmode=require)')
    process.exit(2)
  })
  .finally(async () => {
    await db.$disconnect()
  })
