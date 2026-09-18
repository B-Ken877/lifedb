/**
 * Admin settings page.
 *
 * - Shows/edits the default hourly rate (used when an employee has no compensation record).
 * - Read-only display of business timezone.
 *
 * Settings are stored in the Setting table (key/value).
 */

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminSettingsPage() {
  const [defaultRate, setDefaultRate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          setDefaultRate(j.defaultHourlyRate ?? '5.00')
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultHourlyRate: parseFloat(defaultRate) }),
      })
      if (!res.ok) {
        toast.error('Failed to save.')
        return
      }
      toast.success('Settings updated.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Company-wide configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compensation</CardTitle>
          <CardDescription>
            The default hourly rate is used for employees who have no compensation record yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Label>Default hourly rate (USD)</Label>
              <Input disabled placeholder="Loading…" />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Default hourly rate (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Affects future calculations only. Historical rates are preserved in compensation records.
              </p>
            </div>
          )}
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timezone</CardTitle>
          <CardDescription>The business timezone used for all attendance calculations and displays.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <span className="font-mono">America/New_York</span> (Eastern Time)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Automatically handles EST ↔ EDT DST transitions. All times shown to users are in this timezone.
            Database stores UTC.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Realtime service</CardTitle>
          <CardDescription>Used for live admin dashboard updates.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Endpoint: <span className="font-mono text-xs">{process.env.NEXT_PUBLIC_REALTIME_URL || '/?XTransformPort=3003 (via Caddy)'}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Falls back to 15-second polling if the realtime service is unavailable.
            Database remains the source of truth.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
