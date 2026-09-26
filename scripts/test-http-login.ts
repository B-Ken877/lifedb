// Test login end-to-end against the running dev server.
// Usage: bun run scripts/test-http-login.ts

const BASE = 'http://localhost:3000'

async function main() {
  // 1. Get CSRF token
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  console.log('CSRF:', csrfToken.slice(0, 20) + '...')

  // 2. Extract set-cookie from CSRF response (NextAuth sets a csrf cookie)
  const cookies = csrfRes.headers.getSetCookie?.() ?? []
  const cookieHeader = cookies.map((c: string) => c.split(';')[0]).join('; ')
  console.log('Cookies from CSRF:', cookieHeader)

  // 3. POST to credentials callback
  // IMPORTANT: the password is wordpa$$123 — use String() to prevent any
  // template-literal interpolation.
  const password = 'wordpa' + '$$' + '123'
  console.log('Password:', JSON.stringify(password), 'length:', password.length)

  const body = new URLSearchParams({
    csrfToken,
    identifier: 'bken',
    password,
    json: 'true',
  })

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
    },
    body: body.toString(),
    redirect: 'manual',
  })

  console.log('Login status:', loginRes.status)
  console.log('Login location:', loginRes.headers.get('location'))
  const loginCookies = loginRes.headers.getSetCookie?.() ?? []
  console.log('Login set-cookie count:', loginCookies.length)
  const allCookies = [...cookies, ...loginCookies].map((c: string) => c.split(';')[0]).join('; ')

  // 4. Check session
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: allCookies },
  })
  const session = await sessionRes.json()
  console.log('Session:', JSON.stringify(session, null, 2))

  if (session?.user) {
    console.log('\n✅ LOGIN SUCCESS')
    console.log('   user:', session.user.name)
    console.log('   role:', session.user.role)
    console.log('   → will redirect to:', session.user.role === 'ADMIN' ? '/admin/dashboard' : '/agent/dashboard')
  } else {
    console.log('\n❌ LOGIN FAILED — no session created')
  }
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
