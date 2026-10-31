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

## HR onboarding agent (Level 1)

- **Ingest** (`/ingest`, HR) — three ways in, all through the same validation (mandatory fields, date formats, manager/department references, row-level report):
  - **Sync from ATS** — pick Greenhouse, Lever or Workday, connect, and the app pulls hired candidates page by page (the log shows each request, status and record count), maps the vendor's fields to joiners, and adds only people not already onboarding. The demo tenant answers in each vendor's real API format; set `ATS_<VENDOR>_URL` and `ATS_<VENDOR>_TOKEN` on the server to read a live tenant (not tested against a live tenant).
  - **Add a joiner** — a form (department and manager are dropdowns from the directory).
  - **Upload a file** — CSV / Excel / JSON; replaces the current batch. Sample files are in `public/samples`.
  - **Reference data** (requirements, policies, owners & managers) is edited in the app (rule editor with live validation, policy editor, owner tables), or uploaded; saving recalculates every checklist.
- **Checklists** — requirements are data (`src/lib/onboarding/rules.ts`); every item says which rule produced it. States: completed / pending / blocked / overdue.
- **Documents** — Not Submitted → Submitted → Under Review → Accepted / Correction Requested. Extracted name, dates and document type are compared with the profile by our own code.
- **Assistant** — answers only from approved policies and the person's own checklist, cites the policy, and says "not covered" (naming HR) otherwise. With `ANTHROPIC_API_KEY` the reply is written by Claude and then verified against the sources; without it the answer is quoted extractively.
- **Dashboard** (`/tracker`) — filters by joining date, department, location and status; open a row for the full checklist.
- **Changes & escalation** — editing a joining date or role recalculates the checklist and logs the diff; overdue approvals go to the right owner.

```bash
npm test                                             # 377 checks (rules, ingest, documents, scenarios, assistant, services, chat agent, ATS); no server needed
BASE_URL=http://localhost:3000 npm run test:e2e      # 90 checks as each persona against a running app
```

## Chat agent ("Ask superjoin")

A button on every signed-in page opens a chat to discuss and act on onboarding. Everyone can ask about people, checklists (and *why* each item exists), failures, and policy; answers about policy cite the policy (`[POL-04 §1]`) and say "not covered" rather than guess. Staff can also say "retry email for Yash" or "send the escalation for Priya" — the agent shows exactly what it will do and **nothing happens until you click Confirm**.

- **What each role can use** (enforced by the tool list the server offers, and again when an action is run): new joiner → own record + policies; manager → also escalations and service status for their reports; HR / department head → also retry a failed service and email an escalation.
- **With `ANTHROPIC_API_KEY`:** `POST /api/agent/chat` takes one model step at a time. The model asks for tools, the browser runs them against the user's own scope of the data (which lives in the browser) and sends the results back, until it answers. The system prompt and tool list come from the verified session, not the request.
- **Without a key** (or if the model is unreachable): an offline router answers from the same tools, and the panel says "from your data" instead of "AI".

## Provisioning services (server functions)

Each of the ten services (email & SSO, offer letter, app access, background check, payroll, ID card, premises, day-1 agenda, document collection, reminders) is a server function: `POST /api/services/<id>` with `{ person, attempt, retry }` runs every API call the service makes, in order, and returns each call's request, response and timing, plus the artifact it created or the failure (code, cause, evidence, fix). HR may run any; a department head only their own department. The browser engine asks the server when a service becomes ready and replays what came back, so **Agents → Logs / Failures / the per-person drill-down show the server's calls** (open "request & response" on any call). If the server can't be reached the run falls back to the local simulation and the log says so.

- **Sandbox connector (default):** answers like a healthy system, and fails a deterministic ~9% of runs so there is something to diagnose; a retry after the cause is fixed succeeds.
- **Live connector:** set `SERVICE_WEBHOOK_<SERVICE_ID>` (e.g. `SERVICE_WEBHOOK_IDENTITY_SVC=https://hooks.acme.com/identity`) and that service calls your system instead, once per API call. The request is JSON `{ service, trace, attempt, phase: {index,label,call}, request, person }`, signed with HMAC-SHA256 in `x-superjoin-signature` (key `SERVICE_WEBHOOK_SECRET`). Answer `{ ok, status?, response?, artifact?, paused?, error?: { code, title, cause, fix, retryable } }`. Timeouts and unreachable connectors become diagnosable failures.
- `/api/health` (as HR) shows which services are sandbox or live. No real vendor integrations (Google Workspace, Okta, Slack…) ship in this repo: they plug in behind the webhooks.

## Deploy to Vercel

1. Push this repo to GitHub and **Import** it in Vercel (framework: Next.js; no build settings to change). Node ≥ 20.9.
2. Add the environment variables below (Project → Settings → Environment Variables), then deploy.
3. Open `/api/health` while signed in as HR to confirm each integration is picked up (booleans only).
4. Run `BASE_URL=https://<your-app>.vercel.app npm run test:e2e` to check the deployment end to end.

| Variable | Needed | Notes |
|---|---|---|
| `SESSION_SECRET` | **yes** | Long random string (`openssl rand -hex 32`). Sessions can't be signed without it in production. |
| `ANTHROPIC_API_KEY` | for AI answers & PDF/image reading | Without it the assistant quotes policies and PDFs go to a human reviewer. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_APP_KEY` | for agent logs | Run the SQL from `npm run db:sql` once. `NEXT_PUBLIC_*` are baked in at **build** time — redeploy after changing them. |
| `RESEND_API_KEY`, `EMAIL_FROM` | for real email | Otherwise Reminders runs in preview mode. |

Vercel deploys the **Production Branch** (default `main`) to your production URL; other branches get preview URLs.
The AI routes set `maxDuration = 60`, which fits every plan.

## Layout

- `src/lib/workflow.ts` — template engine: persona (type × department × level) → workflow. `catalog.ts` — 123 blocks (78 with real brand logos).
- `src/lib/provision.ts`, `services.ts` — the ten provisioning agents: dependencies, retries, failures with cause/evidence/fix.
- `src/lib/csv.ts`, `people.ts` — ATS CSV → people; step status is derived from the timeline *and* data gaps.
- `src/app/api/*` — auth, agent events (Supabase), email. Each checks the session and role.
- `supabase/migrations` — the SQL; `scripts/*.mts` — `db:sql`, `db:check`, `db:seed`.

## Known limits

- **People, checklists, documents, the audit log and the outbox live in each browser's localStorage.** Only agent events are in Supabase. On Vercel that means no shared state across devices or users yet; the next step is per-entity Supabase tables behind role-checked API routes.
- **The rate limiter is in-memory**, so it is per serverless instance.
- **The provisioning agents are simulated** in the browser (API calls, timings, failures are generated, not sent to real systems).
- **The login is a demo identity provider.** Swap `src/lib/auth/users.ts` and the login route for Okta / Google SSO.
- **Data scoping in the UI is client-side** while the data is in browser memory; route access, the email API and the agent-events API are enforced on the server. A database behind server-side scoping closes this.
