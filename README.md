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
| Vikram Singh / Neha Kapoor | Department head | all but Ingest | their department only, including workflows (they don't see other departments' in the library or builder); edit their own department's |
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
- **Documents** — every upload goes to the **document service** (`POST /api/documents/process`): it receives the file, reads the fields (text files directly; PDFs and scans with the AI reader when `ANTHROPIC_API_KEY` is set), checks name, dates and document type against the person's profile with our own code, and **decides**: a clean document is **Accepted** automatically (its checklist item completes and anything waiting on it is released); one with errors becomes **Correction Requested** with the reasons. Each document keeps the service's steps and trace id. **Under Review** is left for exactly one case: a scan or PDF that can't be read automatically, which needs a person. HR can still overrule any decision. Changing a joining date or role re-checks accepted documents against the new facts.
- **Assistant** — answers only from approved policies and the person's own checklist, cites the policy, and says "not covered" (naming HR) otherwise. With `ANTHROPIC_API_KEY` the reply is written by Claude and then verified against the sources; without it the answer is quoted extractively.
- **Dashboard** (`/tracker`) — filters by joining date, department, location and status; open a row for the full checklist.
- **Changes & escalation** — editing a joining date or role recalculates the checklist and logs the diff; overdue approvals go to the right owner.

```bash
npm test                                             # 579 checks (rules, ingest, documents, scenarios, assistant, services, chat agent, ATS, document service, deprovisioning, WhatsApp); no server needed
BASE_URL=http://localhost:3000 npm run test:e2e      # 120 checks as each persona against a running app
# …plus 75 WhatsApp checks (signed webhooks, joining, approvals, routing, the simulator) against a server started with test settings:
#   WHATSAPP_STORE=memory WHATSAPP_APP_SECRET=s WHATSAPP_VERIFY_TOKEN=v WHATSAPP_ROUTER_KEY=r WHATSAPP_DISPLAY_NUMBER=15551234567 npm run dev
#   WA_E2E=1 WA_APP_SECRET=s WA_VERIFY_TOKEN=v WA_ROUTER_KEY=r BASE_URL=http://localhost:3000 npm run test:e2e
```

## WhatsApp

Reminders, approvals and questions on WhatsApp, modelled on chatflow's WhatsApp Cloud API integration (webhook verify, signed inbound, interactive buttons, templates, a number people "join" with a code and leave with an exit word).

- **Notifications**: every reminder, escalation and correction email also goes to WhatsApp for anyone who has joined it (the Outbox does this; email is unaffected if WhatsApp isn't set up or the person isn't on it).
- **Approvals**: on an approval or provisioning item, HR or a department head clicks **Ask on WhatsApp**. The owner gets *Approve / Reject* buttons (or can reply `APPROVE` / `REJECT`, with the 4-letter code if several are waiting). Only the number the request was sent to can answer, once, within 72 hours. The answer is applied to the checklist by a signed-in browser (the checklist lives in the browser), recorded as "<name> (via WhatsApp)".
- **Questions**: a connected joiner can ask about their onboarding or policy and gets the same grounded, cited answer as the in-app assistant (or "not covered, ask HR"), from their own record only. Anyone else gets nothing personal.
- **Connecting**: a QR code in the footer of every page (sign-in included) opens WhatsApp. Signed in, **Connect my WhatsApp** makes a personal QR whose message `JOIN <code>` links the phone that sends it, so a number is proven, never typed in. HR can also invite people from the **WhatsApp** tab. `STOP` mutes, `START` resumes, `EXIT` forgets the number, `HELP` says what's possible.
- **Try it with no Meta account**: **WhatsApp → Try it** is a phone that runs the real handler (messages are recorded, never sent). Without `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` everything works this way.

**Set up (live)**
1. `npm run db:sql`, paste into the Supabase SQL editor (adds `wa_contacts`, `wa_requests`, `wa_messages`, locked behind the same app key as the logs), then `npm run db:check`.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_DISPLAY_NUMBER` (see `.env.example`).
3. In Meta → WhatsApp → Configuration: callback URL `https://<your-app>/api/whatsapp/webhook`, your verify token, subscribe to **messages**. The webhook refuses everything without `WHATSAPP_APP_SECRET` and rejects any call whose `x-hub-signature-256` doesn't match.
4. **Templates (WhatsApp's 24-hour rule)**: free-form messages are allowed only within 24 hours of the person's last message. Beyond that, create and get approved in Meta, then set `WHATSAPP_TEMPLATE_NOTIFY` (utility, body like `Onboarding update: {{1}} Reply STOP to stop messages.`) and `WHATSAPP_TEMPLATE_APPROVAL` (the same body plus two quick-reply buttons, *Approve* and *Reject*). Without them, an out-of-window message is not sent and the Activity tab says why.

**Sharing the number with superconnect.** Meta sends every message for a number to one webhook, so two apps on one number need one to hand messages to the other. Both must be the same Meta app (same app secret). Set `WHATSAPP_ROUTER_KEY` here; in chatflow's `whatsapp-verify/post-handler.ts`, after its signature check and before the account lookup, forward what belongs to superHR, unchanged (Meta's callback URL stays where it is):
```ts
  // Hand messages that belong to superHR (onboarding assistant) to its webhook, unchanged.
  // Inert unless all three secrets are set: SUPERHR_ROUTE_URL, SUPERHR_WEBHOOK_URL, SUPERHR_ROUTER_KEY.
  // superHR decides who is "its" (a number that joined it, or a message "JOIN <its code>"). Meta's body and
  // x-hub-signature-256 are forwarded byte for byte, so superHR verifies them itself with the same app secret.
  // If superHR is slow or down we log and drop the message rather than let it affect this webhook.
  const superHrRoute = Deno.env.get('SUPERHR_ROUTE_URL');
  const superHrHook = Deno.env.get('SUPERHR_WEBHOOK_URL');
  const superHrKey = Deno.env.get('SUPERHR_ROUTER_KEY');
  if (superHrRoute && superHrHook && superHrKey) {
    try {
      const first = JSON.parse(rawBody)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (first?.from) {
        const ask = await fetch(superHrRoute, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${superHrKey}` },
          body: JSON.stringify({ phone: first.from, text: first.text?.body ?? '' }),
          signal: AbortSignal.timeout(3000)
        });
        if (ask.ok && (await ask.json())?.handle === true) {
          try {
            const fwd = await fetch(superHrHook, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-hub-signature-256': req.headers.get('x-hub-signature-256') || '' },
              body: rawBody,
              signal: AbortSignal.timeout(8000)
            });
            if (!fwd.ok) console.error('superHR webhook answered', fwd.status);
          } catch (e) {
            console.error('Could not forward to superHR; message dropped:', e);
          }
          return new Response('ok', { status: 200, headers: corsHeaders });
        }
      }
    } catch (e) {
      console.error('superHR routing check failed; handling normally:', e);
    }
  }
```
(`SUPERHR_ROUTE_URL` = `https://<your-app>/api/whatsapp/route`, `SUPERHR_WEBHOOK_URL` = `…/api/whatsapp/webhook`.) While someone is joined to superHR all their messages go to superHR; `EXIT` hands the number back, like chatflow's sandbox exit code. The block is applied to chatflow's working copy (uncommitted, not deployed) and was tested against a local mock of superHR (forwarding, not forwarding, superHR down, secrets unset); it is inert unless the three secrets are set. If superHR is slow or down the message is dropped and logged and superconnect is unaffected.

**Limits.** The server holds only who joined, pending approvals and a snapshot per joiner (pushed by a signed-in browser when their checklist changes); the checklist itself stays in the browser, so approvals are applied, and answers refreshed, only while a signed-in browser is open. Not covered: joiners sending documents over WhatsApp, WhatsApp Q&A for managers or HR, delivery receipts, and the live Meta calls (tested only against a local mock of the Graph API).

## Changing, deprovisioning and terminating

Provisioning is reversible, per person, from the **Services** tab on their record (HR, or the head of their department).

- **Per service:** *Deprovision* undoes what one service created (suspend the account and sessions, void the offer, cancel payroll, release the desk…), calling the service's reverse operations on the server. *Provision again* runs it from the start.
- **Per application:** under Access, each app (Slack, GitHub, Jira…) has its own switch: off revokes that one app only, on grants it back.
- **Terminate onboarding** (HR only; offer withdrawn, no-show…): asks for a reason, shows exactly what will be revoked, then deprovisions everything that was created (applications and records first, the account last) and cancels what had not started. The person is marked terminated (shown on their record, listed under the dashboard's *Terminated* filter, and excluded from readiness, reminders and escalations). *Reinstate onboarding* undoes it.
- **When details change** (joining date, role, grade, department, location, manager, employment type) the Profile editor previews what it will do to provisioning *before* you apply it, then does it: apps the new role no longer includes are revoked and new ones granted; the calendar events, desk and pass, payroll record, offer, ID card, directory entry and nudges are moved or reissued. A service that hasn't run yet is left alone: it will use the new details.
- Every action is a call to `POST /api/services/<id>` with `action` (`provision`, `deprovision`, `update`) and an optional `object` (an app name, for access), with the same sandbox or live connector as provisioning (a live webhook is told the action and the object). Each is recorded on the service, in the agent logs and in the audit trail. A failed revoke stays visible with a retry; nothing is marked revoked unless the server said every call succeeded.
- Revocations are saved in the browser and re-applied after a reload, so a terminated person stays terminated.

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
