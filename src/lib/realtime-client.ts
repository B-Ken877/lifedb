/**
 * Realtime client hook for the admin dashboard.
 *
 * Connects via socket.io to the mini-service on port 3003 (proxied through
 * Caddy via XTransformPort=3003).
 *
 * On message:
 *  - Refreshes dashboard data (DB is source of truth; realtime is only a
 *    notification mechanism).
 *
 * On disconnect:
 *  - Automatically retries with backoff.
 *  - Falls back to polling every 15s.
 *
 * CRITICAL: realtime never updates the UI directly with payload data.
 * It only triggers a refetch of /api/admin/dashboard, which queries the DB.
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseRealtimeAdminOptions {
  onMessage?: () => void
}

export function useRealtimeAdmin(opts: UseRealtimeAdminOptions = {}) {
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const reconnectAttempts = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onMessageRef = useRef(opts.onMessage)
  onMessageRef.current = opts.onMessage

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return
    pollTimerRef.current = setInterval(() => {
      onMessageRef.current?.()
    }, 15_000)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    // Connect via Caddy with XTransformPort=3003 query param.
    const socket = io('/socket.io/?XTransformPort=3003', {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      reconnectAttempts.current = 0
      stopPolling()
      // On reconnect: refresh once to reconcile state from the DB.
      onMessageRef.current?.()
    })
    socket.on('disconnect', () => {
      setConnected(false)
      startPolling()
    })
    socket.on('connect_error', () => {
      setConnected(false)
      startPolling()
    })
    socket.on('attendance_event', () => {
      setLastEventAt(Date.now())
      onMessageRef.current?.()
    })
    socket.on('employee_updated', () => {
      setLastEventAt(Date.now())
      onMessageRef.current?.()
    })
    socket.on('correction_request', () => {
      setLastEventAt(Date.now())
      onMessageRef.current?.()
    })

    // Always start with at least one fetch to populate initial state.
    onMessageRef.current?.()

    return () => {
      socket.disconnect()
      socketRef.current = null
      stopPolling()
    }
  }, [])

  return { connected, lastEventAt }
}
