/**
 * Super-admin Businesses page.
 *
 * - Lists all businesses (owner admin + agent count + active flag).
 * - "Add Business" dialog (calls /api/super-admin/businesses POST).
 * - Row actions: rename (PATCH), deactivate (DELETE).
 *
 * Client component — the page lives under /super-admin/businesses.
 * The layout already enforces the SUPER_ADMIN session guard, so this
 * component can assume the caller is authorized.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, Loader2, Search, Building2, Pencil, Power } from 'lucide-react'
import { toast } from 'sonner'

interface Business {
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

export default function SuperAdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[] | null>(null)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const fetchBusinesses = useCallback(async () => {
    const res = await fetch('/api/super-admin/businesses', { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setBusinesses(j.businesses)
    }
  }, [])

  useEffect(() => {
    fetchBusinesses()
  }, [fetchBusinesses])

  const filtered = (businesses ?? []).filter((b) => {
    const q = search.toLowerCase()
    return (
      b.name.toLowerCase().includes(q) ||
      b.slug.toLowerCase().includes(q) ||
      (b.ownerAdmin?.name ?? '').toLowerCase().includes(q) ||
      (b.ownerAdmin?.email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">Tenants on the Clock-Now platform.</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Business
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <AddBusinessForm
              onCreated={() => {
                setShowAdd(false)
                fetchBusinesses()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All businesses</CardTitle>
              <CardDescription>{businesses?.length ?? '—'} total</CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, slug, or owner…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {businesses === null ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {businesses.length === 0
                ? 'No businesses yet. Click "Add Business" to create the first one.'
                : 'No businesses match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Owner Admin</th>
                    <th className="px-3 py-2 font-medium text-right">Agents</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium text-foreground">{b.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{b.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {b.ownerAdmin ? (
                          <div>
                            <div className="font-medium">{b.ownerAdmin.name}</div>
                            <div className="text-xs text-muted-foreground">{b.ownerAdmin.email}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unassigned</span>
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
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <RenameBusinessButton business={b} onDone={fetchBusinesses} />
                          {b.active && <DeactivateBusinessButton business={b} onDone={fetchBusinesses} />}
                        </div>
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

function AddBusinessForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/super-admin/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to create business.')
        return
      }
      toast.success(`Business "${json.business.name}" created.`)
      setName('')
      onCreated()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <Plus className="inline h-5 w-5 mr-2" />
          Add Business
        </DialogTitle>
        <DialogDescription>
          A new tenant on the Clock-Now platform. You can assign an admin from the Admins tab after creation.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="name">Business name</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g., Life Dream BIG"
          />
          <p className="text-xs text-muted-foreground">A URL-friendly slug will be generated automatically.</p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create business
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function RenameBusinessButton({ business, onDone }: { business: Business; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(business.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to update business.')
        return
      }
      toast.success('Business updated.')
      setOpen(false)
      onDone()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Rename">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename business</DialogTitle>
          <DialogDescription>
            Updating the name will also regenerate the slug. This does not affect any users or attendance data.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="rename-name">New name</Label>
            <Input
              id="rename-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeactivateBusinessButton({ business, onDone }: { business: Business; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/businesses/${business.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to deactivate business.')
        return
      }
      toast.success(`Business "${business.name}" deactivated.`)
      setOpen(false)
      onDone()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Deactivate">
          <Power className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate business?</DialogTitle>
          <DialogDescription>
            The business <strong>{business.name}</strong> will be marked inactive. Its users will be unable
            to sign in. The record is preserved for the audit trail and can be reactivated later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Alert>
            <AlertDescription>
              The business currently has <strong>{business.agentCount} agent(s)</strong>. If any are still
              active, deactivation will be refused until they are deactivated or reassigned.
            </AlertDescription>
          </Alert>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
