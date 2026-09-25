# LIFE DREAM BIG — Clocking System

A production-grade internal employee timekeeping platform. Tracks agent clock-in/out, breaks, attendance history, payroll estimates, correction requests, and audit logs — built for a company operating on **Eastern Time (America/New_York)**.

> **No landing page. No public homepage. No public registration.** The app starts at `/connexion` and routes authenticated users to either `/agent/dashboard` or `/admin/dashboard` based on role.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `output: "standalone"`) |
| Language | TypeScript 5 (strict — `ignoreBuildErrors: false`) |
| Auth | NextAuth v4 (JWT strategy, credentials provider, bcrypt cost 12) |
| Database | **PostgreSQL** (Neon / Supabase / Railway / Vercel Postgres) |
| ORM | Prisma 6 |
| UI | Tailwind CSS 4 + shadcn/ui |
| Charts | Recharts |
| Realtime | Socket.io mini-service (port 3003 — separate long-lived process) |
| Money | Integer cents (no float error) |
| Timezone | `America/New_York` via `date-fns-tz` |

## Architecture

```
src/
├─ app/
│  ├─ page.tsx               ← root: redirects by role
│  ├─ connexion/             ← login
│  ├─ changer-mot-de-passe/  ← forced password change
│  ├─ agent/                 ← agent area (dashboard, attendance, corrections, profile)
│  └─ admin/                 ← admin area (dashboard, employees, attendance, corrections, payroll, reports, audit, settings)
├─ api/
│  ├─ auth/                  ← NextAuth + change-password
│  ├─ agent/                 ← clock, attendance, corrections, CSV export
│  └─ admin/                 ← dashboard, employees, corrections, payroll, attendance, events, settings, audit
├─ components/
│  ├─ agent/                 ← agent-specific UI
│  ├─ admin/                 ← admin-specific UI
│  └─ ui/                    ← shadcn/ui
├─ lib/
│  ├─ auth.ts                ← NextAuth config
│  ├─ session.ts             ← requireAdmin / requireAgent (server + API)
│  ├─ audit.ts               ← audit log writer
│  ├─ password.ts           ← bcrypt + temp password + strength validation
│  ├─ timezone.ts            ← America/New_York helpers (DST-safe)
│  ├─ realtime-server.ts     ← HTTP bridge to socket.io mini-service
│  ├─ realtime-client.ts     ← React hook for admin dashboard
│  ├─ http.ts                ← safe query-param parsers (NaN-proof)
│  ├─ hardening.ts           ← global uncaughtException / unhandledRejection
│  ├─ csv/                   ← CSV builder + response helper (RFC 4180)
│  └─ attendance/
│     ├─ engine.ts           ← state machine + hours/pay calc (cents) + row lock
│     └─ queries.ts          ← DB access (today/week/month, payroll, history)
└─ middleware.ts             ← role-based route protection (edge)

mini-services/
└─ realtime-service/         ← socket.io server (port 3003, hardened)

prisma/
├─ schema.prisma             ← PostgreSQL schema (provider=postgresql)
├─ seed.ts                   ← idempotent: roles + admin + default settings
└─ migrations/
   └─ 0001_init/              ← initial Postgres migration

tests/
└─ attendance-engine.test.ts ← 52 tests (state machine, hours, money, DST, CSV)
```

## Core design principles

1. **Event ledger is the source of truth.** `AttendanceEvent` rows are append-mostly. Worked hours, breaks, and earnings are *derived* via the engine — never stored as editable fields.

2. **Money is in cents.** All earnings calculations use integer cents internally (`earningsCents = netHours × rate × 100`). Floating-point only at display time.

3. **Timezone-aware.** All events are stored in UTC, with a pre-computed `businessDate` (YYYY-MM-DD in `America/New_York`). DST transitions are handled automatically by `date-fns-tz` — never hardcode `UTC-5`.

4. **Server-side authorization everywhere.** Every protected page calls `requireUser/requireAdmin/requireAgent`. Every API route calls `requireUserApi/requireAdminApi/requireAgentApi`. The client never sends `userId`, `role`, `hourlyRate`, `hours`, or `earnings` — all resolved server-side from the session + DB. Admin mutations cannot target other admins (SURVEY_AGENT scope enforced).

5. **Audit trail.** Every meaningful mutation is recorded in `AuditLog` with actor, target, action, and JSON metadata. Records are append-only.

6. **Realtime is best-effort.** The admin dashboard subscribes to socket.io for live updates. If the connection drops, it falls back to 15-second polling. The DB is always the source of truth — realtime never writes data directly.

7. **Effective-dated compensation.** Hourly rate changes create new `CompensationRecord` rows; historical records are immutable. Past payroll calculations use the rate that was effective at the time.

8. **Process hardening.** `uncaughtException` / `unhandledRejection` are caught and logged but do not crash the process (one bad request must not take down the server). The realtime service has the same handlers + graceful socket shutdown.

9. **Concurrency-safe clock events.** `recordEvent` runs inside a Postgres transaction with `SELECT ... FOR UPDATE` on the user row — two concurrent CLOCK_IN calls for the same user serialize, the second sees WORKING and returns ALREADY_WORKING instead of creating a duplicate event.

10. **Atomic correction review.** The PENDING → APPROVED/REJECTED transition is a single conditional `updateMany({ where: { id, status: 'PENDING' } })` — two admins concurrently approving the same request cannot both create an `AttendanceEvent`.

## Local development

```bash
# 1. Install deps
bun install

# 2. Set up Postgres (local Docker or any cloud provider)
#    Then set DATABASE_URL and DIRECT_URL in .env

# 3. Apply migrations + seed
cp .env.example .env
# Edit .env to point DATABASE_URL at your Postgres instance
bun run db:migrate:deploy   # applies migrations/prisma/migrations/0001_init
bun run db:seed             # creates ADMIN role, SURVEY_AGENT role, default admin user

# 4. Start the realtime mini-service (separate terminal)
cd mini-services/realtime-service
bun install
bun run dev         # listens on port 3003

# 5. Start the Next.js dev server
bun run dev         # listens on port 3000
```

Default admin credentials (from `.env`):
- Email: `admin@lifedreambig.local`
- Password: `ChangeMe!2025`

## Tests

```bash
bun run typecheck    # tsc --noEmit (no ignoreBuildErrors)
bun run test         # bun test tests/
```

The test suite covers: state machine transitions, invalid transitions, hours calculations, break deductions, midnight crossovers, DST spring-forward / fall-back, money precision (cents), password strength, temp password generation, CSV escaping.

## Production deployment (Vercel)

### 1. Database (PostgreSQL — REQUIRED)

The Prisma schema mandates `provider = "postgresql"`. SQLite is NOT supported in any environment — the deployment scripts refuse to start without a real Postgres connection string.

Recommended providers: **Neon** (recommended — serverless Postgres with branching), Supabase, Railway, or Vercel Postgres.

1. Provision a Postgres database.
2. Set `DATABASE_URL` to the pooled connection string (PgBouncer / transaction mode).
3. Set `DIRECT_URL` to the direct connection string (used by `prisma migrate deploy`).
4. Apply migrations and seed:

```bash
bun run db:migrate:deploy
bun run db:seed
```

### 2. Realtime service (separate process — REQUIRED for live updates)

Vercel is serverless and cannot host the long-lived socket.io process. Deploy the realtime service separately:

- **Railway / Render / Fly.io / DigitalOcean App Platform**: deploy `mini-services/realtime-service/` as a Node/Bun service.
- Set `REALTIME_SERVICE_URL` on Vercel to the public HTTPS URL of the realtime service.
- Optionally set `REALTIME_ALLOWED_ORIGINS` on the realtime service to restrict CORS.

The admin dashboard automatically falls back to 15-second polling if realtime is unavailable. The DB remains the source of truth regardless.

### 3. Environment variables

Set on Vercel (Project Settings → Environment Variables):

| Var | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres pooled connection (`postgres://...`) |
| `DIRECT_URL` | ✅ | Postgres direct connection (for migrations) |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://your-app.vercel.app` |
| `BUSINESS_TIMEZONE` | | `America/New_York` (default) |
| `DEFAULT_HOURLY_RATE` | | `5.00` (default) |
| `REALTIME_SERVICE_URL` | recommended | `https://your-realtime-service.example.com` |
| `SEED_ADMIN_EMAIL` | seed-only | `admin@lifedreambig.local` |
| `SEED_ADMIN_PASSWORD` | seed-only | change before seeding |
| `SEED_OWNER_*` | optional | protected owner agent account |

### 4. Deploy

```bash
vercel --prod
```

The app builds with `output: "standalone"` (see `next.config.ts`). TypeScript errors will fail the build legitimately — there is no `ignoreBuildErrors` escape hatch.

## Deployment scripts (.zscripts)

The `.zscripts/` directory contains the on-prem packaging scripts (Caddy + Next.js standalone + mini-services). These scripts:

- **Refuse to start** without a real Postgres `DATABASE_URL` (no SQLite fallback).
- Run `prisma migrate deploy` at build time so the DB schema is provisioned automatically.
- Track all child processes and tear them down on SIGTERM/SIGINT with a 5s grace window before SIGKILL.
- Do NOT pipe stdout through `tee` (which previously caused SIGPIPE crashes when the consumer exited).

For Vercel deployments, the `.zscripts/` are NOT used — Vercel runs `next build` directly.

## Security

- Passwords hashed with bcrypt (cost 12). Never stored or logged in plaintext.
- Admin can never see an existing password — only issue/reset temporary ones (returned ONCE in the API response).
- Every newly-created account has `mustChangePassword = true` and is forced into the password-change flow before reaching any dashboard.
- Sessions are JWT-based (12-hour max age). The JWT carries `userId`, `role`, and `mustChangePassword` only.
- All role checks happen server-side. Frontend hiding is purely cosmetic.
- Audit log records every meaningful mutation with actor, target, action, and JSON metadata.
- CSV exports use RFC 4180-compliant escaping and sanitized filenames.
- Realtime notifications carry no sensitive data — they only trigger a refetch from the DB.
- Date-range exports are capped at 366 days to prevent self-DoS via enormous ranges.
- `default_hourly_rate` is validated against `NaN` / `Infinity` via `z.number().finite()`.
- Admin mutations cannot target admin accounts or the acting admin themselves.
- Correction approvals are atomic via `$transaction` + conditional `updateMany` — no duplicate payroll entries from concurrent reviews.

## Roles

- **ADMIN** — full operational control: create/edit agents, reset passwords, set hourly rates, approve/reject corrections, view all attendance, export CSVs, audit log access. Cannot deactivate / force-password-change other admins or themselves.
- **SURVEY_AGENT** — clock in/out/break, view own dashboard + history, submit correction requests, change own password.

There is NO public self-registration. Accounts are created by admins only.

## License

Internal use only.
