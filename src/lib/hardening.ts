/**
 * Global process hardening — loaded once at startup.
 *
 * Registers handlers for `unhandledRejection` and `uncaughtException` so
 * that an unexpected async failure (e.g. a flaky Prisma connection, a
 * broken realtime notification) does NOT silently terminate the Node
 * process. The error is logged to stderr (server-side only — never
 * exposed to the client) and the process continues.
 *
 * This file is imported from `src/app/layout.tsx` (root layout) so it
 * runs in every Next.js server process, dev and production.
 *
 * Why this matters:
 *   - In a serverless environment (Vercel), one unhandled rejection can
 *     kill the function instance, causing 500s for in-flight requests.
 *   - In the local dev server, one unhandled rejection can kill the
 *     whole Next.js process, forcing the developer to restart.
 *
 * Trade-off:
 *   - We deliberately keep the process alive on uncaughtException.
 *     This is generally safe for a Node web server because each request
 *     is independent; a single bad request should not take down the
 *     whole process. If a true corruption bug exists, it will surface
 *     in subsequent requests and be logged.
 */

if (typeof process !== 'undefined') {
  if (!process.env.LIFEDB_HARDENING_INSTALLED) {
    process.env.LIFEDB_HARDENING_INSTALLED = '1'

    process.on('unhandledRejection', (reason) => {
      // Log but do NOT crash. The DB write that mattered already happened.
      console.error('[hardening] Unhandled rejection (process kept alive):', reason)
    })

    process.on('uncaughtException', (err) => {
      // Log but do NOT crash. Let Next.js handle the failed request.
      console.error('[hardening] Uncaught exception (process kept alive):', err)
    })
  }
}

export {}
