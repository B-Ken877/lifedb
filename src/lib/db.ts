import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

// =====================================================
// CRITICAL: Resolve DATABASE_URL from multiple sources.
//
// Supabase's Vercel integration imports env vars with different naming
// depending on the integration version:
//
//   Newer (2024+): POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING
//   Older:         DATABASE_URL_POSTGRES_PRISMA_URL / DATABASE_URL_POSTGRES_URL_NON_POOLING
//
// But Prisma's schema reads env("DATABASE_URL") and env("DIRECT_URL").
// This module maps the Supabase names to the Prisma names BEFORE
// constructing the PrismaClient.
//
// Priority (highest wins):
//   1. DATABASE_URL          (explicit — set by operator)
//   2. POSTGRES_PRISMA_URL   (Supabase new naming, pooled)
//   3. DATABASE_URL_POSTGRES_PRISMA_URL  (Supabase old naming, pooled)
//   4. .env file             (local dev)
// =====================================================

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return process.env.DATABASE_URL
  }
  if (process.env.POSTGRES_PRISMA_URL && process.env.POSTGRES_PRISMA_URL.trim() !== '') {
    return process.env.POSTGRES_PRISMA_URL
  }
  if (process.env.DATABASE_URL_POSTGRES_PRISMA_URL && process.env.DATABASE_URL_POSTGRES_PRISMA_URL.trim() !== '') {
    return process.env.DATABASE_URL_POSTGRES_PRISMA_URL
  }
  return undefined
}

function resolveDirectUrl(): string | undefined {
  if (process.env.DIRECT_URL && process.env.DIRECT_URL.trim() !== '') {
    return process.env.DIRECT_URL
  }
  if (process.env.POSTGRES_URL_NON_POOLING && process.env.POSTGRES_URL_NON_POOLING.trim() !== '') {
    return process.env.POSTGRES_URL_NON_POOLING
  }
  if (process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING.trim() !== '') {
    return process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING
  }
  return undefined
}

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
    // Only set if not already defined by the system env (Vercel env vars
    // take precedence over .env file).
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val
    }
  }
}

forceLoadEnvFile()

const resolvedDbUrl = resolveDatabaseUrl()
const resolvedDirectUrl = resolveDirectUrl()

if (resolvedDbUrl && (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '')) {
  process.env.DATABASE_URL = resolvedDbUrl
}
if (resolvedDirectUrl && (!process.env.DIRECT_URL || process.env.DIRECT_URL.trim() === '')) {
  process.env.DIRECT_URL = resolvedDirectUrl
}

// NextAuth URL resolution for Vercel.
if (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.trim() === '') {
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim() !== '') {
    process.env.NEXTAUTH_URL = process.env.NEXT_PUBLIC_APP_URL
  } else if (process.env.VERCEL_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`
  }
}

// =====================================================
// Prisma client (singleton on globalThis to survive HMR in dev)
// =====================================================

const logConfig =
  process.env.DEBUG_PRISMA === '1' ? ['query', 'warn', 'error'] as const : ['warn', 'error'] as const

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __lifedbDbEnvWarned?: boolean
}

function warnIfDatabaseMisconfigured(): void {
  if (globalForPrisma.__lifedbDbEnvWarned) return
  globalForPrisma.__lifedbDbEnvWarned = true

  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL || DATABASE_URL.trim() === '') {
    // eslint-disable-next-line no-console
    console.warn('┌──────────────────────────────────────────────────────────────────────────────┐')
    // eslint-disable-next-line no-console
    console.warn('│  ⚠️  DATABASE_URL is not set. Prisma queries will fail.                     │')
    // eslint-disable-next-line no-console
    console.warn('│     Set DATABASE_URL or POSTGRES_PRISMA_URL in your env.                    │')
    // eslint-disable-next-line no-console
    console.warn('└──────────────────────────────────────────────────────────────────────────────┘')
    return
  }
}

function createClient(): PrismaClient {
  warnIfDatabaseMisconfigured()
  const client = globalForPrisma.prisma ?? new PrismaClient({ log: [...logConfig] })
  if (!globalForPrisma.prisma) globalForPrisma.prisma = client
  return client
}

export const db = createClient()
