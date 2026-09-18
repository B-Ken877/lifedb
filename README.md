# LIFE DREAM BIG — Clocking System

A production-grade internal employee timekeeping platform. Tracks agent clock-in/out, breaks, attendance history, payroll estimates, correction requests, and audit logs — built for a company operating on **Eastern Time (America/New_York)**.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Auth | NextAuth v4 (JWT strategy, credentials provider, bcrypt) |
| Database | Prisma + SQLite (local dev) / Postgres (Vercel) |
| UI | Tailwind CSS 4 + shadcn/ui |
| Charts | Recharts |
| Realtime | Socket.io mini-service (port 3003) |
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
│  ├─ password.ts            ← bcrypt + temp password + strength validation
│  ├─ timezone.ts            ← America/New_York helpers (DST-safe)
│  ├─ realtime-server.ts     ← HTTP bridge to socket.io mini-service
│  ├─ realtime-client.ts     ← React hook for admin dashboard
│  ├─ csv/                   ← CSV builder + response helper
│  └─ attendance/
│     ├─ engine.ts           ← state machine + hours/pay calc (cents)
│     └─ queries.ts          ← DB access (today/week/month, payroll, history)
└─ middleware.ts             ← role-based route protection (edge)

mini-services/
└─ realtime-service/         ← socket.io server (port 3003)

tests/
└─ attendance-engine.test.ts ← 52 tests (state machine, hours, money, DST, CSV)
```

## Core design principles

1. **Event ledger is the source of truth.** `AttendanceEvent` rows are append-mostly. Worked hours, breaks, and earnings are *derived* via the engine — never stored as editable fields.

2. **Money is in cents.** All earnings calculations use integer cents internally (`earningsCents = netHours × rate × 100`). Floating-point only at display time.

3. **Timezone-aware.** All events are stored in UTC, with a pre-computed `businessDate` (YYYY-MM-DD in `America/New_York`). DST transitions are handled automatically by `date-fns-tz` — never hardcode `UTC-5`.

4. **Server-side authorization everywhere.** Every protected page calls `requireUser/requireAdmin/requireAgent`. Every API route calls `requireUserApi/requireAdminApi/requireAgentApi`. The client never sends `userId`, `role`, `hourlyRate`, `hours`, or `earnings` — all resolved server-side from the session + DB.

5. **Audit trail.** Every meaningful mutation is recorded in `AuditLog` with actor, target, action, and JSON metadata. Records are append-only.

6. **Realtime is best-effort.** The admin dashboard subscribes to socket.io for live updates. If the connection drops, it falls back to 15-second polling. The DB is always the source of truth — realtime never writes data directly.

7. **Effective-dated compensation.** Hourly rate changes create new `CompensationRecord` rows; historical records are immutable. Past payroll calculations use the rate that was effective at the time.

## Local development

```bash
# 1. Install deps
bun install

# 2. Set up the database (SQLite by default)
cp .env.example .env
bun run db:push
bun run db:seed     # creates ADMIN role, SURVEY_AGENT role, default admin user

# 3. Start the realtime mini-service (separate terminal)
cd mini-services/realtime-service
bun install
bun run dev         # listens on port 3003

# 4. Start the Next.js dev server
bun run dev         # listens on port 3000
```

Default admin credentials (from `.env`):
- Email: `admin@lifedreambig.local`
- Password: `ChangeMe!2025`

## Tests

```bash
bun test tests/attendance-engine.test.ts
```

Covers: state machine transitions, invalid transitions, hours calculations, break deductions, midnight crossovers, DST spring-forward / fall-back, money precision (cents), password strength, temp password generation, CSV escaping.

## Production deployment (Vercel)

### 1. Database

Use Postgres (Neon, Supabase, Railway, or Vercel Postgres). Then:

1. Set `DATABASE_URL` to the Postgres connection string.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
3. Run `bun run db:push` and `bun run db:seed` against the production DB.

### 2. Realtime service

Vercel is serverless and cannot host the long-lived socket.io process. Deploy the realtime service separately:

- **Railway / Render / Fly.io / DigitalOcean App Platform**: deploy `mini-services/realtime-service/` as a Node/Bun service.
- Set `REALTIME_SERVICE_URL` on Vercel to the public HTTPS URL of the realtime service.
- Optionally set `NEXT_PUBLIC_REALTIME_URL` if the client should connect directly (skipping the Caddy proxy).

The admin dashboard automatically falls back to 15-second polling if realtime is unavailable.

### 3. Environment variables

Set on Vercel (Project Settings → Environment Variables):

| Var | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |
| `BUSINESS_TIMEZONE` | `America/New_York` |
| `DEFAULT_HOURLY_RATE` | `5.00` |
| `REALTIME_SERVICE_URL` | `https://your-realtime-service.example.com` |

### 4. Deploy

```bash
vercel --prod
```

The app builds with `output: "standalone"` (see `next.config.ts`).

## Security

- Passwords hashed with bcrypt (cost 12). Never stored or logged in plaintext.
- Admin can never see an existing password — only issue/reset temporary ones.
- Every newly-created account has `mustChangePassword = true` and is forced into the password-change flow before reaching any dashboard.
- Sessions are JWT-based (12-hour max age). The JWT carries `userId`, `role`, and `mustChangePassword` only.
- All role checks happen server-side. Frontend hiding is purely cosmetic.
- Audit log records every meaningful mutation with actor, target, action, and JSON metadata.
- CSV exports use RFC 4180-compliant escaping.
- Realtime notifications carry no sensitive data — they only trigger a refetch from the DB.

## Roles

- **ADMIN** — full operational control: create/edit agents, reset passwords, set hourly rates, approve/reject corrections, view all attendance, export CSVs, audit log access.
- **SURVEY_AGENT** — clock in/out/break, view own dashboard + history, submit correction requests, change own password.

There is NO public self-registration. Accounts are created by admins only.

## License

Internal use only.
