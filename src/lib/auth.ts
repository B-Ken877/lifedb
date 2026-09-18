/**
 * NextAuth configuration (Credentials provider, JWT strategy).
 *
 * Design choices:
 *  - JWT strategy (not DB sessions) so it works on Vercel serverless.
 *  - The session token never carries the password hash. It only carries:
 *    userId, role, mustChangePassword, name, email, username.
 *  - On every request, middleware + route guards check role server-side.
 *  - "mustChangePassword" is propagated into the JWT so middleware can force
 *    the password-change route without hitting the DB on every page nav.
 */

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  // JWT strategy works on Vercel serverless without external session stores.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 }, // 12h
  jwt: { maxAge: 60 * 60 * 12 },
  pages: {
    signIn: '/connexion',
    error: '/connexion',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Username or Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null
        const identifier = credentials.identifier.trim().toLowerCase()

        const user = await db.user.findFirst({
          where: {
            OR: [{ email: identifier }, { username: identifier }],
          },
          include: { role: true },
        })

        if (!user) return null
        if (!user.active) return null

        const ok = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!ok) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.name,
          username: user.username,
          employeeId: user.employeeId,
          mustChangePassword: user.mustChangePassword,
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in
      if (user) {
        const u = user as any
        token.userId = u.id
        token.role = u.role
        token.username = u.username
        token.employeeId = u.employeeId
        token.mustChangePassword = u.mustChangePassword
      }

      // Allow client-initiated session update (after password change).
      // Only honor mustChangePassword from session update — never role/userId.
      if (trigger === 'update' && session) {
        if (typeof session.mustChangePassword === 'boolean') {
          token.mustChangePassword = session.mustChangePassword
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.userId as string
        ;(session.user as any).role = token.role as string
        ;(session.user as any).username = token.username as string
        ;(session.user as any).employeeId = token.employeeId as string
        ;(session.user as any).mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    },
  },
  // AUTH_SECRET is read automatically from env.
  secret: process.env.AUTH_SECRET,
}

export type AppSession = {
  user: {
    id: string
    name: string
    email: string
    username: string
    employeeId: string
    role: 'ADMIN' | 'SURVEY_AGENT'
    mustChangePassword: boolean
  }
}
