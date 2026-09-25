/**
 * Agent dashboard client component.
 *
 * Owns the clock actions UI + the hours-by-day chart.
 *
 * UX:
 *  - The current state is prominently shown via a large colored panel.
 *  - Only the valid next action(s) are enabled. Invalid actions are disabled.
 *  - Optimistic UI: the button shows a spinner while the request is in flight.
 *  - On success: state, today summary, and chart refresh from server data.
 *  - On error: a toast with the server's error message.
 *  - Chart period toggle: 7 / 14 / 30 days. Fetches from /api/agent/attendance?hours=...
 */

'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  PlayCircle,
  StopCircle,
  Coffee,
  Play,
  Loader2,
  Clock as ClockIcon,
  DollarSign,
  CalendarDays,
  CalendarRange,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'

type AgentState = 'OFFLINE' | 'WORKING' | 'ON_BREAK'
type EventType = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END'

interface DaySummary {
  businessDate: string
  clockInUtc: string | null
  clockOutUtc: string | null
  breakHours: number
  grossHours: number
  netHours: number
  hourlyRate: number
  earningsCents: number
  status: string
}

interface InitialData {
  state: AgentState
  lastEventAtUtc: string | null
  today: DaySummary
  currentHourlyRate: number
  weekTotalNetHours: number
  weekTotalEarningsCents: number
  monthTotalNetHours: number
  monthTotalEarningsCents: number
  hoursByDay7: { dateKey: string; label: string; netHours: number; earningsCents: number }[]
  todayDate: string
}

function formatHours(h: number): string {
  return `${h.toFixed(2)}h`
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  // America/New_York display
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATE_META: Record<
  AgentState,
  { label: string; bg: string; fg: string; description: string }
> = {
  OFFLINE: {
    label: 'OFFLINE',
    bg: 'bg-muted',
    fg: 'text-muted-foreground',
    description: 'You are not currently clocked in.',
  },
  WORKING: {
    label: 'WORKING',
    bg: 'bg-emerald-500',
    fg: 'text-emerald-50',
    description: 'You are clocked in and working.',
  },
  ON_BREAK: {
    label: 'ON BREAK',
    bg: 'bg-amber-500',
    fg: 'text-amber-50',
    description: 'You are on a break.',
  },
}

export function AgentDashboardClient({ initial }: { initial: InitialData }) {
  const [state, setState] = useState<AgentState>(initial.state)
  const [today, setToday] = useState<DaySummary>(initial.today)
  const [weekHours, setWeekHours] = useState(initial.weekTotalNetHours)
  const [weekEarn, setWeekEarn] = useState(initial.weekTotalEarningsCents)
  const [monthHours, setMonthHours] = useState(initial.monthTotalNetHours)
  const [monthEarn, setMonthEarn] = useState(initial.monthTotalEarningsCents)
  const [chartData, setChartData] = useState(initial.hoursByDay7)
  const [chartRange, setChartRange] = useState<7 | 14 | 30>(7)
  const [busy, setBusy] = useState<EventType | null>(null)
  const [loadingChart, setLoadingChart] = useState(false)

  const refreshChart = useCallback(async (days: number) => {
    setLoadingChart(true)
    try {
      const res = await fetch(`/api/agent/attendance?hours=${days}`)
      if (res.ok) {
        const json = await res.json()
        setChartData(json.hoursByDay)
        setChartRange(days as 7 | 14 | 30)
      }
    } catch {
      // ignore
    } finally {
      setLoadingChart(false)
    }
  }, [])

  const doAction = async (action: EventType) => {
    setBusy(action)
    try {
      const res = await fetch('/api/agent/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Action not allowed right now.')
        return
      }
      setState(json.state)
      setToday({
        ...json.today,
        clockInUtc: json.today.clockInUtc,
        clockOutUtc: json.today.clockOutUtc,
      })
      // Refresh chart + week/month summaries from the dashboard payload.
      if (json.dashboard) {
        setWeekHours(json.dashboard.week.totalNetHours)
        setWeekEarn(json.dashboard.week.totalEarningsCents)
        setMonthHours(json.dashboard.month.totalNetHours)
        setMonthEarn(json.dashboard.month.totalEarningsCents)
        setChartData(json.dashboard.hoursByDay7)
      }
      toast.success(`Action recorded: ${action.replace('_', ' ').toLowerCase()}`)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const stateMeta = STATE_META[state]

  // Determine which action is the primary (large) one.
  // Cast through unknown to prevent TS from narrowing to 'CLOCK_IN'|'CLOCK_OUT'|null
  // so subsequent equality checks against BREAK_START / BREAK_END stay valid.
  const primaryAction: EventType | null = (
    state === 'OFFLINE' ? 'CLOCK_IN' : state === 'WORKING' ? 'CLOCK_OUT' : null
  ) as EventType | null

  return (
    <div className="space-y-6">
      {/* Status + clock actions */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-medium text-muted-foreground">
                Current status
              </CardTitle>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold tracking-wide',
                    stateMeta.bg,
                    stateMeta.fg
                  )}
                >
                  {stateMeta.label}
                </span>
                <span className="text-sm text-muted-foreground">{stateMeta.description}</span>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {today.clockInUtc && (
                <div>
                  Clock in: <span className="text-foreground font-medium">{formatTime(today.clockInUtc)}</span>
                </div>
              )}
              {today.clockOutUtc && (
                <div>
                  Clock out: <span className="text-foreground font-medium">{formatTime(today.clockOutUtc)}</span>
                </div>
              )}
              {!today.clockInUtc && <div>No clock-in recorded today.</div>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionButton
              action="CLOCK_IN"
              disabled={state !== 'OFFLINE' || busy !== null}
              busy={busy === 'CLOCK_IN'}
              onClick={() => doAction('CLOCK_IN')}
              icon={<PlayCircle className="h-6 w-6" />}
              label="Clock In"
              tone="primary"
              large={primaryAction === 'CLOCK_IN'}
            />
            <ActionButton
              action="BREAK_START"
              disabled={state !== 'WORKING' || busy !== null}
              busy={busy === 'BREAK_START'}
              onClick={() => doAction('BREAK_START')}
              icon={<Coffee className="h-6 w-6" />}
              label="Start Break"
              tone="warning"
              large={primaryAction === 'BREAK_START'}
            />
            <ActionButton
              action="BREAK_END"
              disabled={state !== 'ON_BREAK' || busy !== null}
              busy={busy === 'BREAK_END'}
              onClick={() => doAction('BREAK_END')}
              icon={<Play className="h-6 w-6" />}
              label="End Break"
              tone="success"
              large={primaryAction === 'BREAK_END'}
            />
            <ActionButton
              action="CLOCK_OUT"
              disabled={state === 'OFFLINE' || busy !== null}
              busy={busy === 'CLOCK_OUT'}
              onClick={() => doAction('CLOCK_OUT')}
              icon={<StopCircle className="h-6 w-6" />}
              label="Clock Out"
              tone="destructive"
              large={primaryAction === 'CLOCK_OUT'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Today metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today — Net hours"
          value={formatHours(today.netHours)}
          icon={<ClockIcon className="h-4 w-4" />}
          hint={today.status === 'IN_PROGRESS' ? 'In progress' : undefined}
        />
        <StatCard
          title="Today — Break"
          value={formatHours(today.breakHours)}
          icon={<Coffee className="h-4 w-4" />}
        />
        <StatCard
          title="Today — Est. earnings"
          value={formatCents(today.earningsCents)}
          icon={<DollarSign className="h-4 w-4" />}
          hint={`@ $${today.hourlyRate.toFixed(2)}/hr`}
        />
        <StatCard
          title="Hourly rate"
          value={`$${today.hourlyRate.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          hint="per hour"
        />
      </div>

      {/* Week / Month summaries */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" /> This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Net hours</p>
                <p className="text-2xl font-semibold">{formatHours(weekHours)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Est. earnings</p>
                <p className="text-2xl font-semibold">{formatCents(weekEarn)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-4 w-4" /> This Month / Pay Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Net hours</p>
                <p className="text-2xl font-semibold">{formatHours(monthHours)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Est. earnings</p>
                <p className="text-2xl font-semibold">{formatCents(monthEarn)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hours-by-day chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Hours by day</CardTitle>
              <CardDescription>Net worked hours over the selected range.</CardDescription>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/30">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => refreshChart(d)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-sm font-medium transition-colors',
                    chartRange === d
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                  // Recharts' Formatter type is overly strict on the generic
                  // parameter; cast through unknown to keep our hook ergonomic.
                  formatter={((value: number, _name: unknown, props: any) => {
                    const cents = props?.payload?.earningsCents ?? 0
                    return [`${value.toFixed(2)}h · ${formatCents(cents)}`, 'Hours']
                  }) as any}
                  labelFormatter={(label: any, payload: any) => {
                    const dateKey = payload?.[0]?.payload?.dateKey
                    return dateKey ? `${label} · ${dateKey}` : label
                  }}
                />
                <Bar
                  dataKey="netHours"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {loadingChart && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Refreshing…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ActionButton({
  action,
  disabled,
  busy,
  onClick,
  icon,
  label,
  tone,
  large,
}: {
  action: string
  disabled: boolean
  busy: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  tone: 'primary' | 'warning' | 'success' | 'destructive'
  large?: boolean
}) {
  const toneClass = {
    primary: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    success: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    destructive: 'bg-red-600 hover:bg-red-700 text-white',
  }[tone]

  return (
    <button
      data-action={action}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-all',
        large ? 'sm:p-6' : 'sm:p-4',
        disabled
          ? 'bg-muted text-muted-foreground border-border cursor-not-allowed opacity-60'
          : `${toneClass} border-transparent shadow-sm hover:shadow-md`,
        large && !disabled && 'ring-2 ring-offset-2 ring-primary/20'
      )}
    >
      {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
      <span className={cn('font-semibold', large ? 'text-base' : 'text-sm')}>{label}</span>
    </button>
  )
}

function StatCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string
  value: string
  icon: React.ReactNode
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{title}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  )
}
