/**
 * NextAuth configuration (Credentials provider, JWT strategy).
 *
 * Clock-Now multi-tenant: the JWT carries userId, role, businessId,
 * and mustChangePassword. The businessId is used to scope all admin
 * queries so an admin can never see another business's data.
 */

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
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
          include: { role: true, business: true },
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
          businessId: user.businessId,
          businessName: user.business?.name ?? null,
          mustChangePassword: user.mustChangePassword,
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as any
        token.userId = u.id
        token.role = u.role
        token.username = u.username
        token.employeeId = u.employeeId
        token.businessId = u.businessId
        token.businessName = u.businessName
        token.mustChangePassword = u.mustChangePassword
      }

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
        ;(session.user as any).businessId = token.businessId as string | null
        ;(session.user as any).businessName = token.businessName as string | null
        ;(session.user as any).mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    },
  },
  secret: process.env.AUTH_SECRET,
}

export type AppSession = {
  user: {
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
}
