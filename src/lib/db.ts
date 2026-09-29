import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

// =====================================================
// CRITICAL: Resolve DATABASE_URL from multiple sources.
//
// The Prisma schema reads `env("DATABASE_URL")` and `env("DIRECT_URL")`.
// But on Vercel + Supabase, the auto-imported environment variables use
// Supabase's naming convention:
//
//   DATABASE_URL_POSTGRES_PRISMA_URL      ← pooled connection (PgBouncer)
//   DATABASE_URL_POSTGRES_URL_NON_POOLING ← direct connection
//
// These do NOT match what Prisma expects. This module maps them BEFORE
// constructing the PrismaClient, so the schema's env("DATABASE_URL")
// resolves correctly.
//
// Priority (highest wins):
//   1. DATABASE_URL          (explicit — set by the operator)
//   2. DATABASE_URL_POSTGRES_PRISMA_URL  (Supabase auto-import, pooled)
//   3. .env file             (local dev)
//
// Same for DIRECT_URL → DATABASE_URL_POSTGRES_URL_NON_POOLING.
//
// Also handles the local-dev case where a stale system DATABASE_URL
// points to a SQLite file (file:...) — the .env file override wins.
// =====================================================

function resolveDatabaseUrl(): string | undefined {
  // 1. Explicit DATABASE_URL (operator set this directly)
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return process.env.DATABASE_URL
  }
  // 2. Supabase auto-import name (Vercel integration)
  if (process.env.DATABASE_URL_POSTGRES_PRISMA_URL && process.env.DATABASE_URL_POSTGRES_PRISMA_URL.trim() !== '') {
    return process.env.DATABASE_URL_POSTGRES_PRISMA_URL
  }
  // 3. Fall through to .env file (local dev)
  return undefined
}

function resolveDirectUrl(): string | undefined {
  if (process.env.DIRECT_URL && process.env.DIRECT_URL.trim() !== '') {
    return process.env.DIRECT_URL
  }
  if (process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING.trim() !== '') {
    return process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING
  }
  // Fallback to the pooled URL if no direct URL is available
  // (migrations will warn but runtime queries will work)
  return process.env.DATABASE_URL_POSTGRES_PRISMAL_URL ?? undefined
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
    // take precedence over .env file). This is the opposite of the local-dev
    // case where we WANT .env to override a stale system DATABASE_URL.
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val
    }
  }
}

forceLoadEnvFile()

// Now resolve and FORCE-set the canonical names so Prisma's
// env("DATABASE_URL") and env("DIRECT_URL") see the right values.
const resolvedDbUrl = resolveDatabaseUrl()
const resolvedDirectUrl = resolveDirectUrl()

if (resolvedDbUrl && (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '')) {
  process.env.DATABASE_URL = resolvedDbUrl
}
if (resolvedDirectUrl && (!process.env.DIRECT_URL || process.env.DIRECT_URL.trim() === '')) {
  process.env.DIRECT_URL = resolvedDirectUrl
}

// =====================================================
// NextAuth URL resolution for Vercel.
// NextAuth v4 reads NEXTAUTH_URL from env. On Vercel, if it's not
// explicitly set, fall back to NEXT_PUBLIC_APP_URL, then VERCEL_URL
// (which Vercel always sets automatically).
// =====================================================
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
  const DIRECT_URL = process.env.DIRECT_URL

  if (!DATABASE_URL || DATABASE_URL.trim() === '') {
    // eslint-disable-next-line no-console
    console.warn('┌──────────────────────────────────────────────────────────────────────────────┐')
    // eslint-disable-next-line no-console
    console.warn('│  ⚠️  DATABASE_URL is not set. Prisma queries will fail.                     │')
    // eslint-disable-next-line no-console
    console.warn('│     Set DATABASE_URL or DATABASE_URL_POSTGRES_PRISMA_URL in your env.       │')
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
