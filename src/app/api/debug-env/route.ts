import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: { select: { name: true } },
        active: true,
        passwordHash: true,
      },
    })

    // Test password verification for each user
    const tests = await Promise.all(
      users.map(async (u) => {
        const match1 = await bcrypt.compare('wordpa$$123', u.passwordHash)
        const match2 = await bcrypt.compare('ChangeMe!2025', u.passwordHash)
        return {
          email: u.email,
          username: u.username,
          role: u.role.name,
          active: u.active,
          hashPrefix: u.passwordHash.slice(0, 25),
          matches_wordpa: match1,
          matches_ChangeMe: match2,
        }
      })
    )

    return NextResponse.json({
      DATABASE_URL_set: !!process.env.DATABASE_URL,
      DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 50),
      userCount: users.length,
      users: tests,
    })
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
      DATABASE_URL_set: !!process.env.DATABASE_URL,
      DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 50),
    }, { status: 500 })
  }
}
