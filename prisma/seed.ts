/**
 * Database seed.
 *
 * Idempotent: safe to run multiple times.
 *
 * Creates:
 *  - ADMIN role + SURVEY_AGENT role
 *  - Default administrator account (from env vars)
 *  - Default hourly rate setting
 *  - Protected owner agent account (cannot be edited/deactivated by admins)
 *
 * Run with: bun run db:seed
 *
 * NOTE: Bun's built-in .env parser expands `$VAR` references, which breaks
 * passwords containing `$`. We use the standard `dotenv` package to parse
 * .env explicitly so values like `wordpa$$123` are preserved verbatim.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

// ---------- Explicit .env parsing (preserves $ literally) ----------
// We use the same algorithm as the standard dotenv package: split on newlines,
// skip blanks/comments, strip surrounding quotes, do NOT expand $VAR.
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
    // Strip matching surrounding quotes (single or double).
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

const db = new PrismaClient()

async function main() {
  // ---------- Roles ----------
  const adminRole = await db.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  })
  const agentRole = await db.role.upsert({
    where: { name: 'SURVEY_AGENT' },
    update: {},
    create: { name: 'SURVEY_AGENT' },
  })

  // ---------- Default settings ----------
  const defaultRate = process.env.DEFAULT_HOURLY_RATE ?? '5.00'
  await db.setting.upsert({
    where: { key: 'default_hourly_rate' },
    update: {},
    create: { key: 'default_hourly_rate', value: defaultRate },
  })
  await db.setting.upsert({
    where: { key: 'business_timezone' },
    update: {},
    create: { key: 'business_timezone', value: 'America/New_York' },
  })

  // ---------- Default admin ----------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@lifedreambig.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2025'
  const adminName = process.env.SEED_ADMIN_NAME ?? 'System Administrator'

  const existingAdmin = await db.user.findFirst({
    where: { roleId: adminRole.id },
  })

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    const admin = await db.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        employeeId: 'ADMIN-001',
        username: 'admin',
        passwordHash,
        mustChangePassword: false,
        active: true,
        isProtected: false,
        roleId: adminRole.id,
      },
    })
    await db.compensationRecord.create({
      data: {
        userId: admin.id,
        hourlyRate: parseFloat(defaultRate),
        effectiveDate: new Date(),
        note: 'Initial seed rate',
        createdBy: 'seed',
      },
    })
    console.log(`[seed] Created admin: ${adminEmail} / ${adminPassword}`)
  } else {
    console.log(`[seed] Admin already exists (${existingAdmin.email})`)
  }

  // ---------- Protected owner agent ----------
  // This account is reserved (the project owner's personal agent account).
  // It is marked isProtected=true so admins CANNOT:
  //   - edit its profile info
  //   - reset its password
  //   - force a password change
  //   - activate / deactivate it
  //   - change its hourly rate
  // The owner can still sign in normally and change their own password via /agent/profile.
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? ''
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? ''
  const ownerName = process.env.SEED_OWNER_NAME ?? 'Owner'
  const ownerUsername = process.env.SEED_OWNER_USERNAME ?? 'owner'
  const ownerEmployeeId = process.env.SEED_OWNER_EMPLOYEE_ID ?? 'OWNER-001'
  const ownerRate = parseFloat(process.env.SEED_OWNER_HOURLY_RATE ?? defaultRate)

  if (ownerEmail && ownerPassword) {
    const existingOwner = await db.user.findFirst({
      where: {
        OR: [{ email: ownerEmail.toLowerCase() }, { username: ownerUsername.toLowerCase() }],
      },
    })

    if (!existingOwner) {
      const passwordHash = await bcrypt.hash(ownerPassword, 12)
      const owner = await db.user.create({
        data: {
          email: ownerEmail.toLowerCase(),
          name: ownerName,
          employeeId: ownerEmployeeId,
          username: ownerUsername.toLowerCase(),
          passwordHash,
          mustChangePassword: false,
          active: true,
          isProtected: true,
          roleId: agentRole.id,
        },
      })
      await db.compensationRecord.create({
        data: {
          userId: owner.id,
          hourlyRate: ownerRate,
          effectiveDate: new Date(),
          note: 'Initial rate for protected owner account',
          createdBy: 'seed',
        },
      })
      console.log(`[seed] Created protected owner agent: ${ownerEmail}`)
    } else if (existingOwner.isProtected) {
      console.log(`[seed] Protected owner already exists (${existingOwner.email})`)
    } else {
      // An account exists with this email/username but it's NOT protected.
      // Do NOT silently upgrade it — flag it for the operator to resolve manually.
      console.warn(
        `[seed] WARNING: account ${existingOwner.email} exists but isProtected=false. ` +
          `Not modifying it. Resolve manually if this should be the protected owner.`
      )
    }
  } else {
    console.log('[seed] SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD not set — skipping protected owner creation.')
  }

  console.log(`[seed] Roles: ADMIN=${adminRole.id}, SURVEY_AGENT=${agentRole.id}`)
  console.log('[seed] Done.')
}

main()
  .catch((e) => {
    console.error('[seed] ERROR:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
