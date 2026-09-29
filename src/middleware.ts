/**
 * Edge-compatible middleware for route protection + role-based redirects.
 *
 * Clock-Now has 3 roles:
 *  - SUPER_ADMIN → /super-admin/*
 *  - ADMIN → /admin/*
 *  - SURVEY_AGENT → /agent/*
 */

import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any
    const path = req.nextUrl.pathname
    const role: string | undefined = token?.role
    const mustChange = !!token?.mustChangePassword

    // Force password change
    if (mustChange && path !== '/changer-mot-de-passe' && !path.startsWith('/api/auth/')) {
      return NextResponse.redirect(new URL('/changer-mot-de-passe', req.url))
    }

    // Role-based home redirect (on /connexion or /)
    if (path === '/connexion' || path === '/') {
      if (mustChange) return NextResponse.redirect(new URL('/changer-mot-de-passe', req.url))
      if (role === 'SUPER_ADMIN') return NextResponse.redirect(new URL('/super-admin/dashboard', req.url))
      if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin/dashboard', req.url))
      if (role === 'SURVEY_AGENT') return NextResponse.redirect(new URL('/agent/dashboard', req.url))
    }

    // Cross-role protection
    if (path.startsWith('/super-admin') && role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL(role === 'ADMIN' ? '/admin/dashboard' : '/agent/dashboard', req.url))
    }
    if (path.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL(role === 'SUPER_ADMIN' ? '/super-admin/dashboard' : '/agent/dashboard', req.url))
    }
    if (path.startsWith('/agent') && role !== 'SURVEY_AGENT') {
      return NextResponse.redirect(new URL(role === 'SUPER_ADMIN' ? '/super-admin/dashboard' : '/admin/dashboard', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        const isPublic =
          path === '/connexion' ||
          path.startsWith('/api/auth/') ||
          path === '/changer-mot-de-passe'
        if (isPublic) return true
        return !!token
      },
    },
  }
)

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt).*)'],
}
