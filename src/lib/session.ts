/**
 * Server-side session + role guards.
 *
 * NEVER trust client-provided role/userId/businessId. Every protected
 * page/API must call the appropriate require* function.
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
  employeeId: string | null
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SURVEY_AGENT'
  businessId: string | null
  businessName: string | null
  mustChangePassword: boolean
}

/**
 * Returns the authenticated user or null. Does NOT redirect.
 */
export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  const s = await getSession()
  if (!s?.user) return null
  return s.user
}

/**
 * Requires an authenticated user. If absent, redirects to /connexion.
 * If mustChangePassword, redirects to /changer-mot-de-passe.
 * If deactivated server-side, treats session as invalid.
 */
export async function requireUser(opts?: { allowMustChange?: boolean }): Promise<AuthenticatedUser> {
  const s = await getSession()
  if (!s?.user) redirect('/connexion')

  const active = await db.user.findFirst({
    where: { id: s.user.id },
    select: {
      id: true,
      active: true,
      mustChangePassword: true,
      roleId: true,
      role: { select: { name: true } },
      businessId: true,
      business: { select: { name: true } },
    },
  })
  if (!active || !active.active) {
    redirect('/api/auth/signout?csrf=true')
  }

  const user: AuthenticatedUser = {
    id: s.user.id,
    name: s.user.name,
    email: s.user.email,
    username: s.user.username,
    employeeId: s.user.employeeId,
    role: active.role.name as AuthenticatedUser['role'],
    businessId: active.businessId,
    businessName: active.business?.name ?? null,
    mustChangePassword: active.mustChangePassword,
  }

  if (user.mustChangePassword && !opts?.allowMustChange) {
    redirect('/changer-mot-de-passe')
  }

  return user
}

/**
 * Requires an ADMIN user. Returns the user with businessId populated.
 * Admins MUST have a businessId — super admins use requireSuperAdmin.
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const u = await requireUser()
  if (u.role !== 'ADMIN') {
    redirect(u.role === 'SUPER_ADMIN' ? '/super-admin/dashboard' : '/agent/dashboard')
  }
  if (!u.businessId) {
    redirect('/super-admin/dashboard')
  }
  return u
}

/**
 * Requires a SURVEY_AGENT user.
 */
export async function requireAgent(): Promise<AuthenticatedUser> {
  const u = await requireUser()
  if (u.role !== 'SURVEY_AGENT') {
    redirect(u.role === 'SUPER_ADMIN' ? '/super-admin/dashboard' : '/admin/dashboard')
  }
  return u
}

/**
 * Requires a SUPER_ADMIN user (platform owner).
 */
export async function requireSuperAdmin(): Promise<AuthenticatedUser> {
  const u = await requireUser()
  if (u.role !== 'SUPER_ADMIN') {
    redirect(u.role === 'ADMIN' ? '/admin/dashboard' : '/agent/dashboard')
  }
  return u
}

// =====================================================
// API route guards (return Response on failure)
// =====================================================

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mustChangePasswordResponse(): Response {
  return new Response(JSON.stringify({ error: 'MUST_CHANGE_PASSWORD' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function requireUserApi(opts?: { allowMustChange?: boolean }): Promise<AuthenticatedUser | Response> {
  const s = await getSession()
  if (!s?.user) return unauthorized()
  const active = await db.user.findFirst({
    where: { id: s.user.id },
    select: {
      id: true,
      active: true,
      mustChangePassword: true,
      role: { select: { name: true } },
      businessId: true,
      business: { select: { name: true } },
    },
  })
  if (!active || !active.active) return unauthorized()
  const user: AuthenticatedUser = {
    id: s.user.id,
    name: s.user.name,
    email: s.user.email,
    username: s.user.username,
    employeeId: s.user.employeeId,
    role: active.role.name as AuthenticatedUser['role'],
    businessId: active.businessId,
    businessName: active.business?.name ?? null,
    mustChangePassword: active.mustChangePassword,
  }
  if (user.mustChangePassword && !opts?.allowMustChange) {
    return mustChangePasswordResponse()
  }
  return user
}

export async function requireAdminApi(): Promise<AuthenticatedUser | Response> {
  const r = await requireUserApi()
  if (r instanceof Response) return r
  if (r.role !== 'ADMIN') return forbidden()
  if (!r.businessId) return forbidden()
  return r
}

export async function requireAgentApi(): Promise<AuthenticatedUser | Response> {
  const r = await requireUserApi()
  if (r instanceof Response) return r
  if (r.role !== 'SURVEY_AGENT') return forbidden()
  return r
}

export async function requireSuperAdminApi(): Promise<AuthenticatedUser | Response> {
  const r = await requireUserApi()
  if (r instanceof Response) return r
  if (r.role !== 'SUPER_ADMIN') return forbidden()
  return r
}
