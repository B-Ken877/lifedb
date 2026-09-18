import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma client (singleton on globalThis to survive HMR in dev).
//
// NOTE: Do NOT enable `log: ['query']` here by default. Doing so writes a
// line to stdout for EVERY Prisma query, which (a) floods the dev log with
// megabytes of noise, (b) when combined with a piped dev script
// (`next dev | tee dev.log`) makes the process fragile to SIGPIPE if the
// consumer ever exits, and (c) provides no production value. Enable query
// logging only when actively debugging, by setting DEBUG_PRISMA=1 in env.
const logConfig =
  process.env.DEBUG_PRISMA === '1' ? ['query', 'warn', 'error'] as const : ['warn', 'error'] as const

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...logConfig],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db