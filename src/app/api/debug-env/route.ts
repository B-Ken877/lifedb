import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DATABASE_URL_length: process.env.DATABASE_URL?.length ?? 0,
    DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 30) ?? '(not set)',
    DIRECT_URL_set: !!process.env.DIRECT_URL,
    DIRECT_URL_length: process.env.DIRECT_URL?.length ?? 0,
    AUTH_SECRET_set: !!process.env.AUTH_SECRET,
    AUTH_SECRET_length: process.env.AUTH_SECRET?.length ?? 0,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? '(not set)',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '(not set)',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL ?? '(not on vercel)',
    VERCEL_ENV: process.env.VERCEL_ENV ?? '(not on vercel)',
  })
}
