import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DATABASE_URL_length: process.env.DATABASE_URL?.length ?? 0,
    DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 50) ?? '(not set)',
    POSTGRES_PRISMA_URL_set: !!process.env.POSTGRES_PRISMA_URL,
    POSTGRES_PRISMA_URL_prefix: process.env.POSTGRES_PRISMA_URL?.slice(0, 50) ?? '(not set)',
    POSTGRES_URL_NON_POOLING_set: !!process.env.POSTGRES_URL_NON_POOLING,
    DIRECT_URL_set: !!process.env.DIRECT_URL,
    DIRECT_URL_length: process.env.DIRECT_URL?.length ?? 0,
    AUTH_SECRET_set: !!process.env.AUTH_SECRET,
    VERCEL_ENV: process.env.VERCEL_ENV ?? '(not on vercel)',
  })
}
