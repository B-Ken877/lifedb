/**
 * Realtime mini-service.
 *
 * A small socket.io server that runs on port 3003.
 *
 * - Listens for HTTP POST /notify from Next.js API routes (serverless)
 *   carrying a notification payload.
 * - Broadcasts the notification to all connected socket.io clients (admin dashboards).
 *
 * Why a separate process:
 *  - Vercel is serverless: connections can't be held long-term inside a Next.js route.
 *  - The mini-service is a single long-lived process that holds connections.
 *  - On Vercel, you'd deploy this as a separate service (e.g., Railway / Render / Fly.io).
 *
 * The mini-service keeps NO business state — it only forwards notifications.
 * The database is always the source of truth; admin clients refetch after
 * every notification.
 */

import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer((req, res) => {
  // CORS for local dev; tighten in production.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/notify') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
      if (body.length > 1_000_000) req.destroy() // 1MB cap
    })
    req.on('end', () => {
      try {
        const note = JSON.parse(body)
        // Broadcast to all connected admin dashboards.
        io.emit(note.type || 'attendance_event', note)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount, uptime: process.uptime() }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

const io = new Server(httpServer, {
  // Path "/socket.io/" (default) so the HTTP routes (POST /notify, GET /health)
  // are not intercepted by the socket.io engine.
  path: '/socket.io/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

io.on('connection', (socket) => {
  console.log(`[realtime] client connected: ${socket.id} (total: ${io.engine.clientsCount})`)
  socket.on('disconnect', (reason) => {
    console.log(`[realtime] client disconnected: ${socket.id} (${reason})`)
  })
  socket.on('error', (err) => {
    console.error(`[realtime] socket error (${socket.id}):`, err)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[realtime] socket.io service listening on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[realtime] SIGTERM received, shutting down…')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[realtime] SIGINT received, shutting down…')
  httpServer.close(() => process.exit(0))
})
