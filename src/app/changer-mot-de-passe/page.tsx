/**
 * Forced password change page (/changer-mot-de-passe).
 *
 * Used in two cases:
 *  1. New agent created with a temporary password (mustChangePassword=true).
 *  2. Admin reset an agent's password.
 *
 * Flow:
 *  - Verify session has mustChangePassword=true (or just signed in).
 *  - User submits: currentPassword, newPassword, confirmNewPassword.
 *  - Server validates currentPassword against stored hash.
 *  - Server validates newPassword strength.
 *  - Server hashes newPassword (bcrypt cost 12), updates user.
 *  - Sets mustChangePassword=false.
 *  - Updates the JWT (via `update` trigger) so middleware lets through.
 *  - Redirects to role-based home.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, ShieldAlert } from 'lucide-react'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { update } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (next !== confirm) {
      setError('The new password and confirmation do not match.')
      return
    }
    if (current === next) {
      setError('The new password must be different from the temporary one.')
      return
    }

    setBusy(true)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    setBusy(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Unable to change password. Please try again.')
      return
    }

    // Update JWT so middleware no longer forces this route.
    await update({ mustChangePassword: false })
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-3 shadow-sm">
            <ShieldAlert className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Set your password</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Your account was issued a temporary password. Set a new one to continue.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Change password</CardTitle>
            <CardDescription>
              Choose a strong password. You will use it for all future sign-ins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current (temporary) password</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters, with one uppercase, one lowercase, and one digit.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Cannot change password</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save and continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
