/**
 * Login page (/connexion).
 *
 * - Identifiers: username OR email (case-insensitive).
 * - On submit: calls NextAuth credentials signin.
 * - On success: client routes to / (where middleware takes over).
 * - Shows server-side auth errors (NextAuth's `error` query param) and
 *   client-side form errors.
 *
 * Visual identity:
 *  - No marketing copy.
 *  - Centered card on a muted background.
 *  - Clear "Clock-Now / Timekeeping Platform" wordmark.
 *  - High-contrast submit button, accessible labels, keyboard-navigable.
 */

'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const errParam = params.get('error')

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(errParam ? 'Invalid credentials.' : null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await signIn('credentials', {
      identifier,
      password,
      redirect: false,
    })
    setSubmitting(false)
    if (!res || res.error) {
      setError('Invalid credentials. Please verify your username/email and password.')
      return
    }
    // CRITICAL: Use a full-page navigation (not router.push) so the
    // middleware on the Edge runtime sees the freshly-set session cookie.
    // router.push + router.refresh does NOT reliably transmit the
    // next-auth.session-token cookie in Next.js 16's Turbopack dev server.
    // A hard navigation forces the browser to send the cookie on the
    // very next request, which is what middleware needs.
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 px-4 safe-area-top safe-area-bottom">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Clock-Now</h1>
          <p className="text-sm text-muted-foreground mt-1">Timekeeping Platform</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>
              Enter your assigned credentials to access the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Username or Email</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. jdupont or jdupont@lifedreambig.local"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    placeholder="••••••••"
                    className="h-12 text-base pr-11"
                  />
                  <LockKeyhole className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-12 text-base" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground px-4">
          Internal use only. Accounts are created by an administrator.
        </p>
      </div>
    </div>
  )
}

export default function ConnexionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  )
}
