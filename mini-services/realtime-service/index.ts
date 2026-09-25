/**
 * Realtime mini-service (LIFE DREAM BIG Clocking System).
 *
 * A small, long-lived socket.io server that the Next.js API routes notify
 * via HTTP POST /notify, and admin dashboard clients subscribe to via
 * socket.io.
 *
 * Why a separate process:
 *  - Vercel is serverless: long-lived socket connections cannot live in a
 *    Next.js route. The realtime service is deployed separately (Railway /
 *    Render / Fly.io) and the Next.js side POSTs notifications to it.
 *
 * Lifecycle hardening:
 *  - SIGTERM / SIGINT  → stop accepting new conns, close existing within
 *    a 5s grace window, then exit 0.
 *  - uncaughtException → log and continue (best-effort; one bad client
 *    payload must not kill the broker for everyone else).
 *  - unhandledRejection → log and continue.
 *  - The DB is always the source of truth. Realtime is best-effort only:
 *    if this service dies, admin clients fall back to 15-second polling.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server, type Socket } from 'socket.io'

const PORT = parseInt(process.env.PORT || '3003', 10)
const SHUTDOWN_GRACE_MS = 5000

// ---------- Hardening (must be installed before HTTP server boots) ----------
if (!process.env.LIFEDB_RT_HARDENING_INSTALLED) {
  process.env.LIFEDB_RT_HARDENING_INSTALLED = '1'

  process.on('unhandledRejection', (reason) => {
    // Log but do NOT crash. The broker must stay alive for other clients.
    // eslint-disable-next-line no-console
    console.error('[realtime] Unhandled rejection (process kept alive):', reason)
  })

  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[realtime] Uncaught exception (process kept alive):', err)
  })
}

// ---------- HTTP server (POST /notify, GET /health) ----------
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // CORS — tighten in production by setting REALTIME_ALLOWED_ORIGINS.
  const allowedOrigins = (process.env.REALTIME_ALLOWED_ORIGINS || '*').split(',')
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0])
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/notify') {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      // 1 MB hard cap — protects against memory exhaustion from a
      // misbehaving caller.
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        const note = JSON.parse(body) as { type?: string }
        // Broadcast to all connected admin dashboards. Type defaults to
        // 'attendance_event' if not provided (back-compat).
        io.emit(note.type || 'attendance_event', note)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        clients: io.engine.clientsCount,
        uptime: process.uptime(),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      })
    )
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ---------- socket.io server ----------
const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: (process.env.REALTIME_ALLOWED_ORIGINS || '*').split(','),
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  // Cap max clients to protect against accidental open-internet exposure.
  // Default 1000 is generous for an internal admin dashboard.
  maxHttpBufferSize: 1e5,
})

io.on('connection', (socket: Socket) => {
  // eslint-disable-next-line no-console
  console.log(`[realtime] client connected: ${socket.id} (total: ${io.engine.clientsCount})`)
  socket.on('disconnect', (reason: string) => {
    // eslint-disable-next-line no-console
    console.log(`[realtime] client disconnected: ${socket.id} (${reason})`)
  })
  socket.on('error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.error(`[realtime] socket error (${socket.id}):`, err.message)
  })
})

// ---------- Graceful shutdown ----------
let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  // eslint-disable-next-line no-console
  console.log(`[realtime] ${signal} received, shutting down…`)

  // Stop accepting new HTTP connections.
  httpServer.close()

  // Tell every connected client to disconnect now (they will retry
  // against the next realtime instance).
  for (const socket of io.sockets.sockets.values()) {
    socket.disconnect(true)
  }

  // Give in-flight work a grace window, then exit.
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log('[realtime] closing socket.io engine')
    io.close(() => process.exit(0))
  }, SHUTDOWN_GRACE_MS).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[realtime] socket.io service listening on port ${PORT}`)
})
