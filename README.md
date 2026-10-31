# superjoin

Onboarding workflows for HR and department heads: **design** persona-based workflows, **bulk-ingest** joiners from an ATS CSV, **track** every person visually, and see **what every agent did — and why anything failed**.

Next.js 16 (App Router, Cache Components) · React 19 · Tailwind v4 · React Flow · Zustand · Supabase.

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:3000
```

## Who sees what

Sign in as one of five demo personas (`/login`). Sessions are signed HttpOnly cookies; every page re-checks access on the server.

| Persona | Role | Opens | Sees |
|---|---|---|---|
| Yash Bansal | New joiner | My onboarding | only themself |
| Arjun Rao | Manager | Tracker, Builder & Library (view only), Reminders | direct reports |
| Vikram Singh / Neha Kapoor | Department head | all but Ingest | their department; edit their own department's workflows |
| Priya Nair | HR | everything | everyone; the only one who can publish or bulk-upload |

The policy table lives in `src/lib/auth/policy.ts` and is used by the proxy, the pages, the API routes and the UI.

## Agent logs in Supabase

Agent events are stored in Supabase and shown in **Agents → Logs** (HR: everything, department head: own department).
The tables are append-only, and the database only answers requests that carry a server-only secret, so the public key
that ships in the browser **cannot** read or write them.

One-time setup:

1. In `.env.local` set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_APP_KEY` (`openssl rand -hex 24`).
2. `npm run db:sql` prints the migration with your app key filled in — paste it into **Supabase → SQL Editor → Run**.
3. `npm run db:check` verifies the connection, the tables, and that the public key alone is locked out.
4. `npm run db:seed` stores the sample batch's history so the Logs tab has data.

New batches started from **Ingest** stream to Supabase automatically while they run.

## Email reminders

`/api/email/send` delivers through [Resend](https://resend.com) when `RESEND_API_KEY` and `EMAIL_FROM` are set. Without them the
Reminders page runs in **preview mode**: emails are rendered and logged but never delivered, and the page says so.
`EMAIL_TEST_RECIPIENT` funnels every message to one inbox while testing.

## Layout

- `src/lib/workflow.ts` — template engine: persona (type × department × level) → workflow. `catalog.ts` — 123 blocks (78 with real brand logos).
- `src/lib/provision.ts`, `services.ts` — the ten provisioning agents: dependencies, retries, failures with cause/evidence/fix.
- `src/lib/csv.ts`, `people.ts` — ATS CSV → people; step status is derived from the timeline *and* data gaps.
- `src/app/api/*` — auth, agent events (Supabase), email. Each checks the session and role.
- `supabase/migrations` — the SQL; `scripts/*.mts` — `db:sql`, `db:check`, `db:seed`.

## Known limits

- **People, workflows and the outbox still live in browser memory.** Only agent events are persisted so far.
- **The provisioning agents are simulated** in the browser (API calls, timings, failures are generated, not sent to real systems).
- **The login is a demo identity provider.** Swap `src/lib/auth/users.ts` and the login route for Okta / Google SSO.
- **Data scoping in the UI is client-side** while the data is in browser memory; route access, the email API and the agent-events API are enforced on the server. A database behind server-side scoping closes this.
