"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ingest/RefEditors";
import { useUserOrNull, useScopedPeople } from "@/components/shell/AuthProvider";
import { todayISO } from "@/lib/dates";
import { buildSnapshot } from "@/lib/whatsapp/snapshot";
import { useOnboarding } from "@/store/onboarding";

/** A QR code as an image. Rendered in the browser; the text it encodes is never sent anywhere. */
function Qr({ text, size, alt }: { text: string; size: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let on = true; QRCode.toDataURL(text, { margin: 1, width: size * 3, errorCorrectionLevel: "M", color: { dark: "#1f1b16", light: "#ffffff" } }).then((u) => on && setSrc(u)).catch(() => on && setSrc(null)); return () => { on = false; }; }, [text, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt={alt} className="rounded-md border border-line bg-white" /> : <span style={{ width: size, height: size }} className="inline-block rounded-md bg-[#ece4d0]" />;
}

interface Connect { code: string; link: string | null; number: string | null; alreadyJoined: boolean; expiresAt: string }

/**
 * A strip at the bottom of every page, sign-in page included: scan the QR code to chat with onboarding on WhatsApp. Anyone
 * can scan it to say hello; once signed in, "Connect my WhatsApp" makes a personal QR whose message (JOIN and a one-time
 * code) links their phone to their account, after which they can ask questions, get reminders and answer approvals there.
 * Shown only when a business number is configured (WHATSAPP_DISPLAY_NUMBER).
 */
export function WhatsAppFooter({ number }: { number: string | null }) {
  const user = useUserOrNull();
  const people = useScopedPeople();
  const onboarding = useOnboarding();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState<Connect | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!number) return null;
  const hello = `https://wa.me/${number}?text=${encodeURIComponent("Hi")}`;
  const pretty = `+${number}`;

  const connect = async () => {
    setOpen(true); setBusy(true); setErr(null); setC(null);
    try {
      const me = user?.role === "employee" ? people[0] : undefined;
      const body = me ? { personId: me.id, snapshot: buildSnapshot(me, { items: onboarding.items[me.id] ?? [], docs: onboarding.docs, policies: onboarding.policies, directory: onboarding.directory }, todayISO()) } : {};
      const res = await fetch("/api/whatsapp/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setErr(res.status === 429 ? "Too many tries: wait a minute." : res.status === 503 ? "WhatsApp isn't set up on the server yet." : "Couldn't make a code. Try again."); return; }
      setC((await res.json()) as Connect);
    } catch { setErr("Couldn't reach the server."); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex flex-none items-center gap-3 border-t border-line bg-[#f4efe3] px-5 py-2">
        <Qr text={hello} size={44} alt={`QR code to chat with onboarding on WhatsApp at ${pretty}`} />
        <div className="min-w-0 text-[12px] leading-snug text-[#4b4338]">
          <b className="block text-[12.5px] text-ink">Onboarding on WhatsApp</b>
          Scan to ask questions, get reminders and answer approvals · <span className="font-mono">{pretty}</span>
        </div>
        {user && <button onClick={() => void connect()} className="ml-2 flex-none rounded-lg border border-ink bg-ink px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white hover:bg-[#2b261f]">Connect my WhatsApp</button>}
        {!user && <span className="ml-2 hidden font-mono text-[10.5px] text-mute sm:inline">Sign in to connect your account</span>}
      </div>
      {open && (
        <Modal title="Connect your WhatsApp" sub="your phone proves the number: nothing to type" onClose={() => setOpen(false)}
          footer={<><span className="flex-1 font-mono text-[11px] text-mute">Reply STOP any time to stop messages, EXIT to disconnect.</span><button onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">Close</button></>}>
          {busy && <p className="text-[13px] text-mute">Making your code…</p>}
          {err && <p className="rounded-lg bg-[#fdf0ee] px-3 py-2 text-[13px] text-[#8c1b14]">{err}</p>}
          {c && (
            <div className="flex flex-wrap items-center gap-6">
              {c.link ? <Qr text={c.link} size={190} alt="Your personal QR code" /> : null}
              <div className="max-w-[420px] text-[13px] text-[#3d362b]">
                {c.alreadyJoined ? <p className="mb-2 rounded-lg bg-[#fbefcf] px-3 py-2 text-[12.5px] text-[#7a5a00]">You&apos;re already connected on a phone. To use a different phone, send <b>EXIT</b> from the old one first.</p> : null}
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>Open WhatsApp on your phone and scan this code{c.link ? "" : `, or message ${pretty}`}.</li>
                  <li>Send the message it fills in: <code className="rounded bg-[#ece4d0] px-1.5 py-0.5 font-mono">JOIN {c.code}</code></li>
                  <li>You&apos;ll get a welcome message. Then ask questions, or answer approval requests with a tap.</li>
                </ol>
                <p className="mt-2 text-[12px] text-mute">The code works once and expires in a week.</p>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
