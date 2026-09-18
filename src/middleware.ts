/**
 * Edge-compatible middleware for route protection + role-based redirects.
 *
 * Runs on every navigation. Uses the NextAuth JWT (no DB hit).
 *
 * Rules:
 *  - Unauthenticated → /connexion (for any protected route)
 *  - Authenticated + mustChangePassword + not on /changer-mot-de-passe → /changer-mot-de-passe
 *  - Authenticated + ADMIN + tries /agent/* → /admin/dashboard
 *  - Authenticated + SURVEY_AGENT + tries /admin/* → /agent/dashboard
 *  - Authenticated on /connexion → role-based home
 *  - Authenticated on / → role-based home
 *
 * DB-level revalidation (active, mustChangePassword) ALSO happens in
 * requireUser()/requireUserApi() — never rely solely on middleware.
 */

import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any
    const path = req.nextUrl.pathname
    const role: string | undefined = token?.role
    const mustChange = !!token?.mustChangePassword

    // If logged in but must change password, force to /changer-mot-de-passe.
    if (mustChange && path !== '/changer-mot-de-passe' && !path.startsWith('/api/auth/')) {
      return NextResponse.redirect(new URL('/changer-mot-de-passe', req.url))
    }

    // On login page or root: route to role home (unless must change password).
    if (path === '/connexion' || path === '/') {
      if (mustChange) {
        return NextResponse.redirect(new URL('/changer-mot-de-passe', req.url))
      }
      if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin/dashboard', req.url))
      if (role === 'SURVEY_AGENT') return NextResponse.redirect(new URL('/agent/dashboard', req.url))
    }

    // Cross-role protection: agent trying to hit admin routes
    if (path.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/agent/dashboard', req.url))
    }
    // Admin trying to hit agent routes
    if (path.startsWith('/agent') && role !== 'SURVEY_AGENT') {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // If there's a token, we always proceed; middleware itself decides
      // whether to redirect. If no token, only allow public routes.
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
  // Protect everything except Next internals, static assets, and the realtime
  // gateway path (handled separately via mini-service).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt).*)'],
}
