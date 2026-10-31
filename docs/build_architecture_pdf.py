#!/usr/bin/env python3
"""Builds docs/superjoin-architecture.pdf: architecture diagrams, microservices, endpoints and project details.

    python3 docs/build_architecture_pdf.py            # writes docs/superjoin-architecture.pdf

Needs PyMuPDF (pip install pymupdf) and matplotlib. Service tables are parsed from the source, so they track the code.
"""
import html
import os
import re
import sys
import tempfile
from datetime import date

import fitz  # PyMuPDF

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import diagrams  # noqa: E402

OUT = os.path.join(HERE, "superjoin-architecture.pdf")
esc = html.escape


# ── facts parsed from the source ────────────────────────────────────────────
def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def parse_services():
    src = read("src/lib/services.ts")
    body = src[src.index("export const SERVICES"):]
    parts = re.split(r"\n  \{ id: \"", body)[1:]
    out = []
    for p in parts:
        sid = p[: p.index('"')]
        name = re.search(r'name: "([^"]+)"', p).group(1)
        creates = re.search(r'creates: "([^"]+)"', p).group(1)
        deps = re.search(r"deps: (\[[^\]]*\]|\"all\")", p).group(1)
        secs = re.search(r"secs: \[(\d+), (\d+)\]", p)
        phases = re.findall(r'\{ label: "([^"]+)", call: "([^"]+)" \}', p)
        fails = re.findall(r'code: "(\d+)", title: "([^"]+)"', p)
        out.append(dict(id=sid, name=name, creates=creates, deps=deps.replace('"', "").strip("[]") or "none", secs=f"{secs.group(1)}–{secs.group(2)} s", phases=phases, fails=fails))
    return out


def parse_ops(file, table):
    src = read(file)
    start = src.index(f"export const {table}")
    block = src[start:]
    res = {}
    for m in re.finditer(r'"([a-z]+-svc)": \[(.*?)\n  \],?', block, re.S):
        res[m.group(1)] = re.findall(r'label: "([^"]+)"', m.group(2))
    return res


SERVICES = parse_services()
REVOKE = parse_ops("src/lib/serviceRuntime/reverse.ts", "REVOKE")
UPDATE_SRC = read("src/lib/serviceRuntime/reverse.ts")
UPDATE = {}
for m in re.finditer(r'"([a-z]+-svc)": \[(\{ label: .*?)\],\n', UPDATE_SRC[UPDATE_SRC.index("export const UPDATE"):], re.S):
    UPDATE[m.group(1)] = re.findall(r'label: "([^"]+)"', m.group(2))
assert len(SERVICES) == 10 and all(s["id"] in REVOKE for s in SERVICES), "service parse failed"


# ── html helpers ────────────────────────────────────────────────────────────
def tbl(headers, rows, widths=None, small=False):
    fs = "7.4pt" if small else "8pt"
    h = "".join(f'<th style="width:{w}%">{esc(x)}</th>' if widths else f"<th>{esc(x)}</th>" for x, w in zip(headers, widths or [0] * len(headers)))
    body = ""
    for r in rows:
        body += "<tr>" + "".join(f'<td style="font-size:{fs}">{c if isinstance(c, Raw) else esc(str(c))}</td>' for c in r) + "</tr>"
    return f'<table width="100%"><tr>{h}</tr>{body}</table>'


class Raw(str):
    pass


def code(s):
    return Raw(f"<code>{esc(s)}</code>")


def cell(*lines):
    return Raw("<br/>".join(esc(x) if not isinstance(x, Raw) else x for x in lines))


def para(s):
    return f"<p>{s}</p>"


def bullets(items):
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def endpoint(method, path, svc, access, request, response, errors, limits=""):
    rows = [("Microservice", svc), ("Access", access), ("Request", request), ("Response", response), ("Errors", errors)]
    if limits:
        rows.append(("Limits", limits))
    inner = "".join(f'<tr><td class="k">{esc(k)}</td><td class="v">{v if isinstance(v, Raw) else esc(v)}</td></tr>' for k, v in rows)
    return f'<div class="ep"><div class="eph"><span class="m m{method[:3]}">{esc(method)}</span> <code>{esc(path)}</code></div><table class="et" width="100%">{inner}</table></div>'


CSS = """
body { font-family: sans-serif; font-size: 8.8pt; color: #1f1b16; line-height: 1.38; }
h1 { font-size: 19pt; color: #c8552b; margin: 0 0 4pt 0; padding-bottom: 3pt; border-bottom: 1.5pt solid #c8552b; }
h2 { font-size: 12.5pt; color: #1f1b16; margin: 12pt 0 3pt 0; }
h3 { font-size: 9.8pt; color: #4b4338; margin: 8pt 0 2pt 0; }
p { margin: 3pt 0 4pt 0; }
ul { margin: 2pt 0 4pt 0; padding-left: 12pt; }
li { margin: 1.5pt 0; }
code { font-family: monospace; font-size: 7.6pt; color: #8a3a1a; }
table { width: 100%; border-collapse: collapse; margin: 3pt 0 6pt 0; }
th { color: #4b4338; font-size: 7.6pt; text-align: left; padding: 2.5pt 3pt; border-bottom: 1.2pt solid #b7ac94; }
td { padding: 2.2pt 3pt; border-bottom: 0.5pt solid #ddd5c0; vertical-align: top; }
.note { border-left: 3pt solid #e0b455; padding: 2pt 0 2pt 7pt; margin: 6pt 0; font-size: 8.3pt; color: #4b4338; }
.ok { border-left: 3pt solid #5d9a73; padding: 2pt 0 2pt 7pt; margin: 6pt 0; font-size: 8.3pt; }
.ep { margin: 0 0 6pt 0; }
.eph { color: #1f1b16; padding: 3pt 0 2pt 0; font-size: 9pt; border-bottom: 1.4pt solid #1f1b16; }
.eph code { color: #1f1b16; font-size: 9pt; font-weight: bold; }
.et { margin: 0; }
.k { width: 13%; font-size: 7.4pt; color: #6b6252; }
.v { font-size: 7.8pt; }
.m { font-weight: bold; font-size: 8pt; }
.mGET { color: #2f8f5b; } .mPOS { color: #c8552b; } .mPUT { color: #a8620f; } .mDEL { color: #c0392b; }
.cover { text-align: center; margin-top: 150pt; }
.cover .t { font-size: 34pt; font-weight: bold; color: #1f1b16; }
.cover .s { font-size: 14pt; color: #c8552b; margin-top: 4pt; }
.cover .d { font-size: 9.5pt; color: #4b4338; margin-top: 18pt; line-height: 1.7; }
.toc td { border-bottom: 0.4pt dotted #b7ac94; font-size: 9.2pt; padding: 2.4pt 2pt; }
"""

DIAG = tempfile.mkdtemp(prefix="superjoin-diagrams-")
diagrams.build_all(DIAG)

TODAY = date.today().strftime("%d %B %Y").lstrip("0")


def img(name, width):
    return f'<p style="text-align:center"><img src="{name}" width="{width}"/></p>'


def sections():
    S = []  # list of (title, html)

    # 1 ── overview
    S.append(("Overview", f"""
{para("<b>superjoin</b> is an HR onboarding agent. It brings new joiners in from an applicant-tracking system (ATS), a form or a file; builds a rule-based checklist for each person that says <i>why</i> every item is there; collects and validates their documents with a document service; provisions their accounts, access, payroll, desk and day-one plan through ten provisioning microservices; chases overdue work and escalates it to the right owner; and lets HR undo, change or terminate any of it.")}
<h2>What it does</h2>
{bullets([
    "<b>Ingest</b>: sync hired candidates from Greenhouse, Lever or Workday (page by page, with a request log), add one joiner with a form, or upload CSV, Excel or JSON. Every route in goes through the same validation (mandatory fields, dates, manager and department references).",
    "<b>Checklists</b>: requirements are data (conditions on department, location, country, role, grade, type, with dependencies). Each item states the rule behind it and its owner. States: completed, pending, blocked, overdue.",
    "<b>Documents</b>: uploads go to a document service that reads the fields, checks them against the profile with our own code, and decides: Accepted, or Correction Requested with reasons. Under Review is left for a scan nobody can read.",
    "<b>Provisioning</b>: ten services (email and SSO, offer letter, app access, background check, payroll, ID card, desk, day-one agenda, document collection, reminders), each a server function with a sandbox or a live (webhook) connector.",
    "<b>Change and undo</b>: deprovision or re-provision any service for one person, switch single apps on or off, terminate and reinstate an onboarding, and preview and apply what a change of date, role, department or location means for provisioning.",
    "<b>Assistants</b>: a policy-grounded assistant per person (cites the policy or says it isn't covered) and a role-scoped chat agent that can look things up and, with a confirming click, retry a service or send an escalation.",
    "<b>Dashboards</b>: a filterable progress table, an ID-badge view, a workflow builder and library (with role-scoped departments), reminders by email, and agent logs with per-service drill-down and failure reasons.",
])}
<h2>Technology</h2>
{tbl(["Layer", "Choice"], [
    ["Framework", "Next.js 16 (App Router, Cache Components, proxy.ts), React 19, TypeScript, Node 20.9 or later"],
    ["UI", "Tailwind CSS v4, React Flow (workflow builder), brand logos generated from icon sets"],
    ["Client state", "Zustand with persist (people, onboarding data, provisioning ledger), localStorage"],
    ["Auth", "Signed HttpOnly session cookie (jose, HS256, 8 h, user id only), five demo personas, policy table"],
    ["Backend", "Next.js route handlers (serverless functions on Vercel), no separate server"],
    ["Database", "Supabase Postgres for agent logs (append-only, row-level security behind a server-held key)"],
    ["AI", "Anthropic API (claude-opus-5-5 by default) for the chat agent, policy answers and scan reading; everything also works without a key"],
    ["Email", "Resend (or preview mode)"],
    ["Quality", "481 unit checks, 120 end-to-end checks, ESLint, TypeScript strict, production build"],
], widths=[18, 82])}
{tbl(["Demo user", "Role", "Opens", "Sees"], [
    ["Yash Bansal", "New joiner (employee)", "My onboarding", "only their own record"],
    ["Arjun Rao", "Manager", "Tracker", "direct reports; workflows of their reports' departments, read-only"],
    ["Vikram Singh", "Head of Engineering", "Tracker", "Engineering people and workflows; edits Engineering workflows"],
    ["Neha Kapoor", "Head of Finance", "Tracker", "Finance people and workflows; edits Finance workflows"],
    ["Priya Nair", "HR", "Tracker", "everyone; the only one who can ingest, publish workflows or terminate an onboarding"],
], widths=[17, 20, 14, 49])}
"""))

    # 2 ── architecture
    S.append(("System architecture", f"""
{para("The browser holds the onboarding data and runs the rule and provisioning engines; the server is a set of small, independently deployed functions that do the work that needs a secret, a vendor or a model. The diagram shows the layers, the microservices, and every external system.")}
{img("d1_system.png", 462)}
"""))

    S.append(("How the pieces fit", f"""
<h2>Layers and trust boundaries</h2>
{tbl(["Layer", "Responsibility", "Trusted for"], [
    ["Browser", "UI, Zustand stores, rule engine, status derivation, provisioning tick engine, chat tool execution, localStorage persistence", "nothing: all input is re-validated on the server"],
    ["proxy.ts", "Optimistic gate: signed-out visitors go to /login; a role that can't open an area is rewritten to /forbidden. API routes and static samples are covered by the same matcher rules", "UX only, not a security boundary"],
    ["Route handlers", "Verify the session, check role and department scope, rate-limit, validate and length-limit input, then act", "authentication, authorisation, validation"],
    ["Supabase", "Stores agent events; row-level security requires a header (x-superjoin-key) that only our server knows", "append-only log storage"],
    ["Anthropic", "Reads scans (fields only) and writes answers from supplied sources; never makes a decision", "nothing: output is verified or only read"],
    ["Vendors", "Real systems behind the provisioning services and the ATS; reached only through server-side connectors", "their own side effects"],
], widths=[14, 58, 28])}
<h2>“Pods” as microservices: what that means here</h2>
{para("Each microservice is a <b>route handler deployed as its own serverless function</b> on Vercel. It scales, times out (60 s on the AI and service routes) and fails independently, owns one responsibility, and communicates with the others only over HTTP or through the browser. They are logical microservices in one repository, sharing code from <code>src/lib</code>; they are not Kubernetes pods. Because every service already has a narrow HTTP contract (and the provisioning ones can be pointed at an external system with a webhook), any of them can be moved into its own container or cluster without changing its callers.")}
<div class="note"><b>Rate limits are in memory</b>, so they apply per function instance. Put the limiter in Redis or Upstash before running many instances.</div>
<h2>Where state lives</h2>
{tbl(["State", "Where", "Survives reload?", "Shared across users?"], [
    ["People, checklists, documents, audit trail, reference data (rules, policies, owners)", "browser localStorage (superjoin.people, superjoin.onboarding)", "yes", "no (per browser)"],
    ["Provisioning run (tasks, calls, events)", "browser memory (rebuilt on load)", "no", "no"],
    ["Revocations and terminations", "browser localStorage (superjoin.provisioning ledger), re-applied on load", "yes", "no"],
    ["Agent events (logs)", "Supabase agent_batches, agent_events", "yes", "yes (HR sees all; department heads their department)"],
    ["Session", "signed cookie sj_session", "8 hours", "n/a"],
], widths=[34, 34, 14, 18], small=True)}
"""))

    # 3 ── microservice catalogue
    S.append(("Microservice catalogue", f"""
{para("Nineteen microservices: nine platform services and ten provisioning services. Each row is one deployable unit.")}
<h2>Platform microservices</h2>
{tbl(["Service", "Endpoint(s)", "Responsibility", "Calls out to", "Timeout"], [
    ["auth-svc", cell(code("POST /api/auth/login"), code("POST /api/auth/logout")), "Demo sign-in by persona; sets or clears the signed session cookie. Swap for an SSO callback in production", "none", "default"],
    ["health-svc", code("GET /api/health"), "Public liveness; for HR also which integrations are configured and each service's connector mode (booleans only, never values)", "none", "default"],
    ["logs-svc", cell(code("GET /api/agent-events"), code("POST /api/agent-events")), "Reads and appends agent events, scoped by role; idempotent writes", "Supabase", "default"],
    ["mail-svc", cell(code("GET /api/email/send"), code("POST /api/email/send")), "Sends reminder and escalation email; preview mode without a key; can funnel all mail to one inbox for testing", "Resend", "default"],
    ["assistant-svc", cell(code("GET /api/assistant"), code("POST /api/assistant")), "Answers a person's question from approved policies and their own checklist; cites sources or says not covered", "Anthropic (optional)", "60 s"],
    ["chat-agent-svc", cell(code("GET /api/agent/chat"), code("POST /api/agent/chat")), "One model step of the role-scoped chat agent (tools run in the browser)", "Anthropic", "60 s"],
    ["doc-reader-svc", code("POST /api/documents/extract"), "Reads the printed fields off a PDF or image; returns fields only", "Anthropic", "60 s"],
    ["doc-svc", code("POST /api/documents/process"), "Document service: receive, read, check against the profile, decide", "doc-reader logic, Anthropic (scans)", "60 s"],
    ["ats-svc", code("POST /api/ats/[provider]"), "Fetches one page of hired candidates from Greenhouse, Lever or Workday (demo tenant or live)", "ATS vendor", "60 s"],
], widths=[12, 31, 33, 15, 9], small=True)}
<h2>Provisioning microservices</h2>
{para("All ten share one endpoint shape, <code>POST /api/services/[service]</code>, and one runtime. Each defines its own calls, reverse calls, update calls and failure modes. Details of each follow in the next section.")}
{tbl(["Service", "Creates", "Depends on", "Calls", "Failure modes"], [
    [code(s["id"]), s["creates"], s["deps"], str(len(s["phases"])), "; ".join(f"{c} {t}" for c, t in s["fails"])] for s in SERVICES
], widths=[13, 27, 12, 6, 42], small=True)}
<h2>Internal modules (not network services)</h2>
{tbl(["Module", "Role"], [
    ["rules / status / change / escalate", "Checklist generation with reasons, derived states, recalculation after a change, escalation targets"],
    ["datasets / csv / documents / docService", "Parsing and validating profiles, requirements, policies and owners; document checks; the document decision"],
    ["retrieve / assistant", "BM25 retrieval with a coverage gate, grounded answers, citation verification"],
    ["agent (tools, offline, prompt)", "Role-scoped chat tools, the offline router, the system prompt"],
    ["serviceRuntime (runner, handlers, reverse)", "Executes a service action in sandbox or live mode and records every call"],
    ["provisioning (impact, orchestrate)", "What a change means for provisioning; running actions, terminate and reinstate"],
    ["auth (policy, token, session, users)", "The single policy table, session signing, the data-scoping rule"],
], widths=[32, 68], small=True)}
"""))

    # 4 ── provisioning detail
    prov_rows = []
    for s in SERVICES:
        prov_rows.append([
            cell(code(s["id"]), Raw(f"<b>{esc(s['name'])}</b>"), f"{s['secs']}"),
            cell(*[f"{i + 1}. {l}" for i, (l, c) in enumerate(s["phases"])]),
            cell(*REVOKE[s["id"]]),
            cell(*(UPDATE.get(s["id"], ["(per application instead)"]))),
        ])
    S.append(("Provisioning microservices", f"""
{para("Ten services provision a joiner. A service runs only when the services it depends on have finished; a failed, skipped or revoked dependency skips what depends on it, and a service that is waiting on the candidate (for example for their address) pauses rather than fails.")}
{img("d2_services.png", 470)}
<h2>Every service: what it does, undoes and updates</h2>
{tbl(["Service", "Provision (in order)", "Deprovision (reverse)", "Update (details changed)"], prov_rows, widths=[18, 32, 28, 22], small=True)}
<h2>Actions and connectors</h2>
{bullets([
    "<b>Actions</b>: <code>provision</code> (the original run, or grant one application), <code>deprovision</code> (undo it) and <code>update</code> (move or reissue what was created). Access also takes an <code>object</code>, one application name, so a single app can be revoked or granted on its own.",
    "<b>Sandbox connector</b> (default): answers like a healthy system, with a stable ~9% of provisioning runs failing deterministically so there is something to diagnose; a retry after the cause is fixed succeeds. Deprovision and update always succeed in the sandbox.",
    "<b>Live connector</b>: setting <code>SERVICE_WEBHOOK_&lt;SERVICE_ID&gt;</code> (for example <code>SERVICE_WEBHOOK_IDENTITY_SVC</code>) makes the service POST each call to your system. The body carries the service, trace id, attempt, action, object, the phase (index, label, call), the request body and the person; it is signed with HMAC-SHA256 in <code>x-superjoin-signature</code> using <code>SERVICE_WEBHOOK_SECRET</code>. The system answers <code>{{ ok, status?, response?, artifact?, paused?, error? {{ code, title, cause, fix, retryable }} }}</code>. Timeouts (8 s) and unreachable connectors become diagnosable failures.",
    "<b>Every execution</b> returns each call's label, endpoint, request body, response body, HTTP status and milliseconds, plus the artifact created or the failure (code, cause, evidence, fix, retryable) and a trace id.",
])}
"""))

    # 5 ── flows
    S.append(("Provisioning run and logging", f"""
<h2>Provisioning run and logging</h2>
{para("When a service becomes ready the browser engine asks the server to run it, then replays the server's result over ticks so progress looks and behaves like a real run. If the server can't be reached, the run falls back to a local simulation and the log says so.")}
{img("d3_sequence.png", 470)}
"""))

    S.append(("Documents, changes and termination", f"""
<h2>Document processing</h2>
{para("Every upload (an employee's own, or HR on their behalf) goes through the document service, which decides. The model, when used, only reads what is printed; our own code checks it against the profile and makes every judgement.")}
{img("d4_docs.png", 470)}
<h2>Changing a person, undoing provisioning, terminating</h2>
{img("d5_change.png", 470)}
"""))

    S.append(("ATS sync, chat agent, assistant, escalation", f"""
<h2>ATS sync</h2>
{bullets([
    "HR picks Greenhouse, Lever or Workday and presses Connect. The browser POSTs <code>/api/ats/[provider]</code> once per page (10 per page, up to 30 pages), logging each request line, status, record count and time.",
    "Each vendor payload is in the vendor's own format (Greenhouse applications with candidate, jobs and offer; Lever opportunities with categories and fields; Workday report entries). A provider-specific mapper turns it into the same columns a CSV uses, losslessly (tested round-trip).",
    "The rows go through the same validation as an upload. In ATS and form mode, people whose email is already onboarding are skipped, new joiners are added to the existing batch, checklists are built for them and provisioning starts for them only.",
    "Demo tenant: 19 people (the 14 already loaded plus 5 new hires). A key shorter than 8 characters, or the word invalid, gets a vendor-style 401. With <code>ATS_&lt;VENDOR&gt;_URL</code> and <code>_TOKEN</code> set, the server reads a live tenant with its own token and ignores the typed credentials.",
])}
<h2>Chat agent (Ask superjoin)</h2>
{bullets([
    "The route is stateless and takes one model step: the browser sends the conversation so far (including tool results); the model answers or asks for tools; the browser runs the tools against <i>this user's</i> scope of the data (it lives in the browser) and calls again, up to six rounds.",
    "The system prompt and the tool list are built on the server from the verified session; the request cannot widen either. Tool-use blocks naming a tool the role doesn't have are rejected.",
    "Tools: <code>list_people</code>, <code>get_checklist</code>, <code>search_policies</code> (everyone); <code>list_escalations</code>, <code>service_status</code> (staff); <code>retry_service</code>, <code>send_escalation</code> (HR and department heads). Actions are shown first and run only after a Confirm click.",
    "Without a key, or if the model is unreachable, an offline router answers from the same tools (and says so). Policy questions are answered only when the policies actually mention the question's terms; otherwise it declines rather than guesses.",
])}
<h2>Policy assistant (per person)</h2>
{bullets([
    "Retrieval: BM25 (k1 1.4, b 0.75) over the policy passages that apply to that person's country, department, location and level; headings and titles count extra; a small synonym table helps paraphrases.",
    "Coverage gate: the best passage must score at least 3.2 and cover at least 60% of the question's content words, otherwise the answer is a fixed “not covered, ask HR”. With fewer than 40 applicable passages, all of them go to the model so paraphrases still land.",
    "The model returns JSON (answer, covered, citations). Every citation must be a real source id; an unverifiable reply is replaced by an extractive answer that quotes the policy. The assistant also answers from the person's own checklist (status, owner, why).",
])}
<h2>Escalation and reminders</h2>
{bullets([
    "An item is escalated when it is itself overdue and is either an approval or is holding other items up (the root cause, not the symptoms). One day overdue goes to the first rung, three days to the second; the target comes from the owner directory.",
    "Reminder emails follow a four-step ladder at 0, 1, 3 and 5 days: the owner; owner and manager; department head; HR head. Terminated people are never chased.",
])}
"""))

    # 6 ── API reference
    api = []
    api.append(endpoint("POST", "/api/auth/login", "auth-svc", "Public", cell(code('{ "userId": "u-priya" }')),
                        cell(code('200 { "ok": true, "landing": "/tracker" | "/me" }'), "Sets HttpOnly cookie sj_session (HS256, 8 h, carries only the user id)"), "401 { error: \"Unknown user\" }"))
    api.append(endpoint("POST", "/api/auth/logout", "auth-svc", "Anyone", "none", cell(code('200 { "ok": true }'), "Clears the session cookie"), "none"))
    api.append(endpoint("GET", "/api/health", "health-svc", "Public (more for HR)", "none",
                        cell(code('Anyone: { "ok": true }'), code('HR: { ok, env, checks: { sessionSecret, supabase, ai, email }, connectors: { "<service-id>": "sandbox" | "live" } }')), "none"))
    api.append(endpoint("GET", "/api/agent-events", "logs-svc", "HR; department head (rows filtered to their department on the server)",
                        cell(code("batch (latest | id) · limit (1–300, default 100) · before (seq) · kind (info,ok,warn,error) · service · person · q (≤80 chars)")),
                        cell(code("{ configured, setupRequired, batch, batches[≤20], events[], total }"), "events: seq, tick, at, personId, personName, dept, service, kind, text, call?, traceId?, ms?, meta?"),
                        "401, 403, 502 (read failed)", "Query values are sanitised before use in a filter"))
    api.append(endpoint("POST", "/api/agent-events", "logs-svc", "HR; department head (own department's events only)",
                        cell(code("{ batch: { id, startedBy, label, people }, events: IngestEvent[1–500] }"), "every field length-limited"),
                        cell(code('200 { stored: true, … }'), "Idempotent: the same (batch, seq) is ignored"),
                        "400 invalid; 403; 503 { stored: false, reason: not_configured | setup_required }; 502 { reason: batch_failed | insert_failed }"))
    api.append(endpoint("GET", "/api/email/send", "mail-svc", "Any signed-in user", "none", cell(code("{ configured, redirected }")), "401"))
    api.append(endpoint("POST", "/api/email/send", "mail-svc", "HR, department head, manager (not new joiners)",
                        cell(code("{ to, subject (≤200), html (≤100 KB), text (≤20 KB) }")),
                        cell(code('{ mode: "sent", id, redirectedTo } | { mode: "preview", note } | { mode: "failed", error }')), "400, 401, 403, 413, 502"))
    api.append(endpoint("GET", "/api/assistant", "assistant-svc", "Any signed-in user", "none", cell(code("{ ai: boolean, model: string | null }")), "401"))
    api.append(endpoint("POST", "/api/assistant", "assistant-svc", "Any signed-in user",
                        cell(code("{ question (≤500), employee { name, role, department, location, country, grade, level, startDate, manager }, hr { name, email }, facts[≤80], policies?[≤60, ≤150 KB], history?[≤6] }")),
                        cell(code('{ answer, covered, citations[], mode: "ai" | "extractive", note? }')), "400, 401, 413, 429", "20 requests/min/user · 60 s"))
    api.append(endpoint("POST", "/api/documents/extract", "doc-reader-svc", "Any signed-in user", cell(code('{ mime: "application/pdf" | "image/png" | "image/jpeg", data: base64 (≤5 MB) }')),
                        cell(code("{ extracted: { docKind, name, dob, idNumber, address, issueDate, expiryDate, degree, institution, year, employer, lastWorkingDate } }"), "Fields the model could not read are null; it never infers"),
                        "400, 401, 413, 429, 502 { extracted: null, reason: extraction_failed }, 503 { reason: not_configured } (no API key)", "15/min/user · 60 s"))
    api.append(endpoint("POST", "/api/documents/process", "doc-svc", "Any signed-in user; a new joiner only for themselves",
                        cell(code("{ fileName, size, docType, person, text | { mime, data } }"), "docType: id_proof, address_proof, education_cert, prev_employment, pan_card, us_work_auth"),
                        cell(code("{ traceId, mode, extraction, extracted?, issues[], status, steps[{label, ok, ms, detail}], rejected? }"), "status: Accepted | Correction Requested | Under Review (unreadable scan only) | Not Submitted (rejected file)"),
                        "400, 401, 403 (not their own), 413, 429", "40/min/user · 60 s"))
    api.append(endpoint("POST", "/api/ats/[provider]", "ats-svc", "HR only", cell(code("{ tenant, token, page (1–30) }"), "provider: greenhouse | lever | workday"),
                        cell(code("{ ok, mode: sandbox | live, request, status, ms, payload, records, hasNext, total? }"), "On a refused key: { ok: false, status: 401, error }"), "400, 401, 403, 404 (unknown provider), 429", "120/min/user · 60 s"))
    api.append(endpoint("GET", "/api/services/[service]", "provisioning svc", "HR; department head", "none",
                        cell(code("{ id, name, creates, deps, mode, calls[{label, call}] }")), "401, 403, 404"))
    api.append(endpoint("POST", "/api/services/[service]", "provisioning svc", "HR (any person); department head (own department only)",
                        cell(code('{ person, attempt? (1–20), retry?, action?: "provision" | "deprovision" | "update", object? }'), "service: identity-svc · letter-svc · access-svc · bgv-svc · payroll-svc · idcard-svc · facility-svc · agenda-svc · collect-svc · reminder-svc; object only for access-svc"),
                        cell(code("{ service, traceId, mode, action, object?, attempt, ok, phases[{label, call, ok, httpStatus, ms, request, response}], paused?, artifact?, failure? { code, title, cause, evidence, fix, retryable, phase }, transient, totalMs }")),
                        "400 (bad person, action or object), 401, 403, 404, 429", "600/min/user · 60 s"))
    api.append(endpoint("GET", "/api/agent/chat", "chat-agent-svc", "Any signed-in user", "none", cell(code("{ ai, model, tools: string[] }  (tools offered to this role)")), "401"))
    api.append(endpoint("POST", "/api/agent/chat", "chat-agent-svc", "Any signed-in user (tools by role)",
                        cell(code("{ messages: Message[1–40] }  ≤250 KB; text ≤4000 chars; tool_use only from assistant and only for tools the role has; tool_result only from user; starts and ends with the user")),
                        cell(code('{ mode: "ai", content: [text | tool_use], stop_reason }')), "400, 401, 413, 429, 503 { mode: \"offline\" } (no key), 502 { mode: \"offline\", reason: model_unavailable }", "30/min/user · 60 s"))

    S.append(("API reference: auth, health, logs, email", f"""
{para("Eleven route files expose 16 method handlers. Every route (except login, logout and health) returns 401 with no body when there is no valid session, and every role or department check is made on the server from the verified session, never from the request. Error bodies are JSON <code>{{ error }}</code> unless noted.")}
{''.join(api[:7])}
"""))
    S.append(("API reference: assistant, documents, ATS", "".join(api[7:13])))
    S.append(("API reference: services, chat, pages", "".join(api[13:]) + f"""
<h2>Pages</h2>
{tbl(["Path", "Who can open it", "Purpose"], [
    ["/login", "anyone", "Persona sign-in"], ["/", "signed-in", "Redirects to the landing page for the role"],
    ["/me", "new joiner", "Their own overview, checklist, documents and assistant"],
    ["/tracker", "HR, department head, manager", "Progress dashboard (table, stack, grid, matrix)"],
    ["/employees/[id]", "HR, department head, manager (in scope)", "Full record: overview, checklist, documents, profile and changes, services, escalations, activity, assistant"],
    ["/builder", "HR, department head, manager", "Workflow builder (view only unless you may edit that department)"],
    ["/library", "HR, department head, manager", "Workflow library by type, department and level"],
    ["/ingest", "HR", "ATS sync, add a joiner, upload a file, reference data editors"],
    ["/reminders", "HR, department head, manager", "Scheduled and queued reminder emails"],
    ["/agents", "HR, department head", "Agent overview, logs per service, failures"],
    ["/forbidden", "anyone", "Shown when a role can't open an area"],
    ["/samples/*", "signed-in", "Sample CSV, Excel, JSON, policies and owners files (redirects to login when signed out)"],
], widths=[20, 30, 50], small=True)}
"""))

    # 7 ── data model
    S.append(("Data model and storage", f"""
<h2>Core entities (TypeScript)</h2>
{tbl(["Entity", "Key fields"], [
    ["Person", "id, no, name, email, phone, role, persona { type, dept, level }, manager, location, grade, dob?, address?, startDate, fields (data completeness per field), terminated? { at, by, reason }"],
    ["Requirement", "id, item, kind (document, activity, record, provision, policy, approval), owner function, dueOffset (days from joining), when { departments, locations, countries, roles, grades, types }, dependsOn, policy / policyByCountry, docType, because"],
    ["ChecklistItem", "id, personId, ruleId, item, kind, owner (named contact), dueDate, dependsOn, policy, docType, status (pending, requested, completed), ticket?, reason (the rule and the facts that matched)"],
    ["DocumentRecord", "status (Not Submitted, Submitted, Under Review, Accepted, Correction Requested), fileName, extraction (text, ai, none), extracted, issues[], processing { traceId, mode, steps[] }, attempts, reviewer note"],
    ["Policy", "id, title, version, appliesTo { countries, departments, locations, grades }, sections[{ id, heading, text }]"],
    ["Directory", "owners[{ fn, department, location, name, email }], managers[{ name, email, department }], departments[]"],
    ["Run / Task", "per person: tasks[10] each with status (queued, running, retry, done, waiting, failed, skipped, revoked), actions[], execution, failure, revocation, revokedObjects, lastUpdate, revokeFailure"],
    ["Execution", "the server's account of one service action: phases[], artifact | failure, trace id, mode, action, object"],
    ["LedgerEntry", "what survives a reload: revoked services (who, why, execution) and individually revoked applications"],
    ["AuditEntry", "at, actor, personId, action, detail (every import, upload, decision, change, termination)"],
], widths=[17, 83], small=True)}
<h2>Browser storage</h2>
{tbl(["Key", "Contents"], [
    ["superjoin.people", "people, which reminders were sent, whether the sample batch is loaded"],
    ["superjoin.onboarding", "requirements, policies, directory, dataset sources, checklists, documents, audit trail, ticket counter"],
    ["superjoin.provisioning", "the revocation ledger only"],
], widths=[26, 74], small=True)}
<h2>Supabase schema (agent logs)</h2>
{tbl(["Table", "Columns"], [
    ["agent_batches", "id text pk, started_at timestamptz, started_by, label, people int"],
    ["agent_events", "id bigint identity pk, batch_id fk, seq int, tick int, occurred_at, person_id, person_name, dept, manager, service, kind (info, ok, warn, error), message, call, trace_id, ms, meta jsonb, unique (batch_id, seq)"],
    ["indexes", "(batch_id, seq desc), dept, service, kind, trace_id"],
], widths=[20, 80], small=True)}
{bullets([
    "<b>Row-level security</b> is enabled on both tables. Every policy also requires <code>app_gate()</code>, which checks that the request carries the <code>x-superjoin-key</code> header equal to a secret known only to our server. The publishable key shipped to the browser therefore cannot read or write anything on its own (checked by <code>npm run db:check</code>).",
    "<b>Append-only</b>: there is no update or delete policy, and update, delete and truncate are revoked. Inserts are idempotent on (batch_id, seq).",
    "The migration is <code>supabase/migrations/20261031000000_agent_events.sql</code>; <code>npm run db:sql</code> prints it with your app key filled in; <code>npm run db:seed</code> stores the sample batch's history (714 events).",
])}
"""))

    # 8 ── security
    S.append(("Security and safety", f"""
{tbl(["Concern", "How it is handled"], [
    ["Authentication", "HS256 session cookie (jose), HttpOnly, 8 hours, carrying only the user id. Role and scope are looked up server-side on every request. SESSION_SECRET is mandatory in production (the app refuses to sign sessions without it). The login is a demo identity provider: replace it with SSO."],
    ["Authorisation", "One policy table (areas by role, edit and view rules, data scope) used by the proxy, every page, every route and the UI. Department heads are limited to their department on the server for logs and service actions; new joiners can only process their own documents."],
    ["Data scoping", "Applied to people, workflows, logs, services and chat tools. People data currently lives in the browser, so scoping there is a display rule, not a boundary (see limitations)."],
    ["Input", "Every route validates shape and length (names, strings, file sizes, array sizes); base64 is checked; the person object sent to service routes is rebuilt from validated fields only; PostgREST filter input is sanitised."],
    ["Abuse", "Per-user sliding-window rate limits on paid or heavy routes (assistant 20/min, extract 15/min, documents 40/min, chat 30/min, ATS 120/min, services 600/min)."],
    ["Webhooks", "Signed with HMAC-SHA256 (x-superjoin-signature) and a trace header; 8 second timeout; failures are reported, never hidden. Webhook URLs and tokens are server environment variables and are never sent to the browser."],
    ["AI safety", "The model never decides: it reads printed fields or writes answers from supplied sources. Our code validates documents, verifies every citation, and substitutes a quoted answer when a reply can't be verified. Tool results and document text are treated as data, not instructions. Chat actions need a human click. Policy answers refuse when the policies don't mention the question's terms."],
    ["Secrets", "Never committed (.env* is ignored). Only NEXT_PUBLIC_* values reach the browser (the Supabase URL and publishable key, which are useless without the server's gate key)."],
    ["Auditability", "Every import, upload, decision, change, termination and revocation is written to the audit trail with the actor; every service call is in the agent log with a trace id."],
], widths=[17, 83], small=True)}
"""))

    # 9 ── domain logic
    S.append(("Domain logic in detail", f"""
<h2>Checklist and status</h2>
{bullets([
    "<b>Rules</b>: 29 default requirements (documents, activities, records, provisioning requests, policy acknowledgements, approvals), each with a due date relative to joining, conditions, dependencies and a plain-English reason. Policies can differ by country (India and United States).",
    "<b>States</b>: completed; blocked (a dependency isn't complete, or a document was sent back); overdue (past due and not blocked); otherwise pending. <b>Ready for day one</b> means every item due on or before the joining date is complete.",
    "<b>Automation</b>: when the last document is accepted the agent creates the HR record and raises tickets for the laptop, email, badge and desk.",
])}
<h2>Document checks (our code)</h2>
{tbl(["Check", "Result"], [
    ["File type and size", "PDF, PNG, JPG, JPEG, txt or json, at most 5 MB; otherwise refused outright"],
    ["Name", "exact match passes; a close match (for example an added initial) is a warning; a different name is an error"],
    ["Date of birth", "must match the profile (error)"],
    ["Document kind", "a wrong kind (for example a library card as ID) is an error"],
    ["Expiry (ID, work authorisation)", "expires before joining: error; within six months of joining: warning"],
    ["Proof of address", "dated more than 3 months before joining: error; future date: warning; address not mentioning the city: warning"],
    ["PAN", "must be five letters, four digits, one letter"],
    ["Education / employment", "year of passing not after the joining year; last working day not after the joining date"],
    ["Missing fields", "a field the document type needs but the file lacks is an error"],
], widths=[28, 72], small=True)}
<h2>Changing a person: what happens to provisioning</h2>
{tbl(["Change", "Checklist", "Provisioning"], [
    ["Joining date", "due dates move; progress kept", "update: offer, background case, payroll, desk and pass, day-one calendar and buddy, nudges"],
    ["Role, grade, level or type", "items appear or go; owners move", "revoke apps the new persona no longer has, grant new ones; update offer, payroll, card, directory, document list"],
    ["Department", "owners and policies change", "revoke and grant apps; update directory, payroll, desk, day-one plan, nudges"],
    ["Location", "country-specific items change", "update desk and pass, card, payroll (statutory set-up), document list, directory"],
    ["Manager", "manager-owned items move", "update directory, day-one events, nudges"],
], widths=[20, 30, 50], small=True)}
{para("Only services that have already created something are touched; a service that hasn't run yet simply uses the new details. Revokes run first, then updates, then grants. Accepted documents are re-checked against the new facts, and one that no longer passes goes back to the employee and reopens its item.")}
<h2>Workflow builder and library</h2>
{bullets([
    "Personas are type (full-time, part-time, intern) × department (Engineering, Finance, Product, Business, People) × level (Intern; Associate, Mid, Senior, Leader), each with a generated step timeline across 123 blocks (78 with real brand logos) and per-step permission levels and verifiers.",
    "HR edits and publishes everything. A department head edits only their own department; HR publishes. Managers view only. Each role sees only the departments the policy allows.",
])}
"""))

    # 10 ── frontend map + roles
    S.append(("Roles, permissions and frontend", f"""
<h2>Permissions</h2>
{tbl(["Capability", "Employee", "Manager", "Dept head", "HR"], [
    ["See own record", "yes", "n/a", "n/a", "n/a"],
    ["See people", "self", "direct reports", "own department", "everyone"],
    ["Dashboard, record pages", "no", "yes", "yes", "yes"],
    ["See workflows (library, builder)", "no", "their reports' departments", "own department", "all"],
    ["Edit workflows", "no", "no", "own department", "all"],
    ["Publish workflows", "no", "no", "no", "yes"],
    ["Ingest (ATS, form, file) and reference data", "no", "no", "no", "yes"],
    ["Edit an employee's details", "no", "no", "own department", "yes"],
    ["Send nudges and reminders", "no", "yes", "yes", "yes"],
    ["Agent logs and failure detail", "no", "no logs", "own department", "all"],
    ["Retry, deprovision, provision a service or app", "no", "no", "own department", "yes"],
    ["Terminate or reinstate an onboarding", "no", "no", "no", "yes"],
    ["Upload documents", "own", "no", "on behalf", "on behalf"],
    ["Review documents (override the service)", "no", "no", "own department", "yes"],
    ["Chat agent actions (retry, escalate)", "no", "no", "yes", "yes"],
], widths=[34, 14, 18, 17, 17], small=True)}
<h2>Front-end map</h2>
{tbl(["Area", "Main components"], [
    ["shell", "SessionShell (server: reads the session), Header, UserMenu, Toaster, Hydrate (restores saved data and revocations), ProvisionDriver (ticks the engine, sends service calls, streams logs), AgentChat (Ask superjoin)"],
    ["dashboard / tracker", "ProgressTable (filters, summary tiles, readiness chips), TrackerApp (Dashboard, Stack, Grid, Matrix), Badge (flip ID card), Journey"],
    ["employee", "EmployeeRecord with Overview, ChecklistView, DocumentsPanel, ProfileEditor (impact preview), ServicesPanel (switches, terminate), EscalationsPanel, AuditLog, AssistantChat"],
    ["ingest", "IngestApp (three sources), AtsSync, JoinerForm, DatasetsPanel, RefEditors (rules, policies, owners), IssueList, Provision"],
    ["agents", "AgentsApp (overview, logs, failures), ServiceList, TaskChip, TaskDetail (calls, request and response, revocation)"],
    ["builder / library", "React Flow canvas, palette, inspector, timeline ruler; library grid by persona"],
    ["reminders", "scheduled and queued emails, the escalation ladder, outbox"],
], widths=[18, 82], small=True)}
"""))

    # 11 ── config, deploy
    S.append(("Configuration and deployment", f"""
<h2>Environment variables</h2>
{tbl(["Variable", "Needed", "Purpose"], [
    ["SESSION_SECRET", "required in production", "signs session cookies (openssl rand -hex 32)"],
    ["NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "for agent logs", "Supabase project URL and publishable key (baked in at build time: redeploy after changing)"],
    ["SUPABASE_APP_KEY", "for agent logs", "server-held gate secret; must match the value in the SQL (openssl rand -hex 24)"],
    ["ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN)", "optional", "chat agent, AI policy answers, scan reading; without it everything falls back"],
    ["ANTHROPIC_MODEL", "optional", "defaults to claude-opus-5-5"],
    ["RESEND_API_KEY, EMAIL_FROM", "optional", "real email; otherwise preview mode"],
    ["EMAIL_TEST_RECIPIENT", "optional", "funnel every email to one inbox while testing"],
    ["SERVICE_WEBHOOK_SECRET", "optional", "HMAC key for signing connector webhooks"],
    ["SERVICE_WEBHOOK_<ID>", "optional", "point one provisioning service at a real system (IDENTITY_SVC, LETTER_SVC, ACCESS_SVC, BGV_SVC, PAYROLL_SVC, IDCARD_SVC, FACILITY_SVC, AGENDA_SVC, COLLECT_SVC, REMINDER_SVC)"],
    ["ATS_GREENHOUSE_URL / _TOKEN, ATS_LEVER_URL / _TOKEN, ATS_WORKDAY_URL / _TOKEN", "optional", "read a live ATS tenant instead of the demo tenant"],
], widths=[38, 16, 46], small=True)}
<h2>Deploying to Vercel</h2>
{bullets([
    "Import the GitHub repository (framework: Next.js; no build settings to change; Node 20.9 or later). The repository's default branch is the Production Branch.",
    "Add the environment variables above, then deploy. Run the Supabase SQL once (<code>npm run db:sql</code>, paste into the SQL editor), then <code>npm run db:check</code> and <code>npm run db:seed</code>.",
    "Open <code>/api/health</code> as HR to confirm the integrations and each service's connector mode, then run <code>BASE_URL=https://&lt;app&gt;.vercel.app npm run test:e2e</code>.",
])}
<h2>npm scripts</h2>
{tbl(["Script", "Does"], [
    ["dev / build / start / lint", "standard Next.js and ESLint"],
    ["test", "all 12 unit suites (481 checks), no server needed"],
    ["test:e2e", "120 checks as each persona against a running app (BASE_URL)"],
    ["samples", "regenerates the sample CSV, JSON, Excel, policies and owners files"],
    ["db:sql / db:check / db:seed", "print the migration with your key; verify tables and that the public key alone is locked out; store the sample history"],
], widths=[30, 70], small=True)}
"""))

    # 12 ── testing
    S.append(("Testing and repository layout", f"""
<h2>Tests</h2>
{tbl(["Suite", "Checks", "Covers"], [
    ["rules", "34", "checklist generation, reasons, dependencies, country policies"],
    ["ingest", "32", "CSV, Excel, JSON parsing, validation of fields, dates, manager and department references"],
    ["documents", "30", "document extraction and every validation check, outcomes"],
    ["scenarios", "40", "date and role changes, recalculation, escalation"],
    ["assistant", "67", "retrieval, coverage gate, grounded answers, citation verification"],
    ["answer", "10", "end-to-end answer paths with a fake model"],
    ["store", "45", "persisted stores, upload flow, agent automation, audit trail"],
    ["services", "35", "the ten service functions, validation, live connector, engine replay, fallback"],
    ["agent", "50", "chat tools, role scoping, confirmed actions, offline router, prompts, workflow visibility"],
    ["ats", "49", "vendor payload round-trips, merge flow, editors, demo tenant"],
    ["docservice", "33", "the document service: every decision path, scans, settle, re-check"],
    ["deprov", "56", "reverse and update operations, per-app, live refusals, change impact, terminate, reinstate, reload"],
    ["e2e.sh", "120", "every endpoint and page as each role against a running app"],
], widths=[16, 10, 74], small=True)}
<h2>Repository layout</h2>
{tbl(["Path", "Contents"], [
    ["src/app", "pages and the 11 route files under src/app/api"],
    ["src/proxy.ts", "the optimistic session gate"],
    ["src/components", "agent, agents, auth, builder, dashboard, employee, ingest, library, me, reminders, shell, tracker, ui"],
    ["src/store", "Zustand stores: people, onboarding, provisioning, outbox, builder, toast"],
    ["src/lib", "workflow and catalog (builder), csv and people, services and provision (engine), onboarding/* (rules, status, documents, docService, assistant, retrieve, escalate, change, datasets, seed), serviceRuntime/*, provisioning/*, agent/*, ats/*, auth/*, supabase/*, ai, rateLimit"],
    ["supabase/migrations", "the agent-events SQL"],
    ["scripts", "db helpers, sample builders, brand-icon generator; scripts/tests holds the suites and the e2e script"],
    ["public/samples", "sample joiners (CSV, JSON, Excel, with errors), requirements, policies, owners"],
    ["docs", "this document and its generator (build_architecture_pdf.py, diagrams.py)"],
], widths=[24, 76], small=True)}
"""))

    # 13 ── limitations
    S.append(("What is simulated, limits and next steps", f"""
<h2>Simulated or untested</h2>
{bullets([
    "<b>No real vendor has been called.</b> The ATS demo tenant and every provisioning connector run in a sandbox that imitates the vendor's response format. The live service-webhook path (SERVICE_WEBHOOK_*) is tested against a local mock server (signing, actions, refusals, timeouts). The live ATS path (ATS_*_URL and _TOKEN) is implemented but has no automated test at all. Neither has been exercised against a real Greenhouse, Lever, Workday, Okta, Google, Slack or payroll system.",
    "<b>The AI paths have not run against the real API</b> (no key was available): they are type-checked against the SDK and tested with a fake model. Without a key, the chat agent and assistant use their offline and extractive modes, and PDFs and scans that cannot be read go to a person (Under Review).",
    "<b>Most screens were verified through their rendered HTML and the 120 end-to-end checks</b> rather than a visual review in a browser.",
    "The provisioning <i>timings</i> are simulated; the calls, requests and responses come from the server functions.",
])}
<h2>Known limits</h2>
{bullets([
    "<b>People, checklists, documents and the audit trail live in each browser</b> (localStorage). On Vercel there is no state shared between users or devices, and role scoping of that data is a display rule, not a security boundary.",
    "The provisioning run is rebuilt on each load; only revocations and terminations are saved, and people added in a session have no run after a reload.",
    "Rate limiting is in memory, per function instance.",
    "The login is a demo identity provider (five personas).",
])}
<h2>Recommended next steps</h2>
{bullets([
    "<b>Server-side persistence</b>: Supabase tables for people, checklists, documents, audit and provisioning runs behind role-checked API routes, so state is shared and scoping is enforced on the server.",
    "<b>Real identity</b>: SSO (Okta or Google) in place of the demo login; map groups to the five roles.",
    "<b>Real connectors</b>: implement the ten SERVICE_WEBHOOK endpoints against the real systems (the contract is documented above) and a live ATS tenant; add retries and idempotency keys on the vendor side.",
    "<b>Durable job queue</b> for provisioning runs (so a closed tab does not stop a run), and a shared rate limiter.",
    "<b>Extend the chat agent</b> to terminate and per-service revoke, with the same confirmation step.",
])}
"""))
    return S


# ── build ───────────────────────────────────────────────────────────────────
def build():
    secs = sections()
    h1s = [t for t, _ in secs]

    def render(toc_pages):
        toc_rows = "".join(f'<tr><td>{i + 1}.&nbsp; {esc(t)}</td><td style="text-align:right">{p}</td></tr>' for i, (t, p) in enumerate(zip(h1s, toc_pages)))
        cover = f"""
<div class="cover"><div class="t">superjoin</div><div class="s">HR onboarding agent</div>
<div class="s" style="font-size:12pt;color:#4b4338;margin-top:14pt">Architecture, microservices, API reference and project details</div>
<div class="d">Repository: github.com/akshat1423/superHR · branch worktree-restyle-paper-theme<br/>Document generated {TODAY} from the source tree<br/>
Next.js 16 · React 19 · Supabase · Anthropic · Vercel</div></div>
<h1 style="page-break-before:always;margin-top:0">Contents</h1><table class="toc">{toc_rows}</table>
<div class="note">The service tables in this document are parsed from the source code when it is generated, so they match the code. Re-generate with <code>python3 docs/build_architecture_pdf.py</code>.</div>
"""
        body = cover + "".join(f'<h1 style="page-break-before:always">{esc(t)}</h1>{h}' for t, h in secs)
        story = fitz.Story(html=f"<html><body>{body}</body></html>", user_css=CSS, archive=fitz.Archive(DIAG))
        heads = []
        mediabox = fitz.paper_rect("a4")
        where = mediabox + (40, 44, -40, -50)

        def rectfn(rect_num, filled):
            return mediabox, where, fitz.Identity

        def pos(p):
            if p.open_close & 1 and p.heading == 1:
                heads.append((p.text.strip(), p.page_num))

        # write to an in-memory PDF
        import io
        stream = io.BytesIO()
        writer = fitz.DocumentWriter(stream)
        story.write(writer, rectfn, pos)
        writer.close()
        return stream.getvalue(), heads

    # pass 1: find where each section starts (contents page is the same length either way)
    data, heads = render([0] * len(h1s))
    pages = {t: p for t, p in heads}
    toc_pages = [pages.get(t, 0) for t in h1s]
    data, heads = render(toc_pages)
    pages2 = {t: p for t, p in heads}
    assert [pages2.get(t, 0) for t in h1s] == toc_pages, "page numbers moved between passes"

    doc = fitz.open("pdf", data)
    toc = [[1, t, pages2[t]] for t in h1s if t in pages2]
    doc.set_toc(toc)
    n = doc.page_count
    for i, page in enumerate(doc):
        if i == 0:
            continue
        r = page.rect
        page.insert_text((40, r.height - 28), "superjoin · architecture and project details", fontsize=7.5, color=(0.42, 0.38, 0.32), fontname="helv")
        page.insert_text((r.width - 40 - 30, r.height - 28), f"{i + 1} / {n}", fontsize=7.5, color=(0.42, 0.38, 0.32), fontname="helv")
    doc.set_metadata({"title": "superjoin: architecture, microservices, API reference and project details", "author": "superjoin", "subject": "HR onboarding agent"})
    doc.save(OUT, garbage=4, deflate=True)
    print(f"wrote {OUT}: {n} pages")


if __name__ == "__main__":
    build()
