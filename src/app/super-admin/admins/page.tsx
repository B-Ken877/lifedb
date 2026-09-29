/**
 * Super-admin Admins page.
 *
 * - Lists all ADMIN users with their assigned business.
 * - "Add Admin" dialog (calls /api/super-admin/admins POST).
 *   On success: shows the generated temporary password ONCE (with copy button).
 * - Row actions: edit (name/email/username), reset password.
 *
 * Client component — the page lives under /super-admin/admins. The layout
 * already enforces the SUPER_ADMIN session guard.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Plus, Loader2, Search, Copy, Check, UserCog, Pencil, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

interface AdminUser {
  id: string
  name: string
  username: string
  email: string
  active: boolean
  mustChangePassword: boolean
  isProtected: boolean
  createdAt: string
  business: { id: string; name: string; slug: string; active: boolean } | null
}

interface BusinessLite {
  id: string
  name: string
  slug: string
  active: boolean
}

export default function SuperAdminAdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[] | null>(null)
  const [businesses, setBusinesses] = useState<BusinessLite[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const fetchAdmins = useCallback(async () => {
    const res = await fetch('/api/super-admin/admins', { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setAdmins(j.admins)
    }
  }, [])

  const fetchBusinesses = useCallback(async () => {
    const res = await fetch('/api/super-admin/businesses', { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setBusinesses(j.businesses)
    }
  }, [])

  useEffect(() => {
    fetchAdmins()
    fetchBusinesses()
  }, [fetchAdmins, fetchBusinesses])

  const filtered = (admins ?? []).filter((a) => {
    const q = search.toLowerCase()
    return (
      a.name.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.business?.name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Admins</h1>
          <p className="text-sm text-muted-foreground">Business-level admin accounts.</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button disabled={businesses.length === 0}>
              <Plus className="h-4 w-4 mr-2" /> Add Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <AddAdminForm
              businesses={businesses.filter((b) => b.active)}
              onCreated={() => {
                setShowAdd(false)
                fetchAdmins()
              }}
              refreshAdminsSilently={fetchAdmins}
            />
          </DialogContent>
        </Dialog>
      </div>

      {businesses.length === 0 && (
        <Alert>
          <AlertTitle>No businesses available</AlertTitle>
          <AlertDescription>
            Create at least one business in the Businesses tab before adding tenant admins.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All tenant admins</CardTitle>
              <CardDescription>{admins?.length ?? '—'} total</CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, username, or business…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {admins === null ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {admins.length === 0
                ? 'No tenant admins yet. Click "Add Admin" to create the first one.'
                : 'No admins match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Admin</th>
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium text-foreground">{a.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.username} · {a.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {a.business ? (
                          <div>
                            <div className="font-medium">{a.business.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{a.business.slug}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No business</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.active ? (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                              Inactive
                            </Badge>
                          )}
                          {a.mustChangePassword && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              Must change pw
                            </Badge>
                          )}
                          {a.isProtected && (
                            <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                              Protected
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <EditAdminButton admin={a} onDone={fetchAdmins} />
                          <ResetPasswordButton admin={a} onDone={fetchAdmins} />
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

function AddAdminForm({
  businesses,
  onCreated,
  refreshAdminsSilently,
}: {
  businesses: BusinessLite[]
  onCreated: () => void
  refreshAdminsSilently: () => void
}) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{
    tempPassword: string
    username: string
    name: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const body: Record<string, unknown> = { name, username, email, businessId }
      if (password.trim().length > 0) body.password = password
      const res = await fetch('/api/super-admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to create admin.')
        return
      }
      setCreated({
        tempPassword: json.temporaryPassword,
        username: json.admin.username,
        name: json.admin.name,
      })
      toast.success('Admin account created.')
      refreshAdminsSilently()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            <UserCog className="inline h-5 w-5 mr-2" />
            Admin created
          </DialogTitle>
          <DialogDescription>
            Provide these credentials to {created.name}. They must change the password on first login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <div>
              <span className="text-xs text-muted-foreground">Username:</span>{' '}
              <span className="font-mono text-sm">{created.username}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Temporary password:</span>{' '}
              <span className="font-mono text-sm font-semibold">{created.tempPassword}</span>
            </div>
          </div>
          <Alert>
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              This temporary password is shown only once. Copy it now and share it securely. The admin
              will be forced to change it on first login.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              navigator.clipboard.writeText(
                `Username: ${created.username}\nTemporary password: ${created.tempPassword}`
              )
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied' : 'Copy credentials'}
          </Button>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setCreated(null)
              setName('')
              setUsername('')
              setEmail('')
              setBusinessId('')
              setPassword('')
              onCreated()
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <UserCog className="inline h-5 w-5 mr-2" />
          Add Tenant Admin
        </DialogTitle>
        <DialogDescription>
          A temporary password will be generated automatically unless you provide one. The admin must
          change it on first login.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="a-name">Full name</Label>
          <Input id="a-name" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="a-user">Username</Label>
            <Input
              id="a-user"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-email">Email</Label>
            <Input
              id="a-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-biz">Business</Label>
          <Select value={businessId} onValueChange={setBusinessId} required>
            <SelectTrigger id="a-biz">
              <SelectValue placeholder="Select a business…" />
            </SelectTrigger>
            <SelectContent>
              {businesses.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-pw">Temporary password (optional)</Label>
          <Input
            id="a-pw"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder="Leave blank to auto-generate"
          />
          <p className="text-xs text-muted-foreground">
            Min 8 chars, at least one uppercase, one lowercase, one digit.
          </p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="submit" disabled={busy || !businessId}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create admin
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function EditAdminButton({ admin, onDone }: { admin: AdminUser; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(admin.name)
  const [username, setUsername] = useState(admin.username)
  const [email, setEmail] = useState(admin.email)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to update admin.')
        return
      }
      toast.success('Admin updated.')
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
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit admin</DialogTitle>
          <DialogDescription>
            Update name, email, or username. Password cannot be changed here — use the reset-password action.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="e-name">Full name</Label>
            <Input id="e-name" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-user">Username</Label>
              <Input
                id="e-user"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-email">Email</Label>
              <Input
                id="e-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
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

function ResetPasswordButton({ admin, onDone }: { admin: AdminUser; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ tempPassword: string; username: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const confirm = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/admins/${admin.id}/reset-password`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to reset password.')
        return
      }
      setResult({ tempPassword: json.temporaryPassword, username: json.username })
      toast.success('Password reset. New temp password generated.')
      onDone()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setOpen(false)
    setResult(null)
    setError(null)
    setCopied(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) close() }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Password reset</DialogTitle>
              <DialogDescription>
                Provide this new temporary password to {admin.name}. They must change it on next login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <div>
                  <span className="text-xs text-muted-foreground">Username:</span>{' '}
                  <span className="font-mono text-sm">{result.username}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">New temporary password:</span>{' '}
                  <span className="font-mono text-sm font-semibold">{result.tempPassword}</span>
                </div>
              </div>
              <Alert>
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  This password is shown only once. Copy it now and share it securely.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Username: ${result.username}\nTemporary password: ${result.tempPassword}`
                  )
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy credentials'}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset admin password?</DialogTitle>
              <DialogDescription>
                A new temporary password will be generated for <strong>{admin.name}</strong> ({admin.username}).
                They will be forced to change it on next login. The previous password will stop working immediately.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirm} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset password
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
