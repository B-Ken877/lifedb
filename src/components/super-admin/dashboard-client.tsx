/**
 * Super-admin dashboard client component.
 *
 * Receives server-rendered initial stats and renders the platform overview:
 * stat cards + a businesses table. A "Refresh" button re-fetches the
 * /api/super-admin/dashboard endpoint. No realtime socket (the platform
 * overview doesn't need second-by-second updates).
 */

'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Building2, Users, UserCog, CalendarClock } from 'lucide-react'

interface BusinessRow {
  id: string
  name: string
  slug: string
  active: boolean
  createdAt: string
  updatedAt: string
  ownerAdmin: {
    id: string
    name: string
    email: string
    username: string
    active: boolean
  } | null
  agentCount: number
}

interface DashboardPayload {
  stats: {
    totalBusinesses: number
    activeBusinesses: number
    inactiveBusinesses: number
    totalAdmins: number
    totalAgents: number
    eventsToday: number
  }
  businesses: BusinessRow[]
  fetchedAt: string
}

export function SuperAdminDashboardClient({ initial }: { initial: DashboardPayload }) {
  const [data, setData] = useState<DashboardPayload>(initial)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/super-admin/dashboard', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setData({
          stats: j.stats,
          businesses: j.businesses,
          fetchedAt: j.fetchedAt,
        })
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const stats = data.stats
  const fetchedAt = new Date(data.fetchedAt)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Businesses"
          value={stats.totalBusinesses}
          sub={`${stats.activeBusinesses} active · ${stats.inactiveBusinesses} inactive`}
          icon={Building2}
        />
        <StatCard label="Admins" value={stats.totalAdmins} sub="Across all businesses" icon={UserCog} />
        <StatCard label="Agents" value={stats.totalAgents} sub="Across all businesses" icon={Users} />
        <StatCard label="Events Today" value={stats.eventsToday} sub="Attendance events logged today" icon={CalendarClock} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All Businesses</CardTitle>
              <CardDescription>
                {data.businesses.length} total · last refreshed {fetchedAt.toLocaleTimeString()}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={`h-4 w-4 mr-2 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {busy && data.businesses.length === 0 ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.businesses.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No businesses yet. Visit the Businesses tab to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Slug</th>
                    <th className="px-3 py-2 font-medium">Owner Admin</th>
                    <th className="px-3 py-2 font-medium text-right">Agents</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.businesses.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{b.slug}</td>
                      <td className="px-3 py-2">
                        {b.ownerAdmin ? (
                          <div>
                            <div className="font-medium">{b.ownerAdmin.name}</div>
                            <div className="text-xs text-muted-foreground">{b.ownerAdmin.email}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No admin assigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{b.agentCount}</td>
                      <td className="px-3 py-2">
                        {b.active ? (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                            Inactive
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: number
  sub: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  )
}
