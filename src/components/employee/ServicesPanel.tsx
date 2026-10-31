"use client";
import { useState } from "react";
import { Modal } from "@/components/ingest/RefEditors";
import { STATUS_LABEL, STATUS_TEXT, TaskChip } from "@/components/agents/TaskChip";
import { useUser } from "@/components/shell/AuthProvider";
import { canRetryService } from "@/lib/auth/policy";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { reinstateOnboarding, runProvActions, terminateOnboarding } from "@/lib/provisioning/orchestrate";
import { isProvisioned, type ProvAction } from "@/lib/provision";
import { SERVICES } from "@/lib/services";
import { appsOf } from "@/lib/serviceRuntime/reverse";
import { useProvisioning } from "@/store/provisioning";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

const REASONS = ["Candidate withdrew", "Offer rescinded", "Did not join (no-show)", "Failed background verification", "Hiring freeze", "Other"];
const BTN = "rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0] disabled:opacity-40";

function Switch({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} className={cn("relative h-[22px] w-[40px] flex-none rounded-full transition disabled:opacity-40", on ? "bg-ok" : "bg-[#c9c0aa]")}>
      <span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[21px]" : "left-[3px]")} />
    </button>
  );
}

/** HR ends someone's onboarding: everything created for them is revoked, and what hadn't started is cancelled. */
export function TerminateControls({ view }: { view: EmployeeView }) {
  const user = useUser();
  const person = view.person;
  const pr = useProvisioning((s) => s.run.people.find((r) => r.personId === person.id));
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  if (user.role !== "hr") return null;

  const live = pr ? SERVICES.filter((_, i) => isProvisioned(pr.tasks[i]) || ((pr.tasks[i].status === "running" || pr.tasks[i].status === "retry") && pr.tasks[i].actions.length > 0)) : [];
  const pending = pr ? SERVICES.filter((_, i) => pr.tasks[i].status === "queued" && !live.some((l) => l.id === SERVICES[i].id)) : [];
  const text = reason === "Other" ? detail.trim() : detail.trim() ? `${reason}: ${detail.trim()}` : reason;

  const go = async () => {
    if (!text) return;
    setBusy(true);
    const r = await terminateOnboarding(person.id, user.name, text);
    setBusy(false); setOpen(false);
    toast(r.failed ? `Terminated, but ${r.failed} service${r.failed > 1 ? "s" : ""} couldn't be revoked: open Services to retry` : `Onboarding terminated · ${r.revoked} service${r.revoked === 1 ? "" : "s"} revoked${r.cancelled ? `, ${r.cancelled} cancelled` : ""}`);
  };

  if (person.terminated)
    return <button onClick={() => { const n = reinstateOnboarding(person.id, user.name); toast(`Onboarding reinstated · ${n} service${n === 1 ? "" : "s"} provisioning again`); }} className={cn(BTN, "!border-ink !bg-ink !text-white hover:!bg-[#2b261f]")}>Reinstate onboarding</button>;

  return (
    <>
      <button onClick={() => setOpen(true)} className={cn(BTN, "!border-[#e9a39c] !text-bad hover:!bg-[#f6d6d2]")}>Terminate onboarding</button>
      {open && (
        <Modal title={`Terminate ${person.name}’s onboarding`} sub="deprovisions everything created for them" onClose={() => !busy && setOpen(false)}
          footer={<>
            <span className="min-w-0 flex-1 font-mono text-[11px] text-mute">This can be undone with “Reinstate”, which provisions everything again.</span>
            <button disabled={busy} onClick={() => setOpen(false)} className={BTN}>Cancel</button>
            <button disabled={busy || !text} onClick={() => void go()} className="rounded-lg border border-bad bg-bad px-4 py-2 font-mono text-[11px] uppercase tracking-[.08em] text-white disabled:opacity-40">{busy ? "Deprovisioning…" : "Terminate and deprovision"}</button>
          </>}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <label className="eyebrow block !text-[10px]">Reason<select value={reason} onChange={(e) => setReason(e.target.value)} className="sj-input mt-1 !py-2">{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label className="eyebrow block !text-[10px]">{reason === "Other" ? "Say why (required)" : "Note (optional)"}<textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} className="sj-input mt-1" /></label>
              <p className="text-[12px] text-[#4b4338]">The reason is kept in the audit trail and the agent log, with your name.</p>
            </div>
            <div className="text-[12.5px]">
              <div className="eyebrow !text-[10px]">will be revoked, applications and records first, the account last</div>
              <ul className="mt-1.5 space-y-1">{[...live].reverse().map((s) => <li key={s.id} className="flex gap-2"><span className="text-bad">✕</span><span><b>{s.name}</b> <span className="text-mute">— {s.creates}</span></span></li>)}{live.length === 0 && <li className="text-mute">Nothing has been created yet.</li>}</ul>
              {pending.length > 0 && <><div className="eyebrow mt-3 !text-[10px]">will be cancelled (not started)</div><p className="mt-1 text-mute">{pending.map((s) => s.name).join(", ")}</p></>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Each service for one person with its own switch: take away or give back a whole service, or a single application. */
export function ServicesPanel({ view }: { view: EmployeeView }) {
  const user = useUser();
  const person = view.person;
  const pr = useProvisioning((s) => s.run.people.find((r) => r.personId === person.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const can = canRetryService(user, person) && !person.terminated;
  if (!pr) return <p className="eyebrow">Provisioning hasn’t started for this person.</p>;
  const apps = appsOf(person);

  const act = async (key: string, actions: ProvAction[], done: string) => {
    setBusy(key); setConfirm(null);
    const r = await runProvActions(actions, person.id, user.name);
    setBusy(null);
    toast(r.failed ? "That didn’t go through — see the message on the service" : done);
  };

  return (
    <div className="space-y-3">
      {person.terminated && (
        <div className="rounded-xl border border-[#e9a39c] bg-[#fdf0ee] px-4 py-3 text-[13px] text-[#8c1b14]">
          <b>Onboarding terminated</b> by {person.terminated.by} on {new Date(person.terminated.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}: {person.terminated.reason}. Everything created for them was revoked; nothing more will be provisioned or chased.
        </div>
      )}
      {!can && !person.terminated && <p className="eyebrow !text-[10.5px]">Only HR or the head of this person’s department can change these.</p>}
      <div className="paper-card rounded-2xl bg-paper2 p-2">
        {pr.tasks.map((t, i) => {
          const sv = SERVICES[i];
          const provisioned = t.status === "done" || t.status === "waiting";
          const key = `${sv.id}`;
          const revokedApps = t.revokedObjects ?? {};
          return (
            <div key={sv.id} className={cn("border-b border-dashed border-line px-3 py-2.5 last:border-0", t.status === "revoked" && "bg-[#f3eef6]/70")}>
              <div className="flex items-center gap-3">
                <TaskChip t={t} i={i} size={30} />
                <div className="min-w-0 flex-1">
                  <b className="text-[13.5px]">{sv.name}</b>
                  <small className="block truncate font-mono text-[10.5px] text-mute">{t.status === "revoked" ? `${t.detail} · ${t.revocation?.reason ?? ""}` : t.status === "skipped" ? t.detail : t.detail || sv.creates}</small>
                </div>
                <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[.08em]", STATUS_TEXT[t.status])}>{STATUS_LABEL[t.status]}</span>
                {can && provisioned && confirm !== key && <button disabled={busy !== null} onClick={() => setConfirm(key)} className={cn(BTN, "hover:!bg-[#f6d6d2]")}>{busy === key ? "Revoking…" : "Deprovision"}</button>}
                {can && t.status === "revoked" && <button disabled={busy !== null} onClick={() => { useProvisioning.getState().reprovision(person.id, sv.id, user.name); toast(`Provisioning ${sv.name} again`); }} className={BTN}>Provision again</button>}
                {can && (t.status === "skipped" || t.status === "failed") && !person.terminated && <button disabled={busy !== null} onClick={() => { useProvisioning.getState().reprovision(person.id, sv.id, user.name); toast(`Running ${sv.name} again`); }} className={BTN}>Run again</button>}
              </div>

              {confirm === key && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#e9a39c] bg-[#fdf0ee] px-3 py-2 text-[12.5px]">
                  <span className="flex-1">Revoke everything {sv.name} created for {person.name.split(" ")[0]}? ({sv.creates})</span>
                  <button onClick={() => void act(key, [{ service: sv.id, kind: "deprovision", reason: `deprovisioned from the Services tab by ${user.name}` }], `${sv.name} revoked`)} className="rounded-lg bg-bad px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[.08em] text-white">Yes, deprovision</button>
                  <button onClick={() => setConfirm(null)} className={BTN}>Cancel</button>
                </div>
              )}

              {t.revokeFailure && (
                <div className="mt-2 rounded-lg border border-bad/40 bg-[#fdf0ee] px-3 py-2 text-[12.5px] text-[#8c1b14]">
                  <b>{t.revokeFailure.code} {t.revokeFailure.title}</b>{t.revokeFailure.object ? ` (${t.revokeFailure.object})` : ""}. {t.revokeFailure.cause} <span className="text-[#3d362b]">{t.revokeFailure.fix}</span>
                  {can && <button disabled={busy !== null} onClick={() => void act(key, [{ service: sv.id, kind: "deprovision", ...(t.revokeFailure!.object ? { object: t.revokeFailure!.object } : {}), reason: "retrying a failed revoke" }], "Revoked")} className={cn(BTN, "ml-2")}>Retry revoke</button>}
                </div>
              )}

              {sv.id === "access-svc" && (provisioned || t.status === "revoked") && (
                <ul className="mt-2 grid gap-x-6 gap-y-1.5 pl-[42px] sm:grid-cols-2">
                  {apps.map((app) => {
                    const on = provisioned && !revokedApps[app];
                    return (
                      <li key={app} className="flex items-center gap-2.5 text-[12.5px]">
                        <Switch on={on} label={`${app} access`} disabled={!can || !provisioned || busy !== null}
                          onClick={() => void act(`${key}:${app}`, [on ? { service: "access-svc", kind: "deprovision", object: app, reason: `${app} removed by ${user.name}` } : { service: "access-svc", kind: "provision", object: app, reason: `${app} granted by ${user.name}` }], on ? `${app} revoked` : `${app} granted`)} />
                        <span className={cn(!on && "text-mute line-through")}>{app}</span>
                        {revokedApps[app] && <span className="font-mono text-[9.5px] text-mute">revoked</span>}
                      </li>
                    );
                  })}
                </ul>
              )}

              {t.lastUpdate && <p className="mt-1.5 pl-[42px] font-mono text-[10.5px] text-mute">updated by {t.lastUpdate.by}: {t.lastUpdate.reason}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
