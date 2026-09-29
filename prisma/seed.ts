/**
 * Clock-Now seed.
 *
 * Idempotent: safe to run multiple times.
 *
 * Creates:
 *  - 3 roles: SUPER_ADMIN, ADMIN, SURVEY_AGENT
 *  - Default settings (default_hourly_rate, business_timezone)
 *  - A SUPER_ADMIN account (the platform owner — that's you, Bazile)
 *  - A default Business "Life Dream BIG"
 *  - An ADMIN account for that business
 *  - (Optional) a sample agent under that business
 *
 * Run with: bun run db:seed
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

// ---------- Explicit .env parsing (preserves $ literally) ----------
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
    process.env[key] = val
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'))

const db = new PrismaClient()

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  // ---------- Roles ----------
  const superAdminRole = await db.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: { name: 'SUPER_ADMIN' },
  })
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

  // ---------- Super Admin (platform owner) ----------
  const saEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'bkencompanyy@gmail.com'
  const saPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'wordpa$$123'
  const saName = process.env.SEED_SUPER_ADMIN_NAME ?? 'Bazile Kenley'

  let superAdmin = await db.user.findFirst({
    where: { email: saEmail.toLowerCase() },
  })
  if (!superAdmin) {
    const passwordHash = await bcrypt.hash(saPassword, 12)
    superAdmin = await db.user.create({
      data: {
        email: saEmail.toLowerCase(),
        name: saName,
        username: 'bken',
        passwordHash,
        mustChangePassword: false,
        active: true,
        isProtected: true, // super admin is protected — cannot be edited by anyone
        roleId: superAdminRole.id,
        businessId: null, // super admin has no business
      },
    })
    console.log(`[seed] Created SUPER_ADMIN: ${saEmail} / ${saPassword}`)
  } else {
    // Ensure existing super admin has the right role + protected flag
    superAdmin = await db.user.update({
      where: { id: superAdmin.id },
      data: {
        roleId: superAdminRole.id,
        isProtected: true,
        businessId: null,
      },
    })
    console.log(`[seed] SUPER_ADMIN already exists (${saEmail}) — ensured role + protected`)
  }

  // ---------- Default Business ----------
  const businessName = process.env.SEED_BUSINESS_NAME ?? 'Life Dream BIG'
  const businessSlug = slugify(businessName)

  let business = await db.business.findUnique({ where: { slug: businessSlug } })
  if (!business) {
    business = await db.business.create({
      data: {
        name: businessName,
        slug: businessSlug,
        active: true,
      },
    })
    console.log(`[seed] Created business: ${businessName} (slug: ${businessSlug})`)
  } else {
    console.log(`[seed] Business already exists: ${business.name}`)
  }

  // ---------- Admin for the business ----------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@lifedreambig.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2025'
  const adminName = process.env.SEED_ADMIN_NAME ?? 'System Administrator'

  let admin = await db.user.findFirst({
    where: { email: adminEmail.toLowerCase() },
  })
  if (!admin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    admin = await db.user.create({
      data: {
        email: adminEmail.toLowerCase(),
        name: adminName,
        employeeId: 'ADMIN-001',
        username: 'admin',
        passwordHash,
        mustChangePassword: false,
        active: true,
        isProtected: false,
        roleId: adminRole.id,
        businessId: business.id,
      },
    })
    console.log(`[seed] Created ADMIN: ${adminEmail} / ${adminPassword}`)
  } else {
    admin = await db.user.update({
      where: { id: admin.id },
      data: {
        roleId: adminRole.id,
        businessId: business.id,
      },
    })
    console.log(`[seed] ADMIN already exists (${adminEmail}) — ensured role + business`)
  }

  // Link the business to its owner admin
  await db.business.update({
    where: { id: business.id },
    data: { ownerAdminId: admin.id },
  })

  // ---------- Optional sample agent ----------
  const agentEmail = process.env.SEED_AGENT_EMAIL ?? ''
  const agentPassword = process.env.SEED_AGENT_PASSWORD ?? ''
  const agentName = process.env.SEED_AGENT_NAME ?? ''
  const agentUsername = process.env.SEED_AGENT_USERNAME ?? ''
  const agentEmployeeId = process.env.SEED_AGENT_EMPLOYEE_ID ?? ''
  const agentRate = parseFloat(process.env.SEED_AGENT_HOURLY_RATE ?? defaultRate)

  if (agentEmail && agentPassword && agentUsername) {
    let agent = await db.user.findFirst({
      where: { email: agentEmail.toLowerCase() },
    })
    if (!agent) {
      const passwordHash = await bcrypt.hash(agentPassword, 12)
      agent = await db.user.create({
        data: {
          email: agentEmail.toLowerCase(),
          name: agentName || 'Sample Agent',
          employeeId: agentEmployeeId || 'AGENT-001',
          username: agentUsername.toLowerCase(),
          passwordHash,
          mustChangePassword: true,
          active: true,
          isProtected: false,
          roleId: agentRole.id,
          businessId: business.id,
        },
      })
      await db.compensationRecord.create({
        data: {
          userId: agent.id,
          businessId: business.id,
          hourlyRate: agentRate,
          effectiveDate: new Date(),
          note: 'Initial rate on account creation',
          createdBy: 'seed',
        },
      })
      console.log(`[seed] Created sample agent: ${agentEmail}`)
    } else {
      console.log(`[seed] Sample agent already exists (${agentEmail})`)
    }
  } else {
    console.log('[seed] SEED_AGENT_* not set — skipping sample agent creation.')
  }

  console.log(`[seed] Roles: SUPER_ADMIN=${superAdminRole.id}, ADMIN=${adminRole.id}, SURVEY_AGENT=${agentRole.id}`)
  console.log(`[seed] Business: ${business.name} (owner: ${admin.email})`)
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
