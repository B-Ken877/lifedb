import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

// =====================================================
// CRITICAL: Override stale system DATABASE_URL.
//
// Many deployment environments (and this sandbox) pre-set DATABASE_URL as
// a system environment variable pointing to a SQLite file:
//   DATABASE_URL=file:/home/z/my-project/db/custom.db
//
// This system env var OVERRIDES whatever's in .env, because process.env
// is populated before any .env file is loaded. The Prisma client then
// sees "file:..." and throws:
//   "the URL must start with the protocol postgresql:// or postgres://"
//
// Fix: explicitly read .env and force-set DATABASE_URL + DIRECT_URL on
// process.env BEFORE constructing the PrismaClient. This makes .env take
// precedence over any stale system env var.
//
// This mirrors the same fix already applied in prisma/seed.ts (commit
// e0c0455) — the seed has always worked, but the runtime did not, because
// the runtime relied on Next.js's .env loader which does NOT override
// existing process.env values.
// =====================================================

function forceLoadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
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
    // FORCE override — this is the key difference from dotenv's default
    // behavior. System env vars (often stale SQLite URLs) must NOT win.
    process.env[key] = val
  }
}

forceLoadEnvFile()

// =====================================================
// Prisma client (singleton on globalThis to survive HMR in dev)
// =====================================================

const logConfig =
  process.env.DEBUG_PRISMA === '1' ? ['query', 'warn', 'error'] as const : ['warn', 'error'] as const

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __lifedbDbEnvWarned?: boolean
}

/**
 * Soft validation: warn (not crash) if DATABASE_URL is missing or wrong.
 * Prisma itself will throw a clear error on the first query if the URL
 * is unusable — our warning just adds actionable context.
 */
function warnIfDatabaseMisconfigured(): void {
  if (globalForPrisma.__lifedbDbEnvWarned) return
  globalForPrisma.__lifedbDbEnvWarned = true

  const DATABASE_URL = process.env.DATABASE_URL
  const DIRECT_URL = process.env.DIRECT_URL

  if (!DATABASE_URL || DATABASE_URL.trim() === '') {
    // eslint-disable-next-line no-console
    console.warn('┌──────────────────────────────────────────────────────────────────────────────┐')
    // eslint-disable-next-line no-console
    console.warn('│  ⚠️  DATABASE_URL is not set or is empty. Prisma queries will fail.         │')
    // eslint-disable-next-line no-console
    console.warn('│     Fix: create .env with DATABASE_URL="postgres://..." and restart.         │')
    // eslint-disable-next-line no-console
    console.warn('└──────────────────────────────────────────────────────────────────────────────┘')
    return
  }

  if (DATABASE_URL.startsWith('file:')) {
    // eslint-disable-next-line no-console
    console.warn('┌──────────────────────────────────────────────────────────────────────────────┐')
    // eslint-disable-next-line no-console
    console.warn('│  ⚠️  DATABASE_URL points to SQLite (file:...). SQLite is NOT supported.     │')
    // eslint-disable-next-line no-console
    console.warn('│     The Prisma schema mandates provider = "postgresql".                   │')
    // eslint-disable-next-line no-console
    console.warn('│     Fix: edit .env to use a postgres:// URL, then restart.                   │')
    // eslint-disable-next-line no-console
    console.warn('└──────────────────────────────────────────────────────────────────────────────┘')
    return
  }

  if (!DATABASE_URL.startsWith('postgres://') && !DATABASE_URL.startsWith('postgresql://')) {
    // eslint-disable-next-line no-console
    console.warn(`┌──────────────────────────────────────────────────────────────────────────────┐`)
    // eslint-disable-next-line no-console
    console.warn(`│  ⚠️  DATABASE_URL does not start with postgres:// — Prisma will reject it.   │`)
    // eslint-disable-next-line no-console
    console.warn(`│     Got: ${DATABASE_URL.slice(0, 50)}...`.padEnd(78) + '│')
    // eslint-disable-next-line no-console
    console.warn('└──────────────────────────────────────────────────────────────────────────────┘')
    return
  }

  if (!DIRECT_URL || DIRECT_URL.trim() === '') {
    // eslint-disable-next-line no-console
    console.warn('┌──────────────────────────────────────────────────────────────────────────────┐')
    // eslint-disable-next-line no-console
    console.warn('│  ⚠️  DIRECT_URL is not set. Migrations will fail (runtime queries are fine).│')
    // eslint-disable-next-line no-console
    console.warn('└──────────────────────────────────────────────────────────────────────────────┘')
    return
  }
}

// Create the client.
function createClient(): PrismaClient {
  warnIfDatabaseMisconfigured()
  const client = globalForPrisma.prisma ?? new PrismaClient({ log: [...logConfig] })
  if (!globalForPrisma.prisma) globalForPrisma.prisma = client
  return client
}

export const db = createClient()
