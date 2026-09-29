import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    // Raw env vars (what Vercel set)
    DATABASE_URL_raw: process.env.DATABASE_URL?.slice(0, 40) ?? '(not set)',
    DATABASE_URL_POSTGRES_PRISMA_URL_set: !!process.env.DATABASE_URL_POSTGRES_PRISMA_URL,
    DATABASE_URL_POSTGRES_PRISMA_URL_prefix: process.env.DATABASE_URL_POSTGRES_PRISMA_URL?.slice(0, 40) ?? '(not set)',
    DATABASE_URL_POSTGRES_URL_NON_POOLING_set: !!process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING,
    DIRECT_URL_raw: process.env.DIRECT_URL?.slice(0, 40) ?? '(not set)',
    AUTH_SECRET_set: !!process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? '(not set)',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '(not set)',
    VERCEL_URL: process.env.VERCEL_URL ?? '(not set)',
    VERCEL_ENV: process.env.VERCEL_ENV ?? '(not on vercel)',
  })
}
