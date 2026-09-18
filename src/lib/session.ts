/**
 * Server-side session + role guards.
 *
 * NEVER trust client-provided role/userId. Every protected page/API must
 * call `requireUser(...)`, `requireAdmin(...)`, or `requireAgent(...)`.
 */

import { getServerSession } from 'next-auth'
import { authOptions, type AppSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'

export async function getSession(): Promise<AppSession | null> {
  const s = await getServerSession(authOptions)
  return (s as AppSession | null) ?? null
}

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  username: string
  employeeId: string
  role: 'ADMIN' | 'SURVEY_AGENT'
  mustChangePassword: boolean
}

/**
 * Returns the authenticated user or null. Does NOT redirect.
 * Use this on public routes.
 */
export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  const s = await getSession()
  if (!s?.user) return null
  return s.user
}

/**
 * Requires an authenticated user. If absent, redirects to /connexion.
 * If the user must change their password, redirects to /changer-mot-de-passe
 * (unless already there). If the user is deactivated server-side (active=false),
 * the session is treated as invalid.
 */
export async function requireUser(opts?: { allowMustChange?: boolean }): Promise<AuthenticatedUser> {
  const s = await getSession()
  if (!s?.user) redirect('/connexion')

  // Server-side revalidation: is the user still active?
  // We use a lightweight count query to avoid loading sensitive fields.
  const active = await db.user.findFirst({
    where: { id: s.user.id },
    select: { id: true, active: true, mustChangePassword: true, roleId: true, role: { select: { name: true } } },
  })
  if (!active || !active.active) {
    // Force sign-out by redirecting to login.
    redirect('/api/auth/signout?csrf=true')
  }

  // Re-read mustChangePassword from DB in case admin reset it after login.
  const user: AuthenticatedUser = {
    id: s.user.id,
    name: s.user.name,
    email: s.user.email,
    username: s.user.username,
    employeeId: s.user.employeeId,
    role: active.role.name as 'ADMIN' | 'SURVEY_AGENT',
    mustChangePassword: active.mustChangePassword,
  }

  if (user.mustChangePassword && !opts?.allowMustChange) {
    redirect('/changer-mot-de-passe')
  }

  return user
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const u = await requireUser()
  if (u.role !== 'ADMIN') redirect('/agent/dashboard')
  return u
}

export async function requireAgent(): Promise<AuthenticatedUser> {
  const u = await requireUser()
  if (u.role !== 'SURVEY_AGENT') redirect('/admin/dashboard')
  return u
}

/**
 * For API routes: returns the user, or throws a 401 response.
 * Use inside try/catch and return the response if it's a Response.
 */
export async function requireUserApi(opts?: { allowMustChange?: boolean }): Promise<AuthenticatedUser | Response> {
  const s = await getSession()
  if (!s?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const active = await db.user.findFirst({
    where: { id: s.user.id },
    select: { id: true, active: true, mustChangePassword: true, role: { select: { name: true } } },
  })
  if (!active || !active.active) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const user: AuthenticatedUser = {
    id: s.user.id,
    name: s.user.name,
    email: s.user.email,
    username: s.user.username,
    employeeId: s.user.employeeId,
    role: active.role.name as 'ADMIN' | 'SURVEY_AGENT',
    mustChangePassword: active.mustChangePassword,
  }
  if (user.mustChangePassword && !opts?.allowMustChange) {
    return new Response(JSON.stringify({ error: 'MUST_CHANGE_PASSWORD' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}

export async function requireAdminApi(): Promise<AuthenticatedUser | Response> {
  const r = await requireUserApi()
  if (r instanceof Response) return r
  if (r.role !== 'ADMIN') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return r
}

export async function requireAgentApi(): Promise<AuthenticatedUser | Response> {
  const r = await requireUserApi()
  if (r instanceof Response) return r
  if (r.role !== 'SURVEY_AGENT') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return r
}
