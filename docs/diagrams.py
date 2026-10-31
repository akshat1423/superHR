"""Architecture diagrams for docs/superjoin-architecture.pdf (run via build_architecture_pdf.py)."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

PAPER, INK, ACC, OK, BAD, MUTE, LINE = "#f4efe3", "#1f1b16", "#c8552b", "#2f8f5b", "#c0392b", "#6b6252", "#b7ac94"
CARD, SOFT = "#fffdf7", "#ece4d0"
BLUE, PURPLE, GOLD = "#dfe9f3", "#ece4f0", "#fbefcf"
GREEN_BG = "#dbeadf"


def canvas(w, h, xmax, ymax):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, xmax)
    ax.set_ylim(0, ymax)
    ax.axis("off")
    fig.patch.set_facecolor("white")
    return fig, ax


def box(ax, x, y, w, h, text="", fc=CARD, ec=INK, fs=7, bold=False, tc=INK, lw=1.0, r=0.8, ha="center", va="center", ls="-"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}", fc=fc, ec=ec, lw=lw, ls=ls))
    if text:
        tx = x + w / 2 if ha == "center" else x + 1.2
        ty = y + h / 2 if va == "center" else y + h - 1.4
        ax.text(tx, ty, text, ha=ha, va=va, fontsize=fs, color=tc, fontweight="bold" if bold else "normal", linespacing=1.35)


def group(ax, x, y, w, h, title, fc=SOFT, ec=LINE):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.2", fc=fc, ec=ec, lw=1.2, ls="--"))
    ax.text(x + 1.5, y + h - 1.6, title, fontsize=7.6, fontweight="bold", color=INK, va="top")


def arrow(ax, p1, p2, label=None, color=INK, lw=1.1, ls="-", rad=0.0, fs=6, lx=0, ly=0, style="-|>", ha="center"):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=9, lw=lw, color=color, ls=ls, connectionstyle=f"arc3,rad={rad}", shrinkA=0, shrinkB=0))
    if label:
        ax.text((p1[0] + p2[0]) / 2 + lx, (p1[1] + p2[1]) / 2 + ly, label, fontsize=fs, color=color, ha=ha, va="center", bbox=dict(fc="white", ec="none", pad=0.6, alpha=0.9))


def save(fig, path):
    fig.savefig(path, dpi=230, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ── 1. system architecture ──────────────────────────────────────────────────
def system(path):
    fig, ax = canvas(8.3, 11.4, 100, 140)

    # browser
    group(ax, 1, 112, 98, 27, "BROWSER · Next.js 16 client (React 19 · Tailwind v4 · React Flow · Zustand)", fc="#f7f3ea")
    box(ax, 3, 117, 29, 16, "UI pages\n/tracker  /employees/[id]\n/builder  /library  /ingest\n/agents  /reminders  /me", fc=CARD, fs=6.3)
    box(ax, 34, 117, 30, 16, "Stores (Zustand)\npeople · onboarding · provisioning\noutbox · builder · toast\nsaved: superjoin.people /\n.onboarding / .provisioning", fc=CARD, fs=6.1)
    box(ax, 66, 117, 31, 16, "Client engines\nrule engine · status · change recalc\nprovisioning tick engine\nprovisioning orchestrator\nchat tools (user's own data)", fc=CARD, fs=6.1)
    box(ax, 3, 113.3, 94, 2.8, "localStorage: people, checklists, documents, audit, revocation ledger  ·  role data-scoping is applied here", fc=GOLD, ec=LINE, fs=5.8)

    # proxy
    box(ax, 8, 103.5, 84, 4.6, "proxy.ts: optimistic session gate (signed cookie → /login or /forbidden); pages and routes re-check", fc=PURPLE, fs=6.0)
    arrow(ax, (50, 112), (50, 108.2), "HTTPS", lx=4)

    # server
    group(ax, 1, 27.5, 98, 72.5, "NEXT.JS SERVER on Vercel: every route handler is its own serverless function", fc="#f9f6ee")
    arrow(ax, (50, 103.5), (50, 100.2))

    group(ax, 3, 62, 94, 34, "Platform microservices", fc=BLUE, ec="#9db6cf")
    P = [
        ("auth-svc", "POST /api/auth/login\nPOST /api/auth/logout"), ("health-svc", "GET /api/health"), ("logs-svc", "GET · POST /api/agent-events"),
        ("mail-svc", "GET · POST /api/email/send"), ("assistant-svc", "GET · POST /api/assistant"), ("chat-agent-svc", "GET · POST /api/agent/chat"),
        ("doc-reader-svc", "POST /api/documents/extract"), ("doc-svc", "POST /api/documents/process"), ("ats-svc", "POST /api/ats/[provider]"),
    ]
    for i, (n, e) in enumerate(P):
        cx, cy = 5 + (i % 3) * 30.5, 84 - (i // 3) * 8.4
        box(ax, cx, cy, 28.5, 7, f"{n}\n{e}", fc=CARD, ec="#6f8fb0", fs=6.2)

    group(ax, 3, 33, 94, 27.5, "Provisioning microservices: POST /api/services/[service]  {person, action, object?}", fc=GREEN_BG, ec="#8fbf9f")
    S = ["identity-svc", "letter-svc", "access-svc", "bgv-svc", "payroll-svc", "idcard-svc", "facility-svc", "agenda-svc", "collect-svc", "reminder-svc"]
    D = ["Email & SSO", "Offer letter & e-sign", "App access", "Background check", "Payroll & statutory", "ID card", "Premises & desk", "Day-1 agenda & buddy", "Document collection", "Reminders & escalations"]
    for i, (n, d) in enumerate(zip(S, D)):
        cx, cy = 5 + (i % 5) * 18.3, 48 - (i // 5) * 8.6
        box(ax, cx, cy, 17.2, 7.4, f"{n}\n{d}", fc=CARD, ec="#5d9a73", fs=5.7)
    box(ax, 5, 34.3, 90, 4, "Connector per service: SANDBOX (built in) or LIVE (SERVICE_WEBHOOK_<ID>, HMAC-signed)  ·  every call recorded", fc=CARD, ec="#5d9a73", fs=5.9)

    box(ax, 3, 28.6, 94, 3.4, "Shared modules (src/lib): policy table · session · rate limiter · validators · rule engine · BM25 retrieval · document checks · service runtime", fc=SOFT, ec=LINE, fs=5.6)

    # externals
    box(ax, 1, 4, 18.5, 14, "Supabase\nPostgres\nagent_batches\nagent_events\nRLS gate\n(x-superjoin-key)", fc="#e6f1e9", ec=OK, fs=6)
    box(ax, 21, 4, 18.5, 14, "Anthropic API\nclaude-opus-5-5\nchat tools ·\npolicy answers ·\nscan reader", fc="#fbe9df", ec=ACC, fs=6)
    box(ax, 41, 4, 18.5, 14, "Resend\nreminder and\nescalation\nemail", fc=GOLD, ec="#c9a227", fs=6)
    box(ax, 61, 4, 18.5, 14, "ATS vendors\nGreenhouse\nLever\nWorkday\n(demo tenant\nor live)", fc=PURPLE, ec="#8a6a9a", fs=6)
    box(ax, 81, 4, 18.5, 14, "Vendor systems\nOkta · Google\nSlack · GitHub\npayroll · cards\nfacilities…\n(via webhooks)", fc=CARD, ec=INK, fs=6)
    ax.text(50, 1.3, "EXTERNAL SYSTEMS (outside this repository)", ha="center", fontsize=6.8, fontweight="bold", color=MUTE)

    for x, c, t in [(10, OK, "logs-svc"), (30, ACC, "assistant · chat · reader"), (50, "#c9a227", "mail-svc"), (70, "#8a6a9a", "ats-svc"), (90, INK, "provisioning × 10")]:
        arrow(ax, (x, 27.5), (x, 18.3), color=c)
        ax.text(x + 1.2, 23, t, ha="left", fontsize=5.6, color=MUTE, bbox=dict(fc="white", ec="none", pad=0.5))
    save(fig, path)


# ── 2. provisioning microservices: dependencies ─────────────────────────────
def services(path):
    fig, ax = canvas(8.3, 5.0, 100, 60)
    W, H = 17, 9
    top = [("identity-svc", "Email & SSO", "5–9 s"), ("letter-svc", "Offer letter & e-sign", "3–6 s"), ("payroll-svc", "Payroll & statutory", "4–8 s"), ("idcard-svc", "ID card", "2–4 s"), ("collect-svc", "Document collection", "1–2 s")]
    mid = [("access-svc", "App access", "7–13 s", 2), ("agenda-svc", "Day-1 agenda & buddy", "2–4 s", 22), ("bgv-svc", "Background check", "3–6 s", 42), ("facility-svc", "Premises & desk", "2–3 s", 62)]
    pos = {}
    for i, (k, d, t) in enumerate(top):
        x = 2 + i * 20
        pos[k] = (x, 40)
        box(ax, x, 40, W, H, f"{k}\n{d}\n{t}", fc=CARD, ec="#5d9a73", fs=6, lw=1.2)
    for k, d, t, x in mid:
        pos[k] = (x, 22)
        box(ax, x, 22, W, H, f"{k}\n{d}\n{t}", fc=CARD, ec="#5d9a73", fs=6, lw=1.2)
    box(ax, 26, 3, 48, 9, "reminder-svc  ·  Reminders & escalations\n2–3 s · runs last, after every other service has finished", fc=CARD, ec="#5d9a73", fs=6, lw=1.2)
    for a_, b_ in [("identity-svc", "access-svc"), ("identity-svc", "agenda-svc"), ("letter-svc", "bgv-svc"), ("idcard-svc", "facility-svc")]:
        arrow(ax, (pos[a_][0] + W / 2, 40), (pos[b_][0] + W / 2, 31), color=INK)
    for k, *_ in mid:
        arrow(ax, (pos[k][0] + W / 2, 22), (50, 12), color=MUTE, ls=":", lw=0.9)
    ax.text(1, 58, "An arrow means “must finish first”. A failed or revoked dependency skips what depends on it; a paused one (waiting on the candidate) pauses it.", fontsize=6.2, color=MUTE, va="center")
    ax.text(1, 54.8, "Durations are simulated (1–13 s); the browser engine replays the real server result at 4 ticks per second, four people in parallel.", fontsize=6.2, color=MUTE, va="center")
    save(fig, path)


# ── 3. sequence: provisioning replay + logs ─────────────────────────────────
def sequence(path):
    fig, ax = canvas(8.3, 6.9, 100, 80)
    names = ["Browser engine\n(tick loop)", "/api/services/[id]\nprovisioning-svc", "Connector\nsandbox | live webhook", "/api/agent-events\nlogs-svc", "Supabase\nagent_events"]
    xs = [12, 31, 51, 71, 90]
    for x, n in zip(xs, names):
        box(ax, x - 9, 72, 18, 6.5, n, fc=CARD, fs=5.9, bold=True)
        ax.plot([x, x], [2, 72], color=LINE, lw=1, ls="--")
    steps = [
        (0, 1, "1  task becomes ready → POST { person, action, attempt }", INK),
        (1, 1, "2  session · role and department scope · 600/min limit · validate person", MUTE),
        (1, 2, "3  for each call: the sandbox answers, or a signed webhook is POSTed", INK),
        (2, 1, "4  { ok, status, response }  (a refusal becomes a diagnosable failure)", INK),
        (1, 0, "5  Execution { phases[] with request, response, ms · artifact | failure }", OK),
        (0, 0, "6  replays each call over ticks; marks done / failed / paused / revoked", MUTE),
        (0, 3, "7  ProvisionDriver flushes new events (≤400 per POST; HR and department heads)", INK),
        (3, 4, "8  UPSERT (batch_id, seq): idempotent, append-only", INK),
        (4, 3, "9  stored: true", OK),
        (0, 1, "10  later: deprovision / update / grant one app (same endpoint: action + object)", ACC),
        (1, 0, "11  Execution → recorded on the service, in the agent log and the audit trail", OK),
    ]
    y = 67.5
    for a_, b_, t, c in steps:
        if a_ == b_:
            ax.annotate("", xy=(xs[a_] + 6, y - 2.2), xytext=(xs[a_] + 0.4, y), arrowprops=dict(arrowstyle="-|>", color=c, lw=1, connectionstyle="arc3,rad=-0.7"))
            ax.text(xs[a_] + 8, y - 1.1, t, fontsize=5.8, color=c, va="center", bbox=dict(fc="white", ec="none", pad=0.5))
        else:
            arrow(ax, (xs[a_], y), (xs[b_], y), color=c, lw=1.1)
            lo = min(xs[a_], xs[b_])
            ax.text(lo + 1.2, y + 1.7, t, fontsize=5.8, color=c, ha="left", va="bottom", bbox=dict(fc="white", ec="none", pad=0.5))
        y -= 5.4 + (1.6 if a_ == b_ else 0)
    save(fig, path)


# ── 4. document service flow ────────────────────────────────────────────────
def docflow(path):
    fig, ax = canvas(8.3, 5.2, 100, 62)
    box(ax, 1, 50, 23, 8, "Employee or HR\nuploads a file\n(PDF · JPG · PNG · txt · json)", fc=CARD, fs=5.8)
    box(ax, 29, 50, 22, 8, "POST /api/documents/\nprocess · doc-svc", fc=BLUE, ec="#6f8fb0", fs=6, bold=True)
    box(ax, 56, 50, 19, 8, "1  Receive the file\ntype · size ≤ 5 MB", fc=CARD, fs=6)
    box(ax, 83, 50, 16, 8, "Refused\n(nothing recorded)", fc="#fdf0ee", ec=BAD, fs=5.8)
    arrow(ax, (24, 54), (29, 54)); arrow(ax, (51, 54), (56, 54)); arrow(ax, (75, 54), (83, 54), color=BAD)
    ax.text(79, 57.6, "wrong type\nor too big", fontsize=5.2, color=BAD, ha="center", va="bottom")

    box(ax, 56, 36, 19, 9.5, "2  Read the fields\ntext → read directly\nscan/PDF → AI reader\n(Claude, if a key is set)", fc=CARD, fs=5.8)
    arrow(ax, (65.5, 50), (65.5, 45.5))
    box(ax, 83, 36, 16, 9.5, "Unreadable\n→ UNDER REVIEW\n(a person decides;\nthe only such case)", fc=GOLD, ec="#c9a227", fs=5.6)
    arrow(ax, (75, 40.7), (83, 40.7), color="#8a6200")
    ax.text(79, 43.3, "can't read", fontsize=5.2, color="#8a6200", ha="center", va="bottom")

    box(ax, 56, 22, 19, 9.5, "3  Check vs profile\n(our code, not the model)\nname · DOB · expiry\ndates · PAN · kind", fc=CARD, fs=5.8)
    arrow(ax, (65.5, 36), (65.5, 31.5))
    box(ax, 20, 6, 27, 10, "CORRECTION REQUESTED\nreasons in plain English\nemployee can re-upload\nthe item stays open", fc="#fdf0ee", ec=BAD, fs=5.9)
    box(ax, 52, 6, 29, 10, "ACCEPTED automatically\nitem completes · dependents released\nHR record created once every\ndocument is in", fc=GREEN_BG, ec=OK, fs=5.9)
    arrow(ax, (60, 22), (40, 16), color=BAD); ax.text(47, 20.6, "errors", fontsize=5.6, color=BAD, ha="center")
    arrow(ax, (68, 22), (68, 16), color=OK); ax.text(70, 19, "clean, or warnings only", fontsize=5.6, color=OK, ha="left")
    box(ax, 85, 6, 14, 10, "HR can overrule:\naccept anyway or\nrequest correction", fc=CARD, fs=5.4)
    arrow(ax, (85, 11), (81, 11), style="<|-|>", color=MUTE)
    box(ax, 1, 28, 25, 20, "Stored on the document:\nstatus · issues · fields read\nsteps taken · trace id\n\nAudit entry by the actor\n“Document service”.\n\nA joining-date or role change\nre-checks accepted documents.", fc=SOFT, ec=LINE, fs=5.6)
    ax.text(50, 1.6, "Fallback: if the service can't be reached, the browser runs the same checks locally instead of leaving the upload hanging.", ha="center", fontsize=5.8, color=MUTE)
    save(fig, path)


# ── 5. change / terminate flow ──────────────────────────────────────────────
def change(path):
    fig, ax = canvas(8.3, 5.6, 100, 66)
    box(ax, 1, 52, 27, 11, "HR / department head edits\njoining date · role · grade ·\ndepartment · location ·\nmanager · employment type", fc=CARD, fs=5.8)
    box(ax, 33, 52, 31, 11, "Profile editor previews\nprovisioningImpact(before,\nafter, service states)\n→ the list of actions", fc=BLUE, ec="#6f8fb0", fs=5.9, bold=True)
    box(ax, 69, 52, 30, 11, "Apply\n1  checklist recalculated\n    (progress is kept)\n2  accepted documents re-checked", fc=CARD, fs=5.8)
    arrow(ax, (28, 57.5), (33, 57.5)); arrow(ax, (64, 57.5), (69, 57.5))

    box(ax, 1, 31, 31, 14, "REVOKE  (first)\napplications the new role\nno longer has\n→ access-svc: deprovision + object\n(Slack, GitHub, others: 1 call each)", fc="#fdf0ee", ec=BAD, fs=5.7)
    box(ax, 34.5, 31, 31, 14, "UPDATE\ndate → agenda · desk · payroll · offer\nrole → offer · payroll · directory · card\ncity → desk · card · documents", fc=GOLD, ec="#c9a227", fs=5.7)
    box(ax, 68, 31, 31, 14, "GRANT  (last)\nnew applications the new role\nincludes\n→ access-svc: provision + object\nServices not yet run use new details", fc=GREEN_BG, ec=OK, fs=5.7)
    for tx in (16.5, 50, 83.5):
        arrow(ax, (84, 52), (tx, 45))
    box(ax, 1, 19.5, 98, 7, "Every action: POST /api/services/[id] {person, action, object?}  →  service record · agent log · audit trail · saved ledger", fc=SOFT, ec=LINE, fs=5.9)
    for tx in (16.5, 50, 83.5):
        arrow(ax, (tx, 31), (tx, 26.5), color=MUTE)

    box(ax, 1, 2, 48, 13.5, "TERMINATE onboarding (HR only, reason required)\ncancel what hasn't started, then deprovision\nwhat exists: dependents first, account last\nreminders · collect · agenda · desk · card\npayroll · bgv · access · offer · identity", fc="#fdf0ee", ec=BAD, fs=5.7)
    box(ax, 51, 2, 48, 13.5, "REINSTATE\nperson is active again; every revoked or\ncancelled service is provisioned again\nPer-service Deprovision / Provision again and\nper-app switches live on the Services tab", fc=GREEN_BG, ec=OK, fs=5.7)
    arrow(ax, (49, 8.7), (51, 8.7), style="<|-|>", color=MUTE)
    save(fig, path)


def build_all(dirpath):
    system(f"{dirpath}/d1_system.png")
    services(f"{dirpath}/d2_services.png")
    sequence(f"{dirpath}/d3_sequence.png")
    docflow(f"{dirpath}/d4_docs.png")
    change(f"{dirpath}/d5_change.png")


if __name__ == "__main__":
    import sys

    build_all(sys.argv[1])
