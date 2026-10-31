import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { canBulkUpload } from "@/lib/auth/policy";
import { ATS_PROVIDERS, isAtsId } from "@/lib/ats/providers";
import { demoTenantRows } from "@/lib/ats/demoTenant";
import { allow } from "@/lib/rateLimit";
import { hash01 } from "@/lib/utils";

export const maxDuration = 60;

type Ctx = { params: Promise<{ provider: string }> };
const MAX_PAGES = 30;

/**
 * Pull one page of hired candidates from an applicant-tracking system. HR only. The browser calls this once per page
 * and maps the vendor's payload into joiners (see lib/ats/providers). Two modes:
 *  - live: when ATS_<PROVIDER>_URL and ATS_<PROVIDER>_TOKEN are set, the page is fetched from that tenant with the
 *    server-held token (the credentials typed into the form are never used or stored);
 *  - sandbox: otherwise a demo tenant answers in the vendor's own format, so the whole flow can be tried. An API key
 *    shorter than 8 characters, or "invalid", is refused the way the vendor would refuse it.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canBulkUpload(user)) return new Response(null, { status: 403 });
  const { provider } = await params;
  if (!isAtsId(provider)) return new Response(null, { status: 404 });
  if (!allow(`ats:${user.id}`, 120, 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const b = (await req.json().catch(() => null)) as { tenant?: unknown; token?: unknown; page?: unknown } | null;
  const tenant = typeof b?.tenant === "string" ? b.tenant.trim().slice(0, 120) : "";
  const token = typeof b?.token === "string" ? b.token.trim().slice(0, 200) : "";
  const page = typeof b?.page === "number" && Number.isInteger(b.page) && b.page >= 1 && b.page <= MAX_PAGES ? b.page : 1;
  if (typeof b?.tenant !== "string" || typeof b?.token !== "string") return NextResponse.json({ error: "Send { tenant, token, page }." }, { status: 400 });

  const p = ATS_PROVIDERS[provider];
  const request = p.endpoint(tenant, page);
  const liveUrl = process.env[p.env.url], liveToken = process.env[p.env.token];

  if (liveUrl && liveToken) {
    const t0 = Date.now();
    try {
      const url = new URL(liveUrl);
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { headers: { authorization: `Bearer ${liveToken}`, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      const ms = Date.now() - t0;
      if (!res.ok) return NextResponse.json({ ok: false, mode: "live", request: `GET ${url.origin}${url.pathname}`, status: res.status, ms, error: `${p.name} answered ${res.status}` }, { status: 200 });
      const payload = await res.json();
      return NextResponse.json({ ok: true, mode: "live", request: `GET ${url.origin}${url.pathname}?page=${page}`, status: res.status, ms, payload, ...p.describe(payload) });
    } catch {
      return NextResponse.json({ ok: false, mode: "live", request, status: 502, ms: Date.now() - t0, error: `Could not reach ${p.name}` });
    }
  }

  // sandbox tenant
  const ms = 90 + Math.floor(hash01(`${provider}|${tenant}|${page}`) * 260);
  if (token.length < 8 || token.toLowerCase() === "invalid")
    return NextResponse.json({ ok: false, mode: "sandbox", request, status: 401, ms, error: provider === "workday" ? "invalid_grant: the integration system user token was rejected" : provider === "lever" ? "Unauthorized: API key is invalid" : "Invalid Basic Auth credentials" });
  const rows = demoTenantRows();
  const payload = p.toPage(rows, page, p.pageSize, tenant);
  return NextResponse.json({ ok: true, mode: "sandbox", request, status: 200, ms, payload, ...p.describe(payload), total: rows.length });
}
